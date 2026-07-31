#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-ultty}"
cd "${APP_DIR}"

if [[ ! -s .runtime/secrets.env ]]; then
  echo "Thieu .runtime/secrets.env; chay render-secrets.sh truoc." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml)

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
"${COMPOSE[@]}" up -d api web gateway
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
  -e PILOT_BASE_URL=http://gateway:8080 \
  bootstrap node deploy/netviet/smoke-test.mjs)"
echo "${smoke_output}"
smoke_order_id="$(sed -n 's/.*SMOKE_ORDER_ID=//p' <<<"${smoke_output}" | tail -n 1)"
if [[ ! "${smoke_order_id}" =~ ^[0-9a-f-]{36}$ ]]; then
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
  -e PILOT_BASE_URL=http://gateway:8080 \
  -e "VERIFY_ORDER_ID=${smoke_order_id}" \
  bootstrap node deploy/netviet/smoke-test.mjs
echo "Stack zalo-ultty da healthy tai 127.0.0.1:8080."
