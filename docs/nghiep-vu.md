# MÔ TẢ NGHIỆP VỤ — Hệ thống AI xử lý đơn hàng Zalo (U Ultty)

> **Vai trò tài liệu:** mô tả **nghiệp vụ as-built** — hệ thống hiện *đang làm gì* và áp *luật gì*, bám theo code thật (`rules/`, `agents/`, `knowledge/seed.ts`). Đây là tài liệu tra cứu nghiệp vụ cho Sale/kế toán/khách và cho người code.
> **Phân biệt với các tài liệu khác:**
> - `Thiet_ke_AI_Agent_U_Ultty.md` = **đề xuất giải pháp gốc của NetViet** (what was proposed — giữ nguyên).
> - [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md) = **quyết định kỹ thuật** (stack, module, pipeline).
> - [so-do-he-thong.md](so-do-he-thong.md) = **sơ đồ** minh hoạ (Mermaid).
> - Tài liệu này = **nghiệp vụ đã hiện thực** (con số, luật, quy trình đúng như code chạy).
> Cập nhật: 09/07/2026. Nguồn số liệu: [rules/config.ts](../apps/api/src/rules/config.ts), [agents/agents.config.ts](../apps/api/src/agents/agents.config.ts), [knowledge/seed.ts](../apps/api/src/knowledge/seed.ts).

---

## 1. Bối cảnh & mục tiêu nghiệp vụ

U Ultty (gia dụng cao cấp) bán sỉ cho **200–300 đại lý/CTV** qua **~200 nhóm Zalo** (+100–150 nhóm thi thoảng), **10–20 đơn/ngày**, chủ yếu đơn số lượng lớn chốt bằng **tin nhắn text viết tắt, không dấu** (<20% là ảnh chụp bảng). Quy trình hiện tại thủ công: chốt Zalo → gõ tay lên KiotViet → chuyển Base giao vận → ship Aha/Viettel. Chưa có API kết nối, chưa có IT nội bộ.

**Mục tiêu:** AI đọc tin đặt hàng → trích xuất đơn có cấu trúc → **Sale duyệt 1 chạm** → đồng bộ KiotViet/Base. Nguyên tắc lõi:

> **AI đọc hiểu — quy tắc chốt số — người giữ nút duyệt.** LLM chỉ phân loại ý định + trích xuất + soạn văn bản; **không tính tiền, không quyết chính sách**. Mọi số tiền do rules engine (TypeScript tất định) tính từ nguồn sự thật.

---

## 2. Vai trò người dùng (actors)

| Vai | Mô tả | Trong hệ thống |
|---|---|---|
| **Đại lý** | Đối tác lấy sỉ số lượng lớn, có chính sách công nợ/ký gửi | `tier = dai_ly`, gửi tin trong nhóm Zalo của mình |
| **CTV** | Cộng tác viên số lượng nhỏ, thường thanh toán ngay | `tier = ctv` |
| **Khách lẻ** | Khách cuối của đại lý (đơn TH2 giao thẳng) | `senderType = khach_le` |
| **Sale U Ultty** | Người **duyệt 1 chạm**, sửa field mờ, gửi xác nhận | dùng console/PWA |
| **Kế toán** | Kiểm tra khi lên hệ thống, quyết VAT | (GĐ sau: auth vai kế toán) |
| **Quản lý** | Duyệt đơn rủi ro/đơn lớn (KSNB) | nhận đơn leo thang từ Giám sát |
| **NetViet** | Vận hành managed service (khách chưa có IT) | hạ tầng, giám sát |

`SenderType` (suy từ cấp đại lý của nhóm): `dai_ly` · `ctv` · `khach_le` · `unknown` (nhóm chưa map → Giám sát leo thang).

---

## 3. Danh mục sản phẩm & mô hình giá

- **19 SKU chính** (bảng giá tháng 7.2026), mỗi SKU có tên đầy đủ + **aliases** (tên viết tắt đại lý hay nhắn, vd `felix`, `ghe felix`).
- Mỗi SKU có **4 mức giá**: `listPrice` (niêm yết) · `retailPrice` (bán lẻ đề xuất) · `minRetailPrice` (bán lẻ tối thiểu — sàn đại lý được bán ra) · **`wholesale` ("Đơn giá CTV") = giá đại lý/CTV TRẢ**.
- **Giá tính đơn = `wholesale`** (giá sỉ chung, như nhau mọi đại lý/CTV). Biết được **kể cả khi chưa map đại lý**.
- **Deal riêng:** một số đại lý lấy SL lớn có `DealerPriceOverride` (override `wholesale` theo `dealerId + sku`). Hiện **rỗng** — chờ dữ liệu khách (A2).

