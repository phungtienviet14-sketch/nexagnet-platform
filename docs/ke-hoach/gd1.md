# KẾ HOẠCH GIAI ĐOẠN 1 — theo spec của khách

> **Vai trò:** mô tả **phạm vi + thiết kế** GĐ1 đối chiếu tài liệu gốc của khách. **KHÔNG chứa trạng thái** — trạng thái ✅/⬜ nằm ở [tong-quan.md](tong-quan.md).
> **Nguồn spec:** `HỒ SƠ THÔNG TIN KHẢO SÁT KHÁCH HÀNG/gd1/Luồng AI Agent ULTTY(tài liệu của khách yêu cầu).pdf` (mindmap XMind, 3 agent) + `gd1/BG_Ultty_App AI_Netviet_Phuong Aug 2026.docx.md` (báo giá 147tr, 3 tuần, 5 agent).
> Lập: **11/08/2026**. Mốc kết thúc demo: tag `demo/v1.0` = commit `b10e26a`.

---

## 1. GĐ1 không phải phần tiếp theo của demo

Demo trả lời *"AI đọc hiểu được tin đặt hàng không?"* → **Rồi.**
Spec GĐ1 trả lời câu hỏi khác hẳn: *"AI **nói chuyện và gửi tin** thay Sale được không?"*

| | Demo (`demo/v1.0`) | GĐ1 (khách yêu cầu) |
|---|---|---|
| Hướng dữ liệu | **Đọc** → Sale duyệt | **Đọc + GỬI** vào nhóm khách |
| Phạm vi tin | Tin đặt hàng | Tư vấn · FAQ · catalog · báo giá · đơn · giao hàng · chúc mừng · khuyến mãi |
| Nội dung gửi | Text xác nhận đơn | Text + **ảnh + video + catalog** |
| Chủ động | Bị động (chờ tin) | **Chủ động theo lịch** (đầu tháng · mùng 1/rằm · sinh nhật · hàng ngày) |
| Nhóm | Nhóm đại lý | Nhóm đại lý **+ nhóm vận chuyển** (mới) |

⇒ **~60% khối lượng GĐ1 là tính năng chưa từng tồn tại**, không phải sửa cái đang có.

---

## 2. 🟢 KÊNH ZALO — kết luận cũ đã SAI, đo lại 11/08/2026

`tong-quan.md` (05-08/08) ghi *"⛔ KÊNH BOT PLATFORM CHẾT — getUpdates 504 ở đúng ~5,13s, timeout không có tác dụng"*. **Đo lại hôm nay bằng chính token đó: kênh đã sống trở lại.**

| Endpoint | HTTP | Thời gian | Kết quả | Diễn giải |
|---|---|---|---|---|
| `getMe` | 200 | 103ms | `ok:true`, bot id `4055584533866160964`, `account_type: BASIC` | ✅ sống |
| `getUpdates` `timeout:1` | 200 | **1.196ms** | `error_code:408 Request timeout` | ✅ **rảnh = bình thường** |
| `getUpdates` `timeout:5` | 200 | **5.092ms** | `error_code:408` | ✅ |
| `getUpdates` `timeout:20` | 200 | **20.111ms** | `error_code:408` | ✅ |
| `sendMessage` | 200 | 16s→85ms | `error_code:410 The chat_id is invaild` | ✅ **sống** (đã validate chat_id) |
| `sendPhoto` | 200 | 85ms | `error_code:410 The chat_id is invaild` | ✅ **sống** |
| `sendVideo` | 200 | 40ms | `error_code:404 Not Found` | ❌ **API không tồn tại** |
| `sendFile` | 200 | 45ms | `error_code:404 Not Found` | ❌ **API không tồn tại** |

**Bằng chứng quyết định:** `getUpdates` **tôn trọng đúng tham số `timeout`** (1s→1.196ms · 5s→5.092ms · 20s→20.111ms). Đây là long-poll khỏe mạnh chuẩn sách giáo khoa. Theo chú thích sẵn có trong [zalo-bot.client.ts:3](../../apps/api/src/channels/zalo-bot.client.ts:3), `408` = *rảnh, không có tin mới* — **không phải lỗi**. Sự cố 504 ngày 05/08 là **gián đoạn tạm thời phía Zalo, nay đã hết**.

> ⚠️ Cách kiểm an toàn đã dùng: gọi `sendMessage`/`sendPhoto` với `chat_id` **không tồn tại** (`0000000000000000001`). Endpoint sống trả lỗi có cấu trúc; endpoint chết trả 504 gateway. **Không tin nào tới người thật.**

