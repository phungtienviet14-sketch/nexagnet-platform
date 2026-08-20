#!/bin/bash
set -euo pipefail

# Cac script van hanh tac dong len mot STACK (mot thu muc, mot compose project, mot bo volume),
# khong phai len mot khach. Voi dev/production STACK_SLUG == TENANT_SLUG nen khong co gi doi.
STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
EDGE_DIR="${EDGE_DIR:-/srv/netviet/edge}"
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

"${COMPOSE[@]}" pull postgres flowise
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
# GIEO NGUON SU THAT tu goi khach — CHI khi Postgres con rong.
# Voi PERSISTENCE=prisma, KnowledgeService nap snapshot tu DB va bo qua SEED trong bo nho, nen mot
# stack MOI len voi danh muc rong: parser khong co san pham de doi chieu va tin dat hang mau cua
# smoke bi phan loai 'khac'. Script tu bo qua khi DB da co du lieu, nen deploy lai khong bao gio
# ghi de thu Sale da sua qua /admin.
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  node deploy/netviet/seed-tenant-knowledge.mjs
# Always recreate the application processes before injecting a smoke message. Pilot GĐ1 khoi dong
# lai voi AUTO_SEND=on; smoke-test.mjs nhan ra kenh Zalo that va TUYET DOI khong approve fixture,
# nen khong co tin thu nao bi gui vao nhom that.
"${COMPOSE[@]}" up -d --no-deps --force-recreate api web
"${COMPOSE[@]}" ps

# NAP LAI EDGE, KHONG DUNG LAI. Manh cau hinh cua khach nay vua duoc ghi lai, ma Caddy khong tu
# theo doi tep bind-mount. `caddy reload` doi cau hinh tai cho, nen cac khach KHAC dang duoc phuc vu
# khong bi rot ket noi chi vi mot khach deploy — dieu se xay ra neu dung `restart`.
EDGE_COMPOSE=(docker compose --env-file "${EDGE_DIR}/.runtime/caddy.env" -f "${EDGE_DIR}/compose.yaml")

# EDGE DI NGUOC VAO MANG RIENG CUA KHACH, chu khong keo khach ra mot mang dung chung.
#
# Duong nguoc lai (noi api/web/flowise vao mot mang chung) da duoc thu va HONG: Docker tu dang ky
# TEN SERVICE lam alias DNS tren MOI mang container tham gia, nen tren mang chung ca hai khach deu
# tra loi cho cung cai ten `api`/`web`/`flowise`. Api cua khach nay phan giai `flowise` ra HAI dia
# chi roi noi nham sang Flowise cua khach kia (17/08/2026, Flowise HTTP 404) — vua sai dia chi, vua
# cho container cua hai khach goi thang duoc sang nhau.
#
# Noi tu phia edge thi moi khach van dong kin trong mang cua ho; chi mot minh edge bac qua, va no
# goi tung khach bang alias mang slug. Buoc nay phai chay TRUOC `caddy reload` + vong doi suc khoe
# ben duoi: ca hai deu di xuyen edge, ma edge chua noi vao mang khach thi khong toi duoc api.
edge_gateway="$("${EDGE_COMPOSE[@]}" ps -q gateway | head -n 1)"
if [[ -z "${edge_gateway}" ]]; then
  echo "Khong tim thay container gateway cua edge — khong noi duoc vao mang khach." >&2
  exit 1
fi
# Da noi roi thi `network connect` bao loi; day la buoc idempotent nen nuot loi do.
docker network connect "zalo-${STACK_SLUG}_backend" "${edge_gateway}" 2>/dev/null || true
# Nap lai la duong NHANH; dung lai la duong DUNG khi nap lai khong the thanh cong.
#
# `docker compose up -d` KHONG dung lai container chi vi noi dung mot tep bind-mount doi, nen khi
# chinh Caddyfile cua edge thay doi thi tien trinh dang chay van la ban cu. Neu ban cu do khong co
# admin endpoint thi `caddy reload` khong co cho de POST cau hinh len va deploy chet — dung kieu
# hong da gap hai lan ngay 15-16/08/2026 khi bat admin endpoint lan dau.
#
# Nen: thu reload truoc (khach khac khong rot ket noi), that bai thi dung lai edge. Dung lai co lam
# gian doan ngan MOI khach, nhung no chi xay ra khi chinh cau hinh edge doi — khong phai moi lan
# mot khach deploy.
if ! "${EDGE_COMPOSE[@]}" exec -T gateway caddy reload --config /etc/caddy/Caddyfile; then
  echo "caddy reload that bai -> dung lai edge de nap cau hinh moi." >&2
  "${EDGE_COMPOSE[@]}" up -d --force-recreate gateway
