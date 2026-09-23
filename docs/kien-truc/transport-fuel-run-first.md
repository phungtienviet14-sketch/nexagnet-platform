# Fuel Event Run-first — xe là gốc, Run/Leg là ngữ cảnh, giá thành là lớp riêng

> **Issue #364** — quyết định của chủ repo ngày 22/09/2026; bối cảnh #295 (Fuel v2), #327
> (Run-first), #356 (bề mặt lái xe Run-first). Tài liệu này ghi **cái đã xây** trong PR của #364.
> Nó **không** thay T4 as-built ở `transport-domain-contract.md` (phiếu, bảng kê, đối soát, bàn
> giao công nợ) — các phần đó không đổi ngữ nghĩa.

Ba câu tóm tắt quyết định:

1. Một lần đổ nhiên liệu trước hết là **sự kiện của XE tại một thời điểm**.
2. `TransportTrip` **không còn là cha bắt buộc**; `VehicleRun`/`RunLeg` là **ngữ cảnh vận hành tuỳ
   chọn**.
3. **Phân bổ giá thành** là một lớp riêng, không trộn với sự thật "xe vừa đổ dầu".

---

## 1. Đo trước khi sửa — `tripId` nằm ở đâu trong Fuel

Đo trên `main` tại `ea178ecf` trước khi viết dòng nào:

| Lớp                                                 | Trên `main`                                                                    | Sau #364                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Lưu trữ                                             | `TransportFuelEntry.tripId` **NOT NULL**                                       | nullable, FK `RESTRICT`; thêm `runId`, `legId` (FK `RESTRICT`, có index)                              |
| Schema lái xe                                       | `driverFuelSubmitSchema` bắt buộc `tripId` + `vehicleId`                       | `tripId`/`runId`/`legId`/`vehicleId` tuỳ chọn; **vẫn không có `driverId`**                            |
| Lệnh nộp                                            | `requireTrip` → `guardTripAcceptsFuel` → `requireAssignedToTrip` (lái xe + xe) | `resolveContext`: nhánh chuyến cũ giữ nguyên mọi cổng; nhánh vòng xe có cổng riêng (§4)               |
| Chống ghi trùng                                     | danh tính 11 trường, có `tripId`                                               | thêm `runId`/`legId` (nullable) — đổi ngữ cảnh là một phiếu **khác**                                  |
| Giá thành                                           | `VERIFIED` → `FuelCostingPort.postFuelCost` → `TX-03` `TransportTripExpense`   | chỉ phiếu có `tripId`; phiếu Run-first dừng ở `FUEL_COST_AWAITS_ATTRIBUTION` và sang lớp phân bổ (§3) |
| Quỹ lái xe                                          | `DRIVER_CASH` → `TX-03` → sổ quỹ (khoá theo chuyến)                            | `DRIVER_CASH` **chỉ** trên phiếu chuyến cũ — CHECK ở DB + lý do có mã · **#369: mở, xem §9.2**        |
| Hộp thư kế toán                                     | lọc và hiện **mã chuyến**                                                      | giữ mã chuyến; thêm lọc **mã vòng xe**, hiện vòng xe + số chặng; phiếu không chuyến vẫn xuất hiện     |
| Khung nhìn lái xe                                   | `DriverFuelSlipView.tripId` bắt buộc                                           | nullable; thêm `runCode`, `legSequence`, `vehiclePlate`                                               |
| Tiêu hao                                            | chuỗi odo theo **xe** (không phụ thuộc chuyến); drill-down mang `tripId`       | `tripId` nullable + `runId` trong drill-down; thuật toán không đổi                                    |
| Bảng kê / khớp / chênh lệch / đóng kỳ / công nợ NCC | không đọc `tripId`                                                             | không đổi — chứng minh lại trên phiếu `tripId = NULL` bằng Postgres thật (R9–R11)                     |
| Dòng thời gian hành trình                           | `listEntriesByTrip`                                                            | **không đổi** — phiếu Run-first chưa hiện ở đây (tồn đọng R-2)                                        |
| `runMargin` (analytics)                             | `TransportTripExpense` qua `TransportTripRunLegLink`                           | **không đổi** — chưa cộng lớp phân bổ (tồn đọng R-1)                                                  |

---

## 2. Ba sự thật, ba chỗ ở

