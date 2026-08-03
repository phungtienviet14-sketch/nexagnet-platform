#!/usr/bin/env bash
# Phan CD chay tu GitHub Actions: build + push image roi trien khai len VM pilot `netviet`.
# Tuong duong hai buoc cuoi cua deploy/netviet/deploy.ps1 (Build-And-PushImages + Deploy-Stack);
# phan bootstrap ha tang (project/network/VM/secret) van chay tay bang deploy.ps1.
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REGION="${GCP_REGION:-asia-southeast1}"
ZONE="${GCP_ZONE:-asia-southeast1-b}"
VM="${VM_NAME:-netviet}"
GIT_SHA_VALUE="${GIT_SHA:-$(git rev-parse HEAD)}"
REGISTRY_HOST="${REGION}-docker.pkg.dev"
REPOSITORY='netviet'
BACKUP_BUCKET="gs://${PROJECT_ID}-backups"
REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUNDLE_DIR="${REPOSITORY_ROOT}/deploy/netviet"

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

ssh_vm "install -d -m 0700 '${remote_parent}'"
# deploy-remote.sh kiem tra duong dan phai la <parent>/netviet — giu nguyen ten thu muc bundle.
gcloud compute scp --recurse "${BUNDLE_DIR}" "${VM}:${remote_parent}/" \
  --zone "${ZONE}" \
  --tunnel-through-iap \
  --project "${PROJECT_ID}" \
  --quiet
ssh_vm "sudo bash '${remote_parent}/netviet/deploy-remote.sh' '${PROJECT_ID}' '${app_digest}' '${flowise_digest}' '${BACKUP_BUCKET}' '${public_ip}'"

echo "Deploy xong: app=${app_digest}"
