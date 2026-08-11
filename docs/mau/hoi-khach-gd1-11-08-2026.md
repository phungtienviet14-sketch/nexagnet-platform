# Tin nhắn hỏi chị Phương — chốt phạm vi Giai đoạn 1

> Soạn 11/08/2026 sau khi đọc `Luồng AI Agent ULTTY.pdf` + báo giá tháng 8.
> **Phần A** gửi được ngay. **Phần B** là bảng dữ liệu xin kèm. **Phần C** là ghi chú nội bộ — KHÔNG gửi.
> Bản kỹ thuật của cùng danh sách câu hỏi: [docs/ke-hoach/gd1.md §5](../ke-hoach/gd1.md).

---

## PHẦN A — Tin nhắn gửi chị Phương

Chị Phương ơi,

Em đã đọc kỹ file **"Luồng AI Agent ULTTY"** chị gửi (sơ đồ 3 agent: Bán hàng · Xử lý đơn hàng · Chăm sóc khách hàng). Tài liệu rất rõ ràng, em dựng được kế hoạch chi tiết rồi ạ.

Trước khi bắt tay vào làm, em cần chị chốt giúp em **mấy điểm** — vì mỗi điểm đổi thì khối lượng công việc đổi theo, em không muốn làm xong rồi phải sửa lại ạ.

### 1. AI có được **tự nhắn** vào nhóm không?

Đây là câu quan trọng nhất ạ. Trong sơ đồ của chị có mấy chỗ AI **chủ động gửi tin cho khách**:
- Mục 2.1.3 — soạn đơn xong thì *gửi tin xác nhận cho khách*
- Mục 2.3.2 — giao hàng xong thì *gửi tin xác nhận cho khách*
- Toàn bộ mục 3 — chúc mừng, thông báo giá, khuyến mãi, content hàng ngày

Em xác nhận lại cho chắc: **AI được phép tự nhắn thẳng vào nhóm đại lý**, hay **AI soạn sẵn rồi Sale bấm gửi**?

Nếu là tự nhắn, em cần chị cho em **văn bản đồng ý của công ty** — vì theo quy định Zalo, nhóm phải được báo là "có hệ thống tự động hỗ trợ", và tin do AI tạo phải gắn nhãn ạ.

### 2. Đơn "≤ 50 sản phẩm thì AI tự xử lý" — tự đến đâu ạ?

Trong sơ đồ có vẻ hơi ngược nhau một chút, chị xem giúp em:
- Mục 2.1.1: *"Số lượng ≤ 50 sp → AI tự xử lý"*
- Nhưng mục 2.1.4 lại là *"Gửi thông báo cho Sale"*, và 2.1.5 là *"Sale kiểm tra tồn + Lên đơn KiotViet"*

Vậy với đơn dưới 50 sản phẩm: **AI gửi xác nhận cho khách luôn** rồi mới báo Sale, hay **báo Sale duyệt trước** rồi mới gửi khách ạ?

### 3. "Giá lẻ" là cột nào trong bảng giá?

Bảng giá của mình có 4 cột: *Giá niêm yết · Giá bán lẻ · Giá bán lẻ tối thiểu · Đơn giá CTV*.

Trong sơ đồ chị ghi ví dụ **"WFX Lẻ 2.350k – Buôn 1.750k"**. Em đối chiếu bảng giá thì:
- **1.750k** = Đơn giá CTV ✔ (khớp)
- **2.350k** = cột **"Giá bán lẻ tối thiểu"**, còn cột "Giá bán lẻ" là 2.750k

Vậy khi AI báo giá cho khách lẻ thì đọc cột nào ạ — **2.350k hay 2.750k**?

### 4. Nhóm vận chuyển (mục 2.3)

Mục 2.3.1 ghi *"Nhận ảnh + text từ nhóm vận chuyển Zalo"*. Chị cho em hỏi:
- Đây là nhóm nào ạ? Nhóm nội bộ mình lập, hay nhóm chung với Viettel/Aha/GHTK?
- Có mấy nhóm? Tên nhóm là gì?
- Mình có add được tài khoản AI vào các nhóm đó không ạ?

### 5. Phần chăm sóc khách hàng (mục 3)

Phần này em cần thêm thông tin ạ:
- **Sinh nhật** (3.2): em cần **ngày sinh của từng đại lý/CTV** — hiện mình chưa có dữ liệu này
- **Mùng 1 / Rằm**: tính theo **lịch âm** đúng không ạ?
- **"Content chăm sóc hàng ngày"** (3.4): gửi vào **tất cả** 200-350 nhóm mỗi ngày, hay chỉ nhóm nào chị chọn?

> ⚠️ Riêng mục này em xin nói thật để chị cân nhắc: **gửi tin hàng loạt mỗi ngày vào vài trăm nhóm là việc Zalo hay khóa tài khoản nhất**. Em đề xuất mình làm từ từ — bắt đầu vài nhóm, giãn tần suất, rồi mở rộng dần. Nếu bị khóa giữa chừng thì gián đoạn cả hệ thống ạ.

