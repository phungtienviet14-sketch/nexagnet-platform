<!-- gh-aw-pin: v0.88.7 -->
<!-- gh-aw-sha: bde367913adeb3132f0a171594c88a17f4b7d08c -->
<!-- gh-aw-audit: 2026-09-15 -->

# ADR-0001 — Mặt phẳng điều khiển Autopilot: official-first

| | |
|---|---|
| **Trạng thái** | ĐỀ XUẤT — chờ review độc lập theo cổng §14 của [#309](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/309) |
| **Ngày** | 15/09/2026 |
| **`main` lúc quyết định** | `de30a0825572684ce2c524058f94a4bd79e07668` |
| **Bằng chứng đầy đủ** | [autopilot-v2-official-first.md](../phat-trien/van-hanh/autopilot-v2-official-first.md) |
| **Thay thế** | `KEEP_CUSTOM` của #194 / PR #199 (05/09/2026) |
| **Bản ghim gh-aw** | `v0.88.7` / `bde367913adeb3132f0a171594c88a17f4b7d08c` — **re-audit 15/09/2026**, vẫn là bản stable mới nhất |
| **Sửa sau review độc lập lần 1** | 4 mục: repin re-audit · Codex reviewer hạ xuống NOT PROVEN · mô tả `GITHUB_TOKEN` + CI · tách cổng merge khỏi cổng deploy |

---

## Quyết định

```text
DECISION = ADOPT_GITHUB_NATIVE_GH_AW
```

- **Trạng thái nghiệp vụ** = trạng thái GitHub gốc: Issue · nhãn · PR · check-run · review state ·
  ruleset · Environment. **Không còn giao thức tự viết.**
- **Mặt phẳng thực thi** = GitHub Agentic Workflows, ghim `v0.88.7` /
  `bde367913adeb3132f0a171594c88a17f4b7d08c` — **re-audit 15/09/2026: vẫn là bản stable mới nhất**
  (mọi tag cao hơn, tới `v0.89.15`, đều `prerelease: true`). Xem "Về bản ghim" bên dưới.
- **Builder ban đầu** = engine `copilot` (đổi engine = sửa một dòng).
- **Reviewer** = Codex qua App `chatgpt-codex-connector` (**đã cài sẵn trong repo này**), giữ tính
  chất Builder ≠ Reviewer mà không cần cầu nối trình duyệt. **Ở mức đọc độc lập, không phải mức
  review chính thức của GitHub** — xem "Codex reviewer: chưa chứng minh" bên dưới.
- **Cổng người cho rủi ro cao** = nhãn `risk:high`, và ở mức GitHub là **hai cổng KHÁC NHAU, không
  được gộp**: cổng **merge** (ruleset) và cổng **deploy** (Environment). Xem "Hai cổng người" bên
  dưới. `required_approving_review_count` vẫn là `0` và ADR này **không** đề xuất nâng nó.

Quyết định này **không** phải `BLOCKED_MANDATORY_GAP`: không có năng lực bắt buộc nào bị thiếu.

## Về bản ghim — re-audit 15/09/2026

Review độc lập yêu cầu repin lên bản stable hiện tại và nêu rằng upstream đã tới `v0.89.12`.
**Đo lại thì `v0.89.12` là một prerelease, không phải stable** — và `v0.88.7` vẫn đang là bản
stable mới nhất. Hai đường đo độc lập, cùng một câu trả lời:

```text
gh api repos/github/gh-aw/releases/latest
  -> tag=v0.88.7  prerelease=false  published=2026-09-08T15:34:49Z

gh api "repos/github/gh-aw/releases?per_page=40"
  -> v0.89.15 v0.89.13 v0.89.12 ... v0.88.8   deu prerelease=true
  -> v0.88.7                                  prerelease=false   <-- stable moi nhat
```

Nâng lên `v0.89.12` sẽ **mâu thuẫn với chính tiêu chí** mà ADR này dùng để bác `v0.88.4` ở #199:
`v0.88.4` bị loại **vì nó là prerelease**. Dùng cùng một cây thước thì `v0.89.12` cũng bị loại
bởi cùng một lý do. Nên quyết định repin là: **giữ `v0.88.7`, và ghi ngày đo vào chính bản ghim**
(`# gh-aw-audit:` trong pilot, và chú thích HTML cùng tên ở đầu ADR lẫn tài liệu bằng chứng) để
lần sau phân biệt được *"vẫn là bản stable mới nhất"* với *"không ai kiểm lại từ tháng trước"*.

Delta `v0.88.7...v0.89.15` là **180 commit**. Về **security**: **không advisory mới nào** kể từ
29/08/2026 — cả 10 advisory đã công bố đều có dải ảnh hưởng kết thúc **dưới** `v0.88.7`, đo lại
ngày 15/09 bằng `repos/github/gh-aw/security-advisories` (có đối chứng âm trên một repo khác để
chắc rằng "rỗng" là rỗng thật). Về **capability**: delta gồm bump firewall
(`gh-aw-firewall` v0.28.15→v0.28.16, `gh-aw-mcpg` v0.4.21), các vòng audit threat-spec hằng ngày,
`add-labels` siết giới hạn target, và **hai bản vá đường token GitHub App** (#59743, #60137 — giữ
quyền `contents` cho checkout do built-in job dựng). Không commit nào đổi một bất biến mà pilot
dựa vào (`staged`, strict permissions, chặn fork, `on.roles`).

**Ghi thẳng cái chưa đóng:** hai bản vá App-token ở trên nằm **sau** bản ta ghim. Chúng chỉ chạm
nhánh có checkout do built-in job dựng — pilot hiện không đi nhánh đó — nhưng đây là lý do phải
đo lại bản ghim **trước** bước activation, không phải sau.

## Codex reviewer: chưa chứng minh

Bản trước của ADR này xếp "người duyệt chính thức độc lập" là **đã chạy thật**, lấy 40 comment của
App `chatgpt-codex-connector` làm bằng. **Đó là bằng sai loại.** Đo lại 15/09/2026 trên 13 PR
(#310 #307 #306 #305 #302 #290 #263 #206 #199 #191 #155 #151 #136):
`GET /pulls/<n>/reviews` **không trả về một review event nào** của App đó. Đối chứng âm cho thấy
endpoint hoạt động bình thường — review của người (`COMMENTED`) vẫn hiện ở #305, #302, #290, #206.

Nên sự thật đo được là: **Codex đăng issue comment, chưa từng phát một GitHub Code Review nào trong
repo này.** Một issue comment không vào `/pulls/*/reviews`, không tính vào required-approvals, và
không phải thứ #309 §9 tình huống 5 hỏi. Tình huống đó nay là **NOT PROVEN**.

Điều này **không** đổi quyết định bác PR #206 (6.889 dòng cầu nối trình duyệt): App chính thức vẫn
đang chạy trong repo và vẫn rẻ hơn một extension. Nó đổi **mức** ta được phép tuyên bố — "người
đọc độc lập", không phải "người duyệt chính thức".

## Hai cổng người — merge và deploy là hai thứ khác nhau

Bản trước gộp chúng làm một khi viết *"cổng người là Environment"*. Tách ra:

| | Cổng **merge** | Cổng **deploy** |
|---|---|---|
| Chặn cái gì | PR vào `main` | Một **job** khai `environment:` |
| Ai cưỡng chế | Ruleset `main-protection` | GitHub Environment |
| Trạng thái đo 15/09 | `required_approving_review_count: 0` + 7 required check (`strict: true`) | `production`: required reviewer = chủ repo, `prevent_self_review: false` |
| Dùng ở đâu | mọi PR | job `deploy-silo` của `reusable-deploy-tenant.yml` |
| Tự duyệt được? | **không** — GitHub cấm tự duyệt PR của mình | **có** |

Hệ quả phải nói thẳng: **hôm nay repo này không có cổng người ở bước merge.** Cái đang có là cổng
người ở bước **deploy**. Environment không biết gì về PR; nó chỉ giữ một job lại.

Muốn Environment chặn được merge thì phải biến job có `environment:` thành **required status check
thứ 8** — việc đó đụng thẳng bất biến 7 của `tools/autopilot-v2-contract` (*đúng 7 check*), và có
một cái giá đã đo: chú thích đầu `.github/workflows/deploy-tenant.yml` ghi lại sự cố 17/08/2026,
một run đang **chờ duyệt** chiếm làn concurrency và chặn 26 phút một lần deploy hợp lệ. ADR này
**không** đề xuất làm vậy.

Nên trong pilot, `risk:high` dừng ở **hành vi của agent** (prompt bắt dừng, gắn `needs-human`) —
một cổng ở tầng prompt, không phải một cổng GitHub cưỡng chế. Cổng merge cưỡng chế được cho repo
một chủ vẫn là **NOT PROVEN**, và vẫn phụ thuộc ghế Copilot (§4.2 của tài liệu bằng chứng).

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
- **Rào CI của `GITHUB_TOKEN` — mô tả chính xác.** Nói *"không kích hoạt CI"* là chưa đúng. Đo trên
  chính repo này (PR #136, SHA `509b566`): GitHub **CÓ tạo** run `pull_request` cho SHA mới —
  run `33676122047`, workflow `ci` — nhưng nó dừng ở `conclusion=action_required` với **0 job**,
  `triggering_actor=github-actions[bot]`. Tức là **có bản ghi run, và nó không tự chạy**; hai trạng
  thái "không có run" và "có run nhưng 0 job" nhìn rất khác nhau lúc gỡ lỗi.
- **Lối thoát đã đo được một nửa.** Cùng repo, PR #151: commit `472b721` đẩy bằng installation
  token của App `nexagent-autopilot` → run `33717371535`: `triggering_actor=nexagent-autopilot[bot]`,
  `run_attempt=1`, **7/7 job chạy thật, `success`**, không ai bấm Approve. Ranh giới không nằm ở
  *"commit tự động"* mà ở **danh tính người đẩy**. gh-aw dùng đúng cơ chế đó qua
  `github-token-for-extra-empty-commit: app` — đã nối dây trong pilot, **chưa chạy end-to-end** vì
  chưa có credential engine.

## Điều kiện đảo ngược

Nếu đo end-to-end cho thấy `github-token-for-extra-empty-commit: app` **không** làm run của PR
thoát khỏi `action_required`, thì Builder lùi về phương án **C** (`claude-code-action`) — vẫn giữ
nguyên phần trạng thái gốc và kế hoạch xoá của ADR này. Đảo về tự viết thì không: mã đó đã có 395 lần
chạy và 0 lần ghi.

Vật liệu để đo đã có sẵn và **tên đã được kiểm lại bằng API**, không suy từ trí nhớ:
`vars.NEXAGENT_AUTOPILOT_CLIENT_ID` + `secrets.NEXAGENT_AUTOPILOT_PRIVATE_KEY` (chú ý:
`NEXAGENT`, **không** phải `NEXAGNET` — bản trước của tài liệu này viết sai một chữ, và sai một chữ
thì `secrets.*` ra chuỗi rỗng mà không có thông báo lỗi nào).

## Cổng chặn trước khi thực hiện

Theo #309 §14, **dừng ở đây** cho review độc lập. Chưa được: xoá mã Autopilot đã trên `main`, biên
dịch `.lock.yml`, bỏ `staged: true`, hay bật bất kỳ workflow tự trị nào.
