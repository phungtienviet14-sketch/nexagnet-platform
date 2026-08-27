# Đánh giá durable workflow engine — nghiên cứu, POC chạy thật, quyết định

> **STATUS: HISTORICAL SNAPSHOT**
> **AS OF:** 2026-08-22 (`f07e123`)
> **SUPERSEDED BY:** [tech-radar.md](tech-radar.md) · [reference-platform-stack.md](reference-platform-stack.md)
>
> Giữ nguyên để tra cứu lịch sử nghiên cứu và quyết định. **Không dùng làm trạng thái hiện tại.**
> Chỗ nào tài liệu này mâu thuẫn với bản canonical ở trên, bản canonical đúng.

> Ngày: **22/08/2026** · HEAD khi bắt đầu: `f4ed3ee` · nhánh `feat/hoi-thoai-chot-don-main`
> POC: [`tools/poc-workflow-engine/`](../../tools/poc-workflow-engine/README.md) · bằng chứng thô: [`evidence/poc-run-log.md`](../../tools/poc-workflow-engine/evidence/poc-run-log.md)
> Liên quan: [automation-architecture.md](automation-architecture.md) · [observability-review.md](observability-review.md) · [nen-tang-da-khach.md](nen-tang-da-khach.md)

## 0. Kết luận trước, lý do sau

**ADOPT HATCHET — CHO NỀN TẢNG, CHƯA CHO PRODUCTION.**

Hatchet v0.101.27 (MIT) đã **chạy thật** trên máy dev: 3 container, **~270 MB RAM lúc rảnh**,
dựng xong trong **58 giây**, không cần RabbitMQ. Workflow TypeScript 5 bước đã chạy qua đủ
9 kịch bản mà yêu cầu đòi hỏi — thành công, lỗi, retry, **giết worker giữa chừng**, chờ/tiếp tục,
huỷ, replay, v1→v2, và **traceparent W3C của Nexagnet đi nguyên vẹn tới tận hệ ngoài**.

Ba lý do thắng, theo đúng thứ tự ưu tiên chủ dự án đặt ra:

1. **Nó xoá được phần hạ tầng ta sắp phải tự viết.** Không phải "ngang `CampaignDelivery`" —
   nó thay được cả lớp mà `CampaignDelivery` *không có*: cây bước, lần thử, lịch sử run, replay,
   chờ người duyệt, dashboard. Xem §7.
2. **Giấy phép MIT thuần**, không điều khoản `ee/`, không cấm managed service. Đây là candidate
   **duy nhất** trong bốn cái không vướng gì với mô hình bán dịch vụ của Nexagnet.
3. **Chi phí vận hành thật sự nhỏ** — nhỏ đủ để mỗi khách một instance, đúng mô hình silo
   đang chạy. Trigger.dev tự công bố cần **7 vCPU / 14 GB RAM tối thiểu**; đo được của Hatchet là
   **~0,27 GB**.

**Hai điều phải nói thẳng, không được giấu:**

- **Hatchet KHÔNG ghim phiên bản code cho run đang chạy.** POC đã chứng minh bằng dữ liệu: một
  run duy nhất có bước `validate` chạy code **v1** và bước `finalize` chạy code **v2**. Đây là
  hạn chế thật, và là chỗ Temporal hơn hẳn. Cách sống chung ở §8.3.
- **Bước xác nhận dashboard bằng mắt CHƯA làm được trong phiên này.** Lý do ở §9.4 — không phải
  vì dashboard hỏng (nó phục vụ trang đăng nhập bình thường, HTTP 200), mà vì ràng buộc an toàn.

---

## 1. Trạng thái repo khi bắt đầu

```
nhánh  feat/hoi-thoai-chot-don-main
HEAD   f4ed3ee
```

15 file đang sửa dở + 6 file/thư mục mới (Phase 0 observability, `tenants/wata/`,
`agent-workforce/`). **Không đụng vào bất kỳ file nào trong số đó.** Các worktree song song
(`wata-deploy`, `Z-ultty-gd1-test`) không bị chạm.

POC nằm gọn trong `tools/poc-workflow-engine/` — thư mục mới, theo đúng khuôn `tools/poc-*`
đã có sẵn (`poc-parser`, `poc-zalo-bot`). Cài bằng `pnpm install --ignore-workspace` nên
**`pnpm-lock.yaml` gốc không thay đổi một dòng nào** (đã kiểm bằng `git status`).

## 2. Repo hiện tự xây những phần durable execution nào

Kiểm lại từ source trên `f4ed3ee`, xác nhận phát hiện của phiên trước là **đúng**:

`CampaignDelivery` + `PrismaCampaignRepository.claimDue()` + `CampaignScheduler` **đã là** một
hàng đợi bền vững trên Postgres:

| Có sẵn | Hiện thực đã verify |
|---|---|
| Nhận việc nguyên tử đa worker | `pg_try_advisory_xact_lock` + `FOR UPDATE OF d SKIP LOCKED` |
| Chịu worker chết | `claimExpiresAt` lease, hết hạn thì worker khác nhận lại |
| Retry + backoff | `attempts`, `nextAttemptAt`, backoff luỹ thừa, `maxAttempts` theo tenant |
| Idempotency | `idempotencyKey String @unique` |
| Chống dồn tải | `rateLimitPerMinute`, `minSpacingSeconds` |
| Đánh thức | `CampaignScheduler` (`setInterval` + `unref`), trạng thái không nằm trong timer |

### 2.1 Những phần CHƯA có — và đây mới là chỗ engine đáng giá

| Thiếu | Hệ quả hôm nay |
|---|---|
| **Bước (Step) / cây thực thi** | Một `CampaignDelivery` là **một** việc. Không diễn tả được `validate → map → dispatch → chờ duyệt → finalize`. |
| **Lần thử (Attempt) có lịch sử** | `attempts` chỉ là **một con số**. Lần thử thứ 2 hỏng vì gì — không còn dấu vết. |
| **Lịch sử run tra cứu được** | Không có. Muốn biết hôm qua chạy gì phải đọc log. |
| **Replay / reset** | Không có. |
| **Chờ (timer/sự kiện) bền vững** | Không có. Không diễn tả được "chờ Sale duyệt tối đa 2 ngày". |
| **Phiên bản workflow** | Không có khái niệm. |
| **Giao diện cho người vận hành** | Không có. Đây chính là chỗ đau ở Phase 0. |
| **Huỷ / tạm dừng theo yêu cầu người** | Không có. |

**Đây là câu trả lời cho §26 của yêu cầu:** engine **không** chỉ ngang `CampaignDelivery`.
`CampaignDelivery` giải quyết ô đầu tiên (hàng đợi bền vững); engine giải quyết **cả bảng 2.1**.
Nếu tự viết, đó là 7 hạng mục hạ tầng, trong đó *dashboard vận hành* và *replay engine* là hai
thứ tốn nhiều tháng và không mang lại lợi thế cạnh tranh nào cho Nexagnet.

---

## 3. Ứng viên & phiên bản tại thời điểm nghiên cứu (22/08/2026)

| Ứng viên | Phiên bản lõi | Ngày phát hành | SDK TypeScript |
|---|---|---|---|
| **Hatchet** | `v0.101.27` | 17/08/2026 | `@hatchet-dev/typescript-sdk@1.28.2` (11/08/2026) |
| **Trigger.dev** | `v4.5.12` | 20/08/2026 | SDK v4 |
| **Temporal** | Server (MIT) | — | `@temporalio/*` |
| **Windmill** | — | — | Deno/Bun TS |

## 4. Giấy phép — P0

| Ứng viên | Giấy phép lõi | SDK | Managed service / bán dịch vụ | Kết luận |
|---|---|---|---|---|
| **Hatchet** | **MIT thuần** | MIT | Không cấm | 🟢 **GREEN** |
| **Trigger.dev** | **Apache 2.0** | Apache 2.0 | Không cấm | 🟢 **GREEN** |
| **Temporal** | **MIT** (server) | MIT | Không cấm | 🟢 **GREEN** |
| **Windmill** | AGPLv3 + phần "enterprise" độc quyền | Apache 2.0 (client) | **Bị cấm rõ ràng** | 🔴 **RED** (xem dưới) |

### 4.1 Hatchet — kiểm tận file

`LICENSE` ở gốc repo là MIT tiêu chuẩn, **không** điều khoản bổ sung, **không** carve-out cho
thư mục enterprise. Đã liệt kê cây thư mục gốc: **không có thư mục `ee/`**.

### 4.2 Windmill — đây là chỗ chặn, giống hệt n8n

Trích nguyên văn từ file `LICENSE` của repo Windmill:

> "Windmill Labs, Inc. grants a right to use all the features of the 'Community Edition' for free
> without restrictions other than the limits and quotas set in the software and a right to
> distribute the community edition as is but **not to sell, resell, serve as a managed service,
> modify or wrap under any form** without an explicit agreement."

Mô hình Nexagnet = **serve as a managed service** cho khách trả tiền, có thể **wrap**. Đây là
đúng hai việc bị cấm. Vẫn còn **một đường hợp lệ**: tự biên dịch từ source **không** bật cờ
`enterprise` → nhị phân đó là AGPLv3 thuần, và AGPL **cho phép** chạy SaaS. Nhưng khi đó dính
**copyleft mạng (AGPL §13)**: phải chào mã nguồn bản đã sửa cho người dùng qua mạng. Đây là
nghĩa vụ pháp lý thật, cần luật sư xác nhận, và ta tự bỏ mất chính các tính năng enterprise.

