# POC — durable workflow engine (Hatchet)

> Kết quả & quyết định: [`docs/kien-truc/workflow-engine-evaluation.md`](../../docs/kien-truc/workflow-engine-evaluation.md)
> Bằng chứng thô: [`evidence/poc-run-log.md`](evidence/poc-run-log.md)

**Đây là POC, KHÔNG nằm trong đường chạy production.** Không file nào trong `apps/` hay
`packages/` import mã nguồn trong thư mục này.

> ⚠️ **NHƯNG THƯ MỤC NÀY KHÔNG CÒN XOÁ ĐƯỢC.** Câu "xoá cả thư mục là hết dấu vết" đã **hết đúng**
> từ 24/08/2026. Bốn chỗ ngoài POC trỏ vào đây bằng **đường dẫn ghi cứng**:
>
> | Nơi trỏ tới | Trỏ vào cái gì |
> |---|---|
> | `.github/workflows/ci.yml` — job `workflow-integration` | `start-engine.sh` + `compose/hatchet.compose.yml` |
> | `apps/api/src/workflow/worker-readiness.int.spec.ts` | `docker compose -p pocwf … stop/start hatchet-engine` |
> | `apps/api/src/workflow/workflow-recovery.int.spec.ts` | như trên |
> | `deploy/netviet/workflow-isolation.contract.test.mjs` | canh cho ba chỗ trên **không lệch nhau** |
>
> Hai tệp `*.int.spec.ts` **điều khiển** cụm này để mô phỏng engine chết. Nếu CI hoặc test đổi sang
> tên compose project khác, `docker compose start` sẽ im lặng không làm gì (project không tồn tại),
> engine thật vẫn chạy, và bài "engine chết rồi sống lại" đỏ vì một lý do không liên quan đến code.
> Muốn xoá/di chuyển thư mục này thì phải sửa **cả bốn** chỗ trong cùng một commit.
>
> Cụm ở đây là engine của **máy dev và của CI** — không phải cụm production. Cụm production nằm ở
> `deploy/netviet/compose.yaml` sau `--profile workflow`, cổng **không** phát ra host, và nó có
> script đúc token riêng (`deploy/netviet/bootstrap-workflow-engine.sh`) fail-closed.

Cài bằng `pnpm install --ignore-workspace` nên **`pnpm-lock.yaml` gốc của repo không bị đổi**.

## Dựng cụm + đúc token — MỘT dòng

`start-engine.sh` làm cả ba việc (dựng cụm → đợi cổng mở → đúc token) và in **duy nhất** token ra
stdout. Đây là **đúng script CI chạy**, nên chạy lại nó trên máy mình là tái hiện được CI:

```bash
export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
```

Nó đọc tenant id theo `slug = 'default'` từ Postgres của engine chứ **không ghi cứng UUID** — bản
Hatchet sau đổi UUID vẫn chạy, còn nếu họ đổi cả `slug` thì script **dừng hẳn** thay vì đúc token
cho nhầm tenant. Cùng lý lẽ với `deploy/netviet/bootstrap-workflow-engine.sh`.

## Chạy lại từ đầu — làm tay từng bước (khi cần gỡ rối)

```bash
# 1. Dựng Hatchet self-host (3 container, ~270 MB RAM, ~60s)
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d

# 2. Tạo token API (Git Bash: cần MSYS_NO_PATHCONV=1 để không bị đổi đường dẫn)
MSYS_NO_PATHCONV=1 docker compose -f tools/poc-workflow-engine/compose/hatchet.compose.yml \
  run --rm --no-deps setup-config /hatchet/hatchet-admin token create \
  --config /hatchet/config --tenant-id 707d0855-80ab-4e1f-a156-f1c4546cbf52
```

Đưa token vào `tools/poc-workflow-engine/.env` (file này đã được `.gitignore`):

```
HATCHET_CLIENT_TOKEN=<token>
HATCHET_CLIENT_TLS_STRATEGY=none
HATCHET_CLIENT_HOST_PORT=localhost:7744
POCWF_ENDPOINT_PORT=8745
```

```bash
cd tools/poc-workflow-engine
pnpm install --ignore-workspace
pnpm typecheck

# 3. Hai tiến trình nền
pnpm endpoint      # điểm cuối HTTP có kiểm soát (đóng vai hệ ngoài)
pnpm worker        # worker chạy code workflow (v1)
```

