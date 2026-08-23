# Kế hoạch — Hatchet: cổng ĐỘ TIN CẬY (W4–W9) trước khi nói tới deploy

> Nhánh `feat/hoi-thoai-chot-don-main` · HEAD đầu phiên **`ead4dfc`**
> Bàn giao: [ban-giao-workflow-engine.md](../../docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md) §13–§20
> Runbook: [workflow-engine-runbook.md](../../docs/phat-trien/van-hanh/workflow-engine-runbook.md)
> Kế hoạch trước: [hatchet-worker-foundation.plan.md](hatchet-worker-foundation.plan.md)

## 0. Một câu

Nền tảng đã chứng minh **đường đi hạnh phúc** qua biên production thật; phiên này chứng minh
**đường đi khi mọi thứ chết** — và chỉ khi cả sáu cổng xanh mới được bàn tới compose production.

**NOT READY FOR GD1-TEST vẫn là kết quả hợp lệ.**

---

## 1. Trạng thái đã kiểm tại chỗ (không lấy từ bàn giao — đọc lại từ nguồn)

```
HEAD                     ead4dfc302f1fad63e61075a02f1d18c9549bbb2   (ahead 17 vs origin)
Hatchet POC stack        ĐANG CHẠY — pocwf-{engine,dashboard,postgres} (9h uptime, cổng 7744/8744/5744)
Postgres NGHIỆP VỤ       ĐÃ TẮT — `z-postgres-1  Exited (255) 3 days ago`  ⇒ W4 phải bật lại
Migration outbox         CÓ — apps/api/prisma/migrations/20260822180000_workflow_outbox/
```

### Việc song song — TUYỆT ĐỐI KHÔNG chạm

| File / thư mục | Luồng |
|---|---|
| `apps/api/src/observability/{decision-reasons,recent-traces.sink,trace-context}.ts` | Phase 0 (`decision-reasons.ts` **+71 dòng chưa commit**) |
| `apps/api/src/orders/{orders.controller,orders.service}.ts` + 3 spec chưa track | Phase 0 |
| `apps/web/**` · `apps/mini/` · `tools/trace-view.mjs` | Phase 0 / web |
| `tenants/wata/` | luồng khách WATA |
| `docs/phat-trien/ke-hoach/tong-quan.md` · `van-hanh/debugging.md` | Phase 0 |

⇒ **Hệ quả bắt buộc cho kế hoạch này:** mã lý do hỏng mới **KHÔNG** được ghi vào
`observability/decision-reasons.ts`. Chúng nằm trong một module **của riêng workflow**
(§13), hợp nhất sạch ở phiên sau khi Phase 0 đã vào.

---

## 2. Bốn khoảng trống tìm được khi ĐỌC SOURCE (không có trong bàn giao)

Đây là các phát hiện mới của phiên lập kế hoạch, và chúng định hình phần lớn công việc dưới đây.

### G1 — `operationKey` được cổng nhận nhưng adapter Hatchet **VỨT ĐI**
`workflow-engine.port.ts:TriggerWorkflowCommand.operationKey` có trong hợp đồng, nhưng
`hatchet-workflow-engine.adapter.ts:trigger()` chỉ truyền `additionalMetadata` cho `runNoWait` —
**khoá không bao giờ tới engine**. Nghĩa là: một lần dispatch trùng (timeout mơ hồ, lease hết hạn,
hai bản sao API) tạo **hai run Hatchet**, không phải một.

Hệ quả cho §7: bảo đảm giao hàng thật hiện nay **KHÔNG** phải "deduplicated-at-trigger".
Đây là con số phải báo trung thực, không phải lỗi phải giấu.

### G2 — `engineRunId` KHÔNG BAO GIỜ tới `AuditLog`
`workflow-handoff.service.ts:record()` ghi audit **lúc xếp hàng**, khi chưa có `engineRunId`.
Dispatcher ghi `engineRunId` vào **hàng outbox** — mà outbox là **hàng đợi**, không phải kho lưu.
Runbook §6 nói bản ghi bền vững nằm ở `AuditLog`; hiện tại nó **không có** `engineRunId`.
⇒ liên kết `engineRunId ↔ traceId ↔ entity` đứt ở đúng chỗ runbook hứa nó liền.

