# CHECKLIST GO-LIVE — từ demo sang pilot dữ liệu thật

> **Vai trò:** thủ tục bật pilot. Trả lời đúng một câu hỏi: *còn thiếu gì để chạy được với dữ liệu
> khách thật?* — kèm cách bật và cách tự kiểm chứng từng cổng.
>
> **Không chứa trạng thái.** Hôm nay đạt mấy cổng nằm ở [ke-hoach/tong-quan.md](../ke-hoach/tong-quan.md).
> Định nghĩa "code complete" / "go-live ready" nằm ở [ke-hoach/gd1-ultty.md §15](../ke-hoach/gd1-ultty.md).
>
> **Đối tượng đọc:** người vận hành + người deploy. Sale chỉ cần §3 và §5.

---

## 0. Máy tự kiểm được bao nhiêu

Hệ thống tự chấm 9 cổng bắt buộc và hiển thị ở `/settings` → tab **"Sẵn sàng vận hành"**
(`GET /settings/readiness`, quyền `SALE·MANAGER·ACCOUNTING·ADMIN`). Logic ở
[operational-readiness.ts](../../../apps/api/src/readiness/operational-readiness.ts); dữ liệu đầu vào
lấy runtime ở [readiness.service.ts](../../../apps/api/src/readiness/readiness.service.ts).

`goLiveReady = true` **chỉ khi cả 9 cổng bắt buộc `ready`**. Cổng nào thiếu thì `reasons[]` nói rõ
lý do bằng mã máy đọc được — **không bịa dữ liệu khách, không đoán là đạt**.

Ba thứ máy **không** tự kiểm được, phải làm ngoài: văn bản pháp lý (§3), chất lượng dữ liệu nghiệp
vụ khách nhập (§4), và quyết định go/no-go của người (§6).

---

## 1. Chín cổng bắt buộc — máy chấm

| Key readiness | Điều kiện đạt | Bật thế nào | Chủ việc |
|---|---|---|---|
| `tenant.loaded` | Nạp được gói khách | `TENANT=<slug>` (hoặc `TENANT_DIR=<path>`). Thiếu biến ⇒ **fail-fast lúc boot**, cố ý | Deploy |
| `price.current_period` | Có kỳ giá `active` **đúng tháng hiện tại** | Sale tạo kỳ mới ở `/settings` → Nguồn sự thật → Kỳ giá → sửa → preview → **activate** | Sale (cần **A6**) |
| `dealers.configured` | ≥ 1 đại lý | `/settings` → Nguồn sự thật → Đại lý; hoặc import Excel **A4** | Sale |
| `groups.mapped` | ≥ 1 nhóm Zalo đã map đại lý | `/settings` → Map nhóm Zalo → chọn đại lý từ dropdown (không gõ chatId tay) | Sale |
| `parser.production` | `PARSER_MODE=claude` **và** có `ANTHROPIC_API_KEY` | Đặt 2 biến. Xem ràng buộc bên thứ 3 ở §3.3 | Deploy |
| `media.production` | `MEDIA_STORE≠none` **và** kho trả healthy | `MEDIA_STORE=s3` + `MEDIA_BUCKET` + `MEDIA_ENDPOINT` + `MEDIA_ACCESS_KEY_ID` + `MEDIA_SECRET_ACCESS_KEY`; giữ `MEDIA_ALLOWED_HOSTS` mặc định `zdn.vn` | Deploy |
| `channel.production` | Kênh production **và runtime đã chứng minh sống**: zca listener `ready`; bot có identity + poll heartbeat; hybrid cần cả hai | Xem §2 — **có điều kiện pháp lý chặn trước** | Deploy (sau §3.1) |
| `auth.production` | `AUTH_MODE≠none`; nếu `session` thì `PERSISTENCE=prisma` | Xem §2 — bật lại 4 lớp đã tắt 04/08/2026 | Deploy |
| `golden.evaluated` | Có báo cáo golden **và** đạt ngưỡng | Chạy harness [tools/poc-parser](../../../tools/poc-parser) → trỏ `GOLDEN_EVAL_REPORT_PATH` vào báo cáo | Dev (cần **B1-B2**) |

