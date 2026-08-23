# Plan: Hatchet worker foundation — từ "trigger được" thành "chạy hết thật"

**Nguồn:** prompt phiên 22/08/2026 (phiên 5) · [ban-giao-workflow-engine.md](../../docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md) §10–§12
**Kế hoạch trước (A–J, đã xong):** [hatchet-foundation.plan.md](hatchet-foundation.plan.md)
**HEAD khi bắt đầu:** `8c9f9f5` · nhánh `feat/hoi-thoai-chot-don-main` (ahead 9 so với origin)
**Độ phức tạp:** LARGE (9 phase, ~8 commit)

---

## 0. Audit worktree — đã kiểm, KHÔNG suy đoán

```
git rev-parse HEAD           8c9f9f5476e50c02894e3f2a7ef442be3724647a
git status --short --branch  ahead 9 · 14 file M · 5 mục ??
docker compose ls            pocwf running(3)  ← Hatchet POC ĐANG SỐNG (4 giờ)
```

| Nhóm | File | Chủ | Xử lý phiên này |
|---|---|---|---|
| **Phase 0 observability** | `observability/{decision-reasons,recent-traces.sink,trace-context}.ts` · `orders/{orders.controller,orders.service}.ts` + 3 `*.spec.ts` mới · `apps/web/**` · `tools/trace-view.mjs` · `docs/phat-trien/van-hanh/debugging.md` · **`docs/phat-trien/ke-hoach/tong-quan.md` (+320 dòng)** | phiên khác | **KHÔNG CHẠM** |
| **WATA tenant** | `tenants/wata/` | worktree `wata-deploy` | **KHÔNG CHẠM** |
| Workflow foundation | `apps/api/src/workflow/**` (đã commit) | luồng này | của ta |

**Hệ quả bắt buộc, kiểm bằng `git diff --stat`:**
1. `tong-quan.md` **VẪN BẨN (+320)** ⇒ §15 của prompt → **KHÔNG ghi `tong-quan.md`**. Trạng thái ghi vào bàn giao riêng.
2. `decision-reasons.ts` **VẪN BẨN** ⇒ §6.2 bàn giao (gộp mã lý do workflow) **vẫn bị chặn**. Không gộp phiên này.

**Quy tắc commit:** `git add <đường dẫn cụ thể>` cho từng file. **Cấm** `git add -A` / `git add .` / `git commit -a`. `git status --short` trước mỗi commit.

---

## 1. Nguồn sự thật đã VERIFY lại từ source (không tin bàn giao suông)

| Khẳng định của bàn giao | Verify | Kết quả |
|---|---|---|
| Chưa có worker nào | `ls apps/api/src/workflow/` — không có `worker*.ts`, không có `workflows/` | ✅ đúng |
| `engineWorkflowName()` ép `<key>.v<N>` | `workflow-engine.port.ts:60-78` | ✅ đúng, có 2 guard ném |
| Chưa khách nào bật engine | `grep -rl workflowEngine tenants/` → rỗng | ✅ đúng |
| Deploy huỷ container `api` | `deploy/netviet/deploy-stack.sh:88` `up -d --no-deps --force-recreate api web` | ✅ **đúng nguyên văn** |
| `WorkflowModule` chỉ export cầu nối + cổng | `workflow.module.ts:141` | ✅ đúng |
| Registry chỉ có `v1` | `workflow-registry.ts:76` | ✅ đúng |
| Outbox có model Prisma | `schema.prisma:734` `WorkflowOutbox`, `operationKey @unique` | ✅ đúng |

**Phát hiện MỚI của phiên này (không có trong bàn giao) — nó đổi thiết kế worker:**

```
apps/api/src/campaigns/campaign.scheduler.ts:9    CampaignScheduler   implements OnModuleInit
apps/api/src/channels/zalo-user.client.ts:80      ZaloUserClient      implements OnModuleInit
apps/api/src/ingest/zca-listener.ts:27            ZcaListener         implements OnModuleInit
apps/api/src/ingest/bot-poller.ts:148             BotPoller           implements OnModuleInit
apps/api/src/workflow/workflow.module.ts:37       WorkflowScheduler   implements OnModuleInit
```

