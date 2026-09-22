# tools/autopilot-v3 — cổng kích hoạt + khoá bất biến của `claude-builder`

Thư mục này **không phải** một gói orchestration. Nó chỉ có:

| Tệp | Vai | Chạy ở đâu |
|---|---|---|
| `gate.mjs` | Cổng kích hoạt lớp 2: đọc lại Issue + quyền người gắn nhãn qua API, quyết định với mã lý do có kiểu. Không phụ thuộc gói ngoài | Job `gate` của [`.github/workflows/claude-builder.yml`](../../.github/workflows/claude-builder.yml) — token chỉ đọc, **không** secret |
| `gate.test.mjs` | Hành vi của cổng trước mọi đường không tin cậy (người lạ, bot, Issue của người lạ, trùng login khác ID, re-run, nhãn khác, trạng thái đổi, API lỗi, token không lọt log) | `pnpm test` → job `verify` |
| `claude-builder.contract.test.mjs` | 13 bất biến cấu hình của workflow mà ranh giới an ninh dựa vào | `pnpm test` → job `verify` |

Bối cảnh, ranh giới tin cậy, tắt khẩn cấp:
[`docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md`](../../docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md).

## Chạy

```bash
pnpm test:autopilot-v3        # cũng nằm trong `pnpm test` của CI
```

Không gọi mạng, không cần secret, không cần DB.

## Bất biến được khoá

1. Kênh kích hoạt duy nhất: `issues.labeled` — không `issue_comment`, `pull_request(_target)`,
   `workflow_dispatch`, `workflow_run`, `schedule`, `push`.
2. `permissions: {}` ở gốc và ở job `build`; job `gate` chỉ đọc; **không** `id-token` ở đâu cả.
3. `if:` của `gate` đủ năm điều kiện (người gắn là `User`, ID người gắn = ID chủ repo, ID tác giả Issue =
   ID chủ repo, `triggering_actor` = chủ repo, Issue mở), chỉ nối bằng `&&`.
4. `gate` chạy `gate.mjs`, không chạm secret; `build` cần `gate` và chỉ chạy khi `authorized == 'true'`.
5. Chỉ hai secret (`CLAUDE_CODE_OAUTH_TOKEN`, `NEXAGENT_AUTOPILOT_PRIVATE_KEY`), chỉ trong job `build`.
6. Mọi `uses:` ghim SHA 40 hex đúng bản đã audit, và tài liệu vận hành ghi cùng SHA đó.
7. Token App xin đúng `contents`/`issues`/`pull-requests: write` — không `workflows`, không gì khác.
8. Action Claude ghi bằng token App, chỉ đọc comment của chủ repo, không `allowed_non_write_users`,
   `allowed_bots`, `show_full_output`, `display_report`, `anthropic_api_key`.
9. Settings của phiên Claude: `blockReadsOutsideWorkingDirectories: true`; deny `Bash`, `WebFetch`,
   `WebSearch`, `Read(.git/**)`, `Edit(...)` cho `.github/`, `deploy/`, `tenants/` và mặt phẳng điều
   khiển của chính agent (`.claude/`, `.mcp.json`, `tools/autopilot-v3/`); **không** có luật
   `Write(...)`/`MultiEdit(...)`/`NotebookEdit(...)`/`Glob(...)` (Claude Code không bao giờ xét chúng —
   `Edit(path)` mới phủ mọi công cụ sửa tệp); không `defaultMode`, không `allow`.
10. Không bước nào **sau** agent chạy mã từ workspace.
11. Nhãn kích hoạt khai nhất quán ở `if:`, `ACTIVATION_LABEL`, `label_trigger` — và không phải `agent:ready`.
12. Không biểu mẫu Issue nào tự gắn nhãn kích hoạt.
13. Runner `ubuntu-24.04` GitHub-hosted, có timeout; concurrency theo Issue, không huỷ lần đang chạy.

## Đã kiểm bằng đột biến, không chỉ bằng "xanh" (22/09/2026)

Mỗi đột biến chạy trên **bản sao** (biến `AUTOPILOT_V3_WORKFLOW` / `AUTOPILOT_V3_TEMPLATES`, hoặc bản sao
`gate.mjs` ở thư mục tạm) — working tree không bị đụng. Đối chứng trên bản gốc: xanh. Bản đột biến của
`gate.mjs` phải qua `node --check`, và chỉ bài test **có tên** mới được tính là "bắt được" — một lỗi nạp
tệp không phải là một lần bắt (lần chạy đầu đã có đúng một đỏ giả kiểu đó, đã sửa). **28/28 bị bắt:**

| # | Đột biến | Bài đỏ |
|---|---|---|
| M1 / M2 | thêm trigger `issue_comment` / `pull_request_target` | 1 |
| M3 | job `build` xin `id-token: write` | 2 |
| M4 / M5 / M18 | bỏ điều kiện `sender.id` / đổi một `&&` thành `\|\|` / bỏ `triggering_actor` | 3 |
| M6 | `github_token` = `secrets.GITHUB_TOKEN` | 5, 8 |
| M7 | token App xin thêm `permission-workflows: write` | 7 |
| M8 | `claude-code-action@v1` thay vì SHA | 6 |
| M9 / M14 | `allowed_non_write_users: '*'` / bỏ `include_comments_by_actor` | 8 |
| M10 / M11 | bỏ `blockReadsOutsideWorkingDirectories` / bỏ deny `Bash` | 9 |
| M20 | thêm luật `Write(tenants/**)` (không bao giờ được xét) | 9 |
| M21 / M22 | bỏ `Edit(.claude/**)` / bỏ `Edit(tools/autopilot-v3/**)` | 9 |
| M12 | chạy `node tools/...` sau bước agent | 10 |
| M13 | `label_trigger: agent:ready` | 11 |
| M15 / M16 | thêm `runs-on: self-hosted` / `cancel-in-progress: true` | 13 |
| M17 | job `gate` đọc `secrets.CLAUDE_CODE_OAUTH_TOKEN` | 4, 5 |
| M19 | một biểu mẫu Issue có `labels: ["agent:claude"]` | 12 |
| G1 | bỏ kiểm `sender.id` trong `gate.mjs` | 3 bài của `gate.test.mjs` |
| G2 | so người gắn theo login thay vì ID | "trùng LOGIN mà khác ID" |
| G3 | bỏ kiểm Issue còn mở | "Issue đã đóng / nhãn đã gỡ" |
| G4 | cho quyền `write` qua cổng | "không còn quyền admin" |
| G5 | API lỗi → cho qua (fail open) | "API lỗi → từ chối" |
| G6 | in token vào dòng log | "token không bao giờ vào log" |

## Giới hạn đã biết — nói trước

- Bài hợp đồng đọc YAML **bằng văn bản** (thụt lề 2 dấu cách của chính tệp đó), không dùng thư viện —
  cùng lý do với `deploy/netviet/*.contract.test.mjs`. Đổi kiểu viết YAML thì test đỏ; sửa test cho khớp,
  đừng làm bộ tách thông minh hơn.
- Test khoá **cấu hình của repo này**, không kiểm hành vi của GitHub hay Anthropic. Việc workflow chạy
  đúng trên GitHub chỉ chứng minh được bằng pilot sau merge (tài liệu vận hành §6).
