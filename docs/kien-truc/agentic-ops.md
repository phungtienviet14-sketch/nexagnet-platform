# AGENTIC OPS — bốn mức tự động hoá vận hành

> **Vai trò tài liệu:** canonical, **định hướng dài hạn**. Không có gì trong tài liệu này được
> triển khai ở thời điểm viết. Trạng thái kế hoạch ở
> [`phat-trien/ke-hoach/tong-quan.md`](../phat-trien/ke-hoach/tong-quan.md); thứ tự triển khai ở
> [`platform-roadmap-v2.md`](../phat-trien/ke-hoach/platform-roadmap-v2.md).
>
> **Cập nhật:** 27/08/2026 · Trạng thái toàn bộ tài liệu: **PLANNED**

---

## 1. Nguyên tắc đứng trước mọi thứ khác

**Không tự viết một AI coding agent từ đầu.** Khác biệt của Nexagnet không nằm ở vòng lặp agent —
thứ đó đã có nhiều lựa chọn tốt. Khác biệt nằm ở bốn thứ **chỉ chúng ta có**:

1. **bằng chứng nghiệp vụ** — quyết định có mã lý do, trace nối được qua Hatchet, danh tính release
   chính xác 40 ký tự;
2. **ngữ nghĩa tenant** — cùng một lỗi có nghĩa khác nhau với hai khách khác nhau;
3. **chính sách nghiệm thu** — thế nào là "đúng" cho một nghiệp vụ;
4. **chính sách canary** — được phép thử tới đâu trước khi cần người.

Mọi thứ khác nên mua hoặc mượn.

---

## 2. Điều kiện tiên quyết — chưa đạt

> **`main` hiện KHÔNG được bảo vệ** (0 ruleset, `branches/main/protection` trả 404, repo public —
> đo ngày 27/08/2026). Không được mở bất kỳ mức nào dưới đây lên một nhánh mà ai cũng ghi thẳng
> vào được.

**P3 (GitHub Governance) phải CLOSED trước P12.** Đây không phải khuyến nghị mềm: một agent mở PR
vào một repo không bắt buộc review và không bắt buộc CI thì "mở PR" và "ghi thẳng vào production"
là cùng một hành động.

---

## 3. Bốn mức

### LEVEL 0 — DIAGNOSTIC AGENT (chỉ đọc)

**Đọc từ:** ClickStack · Hatchet · bằng chứng Debug của Nexagnet · danh tính release · GitHub ·
Langfuse.

**Trả ra:** một sự cố + **các ứng viên nguyên nhân gốc**, kèm đường dẫn tới bằng chứng.

**Không làm:** không sửa gì, không mở PR, không chạm hạ tầng.

**Vì sao mức này đi trước:** nó buộc ta phải có **dữ liệu đọc được bằng máy** trước khi nghĩ tới tự
động hoá. Hôm nay dữ liệu đó **chưa bền** — Debug View mất lượt cũ khi API khởi động lại. Nên
LEVEL 0 bị chặn bởi **P2 REFERENCE STACK PARITY v0**, không phải bởi năng lực của agent.

### LEVEL 1 — AUTO-FIX PR AGENT

**Vòng:** regression ĐỎ → vá → chạy test → **mở PR**.

**Tuyệt đối không merge.** Người vẫn là người duyệt.

**Cổng vào:** LEVEL 0 chạy ổn định + P3 xong + có bộ **BusinessAcceptanceContract** đủ để một bản vá
được đánh giá bằng nghiệp vụ chứ không chỉ bằng "test xanh".

### LEVEL 2 — CANARY REMEDIATION

**Vòng:** CI → gd1/canary → phát lại (replay) runtime → nghiệm thu nghiệp vụ → **người phê duyệt**.

Đây là nơi stack tham chiếu trả nợ: không có một môi trường giống thật để thử, "canary" chỉ là một
chữ.

### LEVEL 3 — LIMITED AUTO PRODUCTION

Chỉ những playbook **rủi ro thấp**, đã có lịch sử chạy đúng. Xem §5.

---

## 4. MCP — giao diện máy, không phải màn hình

Agent **không được** đọc Debug View bằng cách bóc HTML. Nexagnet nên phơi một MCP server
**CHỈ ĐỌC**:

```
get_tenant_status        get_deploy_signals       get_order_debug_evidence
get_workflow_run         get_source_location      get_release_identity
get_business_acceptance  get_runtime_health
```

