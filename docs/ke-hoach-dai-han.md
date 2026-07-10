# KẾ HOẠCH DÀI HẠN — HỆ THỐNG AI U ULTTY (ĐỊNH HƯỚNG)

> **Vai trò tài liệu:** lộ trình **định hướng tương lai** cho 6 nhóm tính năng mới, xếp theo phụ thuộc kỹ thuật + giá trị nghiệp vụ. **Có thể bổ sung/bỏ bớt tùy quyết định của khách** — mỗi tính năng có "cổng vào" (điều kiện dữ liệu/quyết định) rõ ràng; chưa qua cổng thì chưa code phần chạm thật.
> **Phân biệt:** [tien-do-va-ke-hoach.md](tien-do-va-ke-hoach.md) = việc **đang dở, chắc chắn làm** (Phase 3→6). Tài liệu này = việc **mới, dài hạn** (Đợt 1→4), đứng TRÊN nền đó.
> Lập: 10/07/2026 · Nguồn ngữ cảnh: [nghiep-vu.md](nghiep-vu.md) · [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md) · `Thiet_ke_AI_Agent_U_Ultty.md` (GĐ2-3 NetViet).

---

## 0. Nguyên tắc áp cho MỌI tính năng mới (không thương lượng)

1. **LLM không tính tiền, không quyết chính sách.** Tính năng mới nào đụng đến tiền (QR, công nợ, sửa đơn) đều đi qua rules engine tất định + nguồn sự thật trong DB.
2. **Người giữ nút duyệt.** Mọi thứ đi RA ngoài (tin nhắc công nợ, xác nhận sửa đơn, xác nhận đã nhận tiền) mặc định qua Sale duyệt; chỉ tự gửi khi có văn bản đồng ý của khách (`AUTO_SEND`, gated vai Giám sát).
3. **Nguồn sự thật động.** Dữ liệu mới (bảng phí COD, ngưỡng công nợ, tài khoản nhận tiền, danh sách Sale trực) là bảng trong Postgres, sửa qua `/admin` + MCP tool — không hardcode.
4. **Lưu vết đầy đủ.** Sửa đơn và thanh toán bắt buộc có audit trail (ai, lúc nào, từ giá trị nào sang giá trị nào).
5. **Đo trước khi hứa.** Tính năng có độ chính xác không chắc chắn (đọc ảnh viết tay) phải qua PoC eval trên dữ liệu thật trước khi cam kết phạm vi — đúng cách đã làm với PoC parser/PoC Bot.

---

## 1. Vị trí hiện tại & nền phải xong trước (Đợt 0)

**Đang có:** pipeline đọc Zalo (zca) → 6 vai agent (1 lần gọi LLM/tin) → rules engine → console Sale duyệt 1 chạm, chạy trên 19 SKU + bảng giá thật; Postgres/Prisma + panel `/admin` + MCP tool (nguồn sự thật động). Chi tiết: [tien-do-va-ke-hoach.md](tien-do-va-ke-hoach.md).

**Đợt 0 = kế hoạch hiện hữu, KHÔNG đổi** (là điều kiện nền cho mọi tính năng dưới đây):

| Nền | Vì sao tính năng mới cần nó |
|---|---|
| Lưu MỌI tin vào DB ngay khi nhận (Phase 3 còn lại) | Sửa đơn cần tra tin cũ; chống gian lận cần lịch sử; NĐ13 |
| Rules-config động + sửa VAT/COD theo nguồn gốc (Phase 3 còn lại) | QR/công nợ tính đúng số; hết "tạm tính" |
| Import Excel A4 (đại lý + map nhóm) | Công nợ/gian lận cần biết đơn thuộc đại lý nào |
| KiotViet Excel/API + map SKU↔mã hàng số (Phase 4) | Sửa đơn phải đồng bộ được bản sửa lên KiotViet |
| Auth theo vai BPKD/KSNB/kế toán + ghi `kpi_events` (Phase 5) | Dashboard cần số liệu; hàng đợi nghi vấn cần vai KSNB |
| Deploy 1 VM + pilot 1-2 nhóm (Phase 6) | Mọi thứ dưới đây chạy trên hệ đã sống |

