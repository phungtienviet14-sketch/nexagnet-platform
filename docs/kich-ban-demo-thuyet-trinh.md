# KỊCH BẢN THUYẾT TRÌNH DEMO — Ultty AI

> Bản đọc-được-ngay khi đứng trước mọi người. Ký hiệu: **▶ Thao tác** (bạn làm gì) · **🗣 Nói** (đọc gần như nguyên văn) · **⏸ Ngưng** (dừng cho khán giả nhìn màn hình) · **💡 Ghi chú** (cho riêng bạn).
>
> Tổng thời lượng: **~6 phút** demo + 3 phút Q&A. Nói chậm, để màn hình tự nói thay bạn.

---

## PHẦN 0 — CHUẨN BỊ (làm xong TRƯỚC khi mọi người vào, ~5 phút)

**▶ Mở 2 cửa sổ terminal, chạy:**
```bash
pnpm dev:api      # đợi thấy dòng "API dang chay tai http://localhost:3001"
pnpm dev:web      # đợi thấy "Ready" ~ http://localhost:3000
```
**▶** Mở trình duyệt vào **http://localhost:3000**. Phóng to (Ctrl/Cmd +) cho dễ nhìn trên máy chiếu. Nếu chiếu bằng điện thoại: mở cùng địa chỉ trên điện thoại chung mạng.

**▶ Làm sạch màn hình demo:** nếu feed đang có đơn cũ, bấm dừng terminal API (Ctrl+C) rồi `pnpm dev:api` lại — kho dữ liệu demo sẽ trống, feed sạch để bắt đầu.

**💡 Kiểm tra chốt chặn (30 giây):** gõ thử 1 câu → thấy đơn hiện → duyệt → thấy "Đã gửi". Xóa lại (restart API) để lúc demo thật còn "wow".

**💡 Số liệu cần thuộc lòng (để nói không vấp):**
- Ghế massage Felix — giá đại lý **1.150.000đ**
- Nồi chiên không dầu — **890.000đ** · Robot hút bụi — **4.200.000đ**
- Đơn ≥ 2 sản phẩm → **miễn phí ship**. VAT = **10%**.

**💡 Lưới an toàn:** cả buổi demo KHÔNG cần internet, KHÔNG cần Zalo, KHÔNG cần AI trả phí. Mọi thứ chạy trên máy. Nếu có trục trặc gì, cứ dùng ô "Giả lập tin nhắn" — nó luôn chạy.

---

## PHẦN 1 — MỞ ĐẦU (45 giây)

**🗣** "Em chào anh/chị. Hôm nay em xin demo hệ thống AI xử lý đơn hàng Zalo mà bên mình đang làm cho U Ultty.

Hiện tại quy trình của khách là: đại lý nhắn đơn vào nhóm Zalo — mà toàn viết tắt, không dấu, kiểu *'gửi 10 ghế felix về TN cho chị, không lấy VAT'*. Rồi nhân viên Sale phải **đọc, hiểu, rồi gõ tay** từng đơn lên KiotViet. Mỗi ngày 10–20 đơn, 200 nhóm — vừa mất thời gian, vừa dễ sai giá, sai số lượng.

Hệ thống này làm thay phần cực nhất đó: **AI đọc tin, bóc tách thành đơn có cấu trúc, tính sẵn giá — Sale chỉ việc bấm duyệt.** Em demo luôn cho anh/chị xem."

**▶** Chỉ tay vào màn hình (app đang trống).

---

## PHẦN 2 — MÀN CHÍNH

### Cảnh 1 — Đơn cơ bản (90 giây) — "phép màu" đầu tien

**🗣** "Giả sử một đại lý — ở đây là đại lý Meta HN — nhắn vào nhóm một đơn hàng. Em gõ đúng kiểu họ hay nhắn nhé, viết tắt không dấu."

**▶** Gõ vào ô "Giả lập tin nhắn" (hoặc bấm chip mẫu đầu tiên):
`@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT`

**🗣** "Đây — *'gửi 10 ghế felix về Thái Nguyên cho chị, không lấy VAT'*. Bây giờ em bấm gửi cho AI xử lý."

**▶** Bấm **"Gửi cho AI xử lý"**. **⏸ Ngưng 1–2 giây** cho thẻ đơn hiện ra.

**🗣** (chỉ vào thẻ đơn vừa hiện) "Và đây là kết quả. Chỉ một giây, AI đã hiểu và dựng ra một đơn hoàn chỉnh:
- Nó nhận ra đây là **đại lý Meta HN** — vì em map sẵn nhóm Zalo với đại lý.
- Sản phẩm: **10 chiếc Ghế massage Felix**.
- Giá: **1.150.000đ một chiếc** — đây là **giá dành riêng cho cấp đại lý**, hệ thống tự tra chứ không phải AI bịa.
- Tổng: **11.500.000đ**. Phí ship **miễn phí** vì đơn từ 2 sản phẩm trở lên. Và **không có VAT** — vì khách ghi 'không lấy VAT', AI hiểu đúng.
- Chính sách: **Công nợ 30 ngày** — đúng chính sách của đại lý này."