**A. Sự thật đổ dầu — `TransportFuelEntry`.** Xe, thời điểm, người khai, cây xăng/trạm, số lít, odo,
số tiền, phương thức thanh toán, chứng từ, `correlationKey`, trạng thái duyệt/đối soát. Đủ nghĩa
**không cần** chuyến hay vòng xe.

**B. Ngữ cảnh vận hành — trên chính phiếu, tuỳ chọn.** `tripId` (chỉ để tương thích) **hoặc**
`runId` (kèm `legId` tuỳ chọn). Bất biến ở DB, không chỉ ở tầng miền:

| Ràng buộc                                    | Nói gì                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TransportFuelEntry_leg_needs_run`           | có chặng thì phải có vòng xe                                                               |
| `TransportFuelEntry_one_context_kind`        | `num_nonnulls(tripId, runId) <= 1` — không bao giờ cả chuyến lẫn vòng xe                   |
| ~~`TransportFuelEntry_driver_cash_needs_trip`~~ | `DRIVER_CASH` chỉ trên phiếu chuyến cũ — **#369 đã gỡ**, xem §9.2                        |
| `TransportFuelEntry_cost_expense_needs_trip` | `costExpenseId IS NULL OR tripId IS NOT NULL` — chân `TX-03` chỉ trên phiếu chuyến cũ (§3) |
| trigger `transport_fuel_entry_run_context`   | vòng xe là của **chính xe** trên phiếu; chặng thuộc **chính vòng xe** đó                   |

Ngữ cảnh **bất biến sau khi ghi**: lệnh sửa phiếu (`AmendFuelEntryInput`) không có trường ngữ cảnh.
Không có `orderId` — một vòng xe MULTI sau này mang nhiều đơn, và phiếu dầu không tự biết thuộc đơn
nào.

**C. Phân bổ giá thành — `TransportFuelCostAttribution`.** Bảng mới, **chỉ ghi thêm**:

- `ALLOCATION` (số dương) hoặc `REVERSAL` (số âm, `reversalOfId` trỏ đúng một cấp phát, unique);
- đích có kiểu: `RUN` hoặc `LEG` (đích `LEG` luôn mang `runId` của chính chặng đó);
- `correlationKey` unique, `recordedBy`, `note`, `createdAt`;
- **nhiều dòng cho một phiếu** — mô hình không đóng thành "một phiếu thuộc đúng một chặng".

**Ngữ cảnh ≠ phân bổ.** `runId = X` trên phiếu **không** làm số tiền tự thuộc giá thành của X. Không
có dòng phân bổ nào được sinh tự động; bảng giá thành của kế toán chỉ **gợi ý** vòng xe/chặng của
ngữ cảnh làm đích. Đích có thể là vòng xe/chặng khác, miễn **cùng xe**.

---

## 3. Một phiếu, một sổ cái — nguồn nào được cộng vào báo cáo nào

Khoá phân vùng là `tripId`, và nó bất biến sau khi ghi, nên một phiếu không thể đổi sổ cái.

| Phiếu                       | Sổ cái giá thành duy nhất                                  | Ai ghi                                                    | Báo cáo đọc sổ đó                                                                                      |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tripId ≠ NULL` (chuyến cũ) | `TransportTripExpense` (`TX-03`), trỏ bằng `costExpenseId` | `FuelService.postFuelCost` khi `VERIFIED` — **như trước** | biên chuyến, `runMargin` (qua `TransportTripRunLegLink`), Quỹ lái xe khi `DRIVER_CASH`                 |
| `tripId = NULL` (Run-first) | `TransportFuelCostAttribution`                             | kế toán, qua lệnh phân bổ riêng                           | `GET /transport/fuel/runs/:runId/cost-attribution`, `GET /transport/fuel/entries/:id/cost-attribution` |

> **Cập nhật #369 (R-1):** `runMargin` nay đọc **cả hai** sổ — xem §9.1. Quỹ lái xe là một sổ **thứ
> ba** (tiền mặt, không phải giá thành) và không bao giờ được cộng vào giá thành: xem §9.2.

Cưỡng chế ở **cả hai chiều**, mỗi chiều có lưới ở tầng DB — không chỉ quy ước:

- **Phiếu chuyến cũ không có dòng phân bổ.** Trigger `transport_fuel_cost_attribution_guard` từ
  chối mọi dòng phân bổ cho phiếu có `tripId`; dịch vụ từ chối trước với
  `FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED`, khung nhìn chỉ trỏ sang `TX-03` (IT A5).
