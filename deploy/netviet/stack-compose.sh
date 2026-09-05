#!/usr/bin/env bash
# MOT NOI DUY NHAT SUY RA "STACK NAY GOM NHUNG GI".
#
# Duoc SOURCE, khong duoc chay: no chi dinh nghia hai ham.
#
# VI SAO CAN. Ho so trien khai quyet dinh Flowise co chay hay khong (xem
# `deploy/netviet/deployment-profiles.mjs`), va o tang VM dieu do the hien thanh HAI thu phai luon
# di cung nhau: co keo `compose.flowise.yaml` vao lenh `docker compose` khong, va co doi hoi dich
# vu/CSDL `flowise` ton tai khong. Ba script khac nhau can biet — `deploy-stack.sh` (rollout),
# `backup.sh` (dump + restore-check chay ngay sau moi lan deploy) va `health-check.sh` (timer chay
# mai mai) — nen neu moi script tu suy ra thi ba ban se lech nhau, va hai trong so do chay o
# nhung luc KHONG AI DANG NHIN.
#
# MAC DINH `on` KHI THIEU, VA DO LA HUONG AN TOAN. Mot `.runtime/secrets.env` render truoc ban nay
# khong co dong `FLOWISE_ENABLED`; coi no la `on` giu nguyen hanh vi cua moi stack dang chay. Doan
# nham theo chieu nguoc lai se lam mot stack that mat mot lop phu, tuc mat mot service dang phuc vu.

# Doc mot khoa tu `.runtime/secrets.env` cua thu muc dang dung (cwd = APP_DIR).
netviet_runtime_value() {
  sed -n "s/^$1=//p" .runtime/secrets.env | tail -n 1
}

# Dat `NETVIET_FLOWISE_ENABLED` (on|off) va `NETVIET_COMPOSE_FILES` (mang tham so `-f ...`).
netviet_load_stack_composition() {
  NETVIET_FLOWISE_ENABLED="$(netviet_runtime_value FLOWISE_ENABLED)"
  [[ -n "${NETVIET_FLOWISE_ENABLED}" ]] || NETVIET_FLOWISE_ENABLED='on'
  case "${NETVIET_FLOWISE_ENABLED}" in
    on | off) ;;
    *)
      echo "FLOWISE_ENABLED khong hop le trong secrets.env: '${NETVIET_FLOWISE_ENABLED}'." >&2
      return 65
      ;;
  esac
  NETVIET_COMPOSE_FILES=(-f compose.yaml)
  if [[ "${NETVIET_FLOWISE_ENABLED}" == 'on' ]]; then
    NETVIET_COMPOSE_FILES+=(-f compose.flowise.yaml)
  fi
}
