# Lời thoại demo — bản đọc trực tiếp trước khách

> Khác với [KICH-BAN-DEMO.md](KICH-BAN-DEMO.md) (checklist kỹ thuật, thao tác gì bấm ở đâu), file
> này là **lời để đọc**. Chữ trong ngoặc vuông là hành động, chữ thường là câu nói.
>
> Khách: Công ty CP U Ultty Việt Nam — chị Nguyễn Thu Phương (Sale chính) và lãnh đạo.
> Thời lượng: **12–15 phút trình bày + hỏi đáp**.

---

## 0. Chuẩn bị — làm xong TRƯỚC khi chia sẻ màn hình

- [ ] Mở sẵn 2 tab: `https://demo.35-187-235-82.sslip.io` và `https://operator.35-187-235-82.sslip.io/zalo`.
      Cả hai vào thẳng, không hỏi mật khẩu.
- [ ] **Không mở** tab Flowise và trang `/admin` trước mặt khách — đó là bếp, không phải món ăn.
- [ ] Từ 04/08/2026 vào trang cấu hình bằng nút **⚙ Cấu hình** ở góc phải thanh trên, không cần gõ
      URL. Cả hai hostname (demo và operator) đều mở được — trước đó demo trả 404.
- [ ] Tắt thông báo Zalo/Outlook/Teams trên máy.
- [ ] Copy sẵn 2 tin nhắn mẫu ở mục 3 và 4 vào Notepad.
- [ ] Kiểm tra nhanh: cả hai trang mở được và hiện dữ liệu.

**Ba điều tuyệt đối không làm:** không mở dữ liệu khách thật, không bấm nút gửi tin ra nhóm Zalo
thật, không đọc to địa chỉ URL kèm lời "trang này không cần mật khẩu".

---

## 1. Mở đầu — 45 giây

> "Dạ em xin phép bắt đầu. Hôm nay em trình bày phần mềm đọc tin nhắn đặt hàng trên Zalo và tự
> chuyển thành đơn có cấu trúc, để anh chị hình dung được nó chạy thật ra sao chứ không phải slide.
>
> Có ba điều em muốn anh chị chú ý trong 15 phút tới: **một** là AI đọc được tin viết tắt không dấu
> như đại lý vẫn gõ; **hai** là tiền bạc không do AI quyết mà do bảng giá của công ty quyết;
> **ba** là chị Phương vẫn là người bấm nút cuối cùng, máy không tự chốt đơn."

---

## 2. Vấn đề đang có — 1 phút

> "Hiện tại quy trình của mình là: chốt đơn trong nhóm Zalo, rồi gõ tay lại lên KiotViet, rồi
> chuyển Base để giao vận. Mỗi ngày 10–20 đơn, phần lớn là đơn số lượng lớn. Ba hệ thống này không
> nối với nhau, nên cùng một đơn phải gõ lại mấy lần, và chỗ nào gõ lại là chỗ đó có thể sai.
>
> Cái em làm không phải thay Zalo hay thay KiotViet. Em chỉ bỏ bớt đoạn gõ tay ở giữa."

---

## 3. Demo chính — đơn giao đại lý (TH1) — 5 phút

[Mở tab Demo console. Dán tin nhắn vào ô mô phỏng:]

```text
HN_1.8_Meta HN, 10 x ghe Felix, ko VAT
```

> "Đây là một tin nhắn thật theo đúng kiểu đại lý hay gõ: viết tắt, không dấu, không theo mẫu nào
> cả. Em bấm gửi."

[Bấm gửi. Chỉ vào cột giữa khi 6 agent chạy.]

> "Anh chị nhìn cột giữa. Đây không phải hiệu ứng, đây là hệ thống đang chạy thật. Sáu vai này
> giống một tổ làm việc: một bạn điều phối, một bạn tư vấn sản phẩm, một bạn bán hàng, một bạn lo
> chính sách và tài chính, một bạn hậu mãi, và một bạn giám sát ở cuối.
>
> Bạn giám sát là quan trọng nhất — bạn này soi lại xem đơn có gì bất thường không, ví dụ số lượng
> lạ hay tổng tiền lệch, thì đánh dấu để người kiểm tra."