## Các kịch bản đã chứng minh

```bash
# 1. Run thành công 5 bước
pnpm trigger -- --mode=ok --orderRef=DEMO-1 --approvalTimeout=15s

# 2. Run LỖI — payload hỏng, không retry
pnpm trigger -- --invalid --orderRef=DEMO-BAD

# 3. Retry thật — hỏng 2 lần rồi thành công (backoff luỹ thừa)
pnpm trigger -- --mode=fail_then_ok --failTimes=2 --orderRef=DEMO-RETRY

# 3b. Bị chặn tốc độ
pnpm trigger -- --mode=rate_limited --orderRef=DEMO-429

# 4. WORKER CHẾT GIỮA CHỪNG
pnpm trigger -- --mode=ok --orderRef=DEMO-CRASH --approvalTimeout=120s
#    -> giết tiến trình worker, khởi động lại `pnpm worker`, rồi duyệt:
pnpm trigger -- --approve=<runId>
#    Kiểm: http://localhost:8745/_state  — khoá DEMO-CRASH phải là 1, KHÔNG phải 2

# 5. Huỷ / 6. Replay
pnpm trigger -- --cancel=<runId>
pnpm trigger -- --replay=<runId>

# 7. Phiên bản: đang có run chờ duyệt thì đổi worker sang v2
pnpm worker:v2

# 8. Đọc lại run (cây bước, lần thử, input/output, traceparent)
npx tsx src/inspect.ts <runId>
```

Dashboard: `http://localhost:8744` (tài khoản seed do `hatchet-admin quickstart` tạo).

## GATE A — spike ghim phiên bản (chạy được một lệnh)

Thí nghiệm **có đối chứng**: cùng một kịch bản, chỉ khác cách đặt tên workflow.

```bash
pnpm spike:shared      # đối chứng — PHẢI FAIL (v1/v2 dùng chung một tên)
pnpm spike:versioned   # phương án  — PHẢI PASS (tên mang phiên bản `.v1`/`.v2`)
```

Cả hai tự dựng/tắt worker con, tự dọn run mồ côi của lần trước, và ghi kết quả ra
`evidence/version-spike-<strategy>.json`. Script **thoát khác 0 nếu kết quả khác kỳ vọng** —
kể cả khi `shared` bỗng PASS, vì lúc đó phép đo đã mù.

Kết luận + cơ chế: [`evidence/version-gate-a.md`](evidence/version-gate-a.md).

## Dọn sạch

```bash
docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml down -v
```

`down -v` chứ không chỉ `down`: các bài W5/W6/W7 **cố ý** `docker stop` engine và `kill -9` worker,
nên đăng ký của những tiến trình đã chết tích lại trong Postgres của engine và engine sẽ giao việc
cho bản sao không còn tồn tại. Triệu chứng là **run không tiến triển — trông y hệt code hỏng**.
Trước khi tin một kết quả ĐỎ: `down -v` → `start-engine.sh` → đo lại. Nhưng đỏ trên engine vừa dựng
sạch thì **không** được gọi là ô nhiễm môi trường; lúc đó phải điều tra code.

Xoá hẳn thư mục thì xem cảnh báo ở đầu tệp — có bốn chỗ ngoài POC trỏ vào đây.

## File

| File | Vai |
|---|---|
| `compose/hatchet.compose.yml` | Hatchet self-host tối thiểu (bỏ RabbitMQ, ghim v0.101.27) |
| `start-engine.sh` | **CI dùng tệp này.** Dựng cụm → đợi cổng 7744 (gRPC) + 8744 (REST) → đúc token, in token ra stdout |
| `src/workflow.ts` | Workflow trung tính 5 bước — `POCWF_VERSION` đổi v1/v2 |
| `src/worker.ts` | Tiến trình worker (giết nó để thử recovery) |
| `src/trigger.ts` | Kích hoạt + sinh `traceparent` W3C đúng khuôn Nexagnet |
| `src/proof-endpoint.ts` | Hệ ngoài giả lập — trả 500/429/treo theo yêu cầu |
| `src/tenant-binding.ts` | Ràng buộc theo khách (fixture trung tính, không tên khách thật) |
| `src/inspect.ts` | Đọc lại run qua SDK |
