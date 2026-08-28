# CHẤT LƯỢNG DỮ LIỆU NGUỒN — U Ultty (đo 28/08/2026)

> **Mục đích:** liệt kê **chính xác chỗ nào** trong hồ sơ khách đang gây hỏng, kèm **số đo** và **hệ
> quả kỹ thuật**, để hai bên biết phải dọn cái gì trước.
>
> **Không phải bảng chấm điểm.** Phần lớn vấn đề dưới đây là hệ quả tự nhiên của việc một công ty
> không có IT nội bộ dùng Google Drive làm kho tài liệu suốt nhiều năm. Cái đáng nói là **hệ thống AI
> không chịu được** vài trong số đó.
>
> **Đo trên:** bản mirror `ho-so-khao-sat/gd1/` (chụp 12/08/2026, gitignore) + Drive thật
> `AI Zalo B2B` (đọc trực tiếp 28/08/2026). Không chứa PII, không chứa giá riêng theo đại lý.
> Nguồn sự thật nghiệp vụ: [`doi-chieu-nguon-su-that-2026-08.md`](../nghiep-vu/doi-chieu-nguon-su-that-2026-08.md).

---

## Tóm tắt: bốn con số

| | |
|---|---|
| **8,6 GB / 836 tệp** | trong đó **807 là ảnh–video (96,5%)**. Toàn bộ nghiệp vụ nằm trong **13 PDF + 5 DOCX + 1 XLSX = 19 tệp** |
| **226 tệp `_thumb.jpg`** | ảnh thu nhỏ trộn lẫn ảnh gốc — **27% số tệp là bản trùng độ phân giải thấp** |
| **172 tệp tên "Bản sao của …"** | dấu vết copy hàng loạt, không ai đổi tên lại |
| **23 thư mục rỗng** | trong đó có đúng ba thư mục AI cần để gửi catalog |

**Một câu tóm tắt:** hồ sơ **nặng về media, mỏng về dữ liệu có cấu trúc**, và **không có mã định danh
chung** giữa các tài liệu — đó là gốc của phần lớn phần còn lại.

---

## 1. 🔴 Không có mã định danh chung — gốc rễ của mọi thứ khác

Bốn tài liệu cùng nói về một sản phẩm, **không tài liệu nào nối được với tài liệu kia bằng mã**:

| Tài liệu | Khoá nhận dạng dùng |
|---|---|
| `Tên và mã sản phẩm.xlsx` | mã nội bộ (`8716`, `SP251149`, `V08`…) |
| `Thông báo giá tháng 08.pdf` | **chỉ có TÊN tiếng Việt**, không có cột mã |
| `Báo giá riêng CTV/ĐLY` | **chỉ có TÊN tiếng Việt**, viết khác bảng giá |
| Hệ thống | SKU chữ (`ELNI`, `SKJ-CR018HM`…) |

⇒ Mọi phép nối phải khớp bằng **tên tiếng Việt tự do**. Và tên thì không nhất quán:

> **Cùng một máy hút ẩm Hercules:**
> `Máy hút ẩm nhãn hiệu U Ultty model HERCULES` (danh mục gốc)
> `Máy hút ẩm và lọc không khí U Ultty Hercules` (bảng giá)
> `Máy hút ẩm ULTTY Hercules` (bảng giá riêng)

**Hệ quả:** mỗi lần khách gửi bảng giá mới, người ta phải **khớp tay 19–22 dòng bằng mắt**. Đây chính
là chỗ hai SKU lệch giá (`ELNI`, `FELIX`) lọt qua mà không ai thấy.

**Việc cần khách làm:** thêm **một cột mã** vào bảng giá và bảng giá riêng, dùng đúng mã ở
`Tên và mã sản phẩm.xlsx`. Chỉ một cột này là gỡ được phần lớn rủi ro.

---

## 2. 🔴 Bảng giá tự mâu thuẫn

### 2.1 Hai tệp cùng ngày 18/08 nói khác nhau — 6 SKU

