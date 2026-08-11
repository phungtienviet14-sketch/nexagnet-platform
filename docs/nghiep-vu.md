# MÔ TẢ NGHIỆP VỤ — U Ultty (đối chiếu NGUỒN GỐC)

> **Cảnh báo lịch sử:** bản đầu của tài liệu này (09/07/2026, suy từ code + CLAUDE.md) **có sai lệch**. Bản này viết lại bằng cách đọc **hồ sơ gốc của khách**, và ghi rõ chỗ nào **code đang khác nguồn gốc**.
>
> **Vai trò tài liệu:** mô tả nghiệp vụ THẬT + đối chiếu với **as-built** (hệ thống đang làm gì). Đây là tài liệu tra cứu cho Sale/kế toán/khách và cho người code.
> **Phân biệt:** `docs/khach-hang/ultty/nguon-goc/de-xuat-giai-phap-netviet.md` = đề xuất giải pháp NetViet (giữ nguyên) · [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md) = quyết định kỹ thuật · [so-do-he-thong.md](so-do-he-thong.md) = sơ đồ · tài liệu này = **nghiệp vụ + sai lệch**.
>
> **Không chứa PII.** Hồ sơ gốc có SĐT/địa chỉ/số tài khoản/tên người — đã gitignore, **không trích vào đây**.
> Cập nhật: 09/07/2026.

---

## 0. Nguồn kiểm chứng (minh bạch phạm vi)

**Đã đọc & đối chiếu trực tiếp:**
| Nguồn gốc | Dùng để xác định |
|---|---|
| `docs/khach-hang/ultty/nguon-goc/khao-sat-khach-hang-2026-07.docx` (bản `.md` trong hồ sơ khảo sát) | Bối cảnh, chính sách, checklist chốt đơn, bảo hành, ngôn ngữ viết tắt |
| `Các quy trình_/QT đặt hàng.pdf` | **Quy trình đặt hàng thật 9 bước + vai KSNB/BPKD/BPVH** |
| `PO - Biên bản bàn giao_/PO _ Công nợ 30 ngày.pdf` | Điều khoản công nợ 30, miễn phí giao hàng, vai trò PGH |
| `PO - Biên bản bàn giao_/PO_công nợ 45 ngày .pdf` | Điều khoản công nợ 45, phạt chậm, ngưỡng ngừng cấp, **VAT theo từng lần giao** |
| `PO - Biên bản bàn giao_/PO _ Kí gửi...pdf` | Điều khoản ký gửi (đối soát cuối tháng, TT 7 ngày sau HĐ) |
| ` AI Zalo_/Thông báo giá tháng 7.2026.pdf` | **Bảng giá 19 SKU (4 mức giá)** |

**CHƯA đọc — chưa phản ánh vào hệ thống** (còn trong hồ sơ, cần bổ sung sau):
`QT Preoder.pdf` · `QT_Báo giá B2B xlsx.pdf` · `QT_Tiếp xúc khách hàng.pdf` · `QT đưa sp vào TT.pdf` · `QT_Hoàn trả hàng B2B.pdf` · `Biên bản bàn giao.pdf` · `Tên và mã sản phẩm.xlsx` · `Viết tắt_.docx` · ảnh `Bảng đặt hàng của khách.jpg`.

---

## 1. Bối cảnh & nguyên tắc

U Ultty (gia dụng cao cấp) bán sỉ cho **200–300 đại lý/CTV** qua **~200 nhóm Zalo** (+100–150 nhóm thi thoảng), **10–20 đơn/ngày**, chủ yếu **đơn số lượng lớn** chốt bằng **tin nhắn text viết tắt, không dấu** (**<20%** là ảnh chụp bảng). Luồng: Zalo → lên đơn **KiotViet** → xử lý nội bộ trên **Base** → giao vận **Aha/Viettel/GHTK**. **Chưa có API**, chưa có IT nội bộ.

