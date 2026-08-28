# ĐỐI CHIẾU NGUỒN SỰ THẬT — U Ultty, bản v1 (28/08/2026)

> **Vai trò tài liệu:** kiểm kê và đối chiếu **ba nguồn** — (A) hợp đồng đã ký, (B) Google Drive của
> khách, (C) repo/runtime hiện tại — rồi phân loại từng sự kiện nghiệp vụ thành
> `CONFIRMED` / `CONFLICT` / `SUPERSEDED` / `MISSING` / `OUT_OF_SCOPE`.
>
> **Đây KHÔNG phải tài liệu thay đổi hành vi.** Không kích hoạt giá tháng 08, không đổi ngưỡng 50,
> không hiện thực ship/COD/VAT/khuyến mãi. Mọi `CONFLICT` để **NGUYÊN**, chờ người có thẩm quyền
> quyết. Bản triển khai đi sau, theo backlog ở §10.
>
> **Bổ sung 28/08/2026:** chưa liên hệ được khách để hỏi 3 câu chặn, nên §3bis ghi **ba giả định làm
> việc `ASM-01..03`** do NetViet tự đặt để U2 chạy tiếp. Giả định **không đóng** xung đột; cả ba đều
> chọn theo tiêu chí **đảo ngược được bằng dữ liệu/cấu hình, không phải bằng sửa code**.
>
> **Phân biệt với tài liệu cạnh nó:**
> [`mo-ta-nghiep-vu.md`](mo-ta-nghiep-vu.md) = mô tả nghiệp vụ + as-built (hệ thống *đang* làm gì);
> tài liệu này = **nguồn nói gì, nguồn nào thắng, chỗ nào nguồn tự mâu thuẫn**.
> Tài liệu đó cập nhật 12/08 và rà 13 dòng ngày 21/08 — §3 và §4 dưới đây **bác bỏ hai khẳng định**
> của nó, xem `SUP-01`, `SUP-02`.
>
> **Không chứa PII và không chứa giá riêng theo đại lý.** Xem §11 để biết chính xác cái gì bị giữ
> lại và vì sao.

---

## 1. SOURCE INVENTORY

`authority`: thứ tự hiệu lực khi hai nguồn nói khác nhau về **phạm vi tự động hoá GĐ1**.
`L1` = ràng buộc pháp lý cao nhất · `L2` = khách phát biểu ý muốn · `L3` = quy trình nội bộ khách ·
`L4` = tiền hợp đồng / tham khảo.

| sourceId | Tài liệu | Loại | Ngày / phiên bản | authority | Mật | Locator |
|---|---|---|---|---|---|---|
| `SRC-HD-00` | Hợp đồng triển khai phần mềm `HĐAI/NETVIET-ULTTY/260826` | Hợp đồng khung | **ký 26/08/2026** | **L1** | MẬT | Ngoài repo — máy vận hành |
| `SRC-HD-PL01` | Phụ lục 01 — triển khai hệ thống AI Agent trên nhóm Zalo | Phụ lục hợp đồng | **26/08/2026** | **L1** | MẬT | như trên |
| `SRC-HD-PL02` | Phụ lục 02 — nơi lưu trữ dữ liệu | Phụ lục hợp đồng | **26/08/2026** | **L1** | MẬT | như trên |
| `SRC-HD-PL03` | Phụ lục 03 — dịch vụ AI đi kèm | Phụ lục hợp đồng | **26/08/2026** | **L1** | MẬT | như trên |
| `SRC-FLOW` | *Luồng AI Agent ULTTY (tài liệu của khách yêu cầu)* | Sơ đồ tư duy do **khách** soạn | 10/08/2026 | **L2** | MẬT | Drive `gd1/`; PDF **chỉ có ảnh**, không có font |
| `SRC-PRICE-08` | **THÔNG BÁO GIÁ THÁNG 08.2026** | Bảng giá tháng, 4 trang, 19 SKU | 18/08/2026 | **L2** | Gửi mọi ĐL/CTV | Drive `AI Zalo B2B / Báo giá sản phẩm /` |
| `SRC-PRICE-DEALER` | **Báo giá riêng CTV/ĐLY** | Google Sheets, 22 dòng × 21 cột đại lý | 18/08/2026 | **L2** | **MẬT CAO** | cùng thư mục trên |
| `SRC-PRICE-07` | Thông báo giá tháng 07.2026 | Bảng giá tháng, 19 SKU | 30/06/2026 | L2 (đã bị thay) | Gửi mọi ĐL/CTV | `ho-so-khao-sat/gd1/AI Zalo_/` |
| `SRC-SKU-MASTER` | Tên và mã sản phẩm.xlsx | Danh mục gốc 39 dòng | 30/06/2026 | L2 | MẬT | `.../Mã sản phẩm_/` |
| `SRC-SURVEY` | Hồ sơ khảo sát khách hàng | Khảo sát có cấu trúc | 30/06/2026 | L2 | MẬT (PII) | `ho-so-khao-sat/demo/` |
| `SRC-GLOSSARY` | Viết tắt_.docx | Từ điển teencode, 30 mục | 30/06/2026 | L2 | MẬT | `.../Ghi chú tệp KH đặc biệt/` |
| `SRC-QT-ORDER` | QT Đặt hàng | Quy trình nội bộ, 9 bước | 11/08/2025 | L3 | MẬT | `.../Các quy trình_/` |
| `SRC-QT-QUOTE` | QT Báo giá B2B | Quy trình nội bộ, 9 bước | 11/08/2025 | L3 | MẬT | như trên |
| `SRC-QT-RETURN` | QT Hoàn trả hàng B2B | Quy trình nội bộ | 02/02/2026 | L3 | MẬT | như trên |
| `SRC-QT-CONTACT` | QT Tiếp xúc khách hàng | Quy trình nội bộ | 11/08/2025 | L3 | MẬT | như trên |
| `SRC-QT-PREORDER` | QT Preoder | Quy trình nội bộ | 11/08/2025 | L3 | MẬT | như trên |
| `SRC-QT-NPI` | QT đưa SP vào thị trường | Quy trình nội bộ | 11/08/2025 | L3 | MẬT | như trên |
| `SRC-PO-30` | PO — Công nợ 30 ngày | Phiếu giao nhận mẫu (có thật) | 06/2026 | L3 | **MẬT (PII + STK)** | `.../PO - Biên bản bàn giao_/` |
| `SRC-PO-45` | PO — Công nợ 45 ngày | Phiếu giao nhận mẫu (có thật) | 06/2026 | L3 | **MẬT (PII + STK)** | như trên |
| `SRC-PO-KG` | PO — Ký gửi | Phiếu giao nhận mẫu (có thật) | 06/2026 | L3 | **MẬT (PII + STK)** | như trên |
| `SRC-HANDOVER` | Biên bản bàn giao | Biểu mẫu | 06/2026 | L3 | MẬT | như trên |
| `SRC-QUOTE-NV` | Báo giá dịch vụ NetViet (Aug 2026) | Chào giá tiền hợp đồng | 08/2026 | L4 | MẬT | `ho-so-khao-sat/gd1/` |
| `SRC-GOLDEN` | golden-orders.json | 15 ca tin nhắn thật + kỳ vọng | 12/08/2026 | L2 (bằng chứng) | MẬT | `ho-so-khao-sat/gd1/` |
| `SRC-REPO` | `tenants/ultty/**` + `apps/api/src/{rules,orders,knowledge}` | Repo/runtime | `ae04b2b` | — | Public repo | worktree |

> ⚠️ **Cảnh báo về bản sao hợp đồng dùng để soạn tài liệu này.** Bản `.md` nằm trong `Downloads`
> (`HĐ PM AI ULTTY_NETVIET_150826.docx.md`) là **BẢN EXPORT CŨ**, không phải bản ký 26/08/2026:
> nó để trống ngày ký, còn viện dẫn NĐ 13/2023, và Phụ lục 01 ghi *"UAT trên 1–2 nhóm đại lý"*
> mà không có ngưỡng phần trăm nào. Các mục `FACT-UAT-*`, `FACT-LEGAL-01` và ngày ký ở bảng trên
> đã được sửa theo **bản ký hiện hành do chủ dự án cung cấp nội dung (28/08/2026)**; phần còn lại
> của tài liệu vẫn dựa trên bản export cũ. **Việc cần làm:** đọc trực tiếp bản ký 26/08/2026 và
> rà lại toàn bộ mục dẫn `SRC-HD-*` — xem `MISS-10`.

**Cây Drive `AI Zalo B2B` đo lại 28/08/2026 — 7 thư mục:**
`Báo giá sản phẩm` (18/08 — **MỚI, chưa từng có trong bản mirror local**) · `Các quy trình` (30/06) ·
`Catalog ULTTY` (10/08 — chứa *Catalog sản phẩm* + *Thương hiệu ULTTY*, **bản mirror local rỗng**) ·
`FAQ bộ sản phẩm` (10/08) · `Ghi chú tệp KH đặc biệt` (30/06) · `Mã sản phẩm` (30/06) ·
`PO - Biên bản bàn giao` (30/06).

**Nguồn đã đọc lần này mà `mo-ta-nghiep-vu.md` §0 còn liệt kê là "CHƯA đọc":**
`SRC-QT-QUOTE`, `SRC-QT-RETURN`, `SRC-QT-CONTACT`, `SRC-QT-PREORDER`, `SRC-QT-NPI`,
`SRC-SKU-MASTER`, `SRC-GLOSSARY`, `SRC-FLOW`.
**Vẫn chưa đọc:** `SRC-HANDOVER`, ảnh `Bảng đặt hàng của khách.jpg`, 6 ảnh `anh_chup_tin_nhan_khach/`,
nội dung thư mục `Catalog ULTTY` trên Drive, và 2 thư mục Drive ngoài cây (link pháp lý + link sản
phẩm trỏ trong `SRC-QT-CONTACT`).

---

## 2. BUSINESS FACT MATRIX