⇒ Nếu `worker-main.ts` boot `AppModule.forRoot()`, tiến trình worker sẽ **đồng thời**:
mở listener zca **thứ hai** trên cùng tài khoản Zalo (một tài khoản chỉ chịu được **một** listener — listener của `api` sẽ bị đá ra), chạy **campaign scheduler thứ hai**, và chạy **workflow dispatcher thứ hai**.

**Kết luận D2 dưới đây là hệ quả của bằng chứng này, không phải sở thích.**

---

## 2. Hai quyết định kiến trúc — có bằng chứng, cần chốt trước khi code

### D1 — Worker là CONTAINER RIÊNG, không nằm trong tiến trình API

**Bằng chứng:** `deploy/netviet/deploy-stack.sh:88` huỷ và tạo lại container `api` **mỗi lần deploy**.
Worker sống trong đó ⇒ worker `.v1` duy nhất biến mất theo ⇒ mọi run `.v1` đang dở **nằm chờ vĩnh viễn** ⇒ bước **DRAIN** của [runbook §2](../../docs/phat-trien/van-hanh/workflow-engine-runbook.md) **không thực hiện được** (không có cách giữ worker cũ sống trong khi bản mới lên, vì chung một container).

Tức là nhúng worker vào API **phá phần vận hành của Gate A** dù phần kỹ thuật vẫn đúng.
→ Container riêng, **cùng image, khác `command`**, vòng đời độc lập với `api`.

### D2 — Worker boot MODULE HẸP, không boot `AppModule`

**Bằng chứng:** 5 `OnModuleInit` ở §1. → `WorkflowWorkerModule` chỉ gồm: config/env, `PrismaService` (cho `settle` ghi audit), `AuditLogService`, `TelemetryService`, `WorkflowEnginePort`.
**Tuyệt đối không** có: channels, ingest, campaigns, knowledge, pipeline, `WorkflowScheduler`.

> Đây là điểm cần xác nhận: worker **không** dùng lại `AppModule`, nên nó không tự động thừa hưởng
> mọi provider tương lai. Đổi lại nó không thể vô tình khởi động một side effect nào của API.

---

## 3. Khuôn mẫu trong repo sẽ bám (không phát minh lại)

| Hạng mục | Nguồn | Bám cái gì |
|---|---|---|
| Điểm vào tiến trình | `apps/api/src/main.ts` | `reflect-metadata` → `load-dotenv` → `NestFactory` → `enableShutdownHooks()` |
| Boot bằng DI thật | `app.module.boot.spec.ts` | `NestFactory.createApplicationContext(await Module.forRoot(), {logger:['error']})` |
| Test cần hạ tầng thật | `prisma-campaign.repository.int.spec.ts:5` | `describe.runIf(process.env.RUN_*_IT === '1')` |
| Điều phối worker con | `tools/poc-workflow-engine/src/version-spike.ts:20` | `spawn` + chờ dòng `READY` trên stdout làm giao kèo |
| Điểm cuối có kiểm soát | `tools/poc-workflow-engine/src/proof-endpoint.ts` | `mode=ok\|fail_then_ok\|rate_limited\|timeout` + `/_state` |
| Định nghĩa bước | `tools/poc-workflow-engine/src/spike-workflow.ts` | `hatchet.workflow({name})` + `.task({name,parents,retries})` |
| Hợp đồng biến môi trường | `deploy/netviet/secrets-passthrough.contract.test.mjs` | biến render ra **phải** có trong `environment:` của compose |
| Lý do từ chối có kiểu | `workflow-input.ts:53` | mảng `as const` + union + bảng nhãn tiếng Việt |

---

## 4. Phase & phụ thuộc

