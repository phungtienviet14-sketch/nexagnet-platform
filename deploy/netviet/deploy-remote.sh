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
rsync -a --exclude '.runtime' "$source_dir/" "$app_dir/"
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
  "$app_dir/render-secrets.sh"
"$app_dir/deploy-stack.sh"
env VERIFY_RESTORE=1 BACKUP_BUCKET="$backup_bucket" "$app_dir/backup.sh"
systemctl start --no-block netviet-soak.service
rm -rf -- "$remote_parent"
