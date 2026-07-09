# KỊCH BẢN DEMO TOÀN HỆ THỐNG — Ultty AI (bản MASTER)

> **Đây là kịch bản chạy demo chính thức, thay cho** [kich-ban-demo-thuyet-trinh.md](kich-ban-demo-thuyet-trinh.md) và [kich-ban-demo-nhieu-nhom.md](kich-ban-demo-nhieu-nhom.md) (đã lỗi thời — còn khung "phải tag bot" + dữ liệu bịa).
> Deep-dive 6 agent: [kich-ban-demo-6-agent.md](kich-ban-demo-6-agent.md). Nguồn sự thật đã nạp: [seed.ts](../apps/api/src/knowledge/seed.ts).
>
> Người trình bày: **Phùng Việt (NetViet)**. Khán giả: sếp (anh Hiệu) và/hoặc khách (chị Phương – U Ultty).
> Ký hiệu: **▶ Thao tác** · **🗣 Nói** (đọc gần nguyên văn) · **⏸ Ngưng** · 👉 chỉ tay · 💡 ghi chú riêng.
> Thời lượng: ~15 phút demo + Q&A + khách thao tác thử.

---

## 0. CHUẨN BỊ (giờ G trừ 20 phút)

### 0.1 Cấu hình & khởi động
`.env` (đã set sẵn cho demo):
```
PARSER_MODE=deepseek     # AI THẬT (đọc hiểu). Lưới an toàn: đổi = mock khi mạng lỗi
CHANNEL_MODE=zca         # Kênh Zalo THẬT (đọc mọi tin nhóm, không cần tag). An toàn: = mock
AUTO_SEND=off            # GĐ1: Sale duyệt 1-chạm (bật on = §10)
```
```bash
pnpm dev:api      # đợi log: "Parser=deepseek · Kenh=zca"
pnpm dev:web      # http://localhost:3000  (mở trên màn rộng/máy chiếu)
```

### 0.2 Đăng nhập kênh zca (chỉ LẦN ĐẦU, làm trước giờ G)
- Boot API với `CHANNEL_MODE=zca` → log in ra **file QR** `secrets/zalo-qr.png`.
- Mở file, **quét bằng Zalo trên điện thoại — TÀI KHOẢN PHỤ** (không dùng tài khoản Sale chính).
- Quét xong phiên lưu vào `secrets/zalo-cred.json` → **các lần sau không cần quét**.
- Mở sẵn 1-2 **nhóm Zalo test** trên điện thoại (tài khoản phụ đã ở trong nhóm).

**⚠️ Map nhóm → đại lý theo ID, KHÔNG theo tên nhóm.** Muốn đơn nhận đúng đại lý/chính sách:
1. Nhắn 1 tin bất kỳ trong nhóm test → xem log API dòng **`📌 Nhom ... chatId="..."`** → copy ID đó.
2. Dán ID vào [seed.ts](../apps/api/src/knowledge/seed.ts) `groups[]` (`chatId`), map với đại lý mong muốn → restart API.
   *(Đổi tên nhóm KHÔNG có tác dụng — hệ thống chỉ nhìn ID.)* Nhóm chưa map → hiện "Nhóm lạ" + Giám sát leo thang (đúng thiết kế).

### 0.3 Hai cách trình diễn (chọn theo độ ổn định mạng)
- **Cách A — THẬT nhất:** một máy khác **nhắn thẳng vào nhóm Zalo** (KHÔNG cần tag ai) → tin tự chảy vào console. Điểm ăn tiền: *đại lý không phải đổi thói quen gì cả*.
- **Cách B — an toàn, luôn chạy:** gõ vào ô **"Bơm tin thử"** trên console (chọn nhóm). **AI vẫn thật (DeepSeek), rules + KiotViet vẫn chạy** — chỉ khác nguồn tin. Dùng khi mạng yếu.

### 0.4 Số liệu THẬT cần thuộc (bảng giá tháng 7.2026 — giá sỉ "Đơn giá CTV")
| SP | Giá sỉ | Ghi chú |
|---|---|---|
| Ghế nâng an toàn trẻ em EUS **Felix** | **1.250.000đ** | SP demo chính |
| Quạt tích điện **ELNI** | 2.150.000đ | |
| Quạt lọc không khí **BB Grey** | 6.250.000đ | |
| Nồi chiên không dầu Princess 12L | 2.650.000đ | |

