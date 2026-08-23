# Plan: Nexagnet × Hatchet — production hardening + foundation integration

**Nguồn:** prompt phiên 22/08/2026 (§0–§36) · [workflow-engine-evaluation.md](../../docs/kien-truc/workflow-engine-evaluation.md)
**HEAD khi bắt đầu:** `f4ed3ee` · nhánh `feat/hoi-thoai-chot-don-main`
**Độ phức tạp:** LARGE (10 phase, ~10 commit)

---

## 0. Trạng thái worktree — rủi ro va chạm

```
worktree chính  C:/…/Z                       f4ed3ee  feat/hoi-thoai-chot-don-main   ← ta ở đây
worktree khác   …/scratchpad/wata-deploy     6aaa448  feat/wata-tenant-deploy
worktree khác   …/Z-ultty-gd1-test           89841cf  codex/collector-runs-anywhere
worktree khác   …/cool-maxwell-2f02b3        00a8a25  (prunable)
```

Worktree chính đang bẩn với **3 luồng việc khác nhau**. Phân loại theo chủ:

| Nhóm | File | Chủ | Xử lý |
|---|---|---|---|
| **Phase 0 observability** (đang dở) | `observability/{decision-reasons,recent-traces.sink,trace-context}.ts`, `orders/{orders.controller,orders.service}.ts`, `orders/*.spec.ts` (3 file mới), `apps/web/**`, `tools/trace-view.mjs`, `docs/phat-trien/**` | phiên trước | **KHÔNG CHẠM.** Không stage, không sửa. |
| **WATA tenant** | `tenants/wata/` | worktree `wata-deploy` | **KHÔNG CHẠM.** |
| **POC workflow engine** | `tools/poc-workflow-engine/`, `docs/kien-truc/{workflow-engine-evaluation,automation-architecture}.md` | phiên trước = cùng luồng việc này | **CỦA TA** — commit ở PHASE A. |
| `packages/tenant/src/tenant.schema.ts` | đang bẩn (experience `agent-workforce`) | phải xem diff trước khi sửa | Sửa **thêm dòng**, commit riêng field workflow. |

**Quy tắc commit:** mọi commit dùng `git add <đường dẫn cụ thể>`. **Cấm** `git add -A`, `git add .`, `git commit -a`. Trước mỗi commit chạy `git status --short` và đối chiếu.

**Rollback:** mỗi phase là 1 commit ⇒ `git revert <sha>` là đủ. Không phase nào sửa file của Phase 0/WATA nên revert không kéo theo việc người khác. Migration Prisma (PHASE F) là **additive-only** (bảng mới, không sửa bảng cũ) ⇒ rollback code không cần rollback DB.

---

## 1. Kết quả nghiên cứu (nguồn chính thức, 22/08/2026)

Phiên bản **không đổi** so với POC: engine `v0.101.27` (`api.github.com/…/releases/latest`), SDK `@hatchet-dev/typescript-sdk@1.28.2` (npm `dist-tags.latest`, `time.modified = 2026-08-11`). ⇒ Ghim của POC vẫn đúng, không phải nâng.

### 1.1 GATE A — không có tính năng nào ghim phiên bản code cho run đang chạy

Đã đọc hết 3 trang liên quan trong repo docs chính thức:

| Tính năng | Trang | Có ghim được run đang chạy vào code cũ? |
|---|---|---|
| **Worker affinity** (`desired_worker_labels` + `comparator` + `required`) | `v1/advanced-assignment/worker-affinity.mdx` | **KHÔNG.** Desired labels là thuộc tính của **định nghĩa task do worker đăng ký**. Worker v2 đăng ký cùng tên workflow ⇒ ghi đè desired labels ⇒ run cũ bị định tuyến theo tiêu chí của v2. |
| **Sticky assignment** (`SOFT`/`HARD`) | `v1/advanced-assignment/sticky-assignment.mdx` | **KHÔNG.** Ghim vào **một tiến trình worker**, không phải một **phiên bản code**. `HARD` + worker chết = run treo vĩnh viễn — chế độ hỏng còn tệ hơn. |
| **Namespace** | `v1/environments.mdx` | Công cụ **cách ly môi trường/lập trình viên**, không phải versioning. |

