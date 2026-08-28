# REFERENCE PLATFORM STACK — hợp đồng của `ultty-gd1-test`

> **Vai trò tài liệu:** canonical. Đây là **định nghĩa** một stack tham chiếu là gì và stack tham
> chiếu hiện tại đang ở đâu. Trạng thái kế hoạch vẫn chỉ nằm ở
> [`phat-trien/ke-hoach/tong-quan.md`](../phat-trien/ke-hoach/tong-quan.md); tài liệu này mô tả
> **hợp đồng** và **bằng chứng runtime**, không chứa ✅/⬜ của kế hoạch.
>
> **Cập nhật:** 28/08/2026 · **Đối chiếu mã nguồn tại:** `7a6cc63904d18be49c653ee1315e65046607bda5`
> (+ nhánh `feat/reference-stack-parity-v0` cho §7.2, §7.3, §7.6 và §8)

---

## 1. Vì sao cần một stack tham chiếu

Nexagnet là **nền tảng AI đa khách hàng**. Ultty là **tenant tham chiếu**, không phải lõi sản phẩm.
Hệ quả trực tiếp: **hoàn thiện nền tảng đi trước hoàn thiện toàn bộ nghiệp vụ Ultty** — nhưng không
được bỏ nghiệp vụ Ultty đã có.

Không có stack tham chiếu thì "đã ADOPT công nghệ X" trở thành một câu nói không kiểm chứng được.
Một công nghệ có thể đã được nghiên cứu, đã có code, thậm chí đã có test — mà **chưa từng chạy** ở
một môi trường thật nào. Bốn ngày 24–27/08/2026 cho ba ví dụ đắt giá về đúng khoảng cách đó
(xem §7).

`ultty-gd1-test` được chọn làm **NEXAGNET REFERENCE PLATFORM STACK**: mọi công nghệ ở trạng thái
ADOPT phải chứng minh được trên chính stack này.

---

## 2. Bốn mặt phẳng của nền tảng

| # | Mặt phẳng | Sở hữu cái gì | Chạy ở đâu |
|---|---|---|---|
| 1 | **TENANT DATA PLANE** | API, Web nghiệp vụ, Postgres, Hatchet worker, AI runtime, dữ liệu quan sát của tenant | Trong compose của **từng** tenant, dữ liệu **silo** |
| 2 | **SHARED CONTROL PLANE** | Tenant Registry, Fleet, Deployment, Release Registry, Identity, Entitlements, Support/Audit | Dùng chung, tenant được **enroll** vào |
| 3 | **AI ENGINEERING PLANE** | prompt, golden dataset, experiment, evaluation, quality gate | Ngoài đường chạy sản xuất |
| 4 | **AGENTIC OPS PLANE** | chẩn đoán, coding agent, CI, canary, remediation, phê duyệt của người | Ngoài đường chạy sản xuất |

Ranh giới này quyết định **điều kiện ADOPT** ở §3, nên nó phải được xác định trước.

---

## 3. Điều kiện để một công nghệ được coi là ADOPT

| Loại | Thuộc mặt phẳng | Bắt buộc gì trên `ultty-gd1-test` |
|---|---|---|
| **A** | TENANT DATA PLANE | phải **thực sự deploy/execute** trên gd1-test · health-checked · nằm trong deploy signal · có runtime proof · nếu **stateful** thì phải có chính sách retention/backup/recovery |
| **B** | SHARED CONTROL PLANE | không nhất thiết chạy trong compose của Ultty, **nhưng** gd1-test phải được **enroll/integrate**, và integration phải **runtime-proven** |
| **C** | TRIAL | chưa bắt buộc gd1-test chạy |
| **D** | ASSESS / HOLD | **tuyệt đối không cài** chỉ để "đủ tool" |

---

## 4. PLATFORM PARITY LEVELS

| Mức | Tên | Nghĩa |
|---|---|---|
| **L0** | RESEARCHED | đã nghiên cứu, có kết luận viết ra |
| **L1** | CODE-SUPPORTED | có mã nguồn trong repo, có test |
| **L2** | DEPLOYED | thực sự chạy trên stack tham chiếu |
| **L3** | HEALTH-CHECKED | có kiểm tra sức khoẻ, có mặt trong deploy signal |
| **L4** | PERSISTENT / RECOVERABLE | *(chỉ với thành phần stateful)* có retention + backup + đường khôi phục đã thử |
| **L5** | RUNTIME-PROVEN | đã chứng minh bằng bằng chứng thu từ tiến trình thật, không phải unit test |

> **REFERENCE PARITY = CLOSED** chỉ khi mọi công nghệ ADOPT đạt **L5** trên stack tham chiếu.
> Hôm nay điều đó **chưa đúng** — xem §6.

---

## 5. Bộ từ vựng trạng thái (bắt buộc)

`CLOSED` · `RUNTIME-PROVEN` · `DEPLOYED-NOT-PROVEN` · `CODE-ONLY` · `POC` · `PARTIAL` ·
`NOT-DEPLOYED` · `PLANNED` · `HISTORICAL`

**Cấm** viết tiến độ dạng phần trăm mơ hồ ("85% xong") khi không có checklist nghiệm thu kèm theo.

---

## 6. CANONICAL CURRENT TRUTH (27/08/2026)

Đây là bảng **được viện dẫn**; mọi tài liệu khác mâu thuẫn với bảng này thì tài liệu kia sai.

| Hạng mục | Trạng thái |
|---|---|
| Release Identity Closure | **CLOSED / RUNTIME-PROVEN** |
| Deploy Signal Reliability | **CLOSED / RUNTIME-PROVEN** |
| OTel code support | **RUNTIME-PROVEN trên gd1-test** (§8.8) |
| OTel export trên gd1-test | **DEPLOYED + span chảy thật** — 513 span / 213 trace |
| ClickStack (ClickHouse) | **DEPLOYED / HEALTH-CHECKED** — bền, retention 30 ngày; **backup/restore chưa có** |
| Historical Debug traces | **NOT PERSISTENT** |
| `ultty-gd1-test` | **REFERENCE STACK, NOT YET PARITY-CLOSED** · release đang chạy `270ef27` |
| Đường AI trên gd1-test | **KHÔI PHỤC 28/08** — DeepSeek đã nạp lại; `liveAiSmoke: pass`. Khoá Anthropic **vẫn hỏng** (§7.8) |