→ **RED**, không phải vì kỹ thuật, mà vì cùng lý do đã DEFER n8n. Không POC.

---

## 5. Chấm điểm có trọng số (/100)

| Tiêu chí | Trọng số | Hatchet | Temporal | Trigger.dev | Windmill |
|---|---:|---:|---:|---:|---:|
| Human debugging / operator UX | 20 | **16** | 13 | 17 | 15 |
| Durable execution / recovery | 15 | **14** | 15 | 10 | 9 |
| Retry / replay / control | 15 | **14** | 14 | 12 | 10 |
| Workflow versioning | 10 | **5** | 10 | 7 | 6 |
| TypeScript / Nest fit | 10 | **7** | 8 | 9 | 4 |
| Observability / trace correlation | 10 | **10** | 7 | 8 | 4 |
| License / commercial safety | 10 | **10** | 10 | 10 | 0 |
| Self-host ops | 5 | **5** | 2 | 2 | 4 |
| Multi-customer isolation | 5 | **4** | 4 | 3 | 2 |
| **TỔNG** | **100** | **85** | **83** | **78** | **54** |

Bằng chứng cho từng điểm nằm ở §6–§8. Điểm nào của Hatchet là **đo được** (không phải đọc tài
liệu) thì ghi rõ ở §6.

### 5.1 Vì sao Hatchet thắng, và thắng sát

Hatchet (85) và Temporal (83) **gần như hoà**. Chênh lệch nằm ở đúng ba ô:

- **Self-host ops (5 vs 2):** Hatchet = Postgres + 2 tiến trình, đo được 270 MB. Temporal = nhiều
  service (frontend/history/matching/worker) + Cassandra-hoặc-Postgres + Elasticsearch nếu muốn
  tìm kiếm nâng cao. Với mô hình **mỗi khách một stack**, chi phí này nhân lên theo số khách.
- **Observability (10 vs 7):** Hatchet **tự động nhét `traceparent` W3C vào `additionalMetadata`**
  và POC đã chứng minh nó đi nguyên vẹn tới hệ ngoài. Nexagnet đã có `traceparent` — ghép vào là
  xong, không phải viết lớp trung gian.
- **Versioning (5 vs 10):** đây là chỗ Temporal **thắng đậm** và Hatchet thua rõ. Xem §8.3.

Nói cho đúng: **nếu ưu tiên số 1 là versioning nghiêm ngặt thì Temporal là câu trả lời.** Nhưng
chủ dự án đã xếp thứ tự: *human control → durable execution → tái dùng nhanh cho khách sau →
không tự code lại*. Ở ba ưu tiên đầu Hatchet ngang hoặc hơn, và ở "tái dùng nhanh" thì chi phí
vận hành 270 MB/khách là khác biệt mang tính quyết định.

### 5.2 Vì sao Trigger.dev thua (78)

Không phải vì license (Apache 2.0, sạch). Hai lý do đo được, cả hai từ tài liệu chính thức:

1. **`Checkpoints` — Cloud ✅ / Self-hosted ❌.** Trích nguyên văn bảng so sánh trong
   `docs/self-hosting/overview.mdx`:

   | Feature | Cloud | Self-hosted | Description |
   |---|---|---|---|
   | Checkpoints | ✅ | ❌ | Non-blocking waits, less resource usage |

   Checkpoint chính là cơ chế làm cho một lần **chờ** không tốn tài nguyên. Bản self-host không
   có nó ⇒ một run đang "chờ Sale duyệt 2 ngày" **giữ tài nguyên suốt 2 ngày**. Mà "chờ người
   duyệt" đúng là ca dùng số một của Nexagnet.

2. **Chi phí tối thiểu tự công bố:** webapp **3+ vCPU / 6+ GB RAM**, worker **4+ vCPU / 8+ GB
   RAM** ⇒ **≥ 7 vCPU / 14 GB RAM** cho một stack, chưa kể container registry + object storage.
   Nhân với mô hình mỗi khách một stack thì không khả thi trên hạ tầng hiện tại.

*(Ghi chú trung thực: một bản tóm tắt từ tìm kiếm web nói checkpoint **có** trên self-host.
Nó **sai**. Kết luận ở đây lấy từ chính file nguồn của tài liệu Trigger.dev.)*

---

## 6. POC — CHẠY THẬT, không phải bảng so sánh

Toàn bộ phần này là kết quả **đo được**, log thô ở
[`evidence/poc-run-log.md`](../../tools/poc-workflow-engine/evidence/poc-run-log.md).

### 6.1 Hạ tầng đã dựng

```
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
```

