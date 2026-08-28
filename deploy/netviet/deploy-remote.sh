#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 5 || "$#" -gt 7 ]]; then
  echo "Usage: $0 GCP_PROJECT_ID APP_IMAGE FLOWISE_IMAGE BACKUP_BUCKET PUBLIC_IP [TENANT_SLUG] [DEPLOYMENT_ENVIRONMENT]" >&2
  exit 64
fi

gcp_project_id="$1"
app_image="$2"
flowise_image="$3"
backup_bucket="$4"
public_ip="$5"
# Slug khach quyet dinh thu muc stack. Mac dinh 'ultty' giu nguyen hanh vi cua moi lan deploy truoc
# thay doi nay — deploy.ps1 chua truyen tham so thu 6 van ra dung stack no van deploy tu truoc.
tenant_slug="${6:-ultty}"
deployment_environment="${7:-legacy}"
# STACK SLUG quyet dinh HA TANG (thu muc, compose project => volume, mang, unit systemd);
# tenant slug chi chon GOI KHACH duoc mount vao. Voi dev/production/legacy hai gia tri bang nhau,
# nen stack dang chay khong phai di chuyen gi. Quy tac suy ra nam trong stack-identity.mjs va
# duoc deploy-ci.sh truyen xuong; lap lai o day de duong goi tay khong roi ve sai stack.
case "${deployment_environment}" in
  dev|production|legacy) derived_stack_slug="${tenant_slug}" ;;
  *) derived_stack_slug="${tenant_slug}-${deployment_environment}" ;;
