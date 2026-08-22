#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${DOMAIN:-gatewaycorporate.org}"
APP_PORT="${APP_PORT:-8000}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-${1:-}}"
SITE_NAME="${SITE_NAME:-gatewaycorporate}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
AVAILABLE_CONFIG="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED_CONFIG="/etc/nginx/sites-enabled/${SITE_NAME}"
ACME_ROOT="/var/www/letsencrypt"

if [[ $EUID -ne 0 ]]; then
    echo "Run this installer as root (for example, with sudo)." >&2
    exit 1
fi

if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    echo "Usage: sudo LETSENCRYPT_EMAIL=admin@example.com ./deploy/install.sh" >&2
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

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx certbot

install -d -m 0755 "$ACME_ROOT/.well-known/acme-challenge"

cat >"$AVAILABLE_CONFIG" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
    }
}
EOF

ln -sfn "$AVAILABLE_CONFIG" "$ENABLED_CONFIG"
nginx -t
systemctl enable --now nginx
systemctl reload nginx

certbot certonly \
    --webroot \
    --webroot-path "$ACME_ROOT" \
    --domain "$DOMAIN" \
    --domain "www.${DOMAIN}" \
    --email "$LETSENCRYPT_EMAIL" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring

sed \
    -e "s/__DOMAIN__/${DOMAIN}/g" \
    -e "s/__APP_PORT__/${APP_PORT}/g" \
    "${SCRIPT_DIR}/nginx.conf" >"$AVAILABLE_CONFIG"

nginx -t
systemctl reload nginx

install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -e
nginx -t
systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

systemctl enable --now certbot.timer

echo "HTTPS is configured for https://${DOMAIN} and https://www.${DOMAIN}."
echo "Confirm Cloudflare SSL/TLS mode is Full (strict) after DNS propagation completes."