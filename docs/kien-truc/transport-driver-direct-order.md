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

**Bản ghi trước #398.** Migration `20260926100100_…` **điền bù** một hàng phần thương mại `PENDING`
trống cho mỗi lần nhận việc **còn dang dở** lúc triển khai: vòng chạy `PLANNED/ACTIVE`, chặng của lần
nhận việc là `LOADED`, chưa `CANCELLED`/`COMPLETED`, chưa mang đơn. Lần nhận việc đã đóng/hủy/xong/đã
gắn đơn không được hàng nào (đường lười của kho vẫn tạo khi có lệnh chạm tới). Hàng điền bù không bịa
điểm giao, xác nhận nơi lấy, đơn hay người ghi; `siteMatch` cũ là `NULL` nên ra `NEEDS_REVIEW`
(`DESTINATION_MISSING` + `ORIGIN_LOCATION_UNVERIFIED`), hiện trong "Cần xử lý", và planner cho chính
xe đó bị từ chối `PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE`. Câu lệnh idempotent (`NOT EXISTS` +
`ON CONFLICT DO NOTHING`); bài `transport-site-intake-commercial-backfill.int.spec.ts` chạy chính đoạn
giữa hai dòng đánh dấu `DIEN-BU-398` trong migration.

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

### Vị trí cũ thất bại đóng (#398 §3.1, §8)

- Tọa độ do máy tài xế gửi (`DRIVER_REPORTED`) đi kèm `locationAgeMs`: tuổi bản định vị đo bằng
  **đồng hồ của chính máy** lúc gửi (hiệu hai lần đọc cùng một đồng hồ), nên lệch giờ giữa điện thoại
  và máy chủ không làm sai kết quả (lệch giữa đồng hồ GNSS của bản định vị và đồng hồ máy thì **không**
  được bù — hướng lỗi của nó là đóng: bị coi là cũ, không bao giờ bị coi là mới). Máy chủ đặt
  `observedAt = now − locationAgeMs`, rồi áp hạn
  `maxAgeSeconds = 300` sẵn có của #267: `propose` trả `LOCATION_UNUSABLE/LOCATION_STALE` và không
  ghi gì; `confirm` trả `400 SITE_INTAKE_LOCATION_UNUSABLE` **trước mọi lần ghi**.
- App giữ giờ của bản định vị (cái cũ hơn giữa dấu giờ của bản định vị và lúc máy nhận nó). Lúc bấm
  "Nhận chuyến tại đây", bản định vị từ lúc mở màn cũ hơn 120 giây (`FRESH_FIX_MAX_AGE_MS`, thấp hơn
  300 giây của máy chủ) thì app **xin lại một lần**; không có bản mới thì **không gửi tọa độ** — lần
  xác nhận ghi `siteMatch = NO_LOCATION`, việc vận hành vẫn được nhận, phần thương mại ra
  `NEEDS_REVIEW (ORIGIN_LOCATION_UNVERIFIED)`. Bản xin lại **quá thô** (sai số > 150 m, bằng
  `maxAccuracyMetres` của máy chủ) cũng tính là "không có bản mới" — một điện thoại trả bản tệ dưới mái
  tôn không được thiệt hơn một điện thoại không trả gì. Tọa độ không rõ tuổi không bao giờ được gửi.
