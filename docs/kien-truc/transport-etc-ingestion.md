# ETC — NẠP DỮ LIỆU & ĐỐI SOÁT NHÀ CUNG CẤP (VETC · ePass)

> **Trạng thái: `INGESTION FOUNDATION` · `SETTLEMENT POLICY NOT INVENTED`.**
>
> Tài liệu này KHÔNG thay thế [transport-etc-toll.md](transport-etc-toll.md) — nó **tiếp nối**.
> Tài liệu kia trả lời *"nhà cung cấp phát ra hình dạng gì"* và dừng ở một hợp đồng cổng.
> Tài liệu này trả lời *"làm sao đưa hình dạng đó vào hệ thống mà không biến nó thành sự thật
> kế toán"*.
>
> Lane J · Issue #269 · Coordinator #266 · nền móng #237.
> Đo lại ngày **08/09/2026**, `origin/main` = `571e1acbda3e5dbc12001a73c02ae41af54d4d1b`.

---

## 0. Vì sao có một lần đo lại, khi #237 vừa đo cùng ngày

#237 đo bằng **báo chí và trang phổ biến pháp luật**. Lane J đo lại bằng **văn bản gốc của Chính
phủ và trang chính chủ của hai nhà cung cấp**, và ba điều đổi:

| | #237 đo được | Lane J đo lại được |
|---|---|---|
| Ánh xạ tài khoản ↔ xe | "1 tài khoản → N xe" (nguồn: vietbao.vn) | **Điều 11 khoản 3 NĐ 119/2024/NĐ-CP** nói cả **CHIỀU NGƯỢC LẠI**, và chiều đó mới là ràng buộc |
| Khiếu nại / điều chỉnh | *"Chưa đo được quy trình khiếu nại nào"* ⇒ không mô hình `Dispute` | VETC **tự công bố** cơ chế trừ 2 lần → **hoàn 1 giao dịch RIÊNG**, trễ hơn lần trừ |
| Đường lấy dữ liệu | "hoá đơn điện tử + cổng khách hàng" | **Điều 26 khoản 2** đặt một **NGHĨA VỤ PHÁP LÝ** phải cung cấp thông tin giao dịch — *"theo thỏa thuận"* |

Kết luận của #237 (`API_STATUS` chưa chứng minh được) **vẫn đứng**. Cái đổi là ta biết rõ hơn
*vì sao* nó chưa chứng minh được, và *đường hợp pháp nào* để nó có thể được chứng minh sau này.

---

## 1. Ràng buộc PHÁP LÝ — thứ mạnh hơn mọi tài liệu sản phẩm

### 1.1. Điều 11 khoản 3 — bất biến hai chiều

> *"Mỗi tài khoản giao thông có thể sử dụng để chi trả cho nhiều phương tiện tham gia giao thông
> thuộc sở hữu của chủ phương tiện; **mỗi phương tiện tham gia giao thông chỉ được nhận chi trả từ
> một tài khoản giao thông**."*
>
> — [Nghị định 119/2024/NĐ-CP, toàn văn trên Cổng Xây dựng chính sách của Chính phủ](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-119-2024-nd-cp-quy-dinh-ve-thanh-toan-dien-tu-giao-thong-duong-bo-119240930194034842.htm)

`#237` chỉ ghi được nửa đầu. **Nửa sau mới là thứ cưỡng chế được**, và nó nói rằng:

```text
1 tài khoản  → N xe          (quan hệ một-nhiều, như đã biết)
1 xe         → ĐÚNG 1 tài khoản TẠI MỘT THỜI ĐIỂM   ← điều #237 chưa có
```