Ví dụ (số thật): Ghế Felix `wholesale = 1.250.000đ`; 10 cái = 12.500.000đ.

---

## 4. Phân loại đại lý & 4 chính sách

`tier`: `dai_ly` | `ctv`. Mỗi đại lý có **1 chính sách mặc định** (`defaultPolicy`), suy ra từ loại hợp đồng:

| Chính sách | Mã | Điều kiện áp dụng (nghiệp vụ) | Nhãn hệ thống |
|---|---|---|---|
| Công nợ 30 ngày | `cong_no_30` | Đại lý lấy SL lớn | "Công nợ 30 ngày (**từ ngày nhận hàng**)" |
| Công nợ 45 ngày | `cong_no_45` | Đại lý lấy SL lớn (hạn dài hơn) | "Công nợ 45 ngày (từ ngày nhận hàng)" |
| Ký gửi | `ky_gui` | Chỉ 2–3 bên; cuối tháng đối soát số bán → đơn bán + VAT | "Ký gửi (**chốt số cuối tháng**)" |
| Thanh toán ngay | `thanh_toan_ngay` | CTV số lượng nhỏ — CK trước khi giao | "Thanh toán ngay (100% khi giao)" |
| COD / thu hộ | `cod` | Giao cho khách của đại lý (TH2) | "COD (thu hộ khi giao)" |

> Ngưỡng SL áp công nợ 30 vs 45, danh sách bên ký gửi, biểu phí COD chi tiết: **chưa có từ khách (A3)** — hiện đặt mặc định hợp lý trong config.

---

## 5. Hai mẫu đơn & format PO chuẩn

**TH1 — giao cho đại lý.** Format: `Chi nhánh_Ngày_Tên đại lý` + các dòng SP.
Ví dụ: `HN_30.6_Meta HN — 10 x Ghế Felix — 1.250k/SP — Tổng: 12.500.000đ`.

**TH2 — giao thẳng khách lẻ của đại lý.** Thêm: tên khách — SĐT/địa chỉ — cước vận chuyển — thu hộ/không.
Nhận diện TH2: tin có **tên khách lẻ kèm SĐT (0 + 9 chữ số)** hoặc **địa chỉ giao**.

Đầu ra là **format xác nhận** dựng bởi rules engine ([rules.ts](../apps/api/src/rules/rules.ts) `buildConfirmation`): header `[chi nhánh]_[ngày]_[đại lý]`, danh sách dòng, tiền hàng, phí ship, VAT (nếu có), thu hộ (nếu có), TỔNG, chính sách.

---

## 6. Quy tắc tính tiền (rules engine — số chính xác)

Nguồn: [rules/config.ts](../apps/api/src/rules/config.ts). **LLM không đụng vào các con số này.**

| Luật | Giá trị hiện tại | Ghi chú |
|---|---|---|
| Giá 1 SKU | `wholesale` (hoặc deal riêng nếu có) | giá sỉ chung |
| **Miễn ship** | đơn có **tổng SL ≥ 2** → 0đ | `freeShipMinQuantity = 2` |
| **TH1 (giao đại lý)** | **luôn miễn ship** | PO: "miễn phí giao hàng đúng thời hạn" |
| Ship 1 SP nội thành | **30.000đ** (Grab, HN/HCM) | `shipFeeNoiThanh` — chỉ TH2 |
| Ship 1 SP đi tỉnh | **40.000đ** (Viettel) | `shipFeeTinh` — chỉ TH2 · *tạm tính, chờ A3* |
| **VAT** | **mặc định KHÔNG**; chỉ áp khi khách ghi "xuất VAT" và không ghi "ko VAT" | `vatRate = 10%` |
| **COD** | chỉ **TH2** + có "thu hộ/COD" → **20.000đ** | `codFee` — *demo cố định, chờ A3* |
| Đối chiếu tổng | lệch > **5%** giữa tổng khách ghi vs hệ thống → cảnh báo | `totalMismatchTolerance = 0.05` |
| Nội thành | từ khoá: `ha noi, hn, ho chi minh, hcm, sai gon, tphcm` | `noiThanhKeywords` |

