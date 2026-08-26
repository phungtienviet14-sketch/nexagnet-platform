# Runbook — workflow engine (Hatchet) trên nền tảng Nexagnet

> Ngày: **22/08/2026** · engine ghim `v0.101.27` · SDK ghim `1.28.2`
> Quyết định & POC: [workflow-engine-evaluation.md](../../kien-truc/workflow-engine-evaluation.md)
> Bằng chứng ghim phiên bản: [version-gate-a.md](../../../tools/poc-workflow-engine/evidence/version-gate-a.md)
> Liên quan: [ci-cd.md](ci-cd.md) · [debugging.md](debugging.md) · [checklist-go-live.md](checklist-go-live.md)

## 0. Trạng thái — đọc trước khi làm bất cứ gì

| | |
|---|---|
| **Nền tảng** | ✅ đã có trong `apps/api/src/workflow/` — cổng, adapter, outbox, cầu nối, ràng buộc tenant |
| **Khách đang bật** | **KHÔNG CÓ AI.** Mọi gói khách hiện tại không khai `integrations.workflowEngine` ⇒ cổng là `DisabledWorkflowEngineAdapter`, dispatcher không khởi động |
| **Đã deploy lên VM** | **CHƯA.** Không container Hatchet nào chạy ngoài máy dev |
| **Workflow nghiệp vụ** | **CHƯA CÓ.** Khuôn duy nhất là `integration-handoff.v1` — trung tính, chưa gắn miền nào |

Nghĩa là: bật engine cho một khách là một **quyết định vận hành có chủ ý**, không phải hệ quả phụ
của một lần deploy.

---

## 1. Bất biến — vi phạm cái nào cũng là sự cố

1. **Một bản triển khai worker đăng ký ĐÚNG MỘT phiên bản khuôn.** Một container = một phiên bản code.
2. **Tên workflow của engine là `<key>.<version>`**, dấu **chấm**. Hatchet từ chối dấu hai chấm
   (`^[a-zA-Z0-9\.\-_]+$`) — và nó từ chối lúc **deploy**, không phải lúc review.
3. **Che dữ liệu TRƯỚC khi gọi engine.** `input` của run được engine lưu **nguyên văn** và hiển
   thị trên dashboard. Mọi payload đi qua `buildWorkflowInput` (danh sách trắng, ném khi vi phạm).
4. **Hatchet dùng Postgres RIÊNG.** Không bao giờ dùng DB nghiệp vụ của Prisma.
5. **Bí mật không nằm trong `tenant.json`.** Gói khách chỉ khai `credentialRef` = **tên biến môi trường**.
6. **Idempotency là của Nexagnet.** Hatchet tự công bố *at-least-once*; đừng hứa exactly-once ở đâu.
7. **Lịch sử run KHÔNG phải kho lưu trữ** — mặc định bị xoá sau 30 ngày (§6).
8. **Nhãn người đọc là tiếng Việt; định danh máy giữ nguyên tiếng Anh.** Xem §1.1.

### 1.1 Đặt tên: tiếng Việt trước, định danh giữ canonical

Quy tắc chung của cả Debug Control Plane, không riêng workflow:

> **Thứ con người nhìn** → tiếng Việt trước. **Thứ máy định tuyến** → giữ canonical technical
> identity. Song ngữ khi cần đối chiếu — nhãn tiếng Việt đứng cạnh khoá máy, không thay nó.

"Định danh" ở đây là thứ tham gia routing, đăng ký khuôn, `actionId`, retry, tra cứu run,
`operationKey`, tương thích phiên bản, hoặc **run đang chờ**. Đổi một trong số đó phải là một
**version migration** riêng, không phải một thay đổi hiển thị.

Nhãn tiếng Việt là platform-level (`apps/api/src/workflow/workflow-catalog.ts`) — không `if
tenant === '<khách>'`. Tên nghiệp vụ riêng của một khách, nếu sau này có, đến từ gói khách.

**Bề mặt nào của Hatchet nhận được tiếng Việt** (đo trên SDK `1.28.2` + dashboard `v0.101.27`,
26/08/2026 — không phải phỏng đoán):

