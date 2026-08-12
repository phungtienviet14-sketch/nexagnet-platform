# SPECIFICATION & EXECUTION PLAN — GĐ1 ULTTY

> **Vai trò:** specification + execution plan riêng cho GĐ1 Ultty. File này mô tả phạm vi, bất biến nghiệp vụ, acceptance criteria và thứ tự triển khai. **Không chứa trạng thái tiến độ**; trạng thái duy nhất nằm ở `tong-quan.md`.
>
> **Ranh giới với kiến trúc tổng quát:** mọi năng lực mới phải nằm ở base chung theo `nen-tang-da-khach.md`. Ultty chỉ cung cấp config/data/seed/runtime input. Không thêm dependency Ultty-specific vào core.

---

## 1. Mục tiêu GĐ1

GĐ1 chuyển từ demo “AI đọc hiểu tin đặt hàng” sang pilot có thể vận hành:

```text
Zalo message
→ lưu tin
→ parser hiểu intent/dữ liệu
→ rules engine tính deterministic
→ đơn hợp lệ trong ngưỡng tenant tự gửi xác nhận
→ Sale nhận handoff nhập KiotViet thủ công
```

Ngoài đơn hàng, GĐ1 cũng cần nền tư vấn sản phẩm/giá/FAQ/media/catalog và campaign CSKH theo cơ chế an toàn, có phê duyệt và persistence.

## 2. Phạm vi cho phép

Trong GĐ1 được làm:

- auto-confirm đơn đủ dữ liệu theo ngưỡng tenant;
- price period/freshness và retail advice;
- quản trị bảng giá, đại lý, deal riêng, map nhóm;
- FAQ/product content/media/catalog metadata + importer/settings;
- agent bán hàng trả lời an toàn dựa trên nội dung approved;
- campaign CSKH generic: draft, approve, schedule, outbox, retry, cancel;
- parser context/reply bounded;
- auth/RBAC cho pilot dữ liệu thật;
- readiness gates cho parser/media/channel/auth/golden dataset;
- golden eval harness field-level;
- E2E path Zalo/message→order→outbound/handoff.

Không thuộc GĐ1:

- KiotViet API integration;
- Nhanh.vn;
- MISA;
- feature riêng Amico;
- nghiệp vụ nhóm vận chuyển 2.3;
- tự động cập nhật ERP;
- QR payment;
- công nợ nâng cao;
- sửa/hủy đơn GĐ2;
- forecast/upsell.

## 3. Bất biến nghiệp vụ GĐ1

### 3.1 LLM vs rules

- LLM không tính tiền.
- LLM không quyết giá.
- LLM không quyết VAT/COD/ship/công nợ/khuyến mãi.
- LLM chỉ hiểu ngôn ngữ, intent, extract dữ liệu và sinh câu trả lời.
- Rules engine TypeScript deterministic là nơi tính giá, tổng, điều kiện outbound và cảnh báo.

### 3.2 Auto-confirm đơn

Với tổng số lượng đơn:

```text
<= tenant.orderAutomation.maxAutoConfirmQuantity
```

Ultty seed hiện cấu hình:

```text
50
```

Luồng bắt buộc:

```text
AI parse
→ rules engine tính
→ validate
→ gửi xác nhận khách ngay
→ order = sent
→ tạo salesHandoff manual_erp_entry
→ Sale nhập KiotViet thủ công
```

Không chờ Sale duyệt nếu đơn đủ dữ liệu và không có cảnh báo chặn.

Nếu:

```text
> 50
hoặc thiếu dữ liệu
hoặc có warning
hoặc nhóm chưa map
hoặc policy yêu cầu người xử lý
```

thì:

```text
không gửi khách
→ handoff Sale
```

`AUTO_SEND` chỉ là kill switch vận hành. Nó không chứa business policy và không thay thế `tenant.orderAutomation`.

### 3.3 ERP trong GĐ1

GĐ1 không gọi `ErpPort`. Sau outbound thành công, Sale nhập KiotViet thủ công. `sent` nghĩa là khách đã nhận xác nhận; `synced` chỉ dành cho phase ERP sau này hoặc dữ liệu legacy.

## 4. Bốn nghiệp vụ cố ý blocked

Các mảng sau không được suy đoán, không hard-code và không hoàn thiện business behavior trong GĐ1.

### BLOCKED-1 — VAT

Chưa chốt mặc định:

- giá đã gồm VAT;
- VAT theo chính sách đại lý;
- hay chỉ VAT khi khách yêu cầu xuất hóa đơn.

Yêu cầu code: giữ trạng thái thiếu configuration/readiness blocker; không coi rule tạm là production truth.

### BLOCKED-2 — COD + ship

Chưa có:

- bảng phí COD chính thức;
- phí Grab/nội thành;
- phí Viettel/tỉnh;
- định nghĩa nội thành;
- bảng vùng;
- rule chính thức cho đơn một sản phẩm.

Yêu cầu code: fail-closed/readiness warning cho production; không dùng số tạm làm source-of-truth.

### BLOCKED-3 — “công nợ 7 ngày”

Chưa biết đây là:

- `PolicyType` riêng;
- hay điều khoản thanh toán của policy khác.

Yêu cầu code: không thêm enum/rule mới.

### BLOCKED-4 — khuyến mãi

Các chương trình như `30 tặng 1`, `10 tặng 1`, `ELNI mua 5 tặng ELNA` chưa có nguồn xác nhận cách tính.

Yêu cầu code: promotion engine inactive; có thể hiển thị “chưa cấu hình/chưa đủ nguồn”, nhưng không implement công thức.

## 5. Dữ liệu khách tự nhập qua UI

Các dữ liệu dưới đây không được chặn development bằng cách yêu cầu sửa source code.

### DATA-5 — Bảng giá hiện hành

Domain phải có price period/kỳ hiệu lực. Khi cần giá tháng hiện hành:

```text
không có bảng giá active cho tháng hiện tại
→ fail closed
→ không dùng bảng tháng trước
→ không tự suy luận
```

`/settings` phải cho Sale/operator:

- xem danh sách kỳ giá;
- tạo kỳ mới;
- copy kỳ cũ thành draft;
- chỉnh giá;
- import;
- preview;
- validate;
- activate;
- xem kỳ active;
- cảnh báo khi tháng hiện tại chưa có giá.

Tư vấn giá lẻ dùng strategy tenant:

```text
tenant.retailAdvice.priceField
tenant.retailAdvice.qualifier
```

Ultty config chọn field `minRetailPrice`. Câu qualifier là dữ liệu tenant, không hard-code trong core.

### DATA-6 — Đại lý, deal riêng, map nhóm

`/settings` phải quản trị được:

- đại lý/CTV: tên, alias, SĐT nếu cần, loại/cấp, policy, trạng thái, metadata;
- deal riêng: dealer → SKU → override price → effective period nếu cần;
- group mapping: Zalo group → dealer → branch → enabled.

Yêu cầu:

- thêm/sửa/xóa hoặc disable phù hợp với audit/history;
- validation;
- preview;
- audit;
- nhóm chưa map;
- mapping lại không mất lịch sử;
- import Excel nếu dùng infrastructure import.

PostgreSQL là runtime source-of-truth sau bootstrap.

### DATA-7 — Campaign/CSKH

Khách/Sale phải nhập được:

- nội dung chiến dịch;
- nhóm nhận;
- ngày/giờ;
- cửa sổ gửi;
- birthday;
- lịch định kỳ;
- mùng 1/rằm nếu dùng;
- template;
- enabled;
- metadata scheduling.

Dữ liệu thật không cần có ngay để build engine. Engine generic trước, khách nhập sau.

## 6. Acceptance criteria theo mảng

### P1 — Auto-confirm order

Acceptance:

- ngưỡng lấy từ `tenant.orderAutomation`;
- `<= 50` inclusive cho Ultty;
- `> 50` handoff;
- dữ liệu thiếu/warning/group chưa map/manual review handoff;
- outbound lỗi không đổi trạng thái;
- outbound thành công chuyển `sent`;
- tạo `salesHandoff.manual_erp_entry`;
- Sale có thể hoàn tất handoff;
- không gọi ERP trong luồng GĐ1;
- rerun/send/reject/idempotency an toàn.

### P2 — Price

P2.1:

- schema/migration hỗ trợ price period;
- active/current-period lookup;
- không có current active price period thì fail-closed;
- repository/domain/settings đồng bộ;
- test boundary tháng hiện hành, thiếu SKU, thiếu period.

P2.2:

- retail advice strategy generic;
- tenant chọn `priceField` và `qualifier`;
- order pricing vẫn dùng wholesale/deal theo nghiệp vụ đơn hàng;
- retail advice dùng `minRetailPrice` cho Ultty;
- qualifier xuất hiện trong reply;
- không có giá hiện hành thì không báo số cũ;
- tenant khác đổi field không sửa core.

### P3 — Campaign CSKH

Domain tối thiểu:

```text
Campaign
CampaignTarget
CampaignDelivery
```

State machine:

```text
draft → approved → scheduled → running → completed
```

và:

```text
partially_failed
cancelled
```

Acceptance:

- campaign chưa approved không gửi outbound;
- schedule phân phối delivery trong window, không bắn đồng loạt;
- config tenant có default window/min spacing/max targets/rate limit hoặc tương đương;
- durable claim;
- retry policy;
- idempotency;
- cancellation;
- attempt count/timestamps/error/audit;
- restart không gửi lại toàn campaign;
- thiết kế không phá khi scale nhiều worker;
- UI tạo/preview/approve/schedule/queue/sent/failed/pending/retry/cancel.

