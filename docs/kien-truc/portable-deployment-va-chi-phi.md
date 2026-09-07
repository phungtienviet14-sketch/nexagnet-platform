# Triển khai portable & chi phí hạ tầng cho một khách

> Quyết định kiến trúc + mô hình chi phí, dựng từ **đo đạc thật** trên VM đang chạy và **giá đọc
> từ trang chính thức của nhà cung cấp**, ngày **07/09/2026**. Task nguồn: Issue #224.
>
> Anchor: `main` tại `00b18a01e763ae987c1f3a14a3d7d9931026219f` (đã re-measure, khớp issue).

## 0. Tóm tắt cho người quyết định

| Câu hỏi | Trả lời đo được |
|---|---|
| Ultty thật sự cần bao nhiêu? | **0,06 vCPU trung bình**, **RAM đỉnh 1,55 GB** (có Flowise) / **0,55 GB** (không Flowise), **~88 MB** dữ liệu nghiệp vụ |
| 4 GB có đủ không? | **Có**, dư ~1,85 GB kể cả khi giữ Flowise |
| 8 GB có cần không? | **Không**, cho riêng Ultty |
| Có phương án ≤500k/tháng không? | **Có** — 350.900–367.323 ₫/tháng all-in, xem §4 |
| Backup offsite tốn bao nhiêu? | 10 GB: **0 ₫** · 50 GB: **7.299 ₫** · 100 GB: **16.423 ₫** (Backblaze B2) |
| Restore từ số 0 mất bao lâu? | **13 giây** cho CSDL (đo thật, §5) |
| Deploy được không cần GCP? | **Được** — đã boot full stack trên Ubuntu 24.04 sạch, §5 |

---

## 1. Đo thật trên VM đang chạy — chỉ stack Ultty

Nguồn số: cgroup v2 (`memory.peak`, `cpu.stat`) đọc trực tiếp trên VM `netviet`
(`asia-southeast1-b`, `e2-standard-2`). Đây là **bộ đếm tích luỹ từ lúc container khởi động**, tức
lịch sử thật 17–25 ngày, **không phải một cửa sổ lấy mẫu ngắn**.

### 1.1 Stack `zalo-ultty` (production)

| Container | Uptime | RAM hiện tại | **RAM đỉnh lịch sử** | CPU tích luỹ | **CPU TB (% 1 core)** |
|---|---|---|---|---|---|
| `api` | 17,4 ngày | 119 MB | 201 MB | 27.313 s | 1,82 % |
| `web` | 17,4 ngày | 133 MB | 148 MB | 29.965 s | 2,00 % |
| `flowise` | 17,4 ngày | 560 MB | **1.004 MB** | 8.212 s | 0,55 % |
| `postgres` | 24,6 ngày | 71 MB | 122 MB | 24.539 s | 1,15 % |
| **Tổng** | | **883 MB** | **1.475 MB** | | **5,52 %** |

Cộng edge dùng chung (`netviet-edge-gateway`, Caddy): 35 MB hiện tại / **74 MB đỉnh** / 0,51 % CPU.
Trên VM hiện tại edge chia cho 5 stack; trên một máy chủ một khách nó tính trọn.

### 1.2 Lưu trữ

| Hạng mục | Đo được |
|---|---|
| Volume `zalo-ultty_postgres-data` | **79 MB** |
| CSDL logic: `zalo` / `flowise` / `postgres` | 11 MB / 12 MB / 7,5 MB |
| `pg_wal` | 32 MB (3 tệp) |
| `/srv/netviet/apps/zalo-ultty` | 5,1 MB (trong đó `catalog-assets` 4,0 MB) |
| `zalo-ultty_flowise-data` | 20 KB |
| **Tổng dữ liệu nghiệp vụ Ultty** | **≈ 88 MB** |

Bảng nghiệp vụ lớn nhất: `Order` 672 KB (172 dòng), `Message` 272 KB (202 dòng), `AuditLog` 232 KB
(316 dòng). Đây là một hệ thống **nhỏ về dữ liệu**, đúng với 10–20 đơn/ngày trong CLAUDE.md.

