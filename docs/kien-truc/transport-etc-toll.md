# ETC / PHÍ ĐƯỜNG BỘ — NGHIÊN CỨU, KHÔNG PHẢI THIẾT KẾ NGHIỆP VỤ

> **Trạng thái: `RESEARCH ONLY` · `BUSINESS WORKFLOW NOT INVENTED`.**
>
> Tài liệu này trả lời `Q-07` của [transport-domain-v2.md](transport-domain-v2.md) §7 ở phần **đo
> được**, và nói rõ phần **chưa đo được**. Mọi mô hình dữ liệu bên dưới đều mang nhãn
> `NOT BUSINESS-PROVEN`: chúng mô tả *hình dạng dữ liệu nhà cung cấp phát ra*, **không** mô tả cách
> công ty B đối soát hay hạch toán. #237: *"Do not invent business settlement rules."*
>
> Đo ngày **08/09/2026**. Lane D / Issue #237, tranche `R7`.

---

## 0. Ba câu trả lời ngắn

| Câu hỏi của #237 | Trả lời đo được |
|---|---|
| Có API công khai không? | **Không tìm thấy tài liệu API công khai** của VETC hay ePass. Không nhà cung cấp nào công bố cổng nhà phát triển |
| Nguồn dữ liệu giao dịch là gì? | **Hoá đơn điện tử** — nó liệt kê **từng lượt xe qua trạm**, kèm thời điểm và giá phí từng lượt. Cộng cổng thông tin khách hàng để tra cứu |
| Một tài khoản ↔ một xe? | **Không.** Một *tài khoản giao thông doanh nghiệp* liên kết được **nhiều xe** |

Ba câu đó quyết định hình dạng của `TollProviderPort` ở §4: cổng phải nhận **tệp/hoá đơn** làm
đường chính, và **API là đường phụ có thể không bao giờ tồn tại** — ngược hẳn với thứ tự quen thuộc.

---

## 1. Khung pháp lý đang có hiệu lực

