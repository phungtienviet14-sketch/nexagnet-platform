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

mkdir -p "${RUNTIME_DIR}"

secret() {
  gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1"
}

# Secret CHUA duoc tao -> tra chuoi rong thay vi lam hong ca lan deploy. Chi dung cho secret
# that su tuy chon; secret bat buoc van goi secret() de fail fast.
optional_secret() {
  gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1" 2>/dev/null || true
}

POSTGRES_ADMIN_PASSWORD="$(secret zalo-ultty-postgres-admin-password)"
ZALO_DB_PASSWORD="$(secret zalo-ultty-zalo-db-password)"
FLOWISE_DB_PASSWORD="$(secret zalo-ultty-flowise-db-password)"
DEEPSEEK_API_KEY="$(secret zalo-ultty-deepseek-api-key)"
# Token Bot van duoc render san de co the kiem tra danh tinh, nhung pilot soak da nghiem thu voi
# kenh Zalo TAT. Giu CHANNEL_MODE=mock qua moi lan deploy de khong vo tinh bat Bot/zca hoac dua
# PII that vao pipeline; chi doi bang mot thay doi source duoc duyet rieng.
ZALO_BOT_TOKEN="$(optional_secret zalo-ultty-zalo-bot-token)"
CHANNEL_MODE='mock'
API_KEY=$(secret zalo-ultty-api-key)
FLOWISE_SECRETKEY="$(secret zalo-ultty-flowise-secretkey)"
FLOWISE_ADMIN_EMAIL="$(secret zalo-ultty-flowise-admin-email)"
FLOWISE_ADMIN_PASSWORD="$(secret zalo-ultty-flowise-admin-password)"
FLOWISE_JWT_SECRET="$(secret zalo-ultty-flowise-jwt-secret)"
FLOWISE_REFRESH_SECRET="$(secret zalo-ultty-flowise-refresh-secret)"
FLOWISE_SESSION_SECRET="$(secret zalo-ultty-flowise-session-secret)"
FLOWISE_TOKEN_HASH_SECRET="$(secret zalo-ultty-flowise-token-hash-secret)"
# MOI TRUONG DEV/DEMO — KHONG XAC THUC (quyet dinh nguoi van hanh 04/08/2026):
# Caddy khong con Basic Auth nen KHONG lay/hash zalo-ultty-demo-password va
# zalo-ultty-operator-password nua (hai secret van con trong Secret Manager de bat lai sau).
# API chay AUTH_MODE=none; API_KEY o tren van render san de bat lai chi bang mot bien.
AUTH_MODE='none'

cat >"${RUNTIME_DIR}/secrets.env" <<EOF
APP_IMAGE=${APP_IMAGE_VALUE}
FLOWISE_IMAGE=${FLOWISE_IMAGE_VALUE}
PARSER_MODE=flowise
CHANNEL_MODE=${CHANNEL_MODE}
GCP_PROJECT_ID=${PROJECT_ID}
DEMO_DOMAIN=${DEMO_DOMAIN}
OPERATOR_DOMAIN=${OPERATOR_DOMAIN}
FLOWISE_DOMAIN=${FLOWISE_DOMAIN}
POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}
ZALO_DB_PASSWORD=${ZALO_DB_PASSWORD}
FLOWISE_DB_PASSWORD=${FLOWISE_DB_PASSWORD}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
ZALO_BOT_TOKEN=${ZALO_BOT_TOKEN}
API_KEY=${API_KEY}
AUTH_MODE=${AUTH_MODE}
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
EOF

touch "${RUNTIME_DIR}/flowise.env"
install -d -m 0700 "${RUNTIME_DIR}/zalo"
chmod 600 "${RUNTIME_DIR}/secrets.env" "${RUNTIME_DIR}/flowise.env" "${RUNTIME_DIR}/caddy.env"
