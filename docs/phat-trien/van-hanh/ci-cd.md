# Quy trình CI/CD — tài liệu cho AI coding agent

Đối tượng đọc: **AI coding agent** làm việc trong repo này, và kỹ sư trực deploy. Đọc hết trước khi
sửa bất cứ thứ gì trong `.github/workflows/` hoặc `deploy/`.

---

## 0. Ai là ai (hiểu sai chỗ này là đặt tên sai cả code lẫn tài liệu)

| Tên | Vai | Xuất hiện trong repo dưới dạng |
|---|---|---|
| **Nexagnet** | Chủ repo, chủ nền tảng | `nexagnet-platform` (tên repo), `@nexagnet/marketing`, `nexagnet247.com` |
| **NetViet** | Đối tác, cũng làm giải pháp phần mềm | `netviet-host-968934832433` (GCP project), `deploy/netviet/`, `@netviet/api`, VM `netviet`, mạng `netviet-edge` |
| **Ultty, Amico, …** | **Khách hàng** (của NetViet hoặc của Nexagnet) | `tenants/<slug>/`; stack/secret `zalo-<slug>` là tên hạ tầng legacy hiện hành, không phải platform domain |

Nền tảng này phục vụ **cả khách của NetViet lẫn khách riêng của Nexagnet**. Ultty chỉ là khách đầu
tiên, không phải chủ đề của dự án.

> **KHÔNG đổi tên các định danh hạ tầng mang chữ `netviet`.** GCP project ID không đổi được sau khi
> tạo; tên compose project quyết định **tên volume**, đổi là mất dữ liệu PostgreSQL của khách đang
> chạy. Chữ `netviet` trong hạ tầng là **tên riêng của một hệ thống đang chạy**, không phải nhãn
> thương hiệu cần đồng bộ. Chỉ tầng ứng dụng và tài liệu mới trung tính hoá.

---

## 1. Bản đồ pipeline

```
push main ──┬─→ ci.yml ─────────────── 6 job, chặn mọi thứ nếu đỏ
            │
            └─→ deploy-marketing.yml ─ chỉ khi đụng apps/marketing/** hoặc pnpm-lock.yaml

chạy tay ───→ deploy-tenant.yml ─────→ reusable-deploy-tenant.yml (chọn tenant + env dev/production)
```

| Workflow | Kích hoạt | Cổng duyệt | Đích |
|---|---|---|---|
| `ci.yml` | push `main`, mọi PR | — | 6 job: `verify`, `integration`, `tenant-packs`, `e2e`, `audit`, `images` |
| `deploy-tenant.yml` | **chạy tay** | `dev` = không; `production` = có | Stack một khách trên VM |
| `deploy-marketing.yml` | push `main` (đường dẫn marketing) | không | Cloud Run `nexagnet-marketing` |
| `reusable-deploy-tenant.yml` | `workflow_call` | theo `environment` truyền vào | — (thư viện, không tự chạy) |

**Stack khách KHÔNG deploy theo push.** Với nhiều khách thì "deploy khi push" không trả lời được câu
hỏi *đưa lên khách nào*; và trên thực tế đường tự động cũ (`deploy.yml`) chưa deploy thành công lần
nào — mọi run đều kết thúc `cancelled` ở cổng duyệt. Tệ hơn: một run **đang chờ duyệt vẫn chiếm làn
concurrency** của khách đó nên nó chặn cả những lần deploy tay hợp lệ. Đã xoá 17/08/2026; chỉ còn
`deploy-tenant.yml`, muốn có cổng duyệt thì chọn `environment: production`.

**Chỉ có MỘT bản logic deploy stack khách**, nằm trong `reusable-deploy-tenant.yml`. Nếu bạn định
sửa bước deploy, sửa ở đó — đừng chép sang file khác.

---

## 2. Bảy bất biến — vi phạm là hỏng dữ liệu khách, không phải hỏng build

1. **Một image, mọi khách.** Image không được mang tên, dữ liệu hay thương hiệu của bất kỳ khách
   nào. `.dockerignore` loại `tenants/` và `**/e2e`. Hai test canh cổng này:
   `deploy/netviet/caddy-route-contract.test.mjs` và `apps/web/tenant-runtime.contract.mjs`
   (build một lần, chạy hai gói giả có experience khác nhau, đòi branding/composition đổi theo).
