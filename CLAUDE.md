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
2. `Thiet_ke_AI_Agent_U_Ultty.md` — thiết kế giải pháp NetViet (nghiệp vụ, lộ trình 3 GĐ, KPI — GIỮ NGUYÊN, không sửa file này)
3. [docs/thiet-ke-ky-thuat-hop-nhat.md](docs/thiet-ke-ky-thuat-hop-nhat.md) — **thiết kế triển khai hợp nhất, là quyết định cuối cho phần kỹ thuật**
4. [docs/bao-cao-tich-hop-zalo.md](docs/bao-cao-tich-hop-zalo.md) — căn cứ kênh Zalo (chi phí, chính sách, điều khoản)
5. [.claude/plans/ultty-ai-agent.plan.md](.claude/plans/ultty-ai-agent.plan.md) — kế hoạch code GĐ1 (task + validate)
6. `design/` — 8 ảnh design app của khách (tham khảo UX, PWA 5 tab bám theo)
7. [docs/so-do-he-thong.md](docs/so-do-he-thong.md) — 8 sơ đồ Mermaid (bối cảnh, 6 tầng, sequence đơn hàng, state machine, intent, ERD, lộ trình, 2 chế độ ingestion)
8. [docs/checklist-du-lieu-khach.md](docs/checklist-du-lieu-khach.md) — checklist dữ liệu cần thu thập từ khách (A: nguồn sự thật, B: tin nhắn test, C: truy cập hệ thống, D: quyết định)
9. [docs/poc-zalo-bot.md](docs/poc-zalo-bot.md) — template kết quả PoC Bot Platform (chạy theo [tools/poc-zalo-bot/README.md](tools/poc-zalo-bot/README.md))

## Công nghệ (đã chốt)

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (Node.js 22 LTS) | Một ngôn ngữ cho cả backend + app; monorepo pnpm |
| Backend | NestJS | Module theo 6 tầng NetViet: channels, ingest, pipeline, rules, knowledge, orders, kiotviet, metrics, auth |
| App Sale | Next.js **PWA mobile-first**, 5 tab theo `design/` | Sale làm việc trên điện thoại; installable, không cần app store |
| Database | PostgreSQL + Prisma | Nguồn sự thật (SKU/giá/chính sách/glossary), đơn hàng, feedback, KPI, audit |
| Queue | BullMQ (Redis) | Pipeline xử lý tin nhắn bất đồng bộ |
| AI | Claude API (tool use) — 1 orchestrator, KHÔNG multi-agent | Intent (7 loại) + trích xuất ràng buộc; **LLM không tính tiền/không quyết chính sách** — rules engine TS tất định lo phần đó |
| Kênh Zalo GĐ1 | **Co-pilot (dán tay) là baseline; Bot Platform = KÊNH LAI (PoC 07/07 đã xác nhận khả thi)** — mọi kênh qua interface `ChannelAdapter` (Copilot/BotPlatform/Mock) | zca-js đã LOẠI khỏi lộ trình chính (chỉ khi khách ký chấp nhận rủi ro); OA+GMF để GĐ2-3 |

**Kết quả PoC Bot Platform (07/07/2026 — chi tiết [docs/poc-zalo-bot.md](docs/poc-zalo-bot.md)):** khả thi về kỹ thuật — bot vào được nhóm sẵn có ✅, đọc trọn nội dung tin ✅, gửi ngược vào nhóm ✅, chi phí 0đ, chính thức. **Ràng buộc cứng:** trong nhóm bot **CHỈ nhận tin @mention nó** (mention-gating là hành vi gốc của Zalo, KHÔNG tắt được — đã xác minh, không phải cấu hình sai); ảnh/thoại/tin-không-tag không về. → **Kênh lai:** đơn text-có-tag → bot tự đọc; phần còn lại (không tag/ảnh/thoại) → Co-pilot dán tay. Điều kiện bật Bot mode = **khách đồng ý để đại lý tag bot khi đặt đơn** (câu hỏi mở D2).

## Quyết định kiến trúc đã chốt

1. **KHÔNG xây module quản lý kho riêng** — gọi API KiotViet trực tiếp để kiểm tồn. KiotViet là source of truth duy nhất (nơi nhập/xuất kho vật lý). Với 10-20 đơn/ngày không cần cache; nếu sau này cần thì thêm cache TTL ngắn, không làm sớm.
2. **AI parser = trích xuất có ràng buộc trong từ điển đóng**, không phải NLP tiếng Việt tổng quát:
   - Ngữ cảnh đưa vào prompt: metadata nhóm Zalo (map group → đại lý/CTV), danh mục 18-20 SKU, glossary viết tắt (VD: `TN` = Thái Nguyên, `OCP` = Ocean Park)
   - Ép output về JSON schema cố định qua tool use — không parse output tự do bằng regex
   - Validation tất định sau LLM: mã SP phải thuộc danh mục; số lượng × đơn giá ≈ tổng đơn khách ghi
   - Định tuyến theo độ tin cậy: đơn rõ ràng → điền sẵn cho Sale duyệt 1-click; trường mơ hồ → đánh dấu Sale nhập tay, AI không tự quyết
   - Feedback loop: log cặp (tin nhắn gốc, kết quả Sale sửa) → mở rộng glossary + few-shot, không cần train lại model
3. Chọn model qua bake-off trên 20-30 tin nhắn thật: đo tỷ lệ JSON hợp lệ, độ chính xác field-level, khả năng dùng đúng glossary.
4. **GĐ1 khóa phạm vi = Co-pilot + Sale duyệt** (theo NetViet): AI KHÔNG tự gửi/tự trả lời trong nhóm; auto-reply chỉ xem xét sau khi có văn bản đồng ý của khách. "Chuẩn hóa nguồn sự thật trước khi bật AI" là điều kiện chặn.
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
