# THIẾT KẾ KỸ THUẬT HỢP NHẤT — HỆ THỐNG AI AGENT U ULTTY

**Phiên bản:** v1.0 — 06/07/2026
**Vai trò tài liệu:** bản thiết kế TRIỂN KHAI (implementation design), hợp nhất từ 2 nguồn:
- [Thiet_ke_AI_Agent_U_Ultty.md](../Thiet_ke_AI_Agent_U_Ultty.md) (NetViet, giữ nguyên) — thiết kế giải pháp: kiến trúc nghiệp vụ, lộ trình, KPI, mô hình vận hành
- [bao-cao-tich-hop-zalo.md](bao-cao-tich-hop-zalo.md) (Claude Code) — căn cứ đã kiểm chứng về kênh Zalo, chi phí, chính sách

Khi hai nguồn khác nhau, tài liệu này là quyết định cuối cho phần kỹ thuật.

---

## 1. Quyết định hợp nhất (đã chốt)

| Hạng mục | Lấy theo | Ghi chú |
|---|---|---|
| Kiến trúc 6 tầng, intent taxonomy, luồng chính sách/bảo hành, checklist chốt đơn | NetViet (mục 3, 5) | Giữ nguyên nghiệp vụ |
| Lộ trình 3 giai đoạn, KPI, managed service | NetViet (mục 6, 7) | Giữ nguyên |
| Ma trận phương án Zalo | Tài liệu này (mục 3) | Sửa 2 điểm lỗi thời của NetViet 4.1: bổ sung Zalo Bot Platform; OA thực tế CÓ hỗ trợ nhóm (GMF) nhưng đắt |
| Cơ chế ingestion GĐ1 | Ghép: **Co-pilot là baseline + PoC Bot Platform tuần đầu để nâng cấp** | Bịt khoảng trống "tin nhắn vào hệ thống bằng cách nào" |
| Multi-agent 6 con | Đơn giản hóa: **1 orchestrator + intent router + tools** | KISS với 10-20 đơn/ngày; tách agent khi có nhu cầu thật |
| Stack, schema, pipeline, tuân thủ | Tài liệu này (mục 4-9) | NetViet không có tầng này |
| zca-js | **Loại khỏi lộ trình chính** | Khớp khẩu vị rủi ro NetViet; chỉ xem xét lại khi lãnh đạo U Ultty ký chấp nhận rủi ro bằng văn bản |

## 2. Công nghệ (không đổi so với CLAUDE.md)

TypeScript (Node.js 22) · NestJS (API) · Next.js **PWA mobile-first** (app Sale, 5 tab theo design khách trong `design/`) · PostgreSQL + Prisma · BullMQ/Redis · Claude API (tool use). Monorepo pnpm.

## 3. Kênh Zalo — ma trận 4 phương án (thay mục 4.1 của NetViet)

| Phương án | Tính chính thức | Đọc tin nhóm | Chi phí | Vị trí trong lộ trình |
|---|---|---|---|---|
| **A. Co-pilot** (Sale dán tin nhắn/ảnh vào app, AI xử lý, Sale gửi tay) | ✅ Không đụng ToS | Thủ công | 0đ | **Baseline GĐ1 — luôn hoạt động, là fallback vĩnh viễn** |
| **B. Zalo Bot Platform** (bot.zapps.me, chính thức, nhóm Beta) | ✅ | Tự động (cần PoC 3 câu hỏi Beta) | Free tier / Premium chưa công bố | **PoC tuần 1; nếu đạt → nâng ingestion tự động ngay GĐ1** |
| **C. Zalo OA + GMF** | ✅ | Tự động (API + webhook đầy đủ) | ~25-300k/tháng/nhóm × 200-350 nhóm + gói OA | GĐ2-3: OA cho CSKH 1:1 + ZNS (theo NetViet); GMF nhóm chỉ khi khách chấp nhận chi phí |
| **D. zca-js (userbot)** | ❌ Vi phạm ToS | Tự động | 0đ | **Không dùng** trừ khi có văn bản chấp nhận rủi ro |

**3 câu hỏi PoC Bot Platform (chặn quyết định):** (1) bot thêm được vào nhóm cá nhân có sẵn? (2) nhận mọi tin nhắn hay chỉ @mention? (3) 1 bot vào được bao nhiêu nhóm / rate limit?