### 6.1 CURRENT STATE MATRIX

| Công nghệ / Năng lực | Mặt phẳng | Trạng thái mã | Deploy gd1? | Runtime proof? | Persistence? | Trạng thái | Cổng kế tiếp |
|---|---|---|---|---|---|---|---|
| NestJS API | 1 | đầy đủ | có | có | n/a | **RUNTIME-PROVEN** | — |
| Next.js Web | 1 | đầy đủ | có | có | n/a | **RUNTIME-PROVEN** | — |
| Postgres + Prisma 6 | 1 | đầy đủ | có | có | có (backup script) | **RUNTIME-PROVEN** | thử khôi phục định kỳ |
| Hatchet workflow engine | 1 | đầy đủ | có (`profiles: workflow`) | có | Postgres riêng | **RUNTIME-PROVEN** | retention/backup của `hatchet-postgres` |
| Workflow worker (2 khuôn) | 1 | đầy đủ | có | có | n/a | **RUNTIME-PROVEN** | — |
| Caddy (edge/TLS) | 1 | đầy đủ | có | có | n/a | **RUNTIME-PROVEN** | — |
| Tenant package (contract v2) | 1 | đầy đủ | có | có | n/a | **RUNTIME-PROVEN** | `tenant:doctor` (P5) |
| AI provider runtime (DeepSeek) | 1 | đầy đủ | có | có | n/a | **RUNTIME-PROVEN** | thoả thuận xử lý dữ liệu (§7.4) |
| Release identity | 1 | đầy đủ | có | **có** | manifest readonly | **CLOSED / RUNTIME-PROVEN** | — |
| GitHub deploy signals | 2 | đầy đủ | có | **có** | artifact 30 ngày | **CLOSED / RUNTIME-PROVEN** | — |
| Source correlation | 1 | đầy đủ | có | có | theo trace (không bền) | **RUNTIME-PROVEN** | phụ thuộc Debug View bền |
| Debug View | 1 | đầy đủ | có | có | **KHÔNG** | **PARTIAL** | trace bền (P2) |
| OpenTelemetry | 1 | có, **khoá sau `OTEL_TRACING=on`**; preload nối vào compose cho **api + 2 worker**; release identity dùng chung `release-sha.ts` (§7.6) | **KHÔNG** | không | n/a | **CODE-SUPPORTED / NOT-DEPLOYED** | một lần deploy `observability_stack: on` |
| ClickHouse (kho quan sát) | 1 | `deploy/netviet/observability/` + `profiles: ["observability"]`, cách ly có test khoá | **KHÔNG** | không | `ttl: 720h` đã khai, **backup chưa có** | **CODE-SUPPORTED / NOT-DEPLOYED** | một lần deploy, rồi backup/restore |
| HyperDX (UI quan sát) | 1 hoặc 2 | không có — **cố ý hoãn** (§8.6 B) | **KHÔNG** | không | n/a | **PLANNED** | sau P2; đường đọc của P2 là `api` → ClickHouse |
| Flowise | 1 | là **1 trong 3** adapter parser | có (container luôn chạy) | không dùng ở đường parser gd1 | volume riêng | **DEPLOYED-NOT-PROVEN** | quyết định `ModelRuntimePort` (P7) |
| Portainer | 2 | không có | không | không | n/a | **PLANNED** | POC (P4) |
| OpenTofu / Ansible | 2 | không có | không | không | n/a | **PLANNED** | P6 |
| Langfuse | 3 | không có | không | không | n/a | **PLANNED** | P7 |
| Keycloak | 2 | không có | không | không | n/a | **PLANNED** | P8 |
| OpenMeter | 2 | không có | không | không | n/a | **PLANNED** | P9 |
| LiteLLM · Sentry Seer · OpenFGA · OpenFeature | 2/3/4 | không có | không | không | n/a | **PLANNED (ASSESS)** | xem [tech-radar](tech-radar.md) |

### 6.2 Bằng chứng cho hai dòng CLOSED

Thu từ deploy run `33039065904` trên main `8b0f6ad603495fc90235d350b13550afd36a982d`:

```
rollout             pass  ROLLOUT_MATCHES_RELEASE     identitySource: "manifest"
health              pass  RUNTIME_HEALTHY
deterministicSmoke  pass  DETERMINISTIC_CONTRACT_OK   pre + post-restart
liveAiSmoke         pass  LIVE_AI_MATCHES_FIXTURE     parserMode: "deepseek"
classification      APPLICATION_ROLLED_OUT_HEALTHY    hardFailure: false
```

- **EXPECTED = MANIFEST = ENV**: cả ba đều là `8b0f6ad603495fc90235d350b13550afd36a982d`.
- **Manifest là FILE, readonly**: bind `.runtime/release.json` → `/runtime/release.json`, `rw=false`;
  ghi từ trong container ném `EROFS`.
- **Không stale**: `deployedAt` + `workflowRunId` trùng đúng run trên.
- **Sống qua restart**: tầng deterministic chạy lại sau khởi động lại vẫn đọc
  `release-identity=manifest:8b0f6ad`.
- **Permalink dùng đúng release**: `turns[N].view.sourceContext.releaseSha` là **40 ký tự**, dựng ra
  `…/blob/8b0f6ad6…/apps/api/src/pipeline/pipeline.service.ts#L432` và GitHub phân giải được đúng
  blob tại chính release đó — **không lùi về `main`**.

---

## 7. KNOWN RISKS

