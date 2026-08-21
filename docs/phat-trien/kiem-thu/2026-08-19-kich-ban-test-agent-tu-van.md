# Kịch bản test — agent tư vấn & chốt đơn nhiều lượt

> Lập 19/08/2026 (nghiệm thu 5 pha). **Viết lại 21/08/2026** sau Pha 6: agent tư vấn có công cụ + mạch chốt đơn nhiều lượt.
> Nguồn trạng thái: [tong-quan.md](../ke-hoach/tong-quan.md). Thủ tục bật pilot: [checklist-go-live.md](../van-hanh/checklist-go-live.md).

---

## 0. Đọc trước — hai công tắc quyết định bạn nhìn thấy gì

Bản 19/08 của tài liệu này ghi một cảnh báo mà **hoá ra chính là nguyên nhân gốc** của phản ánh "hỏi mấy câu về V08 mà AI trả lời y hệt nhau":

> ⚠️ `render-secrets.sh` không render `ANTHROPIC_API_KEY` và không đặt `ADVICE_COMPOSER`.

Đo trực tiếp trên container đang chạy ngày 21/08 — không suy từ file cấu hình:

| Công tắc | `zalo-ultty` (pilot) | `zalo-ultty-gd1-test` |
|---|---|---|
| `ADVICE_COMPOSER` | *(rỗng)* → **Noop** | *(rỗng)* → **Noop** |
| `ANTHROPIC_API_KEY` | *(không đặt)* | *(không đặt)* |
| Nội dung `active` | FAQ **99** · advice 3 · ảnh 102 | FAQ **1**/95 · còn lại `draft` |
| `AUTO_SEND` | `on` | `off` |
| `CHANNEL_MODE` | `zca` | `zca` |
| `PARSER_MODE` | `deepseek` | `deepseek` |
| `PERSISTENCE` | `prisma` | `prisma` |

**Hai đường dẫn tới cùng một triệu chứng**, và cả hai đều nghĩa là *câu trả lời chưa từng đi qua LLM* — nên nó tất định, và giống hệt nhau là điều phải xảy ra chứ không phải điều lạ:

1. **Composer tắt** (cả hai stack): `AdvisorAgent` là `Noop`, câu trả lời = `body.join('\n')` = **dán nguyên văn FAQ** của sản phẩm. Hỏi 10 câu khác nhau về V08 → 10 lần cùng một khối chữ.
2. **Nội dung chưa duyệt** (gd1-test trước 21/08): `productAdvice()` chỉ đọc `active`; chưa duyệt thì `safeHandoff()` trả về **một chuỗi hard-code** — *"Thông tin đã duyệt chưa đủ để trả lời chính xác…"* — cho mọi câu hỏi.

**Đừng chấm nhóm A/B khi hai công tắc này chưa bật.** Bạn sẽ đo bản tra bảng, không phải đo agent.

### Kiểm hai công tắc trước khi test — 30 giây

```bash
S=ultty-gd1-test   # hoặc: S=ultty
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet \
  --command "docker exec \$(docker ps -q -f name=zalo-$S-api) sh -c 'echo ADVICE_COMPOSER=\$ADVICE_COMPOSER; echo ANTHROPIC=\${ANTHROPIC_API_KEY:+set}'"
```

Phải thấy `ADVICE_COMPOSER=claude` **hoặc** `deepseek`, và khoá tương ứng có đặt. Rỗng = agent tắt, dừng lại.

> **Trên `gd1-test`, agent tư vấn chạy `deepseek`** (21/08/2026). Không phải lựa chọn về chất lượng
> mà về hoàn cảnh: khoá Anthropic đang báo `credit balance is too low`, và stack này có
> `DATA_CLASSIFICATION=test` + chỉ nhóm/dữ liệu TEST nên nằm đúng phạm vi CLAUDE.md cho phép dùng
> DeepSeek. **Stack chạy dữ liệu khách thật phải là `claude`** — hoặc bổ sung DeepSeek vào thoả
> thuận xử lý dữ liệu trước khi bật.

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet \
  --command "docker exec \$(docker ps -q -f name=zalo-$S-postgres) sh -lc 'psql -U \$POSTGRES_USER -d zalo -tAc \"select status, count(*) from \\\"FAQ\\\" group by 1\"'"
