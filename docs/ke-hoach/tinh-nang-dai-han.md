# KẾ HOẠCH TÍNH NĂNG DÀI HẠN — ĐỢT 1-4 (6 tính năng mới, định hướng)

> **Vai trò:** kế hoạch con mô tả THIẾT KẾ ĐỊNH HƯỚNG cho 6 nhóm tính năng mới, xếp theo phụ thuộc kỹ thuật + giá trị nghiệp vụ. Có thể bổ sung/bỏ bớt theo quyết định khách — mỗi tính năng có "cổng vào" rõ ràng; chưa qua cổng thì chưa code phần chạm thật.
> **Không chứa trạng thái** — tiến độ đợt/cổng đã chốt hay chưa: [tong-quan.md](tong-quan.md) §3.2 + §4-D. Nền phải xong trước (Đợt 0): [nen-tang.md](nen-tang.md).
> Lập: 10/07/2026 · chuyển vào `ke-hoach/` + bóc trạng thái: 11/07/2026. Nguồn ngữ cảnh: [../nghiep-vu.md](../nghiep-vu.md) · [../so-do-he-thong.md](../so-do-he-thong.md) · `Thiet_ke_AI_Agent_U_Ultty.md` (GĐ2-3 NetViet).

---

## 0. Nguyên tắc áp cho MỌI tính năng mới (không thương lượng)

1. **LLM không tính tiền, không quyết chính sách.** Tính năng mới nào đụng đến tiền (QR, công nợ, sửa đơn) đều đi qua rules engine tất định + nguồn sự thật trong DB.
2. **Người giữ nút duyệt.** Mọi thứ đi RA ngoài (tin nhắc công nợ, xác nhận sửa đơn, xác nhận đã nhận tiền) mặc định qua Sale duyệt; chỉ tự gửi khi có văn bản đồng ý của khách (`AUTO_SEND`, gated vai Giám sát).
3. **Nguồn sự thật động.** Dữ liệu mới (bảng phí COD, ngưỡng công nợ, tài khoản nhận tiền, danh sách Sale trực) là bảng trong Postgres, sửa qua `/admin` + MCP tool — không hardcode.
4. **Lưu vết đầy đủ.** Sửa đơn và thanh toán bắt buộc có audit trail (ai, lúc nào, từ giá trị nào sang giá trị nào).
5. **Đo trước khi hứa.** Tính năng có độ chính xác không chắc chắn (đọc ảnh viết tay) phải qua PoC eval trên dữ liệu thật trước khi cam kết phạm vi — đúng cách đã làm với PoC parser/PoC Bot.

---

## 1. Nền phải xong trước (Đợt 0 — chi tiết ở [nen-tang.md](nen-tang.md))

| Nền | Vì sao tính năng mới cần nó |
|---|---|
| Lưu MỌI tin vào DB ngay khi nhận | Sửa đơn cần tra tin cũ; chống gian lận cần lịch sử; NĐ13 |
| Rules-config động + sửa VAT/COD theo nguồn gốc | QR/công nợ tính đúng số; hết "tạm tính" |
| Import Excel A4 (đại lý + map nhóm) | Công nợ/gian lận cần biết đơn thuộc đại lý nào |
| KiotViet Excel/API + map SKU↔mã hàng số | Sửa đơn phải đồng bộ được bản sửa lên KiotViet |
| Auth theo vai BPKD/KSNB/kế toán + ghi `kpi_events` | Dashboard cần số liệu; hàng đợi nghi vấn cần vai KSNB |
| Deploy 1 VM + pilot 1-2 nhóm | Mọi thứ dưới đây chạy trên hệ đã sống |

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

**Cổng vào:** **D10** (trạng thái nào còn sửa/hủy; KiotViet có cho sửa/hủy đơn đã đẩy không — Excel thì đẩy bản mới + ghi chú). **Độ phức tạp: TRUNG BÌNH.**
**KPI:** % yêu cầu sửa mà AI tìm đúng đơn tham chiếu; thời gian xử lý 1 yêu cầu đổi.
**Rủi ro chính:** tham chiếu nhầm đơn (2 đơn giống nhau cùng ngày) → luôn hiện diff + Sale duyệt, không bao giờ auto.

