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

# --- TIN HIEU DEPLOY -----------------------------------------------------------------------------
# Bon tang, bon cau tra loi khac nhau (`deploy-signals.mjs` la noi phan xu).
#
# Truoc 26/08/2026 ca tep nay la MOT khoi `set -euo pipefail`: mot lan model phan loai tin mau
# thanh `khac` cho ra dung mot dau X do nhu khi image chua len. Nguoi truc doc mai thanh "chac lai
# model thoi" — va do la cach mot lan do THAT bi bo qua.
#
# Bay gio: moi giai doan tu khai bao minh la tang nao, va cai bay `EXIT` phat ra tin hieu that bai
# CHO CHINH GIAI DOAN DANG CHAY. Nho vay mot loi o cho CHUA duoc gan tin hieu van roi dung tang,
# thay vi bien mat.
DEPLOY_SIGNAL_STAGE='rollout'
DEPLOY_SIGNAL_REASON='ROLLOUT_STAGE_FAILED'

emit_signal() {
  printf '##DEPLOY-SIGNAL## {"layer":"%s","status":"%s","reason":"%s","detail":%s}\n' \
    "$1" "$2" "$3" "${4:-null}"
}

stage() {
  DEPLOY_SIGNAL_STAGE="$1"
  DEPLOY_SIGNAL_REASON="$2"
}

# `$?` trong bay EXIT la ma thoat that. Thoat 0 -> khong phat gi (moi tang da tu bao `pass`).
on_deploy_exit() {
  local code=$?
  [[ "${code}" -eq 0 ]] && return 0
  emit_signal "${DEPLOY_SIGNAL_STAGE}" fail "${DEPLOY_SIGNAL_REASON}" \
    "{\"exitCode\":${code},\"stack\":\"${STACK_SLUG}\"}"
  return 0
}
trap on_deploy_exit EXIT

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
# DANH TINH BAN PHAT HANH — nguon de doi chieu o cong ROLLOUT ben duoi.
APP_IMAGE_VALUE="$(runtime_value APP_IMAGE)"
FLOWISE_IMAGE_VALUE="$(runtime_value FLOWISE_IMAGE)"
RELEASE_SHA_VALUE="$(runtime_value RELEASE_GIT_SHA)"
# SHA MA HOP DONG TAT DINH DUOC PHEP DOI HOI. De TRONG khi khong biet — duong goi tay tren VM dat
# SHA toan so 0, va bat mot bai kiem doi chieu voi gia tri do se cho ra mot mau do vo nghia. Bat
# bien 7 (ci-cd.md) chi cam LAM YEU cong kiem; day khong phai lam yeu, day la khong dat ra mot
# cau hoi ma tang goi khong tra loi duoc.
if [[ "${RELEASE_SHA_VALUE}" =~ ^[a-f0-9]{40}$ && "${RELEASE_SHA_VALUE}" != 0000000000000000000000000000000000000000 ]]; then
  EXPECTED_RELEASE_SHA_VALUE="${RELEASE_SHA_VALUE}"
else
  EXPECTED_RELEASE_SHA_VALUE=''
fi
for domain in "${DEMO_DOMAIN}" "${OPERATOR_DOMAIN}" "${FLOWISE_DOMAIN}"; do
  if [[ ! "${domain}" =~ ^[a-z0-9.-]+$ ]]; then
    echo "Runtime domain khong hop le; khong chay smoke." >&2
    exit 65
  fi
done

# ================================================================================================
# TANG 1 — ROLLOUT: ban phat hanh nay da thuc su duoc dat len chua.
# ================================================================================================

stage rollout ROLLOUT_DB_NOT_READY
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

stage rollout ROLLOUT_FLOWISE_NOT_READY
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