`Thông báo giá tháng 8.pdf` và `Báo giá riêng CTV/ĐLY` nằm **cùng thư mục, cùng ngày sửa**, có **cùng
tên 4 cột giá chung**, nhưng lệch nhau ở cột *Giá bán lẻ tối thiểu* trên **6 SKU**.

Đây là cột hệ thống dùng để **tư vấn giá cho khách lẻ** ⇒ lệch ở đây là báo sai giá ra ngoài.

### 2.2 Lỗi logic tồn tại ở **cả hai** tháng

`COMBO WFX + PF360`: **Giá bán lẻ tối thiểu > Giá bán lẻ**.

Mức "tối thiểu" cao hơn mức "bán lẻ" là vô nghĩa. Đáng nói hơn: lỗi này có ở **bảng tháng 07 và được
chép nguyên sang bảng tháng 08** — tức bảng mới **không được rà**, chỉ được sao lại.

### 2.3 Sai tên model

Bảng giá ghi `B23`. Bảng giá riêng ghi **`B25`**. Danh mục gốc ghi `B23`.
⇒ Hai trên ba nguồn nói `B23`. Bảng giá riêng gõ nhầm — và **giá của hai dòng cũng khác nhau**.

### 2.4 Sai chính tả in trên văn bản phát cho đại lý

`BB ROSE **CHAMPANGE**` (đúng: CHAMPAGNE) — lặp lại ở **cả hai** bảng giá.

---

## 3. 🔴 Danh mục sản phẩm: 39 dòng, không có cột phân loại

`Tên và mã sản phẩm.xlsx` trộn chung trong một bảng phẳng:

sản phẩm chính · biến thể màu · **phụ kiện** (con lăn, giá treo, pin) · **vật tư tiêu hao** (nước lau
sàn, màng lọc HEPA, tấm lọc than) · và **một cái thớt tre**.

Không có cột nào phân biệt "bán được" / "phụ kiện" / "vật tư". Máy không tự đoán được.

**Năm hệ đặt mã khác nhau trong cùng một cột:**

`8716` · `SP251149` · `V08` · `SKJ CR022` (dấu cách) · `SKJ-CR021 (W)` (gạch + ngoặc) ·
`2400 - 26470` · `Hepa H13 CR021` · `LUK 016` · `THOTULTTY` · `BEBE650`

**Mã hàng bị Excel lưu thành SỐ:** `8716.0`, `183016.0` — dấu `.0` là dấu hiệu ô được định dạng
numeric. Mã hàng bắt đầu bằng số 0 sẽ **mất số 0 đầu** mà không báo lỗi.

**Lỗi dữ liệu cụ thể đã tìm thấy:**

| Chỗ | Ghi | Đúng phải là |
|---|---|---|
| `SKJ-CR021 (G)`, cột Màu sắc | **"Đem"** | "Đen" |
| Tháp sưởi `CR018HM`, kích thước | `23.6x` **236** `x100.9 cm` | `23.6x23.6x100.9` — thiếu dấu chấm, thành tháp rộng **2,36 mét** |

**Thiếu:** `FELIX` (ghế EUS) **không có trong danh mục 39 dòng**, dù đang bán và có trong bảng giá —
vì là hàng thương hiệu EUS, không phải U ULTTY. Không tài liệu nào nói ra điều này.

**Thừa:** **10 sản phẩm chính** có trong danh mục nhưng **không có giá** ở bảng tháng 08
(`SKJ-CR021` 2 màu, `LIDI`, `PETIT LIDI`, robot `SKJ-RB01X`, `LUK016`, `ULTTY LE`, `Suntec DryFix 20`,
`PF360` bán rời). Không rõ là **ngừng bán** hay **quên đưa vào bảng giá**.

---

## 4. 🟠 Thư mục: khung có, nội dung không

**23 thư mục rỗng.** Ba cái quan trọng nhất:

```
Catalog ULTTY_/Catalog sản phẩm_/Catalog chung_           (rỗng)
Catalog ULTTY_/Catalog sản phẩm_/Catalog riêng sản phẩm_  (rỗng)
Catalog ULTTY_/Thương hiệu ULTTY_                         (rỗng)
```

Đây **đúng ba thứ** mà tài liệu luồng do chính khách vẽ yêu cầu AI gửi (mục 1.2 và 1.3). Khung thư mục
đã dựng sẵn theo đúng ý đồ — **chưa ai bỏ tệp vào**.

**FAQ: 14 thư mục "Bộ câu hỏi thường gặp", 10 rỗng.** Chỉ **4** có nội dung, và chúng được đánh số
`1.`, `2.`, `6.`, `7.` ⇒ **các bộ 3, 4, 5, 8+ có tồn tại ở đâu đó nhưng chưa được giao**.

**Hai thư mục tên "Thư mục không có tiêu đề"** — rỗng, để lẫn trong `PO - Biên bản bàn giao` và
`ULTTY CR022/Bộ câu hỏi thường gặp`.

**Tên thư mục có gạch dưới thừa** ở hầu hết cấp (`AI Zalo_`, `Các quy trình_`, `Mã sản phẩm_`), và
`PO  - Biên bản bàn giao_` có **hai dấu cách** liên tiếp.

---

## 5. 🟠 Media: 8,6 GB nhưng gần như không dùng được ngay

| Vấn đề | Số đo | Hệ quả |
|---|---|---|
| Ảnh thumbnail lẫn ảnh gốc | **226 tệp `_thumb.jpg`** | Không phân biệt được bằng tên; gửi nhầm cho khách là ảnh vỡ |
| Tệp "Bản sao của …" | **172 tệp** | Không biết bản nào là bản dùng |
| Định dạng HEIC | **20 tệp** | **Zalo và trình duyệt không hiển thị trực tiếp**, phải chuyển đổi |
| Video rời rạc | 86 MP4 + 20 MOV | Không tệp nào được đánh dấu "bản chính thức để gửi khách" |
| Tệp trùng hoàn toàn | `Thông báo giá tháng 7.2026.pdf` nằm ở **2 nơi**, md5 giống hệt | Sửa một nơi, nơi kia thành bản cũ âm thầm |

Không ảnh nào có nhãn "đã duyệt để gửi khách" ⇒ hệ thống hiện để **toàn bộ 102 ảnh đã nhập ở trạng
thái `draft`**, tức **chưa gửi được ảnh nào**.

---

## 6. 🟠 Tệp không đọc được bằng máy

| Tệp | Vấn đề |
|---|---|
| `Luồng AI Agent ULTTY.pdf` | **PDF không có font — chỉ là ảnh chụp.** Không tìm kiếm được, không copy được chữ; phải trích ảnh nhúng ra rồi đọc bằng mắt. Đây lại là **tài liệu quan trọng nhất của khách** (nó chứa ngưỡng 50, luật ship, dạng khuyến mãi) |
| 6 tệp `QT_*.pdf` | Export từ Excel, chữ **mất gần hết dấu tiếng Việt** khi trích văn bản |
| `Báo giá riêng CTV/ĐLY` | **Cột ghi chú kỳ hạn thanh toán chỉ điền 1/21 cột**, và **không có cột ngưỡng số lượng** — nên không biết giá riêng áp từ mấy cái |

---

## 7. 🔴 Mâu thuẫn nghiệp vụ — kể cả trong cùng một tài liệu

| Chủ đề | Nguồn A | Nguồn B |
|---|---|---|
| **Hãng vận chuyển** | Khảo sát §4: *"Grab nội thành HN/HCM, Viettel ở tỉnh"* | Khảo sát §5 — **cùng một tệp**: *"vận chuyển (Aha/Viettel)"* |
| **Kỳ hạn ký gửi** | PO ký gửi: thanh toán **7 ngày** sau xuất hoá đơn | Tài liệu luồng của khách: *"Ký gửi **30 ngày**"* |
| **Loại PO** | Khảo sát liệt kê **4** mẫu: ký gửi, công nợ **7**/30/45 ngày | Drive chỉ có **3** — **không có PO "công nợ 7 ngày"** |
| **Ngưỡng đơn** | Hợp đồng + tài liệu khách: *"từ 50 trở xuống AI xử lý"* | `QT Báo giá B2B`: *"từ 50 **trở lên**"* phải qua BGĐ |

