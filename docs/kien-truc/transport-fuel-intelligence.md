# Fuel intelligence — cây xăng, hoá đơn điện tử, và ranh giới của "ứng viên"

> **Lane C của Transport v2** — Issue #236, điều phối #233, hợp đồng #232, lộ trình #229.
> Đây là mục **ghi cái đã chạy** theo quy ước T1 §18: thiết kế nằm ở #236, kết quả nằm ở đây.
>
> Tài liệu này **không** thay thế T1 (`transport-domain-contract.md`). T4 as-built — phiếu đổ dầu,
> bảng kê, đối soát, bàn giao công nợ — vẫn ở đó và **không đổi một dòng nào** vì Lane C.

---

## 1. Phát hiện quan trọng nhất, và hệ quả của nó với cả lane

**Nghị định 123/2020/NĐ-CP Điều 10** liệt kê nội dung **bắt buộc** của hoá đơn điện tử. **Không có
trường biển số xe.** **Nghị định 70/2025/NĐ-CP** — văn bản buộc mọi cửa hàng bán lẻ xăng dầu phát
hoá đơn điện tử **từng lần bán** từ 01/06/2025 — **không thêm** trường đó.

Nên đường hoá đơn điện tử cho:

| Dữ kiện                     | Hoá đơn nói được?                             |
| --------------------------- | --------------------------------------------- |
| Số lít, đơn giá, thành tiền | ✅ chính xác, có cấu trúc, không cần suy đoán |
| Thời điểm bán               | ✅ (`NLap`)                                   |
| Cây xăng / người bán        | ✅ (`NBan/Ten`, `NBan/MST`)                   |
| **Xe nào**                  | ❌ **không**                                  |
| Odo                         | ❌ không                                      |

Khi một biển số **có** xuất hiện trên hoá đơn, nó nằm ở một trong hai chỗ mà **không quy định nào
ràng buộc**: một trường mở rộng `TTKhac` do nhà cung cấp **tự đặt tên**, hoặc lẫn trong tên người
mua trên hoá đơn bán lẻ.

**Hệ quả kiến trúc, và nó chi phối mọi thứ còn lại:** một _ứng viên_ đọc ra từ hoá đơn **không bao
giờ tự trở thành** `TransportFuelEntry` được, vì `TransportFuelEntry.vehicleId` là `NOT NULL`. Gán
xe **luôn** phải qua một người hoặc một phép khớp tất định có nguồn khác. Đó là lý do ứng viên là
một **bảng riêng**, không phải một trạng thái của phiếu.

Trong mã, điều này được nói bằng chính **tên trường**: `plateHintRaw`, `plateHintSource`,
`odometerHintKm` — hậu tố `Hint` để mọi người đọc code đều thấy, và `plateHintSource` ghi lại **nơi**
giá trị được đọc ra để người kiểm lại được.

---

## 2. Khuôn XML của hoá đơn điện tử — bản đồ trường đã dùng

Theo **Quyết định 1450/QĐ-TCT** (sửa đổi bởi **1510/QĐ-TCT**). Chỉ liệt kê những trường Lane C
thực sự đọc; khuôn đầy đủ dài hơn nhiều.

```text
HDon
└─ DLHDon
   ├─ TTChung                 thông tin chung
   │  ├─ KHMSHDon             mẫu số hoá đơn        -> invoiceTemplate
   │  ├─ KHHDon               ký hiệu hoá đơn       -> invoiceSymbol   (BẮT BUỘC)
   │  ├─ SHDon                số hoá đơn            -> invoiceNo       (BẮT BUỘC)
   │  ├─ NLap                 ngày lập              -> issuedDate + issuedTimeRaw
   │  └─ DVTTe                đơn vị tiền tệ        -> currencyCode (vắng = VND)
   ├─ NDHDon
   │  ├─ NBan                 người bán
   │  │  ├─ Ten                                     -> sellerName / nhãn nhận dạng trạm
   │  │  └─ MST               mã số thuế            -> sellerTaxCode   (BẮT BUỘC)
   │  ├─ NMua/Ten             người mua             -> nguồn gợi ý biển số thứ hai
   │  └─ DSHHDVu
   │     └─ HHDVu (lặp)       một dòng hàng
   │        ├─ THHDVu         tên hàng              -> itemName
   │        ├─ DVTinh         đơn vị tính           -> unitRaw
   │        ├─ SLuong         số lượng              -> litersUnits     (mililit, tỷ lệ 3)
   │        ├─ DGia           đơn giá               -> unitPriceUnits  (mili-đồng/lít)
   │        └─ ThTien         thành tiền            -> amount          (đồng)
   └─ TTKhac                  trường mở rộng, TÊN TỰ ĐẶT
      └─ TTin (lặp)
         ├─ TTruong           tên trường            -> khoá tra gợi ý
         └─ DLieu             giá trị
```

