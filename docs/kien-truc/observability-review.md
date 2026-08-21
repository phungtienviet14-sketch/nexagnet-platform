# Observability — Audit hiện trạng & quyết định công nghệ

> **Phạm vi:** nền tảng Nexagnet (đa khách hàng), không phải riêng Ultty. Ultty GD1-test là tenant
> đầu tiên dùng để kiểm chứng bằng luồng thật.
>
> **Ngày audit:** 21/08/2026 · **HEAD:** `c37ee04` · **Nhánh:** `feat/hoi-thoai-chot-don-main`
>
> Mọi con số trong tài liệu này đo được từ source thật và VM thật, không lấy từ giả định.

---

## 0. Kết luận một dòng

Hệ thống **không thiếu log** — nó thiếu **một sợi chỉ xuyên suốt** để nối các log rời rạc lại, và
thiếu hoàn toàn **quan sát lớp AI**. Vấn đề không phải "thêm backend observability", mà là
**mỗi bước nghiệp vụ đang tự kể chuyện bằng chuỗi tiếng Việt không dấu, không ai ghép lại được**.

---

## 1. Phương pháp

| Nguồn | Cách kiểm |
|---|---|
| Source | đọc trực tiếp `apps/api/src/**`, `packages/**` |
| Dependency | `apps/api/package.json`, `npm view` cho từng ứng viên |
| Deploy | `deploy/netviet/compose.yaml`, `deploy-ci.sh`, `deploy-remote.sh` |
| VM | `gcloud compute instances describe` + `ssh` → `free -m`, `df -h`, `docker stats` |
| Tenant | `packages/tenant/src/tenant.schema.ts`, `tenant.config.ts` |

---

## 2. A — Logging

| Câu hỏi | Thực tế đo được |
|---|---|
| `console.log`? | **0** lần trong code sản phẩm (`apps/api/src`, trừ `*.spec.ts`) |
| Nest `Logger`? | **CÓ** — 42 file dùng `new Logger('<Tên>')` |
| Pino / Winston? | **KHÔNG** có trong dependency |
| JSON có cấu trúc? | **KHÔNG** — Nest Logger mặc định in text có màu ra stdout |
| Log level? | **KHÔNG** cấu hình được qua env; không có biến `LOG_LEVEL` cho API (`LOG_LEVEL` trong compose là của **Flowise**, không phải của ta) |
| Redaction? | **CÓ nhưng cục bộ** — `apps/api/src/audit/audit-redaction.ts` chỉ dùng cho `AuditLog`, không áp cho log |
| Request ID? | **Một phần** — xem §3 |
| Correlation ID? | **KHÔNG** |

**Hình dạng log hiện tại** (trích nguyên văn từ source):

```ts
// agent-orchestrator.service.ts:701
this.logger.log(`[Agent:router] intent=${intent} sender=${resolved.senderType} → ${INTENT_TO_ROLE[intent]}`);

// pipeline.service.ts:343
this.logger.log(`[AUTO_SEND] Tu xac nhan ${view.id} theo policy tenant`);

// pipeline.service.ts:121
this.logger.warn(`Nhom chua map nguon su that: ${message.externalChatId} — tin DA LUU, chua dua sang parser...`);
```

**Chẩn đoán.** Kỷ luật log **tốt hơn mức trung bình** (không có `console.log` nào, đã có prefix
`[Agent:*]`/`[AUTO_SEND]`, đã ghi lý do bằng tiếng người). Nhưng mọi thứ là **chuỗi**:
`intent=`, `risk=`, `escalate=` nằm trong template string, không phải field. Hệ quả cụ thể:
không lọc được `tất cả đơn bị handoff vì lý do X trong 3 ngày qua` mà không viết regex.

> **Kết luận A:** giữ Nest `Logger` làm API (42 file không phải viết lại), **thay lớp in ra**
> bằng JSON có cấu trúc + tự động đính kèm trace context. REUSE, không REPLACE.

---

## 3. B — Định danh request/message

| ID | Có? | Chạy xuyên luồng? |
|---|---|---|
| `X-Request-ID` | **Có đọc**, không bao giờ **sinh** | ❌ chỉ trong controller quản trị |
| `externalMessageId` (Zalo) | ✅ có, `@@unique([platform, externalMessageId])` | ❌ dừng ở bảng `Message` |
| `chatId` (nhóm) | ✅ | ⚠️ có mặt khắp nơi nhưng không phải ID của *một lượt xử lý* |
| `senderExternalId` | ✅ | ⚠️ như trên |
| `ConversationThread.id` | ✅ khoá `(chatId, senderExternalId)` | ❌ không xuống tới log |
| `Order.id` (`randomUUID`) | ✅ | ⚠️ **gần nhất với một trace ID**, nhưng chỉ sinh ra ở *giữa* luồng |
| `AuditLog.requestId` | ✅ cột có thật | ❌ chỉ ghi cho CRUD nguồn sự thật |

