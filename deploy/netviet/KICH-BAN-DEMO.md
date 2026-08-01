# Kịch bản demo Flowise + Zalo trên `netviet`

> Thời lượng mục tiêu: 18 phút. Chỉ dùng tài khoản Zalo phụ, nhóm test và dữ liệu giả.
> Không hiển thị API key, DeepSeek credential hoặc mật khẩu khi đang chia sẻ màn hình.

## 1. Trạng thái cần nói đúng với khách

Luồng đang chạy trên GCP:

`Zalo → lưu tin thô → FlowiseParser → Flowise Agentflow → kiểm tra schema → rules TypeScript → 6 vai nghiệp vụ/SSE → Sale duyệt → Zalo + KiotViet mock`

- VM `netviet`, PostgreSQL, Flowise, DeepSeek, web/API và HTTPS đang chạy thật.
- Runtime dùng `CHANNEL_MODE=zca`, `PARSER_MODE=flowise`, `PERSISTENCE=prisma`,
  `AUTO_SEND=off`; chỉ adapter KiotViet là mock.
- Flowise có Agentflow đã deploy tên `zalo-order-parser-v1`. Canvas thực tế có **2 node và 1
  cạnh**: `Parser Input → DeepSeek Extractor`. Kết quả structured output được trả về NestJS
  ngay sau node LLM; không có node End riêng trên canvas hiện tại.
- Flowise chỉ phân loại intent và trích xuất dữ liệu. Giá, VAT, ship, COD, chính sách, database
  và thao tác gửi Zalo không nằm trong Flowise.
- Sáu vai trên console là sáu bước nghiệp vụ để Sale quan sát, không phải sáu lần gọi LLM.
  Một tin xử lý thành công chỉ gọi LLM đúng một lần.
- Eval intent Flowise đạt 35/35. Chưa được tuyên bố chính xác field-level vì còn chờ bộ tin
  B1-B2 có đáp án chuẩn của khách.
- Hạ tầng, backup/restore, rollback và soak 24 giờ đã đạt. Nghiệm thu ZCA còn chờ quét QR,
  chọn allowlist và chạy E2E bằng nhóm test.

## 2. Chuẩn bị trước buổi demo

### Tài khoản và màn hình

| Màn hình            | URL                                            | Tài khoản                         | Lấy mật khẩu                               |
| ------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------ |
| Trung tâm điều hành | `https://demo.35-187-235-82.sslip.io`          | user `demo`                       | secret `zalo-ultty-demo-password`          |
| Operator Zalo       | `https://operator.35-187-235-82.sslip.io/zalo` | user `netviet`                    | secret `zalo-ultty-operator-password`      |
| Flowise Admin       | `https://flowise.35-187-235-82.sslip.io`       | email `phungtienviet14@gmail.com` | secret `zalo-ultty-flowise-admin-password` |

Lệnh lấy mật khẩu Flowise, chạy trước khi chia sẻ màn hình:

```powershell
gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-flowise-admin-password
```

Nếu muốn copy thẳng vào clipboard:

```powershell
$flowisePw = ((gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-flowise-admin-password) -join '').Trim()
Set-Clipboard -Value $flowisePw
$flowisePw = $null
```

Sau khi đăng nhập xong, xóa clipboard:

```powershell
Set-Clipboard -Value ''
```

### Trước 30 phút

1. Không chia sẻ màn hình. Lấy ba mật khẩu từ Secret Manager:

   ```powershell
   gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-demo-password
   gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-operator-password
   gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-flowise-admin-password
   ```

