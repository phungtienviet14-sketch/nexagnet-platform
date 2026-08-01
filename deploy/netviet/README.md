# Pilot trên VM `netviet`

Topology: `Caddy HTTPS → web/api → Flowise/PostgreSQL`. Public chỉ mở `80/443`; API,
PostgreSQL, Flowise port gốc và SSH không được mở trực tiếp.

Với IP hiện tại `35.187.235.82`:

- Demo khách hàng: `https://demo.35-187-235-82.sslip.io` — Basic Auth user `demo`.
- Vận hành/đăng nhập Zalo: `https://operator.35-187-235-82.sslip.io/zalo` — Basic Auth user `netviet`.
- Flowise admin: `https://flowise.35-187-235-82.sslip.io` — đăng nhập bằng tài khoản Flowise.

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

Runtime pilot dùng PostgreSQL thật, Flowise + DeepSeek thật, `CHANNEL_MODE=zca`,
`PARSER_MODE=flowise`, `AUTO_SEND=off`; chỉ KiotViet là mock. ZCA không tự tạo QR khi chưa
xác nhận rủi ro trên UI. Sau đăng nhập, allowlist mặc định rỗng: chỉ các nhóm được operator
chọn mới được lưu và chuyển sang Flowise/DeepSeek.

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
