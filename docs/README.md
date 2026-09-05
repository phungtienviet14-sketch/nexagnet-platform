# Mục lục tài liệu

Tài liệu tách theo **tuổi thọ và chủ sở hữu**, không theo định dạng file. Ba nhánh cấp 1:

| Khu vực | Vai trò | Nhịp thay đổi | Điểm vào |
|---|---|---|---|
| [`kien-truc/`](kien-truc/nen-tang-da-khach.md) | **Canonical.** Hệ thống được thiết kế thế nào — đúng cho mọi khách, mọi thời điểm | Hiếm; đổi là quyết định kiến trúc | [`kien-truc/nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) |
| [`phat-trien/`](phat-trien/README.md) | **Công việc.** Đang làm gì, xong gì, kiểm thử ra sao | Liên tục | [`phat-trien/ke-hoach/tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) |
| [`khach-hang/`](khach-hang/README.md) | **Theo khách.** Hồ sơ nguồn, trao đổi, nghiệp vụ, bản bàn giao | Theo từng khách | [`khach-hang/ultty/README.md`](khach-hang/ultty/README.md) |

### Bốn tài liệu NỀN TẢNG mới (27/08/2026)

| File | Là gì |
|---|---|
| [`kien-truc/reference-platform-stack.md`](kien-truc/reference-platform-stack.md) | **Hợp đồng stack tham chiếu** — `ultty-gd1-test` phải chứng minh được gì, thang parity L0–L5, 4 mặt phẳng nền tảng, **CANONICAL CURRENT TRUTH**, known risks |
| [`kien-truc/tech-radar.md`](kien-truc/tech-radar.md) | **ADOPT/TRIAL/ASSESS/HOLD/AVOID** kèm bằng chứng, và **FRAMEWORK DECISION** |
| [`kien-truc/agentic-ops.md`](kien-truc/agentic-ops.md) | Bốn mức tự động hoá vận hành — **định hướng dài hạn, chưa triển khai gì** |
| [`phat-trien/ke-hoach/platform-roadmap-v2.md`](phat-trien/ke-hoach/platform-roadmap-v2.md) | Lộ trình **nền tảng** P0→P15; mỗi phase có WHY/ENTRY/DELIVERABLES/RUNTIME PROOF/EXIT + **DO NOT DO** |

> Trạng thái hiện tại của nền tảng: xem
> [`reference-platform-stack.md §6`](kien-truc/reference-platform-stack.md#6-canonical-current-truth-27082026).
> Trạng thái kế hoạch (✅/⬜) vẫn chỉ ở
> [`tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) — nay có thêm **§12** cho tầng nền tảng.

### Ba tài liệu trong `kien-truc/` khác vai nhau

| File | Là gì | Không phải gì |
|---|---|---|
| [`nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) | **Kiến trúc tổng quát cao nhất** — core/tenant, port/adapter, silo, cách ly dữ liệu, bất biến bảo mật | Không phải kế hoạch, không chứa trạng thái, không nhắc tên khách |
| [`he-thong.md`](kien-truc/he-thong.md) | **Thiết kế kỹ thuật & as-built** — sơ đồ, quyết định kỹ thuật, phụ lục PoC | Không được mâu thuẫn với file trên |
| [`api-http.md`](kien-truc/api-http.md) | **Hợp đồng HTTP** — xác thực, phân quyền, toàn bộ endpoint, giới hạn tần suất, hình dạng lỗi | Không phải hướng dẫn vận hành, không chứa dữ liệu khách |
| [`business-decision-ledger.md`](kien-truc/business-decision-ledger.md) | **Sổ cái quyết định nghiệp vụ** — bốn mặt phẳng sự thật, khi nào dùng sổ cái / telemetry / audit log, chống trùng, chính sách thất bại theo mức nghiêm trọng, hợp đồng riêng tư | Không phải Evidence Graph, không phải Replay, không phải Diagnostic Agent |

> ⚠️ Đừng nhầm [`kien-truc/nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) (kiến trúc) với
> [`phat-trien/ke-hoach/dot-0-nen-tang.md`](phat-trien/ke-hoach/dot-0-nen-tang.md) (kế hoạch Đợt 0).
> Tên từng gần giống nhau nên đã đổi tên file kế hoạch cho khỏi lẫn.

### Hợp đồng vertical (28/08/2026)

Ba file trên mô tả **nền tảng**. Bên cạnh chúng bắt đầu có **hợp đồng theo vertical** — mô tả một
miền nghiệp vụ dùng lại được cho nhiều khách cùng ngành:

| File | Là gì | Không phải gì |
|---|---|---|
| [`transport-domain-contract.md`](kien-truc/transport-domain-contract.md) | **Transport Domain v0** — bounded context, aggregate, bất biến tài chính, capability, phân quyền, guardrail, case nghiệm thu, giả định demo | Không nhắc tên khách; không phải kế hoạch; **chưa có code** |

Nguồn nghiệp vụ của nó nằm bên khách:
[`khach-hang/van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md`](khach-hang/van-tai-viet/nghiep-vu/nguon-su-that-van-tai.md).
Ranh giới giữ nguyên như mọi chỗ khác trong `docs/`: **sự kiện của khách ở `khach-hang/`, thiết kế
của chúng ta ở `kien-truc/`**.

### Giao thức Autopilot V0 (03/09/2026)

| File | Là gì | Không phải gì |
|---|---|---|
| [`phat-trien/van-hanh/autopilot-protocol-v0.md`](phat-trien/van-hanh/autopilot-protocol-v0.md) | **Giao thức ChatGPT ↔ GitHub ↔ Claude V0** — tác nhân, 9 thông điệp có marker, máy trạng thái, quy tắc SHA/CI/rủi ro/retry/idempotency, Task Contract; bản máy đọc + validator ở `tools/autopilot-protocol/` | Chưa có orchestrator, dispatcher Claude, auto-merge hay CD — **nền tảng giao thức**, không phải tự động hoá đang chạy |
| [`phat-trien/van-hanh/conversation-bridge-v0.md`](phat-trien/van-hanh/conversation-bridge-v0.md) | **Conversation Bridge V0** — cầu nối cục bộ CHỈ-VÀO đánh thức đúng một cuộc hội thoại ChatGPT Web từ một `REVIEW_REQUEST` hợp lệ: bốn ranh giới tin cậy, cổng xuất xứ, cổng HEAD sống, idempotency at-most-once, bảng mối đe doạ | **Chưa cài đặt thật** — dừng trước lần ghi registry đầu tiên; không đọc câu trả lời, không cổng vào, không ghi GitHub |

## Quy ước đặt tên

- Tên thư mục/file dùng chữ thường, không dấu và `kebab-case`.
- Ngày trong tên file dùng ISO: `YYYY-MM-DD`; tài liệu theo tháng dùng `YYYY-MM`.
- Hồ sơ trong `nguon-goc/` không sửa nội dung. Nếu cần phân tích hoặc diễn giải, tạo tài liệu dẫn xuất ở `nghiep-vu/` hoặc `phat-trien/`.
- Chỉ [`phat-trien/ke-hoach/tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) giữ trạng thái `✅/⬜`; kế hoạch con chỉ giữ phạm vi và thiết kế.
- File bàn giao và nguồn sinh file được đặt cạnh nhau dưới `khach-hang/<slug>/ban-giao/`.
- Không đưa dữ liệu riêng của khách vào tài liệu kiến trúc base nếu không cần; dùng đường dẫn tham chiếu sang hồ sơ khách.

