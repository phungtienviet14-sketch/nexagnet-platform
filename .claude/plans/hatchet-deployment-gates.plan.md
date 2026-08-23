# Kế hoạch: Hatchet — chuỗi cổng TRIỂN KHAI (readiness → compose → cách ly → mạng/TLS/bí mật → backup → audit VM → deploy gd1-test)

**Nguồn:** handoff [ban-giao-workflow-engine.md](../../docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md) §21–32 · runbook [workflow-engine-runbook.md](../../docs/phat-trien/van-hanh/workflow-engine-runbook.md)
**HEAD đầu phiên:** `8e22047`
**Phiên trước:** độ tin cậy W4–W12 ✅ XANH · triển khai ⬜ CHƯA BẮT ĐẦU
**Độ phức tạp:** LỚN (9 phase, 3 quyết định chặn phải chốt trước)

---

## 0. Tóm tắt

Độ tin cậy đã đo xong bằng hạ tầng thật. Phiên này làm **hồ sơ triển khai** — thứ duy nhất còn
chặn `ultty-gd1-test`. Việc kế tiếp chính xác theo §31 là **readiness của tiến trình worker**, vì
nó là điều kiện chặn của compose. Sau đó mới tới compose, cách ly, mạng/TLS/bí mật, backup/restore,
audit VM, và **chỉ khi tất cả PASS** mới deploy.

**Không** research lại Hatchet. **Không** sửa gate W4–W12 đã PASS. **Không** đổi ngữ nghĩa
`WorkflowEnginePort`.

---

## 1. Đã kiểm chứng trong repo (không phải giả định)

| Điều | Bằng chứng |
|---|---|
| HEAD `8e22047`, `apps/api/src/workflow/` **sạch hoàn toàn** | `git status` — 0 file workflow bị sửa |
| Việc song song: 16 file M + 11 path untracked, **không cái nào** trong `apps/api/src/workflow/` hay `deploy/netviet/` | `git status` |
| Worker đã `await waitUntilReady()` và log `READY …` | [hatchet-workflow-worker.adapter.ts](../../apps/api/src/workflow/hatchet/hatchet-workflow-worker.adapter.ts) |
| Thiếu: tín hiệu readiness **máy đọc được** | không có HTTP server nào trong tiến trình worker |
| Compose thật: `name: zalo-${STACK_SLUG}`, mạng `backend` + `data` (`internal: true`) | [compose.yaml](../../deploy/netviet/compose.yaml) |
| `deploy-stack.sh:88` `up -d --no-deps --force-recreate api web` — **không đụng worker** | [deploy-stack.sh:88](../../deploy/netviet/deploy-stack.sh) |
| Hatchet self-host = **5 service** (postgres, migration, setup-config, engine, dashboard), ghim `v0.101.27` | [hatchet.compose.yml](../../tools/poc-workflow-engine/compose/hatchet.compose.yml) |
| Hợp đồng bí mật: mọi biến render **phải** có trong `environment:` của compose | [secrets-passthrough.contract.test.mjs](../../deploy/netviet/secrets-passthrough.contract.test.mjs) |
| `backup.sh` lặp `for database in zalo flowise` trên service `postgres` — Hatchet là service KHÁC | [backup.sh](../../deploy/netviet/backup.sh) |
| `restore-check.sh` whitelist cứng `zalo\|flowise` | [restore-check.sh](../../deploy/netviet/restore-check.sh) |

### ⚠️ Hai phát hiện mới, cả hai đều đổi hình dạng công việc

**① KHÔNG khách nào đang khai `integrations.workflowEngine`.**
`grep -rln "workflowEngine" tenants/` → **rỗng**. `tenantWorkflowEngine()` trả `NO_WORKFLOW_ENGINE`,
dispatcher không khởi động. Bật engine = phải sửa gói khách. **Và `tenants/ultty/tenant.json` được
dùng CHUNG bởi `zalo-ultty` (production) lẫn `zalo-ultty-gd1-test`** — `deploy-remote.sh:108`
rsync cùng một `tenant-pack` cho cả hai. Thêm binding `enabled: true` vào đó là **vũ trang
dispatcher trên production** ở lần deploy kế tiếp, trong khi production không có engine để gọi.
→ **Quyết định chặn Q1.**

