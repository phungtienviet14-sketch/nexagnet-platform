> ⚠️ **LỖI THỜI (09/07/2026) — phần đa nhóm đã gộp vào [kich-ban-demo-toan-he-thong.md](kich-ban-demo-toan-he-thong.md) §4.**
> Bản này còn khung "phải tag bot" + Felix 1.150k. Hệ hiện tại: zca đọc mọi tin không cần tag, Felix 1.250.000đ.

# KỊCH BẢN DEMO — BOT CHẠY NHIỀU NHÓM ZALO (Ultty AI)

> Phần bổ sung cho [kich-ban-demo-thuyet-trinh.md](kich-ban-demo-thuyet-trinh.md).
> Điểm nhấn MỚI ở bản này: **nhiều nhóm đại lý → một màn hình Sale duy nhất → mỗi đơn tự nhận đúng đại lý/giá/chính sách → duyệt → xác nhận về đúng nhóm gốc.**
> Ký hiệu: **▶ Thao tác** · **🗣 Nói** · **⏸ Ngưng** · **💡 Ghi chú riêng**.

---

## PHẦN 0 — CHUẨN BỊ

**Đã cấu hình sẵn 2 nhóm Zalo thật** (map trong [apps/api/src/knowledge/seed.ts](../apps/api/src/knowledge/seed.ts)):

| Nhóm Zalo | Đại lý | Chính sách | Chi nhánh |
|---|---|---|---|
| Nhóm đại lý Meta HN | Meta HN | Công nợ 30 ngày | HN |
| Nhóm đại lý Thái Nguyên | Đại lý Thái Nguyên | Công nợ 45 ngày | TN |

**▶ Bật hệ thống chế độ THẬT** — trong `.env`: `PARSER_MODE=deepseek`, `BOT_MODE=on`. Rồi:
```bash
pnpm dev:api      # đợi log "Parser=deepseek · Bot=on"
pnpm dev:web      # http://localhost:3000
```
**▶** Mở app lên máy chiếu. Mở sẵn **cả 2 nhóm Zalo trên điện thoại** (bot đã ở trong cả hai).

**▶ Làm sạch feed:** Ctrl+C terminal API rồi `pnpm dev:api` lại → feed trống (đơn cũ là in-memory).

**💡 Con số cần thuộc:** Ghế Felix **1.150.000đ** (giá đại lý) · đơn ≥2 SP **miễn ship** · VAT **10%**. Meta HN = **công nợ 30**, Thái Nguyên = **công nợ 45** — đây là điểm để chứng minh "mỗi nhóm ra đúng chính sách của nó".

---

## PHẦN 1 — MỞ ĐẦU (30 giây)

**🗣** "Ở bản trước em demo bot đọc đơn trong **một** nhóm. Nhưng thực tế khách có **200 nhóm**. Câu hỏi tiếp theo là: *một con bot có phục vụ được nhiều nhóm cùng lúc không, và có phân biệt được đơn nào của đại lý nào không?* Hôm nay em demo đúng cái đó — **cùng một bot, cùng một màn hình Sale, hai nhóm đại lý khác nhau.**"

---

## PHẦN 2 — DEMO ĐA NHÓM (THẬT, ~3 phút)

### Cảnh 1 — Đơn từ NHÓM 1 (Meta HN) (60 giây)

**▶** Trên điện thoại, trong **nhóm Meta HN**, gửi (nhớ **tag bot**):
`@Bot ultty AI orders gui 10 ghe felix ve HN cho c, ko lay VAT`

**⏸** Chờ 1–2 giây, thẻ đơn hiện trên app.

**🗣** (chỉ vào thẻ) "Đơn hiện ra, gắn nhãn **📍 Nhóm đại lý Meta HN**, đại lý **Meta HN**, chính sách **Công nợ 30 ngày** — đúng của nhóm này."

### Cảnh 2 — Đơn từ NHÓM 2 (Thái Nguyên) đổ về CÙNG màn hình (75 giây)

**▶** Chuyển sang **nhóm Thái Nguyên**, gửi (tag bot):
`@Bot ultty AI orders gui 10 ghe felix`

**⏸** Thẻ đơn thứ hai hiện ra **ngay bên cạnh** thẻ đầu, trên cùng một màn hình.

