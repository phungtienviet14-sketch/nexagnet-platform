#!/bin/bash
set -euo pipefail

TENANT_SLUG="${TENANT_SLUG:-ultty}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${TENANT_SLUG}}"
BACKUP_BUCKET="${BACKUP_BUCKET:-gs://netviet-host-968934832433-backups}"
DURATION_SECONDS="${DURATION_SECONDS:-86400}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-60}"

if ! [[ "${DURATION_SECONDS}" =~ ^[0-9]+$ ]] || ! [[ "${INTERVAL_SECONDS}" =~ ^[0-9]+$ ]]; then
  echo "DURATION_SECONDS va INTERVAL_SECONDS phai la so nguyen." >&2
  exit 1
fi

started="$(date -u +%Y%m%dT%H%M%SZ)"
report="${APP_DIR}/.runtime/soak-${started}.tsv"
deadline=$(( $(date +%s) + DURATION_SECONDS ))
failures=0
max_ram=0
max_disk=0

printf 'timestamp\tram_percent\tdisk_percent\thealth\n' >"${report}"
chmod 0600 "${report}"

while (( $(date +%s) < deadline )); do
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  total_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  available_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
  ram_percent=$(( (total_kb - available_kb) * 100 / total_kb ))
  disk_percent="$(df --output=pcent / | tail -n 1 | tr -dc '0-9')"
  health="ok"

  if ! "${APP_DIR}/health-check.sh" >/dev/null; then
    health="failed"
    failures=$((failures + 1))
  fi
  if (( ram_percent > max_ram )); then max_ram="${ram_percent}"; fi
  if (( disk_percent > max_disk )); then max_disk="${disk_percent}"; fi
  if (( ram_percent >= 85 || disk_percent >= 80 )); then
    health="resource-threshold"
    failures=$((failures + 1))
  fi

  printf '%s\t%s\t%s\t%s\n' "${timestamp}" "${ram_percent}" "${disk_percent}" "${health}" >>"${report}"
  sleep "${INTERVAL_SECONDS}"
done

printf 'summary\tmax_ram=%s\tmax_disk=%s\tfailures=%s\n' "${max_ram}" "${max_disk}" "${failures}" >>"${report}"
gcloud storage cp "${report}" "${BACKUP_BUCKET}/soak/"

if (( failures > 0 )); then
  logger --priority user.err --tag netviet-soak \
    "NETVIET_SOAK_FAILURE failures=${failures} max_ram=${max_ram} max_disk=${max_disk} report=${report}"
  exit 1
fi

logger --priority user.info --tag netviet-soak \
  "NETVIET_SOAK_OK max_ram=${max_ram} max_disk=${max_disk} report=${report}"
