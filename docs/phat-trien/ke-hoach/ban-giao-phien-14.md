# Bàn giao phiên 14 — Gate Hatchet trace correlation ĐÃ ĐÓNG

> Ngày: **24/08/2026** · Nhánh: `feat/hoi-thoai-chot-don-main` · HEAD `2a7d211` (không commit)
> Phiên trước: [ban-giao-phien-13.md](ban-giao-phien-13.md) — dừng giữa chừng có chủ đích.

---

## 0. Một câu

Ba cổng tự động **đều PASS bằng telemetry thật đã gửi ra khỏi tiến trình**, không phải bằng
`InMemorySpanExporter`; hai bài tập gỡ rối cho chủ dự án **đã dựng xong và đã kiểm chứng là tìm
ra được** trong ClickStack. Không deploy, không commit, `AUTO_SEND` không đụng.

| Gate | Kết quả |
|---|---|
| HATCHET TRACE CORRELATION | **PASS** |
| WORKER CRASH RECOVERY | **PASS** |
| WORKER PRIVACY | **PASS** |
| HUMAN DEBUG TEST | **PASS (CASE A)** — chủ dự án đã làm và đúng; CASE B đã dựng nhưng **không làm**, đóng theo quyết định của chủ dự án |

---

## A. Root cause bộ kiểm workflow IT — không còn là việc của phiên này

Phiên 13 đã tìm ra và sửa: `hatchet-api` chết sau lưng một container báo xanh (`docker restart
pocwf-hatchet-dashboard-1`). Phiên này **kiểm lại trước khi đụng code**: `REST /api/v1/meta` →
**200**, `RestartCount = 0` trên cả ba container. Hạ tầng lành, không sửa gì.

## B. Baseline `OTEL_TRACING=off`

| Lần đo | Kết quả |
|---|---|
| `OTEL_TRACING=off`, **trước** khi sửa code | **201 / 201**, 22 tệp, 473 s, exit 0 |
| `OTEL_TRACING=off`, **sau** toàn bộ thay đổi | **207 passed / 3 skipped**, 23 tệp, 409 s, exit 0 |
| `OTEL_TRACING=on`, **sau** toàn bộ thay đổi | **210 / 210**, 24 tệp, 459 s, exit 0 |

207 = 201 cũ + 6 bài hợp đồng mới. 3 skipped = đúng bộ `workflow-trace-correlation.int.spec.ts`,
**tự bỏ qua khi `OTEL_TRACING` không bật** — có chủ đích: một bài kiểm quan sát *bắt buộc* phải
chạy sẽ biến tầng quan sát thành điều kiện để nghiệp vụ được coi là đúng.

**Dòng thứ ba là phép đo quan trọng nhất của bảng này:** toàn bộ bộ kiểm nghiệp vụ chạy **giống
hệt nhau** khi bật và khi tắt tracing — 210 = 207 + đúng 3 bài tương quan nay được chạy. Bất biến
*"`OTEL_TRACING=off` ⇒ hành vi nghiệp vụ như trước POC"* giữ được **theo cả hai chiều**: tắt không
mất gì, và bật cũng không đổi gì.

Ngoài ra: **toàn bộ unit `@netviet/api` 148 tệp passed / 14 skipped**, `tsc --noEmit` exit 0,
`eslint .` toàn repo exit 0.

---

## C. Cách khôi phục trace context trong worker

### C.1 Một cầu nối, hai đầu hàng đợi

`worker-trace-bridge.ts` (giao diện không-SDK) + `otel/otel-worker-trace-bridge.ts` (hiện thực).
Phiên 13 viết hai file này; phiên này **đấu dây** và mở rộng chúng cho **cả hai đầu**:

| Đầu | Ai dùng | `kind` |
|---|---|---|
| **GIAO** | `WorkflowDispatcher` (tiến trình `api`) | `producer` |
| **NHẬN** | `HatchetWorkflowWorker` (tiến trình `worker`) | `consumer` |

