# Runbook: lần vết một nghiệp vụ chạy sai

> **Viết cho người mới vào dự án.** Không cần biết trước kiến trúc, không cần đọc source.
> Nếu bạn phải mở source để biết một tin nhắn đã đi qua đâu, tài liệu này đã thất bại — hãy báo.
>
> Nền tảng: [docs/kien-truc/observability-review.md](../../kien-truc/observability-review.md)

---

## 0. Ba thứ cần biết trước

| Thứ | Là gì |
|---|---|
| **`traceId`** | 32 ký tự hex, định danh **một lượt xử lý** (một tin Zalo, một request). Mọi log, mọi quyết định, mọi lần gọi LLM của lượt đó đều mang nó. |
| **`decision`** | Một **cổng nghiệp vụ** đã mở hay đóng, **kèm lý do có mã**. Đây là thứ trả lời "vì sao". |
| **`ai_call`** | Một lần gọi LLM: model, độ trễ, token, công cụ đã dùng. |

**Hai đường vào — chọn cái gần bạn nhất:**

| Bạn là ai | Dùng gì |
|---|---|
| Sale / người vận hành | Mở đơn trong console → bấm **"Xem luồng xử lý"** |
| Developer / trực sự cố | `docker logs … \| node tools/trace-view.mjs` |

Nút trên console đọc từ **bộ đệm trong tiến trình API** (300 lượt gần nhất) — đủ cho "vừa xảy ra
xong". Lượt cũ hơn, hoặc lượt của một container đã restart, chỉ còn trong log máy chủ:

```bash
docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs
```

Nó biến hàng nghìn dòng JSON thành cây nghiệp vụ đọc được.

> Console mặc định **ẩn bước kỹ thuật** (`*.persist`) — bấm "Hiện chi tiết kỹ thuật" khi cần.
> Bản dòng lệnh luôn hiện đủ.

> ⚠️ Không ra gì? Kiểm tra `LOG_FORMAT=json` trên stack. Thiếu nó thì log là text, không phải JSON.
> Xem §6.

---

## 1. Một cây trace trông như thế nào

```
TRACE dd1e6c044bd0300a22cd9d3c22163dd9
  ultty/gd1-test · release=c37ee0440a1b · nhom=2508572440887686813 · 2412ms
  . message.persist 9ms
  v message.intake -> allowed ACCEPTED
  . agent.run 2412ms
    * AI parse deepseek/deepseek-v4-flash 1420ms 2310->96 tok
    v agent.tool_authorization -> allowed GRANTED
    * AI compose deepseek/deepseek-v4-flash 2870ms 3980->210 tok cong cu=[tra_cuu_san_pham,sua_don]
    v advisor.compose -> allowed COMPOSED {"toolRounds":2,"handoff":0}
    ~~ Order.quantity: 20 -> 5
    v supervisor.risk -> allowed ALLOWED {"riskLevel":"none"}
  x order.auto_confirm -> denied QUANTITY_ABOVE_THRESHOLD {"totalQuantity":80,"threshold":50}
  >> Order pending_review -> needs_edit (QUANTITY_ABOVE_THRESHOLD)
```

> **Cây này PHẲNG ở tầng ngoài, có chủ ý.** `message.persist`, `message.intake`, `agent.run` và
> `order.auto_confirm` là anh em cùng cấp — **không có span gốc `pipeline.turn`**. Chính `traceId`
> ở dòng đầu là thứ gom chúng lại. Nếu bạn thấy tài liệu hay ví dụ nào vẽ một span bao ngoài, đó là
> tài liệu sai, không phải bản deploy sai (đã sửa 22/08/2026).

**Cách đọc:**

| Ký hiệu | Nghĩa |
|---|---|
| `.` | một **bước nghiệp vụ** + thời gian chạy |
| `v` / `x` / `~` | cổng quyết định **mở** / **đóng** / **chạy đường dự phòng** |
| `*` | một lần gọi **LLM** |
| `>>` | **chuyển trạng thái** |
| `~~` | **thay đổi dữ liệu** (delta) |