**🗣** "Và đây là điểm mấu chốt. Đơn thứ hai đến từ **một nhóm khác**, nhưng đổ về **cùng một hộp thư Sale**. Nhìn kỹ:
- Nó tự gắn **📍 Nhóm đại lý Thái Nguyên**, đại lý **Đại lý Thái Nguyên**.
- Chính sách là **Công nợ 45 ngày** — **khác** đơn Meta HN ở trên. Cùng một câu chữ y hệt, nhưng **vì đến từ nhóm khác nên hệ thống áp đúng đại lý và đúng chính sách của nhóm đó.**

Sale không phải hỏi 'đơn này của ai' — hệ thống biết, vì mỗi nhóm đã map sẵn với một đại lý."

**▶ (tuỳ chọn)** Bấm chip lọc **"Nhóm đại lý Thái Nguyên"** ở đầu feed → chỉ còn đơn của nhóm đó. Bấm **"Tất cả"** để xem lại toàn bộ.

**🗣** "Khi có nhiều nhóm, Sale lọc theo từng nhóm chỉ bằng một chạm."

### Cảnh 3 — Duyệt: xác nhận về ĐÚNG nhóm gốc (45 giây)

**▶** Bấm **"Duyệt & gửi nhóm"** trên đơn **Thái Nguyên**. **⏸** Chờ badge **"Hoàn tất"**.

**▶** Quay sang điện thoại, mở **nhóm Thái Nguyên** → tin xác nhận vừa xuất hiện **đúng trong nhóm đó** (không lẫn sang Meta HN).

**🗣** "Duyệt đơn của nhóm nào thì xác nhận gửi về đúng nhóm đó. Định tuyến hai chiều: đọc vào từ đúng nhóm, trả lời ra đúng nhóm."

---

## PHẦN 3 — CHỐT (30 giây)

**🗣** "Vậy là **một con bot, không giới hạn ở một nhóm**. Mở rộng ra 200 nhóm chỉ là khai báo thêm — mỗi nhóm map với một đại lý, còn luồng xử lý và màn hình Sale **giữ nguyên**. Đại lý ở nhóm nào cứ nhắn đơn ở nhóm đó, tag bot — Sale ngồi một chỗ duyệt tất cả."

---

## PHẦN 4 — THÊM NHÓM MỚI (cho câu hỏi kỹ thuật)

**❓ "Thêm một nhóm nữa thì làm sao?"**
🗣 "Ba bước, vài phút:
1. Thêm bot vào nhóm Zalo mới.
2. Tag bot 1 lần trong nhóm đó rồi chạy `pnpm poc:groups` → in ra `chat_id` của nhóm.
3. Thêm 1 dòng vào `seed.ts` map `chat_id` đó với đại lý. Xong."

**💡** `pnpm poc:groups` chạy một lần rồi tự thoát (khác `poc:updates` chạy liên tục). Lưu ý: nếu API `BOT_MODE=on` đang chạy thì tắt API trước khi chạy lệnh này (hoặc đọc `chat_id` ngay trên feed app), tránh hai bên tranh tin.

---

## PHẦN 5 — PHÒNG KHI SỰ CỐ

- **Mạng/Zalo trục trặc:** dùng ô **"Giả lập tin nhắn"** trên app — nay có **ô chọn nhóm** ngay trên khung soạn. Chọn "Nhóm đại lý Thái Nguyên" hoặc "Meta HN" rồi gửi → đơn ra đúng nhóm đó, **AI (DeepSeek) và luồng xử lý y hệt**, chỉ khác nguồn tin.
- **Đơn không map (hiện "Chưa rõ đại lý" + cảnh báo):** nhóm đó chưa có trong `seed.ts` — bình thường, đơn vẫn ra để Sale xử lý tay, không crash.
- **Nguyên tắc vàng:** trục trặc gì → quay về ô "Giả lập" + ô chọn nhóm. Luôn chạy.

---

## PHỤ LỤC — CÂU MẪU (copy nhanh)
```
# Nhóm Meta HN (công nợ 30):
@Bot ultty AI orders gui 10 ghe felix ve HN cho c, ko lay VAT

# Nhóm Thái Nguyên (công nợ 45) — cùng câu chữ, khác nhóm -> khác chính sách:
@Bot ultty AI orders gui 10 ghe felix
```
**Thông điệp cần khắc:** *cùng một câu, gửi ở hai nhóm khác nhau → hệ thống ra hai đại lý, hai chính sách đúng.* Đó là bằng chứng bot phục vụ nhiều nhóm mà không lẫn.