> ⚠️ **Đừng nhầm image Docker với dữ liệu nghiệp vụ.** `docker system df` trên VM: **144,8 GB image,
> trong đó 124,7 GB (86 %) reclaimable**. Đĩa 200 GB đang dùng 147 GB **không phải vì dữ liệu khách**
> — dữ liệu khách của cả 5 stack cộng lại là 3,3 GB volume. Một máy chủ một khách cần **chính sách
> `docker image prune`**, không cần đĩa lớn.

### 1.3 Đĩa, I/O, mạng (toàn host, 37 ngày)

- Đĩa: 193 GB tổng, 147 GB dùng, 47 GB trống (76 %).
- Ghi tích luỹ: ~1,95 TB / 37 ngày ≈ **53 GB/ngày** — phần lớn là ClickHouse của stack gd1-test.
- Mạng `ens4`: RX 40,06 GB + TX 31,84 GB / 37 ngày ≈ **58 GB/tháng cho TOÀN host** (5 stack + CI +
  kéo image). Phần của riêng Ultty nhỏ hơn nhiều. Mọi phương án ở §3 đều cấp ≥500 GB, nên **băng
  thông không phải ràng buộc**.

### 1.4 Áp lực CPU — và thủ phạm không phải Ultty

Cloud Monitoring, cửa sổ 7 ngày, `ALIGN_MAX` theo giờ (168 mẫu):
**max 101,2 % · p99 100,2 % · p95 96,0 % · trung vị 67,8 % · trung bình 72,6 %** của 2 vCPU.

Host **đang gần bão hoà CPU**, nhưng đó là toàn bộ 27 container. Phân rã trung bình theo project
(% của **một** core): `zalo-ultty-gd1-test` **50,57 %** (riêng ClickHouse 29,76 %, hatchet-postgres
7,13 %, hatchet-engine 3,29 %) · `zalo-ultty` 5,52 % · `zalo-amico` 5,46 % · `zalo-wata` 5,50 % ·
`zalo-transport-preview-gd1-test` 5,57 % · edge 0,51 %.

PSI của host: `memory.pressure some avg300=0.04`, `full=0.00` — **không hề thiếu RAM**;
`cpu.pressure some avg300=41.74` — thiếu CPU. Tức bài toán của VM hiện tại là **stack tham chiếu
gd1-test**, không phải khách nào.

### 1.5 Hatchet / observability — optional, không cộng mặc định

Đo được: `hatchet-*`, `clickhouse`, `otel-collector` **chỉ tồn tại trong `zalo-ultty-gd1-test`**.
Stack `zalo-ultty` production **không có** container nào trong số đó. Theo yêu cầu Phase A mục 9,
chúng nằm ngoài sizing của Ultty production.

### 1.6 Flowise — 63 % bộ nhớ cho một thành phần gần như không được gọi

`PARSER_MODE=deepseek` trên stack Ultty đang chạy. Log `zalo-ultty-flowise-1`: lần gọi
`POST /api/v1/prediction/...` **cuối cùng là 20/08/2026**; từ đó tới nay chỉ còn vài
`POST /api/v1/auth/resolve`. Trong khi đó nó chiếm **560 MB hiện tại / 1.004 MB đỉnh** = 63 % bộ nhớ
của cả stack.

Tài liệu này **không tắt Flowise trên live** và không đề nghị làm vậy trong Issue #224. Nó chỉ ghi
cả hai hồ sơ để chủ sở hữu quyết định riêng.

### 1.7 Ma trận sizing

Nền: OS + `dockerd` ≈ **480 MB** (đo: host dùng 6.033 MB, tổng RAM hiện tại của 27 container
5.551 MB). Lấy tròn **600 MB** cho an toàn.

| Cấu hình | Ultty **không** Flowise (545 MB đỉnh + 600 MB nền) | Ultty **có** Flowise (1.549 MB + 600 MB) |
|---|---|---|
| 2 vCPU / 2 GB | **MARGINAL** — dư ~0,85 GB, hẹp khi deploy/kéo image | **FAIL** — vượt |
| **2 vCPU / 4 GB** | **PASS** — dư ~2,85 GB | **PASS** — dư ~1,85 GB |
| 4 vCPU / 4 GB | PASS — CPU thừa nhiều | PASS |
| 4 vCPU / 8 GB | PASS nhưng **thừa**, không có dữ liệu nào biện minh |

CPU: nhu cầu trung bình đo được **0,06 vCPU**. Kể cả nhân 10 lần cho đỉnh vẫn là 0,6 vCPU — 2 vCPU
dư lớn.