Một giao diện cho cả hai vì cả hai làm **đúng một việc** về mặt trace: khôi phục ngữ cảnh từ
`traceparent` rồi chạy một việc bên trong nó. Tách làm hai sẽ sinh ra hai bản sao của cùng một
đoạn xử lý lỗi fail-open.

### C.2 Vì sao đầu GIAO cũng cần span — chỗ đứt cuối cùng của sợi dây

`WorkflowHandoffService` xếp hàng **trong giao dịch nghiệp vụ** rồi trả về ngay; lần gọi engine
xảy ra ở **một nhịp khác** của `WorkflowScheduler`, tức ngoài lượt nghiệp vụ. Không có span ở đó
thì trace có một khoảng trống không giải thích được giữa *"đã xếp hàng"* và *"worker bắt đầu
chạy"* — và đó đúng là khoảng mà người debug cần đo.

### C.3 Ba quyết định ngữ nghĩa (giữ nguyên từ phiên 13, nay đã chạy thật)

1. **`propagation.extract`, không tự dựng `SpanContext`** — `traceparent` hỏng → context không có
   span → span của ta thành gốc, fail-open **mà không cần một dòng kiểm tra nào**.
2. **CHA–CON, không phải span link** — kể cả sau khi worker chết. Quan hệ ở đây là nhân-quả và
   **duy nhất**; `link` hàm ý *"có liên quan, không rõ thế nào"* trong khi ta biết chính xác thế nào.
3. **Không bịa span `worker` bọc ba bước** — engine giao **từng bước một** qua gRPC, cách nhau tuỳ
   ý; sau một lần sập, bước sau chạy trên **tiến trình khác hẳn**. Không có khoảng thời gian nào
   để một span như thế đo.

### C.4 ⚠️ Cái bẫy phải ghi lại: **hai header `traceparent` làm ĐỨT sợi dây**

Đây là thứ **không suy ra được, chỉ đo mới thấy**.

`instrumentation-undici` tự tiêm `traceparent` vào mọi `fetch` khi OTel chạy
(`propagation.inject` → `request.addHeader`). Nhưng `dispatchHandoff()` **cũng** tự đặt một header
cùng tên. Hậu quả: yêu cầu đi ra mạng **hai** header `traceparent`, Node ở đầu kia nối lại bằng
dấu phẩy → `req.headers.traceparent` không còn đúng khuôn W3C.

Tức là: **bật tracing lên sẽ làm đứt chính sợi dây mà nó sinh ra để nối.**

Cách sửa — cầu nối **quyết định ai đặt header**, và trả quyết định đó về cho bước qua tham số của
`run`:

| Cầu nối | `run` nhận | Kết quả trên dây |
|---|---|---|
| NOOP (`OTEL_TRACING` tắt) | `info.traceparent` (sợi dây thừa kế) | 1 header — **hành vi hôm nay, nguyên vẹn** |
| OTel | `undefined` → bước **không** đặt gì | 1 header do runtime tiêm, trỏ đúng span của bước |

`integration-handoff.steps.ts` **bỏ hẳn** header khi giá trị rỗng (một header rỗng vẫn là một
header, và vẫn bị nối bằng dấu phẩy).

---

## D. Trace THẬT — Nexagnet → Hatchet → worker → HTTP

**Không phải "additionalMetadata có cùng traceId".** Đây là span **đã được exporter gửi ra khỏi
tiến trình**, thu bằng một máy chủ HTTP thật (`__tests__/otlp-collector.ts`) nhận
`POST /v1/traces`, rồi đọc ngược.

```
TRACE 32309b64766e767aa647ffc45839f710
turn  [nexagnet-api] 12ms
  └─ handoff.enqueue  [nexagnet-api] 10ms
    └─ integration-handoff.v1 trigger  [nexagnet-api] 98ms      ← PRODUCER
      └─ GET  [nexagnet-api] 33ms                                 (SDK Hatchet gọi engine)
    └─ integration-handoff.v1 resolve   [nexagnet-workflow-worker] 12ms   ← CONSUMER
    └─ integration-handoff.v1 dispatch  [nexagnet-workflow-worker] 25ms   ← CONSUMER
      └─ POST  [nexagnet-workflow-worker] 13ms                    ← HTTP tới endpoint có kiểm soát
    └─ integration-handoff.v1 settle    [nexagnet-workflow-worker] 1ms    ← CONSUMER
```

