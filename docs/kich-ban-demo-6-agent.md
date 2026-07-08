# KỊCH BẢN THUYẾT TRÌNH — Đội 6 Agent (Multi-agent 6 con), chạy AI THẬT

> Kịch bản chi tiết **từng lời nói** cho buổi demo — chạy **AI thật (DeepSeek)**, có mục cho **khách tự thao tác thử**.
> Người trình bày: **Phùng Việt (NetViet)**. Khán giả: sếp (anh Hiệu) và/hoặc khách (chị Phương – U Ultty).
> Thời lượng: ~12–15 phút + Q&A + thao tác thử. Ký hiệu: `[thao tác]` · **Nói:** = đọc nguyên văn · 👉 = chỉ tay.

---

## 0. MỤC TIÊU (nắm trước, không đọc)

Cho khán giả thấy **4 điều**:
1. Hệ thống là **đội 6 vai chuyên trách** (đúng bản đồ agent §5.1 tài liệu NetViet) phối hợp xử lý mỗi tin.
2. Chạy **AI thật**: đọc hiểu được tin viết tắt, không dấu, lộn xộn — **kể cả khách lạ gõ tự do**.
3. Vẫn **rẻ + an toàn**: **1 lần gọi AI/tin** (không phải 6), **AI không tính tiền** (rules engine tính, nhãn "Rules engine").
4. Vai **Giám sát** tự bắt rủi ro (đơn lớn, đại lý chưa xác định) → **chuyển người thật**, không auto-chốt.

---

## 1. CHUẨN BỊ KỸ THUẬT (giờ G trừ 20 phút)

- [ ] `.env`: **`PARSER_MODE=deepseek`** (AI thật) + `BOT_MODE=off` + có `DEEPSEEK_API_KEY`. *(Bot Zalo thật thì bật `BOT_MODE=on` — xem §11.)*
- [ ] **Đo eval trước** (bước quan trọng nhất để yên tâm chạy AI thật):
  ```bash
  PARSER_MODE=deepseek BOT_MODE=off pnpm dev:api      # terminal 1
  pnpm --filter @ultty/poc-parser eval                # terminal 2 → phải thấy ≥ 90% (đã đo 100%)
  ```
- [ ] `pnpm dev:web` → mở `http://localhost:3000` trên **màn hình rộng/máy chiếu** (console 3 cột; **không cần phóng to** — chỉ Ctrl+ 1 nấc nếu máy chiếu hẹp).
- [ ] Console mở thẳng vào màn **Đơn hàng** (nút 🖥 trên thanh trên). Chuẩn bị sẵn **bảng tin nhắn** (Phụ lục) để dán nhanh vào ô **Bơm tin thử** (cột trái).
- [ ] **Lưới an toàn:** nếu mạng/DeepSeek trục trặc → đổi `.env` `PARSER_MODE=mock` (chạy offline, tất định) rồi restart API. Logic 6 agent y hệt, chỉ khác bước "đọc hiểu".
- [ ] Tắt thông báo, tắt sleep màn hình.

> **Vì sao yên tâm chạy AI thật:** đã đo eval **35 tin thật** → **100% phân loại đúng** ([docs/poc-parser.md](poc-parser.md)). Parser có few-shot 7 intent + retry + tự đọc tiền tắt ("11tr5", "1.150k").

---

## 1.5 BỐ CỤC CONSOLE 3 CỘT (mới — nắm trước khi chỉ tay)

Giao diện mới là **console rộng cho máy chiếu**, 3 cột trái→phải theo đúng luồng "tin vào → AI suy luận → nguồn sự thật":

