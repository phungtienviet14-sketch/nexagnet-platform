# TIẾN ĐỘ & KẾ HOẠCH CÒN LẠI — Ultty AI

> **Nguồn sự thật DUY NHẤT về "đang ở đâu / còn gì".** Cập nhật 09/07/2026.
> Thiết kế kỹ thuật: [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md). Plan code gốc: [.claude/plans/ultty-ai-agent.plan.md](../.claude/plans/ultty-ai-agent.plan.md) (08/07, khung cũ — đã bị tài liệu này thay cho phần theo dõi tiến độ).

---

## 1. Ảnh chụp nhanh

- **Nhánh:** `feat/console-realtime-ui` — đã push, đi trước `main` ~17 commit, **CHƯA merge**.
- **Demo chạy được ngay** trên **dữ liệu thật** (19 SKU/giá/glossary) + **kênh Zalo thật** (zca) + AI thật (DeepSeek). Kịch bản: [kich-ban-demo-toan-he-thong.md](kich-ban-demo-toan-he-thong.md).
- **Phạm vi demo khuyến nghị: dừng ở hết Phase 2** (dữ liệu + luật thật). Phase 3+ cần dữ liệu/quyết định từ khách.
- **Lưu trữ:** in-memory (demo restart sạch) — CHƯA có Postgres.

---

## 2. ĐÃ XONG ✅

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Monorepo (pnpm: api NestJS · web Next · shared · tools) | ✅ | |
| PoC Zalo Bot Platform | ✅ | [poc-zalo-bot.md](poc-zalo-bot.md) — chỉ @mention |
| PoC Parser bake-off | ✅ | eval 100% / 35 tin (dữ liệu demo); tin THẬT còn thiếu |
| **Kênh zca-js** (userbot, đọc mọi tin nhóm không cần tag) + `CHANNEL_MODE=mock\|bot\|zca` | ✅ | Kênh đọc chính GĐ1 |
| shared zod schemas (ChannelMessage/Intent/ParsedOrder/OrderView) | ✅ | |
| AgentOrchestrator **6 agent** (1 lần gọi LLM/tin) + AgentTrace | ✅ | |
| Rules engine tất định (giá sỉ + override, ship, VAT, chính sách) | ✅ | Phase 2 grounded |
| **Nguồn sự thật THẬT** (19 SKU + bảng giá tháng 7 + glossary) | ✅ | Phase 1 |
| Luật khớp PO/quy trình thật (TH1 miễn ship; nhãn công nợ "từ ngày nhận hàng"; ký gửi "cuối tháng") | ✅ | Phase 2 |
| Validation + định tuyến theo confidence + Giám sát leo thang | ✅ | |
| Orders state machine + duyệt 1-chạm + KiotViet **mock** | ✅ | KiotViet giả lập (KV-1001) |
| Console 3 cột + SSE streaming thật + panel nguồn sự thật | ✅ | |
| Broadcast khuyến mãi · AUTO_SEND (mặc định off) | ✅ | |
| Kịch bản demo master + bản đồ THẬT-vs-MOCK | ✅ | |
| Test 173 xanh · lint · web build | ✅ | |

---

## 3. CHƯA XONG — kế hoạch còn lại

### Phase 3 — Lưu trữ bền (Postgres/Prisma) ⬜
- Prisma schema (dealers/groups/products/prices/policies/glossary/orders/messages/parse_feedback/kpi_events/audit_logs) + migrate.
- Thay `InMemoryOrdersRepository` → Prisma; **lưu mọi tin về DB ngay khi nhận** (tuân thủ, chống mất dữ liệu).
- *Demo không cần; production cần.*

### Phase 4 — Tích hợp vận hành (không/có API) ⬜
- **KiotViet:** làm `KiotVietExcelAdapter` (sinh file Excel đúng format import) **hoặc** `KiotVietApiAdapter` (nếu gói có API). *Cần file mẫu import (C1) hoặc credential API.*
- **Base:** sinh format dán / API (GĐ2). *Chưa có code Base nào.*
- **LLM:** đổi sang **Claude** cho dữ liệu khách thật (nạp credit Anthropic); DeepSeek chỉ cho demo test.

### Phase 5 — Auth + KPI + Feedback loop ⬜
- Auth vai Sale/Kế toán/Quản lý (hiện **chưa có auth** trên endpoint nào — chặn production). *Cần D5: danh sách user.*
- KPI events đầy đủ (tỷ lệ bóc đúng, time_to_close, handoff).
- Feedback loop: log (tin gốc, AI output, Sale sửa) → đề xuất glossary/few-shot.

