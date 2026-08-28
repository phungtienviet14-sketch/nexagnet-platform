#!/usr/bin/env bash
# Dung cau hinh collector cua MOT stack tu khuon.
#
#   render-otel-collector.sh <stack-slug> <duong-dan-ra> [duong-dan-khuon]
#
# TACH KHOI `render-secrets.sh` de KIEM DUOC. `render-secrets.sh` doi GCP Secret Manager, nen moi
# thu song trong no chi chay duoc tren duong deploy that. Phep thay o nay khong can bi mat nao, va
# no la cho mot ten stack sai bien thanh mot kho quan sat sai — dung loai loi phai co bai test.
set -euo pipefail

STACK_SLUG="${1:?stack slug is required}"
OUT_PATH="${2:?output path is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${3:-${SCRIPT_DIR}/otel-collector.template.yaml}"

# Slug la mot phan cua TEN THANH PHAN va cua duong dan khoa. Chan som: mot slug co `/`, khoang
# trang hay `$` se hoac lam hong YAML, hoac tro khoa sang mot duong dan khac.
if [[ ! "${STACK_SLUG}" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "render-otel-collector: stack slug khong hop le: '${STACK_SLUG}'" >&2
  echo "(chi cho phep chu thuong, so va dau '-', va phai bat dau bang chu/so)" >&2
  exit 64
fi

[[ -f "${TEMPLATE}" ]] || {
  echo "render-otel-collector: khong thay khuon ${TEMPLATE}" >&2
  exit 66
}

# ClickHouse: ten database/user khong nhan `-`. `ultty-gd1-test` -> `ultty_gd1_test`.
DB_SLUG="${STACK_SLUG//-/_}"

mkdir -p "$(dirname "${OUT_PATH}")"
# Ghi qua tep tam roi doi ten: mot lan render bi ngat khong duoc de lai cau hinh mot nua, vi
# collector doc lai tep nay luc khoi dong va mot YAML cut se lam no khong len duoc.
TMP_PATH="${OUT_PATH}.tmp.$$"
sed -e "s|__STACK_SLUG__|${STACK_SLUG}|g" -e "s|__DB_SLUG__|${DB_SLUG}|g" "${TEMPLATE}" > "${TMP_PATH}"
mv -f "${TMP_PATH}" "${OUT_PATH}"

# O nao con sot lai la mot loi im lang: collector van khoi dong duoc voi ten thanh phan
# `bearertokenauth/__STACK_SLUG__`, va moi thu trong ra dung cho toi khi ai do doc ky.
if grep -q '__[A-Z_]*__' "${OUT_PATH}"; then
  echo "render-otel-collector: con o chua thay trong ${OUT_PATH}" >&2
  grep -n '__[A-Z_]*__' "${OUT_PATH}" >&2
  exit 65
fi

echo "render-otel-collector: da ghi ${OUT_PATH} cho stack ${STACK_SLUG}" >&2
