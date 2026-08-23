# Bằng chứng — A/B quy trách nhiệm + audit trước khi reset `pocwf` (23/08/2026)

> Ghi **trước** khi chạy `docker compose -p pocwf … down -v`.
> Liên quan: [.claude/plans/hatchet-deployment-gates.plan.md](../../../.claude/plans/hatchet-deployment-gates.plan.md) · handoff §22 §26 §27①

## 1. Vì sao phải reset

Bộ IT đầy đủ (`vitest run src/workflow --no-file-parallelism`) chạy **hai lần** cho **hai tập bài
đỏ khác nhau**:

| Lần | Số đỏ | Bài |
|---|---|---|
| 1 | 5 | e2e "đi trọn chuỗi", e2e "v1 đang dở không bị v2 cướp", W4 traceId, W5 "TIMEOUT MƠ HỒ", W7 |
| 2 | 7 | e2e "500 hai lần", W4 traceId, W8 riêng tư, W5 "engine CHẾT", W5 "TIMEOUT MƠ HỒ", W6, W7 |

Chỉ **3 bài trùng nhau** ⇒ **không tất định**. Triệu chứng đều là *run không tiến triển*
("chưa vào được bước dispatch", "mới 4/6 · 5/6 run xong"), **không** phải khẳng định sai.

## 2. A/B quy trách nhiệm — đo, không suy đoán

Phương pháp: sao lưu 5 file của D1 ra scratchpad → `git show 8e22047:<path>` ghi đè → chạy cùng
bài trên **cùng** engine → khôi phục. **Không** dùng `git stash` (cây làm việc có việc song song
của phiên khác).

| Bài | Code gốc `8e22047` | Code D1 (`2bb40e7`) |
|---|---|---|
| W6 — worker `kill -9` giữa chừng | ❌ HẾT GIỜ 90 s: "run chưa vào được bước dispatch" | ✅ XANH (39 235 ms) |
| W7 — hai worker cùng phiên bản | ❌ HẾT GIỜ 240 s: "mới 5/6 run xong" | ❌ HẾT GIỜ 240 s: "mới 5/6 run xong" |

**Kết luận: baseline hỏng BẰNG hoặc TỆ HƠN ⇒ các bài đỏ còn lại KHÔNG do D1 gây ra.**

Thêm một phép đo củng cố: chỉ `docker compose restart hatchet-engine` (không xoá gì) đã làm **W6
từ ĐỎ chuyển XANH**. Trạng thái engine là một biến số thật.

Giả thuyết khớp §27①: mọi worker cùng phiên bản đăng ký dưới **cùng một tên**
(`workflow-worker-integration-handoff-v1`). Stack chạy >24 giờ qua nhiều vòng `stop/start` tích
luỹ đăng ký cũ; engine định tuyến việc tới bản sao đã chết và run nằm chờ.

⚠️ **Nếu bộ IT vẫn đỏ trên engine SẠCH thì giả thuyết này SAI** — khi đó phải điều tra tính đúng
đắn của đăng ký worker / cách ly test, **không** được gọi là ô nhiễm môi trường nữa.

## 3. Hồi quy CÓ THẬT do D1 gây ra — đã sửa (`a89306b`)

```
Error: listen EADDRINUSE: address already in use 127.0.0.1:8085
```

Tiến trình worker mở điểm cuối health trên cổng **cố định**. Trên production đúng — mỗi worker một
container, một không gian cổng riêng. Nhưng harness IT chạy nhiều worker như **tiến trình trên
cùng một máy** ⇒ worker thứ hai chết trước khi báo READY. Trúng đúng các bài có **từ hai worker**.

Đã sửa hai tầng: harness cấp cổng riêng từng `WorkerProcess`; `worker-main.ts` đổi `EADDRINUSE` thô
thành `WORKFLOW_WORKER_HEALTH_PORT_UNAVAILABLE` có giải thích.

## 4. Xác nhận KHÔNG có dữ liệu khách / production

Đọc thẳng từ Postgres của engine, không suy từ thiết kế:

```sql
SELECT DISTINCT input::text FROM v1_dag_data LIMIT 5;
-- {}
```

`input` **rỗng hoàn toàn**. `additional_metadata` chỉ chứa neo tương quan:

```json
{"traceparent":"00-<32 hex>-<16 hex>-01","nexagnet.tenant":"ultty",
 "nexagnet.traceId":"<32 hex>","nexagnet.entityId":"cmt552s6g0000h2skfxub0w39",
 "nexagnet.entityType":"work-item","nexagnet.environment":"test",
 "nexagnet.workflowKey":"integration-handoff","nexagnet.workflowVersion":"v1"}
```

Mọi bản ghi mang `environment: "test"`. `entityId` là định danh **nội bộ** (cuid do Prisma sinh
trong DB test, hoặc id tổng hợp `WI-*` do bài kiểm sinh). Không SĐT, không địa chỉ, không tên
người, không dữ liệu thương mại. Chuỗi `ultty` xuất hiện là **slug khách**, không phải dữ liệu của
khách.

→ Đây đồng thời là §28 tự chứng minh: thứ bảo vệ `input` là **HỢP ĐỒNG danh sách trắng**, và ở đây
hợp đồng cho ra một object rỗng.

## 5. Audit hạ tầng trước khi xoá

**Container của `pocwf`** (5):

```
pocwf-hatchet-dashboard-1   hatchet-dashboard:v0.101.27   Up 24 hours
pocwf-hatchet-engine-1      hatchet-engine:v0.101.27      Up 18 minutes
pocwf-postgres-1            postgres:15.6                 Up 24 hours (healthy)
pocwf-setup-config-1        hatchet-admin:v0.101.27       Exited (0)
pocwf-migration-1           hatchet-migrate:v0.101.27     Exited (0)
```

