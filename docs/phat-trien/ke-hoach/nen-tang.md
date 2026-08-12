# KẾ HOẠCH NỀN TẢNG — ĐỢT 0 (Phase 3 còn lại → Phase 6)

> **Vai trò:** kế hoạch con mô tả PHẠM VI các việc nền — điều kiện cứng trước khi làm tính năng mới ([tinh-nang-dai-han.md](tinh-nang-dai-han.md)). **Không chứa trạng thái** — tiến độ/✅/⬜ xem [tong-quan.md](tong-quan.md) §3.1; mã D/A/B/C/E (quyết định + dữ liệu) định nghĩa ở [tong-quan.md](tong-quan.md) §4.
> Nguồn ngữ cảnh: [nghiệp vụ Ultty](../../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md) (nghiệp vụ + bảng sai lệch §13) · [kiến trúc hệ thống](../kien-truc/he-thong.md) (kiến trúc as-built).

**Nguyên tắc bất biến khi làm nền** (không thương lượng): LLM không tính tiền/không quyết chính sách · outbound theo policy tenant (đơn đủ dữ liệu trong ngưỡng tự gửi; vượt ngưỡng/lỗi thì chuyển người) · `AUTO_SEND` chỉ là kill switch · nguồn sự thật động trong Postgres (không hardcode) · mặc định `PERSISTENCE=memory` để demo/CI không cần DB · mỗi increment xanh test/lint/typecheck rồi mới sang increment sau.

---

## 1. Phase 3 còn lại — hoàn tất "nguồn sự thật động"

### 1.1 Lưu MỌI tin vào DB ngay khi nhận

- **Vì sao:** tuân thủ Luật BVDLCN 91/2025 + chống mất đơn khi Zalo khóa kênh (Zalo không replay tin); nền cho sửa đơn (F1), chống gian lận (F6b), công nợ (F5).
- **Phạm vi:** `MessagesRepository` (seam memory|prisma như Orders/Knowledge) — ghi bảng `messages` NGAY khi tin vào ingest (zca/bot/dán tay), TRƯỚC khi qua pipeline; chống trùng bằng unique `(platform, externalMessageId)`; nối `orders.messageId` khi đơn được tạo từ tin.
- **Ràng buộc media:** tin chỉ-ảnh vẫn phải vào DB; binary tải bất đồng bộ qua `MediaStore`, không dựa dài hạn vào URL Zalo.
- **Validate:** IT round-trip Postgres (gated `RUN_PRISMA_IT=1`); tin trùng không tạo 2 dòng; luồng memory giữ nguyên hành vi.

### 1.2 Rules-config động + sửa nghiệp vụ theo nguồn gốc

Căn cứ: bảng sai lệch [nghiệp vụ Ultty §13](../../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md). Gồm 4 việc:

| Việc | Nội dung | Cổng |
|---|---|---|
| VAT-default | Mặc định VAT theo **chính sách/đại lý** (PO công nợ B2B ghi "giá đã gồm GTGT") thay vì luôn off | **D8** |
| Phí COD dạng bảng | Thay `codFee` phẳng 20k bằng **bảng cấu hình** (theo giá trị/vùng — cấu trúc chốt khi có biểu mẫu) | **A3** |
| `cong_no_7` | Thêm enum + rule NẾU khách xác nhận là chính sách riêng | **D15** |
| Ship/risk/auto-confirm thành config | `RulesConfig` giữ cước/ngưỡng miễn ship/độ lệch; `AgentsConfig` giữ cờ risk; policy tenant riêng cho auto-confirm (`enabled`, tổng SL tối đa inclusive) để 20tr/30SP không thay ngưỡng 50 | A3 + quyết định 12/08 |

- **Validate:** test rules đổi theo config; đổi số qua `/admin` → đơn kế tiếp tính theo số mới (reload snapshot); số cũ vẫn là default khi bảng rỗng.

### 1.3 Import Excel A4 (đại lý + map nhóm)

- **Phạm vi:** lệnh/endpoint import file Excel theo mẫu (đại lý: tên/cấp/chính sách/SĐT/alias; map: chatId nhóm ↔ đại lý + chi nhánh) bằng **`read-excel-file`** *(🔄 11/07: thay `exceljs` — bỏ bảo trì ~3 năm, xem [tinh-nang-dai-han.md §7.2](tinh-nang-dai-han.md); vẫn tránh `xlsx`/`node-xlsx` vì CVE)*; dry-run báo lỗi từng dòng trước khi ghi; ghi xong gọi `reload()`.
- **Cổng:** **A4** (file khách điền). Mẫu file gửi khách soạn ngay không cần chờ — mẫu tại `docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx`, sinh + bảng map cột→field ở `tools/excel-template/` (dropdown đã khớp enum `Dealer`/`Group`; importer tái dùng đúng bảng map đó).
- **Validate:** import file mẫu → nhóm map đúng; dòng lỗi bị từ chối có lý do tiếng Việt.

---

## 2. Phase 4 — Tích hợp vận hành

