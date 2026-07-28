# KẾ HOẠCH NỀN TẢNG — ĐỢT 0 (Phase 3 còn lại → Phase 6)

> **Vai trò:** kế hoạch con mô tả PHẠM VI các việc nền — điều kiện cứng trước khi làm tính năng mới ([tinh-nang-dai-han.md](tinh-nang-dai-han.md)). **Không chứa trạng thái** — tiến độ/✅/⬜ xem [tong-quan.md](tong-quan.md) §3.1; mã D/A/B/C/E (quyết định + dữ liệu) định nghĩa ở [tong-quan.md](tong-quan.md) §4.
> Nguồn ngữ cảnh: [../nghiep-vu.md](../nghiep-vu.md) (nghiệp vụ + bảng sai lệch §13) · [../so-do-he-thong.md](../so-do-he-thong.md) (kiến trúc as-built).

**Nguyên tắc bất biến khi làm nền** (không thương lượng): LLM không tính tiền/không quyết chính sách · người giữ nút duyệt (`AUTO_SEND` mặc định off) · nguồn sự thật động trong Postgres (không hardcode) · mặc định `PERSISTENCE=memory` để demo/CI không cần DB · mỗi increment xanh test/lint/typecheck rồi mới sang increment sau.

---

## 1. Phase 3 còn lại — hoàn tất "nguồn sự thật động"

### 1.1 Lưu MỌI tin vào DB ngay khi nhận

- **Vì sao:** tuân thủ Luật BVDLCN 91/2025 + chống mất đơn khi Zalo khóa kênh (Zalo không replay tin); nền cho sửa đơn (F1), chống gian lận (F6b), công nợ (F5).
- **Phạm vi:** `MessagesRepository` (seam memory|prisma như Orders/Knowledge) — ghi bảng `messages` NGAY khi tin vào ingest (zca/bot/dán tay), TRƯỚC khi qua pipeline; chống trùng bằng unique `(platform, externalMessageId)` (thay bộ nhớ Set hiện tại khi ở chế độ prisma); nối `orders.messageId` khi đơn được tạo từ tin.
- **Ràng buộc:** ảnh — lưu `imageUrl` như đang có; việc TẢI ảnh về (URL Zalo có hạn) thuộc F4, chưa làm ở đây.
- **Validate:** IT round-trip Postgres (gated `RUN_PRISMA_IT=1`); tin trùng không tạo 2 dòng; luồng memory giữ nguyên hành vi.

### 1.2 Rules-config động + sửa nghiệp vụ theo nguồn gốc

Căn cứ: bảng sai lệch [../nghiep-vu.md §13](../nghiep-vu.md). Gồm 4 việc:

| Việc | Nội dung | Cổng |
|---|---|---|
| VAT-default | Mặc định VAT theo **chính sách/đại lý** (PO công nợ B2B ghi "giá đã gồm GTGT") thay vì luôn off | **D8** |
| Phí COD dạng bảng | Thay `codFee` phẳng 20k bằng **bảng cấu hình** (theo giá trị/vùng — cấu trúc chốt khi có biểu mẫu) | **A3** |
| `cong_no_7` | Thêm enum + rule NẾU khách xác nhận là chính sách riêng | **D15** |
| Ship/ngưỡng thành config | Đưa `RulesConfig` (cước 30k/40k, ngưỡng miễn ship, ngưỡng lệch 5%, từ khóa nội thành) + `AgentsConfig` (20tr/30SP/0.5) vào bảng cấu hình sửa được qua `/admin` + MCP, thay hằng số trong code | A3 |

- **Validate:** test rules đổi theo config; đổi số qua `/admin` → đơn kế tiếp tính theo số mới (reload snapshot); số cũ vẫn là default khi bảng rỗng.

### 1.3 Import Excel A4 (đại lý + map nhóm)

- **Phạm vi:** lệnh/endpoint import file Excel theo mẫu (đại lý: tên/cấp/chính sách/SĐT/alias; map: chatId nhóm ↔ đại lý + chi nhánh) bằng **`read-excel-file`** *(🔄 11/07: thay `exceljs` — bỏ bảo trì ~3 năm, xem [tinh-nang-dai-han.md §7.2](tinh-nang-dai-han.md); vẫn tránh `xlsx`/`node-xlsx` vì CVE)*; dry-run báo lỗi từng dòng trước khi ghi; ghi xong gọi `reload()`.
- **Cổng:** **A4** (file khách điền). Mẫu file gửi khách soạn ngay không cần chờ — mẫu tại `docs/mau/A4_dai-ly_map-nhom_U-Ultty.xlsx`, sinh + bảng map cột→field ở `tools/excel-template/` (dropdown đã khớp enum `Dealer`/`Group`; importer tái dùng đúng bảng map đó).
- **Validate:** import file mẫu → nhóm map đúng; dòng lỗi bị từ chối có lý do tiếng Việt.