### F2 — QR thanh toán & AI tự biết khách đã chuyển tiền

**Nghiệp vụ:** chính sách `thanh_toan_ngay` yêu cầu **CK trước khi gửi hàng** — hiện Sale tự kiểm tra tài khoản bằng mắt. Tính năng: khi duyệt đơn, hệ thống sinh **VietQR động** (đúng số tiền + nội dung CK = mã đơn) gửi kèm format xác nhận; tiền về → hệ thống tự khớp → đơn sang `paid` → Sale thấy ngay trên console, (tuỳ chọn) AI soạn tin "đã nhận tiền" chờ duyệt.

**Kỹ thuật:**
- **Sinh QR:** chuẩn EMVCo/Napas VietQR — offline, 0đ (lib đã chốt §7).
- **Biết tiền về** (chọn 1 — quyết định **D9**):

  | Phương án | Ưu | Nhược |
  |---|---|---|
  | (a) Dịch vụ đối soát webhook giao dịch (SePay — ứng viên chính, §7) | Nhanh, phổ biến, rẻ | Thêm bên thứ 3 xử lý dữ liệu → cần bổ sung hợp đồng |
  | (b) Open API ngân hàng (MB/BIDV/VCB...) | Chính chủ | Cần tài khoản DN + thủ tục; mỗi bank một kiểu |
  | (c) Bán tự động: kế toán upload sao kê | Không bên thứ 3 | Không real-time |

- Bảng mới `payments` (orderId?, số tiền, nội dung, thời điểm, nguồn, trạng thái khớp); trạng thái đơn thêm nhánh `awaiting_payment → paid`.
- **Khớp tất định:** đúng mã đơn trong nội dung + đúng số tiền → auto; lệch (thiếu nội dung, CK gộp nhiều đơn, sai số tiền) → hàng đợi "chưa khớp" cho kế toán khớp tay. LLM không tham gia khớp tiền.

**Cổng vào:** **D9** (STK công ty/cá nhân — liên quan luồng VAT; phương án (a)/(b)/(c) + hợp đồng xử lý dữ liệu nếu (a)). **Độ phức tạp: TRUNG BÌNH–LỚN.**
**KPI:** % giao dịch tự khớp đúng; thời gian từ lúc CK → hệ thống xác nhận.
**Lưu ý phạm vi:** COD/thu hộ KHÔNG đi qua QR (BPVH thu khi giao — đúng quy trình thật).

### F3 — Dashboard

**Nghiệp vụ:** NetViet GĐ1 đã cam kết "Dashboard cơ bản"; `design/` của khách có tab Tổng quan (4 counter + biểu đồ theo giờ + hoạt động gần đây). Đây là món **trả nợ thiết kế**, không phải tính năng mới hoàn toàn.

**Nội dung v1** (đúng 4 KPI đã chốt + vận hành hằng ngày):
- 4 KPI lõi: tỷ lệ bóc tách đúng · thời gian chốt đơn TB · tỷ lệ cần sửa · tỷ lệ handoff.
- Tin nhắn/đơn theo ngày-giờ; phễu trạng thái đơn; doanh thu theo đại lý/chi nhánh; top SKU; hộp thư "nhóm chưa map".
- **v2 (sau F2/F5):** tiền đã thu/chưa thu, công nợ đến hạn/quá hạn.

**Kỹ thuật:** PHỤ THUỘC việc **ghi `kpi_events`** (Phase 5 Đợt 0) → làm phần ghi event trước, dashboard chỉ là tầng đọc. API `GET /metrics/*` + trang `/dashboard` trên console Next.js (SSE/polling sẵn có).
**Cổng vào:** **D11** (chốt danh sách chỉ số — tránh vẽ 20 biểu đồ không ai xem). **Độ phức tạp: TRUNG BÌNH.**

### F4 — Đọc ảnh đơn viết tay của khách