**Ba tiến trình, không tiến trình nào dùng chung bộ nhớ với tiến trình nào.** Nếu `nexagnet-api`
và `nexagnet-workflow-worker` gặp nhau trên cùng một `traceId` thì đó là vì sợi dây W3C đi được
qua engine — không thể vì lý do nào khác.

Bài kiểm còn đối chiếu **đầu bên kia**: header `traceparent` mà hệ ngoài **thật sự nhận được** đúng
khuôn W3C và mang chính `traceId` đó.

### D.1 Vì sao tiến trình Nexagnet phải là một tiến trình con

Runtime OTel chỉ vào được bằng `node --import`. Tiến trình của vitest đã nạp xong `node:http` từ
lâu trước khi bài kiểm đầu tiên chạy, nên một ứng dụng boot **bên trong** vitest sẽ không bao giờ
có span HTTP/Prisma thật. Bằng chứng lấy từ một tiến trình không được đo đúng cách thì không phải
bằng chứng.

### D.2 Ma sát đã vấp: `--import` một file `.ts`

`@swc-node/register` **từ chối** `--import ./src/...ts` (`cannot be resolved in file:///.../apps/api/`)
trong khi Node thì phân giải được. Cách duy nhất không phụ thuộc vào ai thắng: đưa thẳng một
`file://` URL **tuyệt đối** đã phân giải sẵn (`workerExecArgv()` trong harness).

---

## E. Worker crash / recovery

Kịch bản có kiểm soát: hệ ngoài **giữ** yêu cầu lại → run nằm trong `dispatch` → **`kill -9`** worker
→ worker mới cùng phiên bản lên → hệ ngoài trả lời bình thường.

| Đo | Kết quả |
|---|---|
| Hệ ngoài **bị gọi** | ≥ 2 lần |
| Hệ ngoài **tạo bản ghi** | **đúng 1** |
| `Idempotency-Key` qua hai tiến trình | **1 giá trị duy nhất**, bằng khoá cầu nối sinh ra |
| Trace sau khi hồi phục | **cùng một `traceId`**, span `dispatch` mới vẫn là **con của `handoff.enqueue`** |
| `settle` chạy trên | worker **kế nhiệm** |

**Điều bài kiểm KHÔNG giấu:** span `dispatch` của **lần chạy bị giết** không bao giờ được gửi —
tiến trình giữ nó biến mất trước khi lô span kịp bay. Cây thật sau hồi phục vì thế **thiếu một
span**, và đó là **sự thật**, không phải lỗi. Bài kiểm khẳng định `>= 1` chứ không khẳng định một
con số cố định — đóng đinh con số sẽ là đóng đinh một lời nói dối.

```
TRACE dcc6aaaf40d324bd65cc67f3f6afe5a7 (sau khi worker chết và chạy lại)
turn  [nexagnet-api] 10ms
  └─ handoff.enqueue  [nexagnet-api] 8ms
    └─ integration-handoff.v1 trigger  [nexagnet-api] 91ms
      └─ GET  [nexagnet-api] 36ms
    └─ integration-handoff.v1 dispatch  [nexagnet-workflow-worker] 29ms
      └─ POST  [nexagnet-workflow-worker] 11ms
    └─ integration-handoff.v1 settle  [nexagnet-workflow-worker] 1ms
```

---

## F. Privacy trên dây — tiến trình worker

Quét trên **từng byte đã gửi** (`collector.rawBodies()`), không quét trên ý định của bộ lọc:

| Phép quét | Kết quả |
|---|---|
| `WORKFLOW_ENGINE_TOKEN` (JWT **thật** của cụm engine) | **0** |
| Mẫu JWT bất kỳ `eyJ….….` | **0** |
| Chuỗi `bearer ` | **0** |
| Chuỗi kết nối `postgresql://user:pass@` | **0** |
| Trường payload workflow (`operationVersion`, `destination`) | **0** |
| Neo danh tính (`nexagnet.workflow.task`, `nexagnet.traceId`) | **có** |

