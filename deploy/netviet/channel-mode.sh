#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "$#" -lt 2 ]]; then
  echo "Usage: $0 read FILE | write FILE MODE" >&2
  exit 64
fi

action="$1"
file="$2"

validate() {
  case "$1" in
    mock|bot|zca|hybrid) ;;
    *)
      echo "CHANNEL_MODE khong hop le: $1 (chi nhan mock|bot|zca|hybrid)." >&2
      exit 64
      ;;
  esac
}

case "$action" in
  read)
    if [[ ! -e "$file" ]]; then
      echo 'mock'
      exit 0
    fi
    if [[ ! -f "$file" ]]; then
      echo "CHANNEL_MODE override khong phai regular file: $file" >&2
      exit 65
    fi
    content="$(<"$file")"
    if [[ ! "$content" =~ ^CHANNEL_MODE=(mock|bot|zca|hybrid)$ ]]; then
      echo "CHANNEL_MODE khong hop le trong $file." >&2
      exit 65
    fi
    mode="${content#CHANNEL_MODE=}"
    validate "$mode"
    echo "$mode"
    ;;
  write)
    if [[ "$#" -ne 3 ]]; then
      echo "Usage: $0 write FILE MODE" >&2
      exit 64
    fi
    mode="$3"
    validate "$mode"
    mkdir -p "$(dirname "$file")"
    chmod 0750 "$(dirname "$file")"
    temp_file="$(mktemp "${file}.tmp.XXXXXX")"
    trap 'rm -f -- "${temp_file:-}"' EXIT
    printf 'CHANNEL_MODE=%s\n' "$mode" >"$temp_file"
    chmod 600 "$temp_file"
    mv -f -- "$temp_file" "$file"
    trap - EXIT
    ;;
  *)
    echo "Action khong hop le: $action (read|write)." >&2
    exit 64
    ;;
esac
