# Phát hành Nexagent Transport — Android & iOS (#394)

> Mốc dừng của #394: `NATIVE_ANDROID_RELEASE_READY_NOT_PLAY_SUBMITTED` ·
> `NATIVE_IOS_STORE_READY_BUT_NOT_SUBMITTED` — **CHƯA đạt** (đo 25/09/2026; thiếu gì: §6). Chưa có
> tài khoản cửa hàng, chưa có khoá ký — mọi bản CI dựng ra hôm nay là bản **ký khoá debug / không
> ký**, **không** nộp lên cửa hàng được.

## 1. Danh tính — chủ sở hữu phải xác nhận TRƯỚC lần tải lên đầu tiên

| Mục                                     | Giá trị                                           | Ghi chú                                                                                                                           |
| --------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Android `applicationId` / iOS bundle ID | `com.nexagnet247.transport`                       | **Vĩnh viễn** sau lần tải lên đầu tiên. Đổi gốc bằng `APP_BUNDLE_ID` lúc build, trước lần tải lên đầu                             |
| Biến thể thử / phát triển               | `….preview` / `….dev`                             | Cài song song được với bản cửa hàng                                                                                               |
| Tên hiển thị                            | `Nexagent Transport` (thử: `(Thử)`, dev: `(Dev)`) | **Hỏi chủ sở hữu:** tên nền tảng trong repo viết `Nexagnet` — tên ứng dụng hiện viết `Nexagent`. Chốt một cách viết trước khi nộp |
| Phiên bản                               | `version` trong `app.config.ts` (hiện `0.1.0`)    | Tăng tay theo bản phát hành                                                                                                       |
| Số bản dựng                             | `APP_BUILD_NUMBER` = `github.run_number`          | Là `versionCode` (Android) và `CFBundleVersion` (iOS). Chạy lại (re-run) giữ nguyên số — muốn nộp lại thì chạy workflow mới       |

## 2. Bản CI dựng ra (`.github/workflows/mobile.yml`)

| Artefact                               | Nội dung                                            | Ký                                                              |
| -------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `nexagent-transport-preview-apk`       | APK cài tay, ID `.preview`, bám nền **bật**         | Khoá tải lên nếu có secret, không thì `debug-key-NOT-FOR-STORE` |
| `nexagent-transport-production-aab`    | AAB cho Play, ID gốc, bám nền **tắt** (M-01)        | như trên                                                        |
| `nexagent-transport-e2e-apk`           | APK x86_64 cho máy ảo, HTTP trần CHỈ tới `10.0.2.2` | luôn khoá debug — **không phân phối**                           |
| `nexagent-transport-ios-simulator-app` | `.app` Release cho iOS Simulator                    | không ký — không cài được lên iPhone thật                       |

Mỗi artefact kèm `build-metadata.json`: ID, phiên bản, số bản dựng, commit, sha256, dấu vân tay
chứng chỉ ký và nhãn `signing`. Nhãn được suy **từ chính tệp** (so với chứng chỉ debug công khai của
template React Native), không từ việc secret có được đặt hay không.

Dựng lại tại máy (cần Android Studio SDK + NDK 27.1.12297006, JDK 17; hoặc Xcode ≥ 26.4):

```bash
pnpm install --frozen-lockfile && pnpm --filter "@nexagnet/transport-mobile^..." build
cd apps/transport-mobile
APP_VARIANT=production APP_BUILD_NUMBER=7 pnpm exec expo prebuild --platform android --no-install --clean
(cd android && ./gradlew :app:bundleRelease)
APP_VARIANT=preview pnpm exec expo prebuild --platform ios --no-install --clean
(cd ios && pod install) # rồi mở ios/*.xcworkspace trong Xcode
```

Không gọi script tên `prebuild` hay `pre*`: pnpm coi đó là hook chạy trước `build`. Script của app
là `native:prebuild`.

## 3. Android — ký bằng khoá tải lên

