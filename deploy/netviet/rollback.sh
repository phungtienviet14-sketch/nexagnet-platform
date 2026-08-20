#!/bin/bash
set -euo pipefail
umask 077

# Cac script van hanh tac dong len mot STACK (mot thu muc, mot compose project, mot bo volume),
# khong phai len mot khach. Voi dev/production STACK_SLUG == TENANT_SLUG nen khong co gi doi.
STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
APP_IMAGE_VALUE="${1:?Usage: rollback.sh APP_IMAGE@sha256:DIGEST FLOWISE_IMAGE@sha256:DIGEST [deepseek|flowise]}"
FLOWISE_IMAGE_VALUE="${2:?Usage: rollback.sh APP_IMAGE@sha256:DIGEST FLOWISE_IMAGE@sha256:DIGEST [deepseek|flowise]}"
PARSER_MODE_VALUE="${3:-deepseek}"

case "${PARSER_MODE_VALUE}" in
  deepseek|flowise) ;;
  *)
    echo "Rollback parser chi duoc deepseek hoac flowise." >&2
    exit 1
    ;;
esac
for image in "${APP_IMAGE_VALUE}" "${FLOWISE_IMAGE_VALUE}"; do
  if [[ ! "${image}" =~ @sha256:[a-f0-9]{64}$ ]]; then
    echo "Moi image rollback phai duoc khoa bang digest." >&2
    exit 1
  fi
done

cd "${APP_DIR}"
ENV_FILE=".runtime/secrets.env"
test -s "${ENV_FILE}"

previous_app_image="$(sed -n 's/^APP_IMAGE=//p' "${ENV_FILE}" | head -n 1)"
previous_flowise_image="$(sed -n 's/^FLOWISE_IMAGE=//p' "${ENV_FILE}" | head -n 1)"
printf 'APP_IMAGE=%s\nFLOWISE_IMAGE=%s\n' \
  "${previous_app_image}" "${previous_flowise_image}" >.runtime/previous-images
chmod 0600 .runtime/previous-images

next_env="$(mktemp "${APP_DIR}/.runtime/secrets.env.XXXXXX")"
trap 'rm -f -- "${next_env}"' EXIT
awk -v app_image="${APP_IMAGE_VALUE}" -v flowise_image="${FLOWISE_IMAGE_VALUE}" -v parser="${PARSER_MODE_VALUE}" '
  BEGIN { app_written = 0; flowise_written = 0; parser_written = 0 }
  /^APP_IMAGE=/ { print "APP_IMAGE=" app_image; app_written = 1; next }
  /^FLOWISE_IMAGE=/ { print "FLOWISE_IMAGE=" flowise_image; flowise_written = 1; next }
  /^PARSER_MODE=/ { print "PARSER_MODE=" parser; parser_written = 1; next }
  { print }
  END {
    if (!app_written) print "APP_IMAGE=" app_image
    if (!flowise_written) print "FLOWISE_IMAGE=" flowise_image
    if (!parser_written) print "PARSER_MODE=" parser
  }
' "${ENV_FILE}" >"${next_env}"
chmod 0600 "${next_env}"
mv -f -- "${next_env}" "${ENV_FILE}"
trap - EXIT

# Cung khoa voi deploy-stack.sh/health-check.sh — rollback cung recreate container nen dinh dung
# race "removal of container ... is already in progress" neu timer tu-chua chen vao.
exec 9>".runtime/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa compose sau 300s — co tien trinh compose khac dang chay." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f compose.yaml)
"${COMPOSE[@]}" pull api web flowise
"${COMPOSE[@]}" up -d flowise
"${COMPOSE[@]}" up -d api web
operator_domain="$(sed -n "s/^OPERATOR_DOMAIN=//p" .runtime/secrets.env | tail -n 1)"
curl -fsS --retry 30 --retry-delay 2 --resolve "${operator_domain}:443:127.0.0.1" "https://${operator_domain}/health" >/dev/null
echo "Rollback thanh cong: parser=${PARSER_MODE_VALUE}, app=${APP_IMAGE_VALUE}, flowise=${FLOWISE_IMAGE_VALUE}"
