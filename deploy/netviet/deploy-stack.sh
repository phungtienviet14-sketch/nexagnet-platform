#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-ultty}"
cd "${APP_DIR}"

if [[ ! -s .runtime/secrets.env ]]; then
  echo "Thieu .runtime/secrets.env; chay render-secrets.sh truoc." >&2
  exit 1
fi

# KHOA CHUNG cho moi lenh `docker compose up`. Ngay 04/08/2026 deploy chet giua chung voi
# "removal of container ... is already in progress": timer tu-chua (health-check.sh) goi
# `up -d --no-recreate` dung luc deploy dang recreate container api. `--no-recreate` KHONG du
# de tranh dung nhau — hai tien trinh compose van gianh cung mot container.
# Deploy uu tien: doi toi 300s. Timer thi bo qua nhip do (xem health-check.sh).
exec 9>".runtime/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa compose sau 300s — co tien trinh compose khac dang chay." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml)
channel_mode="$("${APP_DIR}/channel-mode.sh" read "${APP_DIR}/.runtime/channel-mode.env")"
runtime_value() {
  local key="$1"
  sed -n "s/^${key}=//p" .runtime/secrets.env | tail -n 1
}
DEMO_DOMAIN="$(runtime_value DEMO_DOMAIN)"
OPERATOR_DOMAIN="$(runtime_value OPERATOR_DOMAIN)"
FLOWISE_DOMAIN="$(runtime_value FLOWISE_DOMAIN)"
for domain in "${DEMO_DOMAIN}" "${OPERATOR_DOMAIN}" "${FLOWISE_DOMAIN}"; do
  if [[ ! "${domain}" =~ ^[a-z0-9.-]+$ ]]; then
    echo "Runtime domain khong hop le; khong chay smoke." >&2
    exit 65
  fi
done

"${COMPOSE[@]}" pull postgres flowise gateway
"${COMPOSE[@]}" up -d postgres
for attempt in {1..60}; do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U netviet_admin -d postgres >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "PostgreSQL khong healthy sau 5 phut." >&2
    "${COMPOSE[@]}" logs --tail=100 postgres >&2
    exit 1
  fi
  sleep 5
done
"${COMPOSE[@]}" exec -T postgres sh -s < postgres/sync-passwords.sh
"${COMPOSE[@]}" up -d flowise

for attempt in {1..60}; do
  if "${COMPOSE[@]}" exec -T flowise curl -fsS http://127.0.0.1:3000/api/v1/ping >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Flowise khong healthy sau 10 phut." >&2
    "${COMPOSE[@]}" logs --tail=100 flowise >&2
    exit 1
  fi
  sleep 10
done

"${COMPOSE[@]}" --profile tools run --rm bootstrap
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  node deploy/flowise/contract-test.mjs
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  node deploy/netviet/bootstrap-auth-user.mjs
# Always recreate the application processes before injecting a smoke message. Besides picking up the
# new image, this resets the in-memory AUTO_SEND switch to the compose fail-safe `off` value. Without
# this, an unchanged container that an operator had temporarily enabled could send the smoke fixture
# through a live Zalo transport before smoke-test.mjs gets a chance to inspect the channel mode.
"${COMPOSE[@]}" up -d --no-deps --force-recreate api web
# Caddy khong tu reload khi noi dung bind-mounted Caddyfile thay doi.
"${COMPOSE[@]}" up -d --force-recreate gateway
"${COMPOSE[@]}" ps

for attempt in {1..60}; do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Gateway khong healthy sau 2 phut." >&2
    "${COMPOSE[@]}" logs --tail=100 gateway >&2
    exit 1
  fi
  sleep 2
done
smoke_output="$("${COMPOSE[@]}" --profile tools run --rm --no-deps \
  -T \
  --add-host "${OPERATOR_DOMAIN}:host-gateway" \
  -e "PILOT_BASE_URL=https://${OPERATOR_DOMAIN}" \
  -e "CHANNEL_MODE=${channel_mode}" \
  bootstrap node --input-type=module - < smoke-test.mjs)"
echo "${smoke_output}"
smoke_order_id="$(sed -n 's/.*SMOKE_ORDER_ID=//p' <<<"${smoke_output}" | tail -n 1)"
smoke_order_id="${smoke_order_id%%;*}"
smoke_order_status="$(sed -n 's/.*SMOKE_ORDER_STATUS=//p' <<<"${smoke_output}" | tail -n 1)"
if [[ ! "${smoke_order_id}" =~ ^[0-9a-f-]{36}$ ]] || \
  [[ ! "${smoke_order_status}" =~ ^(pending_review|needs_edit|sent)$ ]]; then
  echo "Khong lay duoc order id tu pilot smoke test." >&2
  exit 1
fi

"${COMPOSE[@]}" restart api
for attempt in {1..60}; do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "API khong healthy sau restart." >&2
    exit 1
  fi
  sleep 2
done
"${COMPOSE[@]}" --profile tools run --rm --no-deps \
  -T \
  --add-host "${OPERATOR_DOMAIN}:host-gateway" \
  -e "PILOT_BASE_URL=https://${OPERATOR_DOMAIN}" \
  -e "CHANNEL_MODE=${channel_mode}" \
  -e "VERIFY_ORDER_ID=${smoke_order_id}" \
  -e "VERIFY_ORDER_STATUS=${smoke_order_status}" \
  bootstrap node --input-type=module - < smoke-test.mjs
echo "Stack zalo-ultty da healthy tai 127.0.0.1:8080."

# Public endpoints/UI shell phai reachable qua TLS, trong khi protected API phai tu choi anonymous.
for attempt in {1..60}; do
  if curl -fsS --max-time 10 --resolve "${DEMO_DOMAIN}:443:127.0.0.1" \
    "https://${DEMO_DOMAIN}/health" >/dev/null && \
    curl -fsS --max-time 10 --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" \
    "https://${OPERATOR_DOMAIN}/zalo" >/dev/null && \
    [[ "$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
      --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" \
      "https://${OPERATOR_DOMAIN}/zalo/status")" == '401' ]] && \
    curl -fsS --max-time 10 --resolve "${FLOWISE_DOMAIN}:443:127.0.0.1" \
    "https://${FLOWISE_DOMAIN}/api/v1/ping" >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Public HTTPS smoke test that bai." >&2
    exit 1
  fi
  sleep 2
done
echo "Public HTTPS healthy: https://${DEMO_DOMAIN} | https://${OPERATOR_DOMAIN}/zalo | https://${FLOWISE_DOMAIN}"