| Bề mặt | Trường | Kết quả |
|---|---|---|
| Khuôn | `name` | **định danh** — `sales-handoff-followup.v1`, không dịch |
| Khuôn | `description` | ✅ tiếng Việt, dashboard render ở trang khuôn |
| Khuôn | `displayName` | ❌ SDK không có trường này |
| Bước | `name` | **định danh** (`actionId`) — `load-state`/`wait`/`recheck-mark`, không dịch |
| Bước | nhãn/mô tả riêng | ❌ `CreateBaseTaskOpts` chỉ có `name` |
| Run | `displayName` | ❌ `RunOpts` không có; tiêu đề run do engine tự sinh |
| Run | `additionalMetadata` | ⛔ **cố ý không dùng** — túi đó là danh sách trắng hình dạng định danh (`SLUG_LIKE`) trong `buildWorkflowMetadata()`; nhét văn bản tự do vào buộc phải nới lỏng chính cổng đang chặn PII |
| Log của bước | `ctx.logger` | ✅ mỗi bước tự in `[Bước] <nhãn tiếng Việt>`, hiện ở tab **Logs** của run |

Hệ quả phải nói thẳng khi báo cáo: **thẻ bước trên dashboard vẫn chỉ hiện chuỗi máy.** Muốn khác
đi thì phải nâng cấp hoặc fork frontend Hatchet — cả hai đều nằm ngoài phạm vi hiển thị.

### 1.2 Đường bấm sang một lần chạy

Route canonical của dashboard (đọc từ `frontend/app/src/router.tsx` tại thẻ `v0.101.27`):

```
<goc>/tenants/<tenantId cua Hatchet>/runs/<engineRunId>
```

`/runs/<id>` **không phải** một route — nó trả `404 Page not found` (đã xảy ra thật 26/08/2026).
`tenantId` ở đây là tenant **của Hatchet**, không phải khách của Nexagnet; nó được suy từ claim
`sub` của chính `WORKFLOW_ENGINE_TOKEN`, nên không stack nào phải khai thêm biến. Công thức nằm
một chỗ: `apps/api/src/workflow/workflow-run-dashboard.ts`.

---

## 2. Vòng đời triển khai một phiên bản khuôn workflow

Năm bước. Bước DRAIN là bước duy nhất **đo được** — đừng thay nó bằng "chờ cho chắc".

### REGISTER — đưa phiên bản mới lên
Worker mang code v2 khởi động và tự đăng ký `integration-handoff.v2` với engine.
**v1 VẪN CHẠY.** Đây là rolling deploy, không phải cắt điện.

Lúc này engine biết cả `integration-handoff.v1` lẫn `integration-handoff.v2`.
Run cũ (`.v1`) **không thể** đi lạc sang worker v2 — chúng không đăng ký chung action nào.

### ACTIVATE — cho khách dùng phiên bản mới
Sửa `tenants/<slug>/tenant.json`:
```json
{ "integrations": { "workflowEngine": { "bindings": [ { "key": "integration-handoff", "version": "v2" } ] } } }
```
Chỉ **run mới** đi v2. Run đang chạy vẫn ở v1, vì `workflowVersion` được **ghim lúc xếp hàng**
trong `WorkflowOutbox`, không phải đọc lại lúc gửi.

### DRAIN — chờ v1 cạn, có số đo
```
engine.countInFlight('integration-handoff', 'v1')   ->  phải bằng 0
```
Trên dashboard: lọc theo tên workflow `integration-handoff.v1`, trạng thái `RUNNING` + `QUEUED`.

**Nếu rút worker v1 khi số này > 0:** run cũ **NẰM CHỜ** (`RUNNING`, bước kế `QUEUED`). Không mất
dữ liệu, không chạy sai — chỉ đứng im cho tới khi có worker v1 quay lại. Đã kiểm bằng thí nghiệm
(⑨ trong `version-gate-a.md`).

### DEACTIVATE — bỏ phiên bản cũ khỏi gói khách
Xoá binding `v1` khỏi `tenant.json` (hoặc để `enabled: false`). Không còn run mới nào tạo trên v1.

### REMOVE — tắt worker v1
Chỉ sau khi DRAIN = 0. Lịch sử run v1 **không bị ảnh hưởng** (đã kiểm, ⑧).

