# CHECKLIST DỮ LIỆU CẦN THU THẬP TỪ KHÁCH HÀNG (U ULTTY)

**Người liên hệ:** chị Nguyễn Thu Phương (Sale chính)
**Việc đầu tiên:** kiểm tra quyền truy cập **link Drive** trong mục 7 của hồ sơ khảo sát (`APP AI_...docx`) — nhiều mục nhóm A/B có thể đã nằm sẵn trong đó, chỉ cần xác nhận bản mới nhất.

Trạng thái: ⬜ chưa có · 🟡 đã hỏi, đang chờ · ✅ đã nhận & kiểm tra

---

## Nhóm A — Nguồn sự thật (CHẶN việc bật AI — Task 0.3)

| # | Cần gì | Chi tiết cần hỏi | Dạng nhận | Chặn task | TT |
|---|---|---|---|---|---|
| A1 | Danh mục SKU (18-20 SP) | Mã SP, tên đầy đủ, **tên thường gọi/viết tắt mà đại lý hay nhắn**, đơn vị, quy cách đóng thùng | Excel hoặc ảnh thông báo giá | 0.3, 0.4, 1.1 | ⬜ |
| A2 | Bảng giá theo cấp | Có những cấp đại lý/CTV nào? Giá từng SKU theo từng cấp? Hiệu lực theo tháng (thông báo giá tháng 7)? Ai có deal riêng — ghi chú từng trường hợp | Excel | 0.3, 1.5 | ⬜ |
| A3 | Chi tiết 4 chính sách | Ngưỡng số lượng áp công nợ 30 vs 45 ngày? Danh sách 2-3 bên ký gửi? **Biểu phí thu hộ COD** (bảng mẫu)? Quy tắc ship chính xác: định nghĩa "nội thành" HN/HCM, mức cước Viettel đi tỉnh theo gì? | Văn bản/Excel | 1.5 | ⬜ |
| A4 | Danh sách đại lý/CTV + map nhóm Zalo | Tên đại lý/CTV, cấp, chính sách mặc định, SĐT, và **nhóm Zalo nào thuộc đại lý nào** (xuất từ tag Zalo đang dùng). Đây là mục tốn công nhất — đề xuất gửi khách file mẫu để Sale điền dần, ưu tiên 10-20 nhóm sẽ pilot trước | Excel theo mẫu mình gửi | 0.3, 1.3 | ⬜ |

## Nhóm B — Dữ liệu kiểm thử AI (CHẶN bake-off — Task 0.4)

| # | Cần gì | Chi tiết cần hỏi | Dạng nhận | Chặn task | TT |
|---|---|---|---|---|---|
| B1 | **20-30 tin nhắn đặt hàng THẬT** | Copy nguyên văn (giữ nguyên viết tắt/không dấu), đủ dạng: TH1, TH2, đơn sửa đổi, đơn nhiều SP. Kèm ngữ cảnh: nhóm nào/đại lý nào nhắn | Text/ảnh chụp màn hình | 0.4 | ⬜ |
| B2 | Đơn ĐÚNG tương ứng (golden output) | Với từng tin nhắn B1: đơn cuối cùng đã lên KiotViet là gì (SP, SL, giá, tổng, ship, thu hộ) — để đo AI đúng/sai | Excel/text | 0.4 | ⬜ |
| B3 | 5-10 ảnh chụp bảng đặt hàng | Phục vụ <20% đơn dạng ảnh (test khả năng đọc ảnh của AI) | Ảnh | 0.4 | ⬜ |
| B4 | Từ điển viết tắt ban đầu | Nhờ Sale liệt kê nhanh: viết tắt địa danh (TN, OCP...), tên gọi tắt SP, tên gọi tắt đại lý, từ hay dùng ("c"=chị, "ck"=chuyển khoản...) | Bảng 2 cột | 0.3, 0.4 | ⬜ |
| B5 | Mẫu format xác nhận đơn Sale đang gửi | Nguyên văn 2-3 tin xác nhận TH1 + TH2 thật (để AI sinh đúng giọng/format hiện tại) | Text | 1.5 | ⬜ |