### G3 — worker không có bề mặt READY nào máy đọc được
`worker-main.ts` in `READY workflow=…` ra **stdout**. `docker healthcheck` không đọc stdout.
Đo được: **~38s nguội / ~12s ấm**. Không có readiness ⇒ compose chỉ có hai lựa chọn tồi:
`start_period` đoán mò, hoặc healthcheck "tiến trình còn sống" (xanh trong khi chưa đăng ký gì —
đúng chế độ hỏng tệ nhất mà `worker-registration.ts` viết ra để tránh).

### G4 — hai worker cùng phiên bản dùng CHUNG một `workerName`
`worker-registration.ts` sinh `workflow-worker-<key>-<version>` — **tất định theo phiên bản**.
Hai container v1 sẽ đăng ký cùng một tên worker với engine. Chưa biết engine xử lý thế nào.
§9.1 là bài đo, **không** phải bài sửa: chỉ đổi nếu đo ra hỏng.

---

## 3. Khuôn mẫu phải noi theo (không phát minh lại)

| Loại | Nguồn | Điều phải sao |
|---|---|---|
| Int spec cần hạ tầng | `campaigns/prisma-campaign.repository.int.spec.ts:5` | `describe.runIf(process.env.RUN_PRISMA_IT === '1')` — nằm chung `src/**/*.spec.ts` nhưng **tự bỏ qua**; bộ test thường KHÔNG phụ thuộc engine đang vô tình chạy |
| E2E qua biên thật | `workflow/workflow-e2e.int.spec.ts` | `ProofEndpoint` · `WorkerProcess` · `waitFor` · `bootContext` — vào bằng **cửa chính** `WorkflowHandoffService.handoff()` |
| Hợp đồng DI | `workflow/workflow-worker.module.spec.ts` | `NestFactory.createApplicationContext(..., { abortOnError: false })` + helper `resolvable()` |
| Lý do hỏng có kiểu | `workflows/integration-handoff.steps.ts:HANDOFF_STEP_FAILURES` | mảng `as const` + `Record<T,string>` nhãn tiếng Việt + lớp `Error` mang `reason` |
| Lease / claim | `prisma-workflow-outbox.repository.ts:claimDue` | `pg_try_advisory_xact_lock` + `FOR UPDATE SKIP LOCKED` |

---

## 4. Chuẩn bị (một lần, trước mọi task)

```bash
docker compose -f docker-compose.yml up -d postgres
```
```bash
pnpm --filter @netviet/api exec prisma migrate deploy
```
Hatchet POC stack đã chạy sẵn; token lấy từ `tools/poc-workflow-engine/.env`
(`HATCHET_CLIENT_TOKEN`). **Không** in token ra log/commit.

Biến chung của mọi int spec phiên này:
```
RUN_PRISMA_IT=1  RUN_WORKFLOW_IT=1
WORKFLOW_ENGINE_TOKEN=<từ .env POC>
WORKFLOW_ENGINE_HOST_PORT=localhost:7744
WORKFLOW_ENGINE_TLS_STRATEGY=none
DATABASE_URL=postgresql://netviet:netviet_local@localhost:5432/netviet
```

---

## 5. Task 0 — TÁCH HARNESS (bắt buộc trước, không phải dọn dẹp cho đẹp)

Bốn int spec mới đều cần `ProofEndpoint` + `WorkerProcess` + `waitFor` + `bootContext`.
Sao chép chúng bốn lần là cách chắc chắn nhất để bốn bản trôi khác nhau và một bài test xanh giả.

**File mới:** `apps/api/src/workflow/workflow-it.harness.ts`
*(đuôi `.ts` thường — KHÔNG khớp `src/**/*.spec.ts` nên vitest không coi là bộ test)*

Chuyển từ `workflow-e2e.int.spec.ts` sang, **không đổi hành vi**:
`ProofEndpoint` (+ mở rộng: `appliedCount()`, `postsFor(key)`, `mode='4xx'`),
`WorkerProcess` (+ tên riêng cho §9.1, + `logIncludes()`), `waitFor`, `bootAppContext`,
`baseEnv`, các hằng thời hạn.

