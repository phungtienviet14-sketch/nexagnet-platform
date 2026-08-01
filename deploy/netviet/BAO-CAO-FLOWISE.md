# Báo cáo trạng thái sau chuyển đổi Flowise — pilot `netviet`

Ngày cập nhật: 01/08/2026.

## 1. Kết luận hiện tại

Hệ thống đã chuyển lớp parser từ hướng Dify sang **Flowise Agentflow** và đã deploy pilot trên
VM GCP `netviet`.

Luồng đang chạy:

`Zalo zca → lưu tin thô PostgreSQL → FlowiseParser → Flowise Agentflow → parseResultSchema → rules TypeScript → 6 vai nghiệp vụ/SSE → Sale duyệt → Zalo + KiotViet mock`

Trạng thái nghiệm thu:

- Hạ tầng public demo đã chạy: HTTPS, Basic Auth, backup, restore-check, rollback và healthcheck.
- Flowise chạy thật, DeepSeek chạy thật, PostgreSQL chạy thật.
- Chỉ KiotViet đang mock vì chưa có credential/API scope thật của khách.
- ZCA đã có trang Operator để đăng nhập QR bằng tài khoản Zalo phụ và chọn allowlist nhóm.
- Pilot chưa được đánh dấu hoàn tất 100% vì còn cần operator quét QR, chọn nhóm test và chạy E2E
  bằng Zalo thật trong nhóm test.

## 2. URL và tài khoản

| Mục | URL | Tài khoản |
|---|---|---|
| Demo console khách hàng | `https://demo.35-187-235-82.sslip.io` | user `demo` |
| Operator đăng nhập Zalo | `https://operator.35-187-235-82.sslip.io/zalo` | user `netviet` |
| Flowise Admin | `https://flowise.35-187-235-82.sslip.io` | email `phungtienviet14@gmail.com` |

Mật khẩu không nằm trong repo và không nên đọc khi đang chia sẻ màn hình. Lấy bằng PC đã đăng nhập
gcloud:

```powershell
gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-demo-password
gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-operator-password
gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-flowise-admin-password
```

Không đưa tài khoản Operator hoặc Flowise cho khách nếu chỉ demo. Khách chỉ cần URL demo và mật
khẩu demo.

## 3. Cấu hình runtime đang chạy

| Cấu hình | Giá trị hiện tại | Ý nghĩa |
|---|---|---|
| `CHANNEL_MODE` | `zca` | Đọc tin qua tài khoản Zalo cá nhân phụ bằng zca-js |
| `PARSER_MODE` | `flowise` | NestJS gọi Flowise Prediction API để parse |
| `PERSISTENCE` | `prisma` | Lưu tin/đơn/nguồn sự thật vào PostgreSQL |
| `AUTO_SEND` | `off` | AI không tự gửi; Sale duyệt mới gửi |
| KiotViet | mock adapter | Mô phỏng đồng bộ KiotViet |
| Flowise | `zalo-order-parser-v1` | Agentflow parser đang deploy |

Kết quả kiểm tra public gần nhất:

- Demo console trả `401` khi chưa nhập Basic Auth: đúng.
- Operator trả `401` khi chưa nhập Basic Auth: đúng.
- Flowise `/api/v1/ping` trả `200 pong`: đúng.
- Container gateway, API, web, Flowise và PostgreSQL đều healthy.

## 4. Flowise đang làm gì và không làm gì

Flowise chỉ thay lớp gọi LLM để phân loại intent và trích xuất dữ liệu.

Flowise đang làm:

- nhận input có cấu trúc từ NestJS;
- gọi DeepSeek `deepseek-v4-flash`;
- trả structured JSON cho NestJS;
- bị validate lại bằng `parseResultSchema`.

Flowise không làm:

- không tính giá;
- không tính VAT, ship, COD;
- không quyết chính sách công nợ/ký gửi/thanh toán;
- không ghi database;
- không gọi KiotViet;
- không gọi MCP/tool/code node;
- không tự gửi Zalo;
- không chạy 6 agent độc lập.

Canvas Flowise hiện tại cố ý tối giản: **`Parser Input → DeepSeek Extractor`**. Sáu vai trên demo
console là sáu bước nghiệp vụ của NestJS để Sale quan sát, không phải sáu node Flowise.

## 5. Cách chạy/mở hệ thống trên PC

### Cách đúng cho buổi demo

Không chạy Docker/source trên PC. Hệ thống đang chạy trên VM GCP `netviet`. PC chỉ cần trình duyệt
và gcloud để lấy mật khẩu.

Mở ba tab demo:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/netviet/open-demo.ps1
```

Nếu chưa ở thư mục repo, chạy:

```powershell
cd C:\Users\phung\Documents\vietpt\source\Z
powershell -ExecutionPolicy Bypass -File deploy\netviet\open-demo.ps1
```

`http://127.0.0.1:8080` không mở được trên PC vì đó là loopback của VM/container. URL public đúng
là `https://demo.35-187-235-82.sslip.io`.

### Cách chạy local để phát triển

Chế độ này không phải stack Flowise production trên GCP.

```powershell
pnpm install
pnpm dev:api
```

Mở PowerShell thứ hai:

```powershell
pnpm dev:web
```

Sau đó mở `http://localhost:3000`.

## 6. Rủi ro và giới hạn phải nói đúng khi demo

- ZCA dùng userbot tài khoản cá nhân, không phải kênh chính thức của Zalo. Chỉ dùng tài khoản phụ
  và nhóm test.
- DeepSeek chưa phù hợp để dùng với PII thật của khách trong production. Demo/pilot hiện chỉ dùng
  dữ liệu test.
- Allowlist nhóm mặc định rỗng; hệ thống không xử lý nhóm nào cho tới khi operator chọn nhóm.
- Field-accuracy chưa được nghiệm thu bằng bộ tin thật có đáp án chuẩn B1-B2. Eval hiện có mới đủ
  để nói Flowise phân loại intent đạt 35/35 trên bộ demo.
- KiotViet đang mock. Không nói là đã đồng bộ KiotViet thật.

## 7. Tài liệu demo liên quan

- Kịch bản trình bày từng phút: `deploy/netviet/KICH-BAN-DEMO.md`
- Helper mở tab demo: `deploy/netviet/open-demo.ps1`
- Runbook triển khai/vận hành: `deploy/netviet/README.md`
