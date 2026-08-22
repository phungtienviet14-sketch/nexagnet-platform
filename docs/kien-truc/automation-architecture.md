# Kiến trúc tự động hoá & tích hợp ngoài — hiện trạng, nghiên cứu n8n, quyết định

> Ngày: **22/08/2026** · HEAD khảo sát: `f4ed3ee` · Trạng thái tổng: [tong-quan.md](../phat-trien/ke-hoach/tong-quan.md) §10
> Nền tảng quan sát: [observability-review.md](observability-review.md) · Runbook: [debugging.md](../phat-trien/van-hanh/debugging.md)
> Nền tảng đa khách: [nen-tang-da-khach.md](nen-tang-da-khach.md)

**Kết luận trước, lý do sau: ⏸ DEFER n8n.** Không phải vì n8n yếu — về kỹ thuật nó vượt yêu cầu.
Vì hai điều đo được: (1) **giấy phép n8n chặn đúng mô hình kinh doanh của Nexagnet**, và (2) hôm
nay chúng ta **chưa có một tích hợp ngoài nào** để n8n thực thi, nên thêm nó chỉ thêm một service.
Chi tiết ở §7.

---

## 1. Phase 0 — đóng chỗ mù ở đường NGƯỜI BẤM NÚT (đã làm)

### 1.1 Sự cố gốc

Trace thật `b44d631ccf83ac96706585179a91c2a6` kết thúc lúc `05:24:44.128Z` bằng
`advice.auto_reply → denied KILL_SWITCH_OFF`. **3,8 giây sau**, lúc `05:24:47.909Z`, câu trả lời
vẫn ra nhóm khách (`Message direction=outbound, source=system_outbound`).

Grep toàn bộ `docker logs` cửa sổ `05:24:44–05:24:59`: **không một dòng nào**.

Bảng `AuditLog` trên `ultty-gd1-test`, đọc lại lúc 22/08 07:12Z — vẫn đúng như vậy:

```
2026-08-22 05:24:46  operator  automation.auto_send  {"autoSend": "on"}
2026-08-22 05:20:20  operator  auth.login
2026-08-22 04:51:51  operator  auth.login
```

**Không có một dòng `order.approve` nào**, dù CASE 1 đi qua đúng đường đó lúc 05:24:47.

### 1.2 Nguyên nhân gốc — hai tầng, không phải một

Đây **không** phải "quên gọi logger". Kiểm trên HEAD `f4ed3ee`:

| Tầng | Sự thật đo được |
|---|---|
| **1. Không có gốc trace ở biên HTTP** | `telemetry.runTurn()` chỉ có **hai** nơi gọi, cả hai trong `pipeline.service.ts` (`intake`, `process`). Không có interceptor/middleware nào mở trace cho request HTTP. Nên dù `OrdersService` có phát telemetry, mọi bản ghi cũng rơi vào `traceId: 'no-trace'` — và `RecentTracesSink.record()` **vứt thẳng** bản ghi như vậy. |
| **2. `OrdersService` không phát gì cả** | Constructor trên HEAD chỉ nhận `repo`, `outbound`, `@Optional() events`. Không `TelemetryService`, không `AuditLogService`. `approve/reject/completeSalesHandoff` không có một lời gọi telemetry hay `audit.append()` nào. |

Đối xứng bị vỡ chính xác ở đây: đường **tự động** (`pipeline.service.ts:431-468`) có
`evaluateAutoConfirm` → `telemetry.decision` → `observed('outbound.send_confirmation')` →
`stateChange`. Đường **người bấm nút** có `return this.orders.approve(id)`.

Hậu quả không phải "thiếu log" mà là **một cái nhãn sai**: đọc trace lượt đó sẽ kết luận
*"hệ thống không gửi gì"* trong khi khách đã nhận tin. Cùng họ lỗi với §9.4 mục 5
(*"nhãn sai tệ hơn không có nhãn"*), lần này ở tầng con người.

### 1.3 QUYẾT ĐỊNH KIẾN TRÚC — trace của thao tác người: **B (trace mới + liên kết nhân quả)**

Hai lựa chọn đã cân:

| | A. Dùng lại `traceId` của tin gốc | **B. Trace mới + `causationTraceId`** ✅ |
|---|---|---|
| Ngữ nghĩa | Một trace = một giao dịch. Cú bấm chuột **không** thuộc giao dịch xử lý tin. | Hai giao dịch, một sợi dây nhân quả. |
| Độ dài lượt | `buildTraceView` và `tools/trace-view.mjs` đều tính `totalMs = max(durationMs)`; span bao ngoài sẽ trải từ lúc tin đến lúc người bấm. Sale đi ăn trưa = trace 90 phút. **Chôn vùi tín hiệu độ trễ thật của pipeline.** | Mỗi trace đo đúng thứ nó làm. |
| Quan hệ cha–con | Span của thao tác người **không có cha còn sống** — cha đã kết thúc từ lâu. Cây trace thành sai. | Không giả vờ có quan hệ lồng nhau. |
| Chuẩn | W3C Trace Context nói về truyền ngữ cảnh **trong một** giao dịch phân tán. Câu trả lời của OpenTelemetry cho nhân quả **trễ** là **span link**, tách hẳn khỏi parent-child. | Đúng tinh thần link. |