```
W0 fixture + endpoint
   │
W1 worker skeleton ──► W2 integration-handoff.v1 ──► W3 vòng đời worker (A–E)
                                                        │
                            ┌───────────────────────────┼──────────────┐
                            ▼                           ▼              ▼
                     W4 ma trận hỏng (7)      W5 v2 + hồi quy      W6 riêng tư
                            │                     phiên bản        biên thật
                            └───────────────┬──────────────────────────┘
                                            ▼
                                    W7 trace/audit + DI
                                            ▼
                                W8 deployment profile + hợp đồng env
                                            ▼
                                W9 audit tài nguyên VM → quyết định deploy
```

---

### W0 — Fixture khách trung tính + điểm cuối có kiểm soát
**Tạo:** `tools/poc-workflow-engine/fixtures/tenant-alpha/{tenant.json,data/knowledge.json}`
**Vì sao ngoài `tenants/`:** `tenant-packs.spec.ts` quét `tenants/` và sẽ coi fixture là khách thật.
Nạp bằng `TENANT_DIR=<path>` — đường đã có sẵn cho khách chạy hạ tầng riêng.
Fixture khai `integrations.workflowEngine`: `adapter: hatchet`, `credentialRef: WORKFLOW_ENGINE_TOKEN`, binding `integration-handoff@v1`, `destination: proof-endpoint`, `idempotency: key`.
**Điểm cuối:** tái dùng `proof-endpoint.ts` nguyên trạng (đã có đủ 4 mode + `/_state`).
**RED:** `tenant-packs.spec.ts` vẫn xanh (fixture không bị hiểu nhầm là khách); fixture parse được qua zod thật.
**Commit:** `test(workflow): fixture khach trung tinh cho E2E qua bien production`

---

### W1 — Bộ khung worker (container riêng)
**Tạo:**
```
apps/api/src/workflow/worker-main.ts              ← điểm vào tiến trình
apps/api/src/workflow/workflow-worker.module.ts   ← module HẸP (D2)
apps/api/src/workflow/workflow-worker.service.ts  ← OnModuleInit đăng ký, OnModuleDestroy tắt sạch
```
**Bất biến ép trong code (không phải trong runbook):**
- Đọc `WORKFLOW_WORKER_VERSION`; **thiếu ⇒ ném lúc boot** với câu chỉ đúng biến phải đặt.
- Đăng ký **đúng một** tên, lấy từ `engineWorkflowName(key, version)` — không nối chuỗi nội tuyến.
- Phiên bản không có trong `workflowInputContract(key, version)` ⇒ ném `WORKFLOW_VERSION_UNKNOWN`
  (đã có sẵn ở `workflow-registry.ts:96`) — chặn "deploy ngược phiên bản" ngay lúc worker lên.
- In một dòng `READY workflow=<tên> pid=<pid>` — giao kèo để test biết lúc nào đăng ký xong
  (khuôn `spike-worker.ts:18`).
- `OnModuleDestroy` gọi `worker.stop()` rồi mới đóng client.

**RED trước:** (a) thiếu `WORKFLOW_WORKER_VERSION` ⇒ ném, thông điệp nêu tên biến; (b) `v9` lạ ⇒ ném `WORKFLOW_VERSION_UNKNOWN`; (c) tên đăng ký **bằng đúng** `engineWorkflowName(...)`; (d) module hẹp **không** kéo theo `ZcaListener`/`CampaignScheduler`/`WorkflowScheduler` (test khẳng định `moduleRef.get(X,{strict:false})` ném).
**Commit:** `feat(workflow): tien trinh worker rieng — mot container mot phien ban`

---

### W2 — `integration-handoff.v1`: ba bước
**Tạo:** `apps/api/src/workflow/workflows/integration-handoff.v1.ts` (+ `steps/` nếu >250 dòng)

