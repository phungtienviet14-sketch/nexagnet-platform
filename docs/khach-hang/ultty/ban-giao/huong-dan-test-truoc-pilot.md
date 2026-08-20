# Hướng dẫn test hệ thống AI xử lý đơn hàng Zalo — Ultty, trước Pilot GĐ1

> Tài liệu cho **người test nghiệp vụ**. Không cần biết lập trình.
> Mục tiêu: xác nhận AI **đọc đúng** tin đặt hàng và **tính đúng** tiền, trước khi cho chạy thật với đại lý.

---

## 1. Bạn đang test cái gì

Hệ thống đọc tin nhắn đặt hàng viết tay trên Zalo (viết tắt, không dấu), tự trích ra **mã hàng / số
lượng / đại lý**, rồi **tính tiền bằng bộ quy tắc cố định** và soạn tin xác nhận.

Điều quan trọng nhất cần hiểu để test cho đúng:

> **AI không tính tiền.** AI chỉ *phân loại ý định* và *bóc tách thông tin*. Giá, cước, VAT, chính
> sách công nợ đều do một bộ quy tắc cố định tính từ bảng giá trong hệ thống.

Nghĩa là: nếu **số tiền** sai → lỗi ở **bảng giá / quy tắc** (sửa được ngay, không cần train lại).
Nếu **đọc sai mã hàng hay số lượng** → lỗi ở **phần AI đọc hiểu** (sửa bằng cách bổ sung từ điển
viết tắt + ví dụ mẫu). Khi báo lỗi, chỉ cần mô tả hiện tượng — chúng tôi sẽ phân loại.

---

## 2. Vào hệ thống

| | |
|---|---|
| Màn hình demo | `https://demo-ultty-gd1-test.35-187-235-82.sslip.io` |
| Màn hình vận hành | `https://operator-ultty-gd1-test.35-187-235-82.sslip.io` |
| Tài khoản | `operator` |
| Mật khẩu | *(gửi riêng, không nằm trong tài liệu này)* |

> ⚠️ **Dùng đúng đường dẫn có `-ultty-gd1-test`.** Đây là môi trường **thử nghiệm riêng**, đã **khóa
> chức năng tự gửi tin ra Zalo** — bạn thử bao nhiêu cũng không có tin nào bị bắn vào nhóm đại lý.
> Bản demo cũ (địa chỉ **không** có `-ultty-gd1-test`) **đang bật tự gửi**, gõ thử ở đó có thể làm
> hệ thống nhắn thật vào nhóm Zalo. Nếu bạn nhận nhầm link, hỏi lại trước khi gõ.

**Dữ liệu ở đây là dữ liệu TEST**, không phải đơn hàng thật của khách. Cứ thử thoải mái.

---

## 3. Cách test

Ở màn hình demo có ô nhập tin nhắn. Gõ vào đó **đúng như cách đại lý hay nhắn trên Zalo** — viết
tắt, không dấu, sai chính tả đều được. Đó chính là thứ cần kiểm.

Với mỗi tin, xem 3 cột:

1. **Feed** — tin bạn vừa gửi.
2. **6 agent** — các bước hệ thống đang xử lý (hiện trực tiếp theo thời gian thực).
3. **Nguồn sự thật + hàng việc** — kết quả: đơn được tạo, giá, và đơn đang chờ ai xử lý.

### Cần đối chiếu những gì

| Kiểm | Câu hỏi |
|---|---|
| Mã hàng | Có đúng sản phẩm đại lý muốn không? |
| Số lượng | Có đúng con số trong tin không? |
| Đại lý / chi nhánh | Có nhận đúng người đặt không? |
| Đơn giá | Có khớp bảng giá đang áp dụng không? |
| Tổng tiền | Nhân ra có đúng không? |
| Trạng thái | Đơn tự xác nhận hay chuyển Sale? (xem §4) |

---

## 4. Quy tắc GĐ1 cần nhớ khi đối chiếu

- Đơn **hợp lệ** và **tổng số lượng ≤ 50** → hệ thống tự soạn xác nhận.
- Đơn **> 50** hoặc **thiếu dữ liệu** (không rõ mã hàng / giá / đại lý) → **chuyển Sale** xử lý trước.
- Sau khi xác nhận, **Sale vẫn phải tự nhập KiotViet bằng tay**. GĐ1 **chưa nối** KiotViet/Base —
  đây là đúng thiết kế, không phải thiếu sót.
- **TH1** (giao cho đại lý) → **miễn cước**.
- **TH2** (giao thẳng khách của đại lý) → có cước + có thể có thu hộ (COD).