- **Validate:** `pnpm --filter @netviet/api exec vitest run src/workflow` (không có cờ IT ⇒ vẫn
  xanh, các int spec bỏ qua) **và** chạy lại `workflow-e2e` với cờ IT ⇒ 3/3 như trước.
- **Gate REFACTOR:** nếu `workflow-e2e` không còn 3/3 thì việc tách sai, sửa trước khi đi tiếp.

---

## 6. W4 — CỬA SỔ SỤP CỦA OUTBOX, trên Postgres THẬT (P0)

**File mới:**
- `apps/api/src/workflow/workflow-outbox-durability.int.spec.ts`
- `apps/api/src/workflow/testing/crash-window-child.ts` — tiến trình con **thật**, không mô phỏng

Bài này phải **FAIL nếu outbox chỉ nằm trong bộ nhớ**. Cách đảm bảo điều đó: khẳng định cuối
đọc hàng outbox **từ Postgres bằng một `PrismaService` mới, ở một tiến trình khác** với tiến
trình đã ghi. `InMemoryWorkflowOutboxRepository` không có đường nào qua được bài đó.

### 6.1 Sụp SAU commit, TRƯỚC khi gọi Hatchet
Tiến trình con (`crash-window-child.ts`):
1. boot `AppModule.forRoot()` thật, `PERSISTENCE=prisma`, gói khách `workflow-enabled`;
2. `prisma.$transaction(async (tx) => { … })`:
   - ghi **trạng thái nghiệp vụ chuẩn tắc**: `tx.order.create({ intent, senderType, chatId, rawText })`
     — bốn trường bắt buộc (`schema.prisma:544`), `Order` là thực thể thật của GĐ1;
   - gọi `handoff.handoff({ …, entityType:'work-item', entityId: order.id }, tx)` **trong cùng `tx`**;
3. COMMIT;
4. in `COMMITTED <orderId> <operationKey>` ra stdout;
5. `process.kill(process.pid, 'SIGKILL')` — **không** `exit(0)`, không `close()`, không dọn dẹp.

Cửa sổ là **~5 giây** (`WorkflowScheduler` tick 5s, lần tick đầu chạy lúc `onModuleInit` tức là
**trước** handoff). Không phải đua mili-giây; và ba khẳng định dưới đây chứng minh cửa sổ đúng là
cửa sổ chứ không phải giả định:

**Khẳng định sau khi con chết:**
- `order` **tồn tại** trong Postgres (đọc bằng client mới);
- hàng outbox **tồn tại**, `status='pending'`, `attempts=0`, `engineRunId=null`;
- điểm cuối nghiệp vụ **chưa nhận** gì cho khoá đó;
- **engine chưa có run** — đọc bằng SDK: `runs.list({ workflowNames:['integration-handoff.v1'] })`
  lọc theo `additionalMetadata['nexagnet.entityId']` ⇒ 0.

**Khôi phục:** boot tiến trình API **thứ hai** (đúng `AppModule` thật, cùng DB) → `WorkflowScheduler`
của nó tự nhận hàng → dispatch → worker chạy → điểm cuối nhận **đúng một** POST mang khoá đó →
hàng outbox chuyển `dispatched`, `engineRunId` khác `null`. **Không mất sự kiện.**

### 6.2 Sụp TRƯỚC commit (bài đối xứng)
Cùng `crash-window-child.ts`, cờ `--abort-before-commit`: ném **bên trong** `$transaction` sau khi
đã ghi cả `order` lẫn outbox.

**Khẳng định:** `order` **không tồn tại**; hàng outbox **không tồn tại**; engine không có run.
Hai trạng thái **cùng có hoặc cùng không** — và bài này là thứ duy nhất chứng minh `tx` được
truyền xuyên qua `handoff()` tới `enqueue()` thật, chứ không bị nuốt ở giữa.

> **Không mock ranh giới giao dịch.** `handoff()` nhận `tx` thật của Prisma và
> `PrismaWorkflowOutboxRepository.enqueue` dùng nó làm `client`. Không có test double nào ở đây.

- **Validate:** `RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 … vitest run src/workflow/workflow-outbox-durability`