Trích nguyên văn `v1/workers.mdx` — đây là nguyên nhân gốc:

> "multiple workers can register the same task. In this scenario, Hatchet distributes work across all of them"

⇒ **Cùng tên workflow = việc bị chia cho cả worker v1 lẫn v2.** Đúng hiện tượng POC đo được (`validate`=v1, `finalize`=v2).

**CHIẾN LƯỢC CHỌN: TÊN WORKFLOW CÓ PHIÊN BẢN.** `<key>:v<N>`. Một bản triển khai worker đăng ký **đúng một** phiên bản. Run tạo trên `:v1` chỉ có worker đăng ký `:v1` phục vụ được. Khi worker v1 đã tắt, run v1 còn sót **nằm chờ (QUEUED)** — chế độ hỏng **AN TOÀN** (thấy được, sửa được) thay vì **âm thầm chạy code v2** (không thấy được).

Đây là giả thuyết, **PHASE A phải chứng minh bằng run thật** trước khi viết bất kỳ dòng integration nào.

### 1.2 GATE C — Hatchet tự công bố **at-least-once**

`v1/architecture-and-guarantees.mdx`, nguyên văn:

> "Hatchet is **at least once**: … This also means **a task can run more than once**, so your task code should be **idempotent**"

⇒ **Không hứa exactly-once.** Idempotency là của Nexagnet.

Hatchet **có** idempotency cấp engine (`v1/idempotency.mdx`, beta): biểu thức CEL trên input/metadata, hai kiểu `TTL-based` và `status-based`, va chạm thì **từ chối tạo run**. Đây là **chống trùng TRIGGER**, không phải chống trùng **tác dụng phụ ngoài**. Dùng được cho outbox (chống double-dispatch), **không** thay được khoá nghiệp vụ.

### 1.3 GATE D — RBAC & lưu trữ

`v1/user-roles.mdx`: `OWNER > ADMIN > MEMBER > VIEWER`. **VIEWER = chỉ đọc**, không trigger/replay/cancel được. `MEMBER` thì **replay/cancel được**.
Thêm một đòn bẩy chưa biết trước: cờ **"Can view payloads"** tắt được cho MEMBER/VIEWER ⇒ **ẩn input/output của task** khỏi dashboard và REST API. Nhưng: *"API tokens are not restricted"* ⇒ token worker vẫn đọc payload. ⇒ **Không thay được che-trước-khi-gọi-engine**, chỉ là lớp phòng thủ thứ hai.

`self-hosting/data-retention.mdx`: `SERVER_LIMITS_DEFAULT_TENANT_RETENTION_PERIOD` **mặc định 30 ngày** — run ở trạng thái cuối **bị XOÁ**. ⇒ **Lịch sử Hatchet KHÔNG phải kho lưu trữ.** Bản ghi bền vững phải nằm ở `AuditLog` của Nexagnet. Ràng buộc thiết kế cho PHASE G.

---

## 2. Khuôn mẫu trong repo sẽ bám theo (không phát minh lại)

