#!/bin/bash
set -euo pipefail
umask 077

PROJECT_ID="${GCP_PROJECT_ID:-netviet-host-968934832433}"
APP_IMAGE_VALUE="${APP_IMAGE:?APP_IMAGE is required}"
FLOWISE_IMAGE_VALUE="${FLOWISE_IMAGE:?FLOWISE_IMAGE is required}"
# SLUG KHACH chon GOI KHACH (bang gia, dai ly, chat ID nhom) — no tra loi "phuc vu ai".
# STACK SLUG quyet dinh HA TANG: thu muc stack, ten compose project (=> ten volume), tien to ten
# secret, alias mang tren edge va hostname — no tra loi "chay o dau". Hai thu nay TRUNG NHAU voi
# dev/production (`ultty`), va TACH RA voi moi truong ky thuat (`ultty-gd1-test`), nen mot tenant
# co the co hai stack ma khong stack nao dam vao volume cua stack kia.
# Quy tac duy nhat nam trong deploy/netviet/stack-identity.mjs; o day chi nhan gia tri da suy ra.
# Mot bien sai cho ra mot stack khac hoan toan, nen chan ky tu la.
TENANT_SLUG="${TENANT_SLUG:?TENANT_SLUG is required}"
DEPLOYMENT_ENVIRONMENT="${DEPLOYMENT_ENVIRONMENT:-legacy}"
# Mac dinh = TENANT_SLUG: moi duong goi cu (deploy.ps1, systemd cu) giu nguyen hanh vi.
STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG}}"
[[ "${TENANT_SLUG}" =~ ^[a-z0-9-]+$ ]] || {
  echo "TENANT_SLUG khong hop le: '${TENANT_SLUG}'." >&2
  exit 64
}
[[ "${STACK_SLUG}" =~ ^[a-z0-9-]+$ ]] || {
  echo "STACK_SLUG khong hop le: '${STACK_SLUG}'." >&2
  exit 64
}
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
RUNTIME_DIR="${RUNTIME_DIR:-${APP_DIR}/.runtime}"
EDGE_DIR="${EDGE_DIR:-/srv/netviet/edge}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# GOI KHACH khong di qua file nay. Image khong mang goi nao va cung khong tra slug -> `tenants/`;
# thay vao do deploy.ps1 upload goi cua dung stack nay va compose mount vao api/web bang TENANT_DIR.
PUBLIC_IP_VALUE="${PUBLIC_IP:?PUBLIC_IP is required}"
PUBLIC_IP_LABEL="${PUBLIC_IP_VALUE//./-}"
HOST_SUFFIX="${PUBLIC_IP_LABEL}.sslip.io"

# HOSTNAME PHAI MANG SLUG, neu khong hai khach cung doi mot ten va khach len sau cuop duong cua
# khach len truoc.
#
# Ngoai le CO CHU DICH cho khach "chinh" (PRIMARY_TENANT): ho giu ten TRAN lam ten chinh thuc.
# Ly do khong phai tham my — `OPERATOR_DOMAIN` di thang vao `PUBLIC_BASE_URL`, va Zalo TU tai anh
# catalog ve tu URL do. Doi ten mien cua khach dang chay se lam chet anh trong moi tin da gui.
# Khach chinh vi the duoc phuc vu o CA HAI ten; khach moi chi co ten mang slug.
DEMO_DOMAIN="demo-${STACK_SLUG}.${HOST_SUFFIX}"
OPERATOR_DOMAIN="operator-${STACK_SLUG}.${HOST_SUFFIX}"
FLOWISE_DOMAIN="flowise-${STACK_SLUG}.${HOST_SUFFIX}"
# DASHBOARD CUA WORKFLOW ENGINE. KHONG co alias "tran" nhu demo/operator/flowise, va do la co y:
# engine la thu MOI, khong co ten mien cu nao dang chay de phai giu tuong thich. Mot ten it hon la
# mot be mat cong khai it hon.
#
# Ten nay chi duoc PHAT THANH ROUTE khi `WORKFLOW_ENGINE=on` (xem cuoi file). Neu phat vo dieu
# kien thi moi khach deu moc them mot hostname cong khai tra 502, va Caddy se di xin chung chi
# ACME cho mot ten khong phuc vu gi — vua ton han muc Let's Encrypt vua lo ra mot be mat that.
WORKFLOW_DOMAIN="workflow-${STACK_SLUG}.${HOST_SUFFIX}"
DEMO_ALIASES=''
OPERATOR_ALIASES=''
FLOWISE_ALIASES=''
# So sanh voi STACK_SLUG chu khong phai TENANT_SLUG: stack thu hai cua CUNG mot khach
# (`ultty-gd1-test`) khong duoc phep cuop ten mien tran cua stack dang chay (`ultty`).
if [[ "${PRIMARY_TENANT:-}" == "${STACK_SLUG}" ]]; then
  DEMO_ALIASES="${DEMO_DOMAIN}"
  OPERATOR_ALIASES="${OPERATOR_DOMAIN}"
  FLOWISE_ALIASES="${FLOWISE_DOMAIN}"
  DEMO_DOMAIN="demo.${HOST_SUFFIX}"
  OPERATOR_DOMAIN="operator.${HOST_SUFFIX}"
  FLOWISE_DOMAIN="flowise.${HOST_SUFFIX}"