**② Volume `hatchet-config` quan trọng ngang Postgres của engine.**
`hatchet-admin quickstart --generated-config-dir /hatchet/config` sinh cấu hình **có khoá mã hoá**
vào volume đó. Mất volume = dữ liệu engine đã mã hoá không đọc lại được, kể cả khi restore Postgres
thành công. Backup chỉ dump Postgres là **backup vô dụng**. Chưa tài liệu nào trong repo ghi điều này.

---

## 2. Ba quyết định phải chốt TRƯỚC khi code

### Q1 — Bật engine cho gd1-test mà KHÔNG vũ trang production

| Phương án | Cách làm | Đánh đổi |
|---|---|---|
| **A (đề xuất)** — công tắc vận hành `WORKFLOW_ENGINE` | Thêm binding vào `tenants/ultty/tenant.json`; `workflow.module.ts` + `workflow-worker.module.ts` đọc `WORKFLOW_ENGINE=on\|off`, mặc định **off**. render-secrets đặt `on` chỉ cho `gd1-test` | Đúng khuôn `AUTO_SEND` đã có (CLAUDE.md QĐ#4: kill switch vận hành ≠ policy tenant). Một dòng env tách hai môi trường. Phải thêm test hợp đồng để `off` thật sự là mặc định |
| B — gói khách riêng cho gd1-test | `tenants/ultty-gd1-test/` | Fork gói khách theo môi trường — **trái** kiến trúc stack-slug và `tenants/README.md`. Hai bản dữ liệu thương mại phải đồng bộ tay |
| C — hoãn, chỉ deploy engine không có binding | Engine chạy, không ai gọi | Không chứng minh được gì. E2E trung lập §11 không chạy được |

### Q2 — TLS cho gRPC nội bộ api/worker ↔ engine

Runbook §4.2 viết `SERVER_GRPC_INSECURE=false` là bắt buộc cho production. Nhưng lưu lượng này
**không rời một mạng Docker `internal: true` trên một VM** — nó không đi qua ranh giới host nào.

| Phương án | Cách làm | Đánh đổi |
|---|---|---|
| **A (đề xuất cho gd1-test)** — `none` trên mạng nội bộ + **justification có test** | Giữ `tls_strategy: none`; hợp đồng test ép: (1) cổng gRPC **không** publish ra host, (2) mạng mang nó là `internal: true`, (3) dashboard **chỉ** ra ngoài qua Caddy có TLS + auth | Kẻ tấn công phải đã có root trên VM hoặc thực thi mã trong container **cùng stack** — lúc đó TLS không cứu gì. Rủi ro tồn dư ghi rõ ra văn bản. Không thêm chế độ hỏng nào |
| B — TLS nội bộ thật | `quickstart` sinh cert vào volume dùng chung, `tls_strategy: tls`, phân phối cert cho worker + api | Đúng chữ runbook. **Thêm hạn cert làm chế độ hỏng mới**, mà không có gì giám sát nó. Cert hết hạn = toàn bộ run treo, và triệu chứng sẽ giống hệt "engine chết" |

Runbook §4.2 sẽ phải sửa theo phương án được chọn — hiện nó nói tuyệt đối, mà lý do thật là **ranh
giới mạng**, không phải chữ "production".

### Q3 — Trùng run: **CHỈ BÁO CÁO, KHÔNG SỬA** (theo yêu cầu §7)

Sự thật đã đo: `TriggerWorkflowCommand.operationKey` có trong hợp đồng cổng nhưng
`hatchet-workflow-engine.adapter.ts:trigger()` **không truyền** sang `runNoWait`. Đúng đắn nghiệp vụ
đã được bảo vệ bằng dedup ở tầng ngoài (2 POST → 1 bản ghi).

Phiên này sẽ **đọc bề mặt SDK 1.28.2** xem `runNoWait` có nhận khoá idempotency trực tiếp không, và
**chỉ báo cáo đánh đổi**. Không sửa. Không chặn deploy.

---

## 3. Khuôn mẫu bám theo (không phát minh lại)

| Loại | Nguồn | Khuôn |
|---|---|---|
| Máy trạng thái + timer | `WorkflowScheduler` ([workflow.module.ts](../../apps/api/src/workflow/workflow.module.ts)) | `setInterval` + `.unref()` + cờ `ticking`; **trạng thái không nằm trong timer** |
| Lý do hỏng có kiểu | [workflow-dispatch-failures.ts](../../apps/api/src/workflow/workflow-dispatch-failures.ts) | mã lý do enum + `detail`, không phải `boolean` |
| Test hợp đồng deploy | [secrets-passthrough.contract.test.mjs](../../deploy/netviet/secrets-passthrough.contract.test.mjs) | `node:test` đọc file thật, danh sách miễn trừ **phải kèm lý do** |
| Harness IT engine thật | [workflow-it.harness.ts](../../apps/api/src/workflow/__tests__/workflow-it.harness.ts) | `docker stop/start` thật; đo sống/chết bằng **TCP tới cổng gRPC** (§25 bẫy #2) |
| Vòng đời container | `workflow-worker.service.ts` | boot ≠ kết nối; `onModuleInit` không làm việc mạng |

---

## 4. Các phase

### D1 — READINESS CỦA WORKER *(chặn mọi thứ còn lại)*

**Thiết kế.** Máy trạng thái thuần, tách khỏi HTTP, tách khỏi Hatchet:

```
STARTING → CONNECTING → REGISTERING → READY
                                        ↓ (mất engine)
                                     DEGRADED → READY
SIGTERM bất kỳ lúc nào → DRAINING → STOPPED
```

**Ngữ nghĩa health vs readiness** — đây là câu hỏi "không tạo restart storm":

| Điểm cuối | Trả 200 khi | Dùng làm gì |
|---|---|---|
| `/live` | mọi trạng thái trừ `STOPPED` | tiến trình còn sống |
| `/ready` | **chỉ** `READY`, và `DEGRADED` trong thời gian ân hạn | healthcheck của Docker |

Ba luật, mỗi luật có lý do:

1. **Mất engine sau READY → KHÔNG thoát tiến trình.** W5 đã đo: engine chết rồi lên lại không mất
   việc. Thoát tiến trình biến một lần restart engine thành một cơn bão restart worker.
2. **`DEGRADED` quá hạn ân hạn → `/ready` trả 503, nhưng vẫn KHÔNG thoát.** Container hiện
   `unhealthy` trên `docker ps` (Compose **không** tự restart container unhealthy — khác Kubernetes),
   nên đây là *quan sát được* mà không phải *bão restart*. Chế độ hỏng tệ nhất theo §29 là container
   xanh + run treo mãi — luật này đóng đúng nó.
3. **Lỗi CẤU HÌNH (token sai, tên workflow sai) → thoát khác 0 ngay.** Thử lại mãi với token sai
   chính là chế độ hỏng ở luật 2. Phân biệt bằng **mã lý do có kiểu**, không phải `boolean`.

**Đo mất engine bằng gì:** ưu tiên trạng thái kết nối nếu SDK 1.28.2 có phơi ra; nếu không, dùng
**TCP tới cổng gRPC** — chính kỹ thuật §25 bẫy #2 đã chứng minh là đúng. Giới hạn phải ghi rõ:
TCP mở được ≠ đăng ký còn hiệu lực.

**Ràng buộc:** nghe **loopback trong container** (healthcheck của Docker chạy *bên trong*), không
publish cổng nào. `start_period: 90s` (≈2,4× lần đo tệ nhất 38 s) là **biên an toàn**, không phải
readiness.

| File | Việc | Kiểm chứng |
|---|---|---|
| `apps/api/src/workflow/worker-readiness.ts` | TẠO — máy trạng thái thuần + mã lý do có kiểu | unit |
| `apps/api/src/workflow/worker-readiness.spec.ts` | TẠO — RED trước | 8 kịch bản, đồng hồ giả |
| `apps/api/src/workflow/worker-health.server.ts` | TẠO — HTTP loopback | unit |
| `apps/api/src/workflow/worker-health.server.spec.ts` | TẠO | 200/503 theo trạng thái |
| `apps/api/src/workflow/worker-readiness.int.spec.ts` | TẠO — engine THẬT | `docker stop/start` |
| `workflow-worker.service.ts` · `worker-main.ts` · `hatchet-workflow-worker.adapter.ts` | SỬA — phát trạng thái | `workflow-worker.module.spec.ts` vẫn xanh |

**8 test bắt buộc:** ① cold start (chuỗi trạng thái đầy đủ, `/ready` 503 tới lúc READY) · ② warm
start (không bỏ qua trạng thái nào) · ③ Hatchet chưa ready (503 kéo dài, không ném) · ④ Hatchet
không có (503 mãi, `/live` vẫn 200, tiến trình sống) · ⑤ đăng ký chậm >30 s (**không** timeout ở
một hằng số nhỏ hơn số đo thật) · ⑥ đăng ký FAIL vì cấu hình (thoát khác 0, mã lý do có kiểu) ·
⑦ recovery (READY → DEGRADED → READY, **không** thoát, run vẫn về đích) · ⑧ SIGTERM
(`/ready` 503 **ngay**, rồi `stop()` sạch, thoát 0).

**Đo lại thời gian đăng ký** trong ③⑤⑦ và ghi vào bảng §29 — số mới cho `start_period`.

---

### D2 — COMPOSE PRODUCTION *(sau khi D1 PASS)*

Sửa `deploy/netviet/compose.yaml`. **Không copy compose POC** — POC publish cổng ra host, dùng mật
khẩu `hatchet/hatchet`, và bật `SERVER_AUTH_COOKIE_INSECURE`.

| Service | Mạng | Cổng host | Ghi chú |
|---|---|---|---|
| `hatchet-postgres` | `data` (internal) | **không** | volume `hatchet-postgres-data`, healthcheck `pg_isready`, ghim digest, mật khẩu từ secret |
| `hatchet-migration` | `data` | — | một lần, `service_completed_successfully` |
| `hatchet-setup-config` | `data` | — | một lần, `--overwrite=false` ⇒ chạy lại được; volume `hatchet-config` + `hatchet-certs` |
| `hatchet-engine` | `data` | **không** | ghim `v0.101.27`, `restart: always`, healthcheck |
| `hatchet-dashboard` | `data` + `backend` (alias `hatchet-${STACK_SLUG}`) | **không** | ra ngoài **chỉ** qua edge |
| `workflow-worker-v1` | `data` + `backend` | **không** | `WORKFLOW_WORKER_VERSION: v1`, healthcheck `/ready`, `start_period: 90s` |

**Đơn vị triển khai theo phiên bản.** Tên service mang phiên bản để `workflow-worker-v1` và
`workflow-worker-v2` **cùng sống** — đó là chỗ thủ tục DRAIN của runbook §2 đứng được.

**Tất cả gate sau `profiles: ["workflow"]`** — `zalo-ultty` (production) không mọc thêm 4 container.
`deploy-stack.sh` chỉ `up -d` nhóm này khi `WORKFLOW_ENGINE=on`, **trước** `api`, và **không đụng**
dòng 88.

---

### D3 — CÁCH LY LÀ HỢP ĐỒNG, KHÔNG PHẢI LỜI HỨA

§26 đã chứng minh chạy được: **hai bản triển khai dùng chung một engine cướp run của nhau và gửi
dữ liệu của nhau ra ngoài.** Đó là lỗi cách ly dữ liệu. Biến nó thành test.

`deploy/netviet/workflow-isolation.contract.test.mjs` — TẠO:
- `hatchet-postgres` khai volume **trong chính compose này** (⇒ theo project ⇒ theo stack)
- `hatchet-postgres` và `hatchet-engine` **không có** khối `ports:`
- `WORKFLOW_ENGINE_HOST_PORT` trỏ `hatchet-engine:7070` — **không bao giờ** `localhost`/host ngoài
- engine + postgres của nó nằm trên mạng `internal: true`
- tên secret của token mang **stack slug**
- **ca âm tính**: một compose trỏ hai stack vào một engine phải làm test ĐỎ

---

### D4 — MẠNG + TLS *(theo Q2)*

Dù chọn A hay B: engine + postgres của nó **private**, dashboard ra ngoài **chỉ** qua route Caddy có
auth, `SERVER_AUTH_COOKIE_INSECURE=false`, `SERVER_AUTH_COOKIE_DOMAIN` = tên miền thật.
**Không** `force-recreate` edge (sự cố `2bdd930` làm sập **mọi** khách) — dùng `caddy reload` như
`deploy-stack.sh` đang làm.

Sale nhận vai `VIEWER` (runbook §4.4): nút **Replay** chạy lại tác dụng phụ, và Hatchet không biết
gì về ba mức an toàn ở `operation-key.ts`.

---

### D5 — HỢP ĐỒNG BÍ MẬT

Biến mới: `WORKFLOW_ENGINE_TOKEN` · `HATCHET_DB_PASSWORD` · `WORKFLOW_ENGINE_HOST_PORT` ·
`WORKFLOW_ENGINE_TLS_STRATEGY` · `WORKFLOW_ENGINE_DASHBOARD_URL` · `WORKFLOW_WORKER_VERSION` ·
`WORKFLOW_ENGINE` · `WORKFLOW_DESTINATION_<TÊN>`.

Mỗi biến đi **cả ba tầng**: `render-secrets.sh` heredoc → khối `environment:` của đúng service →
`secrets-passthrough.contract.test.mjs` xanh. Bỏ một tầng = tính năng im lặng không chạy (đã xảy ra
thật với `ADVICE_COMPOSER`, và với `DEPLOYMENT_ENVIRONMENT`).

**Vòng gà–trứng của token** — token chỉ tồn tại **sau** khi engine đã migrate + quickstart, nên nó
không thể có sẵn trong Secret Manager ở lần deploy đầu. `deploy/netviet/bootstrap-workflow-engine.sh`
— TẠO, **chạy lại được**:

```
① up hatchet-postgres → migration → setup-config → engine
② đã có secret của stack?  → DỪNG (không đúc token mới)
③ chưa   → hatchet-admin token create --tenant-id <id>
④ đẩy lên Secret Manager theo tên mang stack slug
⑤ render-secrets lại → ⑥ up worker + api
```

Token **không** vào git, **không** vào `tenant.json` (chỉ `credentialRef` = *tên biến*), **không**
vào log, **không** vào metadata/input của Hatchet.

---

### D6 — BACKUP / RESTORE

**Postgres của engine không phải thứ vứt đi.** Và — phát hiện ② — **volume `hatchet-config` phải
được backup cùng**: nó giữ khoá mã hoá. Dump Postgres mà mất config = restore ra dữ liệu không
giải mã được.

`backup.sh`: thêm **hàm riêng**, không đụng vòng `for database in zalo flowise` (yêu cầu §6: không
chạm ngữ nghĩa backup DB nghiệp vụ). Tự bỏ qua khi stack không có `hatchet-postgres`.
`restore-check.sh`: mở whitelist cho `hatchet` trên **đúng service của nó**.

**Bằng chứng local (bắt buộc, không phải tài liệu suông):** tạo lịch sử run → backup → `down -v` →
restore → engine boot ở **đúng image đã ghim** → lịch sử run **query lại được**.

Tài liệu: lệnh backup · lệnh restore · tương thích phiên bản (image engine phải khớp schema đã
migrate — ngược phiên bản là một cách hỏng thật) · thứ tự phục hồi.

---

### D7 — AUDIT VM *(chỉ sau D2–D6 PASS)*

`docker ps` · `docker stats --no-stream` · `docker system df` · `df -h` · `free -h` · load · networks
· volumes · compose projects đang chạy. **Số mới, không dùng số cũ. Không prune mù.**

Tính phần thêm cho **CHỈ** `ultty-gd1-test`. Bảng §7 runbook nói *"Worker chạy trong tiến trình API,
không thêm container"* — **dòng đó đã LỖI THỜI** (phiên 4 đảo quyết định). Phải đo worker như một
tiến trình Node/Nest riêng và sửa runbook.

---

### D8 — DEPLOY `ultty-gd1-test`

**Chỉ khi mọi gate trên PASS.** Không production. Không WATA. Không stack khác. Không đụng edge.
Không đụng `AUTO_SEND`.

Lần đầu chỉ có v1 nên chưa có chuyển giao — nhưng compose **phải** làm cho DRAIN khả thi, và thủ tục
`REGISTER → ACTIVATE → DRAIN (countInFlight(v1)=0) → DEACTIVATE → REMOVE` phải ghi ra trước.

---

### D9 — BẰNG CHỨNG SAU DEPLOY + NGHIỆM THU DASHBOARD

E2E trung lập: Nexagnet → giao dịch/outbox → Hatchet → worker → **điểm cuối có kiểm soát**.
Không ERP/CRM thật. Đề xuất: một route nội bộ của API, chặn theo `DEPLOYMENT_ENVIRONMENT=gd1-test`
+ API key — không thêm container, không phát ra Internet.

Chứng minh: readiness · run hoàn tất · trace · audit · riêng tư · engine restart phục hồi · worker
restart phục hồi.

Dashboard: chuẩn bị **URL + checklist**, user tự đăng nhập. Kiểm: danh sách run · phiên bản workflow
· bước · số lần thử · lỗi · input/output đã che · metadata · trace · nút replay/cancel.
**Không** clone dashboard.

---

## 5. Kiểm chứng

```bash
pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```
```bash
node --test deploy/netviet/*.contract.test.mjs deploy/netviet/*.test.mjs
```
```bash
pnpm --filter @netviet/api exec tsc --noEmit && pnpm --filter @netviet/api exec eslint src
```

> IT **phải** chạy tuần tự — §26: song song → 9 bài ĐỎ, tuần tự → 154/154. Đó **không** phải test
> mong manh, đó là bằng chứng cho bất biến "mỗi khách một engine riêng".
> `pnpm typecheck` mức workspace ĐỎ tại `apps/mini/` — **có trước phiên này**, việc song song.

---

## 6. Rủi ro

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| Bật binding vũ trang dispatcher trên **production** | CAO nếu chọn Q1-B/C | Q1-A + test hợp đồng ép mặc định `off` |
| Restore thất bại vì mất `hatchet-config` | TRUNG BÌNH | Backup volume config cùng dump; chứng minh bằng `down -v` |
| Cert nội bộ hết hạn (nếu chọn Q2-B) | TRUNG BÌNH | Chọn Q2-A, hoặc phải có giám sát hạn cert |
| VM hết RAM khi thêm ~4 container | TRUNG BÌNH | D7 chặn D8 — số thật trước, deploy sau |
| Đúc token hai lần khi deploy lại | TRUNG BÌNH | Bootstrap **idempotent**: có secret thì dừng |
| Chạm nhầm việc song song | THẤP | Chỉ sửa `apps/api/src/workflow/` + `deploy/netviet/` + `tenants/ultty/tenant.json`; `git status` trước mỗi commit |
| `hatchet-postgres` 15.6 vs business 16 | THẤP | Cố ý — DB riêng, volume riêng; ghim digest cả hai |

---

## 7. READY FOR GD1-TEST — chỉ khi ĐỦ

- [ ] readiness worker PASS (8 test) · [ ] compose production PASS · [ ] cách ly có test hợp đồng
- [ ] bí mật PASS ba tầng · [ ] mạng/TLS PASS · [ ] Postgres engine bền vững + private
- [ ] backup/restore **chứng minh được** · [ ] audit VM bằng số mới · [ ] chỉ gd1-test
- [ ] E2E trung lập PASS · [ ] test/tsc/eslint/hợp đồng deploy xanh

**Thiếu bất kỳ cổng correctness/security nào ⇒ NOT READY.**

---

## 8. KHÔNG chạm

`decision-reasons.ts` · `recent-traces.sink.ts` · `trace-context.ts` · `orders/` · `apps/web/` ·
`apps/mini/` · `tenants/wata/` · `tong-quan.md` · `debugging.md` · `tools/trace-view.mjs` ·
`packages/tenant/src/tenant.schema.ts`

**Nợ vẫn treo (Phase 0 chặn):** gộp `workflow-dispatch-failures.ts` vào `decision-reasons.ts` ·
ghi `tong-quan.md`. Khe hở bộ quét bí mật (§27②) — **ghi nhận, không sửa ở đây**: biên riêng tư của
workflow là **danh sách trắng hợp đồng**, độc lập với bộ quét và đã PASS (§28). Bộ quét là lớp thứ
hai, không phải lớp duy nhất.

---

## 9. NHẬT KÝ THỰC THI

### Quyết định đã chốt (23/08/2026)

| | Chọn | Hệ quả |
|---|---|---|
| **Q1** | **A** — công tắc `WORKFLOW_ENGINE=on\|off`, mặc định **off** | `tenants/ultty/tenant.json` khai binding; production không bị vũ trang vì công tắc mặc định tắt |
| **Q2** | **A** — `tls none` trên mạng `internal:true` + hợp đồng test | Phải sửa runbook §4.2 (lý do thật là **ranh giới mạng**, không phải chữ "production") |
| **Q3** | chỉ báo cáo | Không đổi `WorkflowEnginePort` |

### D1 — READINESS WORKER ✅ XONG

**File mới:** `worker-readiness.ts` (máy trạng thái thuần) · `worker-health.server.ts` (HTTP loopback) ·
`engine-reachability.ts` (bộ dò TCP) + 3 spec đơn vị + `worker-readiness.int.spec.ts` (engine thật).
**File sửa:** `workflow-worker.adapter.ts` (`onPhase`) · `hatchet-workflow-worker.adapter.ts` (phát 2 pha) ·
`workflow-worker.service.ts` (sở hữu readiness + `startWithRetry` + bộ dò) · `worker-main.ts` (health server lên TRƯỚC worker).

**Kết quả đo:**

| Bài | Kết quả |
|---|---|
| Đơn vị: máy trạng thái · health server · bộ dò | ✅ 31 test |
| Toàn bộ workflow không-IT (14 file) | ✅ 165/165 |
| IT engine THẬT: cold start / mất engine → phục hồi / SIGTERM | ✅ 3/3 |
| tsc + eslint | ✅ xanh |

**Ba luật đã hiện thực (chống bão restart):**
1. Mất engine sau READY → **không** thoát tiến trình (W5 đã đo: engine chết/lên lại không mất việc).
2. `DEGRADED` quá 30 s ân hạn → `/ready` 503 (container hiện `unhealthy`, người trực THẤY) nhưng
   `/live` vẫn 200 → **không** tín hiệu nào bảo container phải chết. Compose không tự restart
   container unhealthy nên cặp giá trị này cho ra *hỏng nhìn thấy được* mà không phải *bão restart*.
3. Hỏng **cấu hình** → `/live` 503 → `worker-main.ts` thoát khác 0. Đã chứng kiến chạy thật:
   thiếu token → `CONFIG_INVALID` → thoát ngay thay vì treo.

**Số đo mới — và phải đọc ĐÚNG:**

```
registrationMs (registering -> ready) = 316 ms · 343 ms   (engine chạy >9 giờ, rất ấm)
cold start toàn bài (wall-clock)      = 3,4 s
```

⚠️ **KHÔNG kết luận "đăng ký nhanh gấp 100 lần".** Số này đo một **cửa sổ HẸP HƠN** §29: từ lúc gọi
`hatchet.worker()` tới lúc `waitUntilReady()` trả về. Các số 6,3 s / 12 s / 30,1 s / 38 s của §29 đo
**cả tiến trình lên** (nạp SDK ~800 ms + boot Nest + kết nối). Hai phép đo khác nhau, không so trực
tiếp được. `start_period: 90s` **giữ nguyên** — nó phải bao được §29, không phải cửa sổ hẹp này.

**⚠️ KHOẢNG TRỐNG CÒN MỞ — rút sạch (DRAIN) CHƯA đo được:**
Windows **không có SIGTERM thật** (Node dịch thành `TerminateProcess`), nên `enableShutdownHooks()`
không chạy trên máy dev. Đã đo trực tiếp: `/ready` 200 trước khi giết, sau khi giết log **không** có
dòng `Rut worker`. Khẳng định đó đã được **chặn theo nền tảng** thay vì cho xanh giả — *một nhãn sai
tệ hơn không có nhãn*. Đường `DRAINING → stop() → STOPPED` phải đo lại ở **D9 trên container Linux**.

**Giới hạn đã ghi trong code:** bộ dò TCP chứng minh *có ai đó đang nghe ở cổng gRPC*, **không**
chứng minh đăng ký của worker còn hiệu lực. Bắt được "engine chết/khởi động lại" (chế độ hỏng đã đo
ở W5); **không** bắt được "engine sống nhưng đã quên worker này".

**Món nợ:** `classifyFatal()` cố ý chỉ nhận mã của chính repo. Lỗi auth của Hatchet chưa được ĐO
trên engine thật nên không đoán mẫu chuỗi — token sai sẽ thử lại mãi, nhưng `/ready` 503 nên hỏng
vẫn **nhìn thấy được**. Đo hình dạng chuỗi thật rồi mới thêm `ENGINE_AUTH_REJECTED`.

### ⛔ CHẶN MÔI TRƯỜNG — engine POC đã thoái hoá, KHÔNG phải hồi quy code

Bộ IT đầy đủ chạy hai lần cho **hai tập bài đỏ khác nhau** (5 rồi 7, chỉ trùng 3) — tức là **không
tất định**. Trước khi sửa, đã làm **A/B thật** với `8e22047` trên **cùng** engine:

| Bài | Code gốc `8e22047` | Code D1 |
|---|---|---|
| W6 — worker `kill -9` | ❌ hết giờ 90 s, chưa vào `dispatch` | ✅ xanh (39 s) |
| W7 — hai worker cùng phiên bản | ❌ 5/6 run xong | ❌ 5/6 run xong |

**Baseline hỏng bằng hoặc tệ hơn ⇒ các bài đỏ còn lại KHÔNG do D1.** Triệu chứng là *run không
tiến triển* (engine nhận trigger, worker không nhận việc), không phải khẳng định sai.

Đã sửa **một** hồi quy có thật do D1 gây ra và **đo được** (`EADDRINUSE` trên cổng health dùng
chung) — commit `a89306b`. Sau khi khởi động lại engine, W6 từ đỏ chuyển **xanh**, xác nhận trạng
thái engine là một biến số thật.

**Kết luận:** stack `pocwf` đã chạy >24 giờ qua nhiều vòng `docker stop/start` và tích luỹ đăng ký
worker cũ (§27① — mọi worker cùng phiên bản đăng ký **cùng một tên**). Con số 154/154 của §22 đo
trên engine tươi hơn.

**ĐÃ GIẢI QUYẾT (23/08).** Reset `pocwf` sạch → **bộ IT đầy đủ 189/189 · 20/20 file XANH**.
Giả thuyết đúng, và §2 của [evidence/reset-pocwf-23-08-2026.md](../../tools/poc-workflow-engine/evidence/reset-pocwf-23-08-2026.md)
giữ toàn bộ bằng chứng + quy trình vận hành rút ra.

⇒ **D1 ĐÓNG.** Cổng chặn compose đã mở. Việc kế tiếp: **D2**.