---

## 2. Sáu tính năng mới — thiết kế định hướng

### F1 — Đổi/sửa đơn ĐÃ CHỐT bằng ngôn ngữ tự nhiên

**Nghiệp vụ:** số hóa đúng **bước 4 quy trình đặt hàng thật** ("khách đối chiếu & phản hồi: sai/đổi → báo lại lên nhóm"). Đại lý nhắn *"doi 10 ghe felix thanh 15 nhe"*, *"huy don sang nay"*, *"doi dia chi ve OCP"* — AI hiểu, tìm đúng đơn, dựng bản so sánh, Sale duyệt.

**Luồng:**
1. Mở rộng 7 → 9 intent: thêm `sua_don`, `huy_don`.
2. **Resolver tìm đơn tham chiếu** (tất định, không LLM): đơn gần nhất của đúng nhóm/đại lý trong N ngày, trạng thái còn sửa được; ≥2 ứng viên → bắt Sale chọn, không đoán.
3. LLM chỉ trích **delta** (đổi gì: SL/SKU/địa chỉ/thanh toán) → rules engine **tính lại toàn bộ** (giá, ship, COD, VAT).
4. Console hiện **bản so sánh CŨ ↔ MỚI** (diff từng dòng) → Sale duyệt 1 chạm → gửi xác nhận vào nhóm + cập nhật/hủy trên KiotViet + audit log.
5. State machine thêm `amended`, `cancelled`; **đơn đã giao (bước 7 trở đi) không sửa qua AI** → chuyển quy trình hoàn trả B2B (file `QT_Hoàn trả hàng B2B.pdf` — cần đọc trước).

**Cổng vào:** quy tắc "trạng thái nào còn được sửa/hủy" (khách chốt); KiotViet có cho sửa/hủy đơn đã đẩy không (Excel thì là đẩy bản mới + ghi chú). **Độ phức tạp: TRUNG BÌNH.**
**KPI:** % yêu cầu sửa mà AI tìm đúng đơn tham chiếu; thời gian xử lý 1 yêu cầu đổi.
**Rủi ro chính:** tham chiếu nhầm đơn (2 đơn giống nhau cùng ngày) → luôn hiện diff + Sale duyệt, không bao giờ auto.

### F2 — QR thanh toán & AI tự biết khách đã chuyển tiền

**Nghiệp vụ:** chính sách `thanh_toan_ngay` yêu cầu **CK trước khi gửi hàng** — hiện Sale tự kiểm tra tài khoản bằng mắt. Tính năng: khi duyệt đơn, hệ thống sinh **VietQR động** (đúng số tiền + nội dung CK = mã đơn) gửi kèm format xác nhận; tiền về → hệ thống tự khớp → đơn sang `paid` → Sale thấy ngay trên console, (tuỳ chọn) AI soạn tin "đã nhận tiền" chờ duyệt.

**Kỹ thuật:**
- **Sinh QR:** chuẩn EMVCo/Napas VietQR (thư viện npm `vietqr` hoặc tự sinh payload + CRC16) — offline, 0đ, không phụ thuộc bên ngoài.
- **Biết tiền về** (chọn 1, đây là quyết định của khách):
  | Phương án | Ưu | Nhược |
  |---|---|---|
  | (a) Dịch vụ đối soát Casso/SePay (webhook giao dịch) | Nhanh, phổ biến, ~100-200k/tháng | Thêm bên thứ 3 xử lý dữ liệu → cần bổ sung hợp đồng |
  | (b) Open API ngân hàng (MB/BIDV/VCB...) | Chính chủ | Cần tài khoản DN + thủ tục; mỗi bank một kiểu |
  | (c) Bán tự động: kế toán upload sao kê | Không bên thứ 3 | Không real-time |
