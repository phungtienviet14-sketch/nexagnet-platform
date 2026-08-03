# KẾ HOẠCH — TỔNG QUAN & TRẠNG THÁI (nguồn sự thật duy nhất)

> **Vai trò:** tài liệu DUY NHẤT giữ **trạng thái** mọi kế hoạch (đang ở đâu, xong gì, chờ gì, quyết định treo, dữ liệu thiếu). Các kế hoạch con CHỈ mô tả phạm vi/thiết kế — **không chứa trạng thái**; muốn biết tiến độ, quay về đây.
> **Kế hoạch con:** [nen-tang.md](nen-tang.md) (Đợt 0 — nền phải xong) · [tinh-nang-dai-han.md](tinh-nang-dai-han.md) (Đợt 1-4 — 6 tính năng mới).
> **Thay thế (11/07/2026):** `tien-do-va-ke-hoach.md` + `checklist-du-lieu-khach.md` + phần trạng thái của `ke-hoach-dai-han.md` + 2 plan code trong `.claude/plans/` — tất cả đã xóa, git history còn.
> Cập nhật: **03/08/2026**.

---

## 1. Ảnh chụp nhanh (03/08/2026)

- **Nhánh đang làm:** `feat/phase3-persistence`; nhánh này đã chứa cả persistence và console realtime, không còn việc merge nhánh console riêng.
- **Demo local chạy được** với 19 SKU + bảng giá tháng 7 + 24 glossary. Source đã có `CHANNEL_MODE=hybrid`: native @mention Bot chính thức → Bot Platform, không tag → zca, phản hồi quay lại đúng kênh nguồn. **Pilot GCP đã deploy `CHANNEL_MODE=hybrid` ngày 03/08/2026** (secret `zalo-ultty-zalo-bot-token` đã tạo; migration `20260803102000_operator_settings` đã áp trên Postgres production; smoke + persistence + public HTTPS đạt), chỉ dùng dữ liệu TEST và chưa dùng PII thật.
- **Trang vận hành `/settings` (03/08/2026)** — 6 tab cho người non-technical: trạng thái/đăng xuất kênh Zalo + đồng bộ thành viên nhóm allowlist bằng zca; phân loại từng thành viên (`customerRank` · `operationalRole` · `handlingMode`, mặc định `unknown + inherit_group` nên sync KHÔNG tự đổi hành vi pipeline); CRUD đại lý/SKU/giá/override; rules typed có draft → preview → activate (không cho nhập công thức tự do); công tắc `AUTO_SEND` dùng chung một state với TopBar; lịch sử thay đổi (audit append-only, đã lọc token/PII). **Rank thành viên không đổi đơn giá** — giá vẫn là `DealerPriceOverride > Price.wholesale`.
- **Lưu trữ:** mặc định in-memory (`PERSISTENCE=memory` → demo/CI không cần DB); bật Postgres bằng `PERSISTENCE=prisma`. **MỌI tin nhắn được lưu vào bảng `messages` ngay khi nhận** (11/07, commit `6d1a539` — trước khi qua pipeline, chống trùng unique, nối `orders.messageId`).
- **Nguồn sự thật ĐỘNG:** sửa qua panel `/admin` (AdminJS) hoặc MCP tool (8 tool) → ghi Postgres + pipeline nạp lại ngay.
- **Chất lượng (03/08/2026):** 308 test API (+21 integration/eval skip khi không có DB; bật `RUN_PRISMA_IT=1` trên Postgres thật → **328 xanh**) + 60 shared + 26 web + 2 contract route + **2 Playwright E2E `/settings`** xanh; coverage mục tiêu phần hybrid đạt 93,29% statement/line, 87,32% branch, 86,66% function; Flowise contract thật xanh; eval Flowise **35/35 intent**; lint · typecheck · build xanh; không còn audit high/critical (còn 6 moderate). Field-accuracy vẫn chờ golden B1-B2.
- **Pilot GCP `netviet`:** HTTPS public có Basic Auth riêng cho demo/operator; Flowise có đăng nhập riêng. Contract, SSE + 6 vai/1 LLM, restart-persistence, backup/restore và rollback `deepseek → flowise` đều đạt. Soak 24 giờ kết thúc **PASS 01/08** (RAM tối đa 56%, disk 21%, không OOM/restart bất thường). ZCA đã chọn Meta HN (`2508572440887686813`) và Thái Nguyên (`3787434804745256898`); còn xác nhận lại E2E duyệt/gửi sau sửa group ID.

### Cách chạy nhanh

