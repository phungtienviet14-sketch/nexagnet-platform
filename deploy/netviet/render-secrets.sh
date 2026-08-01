#!/bin/bash
set -euo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-netviet-host-968934832433}"
APP_IMAGE_VALUE="${APP_IMAGE:?APP_IMAGE is required}"
FLOWISE_IMAGE_VALUE="${FLOWISE_IMAGE:?FLOWISE_IMAGE is required}"
RUNTIME_DIR="${RUNTIME_DIR:-/srv/netviet/apps/zalo-ultty/.runtime}"
PUBLIC_IP_VALUE="${PUBLIC_IP:?PUBLIC_IP is required}"
PUBLIC_IP_LABEL="${PUBLIC_IP_VALUE//./-}"
DEMO_DOMAIN="demo.${PUBLIC_IP_LABEL}.sslip.io"
OPERATOR_DOMAIN="operator.${PUBLIC_IP_LABEL}.sslip.io"
FLOWISE_DOMAIN="flowise.${PUBLIC_IP_LABEL}.sslip.io"
CADDY_IMAGE='caddy:2-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648'

mkdir -p "${RUNTIME_DIR}"

secret() {
  gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1"
}

POSTGRES_ADMIN_PASSWORD="$(secret zalo-ultty-postgres-admin-password)"
ZALO_DB_PASSWORD="$(secret zalo-ultty-zalo-db-password)"
FLOWISE_DB_PASSWORD="$(secret zalo-ultty-flowise-db-password)"
DEEPSEEK_API_KEY="$(secret zalo-ultty-deepseek-api-key)"
API_KEY=$(secret zalo-ultty-api-key)
FLOWISE_SECRETKEY="$(secret zalo-ultty-flowise-secretkey)"
FLOWISE_ADMIN_EMAIL="$(secret zalo-ultty-flowise-admin-email)"
FLOWISE_ADMIN_PASSWORD="$(secret zalo-ultty-flowise-admin-password)"
FLOWISE_JWT_SECRET="$(secret zalo-ultty-flowise-jwt-secret)"
FLOWISE_REFRESH_SECRET="$(secret zalo-ultty-flowise-refresh-secret)"
FLOWISE_SESSION_SECRET="$(secret zalo-ultty-flowise-session-secret)"
FLOWISE_TOKEN_HASH_SECRET="$(secret zalo-ultty-flowise-token-hash-secret)"
DEMO_PASSWORD="$(secret zalo-ultty-demo-password)"
OPERATOR_PASSWORD="$(secret zalo-ultty-operator-password)"

hash_password() {
  printf '%s\n' "$1" | docker run --rm -i "${CADDY_IMAGE}" caddy hash-password
}

DEMO_PASSWORD_HASH="$(hash_password "${DEMO_PASSWORD}")"
OPERATOR_PASSWORD_HASH="$(hash_password "${OPERATOR_PASSWORD}")"
DEMO_PASSWORD=''
OPERATOR_PASSWORD=''

cat >"${RUNTIME_DIR}/secrets.env" <<EOF
APP_IMAGE=${APP_IMAGE_VALUE}
FLOWISE_IMAGE=${FLOWISE_IMAGE_VALUE}
PARSER_MODE=flowise
CHANNEL_MODE=zca
GCP_PROJECT_ID=${PROJECT_ID}
DEMO_DOMAIN=${DEMO_DOMAIN}
OPERATOR_DOMAIN=${OPERATOR_DOMAIN}
FLOWISE_DOMAIN=${FLOWISE_DOMAIN}
POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}
ZALO_DB_PASSWORD=${ZALO_DB_PASSWORD}
FLOWISE_DB_PASSWORD=${FLOWISE_DB_PASSWORD}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
API_KEY=${API_KEY}
FLOWISE_SECRETKEY=${FLOWISE_SECRETKEY}
FLOWISE_ADMIN_EMAIL=${FLOWISE_ADMIN_EMAIL}
FLOWISE_ADMIN_PASSWORD=${FLOWISE_ADMIN_PASSWORD}
FLOWISE_JWT_SECRET=${FLOWISE_JWT_SECRET}
FLOWISE_REFRESH_SECRET=${FLOWISE_REFRESH_SECRET}
FLOWISE_SESSION_SECRET=${FLOWISE_SESSION_SECRET}
FLOWISE_TOKEN_HASH_SECRET=${FLOWISE_TOKEN_HASH_SECRET}
EOF

cat >"${RUNTIME_DIR}/caddy.env" <<EOF
API_KEY=${API_KEY}
ACME_EMAIL=${FLOWISE_ADMIN_EMAIL}
DEMO_DOMAIN=${DEMO_DOMAIN}
OPERATOR_DOMAIN=${OPERATOR_DOMAIN}
FLOWISE_DOMAIN=${FLOWISE_DOMAIN}
DEMO_PASSWORD_HASH=${DEMO_PASSWORD_HASH}
OPERATOR_PASSWORD_HASH=${OPERATOR_PASSWORD_HASH}
EOF

touch "${RUNTIME_DIR}/flowise.env"
install -d -m 0700 "${RUNTIME_DIR}/zalo"
chmod 600 "${RUNTIME_DIR}/secrets.env" "${RUNTIME_DIR}/flowise.env" "${RUNTIME_DIR}/caddy.env"