- **10 Ghế Felix = 12.500.000đ** · +VAT 10% = **13.750.000đ** · **50 cái = 62,5tr** (ngưỡng đơn lớn = **20tr**).
- Đơn giao **đại lý (TH1) = MIỄN ship**. Chính sách: Meta HN **công nợ 30**, Thái Nguyên **công nợ 45** (đều tính **từ ngày nhận hàng**).

### 0.5 Chốt chặn 30 giây
Chạy thử 1 câu → đơn hiện → duyệt → "Hoàn tất · KiotViet KV-…". Restart API cho feed trống trước giờ thật.

---

## 1. MỞ ĐẦU — BÀI TOÁN (≈1 phút)

**🗣** "Dạ em trình bày hệ thống AI xử lý đơn hàng cho U Ultty.

Bài toán: toàn bộ đơn của khách nằm trong **~200 nhóm chat Zalo**, mỗi ngày 10–20 đơn. Đại lý nhắn đơn **viết tắt, không dấu, lộn xộn** — kiểu *'gui 10 ghe felix ve TN cho c, ko lay VAT'*. Sale phải **đọc, hiểu, gõ tay** từng đơn lên KiotViet, rồi chuyển Base giao vận. Chậm, dễ sai.

Hôm nay em demo hệ thống làm 3 việc: **(1)** đọc thẳng đơn từ nhóm Zalo, **(2)** một **đội 6 AI chuyên trách** bóc tách + dựng đơn hoàn chỉnh, **(3)** Sale **duyệt 1 chạm** là xong. Và toàn bộ chạy trên **dữ liệu thật của U Ultty** — danh mục, bảng giá, chính sách thật."

---

## 2. CÂU CHUYỆN KÊNH — VÌ SAO ĐỌC ĐƯỢC TIN NHÓM (≈1.5 phút) ⭐

**🗣** "Câu hỏi đầu tiên và quan trọng nhất: **làm sao máy đọc được đơn nằm trong nhóm Zalo?** Có mấy đường, em đã thử hết:

- **Zalo OA doanh nghiệp** — chính thức nhưng **rất đắt** (60–200 triệu/năm cho ngần đó nhóm) và phải tạo lại nhóm mới. Không khả thi.
- **Zalo Bot Platform** — bot chính thức, miễn phí, vào được nhóm sẵn có; **nhưng chỉ đọc được tin có @tag bot** — đại lý phải đổi thói quen, nhớ tag.
- **Cách bên em đang dùng — đăng nhập một tài khoản Zalo riêng như một 'máy Zalo' của công ty** (qua thư viện `zca-js`). Ưu điểm lớn nhất: **đọc được MỌI tin trong nhóm, đại lý cứ nhắn như thường, KHÔNG phải tag gì cả.**"

👉 **Chỉ badge "Kênh: Zalo Web cá nhân" trên thanh trên.**

**🗣 (trung thực — nói thẳng nếu khách hỏi):** "Cách này **không phải kênh chính thức của Zalo**, nên bên em chạy trên **tài khoản phụ** và khuyến nghị khách **đồng ý bằng văn bản** vì có rủi ro Zalo hạn chế tài khoản. Lưới an toàn: nếu kênh trục trặc, mình vẫn có **Bot chính thức** (tag) và **Sale dán tay** (Co-pilot) phủ nốt — **không bao giờ tắc đơn**."

**⏸** Ngưng 2 giây.

---

## 3. MÀN 1 — ĐƠN THƯỜNG + ĐỘI 6 AGENT + DUYỆT 1 CHẠM (≈2.5 phút) ⭐ trục chính

**▶ Cách A:** trên điện thoại, trong **nhóm Meta HN**, nhắn (KHÔNG tag):
```
gui 10 ghe felix ve TN cho c, ko lay VAT
```
**▶ Cách B:** dán câu đó vào ô **"Bơm tin thử"** (chọn nhóm Meta HN) → **Gửi cho AI xử lý ▸**.

**⏸** Cột giữa: **6 agent sáng lên theo nhịp THẬT** (⏳ → ✓) — vai **Điều phối "quay" ~1–2s** (đang gọi AI thật), 5 vai quy tắc chạy tức thì → phiếu đơn hiện ra.

**🗣 (vừa chỉ vừa nói):**
> "Đây là AI thật đang chạy, không phải video. Vai **Điều phối** đang 'quay' — nó gọi AI đọc hiểu. Xong là ra một đơn hoàn chỉnh từ một dòng chữ viết tắt."