> **Nguyên tắc bất di bất dịch:** AI **đọc hiểu**, **quy tắc chốt số**, **người giữ nút duyệt**. LLM chỉ phân loại ý định + trích xuất + soạn văn bản; **không tính tiền, không quyết chính sách**.

---

## 2. Vai trò / phòng ban (theo quy trình gốc)

| Vai | Viết tắt | Việc |
|---|---|---|
| Đại lý / CTV | — | Báo đơn lên nhóm Zalo |
| **Bộ phận Kinh doanh** | **BPKD** | Lên đơn KiotViet, lập PGH/PO, gửi khách xác nhận, giao Task Base, theo dõi công nợ |
| **Kiểm soát nội bộ** | **KSNB** | **2 cổng duyệt**: (1) đối chiếu chứng từ trước khi gửi khách; (2) duyệt Task trên Base trước khi vận hành nhận |
| **Bộ phận Vận hành** | **BPVH** | Đóng hàng, giao hàng, thu tiền (đơn TT ngay), lấy chữ ký PGH/PO, up ảnh Base |
| Kế toán | — | Xuất VAT (nháp → khách kiểm → xuất), kiểm tra khi lên hệ thống |
| Kỹ thuật | — | **Quyết định lỗi** bảo hành (AI & Sale không tự phán) |
| Sale (NetViet gọi chung) | — | Người **duyệt 1 chạm** trong app AI (thực chất nằm trong BPKD) |

> Chữ ký trên Phiếu giao nhận hàng hóa gồm **Nhân viên + Giám sát** của cả hai bên → "Giám sát" trong hệ thống AI ánh xạ đúng vai **KSNB**.

---

## 3. Quy trình đặt hàng THẬT (9 bước, 2 cổng KSNB)

Nguồn: `QT đặt hàng.pdf`.

1. **BPKD lên hóa đơn KiotViet** sau khi khách báo đơn trên nhóm; lập thêm phiếu giao hàng cho ĐVVC (nếu gửi tỉnh); một số trường hợp lập thêm **PO giao hàng**.
2. **KSNB kiểm tra, đối chiếu** (PGH, hóa đơn bán lẻ, PO, phiếu ĐVVC). *Không duyệt → BPKD sửa, gửi lại.* ← **cổng 1**
3. **BPKD gửi khách xác nhận** lại thông tin đơn.
4. **Khách đối chiếu & phản hồi** (sai/đổi → báo lại lên nhóm).
5. **BPKD giao Task trên Base** cho BPVH (đính kèm PGH, hóa đơn, PO, phiếu ĐVVC).
6. **KSNB kiểm tra, xét duyệt Task** trên Base. *Thiếu/sai → đẩy lại BPKD.* ← **cổng 2**
7. **BPVH xử lý Task**: đóng hàng, giao hàng. Đơn **thanh toán ngay** → BPVH thu tiền (CK/tiền mặt) + ảnh xác nhận. Đơn **công nợ/ký gửi** → khách ký PO + PGH. Ảnh giao hàng up lên Base.
8. **BPKD gửi ảnh xác nhận đã giao** vào nhóm Zalo + **theo dõi công nợ** (file Excel) & hỗ trợ kế toán thu hồi.
9. **Chăm sóc khách hàng sau bán.**

**AI nằm ở đâu:** hệ thống AI hỗ trợ **bước 1 → 3** (đọc tin nhóm, bóc tách đơn, dựng format xác nhận, Sale duyệt 1 chạm, đẩy KiotViet). Từ bước 5 trở đi vẫn là Base/BPVH (GĐ2 mới tích hợp).

> ⚠️ **Đính chính:** "1 Sale duyệt 1 chạm" (khảo sát §4) đúng ở nghĩa *một người của BPKD chốt với khách*. Nhưng **quy trình nội bộ có 2 cổng KSNB** — hệ thống AI hiện **chưa mô hình hoá** KSNB/BPVH.

---

## 4. Danh mục & mô hình giá — ✅ đã kiểm chứng khớp