| Bước | Việc | Lý do từ chối có kiểu |
|---|---|---|
| `resolve` | `destination` **logic** → URL thật, đọc `WORKFLOW_DESTINATION_<TÊN>` từ env | `DESTINATION_NOT_CONFIGURED` |
| `dispatch` | POST + `Idempotency-Key: <operationKey>` + `traceparent`; `retries: 3` + backoff | `UPSTREAM_5XX` · `UPSTREAM_TIMEOUT` · `RATE_LIMITED` · `UPSTREAM_4XX` |
| `settle` | ghi `AuditLog` completion; trả `engineVersion` + `externalRef` | — |

**Bốn ràng buộc bắt buộc (từ prompt §2):**
- **typed input** — parse lại bằng chính `integrationHandoffV1Input` của registry, không zod thứ hai.
- **không object nghiệp vụ thô** — chỉ `entityType`+`entityId`; ép bằng chính hợp đồng trên.
- **khoá thao tác TÍNH LẠI** bằng `buildOperationKey()` từ input + `nexagnet.environment` trong
  `additionalMetadata`. Không mang khoá đi hai lần — và việc dựng lại được **chính là** bằng chứng
  khoá tất định.
- **traceparent** đọc từ `additionalMetadata`, gắn vào header outbound.

**URL đích KHÔNG nằm trong `tenant.json`** (gói khách nằm trong git) — chỉ tên logic nằm đó.
**RED trước (thuần, chưa cần engine):** 4 lý do từ chối map đúng từ 500/429/timeout/404; header `Idempotency-Key` **bằng đúng** khoá handoff sinh ra; `traceparent` đi qua nguyên vẹn; input thiếu trường ⇒ ném trước khi gọi mạng.
**Commit:** `feat(workflow): integration-handoff.v1 — ba buoc, ly do hong co kieu`

---

### W3 — Vòng đời worker (P0, năm kịch bản A–E)
**Tạo:** `apps/api/src/workflow/worker-lifecycle.int.spec.ts` — `describe.runIf(RUN_WORKFLOW_IT==='1')`
Điều khiển worker bằng `spawn` + chờ `READY` (khuôn `version-spike.ts`).

| | Kịch bản | Khẳng định |
|---|---|---|
| A | API boot | worker đăng ký (run kích hoạt được chạy, không nằm `QUEUED`) |
| B | shutdown graceful (`SIGTERM`) | `worker.stop()` chạy, tiến trình thoát mã 0, không run nào chết dở |
| C | **kill -9 giữa workflow** | engine giữ run; worker mới lên → run **chạy tiếp** |
| D | bước đã xong | **không** chạy lại side effect — đọc `/_state` `attemptsByKey` |
| E | **2 instance cùng chạy** | cả hai đăng ký cùng `.v1`; engine chia việc; **không** trùng tác dụng phụ (khoá thao tác) |

**E là câu hỏi mở thật:** hai worker cùng phiên bản là hành vi **được tài liệu Hatchet công bố** ("distributes work across all of them"). Cần đo, và ghi kết quả — nếu nó tạo tác dụng phụ trùng thì đó là phát hiện chặn, không phải chi tiết.
**Commit:** `test(workflow): vong doi worker — boot, tat sach, chet giua chung, hai ban sao`

---

### W4 — Ma trận hỏng (7 chứng minh của prompt §6)
**Tạo:** `apps/api/src/workflow/failure-matrix.int.spec.ts`

1. endpoint 500 → **retry** (đọc `attemptsByKey` > 1, cuối cùng `COMPLETED`)
2. **Hatchet down** (`docker compose -p pocwf stop hatchet-engine`) → outbox **còn**, `status=pending`
3. Hatchet lên lại → tick sau **dispatch tiếp**
4. **API chết sau business commit trước trigger** → cần `PERSISTENCE=prisma` + Postgres thật
   (`docker-compose.yml` lên; `DATABASE_URL` đã có trong `.env`). Với `memory` thì hàng chết theo
   tiến trình ⇒ **phép đo mù**. Đây là lý do kịch bản này bắt buộc dùng Prisma.
