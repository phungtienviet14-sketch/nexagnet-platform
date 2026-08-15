#!/bin/bash
set -euo pipefail

TENANT_SLUG="${TENANT_SLUG:-ultty}"
APP_DIR="${APP_DIR:-/srv/netviet/apps/zalo-${TENANT_SLUG}}"
cd "${APP_DIR}"

# Cung khoa voi deploy-stack.sh. Dang deploy thi BO QUA nhip nay: container len xuong la co chu y,
# bao loi luc do chi la nhieu — va quan trong hon, chay `compose up` chen vao giua deploy lam
# deploy chet ("removal of container ... is already in progress", su co 04/08/2026).
exec 9>"${APP_DIR}/.runtime/compose.lock"
if ! flock -n 9; then
  echo "NETVIET_HEALTH_SKIP dang co tien trinh compose khac (deploy/rollback) chay" >&2
  exit 0
fi

COMPOSE=(docker compose --env-file .runtime/secrets.env -f compose.yaml)
failure=""
STATE_FILE="${APP_DIR}/.runtime/health-restarts"
declare -A previous_restarts=()

if [[ -s "${STATE_FILE}" ]]; then
  while IFS='=' read -r service count; do
    if [[ "${service}" =~ ^(postgres|flowise|api|web)$ ]] && [[ "${count}" =~ ^[0-9]+$ ]]; then
      previous_restarts["${service}"]="${count}"
    fi
  done <"${STATE_FILE}"
fi

next_state="$(mktemp "${APP_DIR}/.runtime/health-restarts.XXXXXX")"
trap 'rm -f -- "${next_state}"' EXIT

# TU KHOI PHUC truoc khi bao loi: service nao khong con container hoac dang stop thi dua len lai.
# An toan vi da giu khoa compose o tren (khong con chay chong len deploy).
# Van GHI LOG moi lan phai chua de khong che giau su co lap di lap lai.
healed=""
for service in postgres flowise api web; do
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

# Kiem qua HOSTNAME CUA CHINH KHACH NAY, khong qua 127.0.0.1:8080. Sau khi tach edge, :8080 la
# suc khoe cua rieng edge — no xanh ke ca khi api cua khach nay chet, nen dung no o day thi timer
# se bao "khoe" cho mot stack da hong. `--resolve` de khong phu thuoc DNS ra ngoai.
operator_domain="$(sed -n 's/^OPERATOR_DOMAIN=//p' .runtime/secrets.env | tail -n 1)"
if [[ ! "${operator_domain}" =~ ^[a-z0-9.-]+$ ]]; then
  failure="OPERATOR_DOMAIN khong doc duoc tu secrets.env"
elif ! curl -fsS --max-time 10 --resolve "${operator_domain}:443:127.0.0.1" \
  "https://${operator_domain}/health" >/dev/null; then
  failure="health endpoint cua khach ${TENANT_SLUG} that bai"
fi

for service in postgres flowise api web; do
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
