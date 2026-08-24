#!/bin/bash
set -euo pipefail

# DUC TOKEN CHO WORKFLOW ENGINE — giai VONG GA-TRUNG cua lan deploy dau tien.
#
# ================================================================================================
# VAN DE:
#
#   `render-secrets.sh` can `WORKFLOW_ENGINE_TOKEN` de ghi vao secrets.env
#     -> nhung token chi ton tai SAU khi engine da migrate + quickstart
#       -> ma engine chi len duoc sau khi `render-secrets.sh` da ghi `HATCHET_DB_PASSWORD`
#
# Nen lan deploy dau tien khong the co token trong Secret Manager. Script nay cat vong do: dung
# engine len TRUOC (no khong can token de chay), duc token, day len Secret Manager, roi lan
# `render-secrets.sh` ke tiep moi co gia tri that.
#
# ================================================================================================
# CHAY LAI DUOC — va do la yeu cau CUNG, khong phai tien nghi:
#
# Duc token lan hai KHONG lam token cu het hieu luc, nen se co hai token cung song va khong ai
# biet cai nao dang duoc dung. Te hon: neu ai do chay lai script trong luc deploy, worker co the
# nhan mot token moi trong khi api con giu cai cu. Nen: DA CO VERSION THI DUNG HAN, khong duc them.
#
# Xoay vong token la mot thao tac RIENG va CO Y (xem runbook), khong phai hieu ung phu cua mot lan
# chay lai bootstrap.
#
# SUA 23/08/2026 — cong idempotent cu (`gcloud secrets describe`) CHUA BAO GIO chay dung tren VM:
# `describe` can `secretmanager.secrets.get`, ma `roles/secretmanager.secretAccessor` KHONG cho
# quyen do. Do tren VM, cung mot secret: access -> OK | describe -> DENIED | list -> DENIED.
# Nen `if describe` LUON roi vao nhanh sai, va tinh chat "da co thi dung han" o tren chua bao gio
# hoat dong. No vo hai chi vi `secrets.create` cung bi chan; ai do cap them `create` de "cho chay
# duoc" se bien script nay thanh may duc token trung — dung cai hong no duoc viet ra de chan.
#
# Cong moi dung `versions access`, tuc DUNG MOT quyen ma VM da co that. KHONG dung `versions list`:
# do tren VM, `list` tra ve RONG ca khi secret CO version (thieu quyen list thi im lang tra rong
# chu khong bao loi) — dung mot cai bay nhu `optional_secret` cua render-secrets.sh.
#
# ================================================================================================
# TOKEN KHONG DUOC: vao git · vao `tenant.json` (o do chi co `credentialRef` = TEN BIEN) · vao log ·
# vao metadata/input cua Hatchet. Trong script nay no chi di qua mot ONG (pipe) tu `docker` sang
# `gcloud`, khong bao gio cham dia va khong bao gio duoc `echo`.

STACK_SLUG="${STACK_SLUG:-${TENANT_SLUG:-ultty}}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${STACK_SLUG}}"
SECRET_NAME="zalo-${STACK_SLUG}-workflow-engine-token"

cd "${APP_DIR}"

if [[ ! -s .runtime/secrets.env ]]; then
  echo "Thieu .runtime/secrets.env; chay render-secrets.sh truoc." >&2
  exit 1
fi

runtime_value() {
  sed -n "s/^$1=//p" .runtime/secrets.env | tail -n 1
}

PROJECT_ID="$(runtime_value GCP_PROJECT_ID)"
WORKFLOW_ENGINE="$(runtime_value WORKFLOW_ENGINE)"
HATCHET_DB_PASSWORD="$(runtime_value HATCHET_DB_PASSWORD)"

if [[ "${WORKFLOW_ENGINE}" != 'on' ]]; then
  echo "WORKFLOW_ENGINE=${WORKFLOW_ENGINE:-off} — khong duc token. Bat cong tac roi chay lai." >&2
  exit 64
fi
if [[ -z "${PROJECT_ID}" ]]; then
  echo "Thieu GCP_PROJECT_ID trong secrets.env." >&2
  exit 1
fi
if [[ -z "${HATCHET_DB_PASSWORD}" ]]; then
  echo "Thieu HATCHET_DB_PASSWORD — render-secrets.sh phai chay xong truoc." >&2
  exit 1
fi

# CUNG KHOA COMPOSE voi deploy-stack.sh va render-secrets.sh. Khong lay khoa thi hai tien trinh
# compose se gianh cung mot container — dung su co 04/08/2026 ("removal of container ... is
# already in progress").
exec 9>".runtime/compose.lock"
if ! flock -w 300 9; then
  echo "Khong lay duoc khoa compose sau 300s — co tien trinh compose khac dang chay." >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml --profile workflow)

# ------------------------------------------------------------------ ② DA CO THI DUNG (idempotent)
#
# Kiem TRUOC khi dung engine len: neu token da co thi khong co ly do gi phai dong cham vao mot
# engine dang chay.
#
# `2>&1 >/dev/null` (dung thu tu do): gia tri token di thang ra /dev/null — KHONG vao bien, KHONG
# duoc echo — con stderr thi bat lai de PHAN BIET ba truong hop. Do that tren VM 23/08/2026:
#
#   co version, co quyen   -> rc=0, stderr rong          => DA DUC ROI, dung han
#   0 version,  co quyen   -> rc=1, stderr NOT_FOUND     => chua duc, di tiep
#   co version, khong quyen-> rc=1, stderr PERMISSION_DENIED => KHONG biet, phai dung
#
# Truong hop ba la ly do khong duoc viet `if ! access; then duc token`: mot loi IAM (hay mot lan
# mang chap chon) se bi doc thanh "chua co token" va script se duc them mot cai nua. Fail-closed:
# chi di tiep khi Secret Manager NOI RO la chua co version.
gate_err="$(gcloud secrets versions access latest \
  --project "${PROJECT_ID}" --secret "${SECRET_NAME}" 2>&1 >/dev/null)" && gate_rc=0 || gate_rc=$?