**Chọn B.** Nhân quả ≠ lồng nhau trong thời gian. Dùng lại `traceId` chỉ vì dễ code sẽ làm
timeline nói sai — đúng điều yêu cầu cấm.

Hiện thực: `TraceAnchors` thêm **hai** neo (`observability/trace-context.ts`):

- `actor` — người vận hành đã khởi động lượt (username phiên, hoặc `operator`);
- `causationTraceId` — lượt đã gây ra lượt này.

Đọc xuôi bằng `--order <id>`; đọc ngược bằng chính `causationTraceId`
(`tools/trace-view.mjs` in ra `TRACE <id> ← từ <id gốc>`).

**Hệ quả đã xử lý — `by-order` không được đổi nghĩa.** Từ nay một đơn có nhiều lượt. Hợp đồng của
`findByOrderId()` (và của nút "Xem luồng xử lý") là **lượt GỐC**. Lượt dẫn xuất bị loại bằng chính
mô hình dữ liệu — `causationTraceId` có mặt ⟺ lượt này do lượt khác gây ra — chứ không đoán theo
tên kênh hay thứ tự.

### 1.4 Đã dựng

| Việc | Nơi |
|---|---|
| 3 điểm quyết định mới + 11 mã lý do có kiểu + nhãn tiếng Việt | `observability/decision-reasons.ts` |
| 2 neo trace mới (`actor`, `causationTraceId`) | `observability/trace-context.ts` |
| Gốc trace cho thao tác người + quyết định + `stateChange` + audit | `orders/orders.service.ts` |
| Danh tính người bấm nút (phiên → `x-actor` → `operator`) | `orders/orders.controller.ts` |
| `by-order` giữ nghĩa "lượt gốc" | `observability/recent-traces.sink.ts` |
| Hiện `nguoi=` và `← từ` trong trình đọc CLI | `tools/trace-view.mjs` |
| 11 test hồi quy tái hiện đúng sự cố | `orders/manual-action-observability.spec.ts` |
| Hợp đồng DI bằng container Nest thật | `orders/manual-action-di.contract.spec.ts` |
| Lọc `x-actor` ở cổng vào (§1.6) | `orders/orders.controller.spec.ts` |

Ba cổng, mã lý do phân biệt được **từng** đường:

| Điểm quyết định | Mã |
|---|---|
| `order.manual_approve` | `ALREADY_SENT` · `ROUTED_TO_CONFIRMATION` · `ROUTED_TO_ADVICE` · `NOTHING_TO_SEND` · `SEND_FAILED` |
| `order.manual_reject` | `ALREADY_REJECTED` · `STATUS_NOT_REJECTABLE` · `REJECTED` |
| `order.sales_handoff` | `NO_PENDING_HANDOFF` · `HANDOFF_ALREADY_COMPLETED` · `HANDOFF_COMPLETED` |

`SEND_FAILED` là `degraded`, **không** phải `denied` — cổng đã MỞ, thất bại nằm ở đường gửi. Hai
thứ đó cần hai hành động sửa khác hẳn nhau, đúng phép phân biệt `order.auto_confirm` đã dùng.

**Bằng chứng test ĐỎ trước khi vá** (chạy đúng file spec mới trên `orders.service.ts` của HEAD):

```
Tests  8 failed | 2 passed (10)
→ expected 0 to be greater than 0                                  (không một bản ghi telemetry nào)
→ expected [] to include 'order.manual_approve:denied:NOTHING_T…'
→ expected [] to include 'order.manual_reject:allowed:REJECTED'
→ expected [] to include 'order.sales_handoff:allowed:HANDOFF_C…'
```

Hai test xanh sẵn là hai test fail-open (sink hỏng / không có audit) — chúng khẳng định nghiệp vụ
vẫn chạy, và nghiệp vụ vốn đã chạy đúng. Sau khi vá: **11/11 xanh**, toàn bộ suite API
**993 passed / 0 failed / 25 skipped**, `tsc --noEmit` sạch, `eslint` sạch, 53/53 hợp đồng deploy.

### 1.5 Hai bất biến giữ nguyên

- **Quan sát không được là điều kiện của thành công nghiệp vụ.** `telemetry` và `audit` đều
  `@Optional()`. Test `sink nem loi, tin van gui` khoá điều này.
- **Lỗi ghi sổ không được làm hỏng một lần gửi đã thành công.** `recordManualAction()` chạy SAU
  khi tin đã ra khỏi hệ thống; ném lỗi ở đó chỉ đổi một thành công lấy một 500, rồi mời Sale bấm
  lại lần nữa. Cùng lý lẽ đã viết cho `patchConversation()`. Nhưng fail-open **không** đồng nghĩa
  với im lặng — lần ghi bọc trong bước `audit.persist` nên hỏng thì lọc được và báo động được
  (§1.6).

`AuditLogService` phải `@Optional()` vì nó thuộc capability `operations`, còn `OrdersService`
thuộc `sales-order` — một khách khai `sales-order` mà không khai `operations` là **hợp lệ** theo
tenant contract v2 (`sales-order` chỉ phụ thuộc `knowledge` + `messaging`).

> ⚠️ **Nợ kỹ thuật phát hiện khi làm việc này, CHƯA sửa:** `CampaignService` tiêm
> `AuditLogService` **bắt buộc**, trong khi `campaign` cũng chỉ phụ thuộc `messaging`. Một khách
> khai `campaign` mà không khai `operations` sẽ **không boot được**. Không có khách nào như vậy
> hôm nay (`ultty`/`amico` đều khai đủ 6 capability) nên chưa nổ. Cần một hợp đồng boot theo
> **tổ hợp capability**, không chỉ hai đầu mút `knowledge-only` và `đủ-hết`.

