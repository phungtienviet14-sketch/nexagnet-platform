# Bàn giao phiên 13 — Gate Hatchet trace correlation (DỪNG GIỮA CHỪNG có chủ đích)

> **STATUS: HISTORICAL SNAPSHOT**
> **AS OF:** 2026-08-24 (`67697a9`)
> **SUPERSEDED BY:** [tong-quan.md §12](tong-quan.md#12-trạng-thái-nền-tảng--documentation-truth-reset-27082026)
>
> Giữ nguyên để tra cứu lịch sử nghiên cứu và quyết định. **Không dùng làm trạng thái hiện tại.**
> Chỗ nào tài liệu này mâu thuẫn với bản canonical ở trên, bản canonical đúng.

> Ngày: **24/08/2026** · Nhánh: `feat/hoi-thoai-chot-don-main` · HEAD `2a7d211`
> Phiên trước: POC OpenTelemetry + ClickStack (24/08).
> **Phiên này DỪNG theo yêu cầu chủ dự án**, không phải vì bị chặn kỹ thuật.

---

## 0. Một câu

Đã **tìm ra và sửa** nguyên nhân thật làm bộ kiểm workflow IT đỏ — **không phải OTel, không phải
code** — baseline đã về **201/201**; đã **thiết kế và viết xong hai file** nối trace qua Hatchet.
Phần **đấu dây vào worker adapter chưa làm**, và đã được hoàn nguyên sạch để không để lại code
nửa vời.

---

## 1. ✅ Root cause bộ kiểm workflow IT — KHÔNG phải OTel

### Triệu chứng phiên trước

`beforeAll` hết giờ. Hết giờ **y hệt khi tắt OTel** — nên phiên trước kết luận đúng rằng không
được quy lỗi cho OTel.

### Nguyên nhân thật (đo được, không suy đoán)

Container `pocwf-hatchet-dashboard-1` chạy **HAI tiến trình**: `nginx` (cổng 80 → 8744) và
`hatchet-api` (REST, nghe `127.0.0.1:8080` bên trong container).

**Tiến trình `hatchet-api` đã chết.** nginx thì còn sống, nên:

| Phép đo | Kết quả |
|---|---|
| `docker ps` | `Up 2 hours` — **xanh** |
| `RestartCount` của container | **0** — chưa từng khởi động lại |
| nginx log | `connect() failed (111: Connection refused) ... upstream: http://127.0.0.1:8080` |
| Mọi lời gọi REST | **HTTP 502** |
| gRPC engine (cổng 7744) | **sống bình thường** |

Đây là chế độ hỏng **"container xanh, dịch vụ chết"**: PID 1 (nginx) còn sống nên Docker không
bao giờ khởi động lại container, trong khi thứ mà bộ kiểm cần đã chết từ lâu.

**Vì sao nó chết:** `pocwf-postgres-1` khởi động lại lúc `06:43:32Z`. `hatchet-engine` **có** vòng
tự khởi động lại (`RestartCount=6`, log `engine failure: could not create temporary connection to
primary database`) nên nó sống lại. `hatchet-api` **không có** vòng đó nên nó chết luôn.

### Vì sao đúng 7 bài đỏ, không phải cả 24

`workflow-it.harness.ts` có `engineReadClient()` đọc ngược trạng thái run **qua REST** (axios →
8744). Chỉ những bài dùng nó mới đỏ:

| Tệp | Trước sửa | Sau sửa |
|---|---|---|
| `workflow-e2e.int.spec.ts` | ✅ 3/3 | ✅ 3/3 |
| `worker-readiness.int.spec.ts` | ✅ 3/3 | ✅ 3/3 |
| `workflow-recovery.int.spec.ts` | ❌ 2 đỏ | ✅ **4/4** |
| `workflow-worker-recovery.int.spec.ts` | ❌ 2 đỏ | ✅ **2/2** |
| `workflow-outbox-durability.int.spec.ts` | ❌ 2 đỏ | ✅ **3/3** |
| `workflow-privacy-engine-read.int.spec.ts` | ❌ 1 đỏ | ✅ **9/9** |

> Chính bộ đo đã cảnh báo trước chuyện này — chú thích của `enginePortOpen()` viết: *"Hai kênh,
> hai cổng, hai container — một phép đo trên kênh này không nói được gì về kênh kia."* Lần này nó
> xảy ra theo chiều **ngược lại** với lần được ghi trong runbook: gRPC sống, REST chết.

### Cách sửa — **repair, KHÔNG phải reset**

```bash
docker restart pocwf-hatchet-dashboard-1
```

Bằng chứng đây là repair chứ không phải che lỗi stale-registration:

| | Trước restart | Sau restart |
|---|---:|---:|
| Số hàng `Worker` trong DB engine | **25** | **25** |
| REST `/api/v1/meta` | 502 | **200** |

**Không** `down -v`, **không** xoá volume, **không** mất một đăng ký nào. Trạng thái same-engine
giữ nguyên vẹn — đúng điều kiện mà §2 của yêu cầu phiên đặt ra.

### Bằng chứng phụ: phiên trước worker chưa từng chạm tới engine

```sql
select count(*) from "Worker" where "createdAt" between '2026-08-24 06:44' and '2026-08-24 09:09';
-- 0
```

Suốt cửa sổ phiên trước chạy, **không một worker nào đăng ký được với engine**. Kết hợp với việc
`WORKFLOW_ENGINE_TOKEN` **không nằm trong bất kỳ file `.env` nào** (nó chỉ là biến export của một
shell, và mỗi lần gọi Bash là một shell mới), đây là ứng viên hàng đầu cho lần hết giờ đó.
**Chưa dựng thí nghiệm xác nhận** — xem mục 5 (nợ).

---

## 2. ✅ Baseline `OTEL_TRACING=off` — 201/201

```bash
export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
```

```bash
OTEL_TRACING=off RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_HOST_PORT=127.0.0.1:7744 WORKFLOW_ENGINE_TLS_STRATEGY=none DATABASE_URL=postgresql://netviet:netviet_local@localhost:5432/netviet pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

| Lần đo | Kết quả |
|---|---|
| Chạy đầy đủ, **trước** khi sửa hạ tầng | **194 passed / 7 failed** (201), 391 s — cả 7 đều là axios → 502 |
| 4 tệp đỏ chạy lại, **sau** `docker restart` | **18 passed / 18** (4 tệp), 240 s |
| ⇒ Baseline hợp nhất | **201 / 201** |

`tsc --noEmit` trên `@netviet/api`: **exit 0** (đã có mặt hai file mới).

**Kết luận:** baseline **không hỏng vì code**, và **không hỏng vì OTel**. Nó hỏng vì một tiến
trình hạ tầng chết sau lưng một container báo xanh.

---

## 3. ✅ Đã viết: hai file nối trace qua Hatchet

Hai file **mới, độc lập, typecheck sạch, chưa ai import** — nên chúng **không đổi hành vi gì**.

### `apps/api/src/observability/worker-trace-bridge.ts`

Giao diện **không-SDK** + `NOOP_WORKER_TRACE_BRIDGE` + `resolveWorkerTraceBridge()`. Đối xứng với
`trace-bridge.ts` đã có. Ba quyết định được ghi lại ngay trong file:

1. **Vì sao cầu nối riêng, không dùng lại `TraceBridge`** — `turn()` mở span **gốc** của một lượt;
   worker thì **không bao giờ là gốc**, nó luôn đang làm tiếp việc của một tiến trình khác, có thể
   từ vài phút trước, có thể từ một container đã chết. Gộp hai thứ sẽ làm mờ đúng chỗ quan trọng
   nhất: ai là gốc.
2. **Vì sao không đi qua Nest DI** — `WorkflowWorkerModule` có bất biến *"danh sách phụ thuộc là
   một HỢP ĐỒNG"* (mỗi provider chạy trong **cả hai** tiến trình). `ObservabilityModule` kéo theo
   `TraceController` + `RecentTracesSink`, cả hai vô nghĩa trong tiến trình không phục vụ HTTP.
   Nên cầu nối được phân giải bằng **một hàm**, không bằng provider.
3. **Hai cổng, phải qua cả hai** — `OTEL_TRACING === 'on'` (Ý ĐỊNH — kiểm trước để tiến trình tắt
   tracing **không phải nạp SDK**, đó là lý do import ở đó là **động**), rồi `isOtelRunning()`
   (SỰ THẬT — vì `OTEL_TRACING=on` mà quên `--import` preload thì provider toàn cục là một bộ
   rỗng, và mở span vào đó sẽ báo cáo "có quan sát" trong khi không có gì). Ném ở bất kỳ đâu →
   NOOP.

### `apps/api/src/observability/otel/otel-worker-trace-bridge.ts`

Hiện thực OpenTelemetry. Bốn quyết định ngữ nghĩa được ghi lại:

1. **`propagation.extract`, không tự dựng `SpanContext`** — đó là đường mà chính đặc tả W3C định
   nghĩa, nên khi khuôn `traceparent` đổi thì ta đổi theo miễn phí. Nó cũng xử lý dùm trường hợp
   **sai khuôn**: `traceparent` hỏng → context không có span → span của ta thành gốc. Đúng hành vi
   fail-open ta muốn, và **không cần một dòng kiểm tra nào** để có nó.

2. **CHA-CON, không phải span link — kể cả sau khi worker chết và chạy lại.**
   `link` dành cho quan hệ **không** phải nhân-quả trực tiếp: gom lô, fan-in, một span có **nhiều**
   nguyên nhân thượng nguồn. Ở đây quan hệ là nhân-quả và **duy nhất**: lần chạy lại tồn tại **chỉ
   vì** lượt nghiệp vụ gốc đã giao việc đó, không vì lý do nào khác. Việc span cha **đã kết thúc**
   không làm quan hệ đó yếu đi — đó là hình dạng bình thường của mọi công việc bất đồng bộ, và
   OTel không cấm một span có cha đã đóng.
   ⇒ Mỗi lần chạy (kể cả lần thứ ba sau hai lần sụp) là một span **anh em** dưới cùng một cha,
   phân biệt bằng `nexagnet.workflow.attempt`. Đọc lên sẽ thấy các span cách nhau bằng những
   khoảng trống **thật** — đó là sự thật, không phải một cái cây đẹp.
   Dùng `link` ở đây sẽ nói dối theo chiều ngược lại: nó hàm ý *"có liên quan, không rõ thế nào"*,
   trong khi ta biết chính xác thế nào.

3. **KHÔNG bịa một span `worker` / `integration-handoff` bọc ba bước.**
   Một span như vậy sẽ dễ đọc hơn. Nó cũng sẽ là **bịa đặt**. Ba bước của một run **không** chạy
   trong một lần gọi: engine giao từng bước một qua gRPC, cách nhau tuỳ ý về thời gian, và sau một
   lần sụp thì bước sau có thể chạy trên một **tiến trình khác hẳn**. Không có khoảng thời gian
   nào trong bất kỳ tiến trình nào mà "cả ba bước đang chạy" ⇒ không có gì để một span như thế đo.
   Ba span **anh em** dưới cùng một cha là hình dạng đúng; ai muốn nhìn chúng như một khối thì lọc
   theo `nexagnet.workflow.name` — đó là việc của UI, không phải việc của dữ liệu.
   ⚠️ **Đây là chỗ cây thật sẽ KHÁC cây minh hoạ trong yêu cầu phiên** — có chủ đích. Xem mục 5.3.

4. **`SpanKind.CONSUMER`** — từ vựng OTel cho "đầu nhận của một hàng đợi". Nó là thứ làm backend
   hiểu đây là một biên bất đồng bộ chứ không phải một lần gọi hàm, và là thứ phân biệt độ trễ
   **của bước** với thời gian **nằm chờ** trong hàng.

**Neo gắn lên span chỉ lấy từ `additionalMetadata`**, không lấy một trường nào của `input`. Lý do
không phải sự thận trọng chung chung: túi metadata **đã đi qua** `buildWorkflowMetadata()` (ép
khuôn danh tính, quét PII, quét bí mật), còn `input` thì **không** có bảo đảm đó ở phía worker —
nó đến từ engine, và một khuôn tương lai có thể mang trường tự do. Lấy từ nguồn **đã có hợp đồng**
là cách duy nhất để bất biến "không rơi payload" đúng cho cả các khuôn **chưa viết**.

---

## 4. ⛔ Chưa làm

| Việc | Trạng thái |
|---|---|
| Đấu `WorkerTraceBridge` vào `hatchet-workflow-worker.adapter.ts` | đã viết rồi **HOÀN NGUYÊN** — xem mục 6 |
| Nạp preload OTel vào tiến trình worker (`--import` trong harness + compose) | chưa |
| Chứng minh trace thật xuyên API → Hatchet → worker → HTTP | chưa |
| Worker crash/recovery + đếm tác dụng phụ đúng 1 lần | chưa (nhưng 2 bài IT recovery đã xanh) |
| Privacy wire-capture trên telemetry **của worker** | chưa |
| 8 bài regression (§10 của yêu cầu phiên) | chưa |
| CASE A (AI lỗi) / CASE B (DB lỗi) cho human debug test | chưa |

### Chấm gate

| Gate | Kết quả |
|---|---|
| HATCHET TRACE CORRELATION | **CHƯA CHẤM** — chưa đấu dây, chưa có bằng chứng |
| WORKER CRASH RECOVERY | **CHƯA CHẤM** |
| WORKER PRIVACY | **CHƯA CHẤM** |
| HUMAN DEBUG TEST | **NOT READY** |

**Không gate nào được chấm PASS trong phiên này.** Baseline (mục 2) là thứ duy nhất đã đóng.

---

## 5. Nợ kỹ thuật ghi lại

1. **`hatchet-api` không có vòng tự khởi động lại.** Container báo xanh trong khi REST chết là một
   cái bẫy **sẽ lặp lại**. Nếu bộ kiểm còn phụ thuộc REST thì `hatchet.compose.yml` nên có
   `healthcheck` bắn vào **8744**, không phải chỉ dựa vào cổng gRPC. Trên CI mỗi lần chạy là một
   máy mới nên chuyện này **không** áp dụng cho CI — nó là bẫy của **máy dev**.

2. **`WORKFLOW_ENGINE_TOKEN` chỉ sống trong một shell.** Mỗi lần gọi Bash là một shell mới, nên
   token phải được export **trong cùng một dòng lệnh** với vitest, hoặc ghi ra file rồi đọc lại.
   Đây gần như chắc chắn là nguyên nhân "0 đăng ký" của phiên trước, nhưng **chưa dựng thí nghiệm
   xác nhận** — muốn chắc thì chạy worker với (a) không token và (b) token rác rồi đọc triệu chứng.

3. **Cây trace thật sẽ không giống cây minh hoạ trong yêu cầu phiên.** Sẽ **không** có span
   `worker` bọc ngoài ba bước (lý do ở mục 3 ③). Cần chủ dự án xác nhận là chấp nhận được **trước
   khi** phiên sau làm tiếp — nếu bắt buộc phải có span bọc thì đó là một quyết định "vẽ cây cho
   đẹp" và phải được ghi nhận là như vậy.

---

## 6. Bảo toàn working tree — đã kiểm

| Phép đo | Trước phiên | Sau phiên |
|---|---|---|
| `git diff \| git hash-object --stdin` | `300840f4d5f7ff00eba81dae163b4f84cbd087ce` | **giống hệt** |
| `git status --porcelain apps/api/src/workflow/` | rỗng | **rỗng** |

**Không** reset · **không** stash · **không** clean · **không** checkout đè · **không** `git add -A`
· **không** commit · **không** deploy · **không** đụng WATA / `apps/mini` · `AUTO_SEND` **không đụng**.

Hai file mới của phiên (chưa ai import, không đổi hành vi):

- `apps/api/src/observability/worker-trace-bridge.ts`
- `apps/api/src/observability/otel/otel-worker-trace-bridge.ts`

Hai sửa đổi tạm vào `hatchet-workflow-worker.adapter.ts` (một khối import + một field) đã được
**hoàn nguyên bằng thay-chuỗi chính xác**, KHÔNG dùng `git checkout`. Xác nhận: `git status` cho
thư mục đó rỗng.

Thay đổi hạ tầng duy nhất: `docker restart pocwf-hatchet-dashboard-1` (không mất dữ liệu — mục 1).
