# Gói khách (`tenants/<slug>/`)

**Dữ liệu riêng của từng khách, máy đọc.** Nền tảng ở `apps/` + `packages/` là phần dùng chung —
không được nhắc tên khách nào trong đó. Mọi thứ chỉ đúng với một khách thì nằm ở đây.

> Đừng nhầm với [`docs/khach-hang/`](../docs/khach-hang/README.md) — bên đó là **tài liệu cho người
> đọc** (hồ sơ, báo giá, trao đổi). Bên này là **cấu hình máy đọc**, có zod schema, hỏng thì hệ
> thống dừng ngay lúc boot. Slug hai bên đặt trùng nhau để tra chéo (`ultty`, `amico`).

## Cấu trúc

```
tenants/<slug>/
  tenant.json               Danh tính + thương hiệu + persona.
                            Schema: packages/tenant/src/tenant.schema.ts
  data/knowledge.json       Hạt giống nguồn sự thật: SP, giá, đại lý, map nhóm Zalo, glossary
  data/demo-messages.json   (tùy chọn) Tin mẫu cho luồng demo. Thiếu file ⇒ mảng rỗng, không lỗi.
```

`tenant.json` — **danh tính**:

| Trường | Ý nghĩa |
|---|---|
| `schemaVersion` | Hiện là `1`. Tăng khi đổi cấu trúc kiểu phá vỡ tương thích. |
| `slug` | Chữ thường/số/gạch nối. Trùng tên thư mục và `docs/khach-hang/<slug>/`. |
| `displayName` | Tên pháp nhân đầy đủ — dùng trên chứng từ. |
| `shortName` | Tên gọi tắt trong câu chữ hiển thị. |

**`branding.*` — mọi chuỗi/màu người dùng nhìn thấy trên app web.** Trước Đợt B1 nằm thẳng trong
`apps/web`; `installName`/`backgroundColor`/`monogram` thêm ngày 12/08/2026 khi bỏ nốt hai file tĩnh
`public/manifest.webmanifest` + `public/icon.svg`:

| Trường | Ý nghĩa |
|---|---|
| `productName` | Tên sản phẩm trên thanh tiêu đề console; cũng là `short_name` của PWA. |
| `installName` | Tên đầy đủ khi cài PWA (`name` của manifest) — hiện dưới icon trên màn hình chính. |
| `pageTitle` | `<title>` của trang. |
| `pageDescription` | Thẻ `description`. |
| `themeColor` | `#rrggbb`. `theme-color` của trình duyệt **và** màu nền icon. |
| `backgroundColor` | `#rrggbb`. Màu nền PWA lúc khởi động **và** màu chữ monogram trên icon. |
| `monogram` | 1-3 ký tự đặt giữa icon. Icon **sinh lúc chạy** (`app/icon.svg/route.ts`), không còn là file tĩnh. |
| `composerPlaceholder` | Câu gợi ý trong ô soạn tin — chứa ví dụ đặt hàng của chính khách. |

**`persona.*` — giọng của khách trong prompt LLM và trong tin gửi ra Zalo:**

| Trường | Ý nghĩa |
|---|---|
| `parserIntro` | Câu mở đầu prompt parser (tên khách + ngành hàng). Trước Đợt B1 hardcode trong `parser-prompt.ts`. |
| `botName` | Tên bot trong nhãn `— Tin tự động từ Bot <botName>` gắn vào **mọi tin gửi ra nhóm Zalo**. Điều khoản Zalo bắt buộc gắn nhãn nội dung do AI tạo ⇒ chuỗi này **đến tay đại lý của khách**, đặt sai là khách đọc thấy tên công ty khác. |
| `mentionName` | Chuỗi dùng để **bóc @mention** khỏi tin đến — đúng như nó xuất hiện trong nhóm Zalo. Khác `botName` (tên hiển thị). Biến `BOT_NAME` ghi đè được cho từng môi trường. |
| `productFallbackDescription` | Mô tả thay thế khi một SP chưa có `description` (vai Tư vấn SP). |

`data/knowledge.json` khớp 1-1 với `KnowledgeSnapshot` (`apps/api/src/knowledge/domain.ts`):
`products`, `prices`, `priceOverrides`, `dealers`, `groups`, `glossary`.

## Chọn gói khách lúc chạy

