# NGHIỆM THU CHỨNG TỪ / THƯƠNG MẠI — cổng điều kiện đối soát (Lane I)

- **Ngày lập:** 08/09/2026
- **Mốc:** `TV2 PHASE2B / LANE I`
- **Đo trên:** `origin/main` = `571e1acbda3e5dbc12001a73c02ae41af54d4d1b`
- **Chỉ thị:** Issue #268 (hợp đồng lane) · điều phối #266 · cha #241 / #229
- **Nguồn phụ thuộc:** #243 Lane F (F1 mốc vận hành đã merge, F2 chứng từ CHƯA merge) · #223 File Platform (CHƯA merge)

> **Tài liệu nền tảng — không nhắc tên khách.** Công ty B xuất hiện ở đây dưới vai _reference
> tenant_; tham số riêng nằm ở `tenants/<slug>/`.

---

## 0. Câu một dòng

`Vận hành XONG` và `chứng từ ĐƯỢC NGHIỆM THU` là **hai trục khác nhau**. Trục thứ hai chưa tồn tại
trên `main`, và vì nó chưa tồn tại nên **không có cổng nào** chặn một công việc chạy xong nhưng
chưa có chứng từ A xác nhận đi vào một kỳ đối soát mới.

Lane I dựng đúng trục thứ hai, và cắm nó vào **một** điểm: đường ghi nhận công nợ của
`transport-settlement`.

---

## 1. I0 — SỰ THẬT ĐO ĐƯỢC TRÊN `main`

### 1.1 Hai mô hình vận hành cùng tồn tại

| Trục                               | Thực thể                                                     | Trạng thái                                      | Ai đóng                     | Tệp                              |
| ---------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- | --------------------------- | -------------------------------- |
| v1 (cũ, **là hạt của quyết toán**) | `TransportTrip`                                              | `PLANNED → IN_TRANSIT → DELIVERED → RECONCILED` | `transport.trip.transition` | `trips/trip-lifecycle.ts`        |
| v2 (mới, **là hạt của vận hành**)  | `TransportOrder` / `TransportVehicleRun` / `TransportRunLeg` | Run: `PLANNED → ACTIVE → COMPLETED`             | `transport.run.manage`      | `movement/movement-lifecycle.ts` |

Nối hai trục: `TransportTripRunLegLink` — khoá chính là `tripId`, và `legId` là `@unique`. Nghĩa là
**một chuyến v1 ứng với TỐI ĐA MỘT chặng, tức tối đa MỘT vòng chạy**. Phép chiếu
(`planTripProjection`) **từ chối** hai trường hợp: chuyến thuê xe ngoài (`PROJECTION_TRIP_OUTSOURCED`)
và chuyến chưa gán xe (`PROJECTION_TRIP_HAS_NO_VEHICLE`). Chuyến `EXTERNAL_CARRIER` vì vậy
**không bao giờ có vòng chạy**.

### 1.2 Mốc vận hành (Lane F / F1) — đã merge, KHÔNG đổi trạng thái vòng chạy

`TransportRunCheckpoint` là **từ vựng quan sát**, chỉ ghi thêm. `CheckpointService` **đọc**
`run.status` để biết vòng chạy đã ở điểm cuối chưa, và **không ghi** vào nó. Nên hôm nay:

```text
checkpoint COMPLETED   ≠   TransportVehicleRun.status = COMPLETED
```

Hai thứ đó độc lập. Cả hai đều **không** dẫn tới một cổng tài chính nào.

### 1.3 Đường vào quyết toán — đo đầy đủ, không suy đoán

`SETTLEMENT_SOURCE_CONTEXTS` có **năm** nguồn. Ba nguồn bắt nguồn từ _chuyến hoàn thành_:

| `sourceContext`           | Hàm sinh                                                    | Cổng đang có                                                          | Ghi chú                              |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| `TRIP_RECONCILED`         | `SettlementService.recogniseCustomerReceivable(tripId)`     | `trip.status === 'RECONCILED'` + có `freightAmount` + có `customerId` | Công nợ khách — **B thu tiền của A** |
| `TRIP_CARRIER_COST`       | `SettlementService.recogniseCarrierPayable(tripId, amount)` | `trip.kind === 'EXTERNAL_CARRIER'` + có `carrierPartnerId`            | B **trả** nhà xe ngoài               |
| `TRIP_COMMISSION`         | `SettlementService.recogniseCommission(tripId)`             | `trip.kind === 'PARTNER_REFERRED_INTERNAL_RUN'` + có `freightAmount`  | B **trả** hoa hồng                   |
| `FUEL_SETTLEMENT_HANDOFF` | `SettlementService.ingestFuelHandoff(...)`                  | bàn giao của `TX-04`                                                  | **Không** bắt nguồn từ chuyến        |
| `MANUAL_ADJUSTMENT`       | kế toán nhập tay                                            | —                                                                     | **Không** bắt nguồn từ chuyến        |

**Chống ghi trùng đã có sẵn:** `@@unique([sourceContext, sourceId])` trên
`TransportSettlementDocument`, cộng `sourceFingerprint` để phát hiện "cùng khoá, khác nội dung".
Lane I **không** dựng cơ chế idempotency thứ hai.

**Sự thật quan trọng nhất của I0:** `SettlementService.recognise*` **chưa có một route HTTP nào**.
`transport-actions.ts` ghi rõ điều đó: _"`TX-05` đi vào HTTP ở T7 và KHÔNG mang một mã GHI nào"_.
Bốn hàm ghi nhận chỉ gọi được từ trong tiến trình. Hệ quả trực tiếp cho I8: **không có API/UI được
hỗ trợ nào để "tạo một ứng viên quyết toán mới"** — bằng chứng runtime phải được đọc lại theo đúng
sự thật đó (xem §5).

### 1.4 Phân quyền — đo trước khi thiết kế

`transport-actions.ts` khai một danh sách hành động có kiểu, và bảng vai:

```text
ADMIN       = OPERATIONS_ACTIONS                                   (tất cả trừ phạm vi tự thân)
ACCOUNTING  = OPERATIONS_ACTIONS  trừ  ACCOUNTING_DENIED
SALE        = SELF_SCOPE_ACTIONS                                   (vai as-built của LÁI XE)
MANAGER     = []                                                   (fail-closed, cố ý)
```

`OPERATIONS_ACTIONS` được **suy ra** bằng phép trừ, nên **một hành động mới được cấp tự động cho
ADMIN và ACCOUNTING, và tự động KHÔNG cấp cho lái xe/`MANAGER`**. Đó đúng là chính sách I3 yêu cầu,
và nó đến từ cấu trúc chứ không từ một dòng cấu hình phải nhớ.

**Tách nhiệm vụ (I3) — ĐÃ ĐÚNG TRÊN `main`, không phải điều Lane I phải sửa.** `ACCOUNTING_DENIED`
đã có sẵn ba mã quan trọng nhất:

| Mã bị từ chối cho ACCOUNTING  | Ý nghĩa với Lane I                                                  |
| ----------------------------- | ------------------------------------------------------------------- |
| `transport.checkpoint.record` | Kế toán **không ghi được mốc** mà chính họ nghiệm thu               |
| `transport.proof.withdraw`    | Kế toán **không rút được chứng cứ** đang bị đối soát                |
| `transport.geofence.manage`   | Kế toán không đổi được phán quyết hàng rào của các lần giao đã xong |

Chú thích ngay trong `transport-actions.ts` đã nói đúng lý lẽ của I3 bằng lời của Lane F:
_"nếu người DUYỆT khoản tiền đó cũng sửa được căn cứ sinh ra nó thì cổng duyệt không còn ý nghĩa"_.

