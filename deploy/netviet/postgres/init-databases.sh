#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${ZALO_DB_PASSWORD:?ZALO_DB_PASSWORD is required}"
: "${FLOWISE_DB_PASSWORD:?FLOWISE_DB_PASSWORD is required}"

psql --set=ON_ERROR_STOP=1 \
  --set=zalo_password="${ZALO_DB_PASSWORD}" \
  --set=flowise_password="${FLOWISE_DB_PASSWORD}" \
  --username "${POSTGRES_USER}" \
  --dbname postgres <<'EOSQL'
SELECT format('CREATE ROLE zalo LOGIN PASSWORD %L', :'zalo_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zalo')
\gexec

SELECT format('CREATE ROLE flowise LOGIN PASSWORD %L', :'flowise_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowise')
\gexec

SELECT 'CREATE DATABASE zalo OWNER zalo'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'zalo')
\gexec

SELECT 'CREATE DATABASE flowise OWNER flowise'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flowise')
\gexec
EOSQL
