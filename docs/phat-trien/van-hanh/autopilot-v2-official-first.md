<!-- gh-aw-pin: v0.88.7 -->
<!-- gh-aw-sha: bde367913adeb3132f0a171594c88a17f4b7d08c -->
<!-- gh-aw-audit: 2026-09-15 -->

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

### 3.1 Bản được audit lần trước không phải bản ổn định — và bản ghim đã được đo lại

| | #194/PR #199 (05/09/2026) | Bản ghim của ADR, **re-audit 15/09/2026** |
|---|---|---|
| Tag | `v0.88.4` | **`v0.88.7`** |
| SHA | `82239c030d6a1ef6ec8b87a80a1346eeef211f8d` | **`bde367913adeb3132f0a171594c88a17f4b7d08c`** |
| Loại | **prerelease** (`prerelease: true`) | **stable**, phát hành 08/09/2026 |
| Khoảng cách | — | v0.88.4 đứng sau stable **109 commit** |

Nhịp phát hành: prerelease **nhiều bản/ngày** (khoảng cách 10 bản gần nhất: 3–17 giờ); stable
**2–6 ngày/bản**. Con số "~17 bản/30 ngày" mà #199 dùng làm lý do không tái sử dụng đã trộn hai
nhịp đó làm một.

#### Re-audit 15/09/2026 — `v0.88.7` VẪN là bản stable mới nhất

Review độc lập lần 1 yêu cầu repin lên "latest stable hiện tại", và nêu rằng upstream đã tới
`v0.89.12`. **`v0.89.12` có thật, nhưng nó là một prerelease.** Đo bằng hai đường độc lập:

```text
gh api repos/github/gh-aw/releases/latest
  -> tag=v0.88.7  prerelease=false  draft=false  published=2026-09-08T15:34:49Z

gh api "repos/github/gh-aw/releases?per_page=40"
  -> v0.89.15 (14/09) v0.89.13 v0.89.12 v0.89.11 ... v0.88.8   deu prerelease=true
  -> v0.88.7  (08/09)                                          prerelease=false
```

Endpoint `releases/latest` của GitHub **theo định nghĩa** trả về bản không-prerelease, không-draft
mới nhất. Hai đường cho cùng một câu trả lời, nên đây không phải một lần đọc nhầm.

Nâng lên `v0.89.12` sẽ mâu thuẫn với chính cây thước bảng trên dùng để bác `v0.88.4`: nó bị loại
**vì là prerelease**. Quyết định repin vì vậy là **giữ `v0.88.7`**, và bổ sung thứ bản trước thiếu:
**ngày đo, ghi ngay trong bản ghim** (`# gh-aw-audit: 2026-09-15` ở pilot; chú thích HTML cùng tên ở
đầu ADR và tệp này). Một bản ghim không kèm ngày đo thì không phân biệt được *"vẫn là bản stable mới
nhất"* với *"không ai kiểm lại từ tháng trước"* — và bất biến 11 của §9.2 bắt ba nơi phải trùng nhau,
để một lần nâng bản không rớt nửa chừng.

#### Delta `v0.88.7...v0.89.15` — 180 commit

**Security.** Không advisory mới nào kể từ 29/08/2026. Đo lại 15/09 bằng
`repos/github/gh-aw/security-advisories`: đúng **10** advisory, cả 10 có dải ảnh hưởng kết thúc
**dưới** `v0.88.7`. Phép đo có **đối chứng âm** (cùng truy vấn trên một repo khác vẫn trả về dữ
liệu), nên "không có advisory mới" là kết quả thật, chứ không phải truy vấn hỏng — bài học đã ghi ở
§3.4.

**Capability.** Lọc 180 commit theo từ khoá bảo mật/quyền/breaking, phần đáng kể gồm:

| Nhóm | Gì |
|---|---|
| Hạ tầng cách ly | bump `gh-aw-firewall` v0.28.15 → v0.28.16; `gh-aw-mcpg` v0.4.21 |
| Threat spec | nhiều vòng audit tự động hằng ngày + sửa `config_error` cho custom engine |
| Safe outputs | `add-labels` siết giới hạn target; validate secret ngoài trước khi kích hoạt; footer bổ sung cho body |
| **Đường token GitHub App** | **#59743** giữ quyền checkout token khi `permissions.contents: none`; **#60137** giữ quyền `contents` cho checkout do built-in job dựng |

**Không** commit nào đổi một bất biến mà pilot dựa vào: `safe-outputs.staged`, strict permissions,
chặn PR từ fork, `on.roles`. Nên delta **không** ép nâng bản.

**Cái chưa đóng, nói thẳng:** hai bản vá App-token ở dòng cuối bảng nằm **sau** bản ta ghim. Pilot
hôm nay không đi nhánh checkout đó, nên chúng chưa chạm tới ta — nhưng vì §9.3 tình huống 4 nay dựa
vào đúng đường App-token, **bản ghim phải được đo lại một lần nữa ngay trước bước activation**, chứ
không phải sau.

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
ngoài cả 10. **Đo lại 15/09/2026: vẫn đúng 10, không có advisory mới.** Phép đo đi kèm đối chứng âm
(cùng truy vấn trên một repo khác trả về dữ liệu) — không có đối chứng âm thì một truy vấn hỏng và
một kết quả sạch nhìn giống hệt nhau. Đó là dấu vết của một đợt audit tập trung lên một codebase trẻ, không phải 10 sự cố
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
tài liệu nào nói review của Codex có tính vào required-approvals hay không.

**Đo lại 15/09/2026, rộng hơn một PR.** Bản trước chỉ đo `GET /pulls/155/reviews`. Lần này quét 13
PR — #310 #307 #306 #305 #302 #290 #263 #206 #199 #191 #155 #151 #136 — và **không PR nào có một
review event của `chatgpt-codex-connector`**. Đối chứng âm: cùng endpoint **có** trả về review của
người (`COMMENTED`) ở #305, #302, #290, #206, nên "rỗng" ở đây là rỗng thật.

Kết luận đúng mức: **Codex trong repo này là một người ĐỌC độc lập, không phải một người DUYỆT.**
40 comment là 40 issue comment; chúng không vào `/pulls/*/reviews`, không tính vào
required-approvals, và **không đủ** để tuyên bố tình huống 5 của #309 §9 là đã chạy. §9.3 vì vậy
hạ tình huống đó xuống **NOT PROVEN**, và §12 ghi đúng một phép đo sẽ lật nó.

Điều này **không** cứu PR #206: một extension 6.889 dòng cũng chỉ đánh thức được một cuộc hội thoại,
tức cũng dừng ở mức "người đọc". Khoảng cách giữa "đọc" và "duyệt" là một tính chất của GitHub, không
phải thứ mua được bằng thêm mã.

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
| Secret của repo | Đúng hai: **`CLAUDE_CODE_OAUTH_TOKEN`** và **`NEXAGENT_AUTOPILOT_PRIVATE_KEY`** | `actions/secrets` |
| Biến của repo | `AUTOPILOT_DRY_RUN` · `AUTOPILOT_REVIEWER_APP_SLUG` · `GCP_DEPLOY_SERVICE_ACCOUNT` · `GCP_WORKLOAD_IDENTITY_PROVIDER` · **`NEXAGENT_AUTOPILOT_CLIENT_ID`** | `actions/variables` |
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
| Đánh thức người ĐỌC độc lập | PR #206: extension + native host | `@codex review` (App đã cài) hoặc `add-reviewer` | GitHub App chính thức. **Không** phải người DUYỆT — §4.3 |
| Thực thi mã | PR #263: daemon Windows + worktree + process lock | Job gh-aw trên runner GitHub, sandbox + firewall | GitHub Actions |
| Cổng rủi ro cao — **deploy** | `human_gate` trong JSON hợp đồng | Environment `production` có required reviewer, ở job deploy | GitHub Environment |
| Cổng rủi ro cao — **merge** | `human_gate` trong JSON hợp đồng | Nhãn `risk:high` ⇒ agent DỪNG, gắn `needs-human` | **Chỉ prompt của pilot** — GitHub chưa cưỡng chế, xem §7.3 |
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

