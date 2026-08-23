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

# --- WORKFLOW ENGINE (Hatchet) ------------------------------------------------------------------
# HAM RIENG, co y KHONG nhet vao vong `for database in zalo flowise` o tren: engine chay tren mot
# service khac, mot PostgreSQL khac, mot bo dang nhap khac. Gop vao se buoc vong do phai biet ve
# mot thu khong lien quan toi no.
backup_workflow_engine() {
  local container
  container="$("${COMPOSE[@]}" --profile workflow ps -q hatchet-postgres 2>/dev/null | head -n 1)"
  # Stack khong bat engine thi khong co gi de sao luu — day la duong BINH THUONG cua moi khach
  # chua dung workflow, khong phai mot loi can bao.
  [[ -n "${container}" ]] || return 0

  "${COMPOSE[@]}" --profile workflow exec -T hatchet-postgres \
    pg_dump --username hatchet --format=custom --no-owner --dbname hatchet \
    >"${TMP_DIR}/hatchet-${STAMP}.dump"
  test -s "${TMP_DIR}/hatchet-${STAMP}.dump"

  # ⚠️ VOLUME `hatchet-config` PHAI DI CUNG DUMP — day la phan de bi bo sot nhat ca file nay.
  #
  # DA KIEM tren engine that (v0.101.27, 23/08/2026): `/hatchet/config/server.yaml` chua
  #     encryption.masterKeyset
  #     encryption.jwt.privateJWTKeyset / publicJWTKeyset
  # Mat tep do thi:
  #   · du lieu da ma hoa trong dump KHONG giai ma lai duoc, du restore Postgres thanh cong, va
  #   · moi token da phat deu het hieu luc vi khoa ky JWT bien mat.
  # Tuc la mot backup chi co dump Postgres la BACKUP VO DUNG — no se PHUC HOI XANH roi khong doc
  # duoc gi. Chua tai lieu nao trong repo ghi dieu nay truoc 23/08/2026.
  #
  # Tar chay BEN TRONG container engine (busybox tar co san) nen khong phai keo them image nao va
  # khong phai doan ten volume theo compose project.
  #
  # Tep nay MANG BI MAT (khoa ma hoa). No di vao cung bucket rieng tu voi cac dump khac, va phai
  # duoc doi xu nhu bi mat — khong phai nhu "mot tep cau hinh".
  "${COMPOSE[@]}" --profile workflow exec -T hatchet-engine \
    tar czf - -C /hatchet/config . >"${TMP_DIR}/hatchet-config-${STAMP}.tar.gz"
  test -s "${TMP_DIR}/hatchet-config-${STAMP}.tar.gz"
}
backup_workflow_engine

if [[ "${VERIFY_RESTORE:-0}" == "1" ]]; then
  "${APP_DIR}/restore-check.sh" zalo "${TMP_DIR}/zalo-${STAMP}.dump"
  "${APP_DIR}/restore-check.sh" flowise "${TMP_DIR}/flowise-${STAMP}.dump"
  # Chi kiem khi stack that su co engine — `backup_workflow_engine` tu bo qua thi khong co dump.
  if [[ -s "${TMP_DIR}/hatchet-${STAMP}.dump" ]]; then
    "${APP_DIR}/restore-check.sh" hatchet "${TMP_DIR}/hatchet-${STAMP}.dump"
  fi
fi

sha256sum "${TMP_DIR}"/*.dump >"${TMP_DIR}/SHA256SUMS"
gcloud storage cp "${TMP_DIR}"/* "${BACKUP_ROOT}/daily/${STAMP}/"
prune_prefix daily 7
if [[ "$(date -u +%u)" == "7" ]]; then
  gcloud storage cp "${TMP_DIR}"/* "${BACKUP_ROOT}/weekly/${STAMP}/"
  prune_prefix weekly 4
fi
echo "Backup ${STAMP} cua stack ${STACK_SLUG} da tai len ${BACKUP_ROOT}."
