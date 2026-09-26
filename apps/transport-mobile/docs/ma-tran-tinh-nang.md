# Ma trận tính năng — PWA · Android · iOS (#394)

Mức: **FULL** · **LIMITED_BY_PLATFORM** · **NOT_SUPPORTED_YET** · **NOT_APPLICABLE**. Cùng một mã
nguồn, cùng nghĩa nghiệp vụ; khác nhau chỉ ở chỗ nền tảng buộc phải khác. Bảng nói **mã hỗ trợ tới
đâu**; cột "Đã chứng minh ở đâu" nói bằng chứng thật — hai thứ không lẫn vào nhau.

| Việc                                                             | PWA                                              | Android                      | iOS                          |
| ---------------------------------------------------------------- | ------------------------------------------------ | ---------------------------- | ---------------------------- |
| Đăng nhập, giữ phiên                                             | FULL — cookie HttpOnly + CSRF, cùng origin       | FULL — Bearer trong Keystore | FULL — Bearer trong Keychain |
| Chọn máy chủ doanh nghiệp                                        | NOT_APPLICABLE — PWA gắn với origin              | FULL                         | FULL                         |
| Điều hướng theo vai (máy chủ quyết)                              | FULL                                             | FULL                         | FULL                         |
| Lái xe: việc kế tiếp, mốc có cổng GPS, chờ có lý do              | FULL                                             | FULL                         | FULL                         |
| Vị trí đúng lúc bấm                                              | FULL — quyền của trình duyệt                     | FULL                         | FULL                         |
| Bám vị trí nền trong ca                                          | LIMITED_BY_PLATFORM — trình duyệt không chạy nền | FULL¹                        | FULL¹                        |
| Chứng từ: máy ảnh                                                | LIMITED_BY_PLATFORM²                             | FULL                         | FULL                         |
| Chứng từ: ảnh thư viện, PDF                                      | FULL                                             | FULL                         | FULL                         |
| Bản đồ lấy/giao (OpenFreeMap)                                    | FULL — maplibre-gl                               | FULL — MapLibre native       | FULL — MapLibre native       |
| Hàng đợi ngoại tuyến + trung tâm đồng bộ                         | FULL — IndexedDB, cùng bộ test hành vi           | FULL — SQLite                | FULL — SQLite                |
| Lái xe: ghi phiếu đổ dầu (kèm ảnh hoá đơn), xem phiếu            | FULL                                             | FULL                         | FULL                         |
| Lái xe: nhận chuyến tại địa điểm hiện tại + chọn điểm giao (#398) | FULL — cần mạng; điểm giao từ danh sách đã biết/tìm theo tên³ | FULL — cần mạng              | FULL — cần mạng              |
| Giám đốc: "Đơn mới từ tài xế", việc tài xế nhận chưa đủ, báo bất thường/hủy (#398) | FULL                                  | FULL                         | FULL                         |
| Lái xe: nộp lại phiếu bị từ chối, đính thêm/gỡ chứng từ phiếu cũ | NOT_SUPPORTED_YET                                | NOT_SUPPORTED_YET            | NOT_SUPPORTED_YET            |
| Lái xe: khoản chi chuyến cũ                                      | NOT_SUPPORTED_YET                                | NOT_SUPPORTED_YET            | NOT_SUPPORTED_YET            |
| Lái xe: Tiền — quỹ, quyết toán, phiếu lương (chỉ đọc)            | FULL                                             | FULL                         | FULL                         |
| Giám đốc: hôm nay, cần xử lý, đội xe, đơn                        | FULL                                             | FULL                         | FULL                         |
| Giám đốc: tab Tiền                                               | NOT_SUPPORTED_YET                                | NOT_SUPPORTED_YET            | NOT_SUPPORTED_YET            |
| Kế toán: cần duyệt (đề nghị chi, phiếu dầu, phụ cấp chờ)         | FULL                                             | FULL                         | FULL                         |
| Kế toán: thu tiền, số dư lái xe                                  | FULL để đọc — thao tác NOT_SUPPORTED_YET         | như PWA                      | như PWA                      |
| Đổi mật khẩu trong ứng dụng                                      | NOT_SUPPORTED_YET — chờ hợp đồng #395            | NOT_SUPPORTED_YET            | NOT_SUPPORTED_YET            |
| Cài lên màn hình chính                                           | FULL — manifest + service worker                 | NOT_APPLICABLE — APK/AAB     | NOT_APPLICABLE               |

¹ Bật ở bản thử; bản production **tắt** tới khi khai báo Play được duyệt (M-01). Chưa chứng minh
trên máy thật: RESEARCHED / NOT DEVICE-PROVEN.
² Máy ảnh trong trang khi trình duyệt cho; không thì hộp chụp của hệ thống, ghi nguồn `UNKNOWN`
(không gọi là ảnh vừa chụp).
³ Nhận chuyến là việc **cần mạng có chủ ý** (#398): địa điểm đề nghị và điều kiện tạo đơn do máy
chủ quyết; mất mạng thì app nói "Cần mạng để nhận chuyến tại địa điểm này", không báo thành công
giả, không vào hàng đợi ngoại tuyến. Gửi lại sau khi mất phản hồi dùng CÙNG `clientEventId`. Bản đồ
nền web chưa có nên PWA không chạm-trên-bản-đồ để chọn điểm giao.

## Đã chứng minh ở đâu

| Nền tảng | Bằng chứng tự động                                                                                                                                                                                                                        | Chưa có                                      |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Android  | Máy ảo API 35 + API/Postgres thật (`mobile-android-e2e`): flow **bắt buộc** 01–04 — đăng nhập ba vai, bốn tab + bản đồ, mốc khi mất sóng → gửi khi có sóng; 07–09 (#398) — nhận chuyến → điểm giao → đơn tự tạo, chưa biết điểm giao → Cần xử lý, giám đốc thấy đúng hai kết cục (kiểm lại số qua API: `verify-driver-direct.mjs`). Flow **tuỳ chọn** (không chặn job): 05 chọn ảnh chứng từ, 06 ghi phiếu đổ dầu | Máy thật, máy ảnh thật, bám nền              |
| iOS      | Build Release cho Simulator, cài + mở, chụp màn (`mobile-ios`)                                                                                                                                                                            | Smoke đăng nhập/luồng, máy thật              |
| PWA      | `mobile-pwa-e2e` (#398): Chromium màn điện thoại trên bản xuất web thật + API/Postgres thật — mất mạng không báo thành công, nhận chuyến → đơn tự tạo (hàng việc không tăng), chưa biết điểm giao → Cần xử lý (+1), báo bất thường có lý do                                                                                                                                                                   | Cài thật trên iPhone Safari / Android Chrome |