| factId | Miền | Sự kiện (nguồn nói gì) | Nguồn | Hiệu lực từ | Trạng thái | Repo hiện tại | Hành động |
|---|---|---|---|---|---|---|---|
| `FACT-THR-01` | Đơn hàng | Đơn **≤ 50 SP → AI tự xử lý**; **> 50 → báo Sale** | `SRC-HD-PL01` §2.2, `SRC-FLOW` 2.1.1, `SRC-QUOTE-NV` | 08/2026 | **CONFIRMED** | `maxAutoConfirmQuantity=50`, so sánh `<=` (inclusive) tại `order-auto-confirmation.ts` | Giữ nguyên. Nhưng xem `CONFLICT-ORDER-THRESHOLD-001` |
| `FACT-PRICE-01` | Giá | Bảng giá tháng 08/2026 **TỒN TẠI**, 19 SKU, 4 mức giá | `SRC-PRICE-08` | 18/08/2026 | **CONFIRMED** | `pricePeriod.note` khẳng định *"tháng 8 KHÔNG có thông báo giá mới"* | Xem `SUP-01` |
| `FACT-PRICE-07` | Giá | Kỳ giá `2026-08` đang `active` trong repo **là hiện vật kiểm thử nội bộ**, không phải quyết định của khách: bảng tháng 07 được copy sang tháng 08 để test gd1 | Người vận hành xác nhận 28/08/2026 | 08/2026 | **CONFIRMED** | `pricePeriod.note` **quy sai nguồn** cho khách | Xem `SUP-01` — sửa provenance trước, sửa số sau |
| `FACT-PRICE-02` | Giá | 17/19 SKU giữ nguyên giá tháng 07 | `SRC-PRICE-08` vs `SRC-PRICE-07` | 08/2026 | **CONFIRMED** | khớp | Không đổi |
| `FACT-PRICE-03` | Giá | **2/19 SKU đổi giá**: `ELNI` và `FELIX`, cột *Đơn giá CTV*, mỗi mã **giảm 100.000đ** | `SRC-PRICE-08` | 08/2026 | **CONFIRMED** | `wholesale` của cả hai vẫn là số tháng 07 → **báo sai giá** | U2 — cập nhật kèm provenance |
| `FACT-PRICE-04` | Giá | 4 cột giá = Niêm Yết · Bán lẻ · **Bán lẻ tối thiểu** · **Đơn giá CTV** | `SRC-PRICE-07`, `SRC-PRICE-08` | — | **CONFIRMED** | map đúng sang `listPrice/retailPrice/minRetailPrice/wholesale` | Không đổi |
| `FACT-PRICE-05` | Giá | Áp giá 2 cấp: **Lẻ = Bán lẻ tối thiểu**, **Buôn = Đơn giá CTV theo từng đại lý** (ví dụ khách tự viết: WFX Lẻ 2.350k – Buôn 1.750k) | `SRC-FLOW` 1.4.2 | 10/08/2026 | **CONFIRMED** | `retailAdvice.priceField="minRetailPrice"`; đại lý/CTV nhận `wholesale` | Xác nhận thiết kế hiện tại đúng |
| `FACT-PRICE-06` | Giá | `COMBO-WFX-PF360` có **Bán lẻ tối thiểu (3.000.000) > Bán lẻ (2.750.000)** | `SRC-PRICE-07` **và** `SRC-PRICE-08` | — | **CONFIRMED (dị thường ở NGUỒN)** | repo chép đúng nguồn | Hỏi khách; **không tự sửa** |
| `FACT-DLR-01` | Đại lý | **21 đại lý/CTV có giá riêng theo từng SKU** | `SRC-PRICE-DEALER` | 18/08/2026 | **CONFIRMED** | `priceOverrides: []` — **rỗng** | U2 — nhập, xem `GAP-05` |
| `FACT-DLR-02` | Đại lý | Deal riêng có thể **kèm ngưỡng số lượng** (hội thoại thật 25/07: *"lấy SL 5 cái mới được 1.150k"*) | `SRC-GOLDEN`, ảnh chat | 07/2026 | **CONFIRMED** | `DealerPriceOverride.minQuantity` đã có | Bảng Drive **không có** cột ngưỡng → `MISS-04` |
| `FACT-DLR-03` | Đại lý | Bảng giá riêng có **ô quà kèm giá** trên 4 dòng SKU (`BB-GREY`, `BB-ROSE`, `SCW18`, `ELNI`), thuộc 3 cột đại lý | `SRC-PRICE-DEALER` | 18/08/2026 | **CONFIRMED** | không có mô hình quà | `MISS-05` |
| `FACT-PAY-01` | Thanh toán | 5 nhóm: Công nợ 30 · Công nợ 45 · Ký gửi · Thanh toán trước · COD | `SRC-SURVEY`, `SRC-FLOW` 2.2.2, `SRC-HD-PL01` | — | **CONFIRMED** | `supportedDealerPolicies` đủ 5 | Không đổi |
| `FACT-PAY-02` | Thanh toán | Chính sách **gắn theo từng đại lý**, không phải luật toàn cục | `SRC-FLOW` 2.2.2 (liệt kê đích danh đại lý cho từng nhóm) | 10/08/2026 | **CONFIRMED** | `Dealer.defaultPolicy` đã có, mới 3 đại lý | U2 |
| `FACT-PAY-03` | Thanh toán | Công nợ 45: phạt **1%/ngày**, **>60 ngày ngừng cấp hàng**, đợt sau phải trả hết đợt trước, báo kế hoạch trước **5 ngày** | `SRC-PO-45` | 06/2026 | **CONFIRMED** | không mô hình hoá | Ngoài GĐ1 |
| `FACT-PAY-04` | Thanh toán | Công nợ 30: thanh toán trong **30 ngày kể từ ngày nhận hàng** | `SRC-PO-30` | 06/2026 | **CONFIRMED** | nhãn `POLICY_LABELS` đúng | Không đổi |
| `FACT-VAT-01` | VAT | PO công nợ 45 ghi **"Giá bao gồm thuế GTGT"**, xuất hoá đơn **theo từng lần giao thành công** | `SRC-PO-45` | 06/2026 | **CONFIRMED (chỉ cho PO đó)** | `vatRate=null`, fail-closed | Không suy rộng — xem `CONFLICT-VAT-001` |
| `FACT-VAT-02` | VAT | Khi chốt đơn, Sale hỏi **"lấy VAT hay không"** → quyết định **gửi STK công ty hay cá nhân** | `SRC-SURVEY` §4 | 30/06/2026 | **CONFIRMED** | không có bước này | `GAP-08` |
| `FACT-SHIP-01` | Vận chuyển | **Đơn ≥ 2 SP → miễn phí ship**; **đơn 1 SP → Sale báo cước** (AI **không** tự tính) | `SRC-HD-PL01` §2.2, `SRC-FLOW` 2.2.1, `SRC-SURVEY` §4 | 08/2026 | **CONFIRMED** | `computeShipping()` **ném lỗi**; TH1 miễn ship; TH2 luôn đẩy Sale | Xem `GAP-06` — luật này **cài được mà không cần biểu cước** |
| `FACT-SHIP-02` | Vận chuyển | Mọi PO đều ghi **"Miễn phí giao hàng"** ở mục *Trách nhiệm vận chuyển* (kể cả PO 5 SP và PO 50 SP) | `SRC-PO-30/45/KG` | 06/2026 | **CONFIRMED** | — | Bằng chứng ủng hộ `FACT-SHIP-01` |
| `FACT-SHIP-03` | Vận chuyển | Có **câu mẫu** cho ca 1 SP: *"Em book vận chuyển, mình nhận hàng thanh toán cước giúp e nhé"* | `SRC-FLOW` 2.2.1 | 10/08/2026 | **CONFIRMED** | không có | U3 |
| `FACT-PROMO-01` | Khuyến mãi | Dạng khuyến mãi: **mua N tặng 1** và **mua N tặng SKU khác** (ví dụ khách viết: *30 tặng 1*, *10 tặng 1*, *ELNI mua 5 tặng ELNA*) | `SRC-HD-PL01` §2.2, `SRC-FLOW` 3.3 | 08/2026 | **CONFIRMED (dạng)** | không có mô hình | `MISS-05` — thiếu công thức, điều kiện, cộng dồn, hiệu lực |
| `FACT-PROMO-02` | Khuyến mãi | Chu kỳ khuyến mãi: **tháng / quý / năm** | `SRC-FLOW` 3.3, `SRC-HD-PL01` | 08/2026 | **CONFIRMED** | không có | U4 |
| `FACT-CSKH-01` | CSKH | **Thông báo giá hàng tháng, gửi đầu mỗi tháng** là nghĩa vụ hợp đồng | `SRC-HD-PL01` §2.2, `SRC-FLOW` 3.1 | 08/2026 | **CONFIRMED** | `campaign` có scheduler; không có loại chiến dịch "bảng giá tháng" | `GAP-09` |
| `FACT-CSKH-02` | CSKH | Dịp gửi chúc: **mùng 1/rằm**, sinh nhật, năm mới/lễ tết, theo mùa | `SRC-HD-PL01`, `SRC-FLOW` 3.2 | 08/2026 | **CONFIRMED** | `campaign.features.lunarCalendarEnabled = false` | U5 |
| `FACT-CSKH-03` | CSKH | **AI soạn nội dung → Sale duyệt → gửi theo lịch Sale tạo** | `SRC-HD-PL01`, `SRC-FLOW` 3.4 | 08/2026 | **CONFIRMED** | `CampaignScheduler` + approval; `/broadcast` cũ đã bị chặn | Đúng hướng |
| `FACT-CONTENT-01` | Nội dung | Agent Bán hàng phải gửi **hình ảnh / video / catalog / profile công ty** | `SRC-HD-PL01` §2.2, `SRC-FLOW` 1.1–1.3 | 08/2026 | **CONFIRMED** | 102 ảnh `status=draft`, **0 video**, **0 catalog**, **0 profile** | `GAP-07` |
| `FACT-CONTENT-02` | Nội dung | Hợp đồng nói gửi ảnh/video **"dưới dạng link driver"** | `SRC-HD-PL01` §2.2 | 08/2026 | **CONFIRMED** | manifest dùng `/media/catalog/*.webp` tự host, **0 link Drive** | `CONFLICT-CONTENT-001` |
| `FACT-DELIV-01` | Giao hàng | Khách muốn AI **đọc ảnh + text từ nhóm vận chuyển Zalo** rồi chuẩn hoá thành xác nhận đã giao | `SRC-FLOW` 2.3 | 10/08/2026 | **CONFIRMED (mong muốn của khách)** | không có | **Ngoài mô tả agent trong `SRC-HD-PL01`** → `GAP-11` |
| `FACT-GLOS-01` | Ngôn ngữ | 30 mẫu teencode thật, 4 nhóm | `SRC-GLOSSARY` | 30/06/2026 | **CONFIRMED** | 51 mục glossary, **phủ đủ 30 mẫu gốc** | Không đổi |
| `FACT-ORG-01` | Quy trình | Quy trình đặt hàng thật có **2 cổng KSNB**, dùng KiotViet + Base, PGH cần 4 chữ ký | `SRC-QT-ORDER` | 11/08/2025 | **CONFIRMED** | GĐ1 chỉ tới `sent` + handoff Sale | **OUT_OF_SCOPE GĐ1** (§8) |
| `FACT-ORG-02` | Quy trình | Mỗi nhóm chính sách có **pháp nhân bán khác nhau** (ký gửi: bên bán là EUS Việt Nam, không phải U ULTTY) | `SRC-PO-KG` vs `SRC-PO-30/45` | 06/2026 | **CONFIRMED** | 1 pháp nhân bán duy nhất | `GAP-10` |
| `FACT-SKU-01` | Sản phẩm | Danh mục gốc **39 dòng** gồm SP chính, biến thể màu, phụ kiện, vật tư tiêu hao | `SRC-SKU-MASTER` | 30/06/2026 | **CONFIRMED** | repo bán 19 | §5 |
| `FACT-SKU-02` | Sản phẩm | `FELIX` (ghế EUS) **không nằm trong danh mục gốc 39 dòng** vì là hàng thương hiệu EUS, không phải U ULTTY | `SRC-SKU-MASTER` vs `SRC-PRICE-08` | — | **CONFIRMED** | bán bình thường | Ghi nhận; ảnh hưởng pháp nhân xuất hoá đơn |
| `FACT-LEGAL-01` | Pháp lý | Bản ký 26/08/2026 **đã viện dẫn đúng** căn cứ bảo vệ dữ liệu cá nhân hiện hành (không còn NĐ 13/2023) | `SRC-HD-00` | 26/08/2026 | **CONFIRMED** | `CLAUDE.md` đã ghi đúng: NĐ 13/2023 bị thay bởi Luật BVDLCN 91/2025/QH15 + NĐ 356/2025 từ 01/01/2026 | Không còn việc phải làm. *(Bản export cũ trong `Downloads` còn NĐ 13 — đó là lỗi của bản cũ, không phải của hợp đồng.)* |
| `FACT-SLA-01` | Vận hành | Lưu trữ: sao lưu **90 GB/tháng**, 440.000đ/tháng, kỳ 12 tháng | `SRC-HD-PL02` | 08/2026 | **CONFIRMED** | — | Theo dõi nghĩa vụ |
| `FACT-SLA-02` | Vận hành | Token AI: **đối soát ngày 05 hàng tháng** cho tháng liền trước; hết số dư → **hệ thống tự ngừng AI Agent** | `SRC-HD-PL03` §2.4, §3.3 | 08/2026 | **CONFIRMED** | không có đo lường/đối soát token | `GAP-12` |
| `FACT-SLA-03` | Vận hành | Chấm dứt: xoá dữ liệu Bên B khỏi hệ thống **và bản sao lưu trong 15 ngày** + xác nhận bằng văn bản | `SRC-HD-00` §6.3 | 08/2026 | **CONFIRMED** | không có thủ tục offboarding | `GAP-13` |
| `FACT-ROLE-01` | Phân quyền | Phân quyền **Sale / Kế toán / Quản lý** | `SRC-HD-PL01` §2.1 | 08/2026 | **CONFIRMED** | `USER_ROLES` hiện có `ADMIN`/`SALE` | `GAP-14` — thiếu vai Kế toán |
| `FACT-UAT-01` | Nghiệm thu | UAT chạy trên **02 nhóm đại lý**, trong **02 ngày** | `SRC-HD-PL01` | 26/08/2026 | **CONFIRMED** | chưa lên lịch, chưa chọn nhóm | `GAP-17` |
| `FACT-UAT-02` | Nghiệm thu | Ngưỡng đạt: **≥ 90%** trên **bộ dữ liệu kiểm thử đã được Bên B phê duyệt** | `SRC-HD-PL01` | 26/08/2026 | **CONFIRMED** | `SRC-GOLDEN` có 15 ca nhưng **chưa được khách phê duyệt**, và chưa có cỗ máy đo tỷ lệ | `GAP-17`, `MISS-06` |
| `FACT-UAT-03` | Nghiệm thu | **Không được báo giá sai** trong các ca thuộc bộ đã duyệt | `SRC-HD-PL01` | 26/08/2026 | **CONFIRMED** | 🔴 **đang vi phạm được**: `ELNI`/`FELIX` vẫn giữ giá tháng 07 (`GAP-03`) | U2 trước UAT |
| `FACT-UAT-04` | Nghiệm thu | **Không được tự động xử lý ngoài thẩm quyền** | `SRC-HD-PL01` | 26/08/2026 | **CONFIRMED** | `evaluateAutoConfirm` fail-closed 10 lý do có mã | Ràng buộc trực tiếp lên `ASM-02` — xem §3bis |

