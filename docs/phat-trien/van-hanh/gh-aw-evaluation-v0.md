# Đánh giá `github/gh-aw` làm substrate mutation / Safe Outputs — V0

> Bằng chứng cho **Issue #194**. Tài liệu này chỉ **quyết định kiến trúc**; nó không migrate gì,
> không đổi workflow production, không đổi quyền, không bật ghi.
>
> PoC tất định đi kèm: [`tools/poc-gh-aw-evaluation/`](../../../tools/poc-gh-aw-evaluation/README.md).

## 1. Kết luận điều hành

```text
DECISION = KEEP_CUSTOM
```

**Giữ mặt phẳng mutation của Nexagent. Mượn _ý tưởng_ và _bài kiểm_ từ gh-aw, không mượn mã.**

Ba sự thật đo được, mỗi cái đều đủ một mình để loại HYBRID theo đúng §15 của hợp đồng task:

1. **Safe Outputs không chạy được nếu không có agent job.** Trình biên dịch ghim cứng
   `constants.AgentJobName`; job `safe_outputs` luôn `needs: agent` và `if:` của nó đọc
   [`needs.agent.result`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/compiler_safe_outputs_job.go#L733).
   Đúng **299/299** workflow đã sinh ra, và đúng cả trên workflow **PoC D tự biên dịch** bằng một
   engine khác. Không có cờ, action hay reusable workflow nào chạy Safe Outputs độc lập.
2. **gh-aw không có idempotency.**
   [`add_comment.cjs:1021`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/actions/setup/js/add_comment.cjs#L1021)
   gọi `createComment` **vô điều kiện** — không sổ ledger, không khóa, không tra cứu trước khi ghi.
   Ngữ nghĩa là **at-least-once**. Đúng lớp lỗi mà blocker B5 của PR #167 đã sửa xong ở Nexagent.
3. **Xác thực Safe Outputs mặc định fail-open.** Luật xác thực không nằm trong mã mà đến từ biến
   [`GH_AW_VALIDATION_CONFIG`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/actions/setup/js/safe_output_type_validator.cjs#L251);
   thiếu hoặc hỏng biến đó thì mọi item thành "loại lạ" và
   [đi qua nguyên vẹn](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/actions/setup/js/safe_output_type_validator.cjs#L766).
   Đây là **chiều ngược** với bất biến fail-closed của Orchestrator V0 (§5).

Và một sự thật thứ tư khép đường HYBRID ở mức thư viện: **gh-aw không xuất bản runtime JS lên npm**
(không có `package.json` gốc; `@github/gh-aw` trả 404). Tái sử dụng ở mức thư viện = **vendor mã
nguồn không phiên bản** từ một kho phát hành ~17 bản/30 ngày.

Điều này **không** có nghĩa gh-aw kém. Ở đúng một điểm gh-aw **cưỡng chế mạnh hơn** Nexagent, và ta
nên học: xem §7.

> ### Một lập luận đã bị rút — Claude Max OAuth **không** còn là lý do KEEP_CUSTOM
>
> Bản đầu của tài liệu này liệt kê "Claude Max OAuth không tồn tại trong gh-aw" làm lý do số một, dựa
> trên một phép **đếm chuỗi**: `CLAUDE_CODE_OAUTH_TOKEN` xuất hiện 0 lần trong `*.go`/`*.cjs`. Phép
> đếm ấy đúng, nhưng **kết luận rút ra từ nó thì sai**: nó đo sự có mặt của một chuỗi, trong khi thứ
> cần đo là **khả năng của khung**.
>
> gh-aw có một đường thứ hai — **behavior-defined engine** — nhận một **tên bí mật bất kỳ** qua
> `auth[].secret`. **PoC D biên dịch thật** bằng chính trình biên dịch gh-aw tại SHA đã ghim và đo
> được: tệp `.lock.yml` sinh ra **giao đúng** `CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`
> cho bước chạy tác nhân, và **`ANTHROPIC_API_KEY` xuất hiện 0 lần**. Chi tiết ở §10.
>
> Kết luận `KEEP_CUSTOM` **không đổi** — nó chưa bao giờ cần chân này, và ba chân còn lại đều là
> phép đo độc lập. Nhưng lý do thì đổi, và tài liệu phải nói đúng lý do.

## 2. Nguồn gh-aw được audit

|               |                                                                                         |
| ------------- | --------------------------------------------------------------------------------------- |
| Kho           | `github/gh-aw` — `githubnext/gh-aw` chuyển hướng về đây                                 |
| **SHA**       | **`82239c030d6a1ef6ec8b87a80a1346eeef211f8d`**                                          |
| Tag           | `v0.88.4`, commit 2026-09-04T06:02:13Z                                                  |
| Giấy phép     | MIT, © GitHub, Inc.                                                                     |
| Mô hình build | Trình biên dịch **Go** sinh ra `.lock.yml`; runtime là `.cjs` trong `actions/setup/js/` |

Mọi khẳng định dưới đây trỏ tới `đường-dẫn:dòng` **tại đúng SHA trên**. Không dùng `main` trôi.

**Bằng chứng dẫn đến quyết định là link bấm được, và điều đó được cưỡng chế bằng bài kiểm.** 22
khẳng định thuộc bảy miền — OAuth/custom engine · Safe Outputs coupling · suy quyền · xác thực
fail-open · idempotency/lỗi một phần · checkout đặc quyền · agent read-only — được khai ở
[`evidence-claims.json`](../../../tools/poc-gh-aw-evaluation/evidence-claims.json), và hai phía đều
bị khóa:

| Phía         | Cơ chế                             | Vỡ khi                                                      |
| ------------ | ---------------------------------- | ----------------------------------------------------------- |
| **Upstream** | `src/evidence-index.mjs`           | `anchor` không còn nằm đúng `line` trong clone tại SHA ghim |
| **Báo cáo**  | `tests/evidence-contract.test.mjs` | tài liệu này thiếu một permalink, hoặc trỏ vào `blob/main`  |

Nghĩa là báo cáo **không thể lặng lẽ mất bằng chứng**, và bằng chứng **không thể lặng lẽ trôi khỏi
upstream** — không ai phải nhớ kiểm tay.

> ⚠️ Tag `v0.88.4` trỏ vào một commit có tiêu đề `[WIP] Fix failing GitHub Actions job…`. Ghi lại
> như một tín hiệu chuỗi cung ứng, không phải một lời chê.

## 3. Nền Nexagent được so sánh

|                         |                                                                              |
| ----------------------- | ---------------------------------------------------------------------------- |
| **`NEXAGENT_BASE_SHA`** | **`b827b9f78c5b68108e35d272948942961f6d55bb`** (`origin/main` lúc đo)        |
| #165 Orchestrator V0    | **OPEN**                                                                     |
| #188 sửa quyền mutation | **OPEN**                                                                     |
| #191 (PR sửa #188)      | **OPEN, chưa merge** — `headRefOid=4beab8622f31111a8ff7e625ab88793af07d9048` |

Theo §2.3 hợp đồng task: **`main` là nền production đã chấp nhận**; #191 là ứng viên đang chờ duyệt.
Mọi số liệu và trích dẫn Nexagent dưới đây lấy từ `main`, **không** từ #191. Chỗ nào #191 sẽ đổi kết
luận thì được nói rõ.

> **`NEXAGENT_BASE_SHA` là nền lúc ĐO, không phải nền lúc merge.** Hai thứ này khác nhau và không
> được lẫn — blocker B2 của `REVIEW_BLOCK 5550187530` sinh ra đúng từ chỗ lẫn ấy.
>
> `main` đã dịch hai lần kể từ lúc đo: `b827b9f7` → `582ded32` → **`e10258e1`**. Nhánh này được
> **merge** live main (không rebase, không force) trước khi chạy lại CI trên đúng HEAD mới; SHA nền
> dùng cho lần `BUILD_READY` này là **`e10258e1`**, và nó được ghi trong chính comment đó.
>
> Không phép đo nào ở trên phải làm lại: diff của cả hai lần dịch nằm trọn trong
> `apps/web/…/transport-operations/**` và `tenants/transport-preview/**`, không chạm một tệp nào của
> `tools/autopilot-orchestrator/**` hay của gói bằng chứng này.

## 4. Bản đồ kiến trúc

```text
gh-aw:    trigger → activation → agent (READ-ONLY) → detection → safe_outputs (WRITE) → conclusion
                                    ↑ nội dung không tin cậy       ↑ mọi mutation

Nexagent: pull_request  → preflight + orchestrate-readonly  (TOÀN ĐỌC, chạy mã nguồn PR)
          issue_comment ⎫
          check_suite   ⎭ → orchestrate (issues: write, checkout ghim default_branch)
```

Hai bên **hội tụ độc lập vào cùng một hình dạng**: tách job chạy nội dung không tin cậy khỏi job cầm
quyền ghi, nối nhau qua một artifact đã kiểm. Nexagent đến đó qua blocker B4 của PR #167; gh-aw đến
đó bằng thiết kế. Sự hội tụ này là bằng chứng mạnh rằng hình dạng đó đúng.

Khác biệt nằm ở **cái gì được cưỡng chế** và **ai giữ ngữ nghĩa**:

| Nexagent                                | Đối ứng gh-aw                                      | Vừa?       | Quyết định            |
| --------------------------------------- | -------------------------------------------------- | ---------- | --------------------- |
| Task Contract (JSON trong thân Issue)   | `NONE`                                             | —          | **KEEP**              |
| Protocol V0 carrier (comment có marker) | `NONE` — output là NDJSON artifact                 | —          | **KEEP**              |
| Cổng exact HEAD SHA                     | `NONE`                                             | —          | **KEEP**              |
| `principalFromGithubEvent`              | `NONE` — chỉ có role check (`role_checks.go:149`)  | thấp       | **KEEP**              |
| `PrincipalRegistry` (principal→vai)     | `NONE`                                             | —          | **KEEP**              |
| Phân lập nhiệm vụ (builder ≠ reviewer)  | `NONE`                                             | —          | **KEEP**              |
| Mã nguồn PR read-only                   | `agent` job read-only, **cưỡng chế lúc biên dịch** | **cao**    | **PORT_PATTERN_ONLY** |
| `WRITE_CALLS` (quyền suy từ endpoint)   | `PermissionBuilder` (quyền suy từ _loại output_)   | trung bình | **PORT_PATTERN_ONLY** |
| `MUTATION_GRANTS`                       | `ComputePermissionsForSafeOutputs`                 | trung bình | **PORT_PATTERN_ONLY** |
| Handler comment/nhãn                    | `add_comment` / `add_labels` / `remove_labels`     | cao        | **ADAPTER_REQUIRED**  |
| Phân trang ledger, fail-closed          | Có phân trang, **fail-open**                       | thấp       | **KEEP**              |
| Idempotency                             | `NONE`                                             | —          | **KEEP**              |
| Khôi phục lỗi một phần                  | `NONE` — chạy tiếp, không rollback                 | —          | **KEEP**              |
| Làm sạch thân lỗi API                   | Denylist, chỉ chặn HTML                            | thấp       | **KEEP**              |
| Required checks từ ruleset sống         | `NONE`                                             | —          | **KEEP**              |
| Xuất xứ reviewer ChatGPT                | `NONE`                                             | —          | **KEEP**              |
| Cổng người duyệt HIGH                   | `NONE` (có role gate, khác mục đích)               | thấp       | **KEEP**              |
| Ngữ nghĩa runtime proof                 | `NONE`                                             | —          | **KEEP**              |
| Claude Max OAuth                        | Được, **chỉ qua** behavior-defined engine (§10)    | trung bình | **KEEP**              |
| Conversation Bridge                     | `NONE`                                             | —          | **KEEP**              |

## 5. Audit Safe Outputs

Đường đi của một tác động phụ:

```text
agent (read-only) → NDJSON artifact → collect_ndjson_output.cjs (type-gate + max)
  → safe_output_type_validator.cjs (lọc trường theo cấu hình)
  → safe_output_handler_manager.cjs → handler → GitHub REST
```

- **Xác thực ở đâu:** `actions/setup/js/safe_output_type_validator.cjs:760` `validateItem()`.
- **Handler có checkout mã nguồn không:** **có**, 70/299 workflow — xem §7, đây là phát hiện quan
  trọng nhất về an ninh.
- **Handler có tin văn bản tự do của tác nhân không:** **không** cho `repo`/`type`. `repo` đi qua
  allowlist `repo_helpers.cjs:162-200`; loại output bị chặn nếu chưa khai
  (`collect_ndjson_output.cjs:332-336`). Đây là thiết kế tốt.
- **Giới hạn `max:`** cưỡng chế **cả** lúc biên dịch (`safe_outputs_max_validation.go:38-45`) **lẫn**
  lúc chạy (`safe_outputs_handlers.cjs:418-426`, `collect_ndjson_output.cjs:337-341`).

**Nhưng bảo vệ đó là do CẤU HÌNH, và mặc định là fail-open.** `safe_output_type_validator.cjs:251-256`:

```js
const configJson = process.env.GH_AW_VALIDATION_CONFIG;
if (!configJson) {
  // Return empty config if not provided - validation will be skipped
  cachedValidationConfig = {};
```

Không có biến → `validateItem()` rơi vào nhánh `Unknown type` (`:764-766`) → `isValid: true` và
**chuyển tiếp nguyên vẹn** trường do tác nhân đặt. Cấu hình **hỏng** cũng vậy: ghi một dòng
`CRITICAL` rồi chạy tiếp với cấu hình rỗng (`:264-271`).

Đo trực tiếp (PoC A, `fixtures/validation-config-states.json`):

| Trạng thái `GH_AW_VALIDATION_CONFIG` | `isValid` | Trường không khai báo sống sót? |
| ------------------------------------ | --------- | ------------------------------- |
| thiếu                                | `true`    | **có**                          |
| hỏng (JSON sai)                      | `true`    | **có**                          |
| hợp lệ                               | `true`    | không                           |

Đây là **chiều ngược** với bất biến fail-closed của Orchestrator V0.

## 6. Audit mô hình quyền

Quyền được tính **lúc biên dịch**, nướng thẳng vào `.lock.yml`
([`compiler_safe_outputs_job.go:124`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/compiler_safe_outputs_job.go#L124)).
Không có tính quyền lúc chạy.

Mã quyết định —
[`pkg/workflow/add_comment.go:129-141`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/add_comment.go#L129):

```go
func buildAddCommentPermissions(config *AddCommentsConfig) *Permissions {
	permMap := map[PermissionScope]PermissionLevel{}
	if config == nil || config.Issues == nil || *config.Issues {
		permMap[PermissionIssues] = PermissionWrite
	}
	if config == nil || config.PullRequests == nil || *config.PullRequests {
		permMap[PermissionPullRequests] = PermissionWrite
	}
```

`config.Target` **không hề được đọc**. Kết quả đo trên 299 workflow đã sinh ra (PoC B):

| Khai báo                       | Quyền `safe_outputs` được sinh                               |
| ------------------------------ | ------------------------------------------------------------ |
| `add-comment`                  | **`issues: write` + `pull-requests: write`** (luôn cả hai)   |
| `create-issue`                 | `issues: write`                                              |
| `close-issue` + `create-issue` | `issues: write`                                              |
| `create-pull-request`          | `contents: write` + `issues: write` + `pull-requests: write` |
| `staged`                       | **`[]` — không quyền nào**                                   |

**Đây là câu trả lời cho sự cố #188.** GitHub dùng `/issues/{n}/comments` cho **cả** Issue lẫn PR, và
lúc biên dịch gh-aw không biết mục tiêu sẽ là gì, nên nó **cấp cả hai**. Nexagent trên `main` cấp
`issues: write` một mình (`src/permissions.mjs:138-160`) — và đó là cấu hình đã ăn 403 thật.

> **gh-aw tự mâu thuẫn với chính nó ở đúng điểm này.** Với _status-comment_ của activation trên một
> sự kiện pull request, nó cấp **chỉ `issues: write`** —
> [`compiler_activation_job.go:182`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/compiler_activation_job.go#L182):
> "Status comments for issue and pull request related events use issue comment endpoints." Khóa lại
> bằng [`activation_permissions_scope_test.go:700`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/activation_permissions_scope_test.go#L700),
> vốn assert **vắng mặt** `pull-requests: write`.
>
> Nghĩa là: tại cùng một SHA, công cụ của chính GitHub trả lời câu hỏi #188 theo **hai cách trái
> ngược**. Lập luận ở `src/permissions.mjs:114-127` của Nexagent khớp với nhánh _activation_; sự cố
> 403 thật khớp với nhánh _safe-output_. Đây là bằng chứng ngoài lề mạnh cho hướng đi của #191:
> quyền phải theo **loại tài nguyên**, và không nên suy chỉ từ hình dạng URL.

`add-reaction`: **NONE FOUND** — không phải một safe output của gh-aw.

## 7. Audit ranh giới an ninh

**Phần gh-aw làm tốt hơn Nexagent — nên học:**

Job `agent` không được có quyền ghi, và điều đó được cưỡng chế bằng **từ chối biên dịch**, không phải
bằng review YAML:
[`dangerous_permissions_validation.go:83`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/dangerous_permissions_validation.go#L83)
→ `"The agent job must not have write permissions."` Bài kiểm
`security_architecture_formal_test.go:273` khai `strict: false` + `contents: write` rồi assert
**không sinh ra YAML nào cả**.

Đo trên toàn bộ 299 workflow (PoC C): quyền ghi duy nhất từng thấy trên job `agent` là
`copilot-requests: write` (107×, hạn ngạch suy diễn LLM) và `id-token: write` (2×, OIDC). **Không
một lần nào** `issues`/`pull-requests`/`contents: write`.

Nexagent cưỡng chế cùng bất biến này bằng `tests/workflow-contract.test.mjs` đọc thẳng YAML — yếu
hơn một bậc so với việc trình biên dịch từ chối phát ra sản phẩm.

**Phần Nexagent làm tốt hơn gh-aw — không được sao chép:**

Job **đặc quyền** của gh-aw có checkout, và **không ghim ref tin cậy**.
[`compiler_safe_outputs_steps.go:43`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/compiler_safe_outputs_steps.go#L43)
bật `SetKeepCredentialsForPush(true)`; hàm `SetDefaultRefOverride`
([`checkout_manager.go:200`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/checkout_manager.go#L200))
**được định nghĩa nhưng không nơi nào gọi** — mã chết. Sản phẩm thật, `changeset.lock.yml:2231-2236`
(workflow chạy trên `pull_request`):

```yaml
- name: Checkout repository
  uses: actions/checkout@3d3c42e5... # v7.0.1
  with:
    persist-credentials: true
    token: ${{ secrets.GH_AW_GITHUB_TOKEN || secrets.GITHUB_TOKEN }}
```

Không `ref:` → giải ra ref của sự kiện (`refs/pull/N/merge`), trong một job cầm `contents: write` với
token đẩy được ghi ra đĩa. Chặn lại chỉ nhờ **fork guard mặc định** (`filters.go:146-152`) và role
gate — tức chính sách, không phải ranh giới.

Workflow của Nexagent **ghim tường minh** `ref: ${{ github.event.repository.default_branch }}`
(`.github/workflows/autopilot-orchestrator.yml:221`) và ghi rõ lý do fail-closed ở dòng 189-192.
**Nexagent nghiêm hơn ở đúng chỗ này.**

`pull_request_target`: gh-aw hỗ trợ nhưng **0/299** workflow dùng; cảnh báo (lỗi nếu `--strict`) khi
kèm checkout (`pull_request_target_validation.go:143,161-167`). Nexagent cấm thẳng trong tài liệu
workflow (dòng 33-34).

## 8. Audit idempotency / lỗi một phần

Kịch bản Nexagent đã gặp thật, và câu trả lời của gh-aw:

```text
comment → 201 OK
label   → 500 FAIL
chạy lại
→ gh-aw ĐĂNG COMMENT TRÙNG
```

- **Không khóa idempotency, không sổ ledger, không tra cứu trước khi ghi.**
  `add_comment.cjs:1021` gọi `createComment` vô điều kiện.
- Có marker (`generate_footer.cjs:16`) và **có** phân trang tìm marker
  (`add_comment.cjs:275-306`) — nhưng nối vào `hideOlderComments`, tức **thu nhỏ** comment cũ rồi
  **vẫn đăng cái mới**; mặc định tắt (`add_comment.cjs:495`).
- **Lỗi một phần:** vòng handler `catch` rồi **chạy tiếp**
  ([`safe_output_handler_manager.cjs:1226`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/actions/setup/js/safe_output_handler_manager.cjs#L1226));
  **không rollback**; job vẫn đỏ (`:1991`) — tức mời người vận hành chạy lại, và lần chạy lại sinh
  comment trùng.
- **Retry ≠ idempotency:** `error_recovery.cjs:219-235` gọi lại thao tác mà không khóa nào; HTML 500
  bị xếp là retryable (`:84`), nên một mutation đã thành công phía server nhưng mất phản hồi sẽ được
  gửi lại.
- **Phân trang fail-open** ở đường dedup của `create_issue`: tính được cờ truncated (`:581`), cảnh
  báo (`:602`), rồi **bỏ cờ đi** (`:608`).

Đối chiếu Nexagent: `idempotencyKeyFor()` sinh khóa cấp giao thức; `findPostedClaim()` soát **cả**
luồng comment trước khi đăng (`main.mjs:299`); `fetchAllComments()` **fail-closed** khi đọc thiếu
(`ledger.mjs:64,83`); `reconcileLabels()` hòa giải nhãn **mọi lần chạy** kể cả khi comment đã có
(`main.mjs:334`) — chính là đường sửa chữa của B5.

**gh-aw ở dưới yêu cầu B5/B6 của Nexagent, không phải ngang bằng.**

## 9. Audit làm sạch lỗi

Nexagent (repo **public**) yêu cầu: thân lỗi lạ/không phải JSON **không bao giờ** vào log.

gh-aw thay thế bằng metadata **chỉ khi** thân lỗi là HTML — `error_helpers.cjs:11-12,40`; mọi thứ
khác đi thẳng qua `return message;` (`:43`) rồi vào `core.error` / `setFailed`. Lớp redaction là
**denylist theo giá trị đã biết** (`redact_secrets.cjs:49,215`), không có đường allowlist/drop-unknown.
`create_pull_request.cjs:2051-2058` in **toàn bộ patch hỏng** ra log, không cắt.

Nexagent trên `main` **bỏ hẳn thân lỗi**: `github.mjs:43` chỉ parse khi `response.ok`, ngược lại
`body: null`. An toàn tối đa, nhưng khó chẩn đoán — và đó chính là cái #191 đang sửa. Khi #191 vào,
đây là **chỗ duy nhất** Nexagent nên soi kỹ gh-aw như một ví dụ **phản diện**.

## 10. Xác thực / chi phí

Câu hỏi §5 của hợp đồng task — "gh-aw có hỗ trợ `CLAUDE_CODE_OAUTH_TOKEN` không?" — **có hai câu trả
lời khác nhau**, tùy đi đường nào. Đo bằng cách **biên dịch thật** (PoC D), không bằng đếm chuỗi.

### 10.1 Đường A — engine `claude` dựng sẵn: **KHÔNG**

| Câu hỏi                              | Trả lời                                                            | Bằng chứng                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tên bí mật lấy từ đâu?               | Từ **nhà cung cấp**, không từ cấu hình người dùng                  | [`claude_engine.go:70`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/claude_engine.go#L70)                             |
| Với Anthropic là tên gì?             | **`ANTHROPIC_API_KEY`** — danh sách một phần tử, đóng              | [`llm_provider.go:91`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/llm_provider.go#L91)                               |
| Tiêm token qua `engine.env` được?    | **Không** — trình biên dịch **từ chối**, không phải bỏ qua         | [`strict_mode_env_validation.go:140`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/strict_mode_env_validation.go#L140) |
| Bedrock / Vertex cho Claude?         | **NONE FOUND**                                                     | —                                                                                                                                                                    |
| Anthropic WIF?                       | Có — bỏ được _bí mật_, **không** bỏ được _mô hình tính phí_        | `claude_engine.go:102-108`                                                                                                                                           |
| Gọi `anthropics/claude-code-action`? | **Không** — cài CLI npm `@anthropic-ai/claude-code` ghim phiên bản | [`version_constants.go:35`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/constants/version_constants.go#L35)                    |

PoC D biên dịch một workflow `engine: claude` có `engine.env.CLAUDE_CODE_OAUTH_TOKEN`: **không sinh
ra tệp `.lock.yml` nào**, lỗi nói thẳng _"Use engine-specific secret configuration instead."_

### 10.2 Đường B — behavior-defined engine: **CÓ**

Đây là điều bản đầu bỏ sót. `EngineDefinition.Auth` nhận **tên bí mật bất kỳ**, và trình biên dịch
mang nó đi trọn đường:

| Bước                            | Cơ chế                                                            | Bằng chứng                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Khai báo                        | `auth: [{ role, secret }]` — không danh sách trắng                | [`engine_definition.go:292`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/engine_definition.go#L292)             |
| Nhận diện tệp dùng chung        | Khối `behaviors` ⇒ **định nghĩa engine**, không phải lỗi cấu hình | [`engine_validation.go:166`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/engine_validation.go#L166)             |
| Vào danh sách bí mật bắt buộc   | `addSecret(binding.Secret)`                                       | [`behavior_defined_engine.go:113`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/behavior_defined_engine.go#L113) |
| Tiêm vào env bước chạy tác nhân | `env[binding.Secret] = "${{ secrets.… }}"`                        | [`behavior_defined_engine.go:599`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/behavior_defined_engine.go#L599) |
| Sống sót qua bộ lọc bí mật      | `FilterEnvForSecrets(env, GetRequiredSecretNames(…))`             | [`behavior_defined_engine.go:653`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/behavior_defined_engine.go#L653) |
| Bộ lọc đó làm gì                | Chặn mọi `${{ secrets.* }}` ngoài danh sách cho phép              | [`engine_helpers.go:479`](https://github.com/github/gh-aw/blob/82239c030d6a1ef6ec8b87a80a1346eeef211f8d/pkg/workflow/engine_helpers.go#L479)                   |

**Kết quả biên dịch thật** (PoC D, `fixtures/engine-auth-paths.json`) — engine tự định nghĩa gắn
`auth: [{ role: api-key, secret: CLAUDE_CODE_OAUTH_TOKEN }]`, workflow khai `add-comment` +
`add-labels`:

| Đo được                               | Kết quả                                                              |
| ------------------------------------- | -------------------------------------------------------------------- |
| Biên dịch                             | **thành công**, sinh `.lock.yml` ~110 KB                             |
| Token tới bước chạy tác nhân          | **có** — `agent:env-binding`                                         |
| Vào danh sách che của tường lửa       | **có** — `GH_AW_SECRET_NAMES` + `SECRET_CLAUDE_CODE_OAUTH_TOKEN`     |
| `ANTHROPIC_API_KEY` trong tệp sinh ra | **0 lần**                                                            |
| Quyền job `agent`                     | `read-all` — ranh giới B4 **không suy suyển**                        |
| Quyền job `safe_outputs`              | `issues: write` + `pull-requests: write` — **y như engine dựng sẵn** |
| `safe_outputs.needs`                  | `activation, agent, detection` — **vẫn dính chặt agent**             |
| Bộ công cụ Safe Outputs               | `add_comment`, `add_labels`, … — **không mất gì**                    |
| Cổng an ninh của trình biên dịch      | **vẫn kêu**: _"New restricted secret(s): CLAUDE_CODE_OAUTH_TOKEN"_   |

`CLAUDE_MAX_OAUTH = SUPPORTED_VIA_BEHAVIOR_DEFINED_ENGINE`.

### 10.3 Cái giá của đường B — vì sao nó không cứu HYBRID

Đi đường B **không** miễn cho ta thứ gì đã loại HYBRID; nó chỉ xóa một lý do và thêm chi phí:

- Ta phải **tự viết và tự nuôi một định nghĩa engine** (install steps · execution args · harness
  script · log parser). Tám định nghĩa engine tự viết trong chính kho gh-aw dài **120–331 dòng**
  frontmatter (trung vị ~196) — cùng cỡ với toàn bộ phần mutation của Nexagent mà HYBRID định xóa
  (~290 dòng, §13). Bản PoC D tối giản **32 dòng** chỉ đủ để **đo**, không đủ để chạy thật: nó chưa
  có harness script lẫn log parser.
- **8/8** định nghĩa engine trong kho gh-aw mang `experimental: true`, và trình biên dịch in cảnh báo
  `⚠ Using experimental … support` mỗi lần biên dịch — PoC D nhận đúng cảnh báo đó.
- Catalog engine dùng chung được **tải về từ `refs/heads/main`** lúc biên dịch
  (`engine_definition.go:367`) — một mặt phẳng cấu hình **trôi**, ngay giữa một quy trình mà ta ghim
  SHA ở mọi chỗ khác.
- Và điều quyết định: `safe_outputs` **vẫn** `needs: agent`. Muốn dùng Safe Outputs thì vẫn phải chạy
  vòng đời agent của gh-aw — tức thay cả workflow orchestrator, không phải chỉ mượn tầng mutation.

## 11. Tương thích reviewer ChatGPT

Reviewer của Nexagent là một **ngữ cảnh ChatGPT thường**, không phải agent trong workflow. Verdict về
repo dưới danh tính app, rồi `principalFromGithubEvent` (`principal.mjs:77-93`) ưu tiên
`performed_via_github_app.slug` hơn `user.login` — nhờ đó **một tài khoản GitHub cho ra hai principal
khác nhau**, và một repo một chủ vẫn thỏa được phân lập nhiệm vụ.

gh-aw **không có đối ứng nào**: không principal→vai, không phân lập nhiệm vụ, không khái niệm người
duyệt ngoài. Role check của nó (`role_checks.go:149-151`) hỏi "actor có quyền write không" — một câu
hỏi khác hẳn.

`SAFE_OUTPUTS_STANDALONE` = `PARTIAL`, nên câu hỏi "gh-aw có mang được carrier mà không bắt reviewer
thành agent gh-aw không" trả lời là **không, ở mức workflow**. Mặt phẳng reviewer **KEEP CUSTOM**.

## 12. Đánh giá chuỗi cung ứng

| Trục             | Kết quả                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Giấy phép        | MIT — **tương thích**                                                    |
| Ghim SHA action  | **Có**, gh-aw tự ghim action của nó bằng SHA + manifest                  |
| Nhịp phát hành   | **17 bản/30 ngày** (~1 bản/1,8 ngày)                                     |
| Tag ổn định?     | `v0.88.4` trỏ vào commit tiêu đề `[WIP]`                                 |
| Xuất bản npm?    | **Không** — không `package.json` gốc; `@github/gh-aw` 404                |
| Sản phẩm sinh ra | ~95KB YAML mỗi workflow, JS nội tuyến → **diff rất ồn**                  |
| Fork bắt buộc?   | Không cho mức workflow; **có** trên thực tế nếu muốn dùng ở mức thư viện |

Không có npm là điểm quyết định cho HYBRID: tái sử dụng ở mức thư viện = **vendor mã nguồn không
phiên bản** từ một kho đổi mỗi 1,8 ngày, rồi tự gánh việc theo dõi advisory cho nó.

**So sánh 12 tháng:**

- **RỦI RO TỰ XÂY** — 9.056 LOC ta tự chịu. Nhưng bề mặt **đóng và nhỏ**: đúng 3 lời gọi ghi
  (`WRITE_CALLS`), và các lớp lỗi tốn kém nhất (B1, B3, B4, B5, B6, B7) **đã trả tiền rồi** và đã có
  bài kiểm khóa lại.
- **RỦI RO PHỤ THUỘC** — nhận một trình biên dịch Go 99k LOC + ~3,5k LOC `.cjs`, không hợp đồng
  phiên bản, nhịp 1,8 ngày/bản, để đổi lấy ~290 LOC (§13) — **và vẫn phải tự viết lại** idempotency,
  fail-closed, làm sạch lỗi, vì gh-aw không có hoặc yếu hơn ở cả ba.

**Tự xây rẻ hơn trong 12 tháng tới.** Đây không phải kết luận mặc định vì sợ phụ thuộc — nó là kết
luận vì phần ta muốn mượn lại đúng là phần gh-aw không cung cấp.

## 13. Kiểm kê mã & LOC xóa được

| Mô-đun                                         |   LOC | Trách nhiệm                     | Đối ứng gh-aw                | Quyết định            |
| ---------------------------------------------- | ----: | ------------------------------- | ---------------------------- | --------------------- |
| `src/main.mjs`                                 |   351 | Điều phối, gọi ghi              | một phần                     | **KEEP**              |
| `src/events.mjs`                               |   224 | 3 trigger → mục tiêu            | `NONE`                       | **KEEP**              |
| `src/decide.mjs`                               |   218 | Quyết định thuần, exact-SHA     | `NONE`                       | **KEEP**              |
| `src/permissions.mjs`                          |   177 | `WRITE_CALLS`→`MUTATION_GRANTS` | `PermissionBuilder`          | **PORT_PATTERN_ONLY** |
| `src/inbox.mjs`                                |   144 | Tra cứu + chống trùng           | `NONE`                       | **KEEP**              |
| `src/evidence.mjs`                             |   134 | Bằng chứng CI                   | `NONE`                       | **KEEP**              |
| `src/registry.mjs`                             |   108 | principal→vai                   | `NONE`                       | **KEEP**              |
| `src/labels.mjs`                               |   100 | Hòa giải nhãn khôi phục được    | `add_labels`/`remove_labels` | **ADAPTER_REQUIRED**  |
| `src/reasons.mjs`                              |    95 | Mã lý do                        | `NONE`                       | **KEEP**              |
| `src/preflight.mjs`                            |    94 | Đo quyền token thật             | `NONE`                       | **KEEP**              |
| `src/ledger.mjs`                               |    88 | Phân trang fail-closed          | có, **fail-open**            | **KEEP**              |
| `src/github.mjs`                               |    45 | Client HTTP duy nhất            | —                            | **KEEP**              |
| `src/mutations.mjs`                            |    39 | Công tắc ghi fail-closed        | `staged:` (mạnh hơn)         | **PORT_PATTERN_ONLY** |
| `tools/autopilot-protocol/**`                  | 4.776 | Giao thức V0 + schema + kiểm    | `NONE`                       | **KEEP**              |
| `.github/workflows/autopilot-orchestrator.yml` |   239 | Cấu trúc job + quyền            | `.lock.yml` sinh ra          | **KEEP**              |
| Bài kiểm orchestrator                          | 2.224 |                                 |                              | **KEEP**              |

```text
custom LOC xóa được ngay        : ~0
custom LOC xóa được sau adapter : ~290   (labels.mjs 100 + WRITE_CALLS/MUTATION_GRANTS ~175
                                          + lời gọi POST comment ~15)
custom LOC bắt buộc giữ         : ~8.766
adapter phải viết mới           : ~300–400
```

Bộ chuyển đổi trong PoC đã là **100 LOC** chỉ để ánh xạ hình dạng, **chưa** gồm lớp bọc fail-closed
cho cấu hình xác thực và lớp idempotency mà gh-aw không có. **Cân bằng LOC là âm.**

## 14. Bằng chứng PoC

Tất định, không bí mật, không gọi mạng lúc chạy, không ghi GitHub. **30/30 bài kiểm xanh.**
Xem [`tools/poc-gh-aw-evaluation/`](../../../tools/poc-gh-aw-evaluation/README.md).

- **PoC A** — cả 5 `.cjs` nạp **và chạy** trong Node trần; ba trạng thái cấu hình chứng minh
  fail-open. Bộ chuyển đổi V0→gh-aw phát hiện **3 khoảng trống**:
  `IDEMPOTENCY_KEY_HAS_NO_CARRIER`, `LABEL_RECONCILE_ORDER_NOT_EXPRESSIBLE`,
  `ABSENT_LABEL_IS_SUCCESS_NOT_EXPRESSIBLE`.
- **PoC B** — parity quyền trên 299 workflow sinh ra, gồm cả `staged: → []`.
- **PoC C** — ranh giới không-tin-cậy/được-ghi trên 299 workflow.
- **PoC D** — **biên dịch thật** bằng chính trình biên dịch gh-aw tại SHA đã ghim. Hai đường tới
  Claude Max OAuth cho hai kết quả trái ngược: behavior-defined engine **chạy được** và giao đúng
  `CLAUDE_CODE_OAUTH_TOKEN` (0 lần `ANTHROPIC_API_KEY`); `engine.env` trên engine dựng sẵn **bị từ
  chối lúc biên dịch**. Cùng lúc đo lại rằng đổi engine **không** gỡ được `safe_outputs → needs:
agent` và **không** làm yếu ranh giới B4. Đây là phép đo đã **rút** lập luận OAuth khỏi §16.

`derive-fixtures.mjs` sinh lại mọi fixture từ một clone ghim SHA và **từ chối chạy** nếu clone sai
SHA, nên fixtures không thể lặng lẽ trôi khỏi upstream. Ba fixture đầu chỉ cần một clone; PoC D cần
thêm một nhị phân `gh-aw` dựng từ chính clone đó (`GH_AW_BIN=…`) — tách ra để người kiểm chứng được
phần lớn bằng chứng mà không phải cài Go.

**Hợp đồng bằng chứng** (§2) là bài kiểm thứ năm: 22 khẳng định dẫn đến quyết định phải vừa **còn
đúng ở upstream** vừa **có mặt trong tài liệu này** dưới dạng permalink ghim SHA.

## 15. So sánh rủi ro

|                         | Tự xây (hôm nay)                | Hybrid gh-aw                                              |
| ----------------------- | ------------------------------- | --------------------------------------------------------- |
| Bug quyền               | Ta chịu; khóa bởi hợp đồng tĩnh | gh-aw chịu — nhưng nó **thừa quyền** và tự mâu thuẫn      |
| Idempotency             | **Đã giải quyết** (B5)          | **Không có** — phải tự viết lại                           |
| Fail-closed             | Bất biến xuyên suốt             | **Fail-open** mặc định — phải tự bọc                      |
| Làm sạch lỗi            | Bỏ hẳn thân lỗi                 | Denylist — **yếu hơn** cho repo public                    |
| Ranh giới không tin cậy | Hợp đồng tĩnh trên YAML         | **Từ chối biên dịch** — mạnh hơn ✅                       |
| Ghim checkout đặc quyền | Ghim `default_branch` ✅        | **Không ghim** — yếu hơn                                  |
| Claude Max OAuth        | Giữ được                        | Giữ được — nhưng phải **tự nuôi một engine** experimental |
| Reviewer ChatGPT ngoài  | Giữ được                        | Không có đối ứng                                          |
| Chuỗi cung ứng          | Đóng, nhỏ                       | 99k LOC Go + 3,5k `.cjs`, không npm, 1,8 ngày/bản         |

## 16. Quyết định

```text
KEEP_CUSTOM
```

Theo §15 hợp đồng task, chọn `KEEP_CUSTOM` khi **một hoặc nhiều** điều đúng. Ở đây **ba** điều đúng:

1. Safe Outputs **không tách được** khỏi mô hình agent của gh-aw — 299/299 workflow upstream, và
   workflow **PoC D tự biên dịch** bằng một engine hoàn toàn khác cũng vậy.
2. Idempotency/khôi phục **yếu hơn** yêu cầu hiện tại (B5/B6) — gh-aw at-least-once, không rollback.
3. Ngữ nghĩa exact-SHA và reviewer ngoài **không có đối ứng** để bảo toàn.

Cộng thêm: LOC xóa được (~290) **nhỏ hơn** adapter phải viết (~300–400), trong khi chi phí chuỗi cung
ứng tăng đáng kể.

**Điều KHÔNG còn nằm trong danh sách:** "phải bỏ Claude Max OAuth". PoC D chứng minh gh-aw giao được
`CLAUDE_CODE_OAUTH_TOKEN` qua behavior-defined engine (§10.2), nên lập luận đó đã bị **rút**. Nó
không đổi kết luận vì ba điều trên đều là phép đo độc lập, và vì bản thân đường OAuth ấy lại **thêm**
một định nghĩa engine experimental phải tự nuôi (§10.3) — nó dời chi phí chứ không xóa chi phí.

---

# ADR — Không dùng gh-aw làm substrate mutation; mượn hai khuôn mẫu

## Decision

**KEEP_CUSTOM.** Giữ nguyên mặt phẳng mutation của Nexagent. **Không** thêm gh-aw vào production.
Mượn đúng **hai khuôn mẫu** (§Consequences), viết bằng mã của ta.

Đây **không** phải `ADOPT`. Task này chỉ có bằng chứng spike.

## Context

Nexagent tự xây một control plane GitHub và trong quá trình đó tự phát hiện 7 lớp lỗi (B1–B7 của
PR #167, và sự cố 403 thật ở #188). Sau đó mới biết `github/gh-aw` có kiến trúc
`agent read-only → structured output → validated Safe Outputs → privileged mutation` rất gần phần ta
đang tự xây. Câu hỏi: ta đang tự xây lại cái GitHub đã làm tốt hơn ở đâu?

## Options

1. **KEEP_CUSTOM** — giữ, chỉ mượn khuôn mẫu.
2. **HYBRID_GH_AW_SAFE_OUTPUTS** — giữ ngữ nghĩa Protocol V0, mượn Safe Outputs/permission machinery.
3. **MIGRATE_MORE_TO_GH_AW** — thay phần lớn control plane.

## Evidence

- `CLAUDE_CODE_OAUTH_TOKEN`: engine `claude` dựng sẵn **không** nhận (`llm_provider.go:91`,
  `strict_mode_env_validation.go:140`), nhưng **behavior-defined engine thì có** — PoC D biên dịch
  thật và tệp sinh ra giao đúng token, 0 lần `ANTHROPIC_API_KEY` (§10.2). **Không** còn là lý do
  loại (2)/(3); cái còn lại là **chi phí**: một định nghĩa engine experimental phải tự nuôi (§10.3).
- `safe_outputs` luôn `needs: agent` (`compiler_jobs.go:355`, `compiler_safe_outputs_job.go:733`),
  299/299 **và cả trên workflow PoC D tự biên dịch** → loại (2) ở mức workflow.
- Không xuất bản npm (`@github/gh-aw` → 404) → loại (2) ở mức thư viện.
- Không idempotency (`add_comment.cjs:1021`), không rollback
  (`safe_output_handler_manager.cjs:1226`) → gh-aw dưới mức B5.
- Xác thực fail-open khi thiếu/hỏng cấu hình (`safe_output_type_validator.cjs:251-256`) → ngược bất biến.
- Checkout đặc quyền không ghim ref (`changeset.lock.yml:2231-2236`) → Nexagent nghiêm hơn.
- Ranh giới agent read-only cưỡng chế lúc biên dịch
  (`dangerous_permissions_validation.go:83`) → **gh-aw mạnh hơn**, đáng mượn.
- `add-comment` → cả hai quyền (`add_comment.go:129-141`), mâu thuẫn với
  `compiler_activation_job.go:181-186` → bằng chứng ngoài lề cho #191.

## Consequences

**Giữ nguyên** (§7 hợp đồng task): Protocol V0, exact HEAD SHA, `principalFromGithubEvent`,
`PrincipalRegistry`, phân lập builder≠reviewer, cổng người duyệt HIGH, runtime proof, reviewer
ChatGPT thường, Conversation Bridge, đường Claude Max OAuth — đường OAuth giữ **vì workflow hiện tại
đã chạy được nó bằng mã của ta**, không phải vì gh-aw không làm được.

**Mượn hai khuôn mẫu, viết bằng mã của ta** (là công việc _sau_ task này, không làm ở đây):

1. **Cưỡng chế "job agent không được ghi" ở tầng sinh/kiểm, không ở tầng review.** gh-aw _từ chối
   phát ra YAML_; `tests/workflow-contract.test.mjs` của ta chỉ _đọc_ YAML. Nâng lên cùng mức.
2. **`staged:` mạnh hơn `AUTOPILOT_DRY_RUN`.** gh-aw chạy khô bằng khối `permissions:` **rỗng** —
   ranh giới GitHub cưỡng chế; ta chạy khô bằng một biến môi trường mà mã nguồn có thể bỏ qua.

**Không mượn:** checkout của job đặc quyền (không ghim ref), và mặc định fail-open của tầng xác thực.

**Cái giá:** ta tiếp tục tự chịu 9.056 LOC control plane, gồm mọi bug quyền/idempotency tương lai.
Nói thẳng: đây là một cái giá có thật, và nó được chấp nhận vì phần đắt nhất đã trả xong và đã khóa
bằng bài kiểm.

## Rollback

Quyết định này **không tạo ra thay đổi runtime nào**, nên không có gì để rollback theo nghĩa vận
hành. Đảo lại quyết định = xóa `tools/poc-gh-aw-evaluation/` và tài liệu này, không ảnh hưởng
production.

Điều kiện **mở lại** đánh giá — bất kỳ điều nào:

- gh-aw tách Safe Outputs thành action/gói dùng được **không cần agent job**;
- gh-aw thêm idempotency thật (khóa + tra cứu trước khi ghi), không phải retry;
- tầng xác thực Safe Outputs đổi mặc định thành **fail-closed** khi thiếu/hỏng cấu hình;
- gh-aw xuất bản runtime JS có phiên bản lên npm;
- engine `claude` **dựng sẵn** nhận `CLAUDE_CODE_OAUTH_TOKEN` — lúc đó đường OAuth không còn phải đi
  qua một định nghĩa engine `experimental` tự nuôi (§10.3).

> Điều kiện "gh-aw hỗ trợ `CLAUDE_CODE_OAUTH_TOKEN`" **đã bị bỏ khỏi danh sách này**, vì PoC D chứng
> minh nó **đã đúng** ở SHA đang audit — qua behavior-defined engine. Một điều kiện mở-lại đã thành
> hiện thực mà quyết định không đổi thì nó chưa bao giờ là điều kiện thật; giữ lại chỉ khiến tài liệu
> tự mâu thuẫn.