Dòng cuối quan trọng ngang năm dòng trên: không có nó thì năm phép quét kia chỉ đang chứng minh
rằng ta chưa gửi gì cả.

**Cơ chế, không phải sự cẩn thận:** cầu nối chỉ đọc `additionalMetadata()` — túi **đã đi qua**
`buildWorkflowMetadata()` (ép khuôn danh tính, quét PII, quét bí mật). Kiểu `TaskRunContext` được
khai báo **hẹp đúng bằng hai phương thức đó**, nên ai muốn đeo một trường của payload lên span sẽ
phải nới kiểu ra trước — và đó là lúc code review nhìn thấy.

---

## G. Bài kiểm mới

| Tệp | Số bài | Giữ điều gì |
|---|---:|---|
| `observability/otel/otel-worker-trace-bridge.spec.ts` | 9 | traceparent hợp lệ / sai khuôn / thiếu; OTel tắt vẫn chạy; `attempt` phân biệt các lần chạy lại; span chỉ mang neo danh tính; lỗi đi ra nguyên vẹn kèm mã lý do có kiểu |
| `workflow/hatchet/hatchet-workflow-worker.trace.spec.ts` | 6 | **mọi** bước đăng ký đều đi qua cầu nối (đếm `fn` = đếm lần gọi cầu nối); không bao giờ có hai header `traceparent`; `additionalMetadata()` ném thì bước vẫn chạy |
| `workflow/workflow-trace-correlation.int.spec.ts` | 3 | trace xuyên ba tiến trình; crash/recovery giữ tương quan + tác dụng phụ đúng một lần; privacy trên dây |

Đối chiếu 8 hạng mục hồi quy của yêu cầu phiên: ① ② ③ ④ ⑤ ⑥ ở hai tệp đầu, ⑦ ⑧ ở tệp thứ ba.
**Không bài nào bị xoá, bỏ qua, hay hạ để làm xanh.**

### G.1 Một khẳng định cũ được sửa cho đúng ý nó muốn nói

`workflow-worker-recovery.int.spec.ts` ⑦ trước đây so **cả chuỗi** `traceparent` trước/sau khi
worker chết. Một `traceparent` gồm `traceId` (lượt nghiệp vụ — **phải** giữ nguyên) và `spanId`
của **người gọi** (**phải** đổi, vì lần gọi thứ hai đến từ một bước khác trên một tiến trình khác).
So cả chuỗi tức là đang khẳng định *"không runtime tracing nào được phép bật lên"* — điều bài đó
không có ý định khẳng định. Nay so `traceId`. Ý định giữ nguyên, phạm vi khẳng định được thu về
đúng thứ nó đo.

---

## H. Bước 3 — HAI bài tập gỡ rối, ĐÃ SẴN SÀNG

Công cụ: `tools/poc-observability/src/human-debug-case.mjs --case a|b`

Mỗi lần chạy: dựng lỗi có kiểm soát → bắn **3 lượt BÌNH THƯỜNG rồi 3 lượt HỎNG** → in **phiếu đề**
(không có đáp án) → ghi **đáp án riêng** vào `evidence/human-debug-answer-<case>.md` (đã gitignore).

Đoạn "khoẻ" trước khi hỏng **không phải để đẹp**: một trace hỏng đọc một mình chỉ nói được *"có gì
đó đổ"*; đọc cạnh một trace khoẻ của cùng một việc thì nó nói được *"bước NÀY đang mất 4000ms
trong khi bình thường là 40ms"*.

### CASE A — AI lỗi

Tầng LLM (`PARSER_MODE=flowise`) trỏ vào máy chủ gây lỗi của POC, chuyển sang `http500` giữa chừng.
**Đã kiểm chứng dữ liệu tìm được trong ClickStack:**

