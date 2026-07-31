#!/bin/bash
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-ultty}"
IMAGE="${1:?Usage: rollback.sh REGISTRY/IMAGE@sha256:DIGEST [deepseek|flowise]}"
PARSER_MODE_VALUE="${2:-deepseek}"

case "${PARSER_MODE_VALUE}" in
  deepseek|flowise) ;;
  *)
    echo "Rollback parser chi duoc deepseek hoac flowise." >&2
    exit 1
    ;;
esac
if [[ "${IMAGE}" != *@sha256:* ]]; then
  echo "Image rollback phai duoc khoa bang digest." >&2
  exit 1
fi

cd "${APP_DIR}"
ENV_FILE=".runtime/secrets.env"
test -s "${ENV_FILE}"

previous_image="$(sed -n 's/^APP_IMAGE=//p' "${ENV_FILE}" | head -n 1)"
printf '%s\n' "${previous_image}" >.runtime/previous-image

next_env="$(mktemp "${APP_DIR}/.runtime/secrets.env.XXXXXX")"
trap 'rm -f -- "${next_env}"' EXIT
awk -v image="${IMAGE}" -v parser="${PARSER_MODE_VALUE}" '
  BEGIN { image_written = 0; parser_written = 0 }
  /^APP_IMAGE=/ { print "APP_IMAGE=" image; image_written = 1; next }
  /^PARSER_MODE=/ { print "PARSER_MODE=" parser; parser_written = 1; next }
  { print }
  END {
    if (!image_written) print "APP_IMAGE=" image
    if (!parser_written) print "PARSER_MODE=" parser
  }
' "${ENV_FILE}" >"${next_env}"
chmod 0600 "${next_env}"
mv -f -- "${next_env}" "${ENV_FILE}"
trap - EXIT

COMPOSE=(docker compose --env-file "${ENV_FILE}" -f compose.yaml)
"${COMPOSE[@]}" pull api web
"${COMPOSE[@]}" up -d api web gateway
curl -fsS --retry 30 --retry-delay 2 http://127.0.0.1:8080/health >/dev/null
echo "Rollback thanh cong: parser=${PARSER_MODE_VALUE}, image=${IMAGE}"