```bash
# Demo offline (không cần DB)
pnpm dev:api && pnpm dev:web

# Bản thật: Postgres + panel chỉnh nguồn sự thật
docker compose up -d postgres
pnpm --filter @ultty/api exec prisma migrate deploy
pnpm --filter @ultty/api exec tsx prisma/seed.ts
PERSISTENCE=prisma ADMIN_UI=on pnpm --filter @ultty/api dev   # → /admin

# MCP tool (agent sửa nguồn sự thật bằng hội thoại)
pnpm --filter @ultty/api mcp
```

---

## 2. Bức tranh lớn: lộ trình 3 giai đoạn (NetViet) + vị trí hiện tại

```mermaid
flowchart LR
    subgraph P0["Chuẩn bị ✅"]
        A1["Scaffold monorepo ✅"]
        A2["PoC Bot + zca ✅"]
        A3["Nguồn sự thật thật ✅"]
        A4["Bake-off parser (100%) ✅"]
    end

    subgraph G1["GĐ1 — Đọc tự động + Sale duyệt (⬅ ĐANG Ở CUỐI GĐ NÀY)"]
        B1["Pipeline: intent + trích xuất<br/>+ rules + validation ✅"]
        B2["Console duyệt 1 chạm ✅"]
        B3["Lưu mọi tin ✅ · rules-config động ⬜"]
        B4["KiotViet Excel/API + auth ⬜"]
        B5["Pilot 1-2 nhóm, đo 4 KPI ⬜"]
    end

    subgraph G2["GĐ2 — Tự động hóa & đa kênh ⬜"]
        C1["KiotViet API + Base API"]
        C2["Zalo OA 1:1 + ZNS"]
        C3["Đối soát ký gửi/công nợ + AUTO_SEND"]
    end

    subgraph G3["GĐ3 — Tối ưu & chủ động ⬜"]
        D1["Dự báo mùa vụ, cảnh báo tồn"]
        D2["Up-sell / nhắc tái đặt"]
    end

    P0 --> G1 --> G2 --> G3
```

Đợt 1-4 của [tinh-nang-dai-han.md](tinh-nang-dai-han.md) (6 tính năng mới) đứng TRÊN nền Đợt 0 và đan vào GĐ2-3 NetViet.

---

## 3. BẢNG TRẠNG THÁI kế hoạch (nơi duy nhất có ✅/⬜)

### 3.1 [nen-tang.md](nen-tang.md) — Đợt 0 (việc đang dở, chắc chắn làm)

| Hạng mục (phạm vi chi tiết ở kế hoạch con) | Trạng thái |
|---|---|
| Phase 0-2 — scaffold · PoC · pipeline · rules · console SSE · kênh zca · dữ liệu thật | ✅ XONG |
| Phase 3 — Postgres/Prisma + repo seam + panel `/admin` + MCP tool + seed thật | ✅ XONG |
| Phase 3 còn lại — **lưu MỌI tin vào DB** (`messages`) | ✅ 11/07/2026 — `MessagesRepository` seam memory\|prisma, pipeline lưu TRƯỚC khi xử lý (lỗi lưu không chặn đơn; rerun không lưu lại), chống trùng unique `(platform, externalMessageId)`, nối `orders.messageId`; IT Postgres gated `RUN_PRISMA_IT=1` |
| Phase 3 còn lại — **rules-config động** + sửa nghiệp vụ theo nguồn gốc (VAT-default **D8** · phí COD dạng bảng · xác minh `cong_no_7` **D15** · ship/ngưỡng thành config) | ⬜ chờ D8/D15 + A3 |
| Phase 3 còn lại — **import Excel A4** (đại lý + map nhóm, dùng `read-excel-file` — 🔄 11/07 thay `exceljs`) | 🟡 **mẫu gửi khách ĐÃ soạn 13/07** — `docs/mau/A4_dai-ly_map-nhom_U-Ultty.xlsx` (3 sheet, dropdown khớp enum `Dealer`/`Group`, kèm 3 đại lý + 2 nhóm thật) sinh từ `tools/excel-template/`; **importer** đọc file khách trả về ⬜ chờ A4 |
| Phase 4 — KiotViet Excel/API + map SKU↔mã số · Base · đổi LLM sang Claude cho dữ liệu thật | ⬜ chờ C1 |
| Phase 5 — auth theo vai (2 cổng KSNB) + ghi `kpi_events` + feedback loop | ⬜ chờ D5 |
| Phase 6 — deploy 1 VM + webhook always-on + sao lưu + **pilot 1-2 nhóm → go/no-go** | 🟡 hạ tầng `netviet` đã public qua HTTPS có auth; Flowise/DeepSeek/Postgres thật, chỉ KiotViet mock; smoke · persistence · backup/restore · monitoring · rollback · soak 24 giờ đạt. Hybrid hai Bot + console `/settings` **đã deploy 03/08** (secret Bot token đã tạo, migration đã áp, smoke đạt); **CI/CD đã có** (`.github/workflows/ci.yml` 5 job gồm Prisma IT + Playwright + audit; `deploy.yml` CD keyless qua Workload Identity Federation). **CI đã chạy xanh 5/5 job trên GitHub 03/08** (run `30803243172`); 2 repository variable đã đặt; environment `production` yêu cầu người duyệt và chỉ cho deploy từ `main`; toàn bộ nhánh nằm ở PR #1 chờ review. Còn lại trước pilot: map Bot `chat.id` + zca `threadId` về cùng đại lý, chuyển/kiểm chứng webhook official Bot, chạy E2E ma trận tag/không-tag trên nhóm test |
| Việc "thật hơn" treo — đọc 6 quy trình gốc chưa phản ánh · mô hình hóa sau `synced` · PWA 5 tab | ⬜ |

