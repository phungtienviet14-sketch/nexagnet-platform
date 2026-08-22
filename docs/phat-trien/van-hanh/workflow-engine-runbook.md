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

### 4.2 TLS — POC khác production
```
POC local (được phép):      HATCHET_CLIENT_TLS_STRATEGY=none
Deployment thật (bắt buộc): SERVER_GRPC_INSECURE=false + TLS ở edge
```
`tlsStrategy: 'none'` trong `HatchetEngineConfig` **chỉ** để chạy local. Mặc định của adapter là
**có TLS** — phải đặt biến môi trường mới tắt được, và đó là một hành động có chủ ý.

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
- Phục hồi = khôi phục Postgres engine + khởi động lại engine ở **đúng phiên bản image**. Ngược
  phiên bản engine so với schema đã migrate là một cách hỏng thật.
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
| Worker | — | chạy **trong tiến trình API** hiện có, không thêm container |

| Số stack bật engine | RAM thêm |
|---:|---:|
| 1 (`ultty/gd1-test`) | ~0,27 GB |
| 2 | ~0,54 GB |
| 4 | ~1,08 GB |

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