Hai mục **không chặn** (cảnh báo/thông tin): `campaign.data` (chưa có campaign thì Sale nhập sau) và
`business.*` (4 nghiệp vụ fail-closed ở §4).

> ⚠️ **`price.current_period` là cổng dễ bị coi nhẹ nhất và hại nhất.** Tra giá **fail-closed**: chỉ
> nhận kỳ `active` **đúng tháng hiện tại**, không bao giờ rơi về tháng trước. Thiếu kỳ tháng này thì
> hệ thống vẫn chạy, vẫn đọc tin, nhưng **mọi đơn đều rơi về Sale** — kể cả đơn hợp lệ dưới ngưỡng.
> Bật kênh Zalo khi chưa có bảng giá tháng hiện hành là bật một hệ thống không tự chốt được đơn nào.

---

## 2. Hai công tắc fail-safe có chủ ý

Không phải sót — đã khóa bằng source để lần deploy sau không tự bật lại.

**2.1 Kênh Zalo.** Deploy mới vẫn mặc định `mock`. Pre-pilot TEST chỉ bật bằng thao tác explicit:

```bash
sudo /srv/netviet/apps/zalo-ultty/set-channel-mode.sh zca
```

Lựa chọn được lưu ở `.runtime/channel-mode.env` (0600), được validate trong tập
`mock|bot|zca|hybrid`, và được giữ qua lần deploy kế tiếp. Token Bot tồn tại **không tự bật kênh**.
Mỗi lần đổi mode recreate API nên `AUTO_SEND` trở về `off`. Rollback nhanh dùng cùng lệnh với
`mock`. Cổng readiness không còn tin riêng env: `connecting`, `qr_ready`, `error`, `logged_out`, bot
chưa poll thành công đều là `missing` và detail nêu state thật.

**2.2 Xác thực.** Pre-pilot public dùng `AUTH_MODE=session`: user `operator`, Argon2id, session bền
vững trong PostgreSQL, cookie Secure/HttpOnly/SameSite và CSRF cho mutation. Password lấy từ Secret
Manager `zalo-ultty-operator-password`; deploy đầu chỉ tạo ADMIN khi chưa tồn tại, deploy sau không
reset credential. Không đưa API key vào bundle browser. `AUTH_MODE=none` chỉ dành cho local/CI
không public.

**Lưới an toàn nên bật cùng lúc:** `DATA_CLASSIFICATION=customer`. Cổng này ép sẵn
`PARSER_MODE=claude` + `ANTHROPIC_API_KEY` + `PERSISTENCE=prisma` + auth ngay **lúc boot**
([env.ts](../../../packages/shared/src/env.ts)) — đặt nó thì không thể vô tình chạy dữ liệu khách
bằng parser hoặc kho chưa được duyệt. Đặt biến này **trước**, để chính hệ thống chặn các sai sót còn lại.

---

## 3. Chặn ngoài — người ký, không phải code

### 3.1 Văn bản chấp nhận rủi ro ToS Zalo (D16)

Kênh `zca` là userbot đăng nhập tài khoản Zalo cá nhân qua Zalo Web ⇒ **vi phạm ToS Zalo, tài khoản
có thể bị khóa bất kỳ lúc nào**. Cần văn bản khách xác nhận đã hiểu và chấp nhận rủi ro trước khi
chạy thật. Nền pháp lý: **Luật BVDLCN 91/2025/QH15 + NĐ 356/2025** (hiệu lực 01/01/2026).

### 3.2 Ai đứng tên tài khoản Zalo phụ (D20)

Bắt buộc dùng **tài khoản phụ + SIM riêng**, **không** dùng tài khoản Sale chính — tài khoản bị khóa
là mất luôn kênh làm việc của Sale. Ràng buộc kỹ thuật kèm theo: mỗi tài khoản chỉ **một** listener;
mở Zalo Web cùng tài khoản thì listener tự dừng.

### 3.3 Thỏa thuận xử lý dữ liệu cho parser