---

## 7. W5 — HATCHET CHẾT → SỐNG LẠI, và ngữ nghĩa DISPATCH TRÙNG

**File mới:** `apps/api/src/workflow/workflow-recovery.int.spec.ts`

### 7.1 Engine chết → lên lại (engine thật, `docker compose -p pocwf stop/start hatchet-engine`)
1. `handoff()` commit → hàng outbox `pending`;
2. **tắt engine**;
3. gọi `dispatcher.tick()` (gọi thẳng dispatcher với `now` cho trước — đúng khuôn
   `workflow-dispatcher.spec.ts`, không chờ timer);
4. khẳng định: hàng **còn**, `status='pending'`, `attempts=1`, `lastError` khác rỗng,
   `nextAttemptAt` ở tương lai theo đúng `backoffMs(base, 1)`;
5. **đường nghiệp vụ vẫn sống**: `handoff()` một thực thể khác ⇒ vẫn `queued` (engine chết
   không được làm hỏng đường ghi nghiệp vụ);
6. **bật engine lại**, chờ healthy;
7. `tick()` ở `now` sau `nextAttemptAt` → **cùng** hàng đó được dispatch → workflow chạy hết →
   điểm cuối nhận đúng khoá đó.

### 7.2 Dispatch trùng — đo, rồi BÁO ĐÚNG TÊN
Ba trường hợp, **ba phép đo riêng**, không gộp:

| Mô phỏng | Cách dựng | Đo cái gì |
|---|---|---|
| hai tick chồng nhau | hai `WorkflowDispatcher` khác `workerId`, cùng Postgres, `Promise.all` | bao nhiêu tiến trình **nhận** được hàng |
| lease hết hạn / restart | `claimDue` lần 2 ở `now > claimExpiresAt` | hàng có bị nhận lại không, `attempts` tăng đúng chưa |
| timeout mơ hồ (engine ĐÃ nhận) | `WorkflowEnginePort` bọc: gọi thật rồi **ném** `UPSTREAM_TIMEOUT` sau khi run đã tạo | có **hai run Hatchet** không · điểm cuối bị gọi **mấy lần** · có **mấy bản ghi** được áp dụng |

**Kết luận phải viết ra bằng ba dòng riêng biệt** (không được gộp thành một chữ):

```
outbox → engine        : at-least-once     (lease + backoff; KHÔNG mất, CÓ THỂ gửi lại)
engine run creation    : KHÔNG dedup       ← G1: operationKey không tới runNoWait
tác dụng phụ bên ngoài : dedup bằng nghiệp vụ (Idempotency-Key mức `key`, preflight mức `lookup`,
                         mức `none` thì BLOCKED bởi operation-key.ts)
```

**Cấm dùng chữ "exactly-once".** Nếu G1 sửa được bằng một tuỳ chọn dedup có sẵn trong SDK đã ghim
(1.28.2), **ghi lại đề xuất và bằng chứng, KHÔNG tự sửa trong task này** — nó đổi ngữ nghĩa của
cổng và phải là quyết định có chủ ý.

---

## 8. W6 — WORKER BỊ `kill -9` GIỮA CHỪNG

**File mới:** `apps/api/src/workflow/workflow-worker-recovery.int.spec.ts`

Kịch bản thật (không unit test lifecycle hook):
1. `endpoint.mode='hold'` — run vào `dispatch`, POST **tới nơi và được đếm**, rồi bị giữ;
   ⇒ tác dụng phụ có đếm đã xảy ra: `endpoint.postsFor(key) === 1`;
2. `worker.kill()` — SIGKILL, không có cơ hội dọn dẹp (`WorkerProcess.kill()` đã có);
3. worker **mới** lên, **cùng** `WORKFLOW_WORKER_VERSION=v1`;
4. `endpoint.mode='ok'`, `endpoint.release()`;
5. chờ workflow hoàn tất.

**Khẳng định:**
- run **không mất** — `describeRun(engineRunId)` không phải `null`, kết thúc ở trạng thái cuối;
- **khoá thao tác không đổi** giữa hai lần: mọi POST mang **cùng một** `Idempotency-Key`
  (đây là chỗ `recomputeOperationKey` trả công — worker mới dựng lại đúng khoá cũ từ input);