### Hệ quả kiến trúc

1. **Có kênh chính thức, hợp pháp, chạy được cho cả đọc lẫn gửi.** CHẶN lớn nhất của GĐ1 được gỡ phần lớn.
2. **Ràng buộc cứng còn nguyên: mention-gating.** Trong nhóm, bot **chỉ nhận tin @mention nó** (hành vi gốc Zalo, không tắt được). ⇒ Bot thuần cần **D2** (đại lý đồng ý tag bot khi đặt đơn).
3. **Kiến trúc lai đáng giá nhất:** **zca ĐỌC** (mọi tin, không cần tag) + **Bot Platform GỬI** (chính thức). Rủi ro ToS thu hẹp còn *đường đọc*; mọi tin AI phát ra đều từ bot chính danh. Khung `CHANNEL_MODE=hybrid` + `outbound-channel.router.ts` đã có sẵn.
4. **Media bị chặn kỹ thuật:** spec khách đòi **Video sản phẩm** (1.1.x) và **Catalog** (1.2) — Bot Platform **không có API gửi video/file**. Chỉ gửi được **text + ảnh**. Phương án: gửi link video/catalog, hoặc dùng zca cho media, hoặc host catalog dạng URL.

**Việc phải làm ngay:** chạy lại `getUpdates` trên nhóm test có tin @mention thật để xác nhận tin về đủ; theo dõi vài ngày xem 504 có tái phát không (nếu Zalo còn chập chờn thì cần cơ chế chịu lỗi, không phải đổi kiến trúc).

---

## 3. Đối chiếu spec khách ↔ code as-built

### Agent 1 — Bán hàng · **~85% chưa có**

| Mục spec | Hiện trạng |
|---|---|
| 1.1 Kịch bản sale + FAQ từng SP | ❌ intent `hoi_san_pham` **chỉ phân loại, không trả lời**; không có kho FAQ |
| 1.1.x Hình ảnh + Video từng SP | ❌ Không có kho media. `ChannelAdapter.sendMessage()` chỉ nhận text. Video: **API Zalo không hỗ trợ** (§2) |
| 1.2 Catalog chung / theo dòng | ❌ Không tồn tại. `sendFile` 404 ⇒ phải dùng link |
| 1.3 Profile ULTTY + dự án tiêu biểu | ❌ Không tồn tại |
| 1.4 Báo giá theo cấp Lẻ/Buôn | 🟡 **Dữ liệu đủ 4 bậc giá** (`listPrice`/`retailPrice`/`minRetailPrice`/`wholesale`), intent `hoi_gia` phân loại đúng — **thiếu tầng soạn câu trả lời** |

### Agent 2 — Xử lý đơn hàng · **~60% đã có**

| Mục spec | Hiện trạng |
|---|---|
| 2.1.1 Nhận diện đại lý + SP + SL | ✅ Parser + rules chạy tốt |
| 2.1.1 Ngưỡng ≤50 tự xử lý / >50 báo Sale | 🟡 **Lệch**: code `largeOrderQuantity: 30` + `largeOrderTotal: 20tr` ([agents.config.ts](../../apps/api/src/agents/agents.config.ts)) |
| 2.1.2 Tính tiền theo bảng giá + chính sách | ✅ Rules engine TS tất định |
| 2.1.3 Soạn đơn + **gửi tin xác nhận khách** | 🟡 `confirmationText` ✅ + `AUTO_SEND` ✅ (có gate Giám sát) — đang `off` |
| 2.1.4 Gửi thông báo cho Sale | 🟡 Chỉ SSE trong console; không có push khi Sale không mở app |
| 2.1.5 Sale lên KiotViet **thủ công** | ✅ Đúng hiện trạng ⇒ **GĐ1 KHÔNG cần API KiotViet** (gỡ Phase 4 + C1 khỏi đường găng) |
| 2.2.1 Ship ≥2sp free / 1sp báo cước | 🟡 `freeShipMinQuantity: 2` ✅ khớp; thiếu nhánh "1sp → báo cước Viettel/Aha + câu thoại book vận chuyển" |
| 2.2.2 Năm chính sách thanh toán | 🟡 Enum `PolicyType` đủ 5 ✅ — **dữ liệu map đại lý→chính sách đang sai** (§4) |
| 2.3 Xác nhận giao hàng thành công | ❌ **Không có gì**: không có nhóm vận chuyển, không đọc ảnh vận đơn, không có vòng đời sau `sent` |

