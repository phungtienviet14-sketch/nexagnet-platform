# Bàn giao — Vận hành vận tải

**Bắt đầu từ đây:** [**Giới thiệu hệ thống cho lãnh đạo**](gioi-thieu-he-thong-cho-lanh-dao.md), cũng có [bản PDF](gioi-thieu-he-thong-cho-lanh-dao.pdf).

Tài liệu này mô tả luồng hiện hành, theo thứ tự:

1. **Đơn hàng**, với điểm lấy và điểm giao chọn trên bản đồ;
2. **Vòng xe**;
3. **Chặng rỗng** và **chặng có hàng**;
4. **Mốc hiện trường** của lái xe;
5. **Kết thúc đơn**;
6. **Đối soát**, **phải thu**, **thu tiền**.

Tài liệu cũng nói hai đường tiền của nhiên liệu, biên trực tiếp, và những hạn chế hiện tại. Đọc trong khoảng 15 phút.

| File                                                                                                                       | Dành cho                           | Nội dung                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`gioi-thieu-he-thong-cho-lanh-dao.md`](gioi-thieu-he-thong-cho-lanh-dao.md) · [PDF](gioi-thieu-he-thong-cho-lanh-dao.pdf) | **Lãnh đạo** — tài liệu chính      | Hệ thống giải quyết việc gì, một đơn đi qua công ty, từ cần biết, ai làm gì, 10 màn hình có khoanh, nhiên liệu và quỹ lái xe, hạn chế, việc cần lãnh đạo quyết                           |
| [`huong-dan-ke-toan.md`](huong-dan-ke-toan.md) · [PDF](huong-dan-ke-toan.pdf)                                              | **Kế toán**                        | Việc hằng ngày theo thứ tự: kết thúc đơn, đối soát và thu tiền, phải trả, nhiên liệu và đối soát bảng kê, quỹ lái xe, lương, hiệu quả từng đơn, tình huống thường gặp — 12 ảnh có khoanh |
| [`huong-dan-tai-xe.md`](huong-dan-tai-xe.md) · [PDF](huong-dan-tai-xe.pdf)                                                 | **Lái xe** — đọc trên điện thoại   | Bấm đâu, thấy gì, làm gì tiếp: trang chủ, hiện trường, chờ người nhận, biên nhận, nhiên liệu, quỹ, phiếu lương, khi mất sóng — 14 ảnh điện thoại                                         |
| [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md)                                                               | Người triển khai                   | Danh sách kiểm thay dữ liệu mẫu bằng dữ liệu thật, sáu mẫu thu thập, và những gì cần khách chốt                                                                                          |
| [`bat-dau-nhanh.md`](bat-dau-nhanh.md)                                                                                     | _(cũ)_ Giám đốc · Kế toán · Lái xe | Viết theo cách làm dựa trên **chuyến**, trước khi có đơn hàng và vòng xe. Nhiều tên menu đã đổi                                                                                          |
| [`kich-ban-demo.md`](kich-ban-demo.md)                                                                                     | _(cũ)_ Người trình bày             | Kịch bản đo ngày 06/09/2026 theo chuyến. Số liệu kỳ vọng không còn khớp                                                                                                                  |
| [`van-hanh-ban-demo.md`](van-hanh-ban-demo.md)                                                                             | _(cũ)_ Người vận hành              | Sao lưu và phục hồi cho stack máy ảo cũ. **Không chạy mục làm lại dữ liệu** trên bản demo hiện tại                                                                                       |
| [`nguon-html/`](nguon-html/README.md)                                                                                      | Người bảo trì tài liệu             | Cách tái sinh PDF từ Markdown                                                                                                                                                            |
| [`cong-cu-anh/`](cong-cu-anh/README.md)                                                                                    | Người bảo trì tài liệu             | Kịch bản chụp lại ảnh kế toán và lái xe trên bản cục bộ                                                                                                                                  |

> **Trạng thái:** bản demo chạy trên dữ liệu mẫu. Khách chưa nghiệm thu trên nghiệp vụ thật của
> mình. Chỉ nghiệm thu của khách mới biến nó thành hệ thống đã được chứng minh cho doanh nghiệp.