- Bảng mới `payments` (orderId?, số tiền, nội dung, thời điểm, nguồn, trạng thái khớp); trạng thái đơn thêm nhánh `awaiting_payment → paid`.
- **Khớp tất định:** đúng mã đơn trong nội dung + đúng số tiền → auto; lệch (thiếu nội dung, CK gộp nhiều đơn, sai số tiền) → hàng đợi "chưa khớp" cho kế toán khớp tay. LLM không tham gia khớp tiền.

**Cổng vào:** STK nhận tiền (công ty/cá nhân — liên quan luồng VAT trong khảo sát); chọn phương án (a)/(b)/(c) + hợp đồng xử lý dữ liệu nếu (a). **Độ phức tạp: TRUNG BÌNH–LỚN.**
**KPI:** % giao dịch tự khớp đúng; thời gian từ lúc CK → hệ thống xác nhận.
**Lưu ý phạm vi:** COD/thu hộ KHÔNG đi qua QR (BPVH thu khi giao — đúng quy trình thật).

### F3 — Dashboard

**Nghiệp vụ:** NetViet GĐ1 đã cam kết "Dashboard cơ bản"; `design/` của khách có tab Tổng quan (4 counter + biểu đồ theo giờ + hoạt động gần đây). Đây là món **trả nợ thiết kế**, không phải tính năng mới hoàn toàn.

**Nội dung v1** (đúng 4 KPI đã chốt trong thiết kế + vận hành hằng ngày):
- 4 KPI lõi: tỷ lệ bóc tách đúng · thời gian chốt đơn TB · tỷ lệ cần sửa · tỷ lệ handoff.
- Tin nhắn/đơn theo ngày-giờ; phễu trạng thái đơn; doanh thu theo đại lý/chi nhánh; top SKU; hộp thư "nhóm chưa map".
- **v2 (sau F2/F5):** tiền đã thu/chưa thu, công nợ đến hạn/quá hạn.

**Kỹ thuật:** PHỤ THUỘC việc **ghi `kpi_events`** (model có sẵn, chưa ghi — thuộc Phase 5 Đợt 0) → làm phần ghi event trước, dashboard chỉ là tầng đọc. API `GET /metrics/*` + trang `/dashboard` trên console Next.js (SSE/polling sẵn có).
**Cổng vào:** chốt danh sách chỉ số với khách (tránh vẽ 20 biểu đồ không ai xem). **Độ phức tạp: TRUNG BÌNH.**

### F4 — Đọc ảnh đơn viết tay của khách

**Nghiệp vụ:** <20% đơn là ảnh chụp bảng/đơn viết tay (khảo sát); hồ sơ gốc có mẫu `Bảng đặt hàng của khách.jpg`. Hiện kênh **đã bắt được ảnh** (zca: `href`+caption; bot: `photo_url` — field `imageUrl` đã chảy vào pipeline) nhưng chưa xử lý nội dung ảnh.

**Luồng:** tin có `imageUrl` → **tải ảnh về lưu ngay** (URL Zalo có hạn, mất là mất đơn) → **Claude vision** trích xuất theo ĐÚNG JSON schema như tin text → validation + confidence (ảnh mặc định tin cậy thấp hơn → thiên về `needs_edit`, Sale soát kỹ) → duyệt như đơn thường.

**Cổng vào (cứng):**
- **Claude API credit** — DeepSeek (parser demo hiện tại) KHÔNG đọc được ảnh; ảnh chứa SĐT/địa chỉ nên càng không được gửi processor chưa duyệt.
- **Bộ ảnh thật 20-30 tấm + đáp án** từ khách (mở rộng B1-B2) → **PoC eval trước** (đo field-level accuracy như PoC parser cũ), có số mới cam kết phạm vi.

**Độ phức tạp: LỚN** (độ chính xác chữ viết tay tiếng Việt là ẩn số — giá trị thật của tính năng quyết định bởi con số eval, không phải bởi code).
**KPI:** accuracy từng field trên bộ ảnh golden; % ảnh phải nhập tay lại.

### F5 — Nhắc & đối soát công nợ đại lý

