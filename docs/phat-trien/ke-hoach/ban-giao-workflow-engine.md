# Bàn giao — Nexagnet × Hatchet, phiên 22/08/2026 (phiên 3)

> Nhánh `feat/hoi-thoai-chot-don-main` · HEAD đầu phiên `f4ed3ee` → cuối phiên `3e21443`
> Kế hoạch: [.claude/plans/hatchet-foundation.plan.md](../../../.claude/plans/hatchet-foundation.plan.md)
> Runbook: [workflow-engine-runbook.md](../van-hanh/workflow-engine-runbook.md)
> Bằng chứng gate versioning: [version-gate-a.md](../../../tools/poc-workflow-engine/evidence/version-gate-a.md)

## 1. Một câu

Bốn gate production-readiness của Hatchet **đã đóng bằng test chạy được**, và nền tảng đã có lớp
mỏng nối vào (`apps/api/src/workflow/`) — nhưng **chưa khách nào bật, chưa deploy, và chưa có
worker nào đăng ký workflow với engine**.

## 2. Trạng thái bốn gate

| Gate | Kết luận | Bằng chứng |
|---|---|---|
| **A — ghim phiên bản** | ✅ **PASS** bằng **tên workflow mang phiên bản** `<key>.v<N>` | Thí nghiệm có đối chứng chạy trên engine thật: `shared` FAIL / `versioned` PASS |
| **B — tối thiểu hoá dữ liệu** | ✅ **PASS** bằng **danh sách trắng + ném**, không phải bộ lọc | `workflow-input.spec.ts` 18 test |
| **C — idempotency / replay** | ✅ **PASS** — khoá thao tác của Nexagnet + 3 mức an toàn | `operation-key.spec.ts` 24 test |
| **D — vận hành / bảo mật** | 🟡 **thiết kế xong, chưa vận hành thật** | runbook §4–§7; chưa deploy |

**Không có gate nào FAIL.** Không cần mở lại Temporal.

## 3. Ba phát hiện đắt nhất của phiên này

1. **Hatchet cấm dấu hai chấm trong tên workflow** (`^[a-zA-Z0-9\.\-_]+$`). Mẫu `<key>:v1` mà mọi
   bản thiết kế hay viết **không đăng ký được** — và nó chỉ lộ ra lúc worker khởi động, tức là
   lúc deploy. Đã đổi sang dấu chấm và **ép buộc trong code** (`engineWorkflowName`).

2. **Với một tên workflow dùng chung, mất kiểm soát phiên bản theo CẢ HAI CHIỀU.** POC phiên
   trước chỉ đo được "run cũ chạy code mới". Đo lại kỹ hơn còn thấy: run **mới** cũng có thể rơi
   vào worker **cũ**, và một run đang chờ có thể bị worker mới **nuốt trọn từ bước đầu tiên**.

3. **`traceId` hex 32 ký tự khớp regex số điện thoại Việt Nam.** Bản đầu của biên riêng tư quét
   mọi neo như văn bản tự do, nên nó sẽ từ chối **một phần** các lượt chạy hợp lệ, **ngẫu nhiên
   theo trace id** — loại lỗi không tái lập được, và nó đánh vào chính lớp bảo vệ. Test bắt được
   ngay. Đã tách: hình dạng cố định kiểm bằng **khuôn**, hình dạng mở (`entityId`) mới **quét**.

## 4. Bảy commit — mỗi commit một phase, revert độc lập được

| SHA | Nội dung |
|---|---|
| `2b00053` | GATE A — spike ghim phiên bản có đối chứng + POC phiên trước |
| `be5dd99` | GATE B — danh sách trắng chặn PII/bí mật trước khi rời Nexagnet |
| `d3dc828` | GATE C — khoá thao tác + ba mức an toàn của replay |
| `162e11f` | `WorkflowEnginePort` + adapter Hatchet sau một shim duy nhất |
| `ad8695c` | Ràng buộc workflow theo gói khách |
| `831e92e` | Outbox giao dịch — sự kiện nghiệp vụ không mất khi engine chết |
| `3e21443` | Cầu nối domain→workflow + dây nối DI thật, ba khách một khuôn |

