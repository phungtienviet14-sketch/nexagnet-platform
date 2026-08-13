# Pilot trên VM `netviet`

> Stack này là pre-pilot TEST: có công tắc runtime **Tự gửi**, đăng nhập/đăng xuất Zalo và override
> kênh explicit. Không dùng nhóm khách thật hoặc PII thật.

Topology: `Caddy HTTPS → web/api → Flowise/PostgreSQL`. Public chỉ mở `80/443`; API,
PostgreSQL, Flowise port gốc và SSH không được mở trực tiếp.

Với IP hiện tại `35.187.235.82`:

- Demo khách hàng: `https://demo.35-187-235-82.sslip.io` — **mở thẳng, không đăng nhập**.
- Vận hành/đăng nhập Zalo: `https://operator.35-187-235-82.sslip.io/zalo` — **mở thẳng, không đăng nhập**.
- Flowise admin: `https://flowise.35-187-235-82.sslip.io` — email
  `phungtienviet14@gmail.com`, mật khẩu lấy từ Secret Manager (xem mục dưới).

IP được promote thành regional static address `netviet-public-ip`; Caddy tự cấp và gia hạn TLS.

## Môi trường dev/demo — đã tắt toàn bộ xác thực (04/08/2026)

Quyết định của người vận hành: VM này là **môi trường dev/demo**, không cần xác thực phức tạp.
Bốn lớp dưới đây **đã tắt**, mỗi lớp đều bật lại được:

| Lớp | Trước | Nay | Bật lại bằng |
|---|---|---|---|
| Basic Auth `demo` / `netviet` ở Caddy | 2 khối `basic_auth` | bỏ hẳn | thêm lại `basic_auth` vào `Caddyfile` + khôi phục phần hash trong `render-secrets.sh` |
| Header `x-api-key` (guard toàn cục NestJS) | bắt buộc ở production | bỏ qua | `AUTH_MODE=api-key` |
| Kiểm `Origin` chống CSRF cho mutation | 403 khi sai origin | bỏ qua | `AUTH_MODE=api-key` |
| Đăng nhập AdminJS `/admin` | email + mật khẩu | không hỏi | `AUTH_MODE=api-key` |

Công tắc duy nhất là biến `AUTH_MODE` (`api-key` | `none`), mặc định của schema vẫn là `api-key`;
`render-secrets.sh` ghi `AUTH_MODE=none` vào `.runtime/secrets.env` cho riêng VM này. Secret
`zalo-ultty-api-key`, `zalo-ultty-demo-password`, `zalo-ultty-operator-password` **vẫn còn** trong
Secret Manager — bật lại không phải tạo mới.

**Rủi ro đã chấp nhận:** VM mở public trên 80/443. Không còn xác thực nghĩa là bất kỳ ai biết địa
chỉ đều đọc được bảng giá/đơn/thành viên nhóm, sửa được nguồn sự thật và gọi được `POST /broadcast`
(gửi tin Zalo **thật** tới nhóm khách). Vì vậy:

- Chỉ dùng **nhóm Zalo và dữ liệu TEST**, không PII khách thật (đúng ràng buộc DeepSeek + zca đã
  ghi ở `CLAUDE.md`).
- `AUTO_SEND` giữ `off`; broadcast vẫn cần chọn kênh + ID đích rõ ràng.
- Trước khi chạy dữ liệu khách thật: đặt `AUTH_MODE=api-key`, bật lại Basic Auth, và làm xác thực
  người dùng thật (quyết định **D5**, chưa làm).

**Cập nhật 04/08/2026 (đợt 2) — đã bỏ `@blocked` trên hostname demo.** Trước đó demo trả 404
"Khong co quyen truy cap" cho `/zalo* /broadcast* /settings* /groups* /admin*`. Hệ quả thực tế:
người vận hành mở `demo.../settings` chỉ thấy báo lỗi và tưởng hệ thống **chưa có** trang cấu hình.
Nay **hai hostname hành xử giống hệt nhau** — không còn "trang này chạy ở kia thì không".

| | Trước | Nay |
|---|---|---|
| `demo.../settings` | 404 | **200** |
| `demo.../zalo` | 404 | 200 |
| `demo.../broadcast` | 404 | 200 — **gửi tin Zalo THẬT** |
| `operator.../*` | 200 | 200 |

Đánh đổi đã biết: `/broadcast` gọi được từ cả hostname demo. Muốn chặn lại thì thêm khối
`@blocked path /broadcast*` vào block `{$DEMO_DOMAIN}` trong `Caddyfile` — 4 dòng, có mẫu trong
comment ngay trên block đó.

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