### 3.2 [tinh-nang-dai-han.md](tinh-nang-dai-han.md) — Đợt 1-4 (6 tính năng mới, định hướng)

| Đợt | Gồm | Trạng thái | Cổng vào (chi tiết ở kế hoạch con) |
|---|---|---|---|
| 1 — Giá trị nhanh | F6a gọi nhân viên → F1 sửa đơn NL → F3 dashboard v1 | ⬜ chưa bắt đầu | Đợt 0 xong phần nền + D10 · D11 · D14 |
| 2 — Dòng tiền | F2 QR + payments → F5 v1 nhắc công nợ | ⬜ chưa bắt đầu | D9 · D13 |
| 3 — Năng lực AI | F4 ảnh viết tay (PoC trước) · F6b chống gian lận v1 | ⬜ chưa bắt đầu | D12 · D14 |
| 4 — Tối ưu (GĐ3) | F5 v2 đối soát · F6b v2 baseline · dự báo/up-sell | ⬜ chưa bắt đầu | vài tháng dữ liệu thật sau pilot |

Ghi chú trạng thái đã chốt cho kế hoạch dài hạn: **lộ trình Đợt 1→4 đã được duyệt** (10/07/2026) · **thư viện/dịch vụ đã chốt qua search-first** (danh sách trong kế hoạch con §7) · ⚠️ deadline kỹ thuật: **DeepSeek khai tử model cũ 24/07/2026** — demo đã chuyển `deepseek-v4-flash` ✅.

---

## 4. DỮ LIỆU CÒN THIẾU (chặn gì — hỏi chị Nguyễn Thu Phương)

> Nguồn sự thật đã **động** → thiếu A2/A3/A4 **không chặn BUILD** (nhập dần qua `/admin`/MCP) nhưng vẫn chặn **chạy thật đúng số**. B1-B2 là **cổng go-live**, không thay thế được.
> Trạng thái: ⬜ chưa có · 🟡 đã hỏi, đang chờ · ✅ đã nhận & kiểm tra.

**Ưu tiên đỏ:** 🔴 A3 (rules hết "tạm tính") · 🔴 A4 (áp đúng đại lý) · 🔴 A2 (deal riêng) · 🟠 B1-B2 (cổng go-live) · 🟡 C1 (Phase 4).

### A — Nguồn sự thật

| # | Cần gì | Chi tiết hỏi | Chặn | TT |
|---|---|---|---|---|
| A1 | Danh mục SKU | ~~Mã, tên, tên gọi tắt, đơn vị~~ — **đã có 19 SKU từ hồ sơ giá tháng 7**; chỉ còn xác nhận đủ/thiếu | — | ✅ |
| A2 | Deal riêng theo đại lý | Ai có deal riêng, SKU nào, giá nào (cơ chế `DealerPriceOverride` sẵn, đang rỗng) | Giá đúng cho đại lý SL lớn | ⬜ |
| A3 | **Biểu phí COD + biểu cước ship + ngưỡng công nợ** | Bảng phí thu hộ COD ("biểu mẫu riêng"); mức cước Grab nội thành/Viettel tỉnh; định nghĩa "nội thành"; ngưỡng SL áp công nợ 30 vs 45 | Rules hết **tạm tính** (COD 20k, ship 30k/40k đang là giả định) | ⬜ |
| A4 | Danh sách đại lý/CTV + map nhóm Zalo | Tên, cấp, chính sách mặc định, SĐT + nhóm Zalo nào thuộc đại lý nào (từ tag Zalo đang dùng); ưu tiên 10-20 nhóm pilot; gửi file mẫu cho Sale điền dần | Áp đúng đại lý/chính sách (cơ chế nhập sẵn: `/admin` + hộp thư nhóm chưa map + import `read-excel-file`) | ⬜ |