stage rollout ROLLOUT_BOOTSTRAP_FAILED
"${COMPOSE[@]}" --profile tools run --rm bootstrap
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  node deploy/flowise/contract-test.mjs
stage rollout ROLLOUT_MIGRATION_FAILED
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma
stage rollout ROLLOUT_AUTH_BOOTSTRAP_FAILED
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  node deploy/netviet/bootstrap-auth-user.mjs
# GIEO NGUON SU THAT tu goi khach — CHI khi Postgres con rong.
# Voi PERSISTENCE=prisma, KnowledgeService nap snapshot tu DB va bo qua SEED trong bo nho, nen mot
# stack MOI len voi danh muc rong: parser khong co san pham de doi chieu va tin dat hang mau cua
# smoke bi phan loai 'khac'. Script tu bo qua khi DB da co du lieu, nen deploy lai khong bao gio
# ghi de thu Sale da sua qua /admin.
stage rollout ROLLOUT_SEED_FAILED
"${COMPOSE[@]}" --profile tools run --rm --no-deps bootstrap \
  node deploy/netviet/seed-tenant-knowledge.mjs
# WORKFLOW ENGINE — dung TRUOC `api`, va CHI khi cong tac bat.
#
# `--profile workflow` la thu duy nhat lam cum Hatchet ton tai. Stack khong bat thi doan nay khong
# chay va compose tham chi khong biet toi 6 service do — production `zalo-ultty` giu nguyen 5
# container nhu truoc.
#
# VI SAO TRUOC `api`: api la ben GUI VIEC DI. Neu api len truoc engine thi `WorkflowScheduler` tick
# moi 5 giay va that bai vai lan roi moi thanh cong. Do khong lam hong du lieu (hang outbox con
# nguyen, dispatcher co lease) nhung no do mot vet loi vao log ngay lan deploy, va nguoi truc se
# di tim mot su co khong co that.
#
# KHONG dung `--force-recreate` o day: worker dang phuc vu run cua phien ban no, va huy no giua
# chung la dung che do hong ma `worker-main.ts` duoc tach ra de tranh. Nang phien ban khuon di
# theo thu tuc REGISTER -> ACTIVATE -> DRAIN -> DEACTIVATE -> REMOVE cua runbook §2, khong theo
# mot lan deploy.
workflow_engine="$(runtime_value WORKFLOW_ENGINE)"
if [[ "${workflow_engine}" == 'on' ]]; then
  stage rollout ROLLOUT_WORKFLOW_ENGINE_FAILED
  if [[ -z "$(runtime_value WORKFLOW_ENGINE_TOKEN)" ]]; then
    echo "WORKFLOW_ENGINE=on nhung secrets.env chua co WORKFLOW_ENGINE_TOKEN." >&2
    echo "Chay bootstrap-workflow-engine.sh (duc token) roi render-secrets.sh, roi chay lai." >&2
    exit 78
  fi
  # `--wait` doi HEALTHY chu khong chi doi "da tao". Worker co `start_period: 90s` nen han 300s la
  # bien an toan quanh lan do te nhat cua §29 (38 s cho ca tien trinh len), khong phai mot con so
  # tron cho dep.
  #
  # DANH SACH LIET KE TUONG MINH, va moi worker MOI phai duoc them vao day. Mot service co trong
  # `compose.yaml` nhung vang o dong nay se KHONG BAO GIO duoc khoi dong — deploy van xanh, va
  # khuon cua no khong co ai phuc vu. Cung ho voi cai bay `WORKFLOW_WORKER_TEMPLATE` mac dinh:
  # hong o TANG CAU HINH chu khong o tang code, nen khong bo test don le nao thay duoc.
  "${COMPOSE[@]}" --profile workflow up -d --wait --wait-timeout 300 \
    hatchet-engine hatchet-dashboard workflow-worker-v1 workflow-worker-sales-handoff-v1
  "${COMPOSE[@]}" --profile workflow ps
fi

