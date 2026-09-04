# Orchestrator V0 — read-only

Chạy [Giao thức Autopilot V0](../../docs/phat-trien/van-hanh/autopilot-protocol-v0.md) trên **sự
kiện GitHub thật**. Hợp đồng task: Issue #165.

Nó làm đúng hai việc: **đăng một comment kết quả** và **đổi nhãn trạng thái**. Không merge, không
ghi mã nguồn, không gọi agent nào. Workflow không xin `contents: write`, nên ranh giới đó do GitHub
cưỡng chế chứ không phải do tài liệu hứa.

## Vì sao nó tồn tại

PR #155 đưa giao thức lên `main` với 122 bài test — nhưng toàn bộ chạy trên payload **tổng hợp**.
Package này đóng hai mục NOT PROVEN của PR đó:

| NOT PROVEN của #155                                              | Đóng bằng                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| #1 Giao thức chưa từng chạy trên sự kiện GitHub thật             | `src/main.mjs` + fixture bắt từ REST thật trong `tests/fixtures/` |
| #3 `requiredChecksFromRuleset` đọc tệp trong repo, không hỏi API | `src/evidence.mjs` gọi `/rules/branches/main`                     |

## Năm tệp, một tệp bẩn

| Tệp                | Thuần? | Việc                                                                                                          |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------- |
| `src/reasons.mjs`  | ✅     | Mã lý do **của tầng orchestrator** — tách hẳn khỏi 59 mã của giao thức. Có test khoá hai bộ không trùng nhau. |
| `src/evidence.mjs` | ✅     | Hình dạng GitHub REST → tham số validator. Fail-closed.                                                       |
| `src/registry.mjs` | ✅     | Sơ đồ `principal → vai`. Đọc từ biến môi trường, **không ghi cứng login nào**.                                |
| `src/decide.mjs`   | ✅     | Sự kiện + bằng chứng → mô tả việc phải làm.                                                                   |
| `src/main.mjs`     | ❌     | Nơi **duy nhất** gọi mạng và ghi.                                                                             |

Tách như vậy để "read-only" là thứ kiểm được: mọi quyết định nằm trong hàm thuần, và chỉ một tệp
có quyền ghi.

## Ba cạm bẫy đã đo được, không phải suy đoán

**1. API và tệp ruleset có hình dạng KHÁC NHAU.** `/rules/branches/main` trả về **mảng phẳng**;
`requiredChecksFromRuleset` lại đợi `{ rules: [...] }`. Đưa thẳng mảng API vào nó thì **không lỗi,
không ném** — chỉ trả mảng rỗng, tức "không có check bắt buộc nào". Có một bài test khoá đúng chỗ
này.

**2. `issue_comment` luôn chạy bản workflow trên NHÁNH MẶC ĐỊNH.** Không phải bản trong PR. Nên
đường này **không thể chứng minh từ chính PR thêm nó** — CI xanh của PR không có nghĩa là
orchestrator đã chạy thật.

**3. Mặc định là DRY-RUN.** Nó quyết định và ghi log đầy đủ nhưng không đăng comment, không đổi
nhãn. Bật thật bằng biến repo `AUTOPILOT_DRY_RUN=false`.

## Cấu hình

| Biến                          | Bắt buộc | Mặc định                                       |
| ----------------------------- | -------- | ---------------------------------------------- |
| `AUTOPILOT_REPO_OWNER_LOGIN`  | ✅       | — (thiếu ⇒ fail-closed)                        |
| `AUTOPILOT_REVIEWER_APP_SLUG` | ✅       | `chatgpt-codex-connector` (đặt trong workflow) |
| `AUTOPILOT_ACTIONS_APP_SLUG`  | —        | `github-actions`                               |
| `AUTOPILOT_DRY_RUN`           | —        | `true`                                         |

Thiếu biến bắt buộc thì job **đỏ**, không chạy với một sơ đồ mặc định — một sơ đồ không ai kiểm là
một sơ đồ cấp quyền im lặng.

## Sơ đồ principal, và vì sao một repo một chủ vẫn thoả phân lập nhiệm vụ

Đo trên comment thật của PR #155:

```
BUILD_READY  -> user.login = <chủ repo>,  performed_via_github_app = null
             => principal USER:<chủ repo>    -> BUILDER, FIXER, ARCHITECT, HUMAN

REVIEW_PASS  -> user.login = <chủ repo>,  performed_via_github_app.slug = <app của ChatGPT>
             => principal APP:<app ChatGPT>  -> REVIEWER
```

`principalFromGithubEvent` ưu tiên app slug hơn login, nên **cùng một tài khoản GitHub cho ra hai
principal khác nhau**. Nhờ đó `CHATGPT_REVIEWER` đứng một mình và bất biến "không ai vừa làm vừa
duyệt" được thoả — điều mà nếu chỉ nhìn `user.login` thì không thể.

## Chạy test

```bash
pnpm --filter @netviet/autopilot-orchestrator test
```

Fixture trong `tests/fixtures/` được bắt trực tiếp từ REST của chính repo này tại lúc PR #155 xanh
7/7. Chúng là dữ liệu thật, không phải payload người viết nghĩ ra.