---

## 3. CONFLICT REGISTER

> Không mục nào dưới đây được tự giải quyết. Mỗi mục cần **một quyết định của người có thẩm quyền**
> (khách và/hoặc BGĐ NetViet), ghi lại thành văn bản trước khi code đổi hành vi.

### `CONFLICT-ORDER-THRESHOLD-001` — số lượng **đúng bằng 50**

| | |
|---|---|
| **Nguồn A** | `SRC-HD-PL01` §2.2 (L1): *"Đơn **từ 50 sản phẩm trở xuống** thì AI tự xử lý; **trên 50** thì báo Sale xử lý."* Được `SRC-FLOW` 2.1.1 (L2, khách tự viết) và `SRC-QUOTE-NV` (L4) nhắc lại **y hệt**. |
| **Nguồn B** | `SRC-QT-QUOTE` bước 9 (L3): *"Trong trường hợp khách hàng muốn lấy **từ 50 sản phẩm trở lên**, Sale báo lại với BGĐ và chốt mẫu báo giá chi tiết với BGĐ trước khi gửi lại cho khách hàng."* Lưu đồ có nhánh `KH lấy từ 50c → 9.1 BGĐ duyệt`. |
| **Ảnh hưởng** | Đơn/hỏi giá **đúng 50 SP**: theo A thì AI tự gửi; theo B thì phải qua BGĐ. Ở nhóm Zalo, "hỏi giá" và "đặt đơn" thường là **cùng một tin nhắn**, nên hai luật chạm nhau thật. |
| **Hành vi hiện tại** | `evaluateAutoConfirm()` dùng `totalQuantity <= maxAutoConfirmQuantity` → **50 được AI tự gửi** (theo A). |
| **Sắc thái phải nói rõ** | `SRC-QT-QUOTE` nói về **BÁO GIÁ** (mẫu báo giá chi tiết cho khách mới/khách lớn), `SRC-HD-PL01` nói về **XỬ LÝ ĐƠN**. Có thể hai luật đúng cho hai sự kiện khác nhau — nhưng cần khách xác nhận, không được giả định. |
| **Cân nhắc thẩm quyền** | A = L1 + L2, ngày mới hơn (08/2026) · B = L3, ngày 11/08/2025. Nghiêng về A, **nhưng B là kiểm soát nội bộ của khách và không bị hợp đồng vô hiệu hoá.** |
| **Quyết định cần** | (1) Tại đúng 50, AI gửi hay chuyển Sale? (2) Ngưỡng **báo giá** có tách khỏi ngưỡng **đặt đơn** không? |
| **Trạng thái** | 🔴 **OPEN** — chưa hỏi được khách. Đang chạy theo **`ASM-02`** (giữ `<=50`, đảo ngược bằng đúng một số trong `tenant.json`) |

### `CONFLICT-PRICE-SOURCE-001` — hai tệp cùng ngày 18/08 nói khác nhau

| | |
|---|---|
| **Nguồn A** | `SRC-PRICE-08` — bảng giá tháng 08 chính thức, có chữ ký Giám Đốc, 19 SKU. |
| **Nguồn B** | `SRC-PRICE-DEALER` — bảng giá riêng, 22 dòng, 4 cột giá chung **trùng tên cột** với A. |
| **Lệch** | **6 SKU lệch ở cột *Giá bán lẻ tối thiểu***: `BB-ROSE`, `MKL`, `CLAGE-CEX9`, `AROMA`, `FELIX`, và dòng `B23`/`B25`. Riêng `B23` còn lệch **cả tên model** (A ghi `B23`, B ghi `B25`) và lệch cả *Giá bán lẻ*. |
| **Vì sao nghiêm trọng** | `retailAdvice.priceField = "minRetailPrice"` — **đúng cái cột đang lệch** là cột hệ thống dùng để tư vấn giá cho khách lẻ. |
| **Lệch phạm vi** | B có thêm `Suntec DryFix 20` và `PF360` bán rời (A không có); A có `COMBO WFX+PF360` (B không có). |
| **Quyết định cần** | Tệp nào là nguồn sự thật cho *Giá bán lẻ tối thiểu*? `B23` hay `B25`? Suntec và PF360 rời có được bán không? |
| **Trạng thái** | 🔴 **OPEN** — chưa hỏi được khách. Đang chạy theo **`ASM-01`** (PDF có chữ ký thắng ở cột chung; Sheets thắng ở cột riêng) |

### `CONFLICT-KYGUI-TERM-001` — kỳ hạn của chính sách ký gửi

| | |
|---|---|
| **Nguồn A** | `SRC-PO-KG`: *"Cuối tháng hai bên tiến hành đối soát số lượng hàng hoá tiêu thụ thực tế & Bên mua thanh toán **trong vòng 7 ngày** kể từ ngày xuất hoá đơn."* |
| **Nguồn B** | `SRC-FLOW` 2.2.2 (khách tự viết): *"**Ký gửi 30 ngày**"*. |
| **Nguồn C** | `SRC-SURVEY`: liệt kê 4 mẫu PO — *"Ký gửi, **Công nợ 7 ngày**, 30 ngày, 45 ngày"* — tức 7 ngày là **một loại PO riêng**, tách khỏi ký gửi. |
| **Ảnh hưởng** | `readiness.blockedCapabilities` đang chặn `debt_7_days` với lý do *"chưa xác định là PolicyType riêng hay điều khoản thanh toán của policy khác"*. Ba nguồn cho **ba câu trả lời khác nhau**. |
| **Bằng chứng phụ** | Trong hồ sơ Drive **không có** tệp PO "Công nợ 7 ngày" → `MISS-03`. |
| **Quyết định cần** | Ký gửi thanh toán sau 7 ngày (từ ngày xuất HĐ) hay 30 ngày? Có PolicyType "công nợ 7 ngày" riêng không? |
| **Trạng thái** | 🔴 **OPEN — giữ `debt_7_days` ở trạng thái blocked** |