### 1.6 Rà soát bảo mật — ba việc, hai đã sửa

`security-reviewer` chạy trên đúng diff này. Kết quả tóm tắt:

| # | Phát hiện | Mức | Xử lý |
|---|---|---|---|
| 1 | **Neo trace KHÔNG đi qua bộ lọc.** `TelemetryService.envelope()` lấy `anchors` thẳng từ `traceSnapshot()`, `StructuredLogSink` lại spread `...anchors` nguyên văn vào NDJSON, và `toLine()` cũng không scrub. Vì `intake()` đặt `senderExternalId` (UID Zalo của khách) làm neo, **mọi** bản ghi của lượt đó ghi UID thô ra stdout, bất kể `TELEMETRY_PRIVACY`. Docstring của chính trường đó nói *"bộ lọc telemetry xoá nó ở mức `redacted`"* — hiện **sai**. | 🔴 CAO | **CÓ TRƯỚC bản vá này**, và sửa đúng chỗ (`envelope()`) là đổi hình dạng của *mọi* trace ⇒ tách thành việc riêng, không gộp vào Phase 0. Đáng lo nhất trên pilot `zalo-ultty` (`DATA_CLASSIFICATION=customer` → mode `redacted`, đúng chế độ mà lời hứa bị vỡ); trên `gd1-test` mode là `full` nên không redact là **có chủ ý**. |
| 2 | **`actor` cưỡi lên đúng lỗ hổng đó**, và khác các neo khác ở một điểm: nó là **nội dung header do bên gọi đặt** dưới `AUTH_MODE=api_key`, không giới hạn độ dài hay bộ ký tự. 8KB header × 200 bản ghi/lượt × 300 lượt là một cách làm phình vòng đệm. | 🟠 VỪA — **do bản vá này sinh ra** | ✅ **ĐÃ SỬA** — `operatorOf()` chặn tại cổng vào: ≤64 ký tự, chỉ `[\w.@-]`, sai thì về `operator`. Phiên đăng nhập luôn thắng header. 5 test trong `orders.controller.spec.ts`. |
| 3 | **Audit ghi hỏng chỉ còn một dòng chữ tự do** — không lọc được, không báo động được, dù thao tác đã gửi tin thật cho khách hoặc đã vượt mốc khoá ERP §8.3. | 🟠 VỪA | ✅ **ĐÃ SỬA** — lần ghi bọc trong bước `audit.persist`, nên hỏng thành `event=step status=error step=audit.persist`. Hậu tố `.persist` khiến `buildTraceView` tự xếp vào nhóm kỹ thuật, Sale không thấy thêm nhiễu. Hành vi fail-open **giữ nguyên**. |

**Đã cân và CỐ Ý không đổi:**

- **Giả mạo `x-actor` dưới `AUTH_MODE=api_key`.** Có thật, nhưng **giống hệt** khuôn đang dùng ở 6
  controller khác (`master-data`, `settings`, `campaign`, `content`, `notifications`, `zalo`), và
  dưới `AUTH_MODE=session` — chế độ mà cổng `auth.production` bắt buộc — `authUser.username` là
  danh tính đã xác thực nên lỗ này đóng. Đề xuất của reviewer (ghi `api-key:<value>` để phân biệt
  attribution tự khai với attribution đã xác thực) là **tốt**, nhưng đó là quyết định
  **toàn nền tảng**: sửa một controller lệch khỏi sáu cái còn lại sẽ làm sổ audit khó đọc hơn chứ
  không an toàn hơn. Để người quyết.
- **Luồng no-op vẫn mở trace.** Reviewer đề nghị bỏ trace cho `ALREADY_SENT` /
  `ALREADY_REJECTED` / `HANDOFF_ALREADY_COMPLETED` để đỡ churn vòng đệm. **Không làm:** *"vì sao
  tôi bấm mà không có gì xảy ra"* chính là câu hỏi mà vòng đệm phải trả lời được, và `ALREADY_SENT`
  là một câu trả lời hợp lệ. Bỏ nó đi là dựng lại một phiên bản nhỏ của đúng chỗ mù vừa đóng.
  Churn đã bị `ThrottlerGuard` (120 req/phút) chặn, và trần vòng đệm không đổi.

---

## 2. Bản đồ tích hợp HIỆN CÓ — đọc từ source, không suy đoán

### 2.1 Có gì đóng vai `AutomationPort` chưa?

**Chưa, và cũng chưa nên có.** Cái gần nhất là `ErpPort` — nhưng nó **chết** trong luồng GĐ1:
`pushOrder()` không có một call-site nào ngoài thư mục `erp/`. Đây là quyết định kiến trúc #7 của
CLAUDE.md đang được tôn trọng, không phải thiếu sót.

