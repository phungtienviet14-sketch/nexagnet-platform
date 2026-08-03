# Pilot trên VM `netviet`

> Source PC ngày 01/08/2026 đã bổ sung công tắc runtime **Tự gửi** và nút **Đăng xuất tài khoản
> Zalo**, nhưng **chưa deploy** theo yêu cầu người vận hành đang demo. Bản public GCP chưa có hai
> thao tác mới này.

Topology: `Caddy HTTPS → web/api → Flowise/PostgreSQL`. Public chỉ mở `80/443`; API,
PostgreSQL, Flowise port gốc và SSH không được mở trực tiếp.

Với IP hiện tại `35.187.235.82`:

- Demo khách hàng: `https://demo.35-187-235-82.sslip.io` — Basic Auth user `demo`.
- Vận hành/đăng nhập Zalo: `https://operator.35-187-235-82.sslip.io/zalo` — Basic Auth user `netviet`.
- Flowise admin: `https://flowise.35-187-235-82.sslip.io` — email
  `phungtienviet14@gmail.com`, mật khẩu lấy từ Secret Manager như bên dưới.

IP được promote thành regional static address `netviet-public-ip`; Caddy tự cấp và gia hạn TLS.
Mật khẩu không nằm trong repo. Operator lấy từ Secret Manager:

```powershell
gcloud secrets versions access latest --project netviet-host-968934832433 `
  --secret zalo-ultty-demo-password
gcloud secrets versions access latest --project netviet-host-968934832433 `
  --secret zalo-ultty-operator-password
gcloud secrets versions access latest --project netviet-host-968934832433 `
  --secret zalo-ultty-flowise-admin-password
```

Nếu đang chuẩn bị demo và không muốn mật khẩu hiện trên màn hình chia sẻ, lấy trước rồi copy vào
clipboard ở cửa sổ riêng:

```powershell
$flowisePw = ((gcloud secrets versions access latest --project netviet-host-968934832433 `
  --secret zalo-ultty-flowise-admin-password) -join '').Trim()
Set-Clipboard -Value $flowisePw
$flowisePw = $null
```

Sau khi đăng nhập xong, xóa clipboard:

```powershell
Set-Clipboard -Value ''
```

Deploy dùng PostgreSQL thật, Flowise + DeepSeek thật, `PARSER_MODE=flowise`, `AUTO_SEND=off`;
chỉ KiotViet là mock. **Kênh Zalo do secret quyết định:** `render-secrets.sh` đọc
`zalo-ultty-zalo-bot-token` — có token thì render `CHANNEL_MODE=hybrid` (hai bot cùng nhóm),
chưa có thì render `CHANNEL_MODE=zca` và in cảnh báo, vì `loadEnv` fail-fast nếu hybrid thiếu
token. Muốn bật hybrid: tạo secret `zalo-ultty-zalo-bot-token` bằng quy trình quản lý secret
(không ghi token vào repo/log), cấp `roles/secretmanager.secretAccessor` cho service account
`netviet-vm@…`, rồi deploy lại.
ZCA không tự tạo QR khi chưa xác nhận rủi ro trên UI. Allowlist bootstrap mặc định rỗng; trạng
thái test hiện đã chọn **Meta HN** (`2508572440887686813`) và **Thái Nguyên**
(`3787434804745256898`). Cần nhập thêm Bot Platform `chat.id` tương ứng vào Knowledge và cùng
trỏ về đúng đại lý trước E2E hybrid. Chỉ các nhóm
được operator chọn mới được lưu và chuyển sang Flowise/DeepSeek.

Khi bản source mới được deploy, badge **Tự gửi: OFF** trên console là công tắc runtime. Bật cần
xác nhận và chỉ áp dụng cho tin mới được Giám sát kết luận không rủi ro; restart API sẽ đưa nó
về `AUTO_SEND` trong env. Trang Operator có nút đăng xuất: dừng listener, xóa credential cục bộ
và xóa allowlist, vì vậy lần đăng nhập sau phải quét QR và chọn nhóm lại.

## Chạy buổi demo từ PC

Không cần chạy source code hoặc Docker trên PC. Hệ thống đang chạy 24/7 trên VM `netviet`;
PC chỉ cần trình duyệt và `gcloud` để lấy mật khẩu. Mở ba tab bằng helper không chứa secret:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/netviet/open-demo.ps1
```

Kiểm tra nhanh trạng thái public:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://demo.35-187-235-82.sslip.io/health
curl.exe -s -o NUL -w "%{http_code}`n" https://operator.35-187-235-82.sslip.io/health
curl.exe -s -o NUL -w "%{http_code}`n" https://flowise.35-187-235-82.sslip.io/api/v1/ping
```

Kết quả bình thường là `401`, `401`, `200`: demo/operator bị chặn Basic Auth khi chưa đăng nhập;
Flowise ping mở public nhưng phần admin vẫn yêu cầu tài khoản Flowise.

`http://127.0.0.1:8080` là cổng loopback của VM, không phải địa chỉ public và không mở được
trên PC nếu chưa tạo IAP tunnel. Kịch bản trình bày đầy đủ, tin thử và nhánh dự phòng nằm tại
[KICH-BAN-DEMO.md](KICH-BAN-DEMO.md).

Nếu chỉ phát triển offline trên PC, chạy API và web ở hai cửa sổ PowerShell riêng:

```powershell
pnpm install
pnpm dev:api
# Cửa sổ khác
pnpm dev:web
```

Sau đó mở `http://localhost:3000`. Đây là chế độ phát triển local, mặc định không phải stack
Flowise production trên GCP.

Triển khai idempotent từ PC:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/netviet/deploy.ps1
```

Script tạo/reconcile project, VPC, firewall, static IP, VM, Artifact Registry, Secret Manager,
backup, monitoring; build image từ commit, bootstrap/contract-test Flowise và smoke test cả
loopback lẫn ba hostname HTTPS. Image gắn git SHA và script từ chối build khi tracked worktree bẩn.

Truy cập khẩn cấp bằng IAP vẫn được giữ:

```powershell
gcloud compute ssh netviet --project netviet-host-968934832433 `
  --zone asia-southeast1-b --tunnel-through-iap `
  -- -L 8080:127.0.0.1:8080 -L 3002:127.0.0.1:3002
```

Monitoring kiểm tra health/restart container, RAM > 85% và disk > 80%. Backup chạy hằng đêm;
bản Chủ nhật vào nhánh `weekly/`. Deploy chạy backup + restore-check và khởi động soak 24 giờ.

Rollback parser/image không cần migration database:

```bash
sudo /srv/netviet/apps/zalo-ultty/rollback.sh \
  asia-southeast1-docker.pkg.dev/netviet-host-968934832433/netviet/zalo-ultty@sha256:<digest> \
  deepseek
```