**Chi tiết `x-request-id`.** Được đọc ở `zalo.controller.ts`, `content.controller.ts`,
`settings/*`, rồi đưa vào `AuditLog.requestId`. Đặc điểm: **client cung cấp, hệ thống không tự
sinh** — vắng header thì `requestId = null`. Nó **không** đi vào pipeline xử lý tin.

**Điểm mù lớn nhất.** Đường tin Zalo — `ZcaListener`/`BotPoller` → `PipelineService.intake()` —
**không đi qua HTTP**, nên không có chỗ nào để header gắn vào. Đây chính là luồng nghiệp vụ chính
của GĐ1, và nó là luồng **không có ID nào cả** cho tới khi `AgentOrchestrator.run()` sinh `orderId`.

> **Kết luận B:** không có ID nào chạy xuyên toàn luồng. `Order.id` là ứng viên gần nhất nhưng
> sinh quá muộn và không tồn tại cho tin bị bỏ (`ignored`/`stored_only`/`duplicate`) —
> **đúng những ca cần debug nhất**.

---

## 4. C — Backend

**Cơ chế cắt ngang hiện có:**

| Loại | Có? |
|---|---|
| Middleware | ❌ không có |
| Interceptor (`NestInterceptor`) | ❌ không có |
| Exception filter (`APP_FILTER`) | ❌ không có |
| `AsyncLocalStorage` | ❌ không có |
| Guard | ✅ 4 cái — `ApiKeyGuard`, `CsrfGuard`, `RolesGuard`, `SessionAuthGuard` (chỉ xác thực) |

**Đường đi thật của một tin Zalo** (đọc từ `pipeline.service.ts`):

```
ZcaListener / BotPoller
  └─ PipelineService.intake(message, botName)
       ├─ findParticipant()          → participants.findBySender() [DB]
       │    └─ requiresIdentityReview() → fail-closed manual_review
       ├─ saveMessage()              → messages.save() [DB]  ⟵ cổng idempotency
       │    └─ scheduleMediaFetch()  → không await (chủ ý)
       ├─ observeGroup()             → groupDiscovery.observe() [DB]
       ├─ recordSender()             → participants.recordSeen() [DB]
       ├─ isGroupMapped()            → fail-closed: chưa map thì KHÔNG qua LLM
       └─ enqueueOrRun()
            ├─ [gom tin theo burst window]
            └─ enqueuePerSender()    → hàng đợi theo (kênh, nhóm, người gửi)
                 └─ runPipelineTurn()
                      ├─ conversationContext.build()   [DB]
                      ├─ conversations.pendingDraft()  [DB]
                      ├─ conversations.isAnsweringQuestion() [DB]
                      ├─ conversations.recentlyClosed()     [DB]
                      ├─ detectAmend()                 [thuần hàm]
                      ├─ orchestrator.run()            ⟵ TOÀN BỘ phần AI + rules
                      ├─ linkOrder()                   [DB]
                      ├─ shouldAutoSend()      → orders.sendConfirmation()  [Zalo]
                      ├─ shouldAutoReplyAdvice()→ orders.sendProductAdvice() [Zalo]
                      └─ settleThread()        → conversations.settle()     [DB]
```

Bên trong `AgentOrchestrator.run()` (766 dòng):

```
run()
 ├─ knowledge.resolveByChatId()
 ├─ ruleConfigs.getActive()          [DB]
 ├─ emit order.created               [SSE]
 ├─ parser.parse()                   ⟵ LLM #1 (Router) — độ trễ THẬT ở đây
 ├─ validateContextualParse()
 ├─ mergeConversationTurn()
 ├─ dispatch()                       → priceOrder() [rules engine, tất định]
 ├─ composeReply() → advisor.reply() ⟵ LLM #2 + vòng lặp tool
 ├─ assessRisk()                     [rules, 0 LLM]
 ├─ buildTrace()
 └─ orders.create()                  [DB]
```

