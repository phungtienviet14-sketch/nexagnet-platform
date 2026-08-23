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

---

# Phụ lục — phiên 6 (23/08/2026): ĐỘ TIN CẬY W4–W12, đo bằng hạ tầng thật

> HEAD đầu phiên `ead4dfc` → cuối phiên `b8a80c0` · 6 commit
> Kế hoạch: [.claude/plans/hatchet-reliability-gates.plan.md](../../../.claude/plans/hatchet-reliability-gates.plan.md)

## 21. Một câu

Nền tảng đã đi từ **"đường đi hạnh phúc chạy được"** sang **"đường đi khi mọi thứ chết đã được
đo"** — outbox sống qua một lần sập tiến trình, engine chết rồi lên lại không mất việc, worker bị
`kill -9` giữa chừng vẫn về đích với **một** bản ghi, và dữ liệu engine thực sự lưu đã được đọc
ngược để đối chiếu. **Vẫn CHƯA READY FOR GD1-TEST**, và §31 nói rõ còn thiếu gì.

## 22. Bảng kết quả — mỗi dòng là một phép đo, không phải một ý kiến

| Gate | Kết luận | Bằng chứng |
|---|---|---|
| **W4** sập sau commit / trước engine | ✅ | `workflow-outbox-durability.int.spec.ts` 3/3, Postgres thật |
| **W4b** sập trước commit (đối chứng) | ✅ | cùng file — đơn và hàng **cùng biến mất** |
| **W5** engine chết → lên lại | ✅ | `workflow-recovery.int.spec.ts` 4/4, `docker stop/start` thật |
| **W5b** ba dạng gửi trùng | ✅ đo riêng | xem §24 |
| **W6** worker `kill -9` giữa chừng | ✅ | `workflow-worker-recovery.int.spec.ts` |
| **W7** hai worker cùng phiên bản + DRAIN | ✅ | cùng file — `countInFlight` về 0 |
| **W8** riêng tư đọc từ engine thật | ✅ | `workflow-privacy-engine-read.int.spec.ts` 9/9 |
| **W9** ma trận DI A/B/C | ✅ | `workflow-di-matrix.spec.ts` |
| **W10** ranh giới module worker | ✅ | `workflow-worker.module.spec.ts` — hợp đồng theo **hình dạng** |
| **W11** lý do hỏng có kiểu | ✅ | `workflow-dispatch-failures.ts` + 9 test |
| **W12** audit ↔ `engineRunId` | ✅ | `workflow-dispatcher.spec.ts` |

**Test:** apps/api **1126 passed / 46 skipped** · IT chạy tuần tự **154/154** ·
packages/tenant **65** · packages/shared **89** · tsc + eslint xanh.

## 23. Bằng chứng W4 — và cách nó tự chứng minh là KHÔNG rỗng

Tiến trình con (`__tests__/crash-window-child.ts`) boot `AppModule` **thật**, ghi `Order` +
hàng outbox trong **một** `$transaction`, COMMIT, in ra, rồi `SIGKILL` **chính nó**.
`process.exit()` không dùng được: nó vẫn chạy hook `exit` — đó là "tắt", không phải "chết".

Sau khi con chết: đơn **còn**, hàng outbox **còn** (`pending`, `attempts=0`, `engineRunId=null`),
điểm cuối **chưa nhận gì**, engine **chưa có run**. Tiến trình Nexagnet thứ hai lên →
`WorkflowScheduler` thật nhặt hàng → chạy trọn → **một** POST, **một** bản ghi.

**Đã kiểm chứng bài này thật sự đo độ bền**, không phải tuyên bố suông: chạy lại chính nó với
`PERSISTENCE=memory` thì bài ② và ③ **ĐỎ**. Bài ① vẫn xanh — và đó là đúng: nó đo một chế độ
hỏng **khác** ("hàng outbox có thoát ra ngoài giao dịch không").

## 24. Bảo đảm giao hàng — ba dòng, không gộp

```
outbox → engine        at-least-once     lease + backoff; KHÔNG mất, CÓ THỂ gửi lại
tạo run trên engine    KHÔNG dedup       đo được: 2 run cho cùng một thao tác
tác dụng phụ bên ngoài dedup NGHIỆP VỤ   2 POST, 1 bản ghi — cùng `Idempotency-Key`
```