**Nghiệp vụ:** <20% đơn là ảnh chụp bảng/đơn viết tay (khảo sát); hồ sơ gốc có mẫu `Bảng đặt hàng của khách.jpg`. Kênh **đã bắt được ảnh** (zca: `href`+caption — lưu ý as-built: ảnh KHÔNG caption hiện bị bỏ qua; bot: `photo_url`) nhưng chưa xử lý nội dung ảnh.

**Luồng:** tin có `imageUrl` → **tải ảnh về lưu ngay** (URL Zalo có hạn, mất là mất đơn) → **Claude vision** trích xuất theo ĐÚNG JSON schema như tin text → validation + confidence (ảnh mặc định tin cậy thấp hơn → thiên về `needs_edit`, Sale soát kỹ) → duyệt như đơn thường.

**Cổng vào (cứng — D12):**
- **Claude API credit** — DeepSeek KHÔNG đọc được ảnh (xác nhận chính thức, mọi biến thể); ảnh chứa SĐT/địa chỉ nên càng không được gửi processor chưa duyệt.
- **Bộ ảnh thật 20-30 tấm + đáp án** từ khách (mở rộng B1-B2) → **PoC eval trước** (đo field-level accuracy như PoC parser), có số mới cam kết phạm vi.

**Độ phức tạp: LỚN** (độ chính xác chữ viết tay tiếng Việt là ẩn số — giá trị thật quyết định bởi con số eval, không phải bởi code).
**KPI:** accuracy từng field trên bộ ảnh golden; % ảnh phải nhập tay lại.

### F5 — Nhắc & đối soát công nợ đại lý

**Nghiệp vụ THẬT đã nằm trong PO** ([../nghiep-vu.md §5](../nghiep-vu.md)): công nợ 30/45 ngày **kể từ ngày nhận hàng**; chậm → phạt 1%/ngày; quá 60 ngày → tạm ngừng cung cấp; đợt sau phải trả hết đợt trước; ký gửi: cuối tháng đối soát tiêu thụ, TT trong 7 ngày sau HĐ. Hiện BPKD theo dõi bằng **file Excel** (bước 8 quy trình). Đây chính là hạng mục "Tự động đối soát ký gửi, công nợ" của **GĐ2 NetViet** — làm sớm hơn theo yêu cầu khách.

**Luồng (chia 2 bước):**
- **v1 — NHẮC:** sổ công nợ per đại lý (từ đơn `synced` + chính sách + hạn) → job quét hằng ngày → danh sách "sắp đến hạn / quá hạn / chạm ngưỡng 60 ngày (đề nghị ngừng cấp)" trên console → AI soạn tin nhắc theo mẫu → **Sale duyệt rồi mới gửi** vào đúng nhóm → log.
- **v2 — ĐỐI SOÁT:** khớp với `payments` (từ F2) để biết đã thu bao nhiêu; cuối tháng sinh bảng đối soát ký gửi cho 2-3 đại lý ký gửi; xuất file cho kế toán.

**Cổng vào:** **D13** (ngưỡng công nợ chính thức A3 + xác minh `cong_no_7` D15 + **"ngày nhận hàng" lấy từ đâu** — hệ thống dừng ở `synced`, chưa có dữ liệu giao hàng từ Base → v1 tạm dùng ngày synced + X ngày (khách chốt X) hoặc kế toán nhập tay; chính xác tuyệt đối cần tích hợp Base GĐ2 + **số dư công nợ đầu kỳ** import từ Excel BPKD).
**Độ phức tạp: LỚN** (nghiệp vụ tài chính — sai một số là mất niềm tin; ưu tiên đúng > đủ).
**KPI:** số đơn quá hạn giảm; thời gian kế toán làm đối soát cuối tháng.

### F6 — Nâng cấp đội agent: chống đơn ảo/gian lận + gọi nhân viên

Vai **Giám sát** hiện có luật leo thang (đơn ≥20tr, đại lý chưa xác định, khiếu nại gắt) + cờ vàng (SL≥30, confidence<0.5) — 0 LLM. Nâng cấp gồm 2 phần độc lập:

**F6a — Gọi nhân viên (NHỎ — nên làm sớm nhất):**
- Intent mới `goi_nhan_vien` (*"cho gap nguoi"*, *"goi sale giup em"*) + từ khóa tất định (lưới an toàn khi LLM phân loại trượt).
- Hội thoại được đánh dấu **"người tiếp quản"**: AI im lặng trong nhóm đó (mute có TTL), đơn đang xử lý chuyển `needs_edit`.
- Cảnh báo: console (chuông + hàng đợi) + tuỳ chọn nhắn Zalo riêng cho Sale trực.
- Cổng vào: **D14** (danh sách Sale trực + kênh nhận cảnh báo).

**F6b — Chống đơn ảo/trùng/gian lận (tất định trước, học sau):**

| Lớp | Luật (v1 — tất định) |
|---|---|
| Đơn ảo/trùng | Tin trùng (unique `externalMessageId` — đã có) · 2 đơn giống nhau cùng nhóm cùng SKU+SL trong X phút (nhắn lại/forward) → gộp/hỏi lại · người gửi KHÔNG thuộc đại lý đã map → chặn mềm |
| Gian lận giá | Đơn ghi đơn giá **thấp hơn sàn** (`min_retail_price` đã có trong DB) hoặc lệch deal riêng → cờ đỏ · sửa đơn sau chốt làm GIẢM tiền bất thường (kết hợp F1) → bắt buộc duyệt 2 lớp (ánh xạ đúng cổng KSNB của quy trình thật) |
| Bất thường hành vi | Tần suất đơn đột biến 1 nhóm · SĐT người nhận (TH2) trùng nhiều đại lý · địa chỉ mới hoàn toàn với đại lý lâu năm → risk score cộng dồn → **hàng đợi "nghi vấn"** cho vai KSNB |

- **v2 (GĐ3):** baseline theo lịch sử từng đại lý (cần vài tháng dữ liệu thật sau pilot).
- Cổng vào: **D14** (case gian lận/đơn ảo THẬT đã gặp — để luật bám thực tế; ngưỡng; ai xử lý hàng đợi nghi vấn — cần auth vai KSNB, Phase 5).
- **Độ phức tạp:** 6a NHỎ · 6b v1 TRUNG BÌNH · 6b v2 LỚN.

---

## 3. Lộ trình đề xuất theo đợt

> Thứ tự trong đợt có thể đảo; tính năng có thể bỏ/hoãn theo khách. Nguyên tắc xếp: **ít phụ thuộc ngoài → làm trước; đụng tiền → cần nền chắc; ẩn số độ chính xác → PoC trước.**

```mermaid
flowchart LR
    D0["Đợt 0 — NỀN (nen-tang.md)\nlưu mọi tin · rules-config động\nimport A4 · KiotViet · auth+KPI\ndeploy + pilot"]
    D1["Đợt 1 — giá trị nhanh\nF6a gọi nhân viên\nF1 sửa đơn NL\nF3 dashboard v1"]
    D2["Đợt 2 — dòng tiền\nF2 QR + payments\nF5 v1 nhắc công nợ"]
    D3["Đợt 3 — năng lực AI\nF4 PoC ảnh viết tay → chạy thật\nF6b chống gian lận v1"]
    D4["Đợt 4 — GĐ3 NetViet\nF5 v2 đối soát tự động\nF6b v2 baseline lịch sử\ndự báo · up-sell"]
    D0 --> D1 --> D2 --> D3 --> D4
```

| Đợt | Gồm | Điều kiện vào đợt (cổng) | Đầu ra nghiệm thu |
|---|---|---|---|
| **0 — Nền** | [nen-tang.md](nen-tang.md) | — | Pilot 1-2 nhóm, 4 KPI có số thật |
| **1 — Giá trị nhanh** | F6a → F1 → F3 v1 | D10 · D11 · D14 | Sửa đơn qua chat có diff+duyệt; dashboard 4 KPI sống |
| **2 — Dòng tiền** | F2 → F5 v1 | D9 · D13 | Đơn `paid` tự động ≥X%; danh sách nhắc nợ hằng ngày |
| **3 — Năng lực AI** | F4 (PoC → thật) · F6b v1 | D12 · D14 | Số eval ảnh công bố; hàng đợi nghi vấn cho KSNB |
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

