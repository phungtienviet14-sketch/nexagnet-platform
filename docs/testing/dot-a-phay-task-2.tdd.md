# Bằng chứng TDD — Đợt A′ Task 2: ảnh được tải về kho bền vững, không còn chỉ là cái link

> **Nguồn kế hoạch:** [docs/ke-hoach/gd1.md §4 CHẶN E + §6 Đợt A′](../ke-hoach/gd1.md) · trạng thái ở [docs/ke-hoach/tong-quan.md §1](../ke-hoach/tong-quan.md).
> Chạy: **11/08/2026**. Nhánh: `main`. Commit: `03a6a03` (RED) → `4c6f1fa` (GREEN) → `8205ba3` (refactor + phủ nốt).
> Tiếp nối [Task 1](dot-a-phay-task-1.tdd.md) — Task 1 cho tin chỉ-ảnh **vào DB**, Task 2 cho **file ảnh** vào kho.

---

## 1. Việc phải bảo đảm (user journey)

| # | Journey |
|---|---|
| J1 | Là **vận hành/Sale**, ảnh đại lý gửi phải được **tải file về kho bền vững ngay hôm nay** — 35 ngày sau Zalo xóa object thì tôi vẫn mở được ảnh (đối soát đơn tranh chấp, biên bản giao hàng 2.3.1) |
| J2 | Là **hệ thống**, tải ảnh hỏng (404 · không phải ảnh · quá lớn · kho lỗi · DB lỗi) **KHÔNG được làm rớt tin** — tin vẫn trong DB, chỉ ghi `mediaError` |
| J3 | Là **người vận hành**, mặc định demo/CI **không I/O gì cả** — không bucket, không khóa, chạy offline như trước |
| J4 | Là **chủ dự án**, đổi GCP → OVHcloud chỉ đổi `MEDIA_ENDPOINT`/bucket/khóa, **không sửa code** |
| J5 | Là **người vận hành**, URL trong tin là **dữ liệu từ ngoài** — server không được biến thành công cụ gọi mạng nội bộ (SSRF) |

---

## 2. Báo cáo từng việc

### 2.1 Vì sao Task 1 chưa đủ

Task 1 dừng ở `Message.imageUrl` — **một cái link**. Đo thật 11/08/2026: `HEAD` link ảnh lấy từ log PoC ngày 07/07 (cách 35 ngày) trả **404** (`server: za-ngx-srv`); thêm UA Chrome + `Referer: chat.zalo.me` vẫn 404 ⇒ không phải chặn hotlink; một ảnh tĩnh khác trên `zdn.vn` trả **200** ⇒ CDN vẫn sống. URL không có query/chữ ký/`expires` ⇒ **không phải pre-signed URL**, mà Zalo **xóa object phía server**.

⇒ Không tải file về thì bản ghi Task 1 tạo ra sẽ trỏ vào hư không sau ≤35 ngày.

### 2.2 Cổng RED

```
vitest run src/media src/pipeline/pipeline-media.spec.ts src/messages/messages.repository.spec.ts
Test Files  6 failed (6) · Tests  3 failed | 4 passed (7)

messages.repository.spec.ts  TypeError: repo.recordMedia is not a function   <- RED HANH VI tren code co san
src/media/*, pipeline-media   Failed to resolve import                        <- 5 file: module chua viet
```

### 2.3 Module `media/` — nhân bản đúng khuôn `channels/`

| File | Vai trò |
|---|---|
| `media-store.ts` | interface + cờ `enabled` |
| `media.provider.ts` | chọn theo `MEDIA_STORE=none\|local\|s3` (song song `channel.provider.ts`) |
| `noop-media.store.ts` | **mặc định** — demo/CI, `enabled=false` ⇒ fetcher bỏ qua hẳn, 0 byte |
| `local-media.store.ts` | dev |
| `s3-media.store.ts` | chuẩn S3 — GCS hôm nay, OVHcloud sau này, **cùng một code** (J4) |
| `media-policy.ts` | allowlist host + sinh khóa object — **thuần**, kiểm được không cần mạng/đĩa |
| `media-fetcher.service.ts` | `fetch` → `sharp` → kho → ghi DB; `p-limit` chặn bão tải |

