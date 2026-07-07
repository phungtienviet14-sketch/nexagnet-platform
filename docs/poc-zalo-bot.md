# KẾT QUẢ PoC ZALO BOT PLATFORM

**Trạng thái:** ✅ ĐÃ CHẠY (phần cốt lõi) — còn treo: đồng nghiệp gửi (người khác), ảnh/thoại có tag, đa nhóm & rate limit.
**Người thực hiện:** Phùng Việt · **Ngày:** 07/07/2026 · **Bot:** `Bot ultty AI orders` (id `4055584533866160964`) · **Log:** `tools/poc-zalo-bot/logs/`

## Kết luận nhanh

| Câu hỏi Beta | Kết quả | Bằng chứng |
|---|---|---|
| 1. Bot vào được nhóm cá nhân có sẵn? | ✅ **CÓ** — thêm thành viên → tìm tên bot → vào ngay, không cần tạo nhóm mới | thao tác trên app |
| 2. Nhận mọi tin nhắn hay chỉ @mention? | ⚠️ **CHỈ khi @mention bot** — nhận trọn nội dung khi được tag; tin thường/ảnh/thoại KHÔNG tag đều không về | 6/6 nhất quán (bảng dưới) |
| 3. Giới hạn số nhóm / rate limit? | ⬜ **Chưa test** (mới 1 nhóm) | — |

## Kết luận feasibility (câu hỏi chính)

**Về kỹ thuật: CÓ THỰC HIỆN ĐƯỢC.** Bot Platform là kênh chính thức, chi phí 0đ, không rủi ro khóa tài khoản; đã chứng minh: (a) thêm được vào nhóm sẵn có, (b) đọc được **trọn nội dung** tin khi được @mention, (c) gửi tin xác nhận ngược vào nhóm được.

**Điều kiện chặn (quyết định của KHÁCH):** đại lý **phải @mention bot mỗi lần đặt đơn**. Đây là thay đổi thói quen cho 200-300 đại lý. → cần hỏi chị Phương (checklist D2). Nếu khách đồng ý → bật `BotPlatformAdapter` cho phần đơn dạng text-có-tag. Nếu không → giữ **Co-pilot (dán tay) làm baseline** GĐ1.

**Hệ quả kiến trúc — kênh lai (hybrid), không thay đổi thiết kế:**
- Đơn text **có tag bot** → bot tự đọc (tự động).
- Đơn **không tag / ảnh / thoại** (gồm ~<20% đơn ảnh) → **Co-pilot Sale dán tay** (bot không bắt được).
- Cả hai đi chung pipeline qua `ChannelAdapter` (mục 3 thiết kế hợp nhất). Bot Platform là **nâng cấp một phần**, không thay thế Co-pilot.

## Quyết định kênh GĐ1

- ⬜ Bot đạt cả 3 → bật `BotPlatformAdapter` ngay GĐ1 *(chưa chọn: Câu 2 ra điều kiện @mention, Câu 3 chưa test)*
- ✅ **Bot chỉ nhận @mention → HỎI KHÁCH (chị Phương) có chấp nhận thói quen tag bot khi đặt hàng** (checklist D2). Đồng ý → dùng Bot cho đơn text-có-tag + Co-pilot cho phần còn lại.
- ✅ **Co-pilot vẫn go-live GĐ1 đúng hạn** bất kể quyết định trên — Bot chỉ là nâng cấp, không phải điều kiện.

## Chi tiết quan sát

### Câu 1 — vào nhóm có sẵn
Thêm bot vào nhóm Zalo dev (có sẵn, nhiều thành viên) qua "Thêm thành viên" → tìm tên bot → vào được ngay, không phải tạo nhóm mới. **Bác bỏ lo ngại "bot Marketplace không vào được nhóm" ở báo cáo mục 4.2 — với nhóm này, vào được.**

### Câu 2 — phạm vi nhận tin
| Loại tin | Nhận được? | Ghi chú |
|---|---|---|
| Text thường (KHÔNG mention) | ❌ Không | test1; và tin "không tag" lúc 12:28 — đều không về |
| Text có @mention bot | ✅ Có | 12:25, 12:29 (x2) — về **trọn nội dung** kèm chuỗi "@Bot ultty AI orders ..." |
| Ảnh (không mention) | ❌ Không | gửi 12:26 — không về |
| Tin thoại (không mention) | ❌ Không | gửi 12:26 — không về |
| Từ thành viên KHÁC | ⬜ Chưa test | mọi tin test đều từ chủ bot (Phùng Việt) — **cần xác nhận mention của đại lý (người khác) cũng về** |
| Ảnh/thoại CÓ mention | ⬜ Chưa test | quyết định liệu đơn dạng ảnh có bắt được qua bot không |

#### Xác định nguyên nhân: NATIVE (mention-gating), KHÔNG phải cấu hình mình chặn

Đã điều tra để loại trừ khả năng "do mình cấu hình sai":

