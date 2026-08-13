#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 5 ]]; then
  echo "Usage: $0 GCP_PROJECT_ID APP_IMAGE FLOWISE_IMAGE BACKUP_BUCKET PUBLIC_IP" >&2
  exit 64
fi

gcp_project_id="$1"
app_image="$2"
flowise_image="$3"
backup_bucket="$4"
public_ip="$5"
source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
remote_parent="$(dirname "$source_dir")"
app_dir='/srv/netviet/apps/zalo-ultty'

[[ "$source_dir" =~ ^/tmp/netviet-deploy-[0-9]+/netviet$ ]]
[[ "$remote_parent" =~ ^/tmp/netviet-deploy-[0-9]+$ ]]

install -d -m 0750 "$app_dir/.runtime"
install -d -m 0700 "$app_dir/.runtime/zalo"
rsync -a --exclude '.runtime' --exclude 'tenant-pack' "$source_dir/" "$app_dir/"

# GOI KHACH. Khong nam trong image (.dockerignore loai `tenants/`) vi image la ban CHUNG cho moi
# khach — mot goi nam trong do nghia la khach nay `docker save` ra la doc duoc gia si cua khach kia.
# deploy.ps1 upload rieng goi cua dung stack nay; compose mount vao api/web o che do chi-doc.
if [[ ! -f "$remote_parent/tenant-pack/tenant.json" ]]; then
  echo "Thieu goi khach tai $remote_parent/tenant-pack — api/web se khong boot duoc." >&2
  exit 1
fi
install -d -m 0750 "$app_dir/tenant-pack"
rsync -a --delete "$remote_parent/tenant-pack/" "$app_dir/tenant-pack/"
chmod 0750 "$app_dir/"*.sh "$app_dir/postgres/"*.sh
cp "$app_dir/systemd/"*.service "$app_dir/systemd/"*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now netviet-backup.timer netviet-health.timer
# netviet-stack.service: `enable` (khong `--now`) — deploy-stack.sh ngay duoi day tu dua stack len;
# unit chi can co mat de lan reboot sau tu chay lai `docker compose up -d`.
systemctl enable netviet-stack.service
env \
  GCP_PROJECT_ID="$gcp_project_id" \
  APP_IMAGE="$app_image" \
  FLOWISE_IMAGE="$flowise_image" \
  PUBLIC_IP="$public_ip" \
  BACKUP_BUCKET="$backup_bucket" \
  "$app_dir/render-secrets.sh"
"$app_dir/deploy-stack.sh"
env VERIFY_RESTORE=1 BACKUP_BUCKET="$backup_bucket" "$app_dir/backup.sh"
systemctl start --no-block netviet-soak.service
rm -rf -- "$remote_parent"
