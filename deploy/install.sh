#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-gatewaycorporate.org}"
APP_PORT="${APP_PORT:-8000}"
SITE_NAME="${SITE_NAME:-gatewaycorporate}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}"
APP_USER="${APP_USER:-$(stat -c '%U' "$APP_DIR")}"
APP_GROUP="${APP_GROUP:-$(id -gn "$APP_USER")}"
DENO_BIN="${DENO_BIN:-$(command -v deno || true)}"
DENO_DIR="${DENO_DIR:-${APP_DIR}/data/deno-cache}"
AVAILABLE_CONFIG="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED_CONFIG="/etc/nginx/sites-enabled/${SITE_NAME}"
CERTIFICATE_DIR="${CERTIFICATE_DIR:-/etc/letsencrypt/live/${DOMAIN}}"
SERVICE_TEMPLATE="${SCRIPT_DIR}/gatewaycorporate.service"
SERVICE_FILE="/etc/systemd/system/${SITE_NAME}.service"

if [[ $EUID -ne 0 ]]; then
    echo "Run this installer as root (for example, with sudo)." >&2
    exit 1
fi

if [[ ! "$APP_PORT" =~ ^[0-9]+$ ]] || (( APP_PORT < 1 || APP_PORT > 65535 )); then
    echo "APP_PORT must be an integer between 1 and 65535." >&2
    exit 1
fi

if [[ ! -f "${SCRIPT_DIR}/nginx.conf" ]]; then
    echo "Missing ${SCRIPT_DIR}/nginx.conf" >&2
    exit 1
fi

if [[ ! -f "$SERVICE_TEMPLATE" ]]; then
    echo "Missing ${SERVICE_TEMPLATE}" >&2
    exit 1
fi

if [[ ! -f "${APP_DIR}/deno.json" || ! -f "${APP_DIR}/main.ts" ]]; then
    echo "APP_DIR must contain deno.json and main.ts: ${APP_DIR}" >&2
    exit 1
fi

if [[ ! -r "${CERTIFICATE_DIR}/fullchain.pem" || ! -r "${CERTIFICATE_DIR}/privkey.pem" ]]; then
    echo "Expected existing certificate files in ${CERTIFICATE_DIR}." >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nginx unzip

if [[ -z "$DENO_BIN" || ! -x "$DENO_BIN" ]]; then
    curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh
    DENO_BIN="/usr/local/bin/deno"
fi

if [[ ! -x "$DENO_BIN" ]]; then
    echo "Deno installation failed: ${DENO_BIN} is not executable." >&2
    exit 1
fi

"$DENO_BIN" --version

install -d -o "$APP_USER" -g "$APP_GROUP" -m 0755 "$DENO_DIR"

sed \
    -e "s|__APP_USER__|${APP_USER}|g" \
    -e "s|__APP_GROUP__|${APP_GROUP}|g" \
    -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__APP_PORT__|${APP_PORT}|g" \
    -e "s|__DENO_BIN__|${DENO_BIN}|g" \
    -e "s|__DENO_DIR__|${DENO_DIR}|g" \
    "$SERVICE_TEMPLATE" >"$SERVICE_FILE"

systemctl daemon-reload
systemctl enable --now "${SITE_NAME}.service"
systemctl restart "${SITE_NAME}.service"

sed \
    -e "s/__DOMAIN__/${DOMAIN}/g" \
    -e "s/__APP_PORT__/${APP_PORT}/g" \
    -e "s|__CERTIFICATE_DIR__|${CERTIFICATE_DIR}|g" \
    "${SCRIPT_DIR}/nginx.conf" >"$AVAILABLE_CONFIG"

ln -sfn "$AVAILABLE_CONFIG" "$ENABLED_CONFIG"
nginx -t
systemctl enable --now nginx
systemctl reload nginx

systemctl --no-pager --full status "${SITE_NAME}.service"
echo "HTTPS is configured for https://${DOMAIN} and https://www.${DOMAIN}."