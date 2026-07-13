#!/bin/bash
# =============================================================================
# Khoi dong 2 tien trinh trong 1 container cho demo HF Spaces:
#   - API (NestJS)  : cong noi bo $PORT (mac dinh 3001) — mock/memory, khong dich vu ngoai
#   - Web (Next.js) : cong CONG KHAI $WEB_PORT (mac dinh 7860) — reverse-proxy API qua rewrites
#
# Neu MOT trong hai chet -> kill ca hai + thoat (de HF khoi dong lai container).
# =============================================================================
set -eu

: "${PORT:=3001}"
: "${WEB_PORT:=7860}"

cd /app

echo "[start] API (NestJS) tren cong ${PORT} — PARSER_MODE=${PARSER_MODE:-mock} CHANNEL_MODE=${CHANNEL_MODE:-mock} PERSISTENCE=${PERSISTENCE:-memory}"
node apps/api/dist/main.js &
API_PID=$!

echo "[start] Web (Next.js) tren cong ${WEB_PORT} (0.0.0.0) — reverse-proxy API noi bo"
# Goi next truc tiep (script 'start' cua web hardcode -p 3000 nen KHONG dung duoc).
# next start doc .next trong thu muc apps/web.
apps/web/node_modules/.bin/next start apps/web -p "${WEB_PORT}" -H 0.0.0.0 &
WEB_PID=$!

# Neu 1 tien trinh thoat -> don dep tien trinh con lai.
terminate() {
  kill "${API_PID}" "${WEB_PID}" 2>/dev/null || true
}
trap terminate INT TERM

# Cho tien trinh dau tien ket thuc (bash >= 4.3).
wait -n
EXIT_CODE=$?
echo "[start] Mot tien trinh da thoat (code=${EXIT_CODE}) -> dung ca hai."
terminate
exit "${EXIT_CODE}"