> **Kết luận C:** **~13 bước nghiệp vụ có thật ở tầng pipeline + ~9 ở tầng orchestrator.**
> Con số này quan trọng: nó khớp đúng khung "5–15 bước" mà mục tiêu đặt ra, nghĩa là
> **ranh giới nghiệp vụ đã tồn tại sẵn trong code** — không cần tái cấu trúc để trace được,
> chỉ cần đặt tên.

---

## 5. D — AI

| Hạng mục | Thực tế |
|---|---|
| Provider | **3 đường**: `claude` (`@anthropic-ai/sdk`), `deepseek` (fetch thẳng REST), `flowise` (HTTP tới container Flowise) |
| Chọn bằng | `PARSER_MODE` (parse) và `ADVICE_COMPOSER` (soạn trả lời) — **hai công tắc độc lập** |
| Đang chạy trên GD1-test | `PARSER_MODE=flowise`, `ADVICE_COMPOSER` phải bật riêng; DeepSeek vì khoá Anthropic hết credit |
| Prompt logging | ❌ **không có** |
| Tool calls | ⚠️ có chạy (`advisor-tools.ts`, `order-tools.ts`, `MAX_TOOL_ROUNDS`) nhưng **không ghi lại tool nào được gọi, tham số gì, trả về gì** |
| Tool results | ❌ không ghi |
| Model metadata | ⚠️ có `brainMode` trong `AgentTrace`, không có tên model thật/version |
| Latency | ❌ **không đo** ở bất kỳ đâu |
| Token usage | ❌ **không ghi** — dù cả Anthropic lẫn DeepSeek đều trả `usage` trong response |
| Session/conversation ID | ✅ `ConversationThread` có, nhưng không nối với lần gọi LLM |

**Cái đã có — và nó tốt hơn mong đợi.** `AgentTrace` (`packages/shared/src/agents.ts`) là **một
dạng business trace đã tồn tại**, được lưu bền vững vào `Order.trace` (cột `Json`):

```ts
interface AgentTrace {
  steps: AgentStep[];        // 6 vai, mỗi vai: action, notes[], source, usedLlm, handoff?
  primaryRole: AgentRole;
  senderType: SenderType;
  llmCalls: number;          // minh bạch chi phí
  brainMode: string;
  supervisor: { riskLevel, escalate, reasons[] };
  reply?: string;
  outbound?: OutboundContent;
  composed?: boolean;        // câu trả lời do agent soạn hay bản mẫu tất định
}
```

**Đây là tài sản, không phải nợ.** Nó đã trả lời được "vai nào xử lý", "có dùng LLM không",
"giám sát thấy rủi ro gì". Cái nó **không** trả lời được: prompt nào, model nào, mất bao lâu,
tốn bao nhiêu token, tool nào được gọi, và **nó chỉ tồn tại khi đã có `Order`**.

> **Kết luận D:** đây là **lỗ hổng lớn nhất**. Toàn bộ tầng AI — chỗ tốn tiền nhất, chậm nhất và
> khó đoán nhất — hiện **không quan sát được**.

---

## 6. E — Database

| Hạng mục | Thực tế |
|---|---|
| Prisma | **6.19.3** (pin có chủ ý; **cấm** nâng v7 vì `@adminjs/prisma` chưa hỗ trợ) |
| Prisma logging | ❌ không bật (`PrismaService` chỉ extend `PrismaClient`, không truyền `log:`) |
| Prisma tracing | ❌ không có |
| `$connect` eager | ❌ **cố ý không** — để `PERSISTENCE=memory` không chạm DB lúc boot |
| Transaction | có dùng `$transaction` rải rác; không có ranh giới nào được đặt tên |
| Bật/tắt bằng | `PERSISTENCE=prisma \| memory` |

**Tin tốt:** `@prisma/instrumentation@6.19.3` **tồn tại trên npm** — khớp chính xác phiên bản đang
pin, nên **không phải nâng Prisma v7** để có tracing DB. Không cần hack internal.

---

## 7. F — Runtime / deployment

**VM `netviet`** — `gcloud compute instances describe`, đo ngày 21/08/2026:

| Chỉ số | Giá trị |
|---|---|
| Machine type | `e2-standard-2` (**2 vCPU · 8 GB RAM**) |
| Zone | `asia-southeast1-b` |
| RAM | 7 936 MB tổng · 4 172 MB dùng · **3 763 MB khả dụng** |
| Swap | **0** |
| Disk | 77 GB · 59 GB dùng · **18 GB trống (77 %)** |
| Stack đang chạy | **4** — `zalo-ultty`, `zalo-ultty-gd1-test`, `zalo-wata`, `zalo-amico` + `netviet-edge` |
| Container | **17** |