## Nhóm C — Truy cập hệ thống (chặn Phase 2-3, hỏi sớm vì chờ lâu)

| # | Cần gì | Chi tiết cần hỏi | Chặn task | TT |
|---|---|---|---|---|
| C1 | KiotViet — gói & API | Đang dùng gói nào? Trong trang quản trị có mục Thiết lập → API/Public API không? Nếu có: tạo app lấy client_id/secret. Xin thêm: **file Excel export 5-10 đơn gần nhất** + file mẫu import (để làm Task 2.3 xuất Excel đúng format) | 2.3, GĐ2 | ⬜ |
| C2 | Base — phạm vi dùng & API | Đang dùng app nào của Base (Workflow? Wework?)? Có admin/đầu mối kỹ thuật phía Base không? Format đơn đang nhập vào Base gồm trường gì (xin ảnh màn hình) | GĐ2 | ⬜ |
| C3 | Hóa đơn VAT | Phần mềm hóa đơn nào? Thông tin cần chuẩn bị khi xuất (STK công ty/cá nhân) | GĐ2 | ⬜ |

## Nhóm D — Quyết định khách cần chốt (chặn go-live)

| # | Quyết định | Ghi chú | TT |
|---|---|---|---|
| D1 | Lập **nhóm Zalo test** + đồng ý add bot PoC | Nhóm test riêng (2-3 người phía khách + đội dự án), KHÔNG dùng nhóm đại lý thật cho PoC | ⬜ |
| D2 | Nếu bot chỉ nhận @mention: đại lý có chấp nhận tag bot khi đặt hàng? | Chờ kết quả PoC câu 2 rồi hỏi | ⬜ |
| D3 | Design app (AutoRep) là spec bắt buộc hay tham khảo UX? Facebook/Telegram thuộc giai đoạn nào? | Ảnh trong `design/` | ⬜ |
| D4 | AI có được TỰ trả lời tư vấn trong nhóm không, hay chỉ soạn nháp cho Sale? | Cần **văn bản xác nhận** nếu bật tự trả lời (quyết định kiến trúc #4) | ⬜ |
| D5 | Danh sách người dùng app: Sale/kế toán/quản lý (tên + SĐT + vai trò) | Cho Task 2.1 auth & phân quyền | ⬜ |
| D6 | Mẫu thông báo "nhóm có hệ thống hỗ trợ tự động" gửi các nhóm | Tuân thủ điều khoản Zalo Bot + NĐ13/Luật BVDLCN (mình soạn nháp, khách duyệt) | ⬜ |
| D7 | Chốt phạm vi GĐ1 + KPI + mốc pilot 1-2 nhóm | Theo mục 8 tài liệu NetViet | ⬜ |

---

## Gợi ý cách hỏi hiệu quả

1. **Gửi khách đúng 1 email/tin nhắn Zalo** kèm bảng A+B (đính kèm file Excel mẫu cho A4, B1-B2 để Sale điền thẳng) — tránh hỏi rải rác.
2. Đề xuất **1 buổi call 30-45 phút với chị Phương** đi qua nhóm A3 (chính sách) và B4 (viết tắt) — hỏi miệng nhanh hơn nhiều so với chờ điền form.
3. Nhóm B1-B2: hướng dẫn Sale mở 10 nhóm gần nhất có đơn → copy tin nhắn + mở KiotViet chụp đơn tương ứng — làm 1 lần ~1 giờ là đủ 20-30 cặp.
4. Nhấn mạnh với khách: **A1-A4 + B1-B2 là điều kiện bật AI** (nguyên tắc "chuẩn hóa nguồn sự thật trước khi bật AI" trong tài liệu NetViet mục 1) — dữ liệu càng sớm, go-live càng sớm.