## 5. Trạng thái kiểm thử

```
apps/api        1070 passed | 25 skipped
packages/tenant   60 passed
packages/shared   89 passed
apps/web          89 passed
deploy contracts  30 passed
lint              xanh
typecheck         xanh
```
Trong đó **77 test mới** cho `apps/api/src/workflow/` và **12 test mới** cho ràng buộc tenant.

## 6. Việc phải làm tiếp — theo thứ tự

### 6.1 Việc lớn nhất còn thiếu: WORKER
`WorkflowEnginePort` **kích hoạt** được run, nhưng **chưa có tiến trình nào đăng ký**
`integration-handoff.v1` với engine và chạy các bước của nó. Không có worker thì run được tạo ra
sẽ nằm `QUEUED` mãi.

Hình dạng đề xuất (đã có mọi mảnh, chỉ còn ghép):
```
apps/api/src/workflow/workflows/integration-handoff.v1.worker.ts   ← định nghĩa bước
apps/api/src/workflow/workflow-worker.service.ts                   ← OnModuleInit: đăng ký + start
```
Ràng buộc bắt buộc: worker đăng ký **đúng một** phiên bản, lấy tên từ `engineWorkflowName()`.
Tham khảo khuôn 4 bước ở `tools/poc-workflow-engine/src/spike-workflow.ts`.

### 6.2 Gộp mã lý do quyết định
`apps/api/src/workflow/operation-key.ts` và `workflow-handoff.service.ts` đang tự giữ mảng mã lý
do. Đúng ra chúng thuộc `apps/api/src/observability/decision-reasons.ts` (+ hai điểm quyết định
mới: `workflow.handoff`, `workflow.replay`).

**Chưa gộp vì:** file đó đang có thay đổi **chưa commit** của Phase 0 (ba điểm `order.manual_*`).
Gộp bây giờ sẽ kéo việc của luồng khác vào commit này. **Làm ngay sau khi Phase 0 vào.**

### 6.3 Compose production cho Hatchet
`tools/poc-workflow-engine/compose/hatchet.compose.yml` là bản **POC** (`TLS_STRATEGY=none`,
cổng publish ra host). Bản cho `deploy/netviet/` phải khác: TLS, không publish Postgres, dashboard
sau edge có xác thực. Xem runbook §4.

### 6.4 Việc nhỏ hơn
- Nút "Mở workflow run" trên console Nexagnet (đã có `describeRun` + `dashboardUrl`).
- `.int.spec.ts` cho `PrismaWorkflowOutboxRepository` (cần DB thật, dạng skip như campaign).
- Kiểm restart Postgres của engine.
- **Xác nhận dashboard bằng mắt** — 3 phút, cần người: xem POC §9.4. Tôi không gõ được mật khẩu.

## 7. Cảnh báo cho người làm tiếp

1. **Đừng bỏ `WorkflowHandoffService` mà gọi thẳng `WorkflowEnginePort` từ service nghiệp vụ.**
   Bốn lớp bảo vệ (ràng buộc khách, khoá thao tác, biên riêng tư, outbox) nằm trong cầu nối đó.
   `WorkflowModule` cố ý **chỉ export** cầu nối + cổng, không export outbox/dispatcher.

2. **Đừng truyền cả thực thể vào workflow input.** Hợp đồng là **tham chiếu**
   (`entityType`+`entityId`). Nhét `Order` vào sẽ bị `buildWorkflowInput` ném — và đó là hành vi
   đúng, không phải trở ngại.

3. **Đừng nhét token vào `tenant.json`.** Schema chặn (`credentialRef` chỉ nhận `TEN_BIEN`), nhưng
   nếu thấy chỗ nào cần credential thô thì đó là dấu hiệu thiết kế sai chứ không phải schema chặt quá.