if [[ ${gate_rc} -eq 0 ]]; then
  echo "Secret ${SECRET_NAME} da co version — KHONG duc token moi."
  echo "Xoay vong token la thao tac rieng, co y; xem workflow-engine-runbook.md."
  exit 0
fi
if ! grep -q 'NOT_FOUND' <<<"${gate_err}"; then
  echo "Khong doc duoc trang thai cua ${SECRET_NAME} (rc=${gate_rc}) — DUNG, khong duc token." >&2
  echo "Khong phai NOT_FOUND, nen khong the ket luan la 'chua co token'. Doan cuoi cua loi:" >&2
  echo "${gate_err}" | tail -3 >&2
  echo "Neu la PERMISSION_DENIED: VM can secretAccessor + secretVersionAdder tren dung secret nay." >&2
  exit 77
fi

# ------------------------------------------------------------------ ① DUNG ENGINE LEN
#
# Chi `hatchet-engine`: `depends_on` keo theo dung thu tu postgres -> migration -> setup-config,
# moi cai voi dieu kien cua no. KHONG dung worker/api o day — chung can token ma ta chua co.
echo "Dung cum engine (postgres -> migration -> setup-config -> engine)..."
"${COMPOSE[@]}" up -d --wait hatchet-engine

# ------------------------------------------------------------------ ③ DUC TOKEN
#
# TENANT ID DOC TU DB, khong go cung. Quickstart gieo hai tenant: `internal` va `default`;
# `default` la cai ma khach dung (do duoc 23/08/2026: id `707d0855-80ab-4e1f-a156-f1c4546cbf52`,
# giu nguyen qua mot lan xoa volume => la hang so trong ban gieo cua Hatchet). Nhung go cung mot
# UUID cua ben thu ba la dat cuoc vao mot chi tiet ho khong hua se giu — doc theo `slug` thi ban
# sau doi UUID van chay, con neu doi ca `slug` thi script DUNG HAN thay vi duc token cho nham
# tenant.
TENANT_ID="$("${COMPOSE[@]}" exec -T hatchet-postgres \
  psql -U hatchet -d hatchet -tAc "select id from \"Tenant\" where slug = 'default'" | tr -d '\r')"

if [[ ! "${TENANT_ID}" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
  echo "Khong doc duoc tenant 'default' cua engine (nhan duoc: '${TENANT_ID}')." >&2
  echo "Kiem tra quickstart da chay xong chua: ${COMPOSE[*]} logs hatchet-setup-config" >&2
  exit 1
fi

# ------------------------------------------------------------------ ④ DAY LEN SECRET MANAGER
#
# Token di THANG tu `docker` sang `gcloud` qua mot ong. Khong ghi ra tep tam (tep tam song sot qua
# ca lan script chet giua chung), khong `echo`, khong dat vao bien moi truong cua tien trinh khac.
#
# `versions add` chu KHONG `secrets create`: VO secret duoc tao san tu MAY TRAM (`deploy.ps1`,
# `$secretSuffixes`), va VM chi duoc cap quyen tren DUNG secret do — `secretVersionAdder` (ghi
# version) + `secretAccessor` (doc lai o cong tren). VM KHONG co `secrets.create` cap project, va
# do la co y: mot service account phuc vu bon stack tren cung VM khong duoc phep de ra secret moi
# o bat ky dau. Doi lai, neu vo secret chua ton tai thi buoc nay bao NOT_FOUND — xem thong bao loi.
#
# `grep` loc theo HINH DANG JWT (ba doan base64url) vi lenh tren con in ca dong thong bao; khong
# loc thi ta se day mot dong log len Secret Manager, va trieu chung sau do la worker bao token sai
# ma khong ai hieu vi sao.
echo "Duc token cho tenant ${TENANT_ID} va day len ${SECRET_NAME}..."
if ! "${COMPOSE[@]}" run --rm --no-deps -T hatchet-setup-config \
  /hatchet/hatchet-admin token create --config /hatchet/config --tenant-id "${TENANT_ID}" \
  | tr -d '\r' | grep -E '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$' | tail -n 1 \
  | gcloud secrets versions add "${SECRET_NAME}" \
      --project "${PROJECT_ID}" --data-file=-; then
  echo "Duc/day token that bai. ${SECRET_NAME} CHUA co version nao." >&2
  echo "Neu loi la NOT_FOUND: VO secret chua duoc tao. Tao tu MAY TRAM (khong tao tu VM):" >&2
  echo "  gcloud secrets create ${SECRET_NAME} --project ${PROJECT_ID} --replication-policy=automatic" >&2
  echo "  gcloud secrets add-iam-policy-binding ${SECRET_NAME} --project ${PROJECT_ID} \\" >&2
  echo "    --member=serviceAccount:<VM_SA> --role=roles/secretmanager.secretVersionAdder" >&2
  echo "  (va them roles/secretmanager.secretAccessor de render-secrets.sh doc lai duoc)" >&2
  echo "Neu lenh in ra thu gi do khong phai JWT ba doan, xem lai bang tay:" >&2
  echo "  ${COMPOSE[*]} run --rm --no-deps hatchet-setup-config /hatchet/hatchet-admin token create --config /hatchet/config --tenant-id ${TENANT_ID}" >&2
  exit 1
fi

echo "XONG. ${SECRET_NAME} da co."
echo "Buoc tiep: chay lai render-secrets.sh (de token vao secrets.env), roi deploy-stack.sh."