Kết quả PoC không thay đổi kiến trúc: mọi kênh đi qua interface `ChannelAdapter`, Co-pilot cũng là một adapter (`CopilotAdapter` — nguồn tin là UI thay vì webhook).

## 4. Map 6 tầng NetViet → module triển khai

| Tầng NetViet | Module thực tế |
|---|---|
| 1. Kênh | `apps/api/src/modules/channels/` — `ChannelAdapter` interface + `CopilotAdapter`, `BotPlatformAdapter`, `MockAdapter` (test). GĐ2+: `OaAdapter`, `MessengerAdapter` |
| 2. Tiếp nhận | `ingest/` — endpoint webhook + endpoint copilot-paste; lưu `messages` NGAY khi nhận; gán danh tính qua map nhóm→đại lý; đẩy BullMQ |
| 3. Lõi AI | `pipeline/` — normalize → intent → extract/RAG → soạn phản hồi. Một orchestrator duy nhất (Claude tool use), KHÔNG chia 6 agent |
| 4. Luật nghiệp vụ | `rules/` — thuần TypeScript tất định (KHÔNG để LLM tính): giá theo cấp đại lý, ship (≥2 SP miễn phí; 1 SP: Grab nội thành/Viettel tỉnh), chính sách công nợ/ký gửi/COD theo hồ sơ đại lý, VAT |
| 5. Tích hợp | `kiotviet/` (GĐ1: export Excel; GĐ2: API), `base/` (GĐ1: sinh format dán tay; GĐ2: API nếu có), vận đơn GĐ2-3 |
| 6. Dữ liệu & quản trị | `knowledge/` (nguồn sự thật: SKU, bảng giá theo cấp, chính sách, glossary), `orders/`, `metrics/` (KPI), `auth/` (phân quyền Sale/Kế toán/Quản lý), audit log |

## 5. Pipeline AI (hợp nhất 4.3 NetViet + thiết kế parser Claude Code)

```
Tin nhắn (webhook hoặc dán tay)
 → [lưu raw + platform + nguồn]
 → [BullMQ] Orchestrator (1 lần gọi Claude, tool use):
     ngữ cảnh: metadata nhóm→đại lý, danh mục SKU, glossary, bảng giá cấp đại lý (đọc từ knowledge, KHÔNG hardcode)
     ① intent: hoi_san_pham | hoi_gia | dat_don | chinh_sach_cong_no | bao_hanh_khieu_nai | van_chuyen | khac
     ② nếu dat_don → extract JSON schema TH1/TH2 (ràng buộc từ điển đóng)
     ③ nếu hỏi thông tin → RAG: trích knowledge + soạn câu trả lời KÈM nguồn; không có dữ liệu → trả lời "cần Sale" (không đoán)
 → Rules engine (TS tất định): áp giá, ship, chính sách, VAT → dựng format xác nhận TH1/TH2
 → Validation: SKU ∈ danh mục; SL×đơn giá ≈ tổng khách ghi; đại lý tồn tại; confidence per-field
 → Routing: đủ tin cậy → hàng đợi duyệt 1 chạm; mơ hồ → đánh dấu field cần Sale nhập; rủi ro (đơn lớn, deal riêng, khiếu nại gắt — mục 5.6 NetViet) → handoff
 → Sale duyệt trên PWA → gửi (Co-pilot: copy 1 chạm; Bot: gửi tự động kèm nhãn "tin tự động")
 → Feedback: log (tin gốc, AI output, bản Sale sửa) → đề xuất glossary/few-shot mới
```

Nguyên tắc bất di bất dịch: **LLM không tính tiền, không quyết chính sách** — chỉ phân loại + trích xuất + soạn văn bản; số liệu do rules engine tính từ nguồn sự thật.

## 6. Dữ liệu — schema chính (Prisma)

`users` (role: sale/ke_toan/quan_ly) · `dealers` (cấp, chính sách mặc định, hạn công nợ) · `groups` (platform, external_id → dealer) · `conversations` · `messages` (raw, source: webhook|copilot, platform) · `products` (SKU) · `price_tiers` (giá theo cấp đại lý, hiệu lực theo tháng) · `policies` · `glossary_entries` · `prompt_rules` (tab "Prompt AI": bật/tắt, nội dung rule đưa vào ngữ cảnh) · `orders` + `order_items` (status: `draft → pending_review → needs_edit → approved → exported/synced → rejected`; confidence per-field JSON) · `warranty_tickets` (GĐ1: tạo phiếu + định tuyến, kỹ thuật quyết) · `parse_feedback` · `kpi_events` · `audit_logs`.