---

## 2. Phase 4 — Tích hợp vận hành

| Việc | Nội dung | Cổng |
|---|---|---|
| KiotViet | `KiotVietExcelAdapter` (xuất file đúng format import) **hoặc** API client mỏng sau `KiotVietAdapter` sẵn có (OAuth2 client-credentials, token hạn **24h** — `expires_in` 86400, verify docs 11/07 — tại `id.kiotviet.vn/connect/token`, base `https://public.kiotapi.com`, header `Retailer`, 5.000 GET/giờ — tự viết, KHÔNG dep ngoài; SDK cộng đồng chỉ tham khảo) + **bảng map SKU ↔ mã hàng số** (vd ELNI=`8716`) | **C1** (file mẫu / xác nhận gói có API) |
| Base | Sinh format chuẩn để dán tay (GĐ1); API/webhook nếu có tài liệu (GĐ2) — hiện CHƯA có code | **C2** |
| LLM | Đổi `PARSER_MODE=claude` cho dữ liệu khách thật (DeepSeek chỉ demo/test) hoặc bổ sung DeepSeek vào thỏa thuận xử lý dữ liệu | **D17** + **F4** |

---

## 3. Phase 5 — Auth + KPI + Feedback loop

- **Auth theo vai** `BPKD / KSNB / BPVH / Kế toán / Quản lý` — quy trình thật có **2 cổng KSNB** ([../nghiep-vu.md §3](../nghiep-vu.md)); vai "Giám sát" trong hệ thống ánh xạ KSNB. Hiện **mọi endpoint chưa có auth** (kể cả `POST /knowledge/reload`) → chặn production. Phương án đã chốt sau tra lại 11/07: **`express-session` (sẵn có) + guard/`@Roles()` tự viết + `argon2` 0.44** — bỏ tầng passport (chi tiết [tinh-nang-dai-han.md §7.2](tinh-nang-dai-han.md)).
- **Ghi `kpi_events`** (model có sẵn, chưa ghi): message_received · order_created · approved/rejected · sửa field — đủ tính 4 KPI ([../so-do-he-thong.md §15.2](../so-do-he-thong.md)). Dashboard (F3) chỉ là tầng đọc phía trên.
- **Feedback loop:** lưu cặp (tin gốc, AI output, bản Sale sửa) vào `parse_feedback` → đề xuất glossary/few-shot mới. Cổng: **D5** (danh sách người dùng + vai).

---

## 4. Phase 6 — Deploy + Pilot

- Deploy Docker 1 VM (api + web + postgres + backup); kênh đọc always-on (zca listener không gián đoạn; nếu dùng bot → webhook thay long-poll); cảnh báo sự cố về kênh đã chốt ở **E4**.
- **Pilot 1-2 nhóm thật** → đo 4 KPI trên dữ liệu thật → **go/no-go** mở rộng 200 nhóm.
- Cổng: **E1-E4** (hạ tầng/vận hành) + **B1-B2** (bộ đo trước go-live) + **D16** (văn bản rủi ro zca) + **D6** (mẫu thông báo nhóm) + **D7** (phạm vi + KPI chốt).

---

## 5. Việc "thật hơn" còn treo (không chặn các phase trên)

- **Đọc nốt 6 tài liệu gốc** chưa phản ánh: `QT Preoder` · `QT_Báo giá B2B` · `QT_Hoàn trả hàng B2B` · `QT_Tiếp xúc khách hàng` · `QT đưa sp vào TT` · `Biên bản bàn giao` → bổ sung [../nghiep-vu.md](../nghiep-vu.md).
- **Mô hình hóa phần sau `synced`** (KSNB cổng 2 → BPVH → ảnh giao hàng → công nợ) — dùng 3 trạng thái enum dự phòng (`draft/approved/sent`) khi tách bước.
- **App PWA mobile-first 5 tab** theo `design/` (hiện dùng console PC) — chờ **D3**.

## 6. Validation chung cho mọi increment

```bash
pnpm test && pnpm lint && pnpm typecheck      # memory mode, không cần DB
RUN_PRISMA_IT=1 pnpm --filter @ultty/api test # integration Postgres (cần docker)
```