- **Phiếu Run-first không có `costExpenseId`.** `CHECK TransportFuelEntry_cost_expense_needs_trip`
  từ chối mọi `UPDATE`/`INSERT` thô; `attachCostExpense()` của cả hai kho chỉ ghi khi `tripId` khác
  `NULL` và **ném** lỗi mang tên CHECK trên phiếu Run-first thay vì trả `null` ("đã có"), không ghi
  gì; `postFuelCost` gặp phiếu `tripId = NULL` dừng ở `FUEL_COST_AWAITS_ATTRIBUTION` — **không bao
  giờ** ghi `TX-03` (IT A8).

Chiều thứ hai là cần thiết chứ không thừa: trigger phân bổ chỉ hỏi `tripId`, nên thiếu CHECK thì một
phiếu Run-first mang `costExpenseId` (do một lần ghi thẳng) vẫn nhận dòng phân bổ — cùng một khoản
dầu nằm ở hai sổ.

Báo cáo vòng xe của lớp phân bổ mang cờ `legacyTripExpenseIncluded: false` để người đọc không
tưởng nhầm nó đã gồm `TX-03`.

**Luật cho người đọc sau này:** "toàn bộ chi phí nhiên liệu của vòng xe X" =
Σ `TransportTripExpense` (nhiên liệu) của các chuyến nối với chặng của X **+**
Σ `TransportFuelCostAttribution.signedAmount` có `runId = X`. Hai tổng **rời nhau theo cấu trúc** —
cộng thẳng không đếm trùng. Hôm nay `runMargin` mới đọc vế đầu (R-1).

**Không phụ thuộc giá thành:** công nợ nhà cung cấp (sinh từ đối soát đóng kỳ), Quỹ lái xe, và tiêu
hao. Phiếu Run-first chưa phân bổ đồng nào vẫn đi trọn đường bảng kê → khớp → chênh lệch → đóng kỳ
→ công nợ **đúng một lần** (R9–R10).

---

## 4. Bất biến của lớp phân bổ và nơi cưỡng chế

| Bất biến                                    | Tầng miền                                                                            | Tầng DB                                               | Bài kiểm                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------ |
| `0 ≤ tổng đang hiệu lực ≤ số tiền phiếu`    | `evaluateFuelCostAllocation` dưới khoá hàng phiếu                                    | trigger guard, bước 7                                 | unit "tong phan bo…", IT A2, A3      |
| Đồng thời không vượt                        | `SELECT … FOR UPDATE` hàng phiếu trong giao dịch `READ COMMITTED`                    | trigger khoá hàng phiếu **trước** mọi phép đọc        | IT A2 (hàng đợi khoá + đột biến), A3 |
| Gửi lại không sinh dòng thứ hai             | `correlationKey` bắt buộc; cùng nội dung → trả dòng cũ; khác nội dung → `KEY_REUSED` | unique `correlationKey`                               | unit "gui lai…", IT A1               |
| Sửa không xoá lịch sử                       | chỉ bằng dòng `REVERSAL`; khoá đảo tất định `fuel-cost-attribution:<id>:reversal`    | unique `reversalOfId`; trigger chặn `UPDATE`/`DELETE` | unit "sua bang DAO…", IT A6          |
| Chỉ phiếu đã duyệt                          | `FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED`                                           | trigger guard, bước 3                                 | unit "phieu CHUA duyet"              |
| Đích cùng xe; chặng thuộc vòng xe           | `FUEL_COST_ATTRIBUTION_TARGET_VEHICLE_MISMATCH`                                      | trigger guard, bước 5                                 | unit "vong chay cua XE KHAC", IT A4  |
| Không chạm phiếu, `TX-03`, Quỹ, bảng kê, AP | dịch vụ phân bổ chỉ ghi bảng của nó                                                  | —                                                     | unit "cap phat mot phan…", IT A7     |
| Không thành lỗi của lái xe                  | dòng phân bổ không có trường lái xe, không có đường khấu trừ                         | —                                                     | —                                    |

Vì sao `VERIFIED` là đủ để giữ "tổng ≤ số tiền" **theo thời gian**: không có chuyển trạng thái nào
**ra khỏi** `VERIFIED` (chỉ `DECLARED → VERIFIED`, `DECLARED → REJECTED`, `REJECTED → DECLARED`), và
lệnh sửa chỉ chạy khi phiếu còn `DECLARED` — số tiền của phiếu đã duyệt là bất biến (`GD-10`).