| Hạng mục | Nguồn | Bám cái gì |
|---|---|---|
| Cổng + adapter theo tenant | `erp/erp.port.ts` · `erp/erp-adapter.ts` (thuần) · `erp/erp.provider.ts` (dây DI) | `abstract class Port` + `createXAdapter(name, deps)` thuần + `Provider` đọc `tenantX()` |
| Fail-closed khi tenant chưa cấu hình | `erp/noop-erp.adapter.ts` | Đọc trả rỗng, **ghi thì NÉM** kèm câu chỉ đúng file phải sửa |
| Compose theo capability | `app-composition.ts` (`owned('foundation'\|<capability>, …)`) | Đăng ký owner `foundation` (nền tảng) hoặc capability |
| Hàng đợi bền vững trên Postgres | `campaigns/prisma-campaign.repository.ts:130` `claimDue()` | `pg_try_advisory_xact_lock` + `FOR UPDATE … SKIP LOCKED` + lease + `attempts` |
| Đánh thức hàng đợi | `campaigns/campaign.scheduler.ts` | `setInterval` + `.unref()` + cờ `ticking`, trạng thái **không** nằm trong timer |
| Lý do quyết định có kiểu | `observability/decision-reasons.ts` | Mảng `as const` + union type + `DECISION_REASON_LABELS` |
| Che dữ liệu | `observability/telemetry-redaction.ts` (`scrubSecrets`/`scrubPii`) · `audit/audit-redaction.ts` | **Tái dùng bộ dò**, không viết bộ thứ ba |
| Schema gói khách | `packages/tenant/src/tenant.schema.ts` | zod `.strict()` + `superRefine` kiểm ràng buộc chéo |
| Test | `apps/api/src/**/*.spec.ts` · vitest + SWC | AAA, tên test mô tả hành vi |

---

## 3. Phase, phụ thuộc, hard gate

```
A (spike versioning) ──► B (privacy + shim) ──► C (idempotency)
                              │                     │
                              ▼                     ▼
                          D (Port + adapter) ◄──────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          E (tenant       F (outbox +      G (trace/audit
             binding)        migration)        linkage)
              └───────────────┼───────────────┘
                              ▼
                      H (workflow nền tảng thật)
                              ▼
                      I (đa khách + DI + ma trận hỏng)
                              ▼
                      J (deploy/runbook/tài nguyên)
```

**Hard gate:** nếu **PHASE A FAIL** ⇒ dừng toàn bộ B–J, viết `HATCHET VERSIONING BLOCKER`, mở lại Temporal. Đây là gate DUY NHẤT có quyền huỷ cả kế hoạch.

### PHASE A — spike versioning (hard gate)
**Chạm:** `tools/poc-workflow-engine/src/*` (+ file mới `version-spike.ts`), `evidence/`. **Không chạm** `apps/`/`packages/`.
**RED trước:** spike khẳng định bước ⑥ (*mọi bước còn lại của run cũ chạy v1*) phải **FAIL** với chiến lược cũ (một tên workflow), rồi **PASS** khi đổi sang tên có phiên bản. Chứng minh test có răng.
**Bằng chứng bắt buộc:** ① run v1 chạy → ② dừng ở chờ bền vững → ③ deploy v2 → ④ run mới đi v2 → ⑤ run cũ tiếp tục → ⑥ **mọi bước còn lại của run cũ chạy v1** → ⑦ v1 xả hết → ⑧ tắt v1 không hỏng run/lịch sử. Thêm ⑨: tắt v1 khi còn run v1 ⇒ run **treo QUEUED**, không nhảy sang v2.
**Commit:** `feat(workflow): POC + chien luoc ghim phien ban bang ten workflow`.

### PHASE B — biên riêng tư + shim SDK
**Chạm (mới):** `apps/api/src/workflow/workflow-input.ts` + spec, `apps/api/src/workflow/hatchet/hatchet-sdk.ts`.
**Thiết kế:** *allowlist* (zod `.strict()` cho từng workflow) — **không** phải scrubber. Rồi **bộ dò rò rỉ fail-closed** tái dùng `scrubSecrets`/`scrubPii`: nếu giá trị sau schema **vẫn đổi** khi scrub ⇒ **NÉM**. Che im lặng làm hỏng dữ liệu nghiệp vụ; ném làm lập trình viên thấy lỗi lúc test.
**RED trước:** (a) trường lạ bị loại; (b) `apiKey`/`token` trong payload ⇒ ném; (c) SĐT VN trong trường tự do ⇒ ném; (d) `additionalMetadata` chỉ chứa khoá `nexagnet.*` cho trước.
**Commit:** `feat(workflow): cong vao co allowlist + chan PII/bi mat truoc khi roi Nexagnet`.

