# KẾT QUẢ PoC ZALO BOT PLATFORM

**Trạng thái:** ⬜ CHƯA CHẠY — làm theo [tools/poc-zalo-bot/README.md](../tools/poc-zalo-bot/README.md) rồi điền vào đây.
**Người thực hiện:** _(tên)_ · **Ngày:** _(dd/mm/yyyy)_ · **Log:** `tools/poc-zalo-bot/logs/`

## Kết luận nhanh (điền sau khi test)

| Câu hỏi Beta | Kết quả | Bằng chứng |
|---|---|---|
| 1. Bot vào được nhóm cá nhân có sẵn? | ⬜ Có / ⬜ Không / ⬜ Có điều kiện: ... | bước 1.1-1.3 |
| 2. Nhận mọi tin nhắn hay chỉ @mention? | ⬜ Mọi tin / ⬜ Chỉ @mention / ⬜ Khác: ... | bước 2.1-2.5 |
| 3. Giới hạn số nhóm / rate limit? | _(số nhóm tối đa, error_code nếu gặp)_ | bước 3.1-3.3 |

## Quyết định kênh GĐ1

- ⬜ **Bot đạt cả 3** → bật `BotPlatformAdapter` (ingestion tự động) ngay GĐ1; Co-pilot giữ làm fallback
- ⬜ **Bot chỉ nhận @mention** → hỏi khách (chị Phương) có chấp nhận thói quen tag bot khi đặt hàng; nếu đồng ý → vẫn dùng Bot
- ⬜ **Bot không vào được nhóm sẵn có** → GĐ1 chạy thuần Co-pilot (dán tay); đánh giá lại Bot Platform sau (Beta đang phát triển)

## Chi tiết quan sát

### Câu 1 — vào nhóm có sẵn
_(ghi từng bước, chụp màn hình nếu cần)_

### Câu 2 — phạm vi nhận tin
| Loại tin | Nhận được? | event_name | Ghi chú |
|---|---|---|---|
| Text thường (không mention) | | | |
| Text có @bot | | | |
| Ảnh | | | |
| Tin thoại | | | |
| Từ thành viên khác | | | |

### Câu 3 — giới hạn
_(số nhóm đã thử, lỗi gặp, tần suất gửi thử)_

### Quan sát khác
- Gửi tin vào nhóm: _(được/không, hiển thị thế nào)_
- Tin nhắn khi bot offline có về lại không: _(có/không)_
- Webhook vs polling: _(độ trễ, độ ổn định)_
