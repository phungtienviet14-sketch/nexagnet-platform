# Bàn giao — Vận hành vận tải

Gói tài liệu để một doanh nghiệp vận tải **dùng được hệ thống mà không cần lập trình viên**: ba bản
bắt đầu nhanh theo vai, thủ tục thay dữ liệu mẫu bằng dữ liệu thật, việc vận hành bản demo, và kịch
bản trình diễn.

| File                                                         | Dành cho                    | Nội dung                                                                                        |
| ------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------- |
| [`bat-dau-nhanh.md`](bat-dau-nhanh.md)                       | Giám đốc · Kế toán · Lái xe | Ba bản bắt đầu nhanh, mỗi bản 10–15 phút                                                        |
| [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md) | Người triển khai            | Danh sách kiểm thay dữ liệu mẫu bằng dữ liệu thật, sáu mẫu thu thập, và những gì cần khách chốt |
| [`van-hanh-ban-demo.md`](van-hanh-ban-demo.md)               | Người vận hành              | Sao lưu, phục hồi, đưa bản demo về trạng thái đầu                                               |
| [`kich-ban-demo.md`](kich-ban-demo.md)                       | Người trình bày             | Kịch bản 30–45 phút, số liệu kỳ vọng, câu hỏi cần hỏi khách                                     |

> Trạng thái hiện tại: **ứng viên demo, đã chứng minh trên bản chạy thật** — chưa phải
> `BUSINESS-PROVEN`. `BUSINESS-PROVEN` chỉ đến từ nghiệm thu của chính khách hàng.

## Bảng phân quyền

Bốn vai của nền tảng. Bảng này **chép từ mã nguồn**
(`apps/web/experiences/transport-operations/transport-actions.ts`), không phải mô tả mong muốn —
và máy chủ cưỡng chế lại lần nữa, nên ẩn một nút trên màn hình không phải là cách cấp quyền.

|                                                                              | Giám đốc (`ADMIN`) | Kế toán (`ACCOUNTING`) | Lái xe (`SALE`) | Quản lý (`MANAGER`) |
| ---------------------------------------------------------------------------- | ------------------ | ---------------------- | --------------- | ------------------- |
| Xem toàn bộ màn hình vận hành                                                | ✅                 | ✅                     | ❌              | ❌                  |
| Lập / sửa / phân công / chuyển trạng thái chuyến                             | ✅                 | ✅                     | —               | ❌                  |
| **Huỷ chuyến**                                                               | ✅                 | ❌                     | ❌              | ❌                  |
| Hồ sơ xe · lái xe · khách hàng · đối tác                                     | ✅                 | ✅                     | ❌              | ❌                  |
| Quỹ lái xe: tạm ứng, hoàn quỹ, điều chỉnh, bút toán đảo                      | ✅                 | ✅                     | ❌              | ❌                  |
| **Mở lại kỳ quỹ**                                                            | ✅                 | ❌                     | ❌              | ❌                  |
| Nhiên liệu: xác thực phiếu, nhập bảng kê, so khớp, xử lý chênh lệch, chốt kỳ | ✅                 | ✅                     | ❌              | ❌                  |
| **Mở lại kỳ đối soát nhiên liệu**                                            | ✅                 | ❌                     | ❌              | ❌                  |
| Báo cáo công nợ, biên trực tiếp, chuỗi chứng từ                              | ✅                 | ✅                     | ❌              | ❌                  |
| Bảo dưỡng · giấy tờ · cảnh báo                                               | ✅                 | ✅                     | ❌              | ❌                  |
| Lương: mở kỳ, chạy lương, duyệt, chi, phát phiếu bù/đảo                      | ✅                 | ✅                     | ❌              | ❌                  |
| Chuyến **của chính mình** — xem, bắt đầu, báo đã giao                        | —                  | —                      | ✅              | ❌                  |
| Phiếu nhiên liệu **của chính mình** + ảnh chứng từ                           | —                  | —                      | ✅              | ❌                  |
| Khoản chi **của chính mình** trên chuyến được phân công                      | —                  | —                      | ✅              | ❌                  |
| Số dư quỹ **của chính mình**                                                 | —                  | —                      | ✅              | ❌                  |
| Phiếu lương **của chính mình**, chỉ phiếu đã công bố                         | —                  | —                      | ✅              | ❌                  |