2. **Gói khách đi ngoài image.** `tenants/<slug>/` được upload riêng theo từng stack và mount
   **chỉ-đọc**. Một gói nằm trong image nghĩa là ai `docker save` cũng đọc được giá sỉ của khách kia.
3. **STACK SLUG là một nguồn duy nhất.** `STACK SLUG = tenant + môi trường`
   (`deploy/netviet/stack-identity.mjs`). Nó quyết định *đồng thời*: thư mục stack, tên compose
   project (⇒ **tên volume**), tiền tố secret, alias mạng, hostname, unit systemd, tiền tố backup.
   Đừng để một đường suy ra slug còn đường kia mặc định — đó chính là lỗi 17/08 (xem §6.1).
   `dev`/`production`/`legacy` suy ra **đúng tenant slug**, nên stack đang chạy không đổi tên;
   môi trường khác (`gd1-test`) ra một stack hoàn toàn riêng. **Tenant slug vẫn là thứ chọn GÓI
   KHÁCH** — một khách có hai stack thì vẫn chỉ có một `tenants/<slug>/`, không fork.
4. **Mỗi khách một mạng Docker riêng.** Docker tự đăng ký tên service làm alias DNS trên **mọi**
   mạng đã join; chung mạng là hai khách cùng trả lời cho `api`/`flowise` và DNS round-robin sẽ
   trộn chúng vào nhau. Edge `docker network connect` **ngược vào** từng mạng khách.
5. **Khách chính giữ tên miền trần.** `PRIMARY_TENANT` (hiện là `ultty`) dùng
   `operator.<ip>.sslip.io`; khách khác mang slug. Không phải thẩm mỹ: `OPERATOR_DOMAIN` đi thẳng
   vào `PUBLIC_BASE_URL` và Zalo **tự tải ảnh catalog** từ URL đó — đổi tên miền của khách đang
   chạy sẽ làm chết ảnh trong mọi tin đã gửi.
6. **LLM không tính tiền.** Parser chỉ phân loại ý định + trích xuất. Giá/ship/VAT/chính sách do
   rules engine TypeScript tính từ nguồn sự thật. Đừng đảo ngược để "cho nhanh".
7. **Cổng smoke không được làm yếu.** Khách chưa có nguồn sự thật thì smoke **bỏ qua đường đặt hàng
   và báo to** (`SMOKE_SKIPPED_ORDER_PATH=1`), chứ không im lặng đi qua như thể đã kiểm.

---

## 3. Trước khi push — chạy đủ 4 lệnh này

```bash
pnpm lint && pnpm typecheck && pnpm test && node --test deploy/netviet/caddy-route-contract.test.mjs
```

Nếu đụng `apps/web` hoặc `packages/tenant`, chạy thêm hợp đồng đa khách (cần build trước):

```bash
pnpm --filter @netviet/web build && pnpm test:tenant-runtime
```

Nếu đụng `apps/marketing`:

```bash
pnpm --filter @nexagnet/marketing build
```

Test Prisma (`*.int.spec.ts`) **không chạy được nếu không có Postgres**; chúng tự bỏ qua. Job
`integration` trên CI là nơi duy nhất chứng minh chúng. Đừng tuyên bố "đã kiểm" khi mới chỉ thấy
chúng `skipped`.

Job `tenant-packs` chạy `tenant-packs.spec.ts`, tự liệt kê **mọi thư mục** trong `tenants/`, nạp
từng gói bằng loader thật và kiểm slug trùng tên thư mục. Không thêm matrix tên khách vào CI. Job
này kiểm package contract; nó không thay thế DB integration hoặc web single-artifact contract.

---

## 4. Deploy

### 4.1 Một khách đã có sẵn

```bash
gh workflow run deploy-tenant.yml -f tenant=ultty -f environment=dev
```

`dev` không có cổng duyệt; `production` sẽ dừng chờ người duyệt. Hai lần deploy cùng một khách
không bao giờ chạy song song (`concurrency: deploy-tenant-<slug>`).

