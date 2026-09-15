# Autopilot V2 — official-first: kiểm kê, đo lại nguồn chính thức, kiến trúc đích, kế hoạch xoá

> Ngày đo: **15/09/2026** · `main` lúc đo: `de30a0825572684ce2c524058f94a4bd79e07668`
> Hợp đồng task: [#309](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/309)
> Quyết định cuối: [adr-0001-autopilot-official-first.md](../../kien-truc/adr-0001-autopilot-official-first.md)
> Thay thế (superseded): `docs/phat-trien/van-hanh/autopilot-protocol-v0.md` · quyết định `KEEP_CUSTOM` của #194/PR #199

**Kết luận trước, lý do sau:**

```text
DECISION = ADOPT_GITHUB_NATIVE_GH_AW
```

Mặt phẳng điều khiển Autopilot tự viết bị **thay thế**, không được mở rộng. Trạng thái nghiệp vụ
chuyển sang **trạng thái GitHub gốc** (Issue · nhãn · PR · check · review · ruleset · Environment).
Mặt phẳng thực thi chuyển sang **GitHub Agentic Workflows** (`github/gh-aw`) ghim bản ổn định.

Nhưng kết luận đó **chưa chạy được hôm nay**, và §5 nói rõ vì sao: repo này không có một credential
nào mà gh-aw chấp nhận. Đó là một quyết định **mua**, không phải một khoảng trống năng lực. Vì vậy
PR này giao **cấu hình pilot ở trạng thái trơ (staged + chưa biên dịch)**, không bật gì cả, và dừng
đúng ở cổng §14 của hợp đồng.

---

## 1. Vì sao xét lại — bốn con số đo được, không phải cảm tính

Tech radar của chính repo này đã xếp **"Runtime cho coding agent"** vào ô **AVOID BUILDING** từ
27/08/2026 ([tech-radar §6](../../kien-truc/tech-radar.md)). Sau đó repo vẫn viết một runtime như
vậy. Bốn phép đo dưới đây là kết quả:

| Phép đo | Giá trị đo được 15/09/2026 | Cách đo |
|---|---|---|
| Dòng mã Autopilot tự viết **đã trên `main`** | **10.000** | `tools/autopilot-protocol` 4.900 · `tools/autopilot-orchestrator` 4.276 · workflow 239 · doc giao thức 585 |
| Dòng mã Autopilot tự viết **đang chờ trong PR mở** | **20.733** | #263 (7.187) · #206 (6.889) · #199 (2.829) · #191 (913) · 8 PoC PR (2.915) |
| Số lần orchestrator chạy thật trên `main` | **395** | `actions/workflows/autopilot-orchestrator.yml/runs` |
| Số lần orchestrator **ghi được** một thứ gì đó | **0** | biến repo `AUTOPILOT_DRY_RUN` = `true`; lần ghi thật duy nhất từng thử trả **403** (#188) |

395 lần chạy, 0 lần ghi. Đó không phải "chưa bật" — bản ghi thật đầu tiên đã thử và **hỏng**: run
`33889198070` nhận `403` khi `POST /issues/167/comments`, và PR sửa (#191) đã mở từ 04/09 và vẫn
chưa merge. README của chính `tools/autopilot-orchestrator` ghi rõ trong mục **NOT PROVEN**:

- `check_suite` **sẽ không bao giờ** kích hoạt trong repo này (GitHub không kích hoạt sự kiện đó cho
  check suite do Actions tạo, mà mọi check ở đây đều do Actions tạo);
- `issue_comment` chưa chạy thật;
- `pull_request` chỉ chứng minh được phần đọc;
- **đường ghi chưa từng chạy thật.**

Thêm một phép đo về gánh nặng vận hành mà không ai kể trong các PR đó: GitHub Actions của repo đang
đăng ký **13 workflow có tiền tố `autopilot-*`/`claude-max-*`**, nhưng chỉ **1** tồn tại trên `main`.
12 cái còn lại là định nghĩa mồ côi đến từ các nhánh PoC chưa merge, mỗi cái đã chạy 1–5 lần rồi bị
bỏ. Đó là bề mặt Actions mà không tài liệu nào của repo mô tả.

> Ghi chú về sunk cost, theo đúng §Owner directive của #309: 30.733 dòng đã viết **không** là lý do
> giữ. Chúng là lý do dừng.

---

## 2. Kiểm kê bắt buộc — mọi cấu phần Autopilot tự viết

Bảng đầy đủ theo khuôn của hợp đồng #309 §1. `LOC` là dòng tệp thật (không tính `node_modules`).

### 2.1 Đã trên `main`

| COMPONENT | `tools/autopilot-protocol/**` |
|---|---|
| CURRENT PURPOSE | Giao thức `AUTOPILOT_TASK_V0`: 9 thông điệp có marker, máy trạng thái, sổ principal, khoá idempotency, validator tất định |
| CUSTOM LOC | **4.900** (validator 1.842 · schema 435 · test 2.499 · còn lại config/README) |
| OFFICIAL REPLACEMENT | Issue + nhãn (`agent:ready`, `risk:*`) + trạng thái PR + check-run + review state + ruleset. Kênh máy đọc = **nhãn**, không phải JSON trong thân Issue |
| FEATURE PARITY | Đủ. Mọi trạng thái V0 đều có ánh xạ gốc (§7.2). Thứ duy nhất mất là *thứ tự thông điệp tự áp đặt* — thứ mà GitHub vốn không cần |
| SECURITY / ISOLATION | Thấp hơn bản gốc: quyền suy ra từ `performed_via_github_app` do chính ta viết; GitHub cưỡng chế bằng token thật |
| RELIABILITY | Máy trạng thái chưa từng vận hành một lượt đầy đủ nào |
| COST / AUTH | 0đ nhưng gánh bảo trì thuộc về một người |
| MIGRATION COST | Thấp — `git grep` cho thấy **không một tệp nào** ngoài `docs/README.md`, `docs/phat-trien/README.md`, `pnpm-lock.yaml` tham chiếu tới nó |
| **DECISION** | **DELETE** |

| COMPONENT | `tools/autopilot-orchestrator/**` + `.github/workflows/autopilot-orchestrator.yml` |
|---|---|
| CURRENT PURPOSE | Chạy giao thức trên sự kiện GitHub thật: đăng comment kết quả + đổi nhãn |
| CUSTOM LOC | **4.515** (src 1.817 · test 2.224 · workflow 239 · fixtures/README) |
| OFFICIAL REPLACEMENT | gh-aw Safe Outputs (`add-comment`, `add-labels`, `add-reviewer`) + threat detection + job quyền tối thiểu do trình biên dịch sinh |
| FEATURE PARITY | gh-aw **vượt**: 63 loại safe output, khoá quyền lúc biên dịch, sandbox mạng, phát hiện prompt injection. Thiếu đúng một thứ ta có: khoá idempotency khi đăng comment (§3.3) |
| SECURITY / ISOLATION | Ta: ranh giới bằng review YAML + test hợp đồng tĩnh. gh-aw: **strict mode từ chối biên dịch** khi job agent xin `contents/issues/pull-requests: write` |
| RELIABILITY | 395 run / 0 ghi / 1 lần 403 |
| COST / AUTH | 0đ credential, nhưng đốt Actions minutes trên **mọi** comment của repo |
| MIGRATION COST | Thấp (như trên) |
| **DECISION** | **DELETE** |

| COMPONENT | `docs/phat-trien/van-hanh/autopilot-protocol-v0.md` |
|---|---|
| CURRENT PURPOSE | Bản người đọc của giao thức V0 |
| CUSTOM LOC | **585** |
| OFFICIAL REPLACEMENT | Tài liệu này + `AGENTS.md` + Issue Form |
| **DECISION** | **DELETE** (giữ trong git history; thêm dòng superseded ở `docs/README.md`) |

### 2.2 Đang mở, chưa vào `main`

| # | Thứ | LOC | Thay bằng | DECISION |
|---|---|---|---|---|
| #256 / PR **#263** | Local Claude Dispatcher — daemon Windows, worktree manager, process lock, ledger cục bộ, Task Scheduler | **7.187** | gh-aw job trên runner GitHub (§4D của #309 xếp dispatcher là *last resort*) | **CLOSE, KHÔNG MERGE** |
| #204 / PR **#206** | Conversation Bridge — extension trình duyệt + Native Messaging host để đánh thức một cuộc chat ChatGPT | **6.889** | **App `chatgpt-codex-connector` đã cài sẵn trong repo này** và đã đăng **40 comment** từ 01/09/2026. Đường chính thức đang chạy rồi (§4.3) | **CLOSE, KHÔNG MERGE** |
| #194 / PR **#199** | Spike gh-aw kết luận `KEEP_CUSTOM` | 2.829 | Bị bác bởi §3 tài liệu này | **CLOSE — SUPERSEDED** |
| #188 / PR **#191** | Sửa quyền ghi của orchestrator sau 403 | 913 | Không còn đối tượng: orchestrator bị xoá | **CLOSE — OBSOLETE** |
| #217 | Sửa ngữ nghĩa handoff BUILD_READY/REVIEW_REQUEST | — | Không còn đối tượng: không còn thông điệp giao thức | **CLOSE — OBSOLETE** |
| #166 | Thêm trường `reviewer` cho REVIEW_PASS/REVIEW_BLOCK | — | Không còn đối tượng | **CLOSE — OBSOLETE** |
| #165 | Hợp đồng Orchestrator V0 | — | Không còn đối tượng | **CLOSE — SUPERSEDED** |
| #156 | PoC đánh giá `chatgpt-bridge` trên Windows | — | Không còn đối tượng (#206 bị đóng) | **CLOSE — OBSOLETE** |
| PR #134 · #136 · #137 · #138 · #141 · #142 · #143 · #151 | 8 PoC workflow Autopilot (OAuth smoke, builder, fixer, review-gate, policy, state, runtime, trusted push) | **2.915** | Pilot §9 thay cả 8 bằng **một** workflow | **CLOSE, KHÔNG MERGE** — và **huỷ đăng ký 12 workflow mồ côi** |

Không có `KEEP_CUSTOM` nào trong bảng. Không cấu phần nào nêu được một năng lực bắt buộc mà tầng
chính thức hiện tại thiếu.

---

## 3. Đo lại gh-aw — quyết định `KEEP_CUSTOM` của #194 bị bác

### 3.1 Bản được audit lần trước không phải bản ổn định

| | #194/PR #199 (05/09/2026) | Đo lại 15/09/2026 |
|---|---|---|
| Tag | `v0.88.4` | **`v0.88.7`** |
| SHA | `82239c030d6a1ef6ec8b87a80a1346eeef211f8d` | **`bde367913adeb3132f0a171594c88a17f4b7d08c`** |
| Loại | **prerelease** (`prerelease: true`) | **stable**, phát hành 08/09/2026 |
| Khoảng cách | — | v0.88.4 đứng sau stable **109 commit** |

Nhịp phát hành: prerelease **nhiều bản/ngày** (khoảng cách 10 bản gần nhất: 3–17 giờ); stable
**2–6 ngày/bản**. Con số "~17 bản/30 ngày" mà #199 dùng làm lý do không tái sử dụng đã trộn hai
nhịp đó làm một.

### 3.2 Bốn bằng chứng của #199 trả lời một câu hỏi KHÁC

#199 hỏi: *"có nên nhúng mã gh-aw vào orchestrator của ta không?"* — đường HYBRID. #309 hỏi:
*"có nên thay orchestrator của ta bằng gh-aw không?"* — đường ADOPT. Ba trong bốn bằng chứng chỉ
có nghĩa cho câu hỏi thứ nhất:

| Bằng chứng #199 | Còn đúng? | Có chặn ADOPT không? |
|---|---|---|
| Safe Outputs không chạy được nếu thiếu job `agent` | Đúng | **Không** — ADOPT thì luôn có job `agent`. Đây là mô tả kiến trúc gh-aw, không phải khiếm khuyết |
| Không xuất bản npm ⇒ phải vendor mã | Đúng | **Không** — ADOPT dùng CLI `gh aw compile` + lock file đã ghim, không dùng mức thư viện |
| `validateItem()` fail-open khi thiếu `GH_AW_VALIDATION_CONFIG` | Không kiểm lại ở v0.88.7 | **Không** — chỉ có nghĩa khi chạy `.cjs` đứng một mình ngoài workflow |
| Claude Max OAuth không được hỗ trợ | **VẪN ĐÚNG** — xem §5 | **Có, một phần** — nhưng là ràng buộc *credential*, không phải năng lực |

### 3.3 Điểm gh-aw v0.88.7 thật sự mạnh hơn mặt phẳng tự viết

Đo tại `bde3679`, nguồn: tài liệu ghim SHA + mã Go + một `.lock.yml` đã biên dịch thật.

| Bất biến | Cách ta cưỡng chế | Cách gh-aw cưỡng chế |
|---|---|---|
| Job agent không được ghi | Test hợp đồng tĩnh đọc khối `permissions:` | **Từ chối biên dịch** (`validateStrictPermissions`, strict mode mặc định `true`) |
| Chạy khô | Biến repo `AUTOPILOT_DRY_RUN` mà mã có thể bỏ qua | `safe-outputs.staged: true` — job ghi vẫn chạy nhưng **bỏ qua mọi lời gọi ghi**; cộng `gh aw trial` chạy vào repo private tạm |
| Chặn PR từ fork | Không có | **Mặc định chặn** — chèn điều kiện `head.repo.id == github.repository_id` lúc biên dịch |
| Ai được kích hoạt | Sổ principal tự viết đọc từ biến môi trường | `on.roles:` mặc định `[admin, maintainer, write]`; `tools.github.min-integrity` mặc định `approved` cho repo public |
| Chống prompt injection | Không có | Prompt XPIA chèn mặc định; tháo nó là **lỗi biên dịch** trong strict mode |
| Phát hiện rò rỉ bí mật / patch độc | Không có | Job `detection` riêng giữa agent và job ghi; bất kỳ `true` nào ⇒ chặn toàn bộ safe output. Fail-secure |
| Kiểm soát egress mạng | Không có | `network:` + Agent Workflow Firewall (Squid + iptables), mặc định allowlist hạ tầng |
| Ghim nguồn cung ứng | Ghim tay trong YAML | Action ghim **SHA**, image ghim **digest**, ghi vào `.lock.yml` commit được |

Và **một** chỗ ta vẫn nghiêm hơn, phải nói ra: gh-aw `add-comment` không có khoá idempotency —
`add_comment.cjs` gọi `createComment` vô điều kiện. Ta có. Nhưng bất biến đó chỉ cần thiết **vì** ta
đăng thông điệp giao thức làm sổ ledger; khi trạng thái nằm ở nhãn và trạng thái PR thì một comment
trùng là **nhiễu hiển thị**, không phải lỗi trạng thái. Đây đúng là trường hợp §2 của #309 cảnh báo:
đừng tái tạo nội tạng gh-aw chỉ để giành lại một bất biến cũ không còn cần.

### 3.4 Advisory và độ chín

10 advisory đã công bố cho `github/gh-aw` (4 critical, 4 high, 2 medium). **Cả 10 nằm trong cửa sổ
5 tuần 06/08 → 29/08/2026**, và mọi dải bị ảnh hưởng đều kết thúc **dưới** v0.88.7 — bản ta ghim nằm
ngoài cả 10. Đó là dấu vết của một đợt audit tập trung lên một codebase trẻ, không phải 10 sự cố
hiện trường độc lập. Kèm theo là các đợt vá có tên: v0.84.x (argument injection CWE-88), v0.86.0
(redaction bí mật), v0.87.0 (mở rộng chống confused-deputy sang `pull_request_target`), v0.88.7
(giới hạn đóng gói artifact của agent).

Trạng thái: **public preview** theo docs.github.com. README upstream đã bỏ hẳn chữ "preview" và thay
bằng *"at your own risk"*. §11 nói cách hạ rủi ro preview.

### 3.5 Về câu "GitHub khuyên dùng gh-aw hơn claude-code-action"

Phải nói chính xác, vì #309 §2 yêu cầu dùng nó làm **đầu vào quyết định, không phải thẩm quyền mù**:

- **Có** một câu như vậy — nhưng nó nằm trong **tài liệu của chính kho gh-aw** (`engines/claude.md`),
  nói `anthropics/claude-code-action` *"not recommended for use in GitHub Actions if GitHub Agentic
  Workflows are available"*.
- **docs.github.com KHÔNG có câu so sánh nào.** Trang khái niệm và tutorial mô tả mô hình bảo mật
  của agentic workflows một cách tích cực nhưng không nhắc, không chê bất kỳ giải pháp thay thế nào.

Tức: một kho do GitHub sở hữu khuyên như vậy; **tài liệu sản phẩm chính thức của GitHub thì không**.
Tín hiệu yếu hơn cách #309 mô tả, và tài liệu này ghi đúng như đo được.

---

## 4. Năng lực chính thức khác — đo tại 15/09/2026

### 4.1 Copilot cloud agent (giao Issue cho agent)

GA. Kích hoạt bằng cách gán Issue cho `Copilot`, hoặc `@copilot` trên PR. Ba tính chất đáng giá cho
ta: **chỉ người có quyền write mới kích hoạt được** (*"Comments from users without write access are
never presented to the agent"*); agent **không thể** approve hay merge PR của chính nó; workflow trên
PR của nó **không chạy** cho tới khi một người có quyền write bấm *Approve and run workflows*. Đọc
chỉ dẫn từ `AGENTS.md`/`CLAUDE.md`. Tường lửa bật mặc định — nhưng **chỉ áp cho tiến trình agent khởi
động qua Bash tool**, không áp cho tiến trình MCP.

Một cảnh báo phải ghi: nếu ruleset không tương thích, GitHub **chặn** agent, và cách gỡ mà tài liệu
đưa ra là thêm Copilot làm **bypass actor** — tức mở lại đúng cái lỗ mà `bypass_actors: []` đang bịt.
Không được làm điều đó ở repo này.

### 4.2 Copilot code review — con đường DUY NHẤT xác minh được cho "người duyệt thứ hai"

Đây là điểm quyết định cho một repo một chủ. `required_approving_review_count` của repo đang là `0`
**vì GitHub cấm tự duyệt PR của mình** (*"Pull request authors cannot approve their own pull
requests"*), và repo chỉ có một người.

Từ 01/09/2026, Copilot code review **có thể approve và lần approve đó tính vào required-approvals**
— bật ở Settings → Copilot → Code review → Auto-approval, có thêm giới hạn theo glob (tối đa 15).
Approval bị gỡ khi có commit mới, y như approval của người. **Public preview, mặc định tắt.**

Cảnh báo về tài liệu mâu thuẫn: trang `approving-a-pull-request-with-required-reviews` vẫn viết
approval của Copilot *không* tính — câu đó mô tả trạng thái mặc định (tắt) và chưa cập nhật cho tính
năng 09/2026. Dùng trang Copilot code review + changelog làm chuẩn.

**Approval của một GitHub App bất kỳ (không phải Copilot): KHÔNG XÁC MINH ĐƯỢC.** GitHub chỉ tài
liệu hoá trường hợp Copilot. Không được thiết kế dựa trên giả định này.

### 4.3 OpenAI Codex — và một sự thật làm #206 mất đối tượng

Codex code review là tích hợp chính thức qua GitHub App **`chatgpt-codex-connector`**, bật ở
`chatgpt.com/codex/settings/code-review`, kích hoạt bằng `@codex review`, lái bằng mục
`## Code Review Rules` trong `AGENTS.md`. Trên GitHub nó chỉ nêu vấn đề **P0/P1**.

**App đó đã được cài vào chính repo này.** Đo được: `chatgpt-codex-connector` đã tạo **40 comment**
trong `nexagnet-platform` kể từ 01/09/2026, trong đó 3 comment trên PR #155 chính là các verdict
`REVIEW_BLOCK`/`REVIEW_PASS` mà giao thức V0 bọc lại bằng marker tự chế.

Nghĩa là: PR #206 định xây 6.889 dòng extension trình duyệt + Native Messaging host **để đánh thức
một cuộc hội thoại ChatGPT làm đúng việc mà một GitHub App chính thức đã và đang làm trong repo
này.** Đó không phải một khoảng trống được lấp — đó là một đường song song.

Hai điều chưa xác minh được và phải ghi là rủi ro: (a) tài liệu OpenAI **không nói ai được phép**
kích hoạt một review trên repo public — không có phát biểu nào về fork hay người ngoài; (b) không
tài liệu nào nói review của Codex có tính vào required-approvals hay không. Đo thực tế ở repo này:
`GET /pulls/155/reviews` trả **rỗng** — Codex đăng **issue comment**, không phát một review event.
Nên hôm nay nó **không** thoả được cổng approval.

### 4.4 Cổng gốc của GitHub

| Cổng | Trạng thái đo được ở repo này |
|---|---|
| Ruleset `main-protection` | `enforcement: active`, `bypass_actors: []`, 4 rule: `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks` |
| Required checks | **7**, `strict: true`: `verify` `integration` `workflow-integration` `tenant-packs` `e2e` `audit` `images` |
| Required approvals | **0** (xem §4.2), `dismiss_stale_reviews_on_push: true`, `required_review_thread_resolution: true`, `require_extra_approval_for_unattributed_changes: true` |
| Auto-merge | **tắt** ở mức repo (`allow_auto_merge: false`) |
| Merge queue | **KHÔNG DÙNG ĐƯỢC** — GitHub yêu cầu repo thuộc **organization**; repo này thuộc user |
| Environment + required reviewers | **Dùng được, kể cả gói Free, vì repo public.** Tới 6 người/team; **cho phép tự duyệt trừ khi bật `Prevent self-review`** |
| Issue Forms | Dùng được — nhưng chỉ cho **schema nộp**, không cho **schema dữ liệu**: câu trả lời bị chuyển thành markdown trong thân Issue, workflow vẫn phải tự parse |

Hai dòng cuối là bản lề của kiến trúc đích: **Environment là cổng người duy nhất hoạt động được cho
một repo một chủ**, và **nhãn — không phải thân Issue — là kênh máy đọc**.

---

## 5. Ràng buộc đo được của CHÍNH repo này — phần quyết định

Đây là mục mà một bản audit chỉ đọc tài liệu upstream sẽ bỏ sót.

| Điều kiện | Đo được 15/09/2026 | Cách đo |
|---|---|---|
| Secret của repo | Chỉ **`CLAUDE_CODE_OAUTH_TOKEN`** và `NEXAGNET_AUTOPILOT_PRIVATE_KEY` | `actions/secrets` |
| `ANTHROPIC_API_KEY` | **không có** | như trên |
| `OPENAI_API_KEY` / `CODEX_API_KEY` | **không có** | như trên |
| Ghế Copilot | **không có** — `Copilot` **không xuất hiện** trong `suggestedActors(CAN_BE_ASSIGNED)`, chỉ có chủ repo | GraphQL |
| Repo | **public**, chủ sở hữu là **user**, một người | REST |

Đối chiếu với bảng auth của gh-aw v0.88.7:

| Engine gh-aw | Cần gì | Repo này có? |
|---|---|---|
| `copilot` (mặc định) | `copilot-requests: write` + quyền Copilot của org/ghế, hoặc `COPILOT_GITHUB_TOKEN` (PAT fine-grained; token `gho_` bị từ chối) | **KHÔNG** |
| `claude` | `ANTHROPIC_API_KEY` hoặc Anthropic WIF. **`CLAUDE_CODE_OAUTH_TOKEN` bị bỏ qua có chủ đích** — xác nhận ở 3 nơi trong tài liệu ghim SHA | **KHÔNG** |
| `codex` | `CODEX_API_KEY` → `OPENAI_API_KEY`; không nhận auth kiểu subscription ChatGPT | **KHÔNG** |
| `gemini` | `GEMINI_API_KEY` hoặc Google WIF | **KHÔNG** |

**Kết luận thẳng: gh-aw không chạy được ở repo này hôm nay mà không mua thêm đúng một credential.**

Điều đó **không** phải `BLOCKED_MANDATORY_GAP`. §12 của #309 định nghĩa `BLOCKED_MANDATORY_GAP` là
một **năng lực bắt buộc bị thiếu**. Ở đây năng lực có đủ; thiếu là một khoản chi. Ba lựa chọn, đều
rẻ hơn nhiều so với bảo trì 10.000 dòng:

| Lựa chọn | Chi phí | Được thêm gì |
|---|---|---|
| **Ghế Copilot Pro** | ~$10/tháng | engine `copilot` (không cần secret nhà cung cấp) **+ mở khoá §4.2** — con đường người-duyệt-thứ-hai duy nhất xác minh được **+** Copilot cloud agent làm đường lui |
| `ANTHROPIC_API_KEY` | theo token | engine `claude`; **không** mở khoá §4.2; tách khỏi gói Max đang trả |
| `OPENAI_API_KEY` | theo token | engine `codex`; **không** mở khoá §4.2 |

Khuyến nghị: **ghế Copilot Pro**, vì nó là thứ duy nhất trả về *hai* thứ cùng lúc — một engine Builder
và cổng approval. Nhưng đây là quyết định của chủ repo, không phải của PR này.

Trong khi chưa mua: `anthropics/claude-code-action` là **đường duy nhất chạy được ngay** vì nó nhận
`CLAUDE_CODE_OAUTH_TOKEN` sẵn có. §7.4 xếp nó là **đường lui tạm**, không phải kiến trúc đích, và
kèm advisory phải biết: **GHSA-8q5r-mmjf-575q / CVE-2026-47751** (vá ở 1.0.74) — checkout PR head
rồi đọc `.mcp.json` từ thư mục làm việc dẫn tới thực thi mã tuỳ ý trên runner. Bản vá khôi phục
`.mcp.json`/`CLAUDE.md`/`.claude/` **từ nhánh base**. Lưu ý ngược đời: khuyến nghị của Anthropic là
**không** ghim SHA cho action này, vì người ghim SHA là người **không** nhận được bản vá.

---

## 6. Ma trận thay thế

| Việc | Cách tự viết hôm nay | Thay bằng (chính thức) | Ai cưỡng chế |
|---|---|---|---|
| Khai báo một task | JSON `AUTOPILOT_TASK_V0` trong thân Issue + validator ajv | **Issue Form** + nhãn | Con người điền, GitHub gắn nhãn |
| Trạng thái task | `STATES` + `nextState()` fail-closed | Nhãn `agent:ready` → `agent:done` + trạng thái PR (open/merged) | GitHub |
| "Ai được làm gì" | `principal.mjs` đọc `performed_via_github_app`, sổ từ biến môi trường | `on.roles:` (mặc định admin/maintainer/write) + `min-integrity: approved` + quyền cộng tác viên | gh-aw lúc kích hoạt + GitHub |
| Buộc bằng chứng vào đúng HEAD | `gates.mjs` exact-SHA + `head_sha` của check-run | Required status checks + **`strict: true`** (nhánh phải up-to-date) | Ruleset |
| Chống trùng | `idempotency.mjs` + quét luồng comment | Trạng thái nhãn (idempotent theo bản chất) + `concurrency` của gh-aw | GitHub |
| Đăng kết quả | `mutations.mjs` + `main.mjs` (0 lần ghi thành công) | Safe Outputs `add-comment` / `add-labels` / `add-reviewer` | gh-aw job ghi, quyền tối thiểu |
| Chặn mã nguồn PR cầm quyền ghi | Tách 2 đường trong YAML + test hợp đồng | Job agent bị **từ chối biên dịch** nếu xin write; fork bị chặn mặc định | Trình biên dịch gh-aw |
| Đánh thức người duyệt độc lập | PR #206: extension + native host | `@codex review` (App đã cài) hoặc `add-reviewer` | GitHub App chính thức |
| Thực thi mã | PR #263: daemon Windows + worktree + process lock | Job gh-aw trên runner GitHub, sandbox + firewall | GitHub Actions |
| Cổng rủi ro cao | `human_gate` trong JSON hợp đồng | Nhãn `risk:high` **+ Environment có required reviewer** ở workflow deploy | GitHub Environment |
| Chạy khô | Biến repo `AUTOPILOT_DRY_RUN` | `safe-outputs.staged: true` + `gh aw trial` | gh-aw |

---

## 7. Kiến trúc đích

### 7.1 Sơ đồ

```text
CHỦ REPO (hoặc ChatGPT Architect soạn giúp)
        |
        v
GitHub Issue qua Issue Form  ──►  nhãn: agent:ready · risk:low|medium|high
        |                          (nhãn = kênh máy đọc; thân Issue = văn xuôi cho agent)
        v
GitHub Agentic Workflow (ghim v0.88.7 / bde3679)
  on.label_command: agent:ready        ← chỉ nhãn mới kích hoạt, không phải văn bản public
  on.roles: [admin, maintainer]        ← người ngoài không kích hoạt được
  permissions: đọc                     ← strict mode TỪ CHỐI BIÊN DỊCH nếu xin write
  sandbox + network allowlist
  safe-outputs.threat-detection
        |
        v
Builder engine  (copilot | claude | codex — đổi bằng MỘT dòng `engine:`)
        |
        v
Safe Output: create-pull-request  (draft, không tự override được)
        |
        v
CI hiện có — 7 required check, strict, ruleset `main-protection`
        |
        v
Người duyệt độc lập  ≠  Builder
  @codex review (App đã cài)  ·  hoặc Copilot code review khi có ghế
        |
        +── phát hiện → lặp lại trên PR bằng push-to-pull-request-branch
        |
        v
Chính sách merge
  low/medium : người bấm merge sau khi 7 check xanh (auto-merge đang TẮT)
  HIGH       : nhãn risk:high — workflow từ chối hành động, đưa về người
        |
        v
Deploy bằng workflow hiện có
  + GitHub Environment có required reviewer cho rủi ro cao / prod
```

### 7.2 Ánh xạ trạng thái: V0 → gốc

| Trạng thái/thông điệp V0 | Trạng thái GitHub gốc |
|---|---|
| `TASK_READY` | Issue mở + nhãn `agent:ready` |
| `BUILD_STARTED` | Workflow run tồn tại (nhãn `agent:ready` bị gỡ tự động khi `label_command` bắn) |
| `BUILD_READY` | PR mở, HEAD tồn tại |
| `CI_FAIL` / CI xanh | Check-run trên đúng HEAD — required checks + `strict: true` |
| `REVIEW_REQUEST` | Reviewer được gán (`add-reviewer`) hoặc comment `@codex review` |
| `REVIEW_PASS` / `REVIEW_BLOCK` | Review state của GitHub, hoặc comment của reviewer |
| `RUNTIME_PROOF` | Deployment status + Environment |
| `TASK_DONE` | PR merged + Issue closed |
| `human_gate: true` | Nhãn `risk:high` + Environment required reviewer |
| Sổ principal | `on.roles:` + quyền cộng tác viên |
| Khoá idempotency | Nhãn (idempotent) + `concurrency` |

**Không còn gói runtime TypeScript nào.** Bề mặt tự viết còn lại đúng bốn thứ: một Issue Form, một
workflow Markdown, phần `## Code Review Rules` trong `AGENTS.md`, và một gói test khoá **cấu hình của
chính ta** (§9.2).

### 7.3 Vì sao cổng rủi ro cao là Environment, không phải required-approvals

Vì `required_approving_review_count` không nâng được một cách có ích ở repo một chủ: GitHub cấm tự
duyệt, và không có người thứ hai. Nâng nó lên `1` sẽ **khoá cứng mọi PR**, kể cả PR tay.

Environment thì khác: nó **cho phép tự duyệt** trừ khi bật `Prevent self-review`. Nên nó là cổng
người duy nhất mà một người có thể vừa đặt vừa đi qua — và nó vẫn là một hành động **tường minh, có
ghi lại**, chứ không phải im lặng trôi qua. Khi có ghế Copilot thì §4.2 mở thêm đường
required-approvals thật; tài liệu này không giả định điều đó.

### 7.4 Đường lui tạm nếu chưa mua credential

`anthropics/claude-code-action` với `CLAUDE_CODE_OAUTH_TOKEN` sẵn có. **Không** phải kiến trúc đích
(§4C của #309: chỉ dùng nếu vượt trội A/B cho một năng lực bắt buộc — ở đây nó chỉ vượt về
*credential đã có*, và đó là điều kiện tạm). Nếu dùng: ghim `@v1` **không ghim SHA** (§5), không bao
giờ checkout ref của PR vào thư mục gốc, giữ `allowed_bots` rỗng, không dùng `allowed_non_write_users`.

---

## 8. Quyết định engine — cấu hình, không phải khoá kiến trúc

Workflow pilot đặt `engine:` ở **một dòng**. Đổi Builder = sửa một dòng + `gh aw compile`. Không viết
adapter, không viết lớp trừu tượng — gh-aw đã có.

| | Copilot | Claude | Codex |
|---|---|---|---|
| Secret nhà cung cấp | **không cần** (`copilot-requests: write`) | `ANTHROPIC_API_KEY` | `CODEX_API_KEY`/`OPENAI_API_KEY` |
| Tính tiền | AI Credits (1 AIC = $0,01) + Actions minutes | tài khoản Anthropic | tài khoản OpenAI |
| Actions minutes trên repo public | **miễn phí** | miễn phí | miễn phí |
| Repo này dùng được ngay? | không (chưa có ghế) | không (chỉ có OAuth, bị bỏ qua) | không (chưa có key) |
| Lợi ích kèm theo | mở khoá cổng approval §4.2 + Copilot cloud agent | — | — |

**Builder chọn ban đầu: `copilot`.** Reviewer: **Codex** (App đã cài, 0đ thêm). Thoả tính chất
`Builder model != Reviewer model` của #309 §5 mà **không** cần cầu nối trình duyệt nào.

Chốt chặn chi phí đã có sẵn trong gh-aw, dùng luôn: `max-ai-credits` (mặc định 1000/lần chạy),
`max-turns` (500, do firewall cưỡng chế nên áp cho mọi engine), `timeout-minutes` (20 bước / 60 job).

---

## 9. Pilot tối thiểu

### 9.1 Trạng thái giao trong PR này: **TRƠ**

Workflow pilot ở [`.github/workflows/agent-builder.md`](../../../.github/workflows/agent-builder.md)
được giao **không kèm `.lock.yml`**. GitHub Actions chỉ chạy `.lock.yml`; một tệp `.md` trong
`.github/workflows/` **không phải** workflow và không chạy được. Cộng thêm `safe-outputs.staged: true`
trong frontmatter, nên kể cả sau khi ai đó biên dịch, nó vẫn **không ghi gì**.

Hai lớp đó là cách PR này tuân thủ cổng §14: *"STOP trước khi bật một workflow tự trị chạy thật"*.
Bật thật cần đúng ba bước, và cả ba đều là hành động tường minh của người:

1. thêm credential của engine đã chọn;
2. `gh aw compile` rồi commit `.lock.yml` (bước này nạp SHA-pin cho action và digest-pin cho image);
3. bỏ `staged: true`.

### 9.2 Bài kiểm — chỉ khoá cấu hình CỦA TA

Gói [`tools/autopilot-v2-contract/`](../../../tools/autopilot-v2-contract/) chạy trong `pnpm -r test`,
tức trong required check `verify`. Nó **không** kiểm cài đặt của GitHub/Anthropic/OpenAI. Nó khoá
chín bất biến của chính repo này:

| # | Bất biến được khoá | Hỏng thì sao |
|---|---|---|
| 1 | Pilot khai `safe-outputs.staged: true` | Một lần sửa vô ý biến pilot thành thứ ghi thật |
| 2 | Pilot **chưa** có `.lock.yml` đi kèm | Bật workflow tự trị mà không qua cổng §14 |
| 3 | Pilot ghim **tag + SHA 40 ký tự** của gh-aw qua khối `# gh-aw-pin:` / `# gh-aw-sha:` — quy ước của repo này, không phải trường của gh-aw | Trôi theo bản preview |
| 4 | Job agent **không** khai `contents/issues/pull-requests: write` | Trao quyền ghi cho đúng chỗ #309 §4A cấm |
| 5 | Trigger là `label_command`, và `on.roles` không chứa `write` | Repo public: người lạ có quyền write kích hoạt được |
| 6 | *(tự bật khi có lock)* mọi `uses:` trong `agent-builder.lock.yml` ghim SHA 40 ký tự | Ref trôi trong workflow được chọn dùng — vi phạm #309 §13 |
| 7 | `.github/rulesets/main-protection.json` giữ **đúng 7** required check và `bypass_actors: []` | Nới lỏng CI/ruleset |
| 8 | Issue Form khai đủ bộ nhãn rủi ro `risk:low\|medium\|high` | Mất kênh máy đọc |
| 9 | *(tự bật sau khi xoá)* không workflow nào còn nhắc `AUTOPILOT_TASK_V0` | Giao thức cũ sống lại lặng lẽ |

Bất biến 6 và 9 hôm nay ở dạng **skip có in lý do**, và cả hai **tự kích hoạt** khi điều kiện của
chúng tới — 6 khi `.lock.yml` được commit, 9 khi `tools/autopilot-protocol/` biến mất. Không ai phải
nhớ bật chúng, nên một lần skip không thể trôi thành một lần đạt.

Đã kiểm bằng **mutation**, không chỉ bằng "xanh": đổi `staged: true` → `false` làm bài 1 đỏ; đổi
`issues: read` → `write` làm bài 4 đỏ. Cả hai đột biến đã hoàn nguyên.

### 9.3 Bảy tình huống phải chứng minh — trạng thái hôm nay

Theo #309 §9. Không tô hồng:

| # | Tình huống | Hôm nay | Chứng bằng gì |
|---|---|---|---|
| 1 | Trigger tin cậy khởi động **đúng một** lần chạy | ⬜ chờ credential | `concurrency` của gh-aw + `label_command` tự gỡ nhãn |
| 2 | Trigger không tin cậy **không** tạo được lần chạy có quyền ghi | 🟡 chứng bằng cấu hình | fork bị chặn mặc định + `on.roles` + bất biến 4/5 |
| 3 | Agent sửa mã, Safe Output tạo **một** PR | ⬜ chờ credential | `create-pull-request`, `max: 1`, `draft` |
| 4 | **CI hiện có chạy trên PR đó** | 🔴 **có rào upstream** | xem cảnh báo dưới |
| 5 | Người duyệt chính thức độc lập duyệt PR | ✅ **đã chạy thật** | App `chatgpt-codex-connector`, 40 comment từ 01/09 |
| 6 | Một phát hiện quay lại agent để lặp một vòng | ⬜ chờ credential | `push-to-pull-request-branch` |
| 7 | Nhãn/đường rủi ro cao **dừng ở cổng người** | 🟡 chứng bằng cấu hình | `risk:high` + Environment required reviewer |

> 🔴 **Rào upstream phải biết trước, ở tình huống 4.** PR do safe output `create-pull-request` tạo ra
> **không kích hoạt CI**, vì GitHub cố tình không cho `GITHUB_TOKEN` tạo sự kiện workflow đệ quy.
> Đây là hành vi của GitHub, không phải lỗi gh-aw. gh-aw có lối thoát tên
> `github-token-for-extra-empty-commit` (một commit rỗng đẩy bằng token khác để đánh thức CI).
> Nghĩa là **tình huống 4 bắt buộc phải đo thật** trước khi tuyên bố pilot đạt — đây là rủi ro kỹ
> thuật lớn nhất còn lại của kiến trúc này, và nó được ghi ở đây chứ không giấu đến lúc chạy.
> Repo đã có `NEXAGNET_AUTOPILOT_PRIVATE_KEY` (GitHub App), nên nhiều khả năng đủ vật liệu để đóng —
> nhưng **chưa đo**, nên chưa được tính là đã đóng.

---

## 10. Kế hoạch xoá — thực hiện SAU cổng §14, không phải trong PR này

### 10.1 Đóng, không merge

`#256`/PR `#263` · `#204`/PR `#206` · `#188`/PR `#191` · `#194`/PR `#199` (đánh dấu lịch sử) ·
`#217` · `#166` · `#165` · `#156` · PR `#134` `#136` `#137` `#138` `#141` `#142` `#143` `#151`.

Mỗi lần đóng kèm một comment trỏ về ADR, để lý do đóng không nằm ngoài repo.

### 10.2 Xoá khỏi `main`

```text
tools/autopilot-protocol/**                              4.900 dòng
tools/autopilot-orchestrator/**                          4.276 dòng
.github/workflows/autopilot-orchestrator.yml               239 dòng
docs/phat-trien/van-hanh/autopilot-protocol-v0.md          585 dòng
```

Kèm dọn: biến repo `AUTOPILOT_DRY_RUN`, `AUTOPILOT_REVIEWER_APP_SLUG` (giá trị
`chatgpt-codex-connector` không mất — nó thành App duyệt thật, không còn là tham số của giao thức);
huỷ đăng ký **12 định nghĩa workflow mồ côi** sau khi đóng các PR PoC — 11 cái tên `autopilot-*`
cộng `claude-max-auth-smoke.yml`; đừng grep mỗi `autopilot-*` rồi tưởng thiếu một cái.

Blast radius đã đo: `git grep autopilot` ngoài hai gói chỉ chạm **`docs/README.md`**,
**`docs/phat-trien/README.md`**, **`pnpm-lock.yaml`**. Không một tệp nào trong `apps/`, `packages/`,
`deploy/`, `AGENTS.md`, `CLAUDE.md` hay `tong-quan.md`.

### 10.3 Giữ

CI nghiệp vụ hiện có · workflow deploy · ruleset `main-protection` · toàn bộ mã nghiệp vụ ·
`AGENTS.md`/`CLAUDE.md`.

### 10.4 Cân LOC

| | Dòng |
|---|---|
| Xoá khỏi `main` | **−10.000** |
| Không bao giờ vào `main` (đóng PR) | **−20.733** |
| Thêm bởi lần migration này | **+~1.400** (tài liệu này + ADR + Issue Form + 1 workflow Markdown + gói test hợp đồng) |
| **Ròng** | **≈ −29.300** |

Đạt mục tiêu "xoá nhiều hơn thêm" của #309 §10 với biên rất rộng. Phần "thêm" gần như toàn bộ là
**tài liệu và hợp đồng cấu hình**, không có gói runtime nào.

---

## 11. Hạ rủi ro preview

| Rủi ro | Cách hạ |
|---|---|
| gh-aw là public preview, minor hàng tuần | Ghim **tag + SHA** `v0.88.7` / `bde3679…`; commit `.lock.yml`; chỉ dùng built-in đã chín (`create-pull-request`, `add-comment`, `add-labels`, `add-reviewer`) |
| `.lock.yml` **không** ghim thân prompt (chỉ ghim frontmatter + nguồn cung ứng) | Bật `on.stale-check: "full"` để băm cả thân; và bất biến 3 của §9.2 khoá `source:` |
| gh-aw **không có** cờ kiểm lock cũ trong CI | Tự thêm một bước `gh aw compile && git diff --exit-code` khi bật thật (một bước, không phải một gói) |
| Copilot approve-để-tính-required là preview, mặc định tắt | Không thiết kế phụ thuộc nó. Cổng người chính là Environment (§7.3) |
| Copilot cloud agent có thể đòi thêm bypass actor | **Không** thêm bypass actor. Nếu ruleset chặn agent, dùng gh-aw thay vì nới ruleset |
| `@codex review` trên repo public: không rõ ai kích hoạt được | Chỉ dùng **thủ công** (`@codex review`), **không** bật Automatic reviews |
| Tầng AI không dùng được | Không ảnh hưởng gì — Issue/PR/CI/ruleset/deploy vẫn chạy nguyên vẹn. Kiến trúc này **không** đặt bất kỳ đường nghiệp vụ nào sau tầng AI |

Suy biến an toàn, nói thẳng: **không có** workflow deploy hay CI nào phụ thuộc pilot. Gỡ pilot =
xoá một tệp `.md`.

---

## 12. NOT PROVEN — nói thẳng

1. **Chưa có một lần chạy gh-aw nào trong repo này.** Không có credential engine nào (§5). Mọi khẳng
   định về gh-aw ở tài liệu này đến từ tài liệu + mã nguồn ghim SHA `bde3679`, không từ một run thật.
2. **Tình huống 4 (CI chạy trên PR do safe output tạo) chưa đo** — và có rào upstream đã biết (§9.3).
3. **Copilot code review approve-để-tính-required chưa thử ở repo này**, và tài liệu GitHub không nói
   rõ nút cấp-repo đó có mở cho repo **cá nhân** hay không.
4. **Review của Codex hôm nay không phải review event** — đo được: `GET /pulls/155/reviews` trả rỗng.
   Nó không thoả cổng approval; chỉ đóng vai người đọc độc lập.
5. **Chưa có người thứ hai đọc mã.** Repo một chủ. Đây chính là lý do cổng §14 tồn tại.
6. **`require_extra_approval_for_unattributed_changes: true`** đang bật trên ruleset và có thể tương
   tác với PR do agent tạo. Chưa đo.

---

## 13. Liên quan

- [adr-0001-autopilot-official-first.md](../../kien-truc/adr-0001-autopilot-official-first.md) — quyết định cuối
- [tech-radar.md](../../kien-truc/tech-radar.md) — §6 AVOID BUILDING
- [github-governance.md](github-governance.md) — trạng thái ruleset, `bypass_actors`, repo public
- [ci-cd.md](ci-cd.md) — 7 bất biến CI/CD, phải đọc trước khi sửa `.github/workflows/`
