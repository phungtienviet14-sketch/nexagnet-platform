# @netviet/autopilot-v2-contract — khoá cấu hình Autopilot V2

Gói này **chỉ khoá cấu hình mà chính repo này commit**. Nó không kiểm cài đặt của GitHub, Anthropic
hay OpenAI — đó là ranh giới §9 của [#309](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/309)
yêu cầu: *"Only add repo-level tests for our configuration/invariants, not for the implementation of
GitHub/Anthropic/OpenAI products."*

Bối cảnh: [`docs/phat-trien/van-hanh/autopilot-v2-official-first.md`](../../docs/phat-trien/van-hanh/autopilot-v2-official-first.md) ·
Quyết định: [`docs/kien-truc/adr-0001-autopilot-official-first.md`](../../docs/kien-truc/adr-0001-autopilot-official-first.md)

## Chạy

```bash
pnpm --filter @netviet/autopilot-v2-contract test        # cũng chạy trong `pnpm -r test` của CI
pnpm --filter @netviet/autopilot-v2-contract typecheck
```

Không gọi mạng, không cần secret, không cần DB.

## Mười một bất biến

| # | Khoá điều gì | Đọc tệp nào |
|---|---|---|
| 1 | `safe-outputs.staged: true` | `.github/workflows/agent-builder.md` |
| 2 | **Chưa** có `agent-builder.lock.yml` | `.github/workflows/` |
| 3 | Ghim gh-aw có đủ tag `vX.Y.Z` + SHA 40 hex + ngày audit `YYYY-MM-DD` | `.github/workflows/agent-builder.md` |
| 4 | Không xin `contents`/`issues`/`pull-requests: write`, không `write-all` | như trên |
| 5 | Kích hoạt bằng `label_command`; `roles` không chứa `write`; không `issue_comment`/`slash_command`/`pull_request_target` | như trên |
| 6 | *(khi có lock)* mọi `uses:` ghim SHA 40 hex | `agent-builder.lock.yml` |
| 7 | Ruleset giữ đúng 7 check bắt buộc, `strict`, `bypass_actors` rỗng | `.github/rulesets/main-protection.json` |
| 8 | Biểu mẫu Issue nhắc đủ `risk:low\|medium\|high` + `agent:ready`, và **không tự gắn** `agent:ready` | `.github/ISSUE_TEMPLATE/agent-task.yml` |
| 9 | Không workflow nào còn nhắc `AUTOPILOT_TASK_V0` | `.github/workflows/` |
| 10 | *(khi có trường CI-trigger)* giá trị là `app` **và** `safe-outputs.github-app` đủ `client-id`/`private-key`, không trỏ `NEXAGNET_*` | `.github/workflows/agent-builder.md` |
| 11 | Bản ghim gh-aw (tag + SHA + ngày audit) trùng nhau ở pilot, ADR, tài liệu bằng chứng | 3 tệp trên |

## Ba bài TỰ BẬT THEO ĐIỀU KIỆN, và vì sao đó không phải xanh giả

Bài **6**, **9** và **10** không cần ai nhớ bật — điều kiện tới thì chúng chạy:

- **6** đang skip vì chưa có `.lock.yml` — mà chính bài **2** khoá việc đó. Ngày ai đó commit lock
  (sau cổng §14), bài 6 chạy ngay và đòi mọi action ghim SHA.
- **9** đang skip vì `tools/autopilot-protocol/` còn tồn tại. Bước xoá nằm **sau** cổng §14, nên hôm
  nay bài này chưa có đối tượng. Ngày thư mục đó biến mất, bài 9 tự chạy.
- **10** kích hoạt ngay khi frontmatter khai `github-token-for-extra-empty-commit` lần đầu. Pilot
  **đã khai** (15/09/2026), nên bài 10 đang chạy thật, không skip.

Bài 6 và 9 in **lý do skip** ra output, nên một lần skip không thể bị đọc nhầm thành một lần đạt.

## Đã kiểm bằng mutation, không chỉ bằng "xanh"

Bảy đột biến đã chạy thật trên HEAD này và **cả bảy đều bị bắt đúng bài**, mỗi lần đều hoàn nguyên
và chạy lại đối chứng xanh:

| # | Đột biến | Bài đỏ |
|---|---|---|
| M0a | `staged: true` → `false` | 1 |
| M0b | `issues: read` → `write` | 4 |
| M1 | đổi tên khối `safe-outputs.github-app` (mô phỏng thiếu khối) | 10 |
| M2 | `github-token-for-extra-empty-commit: app` → một PAT | 10 |
| M3 | `client-id` trỏ `NEXAGNET_*` thay vì `NEXAGENT_*` | 10 |
| M4 | ngày audit trong ADR lệch một ngày | 11 |
| M5 | ADR ghim `v0.89.12` trong khi pilot ghim `v0.88.7` | 11 |

M1–M3 quan trọng vì cả ba đều là **lỗi im lặng lúc chạy thật**: gh-aw vẫn biên dịch, vẫn chạy, chỉ là
commit rỗng đi bằng `GITHUB_TOKEN` và CI lại đứng ở `action_required`.

Một bộ test cấu hình mà không ai thử làm hỏng thì không chứng minh được gì; ghi ở đây để lần sau
sửa gói này thì làm lại đúng vòng đó.

## Giới hạn đã biết — nói trước

`src/read-config.mjs` **không** dùng thư viện YAML. Nó tách dòng, bỏ chú thích, và trả về
`(thụt lề, khoá, giá trị)`. Đủ cho một khối frontmatter nhỏ do chính repo này viết, **không đủ** cho
chuỗi nhiều dòng, neo/alias, hay flow map lồng nhau. Nếu frontmatter của pilot cần những thứ đó, hãy
đổi sang một thư viện YAML — đừng làm hàm đó thông minh hơn.