Mức tiêu thụ mỗi stack (`docker stats`, không tải):

| Service | RAM |
|---|---|
| `flowise` | ~550 MB ⟵ **nặng nhất** |
| `api` | ~90–115 MB |
| `web` | ~85–97 MB |
| `postgres` | ~60–66 MB |
| **Tổng / stack** | **~800 MB** |

**Phát hiện phụ (không thuộc phạm vi task, đã tách thành việc riêng):** ổ đĩa bị ăn bởi **10 bản
image Flowise, mỗi bản 9,29 GB**. Đó mới là nguyên nhân 77 % disk, không phải dữ liệu khách.

**Monitoring có sẵn:** **KHÔNG CÓ GÌ.** Không Prometheus, không Grafana, không Sentry, không
cAdvisor, không log shipper. `grep -ri "opentelemetry|langfuse|sentry|signoz"` trên toàn repo →
**0 kết quả trong code sản phẩm**.

**Có thể tái dùng từ GCP:** VM ghi log Docker ra `json-file` driver; project có Cloud Logging
nhưng **agent chưa được cấu hình đẩy log container lên**.

**Ràng buộc mạng — quan trọng.** `compose.yaml` cố ý cô lập từng khách:

```yaml
networks:
  # KHONG khach nao dung chung mang voi khach nao.
  backend:
  data:
    internal: true
```

Kèm chú thích ghi lại **sự cố thật 17/08/2026**: dùng chung mạng `netviet-edge` khiến Docker đăng
ký trùng alias DNS, `api` của khách này nối nhầm sang `flowise` của khách kia.

---

## 8. G — Đa khách hàng

| Chiều | Gắn được chưa? |
|---|---|
| `tenant` | ⚠️ **biết lúc chạy** qua `tenantIdentity()/tenantConfig()` từ `@netviet/tenant`, nhưng **chưa bao giờ được đưa vào log** |
| `environment` | ⚠️ `DEPLOYMENT_ENVIRONMENT` có ở tầng deploy, **không tới container** |
| `release` | ❌ **không tới được app** — xem dưới |
| `user/thread` | ⚠️ có trong DB, không có trong log |

**Release correlation — điểm đứt gãy cụ thể.** Hạ tầng **đã có** metadata release đầy đủ:

`deploy-ci.sh` → `deploy-remote.sh:write_release_json()` → ghi `/srv/netviet/apps/<stack>/.runtime/release.json`:

```
tenant · environment · target · gitSha · appDigest · flowiseDigest
· tenantSchemaVersion · workflowRunId · deployedAt
```

`verify-deployment.mjs` đã validate đủ 9 field này. **Nhưng:**

1. `.runtime/release.json` **không được mount** vào container `api`
   (chỉ mount `./.runtime/zalo`, `./tenant-pack`, `./catalog-assets`);
2. khối `environment:` của service `api` trong `compose.yaml` **liệt kê tường minh** — không có
   biến release nào.

⚠️ **Cái bẫy đã cắn một lần.** Chính `compose.yaml` ghi lại: một biến có trong `secrets.env` mà
không có trong khối `environment:` thì **không bao giờ tới container** — đúng lỗi đã làm
`ADVICE_COMPOSER` rỗng suốt 19/08→21/08. Bất kỳ biến observability nào cũng phải qua **cả hai** nơi.

> **Kết luận G:** app **không tự biết mình là bản build nào**. Câu "bug này xảy ra trên commit nào"
> hiện phải trả lời bằng cách SSH lên VM đọc `release.json` rồi đối chiếu thủ công theo thời gian.

---

## 9. Bảng tổng hợp khoảng trống

| # | Khoảng trống | Mức | Bằng chứng |
|---|---|---|---|
| G1 | Không có ID xuyên luồng cho đường tin Zalo | **P0** | §3 |
| G2 | Tầng AI hoàn toàn không quan sát được (prompt/model/token/latency/tool) | **P0** | §5 |
| G3 | Quyết định nghiệp vụ không có `reason` có kiểu | **P0** | §2, §10 |
| G4 | Log là chuỗi, không lọc/tổng hợp được | **P1** | §2 |
| G5 | App không biết release/git SHA của chính nó | **P1** | §8 |
| G6 | Chuyển trạng thái không ghi lại được | **P1** | §11 |
| G7 | Không có cơ chế cắt ngang (ALS/interceptor) để mang context | **P1** | §4 |
| G8 | DB không quan sát được | **P2** | §6 |
| G9 | Không có nơi tập trung để tìm log | **P2** | §7 |

