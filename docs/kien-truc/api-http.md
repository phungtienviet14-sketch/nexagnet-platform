# API HTTP — tham chiếu

> **Vai trò:** hợp đồng HTTP của `apps/api` (NestJS). Đúng cho **mọi khách**, không chứa dữ liệu
> hay tên khách nào. Trạng thái triển khai nằm ở
> [`phat-trien/ke-hoach/tong-quan.md`](../phat-trien/ke-hoach/tong-quan.md); thủ tục bật ở
> [`phat-trien/van-hanh/checklist-go-live.md`](../phat-trien/van-hanh/checklist-go-live.md).
>
> **Nguồn sự thật là code.** Danh sách dưới đây sinh từ các `*.controller.ts`; khi sửa route phải
> sửa cả tài liệu này **và** danh sách `@api` trong [`deploy/netviet/Caddyfile`](../../deploy/netviet/Caddyfile)
> — `caddy-route-contract.test.mjs` đọc ngược từ controller và làm đỏ CI nếu Caddy thiếu đường đi.

---

## 1. Nguyên tắc chung

| Mục | Giá trị |
|---|---|
| Kiểu dữ liệu | JSON (`Content-Type: application/json`), UTF-8 |
| Phiên bản | **Không có** `/v1`. API nội bộ, đổi cùng lúc với app web trong một lần deploy |
| Múi giờ | Mọi mốc thời gian là chuỗi ISO-8601 UTC (`2026-08-13T01:23:45.678Z`) |
| Tiền | Số nguyên VND, **không** thập phân, không dấu phân cách |
| Chọn khách | Theo tiến trình, bằng biến `TENANT` / `TENANT_DIR` lúc boot — **không** truyền qua header hay query. Một tiến trình phục vụ đúng một khách |
| Cổng vào | Người dùng đi qua Caddy: hostname `operator.*` và `demo.*`. Đường nào không nằm trong matcher `@api` sẽ rơi xuống Next.js và trả **trang 404 HTML** chứ không phải JSON |

### Header dùng chung

| Header | Bắt buộc | Ý nghĩa |
|---|---|---|
| `x-api-key` | khi `AUTH_MODE=api-key` | Khoá tĩnh, so sánh theo thời gian hằng số |
| `x-actor` | không | Người thao tác, ghi vào nhật ký thay đổi. Thiếu → `operator` |
| `x-request-id` | không | Nối một thao tác với dòng nhật ký của nó |
| `Origin` | với mutation, khi `NODE_ENV=production` và `AUTH_MODE≠none` | Chống CSRF cho nhóm `/zalo` và `/settings`; sai origin → **403** |
| `x-csrf-token` | với mutation, khi `AUTH_MODE=session` | Lấy từ `GET /auth/csrf` hoặc `POST /auth/login` |

### Hình dạng lỗi

Chuẩn NestJS, không bọc thêm:

```json
{ "statusCode": 400, "message": "Cần manifest để xem trước", "error": "Bad Request" }
```

| Mã | Khi nào |
|---|---|
| `400` | Body/param không qua zod. Thông điệp nêu đúng trường sai |
| `401` | Chưa đăng nhập / sai `x-api-key` |
| `403` | Sai vai, sai `Origin`, hoặc thao tác ngoài allowlist nhóm |
| `404` | Không có bản ghi — **hoặc** đường dẫn chưa được Caddy định tuyến (khi đó thân trả về là HTML) |
| `409` | Xung đột trạng thái (duyệt đơn đã gửi, chuyển trạng thái campaign không hợp lệ) |
| `429` | Vượt giới hạn tần suất của route |
| `503` | Thành phần phụ thuộc chưa cấu hình (ví dụ kho thành viên nhóm) |

---

## 2. Xác thực

Một biến quyết định toàn bộ: **`AUTH_MODE`**.

| `AUTH_MODE` | Cách gọi | Dùng ở đâu |
|---|---|---|
| `none` | Không cần gì cả. CORS mở, không kiểm `Origin`, `RolesGuard` **cho qua hết** | Chỉ demo/dev với dữ liệu TEST. Đang bật trên pilot theo quyết định vận hành 04/08/2026 |
| `api-key` | Gửi `x-api-key: <API_KEY>` | Máy gọi máy |
| `session` | Cookie phiên + `x-csrf-token`. **Chỉ ở chế độ này phân quyền theo vai mới có hiệu lực** | Bắt buộc trước khi chạy dữ liệu khách thật |

> ⚠️ `RolesGuard` trả `true` ngay khi `AUTH_MODE≠session`. Cột "Vai" ở các bảng dưới mô tả **luật
> sẽ áp dụng khi bật `session`** — không phải thứ đang được thi hành trên bản demo hiện tại.