### PHASE C — idempotency & replay
**Chạm (mới):** `apps/api/src/workflow/operation-key.ts` + spec; **thêm khối mới** vào `decision-reasons.ts` (file đang bẩn — xem diff trước).
**Thiết kế:** khoá thao tác do Nexagnet sở hữu; ba mức `idempotency: 'key' | 'lookup' | 'none'` khai trong binding tenant. Replay: `key`→tự động an toàn; `lookup`→phải kiểm trước; `none`→**chặn**.
**RED trước:** khoá ổn định qua nhiều lần sinh; khác nhau theo tenant/env/entity/opVersion; `assertReplaySafe` ném đúng mã với `none`.
**Commit:** `feat(workflow): khoa thao tac + ba muc an toan cua replay`.

### PHASE D — `WorkflowEnginePort` + adapter Hatchet
**Chạm (mới):** `workflow-engine.port.ts`, `workflow-engine.adapter.ts` (bảng tra thuần), `disabled-workflow-engine.adapter.ts`, `hatchet/hatchet-workflow-engine.adapter.ts`, `workflow.provider.ts`.
**Interface tối thiểu:** `trigger`, `sendEvent`, `cancel`, `describeRun`. **Không** `execute(anyWorkflow, anyPayload)`. Domain không thấy `HatchetClient`/token/gRPC.
**RED trước:** adapter `disabled` — đọc trả rỗng, `trigger` **NÉM**; bảng tra trả đúng hiện thực theo tên.
**Commit:** `feat(workflow): cong WorkflowEnginePort + adapter Hatchet sau mot shim`.

### PHASE E — ràng buộc workflow ↔ tenant
**Chạm:** `packages/tenant/src/tenant.schema.ts` (thêm `integrations.workflowEngine` + `policies.workflow`), `tenant.config.ts` (`tenantWorkflow()`), fixture trung tính.
**Thiết kế:** binding khai `workflowKey`, `version`, `enabled`, `idempotency`, `retry`, `credentialRef` (**tên biến môi trường**, không phải giá trị). **Không** secret trong `tenant.json`.
**RED trước:** schema từ chối giá trị trông như secret ở `credentialRef`; tenant **không** khai `workflowEngine` vẫn parse (boot bình thường).
**Commit:** `feat(tenant): rang buoc workflow theo goi khach, khong secret trong tenant.json`.

### PHASE F — outbox (dual-write)
**Chạm:** `apps/api/prisma/schema.prisma` (+ migration), `workflow-outbox.repository.ts`, `prisma-workflow-outbox.repository.ts`, `workflow-dispatcher.ts` + spec.
**Quyết định:** trigger trực tiếp sau commit **KHÔNG** đảm bảo (Order commit → tiến trình chết → Hatchet chưa nhận). ⇒ **outbox bắt buộc**. Bản ghi outbox ghi **trong cùng `$transaction`** với thay đổi nghiệp vụ; dispatcher nhận việc bằng đúng khuôn `claimDue()`.
**RED trước:** (a) commit thành công + trigger ném ⇒ hàng còn `pending`, tick sau gửi lại; (b) **giả lập crash** giữa commit và trigger ⇒ hàng vẫn còn; (c) hai dispatcher đồng thời ⇒ chỉ một nhận; (d) Hatchet down ⇒ **không mất** sự kiện, backoff.
**Migration:** additive-only. Rollback code không cần rollback DB.
**Commit:** `feat(workflow): outbox giao dich — su kien nghiep vu khong mat khi engine chet`.

