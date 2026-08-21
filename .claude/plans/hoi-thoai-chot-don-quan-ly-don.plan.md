# Plan: Hội thoại có trạng thái + Quản lý đơn qua công cụ (Ultty GĐ1)

**Nhánh**: `feat/hoi-thoai-chot-don-main`
**Ngày**: 21/08/2026
**Complexity**: Large
**Ràng buộc**: KHÔNG đưa LangGraph / n8n / Dify vào critical path.

---

## 0. Kết quả `/ecc:search-first` — đánh giá 3 thư viện

| Gói | Phiên bản | License | Phán quyết |
|---|---|---|---|
| `@langchain/langgraph` | 1.4.12 | MIT | ❌ **KHÔNG dùng** |
| `@langchain/mcp-adapters` | 1.1.4 | MIT | ❌ **KHÔNG dùng** |
| `@modelcontextprotocol/sdk` | 1.29 (đã có) | MIT | ✅ **MỞ RỘNG** |

### Vì sao loại LangGraph JS

Đo thật (`npm install --package-lock-only`, 4 gói langchain): **132 gói phụ thuộc bắc cầu**.

1. **Kéo theo `langsmith`** — `@langchain/core@1.2.9` phụ thuộc CỨNG vào client telemetry của LangChain.
   Tracing là opt-in qua `LANGSMITH_TRACING`/`LANGSMITH_API_KEY`, nhưng nó tạo ra một đường
   xuất dữ liệu **chỉ cách một biến môi trường**, trong một repo mà CLAUDE.md liệt kê tường minh
   danh sách bên thứ 3 được duyệt (KiotViet + Claude; DeepSeek còn đang chờ bổ sung hợp đồng).
   Đây là rủi ro tuân thủ Luật BVDLCN 91/2025 — không phải rủi ro kỹ thuật.
2. **Checkpointer Postgres tự sở hữu schema.** `@langchain/langgraph-checkpoint-postgres` dùng `pg`
   thô và tự tạo/migrate `checkpoints`, `checkpoint_blobs`, `checkpoint_writes`,
   `checkpoint_migrations`. Repo pin **Prisma 6** (không nâng v7 được vì `@adminjs/prisma`).
   Hai hệ migration cùng ghi vào Postgres của khách đang chạy = drift, trên đúng cái volume mà
   CLAUDE.md cảnh báo không được đụng.
3. **Thứ nó thay thế đang chạy đúng.** FSM hiện tại có 4 trạng thái / 4 sự kiện, thuần, đã test.
   `conversation-thread.ts:4-10` đã ghi sẵn lý do viết tay. Ba lỗi khách báo là **lỗi logic ở
   dispatch/handoff/status**, không phải lỗi điều phối. Thay orchestrator sẽ viết lại phần đang
   đúng và để nguyên phần đang sai.

### Vì sao loại `@langchain/mcp-adapters`

Gói này tồn tại để một agent LangChain **tiêu thụ MCP server bên ngoài**. Công cụ của ta nằm
**cùng tiến trình**. Thêm một chặng JSON-RPC vào đường tin nhắn Zalo = thêm độ trễ + thêm chế độ
hỏng, đổi lại 0 năng lực mới. Nó cũng lôi nguyên cây `@langchain/core` vào.

### Kiến trúc thay thế: MỘT registry, HAI cổng

```
                    tool-registry.ts  (1 định nghĩa + 1 handler)
                     /                        \
        in-process (nhanh)              MCP stdio (đã có)
        AdvisorAgent loop               mcp/server.ts
        → đường tin nhắn Zalo           → agent ngoài / admin
```

Đáp ứng "LLM điều khiển hệ thống toàn diện hơn" mà không đặt JSON-RPC vào critical path.

---

## 1. Ba lỗi — nguyên nhân gốc (đã đọc code, không phỏng đoán)

### Lỗi 1 — Tư vấn chuyển Sale quá dễ

Chuỗi nhân quả:

1. `dispatch()` nhánh `hoi_san_pham` (`apps/api/src/agents/agent-orchestrator.service.ts:421`)
   đặt `handoff: !advice.ready` và `status: 'needs_edit'` từ một cổng tất định **chỉ nhìn văn bản
   tin HIỆN TẠI**, không có ngữ cảnh hội thoại. Câu hỏi nối tiếp như *"có đèn ngủ không"*,
   *"BB lọc được bao nhiêu m2"* **không nhắc tên sản phẩm** → `productAdvice` không khớp SP →
   `ready:false` → handoff.
2. Sau đó agent LLM chạy trong `composeReply` và **trả lời đúng** (có công cụ, có tài liệu duyệt).
   Nhưng `markComposedRole` (`agent-orchestrator.service.ts:640`) **GIỮ LẠI**
   `handoff: true` cũ: `...(handoff ? {handoff:true} : current?.handoff ? {handoff:true} : {})`.
   Và **không chỗ nào** đặt `dispatch.status` từ `needs_edit` về `pending_review`.
3. `shouldAutoReplyProduct` (`apps/api/src/pipeline/pipeline.service.ts:471`)
   đòi `status === 'pending_review'` **VÀ** step `product_advisor.handoff !== true`. Cả hai đều sai
   → **không bao giờ gửi**.

Nửa thứ hai, nặng hơn: `shouldAutoReplyProduct` **chỉ xử lý `hoi_san_pham`**.
- `bao_hanh_khieu_nai` hard-code `handoff: true` (`agent-orchestrator.service.ts:527`) → *"Quạt được bảo hành bao lâu?"* chết ở đây.
- `hoi_gia`, `chinh_sach_cong_no`, `van_chuyen`, `khac` **không tạo `outbound`** → `Boolean(view.trace?.outbound)` false.

→ **6/7 intent không thể tự trả lời** dù LLM đã soạn xong câu đúng.

### Lỗi 2 — Không huỷ/sửa được đơn

1. Sau khi tự gửi, `settleThread(closed=true)` → thread `closed`.
2. `isLive()` loại `closed` (`apps/api/src/conversations/conversation-thread.ts:64`)
   → `pendingDraft()` trả `null`, `isAnsweringQuestion()` false.
3. `mergeConversationTurn` có `continuing = false` → **vứt toàn bộ ngữ cảnh đơn vừa chốt**.
   → *"cho a lay 5 cai"* đến nơi không còn nhớ "cái" là Ghế Felix → hỏi lại "mình lấy sản phẩm nào ạ?".
4. `INTENTS` cố định 7 loại, **không có huỷ/sửa đơn**.
5. **Mọi công cụ advisor đều CHỈ ĐỌC** — ghi rõ ở `apps/api/src/advisor/advisor-tools.ts:23`.
   Không có công cụ nào đổi được trạng thái đơn.

### Lỗi 3 — Không có nút "Duyệt & gửi" dùng được

- Console hiện 1 nút *"Sale kiểm tra & gửi nhóm"* cho `pending_review|needs_edit`
  (`apps/web/components/console/OrderDetailPanel.tsx:149`) → `POST /orders/:id/approve`
  → `sendConfirmation()` → **ném 422** `'Tin nay khong phai don hang, khong the duyet'` khi
  `view.priced` null (`apps/api/src/orders/orders.service.ts:128`).
  **Mọi tin tư vấn đều rơi vào đây** — đúng những tin bị Lỗi 1 đẩy về `needs_edit`.
- `sendProductAdvice()` **không có route controller nào**. Tư vấn không thể gửi từ UI, theo thiết kế.

---

## 2. Cổng an toàn cho sửa/huỷ đơn (chống lệch KiotViet)

Dùng mốc **đã có sẵn** thay vì phát minh cờ mới: `salesHandoff.status`.

| Trạng thái đơn | `salesHandoff` | LLM được sửa? | Lý do |
|---|---|---|---|
| `draft`,`pending_review`,`needs_edit`,`approved` | — | ✅ | Chưa gửi khách |
| `sent` | `pending` | ✅ | Sale **chưa** nhập ERP |
| `sent` | `completed` | ❌ | **Đã vào ERP** — sửa ngầm là lệch KiotViet |
| `rejected`, `synced` | — | ❌ | Đã kết thúc |