| Câu hỏi | Trả lời (đã verify) |
|---|---|
| Có event bus nội bộ không? | **Có, nhưng không dùng được cho việc này.** `AgentEventsService` là `ReplaySubject` rxjs (buffer 300 sự kiện / 15 giây) phục vụ **SSE cho console**. Trong bộ nhớ, mất khi restart, không retry, không bền vững. Đây là kênh *hiển thị*, không phải kênh *tích hợp*. |
| Có transactional outbox không? | Không có cái nào **mang tên** như vậy. Nhưng xem §2.2 — hình dạng đó đã tồn tại. |
| Có hệ retry không? | **Có** — `CampaignDelivery` (backoff luỹ thừa, `maxAttempts` theo tenant). |
| Có idempotency dùng lại được không? | **Có ba tầng khác nhau** — xem §2.3. |
| Side effect ra ngoài đang quản ở đâu? | `OutboundChannelRouter` là **chốt chặn duy nhất** cho tin Zalo (và là nơi ghi lại tin đã gửi). Ngoài ra 8 file gọi HTTP trực tiếp: `deepseek-advisor`, `deepseek-parser`, `flowise-parser`, `zalo-bot.client`, `zca.adapter`, `gcs-media.store`, `media-fetcher.service`, `mcp/server`. Không có framework tích hợp chung, và ở quy mô này thì **không cần**. |
| Adapter gắn theo capability kiểu gì? | `app-composition.ts` gắn nhãn `owned('<capability>', provider)` rồi lọc theo `tenantCapabilities()`. Chọn hiện thực đi qua factory thuần (`createErpAdapter`, `channel.provider`, `parser.provider`, `advisor.provider`) đọc `tenants/<slug>/tenant.json`. **Không có `if (tenant === 'ultty')` ở bất kỳ đâu trong `apps/` hay `packages/`.** |

### 2.2 Phát hiện quan trọng nhất của phần audit: **outbox đã tồn tại, chỉ chưa được đặt tên**

`CampaignDelivery` + `PrismaCampaignRepository.claimDue()` + `CampaignScheduler` **đã là** một
hàng đợi bền vững trên Postgres, đầy đủ:

| Thuộc tính | Hiện thực |
|---|---|
| Nhận việc nguyên tử giữa nhiều worker | `SELECT … FOR UPDATE OF d SKIP LOCKED` trong một transaction |
| Chịu được worker chết | Lease `claimExpiresAt`; hết hạn thì worker khác nhận lại |
| Retry có kiểm soát | `attempts` + `nextAttemptAt` + backoff luỹ thừa + `maxAttempts` theo tenant |
| Idempotency | `idempotencyKey String @unique` |
| Chống dồn tải | `rateLimitPerMinute` + `minSpacingSeconds` |
| Đánh thức | `CampaignScheduler` — `setInterval` + `unref()` + cờ chống chồng nhịp; **timer chỉ đánh thức, trạng thái không bao giờ nằm trong timer** |
| Chỉ mục | `@@index([status, scheduledFor, nextAttemptAt])`, `@@index([claimExpiresAt])` |

**Đây chính là câu trả lời cho câu hỏi "dispatch design".** Nếu sau này cần dispatch tự động hoá
đáng tin cậy, câu trả lời **không** phải Redis/BullMQ/Kafka và **cũng không** phải một `EventBus`
mới — mà là *khái quát hoá khuôn đã chạy được ở đây*. Không dependency mới, không container mới,
cùng Postgres đã có backup.

> Điều cần khái quát hoá là **khuôn**, không phải bảng `CampaignDelivery`. Nhét sự kiện tự động
> hoá vào bảng chiến dịch CSKH là trộn hai vòng đời khác nhau vào một máy trạng thái.

### 2.3 Idempotency đã có ba tầng — khác nhau về **ranh giới**, không phải về chất lượng

| Ranh giới | Cơ chế | Bảo đảm |
|---|---|---|
| Tin vào | `Message @@unique([platform, externalMessageId])` | Đúng-một-lần cho việc *nhận*: hai worker cùng đọc một tin thì chỉ một người xử lý (`DUPLICATE_MESSAGE`) |
| Tin ra (chiến dịch) | `CampaignDelivery.idempotencyKey @unique` | Chống **hàng kế hoạch** trùng. **KHÔNG** phải đúng-một-lần khi gửi: code tự ghi rõ *"at-least-once across a crash between remote send and markSent"* vì adapter Zalo không cấp khoá idempotency |
| Duyệt/gửi trong tiến trình | `confirmationsInFlight` / `contentRepliesInFlight` (Map) + cổng `status === 'sent'` | Chống bấm hai lần trong **một** tiến trình; cổng trạng thái mới là thứ chống bền vững |

**Bài học phải mang sang bất kỳ tích hợp ngoài nào:** ranh giới idempotency thật nằm ở chỗ
**hệ ngoài** chấp nhận một khoá — nếu nó không chấp nhận, ta chỉ có at-least-once, và phải nói
thẳng ra như `campaign.service.ts` đã làm, chứ không hứa suông trong tài liệu.

### 2.4 Tool registry — LLM đã bị chặn đúng chỗ

`advisor-tools.ts` (6 công cụ **chỉ đọc**) tách khỏi `order-tools.ts` (3 công cụ **ghi**:
`tra_cuu_don`, `huy_don`, `sua_don`). Phạm vi ép trong **handler**, không bằng lời dặn trong
prompt: chỉ chạm được đơn cùng `chatId` **và** cùng `senderExternalId`; ngoài phạm vi trả
*"không tìm thấy"*; kênh không cấp uid → chỉ còn quyền đọc; **không có công cụ xoá**.