👉 **Chỉ từng hàng agent (đội 6 vai chuyên trách):**
> - **Điều phối** 🧭 — nhận ra *Đặt đơn*, người gửi *Đại lý Meta HN* (vì nhóm map sẵn), giao cho Bán hàng.
> - **Bán hàng** 🧾 — bóc **10 Ghế Felix**, áp **giá sỉ 1.250.000đ**, dựng phiếu.
> - **Chính sách & tài chính** 📋 — **Công nợ 30 ngày (từ ngày nhận hàng)**, **miễn ship** (đơn đại lý), **không VAT** (khách ghi 'ko lay VAT').
> - **Giám sát** 🛡️ — *Không phát hiện rủi ro*.

👉 **Chỉ dòng tiền + nhãn xanh "Rules engine":**
> "Điểm an toàn nhất: **Tổng 12.500.000đ** mang nhãn **‘Rules engine’ xanh** — do bộ quy tắc tính, **không phải AI bịa**. Em ghi rõ *‘số lượng do AI trích, đơn giá & tổng do quy tắc’*. Kế toán yên tâm."

👉 **Chỉ cột phải — Nguồn sự thật:**
> "Bên phải là nguồn sự thật. **‘Kho tri thức’**: AI **chỉ được chọn trong danh mục đóng 19 SKU thật** + từ điển viết tắt (TN→Thái Nguyên, c→chị). **‘Luật đã áp’**: từng luật cho đơn này, mỗi dòng nhãn nguồn. AI **không tự nghĩ ra** sản phẩm hay giá."

**▶ Bấm "Duyệt & gửi nhóm".** **⏸** Chờ 2 dòng ✓ + badge "Hoàn tất".
> "Sale **một chạm**: **(1)** gửi xác nhận vào **đúng nhóm Zalo** (kèm nhãn 'tin tự động'), **(2)** đẩy lên **KiotViet** — mã **KV-1001**. Việc trước đây gõ tay mấy phút qua 2–3 phần mềm, giờ là một chạm."

**🗣 (trung thực):** "KiotViet hiện **chưa mở API** nên bước này em **mô phỏng** để anh/chị thấy trọn luồng. Khi khách bật API — hoặc mình xuất file Excel chuẩn để nhập — thay đúng mảnh này, phần còn lại **giữ nguyên**."

---

## 4. MÀN 2 — ĐA NHÓM, ĐÚNG ĐẠI LÝ, ĐÚNG CHÍNH SÁCH (≈1.5 phút) ⭐

**▶** Gửi **cùng câu chữ** nhưng ở **nhóm Thái Nguyên** (Cách A: nhắn nhóm TN; Cách B: chọn nhóm "Thái Nguyên"):
```
gui 10 ghe felix
```
**⏸** Thẻ đơn thứ hai hiện **ngay cạnh** thẻ đầu, cùng một màn hình.

**🗣** "Điểm mấu chốt: **cùng một câu**, nhưng đơn này đến từ **nhóm khác** → hệ thống tự áp:
- 📍 **Nhóm đại lý Thái Nguyên**, đại lý **Đại lý Thái Nguyên**.
- Chính sách **Công nợ 45 ngày** — **khác** đơn Meta HN (công nợ 30). Vì mỗi nhóm map sẵn với một đại lý, và **chính sách suy từ loại hợp đồng của đại lý đó** — đúng như quy trình thật của khách.

Sale không phải hỏi 'đơn này của ai' — hệ thống biết. **Một bot, một màn hình, 200 nhóm cùng lúc.**"

**▶ (tùy chọn)** Bấm chip lọc nhóm ở đầu feed → chỉ còn đơn nhóm đó.

---

## 5. MÀN 3 — AI PHÂN ĐÚNG MỌI LOẠI TIN (≈2 phút)

Gõ lần lượt, mỗi tin chỉ nhanh vai nổi bật:

| [bơm tin] | **Nói ngắn** |
|---|---|
| `ghe felix co tot khong c oi` | Hỏi SP → **Tư vấn SP** 💡 lấy mô tả từ kho tri thức (soạn sẵn, không tự gửi). |
| `ghe felix bao nhieu tien` | Hỏi giá → **Chính sách & TC** 📋 tra **bảng giá sỉ chung: 1.250.000đ** (nhãn Kho tri thức). |
| `thang nay cong no duoc khong` | Hỏi công nợ → trả lời **theo hồ sơ nhóm** (Meta HN = Công nợ 30 từ ngày nhận hàng). |
| `noi chien moi mua hom qua bi loi` | Bảo hành → **Hậu mãi** 🛠️ tiếp nhận, **chuyển nhóm kỹ thuật** (không tự phán lỗi). |