```

Phải thấy phần lớn ở `active`.

### Duyệt nội dung khi lên stack mới

Nội dung nạp từ gói tenant vào ở **`draft`** (có chủ ý — không ai nạp một manifest rồi tự động phát nội dung đó cho khách). Duyệt bằng lệnh vận hành **rõ ràng**, chạy trong container:

```bash
cd /srv/netviet/apps/zalo-<slug> && sudo docker compose --env-file .runtime/secrets.env \
  -f compose.yaml exec -T -e KINDS=faq,advice,link,image api \
  node /app/deploy/netviet/approve-tenant-content.mjs
```

Đảo ngược: `-e TARGET_STATUS=reviewed`. Sau khi duyệt phải restart `api` (hoặc `POST /settings/content/reload`) để nạp lại cache.

> Đã chạy trên `zalo-ultty-gd1-test` ngày 21/08/2026: FAQ 94 · advice 3 · link 4 · ảnh 102 lên `active`.

---

## 1. Ba đường chạy

| Đường | Cách | Dùng khi |
|---|---|---|
| **A. Local** (đầy đủ nhất) | `pnpm dev:api` + `POST /demo/simulate` | Đo được cả nhóm H (caching) nếu đặt `PARSER_MODE=claude` |
| **B. Console pilot** | Màn "Trung tâm điều hành" → ô nhập tin demo | Nghiệm thu trên đúng cấu hình đang chạy |
| **C. Nhóm Zalo thật** | Kênh đã ở `zca`; cần tài khoản phụ + văn bản chấp nhận rủi ro theo [checklist-go-live](../van-hanh/checklist-go-live.md) | Nghiệm thu nhóm G. **Chỉ ở đây mới thấy bot tự gửi** |

Đường A và B bơm tin qua **cùng một pipeline**:

```bash
curl -s -X POST http://localhost:3001/demo/simulate -H 'content-type: application/json' -d '{"text":"v08 hut duoc san go k","chatId":"2508572440887686813"}'
```

`chatId` hợp lệ trong gói Ultty: `2508572440887686813` (Meta HN, chi nhánh HN) · `3787434804745256898` (Đại lý Thái Nguyên, chi nhánh TN). Quyền: `SALE`/`MANAGER`/`ADMIN`.

> **`/demo/simulate` không có `senderExternalId`** ⇒ **không tạo mạch hội thoại** (khoá mạch là `(chatId, senderExternalId)`). Nhóm D và E vì thế **phải** chạy trên nhóm Zalo thật, hoặc bằng test tự động `pipeline-conversation.spec.ts`. Đừng kết luận "mạch hỏng" khi mới chỉ thử qua `/demo/simulate`.

---

## 2. Nhóm A — agent tư vấn có công cụ *(viết mới 21/08)*

Điều cần chứng minh không phải "có trả lời" mà là **câu trả lời được sinh ra**, tức nó thay đổi theo câu hỏi.

Gửi **tuần tự** về cùng một sản phẩm (V08 — máy hút bụi, 14 FAQ thật trong gói):

| # | Tin khách | Kỳ vọng |
|---|---|---|
| A1 | `v08 bao nhieu tien` | Báo giá V08. Con số **phải khớp** bảng giá hiện hành |
| A2 | `v08 dung nhu nao` | Nói về **cách dùng**, không lặp lại câu A1 |
| A3 | `v08 hut duoc san go k` | Trả lời **đúng câu hỏi sàn gỗ** |
| A4 | `pin dung duoc bao lau` | Hiểu vẫn đang nói V08 (không hỏi lại "sản phẩm nào") |
| A5 | `bao hanh may thang` | Trả lời bảo hành V08 |

**Chấm nhóm A — hai điều kiện, thiếu một là trượt:**

1. **A1…A5 phải là năm câu trả lời KHÁC nhau.** Giống nhau ⇒ agent đang tắt hoặc rơi về bản tra bảng — quay lại §0.
2. **Không câu nào chứa con số tiền mà công cụ không trả về.** Xem log:

```
[advisor] cong cu=tra_cuu_san_pham,bao_gia handoff=false
```

Dòng `cong cu=` liệt kê đúng công cụ LLM đã gọi. **`cong cu=khong` mà câu trả lời vẫn có giá = lỗi nghiêm trọng**, phải báo ngay.

Chặn hậu kiểm để lại dấu vết riêng khi nó bắt được LLM bịa số:

```
Ban soan chua con so khong co trong ket qua cong cu (990.000đ) — bo ban soan.
```

Thấy dòng này: hệ thống đã **làm đúng** (bỏ bản soạn, khách nhận bản tra bảng). Đếm số lần xuất hiện = tỉ lệ LLM định bịa số.

### 2.1 Đo nhanh bằng eval thật (không cần Zalo)

Bốn câu hỏi ở trên chạy được ngay trên máy, gọi API thật, in ra bốn câu trả lời để so:

```bash
cd apps/api && RUN_LLM_TESTS=1 ADVICE_COMPOSER=deepseek DEEPSEEK_API_KEY=<khoá>   pnpm exec vitest run src/advisor/live-check.spec.ts
```

Mặc định **skip** (không tính phí API trong CI), cùng khuôn với `deepseek-eval.spec.ts`. Test tự
`expect` bốn câu trả lời **khác nhau** — đó chính là điều kiện nhóm A.

Đo ngày 21/08/2026 với `deepseek-v4-flash`:

| Câu hỏi | Công cụ đã gọi | Kết quả |
|---|---|---|
| `v08 bao nhieu tien` | `tra_cuu_san_pham`, `bao_gia` | Báo **4.900.000đ/chiếc** kèm ghi chú giá sỉ CTV/đại lý |
| `v08 dung nhu nao` | `tra_cuu_san_pham`, `tra_cuu_tai_lieu` | Liệt kê 6 tính năng/đầu phụ kiện từ FAQ đã duyệt |
| `v08 hut duoc san go k` | `tra_cuu_san_pham`, `tra_cuu_tai_lieu` | Trả lời từ FAQ đã duyệt |
| `bao hanh may thang` | *(không gọi)* | Hỏi lại khách đang nói về sản phẩm nào — **đúng**, vì không có ngữ cảnh |

Con số `4.900.000đ` đến từ công cụ `bao_gia` (rules engine đọc bảng giá), **không phải** mô hình tự
nghĩ ra — và chặn hậu kiểm sẽ bỏ bản soạn nếu nó tự nghĩ ra.

### 2.2 Sáu công cụ và khi nào chúng phải được gọi

| Công cụ | Phải xuất hiện khi |
|---|---|
| `tra_cuu_san_pham` | Bất kỳ câu nào nhắc tên/viết tắt sản phẩm |
| `tra_cuu_tai_lieu` | Hỏi công năng, cách dùng, bảo hành, thông số |
| `bao_gia` | Hỏi giá. **Nguồn DUY NHẤT được phép nói con số tiền** |
| `tinh_don` | Hỏi "tổng bao nhiêu", hoặc trước khi chốt đơn |
| `tra_cuu_chinh_sach` | Hỏi công nợ / ký gửi / hạn thanh toán |
| `lich_su_don` | Hỏi về đơn đã đặt, tình trạng giao |

---

## 3. Nhóm B — ca âm tính *(quan trọng hơn nhóm A)*

Trả lời sai chủ đề tệ hơn im lặng. Các ca này **phải** chuyển Sale, không được bịa:

| # | Tin khách | Kỳ vọng |
|---|---|---|
| B1 | `con bb grey nay cs bn w b` | ⛔ chuyển Sale — BB-GREY **không có** FAQ về công suất |
| B2 | `bb grey nha co tre nho xai an toan k` | ⛔ chuyển Sale — không có FAQ an toàn trẻ nhỏ |
| B3 | `bb grey bat uvc diet khuan cho nao` | ⛔ chuyển Sale — BB dùng Plasmacluster, không có UVC |
| B4 | `shop oi` | ⛔ không kéo FAQ nào |
| B5 | `xin gia b b` | ⛔ chuyển Sale — SKU không xác định được |

Với agent có công cụ, đường chuyển Sale đi qua dấu `[CHUYEN_SALE]` do LLM tự đặt; hệ thống **bóc dấu này khỏi văn bản gửi khách** và bật `handoff`. Kiểm:

```
[advisor] cong cu=tra_cuu_san_pham,tra_cuu_tai_lieu handoff=true
```

**Bẫy chấm điểm:** `tra_cuu_tai_lieu` trả `tai_lieu: []` kèm `ghi_chu` nói rõ *"KHÔNG được tự trả lời từ kiến thức chung"*. Nếu LLM vẫn viết ra thông số kỹ thuật ⇒ **trượt cả nhóm B**, kể cả khi thông số đó tình cờ đúng.

Log retrieval trượt vẫn giữ nguyên, mỗi lần một dòng:

```
FAQ truot: "con bb grey nay cs bn w b" — 21 FAQ ung vien cua BB-GREY, khong cau nao khop.
```

---

## 4. Nhóm C — bot nhớ được cuộc trò chuyện

Gửi **tuần tự trong cùng một `chatId`**, không reset giữa chừng:

| # | Tin khách | Kỳ vọng |
|---|---|---|
| C1 | `bb grey bao nhieu tien` | Báo giá BB-GREY |
| C2 | `the con elni thi sao` | Hiểu là hỏi giá **ELNI**, không hỏi lại "sản phẩm nào?" |
| C3 | `lay 2 cai do` | Hiểu "cái đó" = ELNI ở lượt trước |

Ba dấu hiệu chạy đúng:

1. Bot **không lặp lại** nguyên văn câu nó vừa nói.
2. Lịch sử đưa vào LLM có nhãn `[BOT]` — không chỉ tin của khách.
3. Chạy lại (`POST /demo/rerun/:id`) cho ra **cùng một prompt** (mốc lấy từ `message.sentAt`, không lấy đồng hồ máy chủ).

```sql
SELECT "senderRole", "direction", left(text, 40) FROM "Message"
WHERE "chatId" = '2508572440887686813' ORDER BY "sentAt" DESC LIMIT 10;
```

Phải thấy **cả** `senderRole='bot'` lẫn `'customer'`. Chỉ thấy `customer` = tin outbound không được lưu, mạch hỏng từ gốc.

---

## 5. Nhóm D — hỏi lại và chốt đơn nhiều lượt *(MỚI 21/08)*

Đây là tính năng chính của Pha 6. **Chạy trên nhóm Zalo thật** (xem cảnh báo ở §1).

| # | Tin khách | Kỳ vọng |
|---|---|---|
| D1 | `gui ghe felix ve TN cho c` | Bot **hỏi lại**: *"…mình lấy bao nhiêu Ghế nâng an toàn trẻ em EUS Felix ạ?"* — có **trích dẫn** tin của khách, gọi **đúng tên** khách |
| D2 | `20` | Gộp vào đơn đang dở → tính tiền → **gửi xác nhận** 20 × Ghế Felix |
| D3 | *(mạch mới)* `cho a lay 5 cai` | Bot hỏi lại **sản phẩm nào**, không hỏi số lượng |
| D4 | `gui khach c Lan 0912345678, 2 ghe felix, thu ho` | TH2 thiếu địa chỉ → hỏi lại người nhận. Đơn **vẫn** giữ Sale (cước/COD chưa cấu hình) |
| D5 | Ba tin thiếu dữ liệu liên tiếp | Hỏi tối đa **2 lần** rồi **chuyển Sale**, không hỏi mãi |

Ba bất biến phải giữ ở mọi ca:

- **Không tự tạo đơn 1 chiếc.** `gui ghe felix` mà không có số lượng ⇒ `priced` phải là `null`, `draftGaps.askable = ["quantity"]`. Nếu thấy một đơn 1 chiếc được gửi ⇒ lỗi nghiêm trọng, dừng test.
- **Đơn thiếu dữ kiện không được ở `pending_review`** — ở trạng thái đó nó đủ điều kiện auto-send.
- **Mạch hết hạn sau 45 phút.** Trả lời "20" sau một tiếng phải mở mạch **mới**, không được chốt đơn cũ.

Kiểm trạng thái mạch trong DB:

```sql
SELECT "senderExternalId", status, "askCount", "awaitingSlots", "lastQuestion",
       "draft"->'items' AS items, "expiresAt"
