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

### Ai kích hoạt

| Đường                                                | Khi nào                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `POST /transport/runs/:runId/legs/:legId/transition` | mỗi lần một chặng đổi trạng thái, phán xử chạy lại ngay sau đó |
| `POST /transport/planning/runs/:runId/closure`       | một lần **quét**, không phải một nút "đóng vòng chạy"          |

Đường thứ hai tồn tại vì một lý do cụ thể: nhánh `IDLE_TIMEOUT` không có sự kiện nào đánh thức. Nó
**không ép đóng được** — nó chạy lại đúng phán xử tất định và thi hành kết quả; gọi trên một vòng
chạy chưa đủ điều kiện trả `closed: false` kèm danh sách lý do.

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
| `GET  /transport/planning/runs/:runId/closure`            | `transport.run.read`   | không                                                 |
| `POST /transport/planning/runs/:runId/closure`            | `transport.run.manage` | có (chỉ khi phán xử cho phép)                         |
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

| Khoảng cách                                          | Vì sao chưa đóng                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CARGO_STILL_CARRIED` chưa có nguồn                  | Suy ra từ mốc vận hành của `transport-checkpoint`, mà `transport-core` **không được** phụ thuộc ngược lên capability đó                        |
| `OPEN_WAITING_SESSION` chưa có nguồn                 | `TransportDeliveryWaitingSession` (#243 F3) chưa vào `main`; thuộc Lane O                                                                      |
| `IDLE_TIMEOUT` cần một lần quét                      | Nền tảng chưa có bộ lập lịch. Cho tới lúc đó, "ai đó" là một lần quét — không phải một quyết định của kế toán                                  |
| So sánh địa điểm bằng nhãn chữ                       | Chưa có khoá địa điểm/toạ độ ở grain chặng. Lane M sở hữu phần đó                                                                              |
| Vòng chạy mồ côi khi hai yêu cầu song song cùng thua | Bản thua ở `plans.create` để lại một vòng chạy `PLANNED` rỗng việc; nó được dọn bằng đường huỷ bình thường. Cùng khuôn với `SiteIntakeService` |

Cả hai mã chặn ở hàng đầu **đã có chỗ cắm sẵn**: `RunClosureFacts.additionalBlockers` là một tham số
của hàm thuần, không phải một `@Optional()` DI không bao giờ được buộc. Khi Lane O có phiên chờ, nó
truyền mã vào đó và không một dòng nào của `run-closure.ts` phải đổi.