### B — Dữ liệu kiểm thử AI (CỔNG GO-LIVE)

| # | Cần gì | Chi tiết | TT |
|---|---|---|---|
| B1 | **20-30 tin đặt hàng THẬT** | Nguyên văn (giữ viết tắt/không dấu), đủ dạng TH1/TH2/sửa đổi/nhiều SP, kèm nhóm/đại lý | ⬜ |
| B2 | Đơn ĐÚNG tương ứng (golden) | Đơn cuối lên KiotViet cho từng tin B1 — đo field-accuracy + bake-off model | ⬜ |
| B3 | 5-10 ảnh chụp bảng đặt hàng | Cho <20% đơn ảnh (sau này là bộ eval F4) | ⬜ |
| B4 | Từ điển viết tắt bổ sung | Đã có 24 mục từ `Viết tắt_.docx`; nhờ Sale bổ sung tên gọi tắt SP/đại lý | 🟡 |
| B5 | Mẫu format xác nhận Sale đang gửi | 2-3 tin xác nhận TH1 + TH2 thật (đúng giọng hiện tại) | ⬜ |

### C — Truy cập hệ thống (hỏi sớm vì chờ lâu)

| # | Cần gì | Chi tiết | TT |
|---|---|---|---|
| C1 | KiotViet — gói & API | Gói nào, có mục Thiết lập → API không (docs công khai: 5.000 GET/giờ, token 24h); xin file Excel export 5-10 đơn gần nhất + file mẫu import | ⬜ |
| C2 | Base — phạm vi dùng & API | App nào (Workflow/Wework), đầu mối kỹ thuật, format đơn nhập Base (ảnh màn hình) | ⬜ |
| C3 | Hóa đơn VAT | Phần mềm nào, thông tin chuẩn bị khi xuất (STK công ty/cá nhân) | ⬜ |

### D — Quyết định cần chốt (bảng thống nhất — đánh số CHUẨN từ 11/07/2026)

> D1-D7 giữ nguyên số cũ của checklist; D9-D14 giữ nguyên số của kế hoạch dài hạn; 2 câu hỏi rules (trước tạm gọi "D6/D7 mới" — bị trùng số) đổi thành **D8/D15**.

