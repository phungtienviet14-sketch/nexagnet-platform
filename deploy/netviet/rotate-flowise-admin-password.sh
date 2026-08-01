#!/bin/bash
set -euo pipefail
umask 077

if [[ "$#" -ne 2 ]]; then
  echo "Usage: $0 GCP_PROJECT_ID OLD_SECRET_VERSION" >&2
  exit 64
fi

project_id="$1"
old_version="$2"
base_url='http://127.0.0.1:3002'
app_dir='/srv/netviet/apps/zalo-ultty'

secret() {
  local name="$1"
  local version="${2:-latest}"
  gcloud secrets versions access "$version" --project "$project_id" --secret "$name"
}

email="$(secret zalo-ultty-flowise-admin-email)"
old_password="$(secret zalo-ultty-flowise-admin-password "$old_version")"
new_password="$(secret zalo-ultty-flowise-admin-password)"
# Cac version cu tao boi Windows PowerShell co CRLF. Compose da bo CR khi doc
# secrets.env, nen credential Flowise thuc te la gia tri sau khi bo mot CR cuoi.
email="${email%$'\r'}"
old_password="${old_password%$'\r'}"
new_password="${new_password%$'\r'}"
source "$app_dir/.runtime/secrets.env"

FLOWISE_BASE_URL="$base_url" \
FLOWISE_ADMIN_EMAIL="$email" \
FLOWISE_OLD_PASSWORD="$old_password" \
FLOWISE_NEW_PASSWORD="$new_password" \
docker run --rm --network host -i \
  -e FLOWISE_BASE_URL -e FLOWISE_ADMIN_EMAIL -e FLOWISE_OLD_PASSWORD -e FLOWISE_NEW_PASSWORD \
  "$APP_IMAGE" node --input-type=module - <<'NODE'
const baseUrl = process.env.FLOWISE_BASE_URL;
const email = process.env.FLOWISE_ADMIN_EMAIL;
const oldPassword = process.env.FLOWISE_OLD_PASSWORD;
const newPassword = process.env.FLOWISE_NEW_PASSWORD;

async function login(password) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) return null;
  const user = await response.json();
  const cookies = response.headers
    .getSetCookie()
    .map((value) => value.split(';', 1)[0])
    .join('; ');
  if (!user?.id || !cookies) throw new Error('Flowise login khong tra user/cookie.');
  return { user, cookies };
}

if (await login(newPassword)) {
  process.stdout.write('Flowise admin password da la secret moi.\n');
  process.exit(0);
}

const current = await login(oldPassword);
if (!current) throw new Error('Khong dang nhap duoc Flowise bang secret cu de rotate.');
const response = await fetch(`${baseUrl}/api/v1/user`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Cookie: current.cookies },
  body: JSON.stringify({
    id: current.user.id,
    oldPassword,
    newPassword,
    confirmPassword: newPassword,
  }),
});
if (!response.ok) {
  throw new Error(`Flowise password update HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}
process.stdout.write('Flowise admin password rotate thanh cong.\n');
NODE

old_password=''
new_password=''
