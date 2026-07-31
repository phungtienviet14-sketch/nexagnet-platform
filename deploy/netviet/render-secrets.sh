#!/bin/bash
set -euo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-netviet-host-968934832433}"
APP_IMAGE_VALUE="${APP_IMAGE:?APP_IMAGE is required}"
FLOWISE_IMAGE_VALUE="${FLOWISE_IMAGE:?FLOWISE_IMAGE is required}"
RUNTIME_DIR="${RUNTIME_DIR:-/srv/netviet/apps/zalo-ultty/.runtime}"

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

cat >"${RUNTIME_DIR}/secrets.env" <<EOF
APP_IMAGE=${APP_IMAGE_VALUE}
FLOWISE_IMAGE=${FLOWISE_IMAGE_VALUE}
PARSER_MODE=flowise
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

touch "${RUNTIME_DIR}/flowise.env"
chmod 600 "${RUNTIME_DIR}/secrets.env" "${RUNTIME_DIR}/flowise.env"