> Ba mục 7.1–7.3 là **quan sát runtime thật**, không phải suy đoán. Trạng thái được cập nhật khi có
> **bằng chứng ngược lại**, không phải khi có ý định sửa.
>
> | Mục | Trạng thái | Cần gì để đóng hẳn |
> |---|---|---|
> | 7.1 `zca_listener` im lặng | `UNRESOLVED` — **~44h tính tới 28/08**, và log/`/health` đều xanh | `/health` phải phân biệt được "không ai nhắn" với "socket đã chết" + listener tự nối lại + tin mới đi hết đường |
> | 7.2 preflight ghi đè `autoSend` | **`FIXED` — chờ chứng minh** | một lần preflight thật chạy qua |
> | 7.3 `bot-poller` flaky | **`RESOLVED`** | — (đóng bằng cấu trúc, xem dưới) |
> | 7.6 OTel mang release identity **thứ hai** | **`FIXED` — chờ chứng minh** | một trace bền mang đúng SHA canonical (PROOF 4) |
> | 7.7 Ba giả định sai về ảnh Docker | **`FIXED`** | — (đóng trước khi deploy, xem dưới) |
> | 7.8 **Cả hai** nhà cung cấp AI của gd1-test đã chết | `UNRESOLVED` — **CHẶN P2** | một khoá còn hiệu lực (số dư DeepSeek, hoặc khoá Anthropic + đổi hồ sơ) |

### 7.1 `zca_listener` im lặng — `UNRESOLVED`, và **sắc nét hơn bản trước**

**Đo lại 28/08/2026 05:10 UTC**, trực tiếp trên `zalo-ultty-gd1-test-postgres-1`:

```
inbound  | copilot_paste     | 44 tin | tin cuối: 2026-08-27 04:36:22   (~24 giờ trước)
inbound  | zca_listener      | 98 tin | tin cuối: 2026-08-26 08:52:41   (~44 giờ trước)
outbound | system_outbound   | 57 tin | tin cuối: 2026-08-27 04:21:34
```

Khoảng lặng **giãn ra từ ~19 giờ lên ~44 giờ**. Nhưng phần đáng chú ý không nằm ở con số.

**Log của chính tiến trình nói rằng nó đang khoẻ:**

```
2026-08-27T04:36:17  ZcaListener     CHANNEL_MODE=zca -> nghe tin nhom qua zca-js
2026-08-27T04:36:18  ZaloUserClient  zca-js dang nhap thanh cong
2026-08-27T04:36:18  ZaloUserClient  zca-js listener: connected
                     (không còn dòng nào nữa — 25 giờ)
```

`/health` của cùng container: `{"status":"ok","uptimeSeconds":88501}`.

**Đây mới là rủi ro thật, và nó lớn hơn "kênh im".** Ba tín hiệu — log, `/health`, deploy signal —
đều xanh, trong khi **kênh đọc chính của GĐ1 không mang về một tin nào**. Hai trạng thái dưới đây
hiện **không phân biệt được** từ bên ngoài:

| Trạng thái | Quan sát thấy gì |
|---|---|
| Không ai nhắn trong nhóm 44 giờ | log im, `/health` `ok`, 0 tin mới |
| Socket đã chết, listener không biết | log im, `/health` `ok`, 0 tin mới |

Và socket **có thể** chết lặng lẽ — chính log chứng minh: `zca-js listener closed (1000):
NORMAL_CLOSURE` lúc `04:36:01`. Mã `1000` là đóng **bình thường**, không phải lỗi; không có
ngoại lệ, không có retry. Lần "hồi phục" ngay sau đó (`04:36:16`) là do **container được tạo lại
khi deploy**, không phải do listener tự nối lại.

**Vì sao nó chặn P2:** `/health` hiện chỉ có `status` và `uptimeSeconds` — **không một chiều nào
về kênh**. Nên năng lực "AI đọc được nhóm Zalo thật" không có bất kỳ cổng nào canh, và mọi bằng
chứng "AI đọc được nhóm" hiện đứng trên đường `copilot_paste` (dán tay), tức **không chứng minh
inbound Zalo thật**.

**Cổng đóng — nay nêu được cụ thể, không còn là "một lần chạy có tin mới":**

1. `/health` (hoặc một cổng riêng) phải có **độ tuổi của tin cuối cùng theo từng kênh** và
   **trạng thái socket của listener** — để "im vì không ai nhắn" khác được với "im vì đã chết";
2. listener phải **tự nối lại** sau `NORMAL_CLOSURE`, và ghi log mỗi lần nối lại;
3. tín hiệu đó phải có mặt trong deploy signal;
4. sau đó mới tới: một tin `zca_listener` mới đi hết đường.

Thuộc **P2**. Ba mục đầu là **việc chưa làm**, không phải việc đã làm mà chưa đo.

### 7.2 Preflight ghi đè giá trị runtime quan sát được — `FIXED`, chờ chứng minh

**Bằng chứng:** `deploy/netviet/gd1-test-preflight.mjs`

```js
if (providerSmoke.ok) runtime.autoSend = 'off';
```

`runtime.autoSend` được **đọc từ container đang chạy**, rồi bị ghi đè bằng hằng số.

**⚠️ Đánh giá cũ ở đây NHẸ HƠN thực tế.** Bản trước ghi "chưa gây hại vì trường này không lọt vào
`machineProof`". Lần theo chính đối tượng đó thì không phải vậy:

```
527  runtime.autoSend = 'off'            ← ghi đè
553  runtime,                            ← CHÍNH đối tượng đó vào `input.deployment`
807  ...runtimeErrors(deployment?.runtime)
```

`runtimeErrors()` **đã có sẵn** cổng "autoSend phải là `off`" (`REQUIRED_RUNTIME`). Phép ghi đè chạy
**trước** khi `runtime` đi vào `input`, nên cổng đó **không bao giờ có thể đỏ**. Đây không chỉ là
bằng chứng bị làm đẹp — đó là **một cổng an toàn bị vô hiệu hoá trong im lặng**: một stack thật sự
đang chạy `AUTO_SEND=on` sẽ đi qua preflight sạch sẽ.