1. Tạo khoá tải lên **một lần**, cất ngoài repo (repo đã chặn `*.jks`, `*.keystore`):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore nexagent-upload.jks \
     -alias nexagent-upload -keyalg RSA -keysize 4096 -validity 10000
   ```

2. Đặt **4 secret** ở GitHub (Settings → Secrets and variables → Actions):
   `ANDROID_UPLOAD_KEYSTORE_BASE64` (`base64 -w0 nexagent-upload.jks`),
   `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`.
   Thiếu một secret trong số có đặt ⇒ prebuild **từ chối** (không lặng lẽ quay về khoá debug).
3. `plugins/with-android-release-signing.js` chỉ viết `System.getenv(...)` vào `android/app/build.gradle`
   — không giá trị nào chạm đĩa (bài `native-config.contract.test.mjs` khoá điều đó).
4. Bật **Play App Signing** khi tạo ứng dụng trên Play Console: Google giữ khoá ký ứng dụng, ta chỉ
   giữ khoá tải lên (mất thì xin Google đổi, không mất ứng dụng).

## 4. Google Play — việc của chủ sở hữu

1. Tài khoản nhà phát triển (25 USD). Tài khoản **cá nhân mới**: bắt buộc **closed testing ≥ 12
   người thử liên tục 14 ngày** trước khi lên production — **M-02**
   ([transport-driver-app.md §3](../../../docs/kien-truc/transport-driver-app.md)). Tài khoản tổ chức
   (cần D-U-N-S) không bị ràng buộc này.
2. Tạo ứng dụng `com.nexagnet247.transport`, tải AAB ký khoá tải lên vào **Internal testing**.
3. **App content**:
   - _Foreground service_ + _Background location_: chỉ cần khi bật `APP_BACKGROUND_LOCATION=on` ở
     production. Bản production hiện **tắt** — manifest cuối không có FGS `location` lẫn
     `ACCESS_BACKGROUND_LOCATION`. Khi bật: khai theo mẫu "theo dõi đội xe trong ca chạy", **không**
     viện dẫn geofencing (**M-01**), kèm video quay lời giải thích trong ứng dụng + nút bắt đầu ca.
   - _Data safety_: Vị trí chính xác (chức năng ứng dụng, liên kết người dùng, không chia sẻ); Ảnh
     (chứng từ người dùng chọn/chụp); ID người dùng (tài khoản do văn phòng cấp); Hoạt động trong ứng
     dụng (mốc giao nhận). Mã hoá khi truyền: có. Không quảng cáo, không chia sẻ bên thứ ba. Xoá tài
     khoản: văn phòng khoá/xoá theo yêu cầu (tài khoản không tự đăng ký trong ứng dụng).
   - Đối tượng: người lớn (ứng dụng doanh nghiệp); không quảng cáo; cung cấp **tài khoản demo** cho
     người duyệt.
4. Store listing (nháp): tên `Nexagent Transport` (≤30); mô tả ngắn "Việc chạy xe, mốc giao nhận,
   nhiên liệu và tiền cho lái xe, giám đốc, kế toán." (≤80); thể loại **Business**; ảnh chụp theo vai
   lấy từ artefact `nexagent-transport-e2e-report` (Maestro chụp từng màn).

## 5. App Store — việc của chủ sở hữu

1. Apple Developer Program (99 USD/năm); đăng ký bundle ID `com.nexagnet247.transport`.
2. Ký: Xcode _Automatically manage signing_ với Team của chủ sở hữu, **hoặc** `eas credentials`
   (cần `eas init` + `extra.eas.projectId` — repo chưa có projectId, xem `eas.json`).
3. Dựng bản cửa hàng trên máy macOS (hoặc runner `macos-26` khi có secret chứng chỉ):
   `xcodebuild archive -workspace ios/<Tên>.xcworkspace -scheme <Tên> -configuration Release
-archivePath build/app.xcarchive` rồi `xcodebuild -exportArchive … -exportOptionsPlist` (method
   `app-store-connect`), tải lên bằng Xcode Organizer hoặc `xcrun altool`/Transporter.
4. TestFlight nội bộ trước. **App Privacy**: Vị trí chính xác, Ảnh, ID người dùng — liên kết người
   dùng, chức năng ứng dụng, không theo dõi (khớp `PrivacyInfo.xcprivacy`, bài hợp đồng khoá).
   **Export compliance**: `ITSAppUsesNonExemptEncryption = false` (chỉ HTTPS của hệ điều hành).
5. Duyệt 5.1.1: ứng dụng không bắt buộc vị trí để dùng; cần tài khoản demo cho người duyệt.

## 6. Còn thiếu để nói "đã phát hành"

Trong ứng dụng — việc của repo, chặn hai mốc dừng ở đầu tệp:

- Lái xe: tab **Nhiên liệu** và **Tiền** mới là màn giữ chỗ ("Đang dựng màn này") — chưa ghi được
  nhiên liệu, chưa xem được quỹ.
- Kế toán: **Thu tiền** và **Lái xe** hiện chỉ đọc.
- Đổi mật khẩu trong ứng dụng chưa có: tài khoản bị buộc đổi (`PASSWORD_CHANGE_REQUIRED`) phải đổi
  trên web; hàng đợi tạm dừng rồi tự gửi tiếp khi đăng nhập lại. Chờ hợp đồng đổi mật khẩu của #395.
- Máy ảnh/tệp: bằng chứng tự động duy nhất là flow Maestro 05 **tuỳ chọn** (chọn ảnh thư viện trên
  máy ảo, không chặn job). Máy ảnh thật chưa kiểm trên thiết bị thật.
- iOS: mới dựng + mở được trên iPhone Simulator; chưa có smoke đăng nhập/luồng trên iOS.

Việc của chủ sở hữu:

- Tài khoản Play + Apple, khoá tải lên + 4 secret, chốt tên hiển thị và bundle ID.
- Chạy `mobile.yml` xanh với secret ⇒ `build-metadata.json` phải ghi `signing: upload-key`.
- Play: closed testing 14 ngày/12 người (M-02); nếu bật bám nền production thì khai báo + video (M-01).
- Chưa có thiết bị thật: bám vị trí nền vẫn là **RESEARCHED / NOT DEVICE-PROVEN** (§7.4 của
  transport-driver-app.md).