### Phase 6 — Deploy + Pilot ⬜
- Deploy Docker 1 VM (vận hành non-tech) + webhook always-on (nếu dùng bot) + sao lưu.
- Pilot 1-2 nhóm thật → đo KPI → go/no-go mở rộng 200 nhóm.

### Việc "thật hơn" còn treo trong Phase đã làm ⬜
- Rules: **mức cước ship / phí COD / quy tắc VAT chi tiết** đang *tạm tính* — không có trong mọi tài liệu (cần A3).
- Đọc thêm 2 quy trình được tham chiếu nhưng chưa có file: **"Lên đơn hàng"** (mẫu TH1/TH2 chuẩn) + **"Chăm sóc KH sau bán"** (bảo hành/đổi trả).
- App PWA mobile-first 5 tab (theo `design/`) — hiện dùng **console PC** cho demo; PWA làm sau khi Sale dùng điện thoại.

---

## 4. DỮ LIỆU CÒN THIẾU (phải xin khách — chặn chạy thật toàn tập)

Chi tiết + cách hỏi: [checklist-du-lieu-khach.md](checklist-du-lieu-khach.md).

| # | Thiếu | Chặn |
|---|---|---|
| 🔴 **A4** | Danh sách đại lý/CTV + **map nhóm Zalo → đại lý** + group ID (seed chỉ 3 nhóm mẫu) | áp đúng đại lý/chính sách/deal |
| 🔴 **A3** | Biểu phí COD + cước ship (định nghĩa nội thành, mức Viettel) + ngưỡng công nợ 30/45 | rules hết "tạm tính" |
| 🔴 **A2** | Deal riêng của đại lý SL lớn | giá đúng cho đại lý có deal |
| 🟠 **B1-B2** | 20-30 tin thật + đơn đúng (golden) | bake-off model + eval thật |
| 🟡 **C1/C3** | File export/import KiotViet + STK/thông tin xuất VAT | Phase 4 |

> **Map nhóm theo `chatId` (ID nhóm), KHÔNG theo tên.** Kênh zca: nhắn 1 tin → log API in `📌 Nhom ... chatId="..."` → copy vào [seed.ts](../apps/api/src/knowledge/seed.ts) `groups[]`.

---

## 5. QUYẾT ĐỊNH ĐANG TREO

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | **Merge nhánh `feat/console-realtime-ui` vào `main`?** | 17 commit đang chờ (zca + Phase 1/2 + kịch bản) |
| 2 | KiotViet: làm `KiotVietExcelAdapter` ngay hay chờ xác nhận API? | Khảo sát: "chưa có API" (thực tế KiotViet CÓ Public API — cần xác nhận gói) |
| 3 | Có làm PWA mobile 5 tab (theo `design/`) hay giữ console PC? | Sản phẩm khi Sale dùng điện thoại |
| 4 | zca là kênh chính GĐ1 → cần **văn bản chấp nhận rủi ro** của khách (ToS) | Điều kiện chặn chạy thật |
| 5 | Bật `AUTO_SEND`? (AI tự chốt) | Cần văn bản đồng ý của khách = GĐ2 |
| 6 | DeepSeek chưa trong danh sách processor duyệt | Demo dùng dữ liệu test OK; thật phải đổi Claude / bổ sung hợp đồng |

---

## 6. ĐỐI CHIẾU với plan code gốc ([.claude/plans/ultty-ai-agent.plan.md](../.claude/plans/ultty-ai-agent.plan.md))

Plan gốc (08/07) đánh số Task 0.1–2.5. Tình trạng thực tế:
- **XONG:** 0.1 scaffold · 0.2 PoC bot · 0.4 PoC parser (demo data) · 1.2 shared · 1.3 channels (+zca) · 1.4 orchestrator · 1.5 rules · 1.6 validation · 1.7 orders (một phần).
- **XONG MỘT PHẦN:** 0.3 nguồn sự thật (SKU/giá/glossary ✅; đại lý/COD/deal = thiếu).
- **CHƯA:** 1.1 Prisma/DB (đang in-memory) · 2.1-2.2 PWA 5 tab + auth (thay bằng console demo) · 2.3 export KiotViet Excel · 2.4 feedback loop · 2.5 pilot.
