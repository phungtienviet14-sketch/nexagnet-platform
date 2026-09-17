# NORTHFLANK MIGRATION RECONNAISSANCE

> Khảo sát ngày 17/09/2026 trên `origin/main` = `e748305be49b4f6115a6c032b5be875670529f3a`.
> Phạm vi: **chỉ đọc**. Không sửa code, không đổi workflow, không đụng GCP. Không build và không
> chạy gì trên Northflank. Kết luận lấy từ mã nguồn và tài liệu Northflank; mục nào chưa kiểm
> được thì ghi **CHƯA XÁC MINH**.

## CURRENT MAIN

- `origin/main` = `e748305be49b4f6115a6c032b5be875670529f3a` (Merge PR #316).
- Hiện chỉ có một deploy target là `current-shared-vm` (VM `netviet`, project
  `netviet-host-968934832433`, zone `asia-southeast1-b`). Nó phục vụ cả 8 dòng deploy: ultty
  dev/gd1-test/production, transport-preview gd1-test, amico, wata. Xem
  [.github/deployment-targets.json](../../.github/deployment-targets.json).

## API

**build**

- Image: `docker build -f deploy/netviet/Dockerfile .`, context là gốc repo. Các bước bên trong:
  `corepack pnpm install --frozen-lockfile` → `pnpm --filter @netviet/api exec prisma generate` →
  `pnpm --filter @netviet/shared --filter @netviet/tenant --filter @netviet/api --filter @netviet/web build`
  ([Dockerfile](../../deploy/netviet/Dockerfile)).
- Build riêng API: build `@netviet/shared` và `@netviet/tenant` trước, sau đó chạy
  `tsc -p tsconfig.build.json`.

**start**

- CMD mặc định của image: `node apps/api/dist/main.js`. Lệnh này **không migrate** và không nạp
  OTel.
- Compose ghi đè CMD thành `sh -ec` gồm hai bước
  ([compose.yaml](../../deploy/netviet/compose.yaml)):
  1. `apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma`
  2. `exec node apps/api/dist/main.js`, hoặc thêm
     `--import ./apps/api/dist/observability/otel/otel-preload.js` khi `OTEL_TRACING=on`
- Web dùng chung image, chạy bằng
  `apps/web/node_modules/.bin/next start apps/web -p 3000 -H 0.0.0.0`.

**port:** API `3001` (biến `PORT`, Nest lắng nghe mọi interface), web `3000`.

**health**

- `GET /health` là endpoint `@Public()`. Nó luôn trả `200 {status:'ok', uptimeSeconds, channels?}`
  và **không kiểm DB** ([health.controller.ts](../../apps/api/src/health/health.controller.ts)).
  Dùng được cho liveness/readiness HTTP trên cổng 3001.
- `GET /health/media` phải qua auth và gọi thật vào kho ảnh, nên không dùng làm probe.

**required env**

Nhóm fail-fast lúc boot (production, `AUTH_MODE=session`), áp cho mọi tenant:

| Biến | Giá trị | Vì sao |
|---|---|---|
| `TENANT_DIR` | `/srv/tenant` | Loader ném lỗi nếu không có ([tenant.config.ts](../../packages/tenant/src/tenant.config.ts)). Image không chứa `tenants/`, nên cách `TENANT=<slug>` không dùng được |
| `NODE_ENV` | `production` | |
| `PERSISTENCE` | `prisma` | production + session bắt buộc ([env.ts](../../packages/shared/src/env.ts)) |
| `DATABASE_URL` | URI của addon | giá trị mặc định trỏ localhost |
| `AUTH_MODE` | `session` | mặc định là `api-key`, mà production thì đòi `API_KEY` |
| `SESSION_SECRET` | ≥32 ký tự | Trên VM giá trị này tính từ `API_KEY` ([render-secrets.sh](../../deploy/netviet/render-secrets.sh)) |

Theo capability của tenant:

- **Ultty:** `PARSER_MODE` mặc định là `deepseek`, nên `DEEPSEEK_API_KEY` phải khác rỗng. Nếu dùng
  `claude` thì cần `ANTHROPIC_API_KEY`; dùng `flowise` thì cần 3 biến `FLOWISE_*`. Kênh
  `bot`/`hybrid` cần `ZALO_BOT_TOKEN`. Production chạy `zca`/`hybrid` cần `ZALO_OPERATOR_ORIGIN`
  dạng https.
- **transport-preview:** không cần khóa parser hay kênh. Boot spec đã chứng minh bằng cách xóa hết
  các khóa đó
  ([app.module.transport-preview.boot.spec.ts](../../apps/api/src/app.module.transport-preview.boot.spec.ts)).

Không làm boot thất bại nhưng phải đặt tường minh vì giá trị mặc định sai cho Northflank:

- `PORT=3001`.
- `CORS_ORIGIN=https://<origin>`. Biến này còn dùng để kiểm Origin cho các mutation ở `/zalo`,
  `/groups`, `/settings`.
- `CHANNEL_MODE=mock`. Schema mặc định `mock` nhưng compose mặc định `zca`.
- **`AUTO_SEND=off`.** Compose và `render-secrets.sh` đều mặc định `on` ngoài gd1-test.
- `DATA_CLASSIFICATION=test`.
- `MEDIA_STORE=none`. Trên VM script tự đặt `gcs`.
- `WORKFLOW_ENGINE=off`, `OTEL_TRACING=off`, `ADVICE_COMPOSER=off`, `LOG_FORMAT=json`.
- `API_KEY` (≥16): boot không cần, nhưng worker gọi `internal/*` thì cần.
- `PUBLIC_BASE_URL`: thiếu thì ảnh catalog bị bỏ khi gửi Zalo.
- Các biến danh tính release (`RELEASE_*`, `DEPLOYMENT_ENVIRONMENT`) là tùy chọn.
- Riêng vận tải: `TRANSPORT_RUN_CLOSURE_SWEEP` và `TRANSPORT_FUEL_HANDOFF_DRAIN` mặc định **bật**
  (timer chạy trong tiến trình api).
- Không cần: `REDIS_URL`, `FLOWISE_*`, `CLICKHOUSE_*`, `OTEL_EXPORTER_*`.

**migration behavior**

- Code ứng dụng **không tự migrate**. `main.ts` không gọi migrate, và `PrismaService` chỉ kết nối
  khi có truy vấn đầu tiên ([prisma.service.ts](../../apps/api/src/config/prisma.service.ts)).
- Trên VM, migrate chạy **2 lần mỗi deploy**:
  1. Container `bootstrap` chạy migrate trước ([deploy-stack.sh](../../deploy/netviet/deploy-stack.sh)).
  2. `command` của api chạy lại migrate mỗi lần container start hoặc restart.
- Phải migrate xong **trước** khi api boot. Lý do: với `PERSISTENCE=prisma`,
  `KnowledgeService.onModuleInit` đọc DB ngay lúc boot
  ([knowledge.service.ts](../../apps/api/src/knowledge/knowledge.service.ts)).
- Sau migrate, pipeline còn chạy 3 script: `bootstrap-auth-user.mjs` (cần
  `PILOT_OPERATOR_USERNAME/NAME/PASSWORD`), `seed-tenant-knowledge.mjs`, `seed-transport-demo.mjs`.
  Cả ba đã nằm trong image và import từ `apps/api/dist`, nên chạy được như Job Northflank dùng
  cùng image.

## WORKERS

Entrypoint chung: `node apps/api/dist/workflow/worker-main.js`
([compose.yaml](../../deploy/netviet/compose.yaml)). Worker boot một module riêng, hẹp, và **không
cần `DATABASE_URL`**.

| Service | Template | Health | Ai xếp việc vào |
|---|---|---|---|
| `workflow-worker-v1` | `integration-handoff` v1 | 127.0.0.1:8085 | **Không có code sản phẩm nào**, chỉ harness IT. Compose cũng không đặt `WORKFLOW_DESTINATION_PROOF_ENDPOINT` |
| `workflow-worker-sales-handoff-v1` | `sales-handoff-followup` v1 | 127.0.0.1:8086 | `OrdersService` ([orders.service.ts](../../apps/api/src/orders/orders.service.ts)): chờ 90s rồi nhắc Sale qua `internal/sales-handoff` |

Worker nào thực sự bắt buộc:

- **transport-preview: không cái nào.** Gói không khai `workflowEngine`, nên worker sẽ thoát với
  `WORKFLOW_WORKER_ENGINE_UNSUPPORTED`
  ([workflow-worker.adapter.ts](../../apps/api/src/workflow/workflow-worker.adapter.ts)).
- **Ultty với `WORKFLOW_ENGINE=off`: không cái nào.** Production đang chạy đúng như vậy; handoff trả
  `skipped` và luồng Sale làm tay vẫn giữ nguyên.
- **Ultty cần parity với gd1-test:** về nghiệp vụ chỉ cần `sales-handoff-followup`. Nhưng cổng health
  của `deploy-stack.sh` đòi **cả hai** worker đang chạy.

Env tối thiểu để worker boot (thiếu thì thoát 1, không retry):

- `TENANT_DIR`, với `tenant.json` có `workflowEngine.adapter=hatchet`
- `WORKFLOW_ENGINE=on`
- `WORKFLOW_ENGINE_TOKEN` (tên biến lấy theo `credentialRef` của gói)
- `WORKFLOW_WORKER_VERSION=v1` (không có mặc định,
  [worker-registration.ts](../../apps/api/src/workflow/worker-registration.ts))
- `WORKFLOW_WORKER_TEMPLATE=sales-handoff-followup` (mặc định là `integration-handoff`)

Env vận hành: `WORKFLOW_ENGINE_HOST_PORT`, `WORKFLOW_ENGINE_TLS_STRATEGY` (bỏ trống thì SDK dùng
TLS), `WORKFLOW_ENGINE_NAMESPACE`, `WORKFLOW_WORKER_HEALTH_PORT`,
`WORKFLOW_DESTINATION_SELF_API=http://<api nội bộ>:3001/internal/sales-handoff`, `API_KEY`.

Health của worker:

- `/ready` trả 200 khi READY, hoặc DEGRADED chưa quá 30s. `/live` trả 200 khi tiến trình chưa
  STOPPED và chưa fatal ([worker-readiness.ts](../../apps/api/src/workflow/worker-readiness.ts)).
- Server health **nghe cứng `127.0.0.1`**
  ([worker-health.server.ts](../../apps/api/src/workflow/worker-health.server.ts)), nên probe
  HTTP/TCP từ ngoài container sẽ fail. Trên Northflank phải dùng **probe CMD**: liveness gọi `/live`,
  readiness gọi `/ready`.
- Không đặt liveness vào `/ready`: Northflank sẽ restart worker mỗi khi engine mất kết nối quá 30s,
  trong khi compose hiện không làm vậy.

## DATABASE

- Prisma 6.19, `postgresql`, `url = env("DATABASE_URL")`, không có `directUrl`
  ([schema.prisma](../../apps/api/prisma/schema.prisma)). Schema có 124 model, 5.755 dòng; có
  **56 migration**.
- Cần PostgreSQL ≥13 vì:
  - `CREATE EXTENSION btree_gist` trong 3 migration
    ([20260830140000_transport_costing](../../apps/api/prisma/migrations/20260830140000_transport_costing/migration.sql))
  - `EXCLUDE USING gist`, trigger plpgsql, partial unique index
  - `pg_advisory_xact_lock` ([price-periods.service.ts](../../apps/api/src/settings/price-periods.service.ts))
- Repo đã đo thực tế: role không phải superuser nhưng là chủ DB tạo được `btree_gist` trên PG 16.15.
- Session đăng nhập lưu trong Postgres.
- Trên VM: `postgres:16-alpine`, role app `zalo` là chủ DB `zalo`. Hatchet dùng một **Postgres
  riêng**, bản 15.6.
- Northflank (theo docs): PG 12–18, có `POSTGRES_URI` và bộ biến `_ADMIN`, TLS tùy chọn, cho phép
  `CREATE EXTENSION`.
- **CHƯA XÁC MINH:** user thường của addon có tạo được `btree_gist` không; `sslmode` trong URI;
  giới hạn kết nối và dung lượng của gói free.

## REDIS

**Không dùng lúc chạy.**

- Không có `ioredis`/`redis`/`bullmq` trong dependency, và stack deploy không có container Redis.
- Dấu vết còn lại chỉ là: trường `REDIS_URL` trong schema (có mặc định, chỉ validate là URL), Redis
  trong `docker-compose.yml` cho dev local, và dòng chú thích "(BullMQ)" trong `.env.example`.
- Hatchet dùng `SERVER_MSGQUEUE_KIND=postgres`.
- Northflank không cần Redis.

## HATCHET

**Phía API** (dispatcher tick mỗi 5s, lease 60s, outbox nằm trong Postgres nghiệp vụ) đọc các biến
sau ([workflow.module.ts](../../apps/api/src/workflow/workflow.module.ts)):

- `WORKFLOW_ENGINE`: chỉ đúng chuỗi `on` mới bật.
- `WORKFLOW_ENGINE_TOKEN`: lấy qua `credentialRef`.
- `WORKFLOW_ENGINE_HOST_PORT`: VM ghi cứng `hatchet-engine:7070`.
- `WORKFLOW_ENGINE_TLS_STRATEGY`: VM đặt `none`.
- `WORKFLOW_ENGINE_API_URL`: REST nội bộ. Thiếu biến này thì gọi REST ăn 401 qua domain công khai.
- `WORKFLOW_ENGINE_DASHBOARD_URL`, `WORKFLOW_ENGINE_NAMESPACE`.

Client khởi tạo tường minh bằng `HatchetClient.init({token, host_port, api_url, namespace, tls_config})`,
**không đọc `HATCHET_CLIENT_*`**
([hatchet-workflow-engine.adapter.ts](../../apps/api/src/workflow/hatchet/hatchet-workflow-engine.adapter.ts)).
API vẫn boot được khi engine chưa lên.

**Engine trên VM** (chỉ gd1-test, v0.101.27), chạy theo thứ tự:

1. `hatchet-postgres`
2. Job `hatchet-migrate`
3. Job `quickstart`: sinh cấu hình và **khóa mã hóa** vào volume `hatchet-config`
4. `hatchet-engine` (gRPC 7070, probe `/ready` `/live` trên 8733)
5. `hatchet-dashboard` (80)

Token được đúc bằng `bootstrap-workflow-engine.sh` rồi đẩy vào Secret Manager. Mất volume
`hatchet-config` là mất khả năng giải mã dữ liệu engine.

## TENANT RUNTIME

- Image loại `tenants/` ([.dockerignore](../../.dockerignore)), nên luôn dùng `TENANT_DIR`, gắn
  chỉ-đọc từ ngoài image (bất biến #1/#2 trong [ci-cd.md](../phat-trien/van-hanh/ci-cd.md)).
  Loader ném lỗi ngay lúc boot nếu thiếu tệp hoặc sai schema.

| Tiến trình | ultty | transport-preview |
|---|---|---|
| api | `tenant.json`, `data/knowledge.json` (bắt buộc), `content-manifest.json` + `demo-messages.json` (tùy chọn) | `tenant.json` |
| web | `tenant.json` | `tenant.json` |
| worker | `tenant.json` | — |
| job seed | `tenant.json` + `data/knowledge.json` | `tenant.json` + `data/demo-month.json` |

- Kích thước: gói ultty khoảng 115 KB; transport-preview khoảng 28 KB phần cần thiết. Northflank có
  tính năng **secret files** gắn tệp vào một đường dẫn (docs); giới hạn kích thước **CHƯA XÁC MINH**.
- Phụ thuộc đĩa bền:
  - **zca:** tệp phiên đăng nhập, allowlist nhóm và `zalo-qr.png` được ghi vào thư mục của
    `ZALO_CRED_PATH` ([zalo-user.client.ts](../../apps/api/src/channels/zalo-user.client.ts)). Chạy
    `zca`/`hybrid` bắt buộc có volume; chạy `mock` thì không cần.
  - **Cấu hình thông báo** (kể cả mật khẩu SMTP) nằm ở tệp `${DATA_DIR:-/app/data}`
    ([notification-settings.repository.ts](../../apps/api/src/notifications/notification-settings.repository.ts)).
    Trên VM thư mục này **cũng không được mount**, nên cấu hình đã bị mất sau mỗi lần deploy từ trước
    tới nay. Đây là lỗi có sẵn, không riêng Northflank.
  - Boot với kênh `mock` không cần đĩa bền nào.
- API chứa nhiều tiến trình kiểu singleton (ZcaListener, BotPoller, CampaignScheduler,
  WorkflowScheduler, 2 timer vận tải), nên **giữ api ở 1 instance**.

## MEDIA

- Có cổng `MediaStore` với 4 hiện thực: `none` / `local` / `gcs` / `s3`
  ([media.provider.ts](../../apps/api/src/media/media.provider.ts)).
- **`s3` thực sự tương thích S3:** dùng AWS SDK v3 với `endpoint` tùy chọn, `region` mặc định `auto`,
  khóa tĩnh, `forcePathStyle` ([s3-media.store.ts](../../apps/api/src/media/s3-media.store.ts)).
  Chưa có bằng chứng chạy thật với R2/B2.
- **Stack GCP hiện không dùng `s3`.** `render-secrets.sh` tự đặt `gcs`, và `GcsMediaStore` xác thực
  bằng ADC ([gcs-media.store.ts](../../apps/api/src/media/gcs-media.store.ts)) nên chỉ chạy được
  trên máy có danh tính GCP.
- Byte ảnh đi qua API, không dùng presigned URL. Chứng từ vận tải dùng cùng kho này; khi chọn `none`
  thì upload bị từ chối nhưng không chặn boot.
- Ảnh catalog không đi qua `MediaStore` mà đọc từ `CATALOG_DIR`. Image **đang chứa sẵn
  `/app/catalog-assets`** (102 tệp, 4 MB, không bị `.dockerignore` loại;
  `image-isolation.contract.mjs` cũng không kiểm). Điều này lệch với bất biến #1 ("image không mang
  dữ liệu của khách nào"). Chỉ ghi nhận, không thuộc phạm vi task này.

## DOCKER IMAGE

- **Dùng nguyên `deploy/netviet/Dockerfile` cho API trên Northflank được.** Dockerfile không giả định
  gì về GCP: base `node:22-bookworm-slim` ghim digest, không có ENTRYPOINT/EXPOSE, chạy bằng root. CI
  đang build nó.
- **Image chứa cả web lẫn api** (`node_modules` đầy đủ kèm devDeps, cùng `deploy/`, `tools/`,
  `docs/`). Chỉ cần ghi đè CMD (Northflank hỗ trợ theo docs) là cùng một image chạy được api, web,
  worker và các job migrate/seed.
- Các giả định kiến trúc, không phải của GCP mà của mô hình "VM + edge":
  1. Build nướng `NEXT_PUBLIC_API_URL=""` ([api-base.ts](../../apps/web/lib/api-base.ts)), nên trình
     duyệt gọi API cùng origin. Repo không có rewrites trong Next; việc định tuyến path do Caddy làm
     ([Caddyfile](../../deploy/netviet/edge/Caddyfile)). Bản `hf-demo` có overlay rewrites nhưng
     danh sách path đã lỗi thời.
  2. Cookie phiên chỉ gắn host, `SameSite=lax`, `secure` + `trust proxy 1`
     ([session-bootstrap.ts](../../apps/api/src/auth/session-bootstrap.ts)).
  3. Build và chạy phải cùng kiến trúc CPU (argon2, sharp, prisma engine).
- **Không cần Dockerfile mới**, chỉ cần cấu hình triển khai mới. Nên build ở GitHub Actions rồi deploy
  theo digest, vì giới hạn build của gói free không được công bố.
- RAM đo thực trên VM
  ([audit 23/08](../../tools/poc-workflow-engine/evidence/audit-vm-d7-23-08-2026.md)): api 90–116 MiB,
  web 87–126 MiB, postgres 60–65 MiB, cụm Hatchet khoảng 252 MiB. Worker chưa đo.

## GCP COUPLINGS

**A. Application runtime**

- **Coupling thật duy nhất trong code:** `MEDIA_STORE=gcs` (`gcs-media.store.ts`,
  `google-auth-library`, `MEDIA_GCS_ENDPOINT` trong `env.ts`). Chỉ có hiệu lực khi chọn `gcs`.
- Hồ sơ khai `runtime.mediaStore: 'gcs'`
  ([deployment-profiles.mjs](../../deploy/netviet/deployment-profiles.mjs)).
- Một số giá trị cấu hình được sinh từ IP tĩnh GCP qua sslip.io: `PUBLIC_BASE_URL`,
  `ZALO_OPERATOR_ORIGIN`, `CORS_ORIGIN`, và URL dashboard Hatchet.
- Các chỗ grep khác khớp chữ là dương tính giả (`EBADCSRFTOKEN`, `MAX_BROADCAST_TEXT`, chú thích).

**B. Deployment-only**

- `reusable-deploy-tenant.yml`: WIF, `setup-gcloud`, OS Login, `netviet-public-ip`.
- Registry target và resolver bắt buộc các trường `vmName/gcpProjectId/region/zone`
  ([resolve-deployment-target.mjs](../../deploy/netviet/resolve-deployment-target.mjs)).
- `deploy-ci.sh`: Artifact Registry, scp/ssh qua IAP.
- `deploy-remote.sh`, `deploy-stack.sh`, `stack-compose.sh`, `stack-identity.mjs`, `edge/`, `systemd/`.
- Preflight gd1-test và `collect-deployment-evidence.mjs` (SSH qua IAP).
- `deploy.ps1`, `install-vm.sh`, `setup-github-oidc.sh`, `rollback.sh`, `soak-test.sh`,
  `deploy-marketing.yml` (Cloud Run).

**C. Secrets / storage**

- Secret Manager `zalo-<stack>-*`, đọc bằng service account của VM (`render-secrets.sh`).
  `bootstrap-workflow-engine.sh` ghi token vào đó.
- GCS `gs://netviet-host-968934832433-backups`: backup/restore
  ([backup.sh](../../deploy/netviet/backup.sh)), báo cáo soak, bucket ảnh (prefix `media/`).
- Volume Docker cục bộ trên VM.

**D. Observability**

- Ops Agent ([install-vm.sh](../../deploy/netviet/install-vm.sh)).
- Log metric `netviet_health_failures` và alert RAM/disk/health
  ([deploy.ps1](../../deploy/netviet/deploy.ps1)).
- OTel Collector + ClickHouse **tự host, không phụ thuộc GCP**, nhưng cần thêm container và volume cho
  mỗi stack.

## BLOCKERS

1. **CỨNG – hạn mức gói free** (docs): 2 service, 2 job, 1 addon.
   - Stack tham chiếu cần api, web/edge, 2 worker, engine, dashboard (≈6 service) và 2 Postgres.
   - "API + worker + PostgreSQL" chỉ vừa khi bỏ web và bỏ engine, mà worker không có engine thì thoát
     theo thiết kế.
   - Chỉ có 1 addon nên chỉ **một stack** có Postgres riêng. Dùng chung addon cho nhiều stack là phá
     cách ly silo.
2. **CỨNG – Hatchet chưa có chỗ chạy.** Tự host cần engine, dashboard, Postgres riêng, 2 job và một
   volume cấu hình dùng chung. Volume Northflank mặc định chỉ gắn được vào 1 pod (single RW). Cần quyết
   định một trong ba:
   - tắt engine ở bước đầu;
   - dùng engine bên ngoài, việc này đổi mô hình "mỗi stack một engine";
   - dùng gói trả phí.
3. **CỨNG – web và API phải cùng origin.** Path-based routing của Northflank chỉ có trên **subdomain
   tùy chỉnh đã xác minh** (docs); sslip.io không dùng được. Tách web sang nhà cung cấp khác thì phải
   build lại với `NEXT_PUBLIC_API_URL` khác (vỡ nguyên tắc một image trung tính) và sửa
   cookie/CORS/CSRF.
4. **CỨNG cho parity Ultty** (không chặn transport-preview): zca cần volume. Mục parity còn thiếu duy
   nhất ("một tin `zca_listener` thật") nằm đúng ở đây. Thêm rủi ro đăng nhập Zalo từ IP mới, và mỗi
   tài khoản chỉ được một listener.
5. **CỨNG nếu cần lưu ảnh:** ngoài GCP không dùng được `gcs`. Chọn `none`, hoặc `s3` với bucket tương
   thích (chưa chứng minh chạy thật).
6. **CẦN KIỂM – addon Postgres:** `btree_gist` với user thường, `sslmode`, bản PG 16.
7. **CẦN KIỂM – probe worker:** chỉ dùng được CMD vì server nghe loopback.
8. **CẦN KIỂM – proxy phía trước:** nếu đặt Caddy sau ingress Northflank mà không cấu hình
   `trusted_proxies`, api sẽ thấy request là `http`. Khi đó cookie `secure` không được đặt và đăng nhập
   hỏng mà không báo lỗi. SSE `/events` cũng cần timeout ingress đủ dài.
9. **CẦN KIỂM – lộ route nội bộ:** `/internal/*` không được ra public. Nếu cổng api public trên
   `code.run` thì mọi route đều lộ. Docs cho phép tắt domain `code.run`.
10. **VIỆC BẮT BUỘC – control plane CD toàn hình dạng GCP:** registry target, preflight qua SSH,
    `docker compose exec`, Secret Manager, `SESSION_SECRET` tính từ `API_KEY`.
11. **VIỆC BẮT BUỘC – quan sát:** mất alert GCP. OTel/ClickHouse không vừa gói free, nên Historical
    Debug traces (đang CLOSED/RUNTIME-PROVEN) sẽ **hồi quy** ở bước đầu.
12. **ĐIỀU KIỆN CUTOVER production Ultty** (bất biến #5): ảnh catalog trong các tin Zalo đã gửi trỏ về
    `operator.35-187-235-82.sslip.io`. Host này phải tiếp tục phục vụ `/media/catalog/*` sau khi chuyển.

## MIGRATION PROPOSAL

Cách ánh xạ các nguyên tắc:

- **Không viết lại kiến trúc:** một image theo digest, mỗi vai trò chỉ khác CMD.
- **Postgres vẫn là nguồn sự thật nghiệp vụ:** mỗi stack một addon; migrate chạy bằng Job trước khi
  thay api.
- **Hatchet vẫn là nguồn sự thật durable execution:** outbox giữ trong Postgres; chỉ quyết định nơi
  chạy engine.
- **Cách ly tenant:** mỗi stack một project Northflank + addon + secret group + secret files gói khách,
  tên suy từ STACK SLUG.
- **GCP chạy song song** cho tới khi proof PASS.

| Pha | Nội dung | Proof PASS | Rollback |
|---|---|---|---|
| NF-0 | Quyết định: stack đầu là `transport-preview-gd1-test`; nơi chạy engine; routing (subdomain + path routing hay service Caddy); registry | Quyết định có văn bản | — |
| NF-1 | Addon PG16 + Job migrate + service api | `/health`=200, 56 migration, restart vẫn 200 | Xóa project |
| NF-2 | Service web + routing cùng origin (dùng lại danh sách `@api`, loại `/internal`) + Job bootstrap/seed | Đăng nhập + CSRF + SSE qua HTTPS; `deterministic-smoke.mjs` qua | Xóa project; GCP vẫn chạy |
| NF-3 | Engine + worker `sales-handoff-followup` (probe CMD) | Run hoàn tất và sống qua lần deploy api | `WORKFLOW_ENGINE=off` |
| NF-4 | `ultty-gd1-test`: DeepSeek, volume zca, media, OTel | 4 tín hiệu deploy + một tin zca thật | Dừng listener một bên, trả kênh về VM |
| NF-5 | CD song song (build ở GitHub Actions → deploy theo digest, giữ cổng exact-main CI và danh mục hồ sơ) | Deploy lặp lại được | Workflow GCP không đổi |
| NF-6 | Cutover từng stack; production Ultty sau cùng (dump/restore, giữ host sslip cũ) | Proof từng stack | Chuyển lưu lượng về VM |

## MINIMAL STEP TO GET `/health = 200` ON NORTHFLANK

Không sửa repo. Stack: `transport-preview-gd1-test`, vì đây là gói duy nhất boot được mà không cần khóa
parser hay kênh.

1. Lấy image build từ `deploy/netviet/Dockerfile` (không sửa) và ghi lại digest.
2. Tạo một project riêng và addon PostgreSQL 16. Với user runtime, chạy
   `CREATE EXTENSION IF NOT EXISTS btree_gist;` để kiểm quyền.
3. Tạo secret group:
   - `DATABASE_URL` = `POSTGRES_URI` của addon (thêm `?sslmode=require` nếu bật TLS)
   - `SESSION_SECRET` (≥32 ký tự), `API_KEY` (≥16 ký tự)
   - Secret file `/srv/tenant/tenant.json`, lấy từ `tenants/transport-preview/tenant.json`
4. Tạo Job `migrate` dùng cùng image, entrypoint `sh -c`:

   ```
   apps/api/node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma
   ```

5. Tạo service `api` dùng cùng image, CMD mặc định `node apps/api/dist/main.js`, 1 instance, cổng 3001
   HTTP. Env:

   ```
   NODE_ENV=production PORT=3001 TENANT_DIR=/srv/tenant PERSISTENCE=prisma
   AUTH_MODE=session DATA_CLASSIFICATION=test CHANNEL_MODE=mock AUTO_SEND=off
   ADVICE_COMPOSER=off MEDIA_STORE=none WORKFLOW_ENGINE=off OTEL_TRACING=off
   ADMIN_UI=off LOG_FORMAT=json DEPLOYMENT_ENVIRONMENT=gd1-test
   RELEASE_GIT_SHA=<sha> RELEASE_APP_DIGEST=<digest>
   CORS_ORIGIN=https://<domain>
   ```

   Probe: HTTP `GET /health` cổng 3001 cho cả readiness và liveness; startup probe cho phép vài chục
   giây.
6. Proof: probe xanh; `curl https://<host>/health` trả `200 {"status":"ok"}`; restart xong vẫn 200.

Muốn làm biến thể Ultty thì thêm secret file `data/knowledge.json`, một `DEEPSEEK_API_KEY` khác rỗng, và
migrate trước khi boot api.

## FILES THAT WOULD NEED CHANGE

**Bước `/health`: không sửa tệp nào trong repo.**

Các pha sau (chủ yếu thêm mới; giữ nguyên đường GCP cho tới khi proof PASS):

| Tệp | Lý do |
|---|---|
| `deploy/northflank/` (mới) | Project, addon, secret group/files, service, job, probe |
| Cấu hình path routing hoặc `deploy/northflank/edge/` (mới) + `deploy/netviet/caddy-route-contract.test.mjs` | Routing cùng origin; khóa danh sách route và phủ định `/internal/*` |
| `.github/deployment-targets.json`, `resolve-deployment-target.mjs`, `run-resolve-deployment-target.mjs`, `deployment-targets.contract.test.mjs` | Thêm loại target không phải VM |
| `deploy/netviet/deployment-profiles.mjs`, `stack-identity.mjs` (+ test) | `mediaStore: 'gcs'`; tên tài nguyên Northflank suy từ STACK SLUG; ánh xạ secret |
| `.github/workflows/deploy-northflank.yml` (mới) | CD song song, giữ cổng exact-main CI |
| `deterministic-smoke.mjs`, `smoke-test.mjs`, `report-deploy-signals.mjs` | Đang chạy trong container `bootstrap` qua `extra_hosts` |
| `apps/api/src/workflow/worker-health.server.ts`, `worker-main.ts` (tùy chọn) | Cho phép cấu hình host bind để dùng probe HTTP |
| `apps/api/src/notifications/notification-settings.repository.ts` (nên sửa) | Trạng thái nằm trong tệp không bền (lỗi có sẵn) |
| `apps/api/src/channels/zalo-user.client.ts` (tùy chọn) | Đưa phiên/allowlist zca ra khỏi đĩa |
| `.dockerignore`, `image-isolation.contract.mjs` | `catalog-assets` đang nằm trong image; cần người quyết |
| `ci-cd.md`, `reference-platform-stack.md`, `checklist-go-live.md`, `tech-radar.md`, `tong-quan.md`, `deploy/netviet/README.md` | Tài liệu theo từng pha |

Không đụng tới khi proof PASS: `deploy/netviet/compose.yaml` (dòng `name:` quyết định tên volume),
`render-secrets.sh`, `deploy-*.sh`, `edge/`, và cả hai workflow deploy.

## Nguồn Northflank đã đối chiếu

- [Pricing on Northflank (docs)](https://northflank.com/docs/v1/application/billing/pricing-on-northflank) · [Pricing](https://northflank.com/pricing)
- [Configure health checks](https://northflank.com/docs/v1/application/observe/configure-health-checks)
- [Add a persistent volume](https://northflank.com/docs/v1/application/databases-and-persistence/add-a-volume) · [Persistent storage in production](https://northflank.com/docs/v1/application/production-workloads/persistent-storage-in-production)
- [Use path-based routing](https://northflank.com/docs/v1/application/domains/use-path-based-routing) · [Link a domain to a port](https://northflank.com/docs/v1/application/domains/link-a-domain-to-a-port)
- [Deploy PostgreSQL on Northflank](https://northflank.com/docs/v1/application/databases-and-persistence/deploy-databases-on-northflank/deploy-postgresql-on-northflank)
- [Networking on Northflank](https://northflank.com/docs/v1/application/network/networking-on-northflank) · [HTTP/2 and gRPC support](https://northflank.com/changelog/introducing-http-2-and-grpc-support)
- [Upload secret files](https://northflank.com/docs/v1/application/secure/upload-secret-files) · [Override command or entrypoint](https://northflank.com/docs/v1/application/run/override-command-entrypoint)