## 4. Cổng quyết định của các tính năng (D9-D14)

Định nghĩa chi tiết + trạng thái từng cổng: [tong-quan.md §4-D](tong-quan.md). Tóm tắt ánh xạ: **D9**→F2 · **D10**→F1 · **D11**→F3 · **D12**→F4 · **D13**→F5 · **D14**→F6.

---

## 5. Rủi ro chung của kế hoạch dài hạn

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Làm tính năng mới khi Đợt 0 chưa xong → nền lung lay (chưa lưu tin, chưa auth) | CAO | Kỷ luật cổng vào đợt; Đợt 0 là điều kiện cứng |
| "AI biết tiền về" bị hiểu là tuyệt đối — thực tế có độ trễ + giao dịch không khớp | CAO | Nói rõ từ đầu: auto-khớp phần lớn, phần lệch vào hàng đợi kế toán; KPI % tự khớp công bố hằng tuần |
| Chi phí LLM tăng (vision đắt hơn text; thêm intent) | TRUNG BÌNH | Ảnh <20% lưu lượng; đo chi phí/tin ngay từ PoC F4 |
| Bên thứ 3 thanh toán (SePay...) = thêm processor dữ liệu | TRUNG BÌNH | Đưa vào hợp đồng xử lý dữ liệu trước khi bật (như bài học DeepSeek — D17) |
| Công nợ tính sai do thiếu "ngày nhận hàng" thật | TRUNG BÌNH | v1 chỉ NHẮC (kèm nhãn "tạm tính theo ngày lên đơn"); đối soát chính thức chờ dữ liệu giao hàng |
| Chữ viết tay tiếng Việt accuracy thấp → F4 gây thất vọng | TRUNG BÌNH | PoC eval trước, công bố số, để khách quyết có triển khai không |
| Phạm vi phình (6 tính năng + GĐ2-3 gốc chồng nhau) | TRUNG BÌNH | Mỗi đợt chỉ 2-3 món; nghiệm thu xong mới sang đợt sau |

---

## 6. Việc KHÔNG nằm trong kế hoạch này (tránh hiểu nhầm phạm vi)

- Tích hợp Base API, Zalo OA/ZNS, Messenger/web widget — vẫn thuộc GĐ2 gốc của NetViet, không lặp lại ở đây.
- PWA mobile 5 tab — quyết định treo **D3**, độc lập với 6 tính năng này.
- AI tự gửi tin không cần duyệt (`AUTO_SEND=on`) — chỉ bật khi có văn bản đồng ý (**D4**); mọi tính năng trên thiết kế để chạy được cả hai chế độ.

---

## 7. Thư viện & dịch vụ đã chốt (search-first — 10/07/2026)

> Quy trình: rà dep sẵn có trong repo → npm registry (`npm view`: version/license/nhịp bảo trì) → agent research web (QR/webhook/vision/KiotViet, có nguồn). Nguyên tắc: **dùng đồ sẵn có trước · dep mới phải nhỏ-MIT-còn bảo trì · KHÔNG thêm hạ tầng khi chưa cần.**

### 7.1 Đã có sẵn trong repo — dùng lại, không cài thêm

| Dep sẵn có | Dùng cho |
|---|---|
| `@anthropic-ai/sdk` ^0.68 (api) | F4 vision — mọi model Claude hiện hành có `image_input`; rẻ nhất = **Haiku 4.5** ≈ $0.0013/ảnh 1000×1000 (~34đ) |
| `zod` (api+shared) | Validate webhook SePay, payload QR, mọi input mới |
| `@tanstack/react-query` (web) | F3 dashboard data layer |
| `rxjs` + SSE có sẵn | F3 số liệu sống · F6a chuông cảnh báo console |
| Prisma 6 | Bảng mới: `payments`, `audit_logs`, ghi `kpi_events` |

### 7.2 Cài mới theo tính năng (quyết định Adopt/Build)

