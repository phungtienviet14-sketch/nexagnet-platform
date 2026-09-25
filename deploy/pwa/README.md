# Cổng phục vụ PWA Nexagent Transport (`deploy/pwa/`)

Một image: bản xuất web của `apps/transport-mobile` (Expo, `web.output: "single"`) + Caddy phục vụ
**cùng origin** với API. Trình duyệt chỉ nói chuyện với một host; Caddy chuyển `/auth*`,
`/transport*`, `/files*`, `/health*` sang API, còn lại là vỏ ứng dụng. Phiên đăng nhập là cookie
HttpOnly + CSRF của API — không có token nào trong JavaScript của trang.

| Tệp | Vai trò |
|---|---|
| `Dockerfile` | Stage 1 (node:22 + pnpm): cài đúng `@nexagnet/transport-mobile...`, build `@netviet/driver-outbox`, `expo export --platform web`, `pwa-postexport` (mã bản dựng + danh sách tiền nạp cho service worker). Stage 2 (`caddy:2-alpine`, chạy user thường): `/srv` + `Caddyfile`. |
| `Dockerfile.dockerignore` | Build context RIÊNG (danh sách cho phép). `.dockerignore` ở gốc loại `apps/transport-mobile` cho image máy chủ — tệp này thay nó cho image PWA (BuildKit). |
| `Caddyfile` | Định tuyến, cache, CSP + tiêu đề bảo mật. Lý do từng dòng CSP ghi ngay trong tệp. |

## Biến môi trường

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `API_UPSTREAM` | **có** | Địa chỉ API **nội bộ**, vd `http://api-321.railway.internal:3001`. Thiếu → container dừng ngay với thông báo rõ. |
| `PORT` | không (8080) | Cổng nghe. Railway tự đặt. |
| `PWA_FORCE_HTTPS_PROTO` | không (`on`) | `on`: gửi `X-Forwarded-Proto: https` sang API. **Bắt buộc `on` sau một edge cắt TLS** (Railway, edge Caddy của VM): API chạy `trust proxy 1` + cookie `secure`, mà Caddy mặc định ghi đè `X-Forwarded-Proto` bằng `http` → API không đặt cookie phiên, đăng nhập "thành công" nhưng phiên không bao giờ có. Chỉ `off` khi thử HTTP trần với API không ở `NODE_ENV=production`. Giá trị khác `on`/`off` → Caddy từ chối khởi động. |
| `PWA_ROOT` | không (`/srv`) | Thư mục bản xuất (chỉ đổi khi chạy Caddy ngoài Docker). |

Build arg (nướng vào JS, không bí mật): `APP_VARIANT` (mặc định `production`), `APP_BUILD_NUMBER`,
`APP_GIT_SHA`, `EXPO_PUBLIC_MAP_PROVIDER`. **Không** đặt `EXPO_PUBLIC_API_BASE_URL` — PWA gọi API
cùng origin.

## Railway

1. Tạo service từ repo này. **Root directory: để trống (gốc repo)** — build context phải là gốc.
2. Biến service: `RAILWAY_DOCKERFILE_PATH=deploy/pwa/Dockerfile`,
   `API_UPSTREAM=http://api-321.railway.internal:3001` (host private của service API + cổng nó
   nghe), `PWA_FORCE_HTTPS_PROTO=on`. `PORT` để Railway đặt.
3. Tạo domain công khai cho service PWA — đó là địa chỉ phát cho lái xe/giám đốc/kế toán.
4. Kiểm: `GET https://<domain>/manifest.webmanifest` (200, `application/manifest+json`),
   `GET https://<domain>/health` (đi qua tới API), đăng nhập trên điện thoại rồi tải lại trang —
   vẫn đăng nhập (cookie đã được đặt).

Nếu log build dừng ở dòng *"Thiếu apps/transport-mobile trong build context"*: builder không đọc
`deploy/pwa/Dockerfile.dockerignore` mà dùng `.dockerignore` ở gốc. Không sửa `.dockerignore` gốc
(bài `mobile-dependency-isolation.contract.test.mjs` khoá nó); báo lại để chọn cách build khác.

## VM phía sau edge

`docker build -f deploy/pwa/Dockerfile -t nexagent-pwa .` rồi chạy container trong mạng của stack
(API là `http://api-<slug>:3001`), và thêm một hostname ở edge Caddy trỏ `reverse_proxy` tới
container này (edge cắt TLS → giữ `PWA_FORCE_HTTPS_PROTO=on`). Không thêm route PWA vào snippet
`app_routes` của edge: PWA có origin riêng.

## Rủi ro đã biết (chưa xử lý)

- **Giới hạn đăng nhập theo IP (5 lần/phút) nhìn thấy chuỗi proxy.** API tin đúng MỘT hop
  (`trust proxy 1`) = Caddy; Caddy đặt `X-Forwarded-For` bằng IP của edge Railway (edge không
  nằm trong `trusted_proxies`). Mọi người dùng PWA vì thế chung MỘT xô giới hạn. Sửa đúng cần
  quyết định ở API (`trust proxy 2`) hoặc khai `trusted_proxies` cho dải IP edge — chưa làm.
- Image `caddy:2-alpine` chưa ghim digest (không kéo được registry từ sandbox build) — ghim khi
  build lần đầu.
- Chưa build Docker thật ở đây (không có Docker daemon). Đã kiểm: `caddy validate` + chạy thật
  Caddy 2.11.4 với API giả (Host giữ nguyên, `X-Forwarded-Proto: https`, Cookie/`x-csrf-token`/
  `Authorization` đi nguyên, `Set-Cookie` về nguyên; 404 thật cho tệp băm thiếu), và mô phỏng stage
  cài đặt với đúng các tệp Dockerfile COPY (`--frozen-lockfile` chấp nhận, lockfile không đổi).
