#!/bin/bash
set -euo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-netviet-host-968934832433}"
APP_IMAGE_VALUE="${APP_IMAGE:?APP_IMAGE is required}"
FLOWISE_IMAGE_VALUE="${FLOWISE_IMAGE:?FLOWISE_IMAGE is required}"
RUNTIME_DIR="${RUNTIME_DIR:-/srv/netviet/apps/zalo-ultty/.runtime}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# GOI KHACH khong di qua file nay. Image khong mang goi nao va cung khong tra slug -> `tenants/`;
# thay vao do deploy.ps1 upload goi cua dung stack nay va compose mount vao api/web bang TENANT_DIR.
PUBLIC_IP_VALUE="${PUBLIC_IP:?PUBLIC_IP is required}"
PUBLIC_IP_LABEL="${PUBLIC_IP_VALUE//./-}"
DEMO_DOMAIN="demo.${PUBLIC_IP_LABEL}.sslip.io"
OPERATOR_DOMAIN="operator.${PUBLIC_IP_LABEL}.sslip.io"
FLOWISE_DOMAIN="flowise.${PUBLIC_IP_LABEL}.sslip.io"

mkdir -p "${RUNTIME_DIR}"

# Serialize runtime env writes with explicit mode changes and compose rollout. This lock is released
# before deploy-stack.sh obtains it again; no nested lock/deadlock.
exec 9>"${RUNTIME_DIR}/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa runtime sau 300s." >&2
  exit 1
fi

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
# Token Bot van duoc render san de co the kiem tra danh tinh. Kenh mac dinh van la mock; chi file
# `.runtime/channel-mode.env` do operator tao CO Y moi duoc phep bat bot/zca/hybrid. `.runtime`
# khong bi rsync ghi de, nen deploy lai se GIU lua chon da phe duyet thay vi am tham tat kenh.
ZALO_BOT_TOKEN="$(optional_secret zalo-ultty-zalo-bot-token)"
CHANNEL_MODE="$("${SCRIPT_DIR}/channel-mode.sh" read "${RUNTIME_DIR}/channel-mode.env")"
echo "render-secrets: CHANNEL_MODE=${CHANNEL_MODE} (mock neu chua co override duoc phe duyet)." >&2
API_KEY=$(secret zalo-ultty-api-key)
SESSION_SECRET="$(secret zalo-ultty-session-secret)"
PILOT_OPERATOR_PASSWORD="$(secret zalo-ultty-operator-password)"
FLOWISE_SECRETKEY="$(secret zalo-ultty-flowise-secretkey)"
FLOWISE_ADMIN_EMAIL="$(secret zalo-ultty-flowise-admin-email)"
FLOWISE_ADMIN_PASSWORD="$(secret zalo-ultty-flowise-admin-password)"
FLOWISE_JWT_SECRET="$(secret zalo-ultty-flowise-jwt-secret)"
FLOWISE_REFRESH_SECRET="$(secret zalo-ultty-flowise-refresh-secret)"
FLOWISE_SESSION_SECRET="$(secret zalo-ultty-flowise-session-secret)"
FLOWISE_TOKEN_HASH_SECRET="$(secret zalo-ultty-flowise-token-hash-secret)"
# PRE-PILOT PUBLIC — SESSION AUTH:
# Caddy khong can Basic Auth; NestJS dung login session/role/CSRF va PostgreSQL session store.
# URL pilot public phai dung session server-side. API key van render san cho automation tuong lai,
# nhung khong dua vao browser. User bootstrap chi tao lan dau, deploy sau khong reset password.
AUTH_MODE='session'

# --- Kho anh (MEDIA_STORE) ---------------------------------------------------------------------
# Link anh Zalo chet trong <=35 ngay => khong tai ve la mat vinh vien. Nhung bat kho anh cung la
# bat mot duong ghi PII ra object storage, nen phai la lua chon CO Y — khong biet bucket thi
# `none`, khong doan.
#
# XAC THUC BANG ADC, KHONG DUNG KHOA (chot 13/08/2026): container ke thua tai khoan dich vu gan san
# cua VM, nen khong co khoa tinh nao phai phat, xoay vong hay lo. Duong S3 (`MEDIA_STORE=s3` + khoa
# HMAC) van con nguyen cho OVHcloud, chi khong dung tren GCP nua — to chuc bat
# `constraints/iam.disableServiceAccountKeyCreation` nen GCS khong the ky request S3 duoc.
#
# `MEDIA_BUCKET` MAC DINH tro vao dung bucket sao luu dang mang rule lifecycle prefix `media/`
# (60 ngay -> Nearline, 365 ngay -> Coldline, KHONG co rule Delete) — xem gcs-lifecycle.json va
# deploy.ps1 (`$BackupBucket`). Tro nham bucket thi rule giu anh khong co tac dung MA CUNG KHONG
# bao loi, nen mac dinh o day duoc chot theo bucket that thay vi de nguoi deploy tu go.
# BACKUP_BUCKET den tu deploy duoi dang `gs://<ten>`; API chi can ten tran.
MEDIA_BUCKET="${MEDIA_BUCKET:-${BACKUP_BUCKET#gs://}}"
if [[ -n "${MEDIA_BUCKET}" ]]; then
  MEDIA_STORE='gcs'
else
  MEDIA_STORE='none'
  echo "render-secrets: MEDIA_STORE=none (khong biet bucket) — anh Zalo se KHONG duoc luu." >&2
fi

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
SESSION_SECRET=${SESSION_SECRET}
PILOT_OPERATOR_USERNAME=operator
PILOT_OPERATOR_NAME=Pilot Operator
PILOT_OPERATOR_PASSWORD=${PILOT_OPERATOR_PASSWORD}
MEDIA_STORE=${MEDIA_STORE}
MEDIA_BUCKET=${MEDIA_BUCKET}
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