### P4 — FAQ/product content/media/catalog

Source-of-truth:

```text
Product
Asset
ProductAsset
FAQ
AdviceContent
Catalog
VideoLink
SourceProvenance
ContentReadiness
```

Tên model có thể khác nếu semantics đầy đủ.

Acceptance:

- binary ở Drive/object storage, không copy vào Git/image;
- DB giữ locator, MIME/type, source, source file id, hash/version, product mapping, approval status, readiness, provenance, metadata;
- content lifecycle `draft → reviewed/approved → active`;
- Drive tồn tại không tự đồng nghĩa approved;
- settings UI xem/sửa/approve/unapprove FAQ/media/catalog/video/company profile/provenance/readiness;
- import preview/diff/idempotent;
- không duplicate khi chạy lại;
- giữ provenance;
- không overwrite operator edits khi chưa có policy;
- importer qua `ContentSourcePort`, không khóa domain vào Google Drive.

### P5 — Go-live gates

Acceptance:

- parser context/reply bounded;
- auth/RBAC/session persistent;
- production parser provider gate;
- media production readiness gate;
- channel readiness/E2E;
- golden eval harness;
- readiness UI/checklist;
- docs/status cập nhật đúng nơi.

## 7. Agent bán hàng GĐ1

Flow:

```text
customer asks product
→ identify product
→ load approved product knowledge
→ FAQ/advice
→ retail pricing strategy nếu hỏi giá
→ attach/send image nếu channel hỗ trợ
→ video/catalog gửi URL/link
→ response
```

Fail-safe:

- thiếu FAQ/content approved → trả lời an toàn hoặc handoff Sale;
- thiếu price period hiện hành → không báo giá cũ;
- video/PDF/catalog trong GĐ1 gửi link;
- channel capability phải rõ; không giả vờ adapter hỗ trợ `sendVideo`/`sendFile` nếu API không có.

## 8. Parser context/reply

Parser không được chỉ xử lý một tin độc lập. Cần generic context model:

```text
ChannelMessage
├── current message
├── reply/quoted message nếu có
├── bounded conversation context
└── normalized participants
```

Acceptance:

- bounded context, không gửi lịch sử vô hạn;
- deterministic context builder;
- quote/reply mapping;
- message persistence lookup;
- test tin reply;
- test bổ sung số lượng;
- test ambiguous context;
- thiếu context thì handoff/ask clarification, không auto-confirm.

## 9. Auth và quyền vận hành

Không pilot dữ liệu thật với anonymous mode.

Yêu cầu:

- session auth persistent;
- password hashing bằng argon2 hoặc lựa chọn đã được phê duyệt;
- roles generic: Sale, Manager, Accounting, Admin hoặc mapping nghiệp vụ tương đương;
- UI/admin tạo user, disable user, reset/change credentials, gán role;
- bảo vệ `/settings`, campaign approve/schedule, source-of-truth mutation, knowledge reload, admin endpoints, demo/simulate, manual send/retry/cancel;
- CSRF khi dùng cookie session;
- Secure, HttpOnly, SameSite phù hợp;
- session regeneration sau login;
- login rate limiting;
- audit thao tác quan trọng.

## 10. Production parser/media/channel readiness

Parser:

- production config hỗ trợ provider được phép cho dữ liệu khách thật;
- provider không được hard-code trong business logic;
- production tenant dùng provider không được phép phải fail-fast hoặc readiness-block.

Media:

- real channel + `MEDIA_STORE=none` phải fail hoặc cảnh báo mạnh theo policy;
- có observability cho `mediaError`, ảnh tải thành công/thất bại, storage health.

Channel:

- kiểm chứng E2E: message thật → ingest → DB → parser → rules → auto-confirm/handoff → outbound;
- contract cho Bot message, zca/hybrid, duplicate, reconnect, restart;
- long-poll không được coi là production always-on nếu official webhook là yêu cầu vận hành.

## 11. Golden eval harness

Khi khách cung cấp:

```text
20–30 tin đặt hàng thật
+
đơn đúng tương ứng
```

harness phải đo:

- field accuracy;
- intent accuracy;
- SKU accuracy;
- quantity accuracy;
- dealer accuracy;
- policy resolution;
- total/rules correctness;
- auto-confirm eligibility.

Khi chưa có dataset, readiness phải trả:

```text
GO_LIVE_READY=false
reason=missing_golden_dataset
```

hoặc cơ chế tương đương.

## 12. Readiness UI

`/settings` cần màn “Sẵn sàng vận hành” hoặc tương đương, hiển thị:

- tenant loaded;
- current price period;
- dealers configured;
- groups mapped;
- parser production provider;
- media storage;
- channel connected;
- auth enabled;
- golden dataset evaluated;
- campaign data;
- blocked VAT policy;
- blocked COD/ship rules;
- blocked promotion rules.

Checklist không được bịa dữ liệu khách; mục thiếu phải là missing/blocked rõ ràng.

## 13. Kế hoạch triển khai (lập lại từ as-built, 12/08/2026)

> Thứ tự cũ (P2.1 → P2.2 → P4 → P3 → parser → auth → readiness) **đã bỏ**. Lý do: audit 12/08/2026
> cho thấy phần lớn code của P2/P3/P4/parser-context/auth **đã tồn tại và đã wire vào runtime**;
> việc còn lại không phải "xây mới theo phase" mà là **trả baseline về xanh + nối dây + trung thực hóa**.
> Trạng thái từng năng lực nằm ở `tong-quan.md`, không nằm ở đây.

Dependency thực tế:

```text
A. Baseline xanh ─┬─→ B. Bịt lỗ phân quyền ─┬─→ E. Nối năng lực còn hở ─→ G. E2E + go-live
                  ├─→ C. Trung thực vùng tiền ┘
                  └─→ D. Readiness/eval ──────┘
                      F. Trung tính hóa base (song song, không chặn)
```

### Đợt A — Trả baseline về xanh (chặn mọi việc khác)

`typecheck`, `lint`, `build` đang **đỏ**. Không đợt nào sau được bắt đầu khi baseline còn đỏ.

**G1-01 ✅ XONG — Sửa 3 lỗi type của campaign (chặn `typecheck` + `build`)**
- *Mục tiêu:* `pnpm typecheck` và `pnpm build` xanh.
- *Current state:* `campaign-occurrence.ts:35,38` TS2339 — đọc `startDate`/`rrule` trên union `recurring | lunar_*` mà **chưa narrow** theo `type`. `campaign.service.spec.ts:18` TS2741 — fixture policy thiếu `features` sau khi schema tenant thêm `features.lunarCalendarEnabled`.
- *Files:* `apps/api/src/campaigns/campaign-occurrence.ts` · `apps/api/src/campaigns/campaign.service.spec.ts`
- *Dependency:* không.
- *Acceptance:* `pnpm typecheck` + `pnpm build` exit 0; narrow bằng discriminant `type`, **không** dùng `as`/`any` để dập lỗi.

**G1-02 ✅ XONG — Sửa lỗi lint `env.ts`**
- *Current state:* `packages/shared/src/env.ts:175` khai báo `authDisabled` rồi không dùng — sót lại khi cổng `DATA_CLASSIFICATION=customer` được viết lại.
- *Acceptance:* `pnpm lint` exit 0; nếu biến này lẽ ra phải chặn điều gì thì bổ sung kiểm tra chứ không xóa suông.

**G1-03 ✅ XONG — Sửa 7 test `apps/web` hỏng do vòng lấy CSRF**
- *Current state:* `lib/auth.ts` `authFetch()` gọi `GET /auth/csrf` **trước** mỗi mutation. 3 file test cũ mock `fetch` một lượt nên (a) assertion "lời gọi thứ 1" trỏ nhầm sang `/auth/csrf`, (b) lượt sau nhận `undefined` → `readJson` ném `Cannot read properties of undefined (reading 'text')`.
- *Files:* `apps/web/lib/auth.ts` · `lib/settings.test.ts` · `lib/api.test.ts` · `lib/master-data.test.ts`
- *Acceptance:* 43/43 test web xanh; test khẳng định **có** gọi `/auth/csrf` và mutation gửi kèm token; không giảm assertion, không xóa test cũ.

**G1-04 ✅ XONG — Sửa 2 test `group-mapping.service.spec.ts`**
- *Current state:* `setHidden()` nay ghi kèm `mappingHistory: { create: … }` trong cùng `prisma.group.update`. Hai test cũ assert `args.data` **deep-equal** `{ status: 'ignored' }` / `{ status: 'mapped' }` nên vỡ. Hành vi mới đúng (audit trail append-only), test cũ lạc hậu.
- *Acceptance:* test API xanh; assert **cả** `status` **và** bản ghi `GroupMappingHistory` với `previousStatus`/`nextStatus` đúng.
- *Migration:* không (model đã có trong `20260812154500_master_data_management`).

### Đợt B — Bịt lỗ phân quyền trước khi chạm dữ liệu thật