> **Giới hạn của phép đo này, nói thẳng:** cgroup cho CPU *tích luỹ*, không cho *đỉnh tức thời*.
> Trong cửa sổ đo, stack Ultty gần như không có tải (`docker logs --since 168h` của `api` trả về
> **0 dòng**). Vì vậy **không có số đỉnh CPU đo được cho Ultty**, và tài liệu này không bịa ra một
> số. Kết luận 2 vCPU dựa trên: trung bình 17–24 ngày + biên độ 30× + tính chất tải (10–20 đơn/ngày,
> mỗi đơn một lần gọi LLM ngoài tiến trình).

---

## 2. Hiện trạng backup — hai sai lệch phát hiện khi đo

**(a) Ultty production đang chạy `backup.sh` CŨ.** `sha256` trên VM: `zalo-ultty/backup.sh` =
`00e243d1…`, `zalo-wata/backup.sh` = `742ce54e…`. Bản của Ultty ghi vào tiền tố legacy
`gs://…-backups/daily/`, **dùng chung với `amico`**; bản của wata ghi vào `stacks/wata/`.

Hệ quả đo được: `stacks/` chỉ có `transport-preview-gd1-test/`, `ultty-gd1-test/`, `wata/` — **không
có `ultty/`**. Thư mục `daily/` có đúng 7 mục, **xen kẽ hai stack mỗi ngày** (vd `20260905T191848Z`
của ultty và `20260905T192601Z` của amico). Tức **Ultty thực nhận ~3,5 đêm retention thay vì 7** —
đúng cái bug mà chú thích trong `deploy/netviet/backup.sh` mô tả là đã sửa. **Bản sửa chưa bao giờ
tới stack Ultty.**

**(b) Backup nằm cùng miền sự cố với VM.** Đích là bucket GCS **trong chính project GCP đang chạy
VM**, và **không mã hoá phía client**. Vi phạm bất biến 1 và 2 của Phase C.

Phụ: `MEDIA_BUCKET` = chính bucket backup, nên ảnh khách (có PII) và bản sao lưu chia chung một
bucket, một miền sự cố.

---

## 3. Nghiên cứu thị trường — giá đọc từ trang chính thức, 07/09/2026

**Tỷ giá** (Vietcombank, bảng ngày 07/09/2026, cập nhật 06/09/2026 23:00 +07, đối chiếu khớp giữa
`portal.vietcombank.com.vn/.../pXML.aspx?b=10` và `vietcombank.com.vn/api/exchangerates`):
**USD bán ra = 26.255 ₫** · **EUR bán ra = 31.071,21 ₫**.

### 3.1 Máy chủ, mục tiêu 2 vCPU / 4 GB

| Nhà cung cấp · gói | Vị trí | Đĩa | Băng thông | IPv4 | Giá/tháng | Quy đổi ₫ | VAT |
|---|---|---|---|---|---|---|---|
| **iNET · Turbo Cloud Server 4** | HN/HCM | 40 GB **NVMe** | 300 Mbps, không giới hạn lưu lượng | kèm | **319.000 ₫** | 319.000 | chưa gồm |
| iNET · Cloud Server Linux 4 | HN/HCM | 60 GB SSD | 200 Mbps | kèm | 299.000 ₫ | 299.000 | chưa gồm |
| Nhân Hoà · NVMe VPS C | VN (DC Viettel/FPT) | 55 GB NVMe | — | kèm | 321.000 ₫ (3 core/4 GB) | 321.000 | không nêu |
| Viettel IDC · CS1 | Bắc/Nam | **20 GB** SSD | 300 Mbps | kèm | 614.000 ₫ | 614.000 | chưa gồm |
| Mắt Bão · CS4-Linux | HCM | 40 GB SSD Enterprise | — | kèm | 819.000 ₫ | 819.000 | chưa gồm, tối thiểu 3 tháng |
| OVHcloud · VPS-1 | **Singapore** | 40 GB NVMe | **500 GB rồi bóp còn 10 Mbps** | kèm | từ S$5,78 (~US$4,54) | ~119.200 | chưa gồm GST |
| Hetzner · CX23 | **chỉ EU** | 40 GB NVMe | 20 TB | +€0,50 | €5,49 + 0,50 | **186.117** | chưa gồm |
| Hetzner · CPX22 | Singapore | 80 GB NVMe | **1 TB** | +€0,50 | €26,49 + 0,50 | 838.612 | chưa gồm |
| Linode/Akamai · 4 GB | Singapore (đã xác nhận không phụ thu vùng) | 80 GB | 4 TB | kèm | US$24,00 | 630.120 | chưa gồm |
| Vultr · High Perf 2c/4GB | Singapore | 100 GB NVMe | 5 TB | kèm | US$24,00 | 630.120 | chưa gồm |
| DigitalOcean · `s-2vcpu-4gb` | SGP1 | 80 GiB SSD | 4 TiB | kèm | US$24,00 | 630.120 | chưa gồm |
| AWS Lightsail 4 GB | Singapore | 80 GB SSD | 4 TB | kèm | US$24,00 | 630.120 | chưa gồm |
| **GCP `e2-medium` (baseline)** | asia-southeast1 | +$0,11/GiB | tính riêng | +$3,65 | $30,17 + đĩa + IP | **≥1.032.300** | chưa gồm |
| **GCP `e2-standard-2` + 200 GB + IP (hiện trạng)** | asia-southeast1 | 200 GB pd-balanced | tính riêng | $3,65 | $86,00 | **2.257.930** | chưa gồm |