Bằng chứng đồng thời trên Postgres thật (A2): một giao dịch "giữ cửa" khoá hàng phiếu, hai lệnh phân
bổ được bắn song song, bài kiểm **đợi tới khi thấy cả hai phiên nằm trong hàng đợi khoá**
(`pg_stat_activity.wait_event_type = 'Lock'`) rồi mới mở cửa. Kết quả: đúng một dòng được ghi, lệnh
kia bị từ chối có mã. Gỡ `FOR UPDATE` khỏi kho → A2 **đỏ** (đã đo), trả lại → xanh.

---

## 5. Lái xe khai theo việc được điều

- `GET /transport/me/fuel/runs` — các vòng xe **đang mở** mà lái xe (từ phiên) đã từng được phân
  công, kèm biển số và danh sách chặng. Gác bằng `transport.driver.self.fuel.submit`.
- Ô khai phiếu: vòng xe đang chạy trước, vòng xe kế hoạch sau, chuyến cũ (nếu có) xếp cuối như lối
  phụ; chặng tuỳ chọn; tiền mặt lái xe ứng bị khoá trên vòng xe.
- Thân yêu cầu theo vòng xe là `{ runId, legId? }` — **không** `tripId`, **không** `vehicleId`,
  **không** `driverId`. Máy chủ tự lấy lái xe từ phiên, xe từ vòng xe, kiểm chặng thuộc vòng xe và
  lái xe từng được phân công vào vòng xe (lịch sử phân công, không phải bản đang hiệu lực — lái xe
  bị thay ca vẫn khai được phần của mình).
- Không vòng xe, không chuyến → **fail closed** `FUEL_ENTRY_CONTEXT_REQUIRED`; màn hình nói rõ "chưa
  có việc được điều nào đang mở", không bịa ngữ cảnh.