| Thứ | Nội dung | Nguồn |
|---|---|---|
| **Nghị định 119/2024/NĐ-CP** + **Luật Đường bộ Điều 43** | Phí đường bộ phải thanh toán **điện tử** qua **tài khoản giao thông**, và tài khoản đó phải **liên kết ví điện tử hoặc thẻ ngân hàng** | [thoibaonganhang.vn](https://thoibaonganhang.vn/tai-khoan-vetc-va-epass-sap-khai-tu-hang-trieu-xe-doi-mat-nguy-co-ket-tram-168869.html) |
| Hạn chuyển đổi | **01/10/2025** — sau mốc này xe chưa chuyển đổi **không qua được trạm**. Mốc này **đã qua** | như trên |

**Hệ quả cho ta:** "tài khoản giao thông" là một khái niệm **có định nghĩa pháp lý**, không phải
tên thương mại của một ứng dụng. Mô hình dữ liệu phải gọi đúng tên nó, và **không** gắn cứng vào
VETC hay ePass.

---

## 2. Hai nhà cung cấp

| | VETC | ePass |
|---|---|---|
| Pháp nhân | Công ty TNHH thu phí tự động VETC | Công ty CP Giao thông số Việt Nam (VDTC) — công ty con của **Viettel** |
| Công nghệ | RFID | RFID |
| Cổng khách hàng | `customer.vetc.com.vn` — đăng nhập bằng **số tài khoản + mật khẩu VETC gửi qua SMS** | (chưa đo được cổng tương đương) |
| Ví liên kết | Ví VETC | Viettel Money |

Nguồn: [luatvietnam.vn](https://luatvietnam.vn/thue-phi-le-phi/cach-lay-hoa-don-dien-tu-vetc-565-95549-article.html) ·
[viettimes.vn](https://viettimes.vn/ai-dung-sau-2-ung-dung-thu-phi-khong-dung-epass-va-vetc-post204704.html)

**Đọc ra một ràng buộc thiết kế:** đăng nhập cổng khách hàng bằng *mật khẩu gửi SMS* nghĩa là **một
con người phải đăng nhập**. Không có luồng máy-với-máy nào ở đây. Bất kỳ thiết kế nào giả định
"hệ thống tự kéo dữ liệu về hằng đêm" là giả định **chưa có cơ sở**.

---

## 3. Nguồn dữ liệu giao dịch — hoá đơn điện tử là thứ giàu nhất

Hoá đơn điện tử của VETC/ePass **liệt kê chi tiết mỗi lượt xe đi qua trạm thu phí**, gồm:

- thời gian xe đi qua;
- giá phí sử dụng đường bộ **cho từng lượt**.

Nguồn: [luatvietnam.vn](https://luatvietnam.vn/thue-phi-le-phi/cach-lay-hoa-don-dien-tu-vetc-565-95549-article.html) ·
[luatminhkhue.vn](https://luatminhkhue.vn/huong-dan-cach-lay-hoa-don-dien-tu-vetc-epass.aspx)

Đây là điểm **giống hệt `F-10` của nhiên liệu**: hoá đơn điện tử là bản ghi có cấu trúc và có giá
trị pháp lý, còn ảnh chụp/PDF chỉ là hình chiếu của nó. Nên thứ tự ưu tiên của adapter phải là
**hoá đơn điện tử → bảng kê tệp → PDF → nhập tay**, chứ không phải OCR trước.

### 3.1. Ánh xạ tài khoản ↔ xe

Một **tài khoản giao thông doanh nghiệp liên kết nhiều xe**: khi bàn về phí quản lý, chính hai nhà
cung cấp nói phí *"tính trên tài khoản liên kết chứ không thu riêng từng xe"*, và ví dụ được nêu là
một doanh nghiệp **trên 15 xe** duy trì khoảng 5 triệu đồng trong ví.

Nguồn: [vietbao.vn](https://vietbao.vn/vetc-epass-thu-phi-quan-ly-tai-khoan-chi-phi-van-hanh-hay-tan-thu-nguoi-dung-603872.html)

**Hệ quả:** quan hệ là `1 tài khoản → N xe`, và **biển số là khoá nối duy nhất** đo được giữa dòng
giao dịch và đội xe của ta. Một mô hình `1 tài khoản = 1 xe` sẽ sai ngay với khách đầu tiên.

---

## 4. `TollProviderPort` — hợp đồng, `NOT BUSINESS-PROVEN`

Cổng phải đỡ **bốn** đường nạp mà #237 liệt kê, và thứ tự tin cậy giảm dần:

```text
1. API          — CHUA CO nha cung cap nao cong bo. Giu cho, khong hien thuc.
2. CSV / XLSX   — bang ke tai tu cong khach hang. Duong THUC TE nhat hom nay.
3. PDF          — hoa don dien tu o dang hinh chieu. Can trich xuat.
4. Nhap tay     — luon phai co: mot tram moi, mot thang cong hong.
```

Hình dạng ở `apps/api/src/transport/toll/toll-provider.port.ts`. Ba điều cổng đó **cố ý không** làm:

1. **Không hạch toán.** Cổng trả về `TollTransactionCandidate` — chữ `Candidate` là cố ý, cùng quy
   ước với trích xuất chứng từ của `TX-04`: dữ liệu nhà cung cấp là **ứng viên**, không phải sự thật
   tài chính, cho tới khi một con người đối soát.
2. **Không chạm sổ quỹ lái xe.** #229 §8 và #237 đều nói ETC là **công ty trả**. Không một đường nào
   trong cổng này nhận `driverId`, và đó là một bất biến **cấu trúc**, không phải một lời hứa.
3. **Không quyết đối soát.** Không có `match()`, không có `settle()`. Khi B mô tả quy trình thật,
   phần đó xây trên `TX-05`, không phải trong cổng nhà cung cấp.

---

## 5. Chuyện phí quản lý tài khoản — đã có kết cục, và nó là một bài học

R0 `Q-07` ghi *"phí duy trì tài khoản đang bị Chính phủ rà soát, chưa chốt"*. Đo lại:

| Ngày | Việc |
|---|---|
| **01/08/2026** | VETC và ePass công bố áp dụng phí quản lý tài khoản/ví: **6.600 đ/tháng** cá nhân, **66.000 đ/tháng** tổ chức (đã gồm VAT), trừ thẳng vào tài khoản giao thông hằng tháng kèm hoá đơn điện tử |
| 17–18/08/2026 | Phản ứng mạnh từ chủ xe và doanh nghiệp vận tải |
| ~20/08/2026 | **Cục Đường bộ Việt Nam** đề nghị tạm dừng để rà soát chính sách. **Cả VETC lẫn ePass thông báo dừng**; VETC xin lỗi khách hàng và khẳng định **chưa thu của tài khoản nào** |

Nguồn: [dantri.com.vn](https://dantri.com.vn/kinh-doanh/vetc-epass-noi-gi-ve-phi-6600-dongthang-khong-muon-tra-tien-thi-sao-20260818111116230.htm) ·
[vietnamplus.vn](https://www.vietnamplus.vn/vetc-dung-trien-khai-muc-phi-dich-vu-quan-ly-tai-khoan-6600-dongthang-post1131261.vnp) ·
[dantri.com.vn](https://dantri.com.vn/o-to-xe-may/vetc-xin-loi-khach-hang-dung-chinh-sach-thu-6600-dongthang-20260820073558307.htm)

**Bài học cho thiết kế, không phải cho thời sự:** một dòng phí của nhà cung cấp có thể **xuất hiện
rồi biến mất trong ba tuần**. Nên mô hình dữ liệu **không được** có một cột `accountManagementFee`
riêng. Nó là một **dòng giao dịch có loại** như mọi dòng khác — và `TollTransactionKind` để ngỏ đúng
vì lý do đó.

---

## 6. Chưa đo được — và tại sao không đoán

| Ẩn số | Vì sao không tự quyết |
|---|---|
| B dùng VETC hay ePass, hay cả hai? | Quyết định adapter đầu tiên. Sai thì viết lại phần trích xuất |
| Tài khoản giao thông đứng tên **công ty** hay tên **từng lái xe/chủ xe**? | Đây là câu **quan trọng nhất** còn lại. Nếu đứng tên cá nhân thì có một dòng tiền công ty↔cá nhân mà hôm nay **không mô hình nào của ta có** — và nó **không được** đi vào sổ quỹ lái xe nếu chưa ai xác nhận |
| Nạp tiền vào ví theo lô hay theo xe? | Quyết định "số dư ví" là một tài sản của công ty hay N tài sản |
| Đối soát theo tháng hay theo chuyến? | Quyết định kỳ đối soát; `TX-05` có sẵn cả hai khuôn |
| Sai sót/khiếu nại xử lý thế nào? | **Chưa đo được quy trình khiếu nại nào của hai nhà cung cấp**. Không có nguồn ⇒ không có mô hình `Dispute` |
| Hoá đơn điện tử gửi về đâu (email nào, ai nhận)? | Quyết định đường nạp tự động có khả thi không |

**Không câu nào ở trên chặn `TollProviderPort`** — cổng chỉ mô tả *hình dạng dữ liệu vào*. Chúng
chặn phần **hạch toán**, và phần đó cố ý chưa được viết.

---

## 7. Kết luận

```text
ETC_RESEARCH = COMPLETE
BUSINESS_WORKFLOW = NOT_INVENTED
IMPLEMENTATION = PORT CONTRACT ONLY, NO PERSISTENCE, NO SETTLEMENT
DRIVER_FUND = UNTOUCHED (cuong che bang kieu: khong duong nao nhan `driverId`)
```