### 7.3 Hai cổng người KHÁC NHAU — cổng merge và cổng deploy

Bản trước của mục này gộp chúng làm một và viết *"cổng người là Environment"*. Sai. **Environment
không biết gì về pull request.** Nó giữ lại một **job** khai `environment:`; nó không chặn được một
lần merge. Tách bạch, với số đo 15/09/2026:

| | Cổng **merge** | Cổng **deploy** |
|---|---|---|
| Chặn cái gì | PR vào `main` | Một **job** trong một workflow run |
| Ai cưỡng chế | Ruleset `main-protection` | GitHub Environment |
| Cấu hình đo được | `required_approving_review_count: 0`; 7 required check, `strict: true` | `production`: required reviewer = chủ repo; `prevent_self_review: false`. `dev` không có rule; `gd1-test` chỉ `branch_policy` |
| Đang dùng ở đâu | mọi PR | job `deploy-silo` của `reusable-deploy-tenant.yml` |
| Tự duyệt được? | **không** — GitHub cấm tự duyệt PR của mình | **có** |
| Trạng thái | **KHÔNG có cổng người** | **CÓ cổng người**, đang chạy |

**Cổng merge.** `required_approving_review_count` không nâng được một cách có ích ở repo một chủ:
GitHub cấm tự duyệt, và không có người thứ hai. Nâng lên `1` sẽ **khoá cứng mọi PR**, kể cả PR tay.
Nên hôm nay cổng merge của repo này là **CI, không phải người**. Con đường xác minh được để có một
người duyệt thứ hai vẫn là §4.2 (Copilot code review) — tức vẫn là một khoản mua, và vẫn **NOT
PROVEN**.

**Cổng deploy.** Environment `production` đã có required reviewer và **cho phép tự duyệt** (đo
được: `prevent_self_review: false`), nên một người vừa đặt được vừa đi qua được, mà vẫn để lại dấu.
Đây là cổng người **duy nhất đang thật sự chạy** trong repo — và nó nằm ở bước deploy.

**Nối cổng deploy vào cổng merge thì được không?** Được, về kỹ thuật: biến một job có
`environment:` thành **required status check thứ 8**. Nhưng phải trả hai giá, và cả hai đã đo:

1. Nó phá bất biến 7 của `tools/autopilot-v2-contract` (*đúng 7 check*) và §13 của #309.
2. Chú thích đầu `.github/workflows/deploy-tenant.yml` ghi một sự cố thật ngày 17/08/2026: một run
   **đang chờ duyệt** chiếm làn concurrency và chặn **26 phút** một lần deploy hợp lệ. Đưa cổng chờ
   duyệt vào đường PR là nhân số lần chờ đó lên theo số PR.

Tài liệu này **không** đề xuất làm vậy. Trong pilot, `risk:high` dừng ở **hành vi của agent** —
prompt bắt dừng, gắn `needs-human` — tức một cổng ở tầng prompt, **không** phải một cổng GitHub
cưỡng chế. Nói nó là "cổng GitHub" sẽ là tô hồng đúng chỗ #309 §9 cấm.

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
**mười một** bất biến của chính repo này:

| # | Bất biến được khoá | Hỏng thì sao |
|---|---|---|
| 1 | Pilot khai `safe-outputs.staged: true` | Một lần sửa vô ý biến pilot thành thứ ghi thật |
| 2 | Pilot **chưa** có `.lock.yml` đi kèm | Bật workflow tự trị mà không qua cổng §14 |
| 3 | Pilot ghim **tag + SHA 40 ký tự + ngày re-audit** qua `# gh-aw-pin:` / `# gh-aw-sha:` / `# gh-aw-audit:` — quy ước của repo này, không phải trường của gh-aw | Trôi theo bản preview, hoặc ghim mà không ai biết lần cuối đo là bao giờ |
| 4 | Job agent **không** khai `contents/issues/pull-requests: write` | Trao quyền ghi cho đúng chỗ #309 §4A cấm |
| 5 | Trigger là `label_command`, và `on.roles` không chứa `write` | Repo public: người lạ có quyền write kích hoạt được |
| 6 | *(tự bật khi có lock)* mọi `uses:` trong `agent-builder.lock.yml` ghim SHA 40 ký tự | Ref trôi trong workflow được chọn dùng — vi phạm #309 §13 |
| 7 | `.github/rulesets/main-protection.json` giữ **đúng 7** required check và `bypass_actors: []` | Nới lỏng CI/ruleset |
| 8 | Issue Form khai đủ bộ nhãn rủi ro `risk:low\|medium\|high` | Mất kênh máy đọc |
| 9 | *(tự bật sau khi xoá)* không workflow nào còn nhắc `AUTOPILOT_TASK_V0` | Giao thức cũ sống lại lặng lẽ |
| 10 | Có `github-token-for-extra-empty-commit` ⇒ giá trị là `app` **và** có khối `safe-outputs.github-app` đủ `client-id`/`private-key`, trỏ đúng `NEXAGENT_*` | gh-aw sinh token **rỗng** rồi lặng lẽ đẩy commit bằng `GITHUB_TOKEN` — đúng cái rào đang muốn vượt |
| 11 | Bản ghim gh-aw (tag + SHA + ngày audit) **trùng nhau** ở pilot, ADR và tệp này | Một lần nâng bản rớt nửa chừng: người review tin một bản ghim không còn đúng |

Bất biến 6, 9 và 10 ở dạng **tự kích hoạt theo điều kiện** — 6 khi `.lock.yml` được commit, 9 khi
`tools/autopilot-protocol/` biến mất, 10 khi ai đó khai trường CI-trigger lần đầu (nay đã khai, nên
10 **đang chạy thật**). Không ai phải nhớ bật chúng, nên một lần skip không thể trôi thành một lần
đạt.

Đã kiểm bằng **mutation**, không chỉ bằng "xanh". **Bảy** đột biến chạy trên HEAD này, mỗi cái đỏ
đúng bài của nó, và cả bảy đã hoàn nguyên (đối chứng sau đó xanh): `staged: true`→`false` (bài 1)
· `issues: read`→`write` (bài 4) · đổi tên khối `github-app` (bài 10) · `app`→PAT ở
`github-token-for-extra-empty-commit` (bài 10) · `NEXAGENT_*`→`NEXAGNET_*` (bài 10) · lệch ngày
audit ở ADR (bài 11) · ADR ghim `v0.89.12` còn pilot ghim `v0.88.7` (bài 11).

Ba đột biến giữa đáng chú ý vì cả ba là **lỗi im lặng**: gh-aw vẫn biên dịch và vẫn chạy, chỉ là
commit rỗng đi bằng `GITHUB_TOKEN` và CI lại đứng ở `action_required` — đúng triệu chứng của việc
chưa từng cấu hình gì.

### 9.3 Bảy tình huống phải chứng minh — trạng thái hôm nay

Theo #309 §9. Không tô hồng:

| # | Tình huống | Hôm nay | Chứng bằng gì |
|---|---|---|---|
| 1 | Trigger tin cậy khởi động **đúng một** lần chạy | ⬜ chờ credential | `concurrency` của gh-aw + `label_command` tự gỡ nhãn |
| 2 | Trigger không tin cậy **không** tạo được lần chạy có quyền ghi | 🟡 chứng bằng cấu hình | fork bị chặn mặc định + `on.roles` + bất biến 4/5 |
| 3 | Agent sửa mã, Safe Output tạo **một** PR | ⬜ chờ credential | `create-pull-request`, `max: 1`, `draft` |
| 4 | **CI hiện có chạy trên PR đó** | 🟡 **cơ chế đã đo, dây đã nối, chưa chạy end-to-end** | A/B run `33676122047` vs `33717371535` — xem dưới |
| 5 | Người **duyệt** chính thức độc lập duyệt PR | 🔴 **NOT PROVEN** | 13 PR, **0** review event của Codex — xem dưới |
| 6 | Một phát hiện quay lại agent để lặp một vòng | ⬜ chờ credential | `push-to-pull-request-branch` |
| 7 | Nhãn/đường rủi ro cao **dừng ở cổng người** | 🟡 ở tầng **prompt**, không phải cổng GitHub | prompt pilot bắt dừng + gắn `needs-human`; §7.3 |

