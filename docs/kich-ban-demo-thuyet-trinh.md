# KỊCH BẢN THUYẾT TRÌNH DEMO — Ultty AI

> Bản đọc-được-ngay khi đứng trước mọi người. **Trọng tâm: (1) VÌ SAO chọn Zalo Bot, (2) LUỒNG xử lý đơn hàng từ đầu đến cuối.**
> Ký hiệu: **▶ Thao tác** · **🗣 Nói** (đọc gần nguyên văn) · **⏸ Ngưng** (dừng cho khán giả nhìn) · **💡 Ghi chú riêng bạn**.
>
> Thời lượng: **~7 phút** demo + Q&A. Nói chậm, để màn hình tự nói thay bạn.

---

## PHẦN 0 — CHUẨN BỊ (làm xong TRƯỚC khi mọi người vào)

**▶ Bật hệ thống ở chế độ THẬT** — trong `.env`: `PARSER_MODE=deepseek`, `BOT_MODE=on`. Rồi chạy:
```bash
pnpm dev:api      # đợi "Parser=deepseek · Bot=on"
pnpm dev:web      # http://localhost:3000
```
**▶** Mở **app** (http://localhost:3000) lên máy chiếu. Mở sẵn **nhóm Zalo dev trên điện thoại** (có bot trong nhóm) — cũng chiếu lên nếu được.

**▶ Làm sạch feed:** Ctrl+C terminal API rồi `pnpm dev:api` lại → feed trống.

**💡 Hai cách trình diễn — chọn theo độ ổn định mạng:**
- **Cách A (ấn tượng nhất):** gõ đơn THẬT trong nhóm Zalo trên điện thoại → bot đọc → đơn hiện trên app. Cần mạng + Zalo ổn.
- **Cách B (an toàn, luôn chạy):** gõ vào ô "Giả lập tin nhắn" trên app. **AI vẫn thật (DeepSeek), KiotViet vẫn chạy** — chỉ khác nguồn tin là gõ tay thay vì Zalo. Dùng khi mạng yếu.

**💡 Số cần thuộc:** Ghế Felix **1.150.000đ** · Nồi chiên **890.000đ** · Robot hút bụi **4.200.000đ** · Đơn ≥2 SP **miễn ship** · VAT **10%** · COD **+20.000đ**. Mã KiotViet dạng **KV-1001**.

**💡 Chốt chặn 30 giây:** chạy thử 1 câu → đơn hiện → duyệt → thấy "Hoàn tất · KiotViet KV-…". Xong xóa (restart API) để lúc thật còn "wow".

---

## PHẦN 1 — MỞ ĐẦU: BÀI TOÁN & VÌ SAO ZALO BOT (75 giây)

**🗣** "Em chào anh/chị. Hôm nay em demo hệ thống AI xử lý đơn hàng cho U Ultty.

Vấn đề của khách là thế này: **toàn bộ đơn hàng của họ nằm trong các nhóm chat Zalo** — 200 nhóm, mỗi ngày 10–20 đơn. Đại lý nhắn đơn viết tắt, không dấu, kiểu *'gửi 10 ghế felix về TN cho chị, không lấy VAT'*. Rồi nhân viên Sale phải **đọc, hiểu, gõ tay** từng đơn lên KiotViet. Chậm, và dễ sai.

Muốn tự động hoá, câu hỏi đầu tiên — và quan trọng nhất — là: **làm sao để máy đọc được đơn nằm trong nhóm Zalo?** Có 3 đường:"

**▶** (giơ 3 ngón tay, hoặc chỉ slide nếu có)

**🗣** "Một — dùng công cụ lậu điều khiển Zalo cá nhân. **Loại ngay** — vi phạm điều khoản, **rủi ro khóa mất luôn 200 nhóm**, là tài sản sống còn của khách.

Hai — dùng Zalo OA doanh nghiệp. Chính thức, nhưng **rất đắt — 60 đến 200 triệu một năm** cho ngần đó nhóm, và **phải tạo lại toàn bộ nhóm mới**, mời lại 300 đại lý. Không khả thi.

Ba — **Zalo Bot Platform**: nền tảng bot **chính thức của Zalo**, **miễn phí**, và **thêm được vào chính những nhóm đang có**. Bên em đã chạy thử thực tế và xác nhận nó chạy được. **Đây là đường em chọn** — và hôm nay em demo nó chạy thật."

**⏸** Ngưng 2 giây. **💡 Đây là thông điệp cốt lõi — nói dõng dạc.**

---

## PHẦN 2 — DEMO LUỒNG XỬ LÝ ĐƠN (THẬT, ~4 phút)

### Cảnh 1 — Đại lý đặt đơn, bot tự đọc (90 giây)

**🗣** "Giờ em đóng vai một đại lý — Meta HN — nhắn đơn vào nhóm Zalo, đúng kiểu họ hay viết."

**▶ Cách A:** trên điện thoại, trong nhóm dev, gõ và gửi (nhớ **tag bot**):
`@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT`
**▶ Cách B (an toàn):** gõ đúng câu đó vào ô "Giả lập tin nhắn" trên app → bấm **Gửi cho AI xử lý**.

**⏸** Chờ 1–2 giây, thẻ đơn hiện ra trên app.

**🗣** (chỉ vào thẻ đơn) "Và đây — chỉ sau một, hai giây, **AI đã tự đọc tin đó và dựng ra một đơn hoàn chỉnh**:
- Nhận ra **đại lý Meta HN** — vì hệ thống map sẵn nhóm với đại lý.
- **10 chiếc Ghế massage Felix**, giá **1.150.000đ** — đây là **giá cấp đại lý**, hệ thống tự tra.
- **Tổng 11.500.000đ**, miễn ship vì đơn từ 2 sản phẩm, **không VAT** — vì khách ghi 'không lấy VAT'.
- Chính sách **Công nợ 30 ngày** — đúng của đại lý này.

Toàn bộ dựng từ một dòng chữ viết tắt lộn xộn. **Đây là AI thật đang chạy, không phải kịch bản dựng sẵn.**"

### Cảnh 2 — Sale duyệt 1 chạm: xác nhận nhóm + lên KiotViet (75 giây)

**🗣** "Nhân viên Sale liếc qua thấy đúng, chỉ cần **một nút**."

**▶** Bấm **"Duyệt & gửi nhóm"**. **⏸** Chờ badge chuyển **"Hoàn tất"** và hiện 2 dòng ✓.

**🗣** (chỉ vào 2 dòng ✓ màu xanh) "Một cú bấm, hệ thống làm **hai việc cùng lúc**:
- **Một — gửi tin xác nhận đơn ngược vào nhóm Zalo** cho đại lý, kèm ghi chú 'tin tự động'.
- **Hai — tự đẩy đơn lên KiotViet**, và trả về mã đơn — đây, **KiotViet KV-1001**.

**▶ (nếu Cách A)** Chỉ vào điện thoại: "Anh/chị nhìn nhóm Zalo — tin xác nhận vừa xuất hiện thật."

**🗣** "Cái mà trước đây Sale phải gõ tay mấy phút qua 2–3 phần mềm, giờ là **một chạm**.

💡 *Lưu ý thật thà:* KiotViet hiện **chưa mở API**, nên bước lên KiotViet em đang **giả lập** để anh/chị thấy trọn luồng. Khi khách bật API — hoặc mình xuất file chuẩn để nhập — thì thay phần này bằng kết nối thật, phần còn lại **giữ nguyên không đổi**."

### Cảnh 3 — Đơn phức tạp: nhiều SP, VAT, khách lẻ (60 giây)

**🗣** "Ca vừa rồi đơn giản. Thử ca khó hơn."

**▶** Gửi: `@Bot ultty AI orders 3 noi chien va 2 robot hut bui, xuat VAT` → **⏸**

**🗣** "AI tách **2 sản phẩm**, tự cộng **VAT 10%**, ra tổng **12.177.000đ**.

Và đây là điểm em muốn anh/chị nhớ nhất: **AI không hề tự tính tiền.** AI chỉ làm một việc — *đọc hiểu*: bao nhiêu cái, sản phẩm gì. Còn **toàn bộ số tiền — giá, ship, VAT, chính sách — do một bộ quy tắc cố định của hệ thống tính** từ bảng giá chuẩn. Nghĩa là kể cả AI đọc nhầm, **tiền không bao giờ sai một cách âm thầm**, và Sale luôn duyệt cuối. Đây là thứ làm hệ thống **an toàn để dùng thật**."

**💡 (tuỳ chọn)** thêm 1 đơn khách lẻ: `... gui 5 may loc nuoc cho chi Lan 0912345678 o Thai Nguyen, thu ho` → AI ra đơn TH2 có tên khách, địa chỉ, thu hộ COD.

### Cảnh 4 — Khi bot KHÔNG đọc được: vai trò Co-pilot (45 giây)

**🗣** "Không phải lúc nào bot cũng đọc được. Bot Zalo chỉ nhận tin khi **được tag**. Ba trường hợp nó không thấy: đại lý **quên tag**, gửi bằng **ảnh chụp bảng**, hoặc gửi lúc **bot đang tạm nghỉ**.

Những lúc đó mình có phương án hai — gọi là **Co-pilot**: Sale chỉ cần **copy tin nhắn (hoặc ảnh) dán vào ô này** trên app —"

**▶** Dán 1 câu vào ô "Giả lập" (chính là Co-pilot) → Gửi → đơn hiện ra.

**🗣** "— và AI xử lý **y hệt**, cùng một luồng, cùng cách duyệt. Nên hệ thống **không bao giờ tắc**: tin có tag thì bot tự đọc, tin không tag thì Sale dán tay. **Bot lo phần tự động, Co-pilot làm lưới an toàn.** Không sót đơn nào."

**💡 Đây chính là câu trả lời cho 'vì sao không chỉ dùng Co-pilot':** Co-pilot vẫn phải người dán từng tin — không tự động. Bot đọc thẳng từ nhóm mới là tự động. Nhưng giữ Co-pilot để phủ nốt các ca bot không thấy.

---

## PHẦN 3 — CHỐT: VÌ SAO ZALO BOT (40 giây)

**🗣** (nhìn mọi người) "Tóm lại, vì sao Zalo Bot là lựa chọn đúng:
- **Chính thức** — không rủi ro khóa tài khoản, giữ nguyên 200 nhóm đang có.
- **Gần như miễn phí** — so với 60–200 triệu/năm của phương án OA.
- **Đại lý gần như không đổi thói quen** — chỉ cần tag bot khi đặt hàng.
- Và **đọc thẳng đơn từ nhóm**, nên tự động hoá được — thứ mà dán tay không làm được."

---

## PHẦN 4 — LUỒNG XỬ LÝ ĐƠN (nói khi chỉ sơ đồ, 30 giây)

**🗣** "Cả luồng gói gọn năm bước:

**Zalo** (bot đọc, hoặc Sale dán) → **AI đọc hiểu** (tách sản phẩm, số lượng) → **Bộ quy tắc tính tiền** (giá, ship, VAT, chính sách) → **Sale duyệt một chạm** → **Xác nhận vào nhóm Zalo + đẩy lên KiotViet**.

AI chỉ nằm ở bước đọc hiểu. Tính tiền là quy tắc cố định. Con người giữ nút duyệt cuối. Đó là cách nó vừa nhanh, vừa an toàn."

---

## PHẦN 5 — BƯỚC TIẾP THEO (30 giây)

**🗣** "Đây là bản demo với dữ liệu mẫu em dựng. Để chạy thật với U Ultty, cần ba thứ từ khách:
1. **Bảng giá và danh mục sản phẩm thật** — để tính đúng tiền.
2. **Khách đồng ý cho đại lý tag bot khi đặt hàng.**
3. **Mở API KiotViet** (hoặc thống nhất file nhập) — để thay bước giả lập bằng kết nối thật.

Có đủ là mình chạy thử trên 1–2 nhóm thật ngay. Em xin dừng ở đây, anh/chị có câu hỏi gì không ạ?"

---

## PHẦN 6 — PHÒNG KHI BỊ HỎI (Q&A)

**❓ "Vì sao không chỉ để Sale dán tay (Co-pilot) cho xong, cần gì bot?"**
🗣 "Co-pilot vẫn bắt người dán từng tin — không tự động, không đỡ được khi tăng nhóm. Bot đọc thẳng từ nhóm nên mới tự động hoá thật. Co-pilot chỉ để phủ các ca bot không thấy (ảnh, không tag). Hai cái bổ trợ nhau."

**❓ "AI đọc sai thì sao?"**
🗣 "Cái sai không thành thiệt hại: tiền không do AI tính nên không sai tiền; Sale duyệt cuối, thấy lạ là sửa; và mỗi lần sửa hệ thống học thêm cho lần sau."

**❓ "KiotViet đang là giả lập à? Khi nào thật?"**
🗣 "Đúng, vì hiện KiotViet chưa mở API. Em giả lập để anh/chị thấy trọn luồng. Khi khách bật API — hoặc mình xuất file chuẩn để nhập — thì thay đúng một mảnh đó, phần đọc hiểu và duyệt giữ nguyên."

**❓ "Có bị Zalo khóa tài khoản không?"**
🗣 "Không. Dùng Zalo Bot Platform — nền tảng bot chính thức của Zalo. Bên em đã chạy thử và xác nhận: bot vào nhóm sẵn có, đọc và gửi tin bình thường, chi phí 0đ."

**❓ "Đại lý phải đổi thói quen à?"**
🗣 "Chỉ một việc nhỏ: tag bot khi đặt hàng. Nếu họ không tag, hệ thống vẫn chạy được ở chế độ Sale dán tay — không mất gì."

**❓ "AI này là của ai, chi phí thế nào?"**
🗣 "Phần đọc hiểu dùng dịch vụ AI theo lượt, rất rẻ với 10–20 đơn/ngày. Kênh Zalo gần như miễn phí. Bọn em chọn được nhà cung cấp AI phù hợp túi tiền cho khách."

**❓ "Đọc được đơn bằng ảnh không?"**
🗣 "Được, khi dùng AI có khả năng nhìn ảnh — đại lý tag bot kèm ảnh là bot đọc được cả ảnh lẫn chữ. Còn ở chế độ hiện tại thì đơn ảnh đi qua Co-pilot: Sale dán ảnh vào, AI đọc."

---

## PHẦN 7 — PHÒNG KHI SỰ CỐ (đọc bình tĩnh)

- **Bot trong nhóm không đọc được / mạng yếu:** 🗣 "Phần bot Zalo phụ thuộc mạng, để chắc chắn em chạy bằng ô giả lập trên app — **AI và luồng xử lý bên trong y hệt**." → dùng ô "Giả lập". (Đây vẫn là AI thật + KiotViet, chỉ khác nguồn tin.)
- **App không hiện đơn:** ▶ bấm gửi lại 1 câu (feed tự làm mới mỗi 2–3 giây). Nếu vẫn không → F5 tải lại trang.
- **Terminal API tắt:** ▶ `pnpm dev:api`, đợi 5 giây, F5 web.
- **Nguyên tắc vàng:** trục trặc gì → **quay về ô "Giả lập tin nhắn"** trên app. Nó luôn chạy.

---

## PHỤ LỤC — CÂU MẪU (copy nhanh)
```
@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT
@Bot ultty AI orders 3 noi chien va 2 robot hut bui, xuat VAT
@Bot ultty AI orders gui 5 may loc nuoc cho chi Lan 0912345678 o Thai Nguyen, thu ho
ghe felix bao nhieu tien c oi        (để cho thấy AI phân biệt: đây không phải đơn)
```
**Thứ tự đề xuất:** Cảnh 1 (đơn Felix → duyệt → KiotViet) → Cảnh 3 (nhiều SP + VAT, nhấn "AI không tính tiền") → Cảnh 4 (Co-pilot) → chốt Phần 3–4.
