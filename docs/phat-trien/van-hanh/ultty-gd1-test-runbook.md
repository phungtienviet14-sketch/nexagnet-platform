# Runbook — môi trường kỹ thuật Ultty GD1-test

> Môi trường **trước Pilot**. Nó tồn tại để chứng minh đường kỹ thuật chạy thật, **không mock thành
> phần nào trong phạm vi GĐ1**, trên dữ liệu TEST. GD1-test xanh **không** tự bật Pilot — xem §7.

---

## 1. Vì sao nó là một stack riêng, không phải một nhãn môi trường

Trước thay đổi này, mọi tên hạ tầng của một stack — thư mục, tên compose project (⇒ **tên volume**),
tiền tố secret, mạng Docker, alias trên edge, hostname, unit systemd — đều suy ra từ **tenant slug**
một mình. Hệ quả: `ultty/dev` và `ultty/production` *là cùng một stack* dưới hai cổng duyệt, và
deploy một nhãn `gd1-test` mới sẽ **ghi đè thẳng lên stack DEV đang chạy**.

Nguồn duy nhất nay là **STACK SLUG = tenant + môi trường** (`deploy/netviet/stack-identity.mjs`).
Bất biến 3 trong [ci-cd.md](ci-cd.md) được **giữ nguyên chứ không nới**: vẫn một giá trị quyết định
đồng thời tất cả các tên đó. Môi trường đã có trên VM (`dev`, `production`, `legacy`) suy ra ngược
lại đúng tenant slug, nên **không stack nào đang chạy phải di chuyển**.

| | DEV `zalo-ultty` | GD1-test `zalo-ultty-gd1-test` |
|---|---|---|
| Thư mục | `/srv/netviet/apps/zalo-ultty` | `/srv/netviet/apps/zalo-ultty-gd1-test` |
| Compose project | `zalo-ultty` | `zalo-ultty-gd1-test` |
| Volume | `zalo-ultty_postgres-data` · `_flowise-data` | `zalo-ultty-gd1-test_postgres-data` · `_flowise-data` |
| Mạng | `zalo-ultty_backend` · `_data` | `zalo-ultty-gd1-test_backend` · `_data` |
| Hostname | `operator.<ip>.sslip.io` (tên trần) | `operator-ultty-gd1-test.<ip>.sslip.io` |
| Secret | `zalo-ultty-*` | `zalo-ultty-gd1-test-*` |
| Backup | `stacks/ultty/` | `stacks/ultty-gd1-test/` |
| systemd | `netviet-*@ultty` | `netviet-*@ultty-gd1-test` |

**Gói khách KHÔNG fork.** Vẫn là `tenants/ultty/` duy nhất, mount chỉ-đọc vào cả hai stack. Khác biệt
môi trường nằm ở runtime config + secret + deployment target — không nằm ở code hay ở gói khách.

> Tên trần `operator.<ip>` **thuộc về DEV và phải ở lại đó**: `OPERATOR_DOMAIN` đi thẳng vào
> `PUBLIC_BASE_URL`, và Zalo **tự tải ảnh catalog** từ URL đó. Đổi tên miền của stack đang chạy sẽ
> làm chết ảnh trong **mọi tin Zalo đã gửi**. So sánh `PRIMARY_TENANT` nay theo *stack slug*, nên
> stack thứ hai của cùng khách không thể cướp tên đó.

---

## 2. Hồ sơ runtime bị ép cứng (không có mặc định âm thầm)

`render-secrets.sh` **ép** các giá trị này khi `DEPLOYMENT_ENVIRONMENT=gd1-test`, và từ chối render
nếu tenant không phải `ultty`:

| Biên | Giá trị GD1-test | Ghi chú |
|---|---|---|
| `PERSISTENCE` | `prisma` | PostgreSQL 16 thật, volume riêng |
| `CHANNEL_MODE` | `zca` | fail-fast nếu bị override sang mock/bot |
| `PARSER_MODE` | `deepseek` | provider thật, **chỉ dữ liệu TEST** |
| `AUTO_SEND` | **`off`** | adapter thật vẫn nạp; chỉ chính sách tự gửi bị khoá |
| `AUTH_MODE` | `session` | không `none` |
| `MEDIA_STORE` | `gcs` | bucket thật qua ADC |
| `DATA_CLASSIFICATION` | `test` | |

`AUTO_SEND=off` **không phải mock**: adapter Zalo thật được nạp và gửi được. Nó tách hai việc vốn hay
bị lẫn — **REAL OUTBOUND ADAPTER VERIFIED** (adapter thật chạy được) và **AUTO_SEND POLICY ENABLED**
(được phép tự bắn vào nhóm). GD1-test chứng minh cái thứ nhất và **cố ý** không bật cái thứ hai.

---

## 3. Deploy

Cổng của workflow là **cố ý** và không được nới: `refs/heads/main` + CI xanh **đúng SHA đó**.

```bash
gh workflow run deploy-tenant.yml -f tenant=ultty -f environment=gd1-test
```

Trình tự bên trong: resolve target từ `.github/deployment-targets.json` → đối chiếu stack slug khai
báo với quy tắc suy ra (lệch là **từ chối**, không tự hoà giải) → kiểm CI đúng SHA → preflight
fail-closed **trước khi build** → build/push image theo digest → rollout → smoke.

### Lần deploy đầu (`firstRelease`)

