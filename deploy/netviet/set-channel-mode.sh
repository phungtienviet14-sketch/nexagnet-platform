#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "$#" -ne 1 ]]; then
  echo "Usage: sudo $0 mock|bot|zca|hybrid" >&2
  exit 64
fi

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-ultty}"
RUNTIME_DIR="${RUNTIME_DIR:-${APP_DIR}/.runtime}"
mode="$1"
cd "$APP_DIR"

exec 9>"${RUNTIME_DIR}/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa compose sau 300s." >&2
  exit 1
fi

secrets_file="${RUNTIME_DIR}/secrets.env"
if [[ ! -s "$secrets_file" ]]; then
  echo "Thieu $secrets_file; chay deploy/render-secrets truoc. Chua thay doi mode." >&2
  exit 65
fi

override_file="${RUNTIME_DIR}/channel-mode.env"
previous_mode="$("${APP_DIR}/channel-mode.sh" read "$override_file")"
had_override=0
[[ -f "$override_file" ]] && had_override=1
backup_secrets="$(mktemp "${secrets_file}.backup.XXXXXX")"
cp -p -- "$secrets_file" "$backup_secrets"
temp_secrets=''
cleanup() {
  rm -f -- "${temp_secrets:-}" "${backup_secrets:-}"
}
trap cleanup EXIT

rollback_runtime() {
  cp -p -- "$backup_secrets" "$secrets_file"
  if [[ "$had_override" -eq 1 ]]; then
    "${APP_DIR}/channel-mode.sh" write "$override_file" "$previous_mode"
  else
    rm -f -- "$override_file"
  fi
  "${COMPOSE[@]}" up -d --no-deps --force-recreate api >/dev/null || true
  echo "Da rollback CHANNEL_MODE ve $previous_mode sau rollout loi." >&2
}

temp_secrets="$(mktemp "${secrets_file}.tmp.XXXXXX")"
if ! awk -v mode="$mode" '
  BEGIN { replaced = 0 }
  /^CHANNEL_MODE=/ { print "CHANNEL_MODE=" mode; replaced = 1; next }
  { print }
  END { if (!replaced) print "CHANNEL_MODE=" mode }
' "$secrets_file" >"$temp_secrets"; then
  echo "Khong tao duoc secrets.env moi; chua thay doi mode." >&2
  exit 1
fi
chmod 600 "$temp_secrets"

COMPOSE=(docker compose --env-file "$secrets_file" -f compose.yaml)
"${APP_DIR}/channel-mode.sh" write "$override_file" "$mode"
if ! mv -f -- "$temp_secrets" "$secrets_file"; then
  rollback_runtime
  exit 1
fi
temp_secrets=''

if ! "${COMPOSE[@]}" up -d --no-deps --force-recreate api; then
  rollback_runtime
  exit 1
fi
for attempt in {1..60}; do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null; then
    echo "CHANNEL_MODE=$mode da ap dung; AUTO_SEND=off sau khi recreate API."
    exit 0
  fi
  if [[ "$attempt" -eq 60 ]]; then
    echo "API khong healthy sau khi doi CHANNEL_MODE=$mode." >&2
    "${COMPOSE[@]}" logs --tail=100 api >&2
    rollback_runtime
    exit 1
  fi
  sleep 2
done