| # | Quyết định | Chặn gì | TT |
|---|---|---|---|
| D1 | Nhóm Zalo test + add bot PoC | — | ✅ 07/07 |
| D2 | Đại lý có chấp nhận **tag bot** khi đặt hàng? | Bật Bot mode (kênh phụ) | 🟡 |
| D3 | Design PWA là spec hay tham khảo UX? Console PC hay PWA mobile 5 tab? | Hướng app Sale sau demo | ⬜ |
| D4 | AI có được **tự gửi/trả lời** trong nhóm (`AUTO_SEND`/auto-reply)? | Cần **văn bản đồng ý** — GĐ2 | ⬜ |
| D5 | Danh sách người dùng app (tên + SĐT + vai: BPKD/KSNB/kế toán/quản lý) | Phase 5 auth | ⬜ |
| D6 | Mẫu thông báo "nhóm có hệ thống hỗ trợ tự động" | Tuân thủ Zalo + Luật 91/2025 khi chạy thật | ⬜ |
| D7 | Chốt phạm vi GĐ1 + KPI + mốc pilot 1-2 nhóm | Phase 6 | ⬜ |
| **D8** | **VAT-default** theo chính sách/đại lý (PO công nợ B2B ghi "giá đã gồm GTGT") hay giữ "chỉ VAT khi khách ghi rõ"? | Increment rules-config (Đợt 0) | ⬜ |
| D9 | STK nhận tiền + chọn SePay/Open API bank/bán tự động + bổ sung hợp đồng xử lý dữ liệu giao dịch | F2 (Đợt 2) | ⬜ |
| D10 | Đơn trạng thái nào còn được sửa/hủy qua AI; đơn đã giao đi quy trình hoàn trả nào | F1 (Đợt 1) | ⬜ |
| D11 | Danh sách chỉ số dashboard (đề xuất: 4 KPI + doanh thu đại lý/chi nhánh + phễu đơn) | F3 (Đợt 1) | ⬜ |
| D12 | Cấp Claude API credit + 20-30 ảnh đơn viết tay thật kèm đáp án | F4 (Đợt 3) | ⬜ |
| D13 | Ngưỡng công nợ chính thức (A3) + cách xác định "ngày nhận hàng" + số dư công nợ đầu kỳ từ Excel BPKD | F5 (Đợt 2) | ⬜ |
| D14 | Danh sách Sale trực + kênh nhận cảnh báo + case đơn ảo/gian lận thật + ngưỡng | F6 (Đợt 1+3) | ⬜ |
| **D15** | **"Công nợ 7 ngày"** là chính sách riêng hay điều khoản TT-7-ngày của ký gửi? | Increment rules-config (Đợt 0) | ⬜ |
| **D16** | **Văn bản chấp nhận rủi ro ToS** cho kênh zca (tài khoản phụ) | Chạy thật kênh zca | ⬜ |
| **D17** | ~~DeepSeek: bổ sung vào thỏa thuận HAY đổi `PARSER_MODE=claude`?~~ → **CHỈ CÒN 1 ĐƯỜNG: đổi sang Claude.** Khảo sát 28/07: DeepSeek lưu dữ liệu tại Trung Quốc và **không có DPA để ký**; Privacy Policy loại trừ chính luồng open-platform API đang dùng. Phương án "bổ sung vào thỏa thuận" **bất khả thi** | Chạy thật với dữ liệu khách | 🟡 đã rõ hướng |
| **D18a** | **Quyết định + spike Flowise thay Dify.** NestJS giữ vai trò điều phối; Flowise chỉ gọi LLM để phân loại/trích xuất. Lý do giấy phép ghi chính xác: core Flowise ngoài thư mục enterprise là Apache 2.0; một số phần enterprise dùng điều khoản thương mại, không phải toàn bộ Flowise là Apache | Hướng kỹ thuật phần AI | ✅ 28/07, rà lại 31/07 |
| **D18b** | **Tích hợp Flowise runtime:** `FlowiseParser`, Agentflow V2 versioned, fail-fast env, contract auth/schema, rollback `PARSER_MODE=deepseek`; eval intent 35/35 | Nghiệm thu lớp parser | 🟡 code + contract + intent eval đã đạt 31/07; chưa được đánh ✅ vì chưa có golden B1-B2 để so field-accuracy |
| **D18c** | **Pilot trên GCP:** project `netviet-host-968934832433`, VM `netviet`, stack riêng `/srv/netviet/apps/zalo-ultty`; SSH IAP-only, web/Flowise public HTTPS có auth, backup/monitoring/rollback/soak | Nghiệm thu hạ tầng pilot | 🟡 hạ tầng + soak 24 giờ đã đạt 01/08; QR + allowlist hai nhóm đã xong, còn xác nhận lại E2E duyệt/gửi sau sửa group ID trước khi đánh ✅ |
| **D19** | **Mô hình đổi: 5 dự án NỘI BỘ → 5 KHÁCH NGOÀI TRẢ TIỀN.** Kéo theo: DPA từng khách, hồ sơ chuyển dữ liệu xuyên biên giới, cách ly dữ liệu bằng kiến trúc, SLA, on-call, offboarding | Mọi giả định hạ tầng + pháp lý | ✅ 28/07 |
| **D20** | **Ai đứng tên 5 tài khoản Zalo phụ** — bạn hay khách? Nếu bạn đứng tên thì **bạn** là bên vi phạm ToS Zalo và D16 mất phần lớn ý nghĩa | Chạy thật kênh zca | ⬜ |
| **D21** | **ĐO số TIN/ngày thật** trên nhóm khách. Sizing + báo giá hiện dựa trên "10-20 đơn/ngày" nhưng zca đọc **mọi tin** của 200-350 nhóm ⇒ sai 2-3 bậc độ lớn về RAM/disk/hóa đơn LLM | Chốt cỡ máy + báo giá khách | ⬜ |
| **D22** | **Hồ sơ ĐGTĐXLDL + ĐGTĐCDL (Mẫu số 09)** theo Luật 91/2025 + NĐ 356/2025 — 2 điểm chuyển (Singapore + LLM), nộp trong 60 ngày, chế tài tới **5% doanh thu năm liền trước** | Ký hợp đồng khách đầu tiên | ⬜ |
| **D23** | **Đơn vị kinh tế**: giá bán/khách, biên lợi nhuận, điểm hòa vốn. Hiện chỉ biết hạ tầng ~$44/khách/tháng; chưa có chi phí LLM, nhân sự, onboarding (hàng chục giờ công/khách) | Chốt mô hình kinh doanh | ⬜ |
| **D24** | **Ai trực + SLA** khi có 5 khách trả tiền (bus factor hiện = 1). Lưu ý: SLA 99.9% ≈ 43 phút/tháng — kiến trúc 1 droplet/1 vùng **không cam kết nổi** | Ký hợp đồng khách đầu tiên | ⬜ |
| **D25** | **Hai Bot cùng một nhóm:** native @mention Bot Zalo → Bot Platform xử lý/trả lời; không tag → tài khoản zca xử lý/trả lời. Chỉ metadata mention native được tính; nếu không lấy được Bot UID thì zca fail-closed | Kiến trúc kênh hybrid | ✅ user duyệt + code 03/08, **đã deploy pilot 03/08**; còn E2E live trên nhóm test |

