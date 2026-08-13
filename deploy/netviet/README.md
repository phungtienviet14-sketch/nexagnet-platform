# Pilot trên VM `netviet`

> Stack này là pre-pilot TEST: có session đăng nhập server-side, công tắc runtime **Tự gửi**,
> đăng nhập/đăng xuất Zalo và override kênh explicit. Không dùng nhóm khách thật hoặc PII thật.

Topology: `Caddy HTTPS → web/api → Flowise/PostgreSQL`. Public chỉ mở `80/443`; API,
PostgreSQL, Flowise port gốc và SSH không được mở trực tiếp.

Với IP hiện tại `35.187.235.82`:

- Demo khách hàng: `https://demo.35-187-235-82.sslip.io` — yêu cầu đăng nhập session.
- Vận hành/đăng nhập Zalo: `https://operator.35-187-235-82.sslip.io/zalo` — yêu cầu đăng nhập session.
- Flowise admin: `https://flowise.35-187-235-82.sslip.io` — email
  `phungtienviet14@gmail.com`, mật khẩu lấy từ Secret Manager (xem mục dưới).

IP được promote thành regional static address `netviet-public-ip`; Caddy tự cấp và gia hạn TLS.

## Xác thực pre-pilot

VM public dùng `AUTH_MODE=session`: Argon2id, session bền vững trong PostgreSQL, cookie
Secure/HttpOnly/SameSite và CSRF cho mutation. Operator đăng nhập bằng user `operator`; password
lấy từ Secret Manager `zalo-ultty-operator-password`. Deploy đầu tạo ADMIN nếu chưa có; deploy sau
**không reset** password hay session. API key không được đưa vào browser.

`AUTH_MODE=none` chỉ dành cho local/CI không public. Pre-pilot vẫn chỉ dùng **nhóm Zalo và dữ liệu
TEST**, không PII khách thật; `AUTO_SEND` giữ `off` đến Phase B có kiểm soát.

**Routing hai hostname.** Đã bỏ `@blocked` trên hostname demo. Trước đó demo trả 404
"Khong co quyen truy cap" cho `/zalo* /broadcast* /settings* /groups* /admin*`. Hệ quả thực tế:
người vận hành mở `demo.../settings` chỉ thấy báo lỗi và tưởng hệ thống **chưa có** trang cấu hình.
Nay **hai hostname đều route tới cùng app**, rồi session guard áp dụng giống nhau — không còn
"trang này chạy ở kia thì không".

| | Trước | Nay |
|---|---|---|
| `demo.../settings` | 404 | route app, cần session |
| `demo.../zalo` | 404 | route app, cần session |
| `demo.../broadcast` | 404 | route app, cần session + role |
| `operator.../*` | route app | route app, cần session |

`/broadcast` có thể được route từ cả hostname nhưng không gọi ẩn danh; guard session/role/CSRF vẫn
chặn trước khi gửi.

Riêng **Flowise vẫn đòi đăng nhập**: Flowise 3.x bắt buộc có tài khoản, không có cờ tắt. Lấy mật
khẩu (không chia sẻ màn hình khi chạy):

```powershell
gcloud secrets versions access latest --project netviet-host-968934832433 --secret zalo-ultty-flowise-admin-password
```

## Luôn chạy

- `compose.yaml` dùng `restart: always` (không phải `unless-stopped`) cho cả 5 service → container
  quay lại cả khi trước đó bị `docker stop` tay rồi VM reboot.
- `systemd/netviet-stack.service` (enable lúc deploy) chạy `docker compose up -d --no-recreate` mỗi
  lần boot → lo trường hợp container bị **xóa** hẳn, lúc đó Docker không còn gì để restart.
- `health-check.sh` (timer) nay **tự khôi phục**: service nào mất/không `running` thì
  `up -d --no-recreate` rồi mới kiểm lại; mỗi lần chữa đều ghi log `NETVIET_HEALTH_HEAL <service>`
  để sự cố lặp lại vẫn nhìn thấy được.

Deploy dùng PostgreSQL thật, Flowise + DeepSeek thật, `PARSER_MODE=flowise`, `AUTO_SEND=off`;
chỉ ERP là mock/không được gọi trong luồng GĐ1. Deploy mới mặc định `CHANNEL_MODE=mock`. Token Bot
có thể vẫn tồn tại trong Secret Manager nhưng không tự làm kênh hoạt động.

