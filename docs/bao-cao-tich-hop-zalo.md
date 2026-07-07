# BÁO CÁO NGHIÊN CỨU: PHƯƠNG ÁN TÍCH HỢP ZALO CHO HỆ THỐNG AI XỬ LÝ ĐƠN HÀNG

**Dự án:** Hệ thống AI xử lý đơn hàng Zalo — Công ty CP U Ultty Việt Nam
**Ngày lập:** 06/07/2026
**Trạng thái:** Bản nghiên cứu — chưa chốt phương án cuối (chờ xác minh với Zalo và quyết định của khách hàng)

---

## 1. Tóm tắt điều hành

Nghiên cứu ban đầu so sánh 2 phương án (Zalo OA chính thức vs thư viện không chính thức `zca-js`). Trong quá trình nghiên cứu, phát hiện **phương án thứ 3: Zalo Bot Platform** — nền tảng bot chính thức của Zalo Platforms ra mắt 2025, **hỗ trợ nhóm chat (Beta)**, có phiên bản miễn phí, tạo bot bằng tài khoản Zalo cá nhân. Đây có thể là lời giải cân bằng giữa tính hợp pháp và chi phí.

| Tiêu chí | 1. Zalo OA + GMF | 2. Zalo Bot Platform | 3. zca-js |
|---|---|---|---|
| Tính chính thức | ✅ Chính thức | ✅ Chính thức (nhóm: Beta) | ❌ Không chính thức, vi phạm ToS |
| Đọc tin nhắn nhóm | ✅ API + Webhook | ✅ Webhook/getUpdates (`chat_type: GROUP` — Beta) | ✅ Listener realtime |
| Giữ nguyên ~200-350 nhóm hiện tại | ❌ Phải tạo nhóm mới toàn bộ | ⚠️ Cần thử nghiệm (thêm bot vào nhóm có sẵn) | ✅ Giữ nguyên |
| Chi phí ước tính | Rất cao (~60-200+ triệu/năm) | Miễn phí / gói trả phí (chưa công bố chi tiết) | 0đ |
| Rủi ro chính | Chi phí + migration | Tính năng nhóm đang Beta, có thể đổi chính sách | Khóa tài khoản, vỡ khi Zalo đổi giao thức |
| SLA / cam kết | Không có SLA rõ, dịch vụ thương mại | "As-is", không bảo đảm | Không có gì |

**Khuyến nghị:** Pilot **Zalo Bot Platform** trước (chính thức + chi phí thấp); giữ `zca-js` làm phương án dự phòng kỹ thuật; xem OA+GMF là đích dài hạn nếu khách chấp nhận chi phí. Chi tiết tại mục 9.

---

## 2. Bối cảnh & yêu cầu tích hợp

Theo hồ sơ khảo sát (file `APP AI_...docx`):

- ~200 nhóm Zalo chăm sóc thường xuyên + 100-150 nhóm thi thoảng; 200-300 đại lý/CTV
- Nhóm nhỏ: CTV 3-8 thành viên, đại lý 6-16 thành viên
- 10-20 đơn/ngày dạng text viết tắt không dấu, <20% ảnh chụp bảng
- Yêu cầu của hệ thống AI: **(a)** đọc được tin nhắn trong nhóm theo thời gian thực, **(b)** gửi lại xác nhận đơn vào nhóm, **(c)** hợp pháp và ổn định để vận hành lâu dài, **(d)** chi phí hợp lý

---

## 3. Phương án 1 — Zalo OA + GMF (nhóm chat Official Account)

### 3.1 Khả năng kỹ thuật (đã xác minh từ tài liệu chính thức)

