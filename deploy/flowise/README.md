# Flowise runtime — Zalo order parser

`zalo-order-parser-v1.json` là artifact đã loại credential, tương thích Flowise `3.1.4`.
Flow chỉ có `Form Input → DeepSeek structured output`; không có memory, tool, MCP,
HTTP callback, code node hoặc logic tính tiền/chính sách.

Bootstrap idempotent:

```bash
FLOWISE_BASE_URL=http://127.0.0.1:3002 \
FLOWISE_ADMIN_EMAIL=admin@example.test \
FLOWISE_ADMIN_PASSWORD='strong-password' \
DEEPSEEK_API_KEY='secret' \
FLOWISE_RUNTIME_ENV_PATH=.runtime/flowise.env \
node deploy/flowise/bootstrap-flowise.mjs
```

Script tạo/cập nhật admin, credential DeepSeek, API key bảo vệ flow và Agentflow.
Flow ID cùng prediction key được ghi vào file runtime quyền `0600`; script không in secret.

`Dockerfile` luôn bắt đầu từ upstream `3.1.4` đã khóa digest. Patch nhỏ
`patch-flowise-3.1.4.mjs` xử lý đúng hai khoảng trống tương thích:

- DeepSeek V4 mặc định bật thinking; Flowise 3.1.4 không gửi `thinking:disabled` khi checkbox tắt.
- Agentflow V2 chỉ đặt structured object trong execution trace; patch expose cùng object tại
  `response.json` để adapter có contract hẹp, ổn định.

Cả hai thay đổi đều có source guard; build fail nếu upstream không còn đúng đoạn nguồn mong
đợi. `FlowiseParser` chỉ đọc `response.json`, không parse `response.text`, execution trace hay
`overrideConfig`.