- **Cột trái — Tin & đơn vào:** ô **"Bơm tin thử"** (dán tin demo) + danh sách tin/đơn realtime. Tin mới **tự nhảy lên đầu và tự được chọn**, kèm chấm **đang xử lý**. *(Bật `BOT_MODE=on` thì tin đại lý @mention bot cũng tự vào đây — §11.)*
- **Cột giữa — Đội 6 agent (STREAM THẬT qua SSE):** tin gốc → **6 agent sáng lên theo NHỊP THẬT của backend** (⏳ *đang xử lý* → ✓ *xong*), badge nguồn (AI · Rules engine · Kho tri thức) → phiếu đơn + nút duyệt. **Với DeepSeek, vai Điều phối "quay" ~1–2s thật** (đang gọi AI), 5 vai rules chạy tức thì. Badge **LIVE** (topbar) = đang kết nối SSE. **Bấm đơn cũ = xem TĨNH** (không chạy lại); chỉ nút **"▶ Chạy lại (gọi lại AI)"** mới **gọi lại LLM thật** + stream lại.
- **Cột phải — Nguồn sự thật (bám theo tin đang chọn — nhìn biết AI làm gì):**
  - **Kho tri thức:** đầu panel có khối **"🔍 AI đã dùng cho tin này"** — Điều phối *giải mã viết tắt* (TN→Thái Nguyên, c→chị), Bán hàng *khớp SKU + giá* (`ghe felix` → Ghế Felix 1.150.000đ × 10), *nhóm→đại lý* quyết cấp giá/chính sách; danh mục bên dưới **tô sáng** mục đã dùng.
  - **Luật đã áp:** mỗi dòng = **[agent] · AI THẤY gì → RA gì + nhãn nguồn** (vd Bán hàng: "10 × Ghế Felix (AI trích) → giá Đại lý 1.150.000đ → 11.500.000đ" ⟨Rules engine⟩).
  - **KiotViet:** tồn kho (nguồn sự thật kho) + đơn đã đồng bộ.

**Các câu giải thích trước đây in trên màn — nay ĐÃ BỎ khỏi giao diện cho gọn, người trình bày nói bằng lời:**
- **Duyệt / nháp trả lời:** "GĐ1 AI **soạn**, **Sale duyệt 1-chạm** mới gửi. *(Tùy chọn nâng cao: bật `AUTO_SEND=on` → AI **tự chốt** đơn KHÔNG rủi ro, chỉ khi Giám sát báo vấn đề mới gọi Sale — xem §11.5.)*"
- **Tin không phải đơn:** "AI xếp loại rồi **chuyển Sale xử lý** — không ép thành đơn."
- **KiotViet:** "Đây là **mô phỏng** KiotViet (chưa có API); duyệt đơn ở cột giữa → đơn hiện ở tab này và **trừ tồn kho**."
- **Khuyến mãi** (nút 📣 trên thanh trên): "Công cụ Sale **soạn → xem trước → xác nhận** gửi hàng loạt; mỗi tin **tự gắn nhãn 'Tin tự động'**, có giãn cách chống spam — **AI không tự gửi**."

---

## 2. THÔNG ĐIỆP NEO (nhắc lại 3 câu này suốt buổi)

1. **"Một lần gọi AI, sáu vai phối hợp"** — không phải 6 AI, không tốn tiền gấp 6.
2. **"AI đọc hiểu, quy tắc chốt số"** — nhìn nhãn *Rules engine* xanh trên mọi dòng tiền.
3. **"Vai Giám sát canh rủi ro"** — đơn lớn / đại lý lạ tự chuyển người thật.

---

## 3. MỞ ĐẦU (≈1 phút)

**Nói:**
> "Dạ em trình bày phần lõi AI. Mỗi ngày bên mình 10–20 đơn chốt qua chat Zalo, viết tắt không dấu, Sale đọc tay rồi gõ lại lên KiotViet. Cái em demo hôm nay là **đội AI 6 vai chuyên trách** — đúng bản đồ 6 agent trong tài liệu: **Điều phối, Tư vấn sản phẩm, Bán hàng, Chính sách & tài chính, Hậu mãi, Giám sát**."