**Quy trình đã cũ:** 5/6 tệp `QT_*` đề ngày **11/08/2025** — **cũ hơn hợp đồng một năm**, và mô tả một
quy trình có KSNB, KiotViet, Base mà GĐ1 không tự động hoá.

**Một điểm chưa ai giải thích:** trong PO ký gửi, **bên bán không phải U ULTTY** mà là một pháp nhân
khác (EUS Việt Nam), với **số tài khoản khác**. Không tài liệu nào nói khi nào bán bằng pháp nhân nào.

---

## 8. 🔴 Dữ liệu mật để lẫn dữ liệu nghiệp vụ

`PO - Biên bản bàn giao/` chứa PO **thật, không phải mẫu trắng**: tên pháp nhân mua, địa chỉ, họ tên
người nhận, **số điện thoại di động**, **số tài khoản ngân hàng**.
`anh_chup_tin_nhan_khach/` chứa ảnh chụp hội thoại thật.

Cả hai nằm **chung cây thư mục** với tài liệu nghiệp vụ được chia sẻ.

**Ảnh hưởng trực tiếp:** repo này **public**, nên toàn bộ nhánh đó phải `gitignore`, và mọi tài liệu
dẫn xuất phải viết bằng số đếm thay vì trích dẫn. Cũng là lý do bảng giá riêng theo đại lý **không
được** đưa vào repo (xem §11 của bản đối chiếu nguồn sự thật).

---

## 9. Bốn việc đáng làm trước, theo thứ tự

| # | Việc | Ai làm | Vì sao đứng ở đây |
|---|---|---|---|
| 1 | **Thêm cột MÃ vào bảng giá và bảng giá riêng** | Khách | Gỡ gốc rễ §1. Rẻ nhất, tác dụng lớn nhất. Sau việc này, bảng giá tháng sau khớp được bằng máy |
| 2 | **Trả lời 3 câu chặn** (nguồn giá nào thắng · đúng 50 · ngưỡng giá riêng) | Khách | Đang chạy bằng giả định `ASM-01..03`; giả định đảo ngược được nhưng vẫn là giả định |
| 3 | **Bổ sung catalog + profile + 10 bộ FAQ còn thiếu** | Khách | Ba thư mục rỗng đúng chỗ hợp đồng yêu cầu AI gửi. Không có nội dung thì tính năng "gửi catalog" không nghiệm thu được |
| 4 | **Tách PII ra khỏi cây tài liệu chia sẻ** | Hai bên | PO thật + ảnh tin nhắn đang nằm chung với tài liệu nghiệp vụ |

**Việc NetViet tự làm được, không cần chờ khách:** lọc `_thumb`, chuyển HEIC, khử trùng lặp, gắn nhãn
"đã duyệt" cho ảnh — đó là công việc của U6, và nó không chặn U2.

---

## 10. Điều cần nói cho công bằng

Hồ sơ này **không tệ về nội dung**. Nó có những thứ hiếm khi xin được: quy trình nội bộ 9 bước có lưu
đồ, PO thật của cả ba chính sách, từ điển teencode do chính Sale soạn, và một sơ đồ luồng AI do **chính
khách vẽ** — tài liệu đó là nguồn xác nhận mạnh nhất cho ngưỡng 50, luật ship và dạng khuyến mãi.

Vấn đề là **định dạng và tính nhất quán**, không phải thiếu hiểu biết nghiệp vụ. Phần lớn danh sách
trên sửa được bằng vài buổi làm việc, và mục #1 một mình đã gỡ được phần rủi ro lớn nhất.
