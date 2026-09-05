#!/bin/sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${ZALO_DB_PASSWORD:?ZALO_DB_PASSWORD is required}"

psql --set=ON_ERROR_STOP=1 \
  --set=zalo_password="${ZALO_DB_PASSWORD}" \
  --username "${POSTGRES_USER}" \
  --dbname postgres <<'EOSQL'
SELECT format('CREATE ROLE zalo LOGIN PASSWORD %L', :'zalo_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zalo')
\gexec

SELECT 'CREATE DATABASE zalo OWNER zalo'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'zalo')
\gexec
EOSQL

# VAI VA CSDL CUA FLOWISE — CHI tao khi stack nay that su chay Flowise.
#
# Truoc day `FLOWISE_DB_PASSWORD` la BAT BUOC (`:?`), nen mot stack khong chay Flowise khong khoi
# tao noi PostgreSQL CUA CHINH NO: script initdb chet, thu muc du lieu nam lai nua voi, va ca stack
# khong bao gio len. Do la mot phu thuoc CHEO — mot he thong con khong duoc bat lai chan duoc lop
# luu tru nen tang, tuc dung hinh dang rang buoc ma `compose.flowise.yaml` vua thao ra o tang tren.
#
# KHONG tao vai `flowise` voi mat khau rong: do se la mot tai khoan CSDL khong ai so huu. Khong co
# Flowise thi khong co vai va khong co CSDL. Voi stack CO Flowise, hai lenh duoi day y het ban
# truoc — cung `NOT EXISTS`, cung chu so huu, cung thu tu.
#
# GIOI HAN DA BIET: `docker-entrypoint-initdb.d` chi chay khi thu muc du lieu con RONG. Bat Flowise
# cho mot stack DA khoi tao se khong tu sinh vai — phai `CREATE ROLE` bang tay.
if [ -n "${FLOWISE_DB_PASSWORD:-}" ]; then
  psql --set=ON_ERROR_STOP=1 \
    --set=flowise_password="${FLOWISE_DB_PASSWORD}" \
    --username "${POSTGRES_USER}" \
    --dbname postgres <<'EOSQL'
SELECT format('CREATE ROLE flowise LOGIN PASSWORD %L', :'flowise_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowise')
\gexec

SELECT 'CREATE DATABASE flowise OWNER flowise'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'flowise')
\gexec
EOSQL
else
  echo 'init-databases: FLOWISE_DB_PASSWORD trong — bo qua vai/CSDL flowise (stack khong chay Flowise).' >&2
fi
