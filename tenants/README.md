# Gói khách (`tenants/<slug>/`)

**Dữ liệu riêng của từng khách, máy đọc.** Nền tảng ở `apps/` + `packages/` là phần dùng chung —
không được nhắc tên khách nào trong đó. Mọi thứ chỉ đúng với một khách thì nằm ở đây.

> Đừng nhầm với [`docs/khach-hang/`](../docs/khach-hang/README.md) — bên đó là **tài liệu cho người
> đọc** (hồ sơ, báo giá, trao đổi). Bên này là **cấu hình máy đọc**, có zod schema, hỏng thì hệ
> thống dừng ngay lúc boot. Slug hai bên đặt trùng nhau để tra chéo (`ultty`, `amico`).

## Cấu trúc

```
tenants/<slug>/
  tenant.json               Contract runtime v2.
                            Schema: packages/tenant/src/tenant.schema.ts
  data/knowledge.json       Bootstrap knowledge; shape phụ thuộc capability sales-order.
  data/content-manifest.json (tùy chọn) Provenance/mapping FAQ, catalog, ảnh, video; không chứa binary.
  data/demo-messages.json   (tùy chọn) Tin mẫu; thiếu file ⇒ mảng rỗng, không lỗi.
```

Tên file bootstrap không bị hard-code vào consumer: `tenant.json.bootstrap.*.path` trỏ tới file
tương ứng. Path phải tương đối, không được có `..` hoặc thoát khỏi tenant directory.

## Contract `tenant.json` v2

`schemaVersion: 2` là breaking boundary có chủ ý. Loader chỉ nhận đúng version đang hỗ trợ; v1,
version tương lai và field thừa đều bị chặn lúc boot. Không có silent migration hoặc chuỗi `??`
fallback để giữ config cũ vô hạn.

| Trường | Ý nghĩa |
|---|---|
| `schemaVersion` | Hiện là `2`; tăng khi đổi contract theo cách phá vỡ tương thích. |
| `slug` | Chữ thường/số/gạch nối. Trùng tên thư mục và `docs/khach-hang/<slug>/`. |
| `identity` | `displayName`, `shortName`; danh tính tổ chức, không phải tên experience/domain. |
| `branding` | Chuỗi/màu runtime dùng trong metadata, shell, PWA và composer. |
| `experience` | Chọn một UI composition product-code đã đăng ký. |
| `capabilities` | Danh sách capability được bật; không phải túi boolean special case. |
| `policies` | Policy theo capability (`salesOrder`, `campaign`) và blocker readiness. |
| `integrations` | Adapter được phép/chọn; credential thật vẫn nằm trong secret/env riêng của stack. |
| `persona` | Persona theo capability (`messaging`, `salesOrder`, `knowledge`). |
| `bootstrap` | Path tương đối tới seed/import của capability. |
| `smoke` | Fixture smoke tùy chọn của chính tenant; `null` thì báo skip order path, không giả PASS. |

### Capability registry

Các capability hiện có đến từ code thật, không phải taxonomy tương lai:

| Capability | Phụ thuộc/config bắt buộc |
|---|---|
| `knowledge` | `bootstrap.knowledge` (hoặc `bootstrap.salesOrder` khi sales-order bật) |
| `messaging` | `integrations.channel`, `persona.messaging` |
| `sales-order` | `knowledge` + `messaging`, parser integration, sales-order policy/persona/bootstrap |
| `campaign` | `messaging`, campaign policy |
| `operations` | Không có dependency domain; compose bề mặt vận hành hiện có |
| `notifications` | `messaging` |

Schema kiểm dependency, policy, persona, integration và bootstrap ngay khi load. Backend dùng cùng
capability ID để compose controller/provider/module qua Nest DI; capability tắt không được nạp chỉ
để rồi ẩn bằng UI.

### Experience registry

| Experience | Capability bắt buộc | Vai trò |
|---|---|---|
| `operations-console` | `knowledge` + `messaging` + `sales-order` + `operations`; campaign/notifications tùy chọn | Console ba cột và settings theo capability; giữ UX tenant hiện tại. |
| `knowledge-workspace` | `knowledge` | Composition tối thiểu không cần messaging, Zalo hay sales-order. |

Experience là product code trong `apps/web/experiences/`; tenant chỉ chọn ID. Không đặt reusable UI
trong `tenants/<slug>/` và không re-nhánh theo slug.

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

**`persona.*` — giọng theo capability:**