fi

mkdir -p "${RUNTIME_DIR}"

# Serialize runtime env writes with explicit mode changes and compose rollout. This lock is released
# before deploy-stack.sh obtains it again; no nested lock/deadlock.
exec 9>"${RUNTIME_DIR}/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa runtime sau 300s." >&2
  exit 1
fi

# `tr -d '\r'` KHONG phai lam dep. Secret duoc tao tu may Windows co the mang mot ky tu CR o cuoi;
# `$(...)` cat duoc dau xuong dong nhung KHONG cat CR. Truoc day khong ai thay vi API key di qua
# `caddy.env` va docker compose tu bo CR khi doc env file. Tu khi key duoc dat thang vao cau hinh
# Caddy thi CR do vao gia tri header va Caddy tra 502 "invalid header field value for X-Api-Key"
# (su co 15/08/2026). Loc tai NGUON de moi secret deu sach, khong rieng API key.
secret() {
  gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1" | tr -d '\r'
}

# Secret CHUA duoc tao -> tra chuoi rong thay vi lam hong ca lan deploy. Chi dung cho secret
# that su tuy chon; secret bat buoc van goi secret() de fail fast.
optional_secret() {
  gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1" 2>/dev/null | tr -d '\r' || true
}

POSTGRES_ADMIN_PASSWORD="$(secret zalo-${STACK_SLUG}-postgres-admin-password)"
ZALO_DB_PASSWORD="$(secret zalo-${STACK_SLUG}-zalo-db-password)"
FLOWISE_DB_PASSWORD="$(secret zalo-${STACK_SLUG}-flowise-db-password)"
DEEPSEEK_API_KEY="$(secret zalo-${STACK_SLUG}-deepseek-api-key)"
# AGENT TU VAN. `optional_secret` chu khong `secret`: khong co khoa thi agent lui ve
# `NoopAdvisorAgent` va he thong giu nguyen duong tat dinh — thieu mot cau tra loi muot hon khong
# duoc phep lam chet ca stack.
ANTHROPIC_API_KEY="$(optional_secret zalo-${STACK_SLUG}-anthropic-api-key)"
# Cong tac RIENG, khong bam theo PARSER_MODE: parser va nguoi soan cau chu la HAI quyet dinh xu ly
# du lieu. Co khoa -> bat; khong co -> 'off' (Noop). Claude nam trong danh sach ben thu ba da duoc
# duyet, nen bat cong tac nay KHONG mo them mot ben nhan du lieu chua duyet nao.
if [[ -n "${ADVICE_COMPOSER:-}" ]]; then
  : # Operator da chon tuong minh — ton trong, khong doan lai.
elif [[ -n "${ANTHROPIC_API_KEY}" ]]; then
  ADVICE_COMPOSER='claude'
else
  ADVICE_COMPOSER='off'
