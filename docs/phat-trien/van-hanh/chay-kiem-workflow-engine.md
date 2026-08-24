# Chạy kiểm workflow engine — hướng dẫn dùng

> Đối tượng đọc: **người vận hành và chủ dự án**, không cần biết Hatchet là gì.
> Kỹ sư sửa pipeline đọc [`ci-cd.md`](ci-cd.md) §3. Vận hành engine trên VM đọc
> [`workflow-engine-runbook.md`](workflow-engine-runbook.md).
> Ngày: **24/08/2026**

---

## 1. Một câu

Từ 24/08/2026, CI có thêm một cổng tên **`workflow-integration`**: nó **dựng một workflow engine
thật** rồi chạy **24 bài kiểm** trên đó. Trước ngày đó, 24 bài này **tự bỏ qua chính chúng** ở mọi
lần chạy CI — im lặng, không một dòng cảnh báo.

## 2. Vì sao chuyện này đáng quan tâm

"Workflow engine" là bộ phận đảm bảo **một việc đã nhận thì không mất**: máy chết giữa chừng, mạng
đứt, engine tắt điện — việc vẫn được làm tiếp, và **không bị làm hai lần**. Đó là thứ đứng giữa
"đơn đã chốt" và "đơn đã được bàn giao".

Trước 24/08:

| | |
|---|---|
| CI báo | ✅ xanh |
| Số bài kiểm workflow engine thực sự chạy | **0 / 24** |
| Nên câu "CI xanh" chứng minh được gì về engine | **không gì cả** |

Đây không phải suy đoán — đo được trên đúng một lần chạy CI thật (merge SHA `302d5b1e`): sáu tệp
kiểm, tổng đúng 24 bài, tất cả ở trạng thái `skipped`.

Lý do kỹ thuật rất đời thường: các bài kiểm này chỉ chạy khi có **công tắc** `RUN_WORKFLOW_IT=1`.
Công tắc đó **chưa từng được bật** trong cấu hình CI. Một bộ kiểm tự tắt chính nó thì **luôn xanh** —
và đó là kiểu xanh giả nguy hiểm nhất, vì nó đặt tên cho một bằng chứng không tồn tại.

Sau 24/08: công tắc được bật, và có thêm **một bộ canh** không cho ai tắt lại trong im lặng
(mục 7).

## 3. Đọc kết quả CI

Mỗi lần mở PR hoặc đẩy lên `main`, CI chạy **7 cổng**. Cổng cần nhìn ở đây tên là
**`workflow-integration`**.

```bash
gh run list --workflow=ci.yml --limit 1
```

Xem từng cổng của một lần chạy:

```bash
gh run view <run-id>
```

| Cổng | Chứng minh điều gì |
|---|---|
| `verify` | lint · kiểu · toàn bộ test không cần hạ tầng · build không lộ tên khách |
| `integration` | Postgres **thật** — migration, đơn hàng, cấu hình, nhật ký kiểm toán |
| **`workflow-integration`** | **engine Hatchet thật** — 24 bài về mất việc, làm trùng, engine chết, worker bị giết |
| `tenant-packs` | mọi gói khách trong `tenants/` nạp được bằng loader thật |
| `e2e` | Playwright trên giao diện |
| `audit` | lỗ hổng phụ thuộc mức cao |
| `images` | hai Dockerfile build được, và image **không chứa dữ liệu khách nào** |

**Cổng `workflow-integration` chạy lâu hơn hẳn các cổng khác.** Số đo thật:

| Nơi chạy | Thời gian bộ IT |
|---|---:|
| Runner GitHub (24/08/2026, hai lần chạy) | **279 s** · **262 s** |
| Máy dev Windows + Docker Desktop | **570 s** |

Runner **nhanh gấp đôi máy dev** — nên nếu thấy nó lâu hơn nhiều, đó là tín hiệu chứ không phải
chuyện thường. Chờ là chính nội dung của phép đo: một trong các bài cố ý tắt engine rồi bật lại rồi
chờ nó phục hồi. Thời hạn của cổng đặt ở 60 phút, rộng có chủ đích.

