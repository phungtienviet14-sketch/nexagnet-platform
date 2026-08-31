# Sổ cái quyết định nghiệp vụ (Business Decision Ledger v0)

> **Canonical.** Tài liệu này mô tả **tầng nền tảng**, đúng cho mọi khách. Không nhắc tên khách nào.
> Nguồn: Issue #98 — _Business Decision Ledger v0_.

## 1. Câu hỏi mà tầng này trả lời

Source Management Foundation v0 đã trả lời được:

> Sự thật nghiệp vụ này dựa trên **nguồn nào**, bản nào đang hiệu lực, đã duyệt hay đang xung đột?

Còn thiếu một câu, và nó là câu người trực hỏi lúc 2 giờ sáng:

> Vì sao hệ thống đã ra **đúng quyết định này** cho **đúng ca này** — dùng sự thật/chính sách nào,
> ở bản phát hành nào, và sau đó chuyện gì xảy ra?

Telemetry có kiểu (`telemetry.decision()`) trả lời được câu đó **trong 30 ngày**. Sau đó span hết
hạn và câu trả lời biến mất. Sổ cái là chỗ câu trả lời **không hết hạn**.

## 2. Bốn mặt phẳng sự thật

| Mặt phẳng             | Là sự thật về                     | Nơi ở                                      | Vòng đời                                   |
| --------------------- | --------------------------------- | ------------------------------------------ | ------------------------------------------ |
| **Sổ cái quyết định** | **vì sao** hệ thống xử sự như vậy | Postgres (`BusinessDecision`)              | bền vững, append-only, có backup           |
| Thực thi              | bước nào chạy, chạy lại mấy lần   | Hatchet                                    | theo cấu hình lưu trữ của engine (30 ngày) |
| Quan sát              | độ dài, cây span, log             | OTel / ClickHouse                          | 30 ngày                                    |
| Phần mềm              | trạng thái mong muốn              | Git / release manifest                     | vĩnh viễn                                  |
| Nguồn sự thật         | số liệu đến từ đâu, ai duyệt      | Postgres (`BusinessSource`/`BusinessFact`) | bền vững                                   |

Sổ cái **tương quan** bốn mặt phẳng bằng `traceId` · `spanId` · `workflowRunId` · `releaseSha`.
Nó **không thay thế** mặt phẳng nào:

- **không** để payload OTel vào Postgres;
- **không** biến ClickHouse thành sổ cái canonical;
- **không** dựng một hệ event-sourcing tổng quát.

## 3. Ba thứ dễ nhầm nhau — chọn cái nào

|                       | Ghi cái gì                        | Chủ thể        | Đối tượng            | Ví dụ                                                            |
| --------------------- | --------------------------------- | -------------- | -------------------- | ---------------------------------------------------------------- |
| **`AuditLog`**        | **ai đã sửa gì**                  | người thao tác | **một hàng dữ liệu** | `status: pending -> sent`, kèm `before`/`after`                  |
| **Sổ cái quyết định** | **vì sao hệ thống xử sự như vậy** | một quyết định | **một ca nghiệp vụ** | cổng `order.auto_confirm` đóng với mã `QUANTITY_ABOVE_THRESHOLD` |
| **Telemetry**         | chuyện gì đã chạy, mất bao lâu    | một lượt chạy  | một tiến trình       | span `order.persist` 240 ms, cây span, log                       |

**Một lần người vận hành bấm nút duyệt sinh ra CẢ BA.** Gộp bất kỳ hai cái nào lại thì một trong
các câu hỏi sẽ không còn trả lời được.

Quy tắc chọn nhanh:

- Câu hỏi bắt đầu bằng **"ai đã đổi…"** → `AuditLog`.
- Câu hỏi bắt đầu bằng **"vì sao hệ thống…"** và câu trả lời phải còn đúng **sau 30 ngày**, hoặc
  phải dùng để **đối soát tiền/thẩm quyền** → **sổ cái**.
- Câu hỏi bắt đầu bằng **"chuyện gì đã chạy / chậm ở đâu"** → telemetry.

**Không ghi mọi quyết định vào sổ cái.** Cùng kỷ luật với `telemetry.step()`: một lượt chạy 50 hàm
vẫn chỉ nên thấy 5–15 bước, và trong đó chỉ những cổng **có hệ quả nghiệp vụ** mới vào sổ cái.
Một `normalizeString()` không có quyết định nào để ghi.

## 4. Mô hình

### `BusinessDecision` — APPEND-ONLY

Danh tính chống trùng là `(tenantId, idempotencyKey)`. Không có đường `UPDATE` nào cho nội dung;
cột duy nhất của một hàng đã ghi được phép đổi là `status`.

Các nhóm cột: **ca** (`subjectType`/`subjectId`) · **quyết định** (`decisionPoint`/`outcome`/
`reasonCode`) · **thẩm quyền** (`actorKind`/`actorRef`/`criticality`/`approvalRef`) ·
**căn cứ** (`policyRef`/`policyVersion`, và `BusinessDecisionFactRef`) · **tương quan**
(`traceId`/`spanId`/`workflowRunId`/`releaseSha`) · **dòng dõi** (`status`/`supersedesId`).