**Sửa đơn = SUPERSEDE, không mutate.** Huỷ đơn cũ (`rejected` + lý do) + tạo đơn thay thế liên kết
`supersedesOrderId`. Giữ nguyên vết audit, an toàn khi tích hợp ERP sau này.

Module thuần `apps/api/src/orders/amend-window.ts`, soi gương `order-auto-confirmation.ts`.

---

## 3. Patterns to Mirror

| Loại | Nguồn | Pattern |
|---|---|---|
| Quyết định thuần | `apps/api/src/pipeline/order-auto-confirmation.ts` | Predicate thuần + spec cạnh nó |
| FSM | `apps/api/src/conversations/conversation-thread.ts` | `(state,event)->state`, không I/O |
| Fail-safe | `apps/api/src/conversations/conversations.service.ts:108` | Lỗi chỉ log, đơn giữ nguyên |
| Chống chạy trùng | `apps/api/src/orders/orders.service.ts:22` | `Map<id, Promise>` in-flight |
| Công cụ LLM | `apps/api/src/advisor/advisor-tools.ts` | JSON gọn, tự ép kiểu input |
| Test | `apps/api/src/**/*.spec.ts` | vitest, tiếng Việt không dấu |

---

## 4. Các pha

### Pha 0 — Test hồi quy TRƯỚC (TDD)
Viết test đỏ tái hiện đúng 3 kịch bản khách đã test:
- `advisor-handoff.spec.ts` — câu hỏi nối tiếp không nhắc SP → phải tự trả lời.
- `order-amend.spec.ts` — chốt 20 → "cho a lay 5 cai" → phải hiểu là Felix.
- `approve-queue.spec.ts` — tin tư vấn `needs_edit` → nút duyệt phải gửi được.

### Pha 1 — Trả lại sự thật cho handoff/status (Lỗi 1)
| File | Việc |
|---|---|
| `agents/agent-orchestrator.service.ts` | `markComposedRole` **XOÁ** handoff khi LLM soạn xong mà không có marker; recompute `status`; luôn dựng `outbound` khi composed |
| `pipeline/pipeline.service.ts` | `shouldAutoReplyProduct` → `shouldAutoReplyAdvice`: mọi intent ≠ `dat_don` |
| `advisor/advisor-agent.ts` | Prompt: phân biệt **hỏi chính sách bảo hành** (tự trả lời) vs **khiếu nại máy hỏng** (`[CHUYEN_SALE]`) |

### Pha 2 — Hàng chờ "Duyệt & gửi" (Lỗi 3)
| File | Việc |
|---|---|
| `orders/orders.controller.ts` | + `POST :id/send-advice` |
| `orders/orders.service.ts` | `approve()` định tuyến theo nội dung: `priced` → confirmation, `outbound` → advice; bỏ 422 oan |
| `web/components/console/ApprovalQueue.tsx` | **MỚI** — cột hàng chờ: ai hỏi, chờ gì, nút Duyệt/Sửa/Từ chối |
| `web/components/console/OrderDetailPanel.tsx` | Nút gọi đúng endpoint theo loại nội dung |

### Pha 3 — Bộ nhớ vòng đời đơn + sửa/huỷ (Lỗi 2)
| File | Việc |
|---|---|
| `conversations/conversation-thread.ts` | + `recentlyClosed(thread, now, window)` — cho ngữ cảnh đơn vừa chốt **mà không** hồi sinh draft |
| `conversations/conversations.service.ts` | `pendingDraft` trả kèm `lastOrder` context |
| `pipeline/amend-detect.ts` | **MỚI** — nhận diện tất định "huy don", "doi thanh", "bo don", "thay vi", "lay X thoi" → ép qua đường advisor kể cả khi đã `priced` |
| `orders/amend-window.ts` | **MỚI** — predicate thuần theo bảng §2 |
| `orders/orders.service.ts` | + `cancelOrder(id, reason)`, `superseded(oldId, newView)` |

