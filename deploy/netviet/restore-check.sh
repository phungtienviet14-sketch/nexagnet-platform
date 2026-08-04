#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-ultty}"
DATABASE="${1:?Usage: restore-check.sh zalo|flowise /absolute/path/to/database.dump}"
DUMP_PATH="${2:?Usage: restore-check.sh zalo|flowise /absolute/path/to/database.dump}"

if [[ "${DUMP_PATH}" != /* ]] || [[ ! -s "${DUMP_PATH}" ]]; then
  echo "Dump phai la file tuyet doi, ton tai va khong rong." >&2
  exit 1
fi
case "${DATABASE}" in
  zalo|flowise) ;;
  *)
    echo "Database chi duoc la zalo hoac flowise." >&2
    exit 1
    ;;
esac

cd "${APP_DIR}"
COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml)
CHECK_DB="${DATABASE}_restore_check"

"${COMPOSE[@]}" exec -T postgres dropdb --if-exists --username netviet_admin "${CHECK_DB}"
cleanup() {
  "${COMPOSE[@]}" exec -T postgres dropdb --if-exists --username netviet_admin "${CHECK_DB}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${COMPOSE[@]}" exec -T postgres createdb --username netviet_admin --owner "${DATABASE}" "${CHECK_DB}"
cat "${DUMP_PATH}" | "${COMPOSE[@]}" exec -T postgres \
  pg_restore --username netviet_admin --dbname "${CHECK_DB}" --no-owner
"${COMPOSE[@]}" exec -T postgres psql --username netviet_admin --dbname "${CHECK_DB}" \
  --tuples-only --command "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
"${COMPOSE[@]}" exec -T postgres dropdb --username netviet_admin "${CHECK_DB}"
trap - EXIT
echo "Restore check thanh cong."
