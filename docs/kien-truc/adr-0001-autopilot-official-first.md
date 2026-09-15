# ADR-0001 — Mặt phẳng điều khiển Autopilot: official-first

| | |
|---|---|
| **Trạng thái** | ĐỀ XUẤT — chờ review độc lập theo cổng §14 của [#309](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/309) |
| **Ngày** | 15/09/2026 |
| **`main` lúc quyết định** | `de30a0825572684ce2c524058f94a4bd79e07668` |
| **Bằng chứng đầy đủ** | [autopilot-v2-official-first.md](../phat-trien/van-hanh/autopilot-v2-official-first.md) |
| **Thay thế** | `KEEP_CUSTOM` của #194 / PR #199 (05/09/2026) |

---

## Quyết định

```text
DECISION = ADOPT_GITHUB_NATIVE_GH_AW
```

- **Trạng thái nghiệp vụ** = trạng thái GitHub gốc: Issue · nhãn · PR · check-run · review state ·
  ruleset · Environment. **Không còn giao thức tự viết.**
- **Mặt phẳng thực thi** = GitHub Agentic Workflows, ghim `v0.88.7` /
  `bde367913adeb3132f0a171594c88a17f4b7d08c`.
- **Builder ban đầu** = engine `copilot` (đổi engine = sửa một dòng).
- **Reviewer** = Codex qua App `chatgpt-codex-connector` (**đã cài sẵn trong repo này**), giữ tính
  chất Builder ≠ Reviewer mà không cần cầu nối trình duyệt.
- **Cổng người cho rủi ro cao** = nhãn `risk:high` + **GitHub Environment có required reviewer**,
  **không** phải `required_approving_review_count`.

Quyết định này **không** phải `BLOCKED_MANDATORY_GAP`: không có năng lực bắt buộc nào bị thiếu.

## Bối cảnh

Repo đã tích luỹ **30.733 dòng** mã Autopilot tự viết — 10.000 trên `main`, 20.733 nằm trong 12 PR
mở. Trong khi đó tech radar của chính repo đã xếp *"Runtime cho coding agent"* vào **AVOID BUILDING**
từ 27/08/2026.

Kết quả vận hành sau 395 lần chạy orchestrator trên `main`: **0 lần ghi thành công**. Biến
`AUTOPILOT_DRY_RUN` vẫn là `true`; lần ghi thật duy nhất từng thử trả `403` và PR sửa (#191) mở từ
04/09 tới nay chưa merge. README của chính gói ghi nhận trong mục NOT PROVEN rằng đường ghi chưa từng
chạy thật, và rằng trigger `check_suite` **sẽ không bao giờ** kích hoạt trong repo này.

## Các phương án đã cân

| Phương án | Kết quả |
|---|---|
| **A. gh-aw** (ADOPT) | ✅ **CHỌN** — strict mode *từ chối biên dịch* job agent xin quyền ghi; sandbox + firewall; threat detection; chặn fork mặc định; staged mode; ghim SHA/digest; engine hoán đổi được |
| **B. Copilot cloud agent** (gán Issue cho agent) | ❌ Không dùng được: `suggestedActors(CAN_BE_ASSIGNED)` chỉ trả về chủ repo ⇒ chưa có ghế Copilot. Và khi ruleset không tương thích, cách gỡ chính thức là thêm **bypass actor** — mở lại đúng lỗ mà `bypass_actors: []` đang bịt |
| **C. `claude-code-action`** | 🟡 **Đường lui tạm, không phải đích.** Là đường duy nhất chạy được *ngay* (nhận `CLAUDE_CODE_OAUTH_TOKEN` sẵn có). Nhưng ít lan can hơn, và mang CVE-2026-47751 trong tiền sử |
| **D. Local Dispatcher** (PR #263) | ❌ Bác. 7.187 dòng daemon Windows để làm việc mà một runner GitHub làm được |
| **E. Conversation Bridge** (PR #206) | ❌ Bác. 6.889 dòng extension + native host để đánh thức ChatGPT — trong khi App Codex chính thức **đã đăng 40 comment trong repo này** từ 01/09/2026 |
| **F. Giữ nguyên tự viết** (`KEEP_CUSTOM` của #194) | ❌ Bác. Bốn bằng chứng của #199 trả lời câu hỏi *"có nên nhúng mã gh-aw vào orchestrator không"*, không phải *"có nên thay orchestrator bằng gh-aw không"*. Và bản được audit (`v0.88.4`) là **prerelease**, đứng sau stable 109 commit |

## Hệ quả

**Tích cực**

- Xoá **10.000** dòng khỏi `main`; **20.733** dòng nữa không bao giờ vào. Ròng ≈ **−29.300**.
- Các bất biến chuyển từ *"test tĩnh đọc YAML"* sang *"trình biên dịch từ chối"* và *"GitHub cưỡng
  chế bằng token"*.
- Có thêm ba lớp mà bản tự viết chưa từng có: chống prompt injection, phát hiện rò rỉ bí mật/patch
  độc, kiểm soát egress mạng.
- Suy biến an toàn: tầng AI hỏng thì Issue/PR/CI/deploy vẫn chạy nguyên vẹn.

**Tiêu cực / phải chấp nhận**

- **Chưa chạy được hôm nay.** Repo không có credential nào gh-aw chấp nhận: chỉ có
  `CLAUDE_CODE_OAUTH_TOKEN`, mà gh-aw **cố tình bỏ qua** token đó. Cần đúng một khoản mua — khuyến
  nghị **ghế Copilot Pro (~$10/tháng)**, vì nó mở cả engine Builder lẫn cổng approval.
- Phụ thuộc một sản phẩm **public preview**, minor hàng tuần. Hạ rủi ro bằng ghim tag+SHA, commit
  lock file, chỉ dùng built-in đã chín.
- Mất khoá idempotency khi đăng comment. Chấp nhận được vì trạng thái nay nằm ở nhãn, không ở comment.
- **Rào upstream chưa đóng:** PR do safe output `create-pull-request` tạo ra **không kích hoạt CI**
  (giới hạn cố ý của `GITHUB_TOKEN`). Phải đo thật trước khi tuyên bố pilot đạt.

## Điều kiện đảo ngược

Nếu đo thật cho thấy không đóng được rào CI ở trên **và** lối thoát
`github-token-for-extra-empty-commit` cũng không dùng được với GitHub App sẵn có, thì Builder lùi về
phương án **C** (`claude-code-action`) — vẫn giữ nguyên phần trạng thái gốc và kế hoạch xoá của ADR
này. Đảo về tự viết thì không: mã đó đã có 395 lần chạy và 0 lần ghi.

## Cổng chặn trước khi thực hiện

Theo #309 §14, **dừng ở đây** cho review độc lập. Chưa được: xoá mã Autopilot đã trên `main`, biên
dịch `.lock.yml`, bỏ `staged: true`, hay bật bất kỳ workflow tự trị nào.