- **số bản ghi được ÁP DỤNG = 1** dù `postsFor(key) ≥ 1` — báo cả hai con số, không chỉ con số đẹp;
- `resolve` chạy lại bao nhiêu lần: đọc từ log của worker mới (`resolve … -> da co URL`) và **báo
  đúng theo ngữ nghĩa at-least-once của Hatchet**, không tuyên bố "không chạy lại";
- `traceparent` của POST sau **trùng** `traceparent` của POST trước ⇒ tương quan không đứt qua
  một lần chết tiến trình.

---

## 9. W7 — HAI WORKER CÙNG PHIÊN BẢN, rồi v1‖v2, rồi DRAIN

Cùng file với §8.

### 9.1 Hai worker cùng v1
`worker-v1-A` + `worker-v1-B`. **G4 nằm ở đây:** cả hai hiện sinh cùng `workerName`.
Thứ tự làm: chạy **nguyên trạng trước** để đo hành vi thật, chỉ đổi `worker-registration.ts`
(thêm hậu tố instance) **nếu** đo ra một trong các hỏng sau:
- một worker đăng ký **đè** worker kia (engine chỉ thấy một);
- việc **không** được chia (một worker nhận hết ⇒ không phải HA, chỉ là dự phòng nguội);
- `countInFlight` đếm sai vì hai instance chung tên.

**Khẳng định (nhiều run, ≥6):** mọi run kết thúc · tổng bản ghi áp dụng = số run (không nhân đôi)
· giết A giữa chừng ⇒ B tiếp tục, không run nào mồ côi.

### 9.2 v1 ‖ v2 — giữ Gate A trên dây nối production
Hồi quy đã có (`workflow-e2e.int.spec.ts` §"hoi quy ghim phien ban") **giữ nguyên, không viết lại**.
Thêm đúng một điều nó chưa đo: **hồi quy regex tên** như một hợp đồng.

**File mới:** `apps/api/src/workflow/workflow-engine-name.contract.spec.ts` (unit, không hạ tầng)
- `engineWorkflowName(k,v)` khớp `^[a-zA-Z0-9._-]+$` với mọi cặp hợp lệ;
- ký tự `:` bị **ném**;
- `latest` bị ném; `v0`, `V1`, `v1,v2`, `v1 v2` bị ném;
- mọi phiên bản trong `workflow-registry.ts:TEMPLATES` sinh ra tên khớp regex — **quét bảng**,
  nên thêm `v3` mà đặt tên sai thì test đỏ ngay chứ không đỏ lúc deploy.

### 9.3 DRAIN đo được
Với một run v1 đang bị giữ: `countInFlight('integration-handoff','v1') ≥ 1`;
sau khi thả và chạy hết: `=== 0`. **Không rút worker khi số này > 0** — khẳng định bằng số, không
bằng lời trong runbook.

---

## 10. W8 — RIÊNG TƯ ĐỌC TỪ ENGINE THẬT

**File mới:** `apps/api/src/workflow/workflow-privacy-engine-read.int.spec.ts`

### 10.1 Từ chối TRƯỚC engine
Qua **biên production** (`WorkflowHandoffService.handoff()`), thử payload chứa: `phone`,
`address`, `message`, `Authorization`, `apiKey`, bí mật lồng nhau, object lạ, trường giống nội dung.

Vì hợp đồng đầu vào v1 là **danh sách trắng sáu trường** và `handoff()` **tự dựng** payload,
đường tiêm duy nhất có thật là `entityId`/`entityType`/`operation`/`destination`. ⇒ Bài này bơm
qua chính các trường đó (`entityId = '0912345678'`, `entityId = 'Bearer sk-…'`, …) và khẳng định
`WorkflowInputRejected` **ném ra** và **không có hàng outbox nào** được tạo.
*(Đây là điều `workflow-input.spec.ts` chưa đo: nó đo hàm, không đo cửa chính.)*

### 10.2 Đọc lại RUN THẬT trên engine — nơi dữ liệu THỰC SỰ được lưu
Trigger một payload hợp lệ, chờ chạy xong, rồi **dùng SDK đọc ngược từ Hatchet**:
`input` · `output` của từng task · `additionalMetadata` · `errorMessage`.