**G1-05 ✅ XONG — RBAC cho các controller còn hở**
- *Current state:* `@Roles` đã áp cho campaign · content · master-data · users · broadcast. **Còn hở:** `settings.controller.ts` (ghi nguồn sự thật, công tắc `AUTO_SEND`, map nhóm), `orders.controller.ts` (gửi/reject/rerun thủ công), `knowledge.controller.ts` (reload), `demo.controller.ts` (simulate), `zalo.controller.ts` (đăng nhập kênh, allowlist), `group-participants.controller.ts` — đúng những bề mặt §9 bắt buộc phải có vai.
- *Dependency:* G1-01…G1-04.
- *Acceptance:* mỗi endpoint mutation có `@Roles` khớp §9; `health`/`auth` giữ `@Public`; `/stream` được quyết định rõ ràng chứ không để mặc định; test: đúng vai → 2xx, sai vai → 403, chưa đăng nhập → 401.

### Đợt C — Trung thực hóa vùng tiền

**G1-06 ✅ XONG — Gỡ số provisional VAT/COD/ship khỏi bề mặt cấu hình**
- *Mục tiêu:* UI không hứa điều engine không làm.
- *Current state:* `priceOrder()` **đã fail-closed đúng** (ship/COD/VAT ép 0 kèm warning ⇒ luôn handoff; `computeShipping()` ném lỗi và không còn call-site thật). **Nhưng** `RulesSettings.tsx` vẫn cho nhập `shipFeeNoiThanh` 30.000 · `shipFeeTinh` 40.000 · `vatRate` 0,1 · `codFee` 20.000 · `freeShipMinQuantity` 2 rồi draft → preview → **activate**, và `DEFAULT_RULES_CONFIG` vẫn giữ các số đó. Engine **bỏ qua toàn bộ** (chỉ dùng `totalMismatchTolerance`) ⇒ người vận hành có thể tin đã cấu hình xong phí COD trong khi hệ thống vẫn tính 0.
- *Files:* `apps/api/src/rules/config.ts` · `apps/web/components/settings/RulesSettings.tsx` · `packages/shared/src/settings.ts` · `apps/api/src/rule-config/rule-config.defaults.ts`
- *Acceptance:* các trường thuộc 4 nghiệp vụ BLOCKED hiển thị **"chưa mở — chờ quyết định nghiệp vụ"** và không activate được thành số production; `DEFAULT_RULES_CONFIG` không còn số tiền đoán; hành vi `priceOrder()` **không đổi**.
- *Lưu ý:* task này **không** mở VAT/COD/ship — vẫn BLOCKED theo §4.

### Đợt D — Readiness và golden eval (nối phần đang mồ côi)

**G1-07 ✅ XONG — Nối `readiness/` vào runtime + màn "Sẵn sàng vận hành" (§12)**
- *Current state:* `apps/api/src/readiness/operational-readiness.ts` + `golden-eval-report.ts` có code **và có test**, nhưng **không file nào import** — module mồ côi, không controller, không tab UI. Readiness đang thực sự chạy chỉ gồm (a) cổng boot `DATA_CLASSIFICATION=customer` trong `packages/shared/src/env.ts` và (b) `businessBlockers` từ `tenant.json` qua `settings-query.service.ts`.
- *Dependency:* G1-05.
- *Acceptance:* endpoint readiness trả đủ mục §12; tab `/settings` hiển thị; mục thiếu hiện `missing`/`blocked` rõ ràng, **không bịa dữ liệu khách**.

**G1-08 ✅ XONG — Nối golden eval vào readiness (§11)**
- *Current state:* harness đo field/intent/SKU/quantity/dealer đã có thật tại `tools/poc-parser/src/eval-core.ts` (+ `eval-report.ts`, có test); phía API `readiness/golden-eval-report.ts` trả `missing_golden_dataset` nhưng mồ côi như trên.
- *Acceptance:* chưa có dataset → `GO_LIVE_READY=false, reason=missing_golden_dataset`; có dataset → hiện số đo. Không chặn code-complete.

### Đợt E — Nối các năng lực còn hở

**G1-09 ✅ XONG — reply/quote cho kênh Bot Platform + giữ tham chiếu bền**
- *Current state:* `ConversationContextBuilder` đúng chuẩn (giới hạn 6 tin/4.000 ký tự, khóa theo `externalChatId`, quote phải cùng nhóm) và `validateContextualParse` fail-safe (tin hiện tại không nhắc SKU và không suy ra được đúng 1 SKU từ quote/tin liền trước → `intent=khac`, **không** auto-confirm). `zca-message.ts` map `quote → replyTo`; **`bot-poller.ts` không map reply**. `replyTo` chỉ nằm trong `Message.raw` (JSON), không có cột riêng và `StoredMessage` không đọc lại.
- *Acceptance:* tin reply qua Bot Platform dựng được context như zca; rerun tin cũ vẫn khôi phục được quote; test ambiguous vẫn handoff.