#### Tình huống 4 — mô tả đúng cái rào, và cái đã đo được

Câu *"PR do `GITHUB_TOKEN` tạo ra không kích hoạt CI"* là **chưa đúng**, và khác biệt đó quan
trọng lúc gỡ lỗi. Đo trên chính repo này (PR #136, SHA `509b566`):

```text
gh api "repos/<o>/<r>/actions/runs?head_sha=509b566..."
  -> id=33676122047  name=ci  event=pull_request
     status=completed  conclusion=action_required  triggering_actor=github-actions[bot]
gh api "repos/<o>/<r>/actions/runs/33676122047/jobs"
  -> total_count=0
```

Tức là: GitHub **CÓ tạo bản ghi run** cho SHA mới, nhưng run đó đứng ở `action_required` với **0
job** và **không tự chạy** — nó chờ một người bấm *Approve and run workflows*. "Không có run nào" và
"có run nhưng 0 job" là hai trạng thái khác nhau; kết luận "không có CI" từ việc không thấy job chạy
là một lần đọc sai.

**Ranh giới thật không nằm ở "commit tự động" mà ở DANH TÍNH người đẩy.** Đối chứng dương, cùng
repo, PR #151:

```text
commit 472b721  author=nexagent-autopilot[bot]  committer=nexagent-autopilot[bot]
gh api "repos/<o>/<r>/actions/runs/33717371535"
  -> name=ci  event=pull_request  run_attempt=1  conclusion=success
     triggering_actor=nexagent-autopilot[bot]
  -> jobs: 7/7 success  (verify integration workflow-integration tenant-packs e2e audit images)
```

Commit đó được đẩy bằng **installation token của App `nexagent-autopilot`**, và run chạy đủ 7 job
mà không ai bấm duyệt. Đây đúng là cơ chế `github-token-for-extra-empty-commit` dùng.

**Thiết kế đã nối dây trong pilot** (`.github/workflows/agent-builder.md`), đọc từ mã gh-aw ghim SHA
`bde3679` chứ không đoán:

```yaml
safe-outputs:
  github-app:
    client-id: ${{ vars.NEXAGENT_AUTOPILOT_CLIENT_ID }}
    private-key: ${{ secrets.NEXAGENT_AUTOPILOT_PRIVATE_KEY }}
  create-pull-request:
    github-token-for-extra-empty-commit: app
```

Trình biên dịch gh-aw (`pkg/workflow/compiler_safe_outputs_steps.go`) xử lý `app` thành đúng một
biến môi trường, lấy từ bước mint có `id: safe-outputs-app-token` mà khối `github-app` sinh ra:

```yaml
GH_AW_CI_TRIGGER_TOKEN: ${{ steps.safe-outputs-app-token.outputs.token || '' }}
```

> ⚠️ **Bẫy fail-open, phải biết trước khi bật.** Nhánh `case "app"` **không** kiểm rằng khối
> `github-app` có tồn tại. Thiếu khối đó — hoặc gõ sai tên biến/secret — thì biểu thức trên ra
> **chuỗi rỗng**, commit rỗng quay về `GITHUB_TOKEN`, và **không có thông báo lỗi nào**: triệu chứng
> y hệt như chưa từng cấu hình. Bất biến **10** của §9.2 khoá cặp đôi này trong required check
> `verify`.
>
> Một chi tiết đã suýt gây đúng lỗi đó: tài liệu bản trước viết secret là
> `NEXAGNET_AUTOPILOT_PRIVATE_KEY`. Tên thật — đo bằng `gh api .../actions/secrets` — là
> **`NEXAGENT_AUTOPILOT_PRIVATE_KEY`**. Lệch một chữ, `secrets.*` ra chuỗi rỗng, im lặng.

**Còn lại chưa đo:** toàn bộ đường gh-aw end-to-end (agent → safe output → PR → commit rỗng → CI)
chưa chạy một lần nào, vì chưa có credential engine (§5). Cái đã chứng minh là **cơ chế danh tính**
trên chính repo này; cái chưa chứng minh là **gh-aw nối đúng cơ chế đó**. Vì vậy tình huống 4 là
🟡, không phải ✅ — và phải đo thật, cùng lượt với re-audit bản ghim, ngay trước bước activation.

#### Tình huống 5 — hạ xuống NOT PROVEN

Bản trước ghi ✅ *"đã chạy thật"*, lấy 40 comment của App `chatgpt-codex-connector` làm bằng.
**Sai loại bằng chứng.** Một issue comment không phải một GitHub Code Review: nó không vào
`/pulls/*/reviews`, không tính vào required-approvals, và không thoả được câu #309 §9 hỏi.

Đo lại 15/09/2026 trên 13 PR (#310 #307 #306 #305 #302 #290 #263 #206 #199 #191 #155 #151 #136):
**không PR nào có một review event của App đó.** Đối chứng âm: cùng endpoint trả về review
`COMMENTED` của người ở #305, #302, #290, #206 — nên "rỗng" là rỗng thật, không phải truy vấn hỏng.

Phép đo sẽ lật tình huống này, ghi sẵn để lần sau không phải nghĩ lại:

```text
1. Bat Code review cho repo nay tai chatgpt.com/codex/settings/code-review  (viec cua chu repo)
2. Comment "@codex review" tren mot PR dang mo
3. gh api "repos/<o>/<r>/pulls/<n>/reviews" --jq '.[] | .user.login + " " + .state'
   -> co mot dong cua chatgpt-codex-connector  => PROVEN
   -> van rong                                  => NOT PROVEN, va ly do phai ghi ra
```

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
`chatgpt-codex-connector` không mất — App đó vẫn đang chạy và vẫn là **người đọc độc lập**, chỉ là
nó không còn là tham số của giao thức V0; xem §4.3 về việc nó chưa phải người *duyệt*);
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
| Thêm bởi lần migration này | **+~1.880** (tài liệu này + ADR + Issue Form + 1 workflow Markdown + gói test hợp đồng; +~460 là vòng sửa sau review độc lập lần 1) |
| **Ròng** | **≈ −28.850** |

Đạt mục tiêu "xoá nhiều hơn thêm" của #309 §10 với biên rất rộng. Phần "thêm" gần như toàn bộ là
**tài liệu và hợp đồng cấu hình**, không có gói runtime nào.

---

## 11. Hạ rủi ro preview

| Rủi ro | Cách hạ |
|---|---|
| gh-aw là public preview, minor hàng tuần | Ghim **tag + SHA + ngày audit** `v0.88.7` / `bde3679…` / `2026-09-15`; bất biến 11 bắt ba nơi khai giống nhau; commit `.lock.yml`; chỉ dùng built-in đã chín (`create-pull-request`, `add-comment`, `add-labels`, `add-reviewer`) |
| Bản ghim cũ dần mà không ai biết | `# gh-aw-audit:` là ngày **đo lại**, không phải ngày ghim. Đo lại bắt buộc **một lần nữa ngay trước bước activation** — cùng lượt với phép đo tình huống 4 |
| `github-token-for-extra-empty-commit: app` fail-open khi thiếu `github-app` | Bất biến 10 chạy trong required check `verify`; nó đỏ trước khi ai kịp bật |
| `.lock.yml` **không** ghim thân prompt (chỉ ghim frontmatter + nguồn cung ứng) | Bật `on.stale-check: "full"` để băm cả thân; và bất biến 3 của §9.2 khoá `source:` |
| gh-aw **không có** cờ kiểm lock cũ trong CI | Tự thêm một bước `gh aw compile && git diff --exit-code` khi bật thật (một bước, không phải một gói) |
| Copilot approve-để-tính-required là preview, mặc định tắt | Không thiết kế phụ thuộc nó. Và **không** thay nó bằng Environment: Environment là cổng **deploy**, không chặn merge (§7.3) |
| Copilot cloud agent có thể đòi thêm bypass actor | **Không** thêm bypass actor. Nếu ruleset chặn agent, dùng gh-aw thay vì nới ruleset |
| `@codex review` trên repo public: không rõ ai kích hoạt được | Chỉ dùng **thủ công** (`@codex review`), **không** bật Automatic reviews |
| Tầng AI không dùng được | Không ảnh hưởng gì — Issue/PR/CI/ruleset/deploy vẫn chạy nguyên vẹn. Kiến trúc này **không** đặt bất kỳ đường nghiệp vụ nào sau tầng AI |

Suy biến an toàn, nói thẳng: **không có** workflow deploy hay CI nào phụ thuộc pilot. Gỡ pilot =
xoá một tệp `.md`.

---

## 12. NOT PROVEN — nói thẳng

1. **Chưa có một lần chạy gh-aw nào trong repo này.** Không có credential engine nào (§5). Mọi khẳng
   định về gh-aw ở tài liệu này đến từ tài liệu + mã nguồn ghim SHA `bde3679`, không từ một run thật.
2. **Tình huống 4 chưa chạy end-to-end.** Cái *đã* đo là **cơ chế danh tính** trên chính repo này:
   commit đẩy bằng `GITHUB_TOKEN` cho run `action_required` + 0 job (run `33676122047`), commit
   đẩy bằng installation token của App cho run 7/7 job `success` (run `33717371535`). Cái **chưa**
   đo là gh-aw có nối đúng cơ chế đó qua `github-token-for-extra-empty-commit: app` hay không —
   chưa có credential engine để chạy thử (§5). Dây đã nối, bẫy fail-open đã khoá bằng bất biến 10.
3. **Copilot code review approve-để-tính-required chưa thử ở repo này**, và tài liệu GitHub không nói
   rõ nút cấp-repo đó có mở cho repo **cá nhân** hay không.
4. **Tình huống 5 — người duyệt chính thức độc lập: NOT PROVEN.** Đo 13 PR ngày 15/09/2026:
   `chatgpt-codex-connector` **chưa từng** phát một review event nào trong repo này (đối chứng âm:
   review của người vẫn hiện). 40 issue comment là bằng chứng cho *"người đọc độc lập"*, **không**
   cho *"người duyệt"*. Phép đo lật kết luận này ghi ở §9.3.
5. **Không có cổng người ở bước merge.** Cổng người đang chạy là Environment `production`, và nó
   gác **deploy**, không gác merge (§7.3). Đừng đọc hai thứ đó làm một.
6. **Chưa có người thứ hai đọc mã.** Repo một chủ. Đây chính là lý do cổng §14 tồn tại.
7. **`require_extra_approval_for_unattributed_changes: true`** đang bật trên ruleset và có thể tương
   tác với PR do agent tạo. Chưa đo. Liên quan trực tiếp tới mục 2: commit do App đẩy **có** danh
   tính (`author=nexagent-autopilot[bot]`), nên nhiều khả năng không rơi vào diện "unattributed" —
   nhưng "nhiều khả năng" không phải một phép đo.

---

## 13. Liên quan

- [adr-0001-autopilot-official-first.md](../../kien-truc/adr-0001-autopilot-official-first.md) — quyết định cuối
- [tech-radar.md](../../kien-truc/tech-radar.md) — §6 AVOID BUILDING
- [github-governance.md](github-governance.md) — trạng thái ruleset, `bypass_actors`, repo public
- [ci-cd.md](ci-cd.md) — 7 bất biến CI/CD, phải đọc trước khi sửa `.github/workflows/`