**Khẳng định:** khoá của `input` **đúng bằng** sáu trường hợp đồng; `additionalMetadata` chỉ chứa
các neo `nexagnet.*` + `traceparent`; **không** chuỗi nào khớp bộ dò PII/bí mật; token engine
không xuất hiện ở bất kỳ đâu trong run.

> **KHÔNG mở rộng `WorkflowEnginePort` bằng `getRunInput()`.** Production không cần đọc lại
> payload, và thêm một cửa đọc payload là thêm một đường để PII rơi vào log của chính ta.
> Bài test đóng vai kiểm toán viên và dùng SDK trực tiếp — đó là chỗ duy nhất được phép.

---

## 11. W9 — MA TRẬN DI TRÊN ĐỒ THỊ NEST THẬT

**File mới:** `apps/api/src/workflow/workflow-di-matrix.spec.ts` (unit — **không** cần hạ tầng,
`abortOnError: false`, token giả; boot **không được** mở kết nối nào)

**File mới (fixture):** `packages/tenant/src/__tests__/fixtures/workflow-enabled-noconfig/`
— khai `workflowEngine.adapter='hatchet'` + `credentialRef` trỏ tới biến **không đặt**.

| | Gói khách | Kỳ vọng |
|---|---|---|
| **A** | không có `workflowEngine` | API boot **bình thường**; cổng là `DisabledWorkflowEngineAdapter`; `WorkflowScheduler` **không** khởi động; `handoff()` trả `skipped` / **`NO_TENANT_BINDING`** — đúng mã lý do, không phải chỉ "không nổ" |
| **B** | bật, đủ cấu hình | API boot; `WorkflowEnginePort` là adapter Hatchet; `WorkflowDispatcher` + `WorkflowScheduler` **có mặt** |
| **C** | bật, **thiếu** token | boot **NÉM** với `WORKFLOW_ENGINE_TOKEN_MISSING` — fail-fast, **không** âm thầm rơi về `none` |
| **D** | `WorkflowWorkerModule` | §12 |

---

## 12. W10 — RANH GIỚI MODULE WORKER thành HỢP ĐỒNG CHỐNG HỒI QUY

`workflow-worker.module.spec.ts` đã có 4 khẳng định. Chúng kiểm **bốn lớp đã biết tên**; nếu mai
có người thêm lớp thứ sáu làm việc trong `onModuleInit` rồi import nhầm, test vẫn xanh.

**Nâng thành hợp đồng theo HÌNH DẠNG, không theo danh sách** (sửa tại chỗ, +2 khẳng định):
- liệt kê **toàn bộ** provider mà `WorkflowWorkerModule` phân giải được, khẳng định tập đó là
  **tập con** của danh sách cho phép ghi ngay trong test ⇒ thêm provider mới = test đỏ, buộc
  người thêm phải nói rõ ý định;
- khẳng định **không** provider nào của module worker hiện thực `OnModuleInit`, trừ danh sách
  trắng — đây là thứ bắt được `BotPoller` thứ hai kể cả khi không ai nhớ tên nó.

Bổ sung `BotPoller` vào các khẳng định `resolvable(...) === false` (hiện thiếu — nó có trong
bình luận nhưng **không** có trong test).

---

## 13. W11 — MÔ HÌNH LÝ DO HỎNG CÓ KIỂU (module riêng, không đụng file bẩn)

**File mới:** `apps/api/src/workflow/workflow-failure-reasons.ts` + `.spec.ts`

Khuôn sao từ `integration-handoff.steps.ts:HANDOFF_STEP_FAILURES`: mảng `as const` + nhãn tiếng
Việt + `retryable` là **thuộc tính của nguyên nhân**.