**G1-10 ✅ XONG (phần code) — Đường nhập bảng giá kỳ mới, kiểm chứng đầu-cuối**
- *Current state:* fail-closed đã đúng và đã wire (`selectCurrentSnapshotPrices` chỉ nhận **đúng tháng hiện tại + `active`**, không fallback); `PricePeriodsSettings` có thật và có đường vào UI (lồng trong `SourceTruthSettings`). **Hệ quả hôm nay:** seed là kỳ `2026-07` còn tháng hiện tại là `2026-08` ⇒ **không có giá nào active** ⇒ mọi đơn đều `needs_edit`/handoff, kể cả đơn ≤50.
- *Acceptance:* Sale tạo được kỳ `2026-08` (mới hoặc copy kỳ cũ thành draft) → sửa giá → preview → activate → pipeline thấy ngay sau `reload()`; test đầu-cuối chứng minh đơn mẫu chuyển từ handoff sang auto-confirm **chỉ sau khi** kỳ mới active. Không seed sẵn số tháng 8.
- *External data cần sau:* **A6 — bảng giá tháng 08/2026 thật** (Drive chỉ có T7).

**G1-11 ✅ XONG (đã có sẵn, chỉ kiểm chứng) — Agent bán hàng: gửi ảnh/catalog theo năng lực kênh (§7)**
- *Current state:* `ContentService.productAdvice()` đã nối vào `AgentOrchestrator` và fail-safe (thiếu content approved → handoff); `channel-capabilities` đã có.
- *Acceptance:* ảnh gửi được khi kênh hỗ trợ; video/PDF/catalog gửi **link** (Bot Platform `sendVideo`/`sendFile` trả 404 — đã đo 11/08); không adapter nào giả vờ hỗ trợ.

### Đợt F — Trung tính hóa base (song song, không chặn)

**G1-12 ✅ XONG — Bỏ danh tính nhà cung cấp ERP khỏi nhân**
- *Current state:* vi phạm còn lại duy nhất so với `nen-tang-da-khach.md`: `app.module.ts` bind cứng `{ provide: ErpPort, useClass: KiotVietMockAdapter }`; route `@Controller('kiotviet')`; cột `Order.kiotVietCode`. Tên khách khác chỉ còn trong **comment**, không có nhánh `if tenant === …` nào trong mã nguồn.
- *Acceptance:* adapter ERP chọn theo config runtime; route/cột đổi tên trung tính (giữ tương thích ngược cho route cũ nếu app web còn dùng); migration đổi tên cột forward-safe.
- *Ghi chú:* đây là phần B3 còn treo của đợt nền tảng đa khách.

### Đợt G — E2E và go-live

**G1-13 ✅ XONG phần code-complete · ⛔ phần chạy thật vẫn CHẶN NGOÀI — E2E kênh Zalo (§10)**
- *Đã làm:* `apps/api/src/e2e/zalo-order-path.e2e.spec.ts` chạy trên **đồ thị DI thật**
  (`AppModule.forRoot()` + `NestFactory.createApplicationContext`), chỉ thay **một** biên giới là
  mạng của Zalo (`setMessageHandler`/`isGroupAllowed`/`sendMessage` ghi đè trên chính thể hiện
  `ZaloUserClient` trong container, nên `ZcaAdapter` đi qua cùng transport giả). Phủ: đơn ≤ ngưỡng
  → `sent` + handoff Sale + nhãn tự động · vượt ngưỡng → không gửi · nhóm chưa map → tin vẫn vào DB
  (I1) · trùng trong tiến trình · **khởi động lại** (guard rỗng ⇒ kho tin bền vững là cổng chống
  trùng duy nhất) · **nối lại kênh** (Zalo phát lại tin cũ không nhân đôi đơn).
- *Đã đo có răng:* tắt cổng `saved.duplicate` trong `PipelineService.intake` làm đúng hai bài
  restart/reconnect đỏ, rồi hoàn nguyên.
- *Còn chặn ngoài, KHÔNG code được:* đăng nhập tài khoản Zalo thật — cần **D16** (văn bản chấp nhận
  rủi ro ToS) + **D20** (ai đứng tên tài khoản phụ) + credential. Xem
  [van-hanh/checklist-go-live.md §3](../van-hanh/checklist-go-live.md).

**G1-14 ✅ XONG — Checklist go-live + cập nhật trạng thái**
- *Đã làm:* [van-hanh/checklist-go-live.md](../van-hanh/checklist-go-live.md) — 9 cổng máy tự chấm
  (đối chiếu `operational-readiness.ts`), 2 công tắc khóa có chủ ý (`CHANNEL_MODE=mock`,
  `AUTH_MODE=none` do `render-secrets.sh` ép), 5 chặn pháp lý, 4 nghiệp vụ fail-closed, trình tự bật
  8 bước và đường rollback. Trạng thái hôm nay chốt ở `tong-quan.md`, không nằm ở đây.

