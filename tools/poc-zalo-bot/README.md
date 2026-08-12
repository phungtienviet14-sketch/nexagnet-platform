# PoC Zalo Bot Platform — trả lời 3 câu hỏi Beta

Mục tiêu: xác định Bot Platform có dùng được làm kênh **tự động đọc tin nhắn nhóm** cho GĐ1 không.
Kết quả điền vào [docs/kien-truc/he-thong.md](../../docs/kien-truc/he-thong.md) — **Phụ lục A** (bản gốc `docs/poc-zalo-bot.md` đã hợp nhất vào đó 11/07/2026). Tài liệu API: https://bot.zapps.me/docs

## Chuẩn bị (1 lần, ~10 phút)

1. Dùng một tài khoản Zalo cá nhân (khuyến nghị tài khoản của đội dự án, KHÔNG dùng số chính của Sale khách).
2. Mở app Zalo → tìm OA **"Zalo Bot Manager"** → chọn **Tạo bot** (mở app Zalo Bot Creator).
3. Đặt tên bot bắt đầu bằng `Bot` (VD: `Bot Ultty PoC`) → tạo xong nhận **Bot Token** qua tin nhắn.
4. Tại gốc repo: `cp .env.example .env` → điền `ZALO_BOT_TOKEN=...`
5. Tạo 1 **nhóm Zalo test có sẵn** (vài thành viên đội dự án) — mô phỏng nhóm đại lý.

## Chạy PoC

```bash
pnpm install            # lần đầu
pnpm poc:updates        # bắt đầu long polling, Ctrl+C để xem tổng kết
```

Gửi thử tin từ bot (lấy `chat_id` từ output updates):

```bash
pnpm poc:send <chat_id> "xin chao tu bot"
```

## Kịch bản test — trả lời đúng 3 câu hỏi

### Câu 1 — Bot có thêm được vào nhóm cá nhân CÓ SẴN không?

| Bước | Làm gì | Ghi nhận |
|---|---|---|
| 1.1 | Trong nhóm test có sẵn: Thêm thành viên → tìm tên bot | Có tìm thấy bot không? |
| 1.2 | Thử thêm bot vào nhóm | Thêm được? Báo lỗi gì? Cần trưởng nhóm duyệt? |
| 1.3 | Nhắn 1 tin trong nhóm, xem terminal updates | Update có về không, `chat_type` là gì? |

### Câu 2 — Bot nhận MỌI tin nhắn nhóm hay chỉ khi @mention?

Trong nhóm test (updates đang chạy), lần lượt gửi và quan sát terminal:

| Bước | Tin nhắn gửi | Update có về? |
|---|---|---|
| 2.1 | Tin text thường, KHÔNG nhắc tới bot: `gui 10 ghe felix ve TN cho c` | ? |
| 2.2 | Tin có @mention bot: `@Bot Ultty PoC gui 10 ghe felix` | ? |
| 2.3 | Ảnh (chụp bảng đặt hàng mẫu) | ? (`message.image.received`?) |
| 2.4 | Tin thoại | ? |
| 2.5 | Thành viên KHÁC (không phải người tạo bot) gửi tin thường | ? |

> Đây là câu hỏi quyết định: nếu chỉ nhận @mention thì đại lý phải đổi thói quen — cần khách đồng ý (câu hỏi mở #1 trong CLAUDE.md).

### Câu 3 — Giới hạn số nhóm / rate limit?

| Bước | Làm gì | Ghi nhận |
|---|---|---|
| 3.1 | Thêm bot vào 3-5 nhóm test khác nhau | Nhóm thứ mấy bắt đầu lỗi (nếu có)? |
| 3.2 | Nhắn ở nhiều nhóm liên tiếp | Update về đủ các nhóm? Tổng kết đếm đúng số nhóm? |
| 3.3 | `pnpm poc:send` 10 tin liên tiếp vào 1 nhóm | Có lỗi rate limit (error_code)? |

### Kiểm tra thêm (phục vụ thiết kế adapter)

- Bot gửi tin vào nhóm được không (`poc:send` với chat_id nhóm)? Tin có hiển thị nhãn bot?
- Tắt updates 5 phút, nhắn vài tin, bật lại → tin cũ có về không (miss event khi offline)?
- Chế độ webhook: `webhook serve` + tunnel https + `webhook set <url>` → so độ trễ với polling. Xong nhớ `webhook delete` để quay lại getUpdates.

## Sự cố thường gặp

- `getUpdates` không trả gì dù đã nhắn: kiểm tra `webhook info` — nếu đang gắn webhook thì `webhook delete` (2 cơ chế loại trừ nhau).
- Tin nhắn từ "nhóm đối tượng đặc biệt" chỉ về `message.unsupported.received` — hành vi đúng theo tài liệu, ghi nhận lại.