Dòng thứ hai luôn cho biết **khách nào · môi trường nào · commit nào**.

---

## 2. CASE: "Khách báo bot trả lời sai"

### Bước 1 — tìm lượt

Có `traceId` (từ console, cột đơn) thì dùng thẳng:

```bash
docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs --trace <traceId>
```

Không có? Lọc theo nhóm hoặc đơn:

```bash
docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs --chat <chatId> --limit 5
```

```bash
docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs --order <orderId>
```

### Bước 2 — đọc cây, từ trên xuống

Dừng ở **dấu `x` đầu tiên**. Đó gần như luôn là câu trả lời.

### Bước 3 — xem AI đã làm gì

Dòng `* AI compose` cho biết **model nào**, **mất bao lâu**, **gọi công cụ nào**.

- **Không có dòng `AI compose` nào?** → agent **chưa từng được gọi**. Xem CASE ở §4.
- **Có nhưng `cong cu=[]`?** → LLM trả lời mà không tra cứu nguồn sự thật. Nghi ngờ câu trả lời.

### Bước 4 — xác định release

Dòng thứ hai: `release=c37ee0440a1b`. Đó là 12 ký tự đầu của git SHA.

```bash
git show c37ee0440a1b --stat
```

### Bước 5 — xem log thô nếu cần

```bash
docker logs zalo-ultty-gd1-test-api-1 2>&1 | grep '<traceId>' | jq .
```

---

## 3. CASE: "Vì sao đơn này không tự gửi?"

Tìm dòng `order.auto_confirm`. Lý do là **một mã**, tra ở bảng:

| Mã | Nghĩa | Việc cần làm |
|---|---|---|
| `POLICY_DISABLED` | `orderAutomation.enabled=false` trong gói khách | Sửa `tenants/<slug>/tenant.json` |
| `KILL_SWITCH_OFF` | `AUTO_SEND=off` | Công tắc vận hành — bật có chủ ý ở `/settings` |
| `MANUAL_REVIEW` | Thành viên thuộc diện Sale duyệt tay | Đúng thiết kế |
| `NOT_ORDER_INTENT` | Tin không phải đặt đơn | Nghi parser sai → xem `AI parse` |
| `ORDER_NOT_PRICED` | Rules engine không tính được giá | Thiếu SKU/bảng giá → `/admin` |
| `DEALER_UNKNOWN` | Nhóm chưa map đại lý | Map nhóm ở `/settings` |
| `PRICING_WARNINGS` | Có cảnh báo khi tính giá | `detail.warnings` cho số lượng |
| `NO_ORDER_LINES` | Đơn rỗng | Parser bóc hụt |
| `LINE_NOT_FULLY_PRICED` | Dòng hàng chưa khớp SKU/giá | Glossary hoặc bảng giá |
| `QUANTITY_ABOVE_THRESHOLD` | Vượt ngưỡng tenant | **Đúng thiết kế** — `detail` có số thật và ngưỡng |

Ví dụ đọc thẳng ra kết luận:

```
x order.auto_confirm -> denied QUANTITY_ABOVE_THRESHOLD {"totalQuantity":80,"threshold":50}
```

→ Không phải lỗi. Đơn 80 sản phẩm, ngưỡng tự gửi của khách là 50. Sale phải duyệt.

---

## 4. CASE: "AI trả lời đúng nhưng hệ thống không gửi"

Đây là ca khó nhất, và là ca đã tốn **hai ngày** hồi 19–21/08/2026.

Đọc **hai dòng, theo thứ tự**:

```
v advisor.compose   -> ...
x advice.auto_reply -> denied <MÃ>
```