> **Merge xong ĐỪNG bấm deploy ngay.** Deploy đòi **đúng SHA** đang ở `main` phải có một lần chạy
> `ci.yml` **đã hoàn tất và xanh** — mà lần chạy đó chỉ bắt đầu khi merge. Bấm sớm thì fail ngay ở
> bước kiểm với dòng:
>
> ```
> Exact SHA <sha> does not have a successful completed CI run.
> ```
>
> Đây là cổng an toàn chứ không phải lỗi: nó chặn việc deploy một commit chưa ai kiểm. Đợi CI của
> `main` xanh rồi chạy lại — không cần sửa gì.
>
> ```bash
> gh run list --workflow=ci.yml --branch main --limit 1 --json headSha,status,conclusion
> ```
>
> Đã mất một lượt deploy vì chuyện này ngày 21/08/2026 (run 32444569841).

**Môi trường `gd1-test`** là một **stack RIÊNG** trên cùng VM, không phải một nhãn khác của stack
dev: nó có thư mục, compose project, volume, mạng, hostname và secret riêng. Xem
[`ultty-gd1-test-runbook.md`](ultty-gd1-test-runbook.md) trước khi đụng vào nó.

### 4.2 Lên một khách mới — thứ tự bắt buộc

1. Tạo `tenants/<slug>/tenant.json` + `tenants/<slug>/data/knowledge.json`. Zod validate lúc boot,
   sai là fail-fast. Job `tenant-packs` trên CI kiểm mọi gói.