| Cho | Gói / dịch vụ | Căn cứ |
|---|---|---|
| F2 sinh QR | **`vietnam-qr-pay`** 1.5.0 + **`qrcode`** 1.5.4 (đều MIT) | Payload EMVCo/Napas **offline** duy nhất đáng tin: 165★, ~11k dl/tháng, 100% TS, zero-dep, có decode để test round-trip (`QRPay.initVietQR({bankBin, bankNumber, amount, purpose})`). **LOẠI `vietqr`**: chết từ 02/2022 + là wrapper gọi API vietqr.io online |
| F2 biết tiền về | **SePay** (dịch vụ webhook — phương án (a) của D9) | Payload có `content` (memo) + `referenceCode` + `transferAmount` → khớp đơn tất định; webhook ký HMAC-SHA256, retry Fibonacci; **free 50 giao dịch/tháng đủ pilot**, gói STARTUP 120k/tháng, trả THEO THÁNG (Casso ép billing năm); hỗ trợ tài khoản cá nhân lẫn DN tùy bank. payOS (0đ) = phương án thay thế nếu đổi sang mô hình cổng thanh toán. ⚠️ vẫn chờ **D9** + bổ sung thỏa thuận xử lý dữ liệu (bên thứ 3 đọc lịch sử giao dịch — NĐ13/2023) |
| F1 diff CŨ↔MỚI | **`microdiff`** 1.5.0 | Zero-dep, nhỏ; state machine mở rộng (`amended`/`cancelled`) là code thuần, không cần lib |
| F3 biểu đồ | **`recharts`** 3.x | Chuẩn React, active (07/2026); phần ghi `kpi_events` = Prisma thuần |
| F4 tiền xử lý ảnh | **`sharp`** 0.35 (Apache-2.0) | Resize/nén ảnh Zalo trước khi gửi Claude (trần 10MB/ảnh + tiết kiệm token); tải ảnh về = `fetch` + `fs` thuần, không lib |
| F5 lịch quét nợ | **`@nestjs/schedule`** 6.x | Cron hằng ngày KHÔNG cần Redis. **Hoãn BullMQ** (dù đã ghi trong stack): thêm cả Redis ops chỉ cho 1 cron job là YAGNI — chỉ dựng khi pipeline thật sự cần queue |
| F5 tính hạn nợ | **`date-fns`** 4.x | Hạn 30/45/60 ngày, hàm thuần tree-shakeable, TZ qua `@date-fns/tz` |
| F5 + Đợt 0 Excel | **`exceljs`** 4.4.0 | Import số dư đầu kỳ + A4 + xuất bảng đối soát (đã chốt từ trước — tránh `xlsx`/`node-xlsx` vì CVE) |
| F6 | *(không dep mới)* | Luật tất định TS thuần + zca/SSE sẵn có; fuzzy-match (`fastest-levenshtein`) chỉ thêm khi thật sự cần |
| Đợt 0 KiotViet API | **Tự viết client mỏng** sau `KiotVietAdapter` sẵn có | KHÔNG có client chính thức. SDK cộng đồng `kiotviet-client-sdk` 0.4.0 (13★, active 06/2026) chỉ dùng **tham khảo**, không làm dep (0.x, adoption thấp). Chi tiết auth/limit: [nen-tang.md §2](nen-tang.md) |
| Đợt 0 auth (ứng viên) | `@nestjs/passport` 11 + `argon2` 0.44 | Đã kiểm registry (đều active); chốt phương án khi làm increment auth |

### 7.3 Phát hiện quan trọng ngoài lề (từ đợt nghiên cứu)

- ⚠️ **DeepSeek khai tử `deepseek-chat`/`deepseek-reasoner` ngày 24/07/2026**, thay bằng `deepseek-v4-flash`/`deepseek-v4-pro` (vẫn text-only). Code hiện đã dùng `deepseek-v4-flash`.
- DeepSeek API xác nhận chính thức **không nhận ảnh** ở mọi biến thể → F4 bắt buộc đi đường Claude, đúng thiết kế hiện tại.