1. **Tài liệu tích hợp OpenClaw** (docs.openclaw.ai/channels/zalo) ghi rõ: *"Groups require an @mention to trigger the bot; this is not configurable per channel"* và bảng năng lực: *"Groups | Supported (mention-gated)"*. → @mention là **hành vi gốc của Zalo Bot Platform**, không tắt được.
2. **Tài liệu webhook chính thức Zalo** (bot.zapps.me/docs/webhook): liệt kê đủ event `message.image.received`, `message.voice.received`… nhưng **KHÔNG có bất kỳ setting privacy/mention nào** để bật/tắt → không có toggle nào mình bỏ sót.
3. **`getMe` của bot mình** không có cờ `can_read_all_group_messages` (cờ mà Telegram dùng để lộ privacy mode tắt) → nền tảng Zalo (Beta) **chưa mở** khả năng đọc mọi tin nhóm. `account_type: BASIC`.
4. **Phía mình sạch:** `getWebhookInfo` = 404 (không gắn webhook nhầm), token hợp lệ (`getMe` ok), poller nhận đúng khi có tag → không có gì bên mình chặn.

**Kết luận nguyên nhân:** bot không thấy ảnh/thoại/tin-không-tag là do **"privacy mode" mặc định BẬT của Zalo Bot Platform ở chế độ nhóm (Beta), hiện KHÔNG tắt được** — KHÔNG phải lỗi cấu hình. (Khác Telegram: Telegram cho tắt privacy qua BotFather; Zalo Beta thì chưa — có thể nằm ở tab "Sắp ra mắt" trong quản lý bot.)

### Câu 3 — giới hạn
Chưa test (mới 1 nhóm). Cần thêm bot vào 2-3 nhóm + gửi liên tiếp để đo số nhóm tối đa / rate limit.

## Quan sát khác (phục vụ thiết kế adapter)
- **Bot gửi tin vào nhóm:** ✅ được — `sendMessage` trả `ok:true`, `message_id`. Tin hiển thị kèm nhãn tự động "— Tin tu dong tu Bot (PoC U Ultty)" (đáp ứng điều khoản gắn nhãn nội dung AI, báo cáo mục 6.3).
- **Cơ chế nhận:** dùng long-polling `getUpdates`. Khi rảnh (không có tin) API trả **HTTP 408 "Request timeout"** — đây là trạng thái BÌNH THƯỜNG, không phải lỗi. *(Đã sửa tool `get-updates.ts` để coi 408 là idle thay vì lỗi chí mạng — trước đó tool tự dừng sau 5 lần 408.)*
- **Webhook:** `getWebhookInfo` trả 404 (chưa gắn webhook) → không xung đột getUpdates. Chưa test chế độ webhook (cần tunnel https).
- **Độ trễ:** tin về sau vài giây tới ~20s (theo chu kỳ long-poll), chấp nhận được cho duyệt đơn.
- **`chat_id` nhóm test:** `zgr-f8a7101d77709e2ec761` (định dạng `zgr-...`).
- **2 cách thêm bot vào nhóm:** (a) trong nhóm → Thêm thành viên → tìm tên bot; (b) tab **"Thông tin"** của bot có **link mời** ("Chia sẻ đường dẫn này vào nhóm mà bạn muốn mời Bot tham gia") → hữu ích cho onboarding hàng loạt 200 nhóm.
- **Biểu đồ "Thống kê" trong app quản lý bot = chiều GỬI ĐI, không phải nhận:** chú thích `sendMessage/sendPhoto/sendSticker/sendChatAction` là method bot gửi (`sendMessage=1` = tin xác nhận mình gửi thử). Không phản ánh việc bot nhận ảnh/thoại. Xác nhận bot **gửi được ảnh/sticker** (dùng cho tin xác nhận đơn).
- **Tương lai ảnh/thoại:** khả năng NHẬN ảnh/thoại đã có sẵn ở nền tảng (event `message.image.received`, `message.voice.received`). Trong **chat 1-1 (PRIVATE)** hầu như chắc nhận được (không bị mention-gate) — *chưa test, nên test để khẳng định*. Trong **nhóm**: chỉ về nếu Zalo bỏ mention-gating (tắt privacy nhóm) — **chưa cam kết, ngoài tầm kiểm soát của mình**; đơn ảnh nhóm (~<20%) vẫn phải Co-pilot.
- **Tab "Sắp ra mắt"** trong quản lý bot: hiện KHÔNG bấm được (có thể là nơi thêm tùy chọn privacy/nhóm trong tương lai).

## Việc còn lại để kết luận 100%
1. **Đồng nghiệp (người khác) @mention** → xác nhận bot thấy tin của đại lý, không chỉ của chủ bot. *(quan trọng nhất còn treo)*
2. **Ảnh/thoại có kèm @mention** → có bắt được đơn dạng ảnh không.
3. **Câu 3:** thêm 2-3 nhóm, đo giới hạn nhóm & rate limit.
4. **Hỏi khách (D2):** đại lý chấp nhận tag bot khi đặt hàng không.