Ba ô ❌ in đậm của Kế toán là **ba đường từ chối duy nhất** phân biệt Kế toán với Giám đốc. Cả ba
đã được đo trên bản chạy thật: trả `403`, không phải ẩn nút.

**Vai Quản lý chưa được cấp quyền vận tải nào.** Đây là một khoảng trống **chưa ai quyết**, không
phải một lỗi: tài liệu nghiệp vụ của khách chỉ mô tả ba mẫu vai. Người đăng nhập bằng vai này nhận
được một câu nói thẳng điều đó kèm chỉ dẫn liên hệ quản trị viên. Xem
[`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md) — đây là một trong các mục cần khách
chốt trước khi chạy thật.

## Cách ly dữ liệu lái xe — điều đáng nói với khách

Lái xe **không nhìn thấy giá cước, doanh thu hay biên lợi nhuận** — và điều đó không phải do ẩn
trên màn hình. Máy chủ dựng riêng một khung nhìn cho lái xe; các trường tiền của chuyến không nằm
trong dữ liệu gửi xuống điện thoại, nên không có cách nào đọc ra chúng kể cả khi mở công cụ lập
trình của trình duyệt.

Đã đo trên bản chạy: khung nhìn chuyến của lái xe có **0 trường mang hình dạng tiền**; giá cước đặt
lúc lập chuyến **không xuất hiện** trong dữ liệu chuyến của chính lái xe đó; và mở chuyến của người
khác trả `403` với thân phản hồi **giống hệt từng byte** phản hồi cho một chuyến không tồn tại —
nên không thể dò xem chuyến nào có thật.

## Những việc hệ thống này KHÔNG làm

Nói trước, để không ai phải phát hiện giữa buổi demo:

| Không có                                  | Ghi chú                                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Định vị GPS / giám sát hành trình**     | Trạng thái chuyến do người bấm, không đọc từ thiết bị trên xe.                                                                                                                                 |
| **Kế toán theo chuẩn mực / sổ sách thuế** | Hệ thống tính công nợ và biên trực tiếp phục vụ điều hành. Nó không thay phần mềm kế toán.                                                                                                     |
| **Hoá đơn điện tử**                       | Không phát hành, không ký số, không nối cơ quan thuế.                                                                                                                                          |
| **Chế độ ngoại tuyến cho lái xe**         | Màn hình lái xe cần mạng. Mất sóng giữa đường thì khai lại khi có sóng.                                                                                                                        |
| **Phân bổ chi phí cố định**               | Biên hiển thị là **biên trực tiếp — chưa gồm chi phí cố định**, và nhãn đó có mặt ở mọi nơi hiển thị biên. Khấu hao, lương văn phòng, lãi vay không được phân bổ vào chuyến.                   |
| **Trừ lương tự động khi lệch nhiên liệu** | Bảng kê lệch hoặc mập mờ **không bao giờ** tự sinh nợ cho lái xe hay khoản trừ lương. Một người phải quyết định điều đó.                                                                       |
| **Nối ERP / phần mềm bán hàng**           | Chưa có. Cổng kết nối tồn tại trong kiến trúc nhưng không được gọi ở giai đoạn này.                                                                                                            |
| **Nhập hàng loạt danh mục nền**           | Xe, lái xe, khách hàng, đối tác nhập bằng biểu mẫu trên màn hình. Chỉ **bảng kê cây xăng** có đường nhập tệp trong sản phẩm. Xem [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md). |

Hai mục cuối là **quyết định/giới hạn hiện tại**, không phải điều bất biến — nếu khách cần, chúng
nằm trong danh sách cần chốt ở tài liệu chuyển dữ liệu.