Kết luận: **kiến trúc hiện tại đã đúng nguyên tắc "AI không gọi thẳng automation" rồi.** Nếu có
ngày cần automation do AI kích hoạt, công cụ phải mang schema nghiệp vụ cụ thể và đi qua đúng
khuôn `order-tools.ts`. Một `execute_workflow(id, payload)` sẽ phá chính lớp phòng thủ đang giữ
tin nhắn Zalo — dữ liệu **không tin cậy** đi thẳng vào prompt — không leo thang được thành hành
động.

---

## 3. Nghiên cứu n8n — chỉ nguồn chính thức cho các khẳng định cốt lõi

### 3.1 Giấy phép — **P0, và đây là chỗ chặn**

n8n dùng **Sustainable Use License v1.0** (file `.ee.` cần Enterprise License; nhánh không phải
`master` là *unlicensed*). Bản quyền cho phép dùng **"chỉ cho mục đích kinh doanh nội bộ của
chính bạn, hoặc phi thương mại/cá nhân"**. Tài liệu chính thức nêu đích danh hai việc **không**
được làm:

> "White-labeling n8n and offering it to your customers for money." ·
> "Hosting n8n and charging people money to access it."

Help Center của n8n trả lời thẳng đúng ba tình huống của chúng ta:

| Tình huống | Yêu cầu giấy phép (theo n8n) |
|---|---|
| Vận hành workflow + credentials **của khách** trong instance n8n của mình | **Enterprise license** |
| Nhúng n8n vào sản phẩm, để khách thấy/dùng workflow | **Embed license** (white-label) |
| Chỉ tư vấn, khách tự dựng instance của họ | **Không cần** giấy phép thương mại |

**Đối chiếu mô hình Nexagnet.** Từ 28/07/2026 đây không còn là công cụ nội bộ — nền tảng phục vụ
khách trả tiền (Ultty, Amico, …). Vậy:

- **MODEL 1** (một instance mỗi tenant, do Nexagnet vận hành) — vẫn là *hosting workflow của
  khách* ⇒ **Enterprise**.
- **MODEL 2** (một instance dùng chung, mỗi tenant một Project) — **Enterprise**, và xem §3.2 vì
  còn hỏng về kỹ thuật.
- **MODEL 3** (chỉ tự động hoá **nội bộ** của Nexagnet; khách không bao giờ chạm n8n; workflow là
  quy trình của chính ta) — *có thể* nằm trong SUL, vì phép thử của n8n là "giá trị bán ra có
  bắt nguồn hoàn toàn hay chủ yếu từ n8n không", mà giá trị của ta nằm ở parse/rules/Zalo. Nhưng
  đây là **phán đoán pháp lý, không phải kỹ thuật** — phải có xác nhận bằng văn bản từ
  `license@n8n.io` trước khi dựa vào nó.

Giá: bản self-hosted Business niêm yết **$800/tháng**; Enterprise là giá thoả thuận (nguồn bên
thứ ba ước $25k–75k/năm — **chưa kiểm chứng**, đừng đưa vào dự toán). Cho 10–20 đơn/ngày, một
khách, con số nào trong khoảng đó cũng lệch bậc so với giá trị thu được lúc này.

### 3.2 Đa khách — Community edition **không có ranh giới tenant nào cả**

Đây là phát hiện mang tính quyết định về kỹ thuật:

> **Projects và RBAC là tính năng trả tiền (Business/Enterprise). Community edition không có.**

Hệ quả cho MODEL 2 (shared instance, project theo tenant): **không thể dựng trên Community.**
Không có Project thì mọi workflow, mọi credential, mọi execution của **mọi khách** nằm chung một
không gian, và bất kỳ ai vào được UI đều thấy hết. Điều đó đâm thẳng vào bất biến của repo:

> Cách ly bằng `tenantId` trong nhãn là cách ly **bằng lời hứa**
> ([observability-review.md](observability-review.md) §13 — có sự cố thật 17/08/2026).

Nói cách khác: **MODEL 2 hoặc là bất hợp pháp theo giấy phép, hoặc là không cách ly được — tuỳ
phiên bản.** Không có cấu hình nào tránh được cả hai.

Chỉ còn MODEL 1 (silo mỗi tenant) là an toàn về cách ly, và nó bị chặn ở §3.1, đồng thời nhân số
container lên theo số khách.

### 3.3 Triển khai

- Postgres cho production (SQLite **không** được khuyến nghị, và với queue mode thì không dùng được).
- Queue mode cần **Redis** + tiến trình worker riêng (+ webhook processor nếu tách). Multi-main
  cần Enterprise.
- `N8N_ENCRYPTION_KEY` phải **giống nhau** trên mọi instance/worker để đọc được credential.
- Worker chết: webhook vẫn nhận HTTP và sinh execution id, việc nằm chờ trong Redis.

Với 10–20 đơn/ngày, queue mode là thừa; single-main + Postgres là đủ. Nhưng ngay cả cấu hình tối
thiểu vẫn là **1 container n8n + 1 Postgres riêng cho n8n, nhân với số tenant** — trên một VM
hiện đã chạy 17 container cho *một* stack test.

Ràng buộc bắt buộc nếu có ngày dựng: n8n **không** được dùng Postgres nghiệp vụ của tenant, và
**không** được truy vấn thẳng bảng Prisma "cho tiện" — chỉ giao tiếp qua hợp đồng/API/sự kiện.

