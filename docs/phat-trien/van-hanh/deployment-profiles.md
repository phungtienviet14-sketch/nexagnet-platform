# Hồ sơ triển khai (deployment profiles) — hợp đồng của mặt phẳng điều khiển

> Đọc cùng [`ci-cd.md`](ci-cd.md) (7 bất biến) và
> [`checklist-go-live.md`](checklist-go-live.md) (hai công tắc đang khoá có chủ ý).
>
> Tệp nguồn: `deploy/netviet/deployment-profiles.mjs` ·
> `deploy/netviet/resolve-deployment-target.mjs` · `.github/deployment-targets.json`

## 1. Vấn đề mà cơ chế này giải

Trước 04/09/2026, `gd1-test` **không phải một môi trường** — nó là một đường đi cắm cứng vào
pilot ZCA của Ultty. Một khách xem trước thứ hai chỉ có hai lối, và cả hai đều sai:

- nới lỏng chính hồ sơ của Ultty, hoặc
- rơi xuống `preflight: standard`, **bỏ hẳn** bằng chứng CI trên đúng SHA của `main`.

Lối thứ hai không phải suy đoán. Trên `213af13`, bước phân giải của workflow **chấp nhận** một
dòng registry như dưới đây và trả về mã thoát 0:

```jsonc
{
  "tenant": "wata", "environment": "gd1-test", "stackSlug": "wata-gd1-test",
  "githubEnvironment": "gd1-test", "runtimeEnvironment": "dev",
  "target": "current-shared-vm", "preflight": "standard"
}
```

Hậu quả đo được của đúng dòng đó:

| Cột registry | Điều nó tắt |
|---|---|
| `preflight: standard` | `if:` của bước `Verify exact main SHA passed CI` thành `false` ⇒ bỏ **cả** phép kiểm `refs/heads/main` **lẫn** phép kiểm kết luận CI |
| `runtimeEnvironment: dev` | `deploy-ci.sh` bỏ toàn bộ khối preflight `gd1-test`, và `render-secrets.sh` để `AUTO_SEND` ở mặc định **`on`** |
| `runtimeEnvironment: dev` | `deploy-ci.sh` suy ra stack **`wata`** (stack đang chạy) chứ không phải `wata-gd1-test` mà registry khai — **chồng lấn volume** |

Ba cột độc lập nhau, không cột nào bắt buộc phải đồng ý với cột nào.

## 2. Hai luật giữ an toàn cho toàn bộ cơ chế

1. **Cổng suy ra từ MÔI TRƯỜNG, không bao giờ từ một cột registry.**
   `GATED_ENVIRONMENTS` (hiện là `['gd1-test']`) nằm trong mã nguồn. Một môi trường bị khoá cổng
   **từ chối** mọi hồ sơ không mang cổng đó, nên không dòng registry nào tự miễn trừ được.
2. **Hồ sơ khai các hệ thống con nó thật sự bật; hợp đồng bí mật được SUY RA từ khai báo đó.**
   Không hệ thống nào thừa hưởng một khoá chỉ vì một khách khác cần khoá ấy.

## 3. Danh mục hồ sơ — ĐÓNG

| Hồ sơ | Cổng | Môi trường → runtime | Khách | Flowise | Parser | Kênh | Preflight |
|---|---|---|---|---|---|---|---|
| `ultty-gd1-test` | `gd1-test` | `gd1-test` → `gd1-test` | chỉ `ultty` | có | `deepseek` | `zca` | `gd1-test-preflight` |
| `standard` | `standard` | `dev` → `dev`, `production` → `prod` | bất kỳ | có | `deepseek` | `zca` | — |

Một dòng registry gọi tên hồ sơ không có trong bảng này bị **từ chối trước** khi đọc bất kỳ
credential nào, build bất kỳ image nào hay chạm vào bất kỳ máy chủ nào (mã thoát 69).

## 4. Ma trận bí mật — TÊN, không bao giờ GIÁ TRỊ

Repo lưu **hợp đồng** của bí mật. Không giá trị nào nằm trong git, trong log, trong PR hay trong
fixture.

