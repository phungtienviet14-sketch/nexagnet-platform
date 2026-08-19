# Kịch bản test — agent tư vấn & chốt đơn (sau kế hoạch 5 pha)

> Lập 19/08/2026, ứng với HEAD `939c56d`. Dùng để **nghiệm thu** 5 pha của kế hoạch 18/08 và hai lỗi vá thêm.
> Nguồn trạng thái: [tong-quan.md §1.-4](../ke-hoach/tong-quan.md). Thủ tục bật pilot: [checklist-go-live.md](../van-hanh/checklist-go-live.md).

---

## 0. Đọc trước — cái gì quan sát được ở đâu

Không phải pha nào cũng thấy được trên stack pilot. Đây là sự thật của **cấu hình đang deploy**, không phải của code:

| Pha | Sống trên pilot? | Vì sao |
|---|---|---|
| 1 — bot nhớ hội thoại | ✅ có | Không phụ thuộc parser hay kênh |
| 2 — prompt caching | ❌ **không chạy** | `cache_control` chỉ nằm trong `ClaudeParser`; pilot chạy `PARSER_MODE=deepseek` |
| 3 — model thành cấu hình | 🟡 một nửa | `DEEPSEEK_MODEL=deepseek-v4-flash` có đặt; `ADVICE_MODEL` vô dụng vì bản soạn đang tắt (xem ⚠️ dưới) |
| 4 — reply đúng tin | 🟡 chỉ khi kênh là zca | `CHANNEL_MODE` đang khoá ở `mock` **có chủ ý** |
| 5 — retrieval FAQ | ✅ có | Thuần rules, không phụ thuộc parser/kênh |