# CUM QUAN SAT — dung TRUOC `api`, va CHI khi cong tac bat.
#
# VI SAO TRUOC `api`: `api` la ben GUI telemetry di. Collector chua len thi moi lo span dau tien
# roi vao hang doi cua exporter roi bi bo khi het han — tuc dung nhung lo span cua LAN KHOI DONG,
# von la luc de hong nhat va cung la luc nguoi ta muon nhin nhat.
#
# `--wait` doi HEALTHY: ClickHouse phai san sang truoc khi collector thu ghi, khong thi collector
# quay vong retry va lo dau tien van mat.
#
# QUAN SAT KHONG DUOC LA DIEU KIEN DE NGHIEP VU CHAY. Neu cum nay khong len, `api` van phai len —
# nen doan nay KHONG dung `stage rollout` (tuc khong bien mot su co quan sat thanh mot lan deploy
# do). No bao that bai ra log va di tiep; cong ROLLOUT/HEALTH ben duoi van do neu ung dung hong.
observability_stack="$(runtime_value OTEL_TRACING)"
if [[ "${observability_stack}" == 'on' ]]; then
  if "${COMPOSE[@]}" --profile observability up -d --wait --wait-timeout 180 \
    clickhouse otel-collector; then
    "${COMPOSE[@]}" --profile observability ps
    # SUC KHOE CUA COLLECTOR DOC TU MOT CONTAINER KHAC.
    #
    # `otel-collector` KHONG co `healthcheck:` cua Docker vi anh cua no dung tu `scratch`: chi co
    # mot tep nhi phan, khong shell, khong `wget`. Nen `up --wait` o tren chi chung minh container
    # DANG CHAY, khong chung minh no da nap duoc cau hinh — mot cau hinh hong hay mot tep khoa
    # khong doc duoc deu cho ra dung mot container "dang chay" trong vai giay roi restart.
    #
    # `clickhouse` la anh alpine (co busybox `wget`) va nam CUNG mang `data`, nen no la cho doc
    # tu nhien. Hong o day KHONG lam do lan deploy — xem chu thich ngay tren.
    if "${COMPOSE[@]}" --profile observability exec -T clickhouse \
      wget --no-verbose --tries=1 --spider http://otel-collector:13133/ >/dev/null 2>&1; then
      echo "cum quan sat: collector tra loi tren cong suc khoe 13133." >&2
    else
      echo "CANH BAO: collector dang chay nhung cong suc khoe 13133 khong tra loi." >&2
      echo "Xem: docker compose --profile observability logs otel-collector" >&2
    fi
  else
    echo "CANH BAO: cum quan sat khong len duoc — ung dung van duoc trien khai." >&2
    echo "Span se bi bo tai exporter; xem 'docker compose --profile observability logs'." >&2
  fi
fi

# Always recreate the application processes before injecting a smoke message. Pilot GĐ1 khoi dong
# lai voi AUTO_SEND=on; smoke-test.mjs nhan ra kenh Zalo that va TUYET DOI khong approve fixture,
# nen khong co tin thu nao bi gui vao nhom that.
stage rollout ROLLOUT_APP_RECREATE_FAILED
"${COMPOSE[@]}" up -d --no-deps --force-recreate api web
"${COMPOSE[@]}" ps

# CONG ROLLOUT: container dang chay co DUNG image cua ban phat hanh nay khong.
#
# `docker inspect .Image` tra ID cua image ma container DANG chay, con `docker image inspect .Id`
# tra ID cua image ma compose LE RA phai chay. Hai so nay lech nhau chinh la truong hop "deploy
# bao thanh cong nhung ban cu van dang phuc vu" — thu ma khong mot phep kiem suc khoe nao bat duoc,
# vi ban cu cung khoe.
running_image_id() {
  local service="$1" container
  container="$("${COMPOSE[@]}" ps -q "${service}" 2>/dev/null | head -n 1)"
  [[ -n "${container}" ]] || return 1
  docker inspect --format '{{.Image}}' "${container}"
}