| Nhóm | Hệ thống con tiêu thụ | Hậu tố tên | Bắt buộc cho hồ sơ nào |
|---|---|---|---|
| Nền | Postgres của chính stack, API, đăng nhập operator | `postgres-admin-password`, `zalo-db-password`, `api-key`, `operator-password` | **mọi** hồ sơ (4) |
| Flowise | container `flowise` + DB của nó | `flowise-db-password`, `flowise-secretkey`, `flowise-admin-email`, `flowise-admin-password`, `flowise-jwt-secret`, `flowise-refresh-secret`, `flowise-session-secret`, `flowise-token-hash-secret` | hồ sơ có `subsystems.flowise` (8) |
| Parser DeepSeek | `PARSER_MODE=deepseek` | `deepseek-api-key` | hồ sơ có `subsystems.parser === 'deepseek'` (1) |
| Workflow engine | cụm Hatchet | `hatchet-db-password`, `workflow-dashboard-htpasswd` | chỉ khi `workflow_engine=on` lúc dispatch (2) |
| Quan sát | OTel Collector + ClickHouse | `otlp-ingest-token`, `clickhouse-writer-password`, `clickhouse-reader-password` | chỉ khi `observability_stack=on` lúc dispatch (3) |

Tên đầy đủ = `zalo-<stackSlug>-<hậu tố>`. **Tiền tố là STACK, không phải khách** — nên hai stack
không thể gọi tên cùng một bí mật, và không có đường lui nào từ bí mật thiếu của stack này sang
bí mật của stack kia.

**Con số 13 không phải bất biến kiến trúc.** Nó là chi phí ĐO ĐƯỢC của đúng một hồ sơ:
`ultty-gd1-test` = 4 nền + 8 Flowise + 1 DeepSeek. Một hồ sơ xem trước không bật Flowise và không
dùng LLM parser cần **4**.

Nguồn cấp: cả 13 tên hiện có đều do **người vận hành tạo tay** trong GCP Secret Manager
(`deploy.ps1` bootstrap), trừ `workflow-engine-token` do `bootstrap-workflow-engine.sh` sinh sau
lần deploy đầu.

## 5. Ma trận cách ly — hai stack `gd1-test` không đụng nhau ở đâu cả