esac
stack_slug="${STACK_SLUG:-${derived_stack_slug}}"
[[ "${stack_slug}" == "${derived_stack_slug}" ]] || {
  echo "STACK_SLUG '${stack_slug}' khong khop quy tac cho ${tenant_slug}/${deployment_environment}." >&2
  exit 64
}
deployment_target_id="${DEPLOYMENT_TARGET_ID:-legacy-default}"
release_git_sha="${RELEASE_GIT_SHA:-0000000000000000000000000000000000000000}"
release_workflow_run_id="${RELEASE_WORKFLOW_RUN_ID:-0}"
# MOT MOC THOI GIAN CHO CA LAN DEPLOY. Truoc 26/08/2026 co hai loi goi `date` cach nhau ca lan
# deploy — mot cho bien moi truong, mot cho manifest — nen hai nguon noi hai moc khac nhau, va moi
# phep doi chieu giua chung deu vo nghia.
release_deployed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rollback_app_image="${ROLLBACK_APP_IMAGE:-}"
# Lan release DAU TIEN cua mot stack khong co anh cu de quay ve, nen khong the doi rollback digest.
# deploy-ci.sh suy ra tu preflight roi truyen xuong; mac dinh 0 = coi nhu da co ban truoc do, tuc
# la SIET chat hon, nen mot bien bi mat khong the lam yeu cong nay.
first_release="${GD1_FIRST_RELEASE:-0}"
rollback_flowise_image="${ROLLBACK_FLOWISE_IMAGE:-}"
[[ "$tenant_slug" =~ ^[a-z0-9-]+$ ]] || {
  echo "TENANT_SLUG khong hop le: '$tenant_slug'." >&2
  exit 64
}
[[ "$deployment_environment" =~ ^[a-z0-9-]+$ ]] || {
  echo "DEPLOYMENT_ENVIRONMENT khong hop le: '$deployment_environment'." >&2
  exit 64
}
[[ "$stack_slug" =~ ^[a-z0-9-]+$ ]] || {
  echo "STACK_SLUG khong hop le: '$stack_slug'." >&2
  exit 64
}
[[ "$deployment_target_id" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || {
  echo "DEPLOYMENT_TARGET_ID khong hop le: '$deployment_target_id'." >&2
  exit 64
}
[[ "$release_git_sha" =~ ^[a-f0-9]{40}$ ]] || {
  echo 'RELEASE_GIT_SHA phai la full SHA.' >&2
  exit 64
}
[[ "$release_workflow_run_id" =~ ^[0-9]+$ ]] || {
  echo 'RELEASE_WORKFLOW_RUN_ID phai la so.' >&2
  exit 64
}
if [[ "$deployment_environment" == 'gd1-test' && "$first_release" != '1' ]]; then
  for digest in "$rollback_app_image" "$rollback_flowise_image"; do
    [[ "$digest" =~ @sha256:[a-f0-9]{64}$ ]] || {
      echo 'GD1-test bat buoc co rollback digest cho ca app va Flowise.' >&2
      exit 1
    }
  done
fi
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
remote_parent="$(dirname "$source_dir")"
# MOI STACK MOT THU MUC. Voi stack slug 'ultty' duong dan nay bang y het duong dan cu, nen stack
# dang chay khong phai di chuyen gi; 'ultty-gd1-test' ra mot thu muc hoan toan khac.
app_dir="/srv/netviet/apps/zalo-${stack_slug}"
edge_dir='/srv/netviet/edge'

[[ "$source_dir" =~ ^/tmp/netviet-deploy-[0-9]+/netviet$ ]]
[[ "$remote_parent" =~ ^/tmp/netviet-deploy-[0-9]+$ ]]

install -d -m 0750 "$app_dir/.runtime"
install -d -m 0700 "$app_dir/.runtime/zalo"
rsync -a --exclude '.runtime' --exclude 'tenant-pack' "$source_dir/" "$app_dir/"

# GOI KHACH. Khong nam trong image (.dockerignore loai `tenants/`) vi image la ban CHUNG cho moi
# khach — mot goi nam trong do nghia la khach nay `docker save` ra la doc duoc gia si cua khach kia.
# deploy.ps1 upload rieng goi cua dung stack nay; compose mount vao api/web o che do chi-doc.
# `gcloud compute scp --recurse SRC DEST` theo dung ngu nghia scp: DEST CHUA co -> tao DEST la ban
# sao cua SRC; DEST DA co -> chep SRC VAO TRONG DEST. Deploy co retry, nen mot lan scp hong giua
# chung (SSH rot — da gap 13/08/2026) roi thu lai se cho ra `tenant-pack/<slug>/tenant.json` thay vi
# `tenant-pack/tenant.json`. Truoc day ca lan deploy chet o day, sau khi da build va day image xong.
# Go phang lai thay vi bo cuoc: du lieu van day du, chi la long them mot cap thu muc.
if [[ ! -f "$remote_parent/tenant-pack/tenant.json" ]]; then
  nested="$(find "$remote_parent/tenant-pack" -mindepth 2 -maxdepth 2 -name tenant.json -printf '%h\n' 2>/dev/null | head -n 1)"
  if [[ -n "$nested" ]]; then
    echo "Goi khach bi long trong $nested (scp chay lai) — go phang." >&2
    mv "$nested" "$remote_parent/tenant-pack.flat"
    rm -rf "$remote_parent/tenant-pack"
    mv "$remote_parent/tenant-pack.flat" "$remote_parent/tenant-pack"
  fi
fi
if [[ ! -f "$remote_parent/tenant-pack/tenant.json" ]]; then
  echo "Thieu goi khach tai $remote_parent/tenant-pack — api/web se khong boot duoc." >&2
  exit 1
fi
install -d -m 0750 "$app_dir/tenant-pack"
rsync -a --delete "$remote_parent/tenant-pack/" "$app_dir/tenant-pack/"
tenant_schema_version="$(sed -n 's/^[[:space:]]*"schemaVersion"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$app_dir/tenant-pack/tenant.json" | head -n 1)"
[[ "$tenant_schema_version" =~ ^[0-9]+$ ]] || {
  echo 'Khong doc duoc tenant schemaVersion de ghi release identity.' >&2
  exit 1
}

if [[ "$deployment_environment" == 'gd1-test' ]]; then
  rollback_file="$(mktemp "${app_dir}/.runtime/rollback.XXXXXX")"
  if [[ "$first_release" == '1' ]]; then
    # STACK MOI THI KHONG CO ANH DE QUAY VE. De trong hai digest ma khong noi gi se bi doc thanh
    # "chua kip ghi"; cau nay noi thang la khong co, va duong lui la GO STACK XUONG.
    printf '{"tenant":"%s","environment":"%s","stack":"%s","target":"%s","firstRelease":true,"rollback":"tear down this stack; no previous image exists","capturedAt":"%s"}\n' \
      "$tenant_slug" "$deployment_environment" "$stack_slug" "$deployment_target_id" \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      >"$rollback_file"
  else
    printf '{"tenant":"%s","environment":"%s","stack":"%s","target":"%s","appDigest":"%s","flowiseDigest":"%s","capturedAt":"%s"}\n' \
      "$tenant_slug" "$deployment_environment" "$stack_slug" "$deployment_target_id" \
      "$rollback_app_image" "$rollback_flowise_image" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      >"$rollback_file"
  fi
  chmod 0600 "$rollback_file"
  mv -f -- "$rollback_file" "$app_dir/.runtime/rollback-release.json"
fi

# ANH CATALOG SAN PHAM. Cung ly do di ngoai image nhu goi khach (anh cua tung khach, image la ban
# chung), nhung KHAC o cho: thieu goi khach thi api khong boot duoc, con thieu anh thi he thong van
# chay — chi la tu van gui di khong kem anh. Nen o day CANH BAO chu khong `exit 1`: chan ca lan
# deploy vi thieu anh la doi mot su co nho lay mot su co lon.
install -d -m 0750 "$app_dir/catalog-assets"
# Cung cai bay long thu muc nhu tenant-pack: deploy.ps1 phai tao san DEST (pscp tu choi DEST vang
# mat), ma `scp --recurse SRC DEST-DA-CO` thi chep SRC VAO TRONG DEST -> `catalog-assets/catalog-assets/`.
catalog_src="$remote_parent/catalog-assets"
[[ -d "$catalog_src/catalog-assets" ]] && catalog_src="$catalog_src/catalog-assets"
if [[ -d "$catalog_src" ]] && [[ -n "$(ls -A "$catalog_src" 2>/dev/null)" ]]; then
  rsync -a --delete "$catalog_src/" "$app_dir/catalog-assets/"
  echo "Anh catalog: $(find "$app_dir/catalog-assets" -type f | wc -l) tep." >&2
else
  echo "Khong co anh catalog — tu van se gui khong kem anh." >&2
fi
chmod 0750 "$app_dir/"*.sh "$app_dir/postgres/"*.sh

# --- CHUYEN TIEP TU BO CUC MOT-KHACH -------------------------------------------------------------
# Ban cu chay Caddy BEN TRONG compose project cua khach, va container do dang giu :80/:443. Compose
# khong tu don no khi service bien mat khoi file, nen edge se khong bind duoc cong va ca lan deploy
# chet o buoc dung edge. Tim theo NHAN compose (khong theo ten container) roi go dung no.
legacy_gateway="$(docker ps -aq \
  --filter "label=com.docker.compose.project=zalo-${stack_slug}" \
  --filter "label=com.docker.compose.service=gateway" || true)"
if [[ -n "${legacy_gateway}" ]]; then
  echo "Go gateway cu nam trong stack khach (giu :80/:443) truoc khi dung edge." >&2
  docker rm -f ${legacy_gateway}
fi

# Unit khong-template cua ban cu van con `enable` tren VM va van tro vao cung thu muc, nen neu de
# lai thi moi nhip timer se co hai tien trinh cung lam mot viec. Ban moi la `netviet-*@<slug>`.
for legacy_unit in netviet-stack.service netviet-backup.timer netviet-backup.service \
  netviet-health.timer netviet-health.service netviet-soak.service; do
  if systemctl list-unit-files "${legacy_unit}" --no-legend 2>/dev/null | grep -q .; then
    systemctl disable --now "${legacy_unit}" >/dev/null 2>&1 || true
    rm -f "/etc/systemd/system/${legacy_unit}"
  fi
done

# --- TANG EDGE DUNG CHUNG ------------------------------------------------------------------------
# Mang `netviet-edge` la mat phang duy nhat noi edge toi api/web/flowise cua tung khach. Tao o day,
# TRUOC ca hai stack, nen thu tu dung stack nao truoc khong con quan trong (ca hai khai `external`).
docker network inspect netviet-edge >/dev/null 2>&1 || docker network create netviet-edge
install -d -m 0750 "$edge_dir"
install -d -m 0750 "$edge_dir/tenants"
install -d -m 0750 "$edge_dir/.runtime"
# `--exclude tenants` va `--exclude .runtime`: manh cau hinh cua CAC KHACH KHAC dang nam trong do.
# Dong bo dap len se xoa mat khach khac moi lan mot khach duoc deploy.
# `--inplace` KHONG phai toi uu toc do — no la dieu kien de cau hinh moi toi duoc Caddy.
#
# `Caddyfile` duoc bind-mount theo TUNG FILE (`./Caddyfile:/etc/caddy/Caddyfile:ro`), ma Docker
# neo mot bind-mount file vao INODE chu khong vao duong dan. `rsync` mac dinh ghi file tam roi
# `rename` de len — tuc tao INODE MOI — nen container van doc inode CU va khong bao gio thay noi
# dung moi. Khong co loi nao duoc in ra: rsync bao thanh cong, file tren host dung, `caddy reload`
# tra ve 0, va route moi thi khong ton tai.
#
# Do chinh xac cai da xay ra 21/08/2026 khi them route `/observability/traces*`:
#   host      -> grep -c observability = 1
#   container -> grep -c observability = 0
# Cung mot duong dan, khac noi dung.
#
# `--inplace` ghi de NGAY TREN inode dang co, nen container thay ngay. Luu y: lan dau chuyen sang
# `--inplace` van can container duoc tao lai MOT LAN, vi no dang giu inode cu tu truoc do.
rsync -a --inplace --exclude 'tenants' --exclude '.runtime' "$source_dir/edge/" "$edge_dir/"

cp "$app_dir/systemd/"*.service "$app_dir/systemd/"*.timer /etc/systemd/system/
systemctl daemon-reload
# UNIT THEO KHACH (`@<slug>`): moi khach mot instance rieng, nen dung mot stack khong dung toi
# khach khac. `%i` trong unit template la slug.
systemctl enable --now "netviet-backup@${stack_slug}.timer" "netviet-health@${stack_slug}.timer"
# netviet-stack@<slug>.service: `enable` (khong `--now`) — deploy-stack.sh ngay duoi day tu dua
# stack len; unit chi can co mat de lan reboot sau tu chay lai `docker compose up -d`.
systemctl enable "netviet-stack@${stack_slug}.service"
systemctl enable --now netviet-edge.service

env \
  GCP_PROJECT_ID="$gcp_project_id" \
  APP_IMAGE="$app_image" \
  FLOWISE_IMAGE="$flowise_image" \
  PUBLIC_IP="$public_ip" \
  BACKUP_BUCKET="$backup_bucket" \
  TENANT_SLUG="$tenant_slug" \
  STACK_SLUG="$stack_slug" \
  APP_DIR="$app_dir" \
  EDGE_DIR="$edge_dir" \
  PRIMARY_TENANT="${PRIMARY_TENANT:-ultty}" \
  DEPLOYMENT_ENVIRONMENT="$deployment_environment" \
  WORKFLOW_ENGINE="${WORKFLOW_ENGINE:-off}" \
  OBSERVABILITY_STACK="${OBSERVABILITY_STACK:-off}" \
  RELEASE_GIT_SHA="$release_git_sha" \
  RELEASE_DEPLOYED_AT="$release_deployed_at" \
  "$app_dir/render-secrets.sh"

# Edge phai len TRUOC stack khach: deploy-stack.sh ket thuc bang smoke test qua HTTPS cong khai,
# ma duong do di xuyen edge.
(cd "$edge_dir" && docker compose --env-file .runtime/caddy.env -f compose.yaml up -d)

# NAP LAI CAU HINH CADDY — bat buoc, khong phai tuy chon.
#
# `Caddyfile` duoc BIND-MOUNT (`./Caddyfile:/etc/caddy/Caddyfile:ro`). Doi NOI DUNG mot file mount
# KHONG lam doi spec cua compose, nen `docker compose up -d` o tren coi container la da dung va
# KHONG restart no. Ket qua: rsync chep Caddyfile moi len VM thanh cong, nhung Caddy van chay cau
# hinh cu — im lang, khong bao loi.
#
# Da can that ngay 21/08/2026: them route `/observability/traces*`, file tren VM co du route, ma
# endpoint van tra 404 trang Next.js; `docker inspect` cho thay container Caddy khoi dong tu
# 16/08, tuc dang chay cau hinh cua nam ngay truoc.
#
# `caddy reload` nap nong, khong dut ket noi — quan trong vi edge nay dung chung cho MOI khach.
# Loi reload KHONG duoc lam do ca lan deploy: cau hinh cu van dang phuc vu, va mot route moi thieu
# thi nhe hon mot lan deploy bi danh dau that bai sau khi stack khach da len xong.
if ! docker exec netviet-edge-gateway-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
  echo 'CANH BAO: nap lai Caddy that bai — route moi (neu co) chua co hieu luc.' >&2
  echo 'Kiem tra: docker exec netviet-edge-gateway-1 caddy validate --config /etc/caddy/Caddyfile' >&2
fi

# NOI LAI EDGE VOI MANG CUA MOI KHACH — khong chi khach dang deploy.
#
# `deploy-stack.sh` co `docker network connect` nhung chi cho STACK DANG DEPLOY. Do la du khi edge
# song lien tuc; no KHONG du khi container edge bi tao lai, vi tao lai container lam RUNG het cac
# network attachment — va cac khach KHAC thi khong co lan deploy nao de tu noi lai.
#
# Hau qua da xay ra that 21/08/2026: mot lan `--force-recreate gateway` lam CA BON stack tra 502
# cung luc (`ultty`, `ultty-gd1-test`, `wata`, `amico`), vi edge khong con duong vao silo nao.
#
# Quet theo mang `zalo-*_backend` dang ton tai thay vi giu mot danh sach khach cung trong script:
# mot danh sach cung se lac hau ngay lan len khach tiep theo.
for backend_network in $(docker network ls --filter 'name=^zalo-.*_backend$' --format '{{.Name}}'); do
  # Da noi roi thi lenh bao loi; buoc nay idempotent nen nuot loi do (giong deploy-stack.sh).
  docker network connect "$backend_network" netviet-edge-gateway-1 2>/dev/null || true
done

# DANH TINH BAN PHAT HANH cho bao cao tin hieu deploy. Phat o DAY chu khong o `deploy-stack.sh`:
# chi tang nay biet ca digest lan git SHA, va bao cao phai co danh tinh KE CA khi stack chet ngay
# o buoc dau — mot bao cao khong noi duoc "ban nao" thi khong dung duoc de quyet dinh rollback.
printf '##DEPLOY-SIGNAL## {"layer":"meta","tenant":"%s","environment":"%s","stack":"%s","gitSha":"%s","appDigest":"%s","flowiseDigest":"%s","workflowRunId":"%s"}\n' \
  "$tenant_slug" "$deployment_environment" "$stack_slug" "$release_git_sha" \
  "$app_image" "$flowise_image" "$release_workflow_run_id"

# DANH TINH RELEASE PHAI CO MAT TRUOC KHI CONTAINER KHOI DONG.
#
# `deploy-stack.sh` ngay duoi day chay `docker compose up`, va compose mount tep nay `:ro` vao
# `api` cung cac worker. Hai he qua neu ghi SAU, nhu ban truoc 26/08/2026:
#   · tep chua ton tai -> Docker tao mot THU MUC trung ten, hong ca mount lan lan ghi ke tiep;
#   · tep con ban cu   -> tien trinh doc dung ban phat hanh TRUOC, va khong ai biet.
#
# Ghi them mot lan nua SAU khi container da len KHONG cuu duoc gi: bind-mount cua Docker neo vao
# INODE, con `mv` tao inode moi — nen tien trinh se giu ban cu vinh vien. Do la ly do o day chi co
# DUNG MOT loi goi, va `release-identity.contract.test.mjs` khoa ca so lan lan thu tu.
env \
  TENANT_SLUG="$tenant_slug" \
  DEPLOYMENT_ENVIRONMENT="$deployment_environment" \
  STACK_SLUG="$stack_slug" \
  DEPLOYMENT_TARGET_ID="$deployment_target_id" \
  APP_IMAGE="$app_image" \
  FLOWISE_IMAGE="$flowise_image" \
  TENANT_SCHEMA_VERSION="$tenant_schema_version" \
  RELEASE_GIT_SHA="$release_git_sha" \
  RELEASE_WORKFLOW_RUN_ID="$release_workflow_run_id" \
  RELEASE_DEPLOYED_AT="$release_deployed_at" \
  "$app_dir/write-release-manifest.sh" "$app_dir/.runtime/release.json"

env TENANT_SLUG="$tenant_slug" STACK_SLUG="$stack_slug" APP_DIR="$app_dir" EDGE_DIR="$edge_dir" "$app_dir/deploy-stack.sh"
env VERIFY_RESTORE=1 BACKUP_BUCKET="$backup_bucket" STACK_SLUG="$stack_slug" APP_DIR="$app_dir" "$app_dir/backup.sh"
systemctl start --no-block "netviet-soak@${stack_slug}.service"
rm -rf -- "$remote_parent"