---

## 5. Bộ tình huống nên thử

Bắt đầu bằng 4 câu mẫu có sẵn, rồi tự biến tấu:

```
gui 10 ghe felix ve TN cho c, ko lay VAT
3 noi chien va 2 quat bb grey
5 quat elni, xuat VAT
quat bb grey bao nhieu tien c oi
```

Sau đó thử các nhóm sau — đây là chỗ hay lộ lỗi nhất:

| Nhóm | Ví dụ nên thử |
|---|---|
| Viết tắt / không dấu | `gui ve TN`, `OCP`, `ship ve HN` |
| Nhiều mặt hàng một tin | 3–4 dòng sản phẩm trong cùng một tin |
| Số lượng lớn | trên 50 sản phẩm → phải chuyển Sale, **không** tự gửi |
| Thiếu thông tin | không ghi số lượng, hoặc tên hàng mơ hồ |
| Hỏi giá | `bao nhieu tien`, `giá lẻ bao nhiêu` |
| Sai chính tả tên hàng | `qat elni`, `ghe felic` |
| Đổi ý giữa chừng | đặt xong rồi nhắn `cho e sua thanh 5 cai` |
| Tin không phải đơn | chào hỏi, hỏi bảo hành, hỏi giao hàng |

Với **mỗi lỗi**, ghi lại: **(a)** câu bạn gõ nguyên văn, **(b)** kết quả hệ thống ra, **(c)** kết quả
đúng phải là gì. Câu gõ nguyên văn là phần quan trọng nhất — thiếu nó thì không tái hiện được.

---

## 6. ⚠️ Những chỗ ĐÃ BIẾT là chưa đúng — không cần báo lại

Các mục dưới đây đã được ghi nhận và đang chờ khách cung cấp dữ liệu hoặc chốt chính sách. **Nếu gặp,
xin bỏ qua** — báo lại chỉ làm loãng danh sách lỗi thật.

| Chỗ | Hiện tại đang làm gì | Đúng ra phải thế nào |
|---|---|---|
| **VAT** | Mặc định **không** VAT, chỉ áp khi tin có chữ "xuất VAT" | Phải theo **chính sách từng đại lý** (hợp đồng công nợ ghi *giá đã gồm GTGT*) |
| **Phí COD** | Một mức **phẳng 20.000đ** | Theo **bảng phí riêng** — chưa có bảng |
| **Cước ship** | Tạm 30.000đ nội thành / 40.000đ tỉnh | Theo **biểu cước Grab/Viettel** — chưa có biểu |
| **Công nợ 7 ngày** | Chưa có | Khảo sát có nhắc; **chưa rõ** là chính sách riêng hay điều khoản của ký gửi |
| **Tư vấn giá lẻ** | Đang trả **giá sỉ** | Phải trả **giá lẻ tối thiểu** kèm câu lưu ý "giá tham khảo" |
| **Khuyến mãi** | **Tắt** hoàn toàn | Chưa có nguồn xác nhận công thức → cố ý không đoán |
| **Chiến dịch CSKH** | Gửi ngay, chưa có lịch | Phải Sale duyệt → lên lịch → rải đều trong khung giờ |
| **Duyệt nội bộ** | 1 Sale duyệt 1 chạm | Quy trình thật có **2 cổng kiểm soát nội bộ** + phiếu giao hàng 4 chữ ký |

**Còn thiếu dữ liệu đầu vào (đang chờ khách):** bảng phí COD · biểu cước ship · bảng giá tháng
08/2026 (hiện mới có T7) · danh sách đại lý/CTV đầy đủ + map nhóm Zalo · công thức khuyến mãi.

---

## 7. Ngoài phạm vi GĐ1 — không phải lỗi

- **Không** nối KiotViet, **không** nối Base. Sale nhập tay sau khi hệ thống xác nhận.
- **Không** có module quản lý kho.
- **Không** xuất hóa đơn VAT tự động.
- Hệ thống **chưa** tự gửi tin ra nhóm Zalo ở môi trường này (đã khóa có chủ ý).

---

## 8. Gửi kết quả về

Ghi vào một file (Word/Excel/Sheet đều được), mỗi lỗi một dòng:

| Câu gõ nguyên văn | Hệ thống ra | Đúng phải là | Mức độ |
|---|---|---|---|
| `gui 10 ghe felix ve TN` | … | … | Nặng / Vừa / Nhẹ |

Mức độ: **Nặng** = sai tiền hoặc sai mã hàng · **Vừa** = đọc thiếu, phải sửa tay · **Nhẹ** = câu chữ,
hiển thị.