| Việc | Nội dung | Cổng |
|---|---|---|
| ERP/KiotViet (sau GĐ1) | Giữ `ErpPort`; khi mở Phase ERP mới làm Excel/API + map SKU ↔ mã hàng. **GĐ1 không gọi port**, Sale nhập KiotViet thủ công sau khi nhận work item | **C1**, không chặn GĐ1 |
| Base | Sinh format chuẩn để dán tay (GĐ1); API/webhook nếu có tài liệu (GĐ2) — hiện CHƯA có code | **C2** |
| LLM | Flowise là adapter runtime (`PARSER_MODE=flowise`) nhưng model cho dữ liệu khách thật phải đổi sang Claude; DeepSeek chỉ dùng demo/test vì không có DPA phù hợp để bổ sung vào thỏa thuận | **D17** + **F4** |

---

## 3. Phase 5 — Auth + KPI + Feedback loop

- **Auth theo vai** `BPKD / KSNB / BPVH / Kế toán / Quản lý` — quy trình thật có **2 cổng KSNB** ([nghiệp vụ Ultty §3](../../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md)); vai "Giám sát" trong hệ thống ánh xạ KSNB. Hiện **mọi endpoint chưa có auth** (kể cả `POST /knowledge/reload`) → chặn production. Phương án đã chốt sau tra lại 11/07: **`express-session` (sẵn có) + guard/`@Roles()` tự viết + `argon2` 0.44** — bỏ tầng passport (chi tiết [tinh-nang-dai-han.md §7.2](tinh-nang-dai-han.md)).
- **Ghi `kpi_events`** (model có sẵn, chưa ghi): message_received · order_created · approved/rejected · sửa field — đủ tính 4 KPI ([kiến trúc §15.2](../kien-truc/he-thong.md)). Dashboard (F3) chỉ là tầng đọc phía trên.
- **Feedback loop:** lưu cặp (tin gốc, AI output, bản Sale sửa) vào `parse_feedback` → đề xuất glossary/few-shot mới. Cổng: **D5** (danh sách người dùng + vai).

---

## 4. Phase 6 — Deploy + Pilot

- Mô hình host: một VM NetViet có thể chứa nhiều dự án, nhưng **mỗi dự án là một Compose stack độc lập** với DB/user/secret/volume/network riêng. Stack đầu là `/srv/netviet/apps/zalo-ultty`, Compose project `zalo-ultty`; v1 không dùng `tenantId` vì không chia database.
- Luồng deploy: CI chạy lint/typecheck/test/build; image app và Flowise dẫn xuất được gắn git SHA, đẩy Artifact Registry, resolve digest; VM chỉ pull image. Chạy `prisma migrate deploy` trước API.
- Truy cập pilot chỉ qua IAP tunnel. Gateway bind `127.0.0.1:8080`, Flowise admin bind `127.0.0.1:3002`; PostgreSQL không publish port.
- Secret lấy từ Secret Manager; backup cả Zalo DB và Flowise DB lên GCS, giữ 7 bản ngày + 4 bản tuần và kiểm tra restore. Ops Agent + health timer cảnh báo endpoint, restart, RAM và disk.
- Pilot hạ tầng đầu tiên dùng `CHANNEL_MODE=mock`, `PARSER_MODE=flowise`, DeepSeek và dữ liệu TEST. Sau smoke/persistence/rollback/soak 24 giờ mới xem xét pilot 1-2 nhóm thật.
- **Pilot 1-2 nhóm thật** phải đổi model theo D17, bật kênh đọc always-on, đo 4 KPI rồi **go/no-go** mở rộng 200 nhóm.
- Cổng cho dữ liệu thật: **E3-E4** (vận hành/cảnh báo) + **B1-B2** (bộ đo trước go-live) + **D16** (văn bản rủi ro zca) + **D6** (mẫu thông báo nhóm) + **D7** (phạm vi + KPI chốt).

---

## 5. Bất biến nền và việc "thật hơn" còn treo

- **Đọc nốt 6 tài liệu gốc** chưa phản ánh: `QT Preoder` · `QT_Báo giá B2B` · `QT_Hoàn trả hàng B2B` · `QT_Tiếp xúc khách hàng` · `QT đưa sp vào TT` · `Biên bản bàn giao` → bổ sung [nghiệp vụ Ultty](../../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md).
- **Vòng đời `sent` tách khỏi `synced`:** `sent` = khách đã nhận xác nhận, Sale còn phải nhập ERP thủ công; `synced` chỉ dùng khi tích hợp ERP sau GĐ1. Nghiệp vụ nhóm vận chuyển 2.3/KSNB cổng 2/BPVH/ảnh giao hàng tiếp tục để sau GĐ1.
- **Campaign base:** nội dung draft → Sale duyệt → schedule window → delivery phân bổ; persistence/idempotency/retry/audit/cancel. Không dùng vòng `sleep` trong HTTP request làm scheduler.
- **Knowledge content:** binary ở Drive/object storage; provenance/mapping/FAQ/link/nội dung tư vấn + readiness trong DB/config và có UI `/settings` chuyên biệt.
- **App PWA mobile-first 5 tab** theo `docs/khach-hang/ultty/thiet-ke-giao-dien/` (hiện dùng console PC) — chờ **D3**.

## 6. Validation chung cho mọi increment

```bash
pnpm test && pnpm lint && pnpm typecheck      # memory mode, không cần DB
RUN_PRISMA_IT=1 pnpm --filter @netviet/api test # integration Postgres (cần docker)
node deploy/flowise/contract-test.mjs          # Flowise 3.1.4 + workflow + prediction key
```
