#!/usr/bin/env bash
# CHAY SMOKE MAESTRO tren may ao da boot (goi tu `script:` cua reactivecircus/android-emulator-runner).
#
# Tach ra tep rieng vi action do chay TUNG DONG cua `script:` bang `sh -c` doc lap: bien, if, vong
# lap khong song qua dong sau. Mot tep bash thi doc duoc, chay lai duoc tren may dev co may ao.
#
#   bash tools/mobile-smoke/run-maestro.sh <thu-muc-chua-apk> <thu-muc-ket-qua>
#
# Bien can (job dat qua $GITHUB_ENV — xem tools/mobile-smoke/prepare.mjs): MAESTRO_SERVER_URL,
# MAESTRO_*_USERNAME, MAESTRO_PICKUP_LAT/LNG, SMOKE_PASSWORD. Mat khau KHONG bao gio duoc in.
set -euo pipefail

apk_dir="${1:?thieu thu muc APK}"
out_dir="${2:?thieu thu muc ket qua}"
flows="apps/transport-mobile/.maestro"
mkdir -p "$out_dir"

apk="$(find "$apk_dir" -name '*.apk' | head -n 1)"
[ -n "$apk" ] || { echo "Khong thay APK trong $apk_dir" >&2; exit 1; }
adb install -r "$apk"

# logcat ra tep suot buoi chay: loi JS/native khi man hinh trang chi thay duoc o day.
adb logcat -c || true
adb logcat -v time > "$out_dir/logcat.txt" 2>&1 &
logcat_pid=$!

maestro_env=(
  -e "MAESTRO_SERVER_URL=${MAESTRO_SERVER_URL}"
  -e "MAESTRO_DRIVER_USERNAME=${MAESTRO_DRIVER_USERNAME}"
  -e "MAESTRO_DIRECTOR_USERNAME=${MAESTRO_DIRECTOR_USERNAME}"
  -e "MAESTRO_ACCOUNTING_USERNAME=${MAESTRO_ACCOUNTING_USERNAME}"
  -e "MAESTRO_PICKUP_LAT=${MAESTRO_PICKUP_LAT}"
  -e "MAESTRO_PICKUP_LNG=${MAESTRO_PICKUP_LNG}"
  -e "MAESTRO_PASSWORD=${SMOKE_PASSWORD}"
)

status=0
maestro test "${maestro_env[@]}" \
  --format junit --output "$out_dir/maestro-report.xml" \
  --test-output-dir "$out_dir/maestro" \
  "$flows" || status=$?

# Flow TUY CHON (bo chon anh he thong) — ket qua ghi lai nhung KHONG quyet dinh mau cua job.
maestro test "${maestro_env[@]}" \
  --format junit --output "$out_dir/maestro-optional-report.xml" \
  --test-output-dir "$out_dir/maestro-optional" \
  "$flows/05-driver-document-capture.yaml" || echo "Flow tuy chon 05 do (khong chan job)."

kill "$logcat_pid" 2>/dev/null || true
exit "$status"