`Thông báo giá tháng 7.2026.pdf` có **19 SKU**, mỗi SKU 4 mức: **Giá Niêm Yết · Giá bán lẻ · Giá bán lẻ tối thiểu · Đơn giá CTV**.

- **Giá tính đơn = "Đơn giá CTV"** (giá đại lý/CTV TRẢ) → trong code là `wholesale`. **Đã đối chiếu khớp từng dòng** với `seed.ts`.
- "Giá bán lẻ tối thiểu" = **sàn** đại lý được bán ra. "Niêm yết"/"Bán lẻ" là tham chiếu báo giá.
- **Bảng giá chung** cho mọi đại lý; **một số đại lý lấy SL lớn có deal riêng** → mô hình `DealerPriceOverride` (dealer + sku → giá). Hiện **rỗng**, chờ dữ liệu (A2).
- **Mã hàng nội bộ dạng số** (PGH ghi mã kiểu `8716` cho ELNI 16) ≠ SKU chữ trong code → **cần bảng map SKU ↔ mã KiotViet** khi tích hợp (Phase 4).

---

## 5. Bốn nhóm chính sách + điều khoản THẬT

| Chính sách | Mã trong code | Điều khoản theo nguồn gốc |
|---|---|---|
| Công nợ 30 ngày | `cong_no_30` | Thanh toán trong vòng **30 ngày kể từ ngày nhận hàng**. |
| Công nợ 45 ngày | `cong_no_45` | **45 ngày kể từ ngày nhận hàng**; **đợt hàng sau phải thanh toán hết đợt trước**; **quá 60 ngày** chưa TT → **tạm ngừng cung cấp**; **chậm TT → phạt 1%/ngày** trên giá trị chậm; báo kế hoạch đặt hàng **trước tối thiểu 5 ngày**; **giá đã gồm GTGT, xuất hóa đơn theo từng lần giao thành công**. |
| Ký gửi | `ky_gui` | Gửi hàng trước; **cuối tháng đối soát số lượng tiêu thụ thực tế**; xuất hóa đơn; **thanh toán trong 7 ngày kể từ ngày xuất hóa đơn**. Chỉ 2–3 bên. |
| Thanh toán ngay | `thanh_toan_ngay` | CTV số lượng nhỏ; **BPVH thu tiền khi giao** (CK/tiền mặt) + ảnh xác nhận. |
| COD / thu hộ | `cod` | Giao thẳng khách của đại lý; **phí thu hộ tính theo "biểu mẫu riêng"**, **báo trước** để đại lý xác nhận phí. |

**Điều kiện áp công nợ:** đại lý lấy **SL lớn (20–100 SP)**.
**Chưa mô hình hoá trong code:** phạt 1%/ngày · ngưỡng 60 ngày ngừng cấp · ràng buộc đợt-sau-trả-đợt-trước · báo trước 5 ngày → thuộc **module theo dõi công nợ** (làm sau, không cản Phase 3).

> ❓ **"Công nợ 7 ngày":** khảo sát liệt kê `PO (Ký gửi, Công nợ 7 ngày, 30 ngày, 45 ngày)`, nhưng **hồ sơ chỉ có PO cho 30 / 45 / ký gửi**. Có thể "7 ngày" chính là điều khoản **TT trong 7 ngày sau khi xuất hóa đơn** của **ký gửi**. **CẦN KHÁCH XÁC MINH** trước khi thêm mã chính sách mới.

---

## 6. Hai mẫu đơn & bộ chứng từ

**TH1 — giao cho đại lý:** `Chi nhánh_Ngày_Tên CTV/Đại lý — Số lượng x Mã SP — Đơn giá 1SP — Tổng đơn`.
**TH2 — giao thẳng khách của đại lý:** thêm `Tên khách — SĐT/Địa chỉ — Cước vận chuyển — Thu hộ/Không thu`.

