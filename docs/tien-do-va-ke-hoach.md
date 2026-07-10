# TIẾN ĐỘ & KẾ HOẠCH CÒN LẠI — Ultty AI

> **Nguồn sự thật DUY NHẤT về "đang ở đâu / còn gì".** Cập nhật 09/07/2026 (sau Phase 3).
> Nghiệp vụ (đối chiếu nguồn gốc + bảng sai lệch): [nghiep-vu.md](nghiep-vu.md). Thiết kế kỹ thuật: [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md). Kế hoạch Phase 3: [.claude/plans/phase3-nguon-su-that-dong.plan.md](../.claude/plans/phase3-nguon-su-that-dong.plan.md).

---

## 1. Ảnh chụp nhanh

- **Nhánh đang làm:** `feat/phase3-persistence` (tách từ `feat/console-realtime-ui`) — **10 commit Phase 3**.
- **Nhánh `feat/console-realtime-ui`** (demo + docs) vẫn **CHƯA merge `main`**.
- **Demo chạy được ngay** trên **dữ liệu thật** (19 SKU/giá/glossary) + **kênh Zalo thật** (zca) + AI thật (DeepSeek). Kịch bản: [kich-ban-demo-toan-he-thong.md](kich-ban-demo-toan-he-thong.md).
- **Lưu trữ:** mặc định **in-memory** (`PERSISTENCE=memory`) → demo/CI **không cần DB**. Bật Postgres bằng `PERSISTENCE=prisma`.
- **Nguồn sự thật giờ ĐỘNG:** sửa qua panel `/admin` (AdminJS) **hoặc** qua **MCP tool** (agent) → ghi Postgres + pipeline nạp lại ngay.

