# Gói khách (`tenants/<slug>/`)

**Dữ liệu riêng của từng khách, máy đọc.** Nền tảng ở `apps/` + `packages/` là phần dùng chung —
không được nhắc tên khách nào trong đó. Mọi thứ chỉ đúng với một khách thì nằm ở đây.

> Đừng nhầm với [`docs/khach-hang/`](../docs/khach-hang/README.md) — bên đó là **tài liệu cho người
> đọc** (hồ sơ, báo giá, trao đổi). Bên này là **cấu hình máy đọc**, có zod schema, hỏng thì hệ
> thống dừng ngay lúc boot. Slug hai bên đặt trùng nhau để tra chéo (`ultty`, `amico`).

## Cấu trúc

```
tenants/<slug>/
  tenant.json          Danh tính + persona. Schema: apps/api/src/tenant/tenant.schema.ts
  data/knowledge.json  Hạt giống nguồn sự thật: SP, giá, đại lý, map nhóm Zalo, glossary
```

`tenant.json`:

| Trường | Ý nghĩa |
|---|---|
| `schemaVersion` | Hiện là `1`. Tăng khi đổi cấu trúc kiểu phá vỡ tương thích. |
| `slug` | Chữ thường/số/gạch nối. Trùng tên thư mục và `docs/khach-hang/<slug>/`. |
| `displayName` | Tên pháp nhân đầy đủ — dùng trên chứng từ. |
| `shortName` | Tên gọi tắt trong câu chữ hiển thị. |
| `persona.parserIntro` | Câu mở đầu prompt parser (tên khách + ngành hàng). Trước Đợt B1 câu này hardcode trong `parser-prompt.ts`. |
| `persona.botName` | Tên bot trong nhãn `— Tin tự động từ Bot <botName>` gắn vào **mọi tin gửi ra nhóm Zalo**. Điều khoản Zalo bắt buộc gắn nhãn nội dung do AI tạo ⇒ chuỗi này **đến tay đại lý của khách**, đặt sai là khách đọc thấy tên công ty khác. |
| `persona.productFallbackDescription` | Mô tả thay thế khi một SP chưa có `description` (vai Tư vấn SP). |

`data/knowledge.json` khớp 1-1 với `KnowledgeSnapshot` (`apps/api/src/knowledge/domain.ts`):
`products`, `prices`, `priceOverrides`, `dealers`, `groups`, `glossary`.

## Chọn gói khách lúc chạy

| Biến | Tác dụng |
|---|---|
| *(không đặt gì)* | `tenants/ultty` |
| `TENANT=<slug>` | `tenants/<slug>` |
| `TENANT_DIR=<path>` | Dùng thẳng đường dẫn này, **thắng** `TENANT`. Dành cho khách chạy trên hạ tầng riêng: mount gói từ ngoài, không nằm trong image. |

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