### `CONFLICT-CARRIER-001` — hãng vận chuyển cho đơn 1 SP

| | |
|---|---|
| **Nguồn A** | `SRC-SURVEY` §4: *"Grab nội thành HN/HCM, **Viettel** ở tỉnh"*. |
| **Nguồn B** | `SRC-SURVEY` §5 (**cùng một tài liệu**): *"vận chuyển (**Aha/Viettel**)"*. |
| **Nguồn C** | `SRC-FLOW` 2.2.1: *"Báo cước (**Viettel / Aha**)"*. |
| **Ảnh hưởng** | Nhỏ với GĐ1 (vì `FACT-SHIP-01` giao việc báo cước cho Sale), nhưng chặn mọi bảng cước tự động về sau. |
| **Quyết định cần** | Danh sách hãng chuẩn + phân vùng nội thành/tỉnh. |
| **Trạng thái** | 🟠 **OPEN — không chặn GĐ1** |

### `CONFLICT-VAT-001` — VAT đã gồm trong giá hay chưa

| | |
|---|---|
| **Nguồn A** | `SRC-PO-45`: *"Giá bao gồm thuế GTGT"* — **nhưng đây là điều khoản của MỘT PO cụ thể**, không phải chính sách toàn công ty. |
| **Nguồn B** | `SRC-SURVEY`: VAT *"tuỳ trường hợp"*; kế toán xuất nháp → khách kiểm → xuất; khách chọn lấy VAT hay không **và điều đó đổi số tài khoản nhận tiền**. |
| **Nguồn C** | `SRC-PRICE-07/08`: bảng giá **không ghi** đã gồm VAT hay chưa. |
| **Ảnh hưởng** | Không suy được VAT toàn cục. `vatRate=null` + fail-closed hiện tại là **đúng**. |
| **Quyết định cần** | VAT theo đại lý hay theo yêu cầu từng đơn? Giá niêm yết đã gồm VAT chưa? |
| **Trạng thái** | 🔴 **OPEN — giữ `vat` blocked** |

### `CONFLICT-AGENT-COUNT-001` — hệ thống có mấy agent

| | |
|---|---|
| **Nguồn A** | `SRC-HD-PL01` §2.1: *"Cấu hình **5 agent** chuyên trách (Điều phối, Bán hàng, Xử lý đơn hàng, Chăm sóc khách hàng, Giám sát)"*. |
| **Nguồn B** | `SRC-FLOW` (khách tự vẽ): **3 agent** — Bán hàng · Xử lý đơn hàng · Chăm sóc khách hàng. |
| **Nguồn C** | `CLAUDE.md` + repo: **6 vai** (Điều phối · Tư vấn SP · Bán hàng · Chính sách-TC · Hậu mãi · Giám sát), dẫn `de-xuat-giai-phap-netviet.md` §5.1. |
| **Ảnh hưởng** | Nghiệm thu §5.1(a) đối chiếu *"đúng chức năng mô tả tại Điều 2"* — Điều 2 nói 5 agent. Trình diễn 6 vai không sai, nhưng **tên và ranh giới vai phải ánh xạ được về 5 vai hợp đồng**, nếu không sẽ tranh cãi lúc nghiệm thu. |
| **Quyết định cần** | Chốt bảng ánh xạ 6 vai as-built → 5 agent hợp đồng, đưa vào biên bản nghiệm thu. |
| **Trạng thái** | 🟠 **OPEN — chỉ cần ánh xạ, không cần sửa code** |

### `CONFLICT-CONTENT-001` — media gửi bằng link Drive hay tự host

| | |
|---|---|
| **Nguồn A** | `SRC-HD-PL01` §2.2: gửi hình ảnh/video *"(dưới dạng **link driver**)"*. |
| **Nguồn C** | Repo: `content-manifest.json` dùng `/media/catalog/*.webp` tự host, **0 link Drive**. |
| **Ảnh hưởng** | Tự host tốt hơn về kiểm soát và tốc độ, nhưng **khác mô tả hợp đồng** → rủi ro nghiệm thu, và không tự động theo kịp khi khách cập nhật Drive. |
| **Quyết định cần** | Giữ tự host (và ghi nhận bằng biên bản/phụ lục), hay chuyển sang link Drive? |
| **Trạng thái** | 🟠 **OPEN** |

---

## 3bis. SỔ GIẢ ĐỊNH LÀM VIỆC (`ASM-*`) — mở đường U2 khi chưa hỏi được khách

> **Khác hẳn `CONFIRMED`.** Đây là **giả định do NetViet tự đặt** ngày 28/08/2026 vì chưa liên hệ được
> khách, ghi lại để U2 chạy tiếp mà không phải đoán ngầm. Mỗi mục nêu rõ **suy luận**, **rủi ro nếu
> sai**, và **đường đảo ngược**. Xung đột tương ứng ở §3 **vẫn OPEN** — giả định không đóng nó.
>
> Nguyên tắc chọn: khi phải sai, **chọn hướng sai an toàn hơn**, và **chỉ chọn giả định nào đảo ngược
> được bằng DỮ LIỆU/CẤU HÌNH, không phải bằng sửa code**.

### `ASM-01` — Nguồn giá: văn bản có chữ ký thắng ở **cột chung**, bảng riêng thắng ở **cột riêng**

**Giả định.** `Thông báo giá tháng 08.pdf` là nguồn sự thật cho **4 cột giá chung** (Niêm Yết · Bán lẻ ·
Bán lẻ tối thiểu · Đơn giá CTV). `Báo giá riêng CTV/ĐLY` chỉ là nguồn sự thật cho **các cột đại lý**
của chính nó. Khi hai bên lệch ở cột chung (6 SKU) → **lấy theo PDF**.

**Suy luận.** PDF là văn bản **có chữ ký Giám Đốc, phát cho toàn bộ đại lý/CTV** — nó là công bố
chính thức. Sheets là công cụ làm việc nội bộ. Mỗi nguồn được coi là có thẩm quyền **đúng ở chỗ nó là
nơi công bố duy nhất**: PDF không hề có cột đại lý, Sheets không phải văn bản phát hành.

**Ba hệ quả bắt buộc đi kèm (fail-closed, không được bỏ):**

1. **`B23` vs `B25`** — không phải giả định mà **giải được bằng nguồn thứ ba**: danh mục gốc 39 dòng
   ghi *"Máy tạo ẩm không khí U Ultty **B23** Trắng"*. Hai trên ba nguồn nói `B23` ⇒ `B25` là **lỗi gõ
   trong Sheets**. Vẫn giữ cờ để hỏi lại.
2. **SP chỉ có trong Sheets mà không có trong PDF** (`Suntec DryFix 20`, `PF360` bán rời) ⇒ **không
   có giá chung có thẩm quyền** ⇒ **KHÔNG bật bán**, hỏi giá thì chuyển Sale. Không được lấy cột
   chung của Sheets làm giá.
3. Cột đang lệch là *Giá bán lẻ tối thiểu* — đúng cột `retailAdvice.priceField`. Sau khi áp `ASM-01`,
   **tư vấn giá lẻ lấy số của PDF**.

**Rủi ro nếu sai.** Báo *giá bán lẻ tối thiểu* lệch ở 6 SKU. Đây là **mức tham khảo có qualifier**,
không phải giá giao dịch của đại lý ⇒ thiệt hại giới hạn.

**Đảo ngược.** Sửa dữ liệu kỳ giá. Không đụng code.

### `ASM-02` — Số lượng **đúng 50** → AI tự xử lý (giữ nguyên hành vi hiện tại)

**Giả định.** `maxAutoConfirmQuantity = 50` với phép so sánh `<=` — tức **50 vẫn được AI tự gửi**.

**Suy luận.** Ba nguồn **độc lập** nói "từ 50 trở xuống AI tự xử lý": hợp đồng (ràng buộc pháp lý),
**tài liệu luồng do chính khách vẽ**, và báo giá NetViet. Nguồn phản đối duy nhất là `QT Báo giá B2B`
— quy trình nội bộ **2025**, và nó nói về **BÁO GIÁ cho khách mới/đơn lớn**, không phải **chốt đơn của
đại lý đã có quan hệ**. Hai sự kiện khác nhau.

**Rủi ro nếu sai.** Đúng một lớp đơn — tổng **chính xác 50 SP** — được gửi mà lẽ ra phải qua BGĐ.

**Đảo ngược — đây là lý do chọn giả định này.** Đổi sang "50 phải qua Sale" **không cần sửa một dòng
code nào**: đặt `policies.salesOrder.automation.maxAutoConfirmQuantity = 49` trong `tenant.json`.
Cổng đã là `<=` trên một số cấu hình theo tenant, nên chi phí đảo ngược ≈ 0.

### `ASM-03` — Giá riêng theo đại lý áp cho **mọi số lượng** (`minQuantity = 1`)

**Giả định.** Mỗi ô giá riêng nhập từ bảng được ghi `minQuantity: 1` — áp bất kể số lượng.

**Suy luận (đây là chỗ đổi cách đọc so với ghi chú cũ trong `domain.ts`).**

- Bảng nguồn **không có chiều số lượng**: 22 dòng × 21 cột, mỗi ô **một giá duy nhất**, không cột
  ngưỡng, không thang. Một bảng thang số lượng thì bắt buộc phải có ngưỡng — **việc nó vắng mặt là
  bằng chứng**, không phải thiếu sót ngẫu nhiên.
- Đo 22/22 dòng: **mọi ô giá riêng đều ≤ cột *Giá CTV/Đại lý* cùng dòng**. Bảng đọc ra như **giá đã
  thoả thuận theo từng đại lý**, không phải phần thưởng theo sản lượng.
