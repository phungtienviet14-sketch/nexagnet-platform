# KẾT THÚC ĐƠN — cổng điều kiện đối soát ở hạt ĐƠN HÀNG (Lane K)

- **Ngày lập:** 08/09/2026
- **Mốc:** `TV2 PHASE 3 / LANE K`
- **Đo trên:** `origin/main` = `f5868144905d683c5c67ffce30f6d46810561717`
- **Chỉ thị:** Issue #275 (hợp đồng lane) · điều phối #274 · sửa #268 / PR #271 / PR #273
- **Nguồn phụ thuộc:** Lane O (chứng từ vận hành) và Lane P (File Platform) — **CHƯA** vào `main`

> **Tài liệu nền tảng — không nhắc tên khách.** Công ty B xuất hiện ở đây dưới vai _reference
> tenant_; tham số riêng nằm ở `tenants/<slug>/`.

---

## 0. Câu một dòng

Chủ thể của lần **kết thúc thương mại** là `TransportOrder`, **không phải** `TransportVehicleRun`.

```text
Đơn giao xong
→ lái xe trả biên nhận / bên B có căn cứ xác nhận vật lý
→ B dùng nó lấy xác nhận phía A, ngoài Nexagnet
→ KẾ TOÁN bấm `Đã kết thúc` trên ĐƠN
→ chỉ khi đó đơn mới vào được một kỳ đối soát MỚI
```

---

## 1. Lane K sửa gì của Lane I

|                           | #268 / PR #271 (Lane I)                | #275 (Lane K)                                |
| ------------------------- | -------------------------------------- | -------------------------------------------- |
| Chủ thể nghiệm thu        | `TransportVehicleRun`                  | **`TransportOrder`**                         |
| Điều kiện vận hành        | `run.status === 'COMPLETED'`           | **`order.status === 'FULFILLED'`**           |
| Đường HTTP                | `/commercial-acceptance/runs/:runId`   | **`/commercial-acceptance/orders/:orderId`** |
| Chuyến chưa chiếu sang v2 | PR #273: `NOT_PROJECTED` ⇒ **cho qua** | **`NO_ORDER` ⇒ đóng cổng**                   |
| Chuyến thuê nhà xe ngoài  | không bao giờ có chủ thể               | **có đơn**, qua phép chiếu thương mại        |

Chủ sở hữu đã bác bỏ hình dạng của PR #273 trong chính PR đó
(`OWNER DECISION — PR #273 MUST NOT MERGE AS-IS`, 08/09/2026). Lane K **thay thế** nhánh đó và
**giữ lại** hai thứ dùng được: cổng đọc đặt ở phía tiêu thụ, và nửa tương thích lịch sử
`ALREADY_SETTLED`.

---

## 2. Vì sao phải có `TransportTripOrderLink`

Nguồn quyết toán hôm nay có khoá `(sourceContext, tripId)` — một `TransportTrip` v1. Đổi khoá đó là
đổi chính khoá chống ghi trùng của **mọi chứng từ đã phát hành**, tức đúng điều #275 K6 cấm. Nên
cổng nhận `tripId` và **tự tra ra đơn**.

Đường tra cứu không được đi qua vòng chạy:

```text
TransportTripRunLegLink → RunLeg.orderId       chỉ có khi chuyến chiếu được sang một VÒNG CHẠY
                                              và `planTripProjection` TỪ CHỐI `EXTERNAL_CARRIER`
```

Một chuyến thuê nhà xe ngoài **vẫn có khách, vẫn có biên nhận giao hàng**. Nếu đường duy nhất để nó
có đơn là đi qua vòng chạy, thì hoặc cổng chặn vĩnh viễn một dòng đang chạy, hoặc phải mở lại đúng
cái lỗ `NOT_PROJECTED`. Cả hai đều bị #275 cấm.

Nên có **hai phép chiếu độc lập**, mỗi cái một điều kiện:

| Phép chiếu                             | Hàm thuần             | Điều kiện                      | Từ chối                                                        |
| -------------------------------------- | --------------------- | ------------------------------ | -------------------------------------------------------------- |
| ĐIỀU HÀNH (chuyến → vòng chạy + chặng) | `planTripProjection`  | phải là xe của B, đã phân công | `PROJECTION_TRIP_OUTSOURCED`, `PROJECTION_TRIP_HAS_NO_VEHICLE` |
| THƯƠNG MẠI (chuyến → đơn)              | `planOrderProjection` | chỉ cần có khách               | `ORDER_PROJECTION_TRIP_HAS_NO_CUSTOMER`                        |

Cả hai dùng **cùng** mã đơn `ORD-<mã chuyến>`, nên chạy cái nào trước cũng ra cùng một đơn.

---

## 3. Bất biến trung tâm

```text
ứng viên đối soát MỚI cho một đơn
  = mọi điều kiện vận hành/thương mại CŨ
  VÀ  đơn đã `FULFILLED`
  VÀ  kết thúc thương mại == APPROVED
```

Bảng chân lý — `isSettlementEligible()`, hàm **thuần**:

| `order.status`       | kết thúc           | đủ điều kiện          |
| -------------------- | ------------------ | --------------------- |
| `FULFILLED`          | `APPROVED`         | ✅ **đường duy nhất** |
| `FULFILLED`          | `PENDING`          | ⛔                    |
| `FULFILLED`          | `REJECTED`         | ⛔                    |
| `FULFILLED`          | `NEEDS_CORRECTION` | ⛔                    |
| `OPEN` / `CANCELLED` | `APPROVED`         | ⛔ — không đường tắt  |

Chữ ký của hàm **không có** trường nào mang trạng thái vòng chạy. Đó là cách #275 K7 được giữ bằng
**kiểu** chứ không bằng một bài test: vòng chạy đóng hay mở không tự cho phép hay từ chối gì.

---

## 4. Bốn đường ra của cổng, mỗi đường một mã lý do

| Mã                                            | Nghĩa                                  | Kết quả                                 |
| --------------------------------------------- | -------------------------------------- | --------------------------------------- |
| `SETTLEMENT_ORDER_COMPLETION_ALREADY_SETTLED` | đã có chứng từ cho đúng khoá nguồn này | **cho qua** — không phải chọn nguồn mới |
| `SETTLEMENT_ORDER_NOT_LINKED`                 | nguồn chưa có đơn nào làm chủ thể      | **đóng**                                |
| `SETTLEMENT_ORDER_COMPLETION_BLOCKED`         | có đơn, chưa đủ điều kiện              | **đóng**                                |
| `SETTLEMENT_ORDER_COMPLETION_APPROVED`        | `FULFILLED` + `APPROVED`               | **đi tiếp**                             |

Cổng được kiểm **sau** mọi cổng vận hành cũ, nên một chuyến chưa đối soát vẫn báo
`SETTLEMENT_TRIP_NOT_RECONCILED` và cổng mới **không được hỏi đến** — có bài đếm số lần gọi khoá
điều đó.

### Đường nhà xe ngoài — đo lại, không chép

`TRIP_CARRIER_COST` là B **trả** một nhà xe ngoài theo hợp đồng vận tải giữa B và họ. Khách A không
ký vào khoản đó. Nghĩa vụ biên nhận của chính chuyến ấy **vẫn tồn tại và vẫn bị chặn** — nhưng ở
dòng `CUSTOMER_FREIGHT` của cùng chuyến đó, nơi A ký nhận hàng, và dòng đó đi qua cổng như mọi dòng
khác. Cắm cổng ở cả hai sẽ bắt B phải có biên nhận của khách **trước khi trả tiền cho nhà thầu phụ
của chính mình** — một luật chưa ai đặt ra.

---

## 5. Migration `20260910120000` — THÊM VÀO, không phá

- `TransportTripOrderLink` mới: `tripId` khoá chính, `orderId` unique.
- Backfill **tất định** từ `TripRunLegLink → RunLeg.orderId`: ghi lại một sự thật **đã tồn tại về
  cấu trúc**, không tạo đơn nào, không đặt trạng thái nghiệm thu nào.
- `TransportCommercialAcceptance.runId` → nullable (**không** bị gỡ), `+orderId` unique,
  `CHECK ..._subject_exactly_one` đòi đúng một chủ thể.
- Không sửa một hàng nào đã có, không gỡ bảng, không đổi tên.

`transport-commercial-acceptance-storage.spec.ts` đọc **chính tệp SQL đó** để khoá cả sáu điều trên.

---

## 6. Phân quyền — không mở rộng quyền của ai

`transport.commercial_acceptance.read` / `.decide` giữ nguyên từ #271: ADMIN + ACCOUNTING, suy ra
bằng phép trừ nên `SALE` (vai as-built của lái xe) và `MANAGER` tự động **không** có. Kế toán
**quyết** được nhưng **không sửa** được căn cứ: `transport.checkpoint.record`,
`transport.proof.withdraw`, `transport.geofence.manage` nằm trong `ACCOUNTING_DENIED` từ trước lane
này, và `CommercialAcceptanceService` **không cầm** một kho ghi nào ngoài kho của chính nó.

`decidedBy` đến từ phiên, `decidedAt` từ đồng hồ máy chủ — giữ bằng **kiểu**: lệnh của miền không có
trường nào để bên gọi đặt chúng.

---

## 7. Giới hạn đã biết, báo chứ không che

1. **Chứng cứ số chưa có nguồn.** Lane O/P chưa vào `main`, nên `AcceptanceEvidenceFacts` vẫn là
   adapter FAIL-CLOSED: đường `DOCUMENT` bị từ chối, đường `EXTERNAL_PHYSICAL_CONFIRMATION` đi được
   và đó là đường **đúng** cho hôm nay. Khi nguồn đó vào, **một dòng** `useClass` đổi.
2. **`SettlementService.recognise*` không có route HTTP nào** — đo được trên `main`, và lane này
   **không** mở một đường ghi tài chính mới chỉ để có bằng chứng runtime đẹp hơn. Điều kiện đối soát
   vì thế được chứng minh ở ba bậc: miền (hàm thuần) · Postgres thật (cổng chặn/cho qua, đúng một
   lần, tương thích lịch sử) · runtime preview (đọc `settlementEligible` trên hàng chờ lật từ
   `false` sang `true` sau khi kế toán bấm).
3. **Nhiều đơn trên một vòng chạy** đã có bài chứng minh ở mức miền và Postgres; phần _tạo_ vòng
   chạy nhiều đơn thuộc Lane L.
