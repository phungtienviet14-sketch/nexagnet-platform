#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-ultty}"
cd "${APP_DIR}"

COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml)
failure=""
STATE_FILE="${APP_DIR}/.runtime/health-restarts"
declare -A previous_restarts=()

if [[ -s "${STATE_FILE}" ]]; then
  while IFS='=' read -r service count; do
    if [[ "${service}" =~ ^(postgres|flowise|api|web|gateway)$ ]] && [[ "${count}" =~ ^[0-9]+$ ]]; then
      previous_restarts["${service}"]="${count}"
    fi
  done <"${STATE_FILE}"
fi

next_state="$(mktemp "${APP_DIR}/.runtime/health-restarts.XXXXXX")"
trap 'rm -f -- "${next_state}"' EXIT

# TU KHOI PHUC truoc khi bao loi: service nao khong con container hoac dang stop thi dua len lai.
# `--no-recreate` khong dung toi container dang chay -> chay trung luc deploy cung khong pha.
# Van GHI LOG moi lan phai chua de khong che giau su co lap di lap lai.
healed=""
for service in postgres flowise api web gateway; do
  container_id="$("${COMPOSE[@]}" ps -q "${service}")"
  if [[ -z "${container_id}" ]] || \
    [[ "$(docker inspect --format '{{.State.Status}}' "${container_id}")" != "running" ]]; then
    healed="${healed} ${service}"
  fi
done
if [[ -n "${healed}" ]]; then
  logger --priority user.warning --tag netviet-health "NETVIET_HEALTH_HEAL${healed}"
  echo "NETVIET_HEALTH_HEAL${healed}" >&2
  "${COMPOSE[@]}" up -d --no-recreate >/dev/null 2>&1 || true
  sleep 15
fi

if ! curl -fsS --max-time 10 http://127.0.0.1:8080/health >/dev/null; then
  failure="gateway health endpoint failed"
fi

for service in postgres flowise api web gateway; do
  container_id="$("${COMPOSE[@]}" ps -q "${service}")"
  if [[ -z "${container_id}" ]]; then
    failure="${failure} ${service}=missing"
    continue
  fi

  state="$(docker inspect --format '{{.State.Status}}' "${container_id}")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"
  restart_count="$(docker inspect --format '{{.RestartCount}}' "${container_id}")"
  previous="${previous_restarts[$service]:-$restart_count}"
  printf '%s=%s\n' "${service}" "${restart_count}" >>"${next_state}"

  if [[ "${state}" != "running" ]] || [[ "${health}" == "unhealthy" ]] || (( restart_count > previous )); then
    failure="${failure} ${service}=state:${state},health:${health},restarts:${restart_count}"
  fi
done

chmod 0600 "${next_state}"
mv -f -- "${next_state}" "${STATE_FILE}"
trap - EXIT

if [[ -n "${failure}" ]]; then
  message="NETVIET_HEALTH_FAILURE${failure}"
  logger --priority user.err --tag netviet-health "${message}"
  echo "${message}" >&2
  exit 1
fi

echo "NETVIET_HEALTH_OK"
