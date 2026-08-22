# GATE A — ghim phiên bản code cho run đang chạy: bằng chứng đối chứng

> Ngày: **22/08/2026** · engine `v0.101.27` · SDK `1.28.2`
> Chạy lại: `pnpm spike:shared` (kỳ vọng FAIL) rồi `pnpm spike:versioned` (kỳ vọng PASS)
> Dữ liệu thô: [`version-spike-shared.json`](version-spike-shared.json) · [`version-spike-versioned.json`](version-spike-versioned.json)

## 0. Kết luận

**GATE A ĐÓNG — PASS**, bằng chiến lược **tên workflow mang phiên bản**: `<key>.v<N>`.

Không phải bằng tính năng nào của Hatchet. Đã kiểm hết ba ứng viên trong tài liệu chính thức và
**không cái nào ghim được run đang chạy vào code cũ** — xem §4.

## 1. Vì sao phải có đối chứng

Một phép đo chỉ đáng tin khi nó **biết cách hỏng**. Nên cùng một kịch bản chạy hai lần, chỉ khác
đúng một biến: **cách đặt tên workflow**.

| | `shared` (v1 và v2 cùng một tên) | `versioned` (`.v1` / `.v2`) |
|---|---|---|
| Vai trò | đối chứng — **phải hỏng** | phương án — **phải chạy** |
| Kết luận đo được | **FAIL** | **PASS** |

Nếu cả hai cùng PASS thì phép đo mù. Nó không mù.

## 2. Kịch bản (chạy thật, engine đang sống)

```
① worker v1 lên → ② run A vào bước `park` (chờ bền vững) → ③ worker v2 lên (v1 CÒN SỐNG)
→ ④ run B mới → ⑤ thả sự kiện cho A → ⑥ đọc phiên bản code của TỪNG bước của A
→ ⑦ v1 xả hết → ⑧ tắt v1, đọc lại lịch sử A
⑨ (riêng) run C đang `park` → rút hết worker v1 → chỉ còn v2 → C có bị cướp không?
```

Mỗi bước workflow trả về `{step, engineVersion, workerName, workflowName}` — nên
"bước nào chạy code nào" là **dữ liệu đọc được**, không phải suy đoán.

## 3. Kết quả cạnh nhau

| # | Khẳng định | `shared` | `versioned` |
|---|---|---|---|
| ② | run A dừng ở bước chờ bền vững | PASS | PASS |
| ④ | run **mới** chạy code v2 | **FAIL** — `begin=v1` | PASS — `begin=v2` |
| ⑥ | **MỌI bước của run cũ chạy v1** | **FAIL** — `finish=v1 resume=v2 park=v1 begin=v1` | **PASS** — `finish=v1 resume=v1 park=v1 begin=v1` |
| ⑦ | worker v1 xả hết trước khi rút | PASS — 0 run còn lại | PASS — 0 run còn lại |
| ⑧ | tắt worker cũ không hỏng lịch sử | PASS — 4 bước, `COMPLETED` | PASS — 4 bước, `COMPLETED` |
| ⑨ | v1 biến mất → run cũ **nằm chờ** | **FAIL** — `begin=v2 park=v2 resume=v2 finish=v2`, **bị cướp cả 4 bước** | **PASS** — chỉ `begin=v1`, `status=RUNNING`, **không bước v2 nào** |

Hai dòng đáng đọc kỹ:

- **⑥ với `shared`:** một run duy nhất có `park` chạy **v1** rồi `resume` chạy **v2**. Đây là
  hiện tượng POC đã ghi, nay tái lập ở mức chi tiết từng bước.
- **⑨ với `shared`:** run C bị worker v2 nuốt **ngay từ bước đầu tiên**. Nghĩa là với một tên
  workflow dùng chung, ta **không điều khiển được phiên bản theo cả hai chiều** — không giữ được
  run cũ ở code cũ, mà cũng không đẩy được run mới sang code mới.

## 4. Ba ứng viên tính năng — vì sao đều không dùng được