> "Hai điều em muốn anh/chị để ý: sáu vai này **chỉ tốn một lần gọi AI mỗi tin**, và **AI không tính tiền** — tiền do bộ quy tắc của mình tính. Và quan trọng: lát nữa **mời anh/chị gõ thử tin bất kỳ** để thấy AI đọc hiểu thật. Mình bắt đầu với một đơn bình thường ạ."

---

## 4. MÀN 1 — Đơn hàng thường + duyệt 1 chạm (≈2 phút) ⭐ trục chính

[Cột trái · ô **Bơm tin thử** → chọn **Nhóm đại lý Meta HN** → dán:]

```
@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT
```

[Bấm **Gửi cho AI xử lý ▸**. Cột giữa: **6 agent sáng lên theo nhịp THẬT** (⏳ đang xử lý → ✓ xong) — vai **Điều phối "quay" ~1–2s** (đang gọi DeepSeek), rồi các vai quy tắc chạy tức thì → phiếu đơn hiện ra.]

**Nói (vừa chỉ vừa nói):**
> "Tin đặt hàng kiểu đại lý hay nhắn — viết tắt, không dấu. Anh/chị để ý vai **Điều phối đang 'quay'** — đó là nó **đang gọi AI thật**, mất một hai giây; xong là các vai quy tắc chạy ngay. Đây là chạy **trực tiếp**, không phải quay video sẵn — rồi ra phiếu đơn điền sẵn."

👉 **Chỉ chip trên đầu đội agent + badge trên thanh tiêu đề:**
> "Chỗ này ghi **‘1 lần gọi AI’**, thanh trên có badge **‘AI: DeepSeek’** — đây là AI thật, và **đúng một lần gọi** dù có sáu vai."

👉 **Chỉ từng hàng agent:**
> - "**Điều phối** 🧭 — nhận ra *Đặt đơn*, người gửi *Đại lý*, giao cho Bán hàng."
> - "**Bán hàng** 🧾 — bóc 10 ghế Felix, áp giá cấp đại lý, dựng phiếu xác nhận."
> - "**Chính sách & tài chính** 📋 — chú thích: công nợ 30 ngày, không VAT, miễn ship."
> - "**Giám sát** 🛡️ — *Không phát hiện rủi ro*."

👉 **Chỉ dòng ‘Tổng (rules engine)’ + nhãn xanh:**
> "Điểm an toàn nhất: dòng tiền **11.500.000đ** nhãn **‘Rules engine’ xanh** — do bộ quy tắc tính, không phải AI bịa. Em ghi rõ *‘số lượng do AI trích, đơn giá & tổng do quy tắc’*. Kế toán yên tâm."

👉 **Chỉ sang cột phải:**
> "Bên phải là **nguồn sự thật**. Tab **‘Luật đã áp’** liệt kê từng luật cho đơn này — giá cấp đại lý, miễn ship, **VAT off**, công nợ 30 — mỗi dòng nhãn **Rules engine**. Tab **‘Kho tri thức’** cho thấy AI **chỉ được chọn trong danh mục đóng 18–20 SKU** + từ điển viết tắt (TN→Thái Nguyên…). AI không tự nghĩ ra sản phẩm hay giá."

[Bấm **Duyệt & gửi nhóm**.]
> "Sale **một chạm** để duyệt — gửi xác nhận vào nhóm Zalo (có nhãn tin tự động) + đẩy lên KiotViet. Trạng thái *Hoàn tất*, có mã đơn."

---

## 5. MÀN 2 → 5 — AI phân đúng mọi loại tin (≈2.5 phút)

Gõ lần lượt 4 tin, mỗi tin chỉ nhanh vai nổi bật:

| [dán] | **Nói ngắn** |
|---|---|
| `ghe felix co tot khong c oi` | "Hỏi sản phẩm → **Tư vấn SP** 💡 lấy từ kho tri thức, soạn sẵn câu trả lời (Sale copy, không tự gửi)." |
| `ghe felix bao nhieu tien` | "Hỏi giá → **Chính sách & tài chính** 📋 **tra bảng giá theo cấp đại lý**: 1.150.000đ (nhãn Kho tri thức)." |
| `thang nay cong no duoc khong` | "Hỏi công nợ → trả lời **theo hồ sơ nhóm này** (Meta HN = Công nợ 30 ngày)." |
| `noi chien moi mua hom qua bi loi` | "Bảo hành → **Hậu mãi** 🛠️ phân nhánh *Trong 7 ngày*, **chuyển nhóm kỹ thuật** (không tự phán lỗi)." |

**Nói chốt:**
> "AI thật phân đúng cả bốn loại — không nhầm thành đơn. Bên em đã đo trên 35 tin thật, đúng 100%."

---

## 6. MÀN 6 — Đơn LỚN bất thường → Giám sát (≈1.5 phút) ⭐ điểm nhấn an toàn

[Dán — 50 ghế, không ghi VAT:]

```
@Bot ultty AI orders gui 50 ghe felix
```

[Thẻ có badge **‘Cần kiểm tra’** + banner đỏ.]

👉 **Chỉ dòng Giám sát + banner:**
> "Đơn **50 ghế — năm mươi bảy triệu rưỡi**. Bạn **Giám sát** 🛡️ gắn cờ **‘Đơn lớn bất thường – 57.500.000đ’** và **chuyển người thật**. Đơn **không auto-chốt** → *Cần kiểm tra*, đợi quản lý xác nhận."

**Nói:**
> "Đây là thứ chatbot thường không có: một lớp **giám sát rủi ro** — đơn lớn, khiếu nại gắt, đại lý chưa xác định thì **chặn lại, gọi người**."

> *(Nếu khách hỏi VAT: "Mặc định mình KHÔNG cộng VAT — chỉ khi khách ghi 'xuất VAT' thì hệ thống mới thêm; em gõ thử `50 ghe felix xuat VAT` là thấy có dòng VAT ngay.")*

---

## 7. MÀN 7 — MỜI KHÁCH THAO TÁC THỬ (≈3–4 phút) ⭐ điểm nhấn "thật"

**Nói:**
> "Giờ mời anh/chị **gõ thử tin bất kỳ** kiểu đại lý hay nhắn — viết tắt, không dấu cũng được. Cứ tự nhiên ạ."

[Đưa chuột/bàn phím cho khách. Gợi ý nếu khách ngại:]
> "Ví dụ: *‘robot hut bui gia bao nhieu’*, hay *‘dat 3 noi chien 2 may loc nuoc ve OCP’*, hay hỏi *‘khi nao hang toi’*…"

**Khi khách gõ:** để AI xử lý, rồi chỉ vào **cột giữa (đội 6 agent)** giải thích vai nào vào cuộc + chip **‘1 lần gọi AI’**; cột phải tab **Kho tri thức** cho thấy AI đã dùng gì cho tin khách vừa gõ.

👉 **Trình diễn "Giám sát chặn đơn lạ":** trong ô chọn nhóm có sẵn mục **"🔓 Nhóm lạ (chưa map đại lý)"**.
> "Chọn nhóm này rồi gõ một đơn — vì **chưa xác định được đại lý**, bạn Giám sát **leo thang người thật** ngay. Kể cả nhóm mới lọt vào, hệ thống không tự chốt."

**Nếu khách gõ tin trời ơi (chào hỏi, off-topic):**
> "Tin không rõ ý thì AI xếp *Khác* và soạn câu *‘đã ghi nhận, Sale sẽ phản hồi’* — không bao giờ đoán bừa."

---

## 8. CHỐT (≈45 giây)

**Nói:**
> "Tóm lại: **một lần gọi AI, sáu vai phối hợp**; **AI đọc hiểu, quy tắc chốt số** (nhãn Rules engine); **Giám sát canh rủi ro**, đại lý lạ/đơn lớn tự chuyển người. AI thật đọc được tin lộn xộn — bên em đã đo 35 tin đúng 100%. Bước tiếp theo là gắn dữ liệu thật của mình vào và chạy thử 1–2 nhóm."

