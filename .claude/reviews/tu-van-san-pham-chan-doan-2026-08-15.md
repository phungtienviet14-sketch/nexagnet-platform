# Chẩn đoán: vì sao AI tư vấn sản phẩm "cứng"

**Ngày:** 15/08/2026 · **Nhánh:** `gd1/code-complete` @ `1b1c87c`
**Đối chiếu:** `Luồng AI Agent ULTTY(tài liệu của khách yêu cầu).pdf` (mục 1 — Agent Bán hàng)
**Kết luận:** BLOCK — luồng tư vấn chưa đạt yêu cầu khách, do 4 nguyên nhân độc lập.

---

## TL;DR

Anh đoán 3 nguyên nhân. Cả 3 đều **đúng**, nhưng nguyên nhân gốc nặng hơn anh nghĩ, và có 1 nguyên nhân thứ 4:

| # | Anh đoán | Thực tế trong code |
|---|---|---|
| 1 | "Tư vấn quá cố định, chỉ đọc FAQ" | **Nặng hơn.** Câu trả lời KHÔNG do AI viết. Nó là `SELECT` + `join('\n')`. LLM chỉ được gọi 1 lần duy nhất để phân loại intent — **không bao giờ để soạn câu trả lời**. Kèm 1 bug: không khớp FAQ nào thì đổ **toàn bộ** FAQ của SP đó ra. |
| 2 | "Không có lịch sử chat từng khách" | **Đúng, và thiếu nửa quan trọng hơn.** Lịch sử CÓ được dựng — nhưng **không bao giờ được truyền vào nhánh tư vấn**. Nặng hơn: hệ thống **không lưu tin của chính nó**, nên AI không biết nó đã nói gì với khách. |
| 3 | "Gom tin chỉ gom tin liền" | **Đúng** (≤4 tin, cách nhau ≤5s). Nhưng đây là **triệu chứng, không phải bệnh** — bệnh nằm ở #2. |
| 4 | *(bổ sung sau)* "Không gửi ảnh/video" | **Đúng, và là lỗi lớn nhất về dữ liệu.** Khách đã đưa **682 ảnh + 106 video**. Hệ thống nạp vào **0 ảnh, 4 video**. |

---

## 1. Tư vấn "cứng" — vì câu trả lời không được sinh ra, mà được tra bảng

### Bằng chứng

`apps/api/src/agents/agent-orchestrator.service.ts:306` — nhánh `hoi_san_pham` gọi thẳng:

```ts
const baseAdvice = this.content?.productAdvice(normText, this.knowledge.products())
```

`apps/api/src/content/content.service.ts:61-124` là toàn bộ "bộ não tư vấn":

| Dòng | Việc nó làm | Vấn đề |
|---|---|---|
| 63-68 | Khớp SP bằng `norm.includes(candidate)` | So chuỗi con thuần. `"con nào tiết kiệm điện"` → không khớp SKU nào → handoff |
| 94-99 | Chọn FAQ nếu câu hỏi FAQ **trùng ≥1 từ** (≥3 ký tự) với tin khách | Bag-of-words. `"nhà"` khớp mọi FAQ có chữ "nhà" |
| 101 | `(selectedFaqs.length ? selectedFaqs : faqs)` | **BUG:** không khớp từ nào → lấy **TẤT CẢ** FAQ. BB-GREY có **21 FAQ** → đổ 21 câu trả lời |
| 100-103, 120 | `body.join('\n')` | **Nối nguyên văn.** Không tóm tắt, không chọn lọc, không nối câu |

### Vì sao "chỉ đọc FAQ ra thôi"

Vì nó đúng nghĩa đen là như vậy. `agent-orchestrator.service.ts:437`:

```ts
llmCalls: usedLlm ? 1 : 0,
```

**Đúng 1 lần gọi LLM mỗi tin**, và lần đó là Router (phân loại intent + bóc đơn) tại dòng 151-159. Sau khi Router chạy xong, LLM không còn tham gia. Mọi văn bản trả khách đều là:
- chuỗi hằng trong code (dòng 310, 326, 363, 376, 390, 406, 415), hoặc
- FAQ trong DB nối bằng `\n`.

### Điểm đáng chú ý về kiến trúc

`CLAUDE.md` quyết định #5 viết:

> LLM chỉ phân loại intent + trích xuất + **soạn văn bản**; giá/ship/chính sách/VAT do rules engine TypeScript tính.