2. Mở ba tab bằng:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy/netviet/open-demo.ps1
   ```

3. Đăng nhập Flowise bằng email `phungtienviet14@gmail.com`. Mở `Agentflows` rồi mở
   `zalo-order-parser-v1`.
4. Đăng nhập trang Operator bằng user `netviet`. Dùng tài khoản Zalo phụ, tạo QR, xác nhận
   trên điện thoại, chọn đúng một nhóm test và bấm **Lưu và bắt đầu nhận tin**.
5. Mở Trung tâm điều hành bằng user `demo`; chờ trạng thái SSE hiển thị kết nối.
6. Kiểm tra nhanh trạng thái:

   ```powershell
   curl.exe -s -o NUL -w "%{http_code}`n" https://demo.35-187-235-82.sslip.io/health
   curl.exe -s -o NUL -w "%{http_code}`n" https://operator.35-187-235-82.sslip.io/health
   curl.exe -s -o NUL -w "%{http_code}`n" https://flowise.35-187-235-82.sslip.io/api/v1/ping
   ```

   Kết quả bình thường: `401`, `401`, `200`.

7. Copy sẵn hai tin không chứa PII:

   ```text
   gui 10 ghe felix ve TN cho c, ko lay VAT
   ```

   ```text
   Meta HN lay 2 ghe Felix, giao thang Nguyen Van Test 0900000000, 1 Duong Test, COD
   ```

Chỉ gửi cho khách URL/user/mật khẩu của trang Demo. Tài khoản Operator và Flowise là tài
khoản vận hành nội bộ; đăng nhập hai trang này trước khi bắt đầu chia sẻ màn hình.

Tin thứ nhất phù hợp luồng TH1. Tin thứ hai chỉ dùng để cho thấy TH2/COD; toàn bộ tên, số
điện thoại và địa chỉ đều là dữ liệu giả.

Nếu nhóm Zalo test chưa map với đại lý, kết quả sẽ có cảnh báo **Chưa xác định đại lý từ
nhóm Zalo** và trạng thái **Cần kiểm tra**. Đây là hành vi an toàn đúng thiết kế. Muốn có một
đơn sạch để bấm duyệt, dùng ô **Bơm tin thử** trên console; ô này chỉ thay nguồn vào Zalo,
còn Flowise, DeepSeek, rules, SSE và PostgreSQL vẫn chạy thật.

## 3. Kịch bản trình bày 18 phút

### 0:00–1:30 — Mở bài tại Trung tâm điều hành

Chỉ vào trạng thái kênh, parser, SSE và `Tự gửi: OFF`.

Lời thoại:

> Đây không phải chatbot tự quyết đơn. Hệ thống đọc tin Zalo, gọi AI đúng một lần để hiểu ý
> và trích xuất dữ liệu. Mọi phép tính và chính sách chạy bằng luật TypeScript; Sale vẫn là
> người duyệt cuối.

### 1:30–3:00 — Kiến trúc và phạm vi đang chạy thật

Lời thoại:

> Flowise đã thay Dify ở lớp gọi LLM, nhưng không thay backend nghiệp vụ. NestJS vẫn điều
> phối, giữ nguồn sự thật và kiểm soát mọi hành động. PostgreSQL, Zalo, Flowise và DeepSeek
> đang chạy thật; chỉ bước đồng bộ KiotViet đang mô phỏng vì chưa có credential API của khách.

Nói rõ pilot chỉ dùng dữ liệu test. Không tuyên bố đây là production có PII thật.

### 3:00–6:00 — Mở canvas Flowise

1. Chuyển sang Flowise, vào `Agentflows → zalo-order-parser-v1`.
2. Chỉ node **Parser Input**:

   > NestJS gửi sáu trường có cấu trúc: nội dung tin, URL ảnh, danh mục sản phẩm, glossary
   > viết tắt, đại lý suy ra từ nhóm và tên bot. Agentflow không tự đọc database.

3. Chỉ node **DeepSeek Extractor**:

   > Node này dùng `deepseek-v4-flash`, temperature 0, tối đa 800 token, tắt thinking,
   > streaming và memory. Không có tool node, code node, MCP hay callback.

4. Mở prompt/schema và chỉ bảy intent cùng structured output:

   > Flowise bị giới hạn ở phân loại và trích xuất. Output phải là JSON theo schema. NestJS
   > chỉ nhận `response.json` và validate lại; JSON sai thì báo lỗi, không đoán từ text tự do.

5. Chốt phần canvas:

   > Canvas ít node là chủ ý: phần xác suất nằm ở Flowise; phần có trách nhiệm về tiền và
   > chính sách nằm trong code tất định.

Không nói canvas có sáu agent hoặc ba node; điều đó không đúng artifact đang deploy.

### 6:00–9:00 — Đăng nhập Zalo và giới hạn phạm vi dữ liệu

1. Chuyển sang trang Operator.
2. Tick xác nhận đang dùng tài khoản phụ.
3. Bấm **Tạo mã QR đăng nhập**, quét và xác nhận trên điện thoại.
4. Chọn đúng một nhóm test, bấm **Lưu và bắt đầu nhận tin**.

Lời thoại:

> Mặc định hệ thống không nhận nhóm nào. Operator phải chọn allowlist; các nhóm khác bị bỏ
> qua trước khi lưu tin và trước khi gọi DeepSeek. zca-js đọc được tin không cần tag bot,
> nhưng không phải kênh chính thức nên pilot chỉ dùng tài khoản phụ và nhóm test.

### 9:00–13:00 — Gửi tin Zalo và theo dõi sáu vai qua SSE

1. Chuyển về Trung tâm điều hành để SSE đang kết nối.
2. Gửi trong nhóm test, không tag bot:

   ```text
   gui 10 ghe felix ve TN cho c, ko lay VAT
   ```

3. Theo dõi tin xuất hiện trong Feed và các vai chạy tuần tự.

Lời thoại theo trace:

> Tin thô được giữ trước khi xử lý. Vai Điều phối gọi Agentflow đúng một lần để nhận intent
> đặt đơn và dữ liệu thô. Các vai còn lại kiểm tra sản phẩm, bán hàng, chính sách, hậu mãi và
> rủi ro bằng nguồn sự thật. Sáu vai này không tạo thêm sáu lần gọi LLM.

Nếu hiện cảnh báo nhóm chưa map:

> Hệ thống không tự suy đoán danh tính đại lý. Nó chuyển đơn sang Cần kiểm tra để Sale xử lý.

### 13:00–16:00 — Nguồn sự thật, rules và duyệt đơn

1. Chỉ cột **Nguồn sự thật**, giá, VAT, phí ship/COD, cảnh báo và nháp xác nhận.
2. Chỉ badge một lần gọi AI trong trace.
3. Trước khi bấm duyệt, nói:

   > Tự gửi đang tắt. Flowise không có quyền gửi Zalo; Sale kiểm tra rồi mới duyệt.

4. Với đơn test đủ dữ liệu, bấm **Duyệt & gửi nhóm**.
5. Chuyển sang Zalo để cho thấy tin xác nhận. Giải thích mã KiotViet là kết quả adapter mock;
   các bước nhận tin, Flowise, rules, SSE và lưu PostgreSQL đều là runtime thật.

### 16:00–18:00 — Khả năng phục hồi và kết luận

Lời thoại:

> Nếu Flowise hoặc LLM timeout, tin thô vẫn còn trong PostgreSQL; hệ thống thử tối đa ba
> lượt và không đánh dấu thành công giả. Nếu SSE đứt, giao diện tự chuyển sang polling. Nếu
> gửi Zalo sau duyệt lỗi, đơn vẫn ở trạng thái cho Sale thử lại. Parser có thể rollback trực
> tiếp sang DeepSeek mà không migration database.

Kết luận:

> Flowise giúp nhìn rõ và quản lý lớp AI, còn NetViet giữ phần nghiệp vụ quan trọng trong
> backend kiểm soát được. Bước nghiệm thu tiếp theo là chạy E2E trên nhóm test, nhận bộ tin có
> đáp án chuẩn và đổi sang model có điều kiện xử lý dữ liệu phù hợp trước khi dùng PII thật.

## 4. Nhánh dự phòng trong buổi demo

| Sự cố                                 | Cách xử lý và lời nói trung thực                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| QR không hiện/Zalo chưa đăng nhập     | Dùng ô **Bơm tin thử**. Chỉ đầu vào Zalo được thay; Flowise, DeepSeek, rules, SSE và PostgreSQL vẫn thật.           |
| Nhóm Zalo chưa map đại lý             | Giải thích cảnh báo an toàn, rồi dùng **Bơm tin thử** với nhóm mặc định để trình bày đơn sạch.                      |
| Flowise/LLM lỗi                       | Không tạo kết quả giả. Mở đơn thành công đã lưu, trình bày retry ba lượt và cơ chế giữ tin thô.                     |
| SSE chập chờn                         | Chờ polling tự cập nhật khoảng 2,5 giây; không tải lại liên tục.                                                    |
| Gửi Zalo lỗi                          | Chỉ ra đơn vẫn còn để Sale thao tác lại, không bị chuyển trạng thái thành công sai.                                 |
| Khách hỏi sao Flowise chỉ có hai node | Trả lời: Flowise chỉ sở hữu lớp AI xác suất; rules, database và quyền gửi được cố ý giữ ngoài Flowise để kiểm soát. |

Tuyệt đối không bật `AUTO_SEND=on`, không dùng tài khoản Sale chính và không nhập dữ liệu cá
nhân thật trong buổi demo.