### Agent 3 — Chăm sóc khách hàng · **~95% chưa có**

| Mục spec | Hiện trạng |
|---|---|
| 3.1 Thông báo giá đầu mỗi tháng | 🟡 `BroadcastService` gửi hàng loạt được (throttle + trần 50 nhóm) — **Sale bấm tay, không có lịch** |
| 3.2 Chúc mừng mùng 1/rằm · sinh nhật · lễ tết · theo mùa | ❌ Không scheduler, không **lịch âm**, không trường ngày sinh đại lý |
| 3.3 Khuyến mãi 30 tặng 1 / ELNI mua 5 tặng ELNA | ❌ **Rules engine không có mô hình hàng tặng** — mà `Bảng đặt hàng của khách.jpg` chính là bảng *"TÊN HÀNG TẶNG"* ⇒ quà tặng đã có trong đơn thật, hệ thống sẽ tính sai tổng |
| 3.4 Content chăm sóc hàng ngày | ❌ Không có |

### Dashboard (theo báo giá)

| Mục | Hiện trạng |
|---|---|
| Theo dõi hội thoại real-time | ✅ Console SSE |
| Cảnh báo tin nhắn trôi | ❌ |
| Theo dõi đơn AI bóc tách | 🟡 có feed, thiếu phễu/thống kê |
| Thông báo đơn chờ duyệt cho quản lý sale | ❌ |
| Phân quyền Sale/Kế toán/Quản lý | ❌ Phase 5 chưa làm; VM đang `AUTH_MODE=none` |

---

## 4. Điểm chặn còn lại

### CHẶN A — Parser 1-tin không đọc nổi đơn thật 🔴

Bằng chứng từ ảnh tin thật (nhóm **Hope Pham** — đại lý công nợ 30 ngày):

```
Ultty Việt Nam: @Hope Pham Dạ vâng bác đẩy thêm giúp e nha...
   └─ Hope Pham (trả lời trích dẫn): "c thêm 5c nhe"     ← ĐÂY LÀ ĐƠN HÀNG
```

Đơn không có tên SP, không có giá, không có đại lý trong chính tin đó — chỉ giải mã được từ **tin được trích dẫn + lịch sử hội thoại**.

`channelMessageSchema` **không có trường quote/reply**; pipeline **không tra lịch sử** (grep 0 kết quả cho quote/reply/history/context). Đơn kiểu này parser hiện tại chắc chắn ra `khac`. **Đây là cách đại lý đặt hàng bình thường, không phải ca hiếm.**

### CHẶN B — Nguồn sự thật sai lệch so với chính ví dụ của khách 🔴

| Phát hiện | Chi tiết |
|---|---|
| **Giá Felix lệch 100k** | Ví dụ khách: `5 x Ghế Felix — 1150k = 5.750k`. Seed: `FELIX wholesale = 1.250.000` ⇒ hệ thống ra 6.250k, **sai ngay ví dụ mẫu của khách** |
| **Bảng giá cũ 1 tháng** | Seed là bảng giá **T7.2026**; nay là T8 — mà chính agent 3.1 phải gửi bảng giá đầu mỗi tháng |
| **Chính sách Meta mâu thuẫn** | Khách ghi Meta = **Ký gửi 30 ngày**; seed ghi `meta-hn` = `cong_no_30` |
| **Thiếu đại lý** | Khách nêu Phúc Hưng · KNA · Hope Phạm · Komex · Meta. Seed có 3: Meta HN · ĐL Thái Nguyên · CTV Ocean Park — **chỉ Meta trùng** |
| **Thiếu thương hiệu EUS** | Spec 1.4.1 ghi "Giá theo sản phẩm ULTTY / **EUS**". Seed chỉ có 1 SP EUS (Felix) |
| **Không có mô hình hàng tặng** | "30 tặng 1", "ELNI mua 5 tặng ELNA" — rules engine không biết khái niệm quà tặng |

Nguồn sự thật là **động** (sửa qua `/settings`) ⇒ không chặn *build*, nhưng chặn *chạy đúng số*. Tương ứng A2/A3/A4 trong [tong-quan.md §4](tong-quan.md).

### CHẶN C — Pháp lý & LLM 🟠