**Phân biệt quan trọng** (AI hay bị nhầm):
| Chứng từ | Là gì | Ai ký |
|---|---|---|
| **"Format xác nhận đơn"** (AI dựng) | Tin nhắn chốt lại đơn với đại lý trong nhóm Zalo | không ký |
| **PGH — Phiếu giao nhận hàng hóa** | **Căn cứ pháp lý** xác nhận hàng đã giao & **ghi nhận công nợ**; là phần không tách rời của đơn đặt hàng | KSNB + BPKD + BPVH + khách |
| **PO** | Đơn đặt hàng theo mẫu; **đóng dấu treo** công ty | BPVH + khách |
| **Biên bản bàn giao** | 1 mẫu *(chưa đọc)* | — |

> Hệ thống AI hiện **chỉ sinh "format xác nhận đơn"**, **không** sinh PGH/PO.

---

## 7. Quy tắc tính tiền — as-built (đánh dấu rõ cái nào TẠM TÍNH)

Nguồn số: [rules/config.ts](../apps/api/src/rules/config.ts). **LLM không đụng các số này.**

| Luật | Code hiện tại | Đối chiếu nguồn gốc |
|---|---|---|
| Giá 1 SKU | `wholesale` (hoặc deal riêng) | ✅ đúng ("Đơn giá CTV") |
| Miễn ship | tổng SL **≥ 2** → 0đ | ✅ khớp ("đơn 2 SP miễn ship") |
| **TH1 (giao đại lý)** | **luôn miễn ship** | ✅ khớp PGH: *"Miễn phí giao hàng đúng thời hạn không móp méo bể vỡ"* |
| Ship 1 SP nội thành | 30.000đ (Grab, HN/HCM) | ⚠️ **TẠM TÍNH** — nguồn gốc chỉ nói *"Grab nội thành"*, **không có mức tiền** |
| Ship 1 SP đi tỉnh | 40.000đ (Viettel) | ⚠️ **TẠM TÍNH** — không có mức tiền trong hồ sơ |
| VAT | mặc định **KHÔNG**; chỉ áp khi khách ghi "xuất VAT" · 10% | ⚠️ **SAI LỆCH** — xem §13 |
| COD | TH2 + "thu hộ" → **20.000đ phẳng** | ⚠️ **SAI LỆCH** — thực tế theo **"biểu mẫu riêng"** (bảng phí), chưa có trong hồ sơ |
| Đối chiếu tổng | lệch > 5% → cảnh báo | (quy ước kỹ thuật, không có trong nguồn gốc) |

Cảnh báo đưa đơn về `needs_edit`: SP chưa map được · chưa xác định đại lý · tổng lệch quá ngưỡng.

---

## 8. Bảy ý định (intent) & đội 6 agent — as-built

7 intent: `dat_don` · `hoi_gia` · `hoi_san_pham` · `chinh_sach_cong_no` · `bao_hanh_khieu_nai` · `van_chuyen` · `khac`.
6 vai dưới **1 orchestrator, dùng chung 1 lần gọi LLM/tin**: Điều phối (Router) · Tư vấn SP · Bán hàng & chốt đơn (**vai DUY NHẤT gọi `priceOrder`**) · Chính sách & tài chính · Hậu mãi & bảo hành · **Giám sát** (0 LLM, ánh xạ vai KSNB).

**Checklist chốt đơn thật (khảo sát §4)** — AI đang số hoá: (1) hình thức ship → (2) hình thức thanh toán (thu hộ hay CK trước) → (3) có/không VAT (gửi STK) → (4) gửi format xác nhận → (5) **sau khi gửi hàng, gửi lại ảnh đã gửi vào nhóm**.
> Bước (5) **hệ thống chưa làm** (thuộc bước 8 quy trình thật).

---

## 9. Giám sát & leo thang — as-built