Ba mảnh **bắt buộc** (`MST`, `KHHDon`, `SHDon`) là **khoá chống nhập trùng**. Thiếu một trong ba →
cả chứng từ bị từ chối với mã `MISSING_INVOICE_IDENTITY`, chứ **không** nhập với các ô rỗng: Postgres
coi hai `NULL` là khác nhau, nên một khoá unique có `NULL` không chặn được gì.

---

## 3. Dấu chấm ở đây là dấu thập phân — ngược hẳn đường đọc bảng kê

Đây là chỗ dễ sai nhất của cả lane, và hai đường đọc **cố ý** dùng hai luật ngược nhau:

| Nguồn            | Ai tạo ra                | `1.500` nghĩa là | Luật đang áp                                                                                  |
| ---------------- | ------------------------ | ---------------- | --------------------------------------------------------------------------------------------- |
| Bảng kê CSV/XLSX | **người** gõ trong Excel | mơ hồ            | nhận **một** dấu phân cách, coi là thập phân; số **tiền** thì mọi dấu chấm là phân cách nghìn |
| Hoá đơn XML      | **máy** phát theo XSD    | **1,5**          | `xs:decimal` — dấu chấm là thập phân, **cấm** phân cách nghìn                                 |

Vì vậy `62,5` (dấu **phẩy**) trong XML bị **từ chối có tên** thay vì đọc thành `625`: đoán tiếp sẽ
sai mười hoặc một trăm lần, và con số sai đó đi thẳng vào phép kiểm `số lít × đơn giá ≈ thành tiền`.

`fuel-einvoice-parse.spec.ts` `E-INV-22` khoá hai phép đọc số lít (`parseXsdScaled` ⟂ `litersToUnits`)
phải đồng ý với nhau trên mọi đầu vào cả hai đều nhận.

---

## 4. As-built

| Thứ                                                                                              | Ở đâu                                                                            | PR         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------- |
| `TransportFuelStation`, `TransportFuelStationAlias`, 9 cột hợp đồng trên `TransportFuelSupplier` | `schema.prisma`, migration `20260908090000_transport_fuel_station`               | #240       |
| Nhận dạng cây xăng — 5 kết cục có tên                                                            | `fuel-station-identity.ts`                                                       | #240       |
| `TransportFuelDocument`, `TransportFuelCandidate`                                                | migration `20260908150000_transport_fuel_document`                               | #248       |
| Cổng nguồn chứng từ + adapter XML                                                                | `fuel-invoice-source.ts`, `fuel-einvoice-parse.ts`                               | #248       |
| Chuẩn hoá ứng viên + gợi ý biển số/odo                                                           | `fuel-candidate-normalize.ts`                                                    | #248       |
| Kiểm tất định trên ứng viên (C4)                                                                 | `fuel-candidate-validation.ts`, `GET documents/:id/review`                       | #248       |
| Cổng đọc **ảnh** + hai adapter (C3)                                                              | `fuel-receipt-extraction.{ts,http.ts,stub.ts}`, `fuel-receipt-image.ts`          | #252       |
| Cột `confidence` + `POST documents/image`                                                        | migration `20260909100000_transport_fuel_receipt_image`                          | #252       |
| Bộ đo trên dữ liệu tổng hợp                                                                      | `tools/fuel-extraction-bench/`                                                   | #252       |
| Hành động                                                                                        | `transport.fuel.station.{read,manage}` · `transport.fuel.document.{read,ingest}` | #240, #248 |