### 3.4 Bảo mật

- Webhook trigger hỗ trợ **Basic / Header / JWT / None** — đủ để tự ký request từ Nexagnet.
- Credential được mã hoá bằng `N8N_ENCRYPTION_KEY`; có xoay khoá.
- **External secrets, SSO, log streaming, source control, environments, biến tuỳ chỉnh: đều là
  tính năng trả tiền.** Trên Community, secret của khách sẽ nằm trong store của n8n, mã hoá bằng
  một khoá đối xứng, **ngoài** kiến trúc Secret Manager hiện tại (GCP Secret Manager +
  `render-secrets.sh`) — tức là một kho bí mật thứ hai với vòng đời riêng, backup riêng, quy
  trình xoay khoá riêng. Đó là một sự thoái lui, không phải một cải tiến.

### 3.5 Quan sát — điểm mạnh nhất của n8n, nhưng đắt hơn tưởng

n8n có **hỗ trợ W3C traceparent gốc**: webhook mang `traceparent` thì n8n dùng chính nó làm span
cha của workflow, và node HTTP Request tiêm ngược `traceparent` cho lời gọi đi ra. Đúng thứ ta
cần, và đúng lý do `trace-context.ts` chọn định dạng W3C ngay từ đầu.

**Nhưng:** tính năng đó cần `N8N_OTEL_ENABLED=true` **và một OTLP collector ngoài**
(`N8N_OTEL_EXPORTER_OTLP_ENDPOINT`). Không có collector thì không có trace. Mà collector chính là
thứ [observability-review.md](observability-review.md) §13 đã **cố ý DEFER**, và lý do defer
(cách ly silo, không phải tiền) **không thay đổi** khi thêm n8n. Thuộc tính span tuỳ chỉnh còn cần
Enterprise.

Nên bức tranh thật: hoặc thêm collector (đảo một quyết định kiến trúc đã cân nhắc kỹ), hoặc chấp
nhận n8n là một hộp đen giữa trace của ta — chỉ nối được bằng cách tự ghi `executionId` trả về.

### 3.6 Độ tin cậy & phiên bản

Có sẵn: retry-on-fail theo node, error workflow, giới hạn đồng thời, dọn dữ liệu execution.
**Không** có idempotency dựng sẵn cho webhook — trùng lặp vẫn là việc của bên gọi, đúng như §2.3
đã nói. Source control / environments (dev→prod cho workflow) là **Enterprise**; Community chỉ
còn import/export qua API, tức là workflow trở thành một tạo tác được click ra chứ không phải
một tạo tác được review.

Với repo mà `deploy/netviet/` có **7 bất biến** và các hợp đồng như
`secrets-passthrough.contract.test.mjs`, việc để logic nghiệp vụ sống trong một UI không nằm
trong git là bước lùi rõ rệt về kỷ luật vận hành.

---

## 4. Ma trận NGUỒN SỰ THẬT

Bảng này đúng **hôm nay**, và là ràng buộc cho bất kỳ tự động hoá nào sau này.