Công cụ **ghi** chỉ tính tới sau này, và khi đó phải kèm **phạm vi + phê duyệt + nhật ký kiểm toán**.

Lý do chọn MCP: nó biến bằng chứng thành hợp đồng có kiểu, nên khi màn hình đổi thì agent không gãy.

---

## 5. Phân loại rủi ro cho tự động hoá production

| Được phép tự động | Vì sao an toàn |
|---|---|
| khởi động lại một worker đã biết là không khoẻ | trạng thái nằm ở Hatchet, không mất việc |
| thử lại một job hỏng tạm thời đã biết | idempotent theo thiết kế |
| reconcile lại cấu hình sinh ra được | nguồn sự thật là mã, không phải máy |
| playbook rủi ro thấp đã có lịch sử | đã chạy đúng nhiều lần, có đường lùi |

| **Không bao giờ tự động** (trừ khi chính sách tương lai đổi sau một lịch sử đã chứng minh) |
|---|
| giá và mọi tính toán tài chính |
| phân quyền và bảo mật |
| migration phá huỷ dữ liệu |
| xoá dữ liệu |
| cách ly tenant |
| thay đổi secret |

> **Không bao giờ thiết kế:** AI tự SSH vào production rồi sửa file trực tiếp. Đường duy nhất tới
> production là qua release có danh tính — thứ vừa được đóng ở
> [reference-platform-stack §6.2](reference-platform-stack.md#62-bằng-chứng-cho-hai-dòng-closed).

---

## 6. Hatchet sở hữu điều phối bền

Chuỗi dài của Agentic Ops là một workflow bền, không phải một script:

```
phát hiện → thu bằng chứng → chẩn đoán → chờ coding agent → chờ CI
         → deploy canary → chờ runtime proof → chờ người duyệt → promote / rollback
```

Mỗi mũi tên là một chỗ tiến trình có thể chết. Hatchet đã chứng minh `durableTask` + `sleepFor` sống
qua SIGKILL, nên **không dựng hệ durability thứ hai**. Hai hệ điều phối là hai nguồn sự thật, và khi
chúng bất đồng thì không ai biết cái nào đúng.

---

## 7. BusinessAcceptanceContract — nền móng bắt buộc

Không có cái này thì LEVEL 1 trở lên là mù: agent chỉ biết "test xanh", không biết "nghiệp vụ đúng".

Khái niệm (dài hạn, **không** xây trong đợt tài liệu này):

```
sales-order-auto-confirm.v1
  Given: quantity = 50        Expected: AUTO_CONFIRM
  Given: quantity = 51        Expected: HUMAN_HANDOFF
  Given: quantity unknown     Expected: SAFE_HANDOFF
```

Mỗi tính năng quan trọng phải sinh ra chuỗi: **tình huống nghiệp vụ → nghiệm thu tự động → bằng
chứng runtime → danh mục regression**. Các tình huống phụ thuộc LLM có thể đồng bộ sang dataset của
Langfuse.

---

## 8. Trước khi tự viết bộ não chẩn đoán

**Benchmark công nghệ có sẵn trên 10–20 lỗi lịch sử thật của Nexagnet** trước đã. Đo: độ chính xác
nguyên nhân gốc · chọn đúng chỗ trong mã · chất lượng bản vá · chất lượng test · quyền riêng tư ·
chính sách dữ liệu/self-hosting · chi phí · mức độ khớp với luồng GitHub.

Nếu công nghệ có sẵn đạt → **dùng**. Chỉ tự xây phần khác biệt ở §1.

Đánh giá Sentry Seer, kèm cổng chặn về dữ liệu, ở
[tech-radar §4.1](tech-radar.md#41-sentry-seer--bằng-chứng-và-cổng-chặn).

---

## 9. Liên quan

- [reference-platform-stack.md](reference-platform-stack.md) — hợp đồng stack tham chiếu, known risks
- [tech-radar.md](tech-radar.md) — phân loại công nghệ
- [../phat-trien/ke-hoach/platform-roadmap-v2.md](../phat-trien/ke-hoach/platform-roadmap-v2.md) — P12→P15
- [../phat-trien/van-hanh/debugging.md](../phat-trien/van-hanh/debugging.md) — lần vết một nghiệp vụ chạy sai