```
ENGINE_UNAVAILABLE           engine không nối được / gRPC chết             retryable
ENGINE_TRIGGER_AMBIGUOUS     timeout sau khi gửi — CÓ THỂ engine đã nhận   retryable, nguy hiểm
OUTBOX_RETRY_PENDING         đã thất bại, đang chờ backoff                 (trạng thái, không phải lỗi)
OUTBOX_ATTEMPTS_EXHAUSTED    hết số lần thử → `failed`, cần người          không
WORKER_UNAVAILABLE           không worker nào đăng ký phiên bản này        retryable
WORKFLOW_VERSION_UNAVAILABLE gói khách trỏ phiên bản bản chạy không có     không
PRIVACY_BOUNDARY_REJECTED    payload vi phạm danh sách trắng               không — LỖI CODE
DUPLICATE_OPERATION          khoá thao tác đã có hàng đang chạy            không — vô hại
EXTERNAL_LOOKUP_FAILED       preflight mức `lookup` không trả lời          retryable
```

Nối vào: `WorkflowDispatcher.dispatch()` phân loại lỗi thay vì nhét `message(error)` trần vào
`lastError`; `createWorkflowEngineAdapter` ném lỗi mang `reason` thay vì `Error` chuỗi.

**KHÔNG** chạm `observability/decision-reasons.ts` (đang +71 dòng chưa commit của Phase 0).
Ghi một dòng "nợ hợp nhất" vào bàn giao, làm ở phiên sau khi Phase 0 đã vào.

---

## 14. W12 — TƯƠNG QUAN TRACE + LIÊN KẾT AUDIT (đóng G2)

**Hồi quy trace xuyên 4 lớp** (thêm vào spec §6, dùng **giá trị thật** chứ không phải khuôn regex):
```
traceId cầu nối sinh  ==  WorkflowOutbox.traceId (đọc từ Postgres)
                      ==  additionalMetadata['nexagnet.traceId'] (đọc từ engine)
                      ==  phần trace-id của header `traceparent` điểm cuối nhận
```
Đây chính là lỗi `1e213c8` đã sửa; hiện chưa có bài nào so **bốn giá trị** với nhau.

**Đóng G2 — audit có `engineRunId`:** thêm một bản ghi audit **lúc dispatch thành công**
(`workflow.handoff.dispatched`) mang `engineRunId` + `workflowKey@version` + `traceId`.
Chỗ đặt: `WorkflowDispatcher` nhận `AuditLogService` **`@Optional()`** (fail-open, đúng bất biến
observability). **Không** copy lịch sử run của Hatchet về DB nghiệp vụ — chỉ **một dòng tham chiếu**.

---

## 15. CHỈ KHI §6–§14 XANH — hồ sơ triển khai production

Nếu bất kỳ mục nào đỏ: **dừng ở đây**, viết bàn giao, tuyên bố **NOT READY**. Không nhồi deploy.

Nếu xanh, làm theo thứ tự — **thiết kế + hợp đồng test, KHÔNG deploy trong phiên**:

1. **Readiness của worker (G3)** — worker phơi một tín hiệu máy đọc được sau khi `waitUntilReady()`
   trả về (HTTP `/readyz` cổng nội bộ, hoặc file mốc + `CMD test -f`). Healthcheck dựa trên
   **READY thật**, không phải tiến trình sống. `start_period` = **90s** (biên ~2,4× số đo nguội
   38s), không đặt sát mép, không hard-code 38.
2. **`deploy/netviet/compose.yaml`** — thêm `workflow-worker` (cùng `${APP_IMAGE}`, khác `command`),
   `hatchet-engine`, `hatchet-dashboard`, `hatchet-postgres`. Postgres của engine **RIÊNG** khỏi
   `postgres` nghiệp vụ, **không** publish cổng ra host, volume riêng, image ghim `postgres:15.6`,
   healthcheck. Tên volume/mạng theo quy ước stack hiện có — **không** bê `pocwf_*` sang.
3. **Biến môi trường** — mọi biến mới khai **tường minh** trong khối `environment:` và phủ bởi
   `deploy/netviet/secrets-passthrough.contract.test.mjs`. Đây là sự cố `f4ed3ee` đã xảy ra thật.
4. **TLS/mạng** — POC dùng `TLS_STRATEGY=none`; production **không** bê nguyên. Engine + Postgres
   engine chỉ trên mạng nội bộ của stack; dashboard **không** phơi cho tới khi auth/routing chuẩn.
   **Không** `force-recreate` edge (sự cố `2bdd930` làm sập **mọi** khách).
