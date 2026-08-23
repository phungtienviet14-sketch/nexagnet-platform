#!/bin/bash
set -euo pipefail

STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
DATABASE="${1:?Usage: restore-check.sh zalo|flowise|hatchet /absolute/path/to/database.dump}"
DUMP_PATH="${2:?Usage: restore-check.sh zalo|flowise|hatchet /absolute/path/to/database.dump}"

if [[ "${DUMP_PATH}" != /* ]] || [[ ! -s "${DUMP_PATH}" ]]; then
  echo "Dump phai la file tuyet doi, ton tai va khong rong." >&2
  exit 1
fi

# DANH SACH TRANG, va moi muc keo theo SERVICE + NGUOI DUNG cua rieng no.
#
# `hatchet` KHONG nam tren `postgres` cua nghiep vu — no la mot PostgreSQL rieng, mot bo dang
# nhap rieng, sau `profiles: ["workflow"]`. Neu chi them `hatchet` vao danh sach trang ma van
# tro toi service `postgres`/`netviet_admin` nhu hai cai kia, script se di tao mot DB kiem tra
# TREN DB NGHIEP VU cua khach — dung cho de sai nhat cua ca file nay.
COMPOSE_PROFILE=()
case "${DATABASE}" in
  zalo|flowise)
    SERVICE=postgres
    ADMIN_USER=netviet_admin
    OWNER="${DATABASE}"
    ;;
  hatchet)
    SERVICE=hatchet-postgres
    ADMIN_USER=hatchet
    OWNER=hatchet
    COMPOSE_PROFILE=(--profile workflow)
    ;;
  *)
    echo "Database chi duoc la zalo, flowise hoac hatchet." >&2
    exit 1
    ;;
esac

cd "${APP_DIR}"
COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml "${COMPOSE_PROFILE[@]}")
CHECK_DB="${DATABASE}_restore_check"

"${COMPOSE[@]}" exec -T "${SERVICE}" dropdb --if-exists --username "${ADMIN_USER}" "${CHECK_DB}"
cleanup() {
  "${COMPOSE[@]}" exec -T "${SERVICE}" dropdb --if-exists --username "${ADMIN_USER}" "${CHECK_DB}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${COMPOSE[@]}" exec -T "${SERVICE}" createdb --username "${ADMIN_USER}" --owner "${OWNER}" "${CHECK_DB}"
cat "${DUMP_PATH}" | "${COMPOSE[@]}" exec -T "${SERVICE}" \
  pg_restore --username "${ADMIN_USER}" --dbname "${CHECK_DB}" --no-owner
"${COMPOSE[@]}" exec -T "${SERVICE}" psql --username "${ADMIN_USER}" --dbname "${CHECK_DB}" \
  --tuples-only --command "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
"${COMPOSE[@]}" exec -T "${SERVICE}" dropdb --username "${ADMIN_USER}" "${CHECK_DB}"
trap - EXIT
# GIOI HAN PHAI NOI RA: bai nay chung minh DUMP DOC LAI DUOC, khong chung minh du lieu trong do
# GIAI MA DUOC. Voi `hatchet`, khoa giai ma nam trong volume `hatchet-config` (xem backup.sh) —
# mot restore thanh cong o day van co the ra du lieu khong doc noi neu volume do da mat.
echo "Restore check thanh cong (${DATABASE} tren service ${SERVICE})."