| Mã ở `advice.auto_reply` | Nghĩa |
|---|---|
| `KILL_SWITCH_OFF` | `AUTO_SEND=off` |
| `MANUAL_REVIEW` | Người gửi thuộc diện duyệt tay |
| `ORDER_INTENT_HAS_OWN_PATH` | Đặt đơn đi đường xác nhận riêng — bình thường |
| `STATUS_NOT_PENDING_REVIEW` | Đơn **đã bị đẩy khỏi** `pending_review` trước đó → **xem dòng `advisor.compose` ngay trên** |
| `NO_OUTBOUND_CONTENT` | Vai soạn xong nhưng không có payload |
| `SUPERVISOR_FLAGGED_RISK` | Giám sát chặn — `detail.reasons` nói vì sao |
| `AGENT_REQUESTED_HANDOFF` | Chính LLM xin chuyển người thật |

Và ở `advisor.compose`:

| Mã | Nghĩa |
|---|---|
| `COMPOSER_DISABLED` | ⚠️ **`ADVICE_COMPOSER` đang tắt — agent CHƯA TỪNG gọi LLM.** Đây chính là sự cố 19–21/08. Triệu chứng bên ngoài là "AI trả lời y hệt nhau". Bật bằng `ADVICE_COMPOSER=claude\|deepseek` **và** khoá tương ứng — thiếu một trong hai là quay lại đúng mã này. |

> **Bẫy đã cắn lần thứ hai (22/08/2026).** Trên bản deploy `1e009a44` mã trên **không bao giờ
> xuất hiện**, dù `ADVICE_COMPOSER` thật sự đang rỗng. Lý do: DI luôn tiêm một `AdvisorAgent`, và
> khi công tắc rỗng thì cái được tiêm là `NoopAdvisorAgent` chứ không phải `undefined` — nên
> orchestrator đi tiếp, gọi `reply()` (trả `null` ngay lập tức) rồi ghi:
>
> ```
> * AI compose noop/noop 0ms
> ~ advisor.compose -> degraded LLM_RETURNED_NOTHING
> ```
>
> Đọc theo bảng này thì đó là "LLM hỏng/hết vòng công cụ" — **sai hoàn toàn**, vì chưa có lần gọi
> LLM nào. Đã sửa: `AdvisorAgent.composes` là cờ có kiểu, `NoopAdvisorAgent` đặt `false`, và
> orchestrator dừng trước khi ghi span AI giả. **Nếu bạn đang debug một bản cũ hơn `1e009a44` và
> thấy `noop/noop`, hãy đọc nó là `COMPOSER_DISABLED`.**
| `DETERMINISTIC_PATH_SUFFICIENT` | Đơn đủ dữ kiện, không cần LLM viết lại — bình thường |
| `LLM_RETURNED_NOTHING` | LLM hỏng/hết vòng công cụ/lộ số tiền không có trong kết quả công cụ → lui về đường tất định |
| `COMPOSED` | Agent đã soạn. `detail.handoff=1` nghĩa là nó tự xin chuyển Sale |

**Lối tắt:** liệt kê mọi lượt có cổng bị đóng:

```bash
docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs --denied
```

---

## 5. CASE: "Đơn không sang integration (ERP/KiotViet)"