Lý do có mã mới (tiền tố theo bộ từ vựng hiện có của `fuel-decisions.ts`):
`FUEL_ENTRY_CONTEXT_REQUIRED`, `FUEL_ENTRY_CONTEXT_CONFLICT`, `FUEL_ENTRY_RUN_NOT_FOUND` (404),
`FUEL_ENTRY_DRIVER_NOT_ASSIGNED_TO_RUN`, `FUEL_ENTRY_VEHICLE_NOT_RUN_VEHICLE`,
`FUEL_ENTRY_LEG_NOT_IN_RUN`, ~~`FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP`~~ (#369 đã gỡ),
`FUEL_COST_AWAITS_ATTRIBUTION`, và điểm quyết định mới `fuel.cost_attribution` với 12 lý do
(`FUEL_COST_ATTRIBUTED`, `FUEL_COST_ATTRIBUTION_REPLAY`, `…_EXCEEDS_ENTRY`, …). Vi phạm CHECK/trigger
đi qua đường ghi không qua tầng miền được dịch về đúng các mã đó — không có 500 chung chung.

---

## 6. Không có vòng xe: vì sao vẫn fail closed

#364 §4.2 cho phép phiếu chỉ-xe **nếu** máy chủ chứng minh được lái xe có quyền khai cho xe đó bằng
dữ kiện đang có, và cấm tự đặt ra "xe mặc định của lái xe".

Ứng viên duy nhất trong mô hình là `TransportVehicleAssignment` (tầng đội xe: "lái xe **phụ trách**
xe", `effectiveFrom/effectiveTo`, tối đa một bản đang hiệu lực mỗi xe; chồng lấn thời gian **không**
bị DB chặn). Nó nói **ai chịu trách nhiệm** chiếc xe, không nói **ai đang lái xe lúc T**. Dùng nó để
cấp quyền khai phiếu chính là biến nó thành "xe mặc định" — nên PR này **không** dùng, và để quyết
định cho chủ repo (R-3). DB đã cho phép phiếu không ngữ cảnh (`<= 1`, không phải `= 1`), nên khi có
quyết định thì không cần migration.

---

## 7. Migration và đường lùi

`20260922100000_transport_fuel_run_first`:

- `tripId` bỏ `NOT NULL`; thêm `runId`, `legId` + FK `RESTRICT` + index; bảng
  `TransportFuelCostAttribution` + hai enum; 4 CHECK + 1 trigger trên phiếu; 3 CHECK + 2 trigger trên
  bảng phân bổ. Mọi `ALTER`/`CREATE` chỉ nhắm `TransportFuel*` (spec lưu trữ khoá điều đó).
- **Không backfill.** Hàng cũ giữ `tripId`, `runId`/`legId` để `NULL`; không viết lại đối soát hay
  công nợ. Việc suy vòng xe cho phiếu chuyến cũ từ `TransportTripRunLegLink` **cố ý không làm**:
  `one_context_kind` cấm mang cả hai, nên nếu sau này muốn backfill thì phải nới CHECK đó và **giữ
  `tripId` làm khoá phân vùng** của §3.
- `README-rollback.sql` gỡ mọi đối tượng mới; `SET NOT NULL` trên `tripId` sẽ **chết** nếu đã có
  phiếu Run-first — cố ý, để đường lùi không lặng lẽ xoá sự thật.
- Reset demo: `wipeFuelCostAttributions` tắt trigger chỉ-ghi-thêm **trong** một giao dịch.

---

## 8. Tồn đọng — ngoài PR này, có chủ đích

| Mã  | Tồn đọng                                                                  | Trạng thái                                                                                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R-1 | `runMargin` và báo cáo tài chính chưa cộng `TransportFuelCostAttribution` | **ĐÃ ĐÓNG — #369** (§9.1)                                                                                     |
| R-2 | Dòng thời gian hành trình chưa hiện phiếu Run-first                       | **ĐÃ ĐÓNG — #369** (§9.3)                                                                                     |
| R-3 | Phiếu chỉ-xe (không vòng xe)                                              | **CÒN MỞ, fail closed** — cần quyết định chủ repo về nguồn lái xe ↔ xe có thẩm quyền (§6)                     |
| R-4 | `DRIVER_CASH` trên phiếu Run-first                                        | **ĐÃ ĐÓNG — #369** (§9.2)                                                                                     |
| R-5 | Hộp thư chưa hiện vòng xe suy ra cho phiếu chuyến cũ                      | **ĐÃ ĐÓNG — #369** (§9.3)                                                                                     |
| R-6 | Bảng giá thành trên web chỉ gợi ý vòng xe/chặng của ngữ cảnh              | **CÒN MỞ** — pha UI/UX riêng; #369 là backend-only nên web chưa mở ô `DRIVER_CASH` trên vòng xe (§9.4)        |
| R-7 | Bằng chứng runtime/UAT §11 của #364                                       | **CÒN MỞ** — chỉ làm được sau merge + deploy                                                                  |

---

## 9. #369 — bốn tồn đọng đã đóng (backend)

### 9.1 `runMargin` cộng **hai sổ cái rời nhau**, không đếm trùng (R-1)

```text
directCost = Σ TransportTripExpense (chuyến v1 nối chặng qua TransportTripRunLegLink)
           + Σ TransportFuelCostAttribution (đích RUN và đích LEG của chính vòng xe)
```

Phép cộng thẳng là **đúng vì §3**: một phiếu chỉ nằm ở một sổ, và hai chiều đều có lưới ở tầng CSDL.
`RunMargin` vì vậy mang `costSources` (tách hai nguồn), `legCosts` (chi phí từng chặng đã đếm),
`runLevelCost` (đích `RUN` — thuộc vòng xe, **không** rơi vào biên của đơn nào, cùng lẽ với chặng
rỗng) và `fuelCostAttributionIds` (đường đối soát ngược về từng dòng).

Cổng đọc `AnalyticsFuelAttributionFacts` khai ở `analytics.ports.ts` (không một hàm ghi), adapter được
**cắm vào** từ `TransportFuelAnalyticsBridgeModule` (`@Global()`, đến/đi cùng `transport-fuel`) — nên
`transport-costing` **không** trở thành phụ thuộc của `transport-fuel`. Khách tắt nhiên liệu vẫn boot
và báo cáo nói ra `FUEL_COST_ATTRIBUTION` trong `unavailableSources`, thay vì cộng ra 0.

Tiền nằm trên **chặng đã huỷ** không vào `directCost` (quy ước cũ của `R8`) nhưng từ #369 được **gọi
tên** bằng mã `COST_ON_CANCELLED_LEG` — trước đó nó bị bỏ qua trong im lặng ở cả hai nguồn.

### 9.2 `DRIVER_CASH` Run-first vào Quỹ lái xe bằng `RUN_EXPENSE` (R-4)

`TransportTripExpense.tripId` **giữ nguyên NOT NULL**. Thay vì một chuyến giả, Quỹ lái xe nhận một
**loại bút toán mới** `RUN_EXPENSE` (âm) mang ngữ cảnh vòng xe/chặng — **chân tiền mặt**, không phải
chân giá thành:

| Phiếu                       | Chân giá thành                 | Chân tiền mặt (Quỹ lái xe)                        |
| --------------------------- | ------------------------------ | ------------------------------------------------- |
| `tripId ≠ NULL` + `DRIVER_CASH` | `TransportTripExpense` (`TX-03`) | `DriverFundEntry` `TRIP_EXPENSE` (cùng khoá, `INV-03`) |
| `tripId = NULL` + `DRIVER_CASH` | `TransportFuelCostAttribution` (kế toán quyết sau) | `DriverFundEntry` `RUN_EXPENSE`, ghi **lúc duyệt** |
| `tripId = NULL` + `SUPPLIER_ACCOUNT` | `TransportFuelCostAttribution` | — (không ai ứng tiền)                              |

Khoá sự kiện là **một** cho cả hai đường (`fuelCostCorrelationKey` = `fuel:<id>`), nên unique
`TransportDriverFundEntry.correlationKey` giữ *"một phiếu, tối đa một bút toán Quỹ gốc"* ngay trong sổ
Quỹ — bất kể đường ghi nào. Phiếu trỏ ngược về chân Quỹ bằng `TransportFuelEntry.driverFundEntryId`
(UNIQUE, đối xứng `costExpenseId`), và hai CHECK loại trừ nhau theo `tripId` nên một phiếu có **tối đa
một** đường vào Quỹ. Trigger `transport_fuel_entry_driver_fund_leg` đòi bút toán gắn vào đúng là của
chính phiếu đó (loại, `-amount`, lái xe, vòng xe/chặng, ngày, khoá).

Sửa = **đảo**, đi đường đảo chung của `TX-03` (`POST /transport/driver-fund/entries/:id/reversal`):
dòng đảo sao lại ngữ cảnh vòng xe, `reversalOfId` UNIQUE nên chỉ đảo được một lần, và có dấu vết kiểm
toán. Duyệt lại sau khi đảo **không** ghi lại tiền (khoá vẫn là của bản gốc).

`CHECK TransportFuelEntry_driver_cash_needs_trip` của #364 đã được **gỡ** — nó là một điều kiện đúng
*khi chưa có đường ghi Quỹ không chuyến*, và giữ lại là giữ một chuyện giả làm điều kiện.

### 9.3 Đọc theo vòng xe, và suy vòng xe cho phiếu chuyến cũ (R-2, R-5)

- **Dòng thời gian** đọc thêm `listEntriesByRun`; mỗi sự kiện mang `placement` (`DECLARED` /
  `DERIVED_FROM_TRIP_LINK` / `RUN_LEVEL`) để người đọc phân biệt được *bản ghi tự khai chặng* với
  *chặng được suy ra*. Hai đường đọc hai tập phiếu rời nhau nên không phiếu nào hiện hai lần.
- **Hộp thư** thêm trường **riêng** `derivedRun` cho phiếu chuyến cũ (`runId`/`legId` của phiếu **giữ
  nguyên `null`**), và bộ lọc theo mã vòng xe trở thành phép HOẶC: phiếu khai thẳng vòng xe **hoặc**
  phiếu của chuyến đã chiếu sang một chặng của nó.
- Phép suy đi qua `TransportTripRunLegLink` — quan hệ 1-1, nên **không có chỗ để đoán**. Chuyến chưa
  chiếu ⇒ `null`, không suy theo (xe, ngày). **Không** ghi ngược `runId`/`legId` vào phiếu cũ (§7 giữ
  nguyên): làm vậy sẽ biến một phiếu chuyến cũ trông như phiếu Run-first và làm mất khoá phân vùng của
  §3.

### 9.4 Cái #369 **không** làm

- **R-3** vẫn fail closed: phiếu không vòng xe, không chuyến vẫn bị từ chối
  (`FUEL_ENTRY_CONTEXT_REQUIRED`). Không có nguồn "lái xe ↔ xe lúc T" nào được nghĩ ra.
- **Web không đổi một dòng**: ô khai phiếu của lái xe vẫn khoá `DRIVER_CASH` trên vòng xe
  (`fuel-declaration.ts`), nên đường này hôm nay chỉ dùng được qua API. Mở ô đó thuộc pha UI (R-6).
- ~~Bộ so khớp bảng kê không xét `paymentMethod`~~ — **đóng bởi #371**, xem §9.5.

### 9.5 Một lần đổ dầu, một lần trả: `DRIVER_CASH` không bao giờ thành công nợ cây xăng (#371)

Review độc lập của #371 đo được trên `ec748fcc`: phiếu `DRIVER_CASH` đã vào Quỹ lái xe (`TX-03` hoặc
`RUN_EXPENSE`) vẫn khớp được với bảng kê công nợ (tự động **và** tay), đóng kỳ, sinh công nợ nhà cung
cấp — **trả hai lần** cho cùng một lần đổ. Luật: bảng kê là chứng từ **công nợ**; chỉ phiếu
`SUPPLIER_ACCOUNT` là ứng viên của nó (`fuel-payable.ts`, kiểm **dương** — một cách trả mới về sau mặc
định **không** là công nợ).