Pre-pilot TEST bật kênh bằng script vận hành (không sửa tay container hoặc `secrets.env`):

```bash
sudo /srv/netviet/apps/zalo-ultty/set-channel-mode.sh zca
```

Script validate mode, lưu approval ở `.runtime/channel-mode.env`, cập nhật env atomically, giữ khóa
compose chung và chỉ recreate API. File `.runtime` không bị deploy ghi đè nên lần deploy sau giữ
`zca` đã phê duyệt. Đổi mode/restart luôn đưa `AUTO_SEND` về `off` theo compose. Deploy cũng luôn
force-recreate API/web trước khi bơm fixture, rồi smoke bỏ qua approve/send khi đang dùng một kênh
Zalo thật (`bot`, `zca`, `hybrid`).

ZCA không tự tạo QR khi chưa xác nhận hai điều kiện trên UI. Nếu session lưu hết hiệu lực, boot chỉ
thử đúng một lần; lần operator chủ động tạo QR tiếp theo thay session cũ nhưng **giữ allowlist**.
Full logout là thao tác mạnh hơn: dừng listener, xóa credential **và xóa allowlist**, vì tài khoản
sau không được kế thừa phạm vi của tài khoản trước. UI có cảnh báo; sau logout phải chọn nhóm lại.

Hai nhóm pre-pilot TEST hiện được phép:

- `5418371951945064288`
- `6732452832330077759`

Chỉ nhóm được operator chọn mới được lưu và chuyển sang Flowise/DeepSeek.

Khi bản source mới được deploy, badge **Tự gửi: OFF** trên console là công tắc runtime. Bật cần
xác nhận và chỉ áp dụng cho tin mới được Giám sát kết luận không rủi ro; restart API sẽ đưa nó
về `AUTO_SEND` trong env.

Rollback kênh và kill switch bằng một lệnh (recreate API làm `AUTO_SEND=off`):

```bash
sudo /srv/netviet/apps/zalo-ultty/set-channel-mode.sh mock
```

## CI/CD

- **CI** (`.github/workflows/ci.yml`, chạy khi push `main` hoặc mở PR): 5 job song song — `verify`
  (lint · typecheck · test · build), `integration` (Postgres 16 thật + `prisma migrate deploy` +
  `RUN_PRISMA_IT=1`), `e2e` (Playwright `/settings`, upload trace khi fail), `audit`
  (`pnpm audit --audit-level high`), `images` (build 2 Dockerfile). Composite action
  `.github/actions/setup-workspace` lo pnpm 10.34.4 + Node 22 + `prisma generate` (bắt buộc vì
  pnpm 10 chặn postinstall của Prisma).
- **CD** (`.github/workflows/deploy.yml`): build/push image theo digest rồi rollout lên VM qua
  IAP, dùng `deploy-ci.sh`. Xác thực **keyless** bằng Workload Identity Federation — không lưu
  service account key JSON trong GitHub.

Thiết lập CD lần đầu:

```bash
GCP_PROJECT_ID=netviet-host-968934832433 GITHUB_REPOSITORY=phungtienviet14-sketch/ultty-ai-orders bash deploy/netviet/setup-github-oidc.sh
```

Script in ra hai giá trị; đặt chúng ở **Settings → Secrets and variables → Actions → Variables**:
`GCP_WORKLOAD_IDENTITY_PROVIDER` và `GCP_DEPLOY_SERVICE_ACCOUNT`. Job deploy gắn environment
`production` — thêm *required reviewers* cho environment này thì mỗi lần deploy sẽ phải có người
duyệt, đúng ràng buộc D4/D16. Bootstrap hạ tầng (project, network, VM, secret) vẫn chạy tay bằng
`deploy.ps1`; CD chỉ lo build → push → rollout.

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

Kết quả bình thường nay là `200`, `200`, `200` — không còn Basic Auth nên cả ba trả về thẳng.
(Nhận `401` ở hai dòng đầu nghĩa là bản đang chạy vẫn là Caddyfile cũ, chưa deploy lại.)
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
