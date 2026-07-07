# KỊCH BẢN DEMO — Ultty AI (xử lý đơn hàng Zalo)

Demo chạy vòng lặp: **tin đặt hàng → AI trích xuất → rules tính giá → Sale duyệt 1 chạm → gửi xác nhận vào nhóm**.
Mọi dữ liệu khách (SKU/giá/chính sách/glossary) là **giả lập** trong [apps/api/src/knowledge/seed.ts](../apps/api/src/knowledge/seed.ts).

## 0. Yêu cầu
- Node ≥ 22, pnpm. **Không cần Docker/Postgres** (demo dùng in-memory).
- `pnpm install` một lần.

## 1. Chạy demo (chế độ mặc định — không cần key nào)

Hai terminal:

```bash
pnpm dev:api    # http://localhost:3001  (Parser=mock, Bot=off)
pnpm dev:web    # http://localhost:3000  (app Sale)
```

Mở http://localhost:3000 trên điện thoại/desktop (mobile-first).

## 2. Luồng trình diễn (2 phút)

1. Ở ô **"Giả lập tin nhắn đại lý"**, bấm 1 chip mẫu hoặc gõ:
   `@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT`
2. Bấm **Gửi cho AI xử lý** → sau ~1 giây **thẻ đơn** hiện ra: Meta HN · TH1 · 10 × Ghế massage Felix · giá cấp đại lý · **TỔNG 11.500.000đ** · Công nợ 30 ngày · badge **Chờ duyệt**.
3. Bấm **Duyệt & gửi nhóm** → badge chuyển **Đã gửi nhóm**; API gọi kênh gửi format xác nhận TH1 kèm nhãn *"— Tin tự động từ Bot Ultty"* (chế độ mock: xem log API; chế độ bot: gửi thật vào nhóm Zalo).
4. Thử thêm: `@Bot ultty AI orders 3 noi chien va 2 robot hut bui, xuat VAT` (đơn nhiều SP + VAT), và `ghe felix bao nhieu tien c oi` (AI phân loại **Hỏi giá**, không phải đơn).

**Điểm nhấn khi thuyết trình:** số tiền do **rules engine tất định** tính, **không phải AI đoán** (AI chỉ trích xuất SL + tên SP).

## 3. Chế độ Zalo Bot THẬT (đọc tin từ nhóm)

Trong `.env` (gốc repo):
```
BOT_MODE=on
ZALO_BOT_TOKEN=<token bot>
```
Chạy lại `pnpm dev:api`. Bot sẽ long-polling nhóm. Trong nhóm Zalo, **@mention bot** kèm đơn (text hoặc **ảnh có tag** — bot đọc `photo_url`) → đơn tự hiện trên app → duyệt → **bot gửi xác nhận vào chính nhóm đó**.
> Lưu ý: tin gửi lúc bot offline không được Zalo phát lại → production cần webhook always-on; Co-pilot (nhập tay) là lưới an toàn.

## 4. Chế độ AI THẬT (Claude thay Mock)

Trong `.env`:
```
PARSER_MODE=claude
ANTHROPIC_API_KEY=<key>
```
ClaudeParser (Haiku 4.5, tool use + vision) sẽ trích xuất tin viết tắt/không dấu và **đọc ảnh đơn**. Không có key → tự chạy MockParser.

## 5. Lưới an toàn khi demo
- Không phụ thuộc Zalo/mạng: dùng ô giả lập (gọi `POST /demo/simulate`).
- Không phụ thuộc Claude: `PARSER_MODE=mock` (mặc định) vẫn chạy đủ luồng.

## 6. Tin nhắn mẫu (đọc nhanh)
- `@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT` — TH1, miễn ship, không VAT
- `@Bot ultty AI orders 3 noi chien va 2 robot hut bui, xuat VAT` — nhiều SP + VAT
- `@Bot ultty AI orders 5 may loc nuoc` — đơn đơn giản
- `ghe felix bao nhieu tien c oi` — hỏi giá (không phải đơn)

## 7. Kiến trúc (map thiết kế hợp nhất)
`channels/` (ChannelAdapter: Mock/BotPlatform) → `ingest/` (BotPoller) → `pipeline/` (OrderParser: Mock/Claude) → `rules/` (giá/ship/chính sách/VAT + format TH1/TH2) → `orders/` (duyệt → gửi). Nguồn sự thật `knowledge/` (in-memory seed). App: Next.js PWA mobile-first.

## 8. Kiểm thử
```bash
pnpm -r test        # 51 test (shared 20 · api 28 · web 3)
pnpm -r typecheck && pnpm lint
```
