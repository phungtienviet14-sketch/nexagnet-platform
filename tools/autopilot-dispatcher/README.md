# Autopilot Dispatcher V0 — mặt phẳng thực thi cục bộ

> Gói này là **mảnh còn thiếu** giữa "ChatGPT Architect tạo Task Contract trên GitHub" và
> "Claude Code chạy trên máy chủ repo": nó lấy đúng **một** task đã được uỷ quyền, dựng một
> worktree mới tinh, rồi phóng Claude Code với **Opus / effort max** — mà không mở một cổng mạng
> nào và không đọc một bí mật nào.
>
> **Trạng thái: CHƯA ĐƯỢC KÍCH HOẠT.** Cấu hình mẫu trong repo là `enabled: false`, và không có
> tác vụ khởi động cùng máy nào được đăng ký. Xem [Giới hạn của V0](#giới-hạn-của-v0).

## 1. Kiến trúc

```text
ChatGPT Architect
   │  tạo Issue mang <!-- AUTOPILOT_TASK_V0 --> + khối JSON
   ▼
GitHub Issue  ──(người/App được tin cậy gắn nhãn agent:ready)──┐
   │                                                           │
   │  (dispatcher HỎI RA, GitHub không gọi vào máy)            │
   ▼                                                           │
┌──────────────────────── MÁY CỦA CHỦ REPO ────────────────────┴─────────┐
│  cấu hình cục bộ  →  khoá tiến trình  →  tìm task                      │
│        →  nguồn gốc kích hoạt  →  hợp đồng task  →  sổ cái             │
│        →  SHA nền  →  kế hoạch  →  prompt  →  đo khả năng CLI          │
│  ══════════════ ranh giới: trên đây không đụng gì vào máy ═════════════ │
│        →  git worktree add (nhánh mới, SHA chính xác)                  │
│        →  spawn claude --print --model opus --effort max  (stdin)      │
│        →  đọc LẠI GitHub để xem có bàn giao thật không                 │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Ranh giới tin cậy

| Vùng                                       | Ai điều khiển      | Được phép quyết định gì                                                        |
| ------------------------------------------ | ------------------ | ------------------------------------------------------------------------------ |
| Cấu hình cục bộ (`dispatcher.config.json`) | **người vận hành** | repo, **hai** sơ đồ principal, đường dẫn, model, effort, timeout               |
| Sự kiện gắn nhãn `agent:ready`             | GitHub xác thực    | **có** được chạy hay không                                                     |
| Thân Issue (hợp đồng task)                 | Architect          | **nội dung công việc** (prose đi vào prompt)                                   |
| Comment trên Issue/PR                      | bất kỳ ai          | **không gì cả** — không bao giờ vào prompt                                     |
| Bất kỳ text nào từ GitHub                  | —                  | **không bao giờ** thành executable, argv, shell, biến môi trường hay đường dẫn |

Repo này là **PUBLIC**. Ai cũng mở được một Issue chứa một hợp đồng trông y như thật. Thứ mang
quyền **không phải** nội dung Issue, mà là **sự kiện gắn nhãn**: `evaluateTriggerProvenance` đọc
dòng sự kiện của Issue, lấy lần `labeled` gần nhất, suy ra principal bằng chính
`principalFromGithubEvent` của giao thức, rồi đối chiếu với allowlist cục bộ.

Bốn đường từ chối, mỗi đường một mã riêng:

| Mã                                 | Nghĩa                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `TRIGGER_ALLOWLIST_MISSING`        | cấu hình không có allowlist ⇒ **không phải "ai cũng được"**                          |
| `TRIGGER_EVENT_MISSING`            | nhãn đang có nhưng không có sự kiện gắn nào                                          |
| `TRIGGER_EVIDENCE_AMBIGUOUS`       | nhiều sự kiện gắn không xếp được theo thời gian                                      |
| `TRIGGER_PRINCIPAL_NOT_ALLOWED`    | biết ai, nhưng người đó không nằm trong allowlist                                    |
| `TRIGGER_ISSUE_EDITED_AFTER_LABEL` | thân Issue bị sửa **sau** lần gắn nhãn — cái đã được duyệt không còn là cái sắp chạy |

Một dòng `ROLE=CHATGPT_ARCHITECT` viết trong thân Issue **không cho thêm quyền gì** — có test khoá
điều đó.

**Quyền KÍCH HOẠT không phải quyền KHẲNG ĐỊNH.** Cấu hình mang **hai** sơ đồ principal, và chúng
trả lời hai câu hỏi khác nhau:

| Trường                     | Trả lời câu                                       | Đọc bởi                     |
| -------------------------- | ------------------------------------------------- | --------------------------- |
| `trustedTriggerPrincipals` | ai được gắn `agent:ready` (được **bấm nút chạy**) | `evaluateTriggerProvenance` |
| `handoffPrincipals`        | ai được phát `BUILD_READY`/`REVIEW_REQUEST`       | `verifyHandoff` (§10)       |

Gộp chúng làm một là cho **chính người mở lần chạy** tự chứng nhận kết quả của lần chạy đó. Nội
dung vai thì **không** do package này định nghĩa: tên vai, tập vai hợp lệ, và bất biến **phân lập
nhiệm vụ** (một principal không được vừa LÀM vừa DUYỆT) đều thuộc `definePrincipalRegistry` của
giao thức — nên trong repo này **không có bộ luật phân quyền thứ hai**. Một sơ đồ hỏng bị từ chối
**ngay lúc đọc cấu hình**, không đợi đến lúc có một thông điệp thật đi qua.

Gắn nhãn là một lần **duyệt**, và nó duyệt **một nội dung cụ thể**. Tác giả Issue sửa được thân
Issue của chính mình bất cứ lúc nào mà **không cần quyền ghi repo** — nên nếu thân đổi sau lần
gắn nhãn, thứ đã được duyệt không còn là thứ sắp chạy. Dispatcher đo điều đó bằng
`Issue.lastEditedAt` của GraphQL, **không** bằng `updated_at` của REST: `updated_at` nhảy cả khi
ai đó bình luận hay gắn nhãn, nên dùng nó sẽ từ chối nhầm gần như mọi task. Gắn lại nhãn sau khi
sửa là cách duyệt lại nội dung mới.

## 3. Vì sao chỉ gọi RA, không mở cổng VÀO

Một cổng lắng nghe trên máy cá nhân để GitHub "đẩy việc vào" là một đường thực thi mã từ xa: nó
phải được mở qua NAT/tường lửa, phải tự xác thực, và mọi lỗi của nó đều nằm ngoài tầm quan sát của
người dùng. Dispatcher chọn đường ngược lại — **hỏi ra theo chu kỳ** — nên bề mặt tấn công từ
Internet vào máy là **không có**. Có một test tĩnh quét toàn bộ `src/` và fail nếu xuất hiện
`createServer`, `.listen(`, WebSocket, hay một import của `node:http|https|net|tls|dgram|http2`.

## 4. Từ hợp đồng task đến prompt

`readTaskContract` gọi thẳng `extractTaskContract` của `@netviet/autopilot-protocol` — không sao
chép, không nới lỏng. Nghĩa là mọi luật của giao thức vẫn nguyên: marker phải là **dòng nội dung
đầu tiên**, khối ```json phải **liền ngay sau** marker, `risk: HIGH` bắt buộc `human_gate: true`,
và có `risk_areas` thì bắt buộc `risk: HIGH`.

Sau đó `compilePrompt` dựng prompt từ **đúng hai nguồn**: kế hoạch do dispatcher tự sinh, và hợp
đồng đã qua validator. Hàm này **không có tham số nào** để một comment lọt vào — đó là cách chặn,
chứ không phải một bộ lọc.

Prompt là **tất định**: cùng hợp đồng + cùng base ⇒ cùng chuỗi ⇒ cùng `prompt_digest`. Nội dung
prompt **không bao giờ** được ghi log; chỉ có digest.

Prompt đi vào Claude qua **stdin**, không qua dòng lệnh. Hai lý do: text của GitHub không được
phép trở thành argv, và một hợp đồng vài chục KB sẽ vượt giới hạn dòng lệnh của Windows.

## 5. Chính sách nhánh / worktree

```text
git fetch origin --prune
  → git rev-parse refs/remotes/origin/main      (SHA CHÍNH XÁC, không phải HEAD cục bộ)
  → nhánh phải CHƯA có ở local và ở remote
  → thư mục worktree phải CHƯA tồn tại
  → git worktree add -b <nhánh> <thư mục> <SHA>
  → xác minh HEAD == SHA, và `git status --porcelain` rỗng
```

Tên nhánh và tên thư mục được **sinh** từ số Issue (số nguyên) + 12 hex đầu của `contract_digest`:
`claude/autopilot/issue-256-a1b2c3d4e5f6`. Không một chuỗi nào của GitHub chạm vào chúng, nên
`task_id` độc hại (dấu cách, `..`, gạch chéo ngược, ký tự điều khiển) không có đường tới hệ tệp.

Dispatcher **không** chạy `reset --hard`, `clean`, `stash`, `rebase` hay `push --force` — có test
tĩnh quét `src/` (sau khi bỏ chú thích) và fail nếu chúng xuất hiện. Worktree **không bị xoá** sau
khi Claude thoát: đó là bằng chứng để soát lại.

## 6. Bắt buộc Opus / max

| Tầng      | Cách cưỡng chế                                                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cấu hình  | `model` chỉ khớp `^(opus\|claude-opus-…)$`; `effort` phải đúng chuỗi `max`. Ghi `sonnet` là bị từ chối lúc đọc cấu hình, với mã riêng `CONFIG_MODEL_NOT_OPUS`. |
| Đo CLI    | `probeClaude` chạy `claude --version` và `claude --help`, đọc khối `--effort` và kiểm `max` có trong danh sách; kiểm `--model` có tài liệu hoá alias `opus`.   |
| Dựng argv | `buildClaudeArgv` chỉ nhận **chính sách**, không nhận hợp đồng. Không có `--fallback-model`.                                                                   |

Không chứng minh được ⇒ **dừng**, không hạ cấp. Các mã: `CLAUDE_EFFORT_MAX_UNSUPPORTED`,
`CLAUDE_MODEL_OPUS_UNSUPPORTED`, `CLAUDE_NONINTERACTIVE_UNSUPPORTED`.

Đo trên máy phát triển (Claude Code **2.1.263**):

```text
--model <model>    Provide an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')…
--effort <level>   Effort level for the current session (low, medium, high, xhigh, max)
-p, --print        Print response and exit (useful for pipes)
```

## 7. Quyền và xác thực

Dispatcher **dùng lại môi trường đã đăng nhập sẵn** của người dùng. Nó:

- **không** đọc `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`;
- **không** gọi `gh auth token` — mọi lời gọi GitHub đi qua `gh api`, và `gh` tự lấy thông tin
  xác thực từ keyring;
- **không** in `process.env`;
- **không** thêm `--dangerously-skip-permissions`, và cấu hình **từ chối** `bypassPermissions`.

Mặc định `--permission-prompts none`: trong chế độ không người trực, thứ gì cần hỏi quyền sẽ bị
**từ chối tự động** thay vì treo. Nếu Claude bị chặn quyền, kết quả là trạng thái có kiểu
`BLOCKED_LOCAL_PERMISSION` — không phải một lần "chạy thành công" im lặng.

## 8. Sổ cái và tính idempotent

Khoá chính tắc: `dispatch:<repo>:<issue>:<contract_digest>`.

| Tình huống                                | Kết quả                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| hỏi lại cùng task đang mở                 | `TASK_ALREADY_CLAIMED` — không phóng tiến trình thứ hai        |
| khởi động lại dispatcher                  | đọc lại sổ cái trên đĩa ⇒ vẫn `TASK_ALREADY_CLAIMED`           |
| hai dispatcher trên cùng máy              | tiến trình thứ hai nhận `LOCK_HELD`                            |
| Architect sửa hợp đồng sau khi đã nhận    | `TASK_CONTRACT_CHANGED_AFTER_CLAIM`                            |
| task khác, sau khi task trước đã kết thúc | chạy được bình thường                                          |
| sổ cái hỏng                               | `LEDGER_CORRUPT` và **dừng** — không tự xoá trí nhớ đi làm lại |

Sổ cái ghi thay thế nguyên tử (ghi tệp tạm rồi `rename`). Khoá tiến trình dùng `open(…, 'wx')` —
hệ điều hành bảo đảm chỉ một tiến trình tạo được; khoá của một tiến trình đã chết được thu hồi
bằng cách hỏi HĐH xem PID còn sống không.

## 9. Vòng đời tiến trình

Trạng thái: `PLANNED → CLAIMED → WORKTREE_READY → CLAUDE_STARTING → CLAUDE_RUNNING →`
`{CLAUDE_EXITED_0 | CLAUDE_EXITED_NONZERO | TIMED_OUT | BLOCKED_LOCAL_PERMISSION} →`
`POST_RUN_VERIFY → {HANDOFF_PRESENT | HANDOFF_MISSING}`; mọi hỏng hóc khác vào `FAILED`.

Timeout cấu hình được (mặc định 1 giờ) → `SIGTERM` → sau thời gian ân hạn → `SIGKILL`. stdout/stderr
được thu **có chặn trên**, và chỉ **số byte** đi vào log.

> ⚠️ **Trên Windows khoảng ân hạn đó không tồn tại.** Node không gửi được tín hiệu POSIX trên
> Windows, nên `child.kill('SIGTERM')` giết tiến trình **ngay và dứt khoát** — đo được: một tiến
> trình con cài sẵn bộ bắt `SIGTERM` không bao giờ chạy bộ bắt đó. Vậy `killGraceMs` chỉ có tác
> dụng thật trên POSIX; trên Windows hãy coi `timeoutMs` là **thời điểm tiến trình bị giết không
> báo trước**, và đặt nó đủ rộng.

Vì thế một lần chạy **không kết thúc sạch** (timeout / thoát khác 0 / bị chặn quyền) **không** được
báo là đã bàn giao, kể cả khi hậu kiểm tìm thấy bàn giao thật: tiến trình có thể đã mở PR rồi bị
giết giữa chừng. Kết quả hậu kiểm vẫn được ghi riêng vào `handoffState` trong sổ cái, nên bằng
chứng đó **không biến mất** — nó chỉ không được phép nói thay cho trạng thái của lần chạy.

**Một task đã nhận được đúng MỘT lần phóng.** Thoát khác 0 không tự chạy lại — không có vòng lặp
"thử đến khi xanh".

## 10. Sự thật sau khi chạy: GitHub, không phải stdout

`exit 0` chỉ chứng minh tiến trình kết thúc bình thường. Nó không chứng minh có code, có PR, có CI
hay có bàn giao. Nên sau khi Claude thoát, dispatcher **đọc lại GitHub**: nhánh trên remote, PR có
head là nhánh đó, và comment của Issue/PR chạy qua `readMessage` của giao thức.

Một stdout chứa chữ "BUILD_READY" **không** tạo ra bàn giao. Kết cục
`PROCESS_EXITED_0 + HANDOFF_MISSING` là hợp lệ và phải **nhìn thấy được là chưa xong**.

### Hình dạng đúng chưa bao giờ là quyền

Repo này PUBLIC. Bất kỳ ai cũng dán được một `BUILD_READY` đúng schema, trỏ đúng số PR thật. Nếu
hình dạng là đủ, thì "đã bàn giao" là thứ ai cũng bịa ra được bằng một comment — và hậu kiểm
không còn là hậu kiểm. Nên có **hai cổng độc lập**, và phải qua **cả hai**:

**Cổng 1 — AI PHÁT.** Danh tính lấy từ chính đối tượng comment mà GitHub trả về
(`performed_via_github_app.slug` / `user.login`), chạy qua `principalFromGithubEvent` rồi
`authorizeProducer` với `handoffPrincipals`. **Không** một trường nào trong **thân** thông điệp
được tin để suy ra vai — thân là thứ người phát tự viết. Vì `assertedRole` không bao giờ được
truyền vào, "BUILD_READY chỉ của `CLAUDE_BUILDER`/`CLAUDE_FIXER`" và "REVIEW_REQUEST chỉ của
`GITHUB_ACTIONS`" là một **phép giao của giao thức** (`MESSAGE_PRODUCERS`), không phải một danh
sách thứ hai chép lại ở đây.

**Cổng 2 — TRỎ VÀO GÌ.** Thông điệp phải ràng buộc **đồng thời** vào bốn thứ, không phải một:

| Ràng buộc               | Mã từ chối khi sai                                    |
| ----------------------- | ----------------------------------------------------- |
| repo đã cấu hình        | `HANDOFF_CARRIER_UNBOUND`                             |
| đúng số Issue này       | `ISSUE_MISMATCH`                                      |
| đúng số PR đang sống    | `NO_PR_BOUND` (không có PR) · `PR_MISMATCH` (PR khác) |
| đúng HEAD SHA đang sống | `HEAD_MISMATCH`                                       |

Ràng buộc HEAD là thứ làm cho bằng chứng **hết hạn được**: một `BUILD_READY` **thật** của HEAD A —
đúng người phát, đúng Issue, đúng PR — **không** được tính khi PR đã lên HEAD B. Thiếu nó, một lần
chạy đẩy thêm commit vẫn "đã bàn giao" theo một thông điệp đã cũ.

Các đường từ chối khác, mỗi đường một mã:

| Mã                             | Nghĩa                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| `PRINCIPAL_UNKNOWN`            | comment không nói được ai viết                                      |
| `HANDOFF_PROVENANCE_AMBIGUOUS` | app slug và login là **hai** danh tính khác nhau trong một vật mang |
| `PRODUCER_UNKNOWN`             | biết ai, nhưng principal đó không giữ vai nào                       |
| `WRONG_PRODUCER`               | có vai, nhưng không vai nào phát được loại này                      |
| `PRINCIPAL_REGISTRY_MISSING`   | không có sơ đồ ⇒ **`ok:false`**, xem ngay dưới                      |

**Thiếu sơ đồ phân quyền là lỗi CẤU HÌNH, không phải "không có bàn giao".** Trả về
`HANDOFF_MISSING` lúc đó là báo "Claude chưa bàn giao" cho một cấu hình thiếu — một kết luận **sai**
mà không ai kiểm lại. Nên `verifyHandoff` trả `ok:false`, và `runOnce` dựng sơ đồ **trước mọi cổng
khác** để một sơ đồ hỏng chặn lần chạy _trước khi_ có worktree hay tiến trình nào.

Cuối cùng, `HANDOFF_MISSING` và "có kẻ dán một `BUILD_READY` giả" phải là **hai dòng log khác
nhau**: mọi comment bị từ chối được ghi lại thành mã trong trường `handoff_rejected` của
`dispatch.finished` (chỉ **mã**, không danh tính, không nội dung).

## 11. Lệnh (dry-run là mặc định)

```bash
node tools/autopilot-dispatcher/src/cli.mjs plan   --config ./dispatcher.config.json
node tools/autopilot-dispatcher/src/cli.mjs plan   --config ./dispatcher.config.json --issue 256
node tools/autopilot-dispatcher/src/cli.mjs status --config ./dispatcher.config.json
```

`plan` đi qua **mọi** cổng rồi in kế hoạch — không tạo worktree, không phóng Claude, không ghi sổ
cái. Chạy thật cần **cả hai**: `enabled: true` trong cấu hình **và** cờ `--execute`:

```bash
node tools/autopilot-dispatcher/src/cli.mjs once --config ./dispatcher.config.json --execute
```

## 12. Cài chạy cùng máy (hiện đang DRY-RUN)

```powershell
pwsh -File tools/autopilot-dispatcher/scripts/install-startup.ps1 -ConfigPath C:\path\dispatcher.config.json
pwsh -File tools/autopilot-dispatcher/scripts/uninstall-startup.ps1
```

Không có `-Execute` thì hai script **chỉ in kế hoạch**: tên tác vụ, executable, tham số, thư mục
làm việc, thư mục log, và **lệnh gỡ**. Chúng không đăng ký gì, không đụng registry, không mở cổng.
Trong phạm vi task #256, `-Execute` **không được dùng** — bật một tiến trình tự động chạy Claude
Code với quyền ghi trên máy cá nhân là quyết định của **người**, sau một lần review riêng.

## 13. Log và quyền riêng tư

Log là JSON một dòng, lọc bằng **danh sách trắng** (`ALLOWED_LOG_FIELDS`). Trường không được khai
báo thì **không ra log**; tên (không phải giá trị) của chúng được gom vào `dropped_fields` để người
đọc thấy mình đang thiếu gì. Không có tên nào cho prompt, prose của hợp đồng, `process.env`, stdout
của Claude, header hay token.

```json
{
  "issue": 256,
  "task_id": "…",
  "base_sha": "…",
  "branch": "…",
  "contract_digest": "…",
  "prompt_digest": "…",
  "trigger_principal": "USER:…",
  "model": "opus",
  "effort": "max",
  "state": "HANDOFF_PRESENT",
  "pr": 700,
  "event": "dispatch.finished",
  "ts": "2026-09-08T00:00:00.000Z"
}
```

## 14. Tắt và quay lui

1. đặt `enabled: false` trong cấu hình (chặn ngay mọi lần chạy tiếp theo);
2. bỏ cờ `--execute` khỏi mọi cách gọi;
3. nếu sau này có tác vụ khởi động: `schtasks /delete /tn "NexagentAutopilotDispatcher" /f`;
4. worktree và sổ cái **được giữ lại** — xoá chúng là xoá bằng chứng, nên đó là việc làm bằng tay
   sau khi đã soát.

## 15. Giới hạn của V0

| Không phải                             | Vì sao                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| một máy, một worker                    | không có khoá phân tán; hai PC cùng trỏ vào một repo sẽ cùng nhận một task                                                                     |
| chỉ **Builder**                        | không có Fixer tự động khi `REVIEW_BLOCK` — đó là task sau                                                                                     |
| không tự merge                         | `risk: HIGH` / `human_gate: true` là cổng của người                                                                                            |
| không dịch vụ chạy nền                 | không có tác vụ khởi động nào được đăng ký trong task này                                                                                      |
| **chưa được chứng minh lúc chạy thật** | mọi bằng chứng ở đây là mức code + tiến trình giả; vòng đầy đủ GitHub → Claude → PR → CI → Bridge → ChatGPT **chưa** được chạy tự động lần nào |

Bridge đánh thức reviewer (#204/#206) và mutation của Orchestrator (#165/#188/#191) là **các mặt
phẳng khác**, không thuộc gói này.