Cảnh báo (đưa đơn về `needs_edit`): SP chưa map được, chưa xác định đại lý, tổng lệch quá ngưỡng.

---

## 7. Bảy loại ý định (intent) & vai xử lý

Nguồn: [intents.ts](../packages/shared/src/intents.ts), [agents.ts](../packages/shared/src/agents.ts) `INTENT_TO_ROLE`. Router chọn **đúng 1** intent/tin.

| Intent | Khi nào | Vai xử lý chính | Ví dụ |
|---|---|---|---|
| `dat_don` | Có **số lượng cụ thể** + tên SP | Bán hàng & chốt đơn | `gui 10 ghe felix ve TN cho c, ko VAT` |
| `hoi_gia` | Hỏi giá, **chưa chốt số lượng** | Chính sách & tài chính | `ghe felix bao nhieu tien c oi` |
| `hoi_san_pham` | Hỏi công năng/tư vấn, không hỏi giá | Tư vấn sản phẩm | `ghe felix ngoi lau co dau lung ko` |
| `chinh_sach_cong_no` | Hỏi công nợ/ký gửi/COD/hạn TT | Chính sách & tài chính | `thang nay cho cong no 45 ngay dc ko` |
| `bao_hanh_khieu_nai` | Lỗi/đổi trả/khiếu nại/giao sai-thiếu | Hậu mãi & bảo hành | `robot moi nhan 3 hom da ko sac dc` |
| `van_chuyen` | Hỏi tình trạng giao/mã vận đơn | Chính sách & tài chính (GĐ2: API vận đơn) | `don meta hn di den dau roi` |
| `khac` | Chào hỏi/off-topic/quá mơ hồ | Điều phối giữ, soạn câu lịch sự | `chao shop`, `a oi` |

---

## 8. Đội 6 agent (§5.1 NetViet)

**6 vai dưới 1 orchestrator, dùng chung 1 lần gọi LLM/tin** (Router parse) — KHÔNG phải 6 LLM độc lập. Chi tiết luồng: [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md) §5.

| Vai | Việc | Nguồn |
|---|---|---|
| **Điều phối** (Router) | Phân intent + xác định người gửi + dispatch | LLM (1 lần parse) |
| **Tư vấn sản phẩm** | Mô tả SP từ kho tri thức (RAG tất định) | knowledge |
| **Bán hàng & chốt đơn** | Bóc dòng, **gọi `priceOrder`** (DUY NHẤT vai này tính tiền), dựng phiếu TH1/TH2 | rules |
| **Chính sách & tài chính** | Chú thích công nợ/VAT/ship/COD; báo giá; trả lời công nợ | rules/knowledge |
| **Hậu mãi & bảo hành** | Phân nhánh bảo hành, định tuyến kỹ thuật | knowledge |
| **Giám sát** (Supervisor) | Đánh giá rủi ro → leo thang (0 LLM) | rules |

Mỗi tin sinh `AgentTrace` 6 bước (vai không tham gia = `skipped`), badge nguồn (`llm`/`rules`/`knowledge`) và `llmCalls` (minh bạch chi phí).

---

## 9. Giám sát & leo thang (assessRisk — số chính xác)

Nguồn: [agents.config.ts](../apps/api/src/agents/agents.config.ts), [risk-rules.ts](../apps/api/src/agents/risk-rules.ts). Tất định, 0 LLM.

**Leo thang người thật (`escalate` → `needs_edit`, KHÔNG auto-chốt):**
- Chưa xác định đại lý từ nhóm (nhóm chưa map).
- Dấu hiệu **khiếu nại gắt** (regex: `qua te`, `doi tra ngay`, `kien`, `lua dao`, `huy don`…).
- **Đơn lớn:** `grandTotal ≥ 20.000.000đ` (`largeOrderTotal`).

**Theo dõi (`watch`, gắn cờ vàng nhưng không chặn):**
- Tổng số lượng **≥ 30** (`largeOrderQuantity`).
- Đơn có cảnh báo (SP chưa map / tổng lệch).
- Độ tin cậy phân loại **< 0.5** (`lowConfidence`).

