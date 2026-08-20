#!/bin/bash
set -euo pipefail

# Cac script van hanh tac dong len mot STACK (mot thu muc, mot compose project, mot bo volume),
# khong phai len mot khach. Voi dev/production STACK_SLUG == TENANT_SLUG nen khong co gi doi.
STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
BACKUP_BUCKET="${BACKUP_BUCKET:-gs://netviet-host-968934832433-backups}"
# MOI STACK MOT CUA SO LUU TRU RIENG.
# Truoc day moi stack deu do vao chung `daily/<stamp>/`, ma `prune_prefix daily 7` dem 7 thu muc
# tren TOAN BUCKET — nen hai stack chia doi cua so cua nhau (do luu thuc te ~3.5 dem thay vi 7),
# va nhin mot dump thi khong biet no cua stack nao. Da xac minh 20/08/2026: bucket giu dung 7 thu
# muc, xen ke cap cua `ultty` va `amico`. Them stack thu ba se con ~2.3 dem.
# Tien to theo stack tra lai moi stack dung 7 dem cua no va lam dump tu mo ta duoc nguon.
# Backup CU o `daily/`/`weekly/` khong bi dong toi: prune chi xoa trong dung tien to no quan ly.
BACKUP_ROOT="${BACKUP_BUCKET}/stacks/${STACK_SLUG}"
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
  local expected_root="${BACKUP_ROOT}/${prefix}/"
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
gcloud storage cp "${TMP_DIR}"/* "${BACKUP_ROOT}/daily/${STAMP}/"
prune_prefix daily 7
if [[ "$(date -u +%u)" == "7" ]]; then
  gcloud storage cp "${TMP_DIR}"/* "${BACKUP_ROOT}/weekly/${STAMP}/"
  prune_prefix weekly 4
fi
echo "Backup ${STAMP} cua stack ${STACK_SLUG} da tai len ${BACKUP_ROOT}."