Nên `TollAccountVehicleLink` **không phải** một bảng nối tự do. Nó là một **lịch sử có hiệu lực**
mà tại mọi khoảnh khắc chỉ được có **một** dòng đang mở cho một xe. "Xe đổi tài khoản" (yêu cầu
của #269 J2) chính là *đóng dòng cũ rồi mở dòng mới*, không phải *thêm một dòng thứ hai*.

Đây là lý do bất biến đó được giữ bằng **một unique index bộ phận trong Postgres**, không bằng một
lần kiểm ở tầng miền: kiểm ở tầng miền chỉ đúng khi có **một** người ghi.

### 1.2. Phụ lục — tài khoản giao thông chứa gì

Phụ lục Mục 1 liệt kê thông tin của một tài khoản giao thông, trong đó có:

- số tài khoản, ngày mở, thông tin chủ tài khoản (**cá nhân hoặc tổ chức**);
- thông tin phương tiện: **biển số xe**, số khung, số máy, tải trọng, số chỗ ngồi, loại xe;
- thông tin **thẻ đầu cuối: mã định danh**, mã sản phẩm, ngày gắn.

Hai điều đọc ra được:

1. **Biển số CÓ trong dữ liệu tài khoản** — nên nó là khoá nối hợp lệ, không phải một phép đoán.
2. Tồn tại một **mã định danh thẻ đầu cuối** (RFID), tức một khoá **bền hơn biển số**. Ta chừa chỗ
   cho nó (`providerVehicleRef`) nhưng **không** đòi nó: chưa đo được nó có xuất hiện trên bảng kê
   xuất ra hay không (xem §2.3, `UNKNOWN`).

### 1.3. Điều 26 khoản 2 — nghĩa vụ cung cấp dữ liệu

> *"Nhà cung cấp dịch vụ thanh toán điện tử giao thông có nghĩa vụ **cung cấp thông tin về giao
> dịch qua tài khoản giao thông cho chủ phương tiện mở tài khoản giao thông theo thỏa thuận**."*

Câu này là **đường hợp pháp duy nhất** dẫn tới một luồng dữ liệu tự động, và nó nói rõ hai vế:

- **có nghĩa vụ** — B có quyền đòi, không phải đi xin;
- **theo thỏa thuận** — cơ chế do hợp đồng định, **không** do một tài liệu công khai định.

Nên phân loại đúng của đường API là `PARTNER/API POSSIBLE BUT NOT PROVEN`, **không** phải
`UNKNOWN`: pháp luật đã dựng sẵn cái móc, chỉ là chưa ai treo gì lên.

### 1.4. Điều 8 khoản 2 / Điều 12 khoản 6 — và vì sao chúng KHÔNG giúp ta

Hệ thống cơ sở dữ liệu thanh toán điện tử giao thông có kết nối với hệ thống của nhà cung cấp, với
CSDL trật tự an toàn giao thông và CSDL quốc gia về dân cư. Đó là kết nối **Nhà nước ↔ nhà cung
cấp**. Không có điều khoản nào mở nó cho một doanh nghiệp vận tải. Ghi lại ở đây để lần sau không
ai đọc nhầm hai điều này thành "có API".

---

## 2. Đo được gì ở hai nhà cung cấp — RIÊNG từng bên

Yêu cầu của #269: *"VETC và ePass báo evidence RIÊNG."* Nên bảng dưới **không** có một dòng nào
nói "hai nhà cung cấp đều...".

### 2.1. VETC — Công ty TNHH thu phí tự động VETC

| Hạng mục | Đo được | Phân loại | Nguồn |
|---|---|---|---|
| Cổng khách hàng | `customer.vetc.com.vn`, đăng nhập rồi **"Tra cứu hóa đơn"** | `PUBLICLY DOCUMENTED` | [vetc.com.vn/hoi-dap](https://vetc.com.vn/hoi-dap.html) Q2 |
| Mở tài khoản doanh nghiệp | "Giấy đề nghị mở tài khoản theo mẫu VETC" + "Giấy phép Đăng ký kinh doanh" | `PUBLICLY DOCUMENTED` | như trên, Q4 |
| Chuyển xe cá nhân → tài khoản doanh nghiệp | Có thủ tục, làm tại điểm dịch vụ | `PUBLICLY DOCUMENTED` | như trên, Q8 |
| Hoá đơn điện tử | **Hai chế độ**: từng giao dịch (theo ngày), hoặc **gộp tháng — tối đa 1.000 giao dịch/hoá đơn** | `PUBLICLY DOCUMENTED` | [hướng dẫn KH doanh nghiệp](https://vetc.com.vn/huong-dan-khach-hang-doanh-nghiep-xuat-hoa-don-dien-tu-s34.html) |
| Bảng kê giao dịch xuất Excel | **KHÔNG xác nhận được trên trang chính chủ** | `CUSTOMER SAMPLE REQUIRED` | — |
| Trừ tiền 2 lần → hoàn tiền | Hoàn **trong ~2 giờ**, là **một giao dịch RIÊNG**, kèm thông báo riêng | `PUBLICLY DOCUMENTED` | [VETC phản hồi](https://vetc.com.vn/vetc-phan-hoi-ve-viec-cham-hoan-tien-tre-thong-bao-voi-nghiep-vu2-lan-tru-tien-1-lan-hoan-tien--n129.html) |
| Tài liệu API công khai | Không tìm thấy | `NOT PUBLICLY PROVEN` | — |

**"Tối đa 1.000 giao dịch/hoá đơn" là một dữ kiện thiết kế, không phải một con số vui:** một tháng
của B có thể về **nhiều tệp nguồn**, và cùng một lượt qua trạm sẽ **không** bao giờ nằm ở hai tệp —
nhưng ta không được *giả định* điều đó. Đó là lý do khoá chống trùng ở §5 làm việc theo **dấu vân
dòng xuyên tệp**, chứ không theo `(tệp, số dòng)`.

### 2.2. ePass — Công ty CP Giao thông số Việt Nam (VDTC, thuộc Viettel)

| Hạng mục | Đo được | Phân loại | Nguồn |
|---|---|---|---|
| Lịch sử giao dịch | Mục **"Lịch sử giao dịch" / "Giao dịch thu phí"**: tên trạm, thời điểm, **biển số**, số tiền trừ, số dư còn lại | `PUBLICLY DOCUMENTED` | [giaothongso.com.vn](https://giaothongso.com.vn/cach-quan-ly-giao-dich-etc-tren-ung-dung-thanh-toan-epass/) |
| Lọc | theo **"ngày"**, **"biển số xe"**, **"trạm thu phí"** | `PUBLICLY DOCUMENTED` | như trên |
| Xuất bảng kê | **"Xuất file" / "Tải báo cáo"** dạng **PDF hoặc Excel**, có gửi email | `PUBLICLY DOCUMENTED` | như trên |
| Mở tài khoản doanh nghiệp | Đăng ký được **trên website**; hồ sơ: giấy phép ĐKKD, giấy đề nghị mở tài khoản, giấy tờ tuỳ thân người đại diện, đăng ký xe, đăng kiểm | `PUBLICLY DOCUMENTED` | [giaothongso.com.vn](https://giaothongso.com.vn/mo-tai-khoan-thu-phi-khong-dung-epass/) |
| Một tài khoản doanh nghiệp ↔ nhiều xe | **Trang chính chủ KHÔNG nói rõ**; chỉ NĐ 119 nói (§1.1) | `PUBLICLY DOCUMENTED` (tầng pháp lý) / `CUSTOMER SAMPLE REQUIRED` (tầng sản phẩm) | — |
| Tên cột / thứ tự cột của tệp xuất | Không đo được | `CUSTOMER SAMPLE REQUIRED` | — |
| Điều chỉnh / hoàn tiền thể hiện thế nào trên tệp xuất | Không đo được | `UNKNOWN` | — |
| Tài liệu API công khai | Không tìm thấy | `NOT PUBLICLY PROVEN` | — |
| `epass-vdtc.com.vn` | **Chứng thư TLS hết hạn** lúc đo (08/09/2026) — không lấy được nội dung qua HTTPS hợp lệ | ghi nhận chất lượng nguồn | — |

**ePass có bằng chứng công khai MẠNH HƠN VETC ở đúng một điểm quan trọng:** trang chính chủ nói
thẳng là **xuất được file Excel**, và nói rõ **biển số nằm trong dòng giao dịch**. Với VETC, thứ
xác nhận được chỉ là *hoá đơn*. Hai bên **không** cùng một mức bằng chứng, nên §6 không cấp cho
chúng cùng một trạng thái sẵn sàng.

### 2.3. Bốn phân loại — bảng gọn

```text
PUBLICLY DOCUMENTED
  · NĐ 119/2024 Đ.11 kh.3   — 1 tài khoản → N xe; 1 xe → DUNG 1 tài khoản
  · NĐ 119/2024 Phụ lục     — tài khoản chứa biển số + mã định danh thẻ đầu cuối
  · NĐ 119/2024 Đ.26 kh.2   — nghĩa vụ cung cấp thông tin giao dịch "theo thỏa thuận"
  · VETC  — cổng KH, hoá đơn từng giao dịch / gộp tháng (<=1.000 GD/hoá đơn), hồ sơ mở TK DN
  · VETC  — trừ 2 lần thì HOÀN 1 GIAO DỊCH RIÊNG, trễ hơn lần trừ (~2h)
  · ePass — lịch sử giao dịch có biển số/trạm/thời điểm/số tiền; lọc; XUẤT PDF hoặc EXCEL
  · ePass — hồ sơ + đường đăng ký tài khoản doanh nghiệp trên website

CUSTOMER SAMPLE REQUIRED
  · Tên cột, thứ tự cột, định dạng ngày, quy ước DẤU của mọi tệp xuất — CẢ HAI nhà cung cấp
  · VETC: có xuất được bảng kê Excel hay chỉ có hoá đơn
  · Số tài khoản giao thông thật của B ở mỗi nhà cung cấp
  · Danh sách xe đang gắn vào từng tài khoản

PARTNER/API POSSIBLE BUT NOT PROVEN
  · NĐ 119 Đ.26 kh.2 dựng sẵn nghĩa vụ cung cấp dữ liệu "theo thỏa thuận"
  · Đường liên hệ: VETC qua điểm dịch vụ/hồ sơ doanh nghiệp; ePass qua 1900 9080 / đăng ký DN
  · KHÔNG bên nào công bố cổng nhà phát triển, scope, hay hợp đồng dữ liệu

UNKNOWN
  · Giao dịch điều chỉnh/hoàn tiền hiện ra thế nào TRÊN TỆP XUẤT
    (VETC công bố HÀNH VI, không công bố ĐỊNH DẠNG)
  · Mã định danh thẻ đầu cuối có nằm trên tệp xuất không
  · Quy trình khiếu nại của ePass
  · Có tham chiếu giao dịch DUY NHẤT do nhà cung cấp cấp hay không
```

### 2.4. Những việc KHÔNG làm để lấy bằng chứng

Đã tuân thủ, và ghi lại để lần sau đo lại vẫn theo đúng lối:

- không đăng nhập cổng khách hàng của hai nhà cung cấp;
- không bắt/đọc token, cookie, hay lưu lượng của ứng dụng di động;
- không dò endpoint ẩn, không gọi RPC không tài liệu;
- không tự động hoá CAPTCHA/OTP/MFA;
- **đăng nhập được vào một cổng web KHÔNG được tính là bằng chứng có API.**

---

## 3. `API_STATUS` — kết luận có mã

```text
VETC   API_STATUS = NOT_PUBLICLY_PROVEN
EPASS  API_STATUS = NOT_PUBLICLY_PROVEN
```

Hệ quả trong code (§6): đường `API` **giữ nguyên trong `TollSourceKind`**, cổng adapter **vẫn tồn
tại**, và **không có adapter nào được đăng ký lúc chạy**. Một lệnh nhập qua đường `API` **thất bại
đóng** với đúng mã đó, kèm đường liên hệ đối tác — chứ không im lặng trả về rỗng.

---

## 4. Ranh giới — thứ lane này KHÔNG được phép làm

| Ranh giới | Vì sao |
|---|---|
| **Không chạm Sổ quỹ lái xe** | #229 §8 + #237: ETC là **công ty trả**. Giữ bằng KIỂU (`TollNeverTouchesDriverFund`), không bằng kỷ luật |
| **Không sinh công nợ / phải trả / settlement** | Chưa ai mô tả chính sách. Một dòng `TOP_UP` **không** là một nghĩa vụ thanh toán |
| **Không suy ra nghĩa vụ từ dấu của số tiền** | Quy ước dấu của tệp nguồn còn `CUSTOMER SAMPLE REQUIRED` |
| **Không nhầm với `Phí cầu đường` của `transportCosting`** | Đó là khoản **lái xe ứng tiền mặt** rồi đề nghị hoàn. ETC đi thẳng từ ví công ty. Hai dòng tiền khác nhau, không gộp |
| **Không gọi kết quả đối soát là `paid`/`settled`/`accounted`** | #269 J7. Trạng thái chỉ nói về **khớp**, không nói về **tiền đã trả** |
| **Không tự tạo xe / tài khoản từ một tệp nhập** | Cùng quy ước với `UNKNOWN_VEHICLE` của nhiên liệu |

---

## 5. Ba quyết định thiết kế mà bằng chứng ở §1–§2 ÉP ra

### 5.1. Hai lượt qua trạm giống hệt nhau KHÔNG được gộp thành một

VETC tự công bố: lỗi đọc chéo làn sinh ra **hai giao dịch trừ tiền cho một lượt xe**, rồi hệ thống
**hoàn một giao dịch** sau đó.

Nếu bộ chống trùng gộp hai dòng giống hệt nhau lại (như `DUPLICATE_ROW` của nhiên liệu đang làm),
thì:

```text
tệp nguồn:    trừ 52.000  ·  trừ 52.000  ·  hoàn 52.000
gộp trùng:    trừ 52.000                 ·  hoàn 52.000
số dư suy ra: 0đ   — SAI. Nhà cung cấp đã trừ 52.000 rồi hoàn 52.000; lượt kia VẪN ĐỨNG
```

Nên: trùng **trong cùng một tệp** là `DUPLICATE_CANDIDATE` — một **trạng thái cần người nhìn**,
**không** phải một dòng bị vứt. Cái được vứt chỉ là **cùng một tệp nạp hai lần** (§5.2), vì đó là
trùng của *hành động nhập*, không phải trùng của *sự kiện thật*.

### 5.2. Chống lặp có HAI tầng, vì có HAI loại lặp

```text
tầng NGUỒN — cùng bộ byte nạp lại   -> unique(provider, sourceDigest) -> trả lần nhập CŨ, không tạo gì
tầng DÒNG  — cùng sự kiện qua 2 tệp -> dấu vân dòng -> đánh dấu DUPLICATE_CANDIDATE để người quyết
```

Tầng nguồn **tất định và an toàn** ⇒ tự động. Tầng dòng **không** tất định (§2.3: chưa biết có
tham chiếu giao dịch duy nhất nào) ⇒ **không** tự quyết, chỉ nêu.

#269 J4 cấm *"invent a universal `providerReference` uniqueness rule if either provider does not
guarantee one"*. Không bên nào bảo đảm. Nên dấu vân là một **hợp thành có tài liệu**:

```text
fingerprint = sha256( provider | accountNo | kind | plateChuanHoa
                      | passedAt|businessDate | signedAmount | stationLabel | providerRef )
```

và khi `providerRef` rỗng — trường hợp thường — hai lượt qua trạm **thật sự** giống hệt nhau sẽ
đụng vân. Đó chính là tình huống §5.1. Vì vậy đụng vân **không bao giờ** tự loại dòng.

### 5.3. Không đòi mỗi giao dịch phải thuộc một chuyến

#269 J6 nói thẳng, và bằng chứng ủng hộ: `TOP_UP` và `ACCOUNT_FEE` là việc của **tài khoản**,
không của một chuyến. Chỉ `TOLL_PASS` mới có thể có ứng viên chuyến — và cũng chỉ là **ứng viên**.

---

## 6. Hình dạng đã dựng

```text
tệp/hoá đơn/nhập tay của nhà cung cấp
        |
        v
TollImport            (BẤT BIẾN: provider, sourceKind, sourceDigest, người/lúc nhập, số dòng)
        |   unique(provider, sourceDigest)  <- nạp lại = idempotent
        v
TollTransactionCandidate  (mỗi DÒNG một hàng — kể cả dòng HỎNG, kèm lý do có mã)
        |
        +- chuẩn hoá: provider · account · kind · plate · thời điểm · ngày nghiệp vụ · tiền có dấu
        +- ánh xạ:    accountNo -> TollAccount ;  plate -> Vehicle QUA TollAccountVehicleLink
        +- phân loại: MATCHED · AMBIGUOUS · VEHICLE_UNRESOLVED · ACCOUNT_UNRESOLVED
                      · DUPLICATE_CANDIDATE · UNSUPPORTED_KIND
        |
        v
hộp thư đối soát (ACCOUNTING) -> TollReviewDecision (append-only: ai · lúc nào · vì sao · nối cũ->mới)
```

**Không có mũi tên nào đi tiếp.** Chỗ lẽ ra viết `-> công nợ` là chỗ #269 cấm, và nó để trống **có
chủ đích**.

### 6.1. Vì sao ánh xạ cột do GÓI KHÁCH khai, không do code đoán

Tên cột của cả hai nhà cung cấp là `CUSTOMER SAMPLE REQUIRED` (§2.3). Có đúng hai cách xử lý:

1. đoán một bộ tên cột rồi gọi nó là "định dạng VETC" — **bịa**, và #269 cấm;
2. bắt người vận hành **khai** bộ cột của tệp thật, theo **từng nhà cung cấp**.

Chọn (2). Hệ quả trực tiếp: khi gói khách chưa khai bộ cột cho một nhà cung cấp, đường chạy của
nhà cung cấp **đó** trả về:

```text
TOLL_PROVIDER_MAPPING_NOT_CONFIGURED    =>  BLOCKED_SAMPLE_REQUIRED
```

Đây **không** phải một lỗi cần sửa. Đây là **trạng thái trung thực** của một hệ thống chưa nhìn
thấy tệp thật — và nó **riêng cho từng nhà cung cấp**, đúng như #269 đòi: VETC có thể còn khoá
trong khi ePass đã mở, hoặc ngược lại.

---

## 7. Còn treo — và ai gỡ được

| Ẩn số | Ai trả lời | Chặn cái gì |
|---|---|---|
| Một tệp bảng kê/hoá đơn **thật** của VETC | B (khách) | Bộ cột VETC ⇒ đường chạy VETC |
| Một tệp xuất **thật** của ePass | B (khách) | Bộ cột ePass ⇒ đường chạy ePass |
| Tài khoản giao thông đứng tên **công ty** hay **cá nhân** | B | Nếu cá nhân: có một dòng tiền công ty↔cá nhân mà hôm nay **không mô hình nào của ta có** |
| Có thoả thuận cung cấp dữ liệu theo Đ.26 kh.2 không | B ↔ nhà cung cấp | Đường `API` |
| Đối soát theo tháng hay theo chuyến | B | Kỳ đối soát — **không** chặn phần nạp dữ liệu |

**Không ẩn số nào ở trên chặn phần trung tính nhà cung cấp** đã dựng ở §6. Chúng chặn đúng hai
thứ: bộ cột của từng nhà cung cấp, và phần hạch toán — mà phần hạch toán thì cố ý chưa được viết.