**Đã sửa** (`da60f73`): xoá dòng ghi đè; cổng ở nguyên chỗ cũ và nay nhìn thấy sự thật. Kèm bài test
đỏ-trước-khi-sửa: stack báo `AUTO_SEND=on` + smoke provider xanh ⇒ `ok === false` và bằng chứng giữ
đúng `'on'`.

**Cổng đóng hẳn:** một lần preflight thật chạy qua trên gd1-test. Thuộc **P2**.

### 7.3 `bot-poller.spec.ts` flaky — `RESOLVED`

**Bằng chứng:** `apps/api/src/ingest/bot-poller.spec.ts` → *"tiep tuc long-poll khi batch truoc con
cho burst"* đỏ **2 lần** trong `pnpm test` toàn monorepo (27/08), nhưng **22/22 xanh** khi chạy
riêng file đó, và xanh ở CI.

**Vì sao đáng lo:** một bài test đỏ ngẫu nhiên dạy người ta bỏ qua màu đỏ. Đó là chi phí thật, kể cả
khi mã nguồn đúng.

**Nguyên nhân:** `await vi.waitFor(..., { timeout: 100 })` — một **hạn chót cho THÀNH CÔNG**. Chạy
cả monorepo thì máy bận, vòng lặp chưa kịp poll lần hai trong 100 ms, và bài đỏ dù mã đúng.

**Đã sửa** (`24c48d4`): chờ **một sự kiện** thay vì chờ **một khoảng thời gian** — `fetchUpdates`
lần hai tự báo là nó đã được gọi. Khác biệt có cấu trúc, không phải nới rộng hạn chót: máy chậm nay
chỉ làm bài **chạy lâu hơn**, không làm nó đỏ. Nếu vòng lặp thật sự bị tuần tự hoá thì sự kiện không
bao giờ đến và bài đỏ bằng hạn chót của chính vitest — một hạn chót cho **THẤT BẠI**.

Bài cũng khẳng định mạnh hơn trước: chốt thêm rằng batch đầu **vẫn đang chờ** lúc lần poll thứ hai
chạy, tức hai việc thật sự gối lên nhau.

### 7.6 OTel phân giải một danh tính release **thứ hai** — `FIXED`, chờ chứng minh

> Phát hiện 28/08/2026, trong lúc chuẩn bị bật OTel trên gd1-test. Chưa gây hại **vì OTel chưa
> từng chạy** — nhưng nó sẽ hỏng đúng vào lần đầu tiên P2 bật nó lên, tức lúc không ai đang nhìn.

**Bằng chứng:** `apps/api/src/observability/otel/otel-config.ts`

```ts
release: env.RELEASE_GIT_SHA ?? 'unknown'
```

Telemetry **nội bộ** (Debug View) phân giải release bằng `resolveReleaseIdentity()`: `release.json`
trước, biến môi trường sau, và **hai nguồn lệch nhau thì trả `unknown`** kèm `source: 'conflict'`.
Telemetry **bền** (OTel → ClickStack) thì không. Ba hệ quả, không phải một:

| # | Lỗi | Vì sao chí mạng |
|---|---|---|
| 1 | `compose.yaml` truyền `RELEASE_GIT_SHA: ${RELEASE_GIT_SHA:-}` | thiếu ở host ⇒ container nhận **chuỗi rỗng**, mà `??` không bắt chuỗi rỗng ⇒ `nexagnet.release` đi ra ngoài là `''` |
| 2 | manifest **không được đọc** | manifest là nguồn CHÍNH trên gd1-test (`identitySource: "manifest"`, §6.2) ⇒ hai kho telemetry của **cùng một tiến trình** mang hai SHA khác nhau |
| 3 | xung đột bị **im lặng chọn `env`** | canonical trả `unknown` *có chủ ý*: một SHA sai dẫn permalink tới **commit sai**, tệ hơn hẳn một dấu "không biết" |

**Vì sao đây là vấn đề của P2 chứ không phải của sau này:** PROOF 4 của P2 — *"mở một trace cũ →
giữ đúng release SHA cũ → permalink cũ vẫn đúng"* — **chạy trên chính trace bền**. Nếu trace bền
mang một danh tính release khác, PROOF 4 đo một thứ không phải cái nó tưởng đang đo.

**Đã sửa** (`release-sha.ts`): luật phân giải được tách thành **một module lá phụ thuộc duy nhất
`node:fs`**, và **cả hai** đường đọc gọi chung nó — nên chúng không thể trả lời khác nhau. Không
chọn cách "viết lại luật lần thứ hai trong `otel-config.ts`": bản sao thứ hai đã từng tồn tại, và
nó sai theo cả ba cách ở trên cùng lúc.

Ràng buộc kèm theo: preload chạy `node --import`, **trước** mọi import nghiệp vụ, nên lời giải
không được kéo đồ thị module nghiệp vụ vào (`release-identity.ts` import `@netviet/tenant`). Ràng
buộc đó nay là **màu đỏ** chứ không còn là chú thích: `otel-preload-isolation.spec.ts` đi bộ đồ thị
import tĩnh từ preload và đã được **kiểm chứng ngược** — cho preload import `release-identity.ts`
thì bài đỏ đúng với `['@netviet/tenant']`.

Span nay mang thêm `nexagnet.release_source`, và `source: 'conflict'` kêu to một lần lúc khởi động.

**Cổng đóng hẳn:** PROOF 4 chạy trên trace bền. Thuộc **P2**.

### 7.7 Ba giả định sai về ảnh Docker — `FIXED` trước khi chạy một lần deploy nào

> Không phải sự cố runtime: đây là ba thứ **sẽ** hỏng ở lần deploy đầu tiên, bắt được bằng cách
> đọc **config của chính hai ảnh** từ registry thay vì tin vào thói quen. Ghi lại vì cả ba đều
> thuộc cùng một họ — *"ảnh này cư xử như mọi ảnh khác"* — và họ đó sẽ quay lại.

