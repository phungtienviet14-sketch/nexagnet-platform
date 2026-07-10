# Dự án: Hệ thống AI xử lý đơn hàng Zalo — U Ultty Việt Nam

## Quy tắc chung (bắt buộc)

- Luôn áp dụng skill `search-first` trước khi viết bất kỳ function/module mới nào
- Ưu tiên tìm và dùng thư viện có sẵn (npm) thay vì tự implement
- Rules ECC của project nằm tại `.claude/rules/ecc/` (common, typescript, react, web) — tuân thủ khi viết code

## Bối cảnh dự án

Khách hàng: **Công ty Cổ Phần U Ultty Việt Nam** (gia dụng cao cấp). Liên hệ: Nguyễn Thu Phương (Sale chính).

Hiện trạng vận hành:
- ~200 nhóm Zalo chăm sóc thường xuyên (+100-150 nhóm thi thoảng), 200-300 đại lý/CTV
- 10-20 đơn/ngày, chủ yếu đơn số lượng lớn, chốt qua chat text trên Zalo (<20% là ảnh chụp bảng)
- Quy trình thủ công: chốt Zalo → gõ tay lên KiotViet → chuyển Base xử lý giao vận → ship Aha/Viettel
- **Không có API kết nối** giữa các hệ thống; chưa có IT nội bộ; dữ liệu lưu máy cá nhân + KiotViet

Mục tiêu: AI đọc tin nhắn đặt hàng trên Zalo (viết tắt, không dấu) → trích xuất đơn có cấu trúc → Sale duyệt 1-click → đồng bộ KiotViet/Base. Triển khai theo giai đoạn 1 → 2 → 3, go-live sớm nhất có thể.

Hệ thống tài liệu (đọc theo thứ tự khi cần ngữ cảnh):
1. `APP AI_Công ty Cổ Phần U Ultty Việt Nam_ Phuong Jul 2026.docx` — hồ sơ khảo sát gốc (mẫu PO, SKU, bảng giá, tin nhắn mẫu: link Drive mục 7)
2. `Thiet_ke_AI_Agent_U_Ultty.md` — thiết kế giải pháp NetViet (đề xuất gốc: nghiệp vụ, lộ trình 3 GĐ, KPI — GIỮ NGUYÊN, không sửa file này)
3. [docs/nghiep-vu.md](docs/nghiep-vu.md) — **NGHIỆP VỤ đối chiếu NGUỒN GỐC** (quy trình đặt hàng thật 9 bước + **2 cổng KSNB**, 4 chính sách + điều khoản PO thật, 7 intent, đội 6 agent) kèm **bảng SAI LỆCH nguồn-gốc ↔ code** (VAT-default, phí COD, cước ship đang *tạm tính*) — **đọc trước khi sửa rules engine**
4. [docs/thiet-ke-ky-thuat-hop-nhat.md](docs/thiet-ke-ky-thuat-hop-nhat.md) — **thiết kế triển khai hợp nhất, là quyết định cuối cho phần kỹ thuật**
5. [docs/tien-do-va-ke-hoach.md](docs/tien-do-va-ke-hoach.md) — **TIẾN ĐỘ + KẾ HOẠCH CÒN LẠI** (đang ở đâu, còn gì, dữ liệu thiếu, quyết định treo — đọc trước khi làm tiếp). Plan code gốc: [.claude/plans/ultty-ai-agent.plan.md](.claude/plans/ultty-ai-agent.plan.md)
6. `design/` — 8 ảnh design app của khách (tham khảo UX, PWA 5 tab bám theo)
7. [docs/so-do-he-thong.md](docs/so-do-he-thong.md) — 8 sơ đồ Mermaid **KỸ THUẬT** (bối cảnh, 6 tầng, sequence đơn hàng, state machine, intent, ERD as-built 12 model, lộ trình, chọn kênh `CHANNEL_MODE`) — đã đối chiếu code 10/07/2026
8. [docs/checklist-du-lieu-khach.md](docs/checklist-du-lieu-khach.md) — checklist dữ liệu cần thu thập từ khách (A: nguồn sự thật, B: tin nhắn test, C: truy cập hệ thống, D: quyết định)
9. [docs/poc-zalo-bot.md](docs/poc-zalo-bot.md) — kết quả PoC Bot Platform (bằng chứng mention-gating; chạy theo [tools/poc-zalo-bot/README.md](tools/poc-zalo-bot/README.md)). Eval parser: [docs/poc-parser.md](docs/poc-parser.md)
10. [docs/ke-hoach-dai-han.md](docs/ke-hoach-dai-han.md) — **KẾ HOẠCH DÀI HẠN (định hướng — bản KỸ THUẬT)** — 6 tính năng mới (sửa đơn NL · QR thanh toán · dashboard · ảnh viết tay · công nợ · chống gian lận + gọi nhân viên), lộ trình Đợt 0→4 + cổng quyết định D9-D14; có thể thêm/bớt theo khách
11. `docs/pdf/` — **3 PDF BÀN GIAO CHO LÃNH ĐẠO** (giọng phi kỹ thuật): 01 nghiệp vụ hiện tại · 02 sơ đồ hệ thống bản dễ hiểu · 03 kế hoạch dài hạn. Nguồn HTML regen: `docs/pdf/src/` (mermaid qua CDN — cần mạng; lệnh regen trong README ở đó). Chi tiết kỹ thuật tương ứng nằm ở các .md mục 3/7/10 — **PDF cho sếp/khách, .md cho dev**