| Trường | Ý nghĩa |
|---|---|
| `salesOrder.parserIntro` | Câu mở đầu prompt parser; chỉ bắt buộc khi bật sales-order. |
| `messaging.botName` | Tên bot trong nhãn nội dung tự động; chỉ bắt buộc khi bật messaging. |
| `messaging.mentionName` | Chuỗi bóc mention theo channel hiện hành; `BOT_NAME` là runtime override. |
| `knowledge.productFallbackDescription` | Mô tả thay thế cho luồng tư vấn sản phẩm; sales-order hiện yêu cầu. |

Khi bật `sales-order`, knowledge bootstrap khớp `KnowledgeSnapshot`: `products`, `prices`,
`priceOverrides`, `dealers`, `groups`, `glossary` và kỳ giá. Với tenant `knowledge`-only, file chỉ
cần `products` + `glossary`; loader chuẩn hóa các collection sales thành mảng rỗng. Vì vậy tenant
không dùng order không phải tạo dealer, price hoặc group mapping giả.

Policy runtime phải tách rõ:

- `policies.salesOrder.automation`: bật/tắt theo tenant và ngưỡng tổng số lượng inclusive; `null`
  nghĩa là chưa chốt nên fail-closed. GĐ1 luôn nhập ERP thủ công;
- `policies.salesOrder.retailAdvice`: field giá hợp lệ + qualifier template;
- `policies.campaign`: cửa sổ/spacing/giới hạn mục tiêu/retry;
- content manifest: Drive file ID/URL, MIME/checksum/modified time, product mapping, content type, trạng thái duyệt/readiness.

File ảnh/video/catalog gốc ở Drive/object storage. Gói tenant và DB chỉ giữ metadata/link/provenance; không copy
binary và không nhét nội dung khách vào code chung.

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
  lần với hai gói giả có experience khác nhau, đòi branding/composition đổi và **không sót chuỗi
  của gói kia**; kiểm cả `BUILD_ID` không đổi để chứng minh đúng là một artifact.
- **`packages/tenant/src/__tests__/tenant-packs.spec.ts`** tự liệt kê mọi thư mục thật trong
  `tenants/`, validate từng gói và kiểm slug trùng tên thư mục. CI không giữ matrix tên khách riêng.
- `deploy/netviet/caddy-route-contract.test.mjs` chặn `ARG/ENV TENANT` quay lại Dockerfile.

Gốc repo được dò bằng cách đi ngược tìm `pnpm-workspace.yaml`, **không** dựa vào `process.cwd()` —
test chạy ở `apps/api`, script Prisma chạy ở gốc, container chạy ở `/app`.

## Hạt giống, không phải nguồn sự thật lúc chạy

Với `PERSISTENCE=prisma`, gói khách chỉ dùng cho lần seed **đầu tiên**. Sau đó Postgres mới là
nguồn sự thật — Sale sửa giá/đại lý/map nhóm qua `/admin` hoặc MCP tool, và những sửa đổi đó
**không** quay ngược về file JSON. Đừng sửa JSON rồi mong hệ thống đang chạy đổi theo.

Với `PERSISTENCE=memory` (mặc định, demo/CI) thì gói khách là nguồn duy nhất.

## Thêm khách mới

1. Tạo `tenants/<slug>/data` và `tenant.json` v2 theo schema; chỉ bật capability có thật sự dùng.
2. Chọn experience đã đăng ký và khai đủ dependency/policy/integration/persona/bootstrap mà schema yêu cầu.
3. Tạo knowledge bootstrap đúng shape capability; thiếu dữ liệu thì để mảng rỗng, **không** bịa số.
4. Nạp content có provenance; bảng giá thiếu tháng hoặc FAQ chưa duyệt phải giữ trạng thái thiếu/inactive.
5. Chạy `pnpm --filter @netviet/tenant test` — test tự phát hiện gói mới, schema/slug sai báo ngay.
6. Chạy `TENANT=<slug> pnpm --filter @netviet/api test` và contract experience liên quan.

CI tự kiểm mọi thư mục tenant. Danh sách lựa chọn trong workflow deploy vẫn là allowlist thủ công có
chủ ý; tự động hóa inventory deploy là backlog vì thay đổi target production cần cổng duyệt riêng.

## Dữ liệu thương mại

Giá thật và danh sách đại lý là dữ liệu kinh doanh của khách. Gói của khách đang thử nghiệm thì
commit được; khi chạy thật với giá/PII thật, để gói ngoài git (thêm dòng vào `.gitignore`) và
đưa vào máy chủ bằng `TENANT_DIR` trỏ tới thư mục mount.