Nguồn số: [agents.config.ts](../apps/api/src/agents/agents.config.ts). Tất định, 0 LLM.
- **Leo thang** (`needs_edit`, KHÔNG auto-chốt): chưa xác định đại lý từ nhóm · dấu hiệu **khiếu nại gắt** · **đơn ≥ 20.000.000đ**.
- **Theo dõi** (cờ vàng): tổng SL **≥ 30** · đơn có cảnh báo · độ tin cậy intent **< 0.5**.

Triết lý: *đơn sạch thì nhanh, đơn rủi ro thì chuyển người* (NetViet 5.6).

---

## 10. Vòng đời đơn & duyệt — as-built

`draft → pending_review → (needs_edit) → approved → sent → synced` · nhánh `rejected`.
- **GĐ1:** AI soạn → **Sale duyệt 1 chạm** → gửi xác nhận vào nhóm + đẩy KiotViet. AI **không tự gửi**.
- **`AUTO_SEND` (GĐ2, mặc định off):** đơn **không rủi ro** → AI tự chốt; đơn rủi ro vẫn giữ cho người. Bật khi có **văn bản đồng ý của khách**.

> Vòng đời này **dừng ở "đã đẩy KiotViet"**. Quy trình thật còn KSNB cổng 2 → BPVH → ảnh giao hàng → công nợ (§3).

---

## 11. Hậu mãi & bảo hành

Bảo hành **18–36 tháng**. AI **tiếp nhận + phân nhánh + tạo phiếu**, **không tự phán lỗi** (kỹ thuật quyết).

| Nhánh | Điều kiện thật | Code |
|---|---|---|
| **Trong 7 ngày** | Lỗi NSX → báo nhóm → kiểm tra lịch sử/thời gian mua → **kỹ thuật xác nhận lỗi** → **còn nguyên đai kiện, vỏ hộp** → **đổi mới 1-1** | nhận diện theo từ khoá; **chưa kiểm điều kiện "nguyên đai kiện/vỏ hộp"** |
| **Ngoài 7 ngày** | Báo nhóm → kiểm tra lịch sử → kỹ thuật tiếp nhận case bảo hành, làm việc với khách | ✅ |
| **Giao sai/thiếu** | Báo nhóm → kiểm tra **khâu đóng hàng bên giao vận** → đúng lỗi thì **gửi bù** | ✅ |

> Quy trình **Hoàn trả hàng B2B** có file riêng — **chưa đọc, chưa phản ánh**.

---

## 12. Nguồn sự thật: glossary & map nhóm → đại lý

- **Ngôn ngữ đầu vào:** viết tắt, không dấu — *"Gui ve TN cho c"*, *"Gửi OCP"*, *"Bao nhieu tien"*, *"gui nhe"*, *"dung nhu the nao"*.
- **Glossary** (`seed.ts`, gốc từ `Viết tắt_.docx`): địa danh (`TN`=Thái Nguyên, `OCP`=Ocean Park), xưng hô, từ hay dùng (`ck`, `sll`, `cod`).
- **Map nhóm → đại lý theo `chatId` (ID nhóm), KHÔNG theo tên.** Nhóm chưa map → `unknown` → Giám sát leo thang (fail-safe). Sửa được **động** qua panel `/admin` hoặc **MCP tool** (Phase 3).
- Khách hiện đánh dấu đại lý bằng **tag thẻ Zalo** (Đại lý / CTV / Hội nhóm) hoặc **nhớ theo đặc điểm** → chưa có mã đại lý chuẩn (A4).

---

## 13. ⚠️ BẢNG SAI LỆCH: nguồn gốc ↔ code hiện tại