### Cách chạy nhanh
```bash
# Demo offline (như cũ, không cần DB)
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

## 2. ĐÃ XONG ✅

| Hạng mục | Ghi chú |
|---|---|
| Monorepo (pnpm: api NestJS · web Next · shared · tools) | |
| PoC Zalo Bot Platform · PoC Parser bake-off (eval 100%/35 tin demo) | [poc-zalo-bot.md](poc-zalo-bot.md) · [poc-parser.md](poc-parser.md) |
| **Kênh zca-js** (đọc mọi tin nhóm, không cần tag) + `CHANNEL_MODE=mock\|bot\|zca` | Kênh đọc chính GĐ1 |
| shared zod schemas · AgentOrchestrator **6 agent** (1 lần gọi LLM/tin) + AgentTrace | |
| Rules engine tất định (giá sỉ + override, ship, VAT, chính sách) | ⚠️ vài luật **tạm tính** — xem [nghiep-vu.md §13](nghiep-vu.md) |
| **Nguồn sự thật THẬT** (19 SKU + bảng giá tháng 7 + glossary) | Đã đối chiếu **khớp** bảng giá gốc |
| Validation + định tuyến theo confidence + Giám sát leo thang | |
| Orders state machine + duyệt 1-chạm + KiotViet **mock** | |
| Console 3 cột + SSE streaming thật + panel nguồn sự thật · Broadcast · `AUTO_SEND` (off) | |
| **Phase 3 — Postgres/Prisma 6**: migration `init` + `prisma/seed.ts` + docker-compose | |
| **Phase 3 — `OrdersRepository` async + `PrismaOrdersRepository`** (chọn theo `PERSISTENCE`) | IT round-trip trên Postgres thật |
| **Phase 3 — `KnowledgeRepository` seam (SEED\|Prisma)** + nạp snapshot lúc boot + `reload()` | IT loadSnapshot trên Postgres thật |
| **Phase 3 — Panel `/admin` "Nguồn sự thật" (AdminJS)** | Auto-CRUD 6 bảng + action **map nhóm→đại lý** + **hộp thư "nhóm chưa map"**; gated `ADMIN_UI=on`+`PERSISTENCE=prisma` |
| **Phase 3 — MCP tool** (8 tool, `@modelcontextprotocol/sdk`) + `POST /knowledge/reload` | Agent sửa nguồn sự thật bằng hội thoại; write có zod validate + kiểm FK |
| **Tài liệu nghiệp vụ viết lại theo NGUỒN GỐC** + bảng sai lệch | [nghiep-vu.md](nghiep-vu.md) |
| Test 137 xanh (memory) · IT Postgres gated `RUN_PRISMA_IT=1` · lint · typecheck | |

---

## 3. CHƯA XONG — kế hoạch còn lại

### Phase 3 — còn lại ⬜
- **Lưu MỌI tin ngay khi nhận** vào DB (`MessagesRepository`) — tuân thủ NĐ13 + chống mất đơn khi Zalo khoá kênh.
- **Rules-config động + sửa nghiệp vụ theo nguồn gốc** ([nghiep-vu.md §13](nghiep-vu.md)): VAT-default theo chính sách · phí COD dạng **bảng** (không phẳng 20k) · xác minh `cong_no_7` · đưa ship/ngưỡng thành cấu hình sửa được.
- **Import Excel A4** (đại lý + map nhóm) bằng **exceljs** *(đã chốt lib; tránh `xlsx`/`node-xlsx` — CVE)*.

### Phase 4 — Tích hợp vận hành ⬜
- **KiotViet:** `KiotVietExcelAdapter` (file import đúng format) **hoặc** API. Cần file mẫu (C1) / credential. Kèm **map SKU ↔ mã hàng số** (vd `8716`).
- **Base:** sinh format dán / API (GĐ2). *Chưa có code Base.*
- **LLM:** đổi sang **Claude** cho dữ liệu khách thật (DeepSeek chỉ cho demo/test).

### Phase 5 — Auth + KPI + Feedback loop ⬜
- Auth vai **BPKD / KSNB / BPVH / Kế toán / Quản lý** (quy trình thật có **2 cổng KSNB** — xem [nghiep-vu.md §3](nghiep-vu.md)). Hiện **chưa có auth** trên endpoint nào (kể cả `/knowledge/reload`) → chặn production.
- KPI events đầy đủ · Feedback loop (tin gốc, AI output, bản Sale sửa) → đề xuất glossary/few-shot.

### Phase 6 — Deploy + Pilot ⬜
- Deploy Docker 1 VM + webhook always-on (nếu dùng bot) + sao lưu.
- Pilot 1-2 nhóm thật → đo KPI → go/no-go mở rộng 200 nhóm.

### Việc "thật hơn" còn treo ⬜
- **Đọc nốt 6 quy trình gốc** chưa phản ánh: `QT Preoder` · `QT_Báo giá B2B` · `QT_Hoàn trả hàng B2B` · `QT_Tiếp xúc khách hàng` · `QT đưa sp vào TT` · `Biên bản bàn giao`.
- Mô hình hoá phần sau `synced` (KSNB cổng 2 → BPVH → ảnh giao hàng → công nợ).
- App PWA mobile-first 5 tab (theo `design/`) — hiện dùng console PC.

---

## 4. DỮ LIỆU CÒN THIẾU

Chi tiết: [checklist-du-lieu-khach.md](checklist-du-lieu-khach.md). **Lưu ý:** nguồn sự thật giờ **động** → thiếu dữ liệu **không còn chặn việc BUILD**, nhập dần qua `/admin` hoặc MCP. Nhưng vẫn chặn **chạy thật đúng số**.

| # | Thiếu | Chặn gì |
|---|---|---|
| 🔴 **A3** | **Bảng phí COD** + **biểu cước ship** + ngưỡng công nợ | Rules hết "tạm tính" (COD 20k, ship 30k/40k đang là **giả định**) |
| 🔴 **A4** | Danh sách đại lý/CTV + map nhóm Zalo → đại lý (đủ) | Áp đúng đại lý/chính sách. *Cơ chế nhập đã sẵn sàng.* |
| 🔴 **A2** | Deal riêng của đại lý SL lớn | Giá đúng cho đại lý có deal |
| 🟠 **B1-B2** | 20-30 tin thật + đơn đúng (golden) | **Cổng go-live**: đo độ chính xác + bake-off model. *Không thay thế được bằng "nguồn sự thật động".* |
| 🟡 **C1/C3** | File export/import KiotViet + thông tin xuất VAT | Phase 4 |

---

## 5. QUYẾT ĐỊNH ĐANG TREO

| # | Quyết định | Ghi chú |
|---|---|---|
| 1 | **Merge `feat/console-realtime-ui` + `feat/phase3-persistence` vào `main`?** | Nhiều commit đang chờ |
| 2 | **VAT-default:** hợp đồng công nợ B2B ghi *"giá đã gồm GTGT, xuất HĐ theo từng lần giao"* — có đổi mặc định VAT theo chính sách/đại lý không? | ⚠️ **MỚI** — chặn Increment "rules-config" |
| 3 | **"Công nợ 7 ngày"** có phải chính sách riêng, hay là điều khoản TT-7-ngày của ký gửi? | ⚠️ **MỚI** — hồ sơ chỉ có PO 30/45/ký gửi |
| 4 | KiotViet: `KiotVietExcelAdapter` ngay hay chờ xác nhận API? | Khảo sát: "chưa có API" |
| 5 | Có làm PWA mobile 5 tab hay giữ console PC? | |
| 6 | zca là kênh chính GĐ1 → cần **văn bản chấp nhận rủi ro** của khách (ToS) | Điều kiện chặn chạy thật |
| 7 | Bật `AUTO_SEND`? (AI tự chốt) | Cần văn bản đồng ý của khách = GĐ2 |
| 8 | DeepSeek chưa trong danh sách processor duyệt | Demo dữ liệu test OK; thật phải đổi Claude / bổ sung hợp đồng |

---

## 6. Ghi chú kỹ thuật Phase 3

- **Cờ `PERSISTENCE=memory\|prisma`** (mặc định `memory`) — **tách khỏi `DATABASE_URL`** (vì `.env` đã có sẵn URL cho docker). Demo/CI không đụng DB.
- **Prisma pin v6** — **KHÔNG nâng v7**: `@adminjs/prisma` chưa hỗ trợ.
- Panel `/admin` gated `ADMIN_UI=on` + `PERSISTENCE=prisma`; dynamic ESM import nên memory-mode **không nạp** AdminJS.
- MCP là **tiến trình riêng** (`pnpm --filter @ultty/api mcp`), tự đọc `DATABASE_URL`; sau khi ghi sẽ best-effort gọi `POST /knowledge/reload` để API đang chạy nạp lại snapshot.
- Integration test chạm Postgres gated `RUN_PRISMA_IT=1` → CI/máy không có DB tự skip.