fi

# CHO API CUA KHACH NAY SAN SANG — khong duoc bo buoc nay.
#
# Truoc khi tach edge, vong doi ben duoi go vao `127.0.0.1:8080/health`, ma cong do khi ay proxy
# THANG vao api; doi edge khoe cung chinh la doi api khoe. Nay :8080 chi con la suc khoe cua RIENG
# edge va tra 200 ngay lap tuc, nen neu chi giu vong do thi khong con gi chan smoke test chay khi
# api vua bi recreate va chua boot xong — smoke test da that bai dung kieu do (502 sau 6 giay,
# 16/08/2026). api con phai chay `prisma migrate deploy` roi mo Nest nen mat vai chuc giay.
for attempt in {1..60}; do
  if curl -fsS --max-time 5 --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" \
    "https://${OPERATOR_DOMAIN}/health" >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "API cua khach ${STACK_SLUG} khong healthy sau 5 phut." >&2
    "${COMPOSE[@]}" logs --tail=100 api >&2
    exit 1
  fi
  sleep 5
done

for attempt in {1..60}; do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/health >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Edge khong healthy sau 2 phut." >&2
    "${EDGE_COMPOSE[@]}" logs --tail=100 gateway >&2
    exit 1
  fi
  sleep 2
done
smoke_output="$("${COMPOSE[@]}" --profile tools run --rm --no-deps \
  -T \
  -e "PILOT_BASE_URL=https://${OPERATOR_DOMAIN}" \
  -e "CHANNEL_MODE=${channel_mode}" \
  bootstrap node --input-type=module - < smoke-test.mjs)"
echo "${smoke_output}"

# GOI KHACH CHUA CO TIN NHAN MAU -> smoke khong tao ra don nao, nen khong co gi de kiem lai sau
# restart. Khong dung cho deploy chet o day: mot khach vua dung goi (chua co SKU/dai ly) van phai
# len duoc ha tang thi nguoi ta moi bat dau nhap nguon su that vao duoc.
#
# Nhung phai NOI TO ra log rang cong kiem tra duong dat hang da bi bo qua: mot lan deploy xanh ma
# im lang se bi doc nham la "da kiem het".
if grep -q 'SMOKE_SKIPPED_ORDER_PATH=1' <<<"${smoke_output}"; then
  echo "CANH BAO: khach ${STACK_SLUG} chua khai bao 'smoke' trong tenant.json — lan deploy nay" >&2
  echo "KHONG chung minh duoc duong dat hang (parse -> tinh gia -> duyet -> gui) chay dung." >&2
  echo "Stack zalo-${STACK_SLUG} da healthy sau edge (MOI kiem duoc phan ha tang)."
else
  smoke_order_id="$(sed -n 's/.*SMOKE_ORDER_ID=//p' <<<"${smoke_output}" | tail -n 1)"
  smoke_order_id="${smoke_order_id%%;*}"
  smoke_order_status="$(sed -n 's/.*SMOKE_ORDER_STATUS=//p' <<<"${smoke_output}" | tail -n 1)"
  if [[ ! "${smoke_order_id}" =~ ^[0-9a-f-]{36}$ ]] || \
    [[ ! "${smoke_order_status}" =~ ^(pending_review|needs_edit|sent)$ ]]; then
    echo "Khong lay duoc order id tu pilot smoke test." >&2
    exit 1
  fi

  "${COMPOSE[@]}" restart api
  # Kiem qua chinh hostname cua khach nay, khong qua 127.0.0.1:8080 nhu truoc: :8080 gio la suc khoe
  # cua RIENG edge, no xanh ke ca khi api cua khach nay chet.
  for attempt in {1..60}; do
    if curl -fsS --max-time 5 --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" \
      "https://${OPERATOR_DOMAIN}/health" >/dev/null; then
      break
    fi
    if [[ "${attempt}" -eq 60 ]]; then
      echo "API khong healthy sau restart." >&2
      "${COMPOSE[@]}" logs --tail=100 api >&2
      exit 1
    fi
    sleep 2
  done
  "${COMPOSE[@]}" --profile tools run --rm --no-deps \
    -T \
    -e "PILOT_BASE_URL=https://${OPERATOR_DOMAIN}" \
    -e "CHANNEL_MODE=${channel_mode}" \
    -e "VERIFY_ORDER_ID=${smoke_order_id}" \
    -e "VERIFY_ORDER_STATUS=${smoke_order_status}" \
    bootstrap node --input-type=module - < smoke-test.mjs
  echo "Stack zalo-${STACK_SLUG} da healthy sau edge."
fi

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