4. **Khi thêm biến môi trường mới cho engine, nhớ khai trong `environment:` của `compose.yaml`.**
   Sự cố `f4ed3ee` (biến render ra mà không bao giờ tới container) đã xảy ra thật; có hợp đồng
   test chặn nhưng chỉ khi biến được khai đúng chỗ.

5. **`git status` trước mọi commit.** Worktree này vẫn còn hai luồng việc chưa commit của người
   khác (Phase 0 observability, `tenants/wata/`). Phiên này không chạm vào chúng — trừ **6 dòng**
   `agent-workforce` trong `packages/tenant/src/tenant.schema.ts` mà `ad8695c` buộc phải mang theo
   (git không stage được một phần file, và ràng buộc workflow bắt buộc phải nằm trong hợp đồng tenant).

## 8. Lệnh chạy lại nhanh

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
```
```bash
cd tools/poc-workflow-engine && pnpm spike:shared && pnpm spike:versioned
```
```bash
pnpm --filter @netviet/api exec vitest run src/workflow
```

---

# Phụ lục — phiên 4 (22/08/2026): audit + chốt thiết kế, KHÔNG sửa code

> Phiên này dừng sớm theo yêu cầu. **Không có dòng code nào được viết**, HEAD vẫn `f07e123`.
> Phần dưới là kết quả audit và thiết kế đã chốt — ghi lại để phiên sau không phải suy luận lại.

## 9. Audit trạng thái

```
HEAD                      f07e123  (ahead 8 so với origin)
Phase 0 observability     VẪN CHƯA COMMIT
tenants/wata/             VẪN CHƯA COMMIT
Hatchet POC stack         đang chạy (3 container, cổng 5744/7744/8744)
```

⇒ **Vẫn KHÔNG được ghi `tong-quan.md`** (nó đang giữ bàn giao chưa commit của Phase 0). Điều kiện
để gộp mã lý do quyết định vào `observability/decision-reasons.ts` (§6.2) **cũng chưa đạt**.

## 10. ⚠️ Phát hiện quyết định: worker KHÔNG được nằm trong tiến trình API

Bàn giao trước giả định worker chạy trong tiến trình API. **Bằng chứng trong repo bác bỏ giả định đó.**

`deploy/netviet/deploy-stack.sh:88`:
```bash
"${COMPOSE[@]}" up -d --no-deps --force-recreate api web
```

Mỗi lần deploy **huỷ và tạo lại container `api`**. Nếu worker sống trong đó thì:

1. deploy phiên bản mới → container `api` cũ **biến mất ngay**;
2. worker duy nhất đang phục vụ `integration-handoff.v1` biến mất cùng nó;
3. mọi run `.v1` đang dở **nằm chờ vĩnh viễn** — đúng chế độ hỏng mà Gate A mô tả;
4. bước **DRAIN** của runbook §2 trở thành **không thực hiện được**: không có cách nào giữ worker
   phiên bản cũ sống trong khi phiên bản mới lên, vì cả hai dùng chung một container.

Nói cách khác: nhúng worker vào API **phá phần vận hành của Gate A**, dù phần kỹ thuật vẫn đúng.
Đây là lý do có bằng chứng, không phải "best practice".

**Thiết kế chốt:** worker là **container riêng, cùng image, khác lệnh chạy**, vòng đời độc lập với
`api`. Deploy `api` không đụng tới worker; nâng phiên bản workflow là thao tác riêng theo đúng
REGISTER → ACTIVATE → DRAIN → DEACTIVATE → REMOVE.

```yaml
# deploy/netviet/compose.yaml — phác thảo
workflow-worker:
  image: ${APP_IMAGE}          # cùng image với api
  command: ["node", "dist/workflow/worker-main.js"]
  environment:
    WORKFLOW_WORKER_VERSION: v1   # MỘT phiên bản cho MỖI container — bất biến của Gate A
  restart: always
