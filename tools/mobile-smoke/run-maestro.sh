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

# MAY AO "BOOT XONG" CHUA PHAI LA ON DINH. Sau `sys.boot_completed=1` he dieu hanh con chay viec sau
# boot (quet goi, cap nhat dich vu Google) va adbd co the roi ket noi vai giay. Run 36098809312: phien
# Maestro chet "device offline" 4 giay sau khi mo — TRUOC khi flow nao chay — va keo 4 flow do theo.
# Doi toi khi thiet bi tra loi ca package manager, nghi mot nhip, roi kiem lai (ket noi co the vua roi).
wait_device_ready() {
  adb wait-for-device
  for _ in $(seq 1 60); do
    if [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] \
      && adb shell pm path android >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "May ao khong on dinh sau 120 giay" >&2
  return 1
}
wait_device_ready
sleep 20
wait_device_ready

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

# Anh chup va logcat nam trong artefact, ma artefact khong phai ai cung tai duoc — in PHAN QUYET
# DINH ra ngay log cua job: chu dang hien tren man (uiautomator) va loi JS/native (logcat). O mat
# khau duoc Android che trong cay truy cap; token (neu co) bi xoa bang sed truoc khi in.
diagnose() {
  echo "::group::Chan doan — chu tren man hinh luc ket thuc (uiautomator)"
  if adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; then
    adb shell cat /sdcard/ui.xml 2>/dev/null | tr '>' '\n' \
      | grep -oE '(text|resource-id)="[^"]+"' | grep -v 'resource-id="android:' | head -80 || true
  fi
  echo "::endgroup::"
  echo "::group::Chan doan — loi JS/native (logcat)"
  grep -E "ReactNativeJS|AndroidRuntime|FATAL EXCEPTION|E/ReactNative|ExpoModulesCore" \
    "$out_dir/logcat.txt" 2>/dev/null \
    | sed -E 's/(Bearer |s:)[A-Za-z0-9_.+\/-]{16,}/\1<an>/g' | tail -80 || true
  echo "::endgroup::"
  # Maestro chi in ly do khi mot ASSERTION sai; lenh chet vi ngoai le (vd lenh dau phien chet sau
  # 4 giay, run 36103488832) chi nam trong nhat ky cua no. Chi in TEN lenh + thong bao loi — khong in
  # tham so (inputText mang mat khau; mat khau con bi GitHub che san).
  echo "::group::Chan doan — lenh Maestro that bai"
  if command -v jq >/dev/null 2>&1; then
    find "$out_dir" -name 'commands-*.json' 2>/dev/null | while read -r f; do
      jq -r --arg f "$(basename "$f")" \
        '.[]? | select(.metadata.status == "FAILED")
          | "\($f) :: \(.command | keys | join(",")) :: \(.metadata.error.message // "khong co thong bao")"' \
        "$f" 2>/dev/null || true
    done | head -40 || true
  fi
  find "$out_dir" "$HOME/.maestro/tests" -name 'maestro.log' 2>/dev/null | while read -r f; do
    grep -E "Exception|FAILED" "$f" 2>/dev/null | grep -v "inputText" | tail -20 || true
  done | tail -60 || true
  echo "::endgroup::"
}
if [ "$status" -ne 0 ]; then diagnose; fi

# Flow TUY CHON (bo chon anh he thong) — ket qua ghi lai nhung KHONG quyet dinh mau cua job.
wait_device_ready
maestro test "${maestro_env[@]}" \
  --format junit --output "$out_dir/maestro-optional-report.xml" \
  --test-output-dir "$out_dir/maestro-optional" \
  "$flows/05-driver-document-capture.yaml" || { echo "Flow tuy chon 05 do (khong chan job)."; diagnose; }

kill "$logcat_pid" 2>/dev/null || true
exit "$status"