Stack mới chưa tồn tại thì **không có gì để quan sát**: chưa có runtime, chưa có phiên zca (phiên đó
tạo bằng **quét QR trên trang operator của chính stack này**), và chưa có image cũ để rollback.
Preflight khai báo thẳng `firstRelease`, in `NOT PROVED YET` và **liệt kê từng mục hoãn sang bước
verify sau deploy**. Không có giá trị nào bị bịa. Redeploy sau đó giữ nguyên đầy đủ mọi kiểm tra.

---

## 4. Sau deploy — thứ tự bắt buộc

### 4.1 Gieo allowlist nhóm TEST (một lần)

Stack mới khởi động với allowlist **rỗng** — mặc định an toàn: không nhóm nào được xử lý.

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet --command \
  "sudo install -m 600 /dev/stdin /srv/netviet/apps/zalo-ultty-gd1-test/.runtime/zalo/zalo-allowed-groups.json <<< '[\"<GROUP_ID_1>\",\"<GROUP_ID_2>\"]'"
```

Đúng **hai** nhóm TEST đã được phê duyệt. Hash SHA-256 của chúng nằm trong biến môi trường GitHub
`GD1_TEST_APPROVED_GROUP_HASHES` (environment `gd1-test`); preflight của lần redeploy sau sẽ **fail
nếu allowlist lúc chạy lệch dù chỉ một ID**. **ID thật không bao giờ vào git.**

### 4.2 Đăng nhập tài khoản Zalo phụ

Mở `https://operator-ultty-gd1-test.<ip>.sslip.io/zalo` → tạo QR → quét bằng **tài khoản Zalo phụ**,
**không** dùng tài khoản đang gắn với stack DEV.

> **Một tài khoản Zalo chỉ chịu được MỘT listener.** Hai stack đăng nhập cùng một tài khoản sẽ đá
> phiên của nhau và cả hai đều không đáng tin. Đây là lý do GD1-test cần tài khoản riêng.

Đợi `state=ready` rồi mới sang bước sau.

### 4.3 Gửi một tin TEST thật và thu bằng chứng

Từ một tài khoản test, gửi vào **một trong hai nhóm TEST** một tin đặt hàng có mang **marker** duy
nhất (ví dụ `GD1TEST-<ngày>-<số>`).

```bash
node deploy/netviet/collect-deployment-evidence.mjs \
  --tenant ultty --environment gd1-test \
  --correlation 'GD1TEST-...' --out evidence.json

node deploy/netviet/verify-deployment.mjs \
  --tenant-pack tenants/ultty \
  --release release.json --evidence evidence.json
```

Collector chỉ **quan sát**, verifier chỉ **phán xử** — tách ra để một collector không thể tự cho mình
đỗ. Probe nào không chạy được thì để trống, và trường trống làm verifier **trượt**: đường duy nhất
tới PASS là thành phần thật trả lời thật.

Cột `source` của chính bản ghi tin đi vào bằng chứng, nên một marker đến qua `/demo/simulate` sẽ bị
**từ chối** chứ không được tính là inbound Zalo.

---

## 5. Rollback

| Tình huống | Đường lùi |
|---|---|
| Lần deploy đầu hỏng | **Không có image cũ để quay về** — đường lùi là **gỡ stack mới xuống** (`docker compose down` trong thư mục stack đó). DEV không bị đụng tới vì không dùng chung gì. |
| Redeploy hỏng | Ghim lại digest cũ (app **và** Flowise) theo `.runtime/rollback-release.json`, rồi chạy lại §4 để kiểm tra. |

**Không** tự động rollback migration DB. Sau mọi lần lùi phải kiểm lại: health, DB, tenant identity,
cách ly mạng, auth, trạng thái Zalo.

---

## 6. Cách ly khỏi stack DEV — kiểm nhanh

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet --command \
  "sudo docker exec \$(sudo docker ps -q -f name=zalo-ultty-gd1-test-api) getent hosts flowise"
```

Phải trả về **đúng một** địa chỉ, và đó phải là Flowise của chính stack này. Hai địa chỉ nghĩa là
cách ly đã thủng — dừng lại (sự cố 17/08/2026, [ci-cd.md](ci-cd.md) §6.1).

---

## 7. GD1-test xanh KHÔNG bật Pilot

```
GD1 TEST  →  technical proof  →  business/UAT approval  →  security/data approval  →  PILOT GD1
```

Sau khi GD1-test xanh, **không** được tự động: bật `AUTO_SEND`, đổi allowlist sang nhóm thật, thay dữ
liệu TEST bằng dữ liệu thương mại, nới auth, hay biến môi trường này thành production.

Còn chặn Pilot (không phải việc của GD1-test):

- **DeepSeek chưa nằm trong danh sách bên thứ ba được duyệt** (chỉ KiotViet + Claude API). Chạy dữ
  liệu khách thật qua nó cần đổi sang Claude **hoặc** bổ sung DPA trước.
- Kênh zca cần **văn bản chấp nhận rủi ro ToS** của khách + tài khoản phụ.
- `readiness` còn `parser_not_production_ready` và `missing_golden_dataset`.

---

## 8. Liên quan

- [ci-cd.md](ci-cd.md) — 7 bất biến, sự cố đã xảy ra, thứ tự lên khách mới
- [checklist-go-live.md](checklist-go-live.md) — điều kiện bật pilot dữ liệu thật
- [ultty-gd1-test-deployment-review.md](ultty-gd1-test-deployment-review.md) — audit đường deploy trước thay đổi này
