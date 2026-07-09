> ⚠️ **Plan code GỐC (08/07) — khung ban đầu (Co-pilot/PWA/Bot Platform).** Theo dõi TIẾN ĐỘ + phần CHƯA XONG ở [docs/tien-do-va-ke-hoach.md](../../docs/tien-do-va-ke-hoach.md) (cập nhật liên tục). Kể từ 09/07 kênh đọc chính là **zca**, dữ liệu đã **THẬT** (Phase 1/2), demo dùng **console PC** thay PWA.

# Plan: Hệ thống AI Agent U Ultty (bản hợp nhất NetViet + Claude Code)

**Nguồn thiết kế**: [docs/thiet-ke-ky-thuat-hop-nhat.md](../../docs/thiet-ke-ky-thuat-hop-nhat.md) (quyết định kỹ thuật) · [Thiet_ke_AI_Agent_U_Ultty.md](../../Thiet_ke_AI_Agent_U_Ultty.md) (nghiệp vụ, giữ nguyên) · [docs/bao-cao-tich-hop-zalo.md](../../docs/bao-cao-tich-hop-zalo.md) (căn cứ kênh Zalo)
**Phạm vi plan này**: Giai đoạn 1 (Co-pilot MVP) + PoC. GĐ2-3 chỉ phác khung, lập plan riêng khi GĐ1 xong.
**Complexity**: Large (GĐ1 ≈ 3-4 tuần dev)

## Summary

Xây hệ thống AI Co-pilot: tin nhắn đặt hàng Zalo (dán tay hoặc bot tự đọc nếu PoC đạt) → orchestrator Claude (intent + trích xuất ràng buộc) → rules engine tất định (giá/ship/chính sách/VAT) → Sale duyệt 1 chạm trên PWA mobile → export KiotViet Excel + format xác nhận TH1/TH2 → feedback loop. LLM không tính tiền, không quyết chính sách.

## Patterns to Mirror

**Repo chưa có source code** — không có pattern nội bộ để mirror. Chuẩn áp dụng từ rules ECC của project:

| Category | Source | Pattern |
|---|---|---|
| Coding style | `.claude/rules/ecc/typescript/coding-style.md` | Immutability, file <800 dòng, function <50 dòng, early return |
| Validation | `.claude/rules/ecc/common/coding-style.md` | Zod tại mọi boundary (webhook, API, env, LLM output) |
| Testing | `.claude/rules/ecc/typescript/testing.md` + `common/testing.md` | Vitest, AAA, coverage ≥80%, tên test mô tả hành vi |
| Web/React | `.claude/rules/ecc/react/*.md`, `web/*.md` | Server state = TanStack Query; mobile-first; design tokens CSS vars |
| Security | `.claude/rules/ecc/common/security.md` | Không hardcode secret; validate env khi boot |

## Files to Change (cấu trúc tạo mới)

| File/Thư mục | Action | Why |
|---|---|---|
| `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`, `docker-compose.yml` (Postgres+Redis dev) | CREATE | Nền monorepo |
| `packages/shared/` (zod: ChannelMessage, Intent, ParsedOrderTH1/TH2, OrderStatus, confidence) | CREATE | Single source of truth cho schema — API/web/tools dùng chung |
| `apps/api/` NestJS: modules `channels`, `ingest`, `pipeline`, `rules`, `knowledge`, `orders`, `warranty`, `kiotviet`, `metrics`, `auth` | CREATE | Map 6 tầng NetViet (mục 4 thiết kế hợp nhất) |
| `apps/api/prisma/schema.prisma` | CREATE | 16 model (mục 6 thiết kế hợp nhất) |
| `apps/web/` Next.js PWA 5 tab | CREATE | App Sale theo design/ của khách |
| `tools/poc-zalo-bot/`, `tools/poc-parser/` | CREATE | 2 PoC giảm rủi ro |
| `CLAUDE.md` | UPDATE | Trỏ sang thiết kế hợp nhất |

## Tasks

### Phase 0 — Scaffold + PoC + nguồn sự thật (tuần 1)