**Nghiệp vụ THẬT đã nằm trong PO** (đọc từ hồ sơ gốc): công nợ 30/45 ngày **kể từ ngày nhận hàng**; chậm → phạt 1%/ngày; quá 60 ngày → tạm ngừng cung cấp; đợt sau phải trả hết đợt trước; ký gửi: cuối tháng đối soát tiêu thụ, TT trong 7 ngày sau HĐ. Hiện BPKD theo dõi bằng **file Excel** (bước 8 quy trình). Đây chính là hạng mục "Tự động đối soát ký gửi, công nợ" của **GĐ2 NetViet** — làm sớm hơn theo yêu cầu khách.

**Luồng (chia 2 bước):**
- **v1 — NHẮC:** sổ công nợ per đại lý (từ đơn `synced` + chính sách + hạn) → job quét hằng ngày (BullMQ repeatable) → danh sách "sắp đến hạn / quá hạn / chạm ngưỡng 60 ngày (đề nghị ngừng cấp)" trên console → AI soạn tin nhắc theo mẫu → **Sale duyệt rồi mới gửi** vào đúng nhóm → log.
- **v2 — ĐỐI SOÁT:** khớp với `payments` (từ F2) để biết đã thu bao nhiêu; cuối tháng sinh bảng đối soát ký gửi cho 2-3 đại lý ký gửi; xuất file cho kế toán.

**Cổng vào:** A3 (ngưỡng công nợ chính thức) + xác minh `cong_no_7`; **"ngày nhận hàng" lấy từ đâu** — hệ thống hiện dừng ở `synced`, chưa có dữ liệu giao hàng từ Base → v1 tạm dùng ngày synced + X (khách chốt X) hoặc kế toán nhập tay, chính xác tuyệt đối cần tích hợp Base (GĐ2); **số dư công nợ đầu kỳ** import từ Excel hiện tại của BPKD.
**Độ phức tạp: LỚN** (nghiệp vụ tài chính — sai một số là mất niềm tin; ưu tiên đúng > đủ).
**KPI:** số đơn quá hạn giảm; thời gian kế toán làm đối soát cuối tháng.

### F6 — Nâng cấp đội agent: chống đơn ảo/gian lận + gọi nhân viên

Vai **Giám sát** hiện đã có luật leo thang (đơn ≥20tr, đại lý chưa xác định, khiếu nại gắt) + cờ vàng (SL≥30, confidence<0.5) — 0 LLM. Nâng cấp gồm 2 phần độc lập:

**F6a — Gọi nhân viên (NHỎ — nên làm sớm nhất):**
- Intent mới `goi_nhan_vien` (*"cho gap nguoi"*, *"goi sale giup em"*) + từ khóa tất định (lưới an toàn khi LLM phân loại trượt).
- Hội thoại được đánh dấu **"người tiếp quản"**: AI im lặng trong nhóm đó (mute có TTL), đơn đang xử lý chuyển `needs_edit`.
- Cảnh báo: console (chuông + hàng đợi) + tuỳ chọn nhắn Zalo riêng cho Sale trực.
- Cổng vào: danh sách Sale trực + kênh nhận cảnh báo (khách chốt).

**F6b — Chống đơn ảo/trùng/gian lận (tất định trước, học sau):**
| Lớp | Luật (v1 — tất định) |
|---|---|
| Đơn ảo/trùng | Tin trùng (unique `externalMessageId` — đã có) · 2 đơn giống nhau cùng nhóm cùng SKU+SL trong X phút (nhắn lại/forward) → gộp/hỏi lại · người gửi KHÔNG thuộc đại lý đã map → chặn mềm |
| Gian lận giá | Đơn ghi đơn giá **thấp hơn sàn** (`min_retail_price` đã có trong DB) hoặc lệch deal riêng → cờ đỏ · sửa đơn sau chốt làm GIẢM tiền bất thường (kết hợp F1) → bắt buộc duyệt 2 lớp (ánh xạ đúng cổng KSNB của quy trình thật) |
| Bất thường hành vi | Tần suất đơn đột biến 1 nhóm · SĐT người nhận (TH2) trùng nhiều đại lý · địa chỉ mới hoàn toàn với đại lý lâu năm → risk score cộng dồn → **hàng đợi "nghi vấn"** cho vai KSNB |
- **v2 (GĐ3):** baseline theo lịch sử từng đại lý (cần vài tháng dữ liệu thật sau pilot).
- Cổng vào: khách kể case gian lận/đơn ảo THẬT đã gặp (để luật bám thực tế, không tưởng tượng); ngưỡng; ai xử lý hàng đợi nghi vấn (cần auth vai KSNB — Phase 5).
- **Độ phức tạp:** 6a NHỎ · 6b v1 TRUNG BÌNH · 6b v2 LỚN.