2. Nếu là bootstrap hạ tầng lần đầu hoặc khôi phục sự cố **đã được phê duyệt**, bootstrap secret +
   quyền bằng một lệnh idempotent:
   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy/netviet/deploy.ps1 -Tenant <slug>
   ```
   Lệnh này tạo đủ 15 secret `zalo-<slug>-*` **kèm version đầu tiên** rồi cấp
   `roles/secretmanager.secretAccessor` cho service account của VM — hai việc đi từ **một** danh
   sách nên không lệch nhau được. **Không dùng script này để rollout tenant đang vận hành.**
3. Thêm `<slug>` vào allowlist input `tenant` trong `.github/workflows/deploy-tenant.yml`. Danh sách
   deploy vẫn cố ý thủ công vì chọn production target là external action; inventory động có approval
   riêng là backlog, không dùng CI inventory để tự mở target deploy.
4. Deploy: `gh workflow run deploy-tenant.yml -f tenant=<slug> -f environment=dev`.
5. Kiểm (§5).

### 4.3 Trang marketing

Tự động khi push `main` có đụng `apps/marketing/**`. Deploy **theo git SHA**, không theo `:latest`.

---

## 5. Kiểm sau deploy — 4 phép, làm đủ

```bash
IP=35-187-235-82   # đổi theo static IP thực tế
S=<slug>           # khách chính: bỏ hậu tố "-$S"

# 1. Endpoint sống
curl -s -o /dev/null -w '%{http_code}\n' https://operator-$S.$IP.sslip.io/health       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://operator-$S.$IP.sslip.io/zalo/status  # 401

# 2. Thương hiệu đúng khách
curl -s https://operator-$S.$IP.sslip.io/ | grep -o '<title>[^<]*</title>'

# 3. CÁCH LY MẠNG — phép quan trọng nhất, phải ra đúng một địa chỉ
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet \
  --command "docker exec \$(docker ps -q -f name=zalo-$S-api) getent hosts flowise"

# 4. Smoke đã chạy thật hay đã bỏ qua
gh run view <run-id> --log | grep -E 'SMOKE_ORDER_ID|SMOKE_SKIPPED_ORDER_PATH'
```

Phép 3 phải trả về **đúng một** địa chỉ, và đó phải là Flowise của chính khách đó. Trả về hai địa
chỉ nghĩa là cách ly đã thủng — dừng lại, đừng deploy tiếp.

---

## 6. Sự cố đã xảy ra thật — nhận diện nhanh

### 6.1 Gói khách này ghi đè lên gói khách kia (17/08/2026)
`deploy.ps1` đọc `$env:TENANT` để chọn gói upload nhưng gọi `deploy-remote.sh` **thiếu** tham số
slug, nên VM rơi về mặc định `ultty`. **Dấu hiệu:** deploy khách B xong, khách A hiển thị bảng giá
của khách B. **Đã khoá bằng test**; nếu bạn thêm đường deploy mới, phải truyền slug tường minh.

### 6.2 Đổi tên repo → CD chết ở bước `auth`
`setup-github-oidc.sh` ràng `assertion.repository` và `principalSet` theo `owner/repo`. Git remote
vẫn chạy nhờ GitHub redirect nên **trông như không có gì hỏng**, nhưng token OIDC mang tên mới bị
từ chối. **Cách đổi tên không có khoảng chết:** nới điều kiện nhận cả hai tên → đổi tên → chạy thật
một lần deploy → siết lại còn một tên.

### 6.3 Job CI "bị huỷ" chứ không "thất bại" (15–17/08/2026)
`verify` chạm timeout 20 phút mỗi lần chạy suốt hai ngày. Gói khách giả thiếu 4 trường bắt buộc mà
schema thêm sau → `next start` không phục vụ nổi request; và server hỏng **không bị dọn** nên
`node --test` treo đến hết timeout. **Dấu hiệu duy nhất trong log:**
`Terminate orphan process: next-server`. Bài học: mọi tiến trình con phải bị dọn trên **nhánh lỗi**,
nếu không một test thất bại sẽ hiện ra như một job bị huỷ và không ai đi tìm nguyên nhân.

### 6.4 Ký tự CR trong secret → Caddy trả 502
Secret tạo từ máy Windows có thể mang `\r` ở cuối. `$( )` cắt `\n` nhưng **không** cắt `\r`. Đã lọc
tại nguồn trong `render-secrets.sh`. Triệu chứng: `invalid header field value for "X-Api-Key"`.

### 6.5 Secret tạo ra nhưng không có version / thiếu IAM binding
Vòng lặp bootstrap đứt giữa chừng để lại secret rỗng; hoặc secret có mà service account VM không
được cấp quyền đọc → stack chết với `PERMISSION_DENIED`. `deploy.ps1` nay làm cả hai từ một danh
sách. Mật khẩu Flowise phải đủ 4 nhóm ký tự (regex trong `Ensure-FlowiseAdminPasswordSecret`).

### 6.6 Upload chậm 48 phút vì mỗi tệp một tunnel IAP
`gcloud compute scp --recurse` mở một tunnel cho **mỗi tệp**. 102 ảnh catalog = 48 phút. Đã đổi
sang gói **một** archive tar rồi giải nén trên VM: 31 giây.

---

## 7. Rollback

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --quiet \
  --command "sudo TENANT_SLUG=<slug> bash /srv/netviet/apps/zalo-<slug>/rollback.sh"
```

Backup chạy theo timer `netviet-backup@<slug>.timer`; khôi phục có `restore-check.sh`. Mọi tiến
trình đụng compose đều lấy chung một khoá (`.runtime/compose.lock`) — đừng thêm đường nào bỏ qua nó.

---

## 8. Đụng vào những chỗ này thì dừng lại và hỏi người

- Đổi `name:` trong `deploy/netviet/compose.yaml` (⇒ đổi tên volume ⇒ **mất dữ liệu PostgreSQL**).
- Đổi hostname của khách đang chạy (⇒ chết ảnh catalog trong tin Zalo đã gửi).
- Mở `admin` của Caddy ra ngoài loopback (⇒ container khách sửa được routing của khách khác).
- Bật `AUTO_SEND`, `CHANNEL_MODE=zca|bot`, `AUTH_MODE` — xem
  [`checklist-go-live.md`](checklist-go-live.md); hai công tắc đang khoá **có chủ ý**.
- Đưa dữ liệu thật của khách qua DeepSeek: **DeepSeek chưa nằm trong danh sách bên thứ ba được
  duyệt** (chỉ KiotViet + Claude API). Demo chỉ dùng nhóm/dữ liệu TEST.
- Xoá volume, xoá secret, `git push --force`.

---

## 9. Liên quan

- [`../ke-hoach/tong-quan.md`](../ke-hoach/tong-quan.md) — nguồn trạng thái duy nhất.
- [`checklist-go-live.md`](checklist-go-live.md) — điều kiện bật pilot dữ liệu thật.
- [`ultty-gd1-test-runbook.md`](ultty-gd1-test-runbook.md) — môi trường kỹ thuật GD1-test.
- [`../../kien-truc/nen-tang-da-khach.md`](../../kien-truc/nen-tang-da-khach.md) — kiến trúc đa khách.
- [`../../../deploy/netviet/README.md`](../../../deploy/netviet/README.md) — chi tiết vận hành VM.