fi
# Token Bot van duoc render san de co the kiem tra danh tinh.
# Pilot GĐ1 chay ZCA mac dinh; `.runtime/channel-mode.env` khong bi rsync ghi de nen deploy lai
# giu override co y cua operator va khong am tham roi ve mock.
ZALO_BOT_TOKEN="$(optional_secret zalo-${STACK_SLUG}-zalo-bot-token)"
CHANNEL_MODE="$("${SCRIPT_DIR}/channel-mode.sh" read "${RUNTIME_DIR}/channel-mode.env")"
echo "render-secrets: CHANNEL_MODE=${CHANNEL_MODE} (zca mac dinh cho pilot GĐ1)." >&2
# --- WORKFLOW ENGINE (Hatchet) -----------------------------------------------------------------
# CONG TAC VAN HANH, MAC DINH TAT — quyet dinh Q1-A.
#
# `deploy-remote.sh:108` rsync CUNG MOT `tenant-pack` cho `zalo-ultty` (production) lan
# `zalo-ultty-gd1-test`. Nen goi khach mot minh no KHONG tach duoc hai moi truong: khai
# `integrations.workflowEngine` de bat cho gd1-test se dong thoi vu trang dispatcher tren
# production o lan deploy ke tiep. Bien nay lam viec do — cung khuon `AUTO_SEND` (CLAUDE.md QD#4:
# kill switch van hanh KHONG phai noi chua policy tenant).
#
# Mac dinh `off` la ca diem: mot cong tac mac dinh `on` khong bao ve duoc gi.
WORKFLOW_ENGINE="${WORKFLOW_ENGINE:-off}"
WORKFLOW_ENGINE_NAMESPACE="${WORKFLOW_ENGINE_NAMESPACE:-}"
# TEN SECRET MANG STACK SLUG — do la cach ly o TANG BI MAT, dung mot lop voi ten volume va alias
# mang. `zalo-ultty-hatchet-db-password` va `zalo-ultty-gd1-test-hatchet-db-password` la hai thu
# khac nhau, nen hai stack khong the vo tinh dung chung mot Postgres cua engine.
HATCHET_DB_PASSWORD="$(optional_secret zalo-${STACK_SLUG}-hatchet-db-password)"
# VONG GA-TRUNG CUA TOKEN: token chi ton tai SAU khi engine da migrate + quickstart, nen o lan
# deploy DAU TIEN no khong the co san trong Secret Manager. `optional_secret` de lan dau khong
# chet; `bootstrap-workflow-engine.sh` duc token roi day len, va lan render sau moi co gia tri.
WORKFLOW_ENGINE_TOKEN="$(optional_secret zalo-${STACK_SLUG}-workflow-engine-token)"
# Bam bcrypt cho CONG THU HAI truoc dashboard (`caddy hash-password`). Hatchet co dang nhap rieng,
# nhung dashboard co nut Replay — no CHAY LAI TAC DUNG PHU, va Hatchet khong biet gi ve ba muc an
# toan o `operation-key.ts`. Mot lop nua truoc mot nut nhu the la dang gia.
WORKFLOW_DASHBOARD_HTPASSWD="$(optional_secret zalo-${STACK_SLUG}-workflow-dashboard-htpasswd)"

if [[ "${WORKFLOW_ENGINE}" == 'on' ]]; then
  # FAIL-CLOSED. "Bat engine nhung khong co mat khau DB" va "bat dashboard nhung khong co cong
  # xac thuc" deu la cau hinh sai co hau qua bao mat — dung han o day, khong deploy roi vam.
  [[ -n "${HATCHET_DB_PASSWORD}" ]] || {
    echo "WORKFLOW_ENGINE=on nhung thieu secret zalo-${STACK_SLUG}-hatchet-db-password." >&2
    exit 78
  }
  [[ -n "${WORKFLOW_DASHBOARD_HTPASSWD}" ]] || {
    echo "WORKFLOW_ENGINE=on nhung thieu secret zalo-${STACK_SLUG}-workflow-dashboard-htpasswd." >&2
    echo "Sinh bang: docker run --rm caddy:2-alpine caddy hash-password --plaintext '<mat khau>'" >&2
    exit 78
  }
  echo "render-secrets: WORKFLOW_ENGINE=on cho stack ${STACK_SLUG}." >&2