| Chỉ số | Đo được |
|---|---|
| Thời gian dựng (kể cả kéo image) | **58 giây** |
| Container chạy dài | **3** — `postgres`, `hatchet-engine`, `hatchet-dashboard` |
| Container chạy-một-lần | 2 — `migration`, `setup-config` |
| **RAM lúc rảnh** | **~270 MB** (postgres 221 MB · dashboard 29,6 MB · engine 19,8 MB) |
| CPU lúc rảnh | postgres 1,1% · engine 2,4% · dashboard 0,5% |
| Dung lượng image | ~1,04 GB (Hatchet 429 MB + postgres 608 MB) |
| Cổng | 5744 (pg) · 7744 (gRPC) · 8744 (dashboard) |
| Volume | 3 (`pocwf_postgres_data`, `pocwf_config`, `pocwf_certs`) |

**Bắt buộc vs tuỳ chọn:** tài liệu chính thức để RabbitMQ trong compose. POC **bỏ hẳn RabbitMQ**
bằng `SERVER_MSGQUEUE_KIND=postgres` (đúng như `docker-compose.release.yml` của Hatchet) và
**stack vẫn chạy đủ mọi kịch bản dưới đây**. → Phụ thuộc bắt buộc duy nhất là **PostgreSQL**.

### 6.2 Ma trận bằng chứng

Workflow trung tính `automation-proof`: `validate → map → dispatch → await-approval → finalize`.
Không tên khách thật, fixture `tenant-alpha`/`tenant-beta`.

| # | Yêu cầu | Kết quả | Bằng chứng đo được |
|---|---|---|---|
| 1 | Run thành công nhiều bước | ✅ | 5/5 bước COMPLETED, run `30c5920e` |
| 2 | Run lỗi, operator thấy lý do | ✅ | `PAYLOAD_INVALID: customer,totalQuantity` — **có mã, không phải "Error"**; `retries:0` được tôn trọng (hỏng 1 lần, không thử lại) |
| 3 | Retry chạy thật | ✅ | 3 lần thử lúc `03:43:00 → 03:43:03 → 03:43:11` (giãn 3 s rồi 8 s = backoff luỹ thừa thật), thành công ở lần 3 |
| 4 | **Worker chết giữa chừng** | ✅ | Xem §6.3 — bằng chứng mạnh nhất của cả POC |
| 5 | Chờ + tiếp tục | ✅ | Chờ 15 s rồi hết giờ đi tiếp; và chờ 44 s rồi **sự kiện người duyệt** thả ra (timeout đặt 300 s ⇒ chắc chắn do sự kiện, không phải hết giờ) |
| 6 | Huỷ | ✅ | Run `ce2b4d84` đang chờ duyệt → `Task run cancelling... → cancelled` |
| 7 | Replay | ✅ | Replay được cả run **đã huỷ** lẫn run **đã lỗi**; run lỗi chạy lại và lỗi lại đúng mã cũ |
| 8 | Phiên bản v1 → v2 | ⚠️ | Chạy được, nhưng kết quả là một **cảnh báo**, xem §8.3 |
| 9 | Tương quan trace W3C | ✅ | Xem §6.4 |
| 10 | Xem input/output | ✅ | Xem §6.5 |

### 6.3 Worker chết giữa chừng — bằng chứng mạnh nhất

Kịch bản chạy thật:

1. `03:44:05` — run `de746ae5` vào bước `await-approval`, task id `e87da969`, worker **pid 24044**
2. `~03:44:20` — **giết cứng** pid 24044 (`Stop-Process -Force`), xác nhận `CONFIRMED DEAD`
3. `03:44:35` — worker mới lên, **pid 21968**
4. `03:44:44` — đẩy sự kiện duyệt
5. `03:44:47` — **cùng task id `e87da969`** khởi động lại trên **pid 21968** rồi COMPLETED
6. `03:44:48` — `finalize` chạy, workflow hoàn tất

**Và điều quan trọng nhất — các bước đã xong KHÔNG chạy lại.** Bộ đếm ở điểm cuối ngoài:

```
"tenant-alpha:PROOF-CRASH-1": 1
```

Đúng **một** lần gọi ra hệ ngoài, dù worker bị giết giữa chừng. Đây là checkpoint thật, đo bằng
tác dụng phụ đếm được — không phải lời hứa trong tài liệu.

> Kết luận cho §9 của yêu cầu: trạng thái **không nằm trong tiến trình worker**. Nó nằm trong
> nhật ký sự kiện trên Postgres của engine. Worker là thứ **thay thế được**.

### 6.4 Tương quan trace W3C — nối trọn chuỗi

`trigger.ts` sinh `traceparent` **đúng khuôn** `apps/api/src/observability/trace-context.ts`
(`00-<32hex>-<16hex>-01`) rồi gắn vào `additionalMetadata`. Chuỗi đo được:

```
Nexagnet sinh  00-dc2034f8ba0be3c71bcbdafb551eceff-323fb613753aa317-01
        ↓ additionalMetadata khi trigger
Hatchet engine  (lưu vào run, tra cứu được)
        ↓ worker đọc ctx.additionalMetadata()
task dispatch   (đính vào header HTTP)
        ↓
điểm cuối ngoài NHẬN ĐÚNG chuỗi đó:
[endpoint] {"key":"tenant-alpha:PROOF-OK-1","attempt":1,
            "traceparent":"00-dc2034f8ba0be3c71bcbdafb551eceff-323fb613753aa317-01"}
```

Ngoài ra POC gắn thêm neo nghiệp vụ tra cứu được trên dashboard:
`nexagnet.traceId`, `nexagnet.orderRef`, `nexagnet.tenant`.

**Đây là §13 được chứng minh, không phải "có hỗ trợ OTel".** Hatchet còn có
`HatchetInstrumentor` cho OpenTelemetry đầy đủ nếu sau này cần đẩy sang collector — nhưng
**không cần** collector nào để có được liên kết trên.

### 6.5 Operator nhìn thấy gì — đọc từ dữ liệu thật

Trích từ `hatchet.runs.get()` của run `e3aa7487`:

```json
"additionalMetadata": { "nexagnet.orderRef": "PROOF-VER-1", "nexagnet.tenant": "tenant-alpha",
                        "nexagnet.traceId": "ada1b010…", "traceparent": "00-ada1b010…-01" },
"status": "COMPLETED", "duration": 44372,
"workflowVersionId": "f78a0210-57e4-4da9-9d74-e177504398bd",
"input":  { … payload gốc … },
"output": { … kết quả cuối … },
"shape":  [ { taskName, stepId, childrenStepIds } … ]   ← cây bước
```

Từng task có `taskName`, `status`, `attempt`, `errorMessage`, `output`. Ví dụ bước `map`:

```json
{"taskName":"map-…","status":"COMPLETED","attempt":1,
 "output":{"endpointPath":"/erp/orders","idempotencyKey":"tenant-alpha:PROOF-VER-1",
           "sanitizedCustomer":{"phone":"09***23","address":"12***st"}}}
```

→ **Che dữ liệu hoạt động, và operator nhìn thấy bản đã che.**

> ⚠️ **Cảnh báo riêng tư phải nhớ:** `input` của run được lưu **nguyên văn** như lúc trigger.
> Trong POC nó chứa `phone`/`address` chưa che. Nghĩa là: **che dữ liệu phải làm TRƯỚC khi gọi
> engine**, không phải trong bước đầu tiên của workflow. Ai vào được dashboard là đọc được
> `input`. Đây là ràng buộc thiết kế bắt buộc cho bản thật (Luật BVDLCN 91/2025/QH15).

---

## 7. Engine bỏ được những gì nếu ta tự xây

Câu hỏi đúng theo §26 không phải "`CampaignDelivery` đủ chưa" mà "engine thay được bao nhiêu
phần hạ tầng ta *định* viết":

| Thứ ta định tự viết | Hatchet có sẵn? | Đã POC? |
|---|---|---|
| `AutomationRun` (vòng đời run) | ✅ | ✅ |
| `AutomationJob` / `AutomationStep` (cây bước) | ✅ `shape` + `parents` | ✅ |
| `AutomationAttempt` (lịch sử từng lần thử) | ✅ `attempt` + lỗi từng lần | ✅ |
| Lease engine (nhận việc, worker chết) | ✅ | ✅ §6.3 |
| Retry engine (backoff, tràn ngưỡng) | ✅ `retries` + `backoff{factor,maxSeconds}` | ✅ |
| Replay engine | ✅ `runs.replay()` | ✅ |
| Lịch sử run tra cứu | ✅ | ✅ |
| Hẹn giờ / chờ bền vững | ✅ `sleepFor` / `waitForEvent` / `Or(...)` | ✅ |
| Chờ người duyệt | ✅ | ✅ |
| Huỷ theo yêu cầu | ✅ `runs.cancel()` | ✅ |
| **Dashboard vận hành** | ✅ | ⚠️ §9.4 |
| Idempotency key cấp engine | ✅ (có từ v0.101.x) | ➖ (POC dùng khoá ở tầng nghiệp vụ) |

**≈ 90% những gì ta định viết đã có sẵn và đã chạy được.** Đây là câu trả lời cho §41.

## 8. Những gì Hatchet KHÔNG làm — và ta vẫn phải sở hữu

### 8.1 Nguồn sự thật nghiệp vụ ở lại Nexagnet — không thương lượng

Engine **không được** giữ: giá, trạng thái chuẩn của `Order`, `salesHandoff`, chính sách tenant,
uỷ quyền cho AI, quyết định auto-send, chính sách đại lý, audit nghiệp vụ.

