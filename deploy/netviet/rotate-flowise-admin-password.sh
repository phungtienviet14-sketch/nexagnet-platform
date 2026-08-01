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
runtime_dir="$(mktemp -d)"
trap 'rm -rf -- "$runtime_dir"' EXIT

secret() {
  local name="$1"
  local version="${2:-latest}"
  gcloud secrets versions access "$version" --project "$project_id" --secret "$name"
}

email="$(secret zalo-ultty-flowise-admin-email)"
old_password="$(secret zalo-ultty-flowise-admin-password "$old_version")"
new_password="$(secret zalo-ultty-flowise-admin-password)"

login() {
  local password="$1"
  printf '%s\0%s' "$email" "$password" | python3 -c '
import json, sys
email, password = sys.stdin.buffer.read().decode().split("\0", 1)
print(json.dumps({"email": email, "password": password}))
' >"$runtime_dir/login.json"
  curl -fsS -c "$runtime_dir/cookies.txt" \
    -H 'Content-Type: application/json' \
    --data-binary @"$runtime_dir/login.json" \
    "$base_url/api/v1/auth/login" >"$runtime_dir/login-response.json"
}

if login "$new_password" 2>/dev/null; then
  echo 'Flowise admin password da la secret moi.'
  exit 0
fi

rm -f -- "$runtime_dir/cookies.txt" "$runtime_dir/login-response.json"
if ! login "$old_password"; then
  echo 'Khong dang nhap duoc Flowise bang secret cu de rotate.' >&2
  exit 1
fi

user_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$runtime_dir/login-response.json")"
printf '%s\0%s\0%s' "$user_id" "$old_password" "$new_password" | python3 -c '
import json, sys
user_id, old_password, new_password = sys.stdin.buffer.read().decode().split("\0", 2)
print(json.dumps({
    "id": user_id,
    "oldPassword": old_password,
    "newPassword": new_password,
    "confirmPassword": new_password,
}))
' >"$runtime_dir/update.json"

curl -fsS -b "$runtime_dir/cookies.txt" \
  -X PUT -H 'Content-Type: application/json' \
  --data-binary @"$runtime_dir/update.json" \
  "$base_url/api/v1/user" >/dev/null

old_password=''
new_password=''
echo 'Flowise admin password rotate thanh cong.'