fi

AUTO_SEND="${AUTO_SEND:-on}"
PARSER_MODE="${PARSER_MODE:-deepseek}"
DATA_CLASSIFICATION="${DATA_CLASSIFICATION:-test}"
if [[ "${DEPLOYMENT_ENVIRONMENT}" == 'gd1-test' ]]; then
  [[ "${TENANT_SLUG}" == 'ultty' ]] || {
    echo 'Runtime profile gd1-test chi duoc dang ky cho tenant ultty.' >&2
    exit 64
  }
  [[ "${CHANNEL_MODE}" == 'zca' ]] || {
    echo 'Ultty GD1-test bat buoc CHANNEL_MODE=zca; khong fallback sang channel khac.' >&2
    exit 1
  }
  CHANNEL_MODE='zca'
  PARSER_MODE='deepseek'
  AUTO_SEND='off'
  DATA_CLASSIFICATION='test'
  # AGENT TU VAN tren gd1-test chay DeepSeek, cung nha cung cap voi parser.
  #
  # Vi sao khong phai Claude (lua chon dung ve tuan thu): do ngay 21/08/2026, khoa Anthropic tra
  # `credit balance is too low` — agent lui ve duong tat dinh, tuc tinh nang khong chung minh duoc
  # gi. Nhanh nay chi mo cho gd1-test, noi `DATA_CLASSIFICATION=test` va chi co nhom/du lieu TEST;
  # do dung pham vi CLAUDE.md cho phep dung DeepSeek. Stack chay du lieu khach that PHAI dung
  # `ADVICE_COMPOSER=claude` (hoac bo sung DeepSeek vao thoa thuan xu ly du lieu truoc).
  ADVICE_COMPOSER='deepseek'
fi
API_KEY=$(secret zalo-${STACK_SLUG}-api-key)
# VM da duoc cap quyen doc API key. Dan xuat domain-separated session signing key thay vi doi IAM
# de them mot secret moi; gia tri goc khong nam trong command args va khong duoc ghi log.
SESSION_SECRET="$(printf 'netviet-api-session-v1:%s' "${API_KEY}" | sha256sum | cut -d' ' -f1)"
PILOT_OPERATOR_PASSWORD="$(secret zalo-${STACK_SLUG}-operator-password)"
FLOWISE_SECRETKEY="$(secret zalo-${STACK_SLUG}-flowise-secretkey)"
FLOWISE_ADMIN_EMAIL="$(secret zalo-${STACK_SLUG}-flowise-admin-email)"
FLOWISE_ADMIN_PASSWORD="$(secret zalo-${STACK_SLUG}-flowise-admin-password)"
FLOWISE_JWT_SECRET="$(secret zalo-${STACK_SLUG}-flowise-jwt-secret)"
FLOWISE_REFRESH_SECRET="$(secret zalo-${STACK_SLUG}-flowise-refresh-secret)"
FLOWISE_SESSION_SECRET="$(secret zalo-${STACK_SLUG}-flowise-session-secret)"
FLOWISE_TOKEN_HASH_SECRET="$(secret zalo-${STACK_SLUG}-flowise-token-hash-secret)"
# PRE-PILOT PUBLIC — SESSION AUTH:
# Caddy khong can Basic Auth; NestJS dung login session/role/CSRF va PostgreSQL session store.
# URL pilot public phai dung session server-side. API key van render san cho automation tuong lai,
# nhung khong dua vao browser. User bootstrap chi tao lan dau, deploy sau khong reset password.
AUTH_MODE='session'

