# Plan: Phase 3 — Nguồn sự thật ĐỘNG (Postgres + MCP tool + Giao diện chỉnh)

**Nhánh**: `feat/phase3-persistence` · **Ngày**: 09/07/2026 · **Complexity**: Large
**Nguồn nghiệp vụ**: xác định lại từ NGUỒN GỐC — `APP AI_...docx` (bản .md khảo sát) + thư mục `HỒ SƠ THÔNG TIN KHẢO SÁT KHÁCH HÀNG` (quy trình đặt hàng, 3 PO, bảng giá tháng 7). **KHÔNG** dựa vào `docs/nghiep-vu.md` (đã phát hiện sai lệch — mục B).

---

## A. TRẢ LỜI: "Vì làm động nên 'Dữ liệu nghiệp vụ còn thiếu' gác lại được không?"

**Đúng phần lớn — KHÔNG hoàn toàn.** Làm nguồn sự thật *động* (sửa qua UI + MCP) gỡ được thế chặn "phải thu đủ dữ liệu trước khi làm". Nhưng có 4 điểm **không chỉ là data nhập sau**:

**GÁC LẠI ĐƯỢC (thuần data — nhập dần qua UI/MCP):**
- 🔴 **A4** (danh sách đại lý + map nhóm→đại lý): ✅ nhập qua UI + **hộp thư "nhóm chưa map"**. Gác hoàn toàn.
- 🔴 **A2** (deal riêng/override giá): ✅ nhập qua UI. Gác hoàn toàn.
- Giá/SKU/glossary: ✅ sửa qua UI. (Giá đã nạp & **đã đối chiếu đúng** với bảng giá tháng 7 — mục B.)
- **Số tiền** phí COD/ship, ngưỡng công nợ: ✅ gác được **nếu** phơi ra thành "cấu hình rules" sửa được (số trong DB).

**KHÔNG gác đơn thuần được (cần lưu ý, không phải chỉ nhập data):**
1. **Cấu trúc phí COD** — thực tế COD tính theo *"biểu mẫu riêng"* (bảng/công thức), có thể theo giá trị/vùng, KHÔNG phải phí phẳng 20k. Nếu theo bậc → là **logic (code)**, không phải 1 ô số. → cần xem bảng COD; có thể làm bảng-cấu-hình nhiều dòng thay vì 1 số.
2. **Mặc định VAT** — hợp đồng công nợ B2B thực tế *đã gồm VAT* ("giá bao gồm GTGT, xuất HĐ theo từng lần giao"); code hiện mặc định KHÔNG VAT. → mặc định VAT nên theo *chính sách/đại lý* (đổi nhỏ ở rules).
3. **Thiếu chính sách `cong_no_7`** — khảo sát liệt kê PO công nợ 7/30/45; code chỉ có 30/45. → thêm enum + rule (code).
4. **B1–B2** (20–30 tin thật + đơn đúng) — KHÔNG phải data để *build*, mà là **cổng đo độ chính xác + bake-off model + go-live**. Làm động không xoá được nhu cầu này; **vẫn là điều kiện go-live** (chưa có thì chưa nên tin AI trên đơn thật).

**Kết luận:** ✅ **Tiến hành build hệ động ngay + gác việc THU THẬP A2/A3/A4** (nhập sau qua UI/MCP). Nhưng giữ 3 việc không-phải-data trong kế hoạch: (a) xác minh cấu trúc COD/ship (code vs config), (b) B1–B2 là cổng go-live, (c) sửa nghiệp vụ (cong_no_7, VAT-default, vai KSNB).

---

## B. NGHIỆP VỤ XÁC ĐỊNH LẠI TỪ NGUỒN GỐC — sai lệch với `nghiep-vu.md`