- Hội thoại 25/07 (*"lấy SL 5 cái giá có tốt hơn k e"* → *"e xin giá 1150k"*) trước đây được đọc là
  **ngưỡng**. Có cách đọc khớp dữ liệu hơn: đó là **bối cảnh thương lượng**, và 1.150k sau đó thành
  **giá thoả thuận** của đại lý ấy. Bằng chứng ủng hộ: tới `Thông báo giá tháng 08`, **giá CTV chung
  của FELIX đã hạ đúng về 1.150.000** — công ty chuẩn hoá một mức đã phổ biến thành giá chung, chứ
  không phải dựng thang số lượng.

**Rủi ro nếu sai — và đây là rủi ro THẬT.** Nếu thực tế có ngưỡng, đơn **số lượng nhỏ** sẽ được hưởng
giá riêng ⇒ **báo THẤP hơn** mức đại lý đáng phải trả ⇒ mất tiền thật. Đã cân nhắc hướng ngược lại
(không áp giá riêng cho tới khi biết ngưỡng): hướng đó khiến **phần lớn lưu lượng của 21 đại lý** bị
báo giá cao rồi Sale phải sửa tay — hỏng trải nghiệm và mất luôn lợi ích của U2.

**Ba biện pháp giảm thiểu bắt buộc trong U2:**

1. Ghi `minQuantity: 1` **tường minh** vào từng bản ghi, **không để trống**. Khi khách trả lời, sửa
   **dữ liệu**, không sửa code.
2. Mỗi dòng đơn được hưởng giá riêng phải để lại **quyết định có mã lý do** (`telemetry.decision`) —
   đối soát được "đơn nào đã dùng giá riêng nào", đúng DoD quan sát của repo.
3. **Không tự suy ngưỡng cho bất kỳ SKU nào.** Không có ngưỡng đoán trong dữ liệu.

**Đảo ngược.** Sửa `minQuantity` trong dữ liệu (panel `/admin` hoặc seed). Không đụng code.

---

---

## 4. SUPERSEDED ASSUMPTIONS

### `SUP-01` — "Tháng 8 không có thông báo giá mới" ❌ **SAI**

**Giả định cũ** (`tenants/ultty/data/knowledge.json` → `pricePeriod.note`):

> *"Khách xác nhận 18/08/2026: tháng 8 KHÔNG có thông báo giá mới, giá giữ nguyên."*
> `validMonth: "2026-08"`, `status: "active"`

Được nhắc lại ở `mo-ta-nghiep-vu.md` §4 (*"Drive không có bảng tháng 08/2026"*) và §14 (`A6` — 🔴
*"bảng giá tháng 08/2026; Drive hiện chỉ có T7"*).

**Đo lại 28/08/2026:** Drive `AI Zalo B2B / Báo giá sản phẩm /` chứa **`Thông báo giá tháng 8.pdf`
(2,1 MB, 4 trang, sửa lần cuối 18/08/2026)** và **`Báo giá riêng CTV/ĐLY` (Sheets, 18/08/2026)**.
Trang 1 in rõ tiêu đề **"THÔNG BÁO GIÁ THÁNG 08.2026"**, trang 4 có chữ ký *Giám Đốc*.

**Nguồn gốc thật của trạng thái này — đính chính 28/08/2026.** Người vận hành xác nhận: *"ngày trước
tôi có copy bảng giá tháng 7 sang tháng 8 để test gd1, tôi tự ý làm, không phải quyết định của
khách."*

Vậy có **hai lỗi chồng nhau**, không phải một:

1. **Lỗi provenance (nghiêm trọng hơn).** `pricePeriod.note` ghi *"Khách xác nhận 18/08/2026"* — quy
   một **thao tác kiểm thử nội bộ** thành **xác nhận của khách hàng**. Cho tới hôm nay, tài liệu
   `mo-ta-nghiep-vu.md` §4 và §14 (`A6`) đã tin theo và tái khẳng định *"Drive không có bảng tháng
   08/2026"*. Một câu chú thích viết tay đã trở thành "sự thật" của hai tài liệu và của dữ liệu
   runtime, mà **không có gì kiểm chứng được nó**.
2. **Lỗi dữ liệu.** Việc copy tạo ra đúng cái fallback mà `mo-ta-nghiep-vu.md` §4 **cấm minh thị**:
   *"thiếu tháng hiện hành thì handoff/báo thiếu, **không fallback T7 thành T8**"*. Luật đã được viết
   ra, nhưng không có cơ chế nào cưỡng chế nó, nên một thao tác test đã lặng lẽ vi phạm và trụ lại
   trong `main`.

Không có ai làm sai quy trình ở đây — copy để test là việc bình thường. Vấn đề là **hệ thống không
phân biệt được dữ liệu kiểm thử với dữ liệu đã được duyệt**, và không ghi lại ai đặt, khi nào, theo
nguồn nào. Đó chính là lý do tồn tại của `PPC-01`.

Ngoài ra, cả hai tệp trên Drive mang đúng ngày **18/08/2026**, còn bản mirror local dừng ở 12/08 —
nên kể cả khi không có nhầm lẫn provenance thì cũng **không có tín hiệu nào** báo rằng nguồn đã đổi
(`PPC-02`).

**Mức độ sai về số:** bản copy đúng **17/19 SKU**, sai **2/19**:

| SKU | Trường | Repo (tháng 07) | `SRC-PRICE-08` | Δ |
|---|---|---|---|---|
| `ELNI` | `wholesale` (Đơn giá CTV) | 2.150.000 | **2.050.000** | −100.000 |
| `FELIX` | `wholesale` (Đơn giá CTV) | 1.250.000 | **1.150.000** | −100.000 |

17 SKU còn lại khớp từng dòng, cả 4 cột. Không có SKU thêm/bớt; chỉ đổi thứ tự liệt kê.

**Vì sao không được bỏ qua:** cả hai SKU đều xuất hiện trong đơn thật. `SRC-GOLDEN` có 4 ca `ELNI`
và 3 ca `FELIX`; `SRC-FLOW` 2.1.3 lấy đúng ví dụ *"HN_8.8_… / 5 x Ghế Felix — **1150k** / Tổng đơn
5750k"* — tức giá tháng 8. Chạy như hiện nay là **báo sai giá cho đại lý**, và đây chính là tiêu chí
nghiệm thu `SRC-HD-PL01` §5.1(b).

**Phân loại:** `SUPERSEDED`.
**Đã làm gì trong milestone này:** **không sửa số, không sửa note** — theo yêu cầu "không activate giá
mới chỉ bằng sửa note". Việc cập nhật thuộc **U2** và phải đi kèm provenance (`sourceId`,
`effectiveFrom`, người duyệt), sau khi `CONFLICT-PRICE-SOURCE-001` được trả lời.

**Nhưng có một việc nên tách ra làm sớm hơn U2:** câu *"Khách xác nhận 18/08/2026…"* trong
`pricePeriod.note` là **phát biểu sai về khách hàng đang nằm trong repo public**. Sửa câu chú thích
cho đúng nguồn (*"dữ liệu kiểm thử nội bộ, chưa đối chiếu bảng giá tháng 08"*) là việc **không đổi
hành vi, không đổi con số**, và không cần chờ khách trả lời gì. Đề xuất tách thành một thay đổi nhỏ
độc lập trước U2 — xem §10 mục 1b.

### `SUP-02` — "Không có deal riêng theo đại lý" ❌ **SAI**

**Giả định cũ:** `priceOverrides: []`; `mo-ta-nghiep-vu.md` §14 ghi `A2` 🔴 *"deal riêng theo đại lý"*
là dữ liệu còn thiếu.

**Đo lại:** `SRC-PRICE-DEALER` tồn tại từ 18/08/2026 — **22 dòng sản phẩm × 21 cột đại lý/CTV**, với
**≈120 ô giá riêng** đã điền. Xem §6.

**Phân loại:** `SUPERSEDED` — dữ liệu **đã có**, chỉ là chưa ai nhập.

Còn lại một câu hỏi thật: bảng **không có cột ngưỡng số lượng** (`MISS-04`). `FACT-DLR-02` từng được
đọc là bằng chứng "ngưỡng có thật"; `ASM-03` (§3bis) trình bày một cách đọc khác khớp dữ liệu hơn và
nêu rõ rủi ro của nó. Chưa hỏi được khách nên **cả hai cách đọc đều chưa bị loại**.

---

## 5. PRODUCT MATRIX

Năm tập hợp **khác nhau**, tuyệt đối không trộn:

| Tập | Số lượng | Nguồn | Ý nghĩa |
|---|---|---|---|
| `MASTER_CATALOG` | **39 dòng** | `SRC-SKU-MASTER` | Danh mục gốc: SP chính + biến thể màu + phụ kiện + vật tư tiêu hao. Có mã nội bộ dạng số (vd `8716`, `SP251149`). |
| `CONTRACT_SCOPE` | **18–20 SKU** | `SRC-HD-PL01` §2.1 | Phạm vi đã ký cho hạng mục chuẩn hoá dữ liệu. |
| `PRICE_ACTIVE` | **19 SKU** | `SRC-PRICE-08` | Có giá công bố tháng 08/2026. |
| `SALES_ENABLED` | **19 SKU** | `tenants/ultty/data/knowledge.json` | Hệ thống chấp nhận lên đơn. |
| `CONTENT_READY` | **0 SKU** | `content-manifest.json` | Không SKU nào đủ ảnh **đã duyệt** + FAQ + video. |

**Phân loại 39 dòng gốc:**

| Nhóm | Số dòng | Có trong `PRICE_ACTIVE`? |
|---|---|---|
| Sản phẩm chính đang bán | 17 | ✅ |
| Biến thể màu của SP đang bán (BB, CR018HM, ELNA) | 4 | ✅ (gộp/tách khác nhau tuỳ bảng) |
| **Sản phẩm chính KHÔNG có giá tháng 08** — `SKJ-CR021` (2 màu), `LIDI`, `PETIT LIDI`, Robot `SKJ-RB01X`, `LUK016`, `ULTTY LE`, `Suntec DryFix 20`, `PF360` bán rời | **10** | ❌ |
| Phụ kiện (con lăn SCW18, giá treo, pin V08) | 3 | ❌ |
| Vật tư tiêu hao (3 nước lau sàn, 4 màng lọc/tấm lọc) | 7 | ❌ |
| Hàng khác (thớt tre) | 1 | ❌ |

**Hai mã ở bảng giá nhưng KHÔNG có trong danh mục gốc 39 dòng:**

