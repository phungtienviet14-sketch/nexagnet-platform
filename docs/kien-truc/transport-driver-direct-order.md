# VIỆC TÀI XẾ NHẬN TRỰC TIẾP → ĐƠN TỰ ĐỘNG, KHÔNG NHÂN ĐÔI VÒNG CHẠY/CHẶNG — #398

- **Chỉ thị:** Issue #398 (kèm phần _OWNER UI INTEGRATION OVERRIDE_ 25/09/2026)
- **Nền:** #267 (nhận việc tại địa điểm A), #276 (lập kế hoạch vòng chạy), #379 (điểm lấy/giao có tọa độ), #397 (app mobile PWA/Android/iOS)
- **Phạm vi mã:** `apps/api/src/transport/site-intake/**` (capability `transport-site-intake`), cổng mới ở `planning/` và `control-tower/`, app `apps/transport-mobile`

> Tài liệu nền tảng: không nhắc tên khách.

---

## 0. Một câu

Tài xế được gọi điện đi lấy hàng → tới kho đã biết → app **đề nghị** địa điểm (chỉ đọc) → tài xế
**bấm** "Nhận chuyến tại đây" → sự thật vận hành (vòng chạy + chặng CÓ HÀNG) ra đời ngay → khi đủ điều
kiện tất định, hệ thống **tự tạo đúng một đơn** và đơn đó **nhận lại đúng vòng chạy + chặng cũ** →
giám đốc thấy "Đơn mới từ tài xế" trong **Hôm nay** (tin tức, không phải việc cần quyết) → chỉ ngoại
lệ mới vào **Cần xử lý**.

```text
Run R1 · Leg L1 LOADED orderId=null          (lần xác nhận của tài xế, #267)
        ↓ đủ điều kiện
Order O1 · Run R1 · Leg L1 LOADED orderId=O1 · Plan(O1, R1, L1, ADOPTED)
đếm:  Run +0 · Leg +0 · Order +1 · Plan +1
```

---

## 1. Bốn sự thật tách rời