5. worker chết giữa chừng → run hồi phục (chồng lấn W3-C, giữ để ma trận đọc độc lập)
6. **tick trùng** (gọi `tick()` hai lần đồng thời) → một hàng, một run
7. **replay không an toàn** → `assertReplaySafe` với `idempotency:'none'` ⇒ **BLOCKED**

**Chú ý:** #2/#3 dừng container Hatchet POC — chỉ ảnh hưởng `pocwf`, không stack nào khác.
**Commit:** `test(workflow): ma tran hong — 7 tinh huong chay that`

---

### W5 — `v2` + hồi quy versioning
**Tạo:** `workflows/integration-handoff.v2.ts` + `integrationHandoffV2Input` trong registry.

**`v2` KHÔNG phải phiên bản giả.** Nó thêm bước `preflight` trước `dispatch`: với đích
`idempotency: 'lookup'`, hỏi hệ ngoài xem khoá thao tác đã tạo bản ghi chưa; có rồi thì bỏ
`dispatch`. Gate C định nghĩa ba mức `key`/`lookup`/`none` nhưng **chưa gì hiện thực mức `lookup`** —
`v2` lấp đúng khoảng trống đó và đồng thời là phương tiện tự nhiên cho hồi quy.

**Hồi quy (prompt §7) — không cần bịa bước chờ:**
```
① endpoint mode=timeout  → run v1 treo trong `dispatch`
② khởi động worker v2    → v1 CÒN SỐNG
③ run mới                → phải đi v2
④ thả endpoint           → `dispatch`+`settle` của run cũ phải chạy trên worker v1
⑤ DRAIN countInFlight('integration-handoff','v1') === 0 → mới được rút v1
```
**Hard gate:** nếu bước ④ cho thấy run cũ chạy code v2 ⇒ **dây nối production phá proof của Gate A** ⇒ **STOP**, viết BLOCKER, không đi tiếp W6–W9.
**Commit:** `feat(workflow): integration-handoff.v2 (preflight lookup) + hoi quy ghim phien ban`

---

### W6 — Hồi quy riêng tư tại BIÊN THẬT (prompt §8)
**Tạo:** `apps/api/src/workflow/privacy-boundary.int.spec.ts`
Bơm qua `WorkflowHandoffService.handoff()` (**không** gọi thẳng `buildWorkflowInput`): `phone`,
`address`, nội dung tin nhắn, `Authorization`, `apiKey`, bí mật lồng nhau, trường lạ.
**Kỳ vọng:** ném **trước khi** tới Hatchet, mã lý do đúng cho từng loại.
**Phần không thể thay bằng unit test:** với một run **hợp lệ**, đọc `input` **thực tế** của run trên
engine (`runs.get()` + `includePayloads`) và khẳng định không có PII/bí mật ở đó.
**Commit:** `test(workflow): rieng tu tai bien that — doc input cua run tren engine`

---

### W7 — Trace/audit + DI production (prompt §4, §9)
**Tạo:** `apps/api/src/workflow/workflow-di.int.spec.ts` + `trace-correlation.int.spec.ts`

**DI (boot `AppModule.forRoot()` thật, không `new Service()`):**
- `TENANT_DIR=fixture bật` → `WorkflowEnginePort` là adapter Hatchet, dispatcher chạy
- `TENANT=ultty` (chưa bật) → `DisabledWorkflowEngineAdapter`, **không** dispatcher, boot **bình thường**
- bật engine nhưng **thiếu** token → fail-fast, thông điệp nêu đúng tên biến

**Trace:** một `traceId` đi trọn `Nexagnet → outbox → Hatchet run metadata → worker → endpoint`
(endpoint đã ghi `traceparent` vào `/_state.journal`).
**Audit:** có `engineRunId`, `traceId`, `entityType:entityId`, `workflowKey@version`.
**Không** copy lịch sử Hatchet vào Prisma.
**Commit:** `test(workflow): tuong quan trace/audit + DI qua ba cau hinh khach`

---