```
turn                ERROR  ×3
  agent.run         ERROR  ×3   "Error: Flowise HTTP 500"
    parse flowise   ERROR  ×3
      POST (CLIENT) ERROR  ×3   http.response.status_code=500
                                url.full=http://127.0.0.1:4799/api/v1/prediction/drill-flow
```

### CASE B — DB lỗi

Một **cổng TCP** đứng trước Postgres, đóng giữa chừng (huỷ mọi kết nối đang mở **và** từ chối kết
nối mới — chỉ làm một trong hai thì Prisma vẫn chạy trên socket cũ và bài tập không có lỗi nào).

> **Không** `docker stop postgres`: cái DB đó dùng chung với bộ kiểm tích hợp và stack dev trên
> cùng máy. Một bài tập gỡ rối không được phép làm sập mọi thứ xung quanh nó.

**Đã kiểm chứng:**

```
turn                  ERROR  ×3
  conversation.resolve ERROR ×3
     StatusMessage: PrismaClientKnownRequestError:
                    Invalid `prisma.message.findMany()` invocation:
                    Server has closed the connection.
```

Lưu ý đã sửa vào đáp án: mã lỗi **phụ thuộc thời điểm** — kết nối đang mở bị cắt cho
`Server has closed the connection`, kết nối mới không mở được cho `P1001`. Cả hai là **cùng một
nguyên nhân**; đáp án chấp nhận cả hai.

### Kết quả THẬT — CASE A, 24/08/2026

Chủ dự án làm bài, **chỉ dùng ClickStack/HyperDX**, không đọc source / `docker logs` / SQL.

> Trả lời: *"lỗi nằm ở AI/Flowise, nguyên nhân chính là Flowise HTTP 500"* — trace
> `5ed5fd27b185f020f6110c32f4569567`.

**ĐÚNG.** Và bằng chứng mạnh hơn một câu trả lời khớp: trace id đó **không có trong đáp án soạn
sẵn**. Ba lượt hỏng trả HTTP 500 không kèm thân phản hồi, nên id của chúng chưa từng được ghi lại
ở đâu — muốn có nó thì phải tự tìm trong ClickStack. Cây của trace đó:

```
POST (Server)          ERROR  500
└─ turn                ERROR  "Error: Flowise HTTP 500"   nexagnet.chatId=2508572440887686813
   └─ agent.run        ERROR  "Error: Flowise HTTP 500"
      └─ parse flowise ERROR  "Error: Flowise HTTP 500"
         └─ POST (Client) ERROR 500 → http://127.0.0.1:4799/api/v1/prediction/drill-flow
```

**CASE B: đã dựng và đã kiểm chứng là giải được, nhưng KHÔNG được làm** — chủ dự án đóng bước này
sau CASE A. Ghi đúng như vậy: đây **không** phải "CASE B PASS". Bài vẫn chạy lại được bất cứ lúc
nào bằng `--case b`; hạ tầng và đáp án còn nguyên.

### Luật chấm (theo yêu cầu phiên)

Được dùng ClickStack/HyperDX. **Không** dùng source code, `docker logs`, SQL trực tiếp, hỏi Claude
trong lúc làm, hay đáp án. Tiêu chí ban đầu: PASS khi **cả hai** case, mỗi case xác định được
① tầng/bước lỗi và ② nguyên nhân chính, trong ≤ 10 phút.

**Chủ dự án rút xuống còn CASE A** và tuyên bố đạt sau khi làm xong bài đó. Đây là quyết định của
chủ dự án, không phải Claude tự chấm — và nó được ghi lại nguyên vẹn ở đây để lần sau ai đọc cũng
biết bước này đóng bằng **một** ca chứ không phải hai.

---

## I. Tệp đã sửa / thêm

**Sửa (tracked):**

- `apps/api/src/workflow/hatchet/hatchet-workflow-worker.adapter.ts` — đấu cầu nối vào 4 bước
- `apps/api/src/workflow/workflow-dispatcher.ts` — span `producer` ở đầu giao
- `apps/api/src/workflow/workflow.module.ts` — phân giải cầu nối bằng **hàm**, không bằng provider
- `apps/api/src/workflow/workflows/integration-handoff.steps.ts` — bỏ header `traceparent` rỗng
- `apps/api/src/workflow/__tests__/workflow-it.harness.ts` — `workerExecArgv()` nạp preload OTel
- `apps/api/src/workflow/workflow-worker-recovery.int.spec.ts` — §G.1