**⏸** Để khán giả nhìn 2 giây.

**🗣** "Bây giờ nhân viên Sale chỉ cần liếc qua, thấy đúng rồi thì bấm một nút."

**▶** Bấm **"Duyệt & gửi nhóm"**. **⏸** Chờ badge đổi sang **"Đã gửi nhóm"**.

**🗣** "Xong. Đơn được duyệt, và hệ thống **tự soạn tin xác nhận gửi ngược lại vào nhóm Zalo** cho đại lý — kèm dòng ghi chú 'tin tự động'. Cái mà trước đây Sale phải gõ tay mấy phút, giờ là **một cú bấm**."

**💡 Nếu đang chạy BOT_MODE thật:** thêm câu — "Và tin xác nhận này vừa xuất hiện thật trong nhóm Zalo — anh/chị nhìn điện thoại em đây."

---

### Cảnh 2 — Đơn phức tạp + VAT (60 giây) — "không chỉ làm được ca dễ"

**🗣** "Ca vừa rồi đơn giản. Giờ em thử một đơn khó hơn — nhiều sản phẩm, có xuất VAT."

**▶** Bấm chip mẫu thứ 2 hoặc gõ:
`@Bot ultty AI orders 3 noi chien va 2 robot hut bui, xuat VAT`

**▶** Bấm **Gửi**. **⏸ Ngưng.**

**🗣** "AI tách ra **2 sản phẩm**: 3 nồi chiên và 2 robot hút bụi, mỗi cái đúng giá cấp đại lý. Và vì lần này khách ghi 'xuất VAT', hệ thống **tự cộng thêm 10% VAT** — thành tổng **12.177.000đ**.

Em nhấn mạnh một điểm cực kỳ quan trọng ở đây: **AI không hề tự tính tiền.** AI chỉ làm đúng một việc là *đọc hiểu* — bao nhiêu cái, sản phẩm gì. Còn **toàn bộ số tiền — giá, ship, VAT, chính sách — là do một bộ quy tắc cố định của hệ thống tính**, lấy từ bảng giá chuẩn. Nghĩa là kể cả AI có đọc nhầm, thì tiền vẫn không bao giờ sai một cách âm thầm, và Sale luôn là người duyệt cuối. Đây là điều làm cho hệ thống **an toàn để dùng thật**."

---

### Cảnh 3 — Không phải đơn nào cũng là đơn (40 giây) — "AI đủ khôn để không làm bừa"

**🗣** "Và không phải tin nào trong nhóm cũng là đơn hàng. Ví dụ đại lý chỉ hỏi giá thôi."

**▶** Gõ hoặc bấm chip: `ghe felix bao nhieu tien c oi`  → **Gửi**. **⏸**

**🗣** "Thấy không — AI **phân loại đây là 'Hỏi giá', không phải đặt hàng**, nên nó không tạo đơn ảo. Nó biết cái gì cần lên đơn, cái gì chỉ để Sale trả lời. Nó không làm bừa."

**💡 (Tùy chọn) Cảnh 4 — Đơn bằng ảnh:** nếu có thời gian và đang chạy bot thật: "Khoảng 20% đơn của khách là chụp ảnh bảng. Hệ thống cũng **đọc được ảnh** — AI nhìn ảnh, bóc ra đơn y như với text. Em có thể demo nếu anh/chị muốn."

---

## PHẦN 3 — CHỐT GIÁ TRỊ (45 giây)

**🗣** (quay lại nhìn mọi người, không nhìn màn hình nữa) "Tóm lại, ba điều em muốn anh/chị nhớ:

Một — **nhanh**: từ tin nhắn viết tắt tới đơn hoàn chỉnh chỉ vài giây, Sale duyệt một chạm thay vì gõ tay.

Hai — **an toàn**: AI không quyết tiền, không tự gửi bừa. Mọi con số do quy tắc cố định tính, con người duyệt cuối. Sai là chặn được ngay.

Ba — **hợp túi tiền và hợp pháp**: chạy trên kênh Zalo chính thức, chi phí gần như bằng không, đại lý gần như không phải đổi thói quen — chỉ cần tag bot khi đặt hàng."

---

## PHẦN 4 — BƯỚC TIẾP THEO (30 giây)

