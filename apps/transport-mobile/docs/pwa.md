# PWA — cùng một ứng dụng trên trình duyệt điện thoại

Nexagent Transport chạy được như một ứng dụng web cài lên màn hình chính (iPhone Safari, Android
Chrome), dựng từ CHÍNH mã nguồn Android/iOS qua react-native-web. Triển khai: `deploy/pwa/README.md`.

## Cài lên điện thoại

**iPhone (Safari, iOS 16.4+):** mở địa chỉ văn phòng gửi → nút **Chia sẻ** → **Thêm vào MH chính**
→ **Thêm**. Mở từ biểu tượng "Nexagent" trên màn hình chính (không mở lại bằng Safari — Safari và
ứng dụng đã cài giữ dữ liệu riêng).

**Android (Chrome):** mở địa chỉ → menu ⋮ → **Cài đặt ứng dụng** (hoặc bấm biểu ngữ "Cài đặt" nếu
Chrome hiện) → **Cài đặt**.

## Chạy được gì khi mất sóng

| Có | Không |
|---|---|
| Mở ứng dụng (vỏ ứng dụng + bộ JS + biểu tượng được service worker lưu; font/icon lưu sau lần mở đầu có mạng) | Bám vị trí NỀN — trình duyệt không cho chạy khi màn hình tắt; PWA không bao giờ bám vị trí nền |
| Bấm việc hiện trường: hàng đợi nằm trong **IndexedDB** (cùng hợp đồng với SQLite trên máy), tự gửi khi có sóng, không trùng, không mất khi tải lại trang | Đăng nhập lần đầu (cần máy chủ) |
| Ảnh chứng từ: byte ảnh chép vào IndexedDB ngay khi chọn, gửi sau | Số liệu mới từ máy chủ — màn hình hiện số đã tải gần nhất |

Camera và vị trí tại thời điểm bấm dùng quyền của trình duyệt (hỏi lần đầu).
`Permissions-Policy` chỉ cho phép chính origin này dùng camera/vị trí; micro bị tắt.

Hàng đợi web và hàng đợi SQLite chạy CÙNG một bộ kiểm thử hành vi
(`src/outbox/outbox-store.contract.ts`): phạm vi theo máy chủ + người dùng, bấm đôi ra một việc
(giữ giờ bấm đầu), gửi cũ trước, sổ đã gửi 200 việc mỗi người.

## Cập nhật

Bản mới lên máy chủ → service worker mới tải về và **chờ**. Ứng dụng hiện thẻ "Có bản cập nhật";
bấm **Tải lại** thì ứng dụng đợi hàng đợi gửi xong lượt đang chạy rồi mới thay bản — không bao giờ
tự tải lại giữa lúc đang gõ phiếu. Việc chưa gửi nằm trong IndexedDB nên còn nguyên sau khi tải lại.

## Bảo mật

- Phiên là **cookie HttpOnly** của API, cùng origin (Caddy chuyển tiếp API) — JavaScript của trang
  không đọc được phiên; mọi lệnh ghi mang `x-csrf-token`. PWA không gửi `X-Nexagnet-Client`, không
  xin token Bearer.
- Service worker **không bao giờ** lưu phản hồi API hay yêu cầu không phải GET.
- CSP `script-src 'self'` (bản xuất không có script nội dòng — `pwa-postexport` chặn nếu có);
  `style-src 'unsafe-inline'` vì react-native-web chèn style lúc chạy. Chi tiết: `deploy/pwa/Caddyfile`.
- Hồ sơ người dùng (tên, vai — không bí mật) lưu ở `localStorage` để mở được khi mất sóng.

## Dựng và kiểm

```bash
pnpm --filter @nexagnet/transport-mobile export:web   # expo export + pwa-postexport -> dist-web/
pnpm --filter @nexagnet/transport-mobile pwa:icons    # sinh lại PNG từ public/icons/mark.svg
```

`public/index.html` là khuôn HTML (với `web.output: "single"`, Expo không dùng `app/+html.tsx`).
`public/` được `expo export` chép nguyên vào bản xuất.