**Volume `-p pocwf down -v` sẽ xoá — ĐÚNG 3 cái:**

```
pocwf_pocwf_certs
pocwf_pocwf_config            ⚠️ giữ cấu hình sinh bởi quickstart (có khoá mã hoá)
pocwf_pocwf_postgres_data     lịch sử run của các gate W4–W12
```

**Volume KHÔNG bị đụng** (thuộc compose project khác, liệt kê ra để đối chiếu):

```
z_pgdata  z_redisdata                                    ← DB nghiệp vụ local dev
zalo-ultty-contract_postgres-data  …_flowise-data        ← stack hợp đồng của khách
ai-accounting-demo_pgdata  app_ke_toan_pgdata  fcc-router_fcc-data  vieneu_hf
```

**Dung lượng lúc audit:** images 80,62 GB (64,88 GB thu hồi được) · volumes 974,3 MB · build cache
71,11 GB. **KHÔNG prune** — chỉ `down -v` đúng một project.

**Mạng:** `pocwf_default` (bridge), không dùng chung với stack nào.

## 6. Cái mất khi xoá — chấp nhận có chủ đích

Lịch sử run của W4–W12 trên engine. **Không phải mất bằng chứng**: kết luận từng gate đã nằm trong
handoff §22 và trong chính các file test chạy lại được. Đây đúng là điều runbook §6 cảnh báo —
*lịch sử run KHÔNG phải kho lưu trữ* — và nó áp dụng cho cả POC.

Token `HATCHET_CLIENT_TOKEN` hiện tại **hết hiệu lực** sau khi xoá; phải đúc lại và ghi vào
`tools/poc-workflow-engine/.env` (đã gitignore).

## 7. Kết quả sau reset — GIẢ THUYẾT ĐÚNG

```
Test Files  20 passed (20)
Tests      189 passed (189)
```

Bộ IT đầy đủ **XANH HOÀN TOÀN** trên engine sạch, cùng lệnh và cùng code đã cho 5 rồi 7 bài đỏ
trên engine cũ. Cộng với A/B ở §2 (baseline hỏng bằng hoặc tệ hơn), kết luận khép kín:

**Nguyên nhân là trạng thái tích luỹ của engine POC, KHÔNG phải hồi quy code và KHÔNG phải test
mong manh.**

### Quy trình vận hành rút ra — cho các phiên sau

Engine POC **thoái hoá** sau nhiều vòng `docker stop/start` (bài W5/W6/W7 cố ý giết engine và
worker). Cơ chế khớp §27①: mọi worker cùng phiên bản đăng ký dưới **cùng một tên**
`workflow-worker-integration-handoff-v1`, nên đăng ký của các tiến trình đã chết tích lại và engine
định tuyến việc tới bản sao không còn tồn tại → run nằm chờ.

**Trước khi tin một kết quả IT ĐỎ, hãy dựng lại engine sạch rồi đo lại.** Chi phí ~2 phút, và nó
phân biệt được "code hỏng" với "engine mệt" — hai thứ có triệu chứng giống hệt nhau
(*run không tiến triển*).

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml down -v
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
MSYS_NO_PATHCONV=1 docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml   run --rm --no-deps setup-config /hatchet/hatchet-admin token create   --config /hatchet/config --tenant-id 707d0855-80ab-4e1f-a156-f1c4546cbf52
```

Tenant id `707d0855-…` đã **đọc lại từ DB** (`SELECT id,name,slug FROM "Tenant"`) chứ không tin
hằng số trong README — và nó khớp, nên hằng số đó là mặc định của `quickstart`.

⚠️ **Điều này KHÔNG được dùng làm lời bào chữa mặc định.** Nếu bộ IT đỏ trên engine VỪA dựng sạch
thì nguyên nhân là code hoặc cách ly test, và phải điều tra như vậy.

⛔ **VÀ NÓ KHÔNG PHẢI GIẢI PHÁP PRODUCTION.** Đoạn trên là thủ tục **CHẨN ĐOÁN** cho máy dev, chỉ
vậy thôi. Một hệ production không thể yêu cầu xoá volume để chạy tiếp — nếu `gd1-test` cần điều đó
thì đấy là một lỗi phải sửa, không phải một quy trình vận hành.

### Hệ quả cho D2 — deploy production

⚠️ **Nguyên nhân ở §2 vẫn là GIẢ THUYẾT, chưa chứng minh.** Việc reset làm bộ test xanh lại là
bằng chứng *tương quan*, không phải bằng chứng *cơ chế*. Hai khả năng còn mở:

| Khả năng | Hệ quả |
|---|---|
| chỉ là artifact của POC/harness (nhiều tiến trình một máy, cùng `workerName`, vòng đời do test điều khiển) | không phải lỗi production |
| Hatchet **thật sự** tích đăng ký worker chết theo thời gian | `gd1-test` thoái hoá dần theo mỗi lần deploy; §27① thành **PHẢI làm** |

Đã thêm **cổng D9-b** vào kế hoạch để trả lời dứt điểm: churn/soak trên **cùng một** engine,
**không** reset volume, nhiều vòng `start → kill → restart` cùng phiên bản, rồi chứng minh run mới
vẫn được worker sống nhận và hoàn tất. Đo số vòng, thời gian nhận việc theo vòng, số đăng ký engine
giữ cho cùng `workerName`, và lease có tự hết hạn không.

Nếu phải đổi `workerName` để có danh tính tiến trình: **research hành vi chính thức của Hatchet
trước, chứng minh bằng test, rồi mới đổi.** `workerName` là thứ engine định tuyến theo.