### Luồng đăng nhập (`AUTH_MODE=session`)

```
GET  /auth/config           -> { "mode": "session" }
POST /auth/login            -> { user, csrfToken }        + đặt cookie phiên
GET  /auth/me               -> { user, roles }
POST /auth/logout
```

Đổi mật khẩu: `POST /auth/credentials/change`. Mọi mutation sau đăng nhập phải kèm
`x-csrf-token`; token lấy lại bất cứ lúc nào bằng `GET /auth/csrf`.

### Bốn vai

`SALE` · `ACCOUNTING` · `MANAGER` · `ADMIN`.

Nguyên tắc đang áp dụng: **đọc mở cho cả bốn vai; mọi thao tác chạm nguồn sự thật, chạm tiền, hoặc
chạm công tắc vận hành đều siết còn `MANAGER` + `ADMIN`.** Quản lý người dùng chỉ `ADMIN`.

---

## 3. Bản đồ endpoint

Ký hiệu: **·** = không khai báo vai (mọi phiên hợp lệ đều gọi được) · **PUBLIC** = không cần đăng nhập.

### 3.1 Xác thực — `/auth`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/auth/config` | PUBLIC | |
| GET | `/auth/csrf` | PUBLIC | |
| POST | `/auth/login` | PUBLIC | 5 lần / 60s |
| GET | `/auth/me` | · | |
| POST | `/auth/logout` | · | |
| POST | `/auth/credentials/change` | · | |

### 3.2 Dòng sự kiện — `/events`

| Method | Path | Vai |
|---|---|---|
| SSE | `/events` | SALE · ACCOUNTING · MANAGER · ADMIN |

`text/event-stream`, mỗi sự kiện là một JSON trong trường `data`. Đây là đường app web nhận tiến
trình 6 vai agent, đơn mới và đổi trạng thái theo thời gian thực. Caddy tắt buffer cho route này
(`flush_interval -1`).

### 3.3 Đơn hàng — `/orders` (bí danh `/messages`)

Hai tiền tố trỏ cùng một controller; `/messages` giữ cho tương thích ngược.

| Method | Path | Vai | Ghi chú |
|---|---|---|---|
| GET | `/orders` | 4 vai | Danh sách đơn |
| GET | `/orders/:id` | 4 vai | |
| POST | `/orders/:id/approve` | SALE · MANAGER · ADMIN | Sale duyệt đơn đang chờ; gửi lặp bị chặn theo trạng thái |
| POST | `/orders/:id/reject` | SALE · MANAGER · ADMIN | |
| POST | `/orders/:id/sales-handoff/complete` | SALE · MANAGER · ADMIN | Đánh dấu **đã nhập ERP thủ công**. GĐ1 không gọi ERP nên đây là cách duy nhất đóng hàng việc |

### 3.4 Nguồn sự thật vận hành — `/settings`

Mặc định lớp: đọc cho cả 4 vai.

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/summary` | 4 vai | |
| GET | `/settings/readiness` | 4 vai | 9 cổng go-live máy tự chấm |
| GET | `/settings/audit` | 4 vai | Lọc theo `actor`/`action`/`entityType`/`entityId` |
| GET | `/settings/source-truth/:resource` | 4 vai | |
| PUT | `/settings/source-truth/:resource` | MANAGER · ADMIN | |
| PUT | `/settings/source-truth/:resource/:id` | MANAGER · ADMIN | |
| GET | `/settings/rules` | 4 vai | |
| POST | `/settings/rules` | MANAGER · ADMIN | Tạo bản nháp (`{ payload }`) |
| POST | `/settings/rules/:id/preview` | MANAGER · ADMIN | Chạy thử trên đơn mẫu |
| POST | `/settings/rules/:id/activate` | MANAGER · ADMIN | Body `{ "confirmed": true }` |
| PUT | `/settings/automation/auto-send` | MANAGER · ADMIN | Body `{ "enabled": boolean }` — kill switch, **không phải** policy tenant |
| PUT | `/settings/groups/:chatId/mapping` | MANAGER · ADMIN | Gán nhóm Zalo cho đại lý |
| PUT | `/settings/groups/:chatId/hidden` | MANAGER · ADMIN | Gỡ/đưa lại nhóm. **Không xoá hàng** |

#### Kỳ giá — `/settings/price-periods`

Cổng go-live nặng nhất đi qua đây: tra giá **fail-closed**, chỉ nhận kỳ `active` đúng tháng hiện tại.

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/price-periods` | 4 vai | |
| POST | `/settings/price-periods` | MANAGER · ADMIN | 20 / 60s |
| POST | `/settings/price-periods/:id/copy` | MANAGER · ADMIN | 20 / 60s |
| POST | `/settings/price-periods/:id/import/preview` | MANAGER · ADMIN | |
| POST | `/settings/price-periods/:id/import/apply` | MANAGER · ADMIN | 10 / 60s |
| POST | `/settings/price-periods/:id/validate` | MANAGER · ADMIN | |
| POST | `/settings/price-periods/:id/activate` | MANAGER · ADMIN | |