**Không** capability mới ở bất kỳ tranche nào (`F-12`), nên `packages/tenant` không bị chạm bởi
Lane C. Tệp web duy nhất bị sửa là **bản gương bảng phân quyền**.

### Hai bất biến được đặt tên

- **`INV-C2-DUP`** — chống nhập trùng ở **hai lớp**: dấu vân tay **byte** (`contentDigest` unique)
  chặn đúng một tệp gửi lại; khoá `(MST, ký hiệu, số hoá đơn, dòng)` chặn **cùng một hoá đơn** đến
  bằng **hai tệp khác nhau**. Bỏ lớp nào cũng để lại một đường đếm hai lần tiền dầu.
- **`INV-C2-NOMONEY`** — không đường tính tiền nào của T3/T4 biết đến tầng ứng viên. Khoá bằng một
  bài **đọc mã nguồn** (`DOC-16`) quét 29 tệp tính tiền, và chiều ngược lại kiểm rằng service nhập
  chứng từ không được tiêm `FuelCostingPort`/`CostingService`.

---

## 5. Bốn phép kiểm #236 liệt kê mà Lane C **chưa** làm, và lý do

Ghi ra đây để không ai tưởng chúng đã chạy:

| Phép kiểm                         | Thiếu mảnh dữ liệu nào                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Odo tăng dần                      | đòi một **xe** và lần đổ dầu trước của chính nó. Ứng viên chỉ có một _gợi ý_ biển số                                                                                                                                                       |
| Nhất quán xe/chuyến/vòng chạy     | cùng lý do; thêm nữa `Run`/`Leg` thuộc Lane A                                                                                                                                                                                              |
| Hàng rào địa lý quanh trạm        | đòi một **vị trí chụp** lúc đổ dầu. Hoá đơn điện tử không mang toạ độ nào; so một trạm với chính nó là phép kiểm rỗng. Chỉ có nghĩa khi đối chiếu bản ghi bám vị trí của Lane B (#235) trong cùng cửa sổ thời gian — tức **sau khi có xe** |
| Đơn giá trong khung giá điều hành | repo **chưa có** nguồn giá điều hành nào. Bịa một bảng giá ra để "có phép kiểm" thì tệ hơn không có: nó báo động sai ở mọi kỳ điều chỉnh giá                                                                                               |

Cả bốn đều đòi một mảnh dữ liệu chưa có. Viết chúng bây giờ sẽ ra những phép kiểm **luôn im lặng** —
đáng sợ nhất trong một hệ thống chống thất thoát, vì chúng trông như đang chạy.

**Khi làm hàng rào địa lý:** dùng `assessGeofences` của Lane B (`apps/api/src/transport/geo/`), có
phán quyết ba giá trị `INSIDE | OUTSIDE | INDETERMINATE`. **Không** viết bản thứ hai. Toạ độ trạm
đã theo đúng luật Null Island của họ (`CHECK TransportFuelStation_not_null_island`).

---

## 6. Ảnh phiếu đổ dầu — cửa vào thứ hai (C3)

Một tấm ảnh và một hoá đơn XML là **cùng một loại sự vật**: một dòng hàng chưa ai xác nhận. Nên
chúng vào **cùng một bảng**, đi qua **cùng** phép chống nhập trùng, và hiện trên **cùng** màn hình
rà soát. Cho ảnh một bảng riêng sẽ đẻ ra hai bộ phép kiểm, rồi một ngày chúng lệch nhau.

Cái **khác** nhau được nói bằng đúng **một cột**:

| `TransportFuelCandidate.confidence` | Nghĩa                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| `NULL`                              | ứng viên đến từ nguồn **tất định** — hoá đơn người bán đã ký |
| một bảng `{khoá → 0..1000}`         | ứng viên đọc từ **ảnh**, kèm mức tin **từng ô**              |

`NULL` ở đây là _"câu hỏi này không áp dụng"_, không phải _"chưa đo được"_. Gán `1000` cho đường XML
sẽ mời người ta gộp một con số **máy đoán** với một con số **người bán đã ký** trên cùng một thang —
và hai loại sai đó đòi hai phản ứng khác nhau của con người: một bên là _người bán ghi sai_, một bên
là _ta đọc sai_.

### Cổng riêng, không phải một `FuelInvoiceSource` thứ hai

`FuelInvoiceSource.read()` **đồng bộ và tất định** — tính chất đó chịu lực: nó là lý do "sửa bộ đọc
rồi nhập lại cho ra đúng bộ ứng viên mới" là câu đúng. Một lần đọc ảnh **bất đồng bộ, qua mạng, và
có thể cho hai kết quả ở hai lần gọi**. Nhét nó vào sau cổng kia sẽ phá tính chất đó **mà không một
dòng nào đổi màu**.

Cái **dùng chung** mới là phần quan trọng: cổng ảnh trả về đúng kiểu `ParsedInvoice`, nên nhận dạng
cây xăng, chuẩn hoá ứng viên, gợi ý biển số, mười hai phát hiện của C4 và màn hình rà soát chạy trên
đường ảnh **mà không một dòng nào được viết lại**.

### Một adapter, ba nhà cung cấp, không tên nào trong mã

`ChatCompletionsReceiptExtractor` nói khuôn `POST /chat/completions` với `content` là một **mảng**
khối (`text` + `image_url`) — khuôn mà cả ba đường đều nói: một mô hình **tự dựng** trong mạng khách
(PaddleOCR-VL sau vLLM/PaddleX), và các điểm cuối đám mây. Chuyển giữa chúng là đổi `baseUrl` +
`model`. `HTTP-14` đọc mã nguồn đã bỏ chú thích và **đỏ** nếu một tên nhà cung cấp xuất hiện.

Mặc định `FUEL_EXTRACTION_MODE=stub` — **không** gọi ra ngoài. Đó là một lựa chọn về an toàn dữ
liệu: ảnh phiếu đổ dầu mang biển số, địa điểm và thời điểm của khách.

### Sai số nhân 1000 không qua được — và không phải nhờ tầng đọc

Chỗ dễ sai nhất khi cho máy đọc một tờ giấy là **dấu phân cách**: trên giấy `1.500` là một nghìn năm
trăm. Lời nhắc yêu cầu **số nguyên đã nhân thang** (mililit, mili-đồng, đồng) để xoá hẳn sự mơ hồ ở
mặt giao tiếp — nhưng lời hứa đó không được tin. Thứ **thật sự** chặn là phép kiểm số học của C4:
`số lít × đơn giá ≈ thành tiền`, dung sai **một đồng**. Một con số lệch thang bậc không thể vừa
đồng thời cả ba ô.

### Bộ đo, và ba chặn còn nguyên

`tools/fuel-extraction-bench/` sinh **7 phiếu tổng hợp** (có dấu tiếng Việt, dấu phân cách nghìn
kiểu Việt Nam, một dòng không phải nhiên liệu, một phiếu không ghi biển số, ảnh nghiêng và mờ) rồi
chấm điểm **từng trường**. Con số quan trọng nhất không phải độ chính xác mà là **SAI MÀ VẪN CHẮC** —
nhóm duy nhất đi qua đường rà soát mà không ai nhìn lại.

Bộ đo đã chạy đúng trên một điểm cuối kịch bản dựng tạm. **Không** mô hình thật nào đo được trong
tranche này, và cả ba đường đều chặn ở **một quyết định của người**, không ở mã — chi tiết ở
`tools/fuel-extraction-bench/README.md`.

---

## 7. Ba thứ Lane C **cố ý không xây**, và điều gì sẽ đổi câu trả lời

Ghi ra đây vì "không có" và "chưa ai nghĩ tới" nhìn giống hệt nhau trong một kho mã.

### 7.1 Không có hàng đợi bền (Hatchet) cho đường đọc ảnh

Một lần đọc ảnh đi qua mạng và có thể mất tới 60 giây — đúng hình dạng của một việc nền. Lane C
vẫn làm **đồng bộ**, và đó là một quyết định chứ không phải một thiếu sót:

- **Khối lượng thật là 10–20 phiếu/ngày.** Một hàng đợi cho tải đó thêm một tiến trình, một bảng
  trạng thái và một chỗ hỏng mới, để giải quyết một vấn đề chưa tồn tại. Cùng lý lẽ đã dùng cho
  BullMQ ở [tinh-nang-dai-han.md](../phat-trien/ke-hoach/tinh-nang-dai-han.md) §7.2.
- **Thất bại đã bền sẵn.** Một lần đọc hỏng vẫn ghi một hàng `REJECTED` kèm mã lý do. Cái mà hàng
  đợi thường mua — "đừng mất việc khi tiến trình chết" — ở đây đã có bằng một hàng trong Postgres.
- **Người dùng là một con người đang đứng chờ.** Trả `202 queued` cho ai đó vừa chụp một tấm phiếu
  buộc họ quay lại xem sau. Với một tấm ảnh, đồng bộ **là** trải nghiệm đúng.

**Điều sẽ đổi câu trả lời** — và chỉ những điều này: một lần nhập **hàng loạt** (một hộp thư trả về
cả tháng hoá đơn cùng lúc), hoặc một nguồn **đẩy** mà ta không điều khiển được nhịp. Lúc đó việc cần
làm là bọc `ingestReceiptImage` trong một workflow, **không** phải viết lại nó: cổng đã tách, và
`INV-C2-DUP` lớp một (dấu vân tay byte) khiến chạy lại một việc là **an toàn**.

Khi làm: **Hatchet không phải sự thật nghiệp vụ.** Hàng `TransportFuelDocument` là sự thật; một lần
chạy workflow chỉ là cách hàng đó ra đời.

### 7.2 Không có trừu tượng tệp thứ hai (#223)

Byte đi trong thân JSON, đúng khuôn `importStatementSchema` đã đặt từ trước cho bảng kê. Lane C
**không** tạo một lớp lưu trữ blob riêng, vì [#223](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/223)
sở hữu vòng đời tệp dùng chung và **vẫn đang mở** — chưa có ngữ nghĩa nào trên `main` để tái sử dụng.

Khi #223 hợp nhất: bức ảnh gốc nên trở thành một **id tệp mờ**, và `sourceRef` trỏ tới đó thay vì
mang một cái tên do người gọi tự đặt. Đó là một lần đổi **một trường**, không phải một lần viết lại
— vì hôm nay không có locator nào của bucket rò ra ngoài cổng.

### 7.3 Không đụng vào hộp thư nhiên liệu (#222)

[#222](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/222) sở hữu hộp thư
nhiên liệu chung và đường gỡ bằng chứng. Lane C **không sửa một tệp `apps/web` nào** trong cả ba
tranche. Màn hình rà soát ứng viên là một đường **đọc API** (`GET documents/:id/review`); ai dựng
giao diện cho nó là việc của lần sau, sau khi #222 hợp nhất.

---

## 8. Câu hỏi còn treo

- **`Q-08`** (R0 §7) vẫn **chưa có lời**: B mua dầu qua hợp đồng cây xăng hay qua thẻ/app, và hoá
  đơn điện tử đang gửi về đâu. Lane C **không đoán**: `ingestChannels` là một **mảng** (một nhà cung
  cấp có thể gửi cả bảng kê lẫn hoá đơn), và cổng `FuelInvoiceSource` nhận **byte** nên đường lấy
  byte thứ hai (hộp thư, API của đơn vị cung cấp dịch vụ hoá đơn) chỉ là một adapter mới.
- **Siêu dữ liệu hợp đồng** (`paymentTermDays`, `contract*Date`, `termsNote`) là thứ người đối soát
  **đọc**, không điều khiển một đồng nào — `ST-023` khoá điều đó bằng một bài đọc mã nguồn. Khi
  `Q-08` có lời, luật thanh toán phải là một quyết định có nguồn, không phải một suy diễn từ cột.