Hình dạng đúng, giữ nguyên lớp phòng thủ đang có ở `order-tools.ts`:

```
AI → công cụ nghiệp vụ có schema (sua_don) → uỷ quyền/chính sách → giao dịch Order
                                                                        ↓
                                                            workflow engine (chỉ THỰC THI)
```

**Tuyệt đối không** mở một công cụ `execute_workflow(id, payload)` cho LLM. Tin nhắn Zalo là dữ
liệu **không tin cậy** đi thẳng vào prompt; một công cụ tổng quát như vậy phá đúng lớp chặn đang
giữ cho nó không leo thang thành hành động.

### 8.2 Lớp mỏng Nexagnet vẫn cần

Chỉ 5 thứ, tất cả đều **business-specific** nên engine không thể làm thay:

1. **`WorkflowEnginePort`** — một cổng, không phải bốn lớp trừu tượng.
2. **Ràng buộc workflow ↔ tenant** — đọc từ `tenants/<slug>/tenant.json`, đúng khuôn
   `createErpAdapter` hiện có.
3. **Cầu nối sự kiện miền → workflow** — nơi duy nhất quyết định "việc nghiệp vụ này kích workflow nào".
4. **Liên kết `engineRunId` ↔ `traceId` ↔ audit nghiệp vụ** — để `AuditLog` trỏ được sang run.
5. **Che dữ liệu TRƯỚC khi gọi engine** — bắt buộc, theo cảnh báo ở §6.5.

**Không** clone dashboard của engine. Giai đoạn đầu operator bấm "Mở workflow run" là nhảy sang
dashboard Hatchet — chấp nhận được.

### 8.3 ⚠️ Phiên bản workflow — hạn chế thật, phải sống chung

POC chạy đúng kịch bản §11 yêu cầu: một run v1 đang chờ duyệt → deploy v2 → duyệt.

**Kết quả, đọc từ output thật của cùng MỘT run `e3aa7487`:**

| Bước | `engineVersion` trong output |
|---|---|
| `validate` | **`v1`** |
| `finalize` | **`v2`** |

Một run duy nhất chạy **hai phiên bản code**. Hatchet **có** ghi `workflowVersionId` cho mỗi run
(tra cứu được), nhưng **không ghim** run đang chạy vào phiên bản code đã khởi tạo nó — worker
đang sống có code nào thì chạy code đó.

So sánh trung thực: **Temporal giải quyết hẳn chuyện này** bằng *Patching* (rẽ nhánh theo phiên
bản trong cùng một worker) và *Worker Versioning* (run cũ ở lại worker cũ). Đó là 5 điểm chênh
lệch ở §5.

> ### ✅ CẬP NHẬT 22/08/2026 — GATE A ĐÃ ĐÓNG
>
> Hạn chế dưới đây **vẫn đúng**, nhưng đã có cách xử lý **được chứng minh bằng thí nghiệm có
> đối chứng**, không phải bằng quy ước code: **tên workflow mang phiên bản** `<key>.v<N>`.
> Một worker đăng ký đúng một phiên bản ⇒ engine không có đường nào đẩy run cũ sang code mới.
> Bằng chứng cạnh nhau (shared FAIL / versioned PASS) + cơ chế + ràng buộc ký tự của tên:
> [`evidence/version-gate-a.md`](../../tools/poc-workflow-engine/evidence/version-gate-a.md).
>
> Hai điều chỉnh so với đề xuất ban đầu ở mục này:
> - Dấu phân cách **phải** là `.`/`-`/`_`. Hatchet từ chối `:` (`^[a-zA-Z0-9\.\-_]+$`).
> - Không cần "chỉ thêm bước ở cuối" như một luật bất khả xâm phạm nữa — nhưng vẫn nên giữ, vì
>   nó giảm số lần phải lên phiên bản mới.

**Cách sống chung, bắt buộc ghi vào chuẩn code khi triển khai thật:**

- Chỉ **thêm** bước ở cuối; **không** đổi nghĩa/xoá/đổi tên bước đã có khi còn run đang chạy.
- Bước phải **đọc được output của bước trước theo tên trường**, chịu được trường mới xuất hiện.
- Đổi phá vỡ ⇒ **workflow tên mới** (`sales-order-to-erp-v2`), chạy song song, rút dần —
  không sửa tại chỗ.
- Trước khi deploy phá vỡ: kiểm số run đang chạy; xả hết rồi mới deploy.

Đây là ràng buộc vận hành thật, không phải chi tiết nhỏ. Nó là **rủi ro số 1** của lựa chọn này.

### 8.4 TypeScript/ESM — có ma sát, đã đo, đã có cách

Repo là **ESM thuần** (`"type": "module"`, `moduleResolution: NodeNext`). SDK Hatchet là CJS và
**không khai báo `exports` map**. Hệ quả đo được:

| Cách import | Kết quả |
|---|---|
| `from '@hatchet-dev/typescript-sdk/v1'` (đúng như **mọi ví dụ chính thức**) | ❌ `ERR_UNSUPPORTED_DIR_IMPORT` + TS2307 |
| `from '@hatchet-dev/typescript-sdk'` (gốc gói) | ✅ chạy — có đủ `HatchetClient`, `Or`, `SleepCondition`, `UserEventCondition` |

Giá phải trả: import gốc kéo theo SDK v0 đã khai tử ⇒ mỗi lần chạy in 2 dòng
`DeprecationWarning`. Khó chịu, không chặn.

→ **Cần một shim mỏng một lần** khi tích hợp thật (re-export từ gốc gói), rồi phần còn lại của
codebase import qua shim đó. Đã trừ điểm ở §5 (TS fit 7/10).

Typecheck của POC **xanh** với đúng `tsconfig.base.json` của repo.

### 8.5 Đa khách — mô hình phù hợp

Hatchet có **tenant** làm ranh giới cấp nhất, mỗi tenant có token API riêng, và v0.101.27 vừa
thêm vai `VIEWER` chỉ đọc.

Với silo hiện tại (mỗi khách/môi trường một stack, một DB, một mạng), khuyến nghị **MODEL A —
mỗi tenant một instance Hatchet**, vì:

- Trùng khớp ranh giới bảo mật đang có; bán kính ảnh hưởng không đổi.
- 270 MB/instance ⇒ 5 khách ≈ 1,4 GB. Chấp nhận được.
- **Không** phải tin vào `tenantId` như một biên cách ly — đúng cảnh báo §14.

## 9. Vận hành & rủi ro

### 9.1 Không đụng gì tới production

Docker Desktop lúc đầu **hỏng** (mọi route API trả 500) — đã khởi động lại **chỉ Docker Desktop
trên máy dev**. Trước khi dựng: `docker ps` cho thấy **0 container đang chạy**. POC dùng dải cổng
riêng 5744/7744/8744 và project riêng `pocwf`. **Không** chạm VM `netviet`, **không** chạm stack
khách nào.

### 9.2 Cơ sở dữ liệu

Hatchet có **Postgres riêng** (`pocwf_postgres_data`), tách hoàn toàn khỏi Postgres nghiệp vụ của
Prisma. Không migrate bảng engine vào DB nghiệp vụ. Đúng §25.

### 9.3 Rủi ro vận hành production

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Không ghim phiên bản cho run đang chạy | **CAO** | §8.3 — cần chuẩn code + thủ tục deploy |
| `input` của run lưu nguyên văn | **CAO** | §6.5 — phải che trước khi gọi engine |
| Version `0.x` | TRUNG BÌNH | Ghim tag, đọc changelog trước khi nâng |
| Ma sát ESM | THẤP | §8.4, có shim |
| Thêm một Postgres/khách | THẤP | 221 MB |

### 9.4 ⚠️ Việc CHƯA làm được — nói thẳng

**§21 (xác nhận dashboard bằng mắt) chưa hoàn thành.** Hai lý do, cả hai đều không phải lỗi của
Hatchet:

1. Khung trình duyệt trong phiên này **không dựng được khung hình** (`Browser pane is not
   displayed`) nên không chụp được màn hình.
2. Đăng nhập cần **gõ mật khẩu vào ô đăng nhập**. Đây là việc nằm trong danh sách **cấm tuyệt
   đối** của tôi, kể cả với mật khẩu mặc định của container cục bộ do chính POC tạo ra.

Đã xác nhận được: dashboard **phục vụ bình thường** (`HTTP 200`, trang đăng nhập render đủ
"Log in to continue / Email / Password / Sign In"), và **toàn bộ dữ liệu mà dashboard hiển thị**
đã được kiểm qua SDK ở §6.5 (cây bước, lần thử, input, output, lỗi có mã, thời lượng, metadata).

**Để hoàn tất bước này, người vận hành làm 3 phút:**

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
```

Mở `http://localhost:8744`, đăng nhập bằng tài khoản seed mặc định của Hatchet
(`admin@example.com` / `Admin123!!` — tài khoản cục bộ do `hatchet-admin quickstart` tạo), rồi
kiểm bằng mắt: danh sách run · cây bước · lần thử · lỗi · thời gian · input/output · nút
retry/replay/cancel · log · bộ lọc theo `additionalMetadata`.

---

## 10. QUYẾT ĐỊNH

> ### ✅ ADOPT HATCHET — CHO NỀN TẢNG, CHƯA CHO PRODUCTION

**Chấp nhận** vì: MIT sạch · thay được ~90% hạ tầng ta định tự viết · 270 MB/instance hợp mô hình
silo · `traceparent` W3C ghép thẳng vào nền quan sát đã có · đã chạy thật đủ 9 kịch bản.