[Chỉ sang cột phải — Nguồn sự thật.]

> "Cột bên phải là chỗ em muốn anh chị yên tâm nhất. Nó cho thấy hệ thống lấy giá ở đâu ra:
> mã sản phẩm nào, giá nào, luật nào được áp. **AI không tự nghĩ ra giá.** AI chỉ làm đúng một
> việc là đọc hiểu tin nhắn; còn nhân tiền, tính phí ship, tính VAT thì do phần mềm tính theo đúng
> bảng giá công ty đưa. Cùng một tin nhắn thì hôm nay hay tháng sau vẫn ra đúng một con số."

[Chỉ vào đơn đã điền sẵn.]

> "Và đây là đơn đã điền sẵn: chi nhánh Hà Nội, đại lý Meta HN, 10 ghế Felix, đơn giá, tổng tiền.
> Chị Phương chỉ cần đọc lướt rồi bấm duyệt. Chỗ nào máy không chắc thì nó **không đoán bừa**,
> nó tô lên để chị điền tay."

---

## 4. Đơn giao thẳng khách, có COD (TH2) — 3 phút

[Dán tin thứ hai:]

```text
Meta HN lay 2 ghe Felix, giao thang Nguyen Van Test 0900000000, 1 Duong Test, COD
```

> "Trường hợp thứ hai khó hơn: đại lý lấy hàng nhưng giao thẳng cho khách của họ, có thu hộ.
> Tin nhắn có tên người nhận, số điện thoại, địa chỉ và chữ COD."

[Bấm gửi, đợi kết quả.]

> "Hệ thống tách được người mua là đại lý Meta HN, còn người nhận là khách lẻ; nhận ra đây là đơn
> thu hộ nên áp phí COD theo biểu mẫu, và tính cước vận chuyển riêng chứ không gộp vào tiền hàng.
>
> Em nói thật một điểm: con số phí ship và phí COD anh chị đang thấy là **em đang tạm đặt** theo
> mức thông thường, vì mình chưa gửi em biểu phí chính thức. Khi có bảng thật, sửa trong 2 phút,
> em sẽ chỉ ngay sau đây."

---

## 5. Công ty tự sửa được, không phải gọi kỹ thuật — 3 phút

[Chuyển sang tab Operator, mở trang cấu hình.]

> "Đây là chỗ trả lời câu hỏi 'sau này thay đổi thì làm sao'. Toàn bộ dữ liệu mà hệ thống dựa vào
> đều nằm ở đây và người của công ty tự sửa được, không cần biết lập trình."

[Lần lượt chỉ — nói ngắn, đừng bấm sửa gì thật:]

- **Đại lý và nhóm Zalo** — nhóm nào là của đại lý nào.
- **Thành viên trong nhóm** — ai là khách, ai là nhân viên mình. Đánh dấu nhân viên nội bộ thì tin
  của họ không bị hiểu nhầm thành đơn hàng.
- **Sản phẩm và bảng giá** — 19 mã, bốn cột giá; đại lý nào có giá riêng thì đặt riêng cho đại lý đó.
- **Công thức** — ship, miễn ship, VAT, COD, ngưỡng cảnh báo.

> "Điểm em muốn nhấn: sửa giá xong có bản nháp, xem thử trên một đơn mẫu rồi mới bấm áp dụng. Và
> **đơn cũ không bị đổi theo** — đơn đã chốt giữ nguyên giá lúc chốt. Mọi thay đổi đều ghi lại
> ai sửa, sửa lúc nào, sửa từ gì thành gì."

---

## 6. Ai là người quyết — 2 phút

> "Câu hỏi anh chị chắc chắn sẽ hỏi: máy có tự nhắn vào nhóm khách không?
>
> Hiện tại **không**. Công tắc tự gửi đang tắt, và em cố tình để tắt. Giai đoạn này máy chỉ đọc và
> chuẩn bị sẵn đơn, còn nhắn gì vào nhóm vẫn là người. Khi nào anh chị thấy nó đọc đúng ổn định và
> có văn bản đồng ý, mình mới bàn tới chuyện cho nó tự trả lời những đơn đơn giản.
>
> Em nói rõ vậy để anh chị không phải lo chuyện máy nhắn nhầm cho khách."