### `BusinessDecisionFactRef` — sự thật đã dùng

Có **cả khoá ngoại lẫn ảnh chụp**, và hai thứ trả lời hai câu khác nhau:

- khoá ngoại (`factId`, `ON DELETE RESTRICT`) chứng minh bản ghi sự thật **thực sự tồn tại**, và
  chặn xoá nó;
- ảnh chụp (`factStatusAtUse`, `sourceKey`, `sourceVersion`) giữ trạng thái **lúc dùng**.

Thiếu ảnh chụp thì khi bản sự thật bị thay thế, `status` của chính hàng đó đổi sang `SUPERSEDED` —
và một quyết định đúng đắn hôm qua sẽ đọc lại như _"đã dùng một sự thật hết hiệu lực"_. Đó là viết
lại lịch sử.

### `BusinessDecisionRelation` — quan hệ tối thiểu

Ba loại: `PARENT_DECISION` · `APPROVAL` · `RESULTING_ENTITY`. Đây là **bằng chứng, không phải đồ
thị** — không phải Evidence Graph, và không có đường duyệt đệ quy nào đọc nó.

## 5. Chống trùng — khoá là BẮT BUỘC

Hatchet chạy lại, HTTP thử lại và giao hàng at-least-once đều đi qua cùng một đường ghi.

**Không có mặc định**, vì không có câu trả lời đúng ở tầng nền:

- mặc định _"tự băm từ nội dung quyết định"_ sẽ gộp hai lần từ chối **thật** ở hai thời điểm khác
  nhau thành một hàng — xoá mất lần thứ hai;
- mặc định _"mỗi lần một UUID mới"_ sẽ sinh hàng trùng mỗi lần chạy lại.

Chỉ **nơi gọi** biết lần ghi này là _"cùng một lần"_ hay _"một lần khác"_. `DecisionOccurrence` cho
nó ba cách nói: `externalKey` · `workflowRun` · `turn`.

**Dấu tay (`fingerprint`) là nửa thứ hai.** Cùng khoá + khác nội dung = **lỗi của bên gọi**, và
cổng **ném** (`LEDGER_IDEMPOTENCY_KEY_CONFLICT`) thay vì trả về hàng cũ — trả về hàng cũ sẽ làm bên
gọi tin rằng quyết định MỚI của nó đã được ghi.

Dấu tay **cố ý không** gồm `occurredAt`/`traceId`/`releaseSha`/`detail`: giữ chúng lại sẽ biến mọi
lần chạy lại bình thường thành một xung đột, tức biến lớp bảo vệ thành nguồn sự cố.

## 6. Chính sách thất bại theo mức nghiêm trọng

Một câu trả lời chung cho mọi quyết định là sai ở **cả hai hướng**: luôn fail-open thì một quyết
định phê duyệt chi tiền có thể biến mất không dấu vết; luôn fail-closed thì Postgres nghẽn một phút
là mọi đường đọc nghiệp vụ chết theo.

| Mức                          | Khi ghi sổ cái hỏng                                         | Dùng cho                                |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| `FINANCIAL_OR_AUTHORIZATION` | **FAIL CLOSED** — ném tiếp, giao dịch bao quanh cuộn ngược  | tiền, thẩm quyền, phê duyệt vượt ngưỡng |
| `BUSINESS_STANDARD`          | **RECONCILE** — đi tiếp, phát một yêu cầu đối soát bền vững | quyết định nghiệp vụ thường             |
| `ADVISORY`                   | **BEST_EFFORT** — đi tiếp, chỉ còn dấu vết ở telemetry      | quan sát, gợi ý của LLM                 |

> ⚠️ **`FAIL_CLOSED` chỉ có nghĩa nếu bên gọi ở TRONG một giao dịch.** Ném ra ngoài chỉ có giá trị
> khi lỗi đó **cuộn ngược** được thay đổi nghiệp vụ. Nếu đơn đã gửi cho khách rồi mới ném, ta có một
> đơn đã gửi VÀ không có bản ghi — tệ hơn cả hai lựa chọn. Bọc thay đổi nghiệp vụ và lần ghi sổ cái
> trong cùng `runInTransaction()`.

Kết quả của `record()` là một **union tường minh**: `{ persisted: true, decision }` hoặc
`{ persisted: false, decision: null, reason, cause }`. Trình biên dịch — chứ không phải một dòng chú
thích — là thứ bắt nơi gọi thừa nhận rằng lần ghi có thể đã không xảy ra.

Yêu cầu đối soát **không** ghi vào Postgres: cổng này chỉ được gọi khi một phép ghi Postgres vừa từ
chối. Mặc định là một dòng log có cấu trúc (`DecisionLedgerReconciliationSink`), mang `idempotencyKey`
— chính là cách ghi bù đúng hàng còn thiếu mà không ghi trùng.

## 7. Quyền quyết định — LLM không bao giờ là thẩm quyền bền vững