### Không nằm trong kế hoạch này

4 nghiệp vụ BLOCKED (§4) giữ nguyên fail-closed. Không task nào ở trên được mở VAT, COD/ship, công nợ 7 ngày hay khuyến mãi.

## 14. Quy tắc thực thi từng slice

Trước mỗi slice:

1. search code;
2. xác định call-sites;
3. đọc schema hiện tại;
4. viết RED test;
5. implement tối thiểu;
6. refactor;
7. chạy test liên quan;
8. chạy full suite phù hợp;
9. commit nhỏ.

Không xóa test cũ để làm test xanh. Không giảm assertion. Migration Prisma phải forward-safe và giữ dữ liệu cũ.

## 15. Định nghĩa hoàn thành

### Code complete

Chỉ gọi GĐ1 code-complete khi các năng lực sau có code/test/migration/UI/readiness tương ứng:

```text
P1 auto-confirm
P2 price freshness
P2 retail advice
P4 FAQ/content/media/catalog
P4 import/settings
P3 campaign domain
P3 scheduler
P3 campaign UI
parser context/reply
auth/roles
production parser readiness
media production readiness
golden eval harness
Zalo E2E path hoặc external blocker rõ ràng
```

Bốn nghiệp vụ blocked không làm code-complete thất bại nếu hệ thống fail-closed và hiển thị thiếu cấu hình.

### Go-live ready

Go-live ready là trạng thái tenant cụ thể đã đủ:

- dữ liệu giá hiện hành;
- dealer/deal/group mapping;
- approved FAQ/content nếu dùng;
- campaign data nếu bật campaign;
- users/roles;
- production secrets;
- parser credential/DPA;
- media storage;
- channel runtime;
- golden dataset + eval đạt ngưỡng;
- domain/backup/monitoring/runbook.

Thiếu dữ liệu khách không được bịa; phải hiện rõ trong readiness.

---

## 16. Đối chiếu ba nguồn: Drive ↔ docs ↔ code (12/08/2026)

> Drive là **nguồn nhập dữ liệu**, không phải runtime source-of-truth. Mục này chỉ ghi nhận
> khớp/lệch; không tự quyết nghiệp vụ.

### 16.1 Phạm vi đã đối chiếu được

⚠️ **Không truy cập được Drive qua connector.** Folder `1XF_hh3gAHq-ZTeFoUlcpwrESDApN6BXZ` trả
`Requested entity was not found` với tài khoản đang kết nối. Đối chiếu dưới đây dựa trên **bản
sao cục bộ trong repo** tại `docs/khach-hang/ultty/nguon-goc/ho-so-khao-sat/` — **24 file / 10 thư
mục**, trong khi `tong-quan.md` ghi Drive có **825 file / 122 thư mục**. ⇒ Bản sao chỉ là **một
phần nhỏ** của Drive; các nhánh chưa đối chiếu được: FAQ dạng DOCX, ảnh/video sản phẩm, catalog,
EUS/Felix, dữ liệu CSKH.

### 16.2 Khớp — Drive xác nhận code đang đúng

| Hạng mục | Drive | Code |
|---|---|---|
| Bảng giá 4 cột | `Thông báo giá tháng 7.2026.pdf`: Giá niêm yết · Giá bán lẻ · **Giá bán lẻ tối thiểu** · Đơn giá CTV | `Price.listPrice/retailPrice/minRetailPrice/wholesale` — khớp 1-1 |
| Giá ELNI | 4.150.000 / 3.850.000 / 3.100.000 / 2.150.000 | `knowledge.json` khớp **đúng từng số** |
| Số SKU | 19 sản phẩm trong bảng giá T7 | seed 19 SKU |
| Tư vấn giá lẻ | cột "Giá bán lẻ tối thiểu" là dữ liệu thật | `retailAdvice.priceField = minRetailPrice` — có căn cứ |
| Ngưỡng 50 | BG Aug 2026: "Đơn từ 50 sản phẩm trở xuống thì AI tự xử lý; trên 50 thì báo Sale" | `orderAutomation.maxAutoConfirmQuantity = 50`, inclusive |
| Công nợ 30/45 | PO: "thanh toán trong vòng 30 ngày kể từ ngày nhận hàng" / "45 ngày kể từ ngày nhận hàng" | nhãn `POLICY_LABELS` ghi đúng "từ ngày nhận hàng" |
| Viết tắt | `Viết tắt_.docx` 4 nhóm | glossary 24 mục |
| Lịch CSKH | mùng 1/rằm · sinh nhật · lễ tết · theo mùa | `CampaignKind`: `one_off/recurring/birthday/lunar_month_start/lunar_full_moon` |
| Vai người dùng | "Phân quyền (Sale/Kế toán/Quản lý)" | `UserRole = SALE/MANAGER/ACCOUNTING/ADMIN` |

