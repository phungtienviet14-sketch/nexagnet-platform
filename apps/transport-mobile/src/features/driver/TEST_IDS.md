# testID ổn định — trải nghiệm Lái xe (#394)

| testID | Ở đâu | Ý nghĩa |
|---|---|---|
| `driver-work` | tab Việc | khung màn |
| `driver-current-leg` | tab Việc | thẻ chặng đang làm |
| `driver-next-action` | tab Việc | nút hổ phách — việc kế tiếp (do máy chủ tính) |
| `driver-next-action-note` | tab Việc | bấm mốc kèm ghi chú |
| `checkpoint-<TYPE>` | tab Việc | nút mốc phụ (vd `checkpoint-LOADING`); `-queued` / `-blocked` khi đã nằm trên máy |
| `document-<TYPE>` | tab Việc | nút chứng từ phụ |
| `waiting-start` / `receipt-handover` | tab Việc | nút chờ / giữ biên nhận (phụ) |
| `driver-waiting-timer` | tab Việc | đồng hồ chờ (hiển thị) |
| `driver-waiting-held` | tab Việc | "Bắt đầu chờ" bị giữ vì mốc Đã đến nơi còn trên máy |
| `driver-flash` | tab Việc | xác nhận sau khi bấm (đã lưu / đang gửi / đã gửi / bị từ chối) |
| `driver-failure` | tab Việc | lỗi của lần bấm (vd không lấy được vị trí) |
| `driver-leg-<legId>` | tab Việc, chi tiết vòng | hàng chặng chỉ đọc |
| `driver-open-run` | tab Việc | mở chi tiết vòng chạy |
| `driver-tracking`, `driver-tracking-toggle` | tab Việc | bám vị trí ca chạy (chỉ bản dựng có tính năng) |
| `driver-site-intake-entry`, `driver-site-intake` | tab Việc (không có việc) | lối vào Nhận việc |
| `driver-legacy-toggle`, `driver-trip-<id>` | tab Việc | mục Chuyến cũ (thu gọn) |
| `locating-overlay`, `locating-skip`, `locating-cancel` | toàn màn | "Đang lấy vị trí…" |
| `note-input`, `note-submit` | tờ trượt | ghi chú mốc |
| `waiting-reason-<REASON>`, `waiting-note`, `waiting-submit` | tờ trượt | lý do chờ |
| `capture-camera`, `capture-gallery`, `capture-file` | tờ trượt | ba lựa chọn chứng từ |
| `handover-confirm` | tờ trượt | xác nhận đang giữ biên nhận |
| `capture-screen`, `capture-shutter`, `capture-close` | máy ảnh | máy ảnh trong ứng dụng |
| `driver-map`, `map-view`, `map-attribution` | tab Bản đồ | bản đồ + ghi nguồn |
| `map-directions`, `map-directions-other`, `map-my-location` | tab Bản đồ | chỉ đường / vị trí của tôi |
| `driver-run-detail`, `run-map` | chi tiết vòng | |

Chưa có (màn chưa dựng): `fuel-new`, `fuel-submit`, `money-fund`.
