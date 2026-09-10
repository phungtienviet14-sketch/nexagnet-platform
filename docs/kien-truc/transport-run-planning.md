# LẬP KẾ HOẠCH VÒNG CHẠY DO HỆ THỐNG QUẢN — Lane L (#276)

- **Chỉ thị:** Issue #276 (Lane L), điều phối bởi Issue #274 (TV2 Phase 3)
- **Nền:** [`transport-domain-v2.md`](transport-domain-v2.md) §1.1 (mô hình Order / Run / Leg của Lane A, #234)
- **Phạm vi:** `apps/api/src/transport/planning/**` + phần vòng đời **chặng** thêm vào `movement/`

> Tài liệu nền tảng: không nhắc tên khách. Khách vận tải xuất hiện ở đây chỉ dưới vai _reference
> tenant_; tham số riêng nằm ở `tenants/<slug>/tenant.json`.

---

## 0. Một câu

`TransportVehicleRun` và `TransportRunLeg` vẫn là sự thật vận hành duy nhất, nhưng **không còn là
thứ người dùng phải tự tạo và tự đóng**. Sếp/kế toán làm việc với **ĐƠN**; hệ thống suy ra vòng
chạy, chặng có hàng, chặng rỗng, và tự đóng vòng chạy khi hết việc.

```text
BOSS / ACCOUNTING
        ↓
      ORDER                     ← thứ duy nhất người dùng chạm vào
        ↓
  PlanningService               ← chính sách gom nhóm + bãi xe + chặng rỗng
        ↓
VehicleRun + RunLeg(s)          ← sự thật vận hành, hệ thống lập và hệ thống đóng
```

**Hai bất biến không được đảo:**

```text
RUN CLOSED  !=  ORDER COMPLETED
RUN CLOSED  !=  SETTLEMENT APPROVED
```

`PlanningService` không có một dòng nào chạm tới `TransportOrder.status`. Hoàn thành thương mại là
quyết định **của người**, thuộc Lane K. Nếu một ngày lớp này gọi `transitionOrder()`, hai trục đã bị
trộn lại và cổng kế toán đã bị đi vòng.

---

## 1. Lane này KHÔNG thêm mô hình vòng chạy thứ hai

Nó thêm đúng một bảng — `TransportOrderRunPlan` — trả lời ba câu mà `TransportRunLeg` không trả lời
được:

| Câu hỏi                                                                   | Vì sao chặng không trả lời được                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| _Ai đã gán đơn này vào vòng chạy này, lúc nào, theo chế độ gom nhóm nào?_ | Chặng chỉ nói "đơn X đang ở trên vòng chạy Y"                                        |
| _Một đơn có đúng một kế hoạch đang hiệu lực không?_                       | Không có chỗ nào đặt được ràng buộc đó → hai yêu cầu cùng lúc gán một đơn lên hai xe |
| _Huỷ kế hoạch rồi lập lại thì lịch sử ở đâu?_                             | Xoá chặng là mất dấu; `GD-02` cấm xoá                                                |

### Vì sao không đặt `UNIQUE` thẳng lên `TransportRunLeg.orderId`

Rẻ hơn (một index, không bảng mới) và **sai**. Khối chú thích của `TransportOrder` trong
`schema.prisma` viết rõ quan hệ đơn/chặng là **một-nhiều** (_"một đơn có thể trải trên nhiều chặng
— chuyển tải, ghép xe"_). Một unique trên `orderId` gỡ mất khả năng đó — tức lane này lặng lẽ thu
hẹp một mô hình mà lane khác đã khai.

Bảng kế hoạch cấm đúng điều #276 L3 thật sự cấm (_"one Order must never be silently attached to two
active loaded legs"_) ở đúng grain của nó: **một kế hoạch đang hiệu lực cho một đơn**. Chặng vẫn tự do.

---

## 2. Chính sách — `policies.transportPlanning`

Cấu hình của gói khách, **không** phải một nhánh `if (tenant === ...)`. Cả ba khối đều tuỳ chọn:
khai `policy: 'transportPlanning'` trong `capabilityRequirements` sẽ biến một khối hoàn toàn tuỳ
chọn thành **điều kiện boot** cho mọi khách vận tải đang chạy — đúng cái bẫy mà `transportCore` /
`transportToll` đã ghi lại.

```jsonc
"transportPlanning": {
  "runGrouping": "MULTI_ORDER_RUN",              // mặc định: ONE_ORDER_PER_RUN
  "depots": [{ "code": "DEPOT-HN", "label": "Bãi xe Hà Nội" }],
  "closure": { "idleHours": 12 }                 // mặc định: null = không đóng vì hết giờ
}
```

### 2.1. `runGrouping` — mặc định là cái KHÔNG ĐỔI GÌ

| Chế độ                           | Hành vi                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ONE_ORDER_PER_RUN` _(mặc định)_ | Mỗi đơn một vòng chạy riêng. Không bao giờ nối vào vòng chạy đang chạy — kể cả khi xe đang chạy dở |
| `MULTI_ORDER_RUN`                | Một vòng chạy mang nhiều chặng có hàng của nhiều đơn, xen kẽ chặng rỗng khi có di chuyển thật      |

#276 L1 đòi _"safe default must preserve current behavior"_. Hôm nay không khách nào có lần lập kế
hoạch nào gom hai đơn lại, nên mặc định phải là chế độ không bao giờ gom.

**Đổi chính sách chỉ ảnh hưởng lần lập kế hoạch TIẾP THEO.** `TransportOrderRunPlan.grouping` được
chốt **lúc ghi**, không đọc lại từ cấu hình khi báo cáo — một báo cáo đọc chính sách _hiện tại_ sẽ
kể lại lịch sử theo một chế độ chưa hề áp dụng.

### 2.2. `depots` — một bãi hôm nay, nhiều bãi không bị đóng cửa

#276 L5 đòi hai thứ cùng lúc: _"current tenant can have exactly one active depot"_ **và** _"data
model/API must not make future multi-depot impossible"_. Nên đây là một **mảng không giới hạn**, còn
quy tắc "đúng một bãi đang hoạt động" sống ở tầng miền (`resolveDepot()`):

| Cấu hình                 | Kết quả          | Hệ quả với kế hoạch                                                     |
| ------------------------ | ---------------- | ----------------------------------------------------------------------- |
| không khai bãi nào       | `NOT_CONFIGURED` | Không sinh chặng rỗng đầu tiên. Hợp lệ                                  |
| đúng một bãi `active`    | `RESOLVED`       | Chặng rỗng bãi → điểm lấy hàng, khi hai nhãn khác nhau                  |
| hai bãi `active` trở lên | `AMBIGUOUS`      | **Không đoán bừa.** Vẫn lập kế hoạch được, chỉ là không sinh chặng rỗng |

Bãi xe là **cơ sở vận hành của B**, không phải một `TransportCounterparty`. Khách hàng A có địa điểm
riêng (`TransportCounterpartySite`, #267 H1); hai thứ không được trộn.

### 2.3. `closure.idleHours` — KHÔNG có mặc định, và đó là câu trả lời trung thực

Không nguồn nào nói một chiếc xe nghỉ bao lâu thì coi là hết vòng chạy — khách chưa trả lời. #276 L4
cho phép một quy tắc đóng theo thời gian nghỉ rồi ràng buộc ngay: _"do not invent a financial
meaning ... use a clearly synthetic preview value, not a hidden magic constant."_

Nên: **không khai = không bao giờ đóng vì hết giờ**; chỉ còn đường đóng khi xe về bãi. Gói xem trước
(`tenants/transport-preview`) khai `idleHours: 12` và tài liệu này nói rõ đó là **giá trị tổng hợp
của bản xem trước**, không phải con số của khách.

---

## 3. Chặng rỗng — chỉ khi có di chuyển thật

Một lần lập kế hoạch sinh ra **nhiều nhất hai chặng**:

```text
[EMPTY]  <điểm kết thúc trước đó> → <điểm lấy hàng>     ← chỉ khi hai nhãn KHÁC nhau
[LOADED] <điểm lấy hàng>          → <điểm giao hàng>     ← luôn có
```

Ba nguồn của "điểm kết thúc trước đó", và chúng không thay thế nhau được:

| Nguồn                      | Khi nào                           | Không có thì                  |
| -------------------------- | --------------------------------- | ----------------------------- |
| `DEPOT`                    | vòng chạy mới + khách có khai bãi | —                             |
| `PREVIOUS_LEG_DESTINATION` | nối vào vòng chạy đang chạy       | —                             |
| `ORDER_ORIGIN`             | không biết xe đang ở đâu          | **Không sinh chặng rỗng nào** |

**KHÔNG sinh chặng rỗng về bãi ở cuối.** #276 L2 viết đúng chữ: _"Do not fabricate a
return-to-depot leg just to close the Run."_ Xe có về bãi hay không là một sự thật vận hành sẽ được
ghi khi nó xảy ra, không phải một dòng mà báo cáo cần.

**So sánh địa điểm** hôm nay là so chuỗi đã chuẩn hoá (bỏ khoảng thừa, gộp khoảng trắng, không phân
biệt hoa/thường). **Không bỏ dấu**: bỏ dấu sẽ gộp "Ha Noi" và "Hà Nội" thành một — một phép đoán về
địa lý mà lane này không có nguồn. Sai theo hướng _không gộp_ an toàn hơn: nó sinh một chặng rỗng
thừa mà người đọc nhìn thấy và sửa được, thay vì nuốt mất một di chuyển thật. Khi Lane M mang về
khoá địa điểm/toạ độ thật, `sameSite()` đổi hiện thực — không đổi chữ ký.

---

## 4. Đã đi vs Dự định (#276 L6)

Hai cột, và một quy tắc đọc **không đối xứng**:

| Cột                                 | Nghĩa                                                   | Ai ghi                                                          |
| ----------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `TransportRunLeg.distanceKm`        | quãng đường **đã ghi nhận** (`GD-14`, nhập tay/odo/GPS) | vận hành, thường **sau** khi chặng đóng                         |
| `TransportRunLeg.plannedDistanceKm` | quãng đường **dự kiến**                                 | khâu lập kế hoạch, sau này là nhà cung cấp dẫn đường của Lane M |

`summariseRunMovement()` trả **hai ô**:

- `actual` — chỉ đếm chặng `COMPLETED`, và **chỉ đọc `distanceKm`**. Một ước lượng không bao giờ trở
  thành quãng đường đã đi chỉ vì chặng đó đóng lại.
- `planned` — đếm chặng `PLANNED`/`IN_TRANSIT`, đọc `plannedDistanceKm ?? distanceKm`. Chiều này
  _có_ nhận cả số ghi tay, và đó là đúng: một con số nhập trên chặng chưa chạy xong vẫn chỉ là kỳ vọng.

Chặng `CANCELLED` **không vào ô nào**, được đếm riêng ở `cancelledLegs`. `null` vẫn là _chưa biết_,
không phải 0 — và khi còn một chặng thiếu km thì `emptyRatio` trả `null` thay vì một con số rỗng.

`summariseRunDistance()` (`GET /transport/runs/:id/distance`) **giữ nguyên hình dạng và ý nghĩa cũ**.
Sửa nó để trả cả hai ô sẽ làm mọi độc giả đang có nhận một con số mang ý nghĩa khác.

---

## 5. Vòng đời chặng — thứ Lane A chưa có

Trước lane này `setLegStatus()` **không có người gọi nào**: một chặng được tạo ra rồi nằm mãi ở
`PLANNED`. Thiếu đó làm cả §6 không thể có — một vòng chạy không bao giờ "hết việc" thì không bao giờ
đóng được.

```text
PLANNED --> IN_TRANSIT --> COMPLETED
   |
   +--> CANCELLED
```

- **Không có cạnh `PLANNED → COMPLETED`**: một chặng chưa bao giờ bắt đầu mà "hoàn thành" được thì
  `startedAt` sẽ mãi `null`, và mọi phép đo thời gian chạy sau này phải đoán xem cột đó vắng vì
  chặng không chạy hay vì ai đó bấm tắt.
- **Không có cạnh `IN_TRANSIT → CANCELLED`**: chặng đã lăn bánh là một di chuyển **có thật**; huỷ nó
  làm quãng đường đó biến mất khỏi mọi báo cáo — tức biến một lần bấm thành một cách xoá km rỗng.
- **Chặng đầu lăn bánh thì vòng chạy tự sang `ACTIVE`.** Bắt sếp bấm "bắt đầu vòng chạy" chính là
  thao tác quản lý vòng chạy mà cả phase này đi bỏ.

`COMPLETED` được khoá **hai lớp**: cổng ở tầng miền (`evaluateLegTransition`) và
`transport_run_leg_completed_is_immutable` dưới Postgres — trigger chặn cả một câu `UPDATE` viết tay
trên psql. Bảy cột bị khoá; `distanceKm`, `plannedDistanceKm` và `note` **cố ý** không bị khoá, vì
chúng về sau khi chặng đã đóng.

---

## 6. Đóng vòng chạy — tất định, không ai bấm

`evaluateRunClosure()` là hàm **thuần**, không có tham số nào tên `force`, và không nhận một ý muốn
nào của người dùng.

**Điều kiện chặn** (còn bất kỳ cái nào thì không đóng):

| Mã                     | Nghĩa                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `RUN_NOT_ACTIVE`       | vòng chạy chưa chạy hoặc đã ở điểm cuối                                                |
| `LEG_STILL_OPEN`       | còn chặng `PLANNED`/`IN_TRANSIT`                                                       |
| `PLAN_STILL_OPEN`      | còn kế hoạch chưa huỷ mà chặng có hàng chưa kết thúc                                   |
| `NO_COMPLETED_WORK`    | chưa chặng nào hoàn thành — đóng một vòng chạy chưa làm gì là xoá nó bằng một tên khác |
| `CARGO_STILL_CARRIED`  | _(nạp từ ngoài)_ xe còn hàng trên thùng                                                |
| `OPEN_WAITING_SESSION` | _(nạp từ ngoài)_ còn phiên chờ người nhận                                              |

**Ba trạng thái đầu ra, không phải hai:**

```text
closable            → trigger nói vì sao đóng
blockers != []      → còn việc đang chạy. KHÔNG đóng
holding             → hết việc rồi nhưng chưa đến điều kiện đóng. KHÔNG phải lỗi
```

Gộp `holding` vào `blockers` sẽ làm một trạng thái bình thường của đội xe (xe xong hàng, chưa về bãi)
trông như một sự cố, và bảng điều hành sẽ đỏ rực lên mỗi buổi chiều.

**Hai điều kiện đóng:**

| Trigger        | Khi nào                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| `DEPOT_RETURN` | chặng hoàn thành sau cùng kết thúc **tại bãi đã khai**                          |
| `IDLE_TIMEOUT` | xe dừng việc xa bãi quá `closure.idleHours` — chỉ chạy khi khách có khai ngưỡng |

"Chặng hoàn thành sau cùng" đọc theo `completedAt` (đồng hồ **máy chủ**), và **`sequence` để phá
hoà**: hai chặng đóng trong cùng một mili giây sẽ hoà, và khi đó thứ tự đọc của kho sẽ quyết định
"xe đang ở đâu" — với một vòng chạy hai chặng, đó là khác biệt giữa _xe ở cảng_ và _xe ở kho_.

### Ai kích hoạt — `#293` Lane R

> ⚠️ **Cập nhật 10/09/2026 (`#293`).** Mục này đã đổi. `POST /transport/planning/runs/:runId/closure`
> **đã bị gỡ bỏ**: nó không ép đóng được, nhưng nó vẫn là một lần **bấm của người** làm vòng chạy
> chuyển sang `COMPLETED`, và câu hỏi `#293` R1 đặt ra là *"có phải bấm không"* — câu trả lời phải
> là không. Cùng lúc đó, `POST /transport/runs/:id/transition` **không còn nhận `COMPLETED`**: máy
> trạng thái từ chối bằng `RUN_COMPLETE_REQUIRES_SYSTEM_PATH`, đối xứng với
> `RUN_CANCEL_REQUIRES_DEDICATED_PATH`. Đường duy nhất dẫn tới `COMPLETED` là
> `MovementService.closeRunAsSystem()`, và nó không nhận `to`.

Mọi lần phán xử đi qua **một** đường ứng dụng: `RunClosureService` (`planning/run-closure.service.ts`).

| Đường                                                | Khi nào                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `POST /transport/runs/:runId/legs/:legId/transition` | mỗi lần một chặng đổi trạng thái — `LEG_CHANGED`                |
| `POST /transport/runs/:runId/legs/:legId/cancel`     | chặng bị huỷ — `LEG_CHANGED`                                    |
| `POST /transport/planning/plans/:planId/cancel`      | kế hoạch cuối bị gỡ — `PLAN_CANCELLED`                          |
| `RunClosureSweepScheduler`                           | `IDLE_SWEEP`, và `BACKSTOP_SWEEP` cho sự kiện đã thất lạc        |

`RunClosureService` gom ba việc vào một chỗ mà trước đây mỗi controller phải tự nhớ: hỏi **nguồn sự
thật bên ngoài** (`RunClosureBlockerSource`), **fail-closed** khi nguồn đó hỏng, và ghi sổ quyết định.

**Luồng quét** (`sweep()`) là cơ chế bền vững cho nhánh không có sự kiện nào đánh thức:

- chạy trong tiến trình `api` (không phải tiến trình worker), bật mặc định, tắt bằng
  `TRANSPORT_RUN_CLOSURE_SWEEP=off`;
- tập ứng viên suy ra **từ sự thật nguồn** mỗi lượt (`ACTIVE`, mọi chặng đã ở trạng thái cuối, lần
  hoàn thành muộn nhất đã cũ hơn cửa sổ) — **không có con trỏ sống nào**, nên tiến trình chết giữa
  hai lượt quét không làm mất gì;
- cửa sổ ứng viên = `min(idleHours, 2 phút)`. Hai phút là **đường bảo hiểm cho nhánh về bãi**: nếu
  sự kiện `LEG_CHANGED` thất lạc, vòng chạy vẫn được phán xử lại thay vì nằm chờ tới hết nguồn nghỉ;
- **có trần** `sweep.batchSize` (mặc định 50), nhịp `sweep.intervalSeconds` (mặc định 60) — hai số
  **vận hành**, cấu hình được theo khách, và **không** phải nguồn nghỉ nghiệp vụ (`closure.idleHours`
  vẫn là con số duy nhất quyết định một vòng chạy có được đóng hay không);
- khách không khai `idleHours` thì lượt quét **vẫn chạy** nhưng không bao giờ đóng một chiếc xe đang
  ở xa bãi: nó giữ nguyên `holding`.

**Không đóng hai lần dưới hai worker.** `evaluateRunClosure()` chỉ là *phán xử*; lớp chặn thật là
`MovementRepository.completeRunIfActive()` — một `UPDATE ... WHERE status = 'ACTIVE'` trả về số hàng
đã đổi. Người thua cuộc nhận `transitioned: false` và **không** ghi thêm một dòng
`transport.run.close.system` nào.

**Ứng viên phải là "có thể đóng được", không chỉ "đã xong việc".** Một trang chỉ có `batchSize`
chỗ, và một ứng viên không đóng được sẽ quay lại lượt sau với nguyên `updatedAt` cũ — tức nằm mãi ở
đầu trang, và những vòng chạy phía sau **không bao giờ được nhìn tới**. Đó là một cách hỏng im lặng.
Nguy hiểm nhất là những vòng chạy không bao giờ đóng được bằng thời gian: khách không khai
`closure.idleHours` thì một chiếc xe xong việc ở **xa bãi** nằm nguyên ở `holding` mãi mãi (đúng như
thiết kế). Nên khi khách chưa khai ngưỡng nghỉ, ứng viên bị thu hẹp về những vòng chạy **có thể** đóng
được: một chặng đã hoàn thành kết thúc tại bãi đang hoạt động. Phép lọc là so sánh chuỗi thẳng, không
`sameSite()` — hai bản hiện thực của cùng một kho phải cùng **một** luật, và lệch nhãn chỉ làm **bỏ
sót** một ứng viên (đường sự kiện vẫn đóng nó ngay), không bao giờ làm đóng bừa.

### Vì sao nền tảng này KHÔNG dùng Hatchet cho lượt quét

`OWNER_ARCHITECTURE_CLARIFICATION_2026_09_10` xếp Hatchet là **ưu tiên** cho đường bền vững, và nói
rõ: *"If an already-accepted bounded durable mechanism proves better for a measured case, keep it."*
Đây là phép đo cho trường hợp của lane này.

| Câu hỏi | Đo được |
| --- | --- |
| Hatchet có phải hạ tầng bắt buộc? | **Không.** `WORKFLOW_ENGINE=on` **và** khách khai `integrations.workflowEngine` mới bật (`workflow-engine-switch.ts`). Mặc định là `DisabledWorkflowEngineAdapter`. |
| Nếu chỉ dùng Hatchet thì sao? | Mọi khách không bật engine **không bao giờ** đóng được vòng chạy xa bãi. Một năng lực phải chạy cho mọi khách vận tải không được phụ thuộc vào hạ tầng tuỳ chọn. |
| Trạng thái đóng nằm ở đâu? | **Postgres.** Timer chỉ đánh thức; tập ứng viên được suy lại từ sự thật nguồn mỗi lượt. Không có con trỏ nào sống trong tiến trình. |

Kết luận: giữ cơ chế đã được repo chấp nhận (`setInterval` + `.unref()` + trạng thái trong DB, đúng
khuôn `CampaignScheduler`/`WorkflowScheduler`), và **không** dựng thêm một đường Hatchet chỉ để có
Hatchet. Đổi lại, đây là hai điều phải nói thẳng:

- đây **không** phải một `durable wait` cấp từng thực thể; nó là một lượt quét có trần, và tính bền
  của nó đến từ việc **suy lại từ Postgres**, không từ engine;
- nếu sau này khách bật engine và cần một lần đánh thức đúng hạn cho từng vòng chạy, đường
  `WorkflowOutbox` → Hatchet `durableTask`/`sleepFor` đã có sẵn khuôn để nối vào **cùng** hàm phán
  xử này. Việc đó không được phép sinh ra đường ghi thứ hai.

---

## 7. Bề mặt HTTP — Lane M tiêu thụ được (#276 L7)

Mọi đường **ghi** đều bắt đầu bằng một **đơn**, không bằng một vòng chạy.

| Đường                                                     | Quyền                  | Ghi?                                                  |
| --------------------------------------------------------- | ---------------------- | ----------------------------------------------------- |
| `GET  /transport/planning/policy`                         | `transport.run.read`   | không                                                 |
| `GET  /transport/planning/orders/:orderId/plans`          | `transport.run.read`   | không                                                 |
| `POST /transport/planning/orders/:orderId/preview`        | `transport.run.read`   | **không** — xem trước tuyệt đối không có tác dụng phụ |
| `POST /transport/planning/orders/:orderId/plan`           | `transport.run.manage` | có                                                    |
| `POST /transport/planning/plans/:planId/cancel`           | `transport.run.manage` | có                                                    |
| `GET  /transport/planning/vehicles/:vehicleId/projection` | `transport.run.read`   | không                                                 |
| `GET  /transport/planning/runs/:runId/closure`            | `transport.run.read`   | không — chỉ đọc, xem chú thích dưới                   |
| `GET  /transport/runs/:id/movement`                       | `transport.run.read`   | không                                                 |
| `POST /transport/runs/:runId/legs/:legId/transition`      | `transport.run.manage` | có                                                    |
| `POST /transport/runs/:runId/legs/:legId/cancel`          | `transport.run.manage` | có                                                    |

`idempotencyKey` là **bắt buộc** ở đường chốt. Không có khoá thì không có gì để nhận ra lần thứ hai
là lần thứ hai, và #276 L9 bài 1 không thể đạt được.

`vehicles/:vehicleId/projection` là nguồn Lane M cần: xe sẽ dừng ở đâu, và từ bao giờ nó hết việc.
`freeFrom` **cố ý** để `null` khi còn chặng chưa chạy xong — đoán giờ rảnh của một chiếc xe đang trên
đường đòi một phép tính đường đi mà lane này không có nguồn, và một con số đoán trông y hệt một con
số đo được.

---

## 8. Ràng buộc ở tầng lưu trữ

Ba cổng của lane này đều có **hai lớp**: một cổng ở tầng miền và một ràng buộc ở tầng kho. Lớp thứ
hai tồn tại vì một đoạn mã dịch vụ chỉ chứng minh được rằng _đường đó_ không sai — không chứng minh
được rằng không còn đường nào khác.

| Ràng buộc                                                                                             | Chặn cái gì                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `TransportOrderRunPlan_activeOrder_key` _(unique một phần, `WHERE cancelledAt IS NULL`)_              | hai yêu cầu cùng lúc gán một đơn lên hai xe                       |
| `TransportOrderRunPlan_oneOrderPerRun_key` _(unique một phần, thêm `grouping = 'ONE_ORDER_PER_RUN'`)_ | chế độ một-đơn nhận kế hoạch thứ hai trên một vòng chạy           |
| `TransportOrderRunPlan_idempotencyKey_key`                                                            | hai lần bấm cùng khoá thành hai kế hoạch                          |
| `transport_run_leg_completed_is_immutable` _(trigger)_                                                | viết lại một chặng đã hoàn thành                                  |
| `TransportRunLeg_planned_distance_non_negative`                                                       | km dự kiến âm (`NULL` vẫn hợp lệ = _chưa biết_)                   |
| `TransportOrderRunPlan_legs_distinct`                                                                 | chặng rỗng và chặng có hàng của cùng một kế hoạch là **một** hàng |
| `TransportOrderRunPlan_cancellation_paired`                                                           | huỷ mà không có lý do                                             |

Migration `20260911140000_transport_run_planning` **chỉ thêm**: hai enum, một bảng, một cột nullable
trên `TransportRunLeg`, một `CHECK` trên chính cột mới đó, và một trigger. Không cột nào đổi kiểu,
không ràng buộc nào bị gỡ. Đường lui nằm ở `README-rollback.sql` cùng thư mục.

---

## 9. Khoảng cách đã ghi tên

> ⚠️ **Cập nhật 10/09/2026 (`#293` Lane R).** Hai hàng đầu và hàng thứ ba đã đóng lại; bảng dưới
> giữ nguyên hàng cũ kèm trạng thái mới, để người đọc sau thấy được cái gì đã đổi và cái gì chưa.

| Khoảng cách                                          | Trạng thái                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CARGO_STILL_CARRIED` chưa có nguồn                  | **ĐÃ ĐÓNG.** `CheckpointRunClosureBlockerSource` suy ra nó từ `buildRunTimeline()` của `#243` F6 (giai đoạn `LOADING`/`IN_TRANSIT`/`ARRIVED` = hàng còn trên thùng). `transport-core` vẫn không phụ thuộc ngược: cổng `RunClosureBlockerSource` do `transport-core` khai, `transport-checkpoint` ghi đè ở tầng composition |
| `OPEN_WAITING_SESSION` chưa có nguồn                 | **CHỜ LANE O.** Cổng đã có và đã kiểm bằng adapter giả; `TransportDeliveryWaitingSession` (#243 F3) vẫn chưa vào `main`, và lane này **không** dựng một bảng giả. Xem `WAITING_SESSION_BINDING` ở báo cáo cuối lane                                                                                                              |
| `IDLE_TIMEOUT` cần một lần quét                      | **ĐÃ ĐÓNG.** `RunClosureSweepScheduler` + `RunClosureService.sweep()` — bền vững, có trần, khôi phục được sau khi tiến trình chết, và không đóng hai lần dưới hai worker                                                                                        |
| So sánh địa điểm bằng nhãn chữ                       | **CÒN.** Chưa có khoá địa điểm/toạ độ ở grain chặng. Lane M sở hữu phần đó                                                                                                                                                                                     |
| Vòng chạy mồ côi khi hai yêu cầu song song cùng thua | **CÒN.** Bản thua ở `plans.create` để lại một vòng chạy `PLANNED` rỗng việc; nó được dọn bằng đường huỷ bình thường. Cùng khuôn với `SiteIntakeService`                                                                                                       |

### Nguồn sự thật bên ngoài — cổng, không phải một DI tuỳ nghi

`RunClosureFacts.additionalBlockers` vẫn là một tham số của hàm thuần. Cái mới của `#293` R4 là một
**cổng chỉ đọc** để lấp nó ở tầng ứng dụng:

```ts
RunClosureBlockerSource.blockersForRun(runId) -> RunClosureBlocker[]
```

Ba tính chất, và cả ba đều được kiểm:

1. **Chỉ đọc.** Một phương thức, không `record()`, không `clear()` — một cổng đọc mà ghi được sẽ sớm
   thành chỗ "tạm gỡ vật cản ra".
2. **Fail-closed.** Nguồn ném → `EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE`; nguồn trả về thứ không đọc
   được → `EXTERNAL_BLOCKER_SOURCE_AMBIGUOUS`. Cả hai là **mã chặn thật**, đi qua đúng con đường mà
   mọi mã chặn khác đi, và hiện lên bảng điều hành. Không bao giờ trả `[]` khi có sự cố: `[]` nghĩa
   là *"đã hỏi, và không có gì chặn"*.
3. **Vắng mặt là một câu trả lời hợp lệ.** Khách không bật `transport-checkpoint` nhận
   `NoRunClosureBlockerSource` — không có cổng nào để hỏi, khác hẳn với hỏi rồi nhận về "không chặn".
