#!/usr/bin/env bash
# Phan CD chay tu GitHub Actions: build + push image roi trien khai len VM pilot `netviet`.
# Tuong duong hai buoc cuoi cua deploy/netviet/deploy.ps1 (Build-And-PushImages + Deploy-Stack);
# phan bootstrap ha tang (project/network/VM/secret) van chay tay bang deploy.ps1.
#
# Image la ban TRUNG TINH dung chung cho moi khach; thu chon khach la bien `TENANT` (mac dinh
# `ultty`), quyet dinh goi khach nao duoc upload len stack.
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-southeast1}"
ZONE="${GCP_ZONE:-asia-southeast1-b}"
VM="${VM_NAME:-netviet}"
# GOI KHACH chon bang slug. Mac dinh `ultty` giu nguyen hanh vi cua cac lan deploy truoc, nen
# workflow `deploy.yml` cu (khong truyen TENANT) van ra dung stack no van deploy tu truoc toi nay.
TENANT_SLUG="${TENANT:-ultty}"
GIT_SHA_VALUE="${GIT_SHA:-$(git rev-parse HEAD)}"
REGISTRY_HOST="${REGION}-docker.pkg.dev"
REPOSITORY='netviet'
BACKUP_BUCKET="gs://${PROJECT_ID}-backups"
REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE_DIR="${REPOSITORY_ROOT}/deploy/netviet"
TENANT_PACK_DIR="${REPOSITORY_ROOT}/tenants/${TENANT_SLUG}"
CATALOG_ASSETS_DIR="${REPOSITORY_ROOT}/catalog-assets"

# Slug di thang vao duong dan remote va vao lenh ssh, nen chan ky tu la truoc khi ghep chuoi.
[[ "${TENANT_SLUG}" =~ ^[a-z0-9-]+$ ]] || {
  echo "TENANT khong hop le: '${TENANT_SLUG}' (chi cho phep a-z, 0-9 va dau gach ngang)." >&2
  exit 64
}
# Fail-fast NGAY BAY GIO chu khong doi toi luc deploy-remote.sh: thieu goi khach thi api/web khong
# boot duoc, ma phat hien o day thi chua ton cong build va push image.
[[ -f "${TENANT_PACK_DIR}/tenant.json" ]] || {
  echo "Khong tim thay goi khach '${TENANT_PACK_DIR}/tenant.json'. TENANT=<slug> phai khop mot thu muc trong tenants/." >&2
  exit 1
}

APP_IMAGE="${REGISTRY_HOST}/${PROJECT_ID}/${REPOSITORY}/zalo-ultty:${GIT_SHA_VALUE}"
FLOWISE_IMAGE="${REGISTRY_HOST}/${PROJECT_ID}/${REPOSITORY}/flowise-3.1.4-deepseek-fix:${GIT_SHA_VALUE}"

cd "${REPOSITORY_ROOT}"
gcloud auth configure-docker "${REGISTRY_HOST}" --quiet

docker build \
  --file deploy/netviet/Dockerfile \
  --label "org.opencontainers.image.revision=${GIT_SHA_VALUE}" \
  --tag "${APP_IMAGE}" \
  .
docker build \
  --file deploy/flowise/Dockerfile \
  --label "org.opencontainers.image.revision=${GIT_SHA_VALUE}" \
  --label 'org.opencontainers.image.base.digest=sha256:3922767afb52a5777759fd8b28a3c9eee864daea96018a791f2429eae2a76571' \
  --tag "${FLOWISE_IMAGE}" \
  .

docker push "${APP_IMAGE}"
docker push "${FLOWISE_IMAGE}"

# Trien khai theo DIGEST, khong theo tag: tag co the bi day de, digest thi khong.
app_digest="$(docker inspect --format '{{index .RepoDigests 0}}' "${APP_IMAGE}")"
flowise_digest="$(docker inspect --format '{{index .RepoDigests 0}}' "${FLOWISE_IMAGE}")"
for digest in "${app_digest}" "${flowise_digest}"; do
  [[ "${digest}" =~ @sha256:[a-f0-9]{64}$ ]] || {
    echo "Khong doc duoc digest sau khi push: ${digest}" >&2
    exit 1
  }
done

public_ip="$(gcloud compute addresses describe netviet-public-ip \
  --region "${REGION}" --project "${PROJECT_ID}" --format='value(address)')"
[[ -n "${public_ip}" ]] || {
  echo 'Chua co static IP netviet-public-ip — chay deploy.ps1 de bootstrap truoc.' >&2
  exit 1
}

remote_parent="/tmp/netviet-deploy-$(date +%s)"
ssh_vm() {
  gcloud compute ssh "${VM}" \
    --zone "${ZONE}" \
    --tunnel-through-iap \
    --project "${PROJECT_ID}" \
    --quiet \
    --command "$1"
}

scp_vm() {
  gcloud compute scp --recurse "$1" "${VM}:$2" \
    --zone "${ZONE}" \
    --tunnel-through-iap \
    --project "${PROJECT_ID}" \
    --quiet
}

ssh_vm "install -d -m 0700 '${remote_parent}'"
# deploy-remote.sh kiem tra duong dan phai la <parent>/netviet — giu nguyen ten thu muc bundle.
scp_vm "${BUNDLE_DIR}" "${remote_parent}/"

# GOI KHACH + ANH CATALOG di NGOAI image (`.dockerignore` loai `tenants/`): image la ban CHUNG cho
# moi khach, mot goi nam trong do nghia la khach nay `docker save` ra la doc duoc gia si cua khach
# kia. deploy-remote.sh doi dung hai duong dan nay va se `exit 1` neu thieu goi khach.
# DEST co y KHONG tao truoc: `scp --recurse SRC DEST-CHUA-CO` tao DEST la ban sao cua SRC, cho ra
# `tenant-pack/tenant.json` phang dung nhu deploy-remote.sh mong doi. (Neu mot lan chay lai lam
# long them cap thu muc, deploy-remote.sh van co buoc go phang du phong.)
scp_vm "${TENANT_PACK_DIR}" "${remote_parent}/tenant-pack"

# Thieu anh thi he thong VAN chay — chi la tu van gui di khong kem anh. Nen canh bao, khong chan
# ca lan deploy: chan mot su co nho bang mot su co lon la doi khong dang.
if [[ -d "${CATALOG_ASSETS_DIR}" ]] && [[ -n "$(ls -A "${CATALOG_ASSETS_DIR}" 2>/dev/null)" ]]; then
  scp_vm "${CATALOG_ASSETS_DIR}" "${remote_parent}/catalog-assets"
else
  echo "Khong co '${CATALOG_ASSETS_DIR}' — tu van se gui khong kem anh." >&2
fi

ssh_vm "sudo bash '${remote_parent}/netviet/deploy-remote.sh' '${PROJECT_ID}' '${app_digest}' '${flowise_digest}' '${BACKUP_BUCKET}' '${public_ip}'"

echo "Deploy xong: tenant=${TENANT_SLUG} app=${app_digest}"