| # | Vấn đề |
|---|---|
| **D17** | DeepSeek lưu dữ liệu tại TQ, **không ký được DPA** ⇒ dữ liệu khách **bắt buộc** đổi `PARSER_MODE=claude` |
| **D22** | Hồ sơ ĐGTĐXLDL + ĐGTĐCDL (Mẫu 09) — chế tài tới **5% doanh thu năm** |
| **D16/D20** | Văn bản ToS zca + ai đứng tên tài khoản — **giảm mức quan trọng** nếu chọn kiến trúc Bot-gửi/zca-đọc, và **bỏ hẳn** nếu chọn Bot thuần (D2) |
| ⚠️ **Báo giá** | Báo giá GĐ1 còn viện dẫn **NĐ 13/2023** — đã hết hiệu lực, nay là **Luật 91/2025 + NĐ 356/2025**. Nên sửa **trước khi ký** |
| ⚠️ **VM** | `AUTH_MODE=none` + public 80/443: ai biết URL cũng sửa được nguồn sự thật và gọi `/broadcast` |
| ⚠️ **DemoController** | Bơm tin giả vào pipeline **thật**; trên môi trường không auth = ai cũng tạo được đơn giả ⇒ phải gate |

### CHẶN D — Chi phí trong báo giá có thể sai bậc độ lớn 🟠

Báo giá tính 300 nhóm × 5 tin/nhóm/ngày × 30 ngày ≈ 45.000 tin ≈ **1,73tr/tháng**. Hai vấn đề:
1. **D21 chưa đo** — zca đọc **mọi** tin, không phải 5 tin/nhóm/ngày. *(Nếu chọn Bot thuần thì mention-gating tự giới hạn lưu lượng — chi phí sát thực tế hơn nhiều.)*
2. **Đơn giá $0,00135/tin là của model hiện tại.** D17 bắt buộc đổi Claude ⇒ tính lại. GĐ1 còn sinh **văn bản** (tốn output token), không chỉ trích xuất JSON.

---

## 5. Phạm vi chưa rõ — chờ khách chốt

| # | Câu hỏi | Chặn gì |
|---|---|---|
| Q1 | **AI có được tự gửi tin vào nhóm khách?** Spec khách nói CÓ (2.1.3, 2.3.2, 3.x); `CLAUDE.md` QĐ#4 nói GĐ1 KHÔNG | ~40% khối lượng. Cần văn bản đồng ý (D4 + D6) |
| Q2 | **"≤50 sp → AI tự xử lý"** = tự gửi thẳng cho khách, hay soạn rồi Sale bấm? (2.1.4/2.1.5 vẫn có Sale) | Mâu thuẫn nội tại trong tài liệu khách |
| Q3 | Ngưỡng **50** (khách) vs **30 + 20tr** (code) — lấy cái nào? Có cộng dồn theo tiền? | 1 dòng config |
| Q4 | **"Lẻ" là giá nào?** Khách ví dụ `WFX Lẻ 2.350k` = cột `minRetailPrice` (bán lẻ **tối thiểu**), không phải `retailPrice` (2.750k) | AI báo giá sai cho khách lẻ |
| Q5 | **Nhóm vận chuyển Zalo** (2.3.1) là nhóm nào? Ai lập? AI vào được? Aha/Viettel/GHTK có nhóm riêng? | Kênh thứ 2 hoàn toàn mới |
| Q6 | **CSKH gửi cho ai, tần suất nào?** 3.2 cần **ngày sinh từng đại lý** (chưa có trường) + **lịch âm**. 3.4 "spam content hàng ngày" vào 200-350 nhóm ⇒ **rủi ro Zalo khóa rất cao** | Đợt D |
| Q7 | **Mấy agent?** Spec khách = 3 · báo giá = 5 · code = 6 vai | Nghiệm thu |
| Q8 | **Khuyến mãi tính thế nào?** "30 tặng 1" theo từng đơn hay tích lũy tháng? Tặng SKU nào? Cộng vào tổng đơn? | Rules engine |
| Q9 | **3 tuần trong báo giá** — đợt 1 gồm gì? | Cam kết tiến độ |
| Q10 | **EUS** — danh mục + bảng giá riêng hay dùng chung ULTTY? | Nguồn sự thật |
| Q11 | **Đại lý có chấp nhận @mention bot khi đặt đơn (D2)?** — nay là câu hỏi quan trọng nhất vì Bot Platform đã sống: nếu CÓ thì bỏ được zca và toàn bộ rủi ro ToS | Kiến trúc kênh |
| Q12 | **Video + catalog gửi kiểu gì?** Zalo Bot không có API gửi video/file — chấp nhận gửi **link** không? | Agent Bán hàng |