Danh sách bên thứ 3 được duyệt hiện là **KiotViet + Claude API**. Stack pilot đang chạy
`PARSER_MODE=flowise` (đi tiếp sang DeepSeek) — **DeepSeek chưa nằm trong danh sách này**. Trước khi
có PII thật phải chọn một trong hai: đổi sang `PARSER_MODE=claude`, **hoặc** bổ sung DeepSeek vào hợp
đồng/DPA. Kênh `zca` đọc *mọi* tin trong nhóm nên khối lượng dữ liệu đẩy sang LLM lớn hơn hẳn kênh Bot.

### 3.4 Hồ sơ chuyển dữ liệu xuyên biên giới (D22)

Server giữ ở GCP (sau này chuyển OVHcloud) ⇒ nghĩa vụ hồ sơ theo Điều 18 NĐ 356/2025 vẫn còn.

### 3.5 Nhãn nội dung tự động

Điều khoản Zalo yêu cầu báo cho thành viên nhóm biết họ đang tương tác với hệ thống tự động. Code đã
gắn nhãn vào mọi tin gửi ra (`AUTO_LABEL`, có test E2E khẳng định) — phần còn lại là **thông báo cho
các nhóm pilot** trước khi bật.

---

## 4. Bốn nghiệp vụ đang fail-closed có chủ ý

Không chặn go-live nếu khách chấp nhận Sale làm tay phần này. Hệ thống **ép 0 + cảnh báo ⇒ đơn luôn
chuyển Sale**, và hiện rõ ở tab "Sẵn sàng vận hành" dưới nhãn `business.*`.

| Nghiệp vụ | Vì sao đóng | Mở được khi |
|---|---|---|
| VAT | Chưa chốt mặc định xuất hay không (**D8**) — hợp đồng có nhắc tính VAT | Khách chốt D8 |
| COD + cước ship | Có nguồn cho ngưỡng "miễn phí từ 2 SP", **không** có nguồn cho số tiền cước (**A3**) | Khách gửi biểu phí |
| Công nợ 7 ngày | PO ký gửi ghi "thanh toán trong 7 ngày kể từ ngày xuất hóa đơn" — chưa rõ là chính sách mới hay điều khoản của `ky_gui` (**D15**) | Khách xác nhận D15 |
| Khuyến mãi | Không có nguồn xác nhận công thức 30+1 / 10+1 (**A7**) | Khách xác nhận A7 |

**Không suy diễn số tiền cho bốn mục này.** Bịa một con số ở đây là sai tiền thật của khách.

---

## 5. Trình tự bật an toàn

Làm đúng thứ tự. Mỗi bước có cách tự kiểm chứng; bước sau không bắt đầu khi bước trước chưa xanh.

1. **Dữ liệu trước, kênh sau.** Nhập bảng giá tháng hiện hành (A6) + đại lý/map nhóm (A4) →
   kiểm: tab "Sẵn sàng vận hành" thấy `price.current_period` và `groups.mapped` chuyển `ready`.
2. **Đóng cổng pháp lý** §3.1 + §3.2 + §3.3 → có văn bản trong tay, không phải "đã trao đổi miệng".
3. **Bật `DATA_CLASSIFICATION=customer`** → API fail-fast nếu parser/persistence/auth chưa đạt.
   Đây là bước bắt hệ thống tự tố cáo phần còn thiếu, làm sớm để lộ sai sớm.
4. **Bật xác thực** (§2.2) + đặt `PERSISTENCE=prisma` → kiểm: gọi thẳng `/settings` không đăng nhập
   phải nhận 401, sai vai phải nhận 403.