---

## 10. Cổng quyết định nghiệp vụ **có thật** trong source

Đây là danh sách đọc từ code, không phải danh sách gợi ý trong đề bài:

| Quyết định | Nơi | Kết quả | Lý do hiện có? |
|---|---|---|---|
| `participant.handlingMode === 'ignore'` | `pipeline.service.ts:102` | bỏ tin | ⚠️ chỉ trong chuỗi log |
| trùng tin (idempotency) | `pipeline.service.ts:113` | `duplicate` | ⚠️ chuỗi |
| nhóm chưa map nguồn sự thật | `pipeline.service.ts:120` | `stored_only` | ⚠️ chuỗi |
| UID chưa reconcile → fail-closed | `pipeline.service.ts:416` | `manual_review` | ⚠️ chuỗi |
| `shouldAutoConfirmOrder()` | `order-auto-confirmation.ts` | gửi / không | ❌ **không có lý do** |
| `shouldAutoReplyAdvice()` | `pipeline.service.ts:548` | trả lời / im | ❌ **không có lý do** — 5 điều kiện, không biết cái nào chặn |
| `assessRisk()` → escalate | `risk-rules.ts` | `needs_edit` | ✅ có `reasons[]` (**mẫu tốt nhất đang có**) |
| `turn.gaps.complete` | `agent-orchestrator:398` | `needs_edit` | ⚠️ có `askable`/`blocking` |
| cửa sổ sửa đơn | `orders/amend-window.ts` | cho sửa / không | cần đọc thêm |
| uỷ quyền công cụ ghi | `agent-orchestrator:163` | cấp / không cấp quyền ghi | ❌ điều kiện ngầm |

**`assessRisk()` là hình mẫu** — nó đã trả `{ riskLevel, escalate, reasons[] }`. Lớp business
observability nên **tổng quát hoá đúng hình dạng này**, không phát minh hình dạng mới.

---

## 11. Máy trạng thái **có thật**

| Thực thể | Trạng thái | Nguồn |
|---|---|---|
| `Order.status` | `pending_review` · `needs_edit` · `sent` · … | enum `OrderStatus`, Prisma |
| `ConversationThread.status` | `collecting` · `awaiting_answer` · `closed` · `handed_off` | `schema.prisma:602` |
| `IntakeOutcome` | `processed` · `stored_only` · `duplicate` · `ignored` | `pipeline.service.ts:29` |
| `CampaignStatus` / `CampaignDeliveryStatus` | — | Prisma |
| `ContentStatus` | — | Prisma |

`IntakeOutcome` đáng chú ý: comment trong source ghi rõ nó được tách ra **chính vì** trước
04/08/2026 `null` gộp cả "bỏ qua có chủ ý" lẫn "thất bại", khiến listener cho chạy lại tin.
Đó là **đúng loại bug mà observability phải bắt được**.

---

## 12. So sánh công nghệ

### Bằng chứng thu thập được

| Ứng viên | Số service | Yêu cầu tài nguyên (nguồn chính thức) |
|---|---|---|
| **Langfuse v3** self-host | **6** — web, worker, ClickHouse, Redis, MinIO, Postgres | tối thiểu **4 vCPU + 8 GB** *dành riêng*; khuyến nghị cộng dồn ~12 vCPU / 25 GiB. ClickHouse tăng 1–2 GB/triệu trace, khuyến nghị disk 100 GB |
| **Grafana Tempo** | **2+** — Tempo **+ Redpanda/Kafka** | ⚠️ *"Tempo requires a Kafka-compatible system for its write path, **even when running as a single binary**"* — ví dụ chính thức có tới 8 container |
| **Grafana Loki** | 1 (monolithic) | ~1 core / ~300 MB cho tải nhẹ; monolithic hợp tới ~20 GB log/ngày |
| **Grafana** | 1 | ~150 MB |
| **SigNoz** | **~5** — ClickHouse, Keeper/Zookeeper, query-service, frontend, collector | nền ClickHouse, ~3–4 GB |
| **OTel Collector** | 1 | ~100 MB |
| **OTel API + SDK** (trong tiến trình) | **0** | ~0 — no-op khi không đăng ký exporter |