---

## 3. Lộ trình đề xuất theo đợt

> Thứ tự trong đợt có thể đảo; tính năng có thể bỏ/hoãn theo khách. Nguyên tắc xếp: **ít phụ thuộc ngoài → làm trước; đụng tiền → cần nền chắc; ẩn số độ chính xác → PoC trước.**

```mermaid
flowchart LR
    D0["Đợt 0 — NỀN (đang làm)\nlưu mọi tin · rules-config động\nimport A4 · KiotViet · auth+KPI\ndeploy + pilot"]
    D1["Đợt 1 — giá trị nhanh\nF6a gọi nhân viên\nF1 sửa đơn NL\nF3 dashboard v1"]
    D2["Đợt 2 — dòng tiền\nF2 QR + payments\nF5 v1 nhắc công nợ"]
    D3["Đợt 3 — năng lực AI\nF4 PoC ảnh viết tay → chạy thật\nF6b chống gian lận v1"]
    D4["Đợt 4 — GĐ3 NetViet\nF5 v2 đối soát tự động\nF6b v2 baseline lịch sử\ndự báo · up-sell"]
    D0 --> D1 --> D2 --> D3 --> D4
```

| Đợt | Gồm | Điều kiện vào đợt (cổng) | Đầu ra nghiệm thu |
|---|---|---|---|
| **0 — Nền** | Phase 3 còn lại + Phase 4-6 hiện hữu | (đang chạy) | Pilot 1-2 nhóm, 4 KPI có số thật |
| **1 — Giá trị nhanh** | F6a → F1 → F3 v1 | Quy tắc sửa đơn (D10) · chỉ số dashboard (D11) · Sale trực (D14) | Sửa đơn qua chat có diff+duyệt; dashboard 4 KPI sống |
| **2 — Dòng tiền** | F2 → F5 v1 | STK + phương án nhận giao dịch + hợp đồng DL (D9) · ngưỡng công nợ + ngày-nhận-hàng + số dư đầu kỳ (D13) | Đơn `paid` tự động ≥X%; danh sách nhắc nợ hằng ngày |
| **3 — Năng lực AI** | F4 (PoC → thật) · F6b v1 | Claude credit + 20-30 ảnh golden (D12) · case gian lận thật (D14) | Số eval ảnh công bố; hàng đợi nghi vấn cho KSNB |
| **4 — Tối ưu (GĐ3)** | F5 v2 · F6b v2 · dự báo/up-sell | Vài tháng dữ liệu thật sau pilot | Đối soát ký gửi cuối tháng tự động |

**Ước lượng độ phức tạp** (tương đối, chưa phải cam kết lịch): NHỎ ≈ 2-4 ngày dev · TRUNG BÌNH ≈ 1-2 tuần · LỚN ≈ 2-4 tuần (chưa tính chờ cổng dữ liệu/quyết định).