5. **Bật kho media** (`MEDIA_STORE=s3`) → kiểm: `GET /health/media` trả `reachability.healthy = true`
   (đây là kết quả **chạm thật** vào bucket; `storage.state` chỉ suy từ bộ đếm tải ảnh nên trước khi
   có ảnh đầu tiên nó luôn báo "healthy" kể cả khi bucket không tồn tại).
   `deploy/netviet/render-secrets.sh` đã render sẵn 6 biến `MEDIA_*` và **chỉ** đặt `s3` khi có đủ
   bucket + 2 khoá HMAC; thiếu một cái → `none` kèm cảnh báo ra stderr.
   ⚠️ **Bẫy:** rule lifecycle `media/` gắn vào **bucket sao lưu**; `MEDIA_BUCKET` trỏ sai bucket thì
   rule giữ ảnh 60/365 ngày **không có tác dụng mà cũng không báo lỗi**. Vì vậy `MEDIA_BUCKET` mặc
   định lấy thẳng từ `BACKUP_BUCKET` mà deploy truyền vào, không để người deploy gõ tay.
   ⛔ **Chặn hiện tại (13/08/2026): không tạo được khoá HMAC trên project pilot.**
   `gcloud storage hmac create` trả `HTTPError 412: Request violates constraint
   'constraints/iam.disableServiceAccountKeyCreation'` — chính sách **cấp tổ chức** đang chặn tạo
   khoá cho service account. Hai đường đi, đều là **quyết định của chủ tổ chức**, không phải việc
   sửa code: (a) xin ngoại lệ policy cho project `netviet-host-968934832433`; hoặc (b) cấp khoá HMAC
   từ một project/tài khoản lưu trữ khác rồi nạp vào 2 secret
   `zalo-ultty-media-access-key-id` / `zalo-ultty-media-secret-access-key`.
   Trong lúc chờ, hệ thống **fail-closed đúng**: `MEDIA_STORE=none`, cổng `media.production` báo
   `missing` chứ không báo xanh giả.
6. **Chạy golden eval** → trỏ `GOLDEN_EVAL_REPORT_PATH`; chưa đạt ngưỡng thì dừng ở đây.
7. **Bật kênh Zalo cuối cùng** (§2.1), **`AUTO_SEND=off`** trước → chạy 1-2 nhóm pilot ở chế độ Sale
   duyệt tay, đối chiếu đơn AI tính với đơn Sale tự tính.
8. **Chỉ khi bước 7 khớp mới bật `AUTO_SEND=on`.** Đây là kill switch vận hành, không phải policy —
   ngưỡng tự xác nhận nằm trong gói khách (`orderAutomation.maxAutoConfirmQuantity`).

---

## 6. No-go và rollback

**Không bật (hoặc tắt ngay) khi:**

- tab "Sẵn sàng vận hành" còn bất kỳ cổng bắt buộc nào không `ready`;
- chưa có kỳ giá `active` tháng hiện tại — hệ thống sẽ không tự chốt đơn nào;
- golden eval chưa đạt ngưỡng, hoặc chưa từng chạy;
- chưa có văn bản §3.1/§3.2;
- Sale phát hiện **một** đơn AI tính sai tiền trong giai đoạn bước 7.

**Rollback nhanh nhất, theo thứ tự thiệt hại tăng dần:**

1. `AUTO_SEND=off` — dừng tự gửi, vẫn đọc và vẫn lưu tin. Đổi được ngay trên `/settings`, không cần deploy.
2. `sudo /srv/netviet/apps/zalo-ultty/set-channel-mode.sh mock` — ngắt hẳn đọc/gửi Zalo và
   recreate API; `AUTO_SEND` cũng về `off`.
3. Rollback ảnh + restore DB — [deploy/netviet/rollback.sh](../../../deploy/netviet/rollback.sh),
   [restore-check.sh](../../../deploy/netviet/restore-check.sh).

**Không bao giờ xóa tin/đơn để "làm sạch"** — Zalo không phát lại tin, mất là mất vĩnh viễn.
Gỡ nhóm khỏi danh sách dùng `PUT /settings/groups/:chatId/hidden` (đảo ngược được), không xóa hàng.

---

## 7. Sau khi bật — theo dõi gì trong tuần đầu

- **Tin không tạo được đơn**: nhóm chưa map sẽ vào DB với nhãn `stored_only` — soát hằng ngày, map bổ sung.
- **`mediaError`** trên bảng tin: link ảnh Zalo chết sau ≤35 ngày, tải hỏng thì mất ảnh vĩnh viễn.
- **Tỷ lệ handoff**: cao bất thường thường là hết hạn kỳ giá hoặc thiếu map đại lý, không phải parser dốt.
- **Hàng việc Sale nhập ERP**: đơn `sent` mà `salesHandoff` treo `pending` lâu = đơn khách đã nhận
  xác nhận nhưng chưa vào KiotViet.
- **Log `[AUTO_SEND]`**: mỗi lần tự gửi đều có dòng log kèm id đơn.
