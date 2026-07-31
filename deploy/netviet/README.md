# Private pilot trên VM `netviet`

Topology: `gateway → web/api → Flowise/PostgreSQL`. Chỉ hai cổng loopback được bind:

- `127.0.0.1:8080`: console Sale và API proxy.
- `127.0.0.1:3002`: Flowise admin.

Truy cập qua IAP:

```powershell
gcloud compute ssh netviet --project netviet-host-968934832433 `
  --zone asia-southeast1-b --tunnel-through-iap `
  -- -L 8080:127.0.0.1:8080 -L 3002:127.0.0.1:3002
```

Sau đó mở `http://127.0.0.1:8080`. Pilot mặc định dùng dữ liệu test,
`CHANNEL_MODE=mock`, `PARSER_MODE=flowise`, `AUTO_SEND=off`.

Triển khai idempotent từ PC:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/netviet/deploy.ps1
```

Script tạo project/VPC/VM/Artifact Registry/Secret Manager/bucket backup, build image
từ worktree, chép manifest vào `/srv/netviet/apps/zalo-ultty`, bootstrap Flowise và
chạy smoke test. Không mở firewall web ra Internet.

Nếu chỉ cần reconcile log metric, kênh email và alert policy mà không build/deploy:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/netviet/deploy.ps1 -MonitoringOnly
```

Script chỉ build khi toàn bộ thay đổi tracked đã được commit; image được gắn đúng git SHA.
Health endpoint và trạng thái/restart container được kiểm tra mỗi phút. Cloud Ops Agent
đẩy log/host metrics; Cloud Monitoring gửi cảnh báo email khi health lỗi, RAM > 85% hoặc
disk > 80%. Backup chạy hằng đêm; bản Chủ nhật được giữ trong nhánh `weekly/`.
Lần deploy đầu chạy cả backup và phục hồi thử hai database trước khi báo thành công.
Sau smoke test, `netviet-soak.service` tự chạy 24 giờ và tải báo cáo TSV lên
`gs://netviet-host-968934832433-backups/soak/`; chỉ báo đạt khi không có health lỗi,
OOM/restart bất thường hoặc vượt ngưỡng RAM/disk.

Rollback parser và image không cần migration database:

```bash
sudo /srv/netviet/apps/zalo-ultty/rollback.sh \
  asia-southeast1-docker.pkg.dev/netviet-host-968934832433/netviet/zalo-ultty@sha256:<digest> \
  deepseek
```