### E — Hạ tầng production (chặn chạy 24/7)

| # | Cần gì | TT |
|---|---|---|
| E1 | Máy chủ 24/7 + domain + HTTPS (webhook always-on) — ai cung cấp/trả tiền | 🟡 VM NetViet đã có IP tĩnh + HTTPS public qua `sslip.io`, Basic Auth tách demo/operator và đăng nhập Flowise; official Bot hiện còn dùng long-poll, cần webhook endpoint/secret + kiểm chứng always-on trước production; domain thương hiệu/chi phí dài hạn chưa chốt |
| E2 | Postgres production + lịch sao lưu (managed hay tự host) | 🟡 pilot self-host Postgres, backup GCS 7 ngày + 4 tuần và restore check hai DB đã đạt 31/07; mô hình production vẫn chưa chốt |
| E3 | Ai vận hành hằng ngày sau bàn giao (NetViet managed?) + SLA | ⬜ |
| E4 | Kênh nhận cảnh báo sự cố (bot/kênh chết → báo ai, qua đâu) | ⬜ |

### F — Tài khoản & chi phí

| # | Cần gì | TT |
|---|---|---|
| F1 | Chủ sở hữu bot Zalo + tài khoản Zalo phụ (zca) production — ai giữ token/SIM | 🟡 secret `zalo-ultty-zalo-bot-token` đã tạo 03/08 (nạp từ `.env` qua `deploy.ps1`) nên hybrid deploy được; **câu hỏi quản trị "ai giữ token/SIM" vẫn chưa chốt** |
| F2 | Ai add bot/tài khoản phụ vào ~200 nhóm, theo đợt nào (khớp A4) | ⬜ |
| F3 | Gói Zalo Bot Premium nếu cần (giới hạn nhóm/rate limit — hỏi Zalo) | ⬜ |
| F4 | Tài khoản + ngân sách LLM API (ai trả, hạn mức/tháng) | ⬜ |

### G — AI/LLM production

| # | Cần gì | TT |
|---|---|---|
| G1 | Chốt model qua bake-off trên B1-B2 (demo tạm DeepSeek 35/35) | ⬜ |
| G2 | Quyền gửi dữ liệu cá nhân (SĐT/địa chỉ đơn TH2) sang LLM — tối thiểu hóa. ⚠️ **Cơ sở pháp lý đã đổi**: NĐ 13/2023 **hết hiệu lực**, nay là **Luật 91/2025/QH15 + NĐ 356/2025** (từ 01/01/2026) | ⬜ |

### H — Chặn kỹ thuật trước khi bán dịch vụ (phát hiện 28/07/2026, đã xác minh trong code)

| # | Vấn đề | Bằng chứng | TT |
|---|---|---|---|
| **H1** | Mất tin khi LLM lỗi | `MessageGuard` + `processWithRetry`: lưu tin thô trước xử lý, tối đa 3 lượt, chỉ đánh dấu xong khi thành công | ✅ 28/07 |
| **H2** | API trước đây không xác thực | `ApiKeyGuard` toàn cục; production bắt buộc `API_KEY`; gateway nội bộ tự gắn header, chỉ bind loopback | ✅ 28/07 |
| **H3** | Cách ly nhiều khách | v1 dùng **mỗi dự án một Compose project, DB/user/secret/volume/network riêng**; vì không chia DB nên chưa cần `tenantId`. Nếu chuyển sang DB dùng chung phải mở lại quyết định này | ✅ cho kiến trúc pilot 31/07 |
| **H4** | Đóng gói/vận hành production | CI lint/typecheck/test/build, image theo git SHA+digest, Compose, Secret Manager, backup/restore, Ops Agent, health/restart/RAM/disk alert đã có. Heartbeat zca vẫn cần trước pilot nhóm thật | 🟡 pilot mock đạt phạm vi; zca thật còn treo |

### Gợi ý cách hỏi hiệu quả