> ⚠️ **Đề bài giả định sai một điểm, và điểm đó đủ để lật lựa chọn.** Tempo được liệt kê như một
> ứng viên "lưu trace" nhẹ. Thực tế tháng 8/2026: **Tempo kéo theo một message broker
> (Redpanda/Kafka)** ngay cả ở chế độ single-binary. OPTION A trong đề bài vì thế không phải
> "5 service" mà là **~12 container** (Tempo + Redpanda + Loki + Grafana + Collector + 6 của Langfuse).

### Ràng buộc quyết định — **không phải RAM**

Người dùng đã xác nhận **có thể nâng VM, không lo chi phí**. Nên RAM bị loại khỏi danh sách lý do.
Ba ràng buộc còn lại vẫn đứng, và chúng mạnh hơn:

**(1) Cách ly dữ liệu khách — ràng buộc kiến trúc, không phải ràng buộc tiền.**
Nền tảng đang ở **mô hình silo**: mỗi khách có Postgres riêng, mạng riêng, volume riêng.
`compose.yaml` ghi rõ *"KHONG khach nao dung chung mang voi khach nao"*, kèm sự cố thật 17/08/2026.
Trace chứa **tin nhắn khách, SĐT, địa chỉ, nội dung đơn**. Dựng **một** Tempo/Loki/ClickHouse dùng
chung nghĩa là **gom PII của 5 khách vào một kho** — đúng thứ kiến trúc silo được dựng ra để tránh.
Cách ly bằng `tenantId` trong label là **cách ly bằng lời hứa**, không phải bằng kiến trúc.

**(2) Khối lượng thật: 10–20 đơn/ngày.**
Cả ClickHouse lẫn Tempo được thiết kế cho hàng triệu span/phút. Ở đây tổng trace một ngày của một
khách nằm trong khoảng **vài MB**. Postgres của chính khách đó nuốt gọn mà không cần thêm gì.

**(3) Gánh vận hành trên hệ thống không có IT nội bộ.**
CLAUDE.md: *"Khách chưa có IT nội bộ: giải pháp phải vận hành được bởi người non-technical"*.
Mỗi service thêm vào là một thứ nữa có thể chết lúc 2 giờ sáng.

### Chấm điểm

| Tiêu chí | A: OTel+Collector+Tempo+Loki+Grafana+Langfuse | B: OTel+Collector+SigNoz+Langfuse | **C: OTel(in-proc) + tự sở hữu semantics + Postgres của tenant** |
|---|---|---|---|
| Giải đúng vấn đề | ✅ | ✅ | ✅ |
| TypeScript/NestJS | ✅ | ✅ | ✅ |
| Prisma | ✅ | ✅ | ✅ (`@prisma/instrumentation@6.19.3`) |
| AI tracing | ✅✅ (Langfuse chuyên sâu) | ✅✅ | ✅ (GenAI semconv, cùng cây trace) |
| trace ↔ logs | ✅ | ✅ | ✅ (cùng `traceId` trong JSON log) |
| **Cách ly đa khách** | ❌ **gom PII chung** | ❌ **gom PII chung** | ✅✅ **silo sẵn có** |
| Self-host | ✅ | ✅ | ✅ |
| Số container thêm | **~12** | **~11** | **0** |
| Gánh vận hành | ❌ cao | ❌ cao | ✅ ~0 |
| Bảo mật/riêng tư | ⚠️ | ⚠️ | ✅ |
| License | Apache/MIT ✅ | Apache/MIT ✅ | Apache-2.0 ✅ |
| Vendor lock-in | thấp | trung bình | **không** (OTLP sẵn sàng) |
| Tương lai n8n/Dify | ✅ W3C | ✅ W3C | ✅ W3C |
| Trải nghiệm debug | ✅✅ | ✅✅ | ✅ (console sẵn có + deep link) |

---

## 13. Quyết định

**Chọn OPTION C**, có đường nâng cấp sang A/B mà **không phải sửa code nghiệp vụ**.

Nguyên tắc: **chuẩn hoá bằng OpenTelemetry, nhưng chưa mua backend.**

| Lớp | Hiện tại | Ứng viên | **Quyết định** | Vì sao |
|---|---|---|---|---|
| Chuẩn tracing | không có | OpenTelemetry | **ADOPT *quy ước*, KHÔNG lấy *runtime*** | Xem ghi chú ngay dưới — đây là điểm dễ nói quá, nên nói cho chính xác |