## 4. Chạy lại đúng thứ đó trên máy mình

Cần: **Docker Desktop đang chạy** và Postgres nghiệp vụ của repo.

**Bước 1 — Postgres nghiệp vụ**

```bash
docker compose -f docker-compose.yml up -d postgres
```

```bash
pnpm --filter @netviet/api exec prisma migrate deploy --schema prisma/schema.prisma
```

**Bước 2 — dựng engine và lấy vé vào cửa (token)**

```bash
export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
```

Một dòng này làm cả bốn việc: dựng cụm engine → đợi cổng mở → đọc đúng tenant của engine → đúc
token. Token **không hiện ra màn hình**, nó đi thẳng vào biến môi trường.

**Bước 3 — chạy 24 bài**

```bash
RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_HOST_PORT=127.0.0.1:7744 WORKFLOW_ENGINE_TLS_STRATEGY=none DATABASE_URL=postgresql://netviet:netviet_local@localhost:5432/netviet pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

Kết quả mong đợi (đo thật 24/08/2026 trên máy dev, engine vừa dựng sạch):

```
Test Files  22 passed (22)
     Tests  201 passed (201)
  Duration  570.43s
```

> **Nhìn vào dòng `Tests`, đó là chỗ nói thật.** `201 passed (201)` nghĩa là cả 24 bài đã chạy.
> Nếu thiếu cờ, dòng đó sẽ thành `177 passed | 24 skipped (201)` — và **màn hình vẫn xanh**. Đó
> chính xác là thứ đã xảy ra trên CI suốt nhiều tuần trước 24/08/2026.

Trong 201 bài đó có đúng **24 bài chạy trên engine thật**:

| Tệp | Số bài | Lâu |
|---|---:|---:|
| `workflow-privacy-engine-read.int.spec.ts` | 9 | 18s |
| `workflow-recovery.int.spec.ts` | 4 | 193s |
| `workflow-e2e.int.spec.ts` | 3 | 92s |
| `workflow-outbox-durability.int.spec.ts` | 3 | 61s |
| `worker-readiness.int.spec.ts` | 3 | 74s |
| `workflow-worker-recovery.int.spec.ts` | 2 | 79s |

**Dọn dẹp khi xong:**

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml down -v
```

## 5. Ba chữ trong dòng lệnh trên, đừng bỏ chữ nào

| Chữ | Bỏ đi thì sao |
|---|---|
| `RUN_WORKFLOW_IT=1` | **cả 24 bài tự bỏ qua**, màn hình vẫn xanh, và bạn không kiểm gì cả |
| `RUN_PRISMA_IT=1` | **18/24 bài** im lặng bỏ qua (chúng cần cả Postgres nghiệp vụ lẫn engine) |
| `--no-file-parallelism` | **9 bài đỏ** — xem mục 6.1 |

## 6. Khi đỏ — đọc theo thứ tự này, đừng đoán

### 6.1 Đỏ 9 bài cùng lúc, kiểu "chờ mãi không thấy gì"

Gần như chắc chắn là **thiếu `--no-file-parallelism`**.

Lý do không phải "test mong manh". Năm tệp kiểm đều đăng ký **cùng một tên công việc**
(`integration-handoff.v1`) với **cùng một engine**. Engine giao việc **theo tên**, nên chạy song
song thì worker của tệp A nhận việc do tệp B tạo ra, rồi gửi kết quả về địa chỉ **của A**. Tệp B
ngồi chờ một cuộc gọi không bao giờ tới.

Đây là **bản diễn lại chạy được** của một bất biến quan trọng của nền tảng: **mỗi khách / mỗi môi
trường phải có MỘT engine riêng**. Hai khách trỏ chung một engine thì họ sẽ cướp việc của nhau và
gửi dữ liệu của nhau ra ngoài. Đó là lỗi **cách ly dữ liệu giữa khách hàng**, không phải phiền toái
lịch chạy.

### 6.2 Đỏ trên máy mình sau khi đã chạy đi chạy lại nhiều lần