### 2.4 Lỗ hổng phát sinh phải bịt cùng lúc — SSRF

Trước Task 2, **không chỗ nào** trong `apps/api/src` tải một URL do người khác đưa vào (`writeFile` duy nhất là ghi phiên zca). Task 2 tạo ra chính điều đó: `imageUrl` đến từ `content.href` (zca) hoặc `photo_url` (Bot Platform) — dữ liệu từ ngoài. Không chặn thì một tin chứa `http://169.254.169.254/computeMetadata/v1/` biến server thành công cụ quét mạng nội bộ.

`MEDIA_ALLOWED_HOSTS` (mặc định `zdn.vn`) chặn **trước khi ra mạng** — phép kiểm là *"fetch chưa hề được gọi"*, không phải *"kết quả bị bỏ"*. So khớp theo **biên dấu chấm**: `evil-zdn.vn` kết thúc bằng chuỗi `zdn.vn` nhưng là tên miền của người khác ⇒ bị chặn. Để rỗng = **chặn hết** (fail closed).

Đây không phải nới phạm vi: bỏ qua thì chính thay đổi này mở một đường tấn công mới. Cùng lý lẽ với guard `photo_url` ở Task 1.

### 2.5 Mắt xích cuối — ảnh vào đến kho qua pipeline thật

Unit test chứng minh fetcher chạy đúng; `pipeline-media.spec.ts` chạy qua `PipelineService.intake` thật để chứng minh nó **thực sự được gọi**, cả ở nhóm đã map lẫn chưa map, và tin hỏng ảnh vẫn nguyên.

```
vitest run src/media src/pipeline/pipeline-media.spec.ts  -> 5 file, 38 passed
```

---

## 3. Đặc tả test — điều gì được bảo đảm