| # | Giả định | Sự thật | Hậu quả nếu không sửa |
|---|---|---|---|
| 1 | Container nào cũng chạy được `wget` trong `healthcheck` | `otel/opentelemetry-collector-contrib` dựng từ **`scratch`**: ba lớp, chỉ có `/otelcol-contrib`, chứng chỉ CA và tệp cấu hình. **Không shell, không `wget`, không `curl`** | `healthcheck` đỏ **vĩnh viễn** ⇒ `up --wait` thất bại ⇒ deploy hỏng vì một cổng **không thể xanh** |
| 2 | `chmod 600` là cách an toàn để đặt một tệp bí mật cạnh container | Ảnh khai `USER 10001:10001`; ClickHouse dùng `DEFAULT_UID=101`. Bind mount **giữ nguyên** chủ sở hữu của host | Tiến trình không đọc được tệp khoá. Triệu chứng **không phải một lỗi rõ ràng** — chỉ là *"không có span nào"* |
| 3 | Biến môi trường của ảnh có tên ổn định | Tên đổi giữa các đời: `CLICKHOUSE_ACCESS_MANAGEMENT` → `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT` | User ghi không có `CREATE USER` ⇒ `init-observability.sql` thất bại ⇒ **user đọc không bao giờ tồn tại** ⇒ đường đọc của Debug View chết |

**Đã sửa:** bỏ `healthcheck` của collector và đọc sức khoẻ **từ container khác** trên cùng mạng
(`clickhouse` là ảnh alpine, có busybox `wget` — đã kiểm); `chown` theo đúng uid của từng ảnh với
`0400` cho hai tệp có bí mật và `0444` cho cấu hình collector (không chứa bí mật); đặt **cả hai**
tên biến.

**Điều đáng rút ra không phải ba lỗi này.** Là chi phí: một vòng deploy ~17 phút, một vòng đọc
config ảnh ~1 phút. Trước khi thêm bất kỳ ảnh mới nào vào compose, đọc `config.User`,
`config.Entrypoint` và lịch sử lớp của nó.

### 7.8 **CẢ HAI** nhà cung cấp AI của gd1-test đã chết — `UNRESOLVED`, **CHẶN P2**

> Phát hiện 28/08/2026 khi deploy run `33145000232` dừng ở preflight. **Không phải lỗi mã nguồn**,
> và không phải hệ quả của thay đổi nào trong lần phát hành này.

**Preflight từ chối, đúng như nó phải làm:**

```
Ultty GD1-test no-mock preflight FAILED before build/deploy:
 - parser provider proof healthPassed must be true
 - parser provider proof structuredOutputPassed must be true
 - parser provider smoke blocked: LIVE_AI_PROVIDER_UNAVAILABLE
```

**Hỏi thẳng hai nhà cung cấp, từ bên trong `zalo-ultty-gd1-test-api-1`:**

| Nhà cung cấp | Khoá có mặt | Kết quả |
|---|---|---|
| DeepSeek (`PARSER_MODE`, `ADVICE_COMPOSER`) | có, 35 ký tự | **HTTP 402** — `Insufficient Balance` |
| Anthropic (đường lui theo CLAUDE.md) | có, 108 ký tự | **HTTP 401** — `API key is invalid` |

**Vì sao nó chặn P2, chứ không chỉ là phiền:** `ultty-gd1-test` là **stack tham chiếu**. Điều kiện
ADOPT loại A ở §3 đòi công nghệ phải *thực sự chạy* trên chính stack này. Hôm nay stack đó **không
chạy được đường AI nào**, nên:

- không deploy được bản phát hành mới (cổng preflight cứng — và **cổng này đúng**);
- ⇒ OTel/ClickHouse không lên được **L2**;
- ⇒ bốn runtime proof của P2 không chạy được;
- ⇒ **P2 không thể CLOSED** cho tới khi có một khoá còn hiệu lực.

**Đây là chặn HÀNH CHÍNH, không phải chặn kỹ thuật** — cùng họ với org policy chặn khoá HMAC. Không
có cách nào trong repo sửa được nó, và **không được** sửa bằng cách hạ cổng: một stack tham chiếu
deploy "thành công" trong khi AI đã chết là đúng cái trạng thái mà bốn tín hiệu deploy tồn tại để
ngăn.

**Ba đường đi, theo thứ tự nên chọn:**

1. **Nạp lại số dư DeepSeek** — nhanh nhất, giữ nguyên cấu hình gd1-test hiện tại.
2. **Thay khoá Anthropic** rồi đổi hồ sơ gd1-test sang `PARSER_MODE=claude` — *đúng hướng dài hạn*:
   CLAUDE.md yêu cầu bản chạy dữ liệu khách thật phải dùng Claude, hoặc bổ sung DeepSeek vào thoả
   thuận xử lý dữ liệu (§7.4). Nhưng `render-secrets.sh` hiện **ép cứng** `PARSER_MODE='deepseek'`
   cho `gd1-test`, nên đường này cần sửa mã.
3. **Hoãn P2**, làm P3 (quản trị GitHub) trước — P3 không đụng tới stack và cũng đang `UNRESOLVED`
   ở mức HIGH.

**Mốc trước đó:** deploy run `33039065904` (27/08, ~25 giờ trước) có `liveAiSmoke: pass` với
DeepSeek. Nên số dư cạn **trong khoảng 25 giờ đó**, không phải một trạng thái đã tồn tại lâu.

### 7.4 Hai rủi ro tuân thủ đã biết, vẫn mở

- **DeepSeek chưa nằm trong danh sách bên thứ ba được duyệt** (chỉ KiotViet + Claude). Chạy thật với
  dữ liệu khách phải hoặc đổi `PARSER_MODE=claude`, hoặc bổ sung DeepSeek vào thoả thuận xử lý dữ
  liệu. gd1-test hiện chạy `PARSER_MODE=deepseek` với `DATA_CLASSIFICATION=test`.
- **Kênh zca** cần tài khoản phụ + văn bản chấp nhận rủi ro ToS của khách.