Kiến trúc **đã cho phép** LLM soạn văn bản. Code chưa dùng quyền đó. Sửa chỗ này **không vi phạm** nguyên tắc tách LLM/rules — tiền vẫn do rules engine tính.

---

## 2. Lịch sử chat — có dựng, nhưng không tới nơi cần

Có **3 lỗ hổng chồng nhau**.

### (a) Ngữ cảnh không bao giờ được truyền vào phần tư vấn

`agent-orchestrator.service.ts:151-159` — ngữ cảnh được đưa cho parser:

```ts
const rawParseResult = await this.parser.parse({
  ...
  context: opts?.conversationContext,   // ← chỉ tới đây
});
```

`agent-orchestrator.service.ts:172` — nhưng khi dispatch để soạn trả lời:

```ts
const dispatch = this.dispatch(parseResult, resolved, normText, rulesConfig, agentsConfig);
//                             ↑ KHÔNG có conversationContext
```

Chữ ký hàm `dispatch()` (dòng 269-275) **không có tham số ngữ cảnh**. Hệ quả: lịch sử chat chỉ ảnh hưởng **phân loại intent** và **bóc đơn**. Mọi nhánh soạn câu trả lời — tư vấn SP, báo giá, chính sách, bảo hành, vận chuyển — đều **mù ngữ cảnh hoàn toàn**.

### (b) Hệ thống không lưu tin của chính nó

- `apps/api/prisma/schema.prisma` → `model Message` **không có** trường `direction`/`role`.
- `apps/api/src/messages/messages.repository.ts:35` → `save(message: ChannelMessage)` — chỉ tin **vào**.
- `apps/api/src/orders/orders.service.ts:96,124` → gửi xong chỉ `repo.update(id, {status:'sent'})`, **không ghi ngược vào bảng Message**.

⇒ AI **không biết nó đã nói gì với khách**. Không thể "như em đã nói ở trên", không thể tránh lặp, không thể phát hiện mình vừa tự mâu thuẫn. Đây là lý do gốc khiến cuộc hội thoại không "thông minh lên" được.

### (c) Cửa sổ ngữ cảnh nông và dễ rỗng

`apps/api/src/messages/conversation-context.ts`:

- Dòng 15-18: `maxMessages: 6`, `maxCharacters: 4000` — **không có giới hạn thời gian**. Có thể kéo tin từ tuần trước vào làm "gần đây".
- Dòng 92-96: `sameParticipant()` — **chỉ lấy tin của đúng người gửi đó**; thiếu `senderExternalId` → trả rỗng (fail closed).
- Không có hồ sơ khách: không lịch sử mua, không SP đã tư vấn, không nhu cầu đã nêu.

---

## 3. Gom tin — đúng, nhưng đây chỉ là triệu chứng

`apps/api/src/pipeline/pipeline.service.ts:447-457`:

```ts
const gapMs = Math.abs(next.sentAt.getTime() - previous.sentAt.getTime());
return characters <= MAX_BURST_CHARACTERS && gapMs <= Math.max(windowMs * 2, 5_000);
```

Với `MESSAGE_BURST_WINDOW_MS=1200` (mặc định, `packages/shared/src/env.ts:104`):

| Ràng buộc | Giá trị |
|---|---|
| Khoảng cách tối đa giữa 2 tin | **5 giây** |
| Số tin tối đa 1 lượt | **4** (`pipeline.service.ts:47`) |
| Ký tự tối đa | 4.000 |
| Khoá gom | `platform:chatId:sender` |

Khách hỏi → 20 giây sau bổ sung *"à mà nhà em 20m2 thì con nào"* → **2 lượt chạy độc lập**, và lượt 2 không biết gì về lượt 1 vì (a) và (b).

> **Nhận định:** cửa sổ gom tin này vốn được thiết kế để gom **độ trễ gõ phím**, không phải để quản lý **lượt hội thoại**. Bản thân nó không sai. Nới lên 30s cũng **không** chữa được vấn đề — vì nguyên nhân thật là hệ thống không có trạng thái hội thoại.

---

## 4. Ảnh & video — lỗ hổng lớn nhất, nằm ở dữ liệu

Khách mô tả rõ trong PDF (mục 1.1): mỗi SP → **Hình ảnh · Video sản phẩm · Bộ câu hỏi thường gặp**.

### Dữ liệu khách đã đưa vs. dữ liệu hệ thống nạp

`docs/khach-hang/ultty/nguon-goc/ho-so-khao-sat/gd1/AI Zalo_/FAQ bộ sản phẩm_/` — 19 thư mục SP, mỗi thư mục có "Ảnh sản phẩm" / "Video sản phẩm":