Mọi tên dưới đây suy ra từ **một** nguồn duy nhất là stack slug
(`deploy/netviet/stack-identity.mjs`, bất biến #3 của [`ci-cd.md`](ci-cd.md)):

| Hạng mục | `ultty-gd1-test` | một stack xem trước |
|---|---|---|
| Stack slug | `ultty-gd1-test` | `<slug>-gd1-test` |
| Thư mục stack | `/srv/netviet/apps/zalo-ultty-gd1-test` | `/srv/netviet/apps/zalo-<slug>-gd1-test` |
| Compose project (⇒ **tên volume**) | `zalo-ultty-gd1-test` | `zalo-<slug>-gd1-test` |
| Volume Postgres nghiệp vụ | `zalo-ultty-gd1-test_postgres-data` | `zalo-<slug>-gd1-test_postgres-data` |
| Volume Flowise | `zalo-ultty-gd1-test_flowise-data` | `zalo-<slug>-gd1-test_flowise-data` |
| Mạng Docker | `zalo-ultty-gd1-test_backend` / `_data` | `zalo-<slug>-gd1-test_backend` / `_data` |
| Alias mạng | `api-…`, `web-…`, `flowise-…` | như trên, mang slug riêng |
| Tiền tố bí mật | `zalo-ultty-gd1-test-` | `zalo-<slug>-gd1-test-` |
| Tiền tố backup | `stacks/ultty-gd1-test` | `stacks/<slug>-gd1-test` |
| Tên miền | `operator-ultty-gd1-test.<ip>.sslip.io` | `operator-<slug>-gd1-test.<ip>.sslip.io` |
| Hatchet (nếu bật) | DB + secret mang slug | như trên |
| ClickHouse (nếu bật) | database `obs_ultty_gd1_test` | `obs_<slug>_gd1_test` |
| Danh tính khách lúc chạy | `TENANT_DIR` mount gói của chính stack | như trên |

Không có đường lui giữa các hồ sơ. Bài test
`deploy/netviet/deployment-profiles.contract.test.mjs` khẳng định **mọi** trường của
`resolveStackIdentity` đều khác nhau giữa hai stack, chứ không chỉ vài trường được liệt kê.

**Tên miền trần** vẫn thuộc về khách chính (bất biến #5): so sánh theo **stack slug**, nên stack
thứ hai — kể cả của chính Ultty — không bao giờ cướp được `operator.<ip>.sslip.io`.

## 6. Thêm một hồ sơ xem trước — cần đúng hai thay đổi

1. Một mục trong `DEPLOYMENT_PROFILES` (`deploy/netviet/deployment-profiles.mjs`) — mục
   `transport-preview-gd1-test` đã có: `flowise=false`, `parser=none`, `channel=none`, hợp đồng
   runtime ghim `mock`/`off`/`test`, và `preflightModule: 'gd1-test-baseline'`.
2. Một dòng trong `deployments` của `.github/deployment-targets.json` trỏ vào mục đó, cộng một
   lựa chọn `tenant` mới trong `.github/workflows/deploy-tenant.yml` (input đang là danh sách đóng).

Cả hai đều bị kiểm chặt: `environment: gd1-test` bắt buộc `gate: 'gd1-test'`, `runtimeEnvironment`
phải khớp bảng của hồ sơ, và `stackSlug` phải khớp quy tắc suy ra.

### Bốn chặn của tầng triển khai — C1–C3 đã gỡ, C4 còn lại

Bản đầu của tài liệu này ghi rằng cơ chế **biểu diễn** được một hồ sơ không Flowise / không LLM
nhưng tầng triển khai thì **chưa**. Ba trong bốn chặn đó đã được gỡ (#192 §3); chúng được ghi lại
ở đây vì mỗi cái là một *hình dạng lỗi* sẽ quay lại nếu ai đó "dọn dẹp" theo hướng ngược.

| Chặn | Trước | Nay |
|---|---|---|
| **C1** | `compose.yaml`: `api.depends_on.flowise: service_healthy`, service `flowise` **không** mang `profiles:` ⇒ Flowise luôn phải lên trước `api` | Flowise chuyển sang **`compose.flowise.yaml`**, một lớp phủ chỉ được `-f` vào khi `FLOWISE_ENABLED=on`. Không có lớp phủ thì **không ai tên `flowise`** để mà phụ thuộc. Với Ultty, bản hợp nhất ra **đúng** compose cũ (đối chiếu bằng `docker compose config`). |
| **C2** | `render-secrets.sh`: 13 lời gọi `secret` **vô điều kiện**, gồm `deepseek-api-key` | Hợp đồng bí mật **suy ra từ hệ thống con được bật**: `PROFILE_FLOWISE`/`PROFILE_PARSER`. Một hồ sơ xem trước đọc **đúng 4** tên; Ultty vẫn đọc đủ 13. |
| **C3** | `render-secrets.sh`: khối `gd1-test` ghim `TENANT_SLUG == 'ultty'` (exit 64) | Cổng **giữ nguyên sức**, chỉ đổi neo: tenant phải nằm trong `PROFILE_TENANTS`, và bốn giá trị runtime (`CHANNEL_MODE`/`PARSER_MODE`/`AUTO_SEND`/`DATA_CLASSIFICATION`) được ghim **từ hồ sơ**. Thiếu hồ sơ ⇒ **không render** (chặt hơn bản cũ). |
| **C4** | `.github/workflows/deploy-tenant.yml`: input `tenant` là `choice` đóng | **Còn lại** — thuộc về việc đăng ký một khách xem trước *sống*, cùng với dòng registry và gói khách. |

Vì sao **tách tệp** chứ không gắn `profiles:` cho chính service `flowise`: một service mang
`profiles:` vẫn là mục tiêu hợp lệ của `depends_on`, nên Compose sẽ hoặc kéo cả profile đó lên hoặc
từ chối — `profiles:` một mình nó không gỡ được ràng buộc, chỉ dời chỗ nó bung ra.

Ba tầng trên VM đọc **cùng một** phép suy ra (`deploy/netviet/stack-compose.sh`): `deploy-stack.sh`
(rollout), `backup.sh` (dump + restore-check chạy ngay sau mỗi lần deploy) và `health-check.sh`
(timer chạy mãi). Hai trong ba cái đó chạy lúc **không ai đang nhìn**, nên ba bản suy ra riêng sẽ
lệch nhau trong im lặng.

Kèm theo, hai script khởi tạo PostgreSQL không còn đòi `FLOWISE_DB_PASSWORD` bằng `:?`. Trước đây
một hệ thống con **không được bật** vẫn chặn được lớp lưu trữ nền tảng: `sync-passwords.sh` chạy ở
**mọi** lần deploy, nên một hồ sơ `flowise=false` sẽ chết ngay sau khi PostgreSQL vừa lên.

Đo bằng `deploy/netviet/deployment-profile-render.contract.test.mjs`: bài test **chạy thật**
`render-secrets.sh` với `gcloud` được thay bằng một bản ghi nhật ký tên secret, rồi đọc lại
`secrets.env` và mảnh cấu hình Caddy. Nó phát hiện được một lỗi thật ngay lần chạy đầu — hai tên tệp
đặt trong dấu huyền bên trong heredoc **không** được trích dẫn của `secrets.env`, tức bash đã *chạy*
chúng.

## 7. Ứng dụng có cần ZCA / DeepSeek không? — KHÔNG

Nền tảng đã có hợp đồng hạng nhất cho "khách này không cần parser và không cần kênh":

- `apps/api/src/app.module.ts` suy ra yêu cầu từ **capability của gói khách**: cần `parser` chỉ khi
  có `sales-order`, cần `channel` chỉ khi có `messaging`.
- `packages/shared/src/env.ts` bọc **mọi** phép đòi khoá parser trong `parserRequired`, nên
  `parser: false` làm cả nhánh `DEEPSEEK_API_KEY` lẫn `ANTHROPIC_API_KEY` không chạy.
- `apps/api/src/app.module.transport-core.boot.spec.ts` boot **một tiến trình Nest thật** với
  `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `FLOWISE_*` và `ZALO_BOT_TOKEN` đều bị **xoá**, rồi chạy
  trọn một vòng nghiệp vụ vận tải. Gói `transport-core` khai `capabilities: ['transport-core']`,
  `integrations: {}`.

Nói cách khác: phụ thuộc còn lại là **của tầng triển khai**, không phải của ứng dụng. Không được
tạo khoá DeepSeek giả hay dùng lại khoá của Ultty để đi vòng — đó chính là điều C1–C4 phải sửa.

## 8. Phát hiện kèm theo — `production` suy ra stack khác với registry khai

Đo trên `213af13`, **chưa sửa trong bản thay đổi này**:

| | Giá trị |
|---|---|
| Registry khai | `ultty/production` → `stackSlug: ultty` |
| Bước resolve của workflow kiểm | `resolveStackSlug('ultty', 'production')` = `ultty` ✔ **khớp** |
| `deploy-ci.sh` suy ra lúc chạy | từ `ENVIRONMENT` = `runtimeEnvironment` = **`prod`** ⇒ `resolveStackSlug('ultty','prod')` = **`ultty-prod`** |

`prod` **không** nằm trong `LEGACY_STACK_ENVIRONMENTS` (`['dev','production','legacy']`), nên một lần
deploy production qua workflow này sẽ dựng stack **mới** `zalo-ultty-prod` với volume trắng, thay vì
cập nhật stack đang chạy `zalo-ultty`. Chuỗi `ultty-prod` không xuất hiện ở bất kỳ đâu khác trong
repo, nên đây không phải một stack có chủ đích.

Cùng một gốc với lỗ hổng ở mục 1: **hai đường suy ra stack slug và không ai so sánh chúng**
(bất biến #3 của [`ci-cd.md`](ci-cd.md), đúng khuôn sự cố 17/08 ở §6.1).

**Cố ý KHÔNG sửa ở đây.** Sửa nó sẽ đổi *chỗ hạ cánh* của một lần deploy production — từ một stack
ma sang **stack thật của khách đang chạy**. Đó là một quyết định vận hành phải có người duyệt, không
phải hệ quả phụ của một bản vá control-plane; và Issue #186 §3 để production ngoài phạm vi. Cổng mới
vì thế **chỉ** áp cho môi trường bị khoá cổng, và `dev`/`production`/`legacy` giữ nguyên từng ký tự —
có bài test khoá điều đó (`rollout leaves ungated environments byte-identical`).

Hai đường đi tiếp, cần người chọn:

1. **Sửa nhãn** — đổi `runtimeEnvironment` của production thành `production`. Deploy production sẽ
   hạ cánh xuống `zalo-ultty` như registry khai. Phải kiểm trước xem `render-secrets.sh`/compose có
   chỗ nào đang trông vào chuỗi `prod` không.
2. **Thêm `prod` vào `LEGACY_STACK_ENVIRONMENTS`** — cùng kết quả về slug, nhưng mở rộng danh sách
   trỏ-vào-stack-đang-chạy, mà `stack-identity.mjs` cảnh báo là không được thêm nếu chưa đọc §8 của
   `ci-cd.md`.