**🗣** "Đây mới là bản demo với dữ liệu mẫu do em tự dựng. Để chạy thật với U Ultty, mình cần hai thứ từ khách:

Một là **bảng giá và danh mục sản phẩm thật** — để hệ thống tính đúng tiền.

Hai là **khách đồng ý cho đại lý tag bot khi đặt hàng** — vì đó là điều kiện để bot tự đọc được tin.

Có hai cái đó là mình chạy thử được trên 1–2 nhóm thật ngay. Em xin dừng phần demo ở đây, anh/chị có câu hỏi gì không ạ?"

---

## PHẦN 5 — PHÒNG KHI BỊ HỎI (Q&A)

**❓ "AI có đọc sai không? Sai thì sao?"**
🗣 "Có thể sai ở khâu đọc hiểu — ví dụ tên viết tắt lạ. Nhưng em thiết kế để **cái sai đó không thành thiệt hại**: một là tiền không do AI tính nên không sai tiền âm thầm; hai là Sale luôn duyệt cuối, thấy lạ là sửa; ba là mỗi lần Sale sửa, hệ thống học thêm để lần sau đúng hơn."

**❓ "Có bị Zalo khóa tài khoản không?"**
🗣 "Không. Mình dùng **Zalo Bot Platform — nền tảng bot chính thức của Zalo**, không phải công cụ lậu. Bên em đã chạy thử (PoC) và xác nhận: bot vào được nhóm có sẵn, đọc và gửi tin bình thường, chi phí 0 đồng."

**❓ "Đại lý phải đổi thói quen à? Họ chịu không?"**
🗣 "Chỉ một thay đổi nhỏ: **tag bot khi đặt hàng** (gõ @ rồi chọn tên bot). Đây là điểm duy nhất cần khách đồng ý. Nếu đại lý không tag, hệ thống vẫn dùng được ở chế độ Sale dán tin thủ công — không mất gì."

**❓ "Chi phí bao nhiêu? / Bao giờ chạy được?"**
🗣 "Kênh Zalo gần như miễn phí. Chi phí chính là phần AI đọc tin, rất nhỏ với 10–20 đơn/ngày. Về tiến độ: có dữ liệu giá thật của khách là mình chạy thử 1–2 nhóm trong vòng một, hai tuần."

**❓ "Nó khác gì mấy chatbot bán hàng ngoài kia?"**
🗣 "Chatbot thường trả lời theo kịch bản. Cái này khác ở chỗ nó **bóc tách đơn từ tin viết tắt lộn xộn thành dữ liệu có cấu trúc để lên KiotViet**, và tách bạch rõ: AI đọc hiểu, còn tính tiền là quy tắc cố định. Nó giải đúng bài toán vận hành của U Ultty, không phải chatbot chung chung."

**❓ "Dữ liệu khách hàng có an toàn không?"**
🗣 "Dữ liệu đơn nằm trong hệ thống của mình, chỉ gửi sang các dịch vụ đã thống nhất. Mình tuân thủ quy định bảo vệ dữ liệu cá nhân, và có thông báo cho nhóm biết là có hệ thống tự động hỗ trợ."

---

## PHẦN 6 — PHÒNG KHI SỰ CỐ (đọc bình tĩnh, đừng hoảng)

- **App không hiện đơn sau khi bấm gửi:** 🗣 "Để em thử lại một chút." → bấm gửi lại 1 câu mẫu. (Feed tự làm mới mỗi 2–3 giây.)
- **Trắng màn hình / lỗi trình duyệt:** ▶ F5 tải lại trang. 🗣 "Em tải lại trang một chút ạ."
- **Terminal API tắt:** ▶ chạy lại `pnpm dev:api`, đợi 5 giây, F5 web.
- **Đang định demo bot Zalo thật mà mạng lỗi:** 🗣 "Phần bot Zalo thật thì phụ thuộc mạng, để chắc chắn em demo bằng chế độ giả lập trên máy — luồng xử lý bên trong y hệt." → dùng ô giả lập.
- **Nguyên tắc vàng:** nếu bất cứ thứ gì trục trặc, **quay về ô "Giả lập tin nhắn"** — nó luôn chạy, không cần mạng.

---

## PHỤ LỤC — CÂU MẪU DÙNG TRONG DEMO (copy nhanh)
```
@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT
@Bot ultty AI orders 3 noi chien va 2 robot hut bui, xuat VAT
@Bot ultty AI orders 5 may loc nuoc
ghe felix bao nhieu tien c oi
```

**Thứ tự trình diễn đề xuất:** câu 1 (duyệt luôn) → câu 2 (nhấn VAT + "AI không tính tiền") → câu 4 (phân loại hỏi giá) → chốt. Câu 3 để dự phòng nếu cần thêm.
