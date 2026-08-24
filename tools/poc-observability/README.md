# POC quan sát — OpenTelemetry runtime + ClickStack

> **Đây là bộ đo, không phải hợp đồng triển khai.** Mọi thứ trong thư mục này tồn tại để trả lời
> một câu hỏi — *"debug được phần lớn hệ thống mà không đọc source code không?"* — rồi bị xoá.
> Không cấu hình nào ở đây được mang sang stack khách.

Phiên đo: 24/08/2026. File này chỉ mô tả **cách chạy lại**; kết quả nằm trong báo cáo phiên.

## Điều kiện

- Docker (đã đo trên engine 29.6.1, VM Linux 8 GiB)
- Node 22+ · pnpm 10.34.4
- Postgres local đang chạy: `docker compose -p z up -d postgres`
- API đã build: `pnpm --filter @netviet/api build`

## Cổng dùng (chọn để không đụng stack nào đang chạy)

| Cổng | Thành phần |
|---|---|
| 8766 | HyperDX UI |
| 4766 / 4767 | OTLP HTTP / gRPC của ClickStack |
| 8767 | ClickHouse HTTP (chỉ để đo, không cho ứng dụng gọi) |
| 4788 / 4789 / 4790 | proxy bắt OTLP (mức `full` / `redacted` / workflow) |
| 4799 | máy chủ gây lỗi có điều khiển |
| 3399 | API của phiên POC |

Đang bị chiếm bởi việc khác: 5432 · 6379 (dev stack) · 5744 · 7744 · 8744 (`pocwf`).

## Chạy

```bash
docker compose -p pocobs -f tools/poc-observability/compose/clickstack.compose.yml up -d
```

```bash
node tools/poc-observability/src/fault-endpoint.mjs --port 4799
```

```bash
node tools/poc-observability/src/otlp-capture.mjs --port 4788 --forward http://127.0.0.1:4766 --out tools/poc-observability/evidence/otlp
```

API, với OTel nạp **trước** mọi dependency (`--import`, không phải một dòng trong `main.ts` —
lý do nằm ở đầu `apps/api/src/observability/otel/otel-runtime.ts`):

```bash
cd apps/api && set -a && . ../../tools/poc-observability/.env.poc && set +a && node --import ./dist/observability/otel/otel-preload.js dist/main.js
```

## Đo

```bash
node tools/poc-observability/src/drive.mjs --n 60 --warmup 10 --label otel-on
```

```bash
node tools/poc-observability/src/analyze-spans.mjs --dir tools/poc-observability/evidence/otlp
```

```bash
node tools/poc-observability/src/grep-secrets.mjs --dir tools/poc-observability/evidence/otlp
```

Cây của một lượt cụ thể:

```bash
node tools/poc-observability/src/analyze-spans.mjs --trace <traceId>
```

## Vì sao có proxy bắt OTLP

Bài unit test chứng minh **quy tắc** lọc đúng. Nó không chứng minh quy tắc đó được **áp dụng**
trên đường ra thật: một processor quên đăng ký, một exporter thứ hai ai đó thêm vào, một thuộc
tính do instrumentation đặt *sau* khi bộ lọc chạy — cả ba đều đi qua được mọi unit test.
`otlp-capture.mjs` ghi từng byte xuống đĩa để `grep-secrets.mjs` quét trên dữ liệu **đã gửi**.

## Bí mật trong `.env.poc` đều là bẫy dò

Không lấy từ `.env` thật. Một phiên đo không được phép cầm khoá thật đi qua một proxy ghi mọi
byte xuống đĩa. Các chuỗi `POCFIXTURE...` được đặt để `grep-secrets.mjs` có thứ để tìm.

## Cảnh báo: ClickStack ở đây chạy KHÔNG XÁC THỰC

`IS_LOCAL_APP_MODE=DANGEROUSLY_is_local_app_mode💀` — chế độ local của chính nhà cung cấp. Chấp
nhận được **chỉ khi cả ba** đúng: cổng chỉ mở trên `127.0.0.1`, dữ liệu là test không có PII thật,
và stack bị xoá khi xong. Một backend quan sát không xác thực là toàn bộ nội dung nghiệp vụ mở cho
bất kỳ ai chạm tới được cổng.

## Xoá sạch

```bash
docker compose -p pocobs -f tools/poc-observability/compose/clickstack.compose.yml down -v
```

Lệnh trên xoá cả hai volume (`pocobs_data`, `pocobs_logs`). Thư mục `evidence/` đã nằm trong
`.gitignore`; xoá tay nếu muốn.
