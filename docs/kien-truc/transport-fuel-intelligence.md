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

## 6. Câu hỏi còn treo

- **`Q-08`** (R0 §7) vẫn **chưa có lời**: B mua dầu qua hợp đồng cây xăng hay qua thẻ/app, và hoá
  đơn điện tử đang gửi về đâu. Lane C **không đoán**: `ingestChannels` là một **mảng** (một nhà cung
  cấp có thể gửi cả bảng kê lẫn hoá đơn), và cổng `FuelInvoiceSource` nhận **byte** nên đường lấy
  byte thứ hai (hộp thư, API của đơn vị cung cấp dịch vụ hoá đơn) chỉ là một adapter mới.
- **Siêu dữ liệu hợp đồng** (`paymentTermDays`, `contract*Date`, `termsNote`) là thứ người đối soát
  **đọc**, không điều khiển một đồng nào — `ST-023` khoá điều đó bằng một bài đọc mã nguồn. Khi
  `Q-08` có lời, luật thanh toán phải là một quyết định có nguồn, không phải một suy diễn từ cột.
