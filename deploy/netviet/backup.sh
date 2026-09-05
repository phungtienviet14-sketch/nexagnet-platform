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
# CSDL PHAI SAO LUU LA CSDL THAT SU TON TAI.
#
# `flowise` chi duoc tao khi ho so bat Flowise (xem `postgres/init-databases.sh`). Giu no trong mot
# danh sach co dinh se lam `pg_dump --dbname flowise` chet tren stack khong co CSDL do — va vi tep
# nay chay voi `VERIFY_RESTORE=1` NGAY SAU `deploy-stack.sh`, mot lan chet o day danh do CA LAN
# DEPLOY sau khi ung dung da len va da khoe.
source "${APP_DIR}/stack-compose.sh"
netviet_load_stack_composition
COMPOSE=(docker compose --env-file .runtime/secrets.env "${NETVIET_COMPOSE_FILES[@]}")
BACKED_UP_DATABASES=(zalo)
if [[ "${NETVIET_FLOWISE_ENABLED}" == 'on' ]]; then
  BACKED_UP_DATABASES+=(flowise)
fi

for database in "${BACKED_UP_DATABASES[@]}"; do
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

# --- KHO QUAN SAT (ClickHouse) ------------------------------------------------------------------
# HAM RIENG, cung ly le voi Hatchet o tren: mot engine khac, mot giao thuc khac, mot bo dang nhap
# khac. Va o day co them mot ly do: du lieu nay KHONG phai quan he — `pg_dump` khong biet gi ve no.
#
# ⚠️ VI SAO KHO QUAN SAT PHAI VAO BACKUP, trong khi no "chi la telemetry":
#
# Tu P2, no khong con chi la telemetry. Debug View lui ve day khi vong dem trong tien trinh khong
# con giu, nen mot trace cu chi ton tai o DUNG MOT NOI: bang `otel_traces`. Mat kho la mat toan bo
# lich su chan doan — ke ca cua nhung su co dang duoc dieu tra. `ttl: 720h` chi noi du lieu song
# BAO LAU, no khong noi du lieu song QUA MOT SU CO O DIA hay khong.
#
# ĐINH DANG `Native` chu khong phai CSV/JSON: no giu NGUYEN KIEU, ke ca `Map(String,String)` cua
# `SpanAttributes`/`ResourceAttributes` va cot long `Events.*`. Mot ban CSV se lam phang chung roi
# doc lai thanh chuoi — tuc mat dung phan ma `historical-span.ts` doc de dung lai mot luot.
#
# SCHEMA DI CUNG DU LIEU trong cung mot tep: bang do `clickhouseexporter` tu dung (`create_schema:
# true`), nen no la hop dong cua MOT PHIEN BAN collector. Phuc hoi du lieu cua thang truoc vao mot
# schema cua thang sau la cach de mot backup "thanh cong" roi khong doc duoc.
backup_observability_store() {
  local container
  container="$("${COMPOSE[@]}" --profile observability ps -q clickhouse 2>/dev/null | head -n 1)"
  # Stack khong bat cum quan sat thi khong co gi de sao luu — duong BINH THUONG, khong phai loi.
  [[ -n "${container}" ]] || return 0

  local reader_user reader_password database work
  reader_user="$(sed -n 's/^CLICKHOUSE_READER_USER=//p' .runtime/secrets.env | tail -n 1)"
  reader_password="$(sed -n 's/^CLICKHOUSE_READER_PASSWORD=//p' .runtime/secrets.env | tail -n 1)"
  database="$(sed -n 's/^CLICKHOUSE_DATABASE=//p' .runtime/secrets.env | tail -n 1)"
  [[ -n "${reader_user}" && -n "${database}" ]] || return 0

  work="${TMP_DIR}/observability"
  mkdir -p "${work}"

  # CREDENTIAL CHI DOC, khong phai credential ghi: mot ban sao luu khong co ly do gi de ghi duoc
  # vao kho no dang doc. Cung user ma Debug View dung, nen mot backup chay duoc cung la mot lan
  # xac nhan rang duong doc do con song.
  "${COMPOSE[@]}" --profile observability exec -T     -e "CLICKHOUSE_PASSWORD=${reader_password}" clickhouse     clickhouse-client --user "${reader_user}" --database "${database}"     --query 'SHOW CREATE TABLE otel_traces FORMAT TabSeparatedRaw' >"${work}/schema.sql"
  test -s "${work}/schema.sql"

  "${COMPOSE[@]}" --profile observability exec -T     -e "CLICKHOUSE_PASSWORD=${reader_password}" clickhouse     clickhouse-client --user "${reader_user}" --database "${database}"     --query 'SELECT * FROM otel_traces FORMAT Native' >"${work}/otel_traces.native"

  # Kho RONG la mot trang thai hop le (stack vua bat quan sat, chua co luot nao). Nhung mot tep
  # rong thi khong phan biet duoc voi mot lenh da hong, nen ghi ra so dong de nguoi doc biet.
  "${COMPOSE[@]}" --profile observability exec -T     -e "CLICKHOUSE_PASSWORD=${reader_password}" clickhouse     clickhouse-client --user "${reader_user}" --database "${database}"     --query 'SELECT count(), countDistinct(TraceId), min(Timestamp), max(Timestamp) FROM otel_traces'     >"${work}/MANIFEST.txt"

  tar czf "${TMP_DIR}/observability-${STAMP}.tar.gz" -C "${work}" .
  test -s "${TMP_DIR}/observability-${STAMP}.tar.gz"
  rm -rf -- "${work}"
}
# ⚠️ KHONG `set -e` CHO NHANH NAY, va day la mot quyet dinh chu khong phai su lo la.
#
# `.claude/rules/ecc/common/code-review.md` dat mot bat bien: quan sat khong duoc la dependency
# cua thanh cong nghiep vu. Mot ClickHouse hic lan luc sao luu KHONG duoc bien thanh mot lan
# deploy do — va cang khong duoc chan `postgres`/`hatchet` (hai kho THAT SU khong mat duoc) tai
# len bucket.
#
# Doi lai: no phai KEU TO. Mot canh bao khong ai doc thi cung bang khong co, nen dong duoi day
# viet ro rang chuyen gi da khong xay ra.
if ! backup_observability_store; then
  echo "CANH BAO: khong sao luu duoc kho quan sat cua ${STACK_SLUG}." >&2
  echo "Trace lich su cua stack nay dang KHONG co ban sao. Xem docs/kien-truc/reference-platform-stack.md §8.12." >&2