rollout_mismatch=''
for pair in "api:${APP_IMAGE_VALUE}" "web:${APP_IMAGE_VALUE}" "flowise:${FLOWISE_IMAGE_VALUE}"; do
  service="${pair%%:*}"
  expected_ref="${pair#*:}"
  expected_id="$(docker image inspect --format '{{.Id}}' "${expected_ref}" 2>/dev/null || true)"
  observed_id="$(running_image_id "${service}" || true)"
  if [[ -z "${expected_id}" || -z "${observed_id}" || "${expected_id}" != "${observed_id}" ]]; then
    rollout_mismatch="${rollout_mismatch}${service} "
  fi
done
if [[ -n "${rollout_mismatch}" ]]; then
  emit_signal rollout fail RELEASE_DIGEST_MISMATCH \
    "{\"services\":\"${rollout_mismatch% }\",\"expectedAppImage\":\"${APP_IMAGE_VALUE}\"}"
  echo "ROLLOUT: container ${rollout_mismatch}khong chay image cua ban phat hanh nay." >&2
  exit 1
fi

# DANH TINH RELEASE PHAI TOI DUOC TIEN TRINH, khong chi toi dia. `RELEASE_GIT_SHA` di qua
# `render-secrets.sh` VA khoi `environment:` cua compose; thieu mot trong hai thi tien trinh khong
# biet minh dang chay commit nao, va cau hoi "bug nay o commit nao" quay ve phai SSH doc file.
# SHA toan so 0 la gia tri mac dinh cua duong goi tay (deploy-remote.sh) — khong doi chieu.
if [[ "${RELEASE_SHA_VALUE}" =~ ^[a-f0-9]{40}$ && "${RELEASE_SHA_VALUE}" != 0000000000000000000000000000000000000000 ]]; then
  observed_sha="$("${COMPOSE[@]}" exec -T api printenv RELEASE_GIT_SHA 2>/dev/null | tr -d '\r\n' || true)"
  if [[ "${observed_sha}" != "${RELEASE_SHA_VALUE}" ]]; then
    emit_signal rollout fail RELEASE_SHA_MISMATCH \
      "{\"expectedGitSha\":\"${RELEASE_SHA_VALUE}\",\"observedGitSha\":\"${observed_sha:-rong}\"}"
    echo "ROLLOUT: tien trinh api bao SHA '${observed_sha:-rong}', ban phat hanh la '${RELEASE_SHA_VALUE}'." >&2
    exit 1
  fi

  # CHAN THU BA CUA DANH TINH: BAN GHI RELEASE, doc TU TRONG TIEN TRINH.
  #
  # Hai phep kiem tren tra loi "image nao" va "bien moi truong noi gi". Ca hai deu KHONG tra loi
  # duoc cau ma man hinh chan doan dua vao: tep `release.json` ma tien trinh thuc su doc duoc dang
  # noi commit nao. Do la mot duong RIENG — no di qua bind-mount, va mot bind-mount hong (tep chua
  # ton tai luc container khoi dong, hoac `mv` da doi inode sau do) khong lam sai bien moi truong
  # nao ca. Ban truoc 26/08/2026 khong co phep kiem nay, va cung khong co mount de kiem.
  #
  # Phep doc CHAY TRONG CONTAINER, khong phai `sudo cat` tren host: cau hoi la "tien trinh doc
  # duoc gi", va mot phep doc tren host tra loi mot cau khac.
  manifest_path="$("${COMPOSE[@]}" exec -T api printenv RELEASE_MANIFEST_PATH 2>/dev/null | tr -d '\r\n' || true)"
  if [[ -z "${manifest_path}" ]]; then
    emit_signal rollout fail RELEASE_MANIFEST_MISSING \
      "{\"stack\":\"${STACK_SLUG}\",\"detail\":\"api khong co RELEASE_MANIFEST_PATH\"}"
    echo 'ROLLOUT: tien trinh api khong duoc chi duong toi release.json.' >&2
    exit 1
  fi
  # `node -e` chu khong phai `grep`: manifest la JSON, va mot phep boc tach bang bieu thuc chinh
  # quy se im lang tra ve rac khi khuon doi. Image nao cung co `node` — chinh no chay ung dung.
  manifest_sha="$("${COMPOSE[@]}" exec -T api node -e \
    'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.env.RELEASE_MANIFEST_PATH,"utf8")).gitSha??""))}catch{process.stdout.write("")}' \
    2>/dev/null | tr -d '\r\n' || true)"
  if [[ -z "${manifest_sha}" ]]; then
    emit_signal rollout fail RELEASE_MANIFEST_MISSING \
      "{\"stack\":\"${STACK_SLUG}\",\"manifestPath\":\"${manifest_path}\"}"
    echo "ROLLOUT: api khong doc duoc '${manifest_path}' — mount hong, hoac manifest bi ghi sau khi container len." >&2
    exit 1
  fi
  if [[ "${manifest_sha}" != "${RELEASE_SHA_VALUE}" ]]; then
    # MA LY DO RIENG. Gop vao `RELEASE_SHA_MISMATCH` se day nguoi truc di sua bien moi truong —
    # trong khi thu hong o day la BAN GHI, va cach sua hoan toan khac.
    emit_signal rollout fail RELEASE_IDENTITY_MISMATCH \
      "{\"expectedGitSha\":\"${RELEASE_SHA_VALUE}\",\"manifestGitSha\":\"${manifest_sha}\",\"manifestPath\":\"${manifest_path}\"}"
    echo "ROLLOUT: manifest trong container noi '${manifest_sha}', ban phat hanh la '${RELEASE_SHA_VALUE}'." >&2
    exit 1
  fi