**🗣 chốt:** "AI phân đúng cả 4 loại, **không nhầm câu hỏi thành đơn**. Đo trên 35 tin thật đạt 100%."

---

## 6. MÀN 4 — GIÁM SÁT LEO THANG: đơn lớn & nhóm lạ (≈1.5 phút) ⭐ điểm nhấn an toàn

**▶** Gửi đơn LỚN: `50 ghe felix`
**⏸**
**🗣** "Đơn **62.500.000đ** — vượt ngưỡng 20 triệu. Vai **Giám sát** 🛡️ tự bật cờ **⚑ đỏ 'chuyển người thật'**, đơn sang trạng thái **'Cần kiểm tra'**, **KHÔNG cho auto-chốt**. Đây chính là **2 cổng duyệt nội bộ (KSNB)** trong quy trình thật của khách — em cho AI phản chiếu đúng."

**▶ (tùy chọn)** Bơm tin từ **"🔓 Nhóm lạ"** (nhóm chưa map): `xin bao gia si`
> "Nhóm chưa map đại lý → Giám sát báo **'chưa xác định đại lý — cần người thật xác minh'**. AI không tự quyết với người lạ."

**🗣** "Nguyên tắc: **đơn sạch thì nhanh, đơn rủi ro thì chuyển người**. Đó là thứ làm hệ thống an toàn để dùng thật."

---

## 7. MÀN 5 — MỜI KHÁCH THAO TÁC THỬ (≈3 phút) ⭐ "thật"

**🗣** "Mời anh/chị **tự gõ một tin bất kỳ** — viết tắt, không dấu, kiểu đại lý hay nhắn — để thấy AI đọc hiểu thật, không phải kịch bản."

**▶** Đưa điện thoại/bàn phím cho khách. Gợi ý nếu khách ngại: *"gui 3 noi chien 2 quat bb grey ve HN"* hoặc *"bb grey gia bao nhieu"*.

💡 Để khách thấy AI xử lý tin **ngoài kịch bản** — đây là khoảnh khắc thuyết phục nhất.

---

## 8. (TÙY CHỌN) BROADCAST KHUYẾN MÃI

**▶** Bấm **📣 Khuyến mãi** trên thanh trên.
**🗣** "Công cụ Sale **soạn → xem trước → xác nhận** gửi khuyến mãi hàng loạt tới nhiều nhóm; mỗi tin **tự gắn nhãn 'Tin tự động'**, có **giãn cách chống spam** + **trần số nhóm** mỗi lần. **AI không tự gửi** — luôn cần Sale xác nhận."

---

## 9. (TÙY CHỌN) AI TỰ CHỐT ĐƠN — `AUTO_SEND`

**🗣** "Khi khách đã đồng ý (GĐ2), bật `AUTO_SEND=on`: đơn **KHÔNG rủi ro** → AI **tự chốt** (gửi nhóm + KiotViet) không cần Sale bấm; **chỉ đơn nào Giám sát thấy bất thường mới gọi người thật**. Sale chỉ còn xử lý ngoại lệ." (Mặc định **off** — đúng GĐ1.)

---

## 10. CHỐT (≈1 phút)

**🗣** "Tóm lại, ba điều:
1. **Đọc thẳng đơn từ nhóm Zalo** — đại lý không đổi thói quen.
2. **Đội 6 AI** bóc tách + dựng đơn từ chữ viết tắt, chạy trên **dữ liệu thật** của U Ultty — **một lần gọi AI/tin**, rẻ.
3. **AI đọc hiểu, quy tắc chốt số, người giữ nút duyệt** — nhanh mà an toàn.

Cái đang **thật**: AI đọc hiểu + kênh Zalo + danh mục/giá/chính sách. Cái đang **mô phỏng**: KiotViet (chưa API) — nối vào là chạy thật ngay, kiến trúc đã tách sẵn."

---

## 11. HỎI – ĐÁP (lời đáp mẫu)

**❓ AI đọc sai thì sao?** → "Không thành thiệt hại: **tiền không do AI tính** nên không sai tiền; **Sale duyệt cuối**; mỗi lần sửa hệ thống học thêm (mở rộng từ điển/few-shot)."

**❓ Kênh Zalo này có bị khóa tài khoản không?** → "Có rủi ro vì không phải kênh chính thức — nên bên em dùng **tài khoản phụ** và cần khách đồng ý bằng văn bản. Nếu bị hạn chế, có **Bot chính thức** + **Sale dán tay** phủ nốt, không mất đơn."