| | Khách đưa | Hệ thống nạp |
|---|---|---|
| Ảnh | **682** | **0** |
| Video | **106** | **4 link** (chỉ BB-GREY, BB-ROSE) |
| FAQ | (19 SP) | 95 (5 SKU) |
| Catalog | có thư mục `Catalog ULTTY_` | **0** |
| Profile công ty | — | **0** |

`tenants/ultty/data/content-manifest.json` → `assets: []`. **Không một tấm ảnh nào được đưa vào hệ thống.**

### Kèm 5 lỗi code chặn đường ảnh/video

1. **`content.service.ts:104-109`** — `assets.find(a => a.kind === 'image')`:
   - `.find()` ⇒ **tối đa 1 ảnh**, mãi mãi.
   - lọc `kind === 'image'` ⇒ **asset video không bao giờ được chọn**, dù `ASSET_KINDS` (`packages/shared/src/content.ts:4`) có `'video'`.

2. **`zca.adapter.ts`** — **không override `capabilities`**, nên thừa kế `channel-adapter.ts:9-14` = `{text:true, image:false}`. zca là **kênh chính GĐ1**. ⇒ `orders.service.ts:85-94` hạ cấp ảnh thành dòng chữ `"Ảnh sản phẩm: <url>"`.
   → zca-js **có** hỗ trợ gửi attachment. Đây là **adapter chưa implement**, không phải giới hạn nền tảng.

3. **`packages/shared/src/content.ts:123-128`** — kiểu `ChannelCapabilities` hard-code:
   ```ts
   video: false;   // literal type, không phải boolean
   file: false;
   ```
   ⇒ **hệ thống kiểu cấm vĩnh viễn** việc khai báo kênh hỗ trợ video. Muốn gửi video native phải sửa type trước.

4. **Cổng vòng đời** — manifest nạp vào ở trạng thái `draft` (`tenant-pack-content.bootstrap.ts:28-30`), mà `productAdvice` chỉ đọc `active` (dòng 84-90). Ảnh có thêm vào mà chưa duyệt `draft→reviewed→approved→active` thì vẫn **im lặng biến mất**.

5. **Chưa có đường phục vụ ảnh ra ngoài** — `apps/api/src/media/` là kho **chỉ nhận vào** (tải ảnh Zalo về trước khi link chết). Không có `publicUrl()`/`signedUrl()`. Zalo Bot `sendPhoto` cần URL công khai ⇒ **hiện chưa có cách nào cấp URL đó**.
   > Ràng buộc đã biết: org policy GCP chặn khoá HMAC ⇒ `MEDIA_STORE=s3` không bật được trên pilot.

---

## 5. Đối chiếu PDF khách — mục 1 "Agent Bán hàng"

| Mục PDF | Yêu cầu | Trạng thái |
|---|---|---|
| 1.1 | Kịch bản sale từng SP → Bộ FAQ | ⚠️ Có 95 FAQ, nhưng trả nguyên văn, không phải "kịch bản" |
| 1.1 | Hình ảnh (mỗi SP) | ❌ 0/682 |
| 1.1 | Video sản phẩm (mỗi SP) | ❌ 4 link/106 file, phủ 2/19 SP |
| 1.2 | Catalog chung + riêng từng dòng | ❌ Chưa nạp |
| 1.3 | Profile ULTTY + Dự án tiêu biểu | ❌ Chưa nạp |
| 1.4 | Báo giá theo SP + theo cấp | ✅ Rules engine đã làm |

> **Điểm dễ bỏ sót:** khách viết **"1.1 Kịch bản sale từng sản phẩm"**, rồi mới tới nhánh con "Bộ FAQ sản phẩm". Code đã hiện thực đúng **danh từ con** ("bộ câu hỏi thường gặp") nhưng bỏ mất **ý niệm cha** ("kịch bản sale") — một kịch bản bán hàng hàm ý đối thoại thích ứng, không phải tra cứu.

---

## 6. Hướng sửa

Xếp theo tỷ lệ *hiệu quả / công sức*.

### Ưu tiên 1 — Nạp ảnh/video (dữ liệu, không phải code)

Khách nhìn thấy ngay, công sức thấp nhất.

