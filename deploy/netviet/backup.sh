#!/bin/bash
set -euo pipefail

TENANT_SLUG="${TENANT_SLUG:-ultty}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${TENANT_SLUG}}"
BACKUP_BUCKET="${BACKUP_BUCKET:-gs://netviet-host-968934832433-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  if [[ "${TMP_DIR}" == /tmp/* ]] && [[ -d "${TMP_DIR}" ]]; then
    rm -rf -- "${TMP_DIR}"
  fi
}
trap cleanup EXIT

prune_prefix() {
  local prefix="${1:?prefix}"
  local keep="${2:?keep}"
  local expected_root="${BACKUP_BUCKET}/${prefix}/"
  local entries=()
  mapfile -t entries < <(gcloud storage ls "${expected_root}" 2>/dev/null | sort)
  local remove_count=$((${#entries[@]} - keep))
  if (( remove_count <= 0 )); then
    return
  fi

  for ((index = 0; index < remove_count; index++)); do
    local target="${entries[${index}]}"
    if [[ "${target}" != "${expected_root}"20??????T??????Z/ ]]; then
      echo "Tu choi xoa backup ngoai prefix/format mong doi: ${target}" >&2
      exit 1
    fi
    gcloud storage rm --recursive "${target}"
  done
}

cd "${APP_DIR}"
COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml)

for database in zalo flowise; do
  "${COMPOSE[@]}" exec -T postgres \
    pg_dump --username netviet_admin --format=custom --no-owner --dbname "${database}" \
    >"${TMP_DIR}/${database}-${STAMP}.dump"
  test -s "${TMP_DIR}/${database}-${STAMP}.dump"
done

if [[ "${VERIFY_RESTORE:-0}" == "1" ]]; then
  "${APP_DIR}/restore-check.sh" zalo "${TMP_DIR}/zalo-${STAMP}.dump"
  "${APP_DIR}/restore-check.sh" flowise "${TMP_DIR}/flowise-${STAMP}.dump"
fi

sha256sum "${TMP_DIR}"/*.dump >"${TMP_DIR}/SHA256SUMS"
gcloud storage cp "${TMP_DIR}"/* "${BACKUP_BUCKET}/daily/${STAMP}/"
prune_prefix daily 7
if [[ "$(date -u +%u)" == "7" ]]; then
  gcloud storage cp "${TMP_DIR}"/* "${BACKUP_BUCKET}/weekly/${STAMP}/"
  prune_prefix weekly 4
fi
echo "Backup ${STAMP} da tai len ${BACKUP_BUCKET}."