---

## 7. Câu hỏi hay gặp — trả lời sẵn

| Khách hỏi | Trả lời |
|---|---|
| "Đã nối với KiotViet chưa?" | "Chưa ạ. Phần KiotViet trong bản này là mô phỏng. Em cần công ty xác nhận gói KiotViet hiện tại có bật tính năng API không, có thì nối được." |
| "AI đọc sai thì sao?" | "Chỗ nào không chắc nó không đoán, nó đánh dấu để chị điền tay. Và mỗi lần chị sửa, hệ thống ghi lại để lần sau đọc đúng hơn." |
| "Dữ liệu khách có bị lộ không?" | "Bản đang chạy đây là bản thử, dùng nhóm test và dữ liệu giả, không có dữ liệu khách thật. Trước khi chạy thật mình phải chốt phần bảo mật và ký thỏa thuận xử lý dữ liệu — em sẽ trình bày riêng." |
| "Bao giờ chạy được?" | "Phần đọc tin và tạo đơn đã chạy được rồi, anh chị vừa thấy. Cái còn thiếu là dữ liệu thật của mình: bảng giá chính thức, biểu phí ship và COD, danh sách đại lý. Có mấy thứ đó là chạy thử thật được." |
| "Có tốn tiền mỗi tin nhắn không?" | "Có, mỗi tin AI đọc tốn một khoản rất nhỏ. Với 10–20 đơn/ngày thì không đáng kể, em sẽ gửi con số cụ thể trong báo giá." |
| "Zalo có khóa không?" | "Cách đọc tin hiện tại dùng một tài khoản Zalo phụ, không dùng tài khoản của chị Phương. Đây là rủi ro em phải nói trước và cần công ty xác nhận bằng văn bản trước khi chạy thật." |

---

## 8. Nếu có sự cố khi đang demo

| Hiện tượng | Nói gì | Làm gì |
|---|---|---|
| Trang tải chậm / trắng | "Em tải lại trang một chút ạ." | F5. Chờ 10 giây. |
| Không ra kết quả sau 30 giây | "Đây là bản chạy trên máy chủ ở xa, thỉnh thoảng chậm. Em chạy lại tin này." | Gửi lại đúng tin đó. |
| Vẫn không được | **Đừng sửa gì trước mặt khách.** "Em xin phép chuyển sang phần dữ liệu và cấu hình trước, phần này quan trọng hơn." | Chuyển sang mục 5, quay lại sau. |
| Khách đòi thử tin của họ | "Dạ được, nhưng anh/chị cho em tin không có tên và số điện thoại khách thật nhé, bản này là bản thử." | Nhận tin, xóa PII trước khi dán. |

---

## 9. Kết — 1 phút

> "Tóm lại ba ý: AI đọc được đúng kiểu tin nhắn đại lý đang gõ; tiền do bảng giá của công ty quyết
> chứ không do AI; và người vẫn là người bấm nút cuối.
>
> Việc em cần anh chị giúp là ba thứ: **bảng giá chính thức đang áp dụng**, **biểu phí ship và phí
> thu hộ**, và **danh sách đại lý kèm nhóm Zalo tương ứng**. Có ba thứ này em cho chạy thử trên
> một nhóm thật, chạy song song với cách làm hiện tại, không ảnh hưởng gì tới đơn đang chốt.
>
> Em xin phép dừng ở đây, anh chị có câu hỏi gì ạ?"

---

## 10. Ghi nhớ cho người trình bày

- Bản đang chạy dùng **dữ liệu TEST**. Nếu lỡ tay mở đúng dữ liệu thật, dừng lại và nói thẳng là
  bản thử.
- **Không gửi URL trang Operator cho khách.** Trang này hiện không có mật khẩu chặn.
- Số liệu ship/COD/VAT đang là **tạm tính** — nói rõ, đừng để khách hiểu là đã chốt.
- Nếu khách hỏi sâu về kỹ thuật (hạ tầng, bảo mật, chi phí máy chủ): ghi lại câu hỏi, trả lời sau
  bằng văn bản. Đừng trả lời ứng khẩu.