- PWA: `captureFix()` ép `maximumAge: 0` — bản web của `expo-location` mặc định `maximumAge: Infinity`,
  tức nhận mọi vị trí còn trong bộ nhớ đệm của trình duyệt. Web cũ (#267) cũng gửi `locationAgeMs` và
  xin lại vị trí khi quá 120 giây.
- Thiếu `locationAgeMs` (máy khách cũ) thì máy chủ giữ hành vi #267 (`observedAt = now`).

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
  [lệnh tài xế chọn điểm giao] + transport.site_intake.destination — cùng giao dịch
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

Câu `SELECT … FOR UPDATE` trong `withIntake` là **ngoại lệ có tên** của quy ước "capability không tự
viết khóa hàng vòng chạy" (`MovementRepository.underRunLock`): dùng `underRunLock` sẽ mở giao dịch và
khóa hàng TRƯỚC, đảo thứ tự thành hàng → đơn — ngược planner (đơn → xe → hàng) và là công thức của
deadlock. Ngoại lệ được ghi ngay tại câu lệnh và trong chú thích của `underRunLock`. Khóa đơn
(`orderPlanLockKey()` / `lockOrderPlan()`) khai **một lần** trong `prisma-movement.repository.ts`;
kho phần thương mại dùng lại.

Bốn lớp chặn nhân đôi:

1. kế hoạch `ADOPTED` → `TransportOrderRunPlan_activeOrder_key`: planner gọi lại cho O1 → `PLAN_ORDER_ALREADY_PLANNED` trước mọi lần ghi;
2. planner cho **xe đang giữ việc tài xế nhận chưa có đơn** → `PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE`: hỏi nhanh qua cổng `PlanningPendingWorkSource` (mặc định rỗng ở `transport-core`, `transport-site-intake` ghi đè), và **hỏi lại dưới khóa xe** trong kho;
3. tài xế xác nhận khi **xe đã có vòng chạy mở** (vd văn phòng vừa lập, chưa ai cầm) → `SITE_INTAKE_VEHICLE_BUSY`, không ghi gì;
4. tầng DB: trigger `transport_run_leg_order_binding_once` — chặng `orderId` X → Y bị cấm; X → NULL **cũng** bị cấm, trừ khi do chính khóa ngoại `ON DELETE SET NULL` ghi khi đơn bị xóa cứng (`pg_trigger_depth() > 1`; một `UPDATE` viết tay, kể cả trong khối `DO`, chạy ở độ sâu 1) ⇒ không còn đường gán lại bằng hai lệnh thô X → NULL → Y. Kèm `TransportSiteIntakeCommercial_orderId_key` và trigger `transport_site_intake_commercial_guard`;
5. đơn đã **nhận chặng của việc tài xế nhận** mà chặng đó **còn sống** (`ORDER_BOUND` + chặng chưa `CANCELLED`) → `409 LEG_ORDER_ADOPTED_BY_SITE_INTAKE` cho mọi chặng `LOADED` mới: trình sửa tay (`POST /transport/runs/:id/legs`) và planner — với planner, kiểm ngay ở **lần ghi đầu tiên** (tạo vòng chạy / chặng rỗng) dưới khóa đơn, nên không bao giờ để lại vòng chạy mồ côi; mã này cũng được tính là xung đột để `abandonPartialCommit` gỡ phần dở dang. Văn phòng hủy kế hoạch `ADOPTED` khi xe **chưa chạy** thì chặng đó bị hủy theo → đơn được lập kế hoạch lại bình thường (chặng **thay thế**, không phải chặng thứ hai); xe **đã chạy** thì chặng còn sống → planner bị từ chối trước mọi lần ghi. Đua với "gắn đơn có sẵn": gắn trước → chặng tay bị từ chối; chặng tay trước → gắn nhận `SITE_INTAKE_BINDING_DENIED (ORDER_ALREADY_ON_RUN)` (bài `transport-movement-adopted-order.int.spec.ts`).

---

## 4. Báo bất thường / hủy — máy chủ quyết theo sự thật vận hành

"Xe đã lăn bánh" = chặng `IN_TRANSIT/COMPLETED` **hoặc** vòng chạy `ACTIVE/COMPLETED` **hoặc** có mốc
`DEPARTED | PICKUP_DEPARTURE | DELIVERY_ARRIVAL | DELIVERY_ACCEPTED | COMPLETED` trên vòng chạy.

| Phần thương mại                               | Xe chưa chạy                                                                                                        | Xe đã chạy                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `ORDER_BOUND`, đơn `OPEN`                     | hủy đơn + hủy kế hoạch + hủy chặng `PLANNED` + hủy vòng chạy `PLANNED` (chỉ khi không còn việc khác trên vòng chạy) | **chỉ hủy đơn**; vòng chạy/chặng/mốc/GPS giữ nguyên |
| `ORDER_BOUND`, đơn đã `FULFILLED`/`CANCELLED` | chỉ **ghi nhận** bất thường, không đổi trạng thái                                                                   | như trái                                            |
| `PENDING`                                     | `REJECTED` + hủy việc vận hành chưa chạy                                                                            | `REJECTED`; hoạt động vận hành giữ nguyên           |

Không xóa hàng nào. **Lý do bắt buộc ở ba tầng**: schema HTTP (≥ 3 ký tự sau khi cắt khoảng trắng),
chính dịch vụ (`SITE_INTAKE_EXCEPTION_REASON_REQUIRED` — người gọi không qua HTTP cũng không lách được)
và CHECK `TransportSiteIntakeCommercial_exception_shape`. Mỗi lần nhận việc có tối đa một lần báo bất
thường (gửi lại cùng khóa = trả kết cục cũ). Chỉ `ADMIN` (kế toán bị cắt ở `ACCOUNTING_DENIED`).

"Xe đã lăn bánh" được chứng minh trên Postgres bằng **mốc** (không chỉ bằng trạng thái chặng): chặng
và vòng chạy còn `PLANNED`, chỉ một mốc `DEPARTED` hoặc `PICKUP_DEPARTURE` là đủ để ra
`ORDER_CANCELLED_OPERATION_PRESERVED`; vòng chạy, chặng và các hàng mốc giữ nguyên. Sau lần hủy đó kế
hoạch `ADOPTED` **vẫn hiệu lực** — cùng ngữ nghĩa với hủy đơn có sẵn (kế hoạch mô tả việc vận hành đã
diễn ra, không phải nghĩa vụ thương mại). Với đơn đã `FULFILLED`, kể cả khi xe chưa chạy, chỉ ghi
`ANOMALY_RECORDED_ORDER_TERMINAL`; không hủy gì.

---

## 5. Bề mặt HTTP

### Tài xế — `transport/me/site-intake` (danh tính từ phiên)

| Đường                                                                                                  | Quyền                  | Ghi?                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------- |
| `POST proposals` `{latitude?, longitude?, accuracyMetres?, locationAgeMs?}`                            | `.site_intake.propose` | **không** (#267)                                                                            |
| `POST confirmations` `{siteId, clientEventId, latitude?, longitude?, accuracyMetres?, locationAgeMs?}` | `.site_intake.confirm` | vòng chạy + chặng + lần nhận việc + phần thương mại `PENDING` (một giao dịch, khóa xe — §3) |
| `GET open` → `{ intake: DriverIntakeView \| null }`                                                    | `.propose`             | không                                                                                       |
| `GET destinations` → `{ available, places: KnownPlace[] }`                                             | `.propose`             | không                                                                                       |
| `POST destinations/search` `{query}` → `PlaceSearchResponse`                                           | `.confirm`             | không                                                                                       |
| `GET :intakeId` → `DriverIntakeView` (của người khác = 404)                                            | `.propose`             | không                                                                                       |
| `POST :intakeId/destination` `{clientEventId, destination}` → `{ intake: DriverIntakeView, replayed }` | `.confirm`             | điểm giao; đủ thì tự tạo đơn                                                                |

`destination` = `{kind:'KNOWN_PLACE', placeId}` hoặc `{kind:'PLACE_SEARCH', query, label, latitude,
longitude}` — kết quả tìm được máy chủ **tìm lại và đối chiếu** nhãn + tọa độ; một cặp số tự do không
qua được. Mọi thân `.strict()` — trường tiền/khách/xe/tài xế bị từ chối.

**Gửi lại TRƯỚC khi tìm lại.** Cả lệnh tài xế chọn điểm giao lẫn `complete` của văn phòng nhận lựa
chọn dưới dạng **hàm**: dịch vụ đọc phần thương mại trước, và nếu đây là lần gửi lại cùng khóa (hoặc
việc đã đóng) thì trả kết cục đã ghi **không gọi tìm địa điểm** — mất phản hồi rồi gửi lại không thành
`SEARCH_UNAVAILABLE`/`DESTINATION_UNVERIFIED` chỉ vì bộ nhớ đệm của lần tìm đã mất (API khởi động
lại, máy khác) hay nhà cung cấp đang bận. Khoảng hẹp giữa lần đọc trước khóa và lần ghi dưới khóa (văn
phòng vừa ghi một điểm giao khác) trả `409 SITE_INTAKE_STATE_CHANGED`; app coi mã này như "gửi lại
đúng khóa cũ".

`locationAgeMs`: số nguyên ms, `0..86_400_000`, chỉ đi **cùng** `latitude/longitude`; đi với
`observationId` hoặc không kèm tọa độ → `400`. Xem §2 "Vị trí cũ thất bại đóng".

Đối chiếu kết quả tìm (`SiteIntakePlaceSearchBridge.choiceOf`): `KNOWN_PLACE` chỉ đi qua `placeId`,
nhãn + tọa độ lấy từ hàng rào đang hoạt động; `PLACE_SEARCH` được máy chủ **tìm lại bằng chính chuỗi
tìm** và chỉ nhận kết quả **cùng nhãn và cùng điểm (≤ 1 m)** — điểm lưu là điểm của máy chủ. Tìm đang
tắt/bận → `409 SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE`; lệch → `400
SITE_INTAKE_DESTINATION_UNVERIFIED`; `0,0` không qua (tầng parse của nhà cung cấp loại nó, và CHECK
`…_destination_not_null_island` chặn ở DB).

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
| `GET destinations` → `{ available, places: KnownPlace[] }`                       | `.review.complete` (ADMIN, ACCOUNTING)    |
| `POST destinations/search` `{query}` → `PlaceSearchResponse` (20/phút)           | `.review.complete` (ADMIN, ACCOUNTING)    |
| `GET :intakeId` → `SiteIntakeReviewView`                                         | `.review.read`                            |
| `GET :intakeId/bindable-orders` → đơn OPEN chưa lập kế hoạch, **cùng nơi lấy**   | `.review.complete`                        |
| `POST :intakeId/complete` `{idempotencyKey, destination?, attestOrigin?}`        | `.review.complete` (ADMIN, ACCOUNTING)    |
| `POST :intakeId/bind-order` `{orderId, idempotencyKey}`                          | `.review.complete` (ADMIN, ACCOUNTING)    |
| `POST :intakeId/exception` `{reason, idempotencyKey}`                            | `transport.site_intake.exception` (ADMIN) |

Văn phòng (giám đốc, kế toán) hoàn thiện điểm giao từ **đúng hai nguồn #379 như tài xế**: địa điểm
đã biết + tìm theo tên, qua **cùng** `SiteIntakePlaceSearchBridge` mà `complete` dùng để tìm lại và đối
chiếu. Không nhập tọa độ tự do, không lấy chữ tự do làm vị trí, không có luồng "chọn trên máy tính".

**Gắn đơn có sẵn chỉ với đơn tương thích.** `evaluateOrderBinding` có thêm lý do cuối
`ORDER_ORIGIN_MISMATCH` (`matchOrderOrigin`, hàm thuần): đơn **có** điểm lấy (#379) mà cách tâm hàng
rào đang hoạt động **gần nhất** của địa điểm tài xế đứng quá `ORDER_ORIGIN_TOLERANCE_METRES = 500` m
→ `409 SITE_INTAKE_ORDER_ORIGIN_MISMATCH`. Đơn chưa có điểm lấy: cho gắn (người chọn tường minh; cổng
không bịa tọa độ); địa điểm không có hàng rào: cho gắn (không có gì để so). `bindable-orders` lọc bằng
**cùng** hàm. 500 m cố định vì cổng và danh sách đọc cùng nguồn (chỉ tâm hàng rào): chặn lệch rõ ràng
(khác quận/tỉnh), không thay người quyết. Các lý do từ chối gắn khác vẫn là `409
SITE_INTAKE_BINDING_DENIED` (lý do cụ thể nằm trong thông điệp và `detail.reason` của quyết định).

Phân quyền được chứng minh ở tầng HTTP (`site-intake-review.authz.spec.ts`, `RolesGuard` +
`TransportActionGuard` thật, `AUTH_MODE=session`): `SALE` bị `403` trên mọi đường
`/transport/site-intakes`, kể cả với lần nhận việc của chính mình; `ACCOUNTING` bị `403` ở
`/:id/exception` nhưng được `complete`/`bind-order`; `ADMIN` được `exception`; tài xế đọc hay chọn điểm
giao cho lần nhận việc của người khác nhận `404 SITE_INTAKE_NOT_FOUND`, cùng thân với id không tồn tại.

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

## 6a. Quan sát

- Bước (`telemetry.step`): `site_intake.driver_destination`, `site_intake.office_complete`,
  `site_intake.bind_existing_order`, `site_intake.report_exception` (ngoài); `site_intake.settle`,
  `site_intake.adopt` (trong).
- `stateChange` phát **sau khi commit** (gom trong giao dịch, phát khi `withIntake` trả về; rollback
  thì không phát gì): phần thương mại `PENDING→ORDER_BOUND` (lý do = `AUTO_CREATED | OFFICE_COMPLETED |
OFFICE_EXISTING_ORDER`) và `PENDING→REJECTED`; đơn `∅→OPEN` khi tự tạo, `OPEN→CANCELLED` khi báo bất
  thường; chặng/vòng chạy `PLANNED→CANCELLED` khi hủy việc chưa chạy.
- Quyết định có mã (`site_intake.commercial`, `site_intake.exception`, `site_intake.propose/confirm`
  kèm tuổi vị trí, độ tin vị trí, lý do không dùng được) — không có tọa độ trong chi tiết.
- Telemetry `@Optional`, fail-open (bài test với sink ném lỗi chứng minh nghiệp vụ vẫn thành công).

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
- **Planner từ chối cả đơn không liên quan** khi xe còn giữ một việc tài xế nhận **chưa có đơn**
  (`PLAN_VEHICLE_HAS_PENDING_SITE_INTAKE`) — có chủ ý, thất bại đóng: văn phòng gỡ việc đó trước
  (hoàn thiện / gắn đơn / báo bất thường), rồi mới lập kế hoạch khác cho xe.
- **Không tự tạo đơn khi dữ kiện ngoài đổi**: một việc `PENDING` trở nên đủ điều kiện (vd sửa hàng rào,
  phân công xe khôi phục) vẫn nằm ở "Cần xử lý" tới khi văn phòng bấm hoàn thiện.
- `propose` **không báo trước** xe đang bận; lần từ chối `SITE_INTAKE_VEHICLE_BUSY` chỉ đến lúc bấm.
- `destinationLabel` chữ tự do của #267 vẫn được `confirmations` nhận (máy khách cũ); nó **không bao
  giờ** là sự thật điểm giao và không hiện cho văn phòng.
- Lần nhận việc trước #398 có chặng đã `COMPLETED` nhưng vòng chạy còn mở **không** được điền bù (chặng
  đã xong, không gắn đơn được nữa) — có chủ ý.
- Trigger chặng: một trigger người dùng trên bảng khác tự `UPDATE` chặng về `NULL` sẽ chạy ở độ sâu
  lớn hơn 1 và lọt; hôm nay không có trigger nào như vậy, và thêm nó cần quyền DDL (ngang quyền tắt
  trigger).
- Kiểm toán của một lần tự tạo tách hai hàng: `transport.order.create` mang `source =
DRIVER_SITE_INTAKE` + `intakeId`; `transport.site_intake.order_bound` mang `driverId`, `vehicleId`,
  `siteId`, `runId`, `legId`. Không một hàng nào mang đủ cả năm.
- `PrismaMovementRepository.bindOrderToUnboundLoadedLeg` không được gọi ở chế độ Prisma (kho phần
  thương mại adopt ngay trong giao dịch của nó); lớp trừu tượng + bản trong bộ nhớ là đường adopt thật
  của `PERSISTENCE=memory`.
- Ô tìm điểm giao của **văn phòng** chỉ có bằng chứng đơn vị (hàm thuần + controller); chưa có luồng
  E2E mở tờ xem việc (Maestro 09 dừng ở thẻ việc).
- iOS trên CI chỉ build + mở app, **không** chạy luồng nhận chuyến.
- Chromium giả lập vị trí giữ nguyên dấu giờ từ lúc đặt: bài PWA đặt lại vị trí ngay trước khi nhận
  chuyến (`freshFix`).