## Bảng phân quyền

Có bốn vai trên nền tảng. Bảng dưới đối chiếu với mã nguồn ngày 24/09/2026. **Máy chủ cưỡng chế lại lần nữa**, nên ẩn một nút trên màn hình không phải là cách cấp quyền.

|                                                                                                                    | Giám đốc | Kế toán | Lái xe | Quản lý |
| ------------------------------------------------------------------------------------------------------------------ | -------- | ------- | ------ | ------- |
| Xem toàn bộ màn hình vận hành                                                                                      | ✅       | ✅      | ❌     | ❌      |
| Tạo đơn trên bản đồ, lập kế hoạch và giao xe, tiến chặng, xác nhận giao xong                                       | ✅       | ✅      | —      | ❌      |
| Kết thúc đơn, đối soát với khách, ghi và phân bổ tiền về                                                           | ✅       | ✅      | ❌     | ❌      |
| Hồ sơ xe · lái xe · khách hàng · đối tác                                                                           | ✅       | ✅      | ❌     | ❌      |
| Quỹ lái xe: tạm ứng, hoàn quỹ, điều chỉnh, bút toán đảo                                                            | ✅       | ✅      | ❌     | ❌      |
| Nhiên liệu: xác thực phiếu, nhập bảng kê, so khớp, xử lý chênh lệch, chốt kỳ                                       | ✅       | ✅      | ❌     | ❌      |
| Báo cáo công nợ, biên trực tiếp, chuỗi chứng từ                                                                    | ✅       | ✅      | ❌     | ❌      |
| Bảo dưỡng · giấy tờ · cảnh báo                                                                                     | ✅       | ✅      | ❌     | ❌      |
| Lương: mở kỳ, chạy lương, duyệt, chi, phát phiếu bù/đảo                                                            | ✅       | ✅      | ❌     | ❌      |
| **Mở lại kỳ chi phí / quỹ đã chốt**                                                                                | ✅       | ❌      | ❌     | ❌      |
| **Mở lại kỳ đối soát nhiên liệu**                                                                                  | ✅       | ❌      | ❌     | ❌      |
| **Xem lịch sử vị trí** của lái xe                                                                                  | ✅       | ❌      | ❌     | ❌      |
| **Huỷ chuyến** (chuyến theo cách cũ)                                                                               | ✅       | ❌      | ❌     | ❌      |
| Việc được giao **cho chính mình**: xem, bấm mốc hiện trường, chụp giấy tờ                                          | —        | —       | ✅     | ❌      |
| Phiếu nhiên liệu **của chính mình**, chọn tự trả tiền mặt hay ghi nợ cây xăng                                      | —        | —       | ✅     | ❌      |
| Khoản chi dọc đường **của chính mình**. Hiện chỉ ghi được trên chuyến theo cách cũ, **chưa ghi được trên vòng xe** | —        | —       | ✅     | ❌      |
| Số dư quỹ và phiếu lương **của chính mình**, chỉ phiếu đã công bố                                                  | —        | —       | ✅     | ❌      |

**Kế toán bị máy chủ từ chối mười việc** mà giám đốc làm được:

- huỷ chuyến;
- mở lại kỳ chi phí;
- mở lại kỳ đối soát nhiên liệu;
- xem lịch sử vị trí;
- ghi mốc hiện trường;
- đóng phiên chờ;
- rút giấy tờ vận hành;
- rút bằng chứng;
- nhập vị trí từ thiết bị trên xe;
- quản lý vùng địa điểm.

Nhiều việc trong số này hiện chưa có nút trên màn hình cho cả hai vai. Kế toán **được** tạo đơn và điều xe: phía điều xe gần như chưa tách vai.