Triết lý (NetViet 5.6): **đơn sạch thì nhanh, đơn rủi ro thì chuyển người**.

---

## 10. Vòng đời đơn hàng & duyệt

State machine ([order.ts](../packages/shared/src/order.ts) `ORDER_STATUSES`):
`draft → pending_review → (needs_edit) → approved → sent/synced` · nhánh `rejected`.

- **GĐ1:** AI soạn → **Sale duyệt 1 chạm** → gửi xác nhận vào nhóm + đẩy KiotViet. AI **không tự gửi**.
- **`AUTO_SEND` (GĐ2, mặc định off):** đơn **không rủi ro** (Giám sát `riskLevel = none`, intent `dat_don`, đã định giá) → AI **tự chốt**; đơn rủi ro vẫn giữ cho Sale. Bật khi có **văn bản đồng ý của khách**.

---

## 11. Hậu mãi & bảo hành

AI **tiếp nhận + phân nhánh + tạo phiếu**, **không tự phán định lỗi** (kỹ thuật quyết). 3 nhánh ([risk-rules.ts](../apps/api/src/agents/risk-rules.ts) `classifyWarranty`):

| Nhánh | Nhận diện | Xử lý |
|---|---|---|
| **Giao sai/thiếu** | `giao sai`, `giao thieu`, `thieu hang`, `sai mau`… | Xác minh vận đơn & ảnh, bù/đổi |
| **Trong 7 ngày** | `moi mua`, `hom qua`, `vua nhan`, `7 ngay`… | 1 đổi 1 nếu lỗi NSX; xin ảnh/clip |
| **Ngoài 7 ngày** | (còn lại) | Bảo hành hãng (18–36 tháng); chuyển kỹ thuật |

---

## 12. Nguồn sự thật: glossary & map nhóm → đại lý

- **Glossary viết tắt** ([seed.ts](../apps/api/src/knowledge/seed.ts)): địa danh (`TN`=Thái Nguyên, `OCP`=Ocean Park), xưng hô (`c`=chị, `a`=anh), từ hay dùng (`ck`=chuyển khoản, `sll`=số lượng lớn, `cod`=thu hộ), cụm câu thật (`gui ve TN cho c`).
- **Map nhóm → đại lý theo `chatId` (ID nhóm), KHÔNG theo tên** ([knowledge.service.ts](../apps/api/src/knowledge/knowledge.service.ts) `resolveByChatId`): 1 nhóm Zalo → 1 đại lý → cấp + chính sách. Nhóm chưa map → `unknown` → Giám sát leo thang (fail-safe). *Hiện chỉ 3 nhóm mẫu — chờ danh sách đầy đủ (A4).*

---

## 13. Ranh giới AI vs Rules (bất di bất dịch)

| Việc | Ai làm |
|---|---|
| Phân loại intent, trích xuất SL + tên SP, soạn văn bản | **LLM** |
| Map SKU chuẩn, giá, ship, VAT, COD, chính sách, tổng tiền, format PO | **Rules engine (TS tất định)** |
| Đánh giá rủi ro, leo thang | **Rules (Giám sát)** |
| Duyệt cuối / quyết chính sách ngoại lệ / phán định lỗi | **Con người** |

Trạng thái THẬT vs MÔ PHỎNG của từng thành phần: xem [tien-do-va-ke-hoach.md](tien-do-va-ke-hoach.md) và [kich-ban-demo-toan-he-thong.md](kich-ban-demo-toan-he-thong.md) §13.2.

---

## 14. Dữ liệu nghiệp vụ còn thiếu (chặn chạy thật)

Chi tiết + cách hỏi: [checklist-du-lieu-khach.md](checklist-du-lieu-khach.md).

- 🔴 **A4** — danh sách đại lý/CTV + **map nhóm Zalo → đại lý** đầy đủ (hiện 3 nhóm mẫu).
- 🔴 **A3** — biểu phí COD + cước ship chi tiết + ngưỡng công nợ 30 vs 45 (hiện *tạm tính*).
- 🔴 **A2** — deal riêng của đại lý SL lớn (override giá sỉ).
- 🟠 **B1–B2** — 20–30 tin thật + đơn đúng (golden) để đo độ chính xác field-level.