5. **Backup/restore** — engine DB vào `deploy/netviet/backup.sh` (tách khỏi backup nghiệp vụ);
   thử local: backup → huỷ → tạo lại → restore → lịch sử run đọc được; ghi tương thích với
   image đã ghim `v0.101.27`.
6. **Audit VM bằng SỐ MỚI** — `docker ps` · `docker stats --no-stream` · `docker system df` ·
   `df -h` · `free -m` · cổng đang dùng. **Không** dùng bảng ~270MB của runbook §7 (nó viết khi
   worker còn nằm trong tiến trình API — nay có **thêm một container**). Không `prune` mù.

---

## 16. Cổng test (mỗi task: RED → GREEN → REFACTOR → VERIFY)

```bash
pnpm --filter @netviet/api exec vitest run
```
```bash
pnpm --filter @netviet/tenant exec vitest run && pnpm --filter @netviet/shared exec vitest run
```
```bash
pnpm -w exec tsc -b && pnpm -w lint
```
Int spec (không chạy trong bộ thường — `runIf` giữ chúng ngủ):
```bash
RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 pnpm --filter @netviet/api exec vitest run src/workflow
```
Chạm `deploy/` thì thêm hợp đồng deploy; chạm `apps/web` thì thêm bộ web.

**Baseline phải giữ:** apps/api ≥ 1095 passed · tenant 64 · shared 89 · tsc + eslint xanh.

---

## 17. Rủi ro

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| Int spec chậm (worker nguội 38s × nhiều bài) | **Cao** | tái dùng **một** worker cho nhiều `it()` trong cùng `describe`; chỉ khởi động lại khi bài đó cần |
| Cửa sổ 5s của W4 hẹp trên máy chậm | Trung bình | tick đầu chạy lúc boot ⇒ cửa sổ là **cả chu kỳ**; nếu vẫn đua, khẳng định `attempts=0` sẽ bắt được và bài đỏ **trung thực** chứ không xanh giả |
| `docker stop hatchet-engine` làm hỏng POC stack | Thấp | `stop`/`start`, **không** `down -v`; postgres của engine không đụng tới |
| Sửa `worker-registration.ts` (G4) đụng test đang xanh | Trung bình | chỉ sửa **nếu** §9.1 đo ra hỏng; `workerName` là dữ liệu hiển thị, `engineName` **không đổi** |
| Vô tình stage việc song song | **Cao** | `git status --short` trước **mọi** commit; `git add` **liệt kê từng file**, không `git add -A`; không file nào của §1 được xuất hiện |
| Thêm reason làm xung đột với Phase 0 | Cao | module **riêng** (§13), hợp nhất ở phiên sau |

---

## 18. Định nghĩa HOÀN THÀNH

- [ ] W4 crash-after-commit **và** crash-before-commit xanh trên **Postgres thật**
- [ ] Có ít nhất một bài **FAIL nếu outbox chỉ nằm memory**
- [ ] W5 engine chết→lên xanh; ba ngữ nghĩa trùng lặp **đo riêng** và báo riêng
- [ ] Bảo đảm giao hàng viết đúng tên; **không** xuất hiện chữ "exactly-once"
- [ ] W6 worker `kill -9` → hồi phục; báo **cả** số POST **lẫn** số bản ghi áp dụng
- [ ] W7 hai worker cùng phiên bản đo xong; Gate A v1/v2 vẫn xanh; DRAIN có số
- [ ] W8 đọc `input`/`output`/`metadata` **từ engine thật**, không PII/bí mật
- [ ] W9 ma trận DI A/B/C xanh trên đồ thị Nest thật
- [ ] W10 ranh giới worker là hợp đồng **theo hình dạng**, không theo danh sách tên
- [ ] W11 mã lý do có kiểu, **không** chạm `decision-reasons.ts`
- [ ] W12 bốn lớp cùng một `traceId` bằng **giá trị thật**; audit có `engineRunId`
- [ ] tsc + eslint xanh; baseline test không tụt
- [ ] `git status` chứng minh **không** file song song nào bị chạm
- [ ] Bàn giao ghi rõ **READY / NOT READY** + việc kế tiếp chính xác