- `FELIX` — *Ghế nâng an toàn trẻ em EUS Felix*. Là hàng **thương hiệu EUS**, không phải U ULTTY, nên
  không nằm trong danh mục gốc của U ULTTY. Nhất quán với `SRC-PO-KG`, nơi **bên bán là EUS Việt Nam**
  chứ không phải U ULTTY.
- `COMBO-WFX-PF360` — gói bán, không phải mã hàng gốc.

**Ba nguy cơ phải xử lý trước khi mở rộng danh mục (milestone sau):**

1. **10 SP chính không có giá** — nếu bật bán mà thiếu giá, rules engine trả `null` → cảnh báo → đẩy
   Sale. Fail-closed đúng, nhưng gây nhiễu. **Không bật cho tới khi có giá.**
2. **Phụ kiện + vật tư tiêu hao (10 dòng)** là nguồn doanh thu lặp lại (màng lọc, nước lau sàn) và
   khách **có hỏi thật** (`SRC-GLOSSARY`: *"vệ sinh màng lọc ntn b"*). Chưa có giá, chưa bán được.
3. **`Suntec DryFix 20` và `PF360` bán rời** chỉ xuất hiện ở `SRC-PRICE-DEALER`, không có ở
   `SRC-PRICE-08` → xem `CONFLICT-PRICE-SOURCE-001`.

**Mức sẵn sàng nội dung theo SKU** (`content-manifest.json`, đo 28/08/2026):

| Chỉ số | Giá trị |
|---|---|
| Ảnh | 102, **100% `status=draft`** — chưa ảnh nào được duyệt |
| SKU có ảnh | 17/19 (thiếu `SKJ-CRS01`, `PRINCESS-12L`) |
| SKU có FAQ | **5/19** (`HERCULES`, `V08`, `SKJ-CR022`, `BB-GREY`, `BB-ROSE`) — tổng 95 mục |
| SKU có video | **0/19** — hợp đồng yêu cầu gửi video |
| Catalog / profile công ty | **0** — có trên Drive, chưa vào hệ thống |
| Link ngoài | 4 (YouTube/TikTok), chỉ cho `BB-GREY`/`BB-ROSE` |

FAQ gốc trên Drive được đánh số `1.`, `2.`, `6.`, `7.` → **các bộ 3, 4, 5, 8+ tồn tại ở đâu đó nhưng
khách chưa giao**. Đây là nguyên nhân gốc của con số 5/19, không phải lỗi import.

---

## 6. DEALER POLICY MATRIX

> **Tên đại lý và giá riêng của họ KHÔNG được ghi vào repo này** (§11). Dưới đây dùng ID giả danh
> `DLR-01…DLR-21`; bảng ánh xạ ID ↔ tên nằm ở `SRC-PRICE-DEALER` trên Drive và trong hồ sơ đã
> gitignore.

**Cấu trúc `SRC-PRICE-DEALER`:**

| Thuộc tính | Giá trị |
|---|---|
| Dòng sản phẩm | 22 |
| Cột giá chung | 4 (Niêm Yết · Bán Lẻ · Bán Lẻ tối thiểu · **Giá CTV/Đại lý**) |
| Cột đại lý/CTV có tên | **21** (`DLR-01…DLR-21`) |
| Ô giá riêng đã điền | ≈120 |
| Độ phủ | Không đại lý nào phủ hết 22 SKU. SKU được override nhiều nhất: tháp sưởi `CR018HM` và `HERCULES` (12 đại lý mỗi mã). `SKJ-CRS01` và `PRINCESS-12L` **không có override nào** |
| Ghi chú kỳ hạn thanh toán | Có, nhưng **chỉ 1/21 cột** được điền (*"Thanh toán sau"*) |
| Ô có quà kèm giá | 4 dòng SKU × 3 cột đại lý (xem `FACT-DLR-03`) |
| **Cột ngưỡng số lượng** | **KHÔNG CÓ** → `MISS-04` |

**Nhóm chính sách thanh toán theo `SRC-FLOW` 2.2.2** (khách tự phân, có nêu đích danh đại lý — tên
giữ ngoài repo):

| Nhóm | Số đại lý được nêu | Chứng cứ PO |
|---|---|---|
| Công nợ 30 ngày | 3 đại lý (+ "…") | `SRC-PO-30` |
| Công nợ 45 ngày | 1 đại lý | `SRC-PO-45` (phạt 1%/ngày, >60 ngày ngừng cấp) |
| Ký gửi | 1 đại lý | `SRC-PO-KG` — **bên bán là pháp nhân khác** (`GAP-10`) |
| Thanh toán trước | nhóm CTV | `SRC-SURVEY` |
| COD | theo yêu cầu | `SRC-SURVEY` (phí thu hộ theo biểu mẫu riêng — chưa có) |

**Nguyên tắc bắt buộc:** điều khoản trong **một** PO là **của riêng cặp mua–bán đó**, không phải luật
toàn Ultty. Cụ thể, *"Giá bao gồm thuế GTGT"* chỉ có ở `SRC-PO-45`; *"thanh toán 7 ngày sau xuất hoá
đơn"* chỉ có ở `SRC-PO-KG`. Không được nâng lên thành chính sách chung.

**Khoảng cách với repo:**

| | Nguồn | Repo |
|---|---|---|
| Đại lý/CTV | 21 có giá riêng; khảo sát nói **200–300** đang hoạt động | **3** |
| Nhóm Zalo | ~200 chăm sóc thường xuyên (+100–150 thi thoảng) | **2** |
| Giá riêng | ≈120 ô | **0** |

---

## 7. BUSINESS GAP MATRIX

| gapId | Yêu cầu hợp đồng / khách | Hiện trạng repo | Trạng thái | Thay đổi cần |
|---|---|---|---|---|
| `GAP-01` | Đơn ≤50 AI xử lý, >50 báo Sale | Đúng, inclusive | ✅ **ĐẠT** | Không (chờ `CONFLICT-ORDER-THRESHOLD-001`) |
| `GAP-02` | Báo giá theo bảng giá và cấp khách | Đúng: đại lý→`wholesale`, khác→`minRetailPrice`+qualifier | ✅ **ĐẠT** | Không |
| `GAP-03` | Áp giá theo **bảng giá hiện hành** | Đang dùng số tháng 07 cho 2 SKU đã đổi | 🔴 **SAI DỮ LIỆU** | U2 — cập nhật `ELNI`, `FELIX` kèm provenance |
| `GAP-04` | Chuyển Sale khi vượt thẩm quyền | `evaluateAutoConfirm` có 10 lý do có mã | ✅ **ĐẠT** | Không |
| `GAP-05` | Giá riêng theo từng đại lý | Engine `DealerPriceOverride` có, **dữ liệu rỗng** | 🔴 **THIẾU DỮ LIỆU** | U2 — nhập 21 đại lý sau khi giải `CONFLICT-PRICE-SOURCE-001` |
| `GAP-06` | Ship: ≥2 SP miễn phí, 1 SP Sale báo cước | `computeShipping()` ném lỗi; TH1 miễn ship; TH2 luôn đẩy Sale | 🟠 **ĐẠT MỘT NỬA** | U3 — **luật này không cần biểu cước**: chỉ cần đếm SP, ≥2 nói miễn ship, =1 phát câu mẫu + handoff. `cod_ship` đang bị chặn vì thiếu **bảng phí COD**, nhưng luật ship cơ bản thì không cần bảng đó |
| `GAP-07` | Gửi hình/video/catalog/profile | 102 ảnh **draft**, 0 video, 0 catalog, 0 profile | 🔴 **CHƯA ĐẠT** | U6 — duyệt ảnh, nhập video + catalog từ Drive |
| `GAP-08` | Hỏi "lấy VAT không" → đổi STK nhận tiền | Không có bước hỏi; `vatRate=null` | 🔴 **CHƯA ĐẠT** | U3 — sau `CONFLICT-VAT-001` |
| `GAP-09` | Gửi thông báo giá **đầu mỗi tháng** | Có `CampaignScheduler`, không có loại chiến dịch "bảng giá tháng" | 🔴 **CHƯA ĐẠT** | U5 |
| `GAP-10` | Ký gửi có **pháp nhân bán khác** (EUS) | Một pháp nhân bán duy nhất | 🟠 **CHƯA MÔ HÌNH** | U2/U3 — ảnh hưởng nội dung xác nhận + hoá đơn |
| `GAP-11` | Đọc ảnh/text nhóm vận chuyển → chuẩn hoá xác nhận đã giao | Không có | 🟠 **NGOÀI MÔ TẢ AGENT HỢP ĐỒNG** | Khách muốn (`SRC-FLOW` 2.3) nhưng `SRC-HD-PL01` §2.2 không liệt kê → cần chốt phạm vi trước |
| `GAP-12` | Đối soát token ngày 05 hàng tháng; hết số dư → ngừng AI | Không đo, không đối soát, không cổng số dư | 🔴 **CHƯA ĐẠT** | U6 — **nghĩa vụ hợp đồng `SRC-HD-PL03`** |
| `GAP-13` | Xoá dữ liệu + bản sao lưu trong 15 ngày khi chấm dứt, xác nhận bằng văn bản | Không có thủ tục/kịch bản | 🔴 **CHƯA ĐẠT** | U6 |
| `GAP-14` | Phân quyền Sale / **Kế toán** / Quản lý | `USER_ROLES` chỉ có `ADMIN`, `SALE` | 🔴 **CHƯA ĐẠT** | U6 — khảo sát nói kế toán kiểm bước cuối |
| `GAP-15` | Dashboard: hội thoại real-time, cảnh báo **tin nhắn trôi**, đơn chờ duyệt, thông báo cho quản lý Sale | Console vận hành có feed + hàng việc; chưa có cảnh báo tin trôi và thông báo quản lý | 🟠 **ĐẠT MỘT PHẦN** | U6 |
| `GAP-16` | Khuyến mãi tháng/quý/năm, gồm *mua N tặng 1* và *tặng SKU khác* | Không có mô hình | 🔴 **CHƯA ĐẠT** | U4 — sau `MISS-05` |
| `GAP-17` | UAT **2 nhóm × 2 ngày**, đạt **≥90%** trên bộ dữ liệu Bên B phê duyệt | `SRC-GOLDEN` có 15 ca **chưa được duyệt**; **chưa có cỗ máy đo tỷ lệ đạt**; chưa chọn nhóm/lịch | 🔴 **CHƯA ĐẠT** | U7 — chặn nghiệm thu |
| `GAP-18` | **Không báo giá sai** trong bộ ca đã duyệt | `ELNI`/`FELIX` đang dùng giá tháng 07 | 🔴 **ĐANG VI PHẠM ĐƯỢC** | U2 **phải xong trước** UAT — nếu không, một ca giá sai đủ để trượt ngưỡng |