> **Chính xác thì "ADOPT OpenTelemetry" nghĩa là gì ở đây.**
> Đã cài thử `@opentelemetry/api` + `sdk-trace-node` + `resources` + `semantic-conventions`,
> rồi **gỡ cả bốn**. Cái được giữ lại là **định dạng và quy ước**, không phải thư viện:
>
> - ID theo **W3C Trace Context** (trace 16 byte, span 8 byte, header `traceparent`) —
>   thứ n8n/Dify/Langfuse/Tempo/SigNoz đều đọc được;
> - thuộc tính AI theo **GenAI semantic conventions** (`gen_ai.system`, `gen_ai.request.model`,
>   `gen_ai.usage.*`).
>
> **Vì sao gỡ SDK:** việc duy nhất nó làm ở giai đoạn này là sinh ID và giữ context — cả hai đã
> có trong ~200 dòng `trace-context.ts`, đơn giản hơn và test được. Lợi ích thật của SDK là để
> `@prisma/instrumentation` và HTTP auto-instrumentation **tự nối vào trace** — mà cả hai đều đã
> **DEFER** (auto-instrumentation còn bị mục 10 cấm vì làm nổ số span). Giữ lại bốn gói không
> dùng là **dependency bloat**, đúng thứ `search-first` gọi tên.
>
> **Đường quay lại:** thêm một `TelemetrySink` đẩy OTLP. ID đã đúng khuôn nên ánh xạ 1:1;
> code nghiệp vụ không đổi một dòng.
>
> **Kết quả ròng: 0 dependency runtime mới, 0 container mới.**
| Ngữ nghĩa nghiệp vụ | `AgentTrace` (một phần) | tự xây | **BUILD (mở rộng)** | Không mua được. Framework biết "hàm này 25 ms"; chỉ ta biết `handoff=true vì KNOWLEDGE_NOT_FOUND` |
| Lưu trace | `Order.trace` (Json) | Tempo / SigNoz | **KEEP + mở rộng** | Postgres **của chính tenant** = cách ly bằng kiến trúc; 10–20 đơn/ngày không cần ClickHouse |
| Logger | Nest `Logger` | Pino | **KEEP API, thay transport** | 42 file không phải sửa; chỉ đổi cách in ra |
| Định dạng log | text | JSON | **ADOPT** | máy tìm được |
| Kho log | `docker logs` | Loki | **DEFER** | 4 stack × log nhẹ; `docker logs` + `jq` đủ cho tới khi có nhiều host |
| Dashboard | console Next.js sẵn có | Grafana | **KEEP** | Mục 25: *không xây trace viewer nếu Grafana đã làm tốt* — nhưng ở đây **console đã có sẵn** và đã hiểu nghiệp vụ |
| Quan sát AI | không có | Langfuse | **REJECT (xét lại sau)** | 6 service + 4 vCPU/8 GB riêng, cho 10–20 đơn/ngày. Thay bằng span GenAI semconv **trong cùng cây trace** — vốn nối AI↔backend **tốt hơn** một hệ tách rời |
| Collector | không có | OTel Collector | **DEFER** | Chỉ cần khi đã có backend để gửi tới |
| Theo dõi lỗi | không có | Sentry | **DEFER** | Lỗi đã nằm trong span + JSON log có `traceId`; thêm SaaS là thêm một nơi PII chảy tới |
| DB tracing | không có | `@prisma/instrumentation` | **ADOPT (sau, có cờ)** | Bản `6.19.3` khớp pin; bật sau khi lõi đã chạy |
| Release correlation | `release.json` trên VM | — | **REUSE** | Mục 23: *không phát minh hệ metadata release thứ hai* |

### Khi nào lật sang OPTION B (SigNoz)

Không phải "khi có tiền", mà khi **một trong ba** điều sau thành thật:

1. **Nhiều host** — hết một VM, trace phải đi xuyên máy;
2. **>20 khách** — mở 20 console để tìm một lỗi là không chấp nhận được;
3. **Cần eval/quản lý prompt** — lúc đó Langfuse mới trả đúng giá trị của nó.

Khi đó: bật `OTEL_EXPORTER_OTLP_ENDPOINT`, dựng SigNoz **trên VM RIÊNG** (không phải VM của khách,
để giữ cách ly), và **không sửa một dòng code nghiệp vụ nào** — vì span đã theo chuẩn từ đầu.

> **Khuyến nghị nếu vẫn muốn dựng backend ngay:** chọn **SigNoz trên VM riêng**, không chọn
> Grafana stack — vì Tempo kéo theo Redpanda, thành 5 thứ phải nuôi thay vì 1 nền ClickHouse.

---

## 14. Ba "debug story" dùng để thiết kế

