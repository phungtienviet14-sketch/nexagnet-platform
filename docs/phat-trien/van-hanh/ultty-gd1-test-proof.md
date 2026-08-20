# Ultty GD1-test — bằng chứng NO-MOCK

> Đo trên stack **đang chạy thật**, `2026-08-20T19:36Z`, sau lần deploy thành công
> [`32408247990`](https://github.com/phungtienviet14-sketch/nexagnet-platform/actions/runs/32408247990).
> Mọi dòng dưới đây là **kết quả đo được**, không phải dự kiến. Thứ chưa chứng minh được thì ghi
> thẳng là chưa, không ghi "tương đương".

---

## 1. Danh tính bản phát hành

| Trường | Giá trị |
|---|---|
| Tenant / Environment | `ultty` / `gd1-test` |
| **Stack** | `ultty-gd1-test` |
| Target | `current-shared-vm` (VM `netviet`, asia-southeast1-b) |
| Git SHA | `dd89e05fd8e199bbe684d256ce36aa91318d3b7a` |
| App digest | `zalo-ultty@sha256:1c001fea34631fe6a5815ad852f23d87d1fcc55d74823bc61e2368b8178b274c` |
| Flowise digest | `flowise-3.1.4-deepseek-fix@sha256:4faa0a794c6f8294301721d9845e7d62b7540a6f35946f90c8d46a37ed3f8029` |
| Tenant schemaVersion | `2` |
| Workflow run | `32408247990` |
| Deployed at | `2026-08-20T19:35:57Z` |

Ghi tại `/srv/netviet/apps/zalo-ultty-gd1-test/.runtime/release.json`.

## 2. Cách ly khỏi stack DEV — không dùng chung gì

| | DEV `zalo-ultty` | GD1-test `zalo-ultty-gd1-test` |
|---|---|---|
| Thư mục | `/srv/netviet/apps/zalo-ultty` | `/srv/netviet/apps/zalo-ultty-gd1-test` |
| Volume | `zalo-ultty_postgres-data` · `_flowise-data` | `zalo-ultty-gd1-test_postgres-data` · `_flowise-data` |
| Mạng | `zalo-ultty_backend` · `_data` | `zalo-ultty-gd1-test_backend` · `_data` |
| Hostname | `operator.<ip>.sslip.io` | `operator-ultty-gd1-test.<ip>.sslip.io` |
| Secret | `zalo-ultty-*` | `zalo-ultty-gd1-test-*` |

Đo sau deploy: `crossTenantReachable = false`, và `getent hosts flowise` trong container api trả
**đúng một** địa chỉ (`172.24.0.2`) — cổng kiểm quan trọng nhất của [ci-cd.md](ci-cd.md) §5 phép 3.
Stack DEV không bị đụng: PostgreSQL của nó vẫn `Up 7 days` xuyên suốt cả 4 lần deploy.

## 3. Ma trận NO-MOCK

| Thành phần | Hiện thực | Real/Mock | Bằng chứng |
|---|---|---|---|
| Web | Next.js production container | **REAL** | HTTP 200; `<title>` = `Ultty AI — Trung tâm điều hành` đọc từ gói khách |
| API | NestJS production container | **REAL** | HTTP 200; tenant identity `ultty` đọc từ gói khách mount trong container |
| PostgreSQL | PostgreSQL 16 + Prisma | **REAL** | connected; migration head `20260818170000_message_sender_role`; **0 migration chờ** |
| Flowise | container thật, healthy | **REAL** (không nằm trên đường parser) | container healthy; parser đang là DeepSeek trực tiếp |
| Media | GCS qua ADC | **REAL** | `/health/media` → `{"storage":{"name":"gcs","state":"healthy"}}` |
| Auth | session + Prisma session store | **REAL** | ẩn danh → **401**; login operator → **201** (role ADMIN); CSRF đã phát |
| Mạng | mạng Docker riêng | **REAL** | `dataNetworkInternal=true`; 1 địa chỉ Flowise; `crossTenantReachable=false` |
| Rules engine | rules TypeScript tất định | **REAL** | smoke tạo đơn có giá từ bảng giá đã gieo |
| Orders | Prisma repository | **REAL** (qua `/demo/simulate`) | `SMOKE_ORDER_ID=03b87661-…`; `SMOKE_ORDER_STATUS=pending_review` |
| Parser | DeepSeek trực tiếp | **REAL** (dữ liệu TEST) | smoke tạo được đơn `dat_don` — chỉ có thể có nếu LLM trả kết quả có cấu trúc |
| **Zalo (kênh)** | zca-js | **REAL adapter, CHƯA đăng nhập** | `{"channelMode":"zca","state":"logged_out","allowedGroupIds":[]}` |
| ERP | — | **NOT IN GD1 SCOPE** | GĐ1 không gọi ERP (quyết định 4 & 7); không có tham chiếu `ErpPort` trên đường order |
| Invoice | — | **NOT IN GD1 SCOPE** | không có đường invoice trong GĐ1 |
| Notifications | capability bật | **UNRESOLVED** | chưa có kịch bản xác minh GĐ1 → verifier ghi `UNRESOLVED`, không ghi PASS |

**Không thành phần nào trong phạm vi GĐ1 dùng mock.** `CHANNEL_MODE=mock` không xuất hiện;
`PERSISTENCE=prisma`; không có fallback fixture nào được kích hoạt.

## 4. Hồ sơ runtime — ép cứng, không phải mặc định

Đọc từ `.runtime/secrets.env` của stack:

```
STACK_SLUG=ultty-gd1-test      DEPLOYMENT_ENVIRONMENT=gd1-test
PARSER_MODE=deepseek           CHANNEL_MODE=zca
AUTO_SEND=off                  AUTH_MODE=session
MEDIA_STORE=gcs                DATA_CLASSIFICATION=test
```

`AUTO_SEND=off` là **chính sách**, không phải mock: adapter Zalo thật vẫn nạp và gửi được. Đây là
chỗ tách bạch **REAL OUTBOUND ADAPTER VERIFIED** khỏi **AUTO_SEND POLICY ENABLED** — GD1-test cố ý
chỉ có cái thứ nhất.

## 5. Kết quả verifier

`verify-deployment.mjs` → `VERIFY_DEPLOYMENT=FAIL`, **exit code 1**.

| REAL | FAILED | NOT IN GD1 SCOPE |
|---|---|---|
| web · api · flowise · postgresql · network · auth · media | zalo · parser · orders | erp · invoice |

**FAIL là kết quả ĐÚNG ở thời điểm này.** Ba thành phần `FAILED` đều trượt vì **cùng một lý do**:
chưa có tương quan (correlation) từ một tin Zalo **thật**. Verifier từ chối coi `/demo/simulate` là
bằng chứng inbound — đúng như thiết kế:

```
ERROR: Zalo inbound source must be zalo_inbound; demo/simulate and synthetic proof are forbidden
ERROR: Zalo runtime state must be ready
```

Nghĩa là: **hạ tầng đã chứng minh là thật; đường nghiệp vụ E2E thì chưa** — và không được ghi là đã.

## 6. Readiness

`goLiveReady: false`. Ba blocker:

| Blocker | Ý nghĩa |
|---|---|
| `parser_not_production_ready` | DeepSeek **chưa** nằm trong danh sách bên thứ ba được duyệt (chỉ KiotViet + Claude API) |
| `channel_not_production_ready:zca:logged_out` | chờ quét QR bằng tài khoản Zalo phụ |
| `missing_golden_dataset` | thiếu B1/B2 — 20-30 tin thật + đơn đúng |

Sáu check còn lại **ready**: `tenant.loaded` · `price.current_period` · `dealers.configured` ·
`groups.mapped` · `media.production` · `auth.production`.

> Ba trong sáu check đó (`price.current_period`, `dealers.configured`, `groups.mapped`) chỉ xanh
> **nhờ bản vá gieo nguồn sự thật**. Trước đó DB rỗng và chúng đều `missing` — bằng chứng độc lập
> cho thấy pipeline vốn thiếu hẳn một bước gieo dữ liệu, đúng cho **mọi** stack mới.

Bốn mảng nghiệp vụ `business.vat` · `cod_ship` · `debt_7_days` · `promotions` ở trạng thái
`blocked` nhưng **non-blocking** — tức Pilot có thể bật khi chúng còn trống. Đây là **quyết định
nghiệp vụ cần người chốt**, không phải kết luận kỹ thuật.

## 7. Còn phải làm để có proof E2E — cần người

1. **Gieo allowlist** đúng 2 nhóm TEST đã duyệt vào `.runtime/zalo/zalo-allowed-groups.json`
   (runbook §4.1). Hiện `allowedGroupIds: []` — mặc định an toàn, không nhóm nào được xử lý.
2. **Quét QR bằng tài khoản Zalo PHỤ** tại `https://operator-ultty-gd1-test.<ip>.sslip.io/zalo`.
   Một tài khoản chỉ chịu được **một** listener; stack DEV đang giữ tài khoản hiện tại.
3. **Gửi một tin TEST thật** mang marker, rồi:
   ```bash
   node deploy/netviet/collect-deployment-evidence.mjs \
     --tenant ultty --environment gd1-test --correlation 'GD1TEST-...' --out evidence.json
   node deploy/netviet/verify-deployment.mjs \
     --tenant-pack tenants/ultty --release release.json --evidence evidence.json
   ```

## 8. Câu trả lời thẳng

| Câu hỏi | Trả lời |
|---|---|
| Ultty GD1-test đã deploy? | **CÓ** — run `32408247990`, stack `ultty-gd1-test` healthy |
| Ultty Pilot GĐ1 đã deploy? | **KHÔNG** |
| Thành phần trong phạm vi GĐ1 nào dùng mock? | **KHÔNG có** |
| Zalo adapter thật đã verify? | **CHƯA** — adapter thật đã nạp, `state=logged_out`, chưa có inbound thật |
| PostgreSQL thật đã verify? | **CÓ** |
| Parser/provider thật đã verify? | **MỘT PHẦN** — smoke chứng minh DeepSeek trả kết quả có cấu trúc; chưa có correlation từ tin Zalo thật |
| Đường nghiệp vụ/order thật đã verify? | **CHƯA** — đơn có thật và đã lưu, nhưng kích thích đến từ `/demo/simulate`, không phải Zalo |
| Cổng an toàn production/pilot còn nguyên? | **CÓ** |
| Artifact đã deploy có định danh chính xác? | **CÓ** — git SHA + 2 image digest + schemaVersion + run ID |
| Pipeline hỗ trợ nhiều server mà không phải viết lại? | **CÓ** — `targets` tách khỏi `deployments`; thêm VM là thêm một entry |
| WATA đã deploy? | **KHÔNG** |
