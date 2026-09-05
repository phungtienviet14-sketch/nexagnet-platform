# PoC — đánh giá `github/gh-aw` làm substrate Safe Outputs

> Bằng chứng cho **Issue #194**. Gói này **không** chạy trong production, **không** được import bởi
> `apps/`, `packages/` hay `tools/autopilot-orchestrator/`, và **xoá được hoàn toàn** mà không ảnh
> hưởng gì. Nó không gọi mạng, không cần bí mật, và không ghi gì lên GitHub.

Kết luận và lập luận đầy đủ: [docs/phat-trien/van-hanh/gh-aw-evaluation-v0.md](../../docs/phat-trien/van-hanh/gh-aw-evaluation-v0.md).

## Nguồn được audit — ghim SHA, không dùng `main` trôi

|     |                                            |
| --- | ------------------------------------------ |
| Kho | `github/gh-aw` (MIT, © GitHub, Inc.)       |
| SHA | `82239c030d6a1ef6ec8b87a80a1346eeef211f8d` |
| Tag | `v0.88.4` (2026-09-04)                     |

Ghi tại [`upstream.json`](upstream.json) — một nguồn duy nhất cho cả mã lẫn tài liệu.

## Chạy

```bash
pnpm --filter @netviet/poc-gh-aw-evaluation test
```

Bài kiểm đọc thẳng `fixtures/` nên chạy **offline, tất định, không cần clone**.

## Chứng minh fixtures chưa trôi khỏi upstream

```bash
git clone https://github.com/github/gh-aw.git /tmp/gh-aw
git -C /tmp/gh-aw checkout 82239c030d6a1ef6ec8b87a80a1346eeef211f8d
node tools/poc-gh-aw-evaluation/derive-fixtures.mjs /tmp/gh-aw
```

Sinh lại thì thêm `--write`. Script **từ chối chạy** nếu clone không ở đúng SHA — một bằng chứng ghim
SHA mà đọc nhầm cây thì không còn là bằng chứng.

## Ba phép đo

| PoC   | Câu hỏi (§10 hợp đồng task)                       | Tệp                                |
| ----- | ------------------------------------------------- | ---------------------------------- |
| **A** | Safe Outputs tái sử dụng độc lập được không?      | `tests/poc-a-standalone.test.mjs`  |
| **B** | gh-aw suy quyền từ loại Safe Output ra sao?       | `tests/poc-b-permissions.test.mjs` |
| **C** | Ranh giới không-tin-cậy / được-ghi có thật không? | `tests/poc-c-boundary.test.mjs`    |

Ba kết quả, nói ngắn:

- **A — `PARTIAL`.** Cả 5 tệp `.cjs` của tầng Safe Outputs **nạp và chạy được** trong một tiến trình
  Node trần (không trình biên dịch Go, không npm, không bí mật). Nhưng luật xác thực không nằm trong
  mã nguồn — chúng đến từ biến `GH_AW_VALIDATION_CONFIG`. **Thiếu** biến đó, hoặc biến đó **hỏng**,
  thì `validateItem()` **fail-open**: trả `isValid: true` và chuyển tiếp nguyên vẹn trường do tác
  nhân đặt vào.
- **B — thừa quyền có chủ đích.** `add-comment` **luôn** kéo theo **cả** `issues: write` lẫn
  `pull-requests: write` (đo trên 299 workflow đã sinh ra), vì lúc biên dịch gh-aw chưa biết mục tiêu
  là Issue hay PR. Thao tác chỉ chạm Issue thì chỉ `issues: write`.
- **C — ranh giới có thật và được cưỡng chế.** Trên cả 299 workflow, job `agent` **không bao giờ**
  cầm `issues`/`pull-requests`/`contents: write`. Quyền ghi chỉ nằm ở job `safe_outputs` riêng biệt.

## Bộ chuyển đổi trong `src/v0-to-safe-output.mjs`

Nó **là một phép đo, không phải một lớp tích hợp**. Câu hỏi không phải "viết được adapter không" —
gần như cái gì cũng viết được adapter. Câu hỏi là **chuyển đổi xong thì mất gì**, nên nó trả về
`items` song song với `gaps`. Danh sách `gaps` mới là kết quả.