## 7. Ứng dụng Sale — PWA mobile-first (theo design/ của khách)

5 tab: **Tổng quan** (4 counter: tổng tin nhắn, AI chưa xử lý, chờ duyệt, hoàn thành + biểu đồ theo giờ + hoạt động gần đây) · **Tin nhắn** (hội thoại theo nhóm/đại lý, badge platform, ô dán tin nhắn Co-pilot) · **Đơn hàng** (thống kê + doanh thu, lọc trạng thái, duyệt/sửa 1 chạm, nút copy format xác nhận) · **Prompt AI** (nguồn sự thật: SKU, bảng giá, chính sách, glossary, rules bật/tắt) · **Cài đặt** (tài khoản, đổi mật khẩu, phân quyền, ngôn ngữ, dark mode).

Không làm (dấu hiệu template trong design): Gói dịch vụ Free/Premium, Chia sẻ với bạn bè, đa kênh Facebook/Telegram ở GĐ1 (schema đã có cột `platform` để mở GĐ2).

## 8. Tích hợp vận hành (nguyên tắc NetViet: API-first nhưng không phụ thuộc API)

| Hệ thống | GĐ1 | GĐ2+ |
|---|---|---|
| KiotViet | Export Excel đúng format import + copy từng đơn | API đơn/tồn kho (chờ xác nhận gói); kiểm tồn lúc duyệt |
| Base | Sinh format chuẩn để dán | API/webhook nếu có tài liệu |
| Vận chuyển | Tính cước theo bảng nội bộ | API vận đơn Aha/Viettel |
| VAT | AI chuẩn bị dữ liệu xuất (STK, có/không VAT) — kế toán quyết | Giữ nguyên quy trình kế toán |

## 9. Bảo mật & tuân thủ

- Secrets qua env (validate lúc khởi động); phân quyền theo vai trò; audit log thao tác duyệt/sửa/xóa; mã hóa at-rest; dữ liệu cô lập, không gửi bên thứ ba ngoài API đã thống nhất (KiotViet, Claude API)
- Tối thiểu hóa dữ liệu cá nhân gửi sang LLM; lưu mọi tin nhắn về DB ngay khi nhận (đề phòng mất kênh — Zalo có quyền khóa bot không báo trước)
- Nếu bật gửi tự động (Bot Platform): thông báo thành viên nhóm về hệ thống tự động + gắn nhãn nội dung AI (điều khoản Zalo Bot); tuân thủ NĐ 13/2023 + Luật BVDLCN 2025

## 10. KPI (theo NetViet 7.1 — cách đo cụ thể)

| KPI | Cách đo (từ `kpi_events`) | Mục tiêu tham chiếu |
|---|---|---|
| Tỷ lệ bóc tách đúng | đơn approved không sửa field nào / tổng đơn AI tạo | ≥90% sau GĐ1 ổn định |
| Thời gian chốt đơn TB | t(message_received → approved) | < mốc 5 phút hiện tại |
| Tỷ lệ trả lời cần sửa | draft bị sửa / tổng draft | giảm dần |
| Tỷ lệ handoff | đơn chuyển người thật / tổng | hợp lý theo độ phức tạp |

## 11. Rủi ro hợp nhất

| Rủi ro | Giảm thiểu |
|---|---|
| PoC Bot Platform không đạt (chỉ @mention / không vào được nhóm sẵn) | Co-pilot vẫn go-live GĐ1 đúng hạn — PoC chỉ là nâng cấp, không phải điều kiện |
| Co-pilot dán tay chậm hơn quy trình 5 phút hiện tại → Sale bỏ dùng | Đo time_to_close ngay pilot 1-2 nhóm (bước 5 NetViet); tối ưu UX dán-duyệt-copy dưới 3 chạm; ưu tiên PoC Bot để bỏ bước dán |
| Nguồn sự thật (SKU/giá/chính sách) khách cung cấp chậm | Là điều kiện chặn bật AI (đúng khuyến nghị NetViet); chèn task thu thập ngay tuần 1 |
| AI trả lời sai giá/chính sách | Rules engine tất định + RAG bắt buộc có nguồn + không có dữ liệu thì không đoán |
| Beta Bot Platform đổi chính sách | `ChannelAdapter` đổi kênh không đập hệ thống; tin nhắn đã lưu DB |
