#!/usr/bin/env bash
# GHI DANH TINH BAN PHAT HANH ra `.runtime/release.json`.
#
# ==================================================================================================
# VI SAO DAY LA MOT SCRIPT RIENG, khong con la mot ham trong `deploy-remote.sh`:
#
# 1. THU TU LA PHAN QUAN TRONG NHAT, va thu tu phai kiem duoc. Ban truoc goi `write_release_json`
#    SAU `deploy-stack.sh`, tuc SAU `docker compose up`. Container khoi dong luc do doc duoc — neu
#    manifest co duoc mount — ban phat hanh TRUOC. Do la ly do that su khien `RELEASE_MANIFEST_PATH`
#    rong suot tren stack: khong mount duoc mot tep chua ton tai (Docker se tao mot THU MUC trung
#    ten), nen ca duong doc canonical bi bo lai.
#    Nay manifest duoc ghi TRUOC khi stack duoc dua len, va `release-identity.contract.test.mjs`
#    khoa dung thu tu do.
#
# 2. MOT LAN GHI HONG KHONG DUOC LAM HONG BAN DANG PHUC VU. Script nay kiem dau vao TRUOC khi cham
#    vao dich, va thay the bang `mv` (mot buoc) chu khong ghi de tai cho.
#
# 3. Ham nam trong mot script 300 dong thi khong chay duoc trong test. Script nay thi chay duoc, va
#    `write-release-manifest.test.mjs` chay dung no.
#
# CHI GHI MOT LAN MOI LAN DEPLOY. Bind-mount cua Docker neo vao INODE, con `mv` tao inode moi — nen
# mot lan ghi thu hai SAU khi container da khoi dong se vo hinh voi no, va tien trinh giu ban cu
# vinh vien. Cung cai bay da lam Caddy chay cau hinh cu suot nam ngay (21/08/2026).
#
# TEP NAY KHONG MANG BI MAT. No duoc mount vao container nghiep vu va duoc doc lai boi cong cu thu
# bang chung, nen no chi chua danh tinh: khach nao, moi truong nao, commit nao, image nao, luc nao.
# ==================================================================================================
set -euo pipefail

destination="${1:?Usage: write-release-manifest.sh <destination>}"

: "${TENANT_SLUG:?}"
: "${DEPLOYMENT_ENVIRONMENT:?}"
: "${STACK_SLUG:?}"
: "${DEPLOYMENT_TARGET_ID:?}"
: "${APP_IMAGE:?}"
: "${FLOWISE_IMAGE:?}"
: "${TENANT_SCHEMA_VERSION:?}"
: "${RELEASE_WORKFLOW_RUN_ID:?}"
: "${RELEASE_DEPLOYED_AT:?}"
release_git_sha="${RELEASE_GIT_SHA:-}"

# SHA DAY DU, CHU THUONG. Tang doc (`resolveReleaseIdentity`) so sanh o dang chu thuong va tu choi
# moi thu khong du 40 ky tu; ghi ra mot ban khac dang la tu tay tao ra mot "xung dot" gia.
if [[ ! "$release_git_sha" =~ ^[a-f0-9]{40}$ ]]; then
  echo "RELEASE_GIT_SHA phai la SHA day du 40 ky tu chu thuong, dang la '${release_git_sha}'." >&2
  exit 64
fi
if [[ ! "$TENANT_SCHEMA_VERSION" =~ ^[0-9]+$ ]]; then
  echo "TENANT_SCHEMA_VERSION phai la so, dang la '${TENANT_SCHEMA_VERSION}'." >&2
  exit 64
fi

# DON XAC MOUNT CUA DOCKER, neu co.
#
# Compose mount `./.runtime/release.json` vao container. Khi Docker gap mot duong dan nguon CHUA
# TON TAI, no tao ra mot THU MUC rong trung ten. Cua so de dieu do xay ra rat hep nhung co that:
# mot lan deploy hong SAU khi compose.yaml moi da len dia nhung TRUOC khi manifest duoc ghi, roi
# VM khoi dong lai — systemd dua stack len bang compose moi, va thu muc ma xuat hien.
#
# Luc do `mv` ben duoi that bai voi "cannot overwrite directory" — mot thong bao khong noi duoc gi
# ve nguyen nhan. Don no o day de lan deploy ke tiep tu chua lanh.
#
# `rmdir` chu KHONG PHAI `rm -rf`: xac mount cua Docker luon RONG. Neu thu muc do co gi ben trong
# thi day khong phai tinh huong ta hieu, va dung lai on hon la xoa mot thu khong ro la gi.
if [[ -d "$destination" ]]; then
  echo "Don thu muc rong do Docker tao tai ${destination} (mount tro toi tep chua ton tai)." >&2
  rmdir -- "$destination"
fi

# Tep tam nam CUNG THU MUC voi dich: `mv` chi nguyen khoi khi hai ben cung mot he tep.
destination_dir="$(dirname -- "$destination")"
temporary="$(mktemp "${destination_dir}/release.XXXXXX")"
# Don tep tam o MOI duong thoat. Thu muc nay cung giu `rollback-release.json`, nen rac o day
# khong vo hai — no lam nguoi truc doc nham trang thai cua lan deploy.
trap 'rm -f -- "$temporary"' EXIT

printf '{"tenant":"%s","environment":"%s","stack":"%s","target":"%s","gitSha":"%s","appDigest":"%s","flowiseDigest":"%s","tenantSchemaVersion":%s,"workflowRunId":"%s","deployedAt":"%s"}\n' \
  "$TENANT_SLUG" "$DEPLOYMENT_ENVIRONMENT" "$STACK_SLUG" "$DEPLOYMENT_TARGET_ID" \
  "$release_git_sha" "$APP_IMAGE" "$FLOWISE_IMAGE" "$TENANT_SCHEMA_VERSION" \
  "$RELEASE_WORKFLOW_RUN_ID" "$RELEASE_DEPLOYED_AT" >"$temporary"

# 0644, KHONG phai 0600. Tep nay duoc mount vao container va phai doc duoc tu trong do. Ban cu de
# 0600 va song duoc chi vi image hien tai chay bang root — mot `USER` them vao Dockerfile sau nay
# se lam manifest tat tho trong im lang, va danh tinh lui ve du phong ma khong ai biet.
chmod 0644 "$temporary"
mv -f -- "$temporary" "$destination"
trap - EXIT