| # | Điều được bảo đảm | Test | Loại | KQ |
|---|---|---|---|---|
| 1 | Ảnh thật → nén WebP 1600px, đẩy lên kho đúng khóa, ghi lại vào DB | `media-fetcher.service.spec.ts:anh that -> nen WebP` | unit | PASS |
| 2 | HTTP 404 → ghi `mediaError`, **không ném** | `…:HTTP 404 -> ghi mediaError` | unit | PASS |
| 3 | Thân tin là HTML chứ không phải ảnh → `mediaError` | `…:than tin khong phai anh (HTML)` | unit | PASS |
| 4 | Mạng lỗi (`fetch` ném) → `mediaError` | `…:mang loi (fetch nem)` | unit | PASS |
| 5 | Phản hồi 204 không thân tin → `mediaError` | `…:phan hoi khong co than tin (204)` | unit | PASS |
| 6 | **Host ngoài allowlist → `fetch` KHÔNG được gọi lần nào** | `…:host ngoai danh sach cho phep` | unit | PASS |
| 7 | `content-length` vượt trần → bỏ sớm | `…:content-length vuot tran` | unit | PASS |
| 8 | Thân tin vượt trần dù `content-length` nói dối → hủy giữa chừng | `…:than tin vuot tran du content-length noi doi` | unit | PASS |
| 9 | Kho ghi lỗi (`AccessDenied`) → `mediaError` | `…:kho ghi loi` | unit | PASS |
| 10 | **Ghi DB lỗi → nuốt lại, ảnh vẫn lên kho, không ném** | `…:ghi ket qua vao DB loi` | unit | PASS |
| 11 | Kho tắt → không fetch, không ghi DB, trả `null` | `…:kho tat (enabled=false)` | unit | PASS |
| 12 | `schedule` trả về ngay; `drain` đợi tải xong | `…:schedule tra ve ngay lap tuc` | unit | PASS |
| 13 | Một tin lỗi không làm hỏng tin khác, không ném ra ngoài | `…:mot tin loi khong lam hong tin khac` | unit | PASS |
| 14 | Chặn tên miền chỉ trùng đuôi chuỗi (`evil-zdn.vn`, `zdn.vn.evil.com`) | `media-policy.spec.ts:chan ten mien chi TRUNG DUOI chuoi` | unit | PASS |
| 15 | Chặn địa chỉ nội bộ / metadata máy chủ đám mây | `media-policy.spec.ts:chan dia chi noi bo` | unit | PASS |
| 16 | Allowlist rỗng → chặn hết (fail closed) | `media-policy.spec.ts:danh sach rong` | unit | PASS |
| 17 | Khóa object gom theo năm/tháng UTC; id lạ → ném (chặn vượt thư mục) | `media-policy.spec.ts:buildMediaKey` ×3 | unit | PASS |
| 18 | `LocalMediaStore` từ chối khóa vượt ra ngoài thư mục gốc | `media-stores.spec.ts:tu choi khoa vuot ra ngoai` | unit | PASS |
| 19 | `S3MediaStore` gửi đúng `PutObjectCommand{Bucket,Key,Body,ContentType}` | `media-stores.spec.ts:put -> PutObjectCommand` | unit | PASS |
| 20 | `MEDIA_STORE` không đặt → `NoopMediaStore` (demo/CI không cần bucket) | `media.provider.spec.ts:khong dat gi` | unit | PASS |
| 21 | `s3` thiếu bucket/khóa → **ném lúc khởi động**, KHÔNG âm thầm về Noop | `media.provider.spec.ts:s3 nhung thieu bucket/khoa` | unit | PASS |
| 22 | `recordMedia` ghi khóa object / ghi `mediaError` / id không tồn tại không ném | `messages.repository.spec.ts` ×3 | unit | PASS |
| 23 | **Tin có ảnh → tải về, đẩy lên kho, ghi `mediaKey`/`mediaBytes` vào dòng tin** | `pipeline-media.spec.ts:tin co anh -> tai ve` | integration | PASS |
| 24 | Nhóm **chưa map** cũng lưu ảnh — chỉ nội dung bị chặn khỏi LLM | `pipeline-media.spec.ts:nhom CHUA map` | integration | PASS |
| 25 | **Tải ảnh hỏng → tin VẪN trong DB, chỉ ghi `mediaError`** | `pipeline-media.spec.ts:tai anh HONG` | integration | PASS |
| 26 | Tin trùng → không tải lại ảnh | `pipeline-media.spec.ts:tin TRUNG` | integration | PASS |
| 27 | Tin không có ảnh → không gọi ra mạng lần nào | `pipeline-media.spec.ts:tin khong co anh` | integration | PASS |

---

## 4. Coverage

```
vitest run src/media src/pipeline/pipeline-media.spec.ts --coverage --coverage.include='src/media/**'
File                     | % Stmts | % Branch | % Funcs | % Lines
All files                |   97.88 |    96.15 |   95.23 |   97.88
 media-policy.ts         |     100 |      100 |     100 |     100
 media-store.ts          |     100 |      100 |     100 |     100
 noop/local/s3 store     |     100 |      100 |     100 |     100
 media-fetcher.service.ts|   96.46 |    95.65 |   88.88 |   96.46   (con 54-55, 68-69)
 media.provider.ts       |   96.36 |    83.33 |     100 |   96.36   (con 31-32)
```

Ba chỗ còn hở là **phòng thủ cố ý**, không phải thiếu sót: lưới `catch` trong `schedule()` (không thể xảy ra vì `archive` đã bắt hết) · `onApplicationShutdown` (lifecycle NestJS) · guard trong provider trùng với fail-fast của `loadEnv`.