**Còn thiếu (`MISSING`) — không suy đoán được từ bất kỳ nguồn nào đã đọc:**

| missId | Thiếu gì | Chặn cái gì |
|---|---|---|
| `MISS-01` | **Bảng phí COD** ("biểu mẫu riêng" theo khảo sát) | `cod_ship`, U3 |
| `MISS-02` | **Biểu cước ship + định nghĩa vùng nội thành** | Phần *tính tiền* của ship (không chặn luật ≥2/1 SP) |
| `MISS-03` | **PO "Công nợ 7 ngày"** — khảo sát liệt kê, Drive không có | `CONFLICT-KYGUI-TERM-001` |
| `MISS-04` | **Ngưỡng số lượng cho từng deal riêng** — bảng Drive không có cột này | Không còn chặn U2: đang chạy theo **`ASM-03`** (`minQuantity=1`), kèm 3 biện pháp giảm thiểu. **Rủi ro báo giá thấp vẫn còn** cho tới khi khách trả lời |
| `MISS-05` | **Công thức khuyến mãi**: điều kiện, phạm vi đại lý, SKU quà, ngưỡng, cộng dồn, hiệu lực | U4 |
| `MISS-06` | **Bộ dữ liệu kiểm thử được Bên B phê duyệt** (ngưỡng ≥90% đã có trong hợp đồng, cái thiếu là **bộ ca được duyệt** và **cách đo**) | U7, nghiệm thu |
| `MISS-10` | **Bản ký 26/08/2026 của hợp đồng + 3 phụ lục** để đọc trực tiếp — bản trong `Downloads` là export cũ | Rà lại mọi mục dẫn `SRC-HD-*` trong tài liệu này |
| `MISS-07` | **Map nhóm Zalo → đại lý** cho ~200 nhóm | Nhận diện đại lý; hiện có 2/200 |
| `MISS-08` | **Catalog + profile ULTTY** dạng dùng được | `GAP-07` |
| `MISS-09` | **Map SKU ↔ mã KiotViet** (mã nội bộ dạng số) | Sau GĐ1 |

---

## 8. NGOÀI PHẠM VI (`OUT_OF_SCOPE`) — Drive mô tả nhưng hợp đồng GĐ1 không yêu cầu tự động hoá

| Nội dung | Nguồn | Vì sao ngoài phạm vi |
|---|---|---|
| Lên đơn KiotViet tự động | `SRC-QT-ORDER` b.1 | `SRC-HD-PL01` §2.2 ghi rõ *"báo Sale kiểm tra hàng tồn và lên đơn trên KiotViet"* — **người làm**, không phải AI |
| Hai cổng duyệt KSNB | `SRC-QT-ORDER` b.2, b.6 | Không có trong mô tả 5 agent |
| Giao Task trên Base, BPVH đóng/giao hàng | `SRC-QT-ORDER` b.5–b.7 | Không có trong hợp đồng |
| Sinh PGH / PO / biên bản bàn giao, chữ ký, dấu treo | `SRC-QT-ORDER`, `SRC-PO-*` | Không có trong hợp đồng |
| Quy trình **hoàn/trả hàng B2B** (BPKD → Trưởng BP → BGĐ → Base → BPVH) | `SRC-QT-RETURN` | Không có agent hoàn trả trong `SRC-HD-PL01` §2.2 |
| Quy trình **tiếp xúc khách hàng mới** / khai thác lead (SWOT, đánh giá tiềm năng) | `SRC-QT-CONTACT` | Không có trong hợp đồng |
| Quy trình **preorder** (BGĐ duyệt số lượng **và giá bán** trước khi chốt) | `SRC-QT-PREORDER` | Không có trong hợp đồng — nhưng ghi nhận: **thêm một cổng BGĐ về giá** |
| Quy trình **đưa SP vào thị trường** (phân tích đối thủ, chiến lược) | `SRC-QT-NPI` | Hoàn toàn ngoài phạm vi |
| Theo dõi & thu hồi công nợ | `SRC-QT-ORDER` b.8 | Ngoài GĐ1 |

**Không được tự thêm** trong U1–U7: KiotViet API thật, tích hợp Base, tự động hoá kho, tự động hoá
hoàn/trả, CRM đầy đủ.

---

## 9. BUSINESS ACCEPTANCE CASES

Đặc tả hành vi mong đợi để milestone sau code theo. **Chưa hiện thực trong milestone này.**
Ca có 🔒 phụ thuộc một `CONFLICT`/`MISSING` chưa giải → **chưa được viết thành test khẳng định**.

| caseId | Tình huống | Hành vi mong đợi | Phụ thuộc |
|---|---|---|---|
| `ORDER-49` | Đại lý đã map, SKU rõ, tổng **49** SP, giá đủ | AI tự soạn + gửi xác nhận; sinh việc Sale nhập KiotViet | — |
| `ORDER-50-BOUNDARY` | Y hệt trên, tổng **đúng 50** | Tự gửi (`ASM-02`). Ca này khoá vùng biên: đổi `maxAutoConfirmQuantity` sang 49 thì ca này **phải** đảo sang handoff | `ASM-02` |
| `ORDER-51` | Y hệt, tổng **51** | Không tự gửi; lý do `QUANTITY_ABOVE_THRESHOLD`; chuyển Sale trước khi gửi | — |
| `UNKNOWN-DEALER` | Tin đặt hàng từ nhóm **chưa map** đại lý | Không tự gửi; lý do `DEALER_UNKNOWN`; vào hộp "nhóm chưa map" | — |
| `MISSING-PRICE` | SKU thuộc danh mục nhưng **không có giá hiện hành** | Không tự gửi; cảnh báo; chuyển Sale. **Không** rơi về giá tháng cũ | `GAP-03` |
| `DEALER-OVERRIDE` | Đại lý có giá riêng cho SKU | Áp giá riêng ở **mọi số lượng** (`ASM-03`), kèm lý do quyết định có mã | `ASM-03` |
| `DEALER-OVERRIDE-QTY-1` | Cùng đại lý, đơn **1 cái** | Vẫn áp giá riêng (`ASM-03`). Ca này tồn tại để **khoá giả định**: khi khách trả lời có ngưỡng, đây là ca phải đổi kết quả |
| `PROMOTION-GIFT` 🔒 | Đơn chạm ngưỡng có quà (vd *ELNI mua 5 tặng ELNA*) | Nêu quà trong xác nhận; không tự suy công thức | `MISS-05` |
| `SHIP-1` | Đơn **1 SP**, giao thẳng khách (TH2) | **Không** tự báo số tiền cước; phát câu mẫu và chuyển Sale báo phí | `FACT-SHIP-01`, `FACT-SHIP-03` |
| `SHIP-2` | Đơn **≥ 2 SP** | Nói **miễn phí ship**; không cần Sale cho riêng khoản ship | `FACT-SHIP-01` |
| `VAT-ASK` 🔒 | Khách hỏi có xuất hoá đơn không | Không tự trả lời có/không; chuyển Sale | `CONFLICT-VAT-001` |
| `PRICE-RETAIL-ADVICE` | Người **không phải** đại lý/CTV hỏi giá | Trả **Giá bán lẻ tối thiểu** + qualifier | `FACT-PRICE-05` |
| `PRICE-DEALER-ADVICE` | **Đại lý/CTV** hỏi giá | Trả **Đơn giá CTV** (giá họ thật sự mua), không trả giá lẻ | `FACT-PRICE-05` |
| `PRICE-MONTH-STALE` | Tháng hiện hành chưa có bảng giá đã duyệt | Không rơi về tháng trước; báo thiếu và chuyển Sale | `SUP-01` |
| `CONTENT-NOT-APPROVED` | Khách xin ảnh/video SKU chỉ có nội dung `draft` | Không gửi nội dung chưa duyệt; chuyển Sale | `GAP-07` |
| `STOCK-QUESTION` | Khách hỏi còn hàng không | Không trả lời tồn kho (GĐ1 không gọi ERP); chuyển Sale | `SRC-GOLDEN` |
| `QUOTED-CONTEXT` | Tin trả lời (quote) kiểu *"c thêm 5c nhé"* | Suy SKU **từ tin được quote**; không có quote → không đoán, chuyển Sale | `SRC-GOLDEN` |

---

## 10. BACKLOG TRIỂN KHAI KẾ TIẾP (đã xếp thứ tự)

| Thứ tự | Milestone | Điều kiện mở | Vì sao đứng ở đây |
|---|---|---|---|
| 1 | **Hỏi khách 3 câu** *(chưa liên hệ được 28/08)* | — | `CONFLICT-PRICE-SOURCE-001` · `CONFLICT-ORDER-THRESHOLD-001` · `MISS-04`. **Không còn chặn U2** — đang chạy theo `ASM-01..03` (§3bis). Vẫn phải hỏi: cả ba đều đảo ngược bằng dữ liệu/cấu hình |
| 1b | **Sửa provenance của `pricePeriod.note`** | Không chờ ai | Chỉ sửa chú thích cho đúng nguồn (kiểm thử nội bộ, **không** phải khách xác nhận). Không đổi số, không đổi hành vi. Làm được ngay và nên làm trước, vì đây là **phát biểu sai về khách hàng trong repo public** (`SUP-01`) |
| 2 | **U2 — Giá & chính sách đại lý** | **Mở** (theo `ASM-01..03`) | `GAP-03` đang **báo sai giá 2 SKU có lưu lượng thật** — rủi ro nghiệp vụ cao nhất đang mở |
| 3 | **U1 — Experience split** | Độc lập | Không phụ thuộc dữ liệu khách, chạy song song được |
| 4 | **U3 — Ship / COD / VAT** | Ship: mở ngay (`GAP-06` không cần biểu cước). COD/VAT: cần `MISS-01`, `CONFLICT-VAT-001` | Tách đôi: phần làm được làm trước |
| 5 | **U4 — Khuyến mãi** | Cần `MISS-05` | Không có công thức thì không có gì để code. **Không đặt giả định ở đây**: khuyến mãi sai tạo nghĩa vụ giao quà thật, khác hẳn ba giả định giá vốn đảo ngược được |
| 6 | **U5 — CSKH** | Cần `GAP-09` | Thông báo giá tháng là nghĩa vụ hợp đồng, tái dùng kết quả U2 |
| 7 | **U6 — Vận hành / cảnh báo / nội dung** | Cần `MISS-08` | Gồm cả `GAP-12`, `GAP-13`, `GAP-14` — **nghĩa vụ hợp đồng, dễ bị bỏ quên** |
| 8 | **U7 — UAT hợp đồng** | Cần `MISS-06` **và U2 xong** | Hợp đồng đã có ngưỡng cứng **≥90% / 2 nhóm / 2 ngày**, nên UAT không còn là bài định tính. `GAP-18` nói rõ: vào UAT khi giá còn sai là **tự nộp điểm trừ** |