**Bắt buộc đặt một trong hai** — cố ý không có giá trị mặc định (Đợt B1). Quên đặt `TENANT` trên stack của khách B mà hệ thống lặng lẽ nạp dữ liệu của khách A là **sự cố rò rỉ dữ liệu**, không phải bất tiện nhỏ. Thiếu biến ⇒ ném ngay lúc boot.

| Biến | Tác dụng |
|---|---|
| *(không đặt gì)* | ❌ Ném: `Thieu bien TENANT: khong biet nap goi khach nao.` |
| `TENANT=<slug>` | `tenants/<slug>` |
| `TENANT_DIR=<path>` | Dùng thẳng đường dẫn này, **thắng** `TENANT`. Dành cho khách chạy trên hạ tầng riêng: mount gói từ ngoài, không nằm trong image. |

Nơi đã đặt sẵn: `.env.example` · `apps/api/vitest.setup.ts` (`TENANT ??= 'ultty'` cho bộ test API) ·
`.github/workflows/ci.yml` · `deploy/netviet/render-secrets.sh` (ghi `TENANT` vào `.runtime/secrets.env`,
compose chuyển vào cả `api` lẫn `web`) · `deploy/hf-demo/Dockerfile` (`ENV TENANT` ở stage runtime).

## Một image — mọi khách

**Image KHÔNG được mang danh tính khách.** Trước 12/08/2026 `deploy/netviet/Dockerfile` có
`ARG TENANT=ultty` và `next build` prerender tĩnh các trang, nên tên/màu/icon của khách bị nướng
thẳng vào artifact — mỗi khách phải có một image riêng. Nay:

| | Cách làm |
|---|---|
| Build | **Không** đặt `TENANT`. Build phải chạy được khi chưa biết khách nào. |
| Chạy | `TENANT` (hoặc `TENANT_DIR`) cấp từ lớp deploy — compose, `docker run -e`, systemd. |
| App web | Mọi route là `force-dynamic`; manifest PWA và icon **sinh lúc chạy**, không phải file tĩnh. |

Hai lưới an toàn giữ điều này khỏi trôi:

- **CI build `apps/web` không có `TENANT`.** Ai đó thêm một trang tĩnh đọc gói khách ⇒ loader ném ⇒
  CI đỏ ngay, thay vì lặng lẽ nướng tên khách vào image.
- **`pnpm test:tenant-runtime`** (`apps/web/tenant-runtime.contract.mjs`) — build một lần, chạy hai
  lần với hai gói khách giả, đòi thương hiệu đổi theo và **không sót chuỗi của gói kia**; kiểm cả
  `BUILD_ID` không đổi để chứng minh đúng là một artifact.
- `deploy/netviet/caddy-route-contract.test.mjs` chặn `ARG/ENV TENANT` quay lại Dockerfile.

Gốc repo được dò bằng cách đi ngược tìm `pnpm-workspace.yaml`, **không** dựa vào `process.cwd()` —
test chạy ở `apps/api`, script Prisma chạy ở gốc, container chạy ở `/app`.

## Hạt giống, không phải nguồn sự thật lúc chạy

Với `PERSISTENCE=prisma`, gói khách chỉ dùng cho lần seed **đầu tiên**. Sau đó Postgres mới là
nguồn sự thật — Sale sửa giá/đại lý/map nhóm qua `/admin` hoặc MCP tool, và những sửa đổi đó
**không** quay ngược về file JSON. Đừng sửa JSON rồi mong hệ thống đang chạy đổi theo.

Với `PERSISTENCE=memory` (mặc định, demo/CI) thì gói khách là nguồn duy nhất.

## Thêm khách mới

1. `mkdir -p tenants/<slug>/data`
2. Chép `tenant.json` từ khách có sẵn, sửa 5 trường.
3. Đổ `data/knowledge.json` — thiếu dữ liệu thì để mảng rỗng, **không** bịa số.
4. Chạy `TENANT=<slug> pnpm --filter @netviet/api test` — schema sai sẽ báo ngay.

## Dữ liệu thương mại

Giá thật và danh sách đại lý là dữ liệu kinh doanh của khách. Gói của khách đang thử nghiệm thì
commit được; khi chạy thật với giá/PII thật, để gói ngoài git (thêm dòng vào `.gitignore`) và
đưa vào máy chủ bằng `TENANT_DIR` trỏ tới thư mục mount.