| Sự thật                           | Bảng                                                                | Ai ghi                              |
| --------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| Quan sát vị trí                   | (không ghi — `propose` chỉ đọc)                                     | máy                                 |
| Xác nhận của tài xế               | `TransportRunSiteIntake` (chỉ-ghi-thêm, #267) + cột mới `siteMatch` | tài xế bấm                          |
| Vòng chạy / chặng                 | `TransportVehicleRun` / `TransportRunLeg`                           | lần xác nhận                        |
| Đơn (nghĩa vụ thương mại)         | `TransportOrder`                                                    | lệnh adopt (tự động hoặc văn phòng) |
| Phần thương mại của lần nhận việc | `TransportSiteIntakeCommercial` (1–1)                               | lệnh thương mại                     |

`TransportSiteIntakeCommercial` **không phải một mô hình đơn thứ hai**: không giá, không khách, không
điều khoản. Nó giữ đúng: điểm giao (khối nhãn + tọa độ + nguồn + ai + lúc nào), xác nhận nơi lấy của
văn phòng, đơn đã nhận chặng (gắn **một lần**), và lần báo bất thường.

Trạng thái: `PENDING → ORDER_BOUND` hoặc `PENDING → REJECTED`. Trạng thái cuối không quay ngược
(trigger `transport_site_intake_commercial_guard`).

---

## 2. Đủ điều kiện tạo đơn — `evaluateCommercialReadiness` (hàm thuần, tất định)

Kết quả: `READY_TO_AUTO_CREATE` · `NEEDS_REVIEW(reasons[])` · `ALREADY_BOUND(orderId)` · `REJECTED(reason)`.

Thứ tự: đã gắn đơn → `ALREADY_BOUND`; đã từ chối / vòng chạy hủy / chặng hủy → `REJECTED`; còn lại
**gom đủ** mọi lý do (không dừng ở lý do đầu tiên).

| Mã                                                                                      | Nghĩa                                                   | Ai gỡ                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ |
| `DESTINATION_MISSING`                                                                   | chưa có điểm giao                                       | tài xế hoặc văn phòng chọn điểm giao |
| `DESTINATION_SAME_AS_ORIGIN`                                                            | điểm giao trùng điểm lấy                                | chọn lại                             |
| `ORIGIN_LOCATION_UNVERIFIED`                                                            | xác nhận không kèm vị trí (hoặc bản ghi trước #398)     | văn phòng xác nhận nơi lấy           |
| `SITE_MATCH_AMBIGUOUS`                                                                  | vị trí gần nhiều kho / chỉ GẦN một kho — tài xế tự chọn | văn phòng xác nhận nơi lấy           |
| `ORIGIN_POINT_UNKNOWN` / `_AMBIGUOUS`                                                   | địa điểm không có / có nhiều hàng rào khác tọa độ       | sửa hàng rào                         |
| `SITE_INACTIVE`, `DRIVER_INACTIVE`, `DRIVER_BINDING_CHANGED`, `VEHICLE_BINDING_CHANGED` | dữ liệu nền đã đổi                                      | sửa ở đội xe / địa điểm              |
| `LEG_COMPLETED`                                                                         | chặng đã xong trước khi có đơn (`orderId` bị khóa)      | gắn tay không được — báo bất thường  |
| `LEG_ORDER_CONFLICT`, `RUN_PLAN_CONFLICT`                                               | xung đột chặng/kế hoạch                                 | báo bất thường                       |

**Không** bắt buộc khách hàng, giá cước, hàng hóa — `TransportOrder` hôm nay không bắt buộc chúng, và
lần này không làm mạnh thêm. Đơn tự tạo mang `customerId = null`, `freightAmount = null` (**chưa biết,
không phải 0**). Tọa độ điểm lấy = tâm hàng rào đang hoạt động của địa điểm (nguồn "địa điểm đã biết"
của #379). Không LLM trong cổng này.

`siteMatch` được ghi **đúng lúc bấm**: `UNIQUE_INSIDE` (một kho, vị trí nằm TRONG hàng rào) ·
`CHOSEN_AMONG_SEVERAL` · `NO_LOCATION`. Hàng trước #398 là `NULL` = "không biết".

---

## 3. Lệnh adopt — một giao dịch, ba khóa, một thứ tự

`SiteIntakeCommercialStore.withIntake(intakeId, { lockOrderId? }, work)`:

```text
BEGIN (ReadCommitted)
  pg_advisory_xact_lock(hashtextextended('transport-site-intake-commercial:<intakeId>', 0))
  [gắn đơn có sẵn] pg_advisory_xact_lock(hashtextextended('transport-order-plan:<orderId>', 0))
  SELECT … FROM "TransportVehicleRun" WHERE id = <runId> FOR UPDATE      -- ranh giới #293 R2
  đọc lại lần nhận việc / phần thương mại / vòng chạy / chặng / phân công / kế hoạch
  phán xử (evaluateCommercialReadiness | evaluateOrderBinding | decideException)
  INSERT TransportOrder (DH-A<yyMMdd>-<8hex sha256(intakeId)>)
  UPDATE TransportRunLeg SET orderId, destinationLabel
         WHERE id=L1 AND kind='LOADED' AND orderId IS NULL AND status IN (PLANNED, IN_TRANSIT)
  INSERT TransportOrderRunPlan (loadedLegId=L1, emptyLegId=NULL, outcome='ADOPTED',
         idempotencyKey='site-intake:<intakeId>')
  UPDATE TransportSiteIntakeCommercial SET status='ORDER_BOUND', orderId, bindingMode, boundBy, boundAt
  INSERT AuditLog × 3 (transport.order.create · transport.planning.adopt · transport.site_intake.order_bound)
COMMIT
```

Planner (`createRun`/`createLeg` khi có `planGuardOrderId`) giành **khóa tư vấn của đơn**, rồi
**khóa tư vấn của xe** `transport-vehicle-runs:<vehicleId>` (createLeg đọc `vehicleId` của vòng chạy
trước), rồi mới **khóa hàng vòng chạy**; dưới hai khóa tư vấn nó đọc lại "đơn đã có kế hoạch hiệu
lực chưa" (`PLAN_ORDER_ALREADY_PLANNED`) và "xe có đang giữ việc tài xế nhận chưa có đơn không"
(`PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE` — phần thương mại `PENDING`, vòng chạy `PLANNED/ACTIVE`,
chặng chưa hủy). Bên thua gỡ phần dở dang như với khóa đơn (`abandonPartialCommit`).

**Lần tài xế xác nhận** (`PrismaSiteIntakeConfirmationWriter`) là **một giao dịch**, chỉ giành khóa xe:

```text
BEGIN (ReadCommitted)
  pg_advisory_xact_lock(hashtextextended('transport-vehicle-runs:<vehicleId>', 0))
  đọc lại: khóa chống lặp (driverId, clientEventId) → trả lần cũ
           tài xế đang cầm vòng chạy mở            → SITE_INTAKE_OPEN_RUN_EXISTS
           xe có vòng chạy mở (kể cả chưa ai cầm)  → SITE_INTAKE_VEHICLE_BUSY
  INSERT TransportVehicleRun (PLANNED) · TransportRunAssignment (effectiveFrom = confirmedAt)
  INSERT TransportRunLeg (LOADED, sequence 1, orderId NULL)
  INSERT TransportRunSiteIntake + TransportSiteIntakeCommercial (PENDING)
  INSERT AuditLog × 3 (transport.run.create · transport.run.assign · transport.run.leg.add)
COMMIT
```

Thứ tự khóa là một: **lần nhận việc → đơn → xe → hàng vòng chạy**. Planner: đơn → xe → hàng. Xác
nhận: chỉ xe (không khóa hàng vòng chạy có sẵn nào — nó chỉ chèn hàng mới). Adopt (`withIntake`):
lần nhận việc → đơn → hàng, **không** giành khóa xe. Mọi đường ghi khác chỉ khóa hàng. Không ai giữ
một khóa sau rồi xin một khóa trước ⇒ không vòng đợi.

Bốn lớp chặn nhân đôi:

1. kế hoạch `ADOPTED` → `TransportOrderRunPlan_activeOrder_key`: planner gọi lại cho O1 → `PLAN_ORDER_ALREADY_PLANNED` trước mọi lần ghi;
2. planner cho **xe đang giữ việc tài xế nhận chưa có đơn** → `PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE`: hỏi nhanh qua cổng `PlanningPendingWorkSource` (mặc định rỗng ở `transport-core`, `transport-site-intake` ghi đè), và **hỏi lại dưới khóa xe** trong kho;
3. tài xế xác nhận khi **xe đã có vòng chạy mở** (vd văn phòng vừa lập, chưa ai cầm) → `SITE_INTAKE_VEHICLE_BUSY`, không ghi gì;
4. tầng DB: trigger `transport_run_leg_order_binding_once` (chặng `orderId` X → Y bị cấm), `TransportSiteIntakeCommercial_orderId_key`, trigger `transport_site_intake_commercial_guard`.

---

## 4. Báo bất thường / hủy — máy chủ quyết theo sự thật vận hành

"Xe đã lăn bánh" = chặng `IN_TRANSIT/COMPLETED` **hoặc** vòng chạy `ACTIVE/COMPLETED` **hoặc** có mốc
`DEPARTED | PICKUP_DEPARTURE | DELIVERY_ARRIVAL | DELIVERY_ACCEPTED | COMPLETED` trên vòng chạy.

| Phần thương mại                               | Xe chưa chạy                                                                                                        | Xe đã chạy                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ORDER_BOUND`, đơn `OPEN`                     | hủy đơn + hủy kế hoạch + hủy chặng `PLANNED` + hủy vòng chạy `PLANNED` (chỉ khi không còn việc khác trên vòng chạy) | **chỉ hủy đơn**; vòng chạy/chặng/mốc/GPS giữ nguyên |
| `ORDER_BOUND`, đơn đã `FULFILLED`/`CANCELLED` | chỉ **ghi nhận** bất thường, không đổi trạng thái                                                                   | như trái                                            |
| `PENDING`                                     | `REJECTED` + hủy việc vận hành chưa chạy                                                                            | `REJECTED`; hoạt động vận hành giữ nguyên           |

Không xóa hàng nào. Lý do bắt buộc. Mỗi lần nhận việc có tối đa một lần báo bất thường (gửi lại cùng
khóa = trả kết cục cũ). Chỉ `ADMIN` (kế toán bị cắt ở `ACCOUNTING_DENIED`).

---

## 5. Bề mặt HTTP

### Tài xế — `transport/me/site-intake` (danh tính từ phiên)

| Đường                                                                                                  | Quyền                  | Ghi?                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- |
| `POST proposals`                                                                                       | `.site_intake.propose` | **không** (#267)                                                                            |
| `POST confirmations` `{siteId, clientEventId, latitude?, longitude?, accuracyMetres?}`                 | `.site_intake.confirm` | vòng chạy + chặng + lần nhận việc + phần thương mại `PENDING` (một giao dịch, khóa xe — §3) |
| `GET open` → `{ intake: DriverIntakeView \| null }`                                                    | `.propose`             | không                                                                                       |
| `GET destinations` → `{ available, places: KnownPlace[] }`                                             | `.propose`             | không                                                                                       |
| `POST destinations/search` `{query}` → `PlaceSearchResponse`                                           | `.confirm`             | không                                                                                       |
| `GET :intakeId` → `DriverIntakeView` (của người khác = 404)                                            | `.propose`             | không                                                                                       |
| `POST :intakeId/destination` `{clientEventId, destination}` → `{ intake: DriverIntakeView, replayed }` | `.confirm`             | điểm giao; đủ thì tự tạo đơn                                                                |

`destination` = `{kind:'KNOWN_PLACE', placeId}` hoặc `{kind:'PLACE_SEARCH', query, label, latitude,
longitude}` — kết quả tìm được máy chủ **tìm lại và đối chiếu** nhãn + tọa độ; một cặp số tự do không
qua được. Mọi thân `.strict()` — trường tiền/khách/xe/tài xế bị từ chối.

`POST confirmations` từ chối `409 SITE_INTAKE_OPEN_RUN_EXISTS` (tài xế đang cầm vòng chạy mở) và
`409 SITE_INTAKE_VEHICLE_BUSY` (xe đã có vòng chạy mở, kể cả chưa ai cầm) — không ghi gì.

`DriverIntakeView.stage`: `NEEDS_DESTINATION` · `CONFIRMED` · `OFFICE_FOLLOW_UP` · `CLOSED`. Khung
nhìn mang `runId`/`runCode` của **chính vòng chạy tài xế đang cầm** — định danh kỹ thuật để app gắn
mốc/điều hướng, **không** hiện ra thành chữ "đơn"/"vòng chạy" trên màn hình. Không có mã đơn, không
tiền, không vòng chạy của người khác (lỗi `SITE_INTAKE_VEHICLE_BUSY` cũng không in mã vòng chạy nào).

### Văn phòng — `transport/site-intakes`

| Đường                                                                            | Quyền                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------- |
| `GET /?status=PENDING` → `SiteIntakeReviewView[]`                                | `transport.site_intake.review.read`       |
| `GET activity?hours=24` → `DriverOrderActivityView[]` ("Đơn mới từ tài xế")      | `.review.read`                            |
| `GET by-order/:orderId` → `OrderIntakeSourceView` (404 nếu đơn không đến từ đây) | `.review.read`                            |
| `GET :intakeId` → `SiteIntakeReviewView`                                         | `.review.read`                            |
| `GET :intakeId/bindable-orders` → đơn OPEN chưa lập kế hoạch                     | `.review.complete`                        |
| `POST :intakeId/complete` `{idempotencyKey, destination?, attestOrigin?}`        | `.review.complete` (ADMIN, ACCOUNTING)    |
| `POST :intakeId/bind-order` `{orderId, idempotencyKey}`                          | `.review.complete` (ADMIN, ACCOUNTING)    |
| `POST :intakeId/exception` `{reason, idempotencyKey}`                            | `transport.site_intake.exception` (ADMIN) |

Control Tower: loại việc `SITE_INTAKE_NEEDS_REVIEW` (WARNING), chủ thể `SITE_INTAKE` (id = intakeId,
reference = mã vòng chạy), `detail.reasons` = mã nối bằng dấu phẩy. Đơn tự tạo bình thường **không**
vào hàng này và không làm tăng `queueTotal`.

---

## 6. Tài chính không đổi

```text
vòng chạy xong != đơn giao xong != đối soát duyệt != công nợ nhận != thanh toán phân bổ
```

Lệnh adopt không ghi công nợ, phải trả, quyết toán, doanh thu. Tiền chưa biết là `null`.

---

## 7. Còn lại (ghi tên, không giấu)

- **Hai lần xác nhận khác `clientEventId` cùng lúc** của cùng một tài xế (lỗ có từ #267) **đã đóng**
  khi cả hai đi vào cùng một xe: khóa xe xếp hàng chúng, lần sau đọc lại dưới khóa và nhận
  `SITE_INTAKE_OPEN_RUN_EXISTS` (bài Postgres `o.`). Còn mở đúng một khe hẹp: nếu **phân công xe của
  tài xế đổi đúng giữa hai lần bấm**, hai lần xác nhận giành khóa của hai xe khác nhau. Xác nhận chỉ
  giành khóa xe (không khóa tài xế) để giữ thứ tự khóa một chiều ở §3.
- **Bản trong bộ nhớ** (`PERSISTENCE=memory`) không có giao dịch: lần xác nhận ghi qua
  `MovementService` (bốn lần ghi rời), xếp hàng qua một hàng đợi riêng; kho phần thương mại xếp hàng
  qua hàng đợi của nó; planner bỏ qua `planGuardOrderId` (không có khóa đơn/xe giữa lập kế hoạch và
  xác nhận). Bằng chứng đồng thời là Postgres.
- **Đường đọc của văn phòng là N+1 theo từng hàng `PENDING`**: `SiteIntakeReviewService` (Cần xử lý,
  `pendingIntakeForVehicle`, hàng review) dựng mỗi hàng bằng vài truy vấn riêng (vòng chạy, chặng,
  phân công, kế hoạch, mốc, dữ kiện ngoài). Chấp nhận được ở 10–20 đơn/ngày (vài hàng `PENDING` cùng
  lúc, `take` giới hạn 20/xe); gộp truy vấn khi số hàng chờ tăng thật.
- **Bản đồ chọn điểm giao** trên PWA: bản đồ nền web chưa có (`RunMap.web.tsx`), nên điểm giao chọn từ
  danh sách địa điểm đã biết + tìm theo tên (#379), không phải chạm trên bản đồ.