1. Gửi khách **đúng 1 email/tin Zalo** kèm bảng A+B (đính file Excel mẫu cho A4, B1-B2 để Sale điền thẳng) — tránh hỏi rải rác.
2. Đề xuất **1 buổi call 30-45 phút với chị Phương** đi qua A3 (chính sách) + B4 (viết tắt) — hỏi miệng nhanh hơn chờ điền form.
3. B1-B2: hướng dẫn Sale mở 10 nhóm gần nhất có đơn → copy tin + chụp đơn KiotViet tương ứng — ~1 giờ đủ 20-30 cặp.
4. Nhấn mạnh: **A + B là điều kiện bật AI thật** ("chuẩn hóa nguồn sự thật trước khi bật AI" — NetViet §1).

---

## 5. Việc nội bộ đang treo (không phải quyết định của khách)

| Việc | Ghi chú |
|---|---|
| Đưa nhánh đã duyệt vào `main` | Chỉ làm sau khi pilot hạ tầng/soak đạt; không còn nhánh console riêng cần merge |
| KiotViet: làm `KiotVietExcelAdapter` ngay hay chờ xác nhận API (C1) | Khảo sát ghi "chưa có API" |
| Regen 3 PDF lãnh đạo (`docs/pdf/`) theo bộ tài liệu mới 11/07 | Cần mạng (mermaid CDN); lệnh trong `docs/pdf/src/README.md` |
| ~~**Việc kế tiếp đề xuất #1 (11/07):** soạn **mẫu file Excel A4** gửi khách điền~~ | ✅ **13/07/2026** — `docs/mau/A4_dai-ly_map-nhom_U-Ultty.xlsx` (generator `tools/excel-template/generate_a4_template.py` + README bảng map cột→field). **Gửi chị Phương điền** rồi build importer đọc lại (cổng A4) |
| **Việc kế tiếp đề xuất #2 (11/07):** ghi **`kpi_events`** (message_received · order_created · approved/rejected · sửa field) | Phase 5 phần KHÔNG cần dữ liệu khách; model có sẵn chưa ghi — nền cho dashboard F3 ([nen-tang.md §3](nen-tang.md)) |
| Worktree cũ `.claude/worktrees/cool-maxwell-2f02b3/` | Được loại khỏi phạm vi lint; không xóa dữ liệu người dùng |

---

## 6. Chuyển đổi Dify → Flowise và pilot GCP (28-31/07/2026)

**Mốc nền trước chuyển đổi:**

| Commit | Nội dung |
|---|---|
| `6a69b27` | **H1 mất tin nhắn** — `MessageGuard` + `processWithRetry` dùng chung cho `ZcaListener`/`BotPoller`: chỉ đánh dấu khi pipeline **thành công**, thử lại 2 lần, hết lượt thì log ERROR kèm id. **H2 xác thực** — `ApiKeyGuard` toàn cục + `@Public` cho `/health`; `API_KEY` trống = guard mở (demo/CI/HF nguyên vẹn), `NODE_ENV=production` **bắt buộc** có key nếu không fail fast. Test 148 → 166 (api), 33 → 37 (shared) |
| `3cfd364` | Căn cứ pháp lý: NĐ 13/2023 hết hiệu lực → **Luật 91/2025/QH15 + NĐ 356/2025** (7 chỗ / 5 file) |
| `a2a8c3c` | Sửa cùng căn cứ trong nguồn PDF bàn giao lãnh đạo |

**Mốc triển khai Flowise/GCP:**

| Commit | Nội dung |
|---|---|
| `6f62307` | Tích hợp `FlowiseParser`, workflow versioned, test/contract/eval, stack private GCP, backup/restore/health/soak và tài liệu vận hành |
| `8725b52` | Image runtime đã triển khai sau khi hoàn thiện reconcile database, bootstrap Flowise và readiness gate |
| `1f384f1` | Monitoring idempotent qua API, gồm log metric, email channel và ba alert policy |
| `8d2d5fd` | Runtime public: `CHANNEL_MODE=zca`, trang đăng nhập QR + allowlist nhóm, Caddy HTTPS/auth và smoke pre-login an toàn |

**Spike cũ:** VM trong project `ultty-flowise-spike-2607` đã xóa; project giữ 0 VM/đĩa. Số đo Flowise 3.1.2 lúc rảnh là 558 MB; đây chỉ là dữ liệu lịch sử sizing, không phải bản pilot.

### D18a — quyết định + spike