**❓ KiotViet đang mô phỏng à?** → "Đúng, vì KiotViet **chưa mở API** (khảo sát xác nhận). Em mô phỏng để thấy trọn luồng. Khi bật API hoặc xuất file Excel chuẩn để nhập — thay đúng mảnh đó, phần đọc hiểu + duyệt giữ nguyên. KiotViet vẫn là nguồn sự thật kho, **không bỏ**."

**❓ Chi phí AI?** → "AI theo lượt, **1 lần gọi/tin**, rất rẻ với 10–20 đơn/ngày. Với dữ liệu khách thật dùng model đọc-hiểu tốt (Claude); demo dùng DeepSeek trên **dữ liệu test**."

**❓ Đọc đơn bằng ảnh không?** → "Được khi dùng model có nhìn ảnh (Claude vision). Hiện demo (DeepSeek) đọc chữ; đơn ảnh đi qua Sale dán tay."

**❓ Deal riêng của đại lý lớn thì sao?** → "Hệ thống có sẵn chỗ cho **deal riêng theo đại lý** (override giá sỉ chung); chỉ cần khách cung cấp danh sách là áp đúng."

---

## 12. PHÒNG SỰ CỐ

- **Mạng/Zalo trục trặc:** đổi `.env` `CHANNEL_MODE=mock` (hoặc để nguyên, dùng ô "Bơm tin thử") → chạy offline tất định, **AI + rules y hệt**, chỉ khác nguồn tin.
- **DeepSeek lỗi:** `PARSER_MODE=mock` → parser tất định (đọc đúng danh mục thật), restart API.
- **Kênh zca không đăng nhập được:** đừng mở Zalo Web bằng tài khoản đó lúc đang chạy (ngắt listener); xóa `secrets/zalo-cred.json` để quét QR lại; hoặc chuyển `mock`.
- **App không hiện đơn:** bơm lại 1 tin (feed tự làm mới); F5 nếu cần.
- **Nguyên tắc vàng:** trục trặc gì → **`CHANNEL_MODE=mock` + ô "Bơm tin thử"**. Luôn chạy.

---

## 13. PHỤ LỤC

### 13.1 Câu mẫu THẬT (copy nhanh)
```
# Đơn thường (Meta HN, công nợ 30) — 10 x 1.250.000 = 12.500.000đ, miễn ship, không VAT
gui 10 ghe felix ve TN cho c, ko lay VAT

# Cùng câu ở nhóm Thái Nguyên -> công nợ 45 (khác chính sách)
gui 10 ghe felix

# Nhiều SP + VAT
3 noi chien va 2 quat bb grey, xuat VAT

# Đơn lớn -> Giám sát leo thang (62,5tr >= 20tr)
50 ghe felix

# Không phải đơn (AI phân biệt)
ghe felix bao nhieu tien c oi
bb grey co tot khong c oi
```

### 13.2 Bản đồ THẬT vs MÔ PHỎNG (nói khi khách hỏi độ thật)
| Thành phần | Trạng thái | Điều khiển |
|---|---|---|
| AI đọc hiểu | 🟢 THẬT | `PARSER_MODE=deepseek`/`claude` |
| Kênh Zalo (đọc/gửi) | 🟢 THẬT | `CHANNEL_MODE=zca` |
| Danh mục 19 SKU + giá sỉ + glossary | 🟢 THẬT | bảng giá tháng 7 của khách |
| Rules (giá/ship/công nợ/VAT) | 🟢 THẬT | khớp PO + quy trình khách |
| 6-agent + streaming | 🟢 THẬT | |
| KiotViet (kho + đẩy đơn) | 🟡 MÔ PHỎNG | chưa có API — mock KV-1001 |
| Lưu trữ (đơn/tin) | 🟡 in-memory | demo restart sạch; production dùng Postgres |
| Base (giao vận) | ⚪ CHƯA CÓ | GĐ2 |
| Danh sách 200 đại lý + map nhóm đầy đủ | 🟡 3 nhóm mẫu | chờ khách gửi (A4) |

### 13.3 Còn thiếu để chạy THẬT toàn tập (xin khách)
Danh sách đại lý/CTV + map nhóm Zalo đầy đủ (A4) · biểu phí COD + cước ship (A3) · deal riêng (A2) · 20–30 tin test (B1-B2) · file export/import KiotViet (C1). Chi tiết: [checklist-du-lieu-khach.md](checklist-du-lieu-khach.md).
