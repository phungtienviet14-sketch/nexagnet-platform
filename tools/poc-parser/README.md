# PoC Parser bake-off (Task 0.4 — CHỜ DỮ LIỆU KHÁCH)

Đo độ chính xác trích xuất đơn TH1/TH2 trên **20-30 tin nhắn thật** của U Ultty, so sánh ≥2 model Claude.

**Điều kiện chặn:** cần dữ liệu từ khách (xem [docs/checklist-du-lieu-khach.md](../../docs/checklist-du-lieu-khach.md)):
tin nhắn mẫu + danh mục SKU + bảng giá + glossary viết tắt.

Khi có dữ liệu, tool này sẽ được dựng gồm:
- `data/messages.jsonl` — tin nhắn thật + golden output (đơn đúng do Sale xác nhận)
- runner gọi Claude API (tool use, schema từ `@ultty/shared`) cho từng model
- báo cáo: % JSON hợp lệ, độ chính xác từng field (SKU, số lượng, đơn giá, tổng, địa chỉ), % dùng đúng glossary
- kết quả ghi vào `docs/poc-parser.md` → chốt model + prompt baseline cho Task 1.4