Engine trên máy dev **thoái hoá** sau nhiều vòng tắt/bật. Các bài kiểm **cố ý** `docker stop` engine
và giết worker; đăng ký của những tiến trình đã chết tích lại, engine tiếp tục giao việc cho bản sao
không còn tồn tại. Triệu chứng: run **không tiến triển** — trông y hệt code hỏng.

Trước khi tin một kết quả đỏ:

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml down -v
```

rồi làm lại bước 2 và bước 3.

> **Nhưng đỏ trên một engine vừa dựng sạch thì KHÔNG được gọi là "ô nhiễm môi trường".** Lúc đó phải
> đi tìm nguyên nhân trong code. Trên CI mỗi lần chạy là một máy mới, nên trường hợp này **không**
> áp dụng cho CI.

### 6.3 Đỏ vì "hết giờ chờ worker"

Worker mất **6–38 giây** để đăng ký xong — biến động lớn, đo thật nhiều lần. Nếu bạn thấy ai đó
định siết các thời hạn chờ cho "gọn", đó là đang biến một máy chậm thành một lỗi giả.

### 6.4 Đỏ đúng một bài, còn 200 bài kia xanh

Đọc **dòng khẳng định**, đừng đọc tên bài. Lần chạy CI đầu tiên (24/08/2026) đỏ đúng một bài
`worker-readiness` với `expected false to be true` — trong khi chính bài đó, hai dòng phía trên, đã
gọi `/ready` và **nhận 200**. Tức sản phẩm không sai; **phép đo** sai: nó bảo một vòng lấy mẫu chạy
đua với dòng lệnh tắt chính nó, và trên máy dev thì nó thắng còn trên runner thì nó thua.

Bài học dùng được: khi một bài đỏ mà **các khẳng định khác trong cùng bài lại nói ngược lại**, gần
như chắc chắn là lỗi đua trong cách đo, không phải lỗi trong thứ được đo. Sửa bằng cách **chờ có
thời hạn** cho tới khi điều kiện xảy ra, đừng nới lỏng khẳng định.

### 6.5 Đỏ ở bước dựng engine

Script sẽ in ra trạng thái container và 50 dòng log cuối của engine. Hai nguyên nhân thường gặp:
Docker Desktop chưa chạy, hoặc cổng `7744`/`8744`/`5744` đang bị thứ khác chiếm.

## 7. Những việc KHÔNG được làm

- **Không tắt `RUN_WORKFLOW_IT` trong `ci.yml` để "cho CI nhanh".** Có một bộ canh chặn việc này:
  `deploy/netviet/workflow-isolation.contract.test.mjs`. Bỏ công tắc, bỏ `--no-file-parallelism`,
  hay đổi tên cụm engine đều làm bộ canh **đỏ ngay**, kèm câu giải thích lý do.
- **Không xoá thư mục `tools/poc-workflow-engine/`.** Nó từng được coi là bỏ đi được; nay CI và hai
  tệp kiểm trỏ vào đó bằng đường dẫn ghi cứng.
- **Không copy cách đúc token của `start-engine.sh` sang đường production.** Bản production
  (`deploy/netviet/bootstrap-workflow-engine.sh`) **cố ý** từ chối đúc token lần hai; cụm của CI thì
  sinh ra rồi chết trong một lần chạy nên không cần cổng đó.
- **Không dùng cụm này để chạy dữ liệu thật của khách.** Nó không có mật khẩu riêng, không TLS, và
  cổng mở thẳng ra máy bạn.

## 8. Liên quan

- [`ci-cd.md`](ci-cd.md) — bản đồ pipeline, 7 bất biến, 6 sự cố đã xảy ra thật.
- [`workflow-engine-runbook.md`](workflow-engine-runbook.md) — vòng đời phiên bản workflow, bảo mật,
  kế hoạch tài nguyên trên VM.
- [`debugging.md`](debugging.md) — lần vết một nghiệp vụ chạy sai từ tin nhắn tới quyết định.
- [`../ke-hoach/ban-giao-workflow-engine.md`](../ke-hoach/ban-giao-workflow-engine.md) — nhật ký từng
  phiên và bằng chứng thô.