### Khi nào phải lên phiên bản mới?
| Thay đổi | Cần `vN+1`? |
|---|---|
| Thêm một bước ở **cuối** | Không |
| Thêm trường mới vào output của một bước | Không |
| **Đổi nghĩa / xoá / đổi tên** một bước đang có | **CÓ** |
| Đổi thứ tự phụ thuộc giữa các bước | **CÓ** |
| Đổi hợp đồng đầu vào (`workflow-registry.ts`) | **CÓ** |

`operationVersion` là **trục khác**: tăng nó khi *ý nghĩa thao tác nghiệp vụ* đổi (ví dụ từ "tạo
đơn nháp" sang "tạo đơn chính thức"), vì lúc đó lần chạy cũ và mới **không được** coi là trùng nhau.

---

## 3. Workflow cũ / đổi tên / xoá — hành vi phải biết trước

| Tình huống | Chuyện xảy ra | Việc phải làm |
|---|---|---|
| Đổi tên khuôn | Tên cũ vẫn tồn tại trong engine cùng lịch sử; run mới đi tên mới | Coi như một phiên bản mới: REGISTER → DRAIN tên cũ → REMOVE |
| Xoá khuôn khỏi code | Worker mới không đăng ký nó nữa; run cũ chưa xong **nằm chờ vĩnh viễn** | **DRAIN trước khi xoá.** Không có ngoại lệ |
| Rollback bản deploy | Worker cũ quay lại và đăng ký lại phiên bản cũ ⇒ run đang chờ **chạy tiếp** | Đây là đường hồi phục hợp lệ, dùng được |
| Cron/lịch cũ còn treo | Hatchet vẫn tạo run cho tên đã đăng ký | Chưa dùng cron ở Nexagnet. Khi dùng: **xoá lịch trước khi DEACTIVATE** |

---

## 4. Mô hình bảo mật — self-host

### 4.1 Cách ly
- **Một instance Hatchet cho MỖI khách/môi trường**, khớp mô hình silo đang chạy. Không dựa vào
  `tenantId` của Hatchet làm biên cách ly.
- **Postgres riêng** cho engine. Không migrate bảng engine vào DB nghiệp vụ.
- Engine + dashboard + Postgres nằm trong **mạng nội bộ của stack**; chỉ dashboard được lộ ra
  ngoài qua edge, và phải có xác thực.

### 4.2 TLS — ranh giới quyết định là MẠNG, không phải chữ "production"

> **Sửa 23/08/2026 (quyết định Q2-A).** Bản trước viết `SERVER_GRPC_INSECURE=false` là *bắt buộc
> cho deployment thật*. Câu đó nói **đúng kết luận vì sai lý do**, và sai lý do thì sẽ được áp
> dụng sai chỗ. Lý do thật không phải "đây là production" — mà là **lưu lượng có rời một ranh
> giới host hay không**.

| Đường | TLS | Vì sao |
|---|---|---|
| Trình duyệt → dashboard | **TLS ở Caddy, bắt buộc** | đi qua Internet |
| api/worker → engine (gRPC) | **`none`** | **không rời** mạng Docker `internal: true` trên một VM |

**gRPC nội bộ chạy `insecure` là một quyết định đã cân nhắc, không phải nợ kỹ thuật.** Kẻ tấn công
muốn nghe được đường đó phải **đã có root trên VM** hoặc **đang thực thi mã trong một container
cùng stack** — tới lúc đó TLS không cứu được gì, vì token cũng nằm trong biến môi trường của chính
những container ấy. Đổi lại, TLS nội bộ thêm **hạn chứng chỉ** làm một chế độ hỏng mới mà **không
có gì giám sát nó**, và triệu chứng lúc hết hạn (mọi run treo) giống hệt "engine chết".

**Ranh giới mạng là điều kiện, nên nó được ÉP BẰNG TEST, không bằng lời hứa** —
`deploy/netviet/workflow-isolation.contract.test.mjs`:

- engine + Postgres của nó **không có** khối `ports:`;
- mạng `data` phải `internal: true` (bỏ `internal` đi ⇒ test ĐỎ, vì lúc đó lý do trên hết đúng);
- dashboard ra ngoài **chỉ** qua route Caddy có `basic_auth`;
- `SERVER_AUTH_COOKIE_INSECURE` phải là `"f"` trên cả ba service có cookie.

**Rủi ro tồn dư, nói thẳng:** một container bị chiếm **trong cùng stack** đọc được lưu lượng gRPC
tới engine. Chấp nhận, vì cùng kẻ tấn công đó đã đọc được `WORKFLOW_ENGINE_TOKEN` từ môi trường.
Muốn đóng nốt thì đi Q2-B (TLS nội bộ thật) — và **phải kèm giám sát hạn chứng chỉ**, nếu không nó
đổi một rủi ro đã biết lấy một sự cố định kỳ.

### 4.3 Token
- Token API của tenant Hatchet là **bí mật**: nằm trong Secret Manager, render vào `secrets.env`,
  và `tenant.json` chỉ trỏ tới **tên biến** qua `credentialRef`.
- ⚠️ **Khi thêm biến mới, phải liệt kê nó trong khối `environment:` của `compose.yaml`** — nếu
  không, biến được render mà **không bao giờ tới container**. Sự cố này đã xảy ra thật (commit
  `f4ed3ee`) và có hợp đồng test chặn: `deploy/netviet/secrets-passthrough.contract.test.mjs`.

### 4.4 RBAC dashboard (vai của Hatchet, `v1/user-roles.mdx`)

| Vai | Làm được gì | Cấp cho ai |
|---|---|---|
| `OWNER` | toàn quyền, đổi vai người khác | 1 người kỹ thuật chịu trách nhiệm |
| `ADMIN` | + quản lý thành viên, token API | kỹ thuật |
| `MEMBER` | + **trigger, replay, cancel**, quản lý cron/lịch | kỹ thuật |
| `VIEWER` | **chỉ đọc** | **Sale / vận hành nghiệp vụ** |

**Quy tắc: Sale nhận `VIEWER`.** Lý do không phải là mất lòng tin — mà là nút **Replay** trên
dashboard chạy lại **tác dụng phụ**, và Hatchet không biết gì về ba mức an toàn ở
`operation-key.ts`. Một lần bấm replay trên đích đến `idempotency: 'none'` là một đơn trùng.

Thêm một đòn bẩy: cờ **"Can view payloads"** tắt được cho `MEMBER`/`VIEWER` ⇒ ẩn `input`/`output`
của task. **Không thay được** việc che dữ liệu trước khi gọi engine (token của worker vẫn đọc
được payload, và `additionalMetadata` không nằm trong phạm vi cờ này) — nó là lớp phòng thủ thứ hai.

**Khoảng trống đã biết:** Hatchet không có vai "được cancel nhưng không được replay". Nếu Sale cần
huỷ một run, **không** nâng vai — mở một đường có kiểm soát qua API Nexagnet
(`WorkflowEnginePort.cancel`), nơi có thể kiểm quyền nghiệp vụ.

---

## 5. Ghim phiên bản engine

```
engine     ghcr.io/hatchet-dev/hatchet/hatchet-engine:v0.101.27
dashboard  ghcr.io/hatchet-dev/hatchet/hatchet-dashboard:v0.101.27
migrate    ghcr.io/hatchet-dev/hatchet/hatchet-migrate:v0.101.27
admin      ghcr.io/hatchet-dev/hatchet/hatchet-admin:v0.101.27
SDK        @hatchet-dev/typescript-sdk 1.28.2   (ghim CHÍNH XÁC, --save-exact)
```

**Không dùng tag trôi** (`latest`, `v0`). Hatchet đang ở dòng `0.x`.

Trước mỗi lần nâng: đọc changelog → kiểm migration → kiểm tương thích SDK ↔ engine → xác nhận
đường rollback → chạy lại `pnpm spike:versioned` trên bản mới (thí nghiệm ghim phiên bản là hợp
đồng quan trọng nhất, và nó chạy được bằng một lệnh).

---

## 6. Sao lưu & phục hồi

**Lịch sử thực thi là tài sản vận hành, không phải rác** — nếu mục tiêu là con người debug được.

- Sao lưu **Postgres của engine**, tách hoàn toàn khỏi sao lưu DB nghiệp vụ (`deploy/netviet/backup.sh`).
- ⛔ **VÀ PHẢI SAO LƯU VOLUME `hatchet-config` CÙNG LÚC — dump Postgres một mình nó KHÔNG phải là
  backup.** `/hatchet/config/server.yaml` giữ `encryption.masterKeyset` và
  `encryption.jwt.privateJWTKeyset`. **Đã đo 23/08/2026** trên chính `deploy/netviet/compose.yaml`:
  phục hồi dump mà **thiếu** volume này thì engine vẫn lên **Healthy**, DB vẫn đủ **182 bảng**, mà
  khoá là một khoá **khác hẳn** (`52fee191…` thay vì `d71d31b2…`) — tức mọi thứ đã mã hoá bằng khoá
  cũ thành rác và mọi token đã phát hết hiệu lực. **Một lần phục hồi XANH ra dữ liệu không đọc
  được** là chế độ hỏng nguy hiểm nhất ở đây, vì không có lỗi nào để mà thấy.
  Bằng chứng đầy đủ (cả ca dương lẫn ca âm):
  [backup-restore-d6-23-08-2026.md](../../../tools/poc-workflow-engine/evidence/backup-restore-d6-23-08-2026.md).
- Phục hồi, **đúng thứ tự**: `up hatchet-postgres` → `pg_restore` → **khôi phục volume
  `hatchet-config`** → `up hatchet-engine`. Bước config phải xong **trước** khi `hatchet-setup-config`
  chạy; `--overwrite=false` khi đó giữ nguyên khoá đã phục hồi (đã kiểm: sha khoá khớp tuyệt đối).
- Khởi động lại engine ở **đúng phiên bản image**. Ngược phiên bản engine so với schema đã migrate
  là một cách hỏng thật.
- `restore-check.sh hatchet <dump>` chạy trên **service `hatchet-postgres`** với user `hatchet`,
  không phải trên Postgres nghiệp vụ. **Giới hạn của nó:** chứng minh *dump đọc lại được*, **không**
  chứng minh *dữ liệu giải mã được* — phần đó do volume config quyết định.
- **Giới hạn phải biết:** `SERVER_LIMITS_DEFAULT_TENANT_RETENTION_PERIOD` mặc định **720h (30
  ngày)** — run ở trạng thái cuối **bị xoá**. Nên:
  - bản ghi **bền vững** nằm ở `AuditLog` + `WorkflowOutbox` của Nexagnet (`engineRunId`,
    `workflowKey@version`, `traceId`);
  - nếu khách cần giữ lâu hơn, **tăng biến này có chủ ý** và tính lại dung lượng.

---

## 7. Kế hoạch tài nguyên

Đo được từ POC (3 container chạy dài, lúc rảnh):

| Thành phần | RAM | Ghi chú |
|---|---:|---|
| Postgres của engine | ~221 MB | phần lớn chi phí |
| Dashboard | ~30 MB | |
| Engine | ~20 MB | |
| **Một instance** | **~270 MB** | + ~1,04 GB dung lượng image (dùng chung giữa các stack trên cùng VM) |
| Worker | **88–108 MiB** | container **RIÊNG** `workflow-worker-v1` — đo thật 24/08/2026, xem dưới |

> ⚠️ **SỬA 23/08/2026 — dòng Worker ở bảng trên trước đây ghi *"chạy trong tiến trình API hiện có,
> không thêm container"*. Câu đó đã LỖI THỜI** kể từ khi phiên 4 đảo quyết định. Worker nay là một
> **container riêng**, và lý do là một sự cố đo được chứ không phải sở thích kiến trúc:
> `deploy-stack.sh` chạy `up -d --no-deps --force-recreate api web` **mỗi lần deploy**. Worker nằm
> trong `api` thì mỗi lần deploy sẽ giết worker duy nhất đang phục vụ `.v1`, mọi run đang dở **nằm
> chờ vĩnh viễn**, và thủ tục DRAIN ở §2 trở thành **không thực hiện được** (không có cách nào giữ
> worker phiên bản cũ sống trong khi phiên bản mới lên).
>
> **✅ ĐÃ ĐO 24/08/2026 (D8) — worker `88–108 MiB`.** Số đo trên chính stack `ultty-gd1-test`
> sau khi `bootstrap-workflow-engine.sh` đúc được token, bằng `docker stats --no-stream`:
>
> | Container | Lần 1 (worker ~3 phút) | Lần 2 (sau khởi động lại, +45 giây) | Lần 3 (sau deploy xanh) |
> |---|---:|---:|---:|
> | `hatchet-postgres` | 240,4 MiB | 261,6 MiB | 263,8 MiB |
> | `hatchet-engine` | 36,2 MiB | 36,5 MiB | 37,8 MiB |
> | `hatchet-dashboard` | 25,0 MiB | 25,1 MiB | 26,0 MiB |
> | **Cụm engine** | **301,5 MiB** | **323,1 MiB** | **327,7 MiB** |
> | **`workflow-worker-v1`** | **91,5 MiB** | **108,1 MiB** | **88,7 MiB** |
> | **Tổng cả worker** | **393,0 MiB** | **431,2 MiB** | **416,4 MiB** |
>
> Ghi **một khoảng chứ không một con số** vì ba lần đo cách nhau vài phút đã lệch ~19 MiB —
> báo một con số duy nhất sẽ là *độ chính xác giả*. Lấy **~110 MiB/worker** khi lập kế hoạch
> (cận trên của khoảng, không phải trung bình: lập kế hoạch theo lần đo tệ nhất).
>
> **Không** suy ra từ container `api` — và nay có bằng chứng cho lời cảnh báo đó: đo cùng lúc,
> `api` = **117,9 MiB** còn worker = **91,5 MiB**. Mượn số của `api` sẽ thổi phồng ~29%.
>
> Số ~270 MB ở bảng trên là cụm engine (Postgres + engine + dashboard), **chưa gồm worker**. Đo
> lại 23/08 trên chính `deploy/netviet/compose.yaml`: **252 MiB** (205 + 28 + 19) — xem
> [backup-restore-d6-23-08-2026.md](../../../tools/poc-workflow-engine/evidence/backup-restore-d6-23-08-2026.md).
> Cụm trên VM thật (301–323 MiB) **cao hơn POC ~20–28%**: POC đo "lúc rảnh", còn đây là engine đã
> nhận đăng ký worker và có lưu lượng thật.

| Số stack bật engine | RAM thêm (cụm engine + **1 worker**) |
|---:|---:|
| 1 (`ultty/gd1-test`) | **~0,43 GB** |
| 2 | ~0,86 GB |
| 4 | ~1,72 GB |

> Bảng này trước đây ghi 0,27 / 0,54 / 1,08 GB — đó là cụm engine **chưa cộng worker**, tức thiếu
> ~40% cho mỗi stack. Số mới lấy từ lần đo 24/08 (cụm 323 MiB + worker 108 MiB ≈ 431 MiB).
> Thủ tục DRAIN ở §2 cho **hai** worker cùng sống (`v1` + `v2`) trong lúc nâng phiên bản khuôn,
> nên lúc chuyển phiên bản phải cộng thêm **~110 MiB** nữa cho stack đang nâng.
>
> Đo trên VM `netviet` lúc bật 1 stack (24/08): còn **3262 MB available** / 7936 MB, đĩa 39%.

**Trước khi deploy lên VM `netviet` phải kiểm bằng số thật**, không ước lượng:
```bash
free -m; df -h /; docker ps --format '{{.Names}}'; docker stats --no-stream
```
Cổng phải rời với các stack đang chạy. **Không** `force-recreate` edge — sự cố `2bdd930` đã cho
thấy tạo lại edge làm sập **mọi** khách, không chỉ khách đang deploy.

---

## 8. Ma trận hỏng — trạng thái đã kiểm

| Tình huống | Kiểm ở đâu | Kết quả |
|---|---|---|
| Commit nghiệp vụ xong / trigger hỏng | `workflow-dispatcher.spec.ts` | hàng còn `pending`, tick sau gửi |
| **Sập giữa commit và trigger** | `workflow-dispatcher.spec.ts` | **không mất** — hàng nằm trong DB |
| Bàn giao trùng | `workflow-dispatcher.spec.ts` + unique index | một hàng |
| Engine không dùng được | `workflow-dispatcher.spec.ts` | backoff, không mất, không quay vòng |
| Hai dispatcher đồng thời | `workflow-dispatcher.spec.ts` | chỉ một nhận |
| Worker (dispatcher) chết | lease `claimExpiresAt` | worker khác nhận lại |
| Worker engine chết giữa chừng | POC §6.3 (chạy thật) | bước đã xong **không** chạy lại |
| Retry / chờ / tiếp tục / huỷ | POC §6.2 (chạy thật) | ✅ |
| Replay không an toàn | `operation-key.spec.ts` | **BLOCKED** khi đích `idempotency: none` |
| Trùng tác dụng phụ ngoài | `operation-key.ts` | khoá thao tác + 3 mức |
| Run v1 trong lúc deploy v2 | `version-gate-a.md` (chạy thật) | **thuần v1** |
| Đổi tên / xoá khuôn | §3 runbook này | có thủ tục |
| Rò PII / bí mật vào input | `workflow-input.spec.ts` | **ném**, không che im lặng |
| Tương quan trace | `workflow-handoff.service.spec.ts` + POC §6.4 | traceparent đi trọn chuỗi |
| Khách không khớp | `workflow-handoff.service.spec.ts` | khoá thao tác khác nhau theo khách |
| Token engine sai | `workflow-engine.adapter.ts` | fail-fast, **không** âm thầm về `none` |
| Telemetry / audit hỏng | `workflow-handoff.service.spec.ts` | nghiệp vụ vẫn chạy |
| **Engine DB restart** | — | ⬜ **chưa kiểm** — xem §10 |

---

## 9. Rà soát bảo mật — mô hình đe doạ

| Mối đe doạ | Trạng thái | Chốt chặn |
|---|---|---|
| PII thô nằm trong Hatchet | ✅ chặn | danh sách trắng + ném, `workflow-input.ts` |
| Bí mật trong input | ✅ chặn | khoá + giá trị, tái dùng bộ dò của telemetry |
| Bí mật trong gói khách (git) | ✅ chặn | `credentialRef` chỉ nhận `^[A-Z][A-Z0-9_]*$` |
| Dashboard truy cập trái phép | ⚠️ **theo cấu hình** | phải có xác thực ở edge; Sale = `VIEWER` |
| Token chéo khách | ✅ theo thiết kế | mỗi khách một instance + một token |
| Rò token của worker | ⚠️ vận hành | Secret Manager; không log; `isSecretKey` che khi lọt vào telemetry |
| Kích hoạt workflow giả mạo | ✅ chặn | chỉ `WorkflowHandoffService` gọi được; module chỉ export cầu nối + cổng |
| **LLM chạy workflow tuỳ ý** | ✅ chặn theo thiết kế | **không** có `execute(anyWorkflow, anyPayload)`; không công cụ LLM nào chạm `WorkflowEnginePort` |
| Replay tạo tác dụng phụ trùng | ✅ có kiểu | 3 mức; `none` ⇒ BLOCKED, `verified` không mở được cổng |
| Khuôn cũ vẫn được lên lịch | ⚠️ thủ tục | §3; chưa dùng cron |
| Lệch phiên bản khuôn | ✅ chặn | ghim lúc xếp hàng + `WORKFLOW_VERSION_UNKNOWN` ném khi bản chạy không mang phiên bản đó |
| Postgres engine lộ ra ngoài | ⚠️ vận hành | chỉ mạng nội bộ, không publish cổng |
| gRPC không TLS | ⚠️ vận hành | mặc định adapter là **có** TLS |
| Metadata độc hại | ✅ chặn | 8 khoá cố định, kiểm khuôn |
| Rò qua log | ✅ | mọi giá trị đi qua `sanitizeTelemetry` |

---

## 10. Việc CHƯA làm — nói thẳng

1. **Chưa deploy lên VM.** Chưa có compose production cho Hatchet trong `deploy/netviet/`.
2. **Chưa có worker đăng ký workflow với engine.** `WorkflowEnginePort` **kích hoạt** được run,
   nhưng chưa có tiến trình nào đăng ký `integration-handoff.v1` và chạy các bước của nó. Đó là
   việc kế tiếp lớn nhất.
3. **Chưa xác nhận dashboard bằng mắt.** Lý do vẫn như POC §9.4: bước đó cần gõ mật khẩu, việc
   tôi không được phép làm. Danh sách kiểm 3 phút nằm ở POC §9.4.
4. **Chưa kiểm restart Postgres của engine.**
5. **Chưa có bản kiểm tích hợp Prisma cho outbox** (`.int.spec.ts` cần DB thật — cùng dạng
   `prisma-campaign.repository.int.spec.ts` hiện đang skip khi không có DB).
6. **Mã lý do quyết định của workflow chưa gộp vào `observability/decision-reasons.ts`** — file đó
   đang có thay đổi chưa commit của Phase 0. Xem phần bàn giao.