| Khả năng | Chi tiết |
|---|---|
| Đọc tin nhắn nhóm | `GET https://openapi.zalo.me/v3.0/oa/group/conversation` — trả về nội dung, loại tin (text/photo/voice/sticker/link/location), người gửi (`from_id`, `from_display_name`), `message_id`, timestamp. Cần quyền "quản lý thông tin nhóm" |
| Webhook realtime | Có sự kiện "Tin nhắn được gửi tới nhóm" (mục webhook Nhóm chat - GMF) |
| Gửi tin vào nhóm | 24/24, không giới hạn cửa sổ 48h (khác tin nhắn 1-1); hỗ trợ text, file, mention |
| Tạo nhóm | `POST /v3.0/oa/group/creategroupwithoa` — kèm `asset_id` (gói GMF), tối đa 99 thành viên lúc tạo, ≥1 admin OA |
| Quản lý nhóm | Lấy danh sách nhóm, thông tin nhóm, hạn mức nhóm của OA |

### 3.2 Điểm nghẽn với bài toán U Ultty

1. **Không chuyển đổi được nhóm cá nhân hiện có** → phải tạo mới toàn bộ ~200-350 nhóm dưới OA, mời 200-300 đại lý/CTV join lại (qua link, trưởng nhóm duyệt; mời trực tiếp chỉ được với người đã follow OA).
2. **Chi phí theo từng nhóm** (xem mục 6.1-6.2): gói OA chỉ kèm 1-3 nhóm; mua thêm phí duy trì **25.000-300.000đ/tháng/nhóm**. Ước tính thô với nhóm cỡ nhỏ (GMF-10/50):
   - 200 nhóm × 25-50k ≈ **5-10 triệu đ/tháng** (60-120 triệu/năm)
   - 350 nhóm ≈ **8,75-17,5 triệu đ/tháng** (105-210 triệu/năm)
   - Chưa gồm phí tin nhắn OA gửi vào nhóm mua thêm + phí gói OA (~2,5-6 triệu/năm)
   - ⚠️ Con số cần xác nhận bằng báo giá chính thức từ Zalo (có thể có giá thương lượng số lượng lớn)
3. Nhóm hết hạn gói không gia hạn sẽ **tự giải tán sau 45 ngày** → thêm gánh nặng quản lý vòng đời.

### 3.3 Ưu / nhược

**Ưu:** hợp pháp tuyệt đối; API + webhook chuẩn hóa (rất hợp cho AI parser); không phụ thuộc tài khoản cá nhân; OA xác thực tăng uy tín; đường dài ổn định; có hệ sinh thái (ZNS, mini app, thanh toán).

**Nhược:** chi phí lớn theo số nhóm; dự án migration nặng về vận hành; phụ thuộc gói dịch vụ và chính sách giá thay đổi (vừa đổi 1/6/2026); tên gói trong tài liệu GMF (Nâng cao/Premium) chưa khớp bộ gói mới → cần hỏi Zalo gói mới nào có GMF.

---

## 4. Phương án 2 — Zalo Bot Platform (phát hiện mới, khuyến nghị pilot)

### 4.1 Tổng quan

- Nền tảng bot **chính thức** của Công ty TNHH Zalo Platforms (thuộc VNG), tài liệu tại `bot.zapps.me/docs` (giới thiệu cập nhật 24/7/2025, webhook cập nhật 11/6/2026 — nền tảng mới, đang phát triển tích cực).
- Thiết kế API **giống Telegram Bot API**: bot token, `getUpdates` (long polling — dev) hoặc `setWebhook` (production), `sendMessage`, `sendPhoto`, `sendSticker`, `sendVoice`, `sendChatAction`.
- Endpoint: `https://bot-api.zaloplatforms.com/bot{BOT_TOKEN}/<method>`.
- Tạo bot **rất đơn giản**: tài khoản Zalo cá nhân → chat với OA "Zalo Bot Manager" → app "Zalo Bot Creator" → nhận token (tên bot bắt buộc tiền tố "Bot").
- **Miễn phí có điều kiện**: điều khoản quy định 2 hình thức Free Version và Premium Version (gói trả phí theo chu kỳ, số bot phụ thuộc gói) — chi tiết giá chưa công bố công khai đầy đủ.