| Tính năng | Cỡ | Ghi chú |
|---|---|---|
| F6a gọi nhân viên | NHỎ | Ít rủi ro nhất, giá trị tức thì |
| F1 sửa đơn NL | TRUNG BÌNH | Giá trị/công sức tốt nhất trong 6 món |
| F3 dashboard v1 | TRUNG BÌNH | Gồm cả phần ghi `kpi_events` nếu Đợt 0 chưa xong phần này |
| F2 QR + biết tiền về | TRUNG BÌNH–LỚN | Phần khó là ĐỐI SOÁT, không phải sinh QR |
| F5 công nợ v1/v2 | LỚN | Tài chính — ưu tiên đúng > nhanh |
| F4 ảnh viết tay | LỚN | Giá trị quyết định bởi số eval, làm PoC trước |
| F6b chống gian lận | TB (v1) → LỚN (v2) | v1 thuần luật, v2 cần lịch sử |

---

## 4. Quyết định khách cần chốt (bổ sung vào bảng quyết định treo)

| # | Quyết định | Cho tính năng |
|---|---|---|
| D9 | STK nhận tiền (công ty/cá nhân?) + chọn Casso/SePay/Open API bank/bán tự động + bổ sung hợp đồng xử lý dữ liệu giao dịch | F2 |
| D10 | Đơn ở trạng thái nào còn được sửa/hủy qua AI; đơn đã giao xử lý theo quy trình hoàn trả nào | F1 |
| D11 | Danh sách chỉ số dashboard (đề xuất: 4 KPI + doanh thu đại lý/chi nhánh + phễu đơn) | F3 |
| D12 | Cấp Claude API credit + gửi 20-30 ảnh đơn viết tay thật kèm đáp án | F4 |
| D13 | Ngưỡng công nợ chính thức (A3) + cách xác định "ngày nhận hàng" + số dư công nợ đầu kỳ từ Excel BPKD + xác minh `cong_no_7` | F5 |
| D14 | Danh sách Sale trực nhận cảnh báo + kênh nhận (console/Zalo riêng) + case đơn ảo/gian lận thật đã gặp + ngưỡng | F6 |

---

## 5. Rủi ro chung của kế hoạch dài hạn

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Làm tính năng mới khi Đợt 0 chưa xong → nền lung lay (chưa lưu tin, chưa auth) | CAO | Kỷ luật cổng vào đợt; Đợt 0 là điều kiện cứng |
| "AI biết tiền về" bị hiểu là tuyệt đối — thực tế có độ trễ + giao dịch không khớp | CAO | Nói rõ từ đầu: auto-khớp phần lớn, phần lệch vào hàng đợi kế toán; KPI % tự khớp công bố hằng tuần |
| Chi phí LLM tăng (vision đắt hơn text; thêm intent) | TRUNG BÌNH | Ảnh <20% lưu lượng; đo chi phí/tin ngay từ PoC F4 |
| Bên thứ 3 thanh toán (Casso/SePay) = thêm processor dữ liệu | TRUNG BÌNH | Đưa vào hợp đồng xử lý dữ liệu trước khi bật (như bài học DeepSeek) |
| Công nợ tính sai do thiếu "ngày nhận hàng" thật | TRUNG BÌNH | v1 chỉ NHẮC (kèm nhãn "tạm tính theo ngày lên đơn"); đối soát chính thức chờ dữ liệu giao hàng |
| Chữ viết tay tiếng Việt accuracy thấp → tính năng F4 gây thất vọng | TRUNG BÌNH | PoC eval trước, công bố số, để khách quyết có triển khai không |
| Phạm vi phình (6 tính năng + GĐ2-3 gốc chồng nhau) | TRUNG BÌNH | Mỗi đợt chỉ 2-3 món; nghiệm thu xong mới sang đợt sau |

---

## 6. Việc KHÔNG nằm trong kế hoạch này (tránh hiểu nhầm phạm vi)

- Tích hợp Base API, Zalo OA/ZNS, Messenger/web widget — vẫn thuộc GĐ2 gốc của NetViet, không lặp lại ở đây.
- PWA mobile 5 tab — quyết định treo #5, độc lập với 6 tính năng này.
- AI tự gửi tin không cần duyệt (`AUTO_SEND=on`) — chỉ bật khi có văn bản đồng ý (quyết định treo #7); mọi tính năng trên thiết kế để chạy được cả hai chế độ.