### 6. Khuyến mãi "30 tặng 1" tính thế nào?

Mục 3.3 ghi *"30 tặng 1 / 10 tặng 1 / ELNI mua 5 tặng ELNA"*. Em cần rõ:
- Tính theo **từng đơn** hay **cộng dồn cả tháng** ạ?
- Hàng tặng có **ghi vào đơn** không, hay để riêng?
- Hàng tặng tính giá **0đ** hay vẫn ghi đơn giá rồi trừ ra?

### 7. Sản phẩm thương hiệu **EUS**

Mục 1.4.1 ghi *"Giá theo sản phẩm ULTTY / EUS"*. Hiện em mới có danh mục ULTTY (19 mã) từ bảng giá tháng 7, phần EUS thì em chỉ thấy mỗi Ghế Felix. Chị gửi em **danh mục + bảng giá EUS** đầy đủ được không ạ?

### 8. Video và catalog

Mục 1.1 và 1.2 có **video sản phẩm** và **catalog**. Em đã kiểm tra kỹ thuật: **Zalo Bot gửi được chữ và ảnh, nhưng không gửi được file video/PDF trực tiếp**.

Vậy mình gửi **đường link** (YouTube/Drive) cho khách bấm vào xem — chị thấy được không ạ?

### 9. Bảng giá tháng 8

Em đang dùng **bảng giá tháng 7.2026**. Sang tháng 8 rồi, chị gửi em bảng mới nhé ạ — vì chính AI sẽ là bên gửi bảng giá cho các đại lý đầu mỗi tháng (mục 3.1), nên số phải chuẩn ạ.

Em cũng thấy một chỗ lệch: sơ đồ của chị ghi ví dụ **"5 x Ghế Felix — 1150k"**, nhưng bảng giá tháng 7 ghi Felix là **1.250k**. Chị xác nhận giúp em: **1.150k là giá tháng 8**, hay là **giá riêng của Phúc Hưng** ạ?

---

## PHẦN B — Dữ liệu xin chị gửi kèm

| # | Cần gì | Vì sao |
|---|---|---|
| 1 | **Bảng giá tháng 8.2026** (cả ULTTY và EUS) | AI báo giá đúng |
| 2 | **Danh sách đại lý/CTV** + chính sách từng bên | Trong sơ đồ chị nhắc Phúc Hưng, KNA, Hope Phạm (công nợ 30), Komex (công nợ 45), Meta (ký gửi 30) — em mới có 3 đại lý trong hệ thống |
| 3 | **Deal giá riêng** của từng đại lý (nếu có) | Ví dụ Felix 1.150k ở trên |
| 4 | **Ngày sinh** đại lý/CTV | Mục 3.2 chúc sinh nhật |
| 5 | **20-30 tin đặt hàng thật** + đơn đúng tương ứng | Đo độ chính xác của AI trước khi chạy thật — **đây là cổng bắt buộc** |
| 6 | **Bộ câu hỏi thường gặp** từng sản phẩm | Mục 1.1 |
| 7 | **Ảnh + link video** từng sản phẩm, **catalog**, **profile công ty** | Mục 1.1, 1.2, 1.3 |
| 8 | **Biểu phí COD + cước ship** Viettel/Aha | Hiện em đang để số tạm tính |

> Riêng mục 5 quan trọng nhất ạ: chị mở 10 nhóm gần nhất có đơn, copy tin của đại lý + chụp đơn KiotViet tương ứng — khoảng **1 tiếng** là đủ. Không có bộ này thì em không đo được AI đọc đúng bao nhiêu phần trăm, và không dám bật chạy thật ạ.

---

## PHẦN C — Ghi chú nội bộ (KHÔNG gửi khách)

**Đã kiểm chứng 11/08/2026:**
- ✅ Zalo Bot Platform **sống lại** — `getUpdates` trả 408 đúng theo `timeout` (1s/5s/20s), `sendMessage` + `sendPhoto` đều sống. Sự cố 504 ngày 05/08 đã hết.
- ❌ `sendVideo` + `sendFile` trả **404 — API không tồn tại** ⇒ câu hỏi 8 ở trên là bắt buộc, không phải tùy chọn.
- ⚠️ Ràng buộc mention-gating vẫn nguyên: bot chỉ nhận tin @mention nó. **Câu hỏi D2 (đại lý có chịu tag bot không) giờ là câu quyết định kiến trúc** — nếu có thì bỏ được zca và toàn bộ rủi ro ToS.

**Chưa hỏi trong tin này (để đợt sau):**
- D5 danh sách người dùng app + phân quyền
- D22 hồ sơ đánh giá tác động xử lý dữ liệu (Mẫu 09)
- D21 đo số tin/ngày thật để chốt sizing + chi phí LLM
- Báo giá còn viện dẫn NĐ 13/2023 (đã hết hiệu lực → Luật 91/2025 + NĐ 356/2025) — **anh Việt tự xử lý với NetViet trước khi ký**