**"Chưa cho production"** nghĩa là: chưa nối vào `apps/api`, chưa deploy lên VM, chưa có workflow
nghiệp vụ nào. Hai việc phải xong trước khi nối thật: **(a)** chuẩn code cho §8.3 (phiên bản),
**(b)** che dữ liệu trước khi gọi engine cho §6.5.

**Loại Windmill** — giấy phép chặn đúng mô hình kinh doanh (RED).
**Không chọn Trigger.dev** — self-host thiếu checkpoint đúng ca dùng "chờ người duyệt", và
≥7 vCPU/14 GB mỗi stack.
**Temporal là phương án dự phòng nghiêm túc** — thắng rõ về versioning; nếu §8.3 trở thành nỗi
đau thật khi vận hành, mở lại Temporal chứ **không** tự viết lớp versioning cho Hatchet.

### 10.1 Giai đoạn tiếp theo — ĐÃ THI CÔNG 22/08/2026 (phiên 2)

Bốn trong năm việc dưới đây **đã xong và có test**; runbook vận hành ở
[workflow-engine-runbook.md](../phat-trien/van-hanh/workflow-engine-runbook.md).

| # | Việc | Trạng thái | Ở đâu |
|---|---|---|---|
| 1 | `WorkflowEnginePort` + adapter Hatchet + shim ESM | ✅ | `apps/api/src/workflow/` |
| 2 | Ràng buộc workflow ↔ tenant | ✅ | `packages/tenant/src/workflow-binding.schema.ts` |
| 3 | Cầu nối sự kiện miền → workflow (**một** nơi) | ✅ | `workflow-handoff.service.ts` |
| 4 | Liên kết `engineRunId` ↔ `traceId` ↔ `AuditLog` | ✅ (phần ghi) | `workflow-handoff.service.ts` · nút console: chưa |
| 5 | Workflow nghiệp vụ đầu tiên | ⬜ | chỉ có khuôn trung tính `integration-handoff.v1` |

Thêm hai việc **không có trong đề xuất ban đầu** nhưng hoá ra là bắt buộc:

- **Outbox giao dịch** — trigger trực tiếp sau commit không đảm bảo sự kiện không mất. Xem
  `workflow-outbox.repository.ts`.
- **Biên riêng tư dạng danh sách trắng** — §6.5 nói "phải che trước khi gọi engine"; hoá ra *che*
  là chưa đủ, phải **chặn**. Xem `workflow-input.ts`.

### 10.2 Đề xuất ban đầu (giữ lại để đối chiếu)

1. `WorkflowEnginePort` + adapter Hatchet + shim ESM (§8.4) — nhỏ, một cổng.
2. Ràng buộc workflow ↔ tenant đọc từ `tenants/<slug>/tenant.json`.
3. Cầu nối sự kiện miền → workflow (**một** nơi quyết định).
4. Liên kết `engineRunId` ↔ `traceId` ↔ `AuditLog`; console Nexagnet có nút "Mở workflow run".
5. Workflow thật đầu tiên — ứng viên tự nhiên: **chiến dịch CSKH**, vì `CampaignDelivery` đã có
   sẵn đường lui an toàn nếu phải rollback.

**Khách thứ 3 sẽ cấu hình gì:** `tenant.json` khai `workflowBindings` (khuôn nào → dịch vụ nào,
credential ref, ngưỡng retry). Khuôn workflow **không fork**.

---

## 11. Nguồn (chính thức)

- Hatchet — [repo](https://github.com/hatchet-dev/hatchet) · [LICENSE (MIT)](https://raw.githubusercontent.com/hatchet-dev/hatchet/main/LICENSE) · [release v0.101.27](https://github.com/hatchet-dev/hatchet/releases/latest) · [durable execution](https://docs.hatchet.run/home/durable-execution) · [OpenTelemetry](https://docs.hatchet.run/home/opentelemetry) · [self-host compose](https://docs.hatchet.run/self-hosting/docker-compose)
- Trigger.dev — [LICENSE (Apache 2.0)](https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/LICENSE) · [self-hosting overview](https://trigger.dev/docs/self-hosting/overview) · [docker self-host](https://raw.githubusercontent.com/triggerdotdev/trigger.dev/main/docs/self-hosting/docker.mdx) · [waits](https://trigger.dev/docs/wait)
- Temporal — [LICENSE (MIT)](https://raw.githubusercontent.com/temporalio/temporal/main/LICENSE) · [self-hosted deployment](https://docs.temporal.io/self-hosted-guide/deployment) · [workflow definition / determinism](https://docs.temporal.io/workflow-definition)
- Windmill — [LICENSE](https://raw.githubusercontent.com/windmill-labs/windmill/main/LICENSE)
