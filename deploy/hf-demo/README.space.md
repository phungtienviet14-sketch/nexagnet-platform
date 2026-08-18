---
title: Ultty AI Demo
emoji: 🛒
colorFrom: orange
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# Ultty AI — Demo "Trung tâm điều hành"

Console demo: 6 agent AI xử lý đơn hàng Zalo cho **Công ty Cổ Phần U Ultty Việt Nam**.

Bản demo này chạy **hoàn toàn offline** — không cần dịch vụ ngoài, không cần nhập secret nào:

- `PARSER_MODE=deepseek` — parser thật; Space cần `DEEPSEEK_API_KEY` trong Secrets. (`mock` đã bị gỡ khỏi cấu hình 18/08/2026.)
- `CHANNEL_MODE=mock` — không kết nối Zalo; bơm tin giả qua nút **Giả lập tin**.
- `PERSISTENCE=memory` — không cần PostgreSQL/Redis.

## Cách dùng

Mở Space, ở cột giữa bấm **Giả lập tin** (hoặc chọn 1 tin mẫu) để xem 6 agent xử lý một tin
đặt hàng: phân loại intent → trích xuất đơn → đối chiếu nguồn sự thật → tính giá/chính sách →
đề xuất để Sale duyệt 1-click.

> Đây là bản demo kỹ thuật. Dữ liệu trong demo là **dữ liệu TEST**, không phải dữ liệu khách thật.

<!--
GHI CHU (cho nguoi dung — KHONG hien khi HF render):
- File nay la MAU frontmatter cho HF Space. Khi tao Space -> copy noi dung nay thanh README.md
  o GOC Space (HF doc YAML frontmatter o README.md goc de cau hinh: sdk=docker, app_port=7860).
- Neu SSE bi giat/khong cap nhat real-time tren ha tang HF, vao tab Settings > Variables cua Space,
  them bien  STREAM_MODE = off  -> frontend quay ve che do polling (on dinh hon qua proxy).
  KHONG can them secret nao cho demo mock.
-->