⇒ **Không có mâu thuẫn phải STOP.** Điều kiện I3 (_"If current role/action maps place
`checkpoint.record`, proof mutation or file withdrawal in ACCOUNTING, STOP"_) **không xảy ra**.

Điều Lane I phải **giữ**: khi F2 hạ cánh và mang theo một mã kiểu `transport.run_document.withdraw`,
mã đó **phải** vào `ACCOUNTING_DENIED`. Lane I khoá điều đó bằng một bài kiểm tra (§4).

### 1.5 Khuôn "quyết định chỉ-ghi-thêm" đã có sẵn trong repo

`TransportExpenseClaim` + `TransportExpenseClaimDecision` (#232 `D-06`) là **đúng khuôn** I1 mô tả:

- bảng chủ thể giữ trạng thái hiện tại (`status`) + con trỏ tổng hợp;
- bảng quyết định `@@unique([claimId, sequence])`, `decidedBy`, `decidedAt`, `reasonCode` **có kiểu**,
  không có đường sửa/xoá nào ở tầng kho.

Lane I **dùng lại khuôn này**, không phát minh khuôn thứ hai.

### 1.6 Chứng cứ / chứng từ — biên giới hiện tại

| Có trên `main`                                               | Chưa có trên `main`                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `TransportOperationalProof` + `TransportProofPhoto` (Lane B) | `TransportRunDocument` (GATE_PASS / LOADING_SLIP / WEIGH_TICKET / **`DELIVERY_RECEIPT`**) — **F2 của #243** |
| `TransportFuelReceiptEvidence` (Lane C)                      | File Platform #223 (`apps/api/src/files` **không tồn tại**)                                                 |
| Quy ước `evidenceLocator` — khoá đục trong kho tệp           | —                                                                                                           |

⇒ I2 phải chạy như hợp đồng viết: **cổng chỉ-đọc hẹp** trước, **ràng buộc thật vào `DELIVERY_RECEIPT`
sau khi F2 được chấp nhận vào `main`**. Không dựng bảng chứng từ tạm. Không nhân bản File Platform.

---

## 2. BẢN ĐỒ ba mảnh mà I0 yêu cầu

```text
NGUỒN HOÀN THÀNH VẬN HÀNH
  TransportVehicleRun.status = COMPLETED          (movement-lifecycle.ts)
  + TransportRunCheckpoint COMPLETED              (checkpoint-lifecycle.ts, Lane F F1)
  + [sau F2] chứng từ DELIVERY_RECEIPT
        │
        │  nối bằng TransportTripRunLegLink (tripId → legId → runId), tối đa MỘT
        ▼
ĐIỂM VÀO QUYẾT TOÁN HIỆN TẠI
  SettlementService.recogniseCustomerReceivable(tripId)   → TRIP_RECONCILED
  SettlementService.recogniseCommission(tripId)           → TRIP_COMMISSION
  SettlementService.recogniseCarrierPayable(tripId, amt)  → TRIP_CARRIER_COST   [B không vận hành]
  SettlementService.ingestFuelHandoff(...)                → FUEL_SETTLEMENT_HANDOFF [ngoài phạm vi]
        │
        ▼
ĐIỂM CẮM CỔNG NGHIỆM THU MỚI  ◀── Lane I
  SettlementAcceptanceGate  (cổng CHỈ-ĐỌC, khai trong transport-settlement)
  hỏi đúng một câu: "vòng chạy nối với chuyến này đã được nghiệm thu chứng từ chưa?"
```

**Không có sổ tài chính thứ hai. Không có máy trạng thái mốc thứ hai. Không có bảng chứng từ thứ hai.**

---

## 3. QUYẾT ĐỊNH THIẾT KẾ

### 3.1 Hạt của nghiệm thu = VÒNG CHẠY (`TransportVehicleRun`)

Vì đó là nơi _hoàn thành vận hành_ thật sự sống trong mô hình v2 đã được chấp nhận, là nơi mốc F1
gắn vào, và là nơi chứng từ F2 sẽ gắn vào. #268 nói đúng chữ đó: _"create/use one synthetic run that
reaches operational `COMPLETED` with delivery receipt/evidence → verify acceptance = `PENDING`"_.

Chuyến v1 vẫn là **hạt của quyết toán**; cổng nối hai hạt bằng `TransportTripRunLegLink` đã có.

### 3.2 KHÔNG có hàng nào cho tới khi có quyết định đầu tiên — "vắng mặt = `PENDING`"

`PENDING` là **suy ra**, không phải một hàng phải ghi:

```text
không có hàng nghiệm thu  ⇒  PENDING  ⇒  KHÔNG đủ điều kiện đối soát
```

Ba lý do, và cả ba đều là lý do an toàn:

1. **Không phải cắm một đường ghi vào luồng vận hành.** Lane I không sửa `MovementService`, không
   sửa `CheckpointService`, không đụng lịch sử mốc của Lane F — đúng điều #266 cấm.
2. **Fail-closed theo mặc định.** Vắng mặt không bao giờ đọc thành "đã duyệt".
3. **Không cần backfill.** #268 cấm _"a mass fake `APPROVED by system`"_; thiết kế này làm cho việc
   backfill trở thành không cần thiết chứ không phải bị cấm bằng kỷ luật.

### 3.3 Cổng KHÔNG chạy khi chứng từ quyết toán đã tồn tại

Đây là điều kiện tương thích lịch sử, viết thành mã chứ không thành lời hứa:

```text
nếu đã có TransportSettlementDocument cho (sourceContext, sourceId)
    ⇒ đây KHÔNG phải một lần chọn nguồn MỚI
    ⇒ cổng KHÔNG áp dụng, đường phát-lại idempotent cũ giữ nguyên hành vi
```

Thiếu điều kiện này, một lần gọi lại vô hại trên một chuyến **đã quyết toán từ trước tính năng** sẽ
ném lỗi thay vì trả về chứng từ cũ — tức chính là _"retroactively invalidate"_ mà #268 cấm.

### 3.4 Phân loại BA đường theo nguồn, có mã lý do

| Đường                                          | Có cổng?                                        | Lý do                                                                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRIP_RECONCILED` (thu của khách)              | **CÓ**                                          | Đây đúng là "công việc B đã chạy, B đòi tiền A". Quy trình chủ sở hữu mô tả áp vào đây                                                                                                                              |
| `TRIP_COMMISSION` (trả hoa hồng)               | **CÓ**                                          | Chuyến `PARTNER_REFERRED_INTERNAL_RUN` chạy bằng **xe của B**, nên có vòng chạy và có biên nhận giao hàng                                                                                                           |
| `TRIP_CARRIER_COST` (trả nhà xe ngoài)         | **KHÔNG** — `ACCEPTANCE_CARRIER_PATH_NOT_GATED` | Xe **không phải của B**; không có lái xe của B nào cầm biên nhận về. Phép chiếu v2 **cấu trúc** không tạo vòng chạy cho `EXTERNAL_CARRIER`. Cắm cổng ở đây là chặn cứng một đường đang chạy để đổi lấy con số không |
| `FUEL_SETTLEMENT_HANDOFF`, `MANUAL_ADJUSTMENT` | **KHÔNG**                                       | Không bắt nguồn từ chuyến hoàn thành                                                                                                                                                                                |

### 3.5 Chuyến KHÔNG có vòng chạy nối vào — `ACCEPTANCE_NOT_APPLICABLE`

Một chuyến v1 chưa từng được chiếu sang v2 thì **không có** vòng chạy, **không có** mốc, **không có**
biên nhận giao hàng — nó là hình dạng v1 thuần tuý, và nó vẫn đi qua cổng thủ công cũ của chính nó
(`DELIVERED → RECONCILED`, đòi `transport.trip.transition`).

Cổng ghi một quyết định **có mã, đọc được trong trace** thay vì im lặng đi qua.

> ⚠️ **GIỚI HẠN ĐÃ BIẾT — báo cáo, không che.** Đường v1 thuần tuý **không** được cổng mới siết
> thêm. Nó không phải một lỗ mới do Lane I mở ra (nó là hành vi đang chạy), nhưng nó **cũng chưa
> phải** thứ #268 gọi là đóng. Đóng nó = bắt buộc mọi chuyến phải được chiếu sang v2 trước khi ghi
> nhận công nợ, và **đó là một quyết định nghiệp vụ chưa ai quyết**. Ghi vào `OPEN_BLOCKERS`.

### 3.6 Duyệt trước khi chạy xong thì không có tác dụng gì

Hai lớp, độc lập nhau:

1. **Tầng nghiệm thu** từ chối quyết định `APPROVED` cho một vòng chạy chưa `COMPLETED`
   (`ACCEPTANCE_RUN_NOT_COMPLETED`);
2. **Tầng quyết toán** vẫn giữ nguyên mọi điều kiện vận hành cũ (`trip.status === 'RECONCILED'`, có
   giá cước, có khách…). Cổng mới **thêm** điều kiện, **không thay** điều kiện nào.

⇒ `chưa hoàn thành + APPROVED` không đi qua được, kể cả khi lớp 1 bị hỏng.

### 3.7 Hướng phụ thuộc MỘT CHIỀU

```text
transport-settlement  ──đọc──▶  transport-acceptance  ──đọc──▶  transport-core / transport-checkpoint
```

`transport-acceptance` **không** biết `transport-settlement` tồn tại. Nhờ vậy không có vòng lặp
module, và tầng nghiệm thu không bao giờ ghi được một dòng nào vào sổ tiền.

`transport-settlement` khai `transport-acceptance` là **phụ thuộc cứng** trong `tenant.schema.ts`.
Đó là câu trả lời cho câu hỏi _"tắt capability thì cổng có biến mất không"_: **không có chế độ tắt**.
Một khách bật quyết toán mà tắt nghiệm thu sẽ **không boot được**, thay vì boot lên với một cổng
tài chính im lặng vắng mặt.

---

## 4. MÔ HÌNH DỮ LIỆU

Hai bảng, đúng khuôn `TransportExpenseClaim` + `TransportExpenseClaimDecision`:

```text
TransportCommercialAcceptance            — CHỦ THỂ + hình chiếu trạng thái hiện tại
  runId            @unique               → TransportVehicleRun
  state            PENDING | APPROVED | REJECTED | NEEDS_CORRECTION
  counterpartyId?                        → TransportCounterparty  (bên A, khi biết)
  businessDate                           (chính sách quyết toán cần)
  latestDecisionId @unique               → quyết định mới nhất
  openedBy / createdAt / updatedAt

TransportCommercialAcceptanceDecision    — LỊCH SỬ, CHỈ GHI THÊM
  acceptanceId, sequence                 @@unique([acceptanceId, sequence])
  outcome          APPROVED | REJECTED | NEEDS_CORRECTION
  reasonCode                             MÃ có kiểu, không phải câu chữ
  basis            DOCUMENT | EXTERNAL_PHYSICAL_CONFIRMATION
  evidenceRefs     opaque id[]           (F2 ràng buộc thật sau)
  externalNote                           B thực sự nhận/xác nhận cái gì
  supersedesId?                          liên kết sửa/mở lại
  idempotencyKey   @@unique([acceptanceId, idempotencyKey])
  decidedBy                              TỪ PHIÊN, không từ thân yêu cầu
  decidedAt        server-authoritative
```

`state` **không phải** một `boolean` mất lịch sử: nó là hình chiếu của quyết định mới nhất, chỉ
được ghi trong **cùng một giao dịch** với việc thêm một hàng quyết định. Đúng quy ước đã chạy của
`TransportExpenseClaim.status`.

`decidedAt` do máy chủ đặt từ `TRANSPORT_CLOCK` — **không** đọc từ thân yêu cầu (bài I7 số 14).

---

## 5. GHI CHÚ TRUNG THỰC VỀ I8 (chấp nhận runtime)

I8 bước 4 và 8 viết _"create/open a new settlement candidate/period through supported API/UI"_ và
_"re-run settlement selection"_. §1.3 đã đo: **đường ghi nhận công nợ không có route HTTP nào**, cố ý
(_"expose only those commands that are already defined and permissioned"_ — #168 §2.B1). Lane I
**không** mở một route ghi tài chính mới để làm cho bằng chứng runtime đẹp hơn — đó đúng là điều
`transport-actions.ts` cảnh báo là _"một quyết định chính sách mà chưa ai quyết"_.

Vì vậy bằng chứng cho I5 được chia đúng theo sự thật:

| Bậc                  | Chứng minh bằng                                | Cái gì được chứng minh                                                                                  |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Miền + Postgres thật | `*.int.spec.ts` trên Postgres thật             | cổng chặn/cho qua, đúng một lần, tương thích lịch sử                                                    |
| API trực tiếp        | test HTTP trên **đường quyết định nghiệm thu** | phân quyền, không tự khai `decidedBy`, fail-closed                                                      |
| Runtime preview      | `transport-preview/gd1-test`                   | vòng chạy `COMPLETED` + nghiệm thu `PENDING` hiển thị ở hàng chờ, lái xe bị từ chối, kế toán duyệt được |

Bậc "gọi API tạo ứng viên quyết toán" được báo cáo là **NOT AVAILABLE ON MAIN**, kèm lý do, thay vì
được nguỵ tạo bằng SQL thô (#268 cấm: _"Do not use raw SQL to manufacture PASS"_).

---

## 6. TRÌNH TỰ PR

| PR      | Nội dung                                                                                        | Rủi ro                                              | Cổng                                                                  |
| ------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| **I-a** | capability + mô hình + kho + dịch vụ + phân quyền + route quyết định + hàng chờ đọc + đối kháng | THẤP — **cổng CHƯA bật**, hoàn toàn thêm mới và trơ | tự merge sau CI exact-head                                            |
| **I-b** | `SettlementAcceptanceGate` + cắm vào `SettlementService` + tương thích lịch sử + test Postgres  | **CAO — kích hoạt I5**                              | **DỪNG** sau CI exact-head: ChatGPT review độc lập + chủ sở hữu duyệt |
| **I-c** | ràng buộc `DELIVERY_RECEIPT` sau khi #243 F2 vào `main` + màn hình hàng chờ + E2E               | TRUNG BÌNH                                          | tự merge sau CI exact-head                                            |

Lý do tách: PR I-a merge được mà **không** đổi một hành vi tài chính nào, nên bề mặt phải review thủ
công của tranche RỦI RO CAO thu lại đúng bằng phần thực sự nguy hiểm — cái cổng.

---

## 7. RÀNG BUỘC KHÔNG ĐƯỢC PHÁ

1. Không sổ tài chính thứ hai, không chứng từ bóng, không máy trạng thái mốc thứ hai.
2. Kế toán **duyệt được** nghiệm thu nhưng **không sửa được** mốc/chứng cứ/hàng rào đang bị nghiệm thu.
3. Lái xe **không bao giờ** duyệt — kể cả vòng chạy của chính mình.
4. `decidedBy` đến từ phiên; `decidedAt` đến từ máy chủ.
5. Hàng đã quyết toán trước tính năng **không** bị vô hiệu ngược.
6. Một nguồn đã duyệt vào dòng kinh tế **đúng một lần** — dùng `@@unique([sourceContext, sourceId])`
   đang có, không dựng cơ chế thứ hai.
7. Không phát hoá đơn/không sinh chứng từ 0 đồng để ghi lại việc nghiệm thu.
8. Không đụng `apps/api/src/transport/checkpoint/**` theo hướng ghi.