### W8 — Hồ sơ triển khai production (prompt §10, §12)
**Tạo:** `deploy/netviet/hatchet.compose.yaml` (hoặc khối trong `compose.yaml` — quyết định lúc làm)
**Sửa:** `deploy/netviet/compose.yaml` (+ service `workflow-worker`, + biến env), `render-secrets.sh`, `secrets-passthrough.contract.test.mjs`

| Yêu cầu | Cách đạt |
|---|---|
| Ghim phiên bản | engine/dashboard/migrate/admin `v0.101.27`; SDK `1.28.2` (đã ghim `--save-exact`) |
| Postgres riêng | service `hatchet-postgres` + volume riêng; **không** dùng DB nghiệp vụ |
| Postgres không public | **bỏ** `ports:` (POC publish 5744 — không bê nguyên) |
| Mạng nội bộ | chỉ mạng `backend` của stack; dashboard ra ngoài qua edge |
| TLS | `SERVER_GRPC_INSECURE=false` + TLS ở edge; adapter mặc định **có** TLS |
| Credentials | `WORKFLOW_ENGINE_TOKEN` từ Secret Manager → `render-secrets.sh` → `compose.yaml` |
| Dashboard auth | sau edge có xác thực; Sale = `VIEWER` (runbook §4.4) |
| Volume bền + healthcheck + `restart: always` + resource limit | khuôn service `postgres` hiện có |
| Queue | **PostgreSQL mode** (`SERVER_MSGQUEUE_KIND: postgres`) — không RabbitMQ, đúng `docker-compose.release.yml` chính thức |
| Backup | `backup.sh` thêm đường riêng cho Postgres engine, tách khỏi DB nghiệp vụ |

**Worker service:** cùng `${APP_IMAGE}`, `command: ["node","apps/api/dist/workflow/worker-main.js"]`,
`WORKFLOW_WORKER_VERSION: v1`, mount `tenant-pack` (worker cần `TENANT_DIR` để dựng lại khoá thao tác).
Đã verify `tsconfig.build.json` chỉ loại `*.spec.ts` ⇒ `dist/workflow/worker-main.js` **có** được build.

**Hợp đồng chống lặp lỗi `ADVICE_COMPOSER`:** mọi biến mới (`WORKFLOW_ENGINE_TOKEN`,
`WORKFLOW_ENGINE_HOST_PORT`, `WORKFLOW_ENGINE_TLS_STRATEGY`, `WORKFLOW_ENGINE_DASHBOARD_URL`,
`WORKFLOW_WORKER_VERSION`, `WORKFLOW_DESTINATION_*`) phải: render ra + có trong `environment:` +
qua `secrets-passthrough.contract.test.mjs`. **RED trước:** thêm biến vào render trước, xem test đỏ, rồi mới thêm vào compose.
**Commit:** `feat(deploy): ho so trien khai Hatchet + worker container cho stack khach`

---

### W9 — Audit tài nguyên VM → quyết định deploy (prompt §11, §12)
**Đo bằng số MỚI, không dùng số cũ:**
```bash
docker ps --format '{{.Names}}\t{{.Status}}'; docker stats --no-stream; docker system df; df -h /; free -m; uptime
```
Tính tác động của engine + dashboard + Postgres engine (~270 MB theo runbook §7 — **phải đo lại**).
**Không prune mù. Không ảnh hưởng 3 stack khác. Chỉ `ultty-gd1-test`, không production/WATA.
Không `force-recreate` edge** (sự cố `2bdd930` làm sập mọi khách).
**Nếu VM không đủ dư ⇒ NOT READY, ghi số đo, dừng — không deploy "thử xem sao".**
**Commit:** `docs(workflow): ban giao phien 5 — worker, ma tran hong, ho so trien khai`

---

## 5. Việc CÓ TRONG PROMPT nhưng CỐ Ý để cuối / defer

