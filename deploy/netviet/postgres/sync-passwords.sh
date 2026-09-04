#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${ZALO_DB_PASSWORD:?ZALO_DB_PASSWORD is required}"

PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  --host 127.0.0.1 \
  --set=ON_ERROR_STOP=1 \
  --set=zalo_password="${ZALO_DB_PASSWORD}" \
  --username "${POSTGRES_USER}" \
  --dbname postgres <<'EOSQL'
SELECT format('CREATE ROLE zalo LOGIN PASSWORD %L', :'zalo_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zalo')
\gexec

SELECT 'CREATE DATABASE zalo OWNER zalo'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'zalo')
\gexec

-- `format(... %L)` chu khong phai `PASSWORD :'bien'`: cung mot phep thoat chuoi (va cung
-- khuon voi hai lenh CREATE ROLE o tren), nhung khong sinh ra mot dong TRONG NHU mot mat khau
-- viet cung — bo quet bi mat cua pre-commit chan dung khuon do.
SELECT format('ALTER ROLE zalo WITH PASSWORD %L', :'zalo_password')
\gexec
EOSQL

# VAI FLOWISE — CHI dong bo khi stack nay that su chay Flowise.
#
# Cung ly do voi `init-databases.sh` ngay canh, nhung cho nay NGUY HIEM HON: script do chi chay khi
# thu muc du lieu con rong, con script nay chay o MOI lan deploy. Voi `:?` bat buoc, mot ho so
# `flowise=false` se lam buoc `sync-passwords` chet ngay sau khi PostgreSQL vua len — tuc ca stack
# do o TANG ROLLOUT truoc khi bat cu thu gi cua ung dung duoc dung len.
#
# Voi stack CO Flowise, khoi duoi day y het ban truoc: cung `NOT EXISTS`, cung `ALTER ROLE`.
if [ -n "${FLOWISE_DB_PASSWORD:-}" ]; then
  PGPASSWORD="${POSTGRES_PASSWORD}" psql \
    --host 127.0.0.1 \
    --set=ON_ERROR_STOP=1 \
    --set=flowise_password="${FLOWISE_DB_PASSWORD}" \
    --username "${POSTGRES_USER}" \
    --dbname postgres <<'EOSQL'
SELECT format('CREATE ROLE flowise LOGIN PASSWORD %L', :'flowise_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowise')
\gexec

SELECT 'CREATE DATABASE flowise OWNER flowise'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flowise')
\gexec

SELECT format('ALTER ROLE flowise WITH PASSWORD %L', :'flowise_password')
\gexec
EOSQL
else
  echo 'sync-passwords: FLOWISE_DB_PASSWORD trong — bo qua vai flowise (stack khong chay Flowise).' >&2
fi