**Đọc kỹ trước khi debug:** GĐ1 **không** gọi ERP. `ErpPort` tồn tại nhưng **không nằm trong
luồng GĐ1** (CLAUDE.md, quyết định kiến trúc #7). Sau khi hệ thống xác nhận, **Sale nhập KiotViet
bằng tay**.

Nên câu hỏi thật là: *"vì sao Sale không nhận được hàng việc?"*

1. Kiểm tra đơn có tới trạng thái cuối không:
   ```bash
   docker logs zalo-ultty-gd1-test-api-1 2>&1 | node tools/trace-view.mjs --order <orderId>
   ```
2. Tìm dòng `>> Order ... -> ...`. Không có = đơn chưa từng đổi trạng thái.
3. Nếu thấy `x outbound.send_confirmation` kèm lỗi → kênh Zalo hỏng, không phải nghiệp vụ hỏng.

---

## 6. Không thấy trace nào?

Theo thứ tự — dừng ở cái đầu tiên sai:

```bash
docker exec zalo-ultty-gd1-test-api-1 printenv LOG_FORMAT DEPLOYMENT_ENVIRONMENT RELEASE_GIT_SHA
```

| Triệu chứng | Nguyên nhân | Sửa |
|---|---|---|
| `LOG_FORMAT` rỗng | Biến chưa tới container | Phải có ở **CẢ HAI**: `render-secrets.sh` **và** khối `environment:` của service `api` trong `compose.yaml`. Đây là cái bẫy đã làm `ADVICE_COMPOSER` rỗng suốt hai ngày. |
| Log vẫn là text | `LOG_FORMAT != json` | Đặt `LOG_FORMAT=json`, deploy lại |
| `release=?` | `RELEASE_GIT_SHA` chưa tới | Như trên |
| `environment` sai | `DEPLOYMENT_ENVIRONMENT` chưa tới | Như trên |

Hợp đồng này có test tự động:

```bash
node --test deploy/netviet/secrets-passthrough.contract.test.mjs
```

---

## 7. Điều gì **không** nằm trong trace (có chủ ý)

| Không có | Vì sao |
|---|---|
| Bí mật (mật khẩu, JWT, khoá API, credential DB) | Bị xoá ở **mọi** mức, kể cả `full`. Không có chế độ nào để bật. |
| PII trên stack khách thật | `DATA_CLASSIFICATION=customer` → mức `redacted`: SĐT/email/địa chỉ/tên bị xoá. |
| Prompt thô trên stack khách thật | Cùng lý do. Trên `gd1-test` (`DATA_CLASSIFICATION=test`) thì có. |
| Token đếm được | Mới nối cho đường parse; đường `compose` chưa chuyển `usage` ra ngoài — xem §9. |
| Truy vấn DB | Chưa bật `@prisma/instrumentation`. Đã có kế hoạch, chưa cần. |
| Mọi lời gọi hàm | **Cố ý.** Chỉ trace ranh giới nghiệp vụ. Một lượt chạy 50 hàm vẫn chỉ hiện ra 5–15 bước. |

---

## 8. Đọc trace trên máy dev

```bash
LOG_FORMAT=json pnpm dev:api
```

rồi ở cửa sổ khác:

```bash
pnpm trace --trace <traceId>
```

---

## 9. Giới hạn đã biết

| Giới hạn | Ảnh hưởng |
|---|---|
| Trace sống trong `docker logs` (xoay theo cấu hình Docker) | Không truy được lượt quá cũ. Cần lâu hơn thì dựng backend — xem [observability-review.md §13](../../kien-truc/observability-review.md). |
| Một VM một stack — chưa gộp log nhiều host | Đúng ý đồ ở quy mô hiện tại. |

### 9.1 Cái gì mất, mất lúc nào (đo 22/08/2026)

Hai sự kiện **rất khác nhau** hay bị gộp làm một:

| | `docker restart` (API tự khởi động lại) | **Redeploy** (`compose up` tạo container mới) |
|---|---|---|
| Vòng đệm console (`RecentTracesSink`, 300 lượt) | **MẤT** | **MẤT** |
| `docker logs` NDJSON — nguồn đầy đủ của mọi trace | **CÒN** | ❌ **MẤT VĨNH VIỄN** (log gắn với container cũ, container cũ bị xoá) |
| `Message`, `Order`, `OrderMessage`, `AuditLog` trong Postgres | **CÒN** | **CÒN** |
| `traceId` để tra ngược | **CÒN** trong log | mất — nhưng `--order <orderId>` vẫn tra được **nếu** log còn |

**Đọc ra:** dữ liệu **nghiệp vụ** không bao giờ mất — Postgres của khách là nguồn bền vững và nó
giữ đủ tin, đơn, và mối nối giữa hai thứ đó. Cái mất là **vết suy luận** (quyết định, lý do, lần
gọi LLM, thời gian), và nó mất **theo vòng đời container**, không theo thời gian.

⚠️ **Hệ quả thực dụng:** *sau khi deploy, mọi trace trước đó đã mất.* Cần giữ bằng chứng của một
sự cố thì **kéo log ra file TRƯỚC khi deploy bản sửa**:

```bash
gcloud compute ssh netviet --zone asia-southeast1-b --tunnel-through-iap --command "docker logs zalo-ultty-gd1-test-api-1 2>&1" > su-co.ndjson
```

**Chưa làm gì thêm, có chủ ý** (xem [tong-quan.md §9.7](../ke-hoach/tong-quan.md)): lưu trace vào
Postgres nghĩa là thêm bảng + migration trên bốn stack khách đang chạy, cộng chính sách lưu trữ
cho dữ liệu có PII — đúng cái độ phức tạp mà §9.2 đã cân nhắc rồi từ chối. Ở mức 10–20 đơn/ngày,
"kéo log ra file trước khi deploy" giải quyết đủ.

---

## 10. Sự cố hạ tầng đã gặp: deploy đỏ vì SSH, không phải vì code

Ngày 21/08/2026, hai lần deploy `gd1-test` đỏ ở hai chỗ khác nhau nhưng **cùng một gốc**:

| Triệu chứng trong log CI | Thực tế |
|---|---|
| `Permission denied (publickey)` khi `gcloud compute ssh` | SSH/OS Login chập chờn |
| `required secret #12 does not exist / has no enabled version / is empty` | **Báo động giả** — secret vẫn tồn tại và enabled |

**Vì sao dòng thứ hai gây hiểu nhầm:** `collectSecretMetadata()` đặt
`readable = probed.ok && probe.accessible === true`. Khi **lệnh SSH probe** hỏng, `probed.ok` là
`false`, nên cả bốn cờ (`exists`, `enabledVersion`, `vmCanAccess`, `nonEmpty`) đều thành `false`
cùng lúc — in ra thành bốn dòng nghe như secret bị xoá.

**Cách phân biệt trong 30 giây** trước khi đi tạo lại secret:

```bash
gcloud secrets versions list zalo-<stack>-<suffix> --project <project> --limit=3
```

Có dòng `enabled` → secret ổn, lỗi nằm ở SSH. **Chạy lại deploy.** Cả hai lần trong ngày đều
xanh ở lần chạy lại.

Bốn cờ cùng đỏ một lúc là **dấu hiệu của probe hỏng**, không phải của bốn vấn đề riêng biệt.

---

## 11. ⚠️ Đừng tự ý `--force-recreate` container edge

Ngày 21/08/2026 một lần `docker compose up -d --force-recreate gateway` trên edge làm **cả bốn
stack trả 502 cùng lúc** — `ultty` (production), `ultty-gd1-test`, `wata`, `amico`.

**Vì sao:** edge đi ngược vào silo của từng khách bằng `docker network connect`. Tạo lại container
làm **rụng hết** các network attachment đó, nên Caddy không còn đường tới `api-<slug>`/`web-<slug>`.
`deploy-stack.sh` có nối lại, nhưng **chỉ cho stack đang deploy** — các khách khác không có lần
deploy nào để tự nối lại.

**Khắc phục trong 30 giây** nếu đã lỡ:

```bash
for s in ultty ultty-gd1-test wata amico; do sudo docker network connect zalo-${s}_backend netviet-edge-gateway-1 2>/dev/null; done
```

Rồi kiểm tra:

```bash
for d in demo-ultty demo-ultty-gd1-test demo-wata demo-amico; do curl -s -o /dev/null -w "$d %{http_code}\n" https://$d.35-187-235-82.sslip.io/health; done
```

`deploy-remote.sh` nay tự quét `zalo-*_backend` và nối lại **mọi** khách sau khi đưa edge lên, nên
đường deploy chuẩn không còn dính lỗi này. Cảnh báo trên dành cho thao tác tay.

**Đổi Caddyfile thì gần như không cần recreate nữa:** rsync đã chuyển sang `--inplace` và
deploy có bước `caddy reload` (§10 giải thích vì sao cần cả hai).