| Việc | Xử lý | Vì sao |
|---|---|---|
| §14 nút "Mở workflow run" trên console | Verify route `/runs/<id>` trên dashboard **đang chạy** (cổng 8744). Đúng ⇒ làm; sai ⇒ **defer + ghi lý do**, không hack URL | Prompt §14 nói rõ: không được chặn READY |
| §13 xác nhận dashboard bằng mắt | Chuẩn bị URL + danh sách 10 mục kiểm, **DỪNG** đúng lúc và nói chính xác cần bấm gì | Không gõ mật khẩu thay người dùng |
| §15 ghi `tong-quan.md` | **KHÔNG** — file đang bẩn +320 dòng của Phase 0 | Ghi vào bàn giao riêng, báo rõ |
| Gộp mã lý do vào `decision-reasons.ts` | **KHÔNG** — file đang bẩn | Điều kiện §6.2 bàn giao chưa đạt |
| `.int.spec.ts` cho `PrismaWorkflowOutboxRepository` | Làm trong W4 #4 (cần DB thật cho crash-window) | Hai việc trùng nhau |

---

## 6. Cổng test (chạy trước khi kết luận từng phase)

```bash
pnpm --filter "@netviet/tenant..." build && pnpm --filter @netviet/api test
```
```bash
pnpm --filter @netviet/tenant test && pnpm --filter @netviet/shared test
```
```bash
pnpm typecheck && pnpm lint
```
```bash
pnpm test:deploy-contracts
```
Các int-spec cần hạ tầng chạy riêng, **không** vào CI mặc định:
```bash
RUN_WORKFLOW_IT=1 pnpm --filter @netviet/api exec vitest run src/workflow
```

**Baseline phải giữ (từ bàn giao §5):** api 1070 passed / 25 skipped · tenant 60 · shared 89 · web 89 · deploy 30.

---

## 7. Rủi ro

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| Dây nối production phá proof Gate A (W5 ④) | THẤP | **Hard gate** — STOP, viết BLOCKER, không đi tiếp |
| Hai worker cùng phiên bản tạo tác dụng phụ trùng (W3-E) | TRUNG BÌNH | Đo trước khi kết luận; khoá thao tác + `idempotency` là chốt chặn; nếu thủng ⇒ chặn READY |
| Module hẹp thiếu provider ⇒ worker chết lúc chạy chứ không lúc boot | TRUNG BÌNH | W1 test boot module hẹp bằng DI thật, không `new Service()` |
| Crash-window (W4 #4) cần Postgres — máy dev chưa chạy DB | CAO | `docker-compose.yml` lên trước; nếu không lên được ⇒ ghi **chưa kiểm**, không tuyên bố pass |
| VM không đủ tài nguyên | TRUNG BÌNH | W9 đo trước, deploy sau. Không đủ ⇒ NOT READY |
| Biến env mới không tới container | TRUNG BÌNH | Hợp đồng W8, RED trước (đã có tiền lệ `ADVICE_COMPOSER`) |
| Va chạm Phase 0 / WATA | CAO | `git add` theo đường dẫn; không chạm `decision-reasons.ts`, `tong-quan.md`, `tenants/wata/` |
| Phạm vi lớn cho một phiên | CAO | Mỗi phase một commit revert độc lập; dừng ở phase nào repo cũng xanh |

---

## 8. Định nghĩa READY FOR GD1-TEST

Chỉ tuyên bố READY khi **tất cả** xanh: W1 (worker đăng ký thật) · W2+W3 (workflow chạy hết,
crash recovery) · W4 (7 tình huống hỏng) · W5 (hồi quy phiên bản) · W6 (riêng tư biên thật) ·
W7 (trace/audit + DI ba cấu hình) · W8 (hồ sơ triển khai an toàn) · W9 (tài nguyên VM đo mới) ·
CI đầy đủ xanh.

Xác nhận dashboard bằng mắt là **nghiệm thu thủ công cuối** — chuẩn bị sẵn, không tự làm thay.

---

**CHỜ XÁC NHẬN.** Trả lời `yes` / `proceed` để bắt đầu W0, hoặc `modify: …` để sửa.
