# Edge Cloudflare — một origin công khai duy nhất cho stack Northflank

Thư mục này là **edge của bản triển khai Northflank**, không phải của VM. VM dùng
[`deploy/netviet/edge/Caddyfile`](../netviet/edge/Caddyfile); hai thứ tồn tại song song và
[`edge-routing.contract.test.mjs`](./edge-routing.contract.test.mjs) khoá cho chúng không lệch nhau.

```
Trình duyệt
  └─ https://<worker>.<account>.workers.dev        (Cloudflare Workers Free)
       ├─ đường web  → nexagnet-web  :3000         (Northflank, code.run)
       ├─ đường API  → nexagnet-api  :3001         (Northflank, code.run)
       └─ /internal/*→ 404 ngay tại edge, không bao giờ đi tiếp
```

## Vì sao khoá nằm trong ứng dụng

Trên VM, Caddy giữ `:443` và api/web **không hề có địa chỉ công khai** — không ai gọi thẳng vào
chúng được. Trên Northflank thì ngược lại: muốn Worker gọi được thì port `code.run` phải là công
khai, và ngay lúc đó chính nó cũng là một đường vào Internet **đi vòng qua edge**.

Northflank có đúng tính năng để chặn việc đó (security policy theo HTTP header trên port), nhưng nó
nằm trong gói trả phí — đo ngày 18/09/2026: gửi `ports[].security` qua **5** đường API khác nhau
(`PATCH .../services/combined/{id}` với `headers`, với `securePathConfiguration`, với
`credentials`; `POST .../services/{id}/ports`; và cách hai bước public-rồi-patch) đều trả `200 OK`
rồi **không cưỡng chế gì**. Đọc ngược luôn ra `security: {"policies":[],"credentials":[]}` nên
không phân biệt được "bị bỏ" với "API không echo lại" — phải đo bằng HTTP thật.

Nên khoá chuyển vào trong ứng dụng:

| Tầng   | Tệp                                                                                    | Hành vi                                                        |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Worker | [`src/index.js`](./src/index.js)                                                       | thêm `X-Nexagnet-Edge-Key` cho **upstream**, xoá khỏi phản hồi |
| API    | [`apps/api/src/auth/edge-proxy.guard.ts`](../../apps/api/src/auth/edge-proxy.guard.ts) | middleware Express **trước** session và mọi route → 403        |
| Web    | [`apps/web/middleware.ts`](../../apps/web/middleware.ts)                               | middleware Next runtime `nodejs` → 403                         |

Trình duyệt không bao giờ thấy bí mật: Worker chỉ đặt header lên **yêu cầu đi lên**, và xoá nó khỏi
**phản hồi đi xuống**.

## `EDGE_PROXY_SECRET` là tuỳ chọn — có chủ đích

Không đặt biến ⇒ khoá **tắt**. Đó là hợp đồng với các stack chạy sau Caddy (`ultty-gd1-test`…):
chúng không có origin công khai nên không cần khoá này, và bắt buộc biến ở production sẽ làm chết
đúng những bản triển khai vốn đã an toàn bằng một cơ chế khác.

Đổi lại: một bản triển khai **có** origin công khai mà quên đặt biến sẽ không kêu gì ở tầng env.
Cái bắt được nó là bài nghiệm thu — _gọi thẳng `code.run` không kèm header phải là 403_.

## Ngoại lệ health check (chỉ API)

`nexagnet-api` giữ ba probe HTTP trên `/health`, và prober của Northflank gọi thẳng container nên
**không** có `x-forwarded-for`. Guard cho qua đúng trường hợp đó: `GET`/`HEAD` + đúng `/health` +
**không** kèm khoá + **không** có `x-forwarded-for`.

Đây không phải public bypass: mọi request từ Internet đều qua ingress, và ingress **luôn** thêm
`x-forwarded-for` — khách bên ngoài không bỏ được header đó. Bộ test khoá đúng điều này bằng một
khẳng định phủ định: cùng `/health` đó, **có** `x-forwarded-for` thì bị từ chối.

`nexagnet-web` dùng health check **TCP** nên không cần ngoại lệ nào, và
[`apps/web/lib/edge-proxy.ts`](../../apps/web/lib/edge-proxy.ts) cố tình không có.

## Triển khai

```bash
wrangler deploy --config deploy/edge-cloudflare/wrangler.jsonc
```

Ba secret đặt một lần, **không** nằm trong `wrangler.jsonc`:

```bash
wrangler secret put EDGE_KEY   --config deploy/edge-cloudflare/wrangler.jsonc
wrangler secret put WEB_ORIGIN --config deploy/edge-cloudflare/wrangler.jsonc
wrangler secret put API_ORIGIN --config deploy/edge-cloudflare/wrangler.jsonc
```

`EDGE_KEY` phải **trùng** `EDGE_PROXY_SECRET` của cả hai service trên Northflank. Lệch nhau thì mọi
request ra 403 và triệu chứng trông hệt như "origin chết".

## Nghiệm thu

```bash
# qua Worker — phải chạy
curl -si https://<worker>.<account>.workers.dev/health | head -1

# thẳng code.run, không header — phải 403
curl -si https://api--<svc>--<id>.code.run/orders | head -1
curl -si https://web--<svc>--<id>.code.run/login  | head -1

# /internal qua Worker — phải 404, không phải phản hồi của endpoint nội bộ
curl -si https://<worker>.<account>.workers.dev/internal/sales-handoff | head -1
```

Đo bằng **tiến trình mới mỗi lần**: một tiến trình Node cache DNS, nên sau khi đóng/mở port nó còn
trả kết quả cũ một lúc và bài đo sẽ nói dối.
