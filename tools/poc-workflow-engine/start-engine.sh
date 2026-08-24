#!/usr/bin/env bash
set -euo pipefail

# DUNG CUM HATCHET CUC BO + DUC TOKEN — dung chung cho CI va cho may dev.
#
# In DUY NHAT token ra stdout. Moi thu khac di ra stderr, nen goi duoc bang:
#
#     export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
#
# ================================================================================================
# VI SAO SCRIPT NAY TON TAI, thay vi mot khoi `run:` viet thang trong ci.yml:
#
# Truoc 24/08/2026, `RUN_WORKFLOW_IT` KHONG xuat hien o bat ky dong nao trong `.github/workflows/`.
# Hau qua do duoc tren merge SHA `302d5b1e`: 24 bai IT cua workflow engine bi bo qua o CA HAI job
# `verify` va `integration` — tuc la "CI xanh" khong noi gi ve engine. Muon dong cai lo do thi CI
# phai dung duoc mot cum Hatchet THAT, va thu tuc dung no khong phai mot dong lenh: postgres ->
# migration -> setup-config (quickstart) -> engine, moi cai mot dieu kien rieng, roi moi duc duoc
# token. Viet trong YAML thi khong ai chay lai duoc tren may minh de xem no hong o dau.
#
# ================================================================================================
# BA HANG SO DUOI DAY KHONG PHAI TUY CHON — chung PHAI khop voi test:
#
#   `apps/api/src/workflow/worker-readiness.int.spec.ts`
#   `apps/api/src/workflow/workflow-recovery.int.spec.ts`
#
# Hai file do goi `docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml
# stop|start hatchet-engine` de MO PHONG ENGINE CHET. Neu CI dung ten project khac hoac file compose
# khac, hai bai do se dieu khien mot project KHONG TON TAI: `docker compose start` im lang khong
# lam gi, engine that van chay, va bai kiem "engine chet roi song lai" se do vi mot ly do khong
# lien quan gi toi code. Doi ba hang so nay phai doi ca hai file test trong CUNG mot commit.
COMPOSE_PROJECT='pocwf'
COMPOSE_FILE='tools/poc-workflow-engine/compose/hatchet.compose.yml'
ENGINE_SERVICE='hatchet-engine'

# Cong ma compose PHAT RA HOST (xem `ports:` trong compose file).
#   7744 -> gRPC cua engine        : worker + dispatcher noi vao day
#   8744 -> REST API (container `hatchet-dashboard` chay HAI tien trinh: `hatchet-api` + frontend)
#
# 8744 KHONG phai chi de xem dashboard cho vui: `engineReadClient()` trong
# `apps/api/src/workflow/__tests__/workflow-it.harness.ts` doc NGUOC trang thai run qua REST
# (`runs.list`). Chin bai cua `workflow-privacy-engine-read.int.spec.ts` la doc nguoc. Dung cum ma
# bo `hatchet-dashboard` se lam chung do voi mot loi mang kho hieu.
ENGINE_GRPC_PORT=7744
ENGINE_REST_PORT=8744

# Worker mat 6-38 giay de dang ky xong (do 22-24/08/2026, bien dong lon). Cum engine tren mot
# runner nguoi — keo image roi migrate — con lau hon the. Thoi han rong la CO Y: dat chat thi mot
# lan runner cham se hien ra thanh "engine hong" va nguoi doc log se di tim nham cho.
READY_TIMEOUT_SECONDS=300

log() { printf '%s\n' "$*" >&2; }

compose() {
  # MSYS_NO_PATHCONV: Git Bash tren Windows doi `/hatchet/config` thanh mot duong dan Windows
  # truoc khi giao cho docker. Vo hai tren Linux, bat buoc tren may dev.
  MSYS_NO_PATHCONV=1 docker compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" "$@"
}

# ------------------------------------------------------------------ (1) DUNG CUM
#
# `up -d` TRAN (khong `--wait`) la co chu dich. `depends_on` trong compose file da mang du dieu
# kien — postgres `service_healthy`, migration va setup-config `service_completed_successfully` —
# nen `up -d` da chan cho toi khi quickstart chay xong. Con `--wait` thi ung xu voi container mot
# lan (migration, setup-config) khac nhau giua cac ban compose; do vao no la dat cuoc vao phien ban
# compose cua runner. Duoi day tu do lay do san sang bang cong va bang du lieu, khong bang niem tin.
log "Dung cum Hatchet (${COMPOSE_PROJECT})..."
compose up -d