Trình tự bắt buộc: tạo kỳ → nhập/sửa giá → `validate` → `activate`. Không có đường ghi thẳng.

#### Dữ liệu chủ — `/settings/master-data`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/master-data` | · | |
| POST | `/settings/master-data/import/preview` | SALE · MANAGER · ADMIN | 10 / 60s |
| POST | `/settings/master-data/import/apply` | MANAGER · ADMIN | 5 / 60s |
| PUT | `/settings/master-data/dealers/:id` | SALE · MANAGER · ADMIN | 30 / 60s |
| DELETE | `/settings/master-data/dealers/:id` | MANAGER · ADMIN | 15 / 60s |
| PUT | `/settings/master-data/deals/:id` | SALE · MANAGER · ADMIN | 30 / 60s |
| DELETE | `/settings/master-data/deals/:id` | MANAGER · ADMIN | 15 / 60s |
| PUT | `/settings/master-data/groups/:chatId` | SALE · MANAGER · ADMIN | 30 / 60s |
| DELETE | `/settings/master-data/groups/:chatId/mapping` | MANAGER · ADMIN | 15 / 60s |

#### Nội dung tư vấn — `/settings/content`

`:kind` ∈ `asset` · `faq` · `advice` · `link`.

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/content` | · | |
| POST | `/settings/content/reload` | MANAGER · ADMIN | 10 / 60s |
| POST | `/settings/content/import/preview` | SALE · MANAGER · ADMIN | 20 / 60s |
| POST | `/settings/content/import/apply` | SALE · MANAGER · ADMIN | 10 / 60s — body `{ manifest, confirmed: true }` |
| POST | `/settings/content/:kind` | SALE · MANAGER · ADMIN | 30 / 60s |
| PUT | `/settings/content/:kind/:id` | SALE · MANAGER · ADMIN | 30 / 60s |
| PUT | `/settings/content/:kind/:id/status` | MANAGER · ADMIN | 30 / 60s |

Vòng đời bắt buộc: `draft → reviewed → approved → active`. **Chỉ `active` mới được dùng để trả lời
khách**; nội dung nhập từ gói khách luôn vào ở `draft`.

#### Người dùng — `/settings/users`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/settings/users` | ADMIN | |
| POST | `/settings/users` | ADMIN | 10 / 60s |
| PATCH | `/settings/users/:id/role` | ADMIN | |
| POST | `/settings/users/:id/disable` | ADMIN | |
| POST | `/settings/users/:id/credentials/reset` | ADMIN | 5 / 60s |

### 3.5 Kênh Zalo — `/zalo`

Cả nhóm yêu cầu **MANAGER · ADMIN**, và mutation kiểm `Origin`.

| Method | Path | Ghi chú |
|---|---|---|
| GET | `/zalo/status` | Trạng thái kênh + danh tính Bot |
| GET | `/zalo/qr` | Ảnh QR dạng data URL; chưa sẵn sàng → 404 |
| GET | `/zalo/groups` | Nhóm tài khoản đang thấy |
| POST | `/zalo/login` | Body **`{ acceptedRisk: true, acceptedSecondaryAccount: true }`** — hai xác nhận riêng (rủi ro ToS · tài khoản phụ/SIM riêng). Ghi `zalo.login.risk_accepted` vào nhật ký **trước** khi tạo QR |
| POST | `/zalo/logout` | Body `{ confirmed: true }` |
| PUT | `/zalo/allowed-groups` | Body `{ groupIds: string[] }`, tối đa 10 |
| POST | `/zalo/groups/:groupId/members/sync` | 5 / 60s. Ngoài allowlist → 403; chưa map → 400 |

### 3.6 Thành viên nhóm — `/groups`

| Method | Path | Vai |
|---|---|---|
| GET | `/groups/:groupId/participants` | SALE · MANAGER · ADMIN |
| PATCH | `/groups/:groupId/participants` | SALE · MANAGER · ADMIN |
| PATCH | `/groups/:groupId/participants/:participantId` | SALE · MANAGER · ADMIN |

Phân loại gồm `customerRank` · `operationalRole` · `handlingMode`. Đồng bộ **không bao giờ** đánh
ai là không hoạt động và **không** ghi đè phân loại người vận hành đã đặt.

### 3.7 Chiến dịch CSKH — `/campaigns`