**Task 0.1: Scaffold monorepo**
- Action: pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`, `tools/*`); TS strict; ESLint+Prettier; Vitest; env schema (zod) validate khi boot; docker-compose Postgres+Redis
- Validate: `pnpm install && pnpm build && pnpm test && pnpm lint`

**Task 0.2: PoC Zalo Bot Platform** ✅ **XONG 07/07/2026** *(quyết định ingestion, KHÔNG chặn go-live)*
- Action: script getUpdates + setWebhook (bot tạo tay qua Zalo Bot Manager); thử với 1 nhóm test; trả lời 3 câu hỏi Beta (vào nhóm sẵn có? mọi tin hay @mention? bao nhiêu nhóm?)
- **Kết quả ([docs/poc-zalo-bot.md](../../docs/poc-zalo-bot.md)):** vào nhóm sẵn có ✅; **chỉ nhận @mention** (mention-gating gốc, không tắt được) ✅; bot gửi ngược vào nhóm ✅; giới hạn nhóm/rate limit ⬜ chưa test. → `BotPlatformAdapter` = **kênh lai** (bắt đơn text-có-tag), chạy song song `CopilotAdapter`. Điều kiện bật: khách đồng ý đại lý tag bot (D2).
- **Còn treo (optional, không chặn code):** test đồng nghiệp (người khác) @mention · ảnh/thoại chat 1-1 (PRIVATE) · đa nhóm + rate limit · chế độ webhook (production).
- **Sửa tool trong lúc PoC:** `get-updates.ts` coi HTTP 408 là idle (trước đó tự chết sau 5 lần); thêm script gốc `poc:doctor`/`poc:webhook`.
- Validate: `docs/poc-zalo-bot.md` ghi kết quả + quyết định bật/tắt `BotPlatformAdapter` ✅

**Task 0.3: Thu thập nguồn sự thật từ khách** *(điều kiện chặn bật AI — khuyến nghị NetViet)*
- Action: lấy từ Drive: danh mục 18-20 SKU, bảng giá theo cấp, 4 chính sách + biểu phí COD, 20-30 tin nhắn thật; chuẩn hóa thành seed data (CSV/JSON)
- Validate: `prisma db seed` chạy sạch; review cùng khách

**Task 0.4: PoC Parser bake-off** *(cần 0.3)*
- Action: runner đo trên 20-30 tin thật: % JSON hợp lệ, độ chính xác field-level, dùng đúng glossary; so ≥2 model Claude; chốt model + prompt baseline
- Validate: `pnpm --filter poc-parser start` xuất bảng kết quả vào `docs/poc-parser.md`; tiêu chí chọn: field accuracy cao nhất, tie-break bằng chi phí

### Phase 1 — Core pipeline (tuần 2)

**Task 1.1: Prisma schema + seed**
- Action: 16 model theo mục 6 thiết kế hợp nhất; migration đầu; seed từ 0.3
- Validate: `prisma validate && prisma migrate dev && prisma db seed`

**Task 1.2: packages/shared — zod schemas**
- Action: `ChannelMessage`, `IntentResult` (7 intent theo NetViet 5.2), `ParsedOrderTH1/TH2`, `FieldConfidence`; sinh JSON Schema cho Claude tool từ zod
- Validate: `pnpm --filter shared test` (unit: schema chấp nhận/loại đúng ca mẫu)

**Task 1.3: Module channels + ingest**
- Action: interface `ChannelAdapter` (`onMessage`, `sendMessage`, `health`); `CopilotAdapter` (endpoint nhận text/ảnh Sale dán); `BotPlatformAdapter` (webhook, verify `X-Bot-Api-Secret-Token`, feature-flag theo kết quả 0.2); `MockAdapter`; lưu `messages` ngay khi nhận (idempotent theo `message_id`) rồi mới enqueue
- Validate: unit + integration (MockAdapter → message trong DB → job trong queue); test idempotency gửi trùng

**Task 1.4: AgentOrchestrator — Multi-agent 6 con (§5.1)**
- Action: `agents/` — Router (1 call Claude tool use: intent + danh tính) → dispatch 1 trong 6 vai chuyên trách (Tư vấn SP · Bán hàng · Chính sách-TC · Hậu mãi) → Supervisor (rules tất định: rủi ro/leo thang). Gắn `AgentTrace` (6 bước, badge nguồn rules/AI/knowledge) lên OrderView. Dual-mode: mock offline (0 LLM) + LLM; 1 lần gọi LLM/tin. **DUY NHẤT Bán hàng gọi rules engine tính tiền.** Retry/backoff; log token cost `kpi_events`
- Validate: unit orchestrator (trace đủ 6 vai, dat_don ra ≥4 vai active, tiền source=rules, đơn lớn→Supervisor escalate, offline 0 LLM); integration (env `RUN_LLM_TESTS=1`) 5 tin bake-off

**Task 1.5: Rules engine (tất định, tách khỏi LLM)**
- Action: giá theo `price_tiers` + cấp đại lý; ship (≥2 SP miễn; 1 SP: Grab HN/HCM nội thành, Viettel tỉnh); chính sách mặc định theo hồ sơ đại lý (công nợ 30/45, ký gửi, thanh toán ngay, COD + phí thu hộ theo biểu); VAT flag; dựng format xác nhận TH1/TH2 đúng mẫu NetViet 5.3
- Validate: unit table-driven phủ 4 chính sách × 2 mẫu đơn × biên (thiếu giá, SKU lạ, tổng lệch) — đây là module bắt buộc coverage ≥90%

**Task 1.6: Validation + confidence routing**
- Action: SKU ∈ danh mục; SL×đơn giá ≈ tổng khách ghi (sai số cấu hình); đại lý xác định được; per-field confidence → `pending_review` (đủ tin) / `needs_edit` (đánh dấu field) / handoff (điều kiện NetViet 5.6: đơn lớn bất thường, deal riêng, khiếu nại gắt)
- Validate: unit các ca: đơn sạch, sai tổng, SKU lạ, nhóm không map được đại lý

**Task 1.7: Orders + warranty + metrics API**
- Action: state machine `draft→pending_review→needs_edit→approved→exported→rejected` (transition hợp lệ + audit log); endpoint duyệt/sửa/copy-format; `warranty_tickets` (tạo phiếu + định tuyến, không tự phán lỗi); ghi `kpi_events` cho 4 KPI
- Validate: integration REST (supertest): duyệt 1 chạm, sửa field → sinh `parse_feedback`

### Phase 2 — PWA Sale + export + feedback (tuần 3-4)

**Task 2.1: PWA khung + auth**
- Action: Next.js mobile-first, manifest + installable; đăng nhập (users seed, role Sale/Kế toán/Quản lý); TanStack Query
- Validate: `pnpm --filter web build`; Lighthouse PWA installable pass; e2e Playwright login

**Task 2.2: 5 tab theo design khách**
- Action: Tổng quan (4 counter + biểu đồ tin nhắn theo giờ + hoạt động gần đây); Tin nhắn (hội thoại nhóm + ô dán Co-pilot); Đơn hàng (thống kê + doanh thu, lọc trạng thái, duyệt/sửa — highlight field confidence thấp, nút copy format); Prompt AI (CRUD SKU/giá/chính sách/glossary + bật tắt prompt_rules); Cài đặt
- Validate: e2e Playwright luồng chính: dán tin nhắn → thấy đơn chờ duyệt → sửa 1 field → duyệt → copy format; screenshot 375px làm visual baseline

**Task 2.3: Export KiotViet Excel + format Base**
- Action: xuất `.xlsx` đúng cột import KiotViet (dùng thư viện `exceljs` — search-first, không tự viết writer); nút copy đơn cho Base
- Validate: unit so sánh file xuất với golden file; khách xác nhận import thử thành công 1 đơn

**Task 2.4: Feedback loop**
- Action: diff AI output vs bản Sale sửa → lưu `parse_feedback` → màn đề xuất glossary mới (duyệt tay trước khi vào ngữ cảnh); job tổng hợp KPI ngày
- Validate: integration: sửa đơn → xuất hiện đề xuất; KPI dashboard khớp số event

**Task 2.5: Pilot 1-2 nhóm (bước 5 NetViet)**
- Action: chạy thật với 1-2 nhóm đại lý; đo 4 KPI 1-2 tuần; go/no-go mở rộng
- Validate: KPI đạt ngưỡng mục 10 thiết kế hợp nhất (bóc tách đúng ≥90%, time_to_close < hiện trạng)

### Phase 3 (GĐ2 NetViet — plan riêng sau pilot)

KiotViet API (kiểm tồn lúc duyệt + tạo đơn) · Base API · Zalo OA 1:1 + ZNS · Messenger/web widget · tự động hóa đối soát ký gửi/công nợ. **Không code trong plan này.**

## Validation (toàn dự án)

```bash
pnpm lint && pnpm typecheck && pnpm test          # unit + integration, coverage ≥80%
pnpm --filter api exec prisma validate
pnpm --filter web build && pnpm e2e               # Playwright
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| PoC Bot không đạt | Trung bình | Co-pilot vẫn go-live đúng hạn; bot chỉ là nâng cấp ingestion |
| Co-pilot chậm hơn quy trình tay 5 phút → Sale bỏ dùng | Trung bình | UX dán-duyệt-copy ≤3 chạm; đo time_to_close ngay pilot; ưu tiên bật bot |
| Khách chậm cung cấp nguồn sự thật (0.3) | Cao | Chặn 0.4/1.4 — escalate sớm; dùng data từ docx khảo sát làm tạm |
| LLM output sai mà validation không bắt được | Thấp-TB | Rules engine tính tiền 100%; Sale duyệt bước cuối; feedback loop |
| Scope creep sang auto-reply/đa kênh GĐ1 | Trung bình | Plan này khóa phạm vi GĐ1 = Co-pilot + duyệt; auto-reply cần văn bản đồng ý |

## Acceptance (GĐ1)

- [ ] 2 PoC có kết luận ghi vào docs/
- [ ] Dán tin nhắn thật → đơn TH1/TH2 chờ duyệt với giá/ship/chính sách do rules engine tính
- [ ] Duyệt 1 chạm → export Excel KiotViet import được + format xác nhận copy được
- [ ] PWA 5 tab chạy trên điện thoại (installable), phân quyền 3 vai trò
- [ ] 4 KPI hiển thị từ dữ liệu thật; coverage ≥80%; không secret hardcode
- [ ] Pilot 1-2 nhóm đạt ngưỡng KPI → go/no-go mở rộng 200 nhóm