---

## 9. HỎI – ĐÁP (lời đáp mẫu)

**Q1. Sáu agent thì tốn tiền API gấp sáu?**
> "Dạ không. Sáu vai **dùng chung một lần gọi AI**. Header trace ghi rõ **‘1 lần gọi AI’**, không bao giờ là 6. Sáu vai là chia việc cho rõ."

**Q2. AI có tự tính sai tiền rồi chốt bừa?**
> "Không — **AI không được phép tính tiền**. Giá/ship/VAT/công nợ do **bộ quy tắc bằng mã** tính từ bảng giá của mình; dòng tiền nào cũng nhãn *Rules engine*. AI chỉ đọc ‘10 cái ghế Felix’."

**Q3. Khác gì ChatGPT/chatbot thường?**
> "Ba khác biệt: có **Giám sát** chặn rủi ro; **tiền do quy tắc tính**; **người duyệt bước cuối** (AI không tự gửi nhóm ở GĐ1)."

**Q4. Lúc nãy đo eval 100% là sao?**
> "Bên em có **bộ 35 tin thật** đủ 7 loại, chạy qua AI thật và đối chiếu — đúng 35/35. Chạy lại bất cứ lúc nào bằng một lệnh, đảm bảo ổn định trước khi lên nhóm thật."

**Q5. AI đọc đơn ảnh chụp bảng không?**
> "Được, khi bật model có thị giác (Claude). DeepSeek hôm nay đọc chữ; đơn ảnh là nhánh riêng đã tính."

**Q6. Nếu AI hiểu sai?**
> "Hai lớp chặn: **Giám sát** gắn cờ khi độ tin cậy thấp, và **Sale duyệt** trước khi chốt. Mỗi lần Sale sửa, hệ thống ghi lại để **học dần**, không cần train lại."

**Q7. Chạy thật trên Zalo được chưa?**
> "PoC bot 07/07 đã xác nhận khả thi (vào nhóm, đọc tin khi được tag). Đây là bản demo lõi AI; ghép bot là bước triển khai, khung đã sẵn."

**Q8. Dữ liệu khách có bị gửi ra ngoài?**
> "Mình **tối thiểu hóa** dữ liệu gửi AI, chỉ dùng API đã thống nhất; tuân thủ Nghị định 13. Cần chạy hoàn toàn nội bộ thì có chế độ tất định không gọi ra ngoài."

**Q9. Go-live cần gì?**
> "Chủ yếu **nguồn sự thật**: SKU, bảng giá theo cấp, chính sách, và ~20–30 tin thật để hiệu chỉnh. Bên em có checklist sẵn."

---

## 10. PHÓNG SỰ CỐ (contingency)

| Sự cố | Xử lý |
|---|---|
| Mạng / DeepSeek chậm hoặc lỗi | Parser **tự retry 1 lần**; nếu vẫn lỗi → tin xếp *Khác* có câu "đã ghi nhận" (không vỡ). Kẹt hẳn → đổi `.env` `PARSER_MODE=mock`, restart, chạy tiếp offline. |
| AI phân 1 tin hơi lệch | Cười: *"tin này AI chưa chắc nên chuyển Sale — đúng nguyên tắc an toàn"*; gõ tin khác. |
| App trắng / lỗi hiển thị | F5 refresh; nếu vẫn → restart `pnpm dev:web`. |
| Feed rối nhiều tin | Restart API cho feed sạch (dữ liệu demo in-memory). |
| Khách gõ tin quá dài/linh tinh | Hệ thống vẫn ra *Khác* + reply lịch sự; không vỡ. |

---

## 11. (TÙY CHỌN) Bật bot Zalo THẬT

Muốn khoe đại lý nhắn thẳng trong nhóm Zalo: `.env` `BOT_MODE=on` + `ZALO_BOT_TOKEN`, restart API. Tag bot trong nhóm → tin về app (xem [poc-zalo-bot.md](poc-zalo-bot.md)). Ràng buộc: nhóm chỉ nhận tin **@mention** bot.