| Đường vào                | Chặn ở đâu                                                                                                                  | Mã                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| So khớp tự động          | `fuel-matching.ts`: phiếu tiền mặt không là ứng viên (không gây nhập nhằng giả); dòng chỉ còn phiếu tiền mặt → chênh lệch riêng | `PAYMENT_METHOD_CONFLICT` / `MATCH_PAYMENT_METHOD_CONFLICT` |
| Xác nhận khớp tay        | kiểm sớm ở dịch vụ + **đọc lại dưới khoá** ở kho (khoá hàng kỳ, rồi hàng phiếu `FOR UPDATE`) trước mọi lần ghi              | `MATCH_PAYMENT_METHOD_CONFLICT` (403)     |
| "Chấp nhận số cây xăng"  | trên dòng `PAYMENT_METHOD_CONFLICT` — cả lần quyết lẫn lần đổi ý sau khi mở kỳ                                            | `DISCREPANCY_CASH_PAID_NOT_PAYABLE` / `DECISION_CASH_PAID_NOT_PAYABLE` |
| Đóng kỳ (lưới cuối)      | kỳ mang cặp khớp tới phiếu không ghi nợ (dữ liệu cũ, đường ghi thô) → **không đóng, không bàn giao**, không lọc bỏ rồi coi là sạch | `RECONCILIATION_HAS_CASH_PAID_MATCH`      |
| CSDL                     | trigger `TransportFuelMatch_payable_entry_only` + chiều ngược `TransportFuelEntry_matched_stays_payable`                    | lỗi được dịch về mã nghiệp vụ             |

