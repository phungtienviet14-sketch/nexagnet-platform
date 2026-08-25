# Bàn giao phiên 16 — `sales-handoff-followup.v1`: workflow nghiệp vụ **thật** đầu tiên trên Hatchet

> Ngày: **25/08/2026** · Nhánh: `feat/sales-handoff-workflow` (từ `main` = `cb86451`)
> Phiên trước: [ban-giao-phien-15.md](ban-giao-phien-15.md) — `turn-processing` trung tính, đã merge (PR #38).
> **PR [#41](https://github.com/phungtienviet14-sketch/nexagnet-platform/pull/41) — CHƯA MERGE, đang chờ review lần 2.**

---

## 0. Một câu

Một đơn đã gửi cho khách (`sent` + `salesHandoff = pending`) không còn nằm đó vô thời hạn mà không
hệ thống nào biết: `OrdersService.sendConfirmation()` xếp một hàng outbox **trong cùng giao dịch**,
Hatchet ngủ một khoảng do gói khách đặt, thức dậy **đọc lại DB nghiệp vụ**, và chỉ đánh dấu khi việc
đó **thực sự** còn treo — đúng một lần, kể cả khi worker bị SIGKILL giữa lần ngủ.

---

## 1. Việc đã làm trong phiên

| Việc | Kết quả |
|---|---|
| Merge PR #39 (docs) + #40 (boundary cleanup) | `main` = `cb86451`, CI 7/7 xanh |
| Workflow `sales-handoff-followup.v1` | 3 bài IT trên engine THẬT |
| **Blocker 1** (review): worker 401 ở `AUTH_MODE=session` | **ĐÃ SỬA** |
| **Blocker 2** (review): race song song ⇒ N lần đánh dấu | **ĐÃ SỬA** |
| **Medium** (review): `enabled=true` mà thiếu binding | **ĐÃ SỬA** — fail-fast lúc boot |

---

## 2. Ba điều phiên sau **phải** biết trước khi động vào

### 2.1 `WorkflowWorkerModule` không có DB — và đó không phải thiếu sót

Worker **cố ý** không nạp `AppModule`: nạp vào sẽ mở listener zca **thứ hai** trên cùng tài khoản
Zalo và hạ kênh đọc chính của GĐ1. Nên mọi workflow cần đọc/ghi trạng thái nghiệp vụ phải **gọi
ngược API qua HTTP** (`internal/*` + `WORKFLOW_DESTINATION_<TÊN>` → URL).

Đừng cấp `PrismaClient` cho worker: nó sẽ ghi thẳng `Order`, vượt mặt mọi cổng nghiệp vụ.

### 2.2 Bài IT chạy ở `AUTH_MODE` mặc định **không** chứng minh được gì về xác thực

Đây chính là Blocker 1. `sales-handoff-followup.int.spec.ts` chạy với `AUTH_MODE=api-key` +
`API_KEY` rỗng ⇒ `ApiKeyGuard` **mở toàn bộ**. Bản deploy thật chạy `session`, và ở đó ba guard
người-dùng đòi cookie/vai trò/CSRF — thứ một tiến trình không thể có.

**Quy tắc rút ra: thêm endpoint cho máy gọi thì phải có một bài chạy ở `AUTH_MODE=session`.**
Mẫu có sẵn: `apps/api/src/orders/sales-handoff-internal-auth.spec.ts`.

### 2.3 `findById` → kiểm → `update` là một lỗi, không phải một kiểu viết

Đây là Blocker 2, và nó **tệ hơn** mô tả ban đầu: 5 lần gọi song song ⇒ **5** lần `applied=true`,
5 bản ghi audit. Bài test tuần tự không bắt được vì cửa sổ chỉ mở khi hai lần gọi **chồng** nhau.

Một `$transaction` thường **cũng không đủ** — `READ COMMITTED` vẫn cho hai giao dịch đọc cùng ảnh
chụp. Dùng `compareAndSet` (khoá hàng `SELECT ... FOR UPDATE`) trên kho lượt.

---

## 3. Ranh giới as-built (bổ sung cho §3 phiên 15)

```
foundation:  + InternalServiceGuard (xác thực dịch vụ-dịch vụ cho `internal/*`)
             + TurnRecordsRepository.compareAndSet  (cổng đọc-quyết định-ghi nguyên tử)
             + TurnRecordsRepository.updateWithin   (một giao dịch cho nghiệp vụ + outbox)
workflow:    + khuôn `sales-handoff-followup` (v1) · WORKFLOW_WORKER_TEMPLATE
sales-order: + SalesHandoffFollowupService (nguồn sự thật + cổng exactly-once)
             + SalesHandoffController (`internal/sales-handoff`, @InternalService)
tenant:      + policies.salesOrder.handoffFollowup (null = không theo dõi)
```

### `Idempotency-Key` **không** phải cổng exactly-once

Máy chủ không lưu, không tiêu thụ, không đối soát nó — nó là **neo đối soát** trong log/trace.
Cổng thật là `compareAndSet`. (Chú thích cũ nói "hai lớp, cần cả hai" là **sai**; đã sửa.)
Nếu sau này cần khoá làm cổng thật (trả lại *cùng* phản hồi cho một lần thử lại) thì phải lưu nó
thật: một bảng khoá + ràng buộc duy nhất.

---

## 4. Bằng chứng

| Bằng chứng | Kết quả |
|---|---|
| `sales-handoff-followup.int.spec.ts` (engine THẬT) | chốt đơn → outbox → engine → ngủ → đọc lại → đánh dấu; người xử lý giữa lần ngủ → **không** nhắc; SIGKILL worker giữa lần ngủ → worker mới → vẫn đúng một lần |
| `sales-handoff-internal-auth.spec.ts` (`AUTH_MODE=session`) | thiếu khoá 401 · sai khoá 401 · đúng khoá GET 200 · đúng khoá POST 201 không cần CSRF · `/orders` **vẫn** 401 với chính khoá đó |
| `sales-handoff-concurrency.int.spec.ts` (Postgres THẬT) | 2 song song → đúng 1 · 5 song song → đúng 1 · người hoàn tất xen giữa → 0 |
| `workflow-binding.spec.ts` | `enabled=true` thiếu binding ⇒ **từ chối lúc boot** |
| `caddy-route-contract.test.mjs` | `internal/*` bị đòi hỏi **vắng mặt** khỏi matcher `@api` |

---

## 5. Còn vướng (không chặn merge)

1. **`operationKey` mang `tenant=unknown` khi chạy bằng `TENANT_DIR`** — hành vi **có sẵn** của
   `WORKFLOW_RUNTIME_IDENTITY`, không do phiên này gây ra. Production dùng `TENANT=<slug>` nên không
   dính. Đáng một PR riêng.
2. **`deploy/netviet/smoke-test.mjs` vẫn gate turn path bằng `sales-order`** — nợ vận hành đã biết
   từ phiên 15, cố ý **không** nhét vào PR này.
3. **Escalation nhiều tầng chưa có** — `FOLLOWUP_STAGES` chỉ có `'reminder'` vì gói khách hiện chỉ
   khai được **một** ngưỡng. Khoá thao tác đã mang sẵn `stage` nên thêm tầng sau không phá bản ghi cũ.
4. **Chưa khách nào bật `handoffFollowup`** — Ultty không khai, nên trên pilot khuôn này chưa chạy.
   Bật là một quyết định vận hành: cần thêm `handoffFollowup` **và** một binding đang bật, cộng
   `API_KEY` cho container worker (đã thêm vào `compose.yaml`).

---

## 6. Nợ cũ vẫn treo (từ phiên 14–15)

Tuning số span Prisma · ClickStack production auth/deployment · preload OTel trong production
compose · outer "worker" wrapper span · CASE B human debug.

---

## 7. Việc tiếp theo — gợi ý, không phải mệnh lệnh

**Không mở workflow thứ hai trước khi PR #41 được merge.**

Ứng viên đã cân nhắc và **cố ý chưa làm**: campaign scheduling và price-period activation. Cả hai
đều là quyết định sản phẩm, không phải kỹ thuật — hỏi chủ dự án trước.