---

## 11.5 (TÙY CHỌN) AI TỰ CHỐT ĐƠN — `AUTO_SEND`

Muốn khoe "AI tự chạy, không cần Sale bấm": `.env` **`AUTO_SEND=on`**, restart API.
- Đơn **KHÔNG rủi ro** → AI **tự chốt**: gửi xác nhận vào nhóm + đồng bộ KiotViet → **"Hoàn tất"** (không cần Sale bấm Duyệt).
- **Chỉ khi vai Giám sát báo vấn đề** (đơn lớn ≥20tr, đại lý lạ, khiếu nại gắt, SL lớn ≥30, cảnh báo, độ tin cậy thấp) → **giữ "Cần kiểm tra" cho Sale**. Đây chính là "rule engine kiểm tra" = vai Giám sát tất định.
- Topbar hiện badge **"Tự gửi: ON"** (vàng).
- **Cảnh báo:** `AUTO_SEND=on` + `BOT_MODE=on` = AI **gửi thật** vào nhóm Zalo → theo GĐ1 cần **văn bản đồng ý của khách** trước khi bật. Demo an toàn không gửi thật: để `BOT_MODE=off` (kênh mock chỉ ghi log).
- Mặc định `AUTO_SEND=off` (đúng GĐ1: Sale duyệt 1-chạm).

**Nói khi demo (nếu bật):**
> "Khi khách đã đồng ý, mình có thể bật chế độ **AI tự chốt**: đơn sạch thì hệ thống tự gửi xác nhận + lên KiotViet ngay; **chỉ đơn nào Giám sát thấy bất thường mới gọi người thật**. Sale chỉ còn xử lý ngoại lệ."

---

## 12. PHỤ LỤC — Bảng tin nhắn & số liệu (copy-paste)

Nhóm: **Meta HN** (Đại lý, Công nợ 30 ngày). `PARSER_MODE=deepseek`.

| # | Tin nhắn | Vai nổi bật | Kết quả kỳ vọng |
|---|---|---|---|
| 1 | `@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT` | Điều phối→Bán hàng→Chính sách→Giám sát | Đơn **11.500.000đ** (nhãn Rules engine), *Chờ duyệt* → Duyệt → *Hoàn tất* + mã KiotViet |
| 2 | `ghe felix co tot khong c oi` | Tư vấn SP | Mô tả Ghế Felix (Kho tri thức), không tạo đơn |
| 3 | `ghe felix bao nhieu tien` | Chính sách & TC | Báo giá **1.150.000đ** (cấp đại lý) |
| 4 | `thang nay cong no duoc khong` | Chính sách & TC | Công nợ 30 ngày |
| 5 | `noi chien moi mua hom qua bi loi` | Hậu mãi | *Trong 7 ngày* → chuyển kỹ thuật |
| 6 | `@Bot ultty AI orders gui 50 ghe felix` | Giám sát | *Đơn lớn bất thường 57.500.000đ* → leo thang, *Cần kiểm tra* |
| 7 | (chọn "🔓 Nhóm lạ") + đơn bất kỳ | Giám sát | *Chưa xác định đại lý* → leo thang |
| 8 | `@Bot ultty AI orders gui 10 ghe felix xuat VAT` | Bán hàng | Có dòng **VAT** → tổng **12.650.000đ** |

**Số liệu neo:** Ghế Felix giá đại lý **1.150.000đ** · 10 cái = **11,5tr** (mặc định KHÔNG VAT) · 10 cái + "xuất VAT" = **12,65tr** · 50 cái = **57,5tr** (ngưỡng cảnh báo đơn lớn = **20tr**).

---

*Liên quan: [poc-parser.md](poc-parser.md) (eval 100%) · [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md) (kiến trúc 6 agent) · `Thiet_ke_AI_Agent_U_Ultty.md` §5.1 (bản đồ agent gốc).*