fi

if [[ "${VERIFY_RESTORE:-0}" == "1" ]]; then
  for database in "${BACKED_UP_DATABASES[@]}"; do
    "${APP_DIR}/restore-check.sh" "${database}" "${TMP_DIR}/${database}-${STAMP}.dump"
  done
  # Chi kiem khi stack that su co engine — `backup_workflow_engine` tu bo qua thi khong co dump.
  if [[ -s "${TMP_DIR}/hatchet-${STAMP}.dump" ]]; then
    "${APP_DIR}/restore-check.sh" hatchet "${TMP_DIR}/hatchet-${STAMP}.dump"
  fi
  # Cung luat: chi kiem khi stack that su co cum quan sat, va cung KHONG lam do lan deploy.
  if [[ -s "${TMP_DIR}/observability-${STAMP}.tar.gz" ]]; then
    if ! "${APP_DIR}/restore-check.sh" observability "${TMP_DIR}/observability-${STAMP}.tar.gz"; then
      echo "CANH BAO: ban sao luu kho quan sat KHONG phuc hoi lai duoc." >&2
      echo "Day la mot ban sao luu chua duoc chung minh — dung tin vao no." >&2
    fi
  fi
fi

# `*.dump` MOT MINH KHONG DU: tu 28/08 thu muc nay con co `hatchet-config-*.tar.gz` (mang khoa
# giai ma) va `observability-*.tar.gz` (kho quan sat). Mot ban ghi toan ven bo sot dung hai tep
# quan trong nhat la mot ban ghi toan ven noi doi.
sha256sum "${TMP_DIR}"/*.dump "${TMP_DIR}"/*.tar.gz 2>/dev/null >"${TMP_DIR}/SHA256SUMS" ||   sha256sum "${TMP_DIR}"/*.dump >"${TMP_DIR}/SHA256SUMS"
gcloud storage cp "${TMP_DIR}"/* "${BACKUP_ROOT}/daily/${STAMP}/"
prune_prefix daily 7
if [[ "$(date -u +%u)" == "7" ]]; then
  gcloud storage cp "${TMP_DIR}"/* "${BACKUP_ROOT}/weekly/${STAMP}/"
  prune_prefix weekly 4
fi
echo "Backup ${STAMP} cua stack ${STACK_SLUG} da tai len ${BACKUP_ROOT}."
