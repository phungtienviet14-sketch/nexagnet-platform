# Autopilot V3 — Phase A: cloud builder (Claude Max trên GitHub Actions)

> Hợp đồng: [#362](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/362) · kiến trúc:
> [#361](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/361) · quyết định:
> [ADR-0002](../../kien-truc/adr-0002-autopilot-v3-github-native.md)
> Workflow: [`.github/workflows/claude-builder.yml`](../../../.github/workflows/claude-builder.yml) ·
> cổng + test bất biến: [`tools/autopilot-v3/`](../../../tools/autopilot-v3/README.md)
> Đo lần đầu: **22/09/2026** trên `main` = `ea178ecf9863271f5a3d21edb064cea1a11eddb7`

```text
Issue do CHỦ REPO tạo
  └─ CHỦ REPO gắn nhãn `agent:claude`                 kích hoạt tường minh; nhãn KHÔNG phải thẩm quyền
      └─ job gate   · if: trên event payload          GitHub chấm TRƯỚC khi cấp runner
         (không secret, token chỉ đọc)  · gate.mjs: đọc lại Issue + quyền qua API, mã lý do có kiểu
          └─ job build · ubuntu-24.04 GitHub-hosted, dùng một lần
              ├─ token App `nexagent-autopilot` 1 giờ: contents/issues/pull-requests (KHÔNG workflows)
              ├─ anthropics/claude-code-action v1.0.231 · CLAUDE_CODE_OAUTH_TOKEN (gói Claude Max)
              │    nhánh `autopilot-v3/issue-<số>-<thời điểm>`, commit qua API (App ký)
              └─ bước TẤT ĐỊNH mở PR draft ──► CI thường (7 check bắt buộc) ──► người merge
```

PC Windows chỉ dùng để dựng và cấu hình. **Không** có tiến trình nào chạy thường trực trên máy.

---

## 0. Trạng thái — PROVEN / CONFIG_ONLY / NOT_PROVEN

| # | Mệnh đề | Mức | Đo bằng |
|---|---|---|---|
| P1 | Cổng từ chối mọi đường không tin cậy đã mô hình hoá (người lạ gắn nhãn, App/bot gắn nhãn, Issue của người lạ, trùng login khác ID, re-run bởi người khác, nhãn khác, Issue đã đóng, nhãn đã gỡ, mất quyền admin, API lỗi) | **PROVEN** (mức unit) | `node --test tools/autopilot-v3/gate.test.mjs` — 17/17 |
| P2 | Cấu hình workflow giữ đúng 13 bất biến (§2, §3) | **PROVEN** (mức cấu hình) | `tools/autopilot-v3/claude-builder.contract.test.mjs` + đột biến có kiểm soát ([README](../../../tools/autopilot-v3/README.md)) |
| P3 | Workflow hợp lệ theo actionlint, script `run:` sạch theo shellcheck | **PROVEN** | actionlint 1.7.12 + shellcheck 0.11.0 (tải từ release chính thức, đã đối chiếu SHA-256); đối chứng âm trên bản sao bị làm hỏng → bắt được |
| P4 | Ba action ghim đúng commit của tag upstream | **PROVEN** | `gh api repos/<action>/git/ref/tags/<tag>` (bảng §3.3) |
| P5 | Trạng thái repo lúc đo: public; ruleset `main-protection` có hiệu lực (`deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`), `bypass_actors: []`; `default_workflow_permissions: read`; chủ repo là collaborator duy nhất, quyền `admin` | **PROVEN** (đo 22/09/2026) | `gh api .../rules/branches/main`, `.../actions/permissions/workflow`, `.../collaborators` |
| C1 | Job `gate` + `build` chạy đúng trên GitHub | **CONFIG_ONLY** | Chưa chạy được trước khi merge: sự kiện `issues` chỉ chạy bản workflow trên nhánh mặc định |
| C2 | Phiên Claude bị chặn Bash/Web, chặn đọc ngoài workspace, chặn sửa `.github/`/`deploy/`/`tenants/` | **CONFIG_ONLY** | Cấu hình theo tài liệu Claude Code (§3.4); chưa quan sát trong một lần chạy thật |
| N1 | `CLAUDE_CODE_OAUTH_TOKEN` còn hiệu lực hôm nay | **NOT_PROVEN** | Secret tồn tại từ `2026-09-02T17:54:27Z`; lần dùng thành công cuối biết được: run `33673011449` (02/09/2026, PoC "Claude Max OAuth Smoke") |
| N2 | Installation của App `nexagent-autopilot` có `issues: write` + `pull_requests: write` | **ĐO ĐƯỢC: CHƯA CÓ** | Run thăm dò `35706715269` (22/09/2026, nhánh bỏ đi đã xoá): mint `contents: write` → **thành công**; `issues: write` và `pull_requests: write` → GitHub từ chối *"The permissions requested are not granted to this installation"*. Chủ repo phải cấp — §5 bước 1. Chưa cấp thì job `build` dừng ngay ở bước "Token App ngắn hạn", trước khi Claude chạy |
| N3 | Một Issue thật khởi động đúng MỘT lần chạy cloud, Claude sửa, PR draft, CI chạy | **NOT_PROVEN** | Pilot sau merge (§6) |
| N4 | Kích hoạt không tin cậy không khởi động job có secret — đo trên GitHub thật | **NOT_PROVEN** | Pilot âm sau merge (§6.3) |
| N5 | Review ngữ nghĩa độc lập, vòng sửa có giới hạn, cổng leo thang rủi ro, bằng chứng release, xoá legacy | **NOT_PROVEN** | Phase B/C/D của #361 — ngoài phạm vi Phase A |

---

## 1. Vì sao chọn đúng đường này

| Lựa chọn | Kết luận | Lý do đo được |
|---|---|---|
| `anthropics/claude-code-action` + `claude_code_oauth_token` | **CHỌN** | Upstream hỗ trợ trực tiếp token của gói Pro/Max tạo bằng `claude setup-token`; chạy trên runner GitHub-hosted; tính vào quota gói, không vào hoá đơn API |
| App `claude` chính thức (trao đổi OIDC) | **KHÔNG** | Bắt buộc `id-token: write` cho job chứa agent; provider GCP WIF của repo nhận token OIDC từ mọi workflow của repo (`deploy/netviet/setup-github-oidc.sh`, `attribute-condition` chỉ so `assertion.repository`). App `claude` còn mang quyền `workflows`, `actions`, `repository_hooks` |
| App tự tạo `nexagent-autopilot` qua `actions/create-github-app-token` | **CHỌN** | Upstream hỗ trợ; xin đúng ba quyền; commit/PR của App **kích hoạt CI** (đo PR #151: 7 job chạy, không kẹt `action_required`) — `GITHUB_TOKEN` thì không (PR #136) |
| gh-aw làm nền coding agent | **KHÔNG** (Phase A) | gh-aw bỏ qua `CLAUDE_CODE_OAUTH_TOKEN` (ADR-0001, đo 16/09/2026) |
| Dispatcher/daemon trên PC | **KHÔNG** | #361 cấm hồi sinh; máy này chỉ để cấu hình |

---

## 2. Ranh giới tin cậy — repo PUBLIC

**Thẩm quyền = danh tính người gắn nhãn, so theo ID tài khoản.** Không phải tên nhãn, không phải chữ
trong Issue. Bốn lớp, lớp sau không thay lớp trước:

1. **`if:` của job `gate`** — GitHub chấm trên event payload **trước khi cấp runner**: đúng nhãn
   `agent:claude`; người gắn là `User` **và** `sender.id == repository_owner_id`; tác giả Issue có
   `user.id == repository_owner_id`; `triggering_actor` là chủ repo (chặn re-run bởi người khác); Issue
   đang mở. Sai một điều kiện → job **skip**, không runner, không secret.
2. **`tools/autopilot-v3/gate.mjs`** trong job `gate` (token chỉ đọc, **không** secret): đọc lại Issue và
   quyền của người gắn qua API; từ chối với mã có kiểu nếu Issue đã đóng, nhãn đã bị gỡ, Issue không
   khớp, người gắn không còn `admin`, hoặc API lỗi (fail closed). Job `build` chỉ chạy khi
   `authorized == 'true'`.
3. **Kiểm của chính action**: người kích hoạt phải có quyền ghi và là người (không phải bot).
4. **Đầu vào của Claude**: chỉ comment của chủ repo (`include_comments_by_actor`); action bỏ phần thân
   Issue bị sửa sau thời điểm kích hoạt.

| Đầu vào công khai | Kết quả |
|---|---|
| Người lạ mở Issue / comment / sửa chữ của mình | Không có sự kiện `issues.labeled` với nhãn này; workflow không nghe `issue_comment` |
| Người lạ mở PR từ fork | Workflow không nghe `pull_request`/`pull_request_target` |
| Chủ repo gắn nhãn lên Issue **của người lạ** | `gate` skip ở lớp 1 (`ISSUE_AUTHOR_NOT_OWNER` ở lớp 2) |
| App/bot gắn nhãn (kể cả App của repo) | `gate` skip (`SENDER_NOT_USER`) |
| Biểu mẫu Issue tự gắn nhãn khi người lạ tạo Issue | Người gắn là người lạ → skip; **và** test cấm mọi biểu mẫu tự gắn `agent:claude` |
| Người lạ comment chỉ dẫn độc hại lên Issue của chủ repo | Comment **không** vào prompt (`include_comments_by_actor`) |
| Chạy lại (re-run) một lần chạy cũ | Chỉ người có quyền ghi re-run được; `triggering_actor` phải là chủ repo |

> ⚠️ **Nhãn `agent:ready` KHÔNG dùng được cho V3.** Nó là trigger của pilot gh-aw V2 và đang được gắn cho
> các Issue Transport (#334, #336, #340, #341, #358). Test khoá điều đó.

---

## 3. Quyền và bề mặt

### 3.1 Token

| Job | Token | Quyền | Ghi chú |
|---|---|---|---|
| `gate` | `GITHUB_TOKEN` | `contents: read`, `issues: read` | Không secret. Sparse checkout đúng `tools/autopilot-v3` của nhánh mặc định |
| `build` | `GITHUB_TOKEN` | **không có** (`permissions: {}`) | Mọi thao tác ghi dùng token App |
| `build` | token App `nexagent-autopilot` | `contents: write`, `issues: write`, `pull-requests: write` | Hết hạn sau 1 giờ, bị thu hồi ở cuối job. **Không** `workflows` → agent không đẩy được thay đổi `.github/workflows/**` |
| `build` | `id-token` | **không cấp** | Xem §1 |

Nhánh `main`: ruleset `main-protection`, `bypass_actors: []` → token App không push thẳng được, như mọi
danh tính khác. **Workflow này không nới bất kỳ check bắt buộc nào.**

### 3.2 Secret

| Tên | Dùng ở | Lộ cho |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | job `build`, bước Claude | Tiến trình Claude Code (bắt buộc để xác thực) |
| `NEXAGENT_AUTOPILOT_PRIVATE_KEY` | job `build`, bước mint token App | Action `create-github-app-token` |

Bước kiểm cấu hình chỉ đọc `secrets.X != ''` (ra `true`/`false`), không đưa giá trị secret vào môi trường.

### 3.3 Bản ghim (audit 22/09/2026)

| Action | Tag | Commit ghim |
|---|---|---|
| `anthropics/claude-code-action` | `v1.0.231` (19/09/2026, mới nhất) | `cfc3eb22bfed5c26ef66e3223c982af27e4524de` |
| `actions/create-github-app-token` | `v3.2.0` (mới nhất) | `bcd2ba49218906704ab6c1aa796996da409d3eb1` |
| `actions/checkout` | `v7.0.1` (mới nhất) | `3d3c42e5aac5ba805825da76410c181273ba90b1` |

`v1.0.231` cài Claude Code `2.1.278`. Nâng bản = sửa workflow **và** bảng này **và** `AUDITED_PINS` trong
test; test đỏ nếu ba chỗ lệch nhau.

### 3.4 Phiên Claude được làm gì

- **Được**: Read/Glob/Grep/LS trong workspace; sửa tệp trong workspace; commit qua API
  (`use_commit_signing: true` → không có Bash nào, commit được App ký); cập nhật comment theo dõi.
- **Bị cấm** (qua `settings`, deny có hiệu lực từ mọi nguồn settings): `Bash`, `WebFetch`, `WebSearch`,
  đọc `.git/**` (URL remote có token), sửa `.github/**`, `deploy/**`, `tenants/**`; sửa **mặt phẳng
  điều khiển của chính agent** — `.claude/**`, `.mcp.json` (action bật `enableAllProjectMcpServers`),
  `tools/autopilot-v3/**` — để một lần chạy không nới lỏng được lần chạy sau qua một PR; đọc mọi thứ
  ngoài workspace (`blockReadsOutsideWorkingDirectories`, Claude Code ≥ 2.1.257).
- Luật đường dẫn **chỉ** viết bằng `Edit(...)`/`Read(...)`: theo tài liệu permissions của Claude Code,
  `Edit(path)` phủ mọi công cụ sửa tệp (Write, MultiEdit, NotebookEdit); luật `Write(path)` được nhận
  nhưng **không bao giờ được xét**. Test cấm viết loại luật đó.
- **`.claude/settings.json` của repo đặt `defaultMode: bypassPermissions`** — không lọt vào runner: từ
  Claude Code 2.1.257 giá trị đó không có hiệu lực khi đến từ settings của project, và action truyền
  `--permission-mode acceptEdits` qua dòng lệnh (ưu tiên cao hơn mọi tệp settings).
- **Không bước nào SAU agent chạy mã từ workspace** (lúc đó workspace là cây agent vừa sửa). Bước mở PR
  chỉ dùng `gh`/`jq` của runner. Test khoá điều này.
- Giới hạn: `--max-turns 40`, `timeout-minutes: 30`, mỗi Issue một lần chạy tại một thời điểm.

---

## 4. Xác thực Claude Max và chi phí

- `CLAUDE_CODE_OAUTH_TOKEN` là token OAuth **một năm** sinh bằng `claude setup-token` (gói Pro/Max/Team/
  Enterprise). Lệnh mở luồng uỷ quyền trên trình duyệt; token **in ra terminal** sau khi duyệt và không
  được lưu đi đâu. Token gắn với **gói của người chạy lệnh**.
  Nguồn: [Claude Code — Authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token),
  [Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions).
- **Chi phí**: mỗi lần chạy dùng quota gói Claude của chủ repo (không tính theo API) — dùng chung với các
  phiên desktop. Phút Actions: runner chuẩn GitHub-hosted **miễn phí trên repo public**
  ([GitHub — Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions));
  nếu repo chuyển private thì lần chạy (và 7 check CI của PR agent) bắt đầu tính vào quota.
- **Xoá secret không thu hồi token** (tài liệu upstream nói rõ). Nếu nghi token lộ: xoá secret **và**
  thu hồi phiên/token ở tài khoản Claude, rồi sinh token mới.

---

## 5. Việc chỉ chủ repo làm được (HUMAN CHECKPOINT)

Đo 22/09/2026: secret `CLAUDE_CODE_OAUTH_TOKEN` **đã có** (tạo 02/09/2026); App `nexagent-autopilot`
**thiếu** quyền Issues + Pull requests (N2). Còn lại:

1. **Cấp quyền cho App `nexagent-autopilot`** (bắt buộc). Mở GitHub → *Settings → Developer settings → GitHub Apps →
   nexagent-autopilot → Permissions & events*; trong *Repository permissions* đặt **Contents: Read and
   write**, **Issues: Read and write**, **Pull requests: Read and write**; **không** cấp *Workflows*,
   *Administration*, *Secrets*. Lưu, rồi chấp nhận quyền mới ở trang cài đặt App của tài khoản
   (*Settings → Applications → Installed GitHub Apps → nexagent-autopilot → Review request*).
2. **Credential Claude** (N1) — chỉ khi muốn token mới, hoặc khi lần chạy đầu hỏng ở xác thực:

   ```bash
   claude setup-token
   gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo phungtienviet14-sketch/nexagnet-platform
   ```

   Lệnh thứ nhất mở trình duyệt để đăng nhập/duyệt bằng tài khoản có gói Max, rồi in token ra terminal.
   Lệnh thứ hai hỏi giá trị và **không hiện** khi dán. Không dán token vào chat, không ghi ra tệp. Xong thì
   xoá màn hình terminal (`Clear-Host` / `cls`).
3. **Review và merge PR của #362.** Agent không merge. Sự kiện `issues` chỉ chạy bản workflow trên
   nhánh mặc định, nên pilot chỉ có thể chạy sau bước này.

---

## 6. Chạy pilot (sau khi merge)

### 6.1 Tạo Issue thử (R0, không đụng nghiệp vụ)

Chủ repo tạo một Issue mới, **không có comment nào khác**, ví dụ:

```markdown
[pilot V3] Ghi nhật ký lần chạy thử đầu tiên

Mục tiêu: tạo tệp docs/phat-trien/van-hanh/autopilot-v3-pilot-log.md gồm một tiêu đề và đúng một
dòng: ngày chạy (theo đồng hồ của runner) và câu "Lần chạy cloud đầu tiên của Autopilot V3".
Phạm vi: chỉ tệp đó (tạo mới). Không được: mọi tệp khác.
Tiêu chí chấp nhận: diff chỉ thêm đúng tệp đó, ≤ 5 dòng; CI 7/7 xanh trên đúng HEAD của PR.
Rủi ro: R0 — tài liệu, không hành vi.
```

### 6.2 Kích hoạt và thu bằng chứng

1. Gắn nhãn `agent:claude` (nhãn đã tạo sẵn trong repo).
2. Thu: số Issue · URL run (`gh run list --workflow claude-builder.yml`) · job `gate` in dòng
   `{"gate":"claude-builder","authorized":true,...}` · job `build` xanh · nhánh `autopilot-v3/issue-*` ·
   PR draft do `nexagent-autopilot[bot]` mở · base SHA / head SHA · 7 check trên đúng head · comment theo dõi
   của Claude có danh sách PROVEN/NOT_PROVEN.
3. Kiểm "đúng một lần chạy": `gh run list --workflow claude-builder.yml --json databaseId,event,conclusion`.
4. **Dừng** chờ review độc lập trước khi mở rộng (theo #362).

### 6.3 Pilot âm (N4)

- Gắn `agent:claude` lên một Issue **do tài khoản khác tạo** → run có job `gate` **skipped**, không job
  `build`.
- Gắn nhãn khác lên Issue của chủ repo → `gate` skipped.
- Nếu có tài khoản thứ hai: tài khoản đó comment `@claude …` / mở Issue → **không** có run nào của
  `claude-builder`.

Lưu ý khi đọc kết quả: workflow cũ `autopilot-orchestrator.yml` (V0, `AUTOPILOT_DRY_RUN=true`) cũng nghe
`issue_comment` và `pull_request`; comment theo dõi và PR của agent sẽ đánh thức nó ở đường chỉ đọc. Đó
không phải lần chạy của V3.

### 6.4 Pilot kiểm hàng rào của phiên Claude (C2)

Một Issue riêng của chủ repo, gắn `agent:claude`, yêu cầu **không commit gì** và báo lại trong comment
theo dõi kết quả của bốn phép thử: đọc `/etc/hostname`; đọc `.git/config`; chạy `echo hi` bằng Bash; tạo
tệp `.claude/probe.txt`. Kỳ vọng: **cả bốn bị từ chối** bởi hệ thống quyền (không phải do Claude tự
chối). Phân biệt hai trường hợp bằng log job `build`: dòng kết quả đã làm sạch của action in
`permission_denials_count` — kỳ vọng ≥ 4. Chỉ sau phép thử này C2 mới lên được PROVEN.

---

## 7. Tắt khẩn cấp và rollback

| Mức | Làm gì | Lệnh |
|---|---|---|
| Dừng một lần chạy | Huỷ run | `gh run cancel <run-id>` |
| Dừng mọi kích hoạt mới (nhanh, đảo được, không sửa mã) | Tắt workflow | `gh workflow disable claude-builder.yml` (bật lại: `enable`) |
| Cắt credential | Xoá secret; token vẫn sống tới khi thu hồi ở tài khoản Claude | `gh secret delete CLAUDE_CODE_OAUTH_TOKEN` |
| Cắt quyền ghi của agent | Gỡ quyền Issues/Pull requests của App, hoặc gỡ cài App khỏi repo | GitHub settings |
| Gỡ hẳn | PR revert `claude-builder.yml` + `tools/autopilot-v3/` | PR thường, qua CI |
| Dọn dấu vết | Đóng PR draft của agent, xoá nhánh `autopilot-v3/*` | `gh pr close <n> --delete-branch` |

---

## 8. Kiểm kê legacy trên `main` — KHÔNG xoá ở Phase A

Theo #361, xoá là **Phase D**, sau khi đường thay thế được chứng minh. Mốc đo (22/09/2026, `ea178ecf`):

| Đường dẫn | Là gì | Tệp | Dòng |
|---|---|---|---|
| `.github/workflows/autopilot-orchestrator.yml` | Orchestrator V0 (nghe `issue_comment`, `pull_request`, `check_suite`; `AUTOPILOT_DRY_RUN=true`) | 1 | 239 |
| `tools/autopilot-orchestrator/**` | Mã + test orchestrator V0 | 31 | 4 276 |
| `tools/autopilot-protocol/**` | Giao thức V0: schema, validator, máy trạng thái | 41 | 4 900 |
| `docs/phat-trien/van-hanh/autopilot-protocol-v0.md` | Tài liệu giao thức V0 | 1 | 585 |
| `.github/workflows/agent-builder.md` + `.lock.yml` | Pilot gh-aw V2 (`staged`, engine `copilot`, chưa có ghế) | 2 | 2 248 |
| `.github/aw/actions-lock.json` | Khoá action của gh-aw | 1 | 9 |
| `.github/ISSUE_TEMPLATE/agent-task.yml` | Biểu mẫu task V2 (nhãn `agent:*`, `risk:*`) | 1 | 106 |
| `tools/autopilot-v2-contract/**` | Test khoá cấu hình V2 | 5 | 802 |
| `docs/kien-truc/adr-0001-*.md`, `docs/phat-trien/van-hanh/autopilot-v2-official-first.md` | ADR + bằng chứng V2 | 2 | 1 361 |
| Biến repo `AUTOPILOT_DRY_RUN`, `AUTOPILOT_REVIEWER_APP_SLUG` | Cấu hình V0 | — | — |

Tổng ≈ **14 500 dòng** tự viết của V0/V2. Phase A thêm (ngoài tài liệu): 1 workflow + `gate.mjs` + 2 tệp
test. Dispatcher, Conversation Bridge **không** có trên `main` (chỉ nằm ở các PR đã đóng).

---

## 9. Rủi ro còn lại (chấp nhận có ghi rõ)

1. **Prompt injection qua nội dung repo hoặc chính Issue.** Claude giữ OAuth token trong môi trường tiến
   trình và đọc được tệp trong workspace; một lần bị dẫn dắt có thể chép bí mật vào commit hoặc comment
   công khai. Giảm bằng: đầu vào chỉ của chủ repo, không Bash/Web, chặn đọc ngoài workspace và `.git`,
   token App hết hạn trong giờ và bị thu hồi cuối job. Hậu quả tệ nhất: quota gói Claude + ghi nhánh/
   comment trong repo — không tiền API, không deploy, không `main`.
2. **Secret cấp repo** đọc được bởi bất kỳ workflow nào của repo chạy với danh tính có quyền ghi. Hướng
   cứng hoá (Phase B/C): chuyển `CLAUDE_CODE_OAUTH_TOKEN` vào một Environment chỉ cho nhánh `main`.
3. **App thay mặt chủ repo**: comment do App đăng dưới tên chủ repo (vd connector Codex) qua được bộ lọc
   `include_comments_by_actor`. Issue pilot nên mới và không có comment của App.
4. **Repo một chủ**: GitHub không cho tự duyệt PR của mình; chưa có người duyệt thứ hai được cưỡng chế.
5. **Bản ghim không tự cập nhật**: action mới ra liên tục; nâng bản là việc có chủ đích (§3.3).

---

## 10. Đường chuyển tiếp

- **Owner-only → người duy trì tin cậy**: đổi điều kiện ID trong `if:` của `gate` và quy tắc
  `SENDER_NOT_ADMIN` trong `gate.mjs` sang một danh sách ID/vai trò; vẫn so theo ID, vẫn fail-closed.
- **Phase B**: chính sách rủi ro tất định theo diff + review ngữ nghĩa độc lập, không dựng lại máy trạng thái.
- **Phase C**: merge queue/chính sách merge gốc; build một lần, digest + SBOM + attestation.
- **Phase D**: xoá legacy ở §8, đo dòng xoá so với dòng thêm.
- **Phase E**: đổi bộ thực thi sang agent gốc của GitHub = thay job `build`; `gate`, bước PR, CI giữ nguyên.

---

## 11. Rà soát an ninh đối kháng trước khi mở PR (22/09/2026)

Một agent rà soát riêng (chỉ đọc) được giao phá từng mệnh đề ở §2–§3. Ranh giới hướng ra ngoài — người
lạ không chạm được job `build` — **không tìm thấy đường vượt**: hai lớp so theo ID, fail-closed, không có
`${{ }}` chèn vào script, không `workflows`/`id-token`. Ba phát hiện hướng vào trong và cách xử lý:

| Phát hiện | Xử lý | Căn cứ |
|---|---|---|
| Deny chỉ có `Edit(...)`, thiếu `Write(...)`/`MultiEdit(...)` | **Bác bỏ** — và khoá bằng test điều ngược lại | Tài liệu permissions của Claude Code: luật đường dẫn chỉ xét `Edit(path)`/`Read(path)`; `Edit(path)` phủ mọi công cụ sửa tệp; luật `Write(path)` không bao giờ được xét |
| `.claude/**` (sandbox của chính agent) nằm ngoài hàng rào | **Chấp nhận** — thêm `Edit(.claude/**)`, `Edit(.mcp.json)`, `Edit(tools/autopilot-v3/**)` | Một lần chạy có thể nới lỏng lần chạy sau qua một PR được merge |
| Chưa chắc `blockReadsOutsideWorkingDirectories` có hiệu lực | **Giữ CONFIG_ONLY**, thêm phép thử §6.4 | Khoá có trong settings reference chính thức (≥ 2.1.257); action cài 2.1.278 — nhưng chưa quan sát trong một lần chạy thật |