> **Đã xóa 10/07/2026** (yêu cầu user — git history còn): `docs/kich-ban-demo-toan-he-thong.md` (không cần kịch bản demo nữa) · `docs/bao-cao-tich-hop-zalo.md` (nghiên cứu kênh đã hết vai trò — quyết định cuối ở [docs/thiet-ke-ky-thuat-hop-nhat.md](docs/thiet-ke-ky-thuat-hop-nhat.md) §3).

## Công nghệ (đã chốt)

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (Node.js 22 LTS) | Một ngôn ngữ cho cả backend + app; monorepo pnpm |
| Backend | NestJS | Module theo 6 tầng NetViet: channels, ingest, pipeline, rules, knowledge, orders, kiotviet, metrics, auth |
| App Sale | **Demo: console PC rộng "Trung tâm điều hành"** (Next.js) — 3 cột: Feed · 6-agent theater **streaming SSE real-time** · Nguồn sự thật (Kho tri thức/KiotViet/Luật đã áp "bám theo tin"). *(Bản PWA mobile-first 5 tab theo `design/` là hướng sản phẩm khi Sale làm trên điện thoại — làm sau.)* | Demo cần màn rộng để khách thấy rõ 6 agent xử lý + nguồn sự thật lúc chạy |
| Database | PostgreSQL + **Prisma 6** (pin, KHÔNG nâng v7 — `@adminjs/prisma` chưa hỗ trợ) | Nguồn sự thật (SKU/giá/chính sách/glossary), đơn hàng, feedback, KPI, audit. **Bật bằng cờ `PERSISTENCE=prisma`** (mặc định `memory` → demo/CI không cần DB; tách khỏi `DATABASE_URL` vì `.env` đã có URL docker) |
| **Nguồn sự thật ĐỘNG** | Panel `/admin` (**AdminJS** auto-CRUD 6 bảng) + **MCP tool** (8 tool, `@modelcontextprotocol/sdk`) | Sale sửa SKU/giá/đại lý/**map nhóm** qua UI; agent sửa qua hội thoại. Cả hai ghi Postgres + gọi `reload()` → pipeline thấy ngay. Panel gated `ADMIN_UI=on`+`PERSISTENCE=prisma`. Thiếu dữ liệu (A2/A3/A4) **không còn chặn build** — nhập dần |
| Queue | BullMQ (Redis) | Pipeline xử lý tin nhắn bất đồng bộ |
| AI | Claude API (tool use) — **1 orchestrator điều phối 6 vai chuyên trách** (Điều phối · Tư vấn SP · Bán hàng · Chính sách-TC · Hậu mãi · Giám sát, theo `Thiet_ke_AI_Agent_U_Ultty.md` §5.1); **1 lần gọi LLM/tin** (Router parse), KHÔNG phải 6 LLM độc lập | Intent (7 loại) + trích xuất ràng buộc; **LLM không tính tiền/không quyết chính sách** — rules engine TS tất định lo phần đó; 6 vai hiển thị qua AgentTrace |
| Kênh Zalo GĐ1 | **zca-js (userbot tài khoản cá nhân) = KÊNH ĐỌC CHÍNH** — đọc MỌI tin trong nhóm, **không cần @mention**. Chuyển kênh bằng **1 biến `CHANNEL_MODE=mock\|bot\|zca`**; mọi kênh qua interface `ChannelAdapter` (Zca/BotPlatform/Mock) + ingest (`ZcaListener`/`BotPoller`). Co-pilot (dán tay) = fallback; Bot Platform = kênh phụ (chỉ @mention). | **Đảo quyết định cũ** (zca-js trước đây bị loại): khách chọn zca làm kênh chính GĐ1. **Điều kiện chặn:** dùng **tài khoản Zalo phụ** (không dùng tài khoản Sale chính) + **văn bản chấp nhận rủi ro của khách** (vi phạm ToS Zalo, có thể bị khóa tài khoản; NĐ13/2023 + Luật BVDLCN 2025). OA+GMF để GĐ2-3 |

**Kết quả PoC Bot Platform (07/07/2026 — chi tiết [docs/poc-zalo-bot.md](docs/poc-zalo-bot.md)):** khả thi về kỹ thuật — bot vào được nhóm sẵn có ✅, đọc trọn nội dung tin ✅, gửi ngược vào nhóm ✅, chi phí 0đ, chính thức. **Ràng buộc cứng:** trong nhóm bot **CHỈ nhận tin @mention nó** (mention-gating là hành vi gốc của Zalo, KHÔNG tắt được — đã xác minh, không phải cấu hình sai). Mention-gating là cổng DUY NHẤT: tin @mention đều về đầy đủ, **kể cả ẢNH** (event `message.image.received` kèm `photo_url` tải được + `caption`). → **Kênh lai:** mọi tin (text/ảnh) **có tag** → bot tự đọc (ảnh: Claude vision đọc từ `photo_url`); tin **không tag** hoặc gửi lúc **bot offline** (Zalo không replay) → Co-pilot dán tay. Điều kiện bật Bot mode = **khách đồng ý để đại lý tag bot khi đặt đơn** (D2); production cần **webhook always-on** + lưu tin về DB ngay.

**Kênh zca-js (thư viện ngoài — KÊNH ĐỌC CHÍNH GĐ1 theo quyết định khách, 09/07/2026):** dùng [zca-js](https://github.com/RFS-ADRENO/zca-js) (userbot, đăng nhập tài khoản Zalo cá nhân qua Zalo Web) để **đọc MỌI tin trong nhóm — KHÔNG bị mention-gating** (khác hẳn Bot Platform), và gửi tin. Wiring: `ZaloUserClient` (đăng nhập QR→lưu phiên `secrets/zalo-cred.json`, các lần sau tự login lại) · `ZcaAdapter` (gửi, `api.sendMessage`) · `ZcaListener` (đọc, `api.listener.on('message')` → map → pipeline). Chuyển kênh bằng **1 biến `CHANNEL_MODE=mock\|bot\|zca`** (mặc định schema = `mock` cho test/CI; `.env` demo = `zca`). **Rủi ro & điều kiện bắt buộc:** vi phạm ToS Zalo → **có thể bị khóa tài khoản** ⇒ dùng **tài khoản phụ/SIM riêng**, KHÔNG dùng tài khoản Sale chính; cần **văn bản chấp nhận rủi ro của khách** trước khi chạy thật (NĐ13/2023 + Luật BVDLCN 2025). **Ràng buộc kỹ thuật:** mỗi tài khoản chỉ **1 listener**; nếu mở Zalo Web cùng tài khoản → listener tự dừng; zca đọc *mọi* tin nên tốn LLM/nhiễu hơn Bot (skip `isSelf` + tin rỗng). Lưới an toàn: `CHANNEL_MODE=mock` chạy offline tất định.

## Quyết định kiến trúc đã chốt

1. **KHÔNG xây module quản lý kho riêng** — gọi API KiotViet trực tiếp để kiểm tồn. KiotViet là source of truth duy nhất (nơi nhập/xuất kho vật lý). Với 10-20 đơn/ngày không cần cache; nếu sau này cần thì thêm cache TTL ngắn, không làm sớm.
2. **AI parser = trích xuất có ràng buộc trong từ điển đóng**, không phải NLP tiếng Việt tổng quát:
   - Ngữ cảnh đưa vào prompt: metadata nhóm Zalo (map group → đại lý/CTV), danh mục 18-20 SKU, glossary viết tắt (VD: `TN` = Thái Nguyên, `OCP` = Ocean Park)
   - Ép output về JSON schema cố định qua tool use — không parse output tự do bằng regex
   - Validation tất định sau LLM: mã SP phải thuộc danh mục; số lượng × đơn giá ≈ tổng đơn khách ghi
   - Định tuyến theo độ tin cậy: đơn rõ ràng → điền sẵn cho Sale duyệt 1-click; trường mơ hồ → đánh dấu Sale nhập tay, AI không tự quyết
   - Feedback loop: log cặp (tin nhắn gốc, kết quả Sale sửa) → mở rộng glossary + few-shot, không cần train lại model
3. Chọn model qua bake-off trên 20-30 tin nhắn thật: đo tỷ lệ JSON hợp lệ, độ chính xác field-level, khả năng dùng đúng glossary.
4. **GĐ1: đọc tự động (zca-js) + Sale duyệt** (cập nhật 09/07/2026): kênh **đọc** giờ là zca-js (đọc mọi tin nhóm, không cần tag) thay cho Co-pilot dán tay — nhưng **mô hình duyệt KHÔNG đổi**: AI KHÔNG tự gửi/tự trả lời trong nhóm; auto-reply chỉ xem xét sau khi có văn bản đồng ý của khách. "Chuẩn hóa nguồn sự thật trước khi bật AI" vẫn là điều kiện chặn; **thêm điều kiện chặn cho zca**: tài khoản phụ + văn bản chấp nhận rủi ro ToS. Co-pilot vẫn là fallback khi zca lỗi/khóa. *(Cờ `AUTO_SEND` — **mặc định off** giữ nguyên tắc "không tự gửi"; bật on thì AI tự chốt đơn KHÔNG rủi ro, gated bởi vai Giám sát, chỉ dùng khi có đồng ý của khách = GĐ2.)*
5. **Tách bạch LLM vs rules**: LLM chỉ phân loại intent + trích xuất + soạn văn bản; giá/ship/chính sách/VAT do rules engine TypeScript tính từ nguồn sự thật trong DB. Không đảo ngược nguyên tắc này.

## Nghiệp vụ cốt lõi

Hai mẫu đơn:
- **TH1** (giao cho đại lý): `Chi nhánh_Ngày_Tên CTV/Đại lý — Số lượng x Mã SP — Đơn giá — Tổng đơn`. VD: `HN_30.6_Meta HN, 10 x Ghế Felix — 1.150k, Tổng: 11.500.000đ`
- **TH2** (giao thẳng khách của đại lý): thêm `Tên khách — SĐT/Địa chỉ — Cước vận chuyển — Thu hộ/Không thu`

4 chính sách đại lý: **công nợ** (30/45 ngày), **ký gửi** (cuối tháng báo số → đơn bán + VAT), **thanh toán ngay** (CTV nhỏ), **COD** (có phí thu hộ theo biểu mẫu, báo trước).

Đặc thù ngôn ngữ đầu vào: viết tắt, không dấu — `"Gui ve TN cho c"`, `"Bao nhieu tien"`, `"gui nhe"`.

Quy trình duyệt: 1 Sale xác nhận bước cuối → kế toán kiểm tra khi lên hệ thống. Cần cả đơn giao và báo giá riêng. VAT xuất tùy trường hợp (nháp → khách kiểm tra → xuất).

## Câu hỏi mở (chưa chốt — hỏi/thử trước khi implement phần liên quan)

1. ~~PoC Zalo Bot Platform (3 câu hỏi Beta)~~ — **ĐÃ CHỐT phần lớn (PoC 07/07, [docs/poc-zalo-bot.md](docs/poc-zalo-bot.md)):** (a) vào nhóm sẵn có ✅ CÓ; (b) chỉ nhận @mention (native, không tắt được) ✅; (c) giới hạn nhóm/rate limit — CÒN treo. **Còn phải hỏi khách:** đại lý có chấp nhận @mention bot khi đặt hàng không (D2)? + gói Premium giá/rate limit (hỏi Zalo).
2. Gói KiotViet hiện tại có bật API không? Rate limit bao nhiêu?
3. Base có tài liệu API không? (khảo sát ghi "không rõ")
4. Phạm vi cụ thể của giai đoạn 1/2/3 là gì?
5. Báo giá GMF chính thức cho 200-350 nhóm nhỏ + gói OA mới (sau 1/6/2026) nào có GMF/OpenAPI

## Tuân thủ chính sách Zalo (nếu dùng kênh chính thức)

- Thông báo cho thành viên nhóm rằng họ tương tác với hệ thống tự động; gắn nhãn nội dung do AI tạo (điều khoản Zalo Bot Platform)
- Không thu thập dữ liệu cá nhân trong nhóm khi chưa có đồng ý hợp pháp (Nghị định 13/2023, Luật BVDLCN 2025); tối thiểu hóa dữ liệu gửi sang LLM API
- Lưu mọi tin nhắn/đơn về DB ngay khi nhận — Zalo có quyền khóa bot/nhóm không cần báo trước, không được để mất dữ liệu theo kênh

## Lưu ý bảo mật

- Dữ liệu khách hàng (SĐT, địa chỉ, đơn hàng) là dữ liệu nội bộ — **không gửi cho bên thứ 3** ngoài các API đã thống nhất (KiotViet, Claude API)
- Không hardcode API key (KiotViet, Zalo, Anthropic) — dùng biến môi trường, validate khi khởi động
- Khách chưa có IT nội bộ: giải pháp phải vận hành được bởi người non-technical, ưu tiên đơn giản
- **DeepSeek (`PARSER_MODE=deepseek`) + kênh zca (`CHANNEL_MODE=zca`) — lưu ý xử lý dữ liệu:** kênh zca đọc *mọi* tin nhóm rồi đẩy sang LLM. **DeepSeek CHƯA nằm trong danh sách bên thứ 3 được duyệt** (chỉ KiotViet + Claude). Do đó: (a) **demo chỉ dùng nhóm/dữ liệu TEST, không PII thật** — dùng DeepSeek ở giai đoạn này là chấp nhận được; (b) **bản chạy thật với dữ liệu khách** phải hoặc đổi sang **Claude** (`PARSER_MODE=claude`), hoặc **bổ sung DeepSeek vào hợp đồng/thoả thuận xử lý dữ liệu** trước khi bật. Kèm điều kiện chặn của zca: tài khoản phụ + văn bản chấp nhận rủi ro ToS (mục "Kênh Zalo GĐ1").