**Hai trigger không thay được khoá hàng phiếu.** Dưới `READ COMMITTED` mỗi trigger chỉ thấy dữ liệu
đã commit: một cặp khớp chưa commit và một lệnh sửa cách trả đồng thời lọt qua **cả hai** (ghi-lệch).
Bài `PMC-IT-08` dựng đúng cảnh đó trên Postgres thật làm đối chứng âm; `PMC-IT-09` ép hai thứ tự bằng
khoá hàng phiếu và đo rằng xác nhận khớp tay với sửa phiếu sang tiền mặt **không bao giờ cùng thành
công**.

Đường ra của dữ liệu hỏng: cặp `AUTO` → chạy lại so khớp (cặp cũ bị xoá, không được đề nghị lại);
cặp `MANUAL` → lệnh đóng tiếp tục từ chối cho tới khi dữ liệu được sửa (không có lệnh "gỡ khớp tay" —
giới hạn có từ trước). Đếm trước khi triển khai: câu `SELECT` ở đầu migration
`20260923120100_transport_fuel_match_payable_entry_only`.

**Không đổi:** phiếu `DRIVER_CASH` không nằm trong chênh lệch nào vẫn ra `FUEL_ENTRY_ONLY` như trước
(vắng mặt trên bảng kê công nợ là trạng thái đúng của một lần trả tiền mặt — có đưa phiếu tiền mặt ra
khỏi phạm vi đối soát không là quyết định nghiệp vụ riêng, chưa ai quyết).
