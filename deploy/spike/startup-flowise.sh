#!/bin/bash
# Startup script dung may do dau chan tai nguyen Flowise tren Ubuntu 24.04 (dich den that).
#
# DA CHAY THAT 28/07/2026 tren e2-standard-2 / asia-southeast1-b — ket qua do:
#   Flowise 3.1.2 = 1 container, 558 MB RAM luc ranh (Dify uoc luong 16 container / ~3.1 GB)
#   Toan may dung 1.374 GB ke ca OS + Docker; image 5.48 GB; dia dung 9.8 GB
#   Dung tu may trang den khi tra `pong`: 2 phut 40 giay
#   API tra 401 ngay tu dau (khong co man hinh cai dat kieu land-grab)
#
# Cach dung (project ultty-flowise-spike-2607 da khoa san firewall + service account):
#   gcloud compute instances create ultty-flowise-spike \
#     --project=ultty-flowise-spike-2607 --zone=asia-southeast1-b \
#     --machine-type=e2-standard-2 \
#     --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
#     --boot-disk-size=50GB --boot-disk-type=pd-balanced \
#     --service-account=spike-vm@ultty-flowise-spike-2607.iam.gserviceaccount.com \
#     --scopes=https://www.googleapis.com/auth/logging.write \
#     --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
#     --tags=spike --metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE \
#     --metadata-from-file=startup-script=deploy/spike/startup-flowise.sh
#
#   Vao may (KHONG mo cong 22 ra Internet — chi qua IAP):
#     gcloud compute ssh ultty-flowise-spike --project=ultty-flowise-spike-2607 \
#       --zone=asia-southeast1-b --tunnel-through-iap
#
#   Do lai:  sudo docker stats --no-stream
#   Xoa:     gcloud compute instances delete ultty-flowise-spike \
#              --project=ultty-flowise-spike-2607 --zone=asia-southeast1-b --quiet
#
# LUU Y: Flowise CHI lang nghe 127.0.0.1 -> khong phoi ra Internet; truy cap qua SSH tunnel.
set -euo pipefail
exec > >(tee -a /var/log/ultty-startup.log) 2>&1
echo "[ultty] bat dau $(date -Is)"

# Swap 2GB — anh GCP mac dinh KHONG co swap.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
  sysctl -p /etc/sysctl.d/99-swappiness.conf
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io jq

# Xoay log docker — day dia la kieu chet pho bien nhat cua may nho.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{"log-driver":"json-file","log-opts":{"max-size":"50m","max-file":"3"}}
JSON
systemctl enable --now docker
systemctl restart docker

# Chan container goi metadata server (chong SSRF / prompt-injection doat token service account).
iptables -I DOCKER-USER -d 169.254.169.254 -j DROP || true

docker volume create flowise-data >/dev/null
docker run -d --name flowise --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v flowise-data:/root/.flowise \
  flowiseai/flowise

echo "[ultty] cho Flowise san sang..."
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/v1/ping >/dev/null 2>&1; then break; fi
  sleep 5
done

echo "[ultty] HOAN TAT $(date -Is)"
touch /var/log/ultty-startup-done