### 7.5 Quản trị GitHub — `UNRESOLVED`, mức HIGH

**Bằng chứng** (GitHub API, 27/08/2026):

```
GET /repos/…/rulesets                    → 0 ruleset
GET /repos/…/branches/main/protection    → 404 "Branch not protected"
GET /repos/…                             → private=false
```

`main` **không được bảo vệ**: không bắt buộc PR, không bắt buộc CI xanh, không chặn force-push — và
repo đang **public**. Toàn bộ kỷ luật release hiện nay dựa vào **thói quen của người vận hành**, chứ
không phải vào một cơ chế cưỡng chế nào.

**Vì sao nó chặn đường dài:** không thể mở bất kỳ mức tự động hoá coding agent nào lên một nhánh mà
ai cũng ghi thẳng vào được. Thuộc **P3**, và **P3 phải xong trước P12–P15**.

---

## 8. Mô hình triển khai ClickStack — **ĐÃ CHỌN**

> **Quyết định (27/08/2026):** **Shared OTLP Collector + kho quan sát cách ly theo từng tenant.**
> Collector dùng chung **chỉ là mặt phẳng thu nhận/định tuyến, không giữ trạng thái**.
> **Không** dùng bảng trace dùng chung với cách ly bằng bộ lọc `tenantId`.

### 8.1 Điều kiện cứng của quyết định

1. **Định tuyến phải dựa trên danh tính/credential do bản triển khai cấp**, không dựa trên bất kỳ
   giá trị nào nằm trong tải trọng hoặc do bên gửi tự khai.
2. **Fail-closed.** Không có credential hợp lệ thì dữ liệu bị từ chối — không có đường mặc định
   để rơi vào.
3. **Credential ghi, credential đọc, retention, backup và lệnh xoá đều tách theo tenant.**

### 8.2 Cách KHÔNG đạt — và đây là cách mặc định người ta hay chọn

`routingconnector` định tuyến theo `otelcol.client.metadata["X-Tenant"]`. Ba lỗi, mỗi lỗi đủ để
loại:

| Lỗi | Vì sao chí mạng |
|---|---|
| Header là thứ **bên gửi tự khai** | Tenant A đặt `X-Tenant: B` là ghi thẳng vào kho của B |
| Connector **chỉ đọc được header/metadata thô** | Không có đường nào đọc danh tính **đã xác thực** (`client.Info.Auth`) — tài liệu không hỗ trợ |
| `default_pipelines` | Không khớp route nào thì **vẫn đi tiếp** — fail-**open** |

Đây chính là "cách ly thành lời hứa cấu hình" mà bảng §8 cũ cảnh báo.

### 8.3 Cách đạt — buộc danh tính vào **listener + credential**

```yaml
extensions:
  # `filename` chu khong phai `token`: khoa doc tu TEP DUOC MOUNT, khong nam trong bien moi
  # truong cua tien trinh. Cung duong ma `.runtime/secrets.env` va `release.json` da di, va
  # khoa khong lo ra trong `docker inspect`.
  bearertokenauth/ultty: { filename: /run/otlp-keys/ultty }
  bearertokenauth/amico: { filename: /run/otlp-keys/amico }

receivers:
  otlp/ultty:
    protocols: { http: { endpoint: ":4318", auth: { authenticator: bearertokenauth/ultty } } }
  otlp/amico:
    protocols: { http: { endpoint: ":4328", auth: { authenticator: bearertokenauth/amico } } }

exporters:
  clickhouse/ultty:
    endpoint: tcp://obs-ultty:9000
    username: ultty_writer
    password: ${env:ULTTY_CH_PASSWORD}
    database: obs_ultty
    ttl: 720h
  clickhouse/amico:
    endpoint: tcp://obs-amico:9000
    username: amico_writer
    password: ${env:AMICO_CH_PASSWORD}
    database: obs_amico
    ttl: 2160h

service:
  pipelines:
    traces/ultty: { receivers: [otlp/ultty], exporters: [clickhouse/ultty] }
    traces/amico: { receivers: [otlp/amico], exporters: [clickhouse/amico] }
```

**Vì sao đây là cách ly bằng KIẾN TRÚC chứ không phải bằng cấu hình:** pipeline được chọn bởi
**listener nào đã nhận kết nối**, mà listener đó đòi đúng credential của tenant đó. **Không tồn
tại đường** nào từ receiver của A sang exporter của B — không phải "có đường nhưng đã lọc". Sai
credential thì receiver từ chối, và không có `default_pipelines` để rơi vào.

Bằng chứng thành phần gốc:

- `bearertokenauthextension` hiện thực **`configauth.ServerAuthenticator`**, và **nhiều instance
  đặt tên** gắn được vào nhiều receiver khác nhau (`auth: { authenticator: bearertokenauth/<tên> }`).
  Nhận khoá qua `token`, `tokens` hoặc **`filename`** (tệp chứa token theo dòng) — ta dùng
  `filename`.
- `clickhouseexporter` nhận `endpoint`/`username`/`password`/`database`/`ttl` **theo từng
  instance** ⇒ credential ghi và retention tách theo tenant. `password` là `configopaque.String`
  và Collector khai triển `${env:…}`, nên giá trị thật đến từ `render-secrets.sh` lúc triển khai,
  **không bao giờ nằm trong repo**. Exporter **không** có khoá `password_file` — đừng viết ra một
  khoá không tồn tại rồi tưởng là đã an toàn.
- HyperDX v2 có **Connections** (host/username/password) + **Sources** (database/table) và chạy
  được ở chế độ **"HyperDX only"** trỏ vào ClickHouse tự quản, với user **readonly** ⇒ credential
  **đọc** cũng tách theo tenant.

### 8.4 Kho đặt ở đâu

**Một ClickHouse trong compose của từng tenant** (mặt phẳng 1 — TENANT DATA PLANE), đúng nguyên
tắc silo: xoá tenant là xoá kho.