# --- Kho anh (MEDIA_STORE) ---------------------------------------------------------------------
# Link anh Zalo chet trong <=35 ngay => khong tai ve la mat vinh vien. Nhung bat kho anh cung la
# bat mot duong ghi PII ra object storage, nen phai la lua chon CO Y — khong biet bucket thi
# `none`, khong doan.
#
# XAC THUC BANG ADC, KHONG DUNG KHOA (chot 13/08/2026): container ke thua tai khoan dich vu gan san
# cua VM, nen khong co khoa tinh nao phai phat, xoay vong hay lo. Duong S3 (`MEDIA_STORE=s3` + khoa
# HMAC) van con nguyen cho OVHcloud, chi khong dung tren GCP nua — to chuc bat
# `constraints/iam.disableServiceAccountKeyCreation` nen GCS khong the ky request S3 duoc.
#
# `MEDIA_BUCKET` MAC DINH tro vao dung bucket sao luu dang mang rule lifecycle prefix `media/`
# (60 ngay -> Nearline, 365 ngay -> Coldline, KHONG co rule Delete) — xem gcs-lifecycle.json va
# deploy.ps1 (`$BackupBucket`). Tro nham bucket thi rule giu anh khong co tac dung MA CUNG KHONG
# bao loi, nen mac dinh o day duoc chot theo bucket that thay vi de nguoi deploy tu go.
# BACKUP_BUCKET den tu deploy duoi dang `gs://<ten>`; API chi can ten tran.
MEDIA_BUCKET="${MEDIA_BUCKET:-${BACKUP_BUCKET#gs://}}"
if [[ -n "${MEDIA_BUCKET}" ]]; then
  MEDIA_STORE='gcs'
else
  MEDIA_STORE='none'
  echo "render-secrets: MEDIA_STORE=none (khong biet bucket) — anh Zalo se KHONG duoc luu." >&2
fi