| # | Nguồn gốc nói gì | `nghiep-vu.md`/code hiện tại | Xử lý |
|---|---|---|---|
| B1 | Giá 19 SKU (Niêm yết/Bán lẻ/Bán lẻ tối thiểu/**Đơn giá CTV**) | seed.ts wholesale = Đơn giá CTV | ✅ **ĐÚNG** — đã đối chiếu khớp |
| B2 | PO gồm **Ký gửi, công nợ 7/30/45** | chỉ `cong_no_30`, `cong_no_45` | ⚠️ thêm `cong_no_7` (+ xác minh có thật là policy riêng) |
| B3 | Công nợ B2B **giá gồm VAT**, xuất HĐ mỗi lần giao; nhưng KS §6 "VAT tùy trường hợp" | rules mặc định KHÔNG VAT | ⚠️ VAT-default theo chính sách/đại lý (config) |
| B4 | Phí COD theo **"biểu mẫu riêng"** | `codFee` phẳng 20k | ⚠️ xác minh cấu trúc; có thể bảng-config |
| B5 | Ship: TH1 (giao đại lý) **miễn phí** (xác nhận ở mọi PGH); TH2 1 SP: Grab nội thành/Viettel tỉnh | khớp | ✅ đúng; mức cước tỉnh vẫn tạm tính (A3) |
| B6 | Duyệt thật: **BPKD → KSNB (2 cổng) → KH xác nhận → Base task → KSNB → BPVH**; chữ ký "Nhân viên + Giám sát" | "1 Sale duyệt 1 chạm" | ⚠️ vai KSNB = "Giám sát"; ảnh hưởng auth (Phase 5) + state machine |
| B7 | Điều khoản công nợ: phạt 1%/ngày, >60 ngày ngừng cấp, đơn kế tiếp phải trả nợ trước, báo trước 5 ngày | không mô hình | ℹ️ cho module theo dõi công nợ (sau); không cản Phase 3 |
| B8 | Mã hàng nội bộ dạng **số** (vd ELNI=`8716`) | SKU chữ (`ELNI`) | ℹ️ cần map SKU↔mã KiotViet (Phase 4) |
| B9 | Có quy trình **Preorder**, **Hoàn trả B2B**, **Báo giá B2B** (chưa đọc hết) | chưa phản ánh | ℹ️ bổ sung vào nghiep-vu.md (task tài liệu) |

> Sau khi chốt, **sửa lại `docs/nghiep-vu.md`** cho khớp nguồn gốc (task riêng), hoặc hạ nó xuống "bản nháp, tham chiếu code".

---

## C. KẾ HOẠCH PHASE 3 (đã điều chỉnh: + MCP tool + Giao diện chỉnh nguồn sự thật)

**Phạm vi mới** = Lưu trữ bền (Postgres/Prisma) **+ nguồn sự thật ĐỘNG**: sửa được qua **(1) Giao diện admin "Nguồn sự thật"** (người dùng) và **(2) MCP tool** (Claude/agent sửa bằng hội thoại). Một API + một DB, hai mặt truy cập.

**Nguyên tắc giữ nguyên:** mặc định **in-memory** (không `DATABASE_URL` → demo offline/CI không đổi); Prisma bật khi có `DATABASE_URL`. Docker Postgres đã có sẵn (`docker-compose.yml`).

### Patterns to Mirror
| Loại | Nguồn | Pattern |
|---|---|---|
| DI seam | [orders.repository.ts:8](../../apps/api/src/orders/orders.repository.ts) | abstract class + `{provide, useClass}` ([app.module.ts:37](../../apps/api/src/app.module.ts)) |
| Module theo domain | `apps/api/src/{channels,ingest,pipeline,rules,knowledge,orders}` | `*.service.ts` + `*.controller.ts` colocated |
| Nguồn sự thật | [knowledge.service.ts](../../apps/api/src/knowledge/knowledge.service.ts) + [domain.ts](../../apps/api/src/knowledge/domain.ts) | getter trả DTO "View" (shared) |
| Validation | shared zod ([order.ts](../../packages/shared/src/order.ts)) | zod schema + infer type |
| Config | [rules/config.ts](../../apps/api/src/rules/config.ts) | `DEFAULT_*_CONFIG` const |
| Test | `*.spec.ts` colocated, vitest | `new Service()` trực tiếp, AAA, tên tiếng Việt |
| Web | `apps/web` (Next.js console 3 cột) | [lib/format.ts](../../apps/web/lib/format.ts) |

### Increments (TDD, mỗi bước xanh test mới sang bước sau)

| # | Việc | Trạng thái |
|---|---|---|
| **1** | Scaffold Prisma (schema + client, chưa wiring) | ✅ **XONG** (commit d60ff05) |
| **2** | `OrdersRepository` → **async** + `PrismaOrdersRepository` + provider chọn theo **`PERSISTENCE`** *(đổi so với plan: KHÔNG gate theo `DATABASE_URL` vì `.env` đã có sẵn URL docker)*; docker postgres + `prisma migrate init` | ✅ `1c59248`,`114dbc5`,`b86a226` — IT round-trip Postgres |
| **3** | `KnowledgeRepository` seam (Seed mặc định) + `PrismaKnowledgeRepository` + `prisma/seed.ts` nạp SEED thật; nạp snapshot lúc boot + `reload()` (getter vẫn đồng bộ) | ✅ `7abb1d9` — IT loadSnapshot Postgres |
| **4** | `MessagesRepository` + **lưu MỌI tin ngay khi nhận** ở ingest (Zca/Bot/Copilot) — tuân thủ NĐ13, chống mất đơn | ⬜ **← việc tiếp theo** |
| **5** | ~~API CRUD nguồn sự thật (NestJS)~~ | ❌ **BỎ** — AdminJS (#7) auto-CRUD thay thế (kết quả search-first) |
| **6** | **MCP tool** `apps/api/src/mcp/` (`@modelcontextprotocol/sdk` 1.29, stdio): **8 tool**, logic tách transport, zod + kiểm FK; ghi **thẳng Prisma** + best-effort `POST /knowledge/reload` | ✅ `c066a06` — IT 11/11 + smoke stdio |
| **7** | **Giao diện "Nguồn sự thật"** = **AdminJS mount `/admin`** *(không phải `apps/web`)*: auto-CRUD 6 bảng + action **map nhóm→đại lý** + hộp thư `status=pending`; gated `ADMIN_UI=on`+`PERSISTENCE=prisma` | ✅ `d44149e` — verified boot + authed CRUD Postgres |
| **8** | Rules-config từ DB (ship/COD/VAT/ngưỡng thành data sửa được) + **sửa nghiệp vụ** (mục B) | ⬜ **BỊ CHẶN**: cần khách trả lời VAT-default + `cong_no_7` |
| **9** | Import Excel A4 (đại lý + map nhóm) bằng **`exceljs`** — ĐÃ chốt lib; **TRÁNH `xlsx`/`node-xlsx`** (CVE chưa vá) | ⬜ (khi có file khách) |

> **Trạng thái tổng:** increments **1,2,3,6,7 XONG + verified trên Postgres thật**; còn **4, 8, 9**. Nguồn sự thật về tiến độ: [docs/tien-do-va-ke-hoach.md](../../docs/tien-do-va-ke-hoach.md).

### Files to Change (chính)
| File | Action | Vì sao |
|---|---|---|
| `apps/api/prisma/schema.prisma` | UPDATE | thêm `rules_config`; (đã có phần lớn) |
| `apps/api/src/orders/orders.repository.ts` | UPDATE | async + Prisma impl |
| `apps/api/src/knowledge/knowledge.repository.ts` | CREATE | seam Seed/Prisma |
| `apps/api/src/knowledge/*.controller.ts` | UPDATE/CREATE | CRUD endpoints |
| `apps/api/src/messages/*` | CREATE | lưu tin |
| `apps/api/src/config/prisma.service.ts` | CREATE | PrismaClient lifecycle (onModuleInit/destroy) |
| `apps/api/src/app.module.ts` | UPDATE | provider chọn theo env |
| `apps/api/src/mcp/*` | ✅ ĐÃ TẠO | MCP server (**không** phải `tools/ultty-mcp`) |
| `apps/api/src/admin/*` | ✅ ĐÃ TẠO | UI admin = **AdminJS mount `/admin`** (**không** phải `apps/web`) |
| `packages/shared/src/*` | UPDATE | DTO/zod cho CRUD |
| `docs/nghiep-vu.md` | UPDATE | sửa theo nguồn gốc (mục B) |

### Validation (mỗi increment)
```bash
docker compose up -d postgres              # increment 2+
pnpm --filter @ultty/api exec prisma migrate dev
pnpm -r typecheck && pnpm -r test          # phải xanh (in-memory + Prisma)
pnpm --filter @ultty/api test              # test repo async + CRUD
# MCP: chạy server, gọi thử 1 tool (list_dealers) trả đúng
# UI: preview_start + kiểm hộp thư nhóm chưa map map được 1 nhóm
```

### Risks
| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| Async repo lan vỡ call site (orchestrator/service) | Trung bình | TDD, đổi từng bước, test bắt |
| Demo offline vỡ khi thêm Prisma | Thấp | in-memory là mặc định; Prisma opt-in `DATABASE_URL` |
| MCP tool sửa nguồn sự thật thiếu kiểm soát | Trung bình | MCP → API (validate tập trung); log audit |
| COD cấu trúc phức tạp hơn config | Trung bình | xác minh bảng COD trước khi code (B4) |
| Nhập tay A4 200 nhóm | Cao | hộp thư nhóm chưa map (1 chạm) + import Excel + gợi ý theo tên nhóm |

### Acceptance
- [ ] `pnpm -r test` + typecheck xanh ở CẢ 2 chế độ (in-memory mặc định; Prisma khi có `DATABASE_URL`).
- [ ] Sửa 1 đại lý/giá/glossary qua **UI** → phản ánh vào pipeline (không cần deploy).
- [ ] Map 1 "nhóm chưa map" qua UI 1 chạm → tin sau nhận đúng đại lý.
- [ ] Sửa cùng thứ đó qua **MCP tool** → cùng kết quả.
- [ ] Mọi tin nhận được **lưu DB ngay** (kiểm chứng bảng messages).
- [ ] Nghiệp vụ khớp nguồn gốc (cong_no_7, VAT-default) — không dựa nghiep-vu.md cũ.
