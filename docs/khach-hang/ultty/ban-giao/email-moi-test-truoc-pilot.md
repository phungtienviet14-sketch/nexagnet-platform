# Bản nháp email mời test — gửi đồng nghiệp trước Pilot Ultty GĐ1

> Bản nháp để **bạn** gửi đi. Sửa xưng hô/tên cho hợp trước khi gửi.
> **Mật khẩu KHÔNG nằm trong email này** — xem mục "Trước khi bấm gửi" ở cuối.

---

## Tiêu đề

```
Nhờ test hệ thống AI đọc đơn hàng Zalo (Ultty) trước khi chạy Pilot
```

## Nội dung

```
Chào <TÊN>,

Bên mình vừa dựng xong một môi trường thử nghiệm riêng cho hệ thống AI xử lý đơn
hàng Zalo của Ultty. Trước khi cho chạy thật với đại lý, mình muốn nhờ <TÊN> test
giúp phần nghiệp vụ — cụ thể là AI có đọc đúng tin đặt hàng và tính đúng tiền không.

Không cần biết kỹ thuật. Chỉ cần gõ tin nhắn đúng như cách đại lý hay nhắn trên
Zalo (viết tắt, không dấu, sai chính tả càng tốt), rồi đối chiếu kết quả.

Đường dẫn màn hình demo:
  https://demo-ultty-gd1-test.35-187-235-82.sslip.io
Tài khoản: operator
Mật khẩu: mình gửi riêng ở tin nhắn khác.

Hai điều nhờ <TÊN> lưu ý:

1. Dùng ĐÚNG đường dẫn có "-ultty-gd1-test" ở trên. Môi trường này đã khóa chức
   năng tự gửi tin ra Zalo nên test thoải mái, không có tin nào lọt vào nhóm đại
   lý. Bản demo cũ (địa chỉ không có phần đó) thì đang bật tự gửi.

2. File hướng dẫn đính kèm có một mục "Những chỗ ĐÃ BIẾT là chưa đúng" — đó là các
   điểm bên mình đã ghi nhận và đang chờ khách cung cấp dữ liệu (bảng phí COD, biểu
   cước ship, bảng giá tháng 8, công thức khuyến mãi...). Gặp mấy chỗ đó thì bỏ
   qua giúp mình, để danh sách lỗi tập trung vào cái chưa biết.

Phần mình cần nhất là những câu mà AI đọc SAI — sai mã hàng, sai số lượng, sai
đại lý, hoặc tính sai tiền. Với mỗi lỗi, nhờ <TÊN> ghi lại nguyên văn câu đã gõ
(quan trọng nhất — thiếu nó bên mình không tái hiện được), kết quả hệ thống ra,
và kết quả đúng phải là gì.

Không gấp, <TÊN> test được lúc nào cũng được. Có gì vướng cứ nhắn mình.

Cảm ơn <TÊN> nhiều.
<KÝ TÊN>
```

## File đính kèm

| File | Nội dung |
|---|---|
| `huong-dan-test-truoc-pilot.md` | Hướng dẫn test đầy đủ: cách vào, bộ tình huống nên thử, quy tắc GĐ1, danh sách chỗ đã biết là sai, mẫu ghi lỗi |

*(Ba PDF bàn giao trong cùng thư mục — nghiệp vụ, sơ đồ hệ thống, lộ trình — chỉ gửi kèm nếu đồng
nghiệp cần bối cảnh sâu hơn. Với việc test nghiệp vụ thì file hướng dẫn ở trên là đủ.)*

---

## ⚠️ Trước khi bấm gửi

1. **Mật khẩu gửi qua kênh khác** (Zalo/SMS), không để trong email. Lấy bằng:

   ```bash
   gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-gd1-test-operator-password
   ```

2. **Kiểm tra môi trường đã sẵn sàng** — mở thử đường dẫn demo trước khi gửi. Nếu chưa lên, đợi
   deploy xong.

3. **Xác nhận lại đường dẫn** trong email đúng là bản `-ultty-gd1-test`, không phải bản demo cũ
   (bản cũ đang bật tự gửi tin vào nhóm Zalo).