FROM "ConversationThread" WHERE "chatId" = '<chatId>' ORDER BY "updatedAt" DESC;
```

Trên console, mỗi tin mang thêm `conversation.status` (`collecting` · `awaiting_answer` · `closed` · `handed_off`) và `draftGaps`.

> **`AUTO_SEND=off` tắt luôn đường hỏi lại.** Câu hỏi tự động cũng là tin tự động — nó chịu chung công tắc với bản xác nhận. Trên `gd1-test` (`AUTO_SEND=off`) bạn vẫn thấy `pendingDraft` + `draftGaps` + `conversation` trên console, nhưng **không tin nào ra nhóm**. Muốn nghiệm thu D1-D5 đầu-cuối thì phải bật `AUTO_SEND` — đó là quyết định vận hành, xem [ci-cd.md §8](../van-hanh/ci-cd.md).

---

## 6. Nhóm E — nhiều khách hỏi cùng lúc *(MỚI 21/08)*

Nhóm Zalo của Ultty có 200-350 đại lý cùng nhắn. Đây là ca dễ hỏng nhất và khó phát hiện nhất.

Cần **hai tài khoản Zalo khác nhau** trong cùng một nhóm.

| # | Thao tác | Kỳ vọng |
|---|---|---|
| E1 | Khách **A**: `gui ghe felix ve TN cho c` | Bot hỏi A, trích dẫn tin của **A**, gọi tên **A** |
| E2 | Khách **B**: `cho a lay noi chien nhe` | Bot hỏi B **riêng**, trích dẫn tin của **B** |
| E3 | Khách **A**: `20` | Đơn của A = **20 ghế Felix**. Không dính nồi chiên |
| E4 | Khách **B**: `3` | Đơn của B = **3 nồi chiên**. Không dính ghế Felix |
| E5 | Khách **C**: `chao shop` | Không mở mạch, không đóng mạch của A hay B |

**Vì sao ca này quan trọng:** lịch sử hội thoại đưa cho LLM là của **cả nhóm**, nên khi A gõ "20" thì tin liền trước trong transcript có thể là của B. Chốt chặn tất định: *một câu trả lời không nhắc tên sản phẩm thì không được mang tên sản phẩm nào từ transcript vào* — nó chỉ được điền vào dòng đang dở **của chính người đó**.

Ca này đã khoá bằng test tự động (`pipeline-conversation.spec.ts`), nhưng vẫn phải chạy tay một lần trên Zalo thật: thứ tự tin đến trong nhóm đông người không giống thứ tự trong test.

---

## 7. Nhóm F — đơn hàng và ngưỡng tự gửi

Ngưỡng tenant Ultty: `maxAutoConfirmQuantity = 50`, **inclusive**. Giá sỉ: FELIX `1.250.000` · ELNI `2.150.000` · BB-GREY `6.250.000`.

| # | Tin khách | Kỳ vọng |
|---|---|---|
| F1 | `HN_21.8_Meta HN, 10 x Ghế Felix — 1.250k, Tổng: 12.500.000đ` | Hợp lệ → tự gửi xác nhận; sinh việc Sale nhập KiotViet |
| F2 | `50 x Ghe Felix cho Meta HN` | Đúng ngưỡng → **vẫn tự gửi** |
| F3 | `51 x Ghe Felix cho Meta HN` | Vượt ngưỡng → **giữ Sale duyệt** |
| F4 | `gui 10 ghe felix ve TN cho c, ko lay VAT` | Nhóm TN → đại lý Thái Nguyên, `cong_no_45`, không VAT |
| F5 | `3 noi chien va 2 quat bb grey` | Đơn nhiều dòng, tổng do **rules engine** tính |

Bất biến ở mọi ca: **số lượng do LLM trích xuất, đơn giá và tổng do rules engine tính**. Số khách tự ghi khác kết quả rules ⇒ lấy rules, và đơn phải bị giữ lại.

Với đơn **đã đủ dữ kiện**, bản xác nhận đi đường **tất định** — agent tư vấn không được viết lại nó. Bản xác nhận là một chứng từ, không phải một câu trò chuyện.

---

## 8. Nhóm G — reply đúng tin

| # | Thao tác | Kỳ vọng |
|---|---|---|
| G1 | Reply vào một tin cũ rồi hỏi tiếp | Bot trả lời có **trích dẫn** đúng tin đó |
| G2 | Gửi tin thường (không reply) | Bot gửi chuỗi thuần như cũ |
| G3 | Tư vấn **có ảnh** (BB-GREY có media) | Trích dẫn vẫn còn |
| G4 | **Câu hỏi lại** của nhóm D | Cũng phải trích dẫn tin của khách |

G3 là ca dễ bỏ sót: lỗi cũ chỉ xuất hiện ở đường `sendContent` (bản tư vấn có ảnh/link), không xuất hiện ở `sendMessage` thuần.

G4 mới từ Pha 6: trong nhóm 200 người, một câu hỏi không trích dẫn là một câu không biết hỏi ai.

---

## 9. Nhóm H — prompt caching *(chỉ khi `PARSER_MODE=claude` hoặc agent tư vấn bật)*

Gửi **2 tin liên tiếp** vào 2 nhóm khác nhau rồi đọc log:

```
[cache] doc=0 ghi=3412 vao=3598 ra=142     <- tin 1: ghi cache
[cache] doc=3412 ghi=0 vao=3600 ra=138     <- tin 2: ĐỌC lại cache
```

`doc > 0` từ tin thứ hai = cache hoạt động. `doc=0` mãi = phần biến động đã chen lên trước phần tĩnh.

Agent tư vấn dùng **cùng khuôn**: phần tĩnh (vai trò, ràng buộc, hướng dẫn dùng công cụ) đánh dấu `cache_control`, phần biến động (danh tính khách, lịch sử, đơn nháp) nằm **sau** điểm cắt. Đã khoá bằng test: phần tĩnh của hai nhóm khác nhau phải **giống hệt** (`a === b`).

---

## 10. Bảng chấm

| Nhóm | Số ca | Đạt khi |
|---|---|---|
| A — agent có công cụ | 5 | 5 câu trả lời **khác nhau** + không con số tiền nào ngoài công cụ |
| B — âm tính | 5 | **5/5** — một ca bịa là trượt cả nhóm |
| C — nhớ hội thoại | 3 | 3/3, và DB có `senderRole='bot'` |
| D — hỏi lại & chốt đơn | 5 | 5/5, và **không đơn 1 chiếc nào** được gửi |
| E — nhiều khách cùng lúc | 5 | **5/5** — một lần trộn dữ liệu là trượt cả nhóm |
| F — đơn hàng | 5 | 5/5, tổng tiền khớp rules |
| G — reply đúng tin | 4 | 4/4 |
| H — caching | 1 | `doc > 0` |

**Nhóm B và E nặng nhất.** B: nới recall mà mất precision là đi lùi, vì tư vấn sai đi thẳng tới khách. E: trộn đơn của hai khách trong một nhóm là lỗi mà khách sẽ phát hiện trước khi mình phát hiện.

---

## 11. Test tự động tương ứng

Kịch bản này là lớp nghiệm thu **thủ công**. Lớp tự động đã khoá sẵn các bất biến trên:

```bash
pnpm lint && pnpm typecheck && pnpm test && node --test deploy/netviet/caddy-route-contract.test.mjs
```

| Nhóm | File test |
|---|---|
| A | `apps/api/src/advisor/advisor-agent.spec.ts` (9 ca — vòng lặp công cụ, cache breakpoint) · `live-check.spec.ts` (eval thật, mặc định skip) |
| A, B | `apps/api/src/advisor/money-guard.spec.ts` (7 ca) · `content/faq-ranking.spec.ts` (12 ca) |
| C | `apps/api/src/messages/` — conversation context + outbound recorder |
| D | `apps/api/src/conversations/` (21 ca) · `pipeline/pipeline-conversation.spec.ts` (5 ca) |
| E | `apps/api/src/pipeline/pipeline-conversation.spec.ts` — hai khách trong một nhóm |
| F | `apps/api/src/pipeline/order-auto-confirmation.spec.ts` |
| G | `apps/api/src/channels/reply-quote.spec.ts` |
| H | `apps/api/src/pipeline/prompt-caching.spec.ts` · `advisor-agent.spec.ts` |

Mốc xanh 21/08/2026: api **819 pass / 24 skip** · shared 89 · tenant 48 · web 89 · poc-parser 4 · caddy-route-contract 22 · stack-identity 9 · deployment-targets 5 · gd1-test-preflight 23.
