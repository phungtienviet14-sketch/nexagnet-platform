# Dự án: Hệ thống AI xử lý đơn hàng Zalo — U Ultty Việt Nam

## Quy tắc chung (bắt buộc)

- Luôn áp dụng skill `search-first` trước khi viết bất kỳ function/module mới nào
- Ưu tiên tìm và dùng thư viện có sẵn (npm) thay vì tự implement
- Rules ECC của project nằm tại `.claude/rules/ecc/` (common, typescript, react, web) — tuân thủ khi viết code

## Bối cảnh dự án

Khách hàng: **Công ty Cổ Phần U Ultty Việt Nam** (gia dụng cao cấp). Liên hệ: Nguyễn Thu Phương (Sale chính).

Hiện trạng vận hành:
- ~200 nhóm Zalo chăm sóc thường xuyên (+100-150 nhóm thi thoảng), 200-300 đại lý/CTV
- 10-20 đơn/ngày, chủ yếu đơn số lượng lớn, chốt qua chat text trên Zalo (<20% là ảnh chụp bảng)
- Quy trình thủ công: chốt Zalo → gõ tay lên KiotViet → chuyển Base xử lý giao vận → ship Aha/Viettel
- **Không có API kết nối** giữa các hệ thống; chưa có IT nội bộ; dữ liệu lưu máy cá nhân + KiotViet

Mục tiêu: AI đọc tin nhắn đặt hàng trên Zalo (viết tắt, không dấu) → trích xuất đơn có cấu trúc → Sale duyệt 1-click → đồng bộ KiotViet/Base. Triển khai theo giai đoạn 1 → 2 → 3, go-live sớm nhất có thể.

Tài liệu gốc: `APP AI_Công ty Cổ Phần U Ultty Việt Nam_ Phuong Jul 2026.docx` (hồ sơ khảo sát đầy đủ — đọc file này khi cần chi tiết). Tài liệu đính kèm (mẫu PO, biên bản bàn giao, danh mục SKU, bảng giá, tin nhắn mẫu): link Drive trong mục 7 của docx.

## Công nghệ (đã chốt)

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (Node.js 22 LTS) | Một ngôn ngữ cho cả backend + dashboard; thư viện Zalo `zca-js` là Node-native |
| Backend | NestJS | Cấu trúc module rõ ràng cho hệ tích hợp nhiều bên (zalo, parser, kiotviet, orders) |
| Dashboard duyệt đơn | Next.js (React) | Sale duyệt/sửa đơn AI đã parse |
| Database | PostgreSQL + Prisma | Lưu đơn hàng, audit log, glossary viết tắt, feedback loop |
| Queue | BullMQ (Redis) | Pipeline xử lý tin nhắn bất đồng bộ |
| AI | Claude API (structured output / tool use) | Trích xuất JSON theo schema cố định |
| Zalo | Zalo OA API (chính thức) hoặc `zca-js` (userbot, rủi ro khóa tài khoản) | **Chưa chốt — chờ khách xác nhận** có chuyển nhóm sang OA được không |

## Quyết định kiến trúc đã chốt

1. **KHÔNG xây module quản lý kho riêng** — gọi API KiotViet trực tiếp để kiểm tồn. KiotViet là source of truth duy nhất (nơi nhập/xuất kho vật lý). Với 10-20 đơn/ngày không cần cache; nếu sau này cần thì thêm cache TTL ngắn, không làm sớm.
2. **AI parser = trích xuất có ràng buộc trong từ điển đóng**, không phải NLP tiếng Việt tổng quát:
   - Ngữ cảnh đưa vào prompt: metadata nhóm Zalo (map group → đại lý/CTV), danh mục 18-20 SKU, glossary viết tắt (VD: `TN` = Thái Nguyên, `OCP` = Ocean Park)
   - Ép output về JSON schema cố định qua tool use — không parse output tự do bằng regex
   - Validation tất định sau LLM: mã SP phải thuộc danh mục; số lượng × đơn giá ≈ tổng đơn khách ghi
   - Định tuyến theo độ tin cậy: đơn rõ ràng → điền sẵn cho Sale duyệt 1-click; trường mơ hồ → đánh dấu Sale nhập tay, AI không tự quyết
   - Feedback loop: log cặp (tin nhắn gốc, kết quả Sale sửa) → mở rộng glossary + few-shot, không cần train lại model
3. Chọn model qua bake-off trên 20-30 tin nhắn thật: đo tỷ lệ JSON hợp lệ, độ chính xác field-level, khả năng dùng đúng glossary.

## Nghiệp vụ cốt lõi

Hai mẫu đơn:
- **TH1** (giao cho đại lý): `Chi nhánh_Ngày_Tên CTV/Đại lý — Số lượng x Mã SP — Đơn giá — Tổng đơn`. VD: `HN_30.6_Meta HN, 10 x Ghế Felix — 1.150k, Tổng: 11.500.000đ`
- **TH2** (giao thẳng khách của đại lý): thêm `Tên khách — SĐT/Địa chỉ — Cước vận chuyển — Thu hộ/Không thu`

4 chính sách đại lý: **công nợ** (30/45 ngày), **ký gửi** (cuối tháng báo số → đơn bán + VAT), **thanh toán ngay** (CTV nhỏ), **COD** (có phí thu hộ theo biểu mẫu, báo trước).

Đặc thù ngôn ngữ đầu vào: viết tắt, không dấu — `"Gui ve TN cho c"`, `"Bao nhieu tien"`, `"gui nhe"`.

Quy trình duyệt: 1 Sale xác nhận bước cuối → kế toán kiểm tra khi lên hệ thống. Cần cả đơn giao và báo giá riêng. VAT xuất tùy trường hợp (nháp → khách kiểm tra → xuất).

## Câu hỏi mở (chưa chốt với khách — hỏi trước khi implement phần liên quan)

1. Nhóm Zalo chuyển dần sang OA được không, hay giữ nguyên nhóm cá nhân? (quyết định Zalo OA vs zca-js)
2. Gói KiotViet hiện tại có bật API không? Rate limit bao nhiêu?
3. Base có tài liệu API không? (khảo sát ghi "không rõ")
4. Phạm vi cụ thể của giai đoạn 1/2/3 là gì?

## Lưu ý bảo mật

- Dữ liệu khách hàng (SĐT, địa chỉ, đơn hàng) là dữ liệu nội bộ — **không gửi cho bên thứ 3** ngoài các API đã thống nhất (KiotViet, Claude API)
- Không hardcode API key (KiotViet, Zalo, Anthropic) — dùng biến môi trường, validate khi khởi động
- Khách chưa có IT nội bộ: giải pháp phải vận hành được bởi người non-technical, ưu tiên đơn giản