### 16.3 Lệch — cần khách quyết, KHÔNG tự đoán

| # | Drive nói | Code/docs hiện tại | Đề xuất xử lý |
|---|---|---|---|
| X1 | **PO ký gửi:** "Cuối tháng hai bên đối soát số lượng tiêu thụ thực tế & Bên mua **thanh toán trong vòng 7 ngày kể từ ngày xuất hóa đơn**" | D15/BLOCKED-3 ghi "chưa rõ công nợ 7 ngày là policy riêng hay điều khoản của policy khác" | Chứng cứ Drive nghiêng hẳn về **điều khoản thanh toán của `ky_gui`**, không phải `PolicyType` riêng. **Vẫn giữ BLOCKED** theo chỉ đạo; dùng trích dẫn này để khách xác nhận D15 rồi mới mở |
| X2 | **BG Aug 2026:** "Tự động áp chính sách ship (**miễn phí nếu mua từ 2 sản phẩm**, báo phí nếu mua 1 sản phẩm)" | BLOCKED-2; `freeShipMinQuantity: 2` nằm trong config nhưng engine **bỏ qua** | Ngưỡng 2 **có nguồn**; **số tiền cước vẫn không có nguồn** (A3). Giữ BLOCKED cho tới khi có biểu cước |
| X3 | **PO 30/45 ngày:** "Trách nhiệm vận chuyển: **Miễn phí giao hàng**" | rules luôn cảnh báo TH2 thiếu cấu hình ship | Với đơn PO đại lý B2B có thể ship = 0 hợp lệ; cần khách xác nhận phạm vi áp dụng |
| X4 | **BG Aug 2026:** "Báo giá theo đúng bảng giá và **cấp khách hàng (khách lẻ, khách buôn, đại lý)**" | giá đơn hàng chỉ `DealerPriceOverride > Price.wholesale`; `CustomerRank` **không** đổi đơn giá | Hợp đồng hứa giá theo cấp khách. Cần chốt: cấp khách ánh xạ sang cột giá nào |
| X5 | **BG Aug 2026:** "Áp giá theo cấp đại lý, chọn chính sách, **tính VAT**, sinh đơn hàng" | BLOCKED-1, VAT luôn `false` | Hợp đồng đã hứa tính VAT ⇒ D8 là **cam kết đang treo**, không phải nice-to-have |
| X6 | **BG Aug 2026:** liệt kê **5 agent** (Điều phối · Bán hàng · Xử lý đơn hàng · CSKH · Giám sát) | `CLAUDE.md` + `packages/shared/src/agents.ts` dùng **6 vai** | Lệch tài liệu, không lệch hành vi. Cần thống nhất một con số khi bàn giao |
| X7 | **QT đặt hàng / QT Preorder:** BPKD lên đơn KiotViet → **BP KSNB kiểm tra & duyệt** → *rồi mới* gửi khách xác nhận (2 cổng KSNB) | GĐ1 auto-confirm gửi khách **trước**, KiotViet nhập sau, **không có cổng KSNB** | Đây là **đảo thứ tự quy trình gốc**, đã được D4 chấp thuận có chủ đích. Ghi rõ khi bàn giao để KSNB không bị bỏ quên |
| X8 | **BG Aug 2026:** "dữ liệu đại lý/khách hàng **lưu trong lãnh thổ Việt Nam**"; căn cứ **NĐ 13/2023** | Pilot chạy GCP `asia-southeast1` (**Singapore**); repo đã cập nhật căn cứ sang **Luật 91/2025 + NĐ 356/2025** | Hai lệch: (a) cam kết cư trú dữ liệu VN **chưa đúng thực tế** ⇒ liên quan D22/D27; (b) báo giá trích **văn bản đã hết hiệu lực** ⇒ nên sửa bản báo giá |
| X9 | `Tên và mã sản phẩm.xlsx` có **39 dòng** (SP + phụ kiện/màng lọc/pin/nước lau) và mã KiotViet thật (`SP251149`, `8716`, `V08`…) | seed 19 SKU, **không** mang mã KiotViet | Khớp ghi nhận A1. Cần mapping SKU ↔ mã hàng hóa trước khi mở phase ERP |

### 16.4 Chưa đối chiếu được (thiếu quyền Drive)

FAQ · ảnh/video sản phẩm · catalog · company profile · EUS/Felix · dữ liệu CSKH thật · bảng giá
tháng 8. Cần một trong hai: cấp quyền Drive cho tài khoản connector, hoặc khách export bộ này để
nhập qua `/settings` (P4 importer đã có `ContentSourcePort` + adapter Drive).