**Sửa (untracked, do phiên 13 tạo):**

- `apps/api/src/observability/worker-trace-bridge.ts` — thêm `kind`, thêm tham số `outbound` của `run`
- `apps/api/src/observability/otel/otel-worker-trace-bridge.ts` — hiện thực hai thứ trên
- `apps/api/src/observability/otel/otel-preload.ts` — bỏ một `eslint-disable` thừa (lint repo về 0)

**Thêm mới:**

- `apps/api/src/observability/otel/otel-worker-trace-bridge.spec.ts`
- `apps/api/src/workflow/hatchet/hatchet-workflow-worker.trace.spec.ts`
- `apps/api/src/workflow/workflow-trace-correlation.int.spec.ts`
- `apps/api/src/workflow/__tests__/otlp-collector.ts`
- `apps/api/src/workflow/__tests__/trace-evidence-child.ts`
- `tools/poc-observability/src/human-debug-case.mjs`

**Phụ thuộc: KHÔNG thêm/đổi gói nào.**

---

## J. Bảo toàn working tree

**Không** reset · **không** stash · **không** clean · **không** checkout đè · **không** `git add -A`
· **không** commit · **không** deploy · **không** đụng WATA / `apps/mini` / `apps/web` / `deploy/`
· `AUTO_SEND` **không đụng**.

Thay đổi hạ tầng duy nhất: dựng cụm Hatchet đã có sẵn (`start-engine.sh`, idempotent) để đúc token.
Không `down -v`, không xoá volume nào. Hai bài tập gỡ rối tự dọn tiến trình con của chúng
(đã kiểm: không còn cổng 3399/4799/55432 nào ở trạng thái LISTENING).

---

## K. Nợ kỹ thuật

1. **Compose triển khai CHƯA nạp preload OTel — cố ý dừng ở đây.**
   `deploy/netviet/compose.yaml` chạy `exec node apps/api/dist/main.js`, không `--import`. Chưa nối
   vì **hai** lý do: (a) quyết định dùng ClickStack cho production còn phải đánh giá riêng; (b) một
   cái bẫy đo được — `otel-preload.ts` import **tĩnh** `otel-runtime.js`, mà file đó import tĩnh cả
   ba instrumentation, **nên gắn `--import` vô điều kiện sẽ trả giá nạp SDK ngay cả khi
   `OTEL_TRACING` tắt**. Khi nối, lệnh chạy phải **rẽ nhánh theo biến**, không phải gắn cứng.

2. **`hatchet-api` không có vòng tự khởi động lại** (kế thừa từ phiên 13). Container báo xanh trong
   khi REST chết là cái bẫy **sẽ lặp lại** trên máy dev. `healthcheck` nên bắn vào **8744**.

3. **`WORKFLOW_ENGINE_TOKEN` chỉ sống trong một shell** (kế thừa). Phiên này đi vòng bằng cách ghi
   token ra file scratchpad rồi `export "$(cat …)"` trong **cùng một dòng lệnh** với vitest.

4. **Cây trace thật KHÁC cây minh hoạ trong yêu cầu phiên** — có chủ đích, xem §C.3 ③. Không có
   span `worker` bọc ngoài ba bước. Cần chủ dự án xác nhận là chấp nhận được; nếu bắt buộc phải có
   span bọc thì đó là quyết định *"vẽ cây cho đẹp"* và phải được ghi nhận đúng như vậy.

5. **Số span Prisma mỗi lượt vẫn cao** — đo được ở CASE B: 96 span `prisma:client:operation` cho 6
   lượt (~16/lượt), tức riêng Prisma đã ăn gần hết ngân sách "5–15 bước/lượt" của mục 10 rules. Bộ
   lọc hiện chỉ bỏ `prisma:engine:*`. Cần xem lại ngưỡng trước khi bật cho khách thật.