fi
emit_signal rollout pass ROLLOUT_MATCHES_RELEASE \
  "{\"stack\":\"${STACK_SLUG}\",\"releaseSha\":\"${RELEASE_SHA_VALUE}\",\"identitySource\":\"manifest\"}"

# ================================================================================================
# TANG 2 — HEALTH: ban vua len co song khong.
# ================================================================================================

stage health EDGE_ROUTE_FAILED

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
stage health API_HEALTH_FAILED
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

stage health EDGE_HEALTH_FAILED
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

# WORKER BAT BUOC. `--wait` o tren chi chung minh chung LEN duoc; buoc nay chung minh chung con
# song sau khi api da khoi dong va bat dau gui viec. Mot worker chet lang le nghia la khuon cua no
# khong co ai phuc vu — deploy van xanh, va viec ban giao nam trong hang doi khong ai biet.
if [[ "${workflow_engine}" == 'on' ]]; then
  stage health WORKFLOW_WORKER_UNHEALTHY
  for worker in workflow-worker-v1 workflow-worker-sales-handoff-v1; do
    worker_container="$("${COMPOSE[@]}" --profile workflow ps -q "${worker}" | head -n 1)"
    worker_state=''
    if [[ -n "${worker_container}" ]]; then
      worker_state="$(docker inspect --format '{{.State.Status}}' "${worker_container}" 2>/dev/null || true)"
    fi
    if [[ "${worker_state}" != 'running' ]]; then
      emit_signal health fail WORKFLOW_WORKER_UNHEALTHY \
        "{\"service\":\"${worker}\",\"state\":\"${worker_state:-vang-mat}\"}"
      echo "Worker ${worker} khong con chay (${worker_state:-vang mat})." >&2
      exit 1
    fi
  done
fi

