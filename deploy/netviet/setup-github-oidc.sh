#!/usr/bin/env bash
# Chay TAY MOT LAN de GitHub Actions deploy duoc len GCP ma KHONG can service account key JSON.
# Dung Workload Identity Federation: GitHub phat OIDC token, GCP doi lay quyen cua service
# account `github-deployer`, chi chap nhan token den tu DUNG repository nay.
#
#   GCP_PROJECT_ID=netviet-host-968934832433 \
#   GITHUB_REPOSITORY=phungtienviet14-sketch/nexagnet-platform \
#     bash deploy/netviet/setup-github-oidc.sh
#
# DOI TEN REPO thi PHAI chay lai file nay (hoac sua tay 2 cho): `attribute-condition` cua provider
# va `principalSet` cua service account deu cam theo `owner/repo`. Git remote van chay nho GitHub
# tu redirect, nen de tuong khong co gi hong — nhung OIDC token mang TEN MOI se bi tu choi va moi
# lan deploy chet o buoc `auth`. Cach doi ten khong co khoang chet: noi dieu kien de nhan CA HAI
# ten -> doi ten -> chay that mot lan deploy -> siet lai con mot ten.
#
# In ra hai gia tri de dat vao GitHub -> Settings -> Secrets and variables -> Actions -> Variables:
#   GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_DEPLOY_SERVICE_ACCOUNT
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID is required}"
REPOSITORY_SLUG="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required (owner/repo)}"
POOL='github'
PROVIDER='github-actions'
SERVICE_ACCOUNT_NAME='github-deployer'
SERVICE_ACCOUNT="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com \
  --project "${PROJECT_ID}" --quiet

if ! gcloud iam workload-identity-pools describe "${POOL}" \
  --location global --project "${PROJECT_ID}" --quiet >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL}" \
    --location global \
    --display-name 'GitHub Actions' \
    --project "${PROJECT_ID}" \
    --quiet
fi

if ! gcloud iam workload-identity-pools providers describe "${PROVIDER}" \
  --workload-identity-pool "${POOL}" --location global \
  --project "${PROJECT_ID}" --quiet >/dev/null 2>&1; then
  # attribute-condition la CHOT BAO MAT: thieu no thi BAT KY repo GitHub nao cung doi duoc token.
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER}" \
    --workload-identity-pool "${POOL}" \
    --location global \
    --issuer-uri 'https://token.actions.githubusercontent.com' \
    --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository' \
    --attribute-condition "assertion.repository == '${REPOSITORY_SLUG}'" \
    --project "${PROJECT_ID}" \
    --quiet
fi

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" \
  --project "${PROJECT_ID}" --quiet >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --display-name 'GitHub Actions deployer' \
    --project "${PROJECT_ID}" \
    --quiet
fi

# Quyen toi thieu de: push image, doc IP tinh, SSH qua IAP va chay deploy-remote.sh bang sudo.
for role in \
  roles/artifactregistry.writer \
  roles/compute.viewer \
  roles/compute.osAdminLogin \
  roles/iap.tunnelResourceAccessor; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${SERVICE_ACCOUNT}" \
    --role "${role}" \
    --condition None \
    --quiet >/dev/null
done

# `gcloud compute ssh` KHONG chi can osAdminLogin: no con doi quyen actAs tren service account
# ma VM dang chay, neu khong thi PERMISSION_DENIED ngay truoc khi mo tunnel IAP. Binding nay o
# pham vi DUNG MOT service account cua VM, khong phai quyen toan project.
vm_service_account="$(gcloud compute instances describe netviet \
  --zone "${ZONE:-asia-southeast1-b}" \
  --project "${PROJECT_ID}" \
  --format='value(serviceAccounts[0].email)' 2>/dev/null || true)"
if [[ -n "${vm_service_account}" ]]; then
  gcloud iam service-accounts add-iam-policy-binding "${vm_service_account}" \
    --member "serviceAccount:${SERVICE_ACCOUNT}" \
    --role roles/iam.serviceAccountUser \
    --project "${PROJECT_ID}" \
    --quiet >/dev/null
else
  echo 'setup-github-oidc: chua thay VM netviet -> bo qua binding actAs; chay lai sau khi deploy.ps1 tao VM.' >&2
fi

pool_resource="projects/${project_number}/locations/global/workloadIdentityPools/${POOL}"
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT}" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/${pool_resource}/attribute.repository/${REPOSITORY_SLUG}" \
  --project "${PROJECT_ID}" \
  --quiet >/dev/null

printf '\nDat hai repository variable nay trong GitHub Actions:\n'
printf '  GCP_WORKLOAD_IDENTITY_PROVIDER=%s/providers/%s\n' "${pool_resource}" "${PROVIDER}"
printf '  GCP_DEPLOY_SERVICE_ACCOUNT=%s\n' "${SERVICE_ACCOUNT}"