**Tin tốt:** mục 2.1.5 ghi rõ *"Sale kiểm tra tồn + Lên đơn KiotViet (**thủ công**)"* ⇒ **GĐ1 không cần API KiotViet** — gỡ toàn bộ Phase 4 + khoản C1 khỏi đường găng.

---

## 6. Lộ trình đề xuất

| Đợt | Nội dung | Phụ thuộc |
|---|---|---|
| **A — Gỡ chặn** | Xác nhận Bot Platform trên nhóm test thật · chốt kiến trúc kênh (Q11) · đổi `PARSER_MODE=claude` · bảng giá T8 · A2/A4 · bật lại `AUTH_MODE` · gate `DemoController` | Q1, Q11, D17 |
| **B — Nền hội thoại** | Trường quote/reply vào `channelMessageSchema` · ngữ cảnh N tin gần nhất cho parser · ngưỡng 50 · giá "Lẻ" · **mô hình hàng tặng/khuyến mãi** | A · Q2-Q4 · Q8 |
| **C — Agent Bán hàng** | Kho nội dung (FAQ/ảnh/catalog/profile) · `sendPhoto` cho ChannelAdapter · tầng soạn trả lời + duyệt | B · Q12 |
| **D — Agent CSKH** | Scheduler · lịch âm · ngày sinh đại lý · template + duyệt hàng loạt | C · Q6 |
| **E — 2.3 + Dashboard** | Nhóm vận chuyển · xác nhận giao hàng · cảnh báo tin trôi · phân quyền 3 vai | Q5 · D5 |

**Về mốc 3 tuần:** với CHẶN A (parser 1-tin) chưa gỡ, 3 tuần **không đủ cho cả 3 agent**. Đợt A+B khả thi ~3 tuần nếu dữ liệu và quyết định về kịp. Giữ cam kết 3 tuần ⇒ phải cắt phạm vi đợt 1 (Q9).

---

## 7. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Parser sai đơn ngữ cảnh ⇒ Sale mất niềm tin | 🔴 CAO | Đợt B trước Đợt C; cần **B1-B2** (20-30 tin thật + đơn đúng) để đo |
| Zalo lại sập Bot Platform như 05/08 | 🟠 TB | Theo dõi vài ngày; giữ zca + Co-pilot làm fallback; cơ chế chịu lỗi thay vì đổi kiến trúc |
| Tài khoản zca bị khóa khi CSKH gửi hàng ngày | 🟠 TB↓ | **Giảm mạnh nếu gửi qua Bot Platform**; throttle + gửi theo đợt |
| Chi phí LLM vượt 2tr/tháng | 🟠 TB | Đo D21 trên nhóm thật trước khi cam kết |
| Phạt tới 5% doanh thu (D22) | 🟠 TB | Nộp hồ sơ Mẫu 09 trước khi chạy PII thật |
| Tính sai tổng đơn có hàng tặng | 🟠 TB | Mô hình quà tặng ở Đợt B |

---

## 8. Tách demo / GĐ1 trong git

| Việc | Chi tiết |
|---|---|
| **Mốc bất biến** | Tag `demo/v1.0` tại `b10e26a` — demo lại bất kỳ lúc nào |
| **Nhánh `demo/freeze`** | Chỉ nhận hotfix demo, không nhận tính năng GĐ1 |
| **`main` = GĐ1** | Giữ nguyên CI/CD (`deploy.yml` đã gắn `main` + environment `production`) |
| **Tách runtime bằng cờ** | Dùng `CHANNEL_MODE` / `PARSER_MODE` / `AUTH_MODE` / `PERSISTENCE` sẵn có + `.env.demo` / `.env.gd1`; **không fork code** |
| **Gate demo endpoint** | Thêm cờ `DEMO_ENDPOINTS`, mặc định **off** ở GĐ1 — `DemoController` bơm tin giả vào pipeline thật (lỗ hổng bảo mật, không chỉ là dọn dẹp) |
| **Dọn nhánh** | Xóa 11 nhánh remote đã merge |

Hồ sơ khách (`HỒ SƠ THÔNG TIN KHẢO SÁT KHÁCH HÀNG/`) **đang gitignore đúng** vì chứa PII — giữ nguyên.