| Dữ liệu / trạng thái | Chủ sở hữu (canonical) | Bản sao / nơi tiêu thụ |
|---|---|---|
| Cấu hình tenant, capability | `tenants/<slug>/tenant.json` (**hạt giống**, validate zod lúc boot) | Nexagnet runtime; sau lần seed đầu với `PERSISTENCE=prisma` thì Postgres là nguồn chạy |
| Danh mục SP / giá / đại lý / map nhóm / glossary | **Postgres của tenant** (sửa qua `/admin` + MCP) | `KnowledgeService` cache trong bộ nhớ; `reload()` sau mỗi lần ghi |
| Mạch hội thoại | Postgres — `ConversationThread` | Console |
| **Đơn hàng** | **Postgres — `Order`** | Console; ERP (tương lai) là **bản sao**, không phải nguồn |
| Giá đã tính của một đơn | `Order.priced` (rules engine TS tính, **không phải LLM**) | Văn bản xác nhận đã gửi khách |
| Bàn giao Sale (`salesHandoff`) | **Postgres — `Order.salesHandoff`** | Hàng việc của Sale |
| Tin nhắn (vào & ra) | Postgres — `Message` | Zalo là kênh vận chuyển, **không** phải kho lưu |
| Sổ kiểm toán | Postgres — `AuditLog` (chỉ ghi thêm) | — |
| Trace AI | **stdout NDJSON** (`docker logs`) + vòng đệm có trần | Console; **redeploy là mất `docker logs` vĩnh viễn** |
| Tồn kho | **ERP của khách** — nguồn duy nhất (quyết định #1) | Không cache sớm |
| Mã đơn phía ERP | ERP của khách | `Order.erpCode` — **chỉ là tham chiếu ngoài** |
| Khách hàng / CRM | CRM của khách (chưa có) | — |
| *Automation execution* | *n8n, nếu adopt* | Nexagnet chỉ được giữ **execution id + trạng thái tối thiểu**, không bao giờ là trạng thái nghiệp vụ |
| *Định nghĩa workflow* | *n8n DB, hoặc git nếu có source control (Enterprise)* | — |

**Bất biến:** với **một** trạng thái chỉ có **một** chủ. `Order` của Nexagnet là canonical cho
trạng thái đơn; `Order` bên ERP là bản chiếu; trạng thái workflow n8n **không bao giờ** là trạng
thái nghiệp vụ. Mốc khoá chống lệch ERP đã có sẵn và **không** được chuyển sang n8n:
`salesHandoff = completed` ⇒ LLM hết quyền sửa đơn (§8.3 của tong-quan).

### 4.1 Thứ TUYỆT ĐỐI không được đưa sang n8n

Tenant/identity/capability · uỷ quyền · quyền hành động của AI · trạng thái đơn · **tính giá**
(bất biến #5: LLM không tính tiền, rules engine TS tất định lo) · chính sách đại lý · máy trạng
thái `salesHandoff` · sổ kiểm toán · cổng auto-send và kill switch · quyết định định tuyến
Sale/tự động.

Phần n8n *có thể* nhận, nếu có ngày adopt: gọi API hệ ngoài, đồng bộ theo lịch, email/webhook
ra ngoài, chuyển dữ liệu ERP/CRM, retry của những việc **không thuộc miền nghiệp vụ**.

---

## 5. Nếu adopt: hình dạng tối thiểu (thiết kế, CHƯA thi công)

Ghi lại để lần sau không phải nghĩ lại — **không** phải giấy phép thi công.

### 5.1 Một trừu tượng, không phải bốn

Không tạo cùng lúc `AutomationPort` + `IntegrationPort` + `WorkflowPort` + `EventBus`. Trừu tượng
nhỏ nhất có ích là **một cổng duy nhất**, đặt đúng chỗ `ErpPort` đang đứng:

```
Giao dịch nghiệp vụ (Nexagnet sở hữu)
        ↓  commit trạng thái canonical vào Postgres
        ↓  ghi một dòng sự kiện trong CÙNG transaction   ← khuôn CampaignDelivery, §2.2
        ↓  worker nhận việc (SKIP LOCKED + lease)
        ↓  AutomationPort.dispatch(event)  → HTTP có ký + traceparent + idempotencyKey
        ↓  n8n / Make / endpoint của chính khách
        ↓  hệ ngoài
        ↓  callback  → trạng thái tích hợp + audit  (KHÔNG phải trạng thái nghiệp vụ)
```

Dispatch **sau khi** commit, và `AutomationPort` mặc định là **ASYNC**: n8n chết thì trạng thái
nghiệp vụ vẫn commit, sự kiện chuyển `pending`/`failed`, AI **vẫn trả lời khách bình thường**.
Chỉ khi hợp đồng nghiệp vụ *thật sự* đòi kết quả bên ngoài trước khi hoàn tất mới dùng SYNC — và
phải viết rõ lý do tại call-site.

Trạng thái tích hợp giữ tối thiểu (`pending`/`processing`/`completed`/`failed`) và **tách hẳn**
khỏi `OrderStatus`. `executionId` của n8n chỉ là tham chiếu ngoài.

### 5.2 Hợp đồng sự kiện

Đủ chung ở mức nền tảng, đủ nghiệp vụ để đọc ra nghĩa: `eventId` · `eventType` · `occurredAt` ·
`tenant` · `environment` · `entity` + `entityId` · `traceparent` · `causationTraceId` ·
`idempotencyKey` · `payloadVersion` · `payload` **đã lọc**.

Không bao giờ gửi: row DB thô, secret, object nội bộ nguyên khối. Payload đi qua bộ lọc tập
trung — **`sanitizeTelemetry`/`redactAuditValue` đã có sẵn**, và bài học §9.4 mục 1 (`scrubSecrets`
từng để lọt nguyên token) nói rằng thêm một bộ lọc thứ ba là thêm một chỗ để sai.

`idempotencyKey` **ổn định**, dẫn xuất từ `(tenant, entity, entityId, eventType, payloadVersion)`
— gửi lại sau timeout phải ra đúng khoá cũ. Và phải nói thẳng bảo đảm thật: nếu hệ ngoài không
tôn trọng khoá thì ta chỉ có at-least-once, y như `campaign.service.ts` đã tự thú.

### 5.3 Thành phần capability

Automation **không** phải yêu cầu của mọi khách. Nếu làm: thêm `'automation'` vào `CAPABILITY_IDS`
+ `capabilityRequirements` (không phụ thuộc `sales-order`) + một `automationIntegrationSchema`
trong `tenantIntegrationsSchema`; đăng ký provider bằng `owned('automation', …)`. Khách không khai
thì adapter **không được nạp** — cơ chế lọc này đã chạy sẵn. Phải kèm fixture trung tính chứng
minh khách khác dùng được, và **không** slug khách nào trong `apps/`/`packages/`.

### 5.4 Chỗ đứng license-sạch nhất

Help Center của n8n nói: **khách tự dựng instance của họ ⇒ Nexagnet không cần giấy phép thương
mại nào.** Kết hợp với §5.1, điều đó dẫn tới một thiết kế vừa sạch pháp lý vừa sạch kiến trúc:

> `AutomationPort` bắn tới **một endpoint HTTP do khách khai trong gói tenant**. Endpoint đó là
> n8n của khách, hay Make, hay Zapier, hay một Cloud Function — Nexagnet không cần biết.

Nexagnet không host, không white-label, không bán lại. Cách ly tenant là tuyệt đối vì hạ tầng
automation nằm bên khách. Và ta không khoá mình vào một nhà cung cấp nào. Nếu có ngày thật sự cần
tự động hoá ngoài, **đây** là hình dạng nên làm trước — không phải dựng n8n trên VM của mình.

Kèm theo là mô hình đe doạ phải xử lý ngay từ bản đầu, vì endpoint do **dữ liệu tenant** quyết
định: chống SSRF (danh sách cho phép scheme/host, cấm IP nội bộ), ký request đi ra, xác thực
callback, từ chối callback lệch tenant, chống replay bằng `eventId`, và không bao giờ log payload
thô.

---

## 6. Nếu KHÔNG adopt thì mất gì

Trung thực về phía ngược lại: n8n cho sẵn hàng trăm node tích hợp, một UI để người không lập trình
sửa quy trình, và retry/schedule dựng sẵn. Khi Nexagnet có 5 khách × 3 hệ ngoài mỗi khách, tự viết
15 adapter là một cái giá thật.

Điều đó **đúng** — nhưng nó mô tả bài toán của năm sau, không phải hôm nay. Hôm nay số adapter
ngoài đang chạy là **không**. Và cái giá đó chỉ trả cho n8n được nếu giấy phép cho phép, mà §3.1
nói là không.

Chưa mở khảo sát Activepieces/Windmill: so sánh ứng viên chỉ có nghĩa **khi có blocker thật cần
thay thế**. Blocker của n8n hôm nay là *"chưa có việc cho nó làm"* cộng với *"mô hình bán dịch vụ
đụng giấy phép"*. Cái thứ nhất làm **mọi** ứng viên đều thừa; nên so sánh bây giờ là khảo sát cho
một bài toán chưa tồn tại. Khi có use case thật, so sánh lại và **để ý đúng chỗ này**: Activepieces
là MIT ở lõi, Windmill là AGPL — hai câu trả lời khác hẳn n8n cho câu hỏi "bán dịch vụ được không".

---

## 7. QUYẾT ĐỊNH: ⏸ **DEFER**

Không phải REJECT: n8n là công cụ tốt, hỗ trợ W3C traceparent gốc, và có thể hợp lệ về giấy phép
theo con đường §5.4 (khách tự host). Không phải POC ONLY: một PoC bây giờ sẽ chứng minh một thứ
chưa ai cần, trên một VM đã chật.

Chiếu vào nguyên tắc "công nghệ mới phải *bỏ được code tự viết*, *giảm được độ phức tạp tích hợp*,
hoặc *cải thiện độ tin cậy*":

| Tiêu chí | Hôm nay |
|---|---|
| Bỏ được code tự viết? | **Không.** `ErpPort.pushOrder()` không có call-site nào; số tích hợp ngoài đang chạy = 0. Không có dòng nào để bỏ. |
| Giảm độ phức tạp tích hợp? | **Không.** Thêm 1 n8n + 1 Postgres riêng cho nó (+ Redis nếu queue mode, + OTLP collector nếu muốn giữ trace) **nhân với số tenant**. |
| Cải thiện độ tin cậy? | **Không.** Retry/lease/idempotency đã có và đã chạy trong `CampaignDelivery`. |

Ba lần "không" ⇒ theo đúng luật đã đặt ra: **không thêm service.**

### Điều kiện MỞ LẠI (bất kỳ điều nào)

1. Có **use case tích hợp ngoài thật** đã chốt với khách (KiotViet API bật, CRM, kế toán) — tức
   là có code sẽ được *bỏ đi*, không phải code sẽ được *thêm vào*.
2. Khách **tự host** automation của họ và chỉ cần Nexagnet bắn webhook ra (§5.4) — con đường
   sạch pháp lý; lúc đó việc cần làm là `AutomationPort`, còn n8n là chuyện của khách.
3. Có **xác nhận bằng văn bản từ `license@n8n.io`** rằng mô hình vận hành cụ thể của Nexagnet
   được phép, hoặc đã ký Embed/Enterprise agreement.
4. Số adapter tích hợp tự viết vượt **~3 cái mỗi khách** — lúc đó chi phí tự viết mới thắng chi
   phí thêm một service.

### Việc nên làm TRƯỚC khi nghĩ lại về n8n

- **Không** dựng `AutomationPort` bây giờ — trừu tượng nhỏ nhất có ích hiện tại là *không có cái nào*.
- Khi việc đầu tiên xuất hiện: khái quát hoá **khuôn** `CampaignDelivery` (§2.2), đừng thêm
  Redis/BullMQ.
- Trả nợ hợp đồng boot theo **tổ hợp capability** (§1.5) — `campaign` + không `operations` sẽ nổ.

---

## 8. Nguồn

- [n8n LICENSE.md (GitHub, master)](https://github.com/n8n-io/n8n/blob/master/LICENSE.md)
- [Sustainable Use License — n8n Docs](https://docs.n8n.io/privacy-and-security/sustainable-use-license/)
- [Which license do I need for my use case? — n8n Help Center](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case)
- [Compare editions / Community edition features — n8n Docs](https://docs.n8n.io/deploy/host-n8n/community-edition-features/)
- [RBAC projects — n8n Docs](https://docs.n8n.io/user-management/rbac/projects/)
- [Enable queue mode — n8n Docs](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/)
- [Trace executions with OpenTelemetry — n8n Docs](https://docs.n8n.io/deploy/host-n8n/keep-n8n-running/trace-executions-with-opentelemetry/)
- [Webhook node — n8n Docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