| Tính năng | Trang tài liệu | Có ghim run đang chạy vào code cũ? |
|---|---|---|
| Worker affinity (`desired_worker_labels`) | `v1/advanced-assignment/worker-affinity.mdx` | **KHÔNG** — desired labels thuộc **định nghĩa task do worker đăng ký**; v2 đăng ký cùng tên là ghi đè tiêu chí của run cũ |
| Sticky assignment (`SOFT`/`HARD`) | `v1/advanced-assignment/sticky-assignment.mdx` | **KHÔNG** — ghim vào **một tiến trình**, không phải một **phiên bản code**; `HARD` + worker chết = treo vĩnh viễn |
| Namespace | `v1/environments.mdx` | Cách ly **môi trường**, không phải versioning |

## 5. Cơ chế — vì sao tên workflow là thứ quyết định

Đọc từ chính dữ liệu run (`runs.get()` → `tasks[].actionId`):

```
actionId = "version-spike:park"        (chiến lược shared)
actionId = "version-spike.v1:park"     (chiến lược versioned)
```

Engine định tuyến việc theo **actionId = `<tênWorkflow>:<tênBước>`**, và một worker chỉ nhận
việc của những action **chính nó đã đăng ký**. Tài liệu chính thức nói thẳng hệ quả
(`v1/workers.mdx`):

> "multiple workers can register the same task. In this scenario, Hatchet distributes work
> across all of them"

Cùng tên ⇒ v1 và v2 là **hai bản sao ngang hàng của một hàng đợi**, engine chia việc cho cả hai.
Khác tên ⇒ hai hàng đợi rời nhau, không có đường nào để một run đi lạc sang bên kia.

## 6. RÀNG BUỘC CỨNG phát hiện lúc chạy — dấu phân cách

Lần chạy `versioned` đầu tiên **worker không đăng ký được**:

```
/v1.AdminService/PutWorkflow INVALID_ARGUMENT: Validation failed with the following errors:
0: validation failed on field 'CreateWorkflowVersionOpts.Name':
   Hatchet names must match the regex ^[a-zA-Z0-9\.\-_]+$
```

⇒ **`<key>:v1` KHÔNG dùng được với Hatchet.** Dấu hai chấm nằm ngoài bộ ký tự hợp lệ. Bộ hợp lệ
chỉ có: chữ, số, `.`, `-`, `_`. Đã chọn **dấu chấm**: `integration-handoff.v1`.

Đây là chi tiết mà mọi tài liệu thiết kế viết `sales-order-to-erp:v1` sẽ vấp phải lúc deploy chứ
không phải lúc review.

## 7. Chế độ hỏng — và vì sao chế độ hỏng này chấp nhận được

Khi worker của một phiên bản đã rút mà còn run của phiên bản đó:

| Chiến lược | Chuyện gì xảy ra |
|---|---|
| `shared` | Run **âm thầm chạy code mới**. Không lỗi, không cảnh báo, không ai biết. |
| `versioned` | Run **nằm chờ** (`RUNNING`, bước kế tiếp `QUEUED`). Thấy được trên dashboard, đếm được bằng `runs.list`, có người sửa được. |

Đây là lý do chọn chiến lược này chứ không phải chỉ vì ⑥ xanh: **hỏng-mà-thấy** luôn tốt hơn
**đúng-lúc-may-mắn**.

## 8. Hệ quả bắt buộc cho bản triển khai thật

1. **Một bản triển khai worker đăng ký ĐÚNG MỘT phiên bản.** Một container = một phiên bản code.
2. **Dispatcher kích hoạt theo tên đầy đủ** `<key>.<version>` lấy từ ràng buộc tenant, không phải
   theo tên khoá trần.
3. **Thủ tục rút worker cũ:** đếm `runs.list({workflowNames:['<key>.vN'], statuses:['RUNNING','QUEUED']})`
   phải bằng **0** rồi mới tắt. Đây là bước DRAIN trong runbook, và nó **đo được**, không phải
   "chờ cho chắc".
4. Rút sớm không mất dữ liệu — chỉ làm run treo. Bật lại worker phiên bản đó là run chạy tiếp
   (đã kiểm ở ⑨: sau khi rút v1, run C giữ nguyên `begin=v1` và không bị v2 chạm vào).
