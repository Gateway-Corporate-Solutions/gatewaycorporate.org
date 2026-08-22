#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-gatewaycorporate.org}"
APP_PORT="${APP_PORT:-8000}"
SITE_NAME="${SITE_NAME:-gatewaycorporate}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AVAILABLE_CONFIG="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED_CONFIG="/etc/nginx/sites-enabled/${SITE_NAME}"
CERTIFICATE_DIR="${CERTIFICATE_DIR:-/etc/letsencrypt/live/${DOMAIN}}"

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

if [[ ! -r "${CERTIFICATE_DIR}/fullchain.pem" || ! -r "${CERTIFICATE_DIR}/privkey.pem" ]]; then
    echo "Expected existing certificate files in ${CERTIFICATE_DIR}." >&2
    exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx

sed \
    -e "s/__DOMAIN__/${DOMAIN}/g" \
    -e "s/__APP_PORT__/${APP_PORT}/g" \
    -e "s|__CERTIFICATE_DIR__|${CERTIFICATE_DIR}|g" \
    "${SCRIPT_DIR}/nginx.conf" >"$AVAILABLE_CONFIG"

ln -sfn "$AVAILABLE_CONFIG" "$ENABLED_CONFIG"
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "HTTPS is configured for https://${DOMAIN} and https://www.${DOMAIN}."