cat >"${RUNTIME_DIR}/secrets.env" <<EOF
APP_IMAGE=${APP_IMAGE_VALUE}
FLOWISE_IMAGE=${FLOWISE_IMAGE_VALUE}
TENANT_SLUG=${TENANT_SLUG}
# compose.yaml dung bien nay cho \`name:\` (=> ten volume) va cho alias mang tren edge.
STACK_SLUG=${STACK_SLUG}
DEPLOYMENT_ENVIRONMENT=${DEPLOYMENT_ENVIRONMENT}
# QUAN SAT (21/08/2026). \`json\` bat NDJSON co dinh kem traceId/tenant/release cho MOI dong log,
# de \`docker logs ... | node tools/trace-view.mjs\` dung lai duoc cay nghiep vu.
LOG_FORMAT=${LOG_FORMAT:-json}
LOG_LEVEL=${LOG_LEVEL:-log}
# Muc chi tiet noi dung trong telemetry. De TRONG = suy tu DATA_CLASSIFICATION
# (test -> full, customer -> redacted). Bi mat bi xoa o MOI muc, khong ngoai le.
TELEMETRY_PRIVACY=${TELEMETRY_PRIVACY:-}
# NEO RELEASE cho trace — tra loi "bug nay xay ra tren commit nao" ma khong phai SSH doc file.
#
# Dung BIEN chu khong mount \`.runtime/release.json\`: file do duoc \`deploy-remote.sh\` ghi SAU
# \`deploy-stack.sh\`, tuc SAU \`docker compose up\`. Mount mot file chua ton tai thi Docker tao ra
# mot THU MUC trung ten — hong ca mount lan lan ghi release.json ke tiep.
RELEASE_GIT_SHA=${RELEASE_GIT_SHA:-}
RELEASE_APP_DIGEST=${APP_IMAGE_VALUE}
RELEASE_DEPLOYED_AT=${RELEASE_DEPLOYED_AT:-}
# 18/08/2026 — doi flowise -> deepseek. Ly do: Flowise la MOT TANG TRUNG GIAN nua dat tren cung
# DeepSeek o dau kia, nen no khong them chat luong ma chi them mot cho co the hong va mot cho
# kho lan vet. Goi thang deepseek-v4-flash bo tang do: cung mo hinh, it thanh phan hon, va
# parser lay lai duoc prompt chung do REPO quan ly (7 intent + few-shot + glossary + cua so hoi
# thoai Pha 1) thay vi mot ban sao nam trong Agentflow khong ai review.
# Dat qua bien de doi nguoc chi bang mot dong: PARSER_MODE=flowise ./render-secrets.sh ...
PARSER_MODE=${PARSER_MODE}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
ADVICE_COMPOSER=${ADVICE_COMPOSER}
DEEPSEEK_MODEL=${DEEPSEEK_MODEL:-deepseek-v4-flash}
CHANNEL_MODE=${CHANNEL_MODE}
AUTO_SEND=${AUTO_SEND}
DATA_CLASSIFICATION=${DATA_CLASSIFICATION}
GCP_PROJECT_ID=${PROJECT_ID}
DEMO_DOMAIN=${DEMO_DOMAIN}
OPERATOR_DOMAIN=${OPERATOR_DOMAIN}
FLOWISE_DOMAIN=${FLOWISE_DOMAIN}
# WORKFLOW ENGINE. Ca nam bien deu di DU BA TANG (render -> block \`environment:\` cua dung service
# -> secrets-passthrough.contract.test.mjs). Bo mot tang = tinh nang im lang khong chay; da xay ra
# that voi \`ADVICE_COMPOSER\` va voi \`DEPLOYMENT_ENVIRONMENT\`.
#
# \`WORKFLOW_DASHBOARD_HTPASSWD\` CO Y khong nam o day: no la cau hinh cua EDGE, di thang vao manh
# Caddy ben duoi. Dua mot bam mat khau vao secrets.env la phat no cho MOI container cua stack.
WORKFLOW_ENGINE=${WORKFLOW_ENGINE}
WORKFLOW_ENGINE_NAMESPACE=${WORKFLOW_ENGINE_NAMESPACE}
WORKFLOW_ENGINE_TOKEN=${WORKFLOW_ENGINE_TOKEN}
HATCHET_DB_PASSWORD=${HATCHET_DB_PASSWORD}
WORKFLOW_DOMAIN=${WORKFLOW_DOMAIN}
POSTGRES_ADMIN_PASSWORD=${POSTGRES_ADMIN_PASSWORD}
ZALO_DB_PASSWORD=${ZALO_DB_PASSWORD}
FLOWISE_DB_PASSWORD=${FLOWISE_DB_PASSWORD}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
ZALO_BOT_TOKEN=${ZALO_BOT_TOKEN}
API_KEY=${API_KEY}
AUTH_MODE=${AUTH_MODE}
SESSION_SECRET=${SESSION_SECRET}
PILOT_OPERATOR_USERNAME=operator
PILOT_OPERATOR_NAME=Pilot Operator
PILOT_OPERATOR_PASSWORD=${PILOT_OPERATOR_PASSWORD}
MEDIA_STORE=${MEDIA_STORE}
MEDIA_BUCKET=${MEDIA_BUCKET}
FLOWISE_SECRETKEY=${FLOWISE_SECRETKEY}
FLOWISE_ADMIN_EMAIL=${FLOWISE_ADMIN_EMAIL}
FLOWISE_ADMIN_PASSWORD=${FLOWISE_ADMIN_PASSWORD}
FLOWISE_JWT_SECRET=${FLOWISE_JWT_SECRET}
FLOWISE_REFRESH_SECRET=${FLOWISE_REFRESH_SECRET}
FLOWISE_SESSION_SECRET=${FLOWISE_SESSION_SECRET}
FLOWISE_TOKEN_HASH_SECRET=${FLOWISE_TOKEN_HASH_SECRET}
EOF

# --- Tang edge dung chung ----------------------------------------------------------------------
# Edge phuc vu MOI khach, nen file env cua no chi duoc chua thu KHONG thuoc rieng ai. API key va
# hostname cua tung khach nam trong manh cau hinh rieng ben duoi, khong nam o day.
install -d -m 0750 "${EDGE_DIR}"
install -d -m 0750 "${EDGE_DIR}/.runtime"
install -d -m 0750 "${EDGE_DIR}/tenants"
cat >"${EDGE_DIR}/.runtime/caddy.env" <<EOF
ACME_EMAIL=${FLOWISE_ADMIN_EMAIL}
EOF
chmod 600 "${EDGE_DIR}/.runtime/caddy.env"