```

Hệ quả phải nhớ: `compose.yaml` liệt kê biến môi trường **tường minh** ⇒ mọi biến mới của workflow
phải được khai ở đó **và** phủ bởi `deploy/netviet/secrets-passthrough.contract.test.mjs`, nếu
không sẽ lặp lại đúng sự cố `f4ed3ee` (biến render ra mà không bao giờ tới container).

## 11. Thiết kế đã chốt cho phiên sau

### 11.1 `integration-handoff.v1` — ba bước
| Bước | Việc | Lý do từ chối có kiểu |
|---|---|---|
| `resolve` | tên đích **logic** (`erp-primary`) → URL thật, đọc từ env `WORKFLOW_DESTINATION_<TEN>` | `DESTINATION_NOT_CONFIGURED` |
| `dispatch` | POST kèm `Idempotency-Key: <operationKey>` + `traceparent`; `retries: 3`, backoff | `UPSTREAM_5XX` · `UPSTREAM_TIMEOUT` · `RATE_LIMITED` |
| `settle` | ghi kết quả, trả `engineVersion` + `externalRef` | — |

URL đích **không** nằm trong `tenant.json` (gói khách nằm trong git) — chỉ tên logic nằm đó.

### 11.2 Khoá thao tác: worker **tính lại**, không nhận kèm
Worker dựng lại `operationKey` bằng `buildOperationKey()` từ chính input (`tenant`, `entityType`,
`entityId`, `operation`, `operationVersion`, `destination`) + `nexagnet.environment` trong
`additionalMetadata`. Không mang khoá đi hai lần — và việc dựng lại được **chính là** bằng chứng
khoá có tính tất định.

### 11.3 `v2` — không phải phiên bản giả để test
`v2` **thêm bước `preflight`** trước `dispatch`: với đích có `idempotency: 'lookup'`, hỏi hệ ngoài
xem khoá thao tác đã tạo bản ghi chưa; có rồi thì bỏ qua `dispatch`.

Đây là việc **có thật đang thiếu**: Gate C định nghĩa ba mức `key`/`lookup`/`none` nhưng chưa gì
hiện thực mức `lookup`. Dùng nó làm phiên bản thứ hai vừa lấp đúng khoảng trống, vừa là phương
tiện tự nhiên cho hồi quy versioning — thay vì bịa một v2 rỗng chỉ để có hai phiên bản.

### 11.4 Hồi quy versioning — không cần bịa bước chờ
Để có một run `.v1` **đang dở** lúc v2 lên: cho điểm cuối có kiểm soát **treo** (`mode=timeout`).
Run v1 nằm trong `dispatch`; khởi động worker v2; thả điểm cuối; `dispatch` + `settle` của run cũ
**phải** chạy trên worker v1 (vì action `integration-handoff.v1:settle` chỉ tồn tại ở đó).
Không phải thêm `durableTask` chỉ để test.

### 11.5 Fixture cho E2E qua biên production
Gói khách **trung tính** (`knowledge-only` + `workflowEngine` bật), nạp bằng `TENANT_DIR` — **đặt
ngoài `tenants/`** để `tenant-packs.spec.ts` không hiểu nhầm là khách thật. Đề xuất:
`tools/poc-workflow-engine/fixtures/tenant-alpha/`.

E2E phải bắt đầu từ `AppModule.forRoot()` thật → `WorkflowHandoffService.handoff()` →
`WorkflowDispatcher.tick()` → engine → worker. **Không** được gọi thẳng `hatchet.runNoWait()` từ
test rồi gọi đó là E2E.

## 12. Thứ tự thực thi đề xuất cho phiên sau

1. `worker-main.ts` + `WorkflowWorkerService` (đăng ký **đúng một** phiên bản qua `engineWorkflowName`).
2. `workflows/integration-handoff.v1.ts` — ba bước ở §11.1.
3. Fixture tenant + kịch bản E2E thật (§11.5).
4. Ma trận hỏng: điểm cuối 500 → retry · engine chết → outbox giữ · engine lên → gửi tiếp ·
   API chết sau commit trước trigger · worker chết giữa chừng → hồi phục · tick trùng.
5. `v2` + hồi quy versioning (§11.3–§11.4).
6. Hồi quy riêng tư **tại biên thật**: đọc `input` của run trên engine, khẳng định không PII/bí mật.
7. Compose production cho Hatchet + hợp đồng biến môi trường.
8. Audit tài nguyên VM **bằng số đo mới**, rồi mới quyết định deploy `ultty-gd1-test`.

**Chưa được tuyên bố READY FOR GD1-TEST** cho tới khi 1–6 xanh.

---

# Phụ lục — phiên 5 (22/08/2026): WORKER CHẠY THẬT

> HEAD đầu phiên `8c9f9f5` → cuối phiên `e5f1ba1` · 7 commit
> Kế hoạch: [.claude/plans/hatchet-worker-foundation.plan.md](../../../.claude/plans/hatchet-worker-foundation.plan.md)

## 13. Một câu

Nền tảng đã đi từ **"trigger được nhưng không có worker"** sang **"một sự kiện nghiệp vụ đi trọn
chuỗi qua biên production thật và kết thúc ở hệ ngoài"** — và bằng chứng ghim phiên bản của Gate A
**vẫn đứng vững trên dây nối production**, không chỉ trên spike.

## 14. Việc đã xong (W0–W3, W5 của kế hoạch)

| | Việc | Bằng chứng |
|---|---|---|
| W0 | Gói khách fixture bật engine | `packages/tenant/src/__tests__/fixtures/workflow-enabled{,-v2}/` + 4 test qua **loader thật** |
| W1 | Tiến trình worker riêng | `worker-main.ts` · `workflow-worker.{module,service,adapter}.ts` · `hatchet/hatchet-workflow-worker.adapter.ts` |
| W2 | Ba bước `integration-handoff` | `workflows/integration-handoff.steps.ts` — 13 test thuần, 6 mã lý do có kiểu |
| W3 | **E2E qua biên production** | `workflow-e2e.int.spec.ts` — 3/3 trên Hatchet thật |
| W5 | **Hồi quy ghim phiên bản** | cùng file — run v1 đang dở **không** bị worker v2 cướp |
| — | Sửa lỗi tương quan trace | `1e213c8` |

**Kết quả test:** apps/api **1095 passed / 28 skipped** · packages/tenant **64** · packages/shared **89** · tsc + eslint xanh.

## 15. Hai quyết định kiến trúc, có bằng chứng

### 15.1 Worker là container RIÊNG
`deploy/netviet/deploy-stack.sh:88` chạy `up -d --force-recreate api web` mỗi lần deploy. Worker
nằm trong `api` ⇒ mọi run `.v1` đang dở **nằm chờ vĩnh viễn** và bước DRAIN của §2 **không thực
hiện được**. Đây là lý do có bằng chứng, không phải "best practice".

### 15.2 Worker boot MODULE HẸP, không boot `AppModule` ⚠️ **phát hiện mới của phiên này**
Năm lớp làm việc thật trong `onModuleInit`: `ZcaListener`, `ZaloUserClient`, `BotPoller`,
`CampaignScheduler`, `WorkflowScheduler`. Worker boot `AppModule` sẽ mở **listener zca thứ hai**
trên cùng tài khoản Zalo — mà một tài khoản chỉ chịu được **một** listener, nên listener của `api`
bị đá ra. **Kênh đọc chính của GĐ1 chết vì một container phụ khởi động.**
`workflow-worker.module.spec.ts` giữ điều này bằng 4 khẳng định chạy trên DI thật.

## 16. Bốn phát hiện đắt nhất

1. **Worker mất ~38 giây để đăng ký xong** trên engine nguội (~12s khi ấm). Con số này **phải** vào
   `start_period` của healthcheck ở compose — đừng đoán.
2. **`NestFactory` gọi `process.abort()` khi đồ thị DI hỏng** — nó giết luôn worker của vitest, nên
   bài test "thiếu phiên bản → phải NÉM" làm sập cả file thay vì đỏ một khẳng định. Phải
   `abortOnError: false`.
3. **`IntegrationHandoffInput` phải là `type` chứ không `interface`** — TS suy ra index signature
   ngầm cho type alias nhưng không cho interface, mà SDK đòi `JsonObject`. Đổi thành interface làm
   adapter không biên dịch được, với thông báo lỗi chẳng liên quan gì tới nguyên nhân.
4. **Lỗi tương quan trace, bắt được lúc chạy E2E chứ không phải lúc review:** cầu nối sinh một
   `traceId` mới khi không có trace bao quanh và gửi sang engine, nhưng hàng outbox chỉ được ghi
   `traceId` khi **đã có** trace sẵn. Ngoài một trace, hai bản ghi của cùng một việc không bao giờ
   nối lại được. Sửa ở `1e213c8`.

## 17. Cách đọc "run nào chạy code nào" — từ BÊN NGOÀI

```
v1 = resolve -> dispatch -> settle              => điểm cuối chỉ thấy POST
v2 = resolve -> PREFLIGHT -> dispatch -> settle => điểm cuối thấy GET rồi mới POST
```
Nên một lần `GET` mang khoá của run v1 **là** bằng chứng worker v2 đã cướp run cũ. Khẳng định
trung tâm của hồi quy là `lookupsFor(keyV1) === 0`. Không phải mổ ruột engine.

`v2` **không phải phiên bản bịa ra**: Gate C định nghĩa ba mức `key`/`lookup`/`none` nhưng chưa gì
hiện thực mức giữa. `preflight` lấp đúng khoảng trống đó.

## 18. Chạy lại

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
```
```bash
RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=<token> WORKFLOW_ENGINE_HOST_PORT=localhost:7744 WORKFLOW_ENGINE_TLS_STRATEGY=none pnpm --filter @netviet/api exec vitest run src/workflow/workflow-e2e
```