**Không** chọn "N database trên một cụm chung". Cách đó thoả mãn từng chữ của §8.1, nhưng nó đưa
cách ly về lại thành **cấu hình phân quyền** — một lỗi `GRANT` là rò dữ liệu chéo khách. Giá phải
trả cho lựa chọn này là **RAM/đĩa nhân theo số tenant**, và đó là giá được chấp nhận có ý thức.

### 8.5 Trả lời các câu hỏi mà §8 cũ yêu cầu trả lời trước khi cài

| Câu hỏi | Trả lời |
|---|---|
| Trace của tenant có phải dữ liệu của tenant đó không? | **Có.** Trace mang nội dung nghiệp vụ và có thể mang dữ liệu cá nhân |
| Ai được xem? | Người vận hành Nexagnet qua credential **readonly theo tenant**; không có credential nào nhìn được nhiều tenant |
| Xoá một tenant thì trace đi đâu? | Đi cùng stack của tenant — kho nằm trong chính compose đó |
| Retention bao lâu? | `ttl` cấu hình **theo từng exporter**, tức theo tenant. Mặc định stack tham chiếu: **30 ngày** |
| Ai trả tiền cho đĩa? | Tenant, cùng chỗ với Postgres nghiệp vụ của họ |

### 8.6 Hai sai khác có chủ ý khi hiện thực (28/08/2026)

> Ghi ở đây chứ không giấu trong commit message: một người đọc §8.3 rồi mở `compose.yaml` sẽ thấy
> hai thứ **không khớp**. Cả hai đều là lựa chọn, không phải cắt xén.

**A. Collector nằm trong compose của TỪNG stack, không phải một collector dùng chung.**

§8.3 vẽ một collector phục vụ N tenant. Cái đó cần một **mặt phẳng điều khiển dùng chung** — có
vòng đời triển khai riêng, không thuộc compose của khách nào. Mặt phẳng đó **chưa tồn tại**, và
dựng nó là P4/P6 mà P2 bị **cấm** bắt đầu ("DO NOT DO — không bắt đầu Fleet View").

Chọn cách này **không làm cách ly yếu đi** — ngược lại: không còn cả một tiến trình dùng chung để
mà rò. Cái mất là tính gọn khi vận hành nhiều khách, và **RAM nhân theo số tenant** (cùng loại giá
đã chấp nhận ở §8.4 cho kho).

Đường quay lại rẻ: khuôn `otel-collector.template.yaml` giữ **nguyên hình dạng §8.3** — mỗi khối
mang tên riêng theo stack (`otlp/<slug>`, `bearertokenauth/<slug>`, `clickhouse/<slug>`,
`traces/<slug>`) — nên gộp N tệp lại là một phép **nối chuỗi**, không phải viết lại.
`observability-isolation.contract.test.mjs` **dùng đúng phép nối đó** để kiểm: nó render hai stack,
ghép, rồi hỏi "có đường nào từ A sang B không".

**B. Không có HyperDX trong đợt này.**

HyperDX v2 kéo theo **MongoDB** cho *mỗi* stack khách. Và đường **ĐỌC** mà bốn runtime proof của
P2 cần là `api` → ClickHouse bằng **user readonly riêng**, không phải một giao diện. Một UI cho
người vận hành là thứ đáng có, nhưng nó không nằm trên đường tới cổng ra của P2 — thêm nó bây giờ
là ba container nữa cho một thứ chưa ai cần tới.

Hệ quả phải nói rõ: **§8.3 dòng "HyperDX chạy được ở chế độ HyperDX only" vẫn chỉ là khảo sát**,
chưa được chứng minh trên stack nào.

### 8.7 Bằng chứng THÀNH PHẦN (28/08/2026) — chưa phải bằng chứng trên stack tham chiếu

> **Đọc kỹ nhãn.** Dưới đây là chuỗi OTLP → ClickHouse chạy thật, bằng **đúng hai ảnh đã ghim
> digest**, nhưng trên **máy lập trình viên**, không phải trên `ultty-gd1-test`. Theo §4 đây là
> bằng chứng cho **L1**, không phải L2 và càng không phải L5. Nó trả lời "thiết kế này có chạy
> không", không trả lời "nó có chạy trên stack tham chiếu không".
>
> Nó tồn tại vì một lý do rẻ tiền và thực dụng: mỗi vòng deploy mất ~17 phút, còn vòng này mất
> ~3 phút. Ba lỗi ở §7.7 được bắt bằng cách đọc config của ảnh; bốn điều dưới đây được bắt bằng
> cách chạy chúng.

| Phép thử | Kết quả |
|---|---|
| `otelcol-contrib validate` trên chính binary 0.130.1 | **RC=0** |
| Collector khởi động với cấu hình đã render | sạch, không một dòng cảnh báo |
| OTLP/HTTP + **khoá đúng** | **HTTP 200** |
| OTLP/HTTP + **khoá của tenant khác** | **HTTP 401** |
| OTLP/HTTP + **không khoá** | **HTTP 401** |
| `init-observability.sql` chạy, user **đọc** được tạo | `system.users` có cả `*_writer` lẫn `*_reader` |
| Exporter tự dựng schema | `otel_traces` + `otel_traces_trace_id_ts` (+ materialized view) |
| **User readonly SELECT được** | ✅ — đúng đường mà Debug View sẽ đi |
| `ttl: 720h` biến thành gì trên bảng | `TTL toDateTime(Timestamp) + toIntervalDay(30)` |

**Hai điều đáng giá nhất, và cả hai đều không suy ra được từ tài liệu:**

**1. Cách ly fail-closed là thật.** Hai dòng `401` ở trên là §8.1 điều 2 được đo chứ không được
hứa. Không có `default_pipelines` để rơi vào, nên một tải trọng không mang đúng credential
**không đi đâu cả** — nó bị từ chối ở cửa.

**2. Quyết định có kiểu SỐNG SÓT qua OTel vào kho.** Đây là câu hỏi mở lớn nhất của Debug View
bền, vì `TelemetryRecord` và span OTel là hai hình dạng khác nhau. Đọc lại bằng user readonly:

```
SpanName:          order.persist
rel:               7a6cc63904d18be49c653ee1315e65046607bda5
src:               manifest
Events.Name:       ['order.auto_confirm']
Events.Attributes: [{'outcome':'denied','reason':'QUANTITY_ABOVE_THRESHOLD'}]
```

Điểm quyết định, kết quả, **mã lý do**, và **danh tính bản phát hành kèm nguồn** — tất cả tới nơi
nguyên vẹn. Nên đường lùi lịch sử của Debug View là một việc **khả thi**, không phải một hy vọng.
Schema để dựng nó: `TraceId · SpanId · ParentSpanId · SpanName · ServiceName · Duration ·
ResourceAttributes · SpanAttributes · Events.{Timestamp,Name,Attributes} · StatusCode`, tra cứu
nhanh theo `TraceId` qua bảng `otel_traces_trace_id_ts`.

**Cái này KHÔNG chứng minh:** rằng collector lên được trên VM, rằng `api` và hai worker thật sự
phát span, rằng span sống qua restart/deploy, hay bất cứ điều gì về backup. Bốn runtime proof của
P2 vẫn còn nguyên.

### 8.8 **CHẠY THẬT trên stack tham chiếu** (28/08/2026, deploy run `33148283115`)

Release `270ef27ade9a67f3a586acc3682287eb1a8c0010`. **Bốn tín hiệu deploy đều `pass`**,
`classification: APPLICATION_ROLLED_OUT_HEALTHY`, `hardFailure: false`.

**Cụm quan sát lên thật:**

```
zalo-ultty-gd1-test-clickhouse-1        Up (healthy)
zalo-ultty-gd1-test-otel-collector-1    Up
```

**Span chảy thật** — đọc từ `obs_ultty_gd1_test.otel_traces` vài phút sau khi khởi động:

```
ServiceName    spans  traces
nexagnet-api     513     213
```

Tên bước cho thấy đúng cả hai lớp: `turn`, `conversation.resolve`, `agent.run`,
`parse deepseek-v4-flash` (nghiệp vụ) cùng `prisma:client:operation`, `GET`, `POST` (hạ tầng).

**§7.6 nay được chứng minh ở mức STACK, không còn ở mức tiến trình đơn lẻ:**

```
nexagnet.release         270ef27ade9a67f3a586acc3682287eb1a8c0010
nexagnet.release_source  manifest
```

Đúng SHA của bản phát hành, và **đọc từ manifest** — không phải từ biến môi trường. Trước bản sửa,
trường này sẽ mang giá trị của `RELEASE_GIT_SHA` (hoặc chuỗi rỗng), tức có thể lệch khỏi danh tính
canonical mà Debug View dùng.

#### Điều lần chạy này phát hiện ra: `nexagnet.tenant = unknown`

**Mọi span** của lần deploy đầu tiên mang `tenant = unknown`. Cùng một lớp lỗi với §7.6, và cùng
một nguyên nhân: `otel-config.ts` đọc thẳng `env.TENANT`, trong khi `compose.yaml` chỉ đặt
`TENANT_DIR=/srv/tenant` — **chưa bao giờ đặt `TENANT`** (trong image không có thư mục `tenants/`
để tra slug).

Đây đúng cái bẫy mà chú thích của `release-identity.ts` đã cảnh báo, và là lý do phép đọc gói khách
được chuyển **vào trong** hàm đó từ 25/08. Bản sửa release SHA đóng một nửa; nửa còn lại lộ ra ngay
lần chạy thật đầu tiên.

**Vì sao nó đắt hơn một nhãn sai:** một span không nói được nó thuộc khách nào làm cả câu chuyện
"kho quan sát cách ly theo tenant" mất nghĩa — dữ liệu nằm đúng kho, nhưng **chính nó không khai
được chủ**. Mọi truy vấn cắt theo khách, mọi báo cáo, mọi lần đối chiếu chéo đều mất neo.

**Đã sửa:** `resolveTenant()` trong `release-sha.ts` — `manifest → env → unknown`. `release.json`
đã mount và đã có trường `tenant`, nên lời giải không cần thêm nguồn nào.

**Một sai khác có chủ ý phải nói rõ:** hàm canonical **đảo ngược** thứ tự cho `tenant` — gói khách
trước, vì gói khách quyết định app đang phục vụ ai *lúc chạy*, còn manifest chỉ ghi lại ý định của
lần deploy. Preload **không đọc được** gói khách (`@netviet/tenant` chính là đồ thị nghiệp vụ mà
preload phải vào trước). Nên preload dùng `manifest → env`, và hai nguồn lệch nhau là một sự cố cấu
hình mà **đường canonical** sẽ báo — không phải việc của đoạn code chạy sớm nhất trong tiến trình.

### 8.9 Điều kiện dừng

Nếu ClickStack **không** chứng minh được cách ly cứng theo mô hình này thì **DỪNG và báo** — tuyệt
đối không tự hạ xuống một kho dùng chung. Tính tới 27/08/2026, ba bằng chứng ở §8.3 cho thấy
**chứng minh được**, nên P2 đi tiếp.


## 9. Liên quan

- [tech-radar.md](tech-radar.md) — phân loại ADOPT/TRIAL/ASSESS/HOLD/AVOID kèm bằng chứng
- [agentic-ops.md](agentic-ops.md) — bốn mức tự động hoá vận hành
- [nen-tang-da-khach.md](nen-tang-da-khach.md) — kiến trúc core/tenant, silo, bất biến bảo mật
- [../phat-trien/ke-hoach/platform-roadmap-v2.md](../phat-trien/ke-hoach/platform-roadmap-v2.md) — lộ trình P0→P15
- [../phat-trien/van-hanh/danh-tinh-release.md](../phat-trien/van-hanh/danh-tinh-release.md) — runbook danh tính release
- [../phat-trien/van-hanh/tin-hieu-deploy.md](../phat-trien/van-hanh/tin-hieu-deploy.md) — runbook bốn tín hiệu deploy