# ------------------------------------------------------------------ (2) DOI CONG MO
wait_for_tcp() {
  local port="$1" what="$2" deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  while ! (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      log "HET GIO ${READY_TIMEOUT_SECONDS}s: ${what} khong mo cong ${port}."
      compose ps -a >&2 || true
      compose logs --tail 50 "${ENGINE_SERVICE}" >&2 || true
      exit 1
    fi
    sleep 2
  done
  exec 3<&- 2>/dev/null || true
  log "  cong ${port} (${what}) da mo."
}

wait_for_tcp "${ENGINE_GRPC_PORT}" 'gRPC engine'
wait_for_tcp "${ENGINE_REST_PORT}" 'REST API (doc nguoc run)'

# ------------------------------------------------------------------ (3) TENANT ID — DOC, khong go cung
#
# Cung ly le voi `deploy/netviet/bootstrap-workflow-engine.sh`: quickstart gieo hai tenant
# (`internal` va `default`); `default` la cai khach dung. UUID do duoc la
# `707d0855-80ab-4e1f-a156-f1c4546cbf52` va giu nguyen qua nhieu lan xoa volume — nhung go cung
# mot UUID cua ben thu ba la dat cuoc vao mot chi tiet ho khong hua se giu. Doc theo `slug` thi ban
# Hatchet sau doi UUID van chay; con neu ho doi ca `slug` thi script DUNG HAN thay vi duc token cho
# nham tenant.
TENANT_ID="$(compose exec -T postgres \
  psql -U hatchet -d hatchet -tAc "select id from \"Tenant\" where slug = 'default'" \
  | tr -d '[:space:]')"

if [[ ! "${TENANT_ID}" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  log "Khong doc duoc tenant 'default' cua engine (nhan duoc: '${TENANT_ID}')."
  log "Xem quickstart da chay xong chua: docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} logs setup-config"
  exit 1
fi

# ------------------------------------------------------------------ (4) DUC TOKEN
#
# ⚠️ KHAC HAN `deploy/netviet/bootstrap-workflow-engine.sh`, va khac biet do la CO CHU DICH.
#
# Tren VM, duc token lan hai la mot LOI: hai token cung song, khong ai biet cai nao dang duoc dung,
# va worker co the cam mot cai trong khi api cam cai kia — nen script do fail-closed, "da co version
# thi dung han".
#
# O day thi nguoc lai: cum nay SINH RA ROI CHET trong mot lan chay CI (`down -v` o cuoi job), hoac
# la cum POC tren may dev. Khong co ai khac cam token cua no. Bat mot cong idempotent vao day chi
# tao ra mot trang thai an ma khong bao ve dieu gi.
#
# ⛔ DUNG COPY KHOI NAY SANG DUONG PRODUCTION. Duong do da co script rieng, va no fail-closed co ly do.
#
# `grep` loc theo HINH DANG JWT vi lenh con in ca dong thong bao; khong loc thi ta se dua mot dong
# log vao `WORKFLOW_ENGINE_TOKEN` va trieu chung sau do la worker bao token sai ma khong ai hieu vi sao.
log "Duc token cho tenant ${TENANT_ID}..."
TOKEN="$(compose run --rm --no-deps -T setup-config \
  /hatchet/hatchet-admin token create --config /hatchet/config --tenant-id "${TENANT_ID}" 2>/dev/null \
  | tr -d '\r' | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$' | tail -n 1)"

if [[ -z "${TOKEN}" ]]; then
  log "Duc token that bai — lenh khong in ra thu gi co hinh dang JWT ba doan. Chay lai bang tay:"
  log "  docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} run --rm --no-deps setup-config \\"
  log "    /hatchet/hatchet-admin token create --config /hatchet/config --tenant-id ${TENANT_ID}"
  exit 1
fi

log "XONG. Engine nghe tai localhost:${ENGINE_GRPC_PORT} (gRPC) va localhost:${ENGINE_REST_PORT} (REST)."
printf '%s\n' "${TOKEN}"