---

## 11. BẢO MẬT — cái gì CỐ Ý không đưa vào repo

Repo này **public**. Những thứ sau đã đọc trong quá trình đối chiếu và **cố ý không commit**:

| Không commit | Vì sao | Ở đâu |
|---|---|---|
| **Bảng giá riêng 21 đại lý × 22 SKU (≈120 ô giá)** | Danh sách giá mật theo đối tác | Drive `Báo giá sản phẩm/`, chỉ tham chiếu bằng `sourceId` |
| **Tên 21 đại lý/CTV** | Danh sách đối tác là *Thông tin mật* theo `SRC-HD-00` §7.1 | Thay bằng `DLR-01…DLR-21`, bảng ánh xạ để ngoài repo |
| **Nội dung PO thật**: tên pháp nhân mua, địa chỉ, người nhận, số điện thoại, **số tài khoản ngân hàng** | PII + dữ liệu tài chính | `ho-so-khao-sat/` (đã gitignore) |
| **Số PGH, mã hợp đồng đã ký của khách** | Định danh giao dịch thật | như trên |
| **Toàn văn hợp đồng và phụ lục** | Hợp đồng thương mại | Ngoài repo hoàn toàn |
| **Ảnh chụp tin nhắn khách** | PII trong hội thoại | `ho-so-khao-sat/gd1/anh_chup_tin_nhan_khach/` (đã gitignore) |

**Đã commit, có chủ ý:** `sourceId` + tiêu đề + ngày + phân loại; sự kiện nghiệp vụ dạng luật; đếm và
cấu trúc; **delta giá của bảng giá chung** (`ELNI`, `FELIX`) — bảng giá chung được gửi tới **mọi**
đại lý/CTV nên không phải giá mật song phương, và toàn bộ bảng giá 19 SKU **vốn đã nằm trong repo
public** tại `tenants/ultty/data/knowledge.json`.

> ⚠️ **Quan sát cần người quyết (ngoài phạm vi milestone này):** repo public **đang chứa sẵn** bảng
> giá 19 SKU đầy đủ 4 mức, kể cả *Đơn giá CTV*. Đó là quyết định có từ trước, không phải do lần này
> tạo ra. Nếu khách coi *Đơn giá CTV* là mật thì cần xử lý riêng — và **việc nhập ≈120 ô giá riêng
> theo đại lý ở U2 sẽ khiến vấn đề nghiêm trọng hơn nhiều**. Nên chốt nơi lưu (DB có phân quyền,
> không phải tệp seed trong repo public) **trước khi** làm U2.

---

## 12. PLATFORM PRIMITIVE CANDIDATES

Ghi cho **Platform Track**. Không hiện thực ở đây, và không nhét riêng vào Ultty theo cách chỉ đúng
cho một khách.

### `PPC-01` — Nguồn sự thật có phiên bản + provenance cho dữ liệu tham chiếu

- **Vấn đề:** giá của Ultty thay đổi **theo tháng bằng văn bản có chữ ký**. Hôm nay nguồn sự thật là
  tệp seed cộng một chuỗi `note` do người viết tay — và `note` đó **đã sai** (`SUP-01`) mà không có
  gì phát hiện được. Không có `sourceId`, không `effectiveFrom`, không ai duyệt, không lịch sử.
- **Trừu tượng đề xuất:** bản ghi *reference dataset* có phiên bản — `{datasetKey, version,
  effectiveFrom, effectiveTo, sourceId, approvedBy, approvedAt, checksum}` — cộng truy vấn "bản có
  hiệu lực tại thời điểm T". Đọc ngoài khoảng hiệu lực thì **fail-closed**, không im lặng rơi về bản
  cũ.
- **Vì sao dùng lại được:** mọi khách B2B đều có bảng giá/chính sách theo kỳ. Amico, Wata sẽ gặp y hệt.
- **Tệp có thể đụng:** `apps/api/src/knowledge/*`, `packages/tenant/*`, schema Prisma.
- **Bằng chứng nghiệp vụ:** `SUP-01` — 2 SKU báo sai giá suốt 10 ngày mà không ai biết, **và** một kỳ
  giá được đánh dấu `active` bởi một thao tác **kiểm thử**, với chú thích quy nhầm cho khách hàng.
  Nếu bản ghi kỳ giá có `sourceId` bắt buộc và một trạng thái `draft`/`test` tách khỏi `approved` thì
  cả hai lỗi đều **không xảy ra được**: không có văn bản nguồn thì không thể đặt kỳ giá sang `active`.

### `PPC-02` — Phát hiện lệch nguồn ngoài (external source drift)

- **Vấn đề:** thư mục Drive của khách đổi ngày 18/08; đội phát triển biết ngày 28/08, và chỉ vì có
  người đi kiểm tra tay. Bản mirror local dừng ở 12/08 mà **không có tín hiệu nào** báo đã cũ.
- **Trừu tượng đề xuất:** *source registry* ghi `{sourceId, locator, lastSeenVersion, lastCheckedAt}`
  cộng tác vụ đối soát định kỳ, phát cảnh báo khi nguồn ngoài đổi so với bản đã hấp thụ. Chỉ **phát
  hiện**, không tự nhập.
- **Vì sao dùng lại được:** mọi tenant đều có nguồn ngoài do người khác quản (Drive, Sheets, ERP).
- **Bằng chứng nghiệp vụ:** `SUP-01`, `SUP-02` — hai giả định sai, cùng một nguyên nhân gốc.

### `PPC-03` — Cổng chặn năng lực theo dữ liệu (data-driven capability gate)

- **Vấn đề:** `readiness.blockedCapabilities` hiện là **danh sách chữ do người viết tay** trong
  `tenant.json`. Nó ghi *lý do* nhưng không ghi **dữ liệu nào còn thiếu**, nên không ai biết khi nào
  được mở, và không có gì tự mở khi dữ liệu về.
- **Trừu tượng đề xuất:** khai báo cổng theo **điều kiện dữ liệu** (`requires: [datasetKey…]`), suy
  trạng thái blocked/unblocked từ tình trạng dữ liệu thật, và phát tín hiệu khi một cổng trở nên mở
  được.
- **Vì sao dùng lại được:** mỗi khách lên hệ thống đều đi qua giai đoạn "có năng lực, thiếu dữ liệu".
- **Bằng chứng nghiệp vụ:** `MISS-01…MISS-09`; `cod_ship` bị chặn vì thiếu bảng phí COD, che mất việc
  **luật ship cơ bản không cần bảng đó** (`GAP-06`).

### `PPC-04` — Sổ đăng ký xung đột nguồn (source conflict registry)

- **Vấn đề:** khi hai nguồn có thẩm quyền nói khác nhau, hôm nay chỗ duy nhất ghi lại là văn xuôi
  trong tài liệu. Code không thấy được, nên **không có gì ngăn** một lần triển khai sau vô tình tự
  giải quyết bằng cách chọn đại một bên.
- **Trừu tượng đề xuất:** xung đột là **dữ liệu có định danh** — `{conflictId, sources[], status,
  decidedBy, decidedAt}` — và một quy ước cho phép luật nghiệp vụ **tham chiếu** tới xung đột chưa
  giải, để hành vi ở vùng tranh chấp fail-closed thay vì đoán.
- **Vì sao dùng lại được:** mọi tenant có nhiều hơn một nguồn giấy tờ sẽ có mâu thuẫn.
- **Bằng chứng nghiệp vụ:** 7 xung đột ở §3, trong đó `CONFLICT-ORDER-THRESHOLD-001` nằm ngay trên
  đường tự động gửi tin cho khách.

---

## 13. Nhật ký đo

| Hạng mục | Giá trị đo được |
|---|---|
| Ngày đối chiếu | 28/08/2026 |
| `origin/main` | `ae04b2b645a81e7b9893dbb258ccccb998099c1e` (CI xanh, 0 PR mở) |
| Nguồn hợp đồng | 1 hợp đồng + 3 phụ lục. ⚠️ **Bản đọc được là export CŨ**; ngày ký, căn cứ pháp lý và điều khoản UAT đã sửa theo bản ký 26/08/2026 do chủ dự án cung cấp — còn nợ một lần đọc trực tiếp (`MISS-10`) |
| Nguồn Drive | 7 thư mục, đo trực tiếp trên Drive **và** trên bản mirror local |
| Tài liệu gốc đọc thêm lần này | 8 tệp mà `mo-ta-nghiep-vu.md` §0 còn ghi "CHƯA đọc" |
| Sự kiện phân loại | **42** `FACT` · **7** `CONFLICT` · **2** `SUPERSEDED` · **10** `MISSING` · 9 `OUT_OF_SCOPE` · 3 `ASM` · **18** `GAP` (đếm bằng `grep` trên chính tệp này, không đếm tay) |
| Xung đột tự giải quyết | **0** — 3 xung đột được chạy theo **giả định có ghi sổ** (`ASM-01..03`), vẫn OPEN |
| Đính chính từ người vận hành | 28/08/2026 — (1) kỳ giá `2026-08` trong repo là **bản copy để kiểm thử gd1**, không phải quyết định của khách → `SUP-01` + `FACT-PRICE-07`; (2) bản hợp đồng dùng lúc soạn là **export cũ** → đã sửa ngày ký (26/08/2026), căn cứ pháp lý, và bốn `FACT-UAT-*`; gỡ `SUP-03` và `CONFLICT-LEGAL-001` vì cả hai dựng trên bản cũ |
| Giả định tự đặt | 3 (`ASM-01..03`, §3bis) — vì chưa liên hệ được khách. Không mục nào đóng xung đột tương ứng |