### PHASE G — nối trace + audit
**Chạm:** `workflow-run-reference.ts` + spec; `telemetry.decision/stateChange` trong dispatcher; `AuditLogService.append` khi trigger.
**Ràng buộc mới:** Hatchet **xoá run sau 30 ngày** ⇒ audit Nexagnet giữ `engineRunId` + `workflowKey@version` + `traceId`, **không** copy lịch sử.
**RED trước:** audit ghi đúng `engineRunId`/`traceId`; `traceparent` đúng khuôn `toTraceparent`; telemetry hỏng **không** làm hỏng trigger (fail-open).
**Commit:** `feat(quan-sat): noi engineRunId ↔ traceId ↔ audit nghiep vu`.

### PHASE H — workflow nền tảng thật, trung tính
**Chạm (mới):** `workflows/integration-handoff.v1.ts`, `workflow-worker.service.ts`, `workflow.module.ts`.
**Trung tính:** `integration-handoff:v1` — bàn giao **tham chiếu** (`entityType`+`entityId`) đã tối thiểu hoá tới điểm cuối do tenant cấu hình, khoá idempotency do Nexagnet sở hữu. Không tên khách, không SKU, không giá.
**Tham chiếu vs ảnh chụp:** gửi **tham chiếu**; worker gọi lại `WorkflowDataPort` lấy dữ liệu mới nhất ⇒ PII **không** nằm trong `input` của engine.
**RED trước:** E2E qua dây DI thật (Nest test module) → outbox → Port → adapter ghi lại lời gọi → khẳng định payload **không** chứa PII.
**Commit:** `feat(workflow): workflow nen tang trung tinh integration-handoff:v1`.

### PHASE I — đa khách + DI + ma trận hỏng
**Chạm:** `apps/api/src/workflow/*.spec.ts`, `app-composition.spec.ts`, fixture tenant A/B/C.
**RED trước:** tenant A bật (Port = Hatchet adapter), tenant B **không khai** (Port = disabled, boot **bình thường**), tenant C cùng khuôn khác binding — **không sửa một dòng core nào** giữa A và C. Cộng ma trận hỏng.
**Commit:** `test(workflow): ba khach, mot khuon — va ma tran hong`.

### PHASE J — triển khai / runbook / tài nguyên
**Chạm:** `docs/kien-truc/workflow-engine-evaluation.md`, `docs/phat-trien/van-hanh/workflow-engine-runbook.md` (mới), compose production-ready, `docs/phat-trien/ke-hoach/tong-quan.md` (**chỉ thêm dòng**, file đang bẩn).
**Không deploy.** Chỉ tính tài nguyên + thủ tục REGISTER→ACTIVATE→DRAIN→DEACTIVATE→REMOVE + backup/restore.
**Commit:** `docs(workflow): runbook trien khai, RBAC, backup va ke hoach tai nguyen`.

---

## 4. Cổng test (chạy trước khi kết luận)

```bash
pnpm --filter @netviet/tenant build
pnpm --filter @netviet/api test
pnpm --filter @netviet/tenant test
pnpm typecheck
pnpm lint
```

---

## 5. Rủi ro

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| PHASE A không chứng minh được ghim phiên bản | TRUNG BÌNH | Hard gate — dừng, ghi BLOCKER, mở lại Temporal. Không tự viết lớp versioning. |
| Va chạm với Phase 0 observability đang dở | CAO | `git add` theo đường dẫn cụ thể; `decision-reasons.ts` chỉ **thêm** khối mới ở cuối |
| Migration Prisma đụng DB khách | THẤP | Additive-only; không sửa bảng/cột cũ |
| Ma sát ESM với SDK Hatchet | THẤP | Một shim duy nhất (PHASE B); phần còn lại import qua shim |
| Hatchet xoá run sau 30 ngày | TRUNG BÌNH | Audit Nexagnet giữ tham chiếu bền vững (PHASE G); runbook nêu rõ |
| Phạm vi lớn cho một phiên | CAO | Mỗi phase một commit độc lập; dừng ở phase nào cũng để repo xanh |
