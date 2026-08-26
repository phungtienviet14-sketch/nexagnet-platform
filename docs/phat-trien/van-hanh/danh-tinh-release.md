# Danh tính bản phát hành (release identity)

> Trả lời đúng một câu hỏi: **tiến trình đang chạy code của commit nào?**
> Liên quan: [tin-hieu-deploy.md](tin-hieu-deploy.md) (4 tín hiệu deploy) · [debugging.md](debugging.md) (lần vết một nghiệp vụ chạy sai).

## Nguồn canonical

`/runtime/release.json` — bản ghi do tầng deploy sinh ra, mount `:ro` vào `api` và các
`workflow-worker-*`. Biến `RELEASE_MANIFEST_PATH` trỏ tới nó.

```json
{
  "tenant": "…", "environment": "gd1-test", "stack": "…", "target": "…",
  "gitSha": "<40 ký tự hex thường>",
  "appDigest": "…@sha256:…", "flowiseDigest": "…@sha256:…",
  "tenantSchemaVersion": 3, "workflowRunId": "…", "deployedAt": "2026-08-26T09:00:00Z"
}
```

**Không chứa bí mật.** File này đi vào container nghiệp vụ và được công cụ thu bằng chứng đọc lại,
nên nó chỉ mang danh tính. Có test khoá điều đó (`write-release-manifest.test.mjs`).

**Được ghi TRƯỚC khi stack lên** (`deploy-remote.sh` → `write-release-manifest.sh`, ngay trước
`deploy-stack.sh`), đúng **một lần** mỗi lần deploy. Hai điều này không phải chi tiết vặt:

- ghi *sau* `docker compose up` thì lúc container khởi động file còn là **bản phát hành trước** —
  hoặc chưa tồn tại, và Docker tạo một **thư mục** trùng tên làm hỏng cả mount lẫn lần ghi kế tiếp;
- ghi *lần hai* sau khi container đã lên là **vô hình** với nó: bind-mount neo vào **inode**, còn
  `mv` tạo inode mới — tiến trình sẽ giữ bản cũ vĩnh viễn.

## Dự phòng

Thiếu manifest → `RELEASE_GIT_SHA` (biến môi trường). Chạy local/CI không có gì cả → `unknown`.

Mọi câu trả lời đều **kèm tên nguồn** trong trường `source`:

| `source` | Nghĩa |
|---|---|
| `manifest` | canonical — đọc từ `release.json` |
| `env` | dự phòng — manifest chưa tới được tiến trình |
| `conflict` | hai nguồn nói hai commit khác nhau |
| `none` | không nguồn nào biết (bình thường ở local/CI) |

`gitSha` chỉ được chấp nhận khi là **SHA đầy đủ 40 ký tự hex**, ở mọi nguồn. Chuỗi cắt ngắn bị coi
như "nguồn này không biết".

## Lệch nhau

`source: 'conflict'` → `gitSha` = `unknown`, và cả hai giá trị được giữ trong `mismatch`.
**Không bên nào được chọn**: một permalink trỏ tới commit sai tệ hơn hẳn một dấu "không biết".

Tiến trình **không chết** vì điều này (quan sát không bao giờ được là điều kiện để nghiệp vụ chạy);
nó ghi một dòng `error` lúc boot. Cổng **cứng** nằm ở tầng deploy — `ROLLOUT` trong
`deploy-stack.sh` dừng lần deploy với mã `RELEASE_IDENTITY_MISMATCH`.

Bốn mã lý do phân biệt bốn hỏng hóc khác nhau, đừng gộp:

| Mã | Hỏng ở đâu |
|---|---|
| `RELEASE_DIGEST_MISMATCH` | container chạy **image** khác bản phát hành |
| `RELEASE_SHA_MISMATCH` | **biến môi trường** trong tiến trình sai |
| `RELEASE_MANIFEST_MISSING` | tiến trình **không đọc được** manifest (mount hỏng / thiếu đường dẫn) |
| `RELEASE_IDENTITY_MISMATCH` | **bản ghi** trong container nói commit khác |

## Kiểm chứng

Ba chân phải trùng nhau: **SHA kỳ vọng = manifest trong tiến trình = biến môi trường trong tiến trình**.

```bash
gcloud compute ssh netviet --zone asia-southeast1-a --command "cd /srv/netviet/apps/<stack> && sudo docker compose --env-file .runtime/secrets.env -f compose.yaml exec -T api sh -c 'printenv RELEASE_GIT_SHA; printenv RELEASE_MANIFEST_PATH; cat \$RELEASE_MANIFEST_PATH'"
```

Đọc **trong container**, không phải `sudo cat` trên host: file trên đĩa đúng không chứng minh được
tiến trình đọc được nó — đó chính là khe hở đã tồn tại suốt trước 26/08/2026.

Đường không cần SSH, đọc thẳng từ tiến trình (cần phiên đăng nhập):

```bash
curl -sS 'https://<operator-domain>/observability/traces?limit=1' | jq .release
```

Deploy tự kiểm cả hai pha: `deterministic-smoke.mjs` đối chiếu `EXPECTED_RELEASE_SHA` **trước** và
**sau** `--force-recreate`, nên một manifest bị thay dưới chân tiến trình sẽ lộ ra.