Lấy từ luồng **có thật** trong source, không phải giả định.

### CASE A — hỏi/tư vấn
Khách: *"BB lọc được bao nhiêu m2?"* → intent `hoi_san_pham` → `product_advisor`.
**Câu hỏi debug thật:** *bot im lặng, vì sao?*
Cần nhìn: `intake` → `isGroupMapped` → `conversationContext` → `parser.parse` (LLM #1) →
`dispatch` → `composeReply` (LLM #2 + tool) → `shouldAutoReplyAdvice` (**5 điều kiện**) → gửi/không.
→ Hiện tại **không biết điều kiện nào trong 5 cái đã chặn**.

### CASE B — sửa đơn
*"20 Felix"* → *"cho anh lấy 5 cái"*.
Cần nhìn: `recentlyClosed` → `detectAmend` → `amendRequest` → `composeReply` → tool `sua_don` →
`amend-window` (cho sửa?) → don cũ→mới → `orders.create` → outbound.
→ Hiện tại: `composeReply` đặt `priced: null` để tránh tạo **đơn thứ hai** — logic tinh tế,
**không có dấu vết nào** khi nó chạy sai.

### CASE C — AI trả lời đúng nhưng không gửi
Cần nhìn: `trace.composed = true` → `supervisor.riskLevel` → `turn.gaps.complete` →
`status` → `AUTO_SEND` kill switch → `manualReview` → **lý do bỏ gửi**.
→ Đây chính là ca `ADVICE_COMPOSER` rỗng 19/08→21/08: **hai ngày** mới tìm ra, vì không có dấu
vết nào nói "chưa từng gọi LLM".

---

## 15. Ba lớp và chủ sở hữu

| Lớp | Nội dung | Chủ sở hữu | Trạng thái |
|---|---|---|---|
| **1 — Kỹ thuật** | HTTP, ranh giới service, gọi ngoài, DB, latency, error | OpenTelemetry (chuẩn) + JSON log | ADOPT |
| **2 — Nghiệp vụ** | intent, handoff, auto-send, sửa đơn được?, chuyển trạng thái, uỷ quyền tool | **Nexagnet tự sở hữu** | BUILD |
| **3 — AI** | model, prompt, context, tool call/result, token, latency | OTel GenAI semconv, **cùng cây trace** | BUILD trên chuẩn |

---

## 16. Chiến lược cách ly theo quy mô

| Quy mô | Mô hình | Lý do |
|---|---|---|
| **~5 khách (nay)** | **A — mỗi tenant một silo**: trace nằm trong Postgres của chính tenant | Đã có sẵn; cách ly bằng kiến trúc |
| **~20 khách** | **B — một backend dùng chung, tách theo project/tenant**, đặt trên **host riêng** | 20 console là quá nhiều; nhưng phải là host riêng, không phải VM khách |
| **Enterprise** | **C — backend riêng cho khách đó** | Yêu cầu hợp đồng; kiến trúc đã sẵn sàng vì span có `tenant` từ đầu |

**Chính sách riêng tư theo tenant** (tên thật sẽ thiết kế ở bước implement, không bê nguyên enum
trong đề bài): mọi tenant **đều được quan sát** — observability **không phải** một capability
bật/tắt. Chỉ **mức chi tiết nội dung** khác nhau, và nó gắn với `DATA_CLASSIFICATION` đã có
(`test` | `customer`) chứ không phát minh trục cấu hình mới.

---

## 17. Việc phát sinh ngoài phạm vi (đã tách riêng)

- **Disk VM 77 %** do 10 bản image Flowise 9,29 GB. Không thuộc task này; cần `docker image prune`
  có kiểm soát.
- **Nâng VM** (`e2-standard-2` → lớn hơn): đổi machine-type **bắt buộc stop VM**, tức downtime cho
  **cả 4 stack** gồm khách đang chạy thật. Cần cửa sổ bảo trì + xác nhận của chủ hệ thống.
  **Với OPTION C thì không cần nâng.**

---

## 18. Ghi chú an toàn khi triển khai

Bất kỳ biến môi trường observability nào cũng phải xuất hiện ở **cả hai** nơi:

1. `render-secrets.sh` (sinh `secrets.env`), **và**
2. khối `environment:` của service `api` trong `compose.yaml` (liệt kê tường minh).

Thiếu bước 2 = biến **không bao giờ** tới container. Đây là lỗi đã xảy ra thật với
`ADVICE_COMPOSER` (19/08→21/08/2026).