# MANH CAU HINH CUA RIENG KHACH NAY. Moi khach mot tep: them khach khong phai sua tep cua khach
# khac, va go mot khach chi la xoa mot tep roi nap lai.
#
# Upstream tro vao ALIAS mang mang slug (`api-<slug>`, ...) chu khong phai ten service: tren mang
# edge dung chung, moi khach deu co service ten `api`, nen ten service khong con phan biet duoc.
#
# `\$1` duoc thoat de di NGUYEN VAN vao Caddy (nhom bat cua header_down), khong bi bash nuot.
tenant_site="${EDGE_DIR}/tenants/${STACK_SLUG}.caddy"
cat >"${tenant_site}" <<EOF
# SINH TU DONG boi render-secrets.sh cho stack '${STACK_SLUG}'. Dung sua tay: lan deploy sau ghi de.
${DEMO_DOMAIN}${DEMO_ALIASES:+, ${DEMO_ALIASES}} {
	import secure_headers
	import app_headers
	import app_routes api-${STACK_SLUG} web-${STACK_SLUG} "${API_KEY}"
}

${OPERATOR_DOMAIN}${OPERATOR_ALIASES:+, ${OPERATOR_ALIASES}} {
	import secure_headers
	import app_headers
	import app_routes api-${STACK_SLUG} web-${STACK_SLUG} "${API_KEY}"
}

${FLOWISE_DOMAIN}${FLOWISE_ALIASES:+, ${FLOWISE_ALIASES}} {
	import secure_headers
	reverse_proxy flowise-${STACK_SLUG}:3000 {
		header_down Set-Cookie (.*) "\$1; Secure"
	}
}
EOF

# DASHBOARD CUA WORKFLOW ENGINE — CHI phat route khi cong tac BAT.
#
# Day la duong RA NGOAI DUY NHAT cua ca cum Hatchet: engine va Postgres cua no nam tren mang
# `internal: true` va khong service nao co khoi `ports:`. Do cung la ly do quyet dinh Q2-A dung
# duoc — gRPC noi bo chay khong TLS vi no KHONG DI QUA RANH GIOI HOST NAO, chu khong phai vi
# "day khong phai production". `workflow-isolation.contract.test.mjs` ep dung ranh gioi do.
#
# HAI CONG chu khong mot: `basic_auth` o edge, roi dang nhap cua chinh Hatchet. Ly do khong phai
# "bao mat theo lop" chung chung — dashboard co nut REPLAY chay lai tac dung phu, va Hatchet
# khong biet gi ve ba muc an toan trong `operation-key.ts`. Sale nhan vai VIEWER (runbook §4.4).
#
# `Set-Cookie ... Secure` KHONG duoc them o day (khac route Flowise): Hatchet tu gan co Secure vi
# compose dat `SERVER_AUTH_COOKIE_INSECURE=f`. Them lan hai se sinh ra cookie co hai chu `Secure`.
if [[ "${WORKFLOW_ENGINE}" == 'on' ]]; then
  cat >>"${tenant_site}" <<EOF

${WORKFLOW_DOMAIN} {
	import secure_headers
	basic_auth {
		operator ${WORKFLOW_DASHBOARD_HTPASSWD}
	}
	# :80 la nginx cua image dashboard — no phuc vu giao dien VA proxy \`/api\` sang tien trinh
	# \`hatchet-api\` chay cung container tren :8080 (da kiem bang \`ps\` trong container).
	reverse_proxy hatchet-${STACK_SLUG}:80
}
EOF
fi

# Manh nay mang API key cua khach, nen doi xu nhu secret chu khong nhu cau hinh.
chmod 600 "${tenant_site}"

touch "${RUNTIME_DIR}/flowise.env"
install -d -m 0700 "${RUNTIME_DIR}/zalo"
# `caddy.env` khong con nam o day: no thuoc tang edge dung chung va da duoc chmod ngay sau khi ghi.
chmod 600 "${RUNTIME_DIR}/secrets.env" "${RUNTIME_DIR}/flowise.env"
