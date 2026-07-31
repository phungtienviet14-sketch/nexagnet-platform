#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${ZALO_DB_PASSWORD:?ZALO_DB_PASSWORD is required}"
: "${FLOWISE_DB_PASSWORD:?FLOWISE_DB_PASSWORD is required}"

PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  --host 127.0.0.1 \
  --set=ON_ERROR_STOP=1 \
  --set=zalo_password="${ZALO_DB_PASSWORD}" \
  --set=flowise_password="${FLOWISE_DB_PASSWORD}" \
  --username "${POSTGRES_USER}" \
  --dbname postgres <<'EOSQL'
ALTER ROLE zalo WITH PASSWORD :'zalo_password';
ALTER ROLE flowise WITH PASSWORD :'flowise_password';
EOSQL
