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

## Mười bốn bất biến

| # | Khoá điều gì | Đọc tệp nào |
|---|---|---|
| 1 | `safe-outputs.staged: true` | `.github/workflows/agent-builder.md` |
| 2 | **Đã** có `agent-builder.lock.yml` *(lật chiều 16/09/2026 — xem dưới)* | `.github/workflows/` |
| 3 | Ghim gh-aw có đủ tag `vX.Y.Z` + SHA 40 hex + ngày audit `YYYY-MM-DD` | `.github/workflows/agent-builder.md` |
| 4 | Không xin `contents`/`issues`/`pull-requests: write`, không `write-all` | như trên |
| 5 | Kích hoạt bằng `label_command`; `roles` không chứa `write`; không `issue_comment`/`slash_command`/`pull_request_target` | như trên |
| 6 | *(khi có lock)* mọi `uses:` ghim SHA 40 hex | `agent-builder.lock.yml` |
| 7 | Ruleset giữ đúng 7 check bắt buộc, `strict`, `bypass_actors` rỗng | `.github/rulesets/main-protection.json` |
| 8 | Biểu mẫu Issue nhắc đủ `risk:low\|medium\|high` + `agent:ready`, và **không tự gắn** `agent:ready` | `.github/ISSUE_TEMPLATE/agent-task.yml` |
| 9 | Không workflow nào còn nhắc `AUTOPILOT_TASK_V0` | `.github/workflows/` |
| 10 | *(khi có trường CI-trigger)* giá trị là `app` **và** `safe-outputs.github-app` đủ `client-id`/`private-key`, không trỏ `NEXAGNET_*` | `.github/workflows/agent-builder.md` |
| 11 | Bản ghim gh-aw (tag + SHA + ngày audit) trùng nhau ở pilot, ADR, tài liệu bằng chứng | 3 tệp trên |
| 12 | `compiler_version` trong `# gh-aw-metadata:` của lock **trùng** tag đã ghim | `agent-builder.lock.yml` |
| 13 | Pilot khai **đủ cả hai nửa** cổng rủi ro: bước `id: risk_gate` trong `on.steps` **và** đúng một `if:` ở gốc tham chiếu `risk_gate_result` | `.github/workflows/agent-builder.md` |
| 14 | Lock **thật sự** lộ `risk_gate_result`, có điều kiện `== 'success'`, và job `agent` vẫn `needs: activation` | `agent-builder.lock.yml` |

### Bài 2 đã lật chiều — ghi lại vì nó trông giống một lần nới lỏng

Bản đầu (PR #310) khoá điều **ngược lại**: `.lock.yml` **không** được tồn tại. Lý do khi đó đúng —
GitHub Actions chỉ chạy `.lock.yml`, nên một tệp lock là thứ biến pilot từ văn bản thành workflow
thật, và việc đó phải qua cổng review độc lập §14 của #309 trước. Cổng đó **đã qua**: #310 được
review và merge thành `86d106e`. Chính chú thích của bài test cũ đã ghi sẵn rằng khi lock được
commit thì phải cập nhật bài này cùng lúc — đây là lần đó.

Chiều mới vẫn là ràng buộc thật, không phải một ô tick: thiếu lock thì bài **6** (ghim SHA) và
**12** (đúng bản biên dịch) mất đối tượng đo, và bài **14** không còn gì để đọc.

## Hai bài TỰ BẬT THEO ĐIỀU KIỆN, và vì sao đó không phải xanh giả

- **6** *(đã kích hoạt 16/09/2026)* — trước đây skip vì chưa có `.lock.yml`. Lock đã commit, nên bài
  này **đang chạy thật** và đòi mọi `uses:` ghim SHA 40 hex. Đo được: 9/9 action ghim SHA.
- **9** vẫn skip vì `tools/autopilot-protocol/` còn tồn tại. Bước xoá nằm ở **Phase C của #311** và
  chỉ mở khi đủ 7/7 tình huống `PROVEN` — hôm nay 0/7. Ngày thư mục đó biến mất, bài 9 tự chạy.
- **10** kích hoạt ngay khi frontmatter khai `github-token-for-extra-empty-commit` lần đầu. Pilot
  **đã khai** (15/09/2026), nên bài 10 đang chạy thật, không skip.

Bài 9 in **lý do skip** ra output, nên một lần skip không thể bị đọc nhầm thành một lần đạt.

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

### Vòng #311 — bốn đột biến nữa cho bốn bài mới/đổi chiều

**4/4 bị bắt đúng bài**, mỗi lần hoàn nguyên rồi chạy lại đối chứng và **cả bốn lần đều xanh**:

| # | Đột biến | Bài đỏ thực tế |
|---|---|---|
| M6 | đổi tên `agent-builder.lock.yml` đi chỗ khác | **2, 12, 14** |
| M7 | `compiler_version` trong lock → `v0.89.15` | **12** |
| M8 | bỏ dòng `if:` ở gốc frontmatter, **giữ nguyên** bước `risk_gate` | **13** |
| M9 | `agent.needs: activation` → `pre_activation` trong lock | **14** |

M6 làm đỏ **ba** bài chứ không phải một, vì 12 và 14 cũng đọc lock. Chồng lấn đó có ích, nhưng đừng
đọc "3 bài đỏ" thành "3 lỗi khác nhau".

M8 là đột biến đáng giá nhất của vòng này: nó mô phỏng đúng kiểu hỏng im lặng mà cổng rủi ro sinh ra
được — bước `risk_gate` vẫn chạy, vẫn in `TU CHOI`, mà job agent vẫn đi tiếp. Không bài nào khác bắt
được nó, vì lock lúc đó vẫn nguyên vẹn và vẫn có đủ mọi thứ bài 14 đi tìm.

Một bộ test cấu hình mà không ai thử làm hỏng thì không chứng minh được gì; ghi ở đây để lần sau
sửa gói này thì làm lại đúng vòng đó.

## Giới hạn đã biết — nói trước

`src/read-config.mjs` **không** dùng thư viện YAML. Nó tách dòng, bỏ chú thích, và trả về
`(thụt lề, khoá, giá trị)`. Đủ cho một khối frontmatter nhỏ do chính repo này viết, **không đủ** cho
chuỗi nhiều dòng, neo/alias, hay flow map lồng nhau. Nếu frontmatter của pilot cần những thứ đó, hãy
đổi sang một thư viện YAML — đừng làm hàm đó thông minh hơn.

> ⚠️ **Giới hạn đó nay đã bị chạm, và đây là chỗ nó có thể cắn.** Từ 16/09/2026 frontmatter của pilot
> có một khối `run: |` nhiều dòng (bước `risk_gate`). Bộ tách dòng **không** hiểu đó là một chuỗi —
> nó coi từng dòng bên trong như một dòng YAML bình thường. Hôm nay vô hại: không dòng nào trong khối
> đó khớp `^<thụt lề>[A-Za-z0-9_.-]+:`, và bài 13 lọc theo `indent === 0` nên chỉ thấy `if:` thật.
> Nhưng **viết một dòng script kiểu `foo: bar` vào khối `run:` là đủ để sinh ra một khoá ma**. Nếu
> khối đó dài thêm, hãy đổi sang thư viện YAML trước, đừng vá bằng thêm điều kiện lọc.
