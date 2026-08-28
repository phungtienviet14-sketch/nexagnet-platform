# NGUỒN SỰ THẬT — NGHIỆP VỤ VẬN TẢI (T0)

- **Khách hàng:** Công ty **Vận tải Việt** — khách vận tải đầu tiên, đóng vai **reference tenant** của vertical Transport.
- **Ngày lập:** 28/08/2026
- **Mốc:** `TRANSPORT SOURCE TRUTH v0`
- **Tài liệu kế tiếp:** [`../../../kien-truc/transport-domain-contract.md`](../../../kien-truc/transport-domain-contract.md) (T1 — hợp đồng domain, trung tính, không nhắc tên khách)

> **File này chỉ chứa SỰ KIỆN đọc được từ nguồn**, kèm phân loại và trạng thái. Mọi thiết kế của
> chúng ta nằm ở T1. Chỗ nào file này ghi `DERIVED_DESIGN` là **ghi chú cầu nối** sang T1, không
> phải yêu cầu của khách — và nó được đánh dấu tường minh để không ai đọc nhầm thành lời khách nói.

---

## 1. Nguồn

### 1.1. Nguồn nghiệp vụ của khách — đã kiểm chứng

| Trường | Giá trị |
|---|---|
| **Tên file** | `Phan_tich_nghiep_vu_App_Van_Tai.pdf` |
| **Đường dẫn (ngoài repo)** | `C:\Users\phung\Documents\vietpt\khoi_nghiep\van_tai\customer_docs\van_tai_viet\Phan_tich_nghiep_vu_App_Van_Tai.pdf` |
| **SHA-256** | `a7f61b1f3778d2be4212ba0e6f4be0ef2824bdf3b535a198748eb5d5f42bbb3a` |
| **Kích thước** | 1.035.477 bytes |
| **Nhan đề trong file** | "TÀI LIỆU PHÂN TÍCH NGHIỆP VỤ — Xây dựng ứng dụng quản lý vận tải", phiên bản 1.0, tháng 7/2026 |
| **Số trang / mục** | 14 trang, 13 mục (mục 13 là phụ lục wireframe) |
| **Người viết** | Chính khách hàng |
| **Trạng thái** | `VERIFIED` — đã đọc toàn văn 14/14 trang; SHA-256 và kích thước do **phiên này tự đo lại**, khớp với bản ghi có sẵn ở `khoi_nghiep/van_tai/baseDocs/sources/SOURCES.md` |

> **Vì sao PDF KHÔNG được commit vào repo này.** `nexagnet-platform` là repo **PUBLIC** (đo bằng
> `gh repo view --json visibility` ngày 28/08/2026). Đưa tài liệu phân tích nghiệp vụ nội bộ của
> một khách hàng vào đây là **công bố nó ra ngoài** — cùng loại rủi ro mà `.gitignore` dòng 18
> đang chặn cho hồ sơ khảo sát Ultty. Tính toàn vẹn ở đây được bảo đảm bằng **SHA-256 ghi trong
> bảng trên**, không bằng một bản sao. Muốn kiểm tra:
>
> ```bash
> sha256sum "C:/Users/phung/Documents/vietpt/khoi_nghiep/van_tai/customer_docs/van_tai_viet/Phan_tich_nghiep_vu_App_Van_Tai.pdf"
> ```
>
> Nếu sau này khách đồng ý bằng văn bản cho phép lưu tài liệu, đặt nó vào
> `docs/khach-hang/van-tai-viet/nguon-goc/` và **thêm dòng gitignore trước**, không phải sau.

### 1.2. Nguồn tham khảo THIẾT KẾ — `sonic_van_tai` (không phải nguồn nghiệp vụ)