| Method | Path | Vai | Giới hạn |
|---|---|---|---|
| GET | `/campaigns` | · | |
| GET | `/campaigns/policy` | · | Cấu hình phân bổ/spacing của tenant |
| GET | `/campaigns/:id` | · | |
| POST | `/campaigns` | SALE · MANAGER · ADMIN | 20 / 60s |
| POST | `/campaigns/:id/approve` | MANAGER · ADMIN | 10 / 60s |
| POST | `/campaigns/:id/schedule` | MANAGER · ADMIN | 10 / 60s |
| POST | `/campaigns/:id/retry-failed` | MANAGER · ADMIN | 10 / 60s |
| POST | `/campaigns/:id/cancel` | MANAGER · ADMIN | 10 / 60s |

Không có đường "gửi ngay": bản nháp phải được duyệt rồi lên lịch, và các lần gửi được phân bổ
trong cửa sổ thời gian.

### 3.8 Danh mục & demo

| Method | Path | Vai |
|---|---|---|
| GET | `/knowledge/summary` · `/knowledge/products` · `/knowledge/groups` · `/knowledge/glossary` | 4 vai |
| POST | `/knowledge/reload` | MANAGER · ADMIN |
| GET | `/demo/config` · `/demo/samples` · `/demo/groups` | SALE · MANAGER · ADMIN |
| POST | `/demo/simulate` | SALE · MANAGER · ADMIN |
| POST | `/demo/rerun/:id` | SALE · MANAGER · ADMIN |

`/demo/simulate` bơm một tin nhắn giả lập qua **đúng pipeline thật** — dùng cho kịch bản demo và
cho smoke test lúc deploy.

### 3.9 Sức khoẻ & hệ thống ngoài

| Method | Path | Vai | Ghi chú |
|---|---|---|---|
| GET | `/health` | PUBLIC | `{ status, uptimeSeconds }` |
| GET | `/health/media` | · | Kèm `reachability` — kết quả **chạm thật** vào kho ảnh |
| GET | `/erp/products` · `/erp/orders` | · | Cổng `ErpPort`. **GĐ1 không gọi trong luồng đơn**; `/kiotviet/*` là bí danh cũ |
| POST | `/broadcast` | SALE · MANAGER · ADMIN | Mặt tiền tương thích ngược, **đã tắt đường gửi thật** — dùng `/campaigns` |

`/health/media` trả:

```json
{
  "storage": { "name": "gcs", "enabled": true, "state": "healthy" },
  "downloads": { "attempted": 0, "succeeded": 0, "failed": 0, "inflight": 0 },
  "reachability": { "healthy": true, "detail": "gcs: doc duoc bucket <ten> bang ADC" }
}
```

> `storage.state` suy ra từ **bộ đếm tải ảnh**, nên trước khi có ảnh đầu tiên nó luôn là `healthy`
> kể cả khi bucket không tồn tại. Chỉ `reachability` mới là bằng chứng cấu hình đúng.

---

## 4. Readiness — `GET /settings/readiness`

Máy tự chấm 9 cổng bắt buộc; `goLiveReady = true` **chỉ khi cả 9 cổng `ready`**.

Chín cổng: `tenant.loaded` · `price.current_period` · `dealers.configured` · `groups.mapped` ·
`parser.production` · `media.production` · `channel.production` · `auth.production` ·
`golden.evaluated`. Thiếu dữ liệu thì báo `missing` kèm mã máy đọc được — **không đoán là đạt**.

Hai nhóm không chặn: `campaign.data` và `business.*` (các nghiệp vụ tenant khai báo là đang khoá).

---

## 5. Những chỗ dễ hiểu nhầm

1. **404 kèm thân HTML ≠ không có bản ghi.** Đó là đường dẫn chưa nằm trong matcher `@api` của
   Caddy nên rơi xuống Next.js. Đã từng làm màn nhập bảng giá không dùng được trên bản deploy.
2. **Vai chỉ có hiệu lực khi `AUTH_MODE=session`.** Trên bản demo hiện tại mọi vai đều qua.
3. **API không tính lại tiền theo yêu cầu của client.** Giá/ship/VAT do rules engine tính từ nguồn
   sự thật; body gửi lên không ghi đè được số tiền.
4. **Không có endpoint xoá tin/đơn.** Zalo không phát lại tin nên mất là mất vĩnh viễn; muốn ngừng
   một nhóm thì dùng `PUT /settings/groups/:chatId/hidden` (đảo ngược được).
5. **`AUTO_SEND` là kill switch vận hành, không phải ngưỡng nghiệp vụ.** Ngưỡng tự xác nhận nằm
   trong gói khách (`orderAutomation.maxAutoConfirmQuantity`).