Khách hàng tự sở hữu máy chủ (on-prem): chi phí phần cứng một lần + điện/mạng; không định giá được
ở đây, nhưng `deploy/portable/` hỗ trợ đường này (§5) — đó chính là mục tiêu kiến trúc thứ hai.

### 3.2 Lưu trữ offsite (nhà cung cấp KHÁC máy chủ chính)

| Nhà cung cấp | Đơn giá | 10 GB | 50 GB | 100 GB | Tối thiểu lưu | Egress |
|---|---|---|---|---|---|---|
| **Backblaze B2** | $6,95/TB/th = $0,00695/GB | **0 ₫** (10 GB đầu miễn phí) | **7.299 ₫** | **16.423 ₫** | **không có** | miễn phí tới 3× dung lượng lưu |
| Cloudflare R2 | $0,015/GB | 0 ₫ (10 GB free) | 15.753 ₫ | 35.444 ₫ | không (hạng Standard) | **miễn phí hoàn toàn** |
| Hetzner Storage Box BX11 | €3,20 cho 1 TB | 99.428 ₫ | 99.428 ₫ | 99.428 ₫ | không | không giới hạn |
| Wasabi | $7,99/TB | 209.777 ₫ | 209.777 ₫ | 209.777 ₫ | **90 ngày** | theo fair-use |
| GCS Standard (asia-southeast1) | $0,020/GiB | 5.251 ₫ | 26.255 ₫ | 52.510 ₫ | không | **$0,12/GiB** |
| AWS S3 Standard (ap-southeast-1) | $0,025/GB | 6.564 ₫ | 32.819 ₫ | 65.638 ₫ | không | $0,12/GB |

---

## 4. Quyết định

### Khuyến nghị — **iNET Turbo Cloud Server 4 (Việt Nam) + Backblaze B2**

| Khoản | 10 GB backup | 50 GB | 100 GB |
|---|---|---|---|
| Máy chủ 2 vCPU / 4 GB / 40 GB NVMe | 319.000 ₫ | 319.000 ₫ | 319.000 ₫ |
| VAT 10 % | 31.900 ₫ | 31.900 ₫ | 31.900 ₫ |
| IPv4 | kèm — 0 ₫ | 0 ₫ | 0 ₫ |
| Snapshot của nhà cung cấp | kèm — 0 ₫ | 0 ₫ | 0 ₫ |
| **Offsite Backblaze B2** | 0 ₫ | 7.299 ₫ | 16.423 ₫ |
| **TỔNG all-in** | **350.900 ₫** | **358.199 ₫** | **367.323 ₫** |

**≤ 500.000 ₫/tháng: ĐẠT ở cả ba kịch bản**, và nằm trong khoảng mong muốn 300–450k.

Kịch bản thực tế của Ultty là **10 GB** (dữ liệu nghiệp vụ đo được 88 MB; một bản dump ~1,2 MB/đêm,
restic khử trùng lặp, 7 daily + 4 weekly + 3 monthly vẫn dưới 1 GB).