### 4.2 Hỗ trợ nhóm chat — điểm quyết định

Tài liệu webhook chính thức xác nhận: `chat.chat_type` nhận giá trị `PRIVATE` hoặc **`GROUP: cuộc hội thoại với nhóm (Beta)`**. Sự kiện nhận được: `message.text.received`, `message.image.received`, `message.sticker.received`, `message.voice.received`, `message.unsupported.received`.

**3 điểm PHẢI thử nghiệm thực tế trước khi chốt** (tài liệu chưa nói rõ):
1. Bot có thêm được vào **nhóm cá nhân có sẵn** không (không cần tạo nhóm mới)? — cộng đồng ghi nhận một số trường hợp bot Marketplace không thêm được vào nhóm, có thể cần xác minh phía Zalo.
2. Bot nhận **tất cả tin nhắn trong nhóm** hay chỉ tin có @mention bot? (tài liệu OpenClaw ghi nhận nhóm cần @mention để kích hoạt — nếu đúng, đại lý phải đổi thói quen: tag bot khi đặt hàng. Có thể chấp nhận được nhưng cần khách đồng ý.)
3. Giới hạn: 1 bot vào được bao nhiêu nhóm? Rate limit? (chưa công bố)

> **✅ KẾT QUẢ PoC THỰC TẾ (07/07/2026 — bot "Bot ultty AI orders", chi tiết [poc-zalo-bot.md](poc-zalo-bot.md)):**
> 1. **Vào nhóm sẵn có: ĐƯỢC** — thêm bot qua "Thêm thành viên" (tìm tên bot) hoặc chia sẻ **link mời của bot** vào nhóm. Bác bỏ lo ngại "bot Marketplace không vào được nhóm" (ít nhất với nhóm này).
> 2. **Chỉ nhận @mention: ĐÚNG** — tin có tag về trọn nội dung; tin thường/ảnh/thoại không tag KHÔNG về. Xác minh đây là **mention-gating GỐC của nền tảng, không tắt được** (OpenClaw docs: *"not configurable per channel", "mention-gated"*; `getMe` không có cờ `can_read_all_group_messages` như Telegram; không có setting nào phía mình). Bot **gửi ngược vào nhóm: ĐƯỢC** (`sendMessage` ok). Khác Telegram (tắt privacy được qua BotFather) — Zalo Beta chưa cho, có thể ở tab "Sắp ra mắt".
> 3. **Giới hạn nhóm/rate limit: chưa test** (mới 1 nhóm).
>
> **Hàm ý:** dùng Bot làm **kênh lai** — đơn text-có-tag bot tự đọc; đơn không tag/ảnh/thoại → Co-pilot. Cần khách đồng ý để đại lý tag bot (mục 10, câu #4).

**Lưu ý:** tin nhắn từ "nhóm đối tượng đặc biệt" (trẻ em, người khuyết tật...) sẽ chỉ nhận sự kiện `message.unsupported.received` thay vì nội dung — tuân thủ luật bảo vệ dữ liệu.

### 4.3 Ưu / nhược

**Ưu:** chính thức — không rủi ro khóa tài khoản; chi phí thấp (free tier); triển khai cực nhanh (API kiểu Telegram, Node.js hỗ trợ chính thức — khớp stack TypeScript của dự án); webhook chuẩn production; không cần OA xác thực hay migration nếu bot vào được nhóm sẵn có.

**Nhược:** tính năng nhóm đang **Beta** — hành vi và chính sách có thể thay đổi; dịch vụ "as-is" không cam kết SLA, trách nhiệm bồi thường của Zalo giới hạn ở mức phí 3 tháng (= 0đ nếu dùng free); giới hạn tin nhắn văn bản 2.000 ký tự, media ~5MB; chưa rõ giá gói Premium; nếu Beta nhóm bị thu hồi thì phải chuyển phương án.

---

## 5. Phương án 3 — zca-js (thư viện không chính thức)

- Repo: [RFS-ADRENO/zca-js](https://github.com/RFS-ADRENO/zca-js) — 540★, 262 forks, MIT, TypeScript 99%, v2.1.2 (3/2026), 19 releases, ~58 issues mở, bảo trì tích cực. Biến thể cùng loại: [openzca](https://github.com/darkamenosa/openzca).
- Cơ chế: **giả lập Zalo Web** trên tài khoản cá nhân (đăng nhập QR) → nghe/gửi tin nhắn cá nhân + nhóm realtime.

**Ưu:** 0đ; giữ nguyên toàn bộ nhóm hiện có; nghe mọi tin nhắn nhóm không cần @mention; Node/TS khớp stack; pilot được trong vài ngày.

**Nhược / rủi ro:**
- README chính thức cảnh báo: *"Using this API could get your account locked or banned"* — vi phạm điều khoản Zalo (xem 6.4). Tài khoản kinh doanh chính bị khóa = mất kênh liên lạc với toàn bộ đại lý → **rủi ro vận hành nghiêm trọng nhất**.
- Dựa trên API nội bộ reverse-engineered: Zalo đổi giao thức là hỏng đột ngột, không ai chịu trách nhiệm.
- Chỉ 1 listener/tài khoản; mở Zalo Web nơi khác là listener rơi; session hết hạn phải quét QR lại.
- Cookie/credential tài khoản nằm trên server tự vận hành — điểm nhạy cảm bảo mật.

**Giảm thiểu nếu buộc phải dùng:** chạy trên **tài khoản phụ chuyên dụng** (không phải số chính của Sale), chế độ **chỉ-đọc** (không gửi tự động), giám sát listener + cảnh báo khi rơi phiên.

---

## 6. CHÍNH SÁCH CỦA ZALO — TRÌNH BÀY CHI TIẾT

### 6.1 Chính sách tính năng Quản lý nhóm GMF (nguồn: oa.zalo.me + developers.zalo.me)

- **Đối tượng:** chỉ OA **xác thực doanh nghiệp** đang dùng Gói Nâng cao hoặc Premium (tên gói cũ — xem 6.2).
- **Hạn mức kèm gói:** Nâng cao = 1 nhóm GMF-100; Premium = 3 nhóm GMF-100. Nhóm kèm gói không mất thêm phí duy trì/phí gửi tin trong thời hạn gói.
- **4 loại nhóm theo quy mô:** GMF-10, GMF-50, GMF-100, GMF-1000 (số = thành viên tối đa). Mua thêm ngoài gói: **phí duy trì 25.000-300.000đ/tháng/nhóm** tùy cỡ + phí tin nhắn OA gửi vào nhóm theo bảng giá.
- **Quy tắc thành viên:** chỉ người dùng Zalo cá nhân được vào nhóm; OA khác không vào được; join qua link nhóm (trưởng/phó nhóm duyệt) hoặc mời trực tiếp qua OA Manager (chỉ mời được người đã quan tâm OA).
- **Tên nhóm:** 1-30 ký tự, tuân thủ chính sách Zalo và pháp luật VN.
- **Vòng đời:** nhóm phải gia hạn trước khi hết hạn; quá hạn **45 ngày** không gia hạn → tự giải tán.
- **Nghĩa vụ dữ liệu:** doanh nghiệp phải có sự đồng ý của người dùng khi thu thập dữ liệu; **cấm chia sẻ tương tác nhóm cho bên thứ ba ngoài nhóm**; **cấm yêu cầu thông tin nhạy cảm** (tài khoản ngân hàng, giấy tờ tùy thân...) trong nhóm.
  - *Hàm ý cho dự án:* đơn TH2 chứa SĐT/địa chỉ khách lẻ — hệ thống phải có cơ chế đồng ý (consent) và bảo mật tương ứng; việc gửi nội dung tin nhắn sang Claude API để parse cần đưa vào chính sách quyền riêng tư thông báo cho thành viên nhóm.

### 6.2 Chính sách gói & giá Zalo OA (thay đổi từ 01/06/2026)

- Cơ cấu gói cũ (Dùng thử ~10k / Nâng cao 99k / Premium 399k mỗi tháng) **được thay bằng 4 gói mới: Basic (0đ), Standard (~1 triệu/năm), Growth (~2,5 triệu/năm), Comprehensive (~6 triệu/năm)** — giá đã gồm VAT 10%, theo trang Zalo Business Solutions.
- Tin tư vấn trong cửa sổ 48h kể từ tương tác cuối của khách: miễn phí; ngoài 48h: ~55-72đ/tin (tùy nguồn, vượt quota gói).
- Gói Comprehensive: API rate limit tới 2.000 req/phút; các gói thấp giới hạn hơn.
- Xu hướng chính sách 2026: siết broadcast/spam, chuẩn hóa tin qua **ZBS Template Message**, khuyến khích tương tác thật và cá nhân hóa.
- ⚠️ **Tài liệu GMF chưa cập nhật theo tên gói mới** → phải hỏi Zalo: gói mới nào được dùng GMF + OpenAPI (nhiều khả năng Growth trở lên).

### 6.3 Điều khoản dịch vụ Zalo Bot Platform (toàn văn tại bot.zapps.me/docs/terms, cập nhật 10/12/2025)

Các điểm trọng yếu với dự án:

- **Chủ thể:** thỏa thuận giữa Nhà phát triển và Công ty TNHH Zalo Platforms; luật áp dụng: Việt Nam; tranh chấp: thương lượng 60 ngày → trọng tài VIAC (TP.HCM, tiếng Việt, 1 trọng tài viên).
- **Mô hình phí:** Free Version + Premium Version (subscription theo tháng/quý/năm, tự động gia hạn, không hoàn tiền giữa chu kỳ); số lượng bot theo gói; phí bổ sung phải được công bố và đồng ý trước khi phát sinh.
- **"As-is":** dịch vụ cung cấp nguyên trạng, **không bảo đảm** tính liên tục/độ tin cậy/hiệu suất; Zalo toàn quyền sửa đổi/ngừng dịch vụ; **trách nhiệm tài chính tối đa của Zalo = phí 3 tháng gần nhất** (= 0đ với free tier).
- **Zalo có quyền tạm ngưng/chấm dứt tài khoản bot không cần báo trước** khi vi phạm điều khoản, nội dung cấm, gian lận, hoặc theo yêu cầu cơ quan nhà nước → *hàm ý: hệ thống phải thiết kế để "mất bot" không làm mất dữ liệu đơn hàng (mọi tin nhắn/đơn lưu về DB riêng ngay khi nhận).*
- **Trách nhiệm của nhà phát triển (rất đáng chú ý với hệ thống AI):**
  - Tự chịu trách nhiệm là "bên triển khai hệ thống trí tuệ nhân tạo" theo pháp luật;
  - **Phải cho Người dùng cuối biết họ đang tương tác với hệ thống tự động**; thông báo có thu thập/xử lý dữ liệu hay không; **gắn nhãn Nội dung tạo sinh theo định dạng máy đọc được**;
  - Chịu toàn bộ trách nhiệm về nội dung bot gửi, kể cả khi dùng dịch vụ AI bên thứ ba (Claude API) — phải có biện pháp kiểm soát và báo cáo sự cố cho Zalo trong 24h;
  - Tuân thủ Luật Bảo vệ dữ liệu cá nhân 2025, Luật Dữ liệu 2024, Luật An ninh mạng, Luật Bảo vệ quyền lợi người tiêu dùng...
- **Hành vi cấm liên quan trực tiếp:** xử lý dữ liệu cá nhân của người dùng **không có sự đồng ý hợp pháp**; dùng bot đưa **quyết định tự động** trong lĩnh vực tín dụng/y tế/pháp lý mà không có chuyên gia xác minh (đơn hàng thương mại + Sale duyệt tay → phù hợp thiết kế hiện tại); dùng nội dung tạo sinh để huấn luyện mô hình cạnh tranh với Zalo.
- **Dữ liệu:** lưu trữ tại máy chủ trong lãnh thổ Việt Nam; có Thỏa thuận Xử lý Dữ liệu (DPA) công khai; quyền chủ thể dữ liệu theo Nghị định 13/2023/NĐ-CP.

### 6.4 Điều khoản người dùng Zalo & tự động hóa trái phép (liên quan zca-js)

- Thỏa thuận sử dụng Zalo (zalo.vn/dieukhoan) và thực thi của Zalo: tài khoản có thể bị **vô hiệu hóa** khi "sử dụng tài khoản bằng các công cụ, phần mềm bên thứ ba không được phát hành bởi Zalo" — đây chính xác là cơ chế hoạt động của zca-js/openzca.
- Thực tế thị trường: các tool "auto chat/auto seeding" giả lập thao tác trên Zalo cá nhân bị phát hiện và **khóa vĩnh viễn**, có trường hợp **ban theo số điện thoại**.
- Kết luận pháp lý-vận hành: dùng zca-js cho tài khoản kinh doanh chính là đặt kênh bán hàng chủ lực của khách vào rủi ro; nếu dùng chỉ nên ở phạm vi pilot, tài khoản phụ, chỉ-đọc, có phương án rút lui.

### 6.5 Nghĩa vụ pháp luật Việt Nam về dữ liệu (áp dụng cho MỌI phương án)

- Tin nhắn đặt hàng chứa **dữ liệu cá nhân** (tên, SĐT, địa chỉ khách lẻ ở đơn TH2) → hệ thống là bên xử lý dữ liệu theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân 2025.
- Yêu cầu tối thiểu cho dự án: cơ chế thông báo/đồng ý với đại lý-CTV (điều khoản tham gia nhóm), mã hóa dữ liệu lưu trữ, giới hạn truy cập, quy trình xóa dữ liệu theo yêu cầu, và cân nhắc điều khoản khi gửi nội dung tin nhắn sang API bên thứ ba (Anthropic) — nên ẩn danh hóa/tối thiểu hóa trường dữ liệu gửi đi khi khả thi.

---

## 7. ZALO AI — TỔNG QUAN VÀ MỨC ĐỘ LIÊN QUAN ĐẾN DỰ ÁN

### 7.1 Zalo AI là gì

"Zalo AI" là cụm sản phẩm AI của VNG/Zalo Group (Zalo AI Lab), gồm:

| Sản phẩm | Mô tả | Hình thức |
|---|---|---|
| **Speech processing** (ai.zalo.cloud) | Text-to-Speech tiếng Việt (nhiều giọng vùng miền), Speech-to-Text | API thương mại |
| **Computer Vision** | OCR, eKYC, nhận diện hình ảnh | API thương mại |
| **Kiki** | Trợ lý giọng nói tiếng Việt (ô tô, loa); Kiki Info tích hợp trong app Zalo trả lời câu hỏi, soạn nội dung | Sản phẩm người dùng cuối |
| **Zalo Chatbot** (chatbot.zalo.me) | Nền tảng chatbot no-code cho OA, kịch bản trả lời tự động chat 1-1 | SaaS cho OA |
| **AI trong app Zalo** | Chuyển giọng nói thành văn bản, gợi ý trả lời, dịch... | Tính năng người dùng |

### 7.2 Zalo AI có liên quan gì đến dự án này?

**Kết luận ngắn: liên quan gián tiếp và ở mức tiện ích bổ sung — KHÔNG thay thế được AI parser của dự án.**

| Dịch vụ Zalo AI | Liên quan | Đánh giá |
|---|---|---|
| **Speech-to-Text** | ⚠️ Có thể hữu ích | Webhook (OA/Bot) trả `voice_url` cho tin nhắn thoại. Nếu đại lý gửi đơn bằng voice, cần STT trước khi parse. Zalo AI STT tối ưu tiếng Việt là 1 lựa chọn; so sánh với Whisper/Gemini/AssemblyAI về giá & độ chính xác ở giai đoạn 2. Khảo sát cho thấy đơn chủ yếu là text → **chưa cần ở giai đoạn 1** |
| **OCR / Vision** | ⚠️ Thấp | <20% đơn là ảnh chụp bảng. Claude API đọc ảnh trực tiếp (vision) trong cùng call parse — không cần OCR riêng. Chỉ cân nhắc nếu chi phí vision của LLM thành vấn đề |
| **Zalo Chatbot (no-code OA)** | ❌ Không phù hợp | Chỉ hoạt động chat 1-1 với OA theo kịch bản; không đọc nhóm, không trích xuất có cấu trúc, không thay được LLM parser |
| **Kiki / AI trong app** | ❌ Không liên quan | Sản phẩm người dùng cuối, không có API cho bài toán này |
| **TTS** | ❌ Không cần | Không có nhu cầu đọc văn bản thành giọng nói |

**Điểm cộng chiến lược:** cả 3 phương án tích hợp đều không xung đột với việc dùng Claude API làm lõi trích xuất. Tuy nhiên lưu ý điều khoản Zalo Bot Platform yêu cầu **công khai với người dùng rằng họ tương tác với hệ thống tự động và gắn nhãn nội dung do AI tạo** — cần đưa vào thiết kế UX của tin xác nhận đơn (ví dụ chữ ký "Tin tự động từ Bot Ultty" trong tin nhắn).

---

## 8. Bảng so sánh tổng hợp

| Tiêu chí | OA + GMF | Zalo Bot Platform | zca-js |
|---|---|---|---|
| Pháp lý / ToS | ✅ Chuẩn | ✅ Chuẩn (nhóm Beta) | ❌ Vi phạm |
| Đọc mọi tin nhắn nhóm | ✅ | ⚠️ Cần thử (@mention?) | ✅ |
| Vào nhóm có sẵn | ❌ Tạo nhóm mới | ⚠️ Cần thử | ✅ |
| Gửi tin vào nhóm | ✅ 24/24 | ✅ (2.000 ký tự/tin) | ✅ |
| Chi phí/năm (ước) | ~60-200+ triệu | 0đ - (gói Premium chưa rõ) | 0đ |
| Công sức migration | Rất lớn | Nhỏ (nếu bot vào được nhóm sẵn) | Không |
| Độ ổn định dài hạn | Cao | Trung bình-cao (Beta) | Thấp |
| Rủi ro lớn nhất | Chi phí + đổi chính sách giá | Beta đổi hành vi/chính sách | Khóa tài khoản, vỡ ngầm |
| Khớp stack TypeScript | ✅ REST | ✅✅ API kiểu Telegram, ví dụ Node.js chính thức | ✅✅ Thư viện TS |

---

## 9. Khuyến nghị & lộ trình

1. **Tuần 1 — PoC Zalo Bot Platform (ưu tiên số 1):** tạo bot thử, trả lời 3 câu hỏi Beta: (a) thêm được vào nhóm cá nhân có sẵn? (b) nhận mọi tin nhắn hay chỉ @mention? (c) 1 bot vào được bao nhiêu nhóm? → Nếu đạt cả 3: chọn làm kênh chính thức, chi phí ≈ 0, hợp pháp.
2. **Nếu Bot Platform chưa đạt** (ví dụ bắt buộc @mention): đánh giá với khách xem có chấp nhận đổi thói quen "tag bot khi đặt hàng" không — đây vẫn là đường chính thức rẻ nhất.
3. **zca-js chỉ làm dự phòng pilot** trên tài khoản phụ, chỉ-đọc, kèm cảnh báo rủi ro bằng văn bản cho khách ký xác nhận.
4. **Song song: xin báo giá GMF chính thức** từ Zalo cho kịch bản 200-350 nhóm nhỏ + hỏi gói mới nào (Standard/Growth/Comprehensive) có GMF và OpenAPI — làm cơ sở cho lộ trình dài hạn nếu khách muốn "chính danh" toàn bộ trên OA.
5. **Kiến trúc bắt buộc:** interface `ZaloAdapter` trừu tượng hóa nguồn tin nhắn (BotPlatformAdapter / OAGmfAdapter / ZcaJsAdapter) — pipeline AI parse không phụ thuộc kênh; mọi tin nhắn lưu về DB ngay khi nhận để "mất kênh" không mất dữ liệu.
6. **Tuân thủ:** thêm vào backlog — thông báo bot tự động trong nhóm, consent thu thập dữ liệu cho đại lý/CTV, gắn nhãn nội dung AI tạo, tối thiểu hóa dữ liệu cá nhân gửi sang LLM API.

## 10. Câu hỏi mở cần chốt

| # | Câu hỏi | Hỏi ai |
|---|---|---|
| 1 | ~~Bot Platform: 3 câu hỏi Beta~~ → **ĐÃ TEST 07/07** (mục 4.2): vào nhóm ✅, chỉ @mention ✅; còn treo: đa nhóm/rate limit | ✅ Xong phần lớn |
| 2 | Giá gói Premium của Bot Platform, giới hạn free tier | Zalo Platforms (cskh@zaloplatforms.com) |
| 3 | Gói OA mới nào có GMF + OpenAPI; báo giá GMF 200-350 nhóm | Zalo sales |
| 4 | ⭐ Khách chấp nhận thói quen @mention bot khi đặt hàng không? **(PoC xác nhận BẮT BUỘC @mention → giờ là điều kiện chặn bật Bot mode)** | U Ultty (chị Phương) |
| 5 | Khách chấp nhận rủi ro zca-js (nếu phải dùng) bằng văn bản? | U Ultty |

## 11. Nguồn tham khảo

**Tài liệu chính thức Zalo:**
- Tổng quan GMF: https://developers.zalo.me/docs/official-account/nhom-chat-gmf/general
- API đọc tin nhắn nhóm: https://developers.zalo.me/docs/official-account/nhom-chat-gmf/quan-ly/group_conversation
- API tạo nhóm: https://developers.zalo.me/docs/official-account/nhom-chat-gmf/quan-ly/create_group
- Điều kiện gửi tin nhóm: https://developers.zalo.me/docs/official-account/nhom-chat-gmf/tin-nhan/condition
- Chính sách GMF: https://oa.zalo.me/home/documents/policy/tinh-nang-quan-ly-nhom
- Hướng dẫn GMF cho OA doanh nghiệp: https://oa.zalo.me/home/documents/guides/quan-ly-nhom-gmf_1954166378348758227
- Bảng giá OA: https://zalo.solutions/oa/pricing
- Zalo Bot Platform — tài liệu: https://bot.zapps.me/docs (create-bot, getUpdates, webhook, terms)
- Zalo AI: https://ai.zalo.cloud · https://chatbot.zalo.me · https://kiki.zalo.ai

**Cộng đồng / bên thứ ba:**
- zca-js: https://github.com/RFS-ADRENO/zca-js · openzca: https://github.com/darkamenosa/openzca
- OpenClaw Zalo channel (ghi nhận hành vi bot trong nhóm): https://docs.openclaw.ai/channels/zalo
- Bảng giá OA 2026 (tổng hợp): https://miniai.vn/bang-gia-zalo-oa-moi-nhat-2026/ · https://v9.com.vn/bang-gia-zalo-oa-2026/
- Nguyên nhân khóa tài khoản Zalo: https://viettelstore.vn/tin-tuc/zalo-bi-vo-hieu-hoa

---
*Báo cáo do Claude tổng hợp từ tài liệu công khai ngày 06/07/2026. Các mức giá cần xác nhận lại bằng báo giá chính thức trước khi đưa vào đề xuất thương mại cho khách hàng.*