# Public endpoints/UI shell phai reachable qua TLS, trong khi protected API phai tu choi anonymous.
#
# NANG LUC CUA KHACH QUYET DINH ROUTE NAO TON TAI. `/zalo` do nang luc `messaging` phuc vu; khach
# khong bat no thi Next render notFound, va `curl -fsS` that bai — DUNG RA phai vay. Deploy WATA
# 21/08/2026 chet dung o cong nay du ca stack da healthy va smoke da qua.
#
# Khong doc duoc goi khach -> GIU NGUYEN doi hoi cu (bat bien 7: khong lam yeu cong kiem).
if caps="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1],encoding="utf-8")).get("capabilities") or []))' "${APP_DIR}/tenant-pack/tenant.json" 2>/dev/null)"; then
  has_messaging=0
  [[ " ${caps} " == *" messaging "* ]] && has_messaging=1
else
  echo "Khong doc duoc nang luc tu tenant-pack — van doi day du cong /zalo." >&2
  has_messaging=1
fi

public_gates_ok() {
  curl -fsS --max-time 10 --resolve "${DEMO_DOMAIN}:443:127.0.0.1" "https://${DEMO_DOMAIN}/health" >/dev/null || return 1
  curl -fsS --max-time 10 --resolve "${FLOWISE_DOMAIN}:443:127.0.0.1" "https://${FLOWISE_DOMAIN}/api/v1/ping" >/dev/null || return 1
  if [[ "${has_messaging}" -eq 1 ]]; then
    curl -fsS --max-time 10 --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" "https://${OPERATOR_DOMAIN}/zalo" >/dev/null || return 1
    local status
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" "https://${OPERATOR_DOMAIN}/zalo/status")"
    [[ "${status}" == '401' ]] || return 1
  else
    # Khach khong co kenh van phai co VO DIEU HANH phuc vu qua TLS. Kiem trang goc thay cho /zalo:
    # bo han cong nay se cho mot khach khong-messaging deploy xanh ma khong ai kiem gi ca.
    curl -fsS --max-time 10 --resolve "${OPERATOR_DOMAIN}:443:127.0.0.1" "https://${OPERATOR_DOMAIN}/" >/dev/null || return 1
  fi
  return 0
}

stage health PUBLIC_ROUTE_FAILED
for attempt in {1..60}; do
  if public_gates_ok; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Public HTTPS smoke test that bai." >&2
    exit 1
  fi
  sleep 2
done
operator_probe="/zalo"
[[ "${has_messaging}" -eq 1 ]] || operator_probe="/"
echo "Public HTTPS healthy: https://${DEMO_DOMAIN} | https://${OPERATOR_DOMAIN}${operator_probe} | https://${FLOWISE_DOMAIN}"
emit_signal health pass RUNTIME_HEALTHY \
  "{\"stack\":\"${STACK_SLUG}\",\"operatorProbe\":\"${operator_probe}\"}"

# ================================================================================================
# TANG 3 — DETERMINISTIC RUNTIME SMOKE: hop dong nen tang con dung khong (KHONG co LLM).
# ================================================================================================

stage deterministicSmoke DETERMINISTIC_HARNESS_ERROR
deterministic_log="$(mktemp)"
run_deterministic_smoke() {
  local smoke_phase="$1" smoke_baseline="$2"
  "${COMPOSE[@]}" --profile tools run --rm --no-deps \
    -T \
    -e "PILOT_BASE_URL=https://${OPERATOR_DOMAIN}" \
    -e "DETERMINISTIC_PHASE=${smoke_phase}" \
    -e "DETERMINISTIC_BASELINE=${smoke_baseline}" \
    -e "EXPECTED_RELEASE_SHA=${EXPECTED_RELEASE_SHA_VALUE}" \
    bootstrap node --input-type=module - < deterministic-smoke.mjs
}

# `tee` chu khong phai command substitution: khi bai kiem that bai no DA phat ra mot dong tin hieu
# co ma ly do cu the, va mot `$(...)` chet giua chung se nuot mat dong do — de lai dung cai ly do
# chung chung ma milestone nay sinh ra de xoa bo.
if ! run_deterministic_smoke pre '' | tee "${deterministic_log}"; then
  echo "Hop dong runtime tat dinh khong dat (truoc khi khoi dong lai)." >&2
  exit 1