**Vì sao iNET, không phải rẻ hơn:**
- Là phương án Việt Nam **duy nhất khớp đúng 2 vCPU/4 GB/40 GB NVMe** trong nghiên cứu.
- Dữ liệu ở trong nước — phù hợp Luật BVDLCN 91/2025/QH15 + NĐ 356/2025 mà CLAUDE.md nêu, và tránh
  câu hỏi chuyển dữ liệu xuyên biên giới.
- Độ trễ tới đại lý/Sale ở Việt Nam là thấp nhất.

**Rủi ro của iNET, ghi rõ:** dịch vụ **unmanaged**, **không có backup phía nhà cung cấp** (snapshot
tự phục vụ, cùng miền sự cố) — nên backup offsite ở §5 **không phải tuỳ chọn mà là bắt buộc**. SLA
99,99 % công bố ở mức giá này cần đối chiếu văn bản SLA trước khi tin. Công ty nhỏ hơn Viettel/Mắt
Bão đáng kể.

### Dự phòng — **Hetzner CX23 (Đức) + Backblaze B2** = 186.117 ₫ + 0–16.423 ₫

Rẻ nhất trong nhóm đã kiểm, 20 TB băng thông. Đánh đổi: **độ trễ EU↔VN ~250–280 ms** và dữ liệu ra
ngoài lãnh thổ. Chỉ dùng nếu chấp nhận cả hai. **CX không có ở Singapore** — đã xác nhận trên ma
trận vị trí của Hetzner; bản Singapore là CPX22 giá €26,49 (838.612 ₫), **vượt trần**.

Dự phòng trong nước: **iNET Cloud Server Linux 4** (299.000 ₫, 60 GB SSD) — rẻ hơn và nhiều đĩa
hơn, đổi lại SSD thay vì NVMe.

### Loại — và lý do

| Loại | Lý do |
|---|---|
| Vultr / DigitalOcean / Linode / Lightsail | US$24 = 630.120 ₫, **vượt trần trước cả khi cộng backup** |
| Hetzner CPX22 Singapore | €26,99 = 838.612 ₫; giá SG tăng 66 % từ 15/06/2026, băng thông 1 TB (EU là 20 TB) |
| Viettel IDC CS1 | 614.000 ₫ và **chỉ 20 GB đĩa**; backup là sản phẩm bán riêng |
| Mắt Bão CS4 | 819.000 ₫, tối thiểu 3 tháng; SLA/IOPS tốt nhất nhóm nhưng vượt trần 1,6× |
| OVHcloud VPS-1 | Rẻ nhất Singapore **nhưng 500 GB rồi bóp còn 10 Mbps**, và **không công bố giá gia hạn**. Cần xác nhận hai điểm này trước khi dùng |
| Wasabi | **Sàn 1 TB** (209.777 ₫ dù chỉ dùng 100 MB) + tối thiểu lưu **90 ngày** — xung khắc trực tiếp với `restic forget --prune` |
| Oracle Cloud Always Free | Tài liệu Oracle nói rõ: có thể "out of host capacity", và **instance nhàn rỗi bị thu hồi**. Không phải nơi đặt production |
| Giữ nguyên GCP `e2-standard-2` | 2.257.930 ₫/tháng = **4,5× trần**, cho một khối tải dùng 0,06 vCPU |
| Nhân Hoà | Không có gói đúng 2 core/4 GB; RAM chỉ đạt mức quảng cáo khi trả trước 12 tháng — tín hiệu overselling |
| VNG Cloud / GreenNode | **Không đọc được giá** từ nguồn chính thức (đang đổi thương hiệu, calculator không phân giải) |

---

## 5. Bằng chứng chạy thật

Quy trình vận hành: [portable-host-runbook.md](../phat-trien/van-hanh/portable-host-runbook.md).
Log đầy đủ: Final Evidence của Issue #224.

Tóm tắt đã chứng minh trên **Ubuntu 24.04 sạch, không `gcloud`, không biến `GOOGLE_*`, không tới
được metadata GCE**:

1. `deploy/portable/install-host.sh` → Docker 29.8.0 + Compose v5.5.1 + restic 0.16.4.
2. Nạp image bằng **đường tar offline** (`docker save | docker load`) — không cần registry.
3. `render-secrets.sh` với `SECRET_BACKEND=file` → `secrets.env` 0600, **không gọi `gcloud`**.
4. `prisma migrate deploy` → 26 migration.
5. Bootstrap operator → đăng nhập `POST /auth/login` **201**, `/auth/me` **200**.
6. Đọc nghiệp vụ có xác thực: `/knowledge/products` → **19 sản phẩm** từ gói khách đã gieo.
7. `MEDIA_STORE=local`: ghi/đọc lại khớp sha256.
8. `deploy/portable/backup.sh` → kho restic **mã hoá phía client** trên MinIO (nhà cung cấp khác),
   **5,7 giây**.
9. Huỷ toàn bộ dữ liệu stack (`down --volumes`): 0 volume, 0 container.
10. `deploy/portable/restore.sh` → **13 giây**, vào target **cô lập** `restoredrill-drill`, đọc lại
    `Order=3, Product=19, Price=19, GlossaryEntry=10, ContentReadiness=19`.
11. Reboot host → systemd trở lại, `docker.service` active+enabled, **stack tự lên mà không chạy
    lệnh deploy nào**; volume và tệp media còn nguyên.

**Phân loại:** `PROVEN_LOCAL / NEEDS_PROVIDER_RUNTIME_PROOF` — chủ sở hữu chưa cấp credential cho
một VPS thật hay một bucket offsite thật, nên "nhà cung cấp khác" được mô phỏng bằng MinIO trên một
mạng riêng. Mọi đường mã đi qua là đường thật (S3 API, mã hoá restic, restore vào máy chủ mới).

---

## 6. Google còn lại ở đâu — theo tầng

| Tầng | Còn phụ thuộc GCP? | Ghi chú |
|---|---|---|
| `apps/`, `packages/` (ứng dụng) | **Không** | `MediaStore` đã trung tính (`none/local/gcs/s3`); không có gói `@google-cloud` nào; image là Debian 12, **không có `gcloud`** |
| `deploy/portable/` | **Không** — có contract test khoá | `portable-boundary.contract.test.mjs` đọc từng dòng lệnh và đỏ nếu `gcloud`/`gs://`/… quay lại |
| `deploy/providers/gcp/` | **Có, cố ý** | Hiện thực Secret Manager. GCP là **một nhà cung cấp**, vẫn hỗ trợ |
| `deploy/netviet/render-secrets.sh` | Mặc định GCP, **cắm được** | Tự ghim `SECRET_BACKEND=gcp-secret-manager` để stack đang chạy không đổi hành vi; host khách đặt `file` |
| `deploy/netviet/backup.sh` | **Có** | `gcloud storage cp`. Bản portable thay bằng restic; **chưa** thay trên live |
| `deploy/netviet/deploy-remote.sh` | **Có** | `gcloud compute scp/ssh` — chỉ là **phương tiện vận chuyển**, thay bằng `ssh`/`rsync` là đủ |
| `deploy/netviet/install-vm.sh` | **Có** | Cài Google Ops Agent — đúng cho VM GCP, không đúng cho máy khách |
| `.github/workflows/` | **Có** | WIF + Artifact Registry. Ngoài ranh giới runtime portable |

`deploy/netviet/deploy-stack.sh` — **735 dòng, toàn bộ logic rollout — không nhắc GCP một lần nào.**
Đó là lý do khoảng cách từ "chỉ chạy được trên GCP" tới "chạy trên Ubuntu bất kỳ" nhỏ hơn nhiều so
với giả định ban đầu của issue.

---

## 7. Việc chưa làm / ngoài phạm vi

- **Chưa cutover Ultty.** Xem `NO LIVE ULTTY CUTOVER PERFORMED` trong Final Evidence.
- **Chưa có bằng chứng trên VPS thật hay bucket offsite thật** (thiếu credential).
- **Chưa đo đỉnh CPU của Ultty** — không có tải trong cửa sổ đo; §1.7 nói rõ.
- **Chưa sửa `deploy/netviet/backup.sh` của live** sang restic; hai sai lệch ở §2 mới chỉ được *ghi
  nhận*, chưa vá trên stack đang chạy.
- **Chưa xác nhận giá gia hạn của OVHcloud** và **phí vị trí Singapore của Contabo** — hai con số
  không công bố công khai.