| Trường | Giá trị |
|---|---|
| **Vị trí (ngoài repo)** | `C:\Users\phung\Documents\vietpt\khoi_nghiep\van_tai\` |
| **Đã đọc** | `baseDocs/Bounded Context và Aggregate Root.md` · `baseDocs/sources/SOURCES.md` · `docs/DECISIONS.md` (đọc chọn lọc) |
| **Vai trò** | **Chỉ tham khảo lập luận miền (domain reasoning).** Đây là một nỗ lực tổng quát hóa TRƯỚC ĐÓ trên **cùng một PDF khách** |
| **KHÔNG được lấy** | Toàn bộ quyết định công nghệ: Java/Spring Boot, Gradle, Keycloak, Flyway, realm-per-tenant, `platform_db` riêng, plugin loader động, module map 19 BC, Expo/React Native |

**Lý do tin được phần lập luận miền:** `sonic_van_tai` sinh ra từ **đúng file PDF này**, cùng
SHA-256 — nên khi nó nói về Trip/Wallet/Fuel thì nó đang nói về cùng một nghiệp vụ, không phải một
khách khác. **Lý do không lấy phần công nghệ:** nó chọn stack cho một hệ thống mới dựng từ đầu;
Nexagnet đã có stack đang chạy thật (xem [T1](../../../kien-truc/transport-domain-contract.md) §3).

**Một nguồn của `sonic_van_tai` vẫn thiếu:** `SOURCES.md` của nó ghi
`Thiet_ke_nghiep_vu_Base_va_kien_truc_Plugin.pdf` ở trạng thái `UNVERIFIED_SOURCE` (file không tồn
tại). Phụ lục D của tài liệu đó vì thế là **bản ghi lịch sử**, không phải ma trận truy vết kiểm
chứng được. **Không** dùng Phụ lục D làm căn cứ cho bất cứ khẳng định nào ở đây.

### 1.3. Nguồn kiến trúc Nexagnet hiện tại — đo trực tiếp trên `origin/main` = `2ad6a15`

| Nguồn | Dùng để xác định |
|---|---|
| `packages/tenant/src/tenant.schema.ts` | `CAPABILITY_IDS` (7), `EXPERIENCE_IDS` (3), `capabilityRequirements`, `EXPERIENCE_REQUIREMENTS` |
| `apps/api/src/app-composition.ts` | Mô hình owner typed `CapabilityId \| 'foundation'` |
| `apps/api/src/auth/auth.types.ts`, `roles.guard.ts` | `USER_ROLES = ['SALE','MANAGER','ACCOUNTING','ADMIN']`, guard theo vai trò phẳng |
| `apps/api/prisma/schema.prisma` | Kiểu tiền (`Int`), `AuditLog`, `PricePeriod`, `RuleConfigVersion`, `SourceProvenance` |
| `apps/web/experiences/experience-registry.tsx` | Một tenant resolve **đúng một** experience |
| `docs/kien-truc/nen-tang-da-khach.md` | Silo deployment, chưa có `tenantId`, port/adapter |

---

## 2. Cách đọc bảng sự kiện

**Mã:** `VT-nnn` — sự kiện lấy từ PDF của Vận tải Việt. Số nhóm theo mục nguồn.

**Phân loại** (đúng một giá trị chính, theo T1 §5):

| Mã | Nghĩa |
|---|---|
| `A` | Generic platform primitive — mọi vertical đều cần |
| `B` | Reusable Transport domain capability — mọi khách vận tải đều cần |
| `C` | Tenant policy/config — cùng hình dạng, khác tham số |
| `D` | Tenant data/content — dữ liệu vận hành của riêng khách |
| `E` | Tenant integration — adapter ra hệ thống ngoài |

**Trạng thái:**

| Trạng thái | Nghĩa |
|---|---|
| `CONFIRMED` | Đọc thẳng ra từ nguồn, không suy diễn |
| `CONFLICT` | Hai chỗ trong nguồn nói khác nhau, hoặc nguồn khác thiết kế tham khảo |
| `MISSING` | Nghiệp vụ đụng tới nhưng nguồn không nói |
| `OPEN_DECISION` | Phải hỏi khách/product owner, không được tự đoán |
| `OUT_OF_SCOPE` | Nguồn nói rõ là tùy chọn, hoặc nằm ngoài v1 |
| `DERIVED_DESIGN` | **Của chúng ta**, không phải của khách |

---

## 3. Sự kiện — Tổng quan & nguyên tắc thiết kế (nguồn §1)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-001 | Quy mô khoảng **10 xe đầu kéo**. Ứng dụng nhằm số hoá toàn bộ hoạt động vận hành | tr.1, tr.2 §1 | `C` | `CONFIRMED` |
| VT-002 | Vấn đề thực tế: không kiểm soát được vị trí/tình trạng xe và chuyến; chi phí (đặc biệt nhiên liệu) dễ thất thoát; giấy tờ pháp lý dễ quên hạn; đối chiếu công nợ tốn thời gian. Hiện làm thủ công qua **Excel/Zalo** | tr.2 §1 | — | `CONFIRMED` |
| VT-003 | **Giao diện lái xe phải cực kỳ đơn giản** (chủ yếu chụp ảnh + xác nhận) vì lái xe không rành công nghệ | tr.2 §1 | `B` | `CONFIRMED` |
| VT-004 | "Mọi khoản tiền (chi phí, tạm ứng, công nợ, hoa hồng) đều phải **gắn được** vào một Chuyến hàng cụ thể, để tính lãi/lỗ chính xác theo từng chuyến, từng xe" | tr.2 §1 | `B` | `CONFLICT` → xem C-01 |
| VT-005 | Phân quyền **tối giản**: Giám đốc làm gần như toàn bộ điều hành, Kế toán ghi chép/đối chiếu, Lái xe chỉ thao tác trên điện thoại | tr.2 §1 | `C` | `CONFIRMED` |
| VT-006 | Ứng dụng gồm **9 nhóm chức năng nghiệp vụ** (liệt kê ở §2 nguồn) | tr.2 §2 | `B` | `CONFIRMED` |

---

## 4. Sự kiện — Xe & Lái xe (nguồn §3)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-010 | Hồ sơ xe: biển số, loại xe, **tải trọng cho phép** | tr.3 §3.1 | `B` | `CONFIRMED` |
| VT-011 | Hạn giấy tờ xe: **đăng kiểm, bảo hiểm, phù hiệu kinh doanh vận tải** | tr.3 §3.1 | `B` | `CONFIRMED` |
| VT-012 | Số công tơ mét (odo) hiện tại — **cập nhật tự động mỗi lần đổ dầu** | tr.3 §3.1 | `B` | `CONFIRMED` |
| VT-013 | Trạng thái xe: **đang chạy / đang rảnh / đang bảo dưỡng** (3 giá trị) | tr.3 §3.1 | `B` | `CONFIRMED` |
| VT-014 | Hồ sơ lái xe: thông tin cá nhân, SĐT, **hạng và hạn GPLX**, xe được gán phụ trách *"(nếu cố định 1 lái xe/1 xe)"* | tr.3 §3.2 | `B` | `CONFIRMED` |
| VT-015 | Cảnh báo tự động **trước 15–30 ngày** khi đăng kiểm/bảo hiểm/phù hiệu xe/GPLX sắp hết hạn, **tổng hợp chung vào một màn hình** cho giám đốc | tr.3 §3.3 | `C` | `CONFIRMED` (ngưỡng là **khoảng**, không phải một số → phải là config, xem C-07) |

> **VT-012 quan trọng hơn vẻ ngoài của nó.** Nguồn nói odo đến từ **phiếu đổ dầu**, không từ GPS,
> không từ nhập tay riêng. Cùng một odo đó lại là đầu vào của cảnh báo bảo dưỡng (VT-063) và của
> định mức tiêu hao (VT-046). Nghĩa là: **phiếu dầu là nguồn odo duy nhất được nguồn mô tả**, và
> một phiếu dầu sai/thiếu làm hỏng cả ba nghiệp vụ chứ không riêng công nợ dầu.

> **VT-014 chứa một chữ "nếu".** Gán xe cố định cho một lái xe là **tùy chọn của khách**, không
> phải bất biến của miền. Không được thiết kế `Vehicle.driverId` bắt buộc.

---

## 5. Sự kiện — Chuyến hàng / Trip (nguồn §4)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-020 | **Chuyến hàng là đối tượng trung tâm** — mọi chi phí, tạm ứng, dầu, hoa hồng, doanh thu đều gắn vào một chuyến cụ thể để tính lãi/lỗ | tr.3 §4 | `B` | `CONFIRMED` |
| VT-021 | Thông tin chuyến: điểm đi/điểm đến, khách hàng, loại hàng hóa, **giá cước thu khách (doanh thu)**, xe và lái xe thực hiện (hoặc đối tác ngoài) | tr.3 §4.1 | `B` | `CONFIRMED` |
| VT-022 | Trạng thái chuyến: **Chờ thực hiện → Đang chạy → Đã giao → Đã đối soát** (4 trạng thái, tuyến tính) | tr.3 §4.1 | `B` | `CONFIRMED` |
| VT-023 | **Ba loại chuyến** phân theo nguồn gốc, bảng 3 cột (ai chạy xe / chi phí vận hành / khoản tài chính đặc thù) | tr.3 §4.2 | `B` | `CONFIRMED` |
| VT-023a | *Tự chạy — khách trực tiếp*: xe công ty · chi phí đầy đủ (dầu, tạm ứng...) · doanh thu trực tiếp | tr.3 §4.2 | `B` | `CONFIRMED` |
| VT-023b | *Thuê xe ngoài chạy hộ*: xe đối tác ngoài · **không quản lý chi phí vận hành ("việc của đối tác")** · hoa hồng công ty **được hưởng** | tr.3 §4.2 | `B` | `CONFIRMED` |
| VT-023c | *Nhận chạy hộ cho đối tác*: xe công ty · chi phí đầy đủ như chuyến tự chạy · hoa hồng công ty **phải trả** | tr.3 §4.2 | `B` | `CONFIRMED` |

> **"Đã đối soát" là một trạng thái CHUYẾN, không phải trạng thái công nợ.** Nguồn xếp nó vào cùng
> dãy với "Đã giao" ở §4.1. Nhưng đối soát dầu (§6.4), đối soát đối tác (§8.2) và đối soát khách
> hàng là **ba kỳ khác nhau, đóng vào ba thời điểm khác nhau**. Nguồn **không nói** cái nào phải
> đóng thì chuyến mới được coi là "Đã đối soát" → xem `OPEN-14`.

---

## 6. Sự kiện — Chi phí chuyến & Sổ quỹ lái xe (nguồn §5)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-030 | Bốn nhóm chi phí chuyến: **Vận hành trên đường** (phí cầu đường/BOT, cầu phà) · **Tại điểm giao/nhận** (bốc xếp, lưu container, hạ/nâng cont, cân xe, bến bãi) · **Phát sinh trên đường** (sửa chữa nhỏ, vá lốp, phạt vi phạm, ăn ở lái xe) · **Chi phí cố định phân bổ** | tr.4 §5.1 | `B` (nhóm) / `C` (danh mục cụ thể) | `CONFIRMED` |
| VT-031 | Chi phí cố định phân bổ (khấu hao xe, bảo hiểm, đăng kiểm, lương cứng, bảo dưỡng) — **"không ứng tiền mặt, tự động phân bổ vào giá thành"** | tr.4 §5.1 | `B` | `CONFIRMED` (công thức phân bổ **không có** → `OPEN-11`) |
| VT-032 | Mô hình **"Sổ quỹ lái xe" thay vì tạm ứng theo từng chuyến**: thực tế lái xe cầm một khoản tiền và chạy liên tục nhiều chuyến, chỉ về quyết toán định kỳ (tuần/tháng) | tr.4 §5.2 | `B` | `CONFIRMED` |
| VT-033 | **Ứng tiền: nạp tiền vào "ví" của lái xe, KHÔNG gắn với 1 chuyến cụ thể** | tr.4 §5.2 | `B` | `CONFIRMED` |
| VT-034 | Chi phí phát sinh mỗi ngày/mỗi chuyến, **trừ dần vào sổ quỹ, đồng thời vẫn được gắn nhãn chuyến hàng** để tính lãi/lỗ | tr.4 §5.2 | `B` | `CONFIRMED` |
| VT-035 | **Số dư quỹ = Tổng đã ứng − Tổng đã chi** → theo dõi liên tục số tiền công ty đang "cho lái xe giữ" | tr.4 §5.2 | `B` | `CONFIRMED` (bất biến) |
| VT-036 | Quyết toán theo chu kỳ (cuối tháng): đối chiếu số dư, **lái xe nộp lại tiền dư hoặc công ty ứng thêm** | tr.4 §5.2 | `B` | `CONFIRMED` |
| VT-037 | **Kiến trúc dữ liệu 2 lớp**: (1) *Lớp Sổ quỹ lái xe* ghi dòng tiền thực tế (ứng / chi / nộp lại / điều chỉnh); (2) *Lớp Chi phí chuyến hàng* dùng tính lãi/lỗ, **độc lập với việc tiền lấy từ đâu**. Hai lớp liên kết qua Chuyến hàng | tr.4 §5.3 | `B` | `CONFIRMED` |
| VT-038 | Màn hình: danh sách sổ quỹ theo từng lái xe, **cảnh báo số dư âm kéo dài hoặc dương bất thường**; chức năng "Ứng thêm"; chức năng "Quyết toán kỳ" — chốt số dư, **in phiếu cho lái xe ký xác nhận** | tr.4 §5.4 | `B` | `CONFIRMED` |

> **VT-037 là sự kiện có giá trị kiến trúc cao nhất trong toàn tài liệu nguồn.** Khách tự mô tả
> đúng cái ranh giới mà một thiết kế ngây thơ hay làm hỏng: gộp "tiền lái xe đang giữ" và "giá
> thành chuyến" vào một sổ. Nguyên văn: *"một khoản chi vừa trừ vào sổ quỹ của lái xe, vừa cộng vào
> chi phí của chuyến tương ứng — nhờ đó kiểm soát được cả công nợ tạm ứng (theo lái xe) lẫn lãi/lỗ
> (theo chuyến) mà không lẫn lộn."*

> **VT-035 + VT-033 quyết định hình dạng dữ liệu.** Số dư là **kết quả cộng dồn của các bút toán**,
> nên nó không được là một cột cập nhật tại chỗ; và vì ứng tiền không gắn chuyến (VT-033) nên
> `tripId` trên sổ quỹ **phải nullable**. Đây chính là điểm mà chỉ thị "Trip là trung tâm" (VT-004)
> bị hiểu sai thành "mọi bảng đều có `tripId NOT NULL`".

> **VT-038 "in phiếu cho lái xe ký xác nhận"** là một yêu cầu **xuất bản/in ấn**, không phải một
> màn hình. Nền tảng hiện chưa có năng lực này → `PG-12` ở T1.

---

## 7. Sự kiện — Nhiên liệu (nguồn §6)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-040 | Dầu là **khoản chi phí lớn nhất (35–45% chi phí chuyến)** | tr.5 §6 | — | `CONFIRMED` |
| VT-041 | Luồng công nợ **khác hẳn** chi phí khác: lái xe **không trả tiền mặt mà ký nhận (ký nợ)** tại cây xăng; công ty thanh toán thẳng cho cây xăng theo kỳ sau khi đối chiếu | tr.5 §6 | `B` | `CONFIRMED` |
| VT-042 | Lái xe **chụp ảnh phiếu/hóa đơn đã ký, gửi về công ty ngay** — dùng làm bằng chứng đối chiếu nội bộ **theo thời gian thực** | tr.5 §6.1 | `B` | `CONFIRMED` |
| VT-043 | **Cuối kỳ (thường cuối tháng), cây xăng gửi bảng kê tổng hợp** cho công ty | tr.5 §6.1 | `B` | `CONFIRMED` (định dạng **không nói** → `OPEN-03`) |
| VT-044 | Kế toán đối chiếu bảng kê với các phiếu lái xe đã gửi trong kỳ → **khớp thì lập công nợ phải trả và thanh toán 1 lần** | tr.5 §6.1 | `B` | `CONFIRMED` |
| VT-045 | Mỗi lần đổ dầu ghi: **số tiền, số lít** (*"không chỉ số tiền — cần thiết để tính định mức tiêu hao"*), **odo tại thời điểm đổ**, cây xăng/đại lý, ảnh phiếu đã ký, và **trạng thái đối chiếu: Chưa đối chiếu / Đã khớp / Lệch** | tr.5 §6.2 | `B` | `CONFIRMED` |
| VT-046 | **Tiêu hao (lít/100km) = Số lít đổ ÷ (Odo hiện tại − Odo lần đổ trước) × 100**; so sánh với **định mức chuẩn của từng xe**; cảnh báo khi vượt bất thường — dấu hiệu rò rỉ, hao phí hoặc khai khống | tr.5 §6.3 | `B` (công thức) / `C` (định mức) | `CONFIRMED` |
| VT-047 | Hệ thống **tự động so khớp từng dòng** bảng kê cây xăng với phiếu lái xe **theo ngày, số tiền, xe** | tr.5 §6.4 | `B` | `CONFIRMED` (dung sai **không nói** → `OPEN-04`) |
| VT-048 | Dòng khớp → vào **công nợ phải trả cây xăng** của kỳ. Dòng lệch (**thiếu chứng từ 1 trong 2 phía**) → **cảnh báo kiểm tra thủ công** — *"điểm chống thất thoát quan trọng nhất"* | tr.5 §6.4 | `B` | `CONFIRMED` |
| VT-049 | Hỗ trợ quản lý **nhiều cây xăng đối tác khác nhau theo từng tuyến** | tr.5 §6.4 | `B`/`D` | `CONFIRMED` |

> **VT-047 cho biết khóa so khớp, và đó là một khóa KHÔNG DUY NHẤT.** `(ngày, số tiền, xe)` có thể
> trùng thật: một xe đổ hai lần cùng ngày cùng mệnh giá là chuyện xảy ra được. Nguồn **không nói**
> phải xử lý thế nào → `OPEN-05` (phiếu trùng) và `OPEN-04` (dung sai). Đây không phải chi tiết
> hiện thực — nó quyết định bảng đối soát có thể tự khớp sai hay không.

> **VT-048 đặt ra một ranh giới mà nguồn KHÔNG vượt qua.** Dòng lệch → *cảnh báo kiểm tra thủ
> công*. Nguồn **không** nói dòng lệch tạo ra khoản lái xe phải bồi thường. Đối chiếu với VT-062
> ("trừ vào lương ... nếu thiếu chứng từ") thì đây là một **xung đột thật** → C-02.

---

## 8. Sự kiện — Đối tác vận tải hai chiều (nguồn §7, §8)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-050 | Thuê xe ngoài: công ty thu của khách giá **X**, trả nhà xe ngoài giá **Y** (Y < X), **chênh lệch X − Y là hoa hồng công ty được hưởng** | tr.5 §7 | `B` | `CONFIRMED` |
| VT-051 | Chuyến thuê ngoài: công ty **không quản lý vận hành** — *"không có dữ liệu dầu, sổ quỹ lái xe của xe ngoài"* — **chỉ quản lý phần tài chính** | tr.5 §7 | `B` | `CONFIRMED` (yêu cầu **phủ định**) |
| VT-052 | Nhận chạy hộ: đối tác mang đơn về, thuê xe công ty chạy. **Vận hành y hệt chuyến tự chạy** (đầy đủ dầu, tạm ứng, sổ quỹ), chỉ khác là **có thêm hoa hồng phải trả** cho đối tác đã mang đơn | tr.6 §8 | `B` | `CONFIRMED` |
| VT-053 | Cấu hình hoa hồng **dùng chung cho cả 2 chiều**: áp dụng theo *tất cả đối tác / một đối tác cụ thể / một tuyến cụ thể*; cách tính *% trên giá cước, hoặc số tiền cố định theo chuyến, hoặc theo tuyến*; **chiều áp dụng**; và **"lưu lịch sử theo ngày hiệu lực khi mức hoa hồng thay đổi"** | tr.6 §8.1 | `B` (cơ chế) / `C` (mức) | `CONFIRMED` |
| VT-054 | **Một đối tác có thể vừa là nhà xe cho thuê, vừa là nguồn mang đơn** — *"cần tách 2 chiều công nợ rõ ràng, không gộp chung"* | tr.6 §8.2 | `B` | `CONFIRMED` |
| VT-055 | Bảng đối chiếu theo kỳ: từng chuyến, giá cước, giá trả/hoa hồng, tổng phải thu, tổng phải trả, **số dư ròng cuối kỳ**. Trạng thái: **Chưa đối chiếu / Khớp / Lệch** | tr.6 §8.2 | `B` | `CONFIRMED` (xem C-04) |

> **VT-053 là yêu cầu bất biến lịch sử do CHÍNH KHÁCH nêu ra.** *"Lưu lịch sử theo ngày hiệu lực
> khi mức hoa hồng thay đổi"* — nghĩa là khách đã tự yêu cầu rằng đổi mức hoa hồng hôm nay **không
> được** làm đổi kết quả của chuyến đã tính trước đó. Guardrail
> `NO_CURRENT_RULE_RECOMPUTES_SETTLED_HISTORY` ở T1 **không phải** là chúng ta áp đặt "best
> practice" — nó có nguồn.

---

## 9. Sự kiện — Nghiệp vụ bổ sung (nguồn §9)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-060 | Lương lái xe **hỗn hợp**: lương cơ bản + khoán theo chuyến/km + **thưởng tiết kiệm dầu** − phạt vi phạm/hư hỏng | tr.7 §9.1 | `B` (cấu trúc) / `C` (tham số) | `CONFIRMED` |
| VT-061 | Lương **tự động tổng hợp từ dữ liệu Chuyến hàng đã có** (số chuyến, **km**, chênh lệch tiêu hao dầu) | tr.7 §9.1 | `B` | `CONFIRMED` (nguồn của **km** không nói → `OPEN-12`) |
| VT-062 | **"Đối chiếu với sổ quỹ tạm ứng — trừ vào lương cuối tháng nếu lái xe còn nợ ứng/thiếu chứng từ"** | tr.7 §9.1 | `C` | `CONFLICT` → C-02; hợp pháp hoá → `OPEN-10` |
| VT-063 | Bảo dưỡng: lịch định kỳ **theo km hoặc thời gian**; **cảnh báo dựa trên odo cập nhật từ mỗi lần đổ dầu**; lịch sử sửa chữa từng xe để phát hiện xe tốn chi phí bất thường; **tách biệt với "chi phí sửa chữa phát sinh trên đường"** | tr.7 §9.2 | `B` | `CONFIRMED` |
| VT-064 | Khách hàng: danh mục, **đơn giá cước riêng theo từng khách/tuyến**; **hạn mức công nợ cho phép — cảnh báo trước khi giao hàng nếu khách đang nợ quá hạn**; theo dõi **thời hạn thanh toán theo hợp đồng (15/30/45 ngày)** | tr.7 §9.3 | `B` (cơ chế) / `C`,`D` (hạn mức, giá) | `CONFIRMED` |
| VT-065 | Giấy tờ pháp lý: phù hiệu xe, giấy phép kinh doanh vận tải, đăng kiểm, bảo hiểm, GPLX — **gộp vào một dashboard cảnh báo hết hạn duy nhất**; **giấy phép vận chuyển riêng nếu chở hàng có điều kiện** (hóa chất, hàng nguy hiểm) | tr.7 §9.4 | `B` | `CONFIRMED` |
| VT-066 | Vận đơn / chứng từ giao nhận — **"(tuỳ chọn mở rộng)"**: phiếu giao nhận **có chữ ký hai đầu** (bằng chứng khi tranh chấp hàng thiếu/hỏng); **số container, số seal, cảng/ICD** giao nhận (nếu vận chuyển container) | tr.7 §9.5 | `B` (optional capability) | `OUT_OF_SCOPE` cho v1 — nguồn tự đánh dấu tùy chọn |

> **VT-064 "cảnh báo trước khi giao hàng nếu khách nợ quá hạn" là CẢNH BÁO, không phải CHẶN.**
> Nguồn dùng chữ "cảnh báo". Không được tự nâng thành hard block ở cổng tạo chuyến.

---

## 10. Sự kiện — Dashboard & Phân quyền (nguồn §10, §11)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-070 | Tổng quan **real-time**: xe đang chạy / đang rảnh / đang bảo dưỡng | tr.7 §10 | `B` | `CONFIRMED` — *real-time của **trạng thái**; nguồn không nói vị trí GPS* |
| VT-071 | Báo cáo **lãi/lỗ theo xe, theo tuyến, theo tháng** — tự tổng hợp từ Chuyến hàng + Chi phí | tr.7 §10 | `B` | `CONFIRMED` |
| VT-072 | Báo cáo công nợ tổng hợp: **phải thu khách hàng, phải trả cây xăng, phải trả/thu đối tác ngoài** — một màn hình biết ngay dòng tiền | tr.7 §10 | `B` | `CONFIRMED` |
| VT-073 | Cảnh báo tổng hợp: giấy tờ sắp hết hạn, **tiêu hao dầu bất thường**, **số dư quỹ lái xe bất thường** | tr.7 §10 | `B` | `CONFIRMED` |
| VT-080 | Mô hình thực tế **chỉ có 3 vai trò**: Giám đốc / Kế toán / Lái xe | tr.8 §11 | `C` | `CONFIRMED` |
| VT-081 | **Giám đốc — toàn quyền**: tạo/sửa/**xóa** chuyến hàng, gán xe/lái xe, duyệt & chi tạm ứng, cấu hình hoa hồng và giá cước, xem toàn bộ báo cáo tài chính và công nợ | tr.8 §11 | `C` | `CONFIRMED` (chữ "xóa" → C-05) |
| VT-082 | **Kế toán**: nhập/kiểm tra chi phí, chi tạm ứng, đối chiếu công nợ (cây xăng, khách hàng, đối tác), quyết toán sổ quỹ, xuất báo cáo. **Không xóa dữ liệu, không cấu hình hoa hồng/giá cước gốc** | tr.8 §11 | `C` | `CONFIRMED` |
| VT-083 | **Lái xe**: **chỉ thấy chuyến của mình**; nhập chi phí phát sinh, chụp ảnh phiếu dầu, cập nhật trạng thái chuyến. **Không xem giá cước**, không xem chuyến của người khác | tr.8 §11 | `B` | `CONFIRMED` — ràng buộc **theo dòng** *và* **theo trường** |
| VT-084 | **Giám đốc là tập hợp cha (superset) của quyền Kế toán**, không tách quyền loại trừ lẫn nhau | tr.8 §11 | `C` | `CONFIRMED` |
| VT-085 | **"Việc ứng tiền KHÔNG cần luồng duyệt 2 bước (approve/reject) vì không cần thiết với quy mô 10 xe"** | tr.8 §11 | `C` | `CONFIRMED` — yêu cầu **phủ định tường minh** |

> **VT-083 là ràng buộc bảo mật, không phải ràng buộc UI.** *"Không xem giá cước"* nghĩa là trường
> doanh thu của chuyến **không được rời máy chủ** đến thiết bị lái xe — lọc ở giao diện là không
> đủ. Cách chặn đúng là **cấu trúc**: một bề mặt `/me/...` riêng trả một khung nhìn không có
> trường giá, chứ không phải cùng endpoint rồi lọc trường.

> **VT-085 chặn một "best practice" phổ biến.** Không được thêm luồng duyệt tạm ứng vào base rồi
> nói là an toàn hơn. Nếu sau này một khách vận tải khác **cần** duyệt, đó là **tenant policy bật
> lên**, không phải mặc định của Transport Domain.

---

## 11. Sự kiện — Năm luồng tài chính & hai bề mặt (nguồn §12, §13)

| ID | Sự kiện | Nguồn | Loại | Trạng thái |
|---|---|---|---|---|
| VT-090 | **Năm luồng tài chính vận hành ĐỘC LẬP nhưng đều gắn kết qua Chuyến hàng** — *"điểm mấu chốt trong kiến trúc hệ thống ... giúp tính chính xác lãi/lỗ mà không gây nhầm lẫn giữa các đối tượng công nợ khác nhau"* | tr.8 §12 | `B` | `CONFIRMED` |
| VT-090a | Nhiên liệu — Công ty ↔ **Cây xăng** — ký nợ theo phiếu, đối chiếu bảng kê, thanh toán cuối kỳ | tr.8 §12 | `B` | `CONFIRMED` |
| VT-090b | Chi phí vận hành khác — Công ty ↔ **Lái xe** — tạm ứng theo sổ quỹ cá nhân, trừ dần theo chi phí thực tế | tr.8 §12 | `B` | `CONFIRMED` |
| VT-090c | Cước vận chuyển — Công ty ↔ **Khách hàng** — doanh thu, công nợ phải thu theo hạn thanh toán | tr.8 §12 | `B` | `CONFIRMED` |
| VT-090d | Thuê xe ngoài — Công ty ↔ **Đối tác (vai trò nhà xe)** — công ty trả tiền thuê, hưởng hoa hồng chênh lệch | tr.8 §12 | `B` | `CONFIRMED` |
| VT-090e | Nhận chạy hộ — Công ty ↔ **Đối tác (vai trò nguồn đơn)** — xe công ty chạy đầy đủ chi phí, công ty trả hoa hồng | tr.8 §12 | `B` | `CONFIRMED` |
| VT-100 | **Hai bề mặt người dùng**: "Web quản lý (Giám đốc / Kế toán)" và "App lái xe (điện thoại)" | tr.9 §13.1, tr.13 §13.2 | `B` | `CONFIRMED` |
| VT-101 | App lái xe: **"giao diện tối giản, ưu tiên thao tác 1–2 chạm và chụp ảnh thay vì nhập liệu thủ công"**. Màn hình: trang chủ (chuyến hiện tại, **số dư quỹ**, thao tác nhanh) · chi tiết chuyến (**cập nhật trạng thái 1 chạm**) · nhập chi phí (chọn loại, chụp ảnh, xác nhận số tiền) · nhập phiếu dầu (**số lít, odo, ảnh phiếu ký tại cây xăng**) | tr.13–14, Hình 8–11 | `B` | `CONFIRMED` |
| VT-102 | Wireframe là **wireframe chức năng**, "chưa phải thiết kế thẩm mỹ cuối cùng" | tr.9 §13 | — | `CONFIRMED` |
| VT-103 | Tài liệu này là **cơ sở phân tích nghiệp vụ** để thiết kế DB schema, wireframe và lên kế hoạch phát triển theo giai đoạn **MVP → mở rộng** | tr.14 | — | `CONFIRMED` |

> **VT-101 xác nhận một điều mà AI/vision KHÔNG được phép phá.** Màn hình nhập phiếu dầu được khách
> mô tả là *"số lít, odo, ảnh phiếu"* — tức **con người gõ số, ảnh là bằng chứng**. Không có chỗ
> nào trong nguồn yêu cầu máy đọc ảnh ra số. Vision/OCR vì thế là **tăng cường tùy chọn**, và base
> phải chạy đủ khi không có nó.

---

## 12. Xung đột (`CONFLICT`) — không được tự chọn

| ID | Xung đột | Hai phía | Ảnh hưởng | Đề xuất (chưa chốt) |
|---|---|---|---|---|
| **C-01** | "Mọi khoản tiền gắn được vào một chuyến" (VT-004) **vs** "Ứng tiền không gắn với 1 chuyến cụ thể" (VT-033) | Nguồn §1 vs nguồn §5.2 | Quyết định `tripId` nullable hay không trên sổ quỹ | **Nguồn tự giải quyết ở §5.3 (VT-037)**: §1 nói *"gắn **được**"* = khả năng truy vết, không phải bắt buộc trên mọi dòng. Lớp chi phí chuyến gắn `tripId`; lớp sổ quỹ có `tripId` **nullable**. Đây là mâu thuẫn **biểu đạt**, không phải mâu thuẫn nghiệp vụ |
| **C-02** | Dòng lệch đối soát → *"cảnh báo kiểm tra thủ công"* (VT-048) **vs** *"trừ vào lương cuối tháng nếu lái xe ... thiếu chứng từ"* (VT-062) | Nguồn §6.4 vs nguồn §9.1 | Có tự động biến chênh lệch đối soát thành khoản trừ lương hay không | **Không tự chốt.** `sonic_van_tai` D-032 đã bác bỏ tự động hoá đường này với lý lẽ đứng vững (một dòng lệch có nhiều nguyên nhân không thuộc lỗi lái xe; trừ tiền theo kết quả so khớp máy, không giải trình, sai cả pháp lý lẫn quan hệ lao động). Nhưng đây là **quyết định của khách + pháp lý**, không phải của kỹ sư → `OPEN-10` |
| **C-03** | Vấn đề nêu ở §1: *"không kiểm soát được **vị trí**/tình trạng xe"* **vs** toàn tài liệu **không có** yêu cầu chức năng GPS nào | Nguồn §1 vs §3–§13 | Có tích hợp GPS trong scope hay không | GPS **không** vào v1 cho tới khi khách xác nhận. Cái duy nhất nguồn thật sự yêu cầu là **trạng thái xe** (VT-013, VT-070) → `OPEN-01` |
| **C-04** | *"tách 2 chiều công nợ rõ ràng, không gộp chung"* **vs** *"số dư ròng cuối kỳ"* — **cùng một mục** §8.2 (VT-054, VT-055) | Nguồn §8.2 nội bộ | Một sổ ròng hay hai sổ + một báo cáo ròng | Đọc nhất quán được: **hai chiều là hai sổ tách biệt; "số dư ròng" là một CỘT TRÊN BÁO CÁO ĐỐI CHIẾU**, tức read model. Bù trừ thật (netting/offset) là hành vi khác và nguồn **không** yêu cầu → `OPEN-15` |
| **C-05** | Giám đốc được *"**xóa** chuyến hàng"* (VT-081) **vs** nguyên tắc lịch sử tài chính không sửa/xóa | Nguồn §11 vs bất biến tài chính | Xóa một chuyến đã phát sinh chi phí/dầu/công nợ | Phân biệt: chuyến **chưa có bút toán nào** → xóa được; chuyến **đã có** → chỉ `CANCELLED` + reversal. Nguồn không phân biệt → `OPEN-16` |
| **C-06** | `sonic_van_tai` A01: *"mỗi khách hàng ... một Keycloak Realm và một database nghiệp vụ riêng"* **vs** Nexagnet: silo deployment, **không** Keycloak, **chưa** có `tenantId` | Tài liệu tham khảo vs kiến trúc hiện tại | Chọn nền tảng định danh | **Nexagnet thắng** (chỉ thị workstream + `nen-tang-da-khach.md`). Không đưa Keycloak vào. Ghi lại ở đây vì đây là xung đột **đã được quyết**, không phải open decision |
| **C-07** | Ngưỡng cảnh báo hết hạn là *"15–30 ngày"* — một **khoảng**, không phải một giá trị (VT-015) | Nguồn §3.3 | Không thể hard-code | Là **tenant policy** có giá trị mặc định; khách chọn số cụ thể → `OPEN-02` |
| **C-08** | Nguồn cho phiếu dầu **một** trục trạng thái 3 giá trị (VT-045) **vs** `sonic_van_tai` BC-10 dùng **hai** trục độc lập (`verificationStatus` × `reconciliationStatus`) | Nguồn §6.2 vs tài liệu tham khảo | Hình dạng máy trạng thái phiếu dầu | Hai trục **không mâu thuẫn** với nguồn — chúng *phân giải mịn hơn* cùng một nghiệp vụ (kế toán duyệt số liệu ≠ khớp bảng kê). Nhưng đây là **thiết kế của chúng ta**, phải mang nhãn `DERIVED_DESIGN` ở T1, không được kể là lời khách |

---

## 13. Quyết định còn mở (`OPEN_DECISION`) — cần khách / product owner trả lời

> **🟡 Giai đoạn demo:** mỗi mục dưới đây đã được cấp **một giả định mặc định** ở
> [T1 §21](../../../kien-truc/transport-domain-contract.md#21-giả-định-giai-đoạn-demo-gd-xx) mang mã
> `GD-xx`, để công việc không bị chặn. **Giả định nằm ở T1, không nằm ở đây** — file này chỉ giữ
> điều khách đã nói. Cột "Chặn tới đâu" mô tả hệ quả **nếu không có giả định nào**; nó vẫn đúng khi
> đọc để biết mục nào cần hỏi khách gấp.

| ID | Câu hỏi | Vì sao chặn | Chặn tới đâu |
|---|---|---|---|
| `OPEN-01` | Có cần **vị trí xe theo GPS thời gian thực** không? Nếu có, **nhà cung cấp nào**? | §1 nêu vấn đề vị trí nhưng không có yêu cầu chức năng nào (C-03) | Nếu CÓ: thêm integration port + tenant adapter. Không chặn T2 |
| `OPEN-02` | Ngưỡng cảnh báo hết hạn giấy tờ: **15 hay 30 ngày**, và có khác nhau theo loại giấy tờ không? | Nguồn cho một khoảng (C-07) | Chặn seed tenant policy, không chặn thiết kế |
| `OPEN-03` | Bảng kê cây xăng vào hệ thống bằng **Excel / CSV / PDF / API**? Có mẫu file thật không? | VT-043 không nói định dạng | **Chặn T4** (Fuel reconciliation) |
| `OPEN-04` | **Dung sai** so khớp là bao nhiêu (số tiền, số lít, số ngày)? | VT-047 cho khóa nhưng không cho dung sai | **Chặn T4** |
| `OPEN-05` | Hai phiếu dầu **trùng** `(ngày, số tiền, xe)` xử lý thế nào? Có mã giao dịch của cây xăng để phân biệt không? | Khóa so khớp không duy nhất | **Chặn T4** |
| `OPEN-06` | Lái xe có cần **chế độ offline** không (vùng sóng yếu)? Ảnh chờ upload có được chấp nhận là trạng thái hợp lệ tạm thời không? | VT-042 nói "gửi về ngay" — hàm ý có mạng; nguồn không nói khi mất mạng | Chặn thiết kế app lái xe (T7), không chặn T2 |
| `OPEN-07` | Chứng từ **đã nộp** có được sửa trực tiếp không, hay phải huỷ + lập lại? | Nguồn không nói | **Chặn T3/T4** |
| `OPEN-08` | Sau khi **đóng kỳ đối soát**, khoá những gì? Mở lại kỳ cần điều kiện gì? | Nguồn không nói | **Chặn T4/T5** |
| `OPEN-09` | Phạm vi **thuế / hóa đơn GTGT**: chỉ lưu tham chiếu hóa đơn, hay phải xuất/khấu trừ thuế đầu vào? | Nguồn chỉ nhắc "hóa đơn" như **ảnh phiếu** ở §6.1 | **Chặn T5** |
| `OPEN-10` | **Trừ lương** lái xe do thiếu chứng từ / nợ ứng: cơ sở pháp lý và quy trình giải trình là gì? | C-02 + rủi ro pháp lý lao động | **Chặn T6** |
| `OPEN-11` | **Công thức phân bổ chi phí cố định** (khấu hao, bảo hiểm, lương cứng...) vào từng chuyến? Theo km, theo ngày, hay theo doanh thu? | VT-031 nói "tự động phân bổ" nhưng không cho công thức | **Chặn** báo cáo lãi/lỗ đầy đủ (T5) |
| `OPEN-12` | **Km của chuyến** lấy từ đâu — nhập tay, chênh lệch odo, hay bản đồ? | VT-061 dùng km để tính lương | **Chặn T6**; ảnh hưởng T2 (có trường `distanceKm` hay không) |
| `OPEN-13` | Hệ thống có cần **kế toán pháp định** (sổ cái, bút toán kép, báo cáo tài chính) không? | Nguồn nói "công nợ", "lãi/lỗ" — quản trị, không phải kế toán pháp định | Ranh giới phạm vi sản phẩm |
| `OPEN-14` | Điều kiện để chuyến chuyển sang **"Đã đối soát"** là gì (dầu / khách / đối tác — cái nào)? | VT-022 vs ba kỳ đối soát khác nhau | **Chặn T2** (máy trạng thái Trip) |
| `OPEN-15` | Công nợ hai chiều với đối tác có **bù trừ (netting)** thật không, hay chỉ hiển thị số dư ròng? | C-04 | **Chặn T5** |
| `OPEN-16` | Xoá chuyến đã phát sinh tài chính: cấm hẳn, hay cho huỷ + reversal? | C-05 | **Chặn T2** |
| `OPEN-17` | **Đa tiền tệ** hay chỉ VND? | Nguồn không nhắc tiền tệ ở bất kỳ đâu | Ảnh hưởng kiểu dữ liệu tiền ngay từ T2 |
| `OPEN-18` | **Múi giờ** của tenant và định nghĩa "ngày nghiệp vụ"? | Nguồn không nhắc; nhưng kỳ công nợ/kỳ lương phụ thuộc nó | **Chặn T4/T5** |
| `OPEN-19` | **Thời gian lưu ảnh/chứng từ** (retention) và dung lượng dự kiến? | Nguồn không nói | Chặn chọn lưu trữ |
| `OPEN-20` | **Multi-stop** (nhiều điểm lấy/giao trong một chuyến) có trong v1 không? | Nguồn chỉ nói "điểm đi / điểm đến" | **Chặn T2** |
| `OPEN-21` | **Đổi xe / đổi lái xe giữa chuyến** có xảy ra không? | Nguồn không nói | **Chặn T2** |
| `OPEN-22` | Yêu cầu nào của khách là **bắt buộc theo hợp đồng**, yêu cầu nào là mong muốn? | Không có tài liệu hợp đồng trong phạm vi phiên này | Chặn xếp ưu tiên MVP |
| `OPEN-23` | **SLA** và số người dùng đồng thời (web + mobile)? | Nguồn không nói | Chặn thiết kế hạ tầng |

---

## 14. Thiếu nguồn (`MISSING`) — chưa có tài liệu, khác với "chưa quyết"

| Mục | Ghi chú |
|---|---|
| **Hợp đồng / SOW với Vận tải Việt** | Không tìm thấy trong phạm vi phiên này. `OPEN-22` phụ thuộc nó |
| **Mẫu bảng kê cây xăng thật** | Không có file mẫu nào. `OPEN-03`, `OPEN-04`, `OPEN-05` đều phụ thuộc nó |
| **Bảng giá cước / hợp đồng khách hàng thật** | VT-064 nói có "đơn giá cước riêng theo từng khách/tuyến" nhưng không có dữ liệu |
| **Danh sách xe, lái xe, cây xăng, đối tác thật** | Dữ liệu loại `D` — chưa nhận |
| **Quy chế lương lái xe hiện hành** | VT-060 mô tả cấu trúc, không có tham số |
| **Văn bản đồng ý xử lý dữ liệu cá nhân (lái xe)** | Hệ thống lưu SĐT, GPLX, ảnh, lương → thuộc phạm vi **Luật BVDLCN 91/2025/QH15 + NĐ 356/2025**. Chưa có văn bản nào trong phạm vi phiên này |

---

## 15. Điều kiện đóng T0

| Tiêu chí | Trạng thái |
|---|---|
| Nguồn khách được truy vết (đường dẫn + SHA-256 + số trang, tự đo lại) | ✅ |
| Fact tách khỏi design (`CONFIRMED` vs `DERIVED_DESIGN`) | ✅ |
| Conflict được nêu, **không** tự chọn bên | ✅ — 8 conflict, mỗi cái ghi rõ hai phía |
| Open decision được liệt kê kèm **cái gì bị chặn** | ✅ — 23 mục |
| Không có yêu cầu bịa | ✅ — mọi dòng `VT-*` đều dẫn tới trang/mục cụ thể của PDF |
| Nguồn `UNVERIFIED_SOURCE` được nêu rõ | ✅ — §1.2, Phụ lục D của `sonic_van_tai` |

> **`TRANSPORT SOURCE TRUTH v0 = CLOSED`** ở phạm vi *một* nguồn khách đã kiểm chứng. Đây **không**
> phải khẳng định rằng nghiệp vụ đã đủ để build: 23 `OPEN_DECISION` và 6 mục `MISSING` ở trên là
> danh sách phải mang đi hỏi khách.
>
> Giai đoạn demo chạy trên các giả định `GD-xx` ở
> [T1 §21](../../../kien-truc/transport-domain-contract.md#21-giả-định-giai-đoạn-demo-gd-xx). **Ba
> câu cần hỏi khách sớm nhất** vì sai thì dữ liệu lịch sử không dựng lại được: `OPEN-18` (ngày
> nghiệp vụ / múi giờ) · `OPEN-21` (đổi xe-lái xe giữa chuyến có lưu lịch sử không) · `OPEN-17`
> (tiền tệ).
