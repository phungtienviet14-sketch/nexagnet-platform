# PoC Parser — Eval độ ổn định phân loại intent

Đo **độ chính xác phân loại 7 intent** của parser (DeepSeek/Claude/mock) qua **đúng pipeline thật**
(gọi API `/demo/simulate`), để verify **trước buổi demo** khi chạy `PARSER_MODE=deepseek`.

## Cách chạy

1. Chạy API với parser cần đo (ví dụ AI thật):
   ```bash
   PARSER_MODE=deepseek BOT_MODE=off pnpm dev:api      # cần DEEPSEEK_API_KEY trong .env
   ```
2. Chạy eval (terminal khác):
   ```bash
   pnpm --filter @ultty/poc-parser eval
   ```

Kết quả: bảng % đúng theo từng intent + tổng + danh sách tin phân loại sai (`expected → got`).
Ngưỡng đề xuất demo: **intent-accuracy ≥ 90%**. Nếu chưa đạt → tune prompt/few-shot ở
[apps/api/src/pipeline/parser-prompt.ts](../../apps/api/src/pipeline/parser-prompt.ts) +
[packages/shared/src/intents.ts](../../packages/shared/src/intents.ts).

## Dữ liệu

`eval-set.json` — 35 tin nhắn Zalo tiếng Việt (không dấu, viết tắt) phủ 7 intent + bẫy TH2/nhiều SP/
glossary/adversarial, mỗi tin gắn `expectedIntent`. Khi có **tin thật của khách** (checklist B1-B2),
bổ sung/thay vào đây + thêm golden output để đo cả field-accuracy.

## Biến môi trường
`API_URL` (mặc định `http://localhost:3001`) · `EVAL_CHAT_ID` (mặc định nhóm Meta HN) · `EVAL_THROTTLE_MS` (300).