> ⚠️ **`render-secrets.sh` không render `ANTHROPIC_API_KEY` và không đặt `ADVICE_COMPOSER`.** Nên trên pilot `AdviceComposer` là **Noop**: câu trả lời tư vấn là bản **nối nguyên văn FAQ**, không phải câu được soạn lại. Đó chính là hiện tượng "AI trả lời như robot" đã ghi trong khảo sát phiên 2 (nguyên nhân #4) — code đã sửa xong nhưng **cấu hình triển khai chưa bật**. Đây là công tắc vận hành có tác động lớn nhất còn lại; bật nó thêm một bên nhận dữ liệu vào luồng nên phải là quyết định của người vận hành, không phải hệ quả phụ của một lần deploy.

### Điều kiện tiên quyết — FAQ phải ở trạng thái `active`

Nội dung nạp từ gói tenant vào ở trạng thái **`draft`**. `productAdvice` **chỉ đọc `active`**. Chưa duyệt thì **mọi ca test tư vấn đều chuyển Sale** và bạn sẽ tưởng Pha 5 hỏng.

```bash
curl -s https://operator.<IP>.sslip.io/settings/content | jq '.faqs | group_by(.status) | map({status: .[0].status, n: length})'
```

Vòng đời có 4 bậc `draft → reviewed → approved → active`. **Hai đường duyệt hành xử khác nhau — đừng lẫn:**

- **Từng bản ghi** (nút trên `/settings`, `POST /settings/content/:kind/:id`): chỉ đi được **một bậc mỗi lần**, nhảy cóc bị từ chối.
- **Hàng loạt** (`POST /settings/content/:kind/bulk-status`): **tự đi hết các bậc** trong một lần gọi — đặt thẳng `"status": "active"` là đủ. Bản ghi nào hỏng thì bị bỏ qua và liệt kê trong `skipped`, không làm đổ cả mẻ.

```bash
POST /settings/content/faq/bulk-status   {"ids": [...], "status": "active"}
# quyền MANAGER|ADMIN · 5 request/phút · tối đa 500 id mỗi lần
```

---

## 1. Ba đường chạy

| Đường | Cách | Dùng khi |
|---|---|---|
| **A. Local** (đầy đủ nhất) | `pnpm dev:api` + `POST /demo/simulate` | Đo được cả Pha 2 nếu đặt `PARSER_MODE=claude` |
| **B. Console pilot** | Màn "Trung tâm điều hành" → ô nhập tin demo | Nghiệm thu trên đúng cấu hình đang chạy |
| **C. Nhóm Zalo thật** | Cần `CHANNEL_MODE=zca` + tài khoản phụ + văn bản chấp nhận rủi ro | **Chỉ** sau khi làm đủ [checklist-go-live](../van-hanh/checklist-go-live.md) |

Đường A và B bơm tin qua **cùng một pipeline**:

```bash
curl -s -X POST http://localhost:3001/demo/simulate -H 'content-type: application/json' -d '{"text":"bb grey ve sinh mang loc ntn","chatId":"2508572440887686813"}'
```

`chatId` hợp lệ trong gói Ultty: `2508572440887686813` (Meta HN, chi nhánh HN) · `3787434804745256898` (Đại lý Thái Nguyên, chi nhánh TN). Bỏ trống thì lấy nhóm đầu tiên. Quyền: `SALE`/`MANAGER`/`ADMIN`.

---

## 2. Nhóm A — Pha 5: khách viết tắt (điểm mới nhất)

Tất cả dùng BB-GREY (21 FAQ thật trong gói). **Trước Pha 5, năm ca đầu đều chuyển Sale.**

| # | Tin khách | Kỳ vọng | Vì sao |
|---|---|---|---|
| A1 | `bb grey ve sinh mang loc ntn` | FAQ *"…thay màng lọc như thế nào? Bao lâu phải thay? Vệ sinh có khó không?"* | `ntn` → "như thế nào" |
| A2 | `bb grey bao hanh bnhieu lau b` | Đúng **1** FAQ: *"Quạt được bảo hành bao lâu?"* | khớp `hanh` — từ duy nhất trong tập |
| A3 | `bb grey co ion am khu khuan thiet k` | FAQ *"Công nghệ Plasmacluster ion có tác dụng gì?"* | |
| A4 | `bb grey quat k canh co mat sau k e` | FAQ *"Quạt yếu, không mát như quạt có cánh"* | `k` → "không" |
| A5 | `bb grey mau sac the nao` | FAQ *"Màu sắc của quạt lọc không khí BB?"* | |
| A6 | `quat bb grey giao hang toi dau` | **KHÔNG** được kéo FAQ về **giá**. Thực đo: ra FAQ *"Quạt có mùi hăng khét?"* — xem §2.1 | ca chống khớp-chuỗi-con: `gia` nằm trong `giao` |

### 2.1 Giới hạn đã biết — va chạm mặt chữ sau khi bỏ dấu

Bỏ dấu là điều kiện để đọc được tin không dấu của khách, nhưng nó gộp những từ khác nghĩa về cùng một mặt chữ. Ca A6 là ví dụ đo được: `giao hàng` và `mùi hăng` cùng thành `hang`, mà `hang` chỉ xuất hiện đúng **một** lần trong 21 FAQ — nên với mọi thước đo tần suất nó trông cực kỳ đáng tin.

Không bộ lọc thống kê nào gỡ được kiểu va chạm này; chỉ từ điển đồng âm hoặc embedding mới phân biệt được, và đó là việc của vòng RAG `pgvector` ở đợt sau. **Khi test, đừng ghi lỗi cho những ca kiểu này** — ghi lại câu gốc để làm dữ liệu cho vòng sau.

Ba lưới an toàn đang che phần còn lại: rules engine tính tiền (LLM không quyết giá), ngưỡng tự gửi 50, và Sale duyệt mọi đơn vượt ngưỡng.

## 3. Nhóm B — ca âm tính bắt buộc (quan trọng hơn nhóm A)

Trả lời sai chủ đề tệ hơn im lặng. Các ca này **phải** chuyển Sale, không được bịa:

| # | Tin khách | Kỳ vọng | Vì sao |
|---|---|---|---|
| B1 | `con bb grey nay cs bn w b` | ⛔ **chuyển Sale** | BB-GREY **không có** FAQ nào về công suất; `cong` chỉ trùng mặt chữ với "công nghệ" |
| B2 | `bb grey nha co tre nho xai an toan k` | ⛔ **chuyển Sale** | Không có FAQ an toàn trẻ nhỏ |
| B3 | `bb grey bat uvc diet khuan cho nao` | ⛔ chuyển Sale, hoặc tối đa 1 FAQ về **đèn** | BB dùng Plasmacluster, không có UVC |
| B4 | `shop oi` | ⛔ không kéo FAQ nào | chỉ có từ xã giao |
| B5 | `xin gia b b` | ⛔ chuyển Sale, `missing` chứa `identified_product` | SKU không xác định được |

Xác minh bằng log — mỗi lần trượt ghi đúng một dòng:

```
FAQ truot: "con bb grey nay cs bn w b" — 21 FAQ ung vien cua BB-GREY, khong cau nao khop.
```

Đếm dòng này qua một tuần chạy thật = **tỉ lệ FAQ trượt**, con số mà kế hoạch phiên 2 treo lại vì chưa đo được.

## 4. Nhóm C — Pha 1: bot nhớ được cuộc trò chuyện

Gửi **tuần tự trong cùng một `chatId`**, không reset giữa chừng:

| # | Tin khách | Kỳ vọng |
|---|---|---|
| C1 | `bb grey bao nhieu tien` | Báo giá BB-GREY |
| C2 | `the con elni thi sao` | Hiểu là hỏi giá **ELNI**, **không** hỏi lại "anh/chị hỏi sản phẩm nào?" |
| C3 | `lay 2 cai do` | Hiểu "cái đó" = ELNI ở lượt trước |

Ba dấu hiệu Pha 1 chạy đúng:

1. Bot **không lặp lại** nguyên văn câu nó vừa nói.
2. Lịch sử đưa vào LLM có nhãn `[BOT]` — trước đây chỉ có tin của khách.
3. Chạy lại (`POST /demo/rerun/:id`) cho ra **cùng một prompt** — mốc thời gian lấy từ `message.sentAt`, không lấy đồng hồ máy chủ.

Kiểm trực tiếp trong DB:

```sql
SELECT "senderRole", "direction", left(text, 40) FROM "Message"
WHERE "chatId" = '2508572440887686813' ORDER BY "sentAt" DESC LIMIT 10;
```

Phải thấy **cả** `senderRole='bot'` lẫn `'customer'`. Chỉ thấy `customer` nghĩa là tin outbound không được lưu — Pha 1 hỏng.

## 5. Nhóm D — đơn hàng và ngưỡng tự gửi

Ngưỡng tenant Ultty: `maxAutoConfirmQuantity = 50`, **inclusive** — đúng 50 thì gửi. Giá sỉ: FELIX `1.250.000` · ELNI `2.150.000` · BB-GREY `6.250.000`.

| # | Tin khách | Kỳ vọng |
|---|---|---|
| D1 | `HN_19.8_Meta HN, 10 x Ghế Felix — 1.250k, Tổng: 12.500.000đ` | Hợp lệ → **tự gửi xác nhận**; sinh việc Sale nhập KiotViet |
| D2 | `50 x Ghe Felix cho Meta HN` | Đúng ngưỡng → **vẫn tự gửi** |
| D3 | `51 x Ghe Felix cho Meta HN` | Vượt ngưỡng → **giữ Sale duyệt** trước khi gửi |
| D4 | `gui 10 ghe felix ve TN cho c, ko lay VAT` | Nhóm TN → đại lý Thái Nguyên, chính sách `cong_no_45`, không VAT |
| D5 | `3 noi chien va 2 quat bb grey` | Đơn nhiều dòng, tổng do **rules engine** tính |

Bất biến giữ ở mọi ca: **số lượng do LLM trích xuất, đơn giá và tổng do rules engine tính**. Nếu con số khách tự ghi khác kết quả rules thì lấy rules, và đơn phải bị giữ lại.

## 6. Nhóm E — Pha 4: reply đúng tin *(cần `CHANNEL_MODE=zca`)*

| # | Thao tác | Kỳ vọng |
|---|---|---|
| E1 | Trong nhóm Zalo, **reply** vào một tin cũ rồi hỏi tiếp | Bot trả lời có **trích dẫn** đúng tin đó, không phải câu trôi nổi giữa nhóm |
| E2 | Gửi tin thường (không reply) | Bot gửi chuỗi thuần như cũ — đường đang chạy không đổi hành vi |
| E3 | Tư vấn **có ảnh** (BB-GREY có media) | Trích dẫn vẫn còn |

E3 là ca dễ bỏ sót nhất: lỗi cũ chỉ xuất hiện ở đường `sendContent` (bản tư vấn có ảnh/link), không xuất hiện ở đường `sendMessage` thuần — nên nếu chỉ test E1 thì lỗi vẫn lọt. Đã vá ở `939c56d`.

## 7. Nhóm F — Pha 2: prompt caching *(chỉ khi `PARSER_MODE=claude`)*

Gửi **2 tin liên tiếp** vào 2 nhóm khác nhau rồi đọc log:

```
[cache] doc=0 ghi=3412 vao=3598 ra=142     <- tin 1: ghi cache
[cache] doc=3412 ghi=0 vao=3600 ra=138     <- tin 2: ĐỌC lại cache
```

`doc > 0` từ tin thứ hai = cache hoạt động. `doc=0` mãi = phần tĩnh đang bị phần biến động chen lên trước, cache hỏng.

---

## 8. Bảng chấm

| Nhóm | Số ca | Đạt khi |
|---|---|---|
| A — viết tắt | 6 | ≥5/6 trả lời đúng FAQ |
| B — âm tính | 5 | **5/5** — một ca bịa là trượt cả nhóm |
| C — nhớ hội thoại | 3 | 3/3, và DB có `senderRole='bot'` |
| D — đơn hàng | 5 | 5/5, tổng tiền khớp rules |
| E — reply đúng tin | 3 | 3/3 *(bỏ qua nếu kênh là mock)* |
| F — caching | 1 | `doc > 0` *(bỏ qua nếu parser là deepseek)* |

Nhóm B nặng hơn nhóm A: nới recall mà mất precision là đi lùi, vì tư vấn sai đi thẳng tới khách.

---

## 9. Test tự động tương ứng

Kịch bản này là lớp nghiệm thu **thủ công**. Lớp tự động đã khoá sẵn các bất biến trên:

```bash
pnpm lint && pnpm typecheck && pnpm test && node --test deploy/netviet/caddy-route-contract.test.mjs
```

| Nhóm | File test |
|---|---|
| A, B | `apps/api/src/content/faq-ranking.spec.ts` (12 ca) · `content.service.spec.ts` |
| C | `apps/api/src/messages/` — conversation context + outbound recorder |
| D | `apps/api/src/pipeline/order-auto-confirmation.spec.ts` |
| E | `apps/api/src/channels/reply-quote.spec.ts` |
| F | `apps/api/src/pipeline/` — prompt caching |

Mốc xanh 19/08/2026: api **773 pass / 24 skip** · shared 84 · tenant 30 · web 70 · poc-parser 4 · caddy 17.