**Vai Quản lý chưa được cấp quyền vận tải nào.** Đây là một khoảng trống **chưa ai quyết**, không phải một lỗi: tài liệu nghiệp vụ của khách chỉ mô tả ba mẫu vai. Người đăng nhập bằng vai này nhận được một câu nói thẳng điều đó, kèm chỉ dẫn liên hệ quản trị viên. Xem [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md); đây là một trong các mục cần khách chốt trước khi chạy thật.

## Cách ly dữ liệu lái xe: điều đáng nói với khách

Lái xe **không nhìn thấy giá cước, doanh thu, biên, hay công nợ của khách**, và điều đó không phải do ẩn trên màn hình. Máy chủ dựng riêng một khung nhìn cho lái xe; các trường tiền không nằm trong dữ liệu gửi xuống điện thoại. Lái xe chỉ thấy:

- việc được giao;
- quỹ của mình;
- phiếu dầu của mình;
- phiếu lương của mình.

Đã đo trên bản chạy, với khung nhìn chuyến theo cách cũ:

- khung nhìn có **0 trường mang hình dạng tiền**;
- giá cước đặt lúc lập chuyến **không xuất hiện** trong dữ liệu chuyến của chính lái xe đó;
- mở chuyến của người khác trả `403`, với thân phản hồi **giống hệt từng byte** phản hồi cho một chuyến không tồn tại, nên không thể dò xem chuyến nào có thật.

Thẻ việc theo vòng xe trên màn lái xe cũng không có ô tiền nào.

## Những việc hệ thống này KHÔNG làm

Nói trước, để không ai phải phát hiện giữa buổi demo:

| Không có                                            | Ghi chú                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giám sát hành trình liên tục / thiết bị trên xe** | Điểm lấy và điểm giao của đơn được chọn trên bản đồ. Vị trí điện thoại lái xe chỉ được lấy lúc bấm "Đã đến nơi" và "Khách đã nhận hàng". Tiến độ chặng do văn phòng bấm. Chưa nối thiết bị giám sát hành trình trên xe                                         |
| **Kế toán theo chuẩn mực / sổ sách thuế**           | Hệ thống tính công nợ và biên trực tiếp để phục vụ điều hành. Nó không thay phần mềm kế toán                                                                                                                                                                   |
| **Hoá đơn điện tử**                                 | Không phát hành, không ký số, không nối cơ quan thuế                                                                                                                                                                                                           |
| **Chế độ ngoại tuyến cho lái xe**                   | Màn hình lái xe cần mạng. Mất sóng giữa đường thì bấm lại khi có sóng; bấm lại không tạo mốc trùng                                                                                                                                                             |
| **Phân bổ chi phí cố định**                         | Biên hiển thị là **biên trực tiếp — chưa gồm chi phí cố định**, và nhãn đó có mặt ở mọi nơi hiển thị biên. Khấu hao, lương văn phòng, lãi vay không được phân bổ vào đơn hay vòng xe. Dòng chưa đủ số được đánh dấu "Chưa ghi chi phí" hoặc "Dầu chưa phân bổ" |
| **Trừ lương tự động khi lệch nhiên liệu**           | Bảng kê lệch hoặc mập mờ **không bao giờ** tự sinh nợ cho lái xe hay khoản trừ lương. Một người phải quyết định điều đó                                                                                                                                        |
| **Nối ERP / phần mềm bán hàng**                     | Chưa có. Cổng kết nối tồn tại trong kiến trúc nhưng không được gọi ở giai đoạn này                                                                                                                                                                             |
| **Nhập hàng loạt danh mục nền**                     | Xe, lái xe, khách hàng, đối tác nhập bằng biểu mẫu trên màn hình. Chỉ **bảng kê cây xăng** có đường nhập tệp trong sản phẩm. Xem [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md)                                                                  |

Hai mục cuối là **quyết định hoặc giới hạn hiện tại**, không phải điều bất biến. Nếu khách cần, chúng nằm trong danh sách cần chốt ở tài liệu chuyển dữ liệu. Các hạn chế khác của luồng hiện hành được liệt kê ở mục 9 của [tài liệu cho lãnh đạo](gioi-thieu-he-thong-cho-lanh-dao.md#9-hạn-chế-hiện-tại).