| # | Nguồn gốc nói | Code / tài liệu cũ nói | Mức | Hành động |
|---|---|---|---|---|
| 1 | **VAT:** hợp đồng công nợ B2B ghi *"giá bao gồm GTGT, xuất hóa đơn theo từng lần giao hàng thành công"*; ký gửi → xuất HĐ cuối tháng. Khảo sát: *"tùy trường hợp"*, kế toán xuất nháp → khách kiểm → xuất. | Mặc định **KHÔNG VAT**, chỉ áp khi khách ghi "xuất VAT". | **Cần sửa** | VAT-default nên theo **chính sách/đại lý** (cấu hình), không phải luôn off. |
| 2 | **Phí COD** tính theo **"biểu mẫu riêng"** (bảng phí), báo trước để đại lý xác nhận. | Phí **phẳng 20.000đ**. | **Cần sửa** | Xin **bảng phí COD** (A3); làm dạng bảng-cấu-hình, không phải 1 số. |
| 3 | **Cước ship** 1 SP: Grab nội thành / Viettel tỉnh — **không có mức tiền** ở bất kỳ file nào đã đọc. | 30.000đ / 40.000đ. | **Tạm tính** | Xin biểu cước (A3). TH1 miễn ship thì ✅ đúng. |
| 4 | Khảo sát liệt kê **PO "Công nợ 7 ngày"**; hồ sơ chỉ có PO 30/45/ký gửi. | Chỉ `cong_no_30`, `cong_no_45`. | **Cần xác minh** | Hỏi khách: có chính sách 7 ngày riêng, hay là điều khoản TT-7-ngày của ký gửi? |
| 5 | Quy trình có **2 cổng duyệt KSNB** + **BPVH**; PGH cần 4 chữ ký; PO đóng dấu treo. | "1 Sale duyệt 1 chạm"; không có KSNB/BPVH; không sinh PGH/PO. | **Ghi chú** | Phase sau: mô hình vai + trạng thái sau `synced`. Ảnh hưởng auth (Phase 5). |
| 6 | Điều khoản công nợ: **phạt 1%/ngày**, **>60 ngày ngừng cấp**, **đợt sau trả đợt trước**, **báo trước 5 ngày**. | Không mô hình hoá. | **Ghi chú** | Module theo dõi công nợ (sau). |
| 7 | Mã hàng nội bộ **dạng số** (vd `8716`). | SKU chữ (`ELNI`). | **Ghi chú** | Cần map SKU ↔ mã KiotViet (Phase 4). |
| 8 | Checklist chốt đơn có bước **"gửi lại ảnh đã gửi hàng vào nhóm"**. | Không có. | **Ghi chú** | Thuộc bước 8 quy trình thật (BPVH/Base). |
| 9 | Đổi mới 1-1 yêu cầu **còn nguyên đai kiện, vỏ hộp** + kỹ thuật xác nhận. | Chỉ phân nhánh theo từ khoá. | **Ghi chú** | Thêm nhắc điều kiện vào phiếu bảo hành. |
| 10 | **Bảng giá 19 SKU** (Đơn giá CTV). | `seed.ts` `wholesale`. | ✅ **ĐÚNG** | Không đổi. |
| 11 | **TH1 miễn phí giao hàng.** | `orderType==='TH1' → shippingFee=0`. | ✅ **ĐÚNG** | Không đổi. |

---

## 14. Còn thiếu (chặn chạy thật toàn tập)

Chi tiết + cách hỏi: [checklist-du-lieu-khach.md](checklist-du-lieu-khach.md).

- 🔴 **A4** — danh sách đại lý/CTV + **map nhóm Zalo → đại lý** đầy đủ. *(Cơ chế đã có: panel `/admin` + MCP tool + hộp thư "nhóm chưa map" → nhập dần được, không còn chặn việc build.)*
- 🔴 **A3** — **bảng phí COD** + **biểu cước ship** + xác nhận ngưỡng công nợ.
- 🔴 **A2** — deal riêng theo đại lý.
- 🟠 **B1–B2** — 20–30 tin thật + đơn đúng (golden) → **cổng đo độ chính xác trước go-live** (không thay thế được bằng "nguồn sự thật động").
- 🟡 Đọc nốt: `QT Preoder` · `QT_Báo giá B2B` · `QT_Hoàn trả hàng B2B` · `QT_Tiếp xúc khách hàng` · `QT đưa sp vào TT` · `Biên bản bàn giao` → bổ sung vào tài liệu này.