- Bỏ hướng Flowise gọi ngược `/internal/*`. NestJS vẫn là orchestrator và nguồn sự thật.
- Luồng chính thức: `Zalo/Mock → lưu tin thô → FlowiseParser → Agentflow V2 → parseResultSchema → rules TypeScript → SSE/Sale duyệt`.
- Flowise không được tính giá/VAT/ship/COD/chính sách, ghi DB, gọi MCP/tool hay tự gửi Zalo.
- Giấy phép: core ngoài `enterprise/` là Apache 2.0; một số phần enterprise chịu giấy phép thương mại theo [LICENSE chính thức](https://github.com/FlowiseAI/Flowise/blob/main/LICENSE.md). Không mô tả toàn bộ Flowise là Apache 2.0.

### D18b — runtime đã cài đặt, còn cổng nghiệm thu dữ liệu

- `PARSER_MODE=flowise` fail-fast với `FLOWISE_BASE_URL`, `FLOWISE_FLOW_ID`, `FLOWISE_API_KEY`, `FLOWISE_TIMEOUT_MS`.
- `FlowiseParser` chỉ nhận `response.json`, validate lại bằng schema dùng chung; timeout/401/404/429/5xx/schema sai đều ném lỗi để ingest retry tối đa 3 lượt.
- Workflow `zalo-order-parser-v1` là artifact đã bỏ credential: Start form → một LLM structured output → kết thúc; không memory/tool/code/MCP/HTTP callback.
- Flowise khóa bản [3.1.4](https://github.com/FlowiseAI/Flowise/releases/tag/flowise%403.1.4) bằng image digest. Image dẫn xuất có patch source-guarded để gửi `thinking:{type:"disabled"}` cho DeepSeek V4 và expose structured output Agentflow tại `response.json`.
- Contract thật đạt: import idempotent, prediction key chặn request thiếu/sai key, output qua `parseResultSchema`, đúng một LLM call.
- Eval Flowise trên bộ hiện có: **35/35 intent = 100%**, ngang baseline DeepSeek trực tiếp. Bộ hiện có chưa có golden field; vì vậy D18b chưa được đánh ✅ trước B1-B2.

### D18c — pilot `netviet`

- Project `netviet-host-968934832433` (`NetViet Host`), VM đúng tên `netviet`, `asia-southeast1-b`, `e2-standard-2`, Ubuntu 24.04, đĩa balanced 80 GB.
- SSH vẫn chỉ qua IAP. Caddy public duy nhất cổng 80/443: demo và operator dùng Basic Auth riêng; Flowise dùng đăng nhập riêng. API, PostgreSQL, `127.0.0.1:8080` và Flowise thô `127.0.0.1:3002` không public.
- Stack Zalo tách riêng ở `/srv/netviet/apps/zalo-ultty`, Compose project `zalo-ultty`; DB user/password/volume/network riêng cho Zalo và Flowise.
- Runtime app từ commit `8d2d5fd`, digest `sha256:2d0ea92b…`; Flowise dẫn xuất digest `sha256:8e03db16…`. Image được đẩy Artifact Registry và deploy bằng digest; secret ở Secret Manager.
- Contract Flowise và smoke pre-login đạt; SSE có đủ 6 vai/đúng 1 LLM call, draft còn nguyên sau restart API. Operator đã đăng nhập và chọn đúng hai nhóm test; bản sửa dùng group ID cấu hình đã deploy, còn cần xác nhận lại thao tác duyệt/gửi thành công.
- Backup hai DB đã tải lên GCS và restore check độc lập đạt. Cloud Ops Agent, health/backup timer, log metric, email channel và alert health/restart/RAM/disk đều active.
- Diễn tập rollback sang image trước + `PARSER_MODE=deepseek` đạt E2E; sau đó khôi phục digest hiện tại + `flowise` và E2E lại đạt.
- Soak 24 giờ kết thúc **PASS 01/08/2026**: RAM tối đa 56%, disk 21%, không có health lỗi, OOM hay restart bất thường.
- Pilot hiện chỉ dùng dữ liệu TEST với `CHANNEL_MODE=zca`, `PARSER_MODE=flowise`, DeepSeek; `AUTO_SEND=off` ở env. Source PC đã có hybrid hai Bot, router phản hồi theo nguồn, công tắc runtime Tự gửi và nút đăng xuất Zalo nhưng phần hybrid chưa deploy; allowlist runtime hiện có Meta HN + Thái Nguyên. Chưa bật PII thật.

**Cổng còn lại:** tạo Bot-token secret + map hai ID kênh/đại lý + deploy rồi chạy E2E native-tag/không-tag/mention-người-khác/tin-Bot-gửi; chuyển/kiểm chứng webhook official Bot; nhận B1-B2 để đo field-accuracy cho D18b; D21 vẫn cần trước sizing 200-350 nhóm thật.