- Sinh `assets` cho `content-manifest.json` từ 682 ảnh + 106 video (phiên trước đã có script nháp `build-content-manifest.mjs`).
- Bổ sung `MediaStore.publicUrl()` + route phục vụ ảnh. **Cần chốt cách host** vì GCS HMAC bị chặn — GCS signed URL qua `google-auth-library` (đã có sẵn trong deps) là đường ít ma sát nhất.
- Sửa `content.service.ts` chọn **tối đa 3-5 ảnh** thay vì `.find()` 1 tấm.
- Video đi bằng **link** (Bot Platform `sendVideo` trả 404 — đã xác minh 11/08).
- Cần quy trình duyệt hàng loạt `draft→active`, nếu không 682 ảnh phải bấm duyệt tay.

### Ưu tiên 2 — Cho LLM soạn câu trả lời trên nội dung đã duyệt

Giữ nguyên nguyên tắc CLAUDE.md #5: **tiền vẫn do rules engine tính**.

- Thêm 1 lần gọi LLM thứ hai ("Composer") chỉ cho nhánh `hoi_san_pham`, nhận: FAQ/advice đã duyệt (top-k) + lịch sử hội thoại + hồ sơ khách.
- Ràng buộc cứng trong prompt: **chỉ được dùng dữ kiện được cấp**, không bịa thông số, không tự nói giá.
- Giá vẫn lấy từ `buildQuoteLines()` như hiện tại rồi ghép vào.
- Chi phí: +1 LLM call/tin tư vấn. Với 10-20 đơn/ngày là không đáng kể.

### Ưu tiên 3 — Sửa truy hồi FAQ

95 FAQ mà so bag-of-words là quá thô. Không cần vector DB ở quy mô này:
- `fuse.js` (MIT, ~10KB, fuzzy — hợp tiếng Việt không dấu) cho chế độ memory, hoặc
- Postgres `pg_trgm` / full-text search khi `PERSISTENCE=prisma` (Postgres đã có sẵn, không thêm dependency).
- **Sửa ngay bug dòng 101**: không khớp thì phải handoff, **không được** đổ toàn bộ FAQ.

### Ưu tiên 4 — Trí nhớ hội thoại

- Thêm `direction` (`inbound`/`outbound`) vào `model Message` + **ghi lại tin AI đã gửi**.
- Truyền `conversationContext` vào `dispatch()` và xuống các nhánh soạn trả lời.
- Thêm giới hạn thời gian cho `findRecent` (VD: 24-48h) và nới ngoài `sameParticipant` khi ở nhóm.
- Hồ sơ khách cuộn chiếu (SP đã tư vấn, nhu cầu đã nêu) — bảng Postgres đơn giản.

> **Về thư viện memory ngoài** (mem0/Zep/LangChain memory): **không khuyến nghị**. CLAUDE.md giới hạn bên thứ 3 ở KiotViet + Claude; đẩy hội thoại khách sang dịch vụ memory bên ngoài sẽ mở thêm một mặt tuân thủ Luật BVDLCN 91/2025 nữa. Dựng trên Postgres sẵn có là đúng hơn.

### Ưu tiên 5 — Gom tin (làm sau cùng)

Chỉ chỉnh sau khi có #4. Làm trước thì nới cửa sổ chỉ khiến khách chờ lâu hơn mà chất lượng không đổi.

---

## Phụ lục — Bảng tra bằng chứng

| Vấn đề | File:dòng |
|---|---|
| Không có LLM soạn câu trả lời | `agents/agent-orchestrator.service.ts:437` |
| Tư vấn = tra bảng + nối chuỗi | `content/content.service.ts:61-124`, đặc biệt `:120` |
| Bug đổ toàn bộ FAQ | `content/content.service.ts:101` |
| Ngữ cảnh không tới nhánh tư vấn | `agents/agent-orchestrator.service.ts:172` vs `:269-275` |
| Không lưu tin AI gửi | `prisma/schema.prisma` (model Message), `messages/messages.repository.ts:35` |
| Ngữ cảnh nông, không giới hạn thời gian | `messages/conversation-context.ts:15-18, 92-96` |
| Gom tin ≤4 tin / ≤5s | `pipeline/pipeline.service.ts:47-48, 447-457` |
| Chỉ 1 ảnh, bỏ qua video | `content/content.service.ts:104-109` |
| zca không gửi được ảnh | `channels/zca.adapter.ts` (thiếu override) + `channels/channel-adapter.ts:9-14` |
| Type cấm video | `packages/shared/src/content.ts:123-128` |
| Manifest 0 ảnh | `tenants/ultty/data/content-manifest.json` |
| Kho media chỉ nhận vào | `apps/api/src/media/` (không có `publicUrl`) |