## 19. CHƯA LÀM — nói thẳng

| Hạng mục | Trạng thái |
|---|---|
| **W3 C/E** — worker bị `kill -9` giữa chừng; hai worker cùng phiên bản | ⬜ có sẵn `WorkerProcess.kill()` nhưng **chưa viết kịch bản** |
| **W4** — Hatchet chết → outbox giữ; lên lại → gửi tiếp; API chết sau commit trước trigger (**cần Postgres thật**); tick trùng; replay không an toàn | ⬜ |
| **W6** — riêng tư tại biên thật: đọc `input` của run **trên engine** | ⬜ (unit test đã có, chưa đọc engine) |
| **W7** — audit có `engineRunId`; DI ba cấu hình khách; `settle` ghi audit | ⬜ |
| **W8** — compose production cho Hatchet + service `workflow-worker` + hợp đồng biến môi trường | ⬜ |
| **W9** — đo tài nguyên VM bằng số mới → quyết định deploy `ultty-gd1-test` | ⬜ |
| Nút "Mở workflow run" trên console | ⬜ |
| Xác nhận dashboard bằng mắt | ⬜ cần người |
| Gộp mã lý do vào `observability/decision-reasons.ts` | ⬜ **vẫn bị chặn** — file đang có thay đổi chưa commit của Phase 0 |
| Ghi `tong-quan.md` | ⬜ **vẫn bị chặn** — file đang bẩn +320 dòng của Phase 0 |

## 20. ⛔ CHƯA READY FOR GD1-TEST

Thiếu: crash recovery, ma trận hỏng, riêng tư tại biên thật, audit/DI, hồ sơ triển khai, đo tài
nguyên VM. **Không được deploy** cho tới khi W4/W6/W7/W8/W9 xanh.

Việc kế tiếp đúng thứ tự: **W4 #4 (outbox crash-window)** — nó là mục duy nhất cần Postgres thật
(`docker compose -f docker-compose.yml up -d`), nên dựng nó trước để không phải quay lại lần nữa.
