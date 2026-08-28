#!/bin/bash
set -euo pipefail

STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
USAGE='Usage: restore-check.sh zalo|flowise|hatchet|observability /absolute/path/to/dump'
DATABASE="${1:?${USAGE}}"
DUMP_PATH="${2:?${USAGE}}"

if [[ "${DUMP_PATH}" != /* ]] || [[ ! -s "${DUMP_PATH}" ]]; then
  echo "Dump phai la file tuyet doi, ton tai va khong rong." >&2
  exit 1
fi

# ================================================================================================
# KHO QUAN SAT — MOT DUONG RIENG, khong di qua `case` cua Postgres ben duoi.
#
# Khong phai vi tien: `dropdb`/`createdb`/`pg_restore` khong ton tai o ClickHouse, va ep no vao
# cung mot khuon se sinh ra mot ham co bon nhanh `if` chi de tranh viet ra rang day la hai viec
# khac nhau.
#
# BAI NAY MANH HON bai cua Postgres, va co chu y. Bai Postgres chi chung minh "dump doc lai duoc".
# O day cong ra cua P2 doi hoi nhieu hon: **phuc hoi roi TRUY VAN DUOC MOT TRACE DA SAO LUU**. Nen
# sau khi nap xong, script lay mot `TraceId` co that trong ban phuc hoi roi hoi lai chinh no —
# dung cau hoi ma Debug View se hoi. Mot bang nap thanh cong nhung khong tra loi duoc theo
# `TraceId` la mot bang vo dung voi muc dich no ton tai.
# ================================================================================================
if [[ "${DATABASE}" == 'observability' ]]; then
  cd "${APP_DIR}"
  COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml --profile observability)

  ch_reader_user="$(sed -n 's/^CLICKHOUSE_READER_USER=//p' .runtime/secrets.env | tail -n 1)"
  ch_reader_password="$(sed -n 's/^CLICKHOUSE_READER_PASSWORD=//p' .runtime/secrets.env | tail -n 1)"
  ch_writer_user="$(sed -n 's/^CLICKHOUSE_WRITER_USER=//p' .runtime/secrets.env | tail -n 1)"
  ch_writer_password="$(sed -n 's/^CLICKHOUSE_WRITER_PASSWORD=//p' .runtime/secrets.env | tail -n 1)"
  ch_database="$(sed -n 's/^CLICKHOUSE_DATABASE=//p' .runtime/secrets.env | tail -n 1)"
  CHECK_DB="${ch_database}_restore_check"

  work="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf -- '${work}'" EXIT
  tar xzf "${DUMP_PATH}" -C "${work}"
  test -s "${work}/schema.sql"

  ch_write() {
    "${COMPOSE[@]}" exec -T -e "CLICKHOUSE_PASSWORD=${ch_writer_password}" clickhouse       clickhouse-client --user "${ch_writer_user}" "$@"
  }
  ch_read() {
    "${COMPOSE[@]}" exec -T -e "CLICKHOUSE_PASSWORD=${ch_reader_password}" clickhouse       clickhouse-client --user "${ch_reader_user}" "$@"
  }

  ch_write --query "DROP DATABASE IF EXISTS ${CHECK_DB}"
  ch_write --query "CREATE DATABASE ${CHECK_DB}"

  # ⚠️ BO HAN TEN DATABASE khoi cau lenh, khong doi ten no.
  #
  # Ban truoc doi `\`<db>\`` -> `\`<db>_restore_check\`` bang sed. Tren ClickHouse 25.3,
  # `SHOW CREATE TABLE` tra ve ten database **KHONG CO backtick**:
  #
  #     CREATE TABLE obs_ultty_gd1_test.otel_traces
  #
  # nen phep sed la mot no-op IM LANG, va cau `CREATE` nham thang vao database THAT. Lan chay
  # 28/08/2026 chi thoat vi `TABLE_ALREADY_EXISTS` — tuc bai kiem tra phuc hoi duoc cuu boi mot
  # tinh co, khong boi thiet ke.
  #
  # Nay ten database bi BO HAN o dong dau, va `--database "${CHECK_DB}"` la thu duy nhat quyet
  # dinh bang di vao dau. Khong con mot ten nao de doi sai.
  sed -E "1s/^CREATE TABLE [^(]*/CREATE TABLE otel_traces /" "${work}/schema.sql"     >"${work}/schema-check.sql"

  # CONG FAIL-CLOSED. Neu vi mot ly do nao do ten database that VAN con trong cau lenh thi dung
  # han — mot bai kiem tra phuc hoi khong bao gio duoc phep cham vao du lieu dang chay, va "co le
  # khong sao" khong phai mot muc rui ro chap nhan duoc o day.
  if grep -q "${ch_database}" "${work}/schema-check.sql"; then
    echo "TU CHOI: cau lenh khoi phuc van nhac database that '${ch_database}'." >&2
    echo "Bai kiem tra nay se dung han thay vi chay vao kho dang phuc vu." >&2
    exit 1
  fi
  ch_write --database "${CHECK_DB}" --multiquery <"${work}/schema-check.sql"

  ch_write --database "${CHECK_DB}"     --query 'INSERT INTO otel_traces FORMAT Native' <"${work}/otel_traces.native"

  restored_spans="$(ch_read --database "${CHECK_DB}" --query 'SELECT count() FROM otel_traces' | tr -d '\r\n ')"
  echo "Kho quan sat: da phuc hoi ${restored_spans} span vao ${CHECK_DB}."

  if [[ "${restored_spans}" =~ ^[0-9]+$ ]] && [[ "${restored_spans}" -gt 0 ]]; then
    # LAY MOT TRACE THAT ROI HOI LAI CHINH NO. Day la khac biet giua "bang co du lieu" va "trace
    # tra cuu duoc" — cai thu hai moi la thu Debug View can.
    sample_trace="$(ch_read --database "${CHECK_DB}" --query 'SELECT TraceId FROM otel_traces LIMIT 1' | tr -d '\r\n ')"
    spans_for_trace="$(ch_read --database "${CHECK_DB}" --query "SELECT count() FROM otel_traces WHERE TraceId = '${sample_trace}'" | tr -d '\r\n ')"
    if [[ ! "${spans_for_trace}" =~ ^[0-9]+$ ]] || [[ "${spans_for_trace}" -eq 0 ]]; then
      echo "Phuc hoi xong nhung KHONG tra cuu duoc theo TraceId — ban phuc hoi nay vo dung." >&2
      ch_write --query "DROP DATABASE IF EXISTS ${CHECK_DB}"
      exit 1
    fi
    echo "Truy van theo TraceId ${sample_trace} tren ban PHUC HOI: ${spans_for_trace} span."
  else
    # Kho rong la trang thai hop le, nhung phai NOI RA: mot bai xanh tren mot ban sao luu rong
    # khong chung minh duoc gi ca.
    echo "CANH BAO: ban sao luu kho quan sat KHONG CO span nao — bai nay khong chung minh duoc gi." >&2
  fi

  ch_write --query "DROP DATABASE IF EXISTS ${CHECK_DB}"
  trap - EXIT
  rm -rf -- "${work}"
  echo "Restore check thanh cong (observability tren service clickhouse)."
  exit 0
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
    echo "Database chi duoc la zalo, flowise, hatchet hoac observability." >&2
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