**Không dùng chữ "exactly-once" ở bất kỳ đâu.** Lý do có tên:
`TriggerWorkflowCommand.operationKey` có trong hợp đồng cổng nhưng
`hatchet-workflow-engine.adapter.ts:trigger()` **không truyền nó** sang `runNoWait`, nên engine
không có gì để chặn trùng lúc tạo run. Đo tại `workflow-recovery.int.spec.ts` (kịch bản "timeout
mơ hồ": engine ĐÃ nhận, bên gọi không biết). **Chưa sửa** — sửa là đổi ngữ nghĩa của cổng và phải
là quyết định có chủ ý.

## 25. Năm cái bẫy đã vấp — cả năm đều làm test XANH GIẢ hoặc đo sai chỗ

1. **Bộ lọc `additionalMetadata` sai hình dạng.** Viết mảng `"khoá:giá trị"` thay vì một object.
   Nó luôn trả **0 hàng** — mà phần lớn chỗ dùng lại khẳng định **bằng 0**. W4 xanh vì phép đo
   không bao giờ đo được gì. Đã sửa, đã chạy lại W4, và giờ có một ca **dương tính** (`=== 2`)
   giữ cho nó không âm thầm chết lại.
2. **Phép đo sống/chết dùng `runs.list`** — đi qua REST của container **dashboard**, nên tắt
   `hatchet-engine` không làm nó im. Đổi sang mở kết nối TCP tới đúng **cổng gRPC**.
3. **Bài test `import` hằng số từ tiến trình tự-giết** ⇒ `main()` chạy ngay trong worker của
   vitest và SIGKILL giết runner. Triệu chứng (`ERR_IPC_CHANNEL_CLOSED`) chẳng chỉ về nguyên nhân.
4. **Đếm dòng log stdout của worker** để biết bước nào chạy ở đâu — `ctx.logger` của SDK gửi log
   về **engine**, nên chỉ bắt được một phần (4/6). Một phép đo bắt được một phần là phép đo **sai**.
5. **Đọc số run của engine ngay lập tức** — danh sách run là một mô hình **đọc** và nó bắt kịp sau
   một nhịp. Đã từng ra `1` thay vì `2` một lần. Khẳng định đúng là "rốt cuộc sẽ có hai run".

## 26. ⚠️ Các bài IT của workflow PHẢI chạy TUẦN TỰ

```bash
pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

Đo được: song song 5 file → **9 bài ĐỎ**; tuần tự → **154/154 xanh**.

Nguyên nhân **không** phải test mong manh. Năm file đều đăng ký **cùng** tên
`integration-handoff.v1` với **cùng** một engine; engine định tuyến theo **tên**, nên worker của
file A nhận run do file B kích hoạt, rồi phân giải `WORKFLOW_DESTINATION_PROOF_ENDPOINT` từ **môi
trường của chính nó** và gửi dữ liệu đó tới đích của A.

**Đây là bằng chứng chạy được cho bất biến §4.1 của runbook** — mỗi khách/môi trường **một
instance Hatchet riêng**. Hai bản triển khai dùng chung một engine sẽ **cướp run của nhau** và gửi
dữ liệu của nhau ra ngoài. Đó là lỗi **cách ly dữ liệu**, không phải phiền toái về lịch chạy.

## 27. Hai phát hiện còn mở (đã ghi nhận, chưa sửa — có lý do)

**① Hai bản sao cùng phiên bản không quy được run về ai.**
`resolveWorkerRegistration()` sinh `workerName` tất định theo phiên bản, nên hai container v1 đăng
ký dưới **cùng một tên**; payload thì không mang danh tính tiến trình (đúng — biên riêng tư).
Cái **không** hỏng: việc vẫn chạy hết, giết một con thì con còn lại gánh tiếp (đã đo).
Cái hỏng: khi một bản sao cư xử lạ, không có đường nào chỉ ra là bản nào.
Đề xuất: thêm hậu tố danh tính tiến trình vào `workerName`. Chưa sửa vì phân phối việc và chuyển
giao đều đang đúng.

**② Khe hở trong bộ quét bí mật dùng chung.**
`telemetry-redaction.ts` dùng mẫu đòi 16+ ký tự **chữ-số** ngay sau tiền tố `sk-`. Khoá có gạch ở
thân — kể cả **định dạng khoá OpenAI hiện hành** — **thoát được**. Ảnh hưởng cả telemetry, không
riêng workflow. Đã đặc tả hiện trạng trong `workflow-privacy-engine-read.int.spec.ts` (bảng
`knownGaps`, kèm ghi chú chuyển sang bảng `mustBlock` khi sửa xong).
Chưa sửa ở đây: bộ quét là hạ tầng dùng chung và observability đang có luồng khác làm việc.

## 28. Điều thật sự bảo vệ `input` — nói rõ để không ai nhầm hai lớp

Đọc ngược từ engine: `input` **đúng bằng** sáu trường hợp đồng, `additionalMetadata` **đúng bằng**
tám neo tương quan, và không chuỗi cấm nào xuất hiện trong cả bản ghi.

Nhưng thứ tạo ra kết quả đó là **HỢP ĐỒNG** (danh sách trắng sáu trường tham chiếu; `entityId`
theo định nghĩa là định danh nội bộ do ta sinh ra), **không phải** bộ quét nội dung. Bộ quét là
lớp thứ hai và nó **không** bắt được tên người hay địa chỉ tự do — đó là giới hạn **về nguyên
tắc** của quét theo mẫu, không phải một mẫu còn thiếu.

## 29. Đo thời gian đăng ký worker (cho `start_period` của compose)

| Lần đo | Kết quả |
|---|---|
| 22/08 engine nguội | ~38 s |
| 22/08 engine ấm | ~12 s |
| 23/08 (engine chạy 9 giờ) | **6,3 s** rồi **30,1 s** |

**Biến động lớn và không ổn định** — chính điều đó là kết luận. Đề xuất `start_period: 90s`
(≈2,4× lần đo tệ nhất), **không** đặt sát 38 s. Và healthcheck phải dựa trên **READY thật**, không
phải "tiến trình còn sống": một worker sống mà chưa đăng ký là chế độ hỏng tệ nhất — container
xanh, healthcheck xanh, mọi run nằm chờ mãi mãi.

## 30. Việc song song — KHÔNG chạm

`git status` cuối phiên: Phase 0 observability (`decision-reasons.ts` vẫn +71 dòng chưa commit),
`orders/`, `apps/web/`, `apps/mini/`, `tenants/wata/`, `tong-quan.md`, `debugging.md`,
`tools/trace-view.mjs`, `packages/tenant/src/tenant.schema.ts` — **không file nào bị chạm**.
Sáu commit của phiên chỉ đụng `apps/api/src/workflow/`.

**Món nợ đã ghi:** gộp `workflow-dispatch-failures.ts` vào `observability/decision-reasons.ts`
sau khi Phase 0 vào. Cũng vì lý do đó, phiên này **vẫn không ghi** `tong-quan.md`.

**Ghi chú không liên quan tới phiên này:** `pnpm typecheck` ở mức workspace ĐỎ tại `apps/mini/`
(JSX không có `JSX.IntrinsicElements`). `apps/mini/` là việc song song chưa track; lỗi có trước
phiên này và không do phiên này gây ra. Đã typecheck `@netviet/api` riêng: xanh.

## 31. ⛔ VẪN CHƯA READY FOR GD1-TEST

Độ tin cậy **đã xanh**. Phần triển khai **chưa bắt đầu** — và đó là lựa chọn có chủ ý, không phải
hết giờ: làm dở một hồ sơ deploy còn tệ hơn không làm.

| Hạng mục | Trạng thái |
|---|---|
| Readiness của worker (máy đọc được) | ⬜ **chặn compose** — thiết kế đã rõ (§29), chưa viết |
| `deploy/netviet/compose.yaml` + service `workflow-worker` | ⬜ chưa bắt đầu |
| Postgres riêng cho engine (volume, healthcheck, không publish cổng) | ⬜ chưa bắt đầu |
| TLS + mạng nội bộ (POC đang `TLS_STRATEGY=none`) | ⬜ chưa bắt đầu |
| Hợp đồng biến môi trường (`secrets-passthrough.contract.test.mjs`) | ⬜ chưa bắt đầu |
| Backup/restore Postgres của engine | ⬜ chưa bắt đầu |
| Audit tài nguyên VM bằng số mới | ⬜ chưa bắt đầu |
| Gộp mã lý do vào `decision-reasons.ts` | ⬜ vẫn bị chặn bởi Phase 0 |
| Ghi `tong-quan.md` | ⬜ vẫn bị chặn bởi Phase 0 |

**Việc kế tiếp, chính xác:** *readiness của tiến trình worker*. Nó là điều kiện chặn của compose,
nó là mục duy nhất còn lại trong chuỗi độ tin cậy, và §29 đã có số đo để thiết kế nó tử tế thay vì
đoán. Đề xuất: một điểm cuối HTTP chỉ nghe **loopback** trong container (healthcheck của Docker
chạy *bên trong* container, nên không cần phơi cổng nào ra ngoài), trả 200 **sau** khi
`waitUntilReady()` của SDK trả về.

## 32. Chạy lại

```bash
docker compose -f docker-compose.yml up -d postgres && pnpm --filter @netviet/api exec prisma migrate deploy
```
```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
```
```bash
RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=<token> WORKFLOW_ENGINE_HOST_PORT=localhost:7744 WORKFLOW_ENGINE_TLS_STRATEGY=none DATABASE_URL=postgresql://netviet:netviet_local@localhost:5432/netviet pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

---

# Phụ lục — phiên 7 (23/08/2026): READINESS CỦA WORKER (D1)

> HEAD đầu phiên `8e22047` → cuối phiên `a89306b` · 2 commit + 1 commit bằng chứng
> Kế hoạch: [.claude/plans/hatchet-deployment-gates.plan.md](../../../.claude/plans/hatchet-deployment-gates.plan.md)
> Bằng chứng reset: [evidence/reset-pocwf-23-08-2026.md](../../../tools/poc-workflow-engine/evidence/reset-pocwf-23-08-2026.md)

## 33. Một câu

Cổng **chặn compose** đã đóng: worker giờ trả lời được câu "đã nhận việc được chưa" bằng một
**trạng thái đo được**, không phải một con số `sleep` — và ba luật của nó chống được cả hai chế độ
hỏng đối nghịch (bão restart *và* container xanh mà run treo). **D1 XONG. D2–D9 CHƯA BẮT ĐẦU.**

## 34. Quyết định đã chốt

| | Chọn | Hệ quả |
|---|---|---|
| **Q1** bật engine cho gd1-test | **A** — công tắc `WORKFLOW_ENGINE=on\|off`, mặc định **off** | `tenants/ultty/tenant.json` khai binding; production KHÔNG bị vũ trang vì công tắc mặc định tắt. **Chưa hiện thực** — việc của D2 |
| **Q2** TLS gRPC nội bộ | **A** — `tls none` trên mạng `internal:true` + hợp đồng test ép cổng không publish | Phải sửa runbook §4.2: lý do thật là **ranh giới mạng**, không phải chữ "production" |
| **Q3** trùng run | chỉ báo cáo | Không đổi `WorkflowEnginePort` |

## 35. D1 — readiness, và ba luật của nó

```
STARTING → CONNECTING → REGISTERING → READY
                                        ↓ mất engine
                                     DEGRADED → READY
SIGTERM bất kỳ lúc nào → DRAINING → STOPPED
```

| Điểm cuối | 200 khi | Dùng cho |
|---|---|---|
| `/live` | mọi trạng thái trừ `STOPPED` và trừ FATAL | tiến trình còn sống |
| `/ready` | **chỉ** `READY`, và `DEGRADED` trong 30 s ân hạn | healthcheck của Docker |

1. **Mất engine sau READY → KHÔNG thoát tiến trình.** W5 đã đo: engine chết rồi lên lại không mất
   việc. Thoát ở đây biến một lần restart engine thành một cơn bão restart worker.
2. **`DEGRADED` quá ân hạn → `/ready` 503 nhưng `/live` VẪN 200.** Compose **không** tự restart
   container unhealthy (khác Kubernetes), nên cặp giá trị này cho ra *hỏng nhìn thấy được* mà
   không cho ra *bão restart*. Đây chính là chỗ đóng chế độ hỏng §29.
3. **Hỏng CẤU HÌNH → `/live` 503 → thoát khác 0.** Đã chứng kiến chạy thật: thiếu token →
   `CONFIG_INVALID` → thoát ngay thay vì treo thành container xanh.

**Ba module, tách ra để kiểm được riêng:** `worker-readiness.ts` (máy trạng thái THUẦN, đồng hồ
tiêm vào) · `worker-health.server.ts` (`node:http`, **chỉ loopback**, thân theo danh sách TRẮNG) ·
`engine-reachability.ts` (bộ dò TCP tới đúng cổng gRPC — §25 bẫy #2).

## 36. Kết quả đo

```
đơn vị (3 spec mới)                31 test
workflow không-IT (14 file)       165/165
BỘ IT ĐẦY ĐỦ trên engine SẠCH     189/189 · 20/20 file
tsc + eslint                       xanh
```

## 37. Hai điều PHẢI đọc đúng, đừng đọc thành nhiều hơn

**① `registrationMs` = 316 / 343 / 391 / 463 ms — KHÔNG so được với §29.**
Số này đo cửa sổ **HẸP HƠN**: từ lúc gọi `hatchet.worker()` tới lúc `waitUntilReady()` trả về.
Các số 6,3 s / 12 s / 30,1 s / 38 s của §29 đo **cả tiến trình lên** (nạp SDK ~800 ms + boot Nest +
kết nối). Hai phép đo khác nhau. **`start_period: 90s` GIỮ NGUYÊN** — nó phải bao được §29.

**② Bộ dò TCP: mở được ≠ đăng ký còn hiệu lực.**
Bắt được "engine chết / khởi động lại / mạng đứt" (chế độ hỏng đã đo ở W5). **Không** bắt được
"engine sống nhưng đã quên worker này". Đã ghi giới hạn này trong chính file code.

## 38. ⚠️ CHƯA ĐO ĐƯỢC — rút sạch (DRAIN)

Windows **không có SIGTERM thật**: Node dịch `kill('SIGTERM')` thành `TerminateProcess`, nên
`enableShutdownHooks()` **không bao giờ chạy** trên máy dev. Đã đo trực tiếp để xác nhận chứ không
suy đoán: `/ready` 200 trước khi giết, sau khi giết log **không** có dòng `Rut worker`.

Khẳng định đó đã bị **chặn theo nền tảng** (`if (process.platform !== 'win32')`) kèm lý do —
*một nhãn sai tệ hơn không có nhãn*. Đường `DRAINING → stop() → STOPPED` là điều kiện của thủ tục
DRAIN ở runbook §2, nên đây là **món nợ có thật**: phải đo lại ở **D9, trên container Linux**.

## 39. Bài học đắt nhất của phiên — và nó không phải bài học về code

Bộ IT đầy đủ đỏ 5 rồi 7 bài, **hai tập khác nhau**. Cách phản ứng đúng là A/B, không phải sửa test:

| Bài | code gốc `8e22047` | code D1 |
|---|---|---|
| W6 `kill -9` | ❌ hết giờ | ✅ xanh |
| W7 hai worker | ❌ 5/6 | ❌ 5/6 |

Baseline hỏng **bằng hoặc tệ hơn** ⇒ không phải hồi quy. Dựng lại engine sạch → **189/189**.

**Engine POC thoái hoá** sau nhiều vòng `stop/start` do chính các bài W5/W6/W7 gây ra. Cơ chế khớp
§27①: mọi worker cùng phiên bản đăng ký **cùng một tên**, đăng ký của tiến trình đã chết tích lại,
engine giao việc cho bản sao không còn tồn tại → run nằm chờ.

**Quy tắc rút ra:** trước khi tin một kết quả IT ĐỎ, dựng lại engine sạch rồi đo lại (~2 phút).
"Code hỏng" và "engine mệt" có triệu chứng **giống hệt nhau**: *run không tiến triển*.
⚠️ Nhưng đỏ trên engine VỪA dựng sạch thì **không** được gọi là ô nhiễm môi trường nữa.

**Và một hồi quy CÓ THẬT do D1 gây ra** (`a89306b`): `EADDRINUSE` trên cổng health dùng chung.
Trên production đúng — mỗi worker một container. Harness IT chạy nhiều worker trên **cùng một máy**
nên phải cấp cổng riêng; đó là **mô hình đúng**, không phải mẹo làm test xanh.

## 40. Việc song song — KHÔNG chạm

29 path của phiên khác (`decision-reasons.ts`, `orders/`, `apps/web/`, `apps/mini/`, `tenants/wata/`,
`tong-quan.md`, `debugging.md`, `tools/trace-view.mjs`, `packages/tenant/src/tenant.schema.ts`) —
**không file nào bị chạm**. A/B dùng sao lưu ra scratchpad, **không** `git stash`, chính vì lý do đó.

**Nợ vẫn treo:** gộp `workflow-dispatch-failures.ts` vào `decision-reasons.ts` · ghi `tong-quan.md`.
Cả hai vẫn bị Phase 0 chặn.

## 41. READY FOR GD1-TEST — 7/9 cổng, D8 là việc kế tiếp

| Cổng | Trạng thái |
|---|---|
| **D1** readiness của worker | ✅ **XONG** (phiên 7) |
| **D2** compose production + công tắc `WORKFLOW_ENGINE` | ✅ **XONG** |
| **D3** cách ly thành hợp đồng test | ✅ **XONG** — 15 bài, 7 ca âm tính |
| **D4** mạng + TLS (Q2-A) + sửa runbook §4.2 | ✅ **XONG** |
| **D5** hợp đồng bí mật + bootstrap token | ✅ **XONG** |
| **D6** backup/restore + volume `hatchet-config` | ✅ **XONG** — chứng minh cả ca dương lẫn ca âm |
| **D7** audit VM bằng số mới | ✅ **XONG** — đĩa đỏ 92%, đã nới 80→200 GB không downtime |
| D8 deploy CHỈ `ultty-gd1-test` | ⬜ **SẴN SÀNG CHẠY** |
| D9 E2E trung lập + dashboard + đo lại DRAIN | ⬜ phụ thuộc D8 |

## 42. ⛔ HAI CỔNG ĐANG CHẶN D8 — cả hai cần NGƯỜI quyết

Code đã xong và đã commit. **9 commit nằm ở local, CHƯA push.** Không có gì được deploy.

### 42.1 Hook `[ECC pre-push]` chặn push vì code KHÔNG được push

```
✖ 7 problems (7 errors, 0 warnings)
[ECC pre-push] FAILED: lint failed
```

Cả 7 lỗi là `unused-import` trong **`apps/mini/`**:

| File | Lỗi |
|---|---|
| `apps/mini/src/App.tsx` | `ZMPRouter` khai mà không dùng |
| `apps/mini/src/components/AgentTimeline.tsx` | `STATUS_ICONS` |
| `apps/mini/src/pages/ActivityPage.tsx` | `StatusBadge` |
| `apps/mini/src/pages/OrderDetailPage.tsx` | `Button`, `OrderView` |
| `apps/mini/src/pages/ProfilePage.tsx` | `Box`, `LiveIndicator` |

**`git ls-files apps/mini` = 0.** Thư mục hoàn toàn **untracked**, thuộc việc song song ⇒ **nó
không nằm trong nội dung được push**. Hook lint cả cây làm việc nên nó chặn vì thứ nó sẽ không đẩy đi.

Không tự xử vì cả hai đường đều trái chỉ thị: sửa `apps/mini/` là **chạm việc song song**;
`--no-verify` là **bỏ qua hook** mà chưa ai cho phép. **Người quyết.**

### 42.2 Deploy gd1-test bắt buộc từ `refs/heads/main`

[`reusable-deploy-tenant.yml:128`](../../../.github/workflows/reusable-deploy-tenant.yml):

```
[[ "${GITHUB_REF}" == 'refs/heads/main' ]] || {
  echo 'GD1-test deployment must run from refs/heads/main.' >&2; exit 1; }
# + đúng SHA đó phải có CI ci.yml `conclusion=success` trên branch main
```

⇒ D8 qua CI **đòi merge nhánh vào `main`** — và nhánh đang mang **35 commit chưa push**, trong đó
**27 commit là của các phiên trước**, không phải của phiên 8. Merge vào main là quyết định vượt
phạm vi "làm tiếp D2–D9". **Người quyết.**

---

## 42bis. D8 — runbook chính xác, chạy khi hai cổng trên mở

**Đã làm sẵn (không phải làm lại):** ba secret đã tạo trên `netviet-host-968934832433`:

| Secret | Nội dung |
|---|---|
| `zalo-ultty-gd1-test-hatchet-db-password` | 32 ký tự chữ+số (an toàn trong URL `postgres://`) |
| `zalo-ultty-gd1-test-workflow-dashboard-htpasswd` | bcrypt `$2a$`, 60 ký tự |
| `zalo-ultty-gd1-test-workflow-dashboard-password` | bản rõ để đăng nhập dashboard |

Đọc mật khẩu dashboard (user Basic Auth là `operator`):

```bash
gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-gd1-test-workflow-dashboard-password
```

**Trình tự deploy:**

1. Mở hai cổng §42.
2. Actions → **deploy-tenant** → Run workflow, nhánh **main**:
   `tenant=ultty` · `environment=gd1-test` · `workflow_engine=on`.
3. Lần chạy này sẽ **THẤT BẠI có chủ ý** ở `deploy-stack.sh` với `exit 78`:
   *"WORKFLOW_ENGINE=on nhưng secrets.env chưa có WORKFLOW_ENGINE_TOKEN"*. Đó là **vòng gà–trứng
   đã biết trước**, không phải hỏng: token chỉ tồn tại sau khi engine đã migrate + quickstart.
   Nhưng lúc này compose + engine đã lên trên VM.
4. SSH vào VM, đúc token (idempotent — đã có secret thì nó tự dừng):
   ```bash
   sudo STACK_SLUG=ultty-gd1-test bash /srv/netviet/apps/zalo-ultty-gd1-test/bootstrap-workflow-engine.sh
   ```
5. Chạy lại bước 2. Lần này `render-secrets.sh` đọc được token và deploy đi hết.

> **Chưa đo được cho tới bước này:** RAM thật của `workflow-worker-v1`. Ô đó trong runbook §7 đang
> ghi **CHƯA ĐO**, và **không được mượn số của `api`** — worker boot `WorkflowWorkerModule` hẹp hơn
> nhiều. Đo xong thì sửa runbook §7.

**Sau D8 là D9 + D9-b**, và món nợ **DRAIN** của phiên 7 (Windows không có SIGTERM thật) phải đo
lại ở đây — trên container Linux.

## 43. Chạy lại

```bash
docker compose -f docker-compose.yml up -d postgres && pnpm --filter @netviet/api exec prisma migrate deploy
```
```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
```
```bash
RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=<token> WORKFLOW_ENGINE_HOST_PORT=localhost:7744 WORKFLOW_ENGINE_TLS_STRATEGY=none DATABASE_URL=postgresql://netviet:netviet_local@localhost:5432/netviet pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

Token nằm ở `tools/poc-workflow-engine/.env` (gitignored). Đúc lại: xem §7 của bằng chứng reset.

---

## 44. PHIÊN 8 (23/08/2026) — đã làm gì, và đo bằng gì

HEAD đầu phiên `4e5b634` → cuối phiên `c590f52`. **9 commit, CHƯA push.**

### 44.1 Hồi quy hết-heap: nguyên nhân thật KHÔNG phải hai nghi vấn ban đầu

Bàn giao phiên 7 nghi *vòng import* hoặc *thứ tự khởi tạo provider*. **Cả hai đều sai.**

```
await expect(boot()).rejects.toThrow(/WORKFLOW_ENGINE_TOKEN_MISSING/);
```

Công tắc mặc định `off` làm `boot()` **không còn ném** (đúng thiết kế). Khi promise RESOLVE,
vitest dựng `AssertionError` mang `showDiff: true` và `actual` = chính `NestApplicationContext` —
đối tượng giữ `container`: mọi module, mọi provider, cả đồ thị DI. Vitest tuần tự hoá `actual` để
vẽ diff **và gửi qua IPC** về tiến trình báo cáo, rồi đi bộ qua một đồ thị khổng lồ có chu trình.

| Bài | Kết quả |
|---|---|
| ca A riêng | ✅ 74 MB |
| ca B riêng | ✅ **ĐỎ SẠCH, đọc được**, 6,7 s |
| ca C riêng | ❌ **OOM 4 GB, 2,5 phút** |
| ca C, đổi **duy nhất** dòng khẳng định | ✅ 11 s, 84 MB |
| bắt lỗi lại rồi soi | `keys=message\|showDiff\|expected\|actual` · `actualCtor=NestApplicationContext` · có `container` |

**Một giả thuyết bị BÁC BỎ bằng phép đo, và chính chỗ đó mới ra nguyên nhân:** tuần tự hoá một
context Nest trong `.rejects` **khi TA TỰ BẮT LỖI** chỉ tốn **71 ký tự / 2 ms**. Nên "vitest
serialize context" một mình nó không phải nguyên nhân — phải là lỗi **THOÁT RA** cho vitest.

`err.message` chỉ 71 ký tự; cả 4 GB nằm trong `err.actual`. Đó là lý do cú OOM trông như không
liên quan gì tới khẳng định — và là lý do phiên trước đi nghi môi trường.

Đã chặn tái phát: `apps/api/src/workflow/nest-context-assertion.contract.spec.ts` (quét cả thư
mục, có bài chống-xanh-giả, và một bài **đo lại cơ chế của vitest** — vitest đổi thì bài đó đỏ).

### 44.2 D2–D7 — đo, không đoán

| Việc | Số đo thật |
|---|---|
| `max_connections` | POC copy 1000 của Hatchet; engine thật giữ **20** kết nối ⇒ chọn **200** |
| healthcheck engine | cổng **8733**, `/live` `/ready` = 200, `/health` = **404** |
| dashboard | chạy **HAI** tiến trình: `hatchet-api` :8080 + nginx :80 proxy `/api` ⇒ edge trỏ :80 |
| tenant `default` | UUID `707d0855-…` là hằng số trong bản gieo — **vẫn đọc theo `slug`**, không gõ cứng |
| RAM cụm engine | **252 MiB** (205 + 28 + 19) |
| ảnh Hatchet | ≈ **1,04 GB** (dùng chung mọi stack trên cùng VM) |

**D6 chứng minh cả hai chiều** trên `deploy/netviet/compose.yaml` THẬT (project dùng một lần
`zalo-d6proof`; `pocwf` không bị đụng):

- **ca dương** — backup → `down -v` → restore cả dump lẫn volume config: tenant 2→2, bảng 182→182,
  `masterKeyset` sha `d71d31b2…` **giữ nguyên**, engine chạy đúng digest đã ghim.
- **ca âm** — restore dump mà **bỏ** volume `hatchet-config`: engine vẫn **Healthy**, DB vẫn **182
  bảng**, nhưng khoá là `52fee191…` **khác hẳn**. ⇒ **một lần phục hồi XANH ra dữ liệu không đọc
  được.** Đó là lý do dump Postgres một mình nó KHÔNG phải backup.

**D7 tìm ra một cổng đỏ thật** — đĩa `/` **92%, còn 6,6 GB**, do **40 bản không tag** của
`flowise-3.1.4-deepseek-fix` × 9,29 GB (52 GB thu hồi được). Đã **nới đĩa 80→200 GB, KHÔNG
downtime** (`pd-balanced` nới nóng + `growpart` + `resize2fs`): còn **123 GB, 37%**. Chứng minh
không downtime bằng bằng chứng: 17/17 container vẫn `healthy`, **uptime không đổi**.

> **Còn nợ (không chặn):** 40 ảnh không tag vẫn tích luỹ mỗi lần deploy. Dọn thì an toàn — đã kiểm
> `rollback.sh:64` kéo lại từ Artifact Registry **theo digest** (AR giữ 47 bản có tag) — nhưng để
> một phiên vận hành riêng, làm có chọn lọc, **không** `prune -a` mù.

### 44.3 Lệch khỏi kế hoạch — nói rõ để không ai tưởng là sót

`WORKFLOW_ENGINE_HOST_PORT` được **ghi cứng** `hatchet-engine:7070` thay vì là biến (kế hoạch §D5
liệt nó vào danh sách biến). Lý do: địa chỉ engine là sự thật về **topo** của chính compose; để nó
thành biến là để ngỏ đúng lỗ hổng D3 phải đóng — một giá trị sai trong `secrets.env` sẽ trỏ hai
stack vào một engine (§26). Có ca âm tính ép điều này.

### 44.4 Điểm cần quyết, KHÔNG tự đổi

`postgres:15.6` (không alpine) tốn **608 MB** đĩa; `postgres:15-alpine` tiết kiệm ~550 MB. Chưa
đổi vì 15.6 là bản Hatchet kiểm thử trên compose chính thức của họ, và khác biệt musl/glibc là một
biến số mới không ai đo. Sau khi nới đĩa thì không còn gấp.

### 44.5 Việc song song — KHÔNG file nào bị chạm

16 file đã track của phiên khác được **băm SHA-256 đầu phiên và đối chiếu lại sau mỗi bước** —
không đổi một byte. Không dùng `git stash`. `tenants/ultty/` **không** nằm trong 29 path đó nên
được sửa (thêm binding); `tenants/wata/` thì không đụng.