### Pha 4 — Registry công cụ + công cụ quản lý đơn
`apps/api/src/tools/tool-registry.ts` (MỚI) — `ToolSpec { name, description, inputSchema, handler, mutating }`.
Advisor + `mcp/server.ts` cùng đọc registry này.

**Công cụ mới cho Ultty:**

| Tên | Ghi? | Việc |
|---|---|---|
| `tra_cuu_don` | đọc | Tra đơn theo mã / đơn gần nhất của người này |
| `huy_don` | **ghi** | Huỷ đơn + lý do (qua cổng §2) |
| `sua_don` | **ghi** | Đổi SL/dòng hàng → supersede |
| `chot_don` | **ghi** | Chốt draft thành đơn + gửi xác nhận |
| `doi_thong_tin_nhan` | **ghi** | Sửa người nhận/SĐT/địa chỉ (TH2) |
| `ghi_chu_don` | **ghi** | Ghi chú cho Sale |
| `chuyen_sale` | **ghi** | Handoff có cấu trúc + lý do (thay marker chuỗi) |
| `luu_tri_nho_khach` | **ghi** | Ghi nhớ theo (group, sender): địa chỉ quen, cách xưng hô |
| `tra_cuu_trang_thai_giao` | đọc | Trạng thái gửi + việc ERP |

**Bảo vệ bắt buộc** (tin Zalo của khách = dữ liệu không tin cậy, có thể chứa prompt injection):
mọi công cụ GHI phải (a) xác minh đơn thuộc đúng `chatId` + `senderExternalId` đang hỏi,
(b) qua cổng `amend-window`, (c) ghi audit. **Ép trong handler, không ép bằng prompt.**

### Pha 5 — Nhiều khách cùng lúc
- Mutex theo `ThreadKey` chống race đọc-sửa-ghi thread (2 tin cùng người xử lý song song).
- Luôn quote tin của đúng người khi trả lời.
- Test: 3 người hỏi xen kẽ trong 1 nhóm → 3 mạch độc lập, không rò SKU chéo.

### Pha 6 — Tài liệu
Cập nhật `docs/phat-trien/ke-hoach/tong-quan.md` (nơi DUY NHẤT có trạng thái) + bảng SAI LỆCH ở
`docs/khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md`.

---

## 5. Validation

```bash
pnpm --filter @netviet/api test && pnpm --filter @netviet/api typecheck && pnpm lint
```

---

## 6. Rủi ro

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| Công cụ GHI + prompt injection qua tin Zalo | **Cao** | Scope theo chatId+sender trong handler; cổng amend; audit; không có công cụ xoá |
| Nới handoff → bot trả lời sai tự tin | Trung bình | `money-guard` giữ nguyên; chỉ nới khi LLM đã gọi công cụ và tài liệu ĐÃ DUYỆT |
| Sửa đơn sau khi Sale đã nhập ERP | Trung bình | Cổng `salesHandoff.status==='completed'` chặn cứng |
| Supersede làm Sale nhập 2 lần | Trung bình | Huỷ đơn cũ **và** đóng `salesHandoff` của nó trong cùng thao tác |
| Đụng việc đang dở trên cây (`wata/`, `agent-workforce/`) | Thấp | Không chạm các file đó |

---

## 7. Acceptance

- [ ] "có đèn ngủ không" / "bảo hành bao lâu" / "lọc bao nhiêu m2" → bot **tự trả lời**
- [ ] "cho a lay 5 cai" sau khi chốt 20 → hiểu là Ghế Felix, không hỏi lại SP
- [ ] "hủy đơn cũ 20 lấy 5 cái thôi" → huỷ đơn cũ + tạo đơn 5, Sale thấy cả hai
- [ ] Console demo có cột **hàng chờ Duyệt & gửi**, nút gửi được cả đơn lẫn tư vấn
- [ ] Đơn `salesHandoff.completed` → LLM **không** sửa được
- [ ] 3 khách hỏi cùng lúc → 3 mạch riêng, reply đúng người
- [ ] `pnpm --filter @netviet/api test` xanh
