# REFERENCE PLATFORM STACK — hợp đồng của `ultty-gd1-test`

> **Vai trò tài liệu:** canonical. Đây là **định nghĩa** một stack tham chiếu là gì và stack tham
> chiếu hiện tại đang ở đâu. Trạng thái kế hoạch vẫn chỉ nằm ở
> [`phat-trien/ke-hoach/tong-quan.md`](../phat-trien/ke-hoach/tong-quan.md); tài liệu này mô tả
> **hợp đồng** và **bằng chứng runtime**, không chứa ✅/⬜ của kế hoạch.
>
> **Cập nhật:** 27/08/2026 · **Đối chiếu mã nguồn tại:** `8b0f6ad603495fc90235d350b13550afd36a982d`

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
| OTel code support | **PARTIAL** |
| OTel export trên gd1-test | **NOT DEPLOYED** |
| ClickStack | **POC / NOT DEPLOYED ON GD1** |
| Historical Debug traces | **NOT PERSISTENT** |
| `ultty-gd1-test` | **REFERENCE STACK, NOT YET PARITY-CLOSED** |

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
| OpenTelemetry | 1 | có, **khoá sau `OTEL_TRACING=on`** | **KHÔNG** | không | n/a | **PARTIAL / NOT-DEPLOYED** | preload vào compose (P2) |
| ClickStack / HyperDX | 1 hoặc 2 | chỉ trong `tools/poc-observability/` | **KHÔNG** | không | không | **POC** | chọn mô hình triển khai (§8) |
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

## 7. KNOWN RISKS — `UNRESOLVED`

> Ba mục 7.1–7.3 là **quan sát runtime thật**, không phải suy đoán. Chúng **không** được sửa trong
> đợt tài liệu này (đợt này là docs-only) và giữ trạng thái `UNRESOLVED` cho tới khi có bằng chứng
> ngược lại.

### 7.1 `zca_listener` im lặng — `UNRESOLVED`

**Bằng chứng** (truy vấn Postgres của stack, 27/08/2026):

```
inbound | zca_listener  | 98 tin | tin cuối: 2026-08-26 08:52:41
inbound | copilot_paste | 42 tin | tin cuối: 2026-08-27 03:15:49
```

Kênh Zalo thật **không nhận tin nào trong ~19 giờ**, trong khi đường demo/copilot vẫn chạy. Nhất
quán với ràng buộc đã biết: **một tài khoản Zalo chỉ chịu được MỘT listener**, và mở Zalo Web bằng
cùng tài khoản sẽ làm listener tự dừng.

**Vì sao đáng lo:** mọi bằng chứng "AI đọc được nhóm" hiện dựa vào đường `copilot_paste`. Nếu kỳ
vọng là đọc nhóm thật thì năng lực đó **đang không được chứng minh**.

**Cổng đóng:** một lần chạy có tin `zca_listener` mới sau thời điểm này, kèm health check của
listener nằm trong deploy signal. Thuộc **P2**.

### 7.2 Preflight ghi đè giá trị runtime quan sát được — `UNRESOLVED`

**Bằng chứng:** `deploy/netviet/gd1-test-preflight.mjs`

```js
if (providerSmoke.ok) runtime.autoSend = 'off';
```

`runtime.autoSend` được **đọc từ container đang chạy**, rồi bị ghi đè bằng hằng số. Hiện **chưa gây
hại** vì trường này không lọt vào `machineProof` (chỉ `plan`, `rollback`, `firstRelease` được ghi
ra), nhưng đây đúng là loại lỗi mà Release Identity Closure tồn tại để diệt: **bằng chứng bị sửa
thay vì được quan sát**.

**Cổng đóng:** hoặc xoá dòng này, hoặc biến "AUTO_SEND phải off" thành một **cổng có kiểm tra** với
mã lý do riêng. Thuộc **P2**.

### 7.3 `bot-poller.spec.ts` flaky — `UNRESOLVED`

**Bằng chứng:** `apps/api/src/ingest/bot-poller.spec.ts` → *"tiep tuc long-poll khi batch truoc con
cho burst"* đỏ **2 lần** trong `pnpm test` toàn monorepo (27/08), nhưng **22/22 xanh** khi chạy
riêng file đó, và xanh ở CI.

**Vì sao đáng lo:** một bài test đỏ ngẫu nhiên dạy người ta bỏ qua màu đỏ. Đó là chi phí thật, kể cả
khi mã nguồn đúng.

**Cổng đóng:** khử phụ thuộc thời gian trong bài test (không dùng đồng hồ thật để khẳng định thứ
tự). Thuộc **P2**.

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

## 8. Mô hình triển khai ClickStack — chưa chọn

**Không mặc định một kho dùng chung khổng lồ.** Trace có thể chứa dữ liệu cá nhân, và nguyên tắc
hiện hành của nền tảng là **silo theo tenant**.

| Mô hình | Được gì | Mất gì |
|---|---|---|
| **ClickStack theo từng tenant** | cách ly bằng **kiến trúc**, đúng nguyên tắc silo; xoá tenant là xoá kho | tốn RAM/đĩa nhân theo số tenant; vận hành N cụm |
| **ClickStack dùng chung + cách ly cứng** | một cụm, rẻ, dễ nâng cấp | cách ly thành **lời hứa cấu hình**; một lỗi phân quyền là rò dữ liệu chéo khách |
| **Collector dùng chung + kho tách riêng** | một đường thu, nhiều kho; cân bằng chi phí và cách ly | collector trở thành điểm chết chung và là nơi phải lọc PII chuẩn xác |

**Điều kiện chọn (phải trả lời trước khi cài):** trace của tenant có được coi là dữ liệu của tenant
đó không · ai được xem · xoá một tenant thì trace đi đâu · retention bao lâu · ai trả tiền cho đĩa.

Reference stack **phải chọn một mô hình rõ ràng** trước khi ClickStack rời trạng thái POC.

---

## 9. Liên quan

- [tech-radar.md](tech-radar.md) — phân loại ADOPT/TRIAL/ASSESS/HOLD/AVOID kèm bằng chứng
- [agentic-ops.md](agentic-ops.md) — bốn mức tự động hoá vận hành
- [nen-tang-da-khach.md](nen-tang-da-khach.md) — kiến trúc core/tenant, silo, bất biến bảo mật
- [../phat-trien/ke-hoach/platform-roadmap-v2.md](../phat-trien/ke-hoach/platform-roadmap-v2.md) — lộ trình P0→P15
- [../phat-trien/van-hanh/danh-tinh-release.md](../phat-trien/van-hanh/danh-tinh-release.md) — runbook danh tính release
- [../phat-trien/van-hanh/tin-hieu-deploy.md](../phat-trien/van-hanh/tin-hieu-deploy.md) — runbook bốn tín hiệu deploy