fi
deterministic_baseline="$(sed -n 's/^DETERMINISTIC_BASELINE=//p' "${deterministic_log}" | tail -n 1)"

# KHOI DONG LAI ROI KIEM LAI. Day la phep do BEN VUNG: du lieu phai con nguyen sau khi tien trinh
# chet va len lai. Truoc day phep do nay bam vao mot don do LLM tao ra (`VERIFY_ORDER_ID`), nen mot
# lan model doan sai lam mat luon bang chung ve tinh ben vung.
"${COMPOSE[@]}" restart api
stage health API_HEALTH_FAILED
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

stage deterministicSmoke DETERMINISTIC_HARNESS_ERROR
if ! run_deterministic_smoke post-restart "${deterministic_baseline}" | tee "${deterministic_log}"; then
  echo "Hop dong runtime tat dinh khong dat (sau khi khoi dong lai)." >&2
  exit 1
fi
echo "Stack zalo-${STACK_SLUG} da healthy sau edge."

# ================================================================================================
# TANG 4 — LIVE AI SMOKE: model/provider co dat fixture khong.
#
# TIN HIEU MEM. Tang nay KHONG duoc lam do lan deploy: ba tang tren da chung minh ban phat hanh
# len dung, song, va con dung hop dong. Mot lan model phan loai sai la mot su that ve MODEL, va no
# duoc bao rieng — `deploy-signals.mjs` phan xu, GitHub Actions co mot buoc rieng mang dung ten do.
# ================================================================================================

stage liveAiSmoke LIVE_AI_HARNESS_ERROR
smoke_output="$(mktemp)"
# `|| true`: `DEPLOY_SIGNAL_SOFT=1` da lam smoke-test.mjs thoat 0 o moi ket qua cua model, nhung
# mot loi harness (het bo nho, container khong dung duoc) van thoat khac 0 — va ke ca luc do, lan
# deploy nay VAN da duoc chung minh boi ba tang tren.
"${COMPOSE[@]}" --profile tools run --rm --no-deps \
  -T \
  -e "PILOT_BASE_URL=https://${OPERATOR_DOMAIN}" \
  -e "CHANNEL_MODE=${channel_mode}" \
  -e "DEPLOY_SIGNAL_SOFT=1" \
  bootstrap node --input-type=module - < smoke-test.mjs 2>&1 | tee "${smoke_output}" || true

# KHONG XANH GIA: smoke chet truoc khi kip phat tin hieu thi tang nay phai duoc ghi la FAIL, khong
# duoc de trong — mot tang `pending` se lam `deploy-signals.mjs` ket luan DEPLOY_SIGNAL_INCOMPLETE.
if ! grep -q '"layer":"liveAiSmoke"' "${smoke_output}"; then
  emit_signal liveAiSmoke fail LIVE_AI_HARNESS_ERROR \
    '{"message":"smoke ket thuc ma khong phat ra tin hieu nao"}'
fi

# GOI KHACH CHUA CO TIN NHAN MAU -> khong co gi de doi chieu voi model. Khong dung cho deploy chet
# o day: mot khach vua dung goi (chua co SKU/dai ly) van phai len duoc ha tang thi nguoi ta moi bat
# dau nhap nguon su that vao duoc. Nhung phai NOI TO ra log rang cong do da bi bo qua.
if grep -q 'SMOKE_SKIPPED_ORDER_PATH=1' "${smoke_output}"; then
  echo "CANH BAO: khach ${STACK_SLUG} chua khai bao 'smoke' trong tenant.json — lan deploy nay" >&2
  echo "KHONG chung minh duoc duong dat hang (parse -> tinh gia -> duyet -> gui) chay dung." >&2
fi

rm -f -- "${deterministic_log}" "${smoke_output}"