Toàn repo sau đợt: **api 430 passed / 21 skipped** · shared · web · route contract 8 · typecheck · lint — đều xanh. Mốc trước đợt: api **389+21** → **+41 test mới, không test cũ nào đổi trạng thái**.

---

## 5. Quyết định thiết kế đáng ghi

| Quyết định | Vì sao |
|---|---|
| Tải **ngoài** đường đi của tin (`schedule`, không `await`) | Mạng chậm không được làm chậm việc chốt đơn. `drain()` dùng cho test và cho lúc tắt máy (không bỏ rơi ảnh đang tải) |
| `sharp` vừa nén vừa **xác minh** | Một trang HTML "404" sẽ ném ở bước này thay vì nằm trong bucket dưới tên `.webp` |
| Đếm byte **trong lúc đọc**, không dùng thẳng `arrayBuffer()` | Máy chủ có thể không khai `content-length` hoặc khai dối — một phản hồi không giới hạn sẽ làm hết RAM tiến trình |
| `MEDIA_STORE=s3` thiếu cấu hình → **ném lúc khởi động** | Âm thầm quay về "không lưu" = ảnh mỗi ngày bị vứt mà không ai biết, và **không hồi tố được** |
| Chuẩn S3 chứ không `@google-cloud/storage` | Chốt 11/08: giữ GCP, sau chuyển OVHcloud ⇒ không khóa chặt vào Google |
| Không có rule `Delete` trong lifecycle | `CLAUDE.md` cấm để mất dữ liệu — chuyển tầng (Standard → Nearline 60n → Coldline 365n) chứ không xóa |

---

## 6. Đánh đổi & việc còn lại

**⚠️ Bẫy vận hành phải biết:** rule lifecycle nằm trên **bucket sao lưu** (`$BackupBucket` trong [deploy.ps1:367](../../deploy/netviet/deploy.ps1:367)). ⇒ `MEDIA_BUCKET` **phải trỏ đúng bucket đó**, nếu không rule prefix `media/` sẽ không có tác dụng nào mà cũng không báo lỗi. Điểm cộng: bucket đó đã có sẵn `--public-access-prevention` + `--uniform-bucket-level-access` — đúng yêu cầu "bucket private" cho ảnh chứa PII (phạm vi hồ sơ D22).

**Đánh đổi đã biết:**

| Điều | Chi tiết |
|---|---|
| Mặc định vẫn là `MEDIA_STORE=none` | Code đã sẵn sàng nhưng **chưa lưu ảnh nào** cho tới khi vận hành đặt `MEDIA_STORE=s3` + bucket + khóa HMAC. Đây là lựa chọn có chủ ý (demo/CI offline), **không phải** đã xong việc |
| Không backfill ảnh cũ | Runtime đã khóa `CHANNEL_MODE=mock` từ 08/08 nên chưa có tin Zalo thật nào trong DB để backfill. Nếu sau này có, cần một script quét `imageUrl != null AND mediaKey IS NULL` |
| Chưa có đường **đọc lại** ảnh | DB giữ `mediaKey`; chưa có endpoint/UI mở ảnh từ bucket. Thuộc Đợt C/E (spec 2.3), không phải Task 2 |
| `mediaError` chưa hiện lên UI | Người vận hành chưa thấy được tin nào tải ảnh hỏng. Cần thêm vào `/settings` — việc nhỏ, thuộc đợt sau |
| Ảnh chỉ lưu bản **đã nén** (1600px WebP q80) | Đủ đọc biên bản giao hàng; không giữ bản gốc. Nếu sau này cần bản gốc cho tranh chấp pháp lý thì phải đổi quyết định này **trước khi** bật production |

⇒ **Task 2 đã bịt đường mất ảnh về mặt code; việc còn lại là một quyết định vận hành** (cấp bucket + khóa HMAC, đặt `MEDIA_STORE=s3`), không phải việc lập trình.