LLM được **phân loại · trích xuất · đề xuất · soạn thảo**. `actorKind` phân biệt bốn vai:
`DETERMINISTIC_RULE` · `HUMAN` · `LLM_RECOMMENDATION` · `SYSTEM_CONSEQUENCE`.

Cổng `LEDGER_LLM_NOT_AUTHORITATIVE` từ chối một hàng `LLM_RECOMMENDATION` ở mức
`FINANCIAL_OR_AUTHORIZATION`. Nó **không cấm ghi đề xuất của LLM** — nó cấm ghi đề xuất đó _như một
quyết định đã duyệt_. Đường đúng là **hai hàng**:

```text
đề xuất   (LLM_RECOMMENDATION, ADVISORY)
   ▲ PARENT_DECISION
quyết định (HUMAN | DETERMINISTIC_RULE, FINANCIAL_OR_AUTHORIZATION)
```

## 8. Riêng tư — sổ cái ghi THAM CHIẾU, không ghi payload

`detail` đi qua một **danh sách trắng** (`decision-evidence.ts`), không phải một bộ lọc, và cổng đó
**ném** chứ không che. Lý do: sổ cái không hết hạn sau 30 ngày, không xoá được theo thiết kế, và nằm
trong DB được backup — **một lần rò rỉ ở đây là một lần rò rỉ vĩnh viễn**.

Bị chặn: khoá bí mật · khoá PII · nội dung hội thoại/prompt/completion · **khoá mang số tiền** ·
giá trị không vô hướng · chuỗi > 200 ký tự · > 24 khoá.

Ba vị từ `isSecretKey`/`isPiiKey`/`isContentKey` **dùng lại** từ `telemetry-redaction.ts` — không
viết danh sách thứ hai, vì hai danh sách sẽ lệch nhau và chỗ lệch chính là chỗ rò rỉ. Phạm trù duy
nhất thêm mới là `isMonetaryKey`: sổ cái ghi **vì sao** một mức giá được áp, không ghi mức giá đó.

> **Định danh không bị quét nội dung.** Bài học 25/08/2026: `entityId` từng bị quét bằng mẫu SĐT, và
> 1,2% UUID v4 khớp mẫu đó → 1 trên 83 lần chốt đơn thất bại ngẫu nhiên. `subjectId` được kiểm bằng
> **khuôn**, không bằng phép đoán mẫu.

## 9. Tương quan nguồn sự thật

Khi một quyết định phụ thuộc một `BusinessFact`:

- ghi **đúng** `factId` + trạng thái + bản nguồn đã dùng **tại thời điểm đó**;
- sự thật bị thay thế về sau → quyết định cũ **vẫn** trỏ bản cũ;
- **không** viết lại quyết định cũ theo bản mới nhất.

Ảnh chụp được lấy từ **bản ghi thật**, không từ đối số của người gọi: bên gọi chỉ được chọn _dùng sự
thật nào_, còn trạng thái và bản nguồn do tầng này đọc ra. Đường đọc ngược `listAffectedByFact()`
trả lời: _"bản số liệu sai này đã làm lệch những ca nào"_.

## 10. Bề mặt MCP — CHỈ ĐỌC

`get_decision` · `list_decisions_for_subject` · `explain_decision_refs`.

Không có cổng ghi, vì một phiên agent không cung cấp được hai thứ một cách trung thực: **ngữ nghĩa
chống trùng** (nó không biết mình ở lượt nào) và **thẩm quyền** (mở đường ghi là tạo ra đúng con
đường mà §7 sinh ra để chặn). Đây **không phải** Diagnostic Agent — ba tool trả về dữ liệu, không
trả về kết luận.

## 11. Giới hạn đã biết của v0

1. **Chưa RUNTIME-PROVEN.** Chưa có đường nghiệp vụ đã triển khai nào ghi/đọc sổ cái trên stack thật.
   Mọi bằng chứng hiện tại là test (in-memory + Postgres thật).
2. **Chưa có nơi gọi trong production.** Tầng này đã đăng ký ở `app-composition.ts` với owner
   `foundation` và sẵn sàng tiêm, nhưng `pipeline`/`orders`/`transport` **chưa** gọi `record()` —
   cố ý, vì đấu dây vào đường nghiệp vụ thật là một thay đổi hành vi cần bằng chứng runtime riêng.
3. **Yêu cầu đối soát chỉ là một dòng log.** Nếu đường log cũng mất trong cùng cửa sổ đó thì yêu cầu
   đối soát mất theo. Đường đi về sau là một hiện thực ghi vào kho ĐỘC LẬP với DB nghiệp vụ; vì cổng
   này là lớp trừu tượng được tiêm, việc đó không đổi một dòng nào của `DecisionLedgerService`.
4. **Không có đường đọc HTTP.** Sổ cái đọc được qua MCP và qua dịch vụ trong tiến trình; Debug View
   chưa hiển thị nó.
5. **`TenantScope` dùng chung với `source-registry`** — cố ý (§3 hợp đồng: không nhân bản một cấu
   trúc bền vững đã có). Hệ quả: `DecisionLedgerModule` phụ thuộc `SourceRegistryModule`, một chiều.
