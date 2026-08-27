# Bàn giao phiên 15 — `turn-processing`: gỡ hội thoại/AI ra khỏi quyền sở hữu của `sales-order`

> **STATUS: HISTORICAL SNAPSHOT**
> **AS OF:** 2026-08-24 (`55ab6b8`)
> **SUPERSEDED BY:** [tong-quan.md §12](tong-quan.md#12-trạng-thái-nền-tảng--documentation-truth-reset-27082026)
>
> Giữ nguyên để tra cứu lịch sử nghiên cứu và quyết định. **Không dùng làm trạng thái hiện tại.**
> Chỗ nào tài liệu này mâu thuẫn với bản canonical ở trên, bản canonical đúng.

> Ngày: **24/08/2026** · Nhánh: `refactor/neutral-turn-processing` (từ `main` = `d78db06`)
> Phiên trước: [ban-giao-phien-14.md](ban-giao-phien-14.md) — nền tảng observability, đã merge (PR #37).

---

## 0. Một câu

Một khách **không bán gì** giờ boot được, nhận tin, dựng ngữ cảnh, chạy AI, dùng tri thức và **trả
lời ra kênh** — với trace đầy đủ — mà Nest **không resolve nổi** `OrdersService`, `OrdersRepository`,
`OrderCommandAdapter`, `ErpPort` hay `CampaignService`. Ultty không đổi một dòng hành vi.

| Cổng | Kết quả |
|---|---|
| OBSERVABILITY FOUNDATION MERGED | **PASS** — `d78db06`, CI run `32723426947` xanh |
| NEUTRAL TURN PROCESSING | **PASS** |
| SALES-ORDER DECOUPLING | **PASS** |
| NEUTRAL TENANT PROOF | **PASS** |
| ULTTY REGRESSION | **PASS** |

Không deploy. Không đụng `AUTO_SEND`. Không thêm nghiệp vụ kế toán/MISA/khách thứ ba.

---

## 1. Vấn đề, nói cho đúng

Không ai từng quyết định rằng "muốn AI đọc tin nhắn thì phải bán hàng". `sales-order` đơn giản là
capability **duy nhất tồn tại** lúc pipeline được viết, nên nó thừa kế tất cả: parser,
`AgentOrchestrator`, `PipelineService`, mạch hội thoại, kho lượt, SSE agent theater, và cả đường gửi
câu trả lời. Hệ quả đo được: một tenant muốn hội thoại AI phải khai bảng giá, đại lý, chính sách bán
hàng và một cổng ERP cho việc không liên quan gì đến bán hàng.

## 2. Ba chỗ rò rỉ — và vì sao đọc code không tìm ra chúng

Cả ba chỉ lộ ra khi có một **khách trung tính chạy thật**. Mỗi lần sửa một chỗ, bài test lại đi xa
hơn một đoạn rồi vấp chỗ tiếp theo:

| # | Chỗ rò | Triệu chứng ở khách không bán hàng |
|---|---|---|
| 1 | `AgentOrchestrator.dispatch()` gọi `tenantRetailAdvice()` cho **mọi** câu hỏi sản phẩm | `Capability sales-order khong duoc bat` — ném giữa một lượt |
| 2 | `PipelineService.runPipelineTurn()` gọi `tenantOrderAutomation()` cho **mọi** lượt | như trên |
| 3 | `assessRisk(senderKnown = resolved.dealer !== null)` | khách không có sổ đại lý ⇒ **mọi** lượt bị giám sát đẩy sang người thật ⇒ AI **không bao giờ** trả lời |

Chỗ thứ ba là chỗ đáng sợ nhất: nó **không ném lỗi**. Hệ thống chạy, trace đầy đủ, mọi cổng "xanh" —
và bot im lặng. Yêu cầu "phải biết đại lý" nay gắn vào đúng capability đòi hỏi nó
(`tenantHasCapability('sales-order')`), không áp lên mọi khách.

## 3. Ranh giới as-built

```
foundation:  observability · workflow · auth/audit/persistence · tenant loader
messaging:   ChannelAdapter (bot/zca/mock) · OutboundChannelRouter · OutboundRecorder
             · MessagesRepository (kho tin) · ZaloController · Broadcast
turn-processing:
             ORDER_PARSER · AgentOrchestrator · PipelineService
             · ConversationsService + ConversationThreadsRepository (mạch)
             · ConversationContextBuilder (ngữ cảnh)
             · TurnRecordsRepository (kho lượt) · TurnReplyService (đường trả lời)
             · AgentEventsService + StreamController (SSE) · MessagesController (feed)
             · ZcaListener + BotPoller (ngõ vào)
             · media store/fetcher
sales-order: OrdersService · OrdersRepository (góc nhìn) · OrderAmendmentService
             · OrderCommandAdapter/ORDER_COMMANDS · rules/giá · ErpPort · Demo/Catalog media
knowledge · campaign · operations · notifications: không đổi
```

### Vì sao `ZcaListener`/`BotPoller` thuộc `turn-processing` chứ không phải `messaging`

Bằng chứng nằm trong chính constructor: **cả hai bắt buộc có `PipelineService`**. Một listener không
có chỗ giao tin là một tiến trình đọc PII rồi vứt đi. `messaging` sở hữu **adapter** (gửi/nhận); ai
**nhận việc** từ adapter là chuyện của đường xử lý lượt.

### `OrdersRepository` vẫn còn — nhưng là một *góc nhìn*

Composition nối nó vào **cùng một instance** `TurnRecordsRepository` bằng `useExisting`. Bảng
Postgres (`Order`) và kiểu `OrderView` **giữ nguyên**: ranh giới cần sửa là quyền sở hữu, không phải
lưu trữ ⇒ **không có di trú dữ liệu** (tiêu chí K).

### `sendProductAdvice()` rời `OrdersService`

Đoạn đó **chưa bao giờ** là nghiệp vụ bán hàng — nó **từ chối thẳng** `intent === 'dat_don'` và phục
vụ mọi ý định tư vấn (bảo hành, công nợ, vận chuyển). Nó nằm trong dịch vụ đơn hàng chỉ vì lịch sử,
và hậu quả là khách không bán hàng **đọc được tin nhưng không trả lời được**. Nay là
`TurnReplyService.sendAdviceReply()`; `OrdersService.sendProductAdvice()` chỉ còn uỷ quyền, giữ cửa
cho đường **người bấm duyệt**.

## 4. Từ vựng quyết định

`observability/decision-reasons.ts` là tệp của **nền tảng** mà lại chứa `SALES_HANDOFF_REASONS`,
`PRICING_REASONS`, `AUTO_CONFIRM_REASONS` — tức tầng quan sát (thứ **mọi** khách đều dùng) biết thế
nào là một đơn, một bảng giá, một lần bàn giao ERP.

Chia lại:

- **Nền tảng giữ KHUÔN** — `observability/decision-vocabulary.ts`: `DecisionOutcome`, hình dạng một
  bộ từ vựng, sổ đăng ký nhãn, `decisionReasonLabel()` fail-open. Một bài test khoá lại: tệp này
  **không được nhắc một thuật ngữ nghiệp vụ nào**.
- **Capability giữ TỪ NGỮ** — `turns/turn-decisions.ts`, `orders/sales-order-decisions.ts`,
  `channels/channel-decisions.ts`, mỗi tệp tự khai `owner`.

**Không đánh đổi an toàn kiểu** — ngược lại: `telemetry.decision()` nay nhận bộ từ vựng làm tham số
và ràng buộc **cả `point` lẫn `reason`** theo đúng bộ đó. Trước bản này `reason` là `string` tự do.
`DecisionRecord.point` đổi thành `string` có chủ ý: bản ghi là phong bì đã serialize mà trace viewer
đọc, nó phải nhận được điểm của **bất kỳ** capability nào; cổng có kiểu nằm ở lúc **phát**.

## 5. Bằng chứng

| Bằng chứng | Kết quả |
|---|---|
| `turns/neutral-tenant.boot.spec.ts` — boot Nest **thật**, gói khách trung tính | pipeline/orchestrator/parser/kho lượt/trả lời/mạch: **có**; orders/ordersRepo/orderCommands/erp/campaign: **không** |
| `turns/neutral-turn.spec.ts` — một lượt đi hết đường | nhận → lưu → ngữ cảnh → AI → tri thức → **trả lời ra kênh**; trace có `message.persist` + `outbound.send_advice`, quyết định `message.intake=ACCEPTED`, `advice.auto_reply=allowed`, `channel.send` |
| kill switch tắt | lượt vẫn chạy và vẫn lưu, chỉ không gửi (`KILL_SWITCH_OFF`) |
| `turns/turn-processing.composition.spec.ts` | bảng sở hữu; bật `sales-order` **không** làm đổi đường xử lý lượt |
| `packages/tenant/.../turn-processing.contract.spec.ts` | `sales-order` phụ thuộc `turn-processing`; thiếu `messaging`/`parser` ⇒ fail-fast |
| `observability/decision-vocabulary.spec.ts` | nền tảng không chứa thuật ngữ nghiệp vụ; một capability `accounting` giả định khai được từ vựng riêng |
| `apps/web/tenant-runtime.contract.mjs` | **một** artifact (`BUILD_ID` không đổi) phục vụ cả ba đồ thị capability |

### Số liệu

| Bộ | Trước (main `d78db06`) | Sau |
|---|---|---|
| `apps/api` (`OTEL_TRACING` off) | 1209 passed / 52 skipped | **1222 passed / 52 skipped** |
| `apps/api` (`OTEL_TRACING=on`) | — | **1222 passed / 52 skipped** (y hệt) |
| workflow IT trên engine **thật** | 201/201 | **207 passed / 3 skipped** (23/24 tệp, 1 skip có chủ đích) |
| tương quan trace xuyên engine, `OTEL_TRACING=on` | 3/3 | **3/3** |
| `packages/tenant` | 66 | **73** |
| `packages/shared` | 89 | 89 |
| `apps/web` | 93 | 93 |
| `typecheck` · `lint` | sạch | **sạch** |

## 6. Còn vướng (không chặn merge)

1. **`evaluateAutoConfirm()` vẫn nằm trong `pipeline/`** — đó là logic bán hàng ở trong thư mục của
   turn-processing, nên `PipelineService` phải import `SALES_ORDER_DECISIONS`. Ranh giới đúng là đưa
   cổng auto-confirm về `orders/`; chưa làm vì nó kéo theo việc tách `runPipelineTurn()`.
2. **`DemoController` vẫn thuộc `sales-order`** — nó cần `RuntimeSettingsService` (`operations`).
3. **`tenantPersona()` là một shape gộp** (messaging + turnProcessing + knowledge) và nay neo vào
   `turn-processing`; một khách chỉ có `messaging` gọi nó sẽ ném. Chưa tách vì chưa có khách như vậy.
4. **`CatalogMediaController`/`catalogStoreProvider` vẫn thuộc `sales-order`** — catalog ảnh sản phẩm
   nghiêng về `knowledge` hơn; đổi sẽ làm dài danh sách controller của khách knowledge-only.
5. **`supervisor.risk` và `order.amend_window`** đã có trong từ vựng nhưng **chưa** có điểm phát nào
   trong source.
6. **`deploy/netviet/workflow-isolation.contract.test.mjs` hỏng trên Windows** — `ci.yml` được
   checkout dạng CRLF nên `indexOf('\n  <job>:\n')` không khớp. **Lỗi sẵn có, không liên quan bản
   này**; trên runner Linux (LF) nó xanh.

## 7. Nợ cũ vẫn treo (từ phiên 14)

Tuning số span Prisma · ClickStack production auth/deployment · preload OTel trong production
compose · all-in-one hay tách ClickStack · outer "worker" wrapper span · CASE B human debug.
