# Prompt phiên 11 — nối `RUN_WORKFLOW_IT` vào CI

> Dán toàn bộ phần dưới vào phiên Claude mới. Nguồn gốc: phiên 10 (24/08/2026).

---

Tiếp tục repo `phungtienviet14-sketch/nexagnet-platform`.
Mục tiêu phiên này: **nối `RUN_WORKFLOW_IT` vào `ci.yml`** để 24 bài IT của workflow engine
thật sự chạy trên CI, thay vì bị skip im lặng như hiện nay.

## Trạng thái bàn giao (phiên 10, 24/08/2026)

* `origin/main` = **`51f9da8e270372369ddace2028e8b6a474c2820a`** (merge commit của PR #34,
  hai cha `302d5b1e` + `9ceecf5`). CI run `32682923163` trên đúng SHA đó = **success**.
* Nhánh `feat/hoi-thoai-chot-don-main` ở `9ceecf5`, **ĐÃ PUSH**, **KHÔNG được xoá**
  (mọi PR của repo dùng lại nhánh này; các PR trước đều merge commit, không squash/rebase).
* Deploy gần nhất: run **`32683218604`** trên `51f9da8e` = **success**. Đã xác minh
  **hash `bootstrap-workflow-engine.sh` trên VM == `main`** (`4a4aa21d…`, 9386 byte) ⇒ VM không
  còn lệch code. Chạy thử bản đến qua pipeline: cổng idempotent dừng hẳn, exit 0, vẫn 1 version.
* **D8 XONG.** Workflow engine Hatchet đang chạy thật trên stack `ultty-gd1-test`:
  `hatchet-postgres` · `hatchet-engine` · `hatchet-dashboard` · `workflow-worker-v1`, tất cả healthy.
  Token ở secret `zalo-ultty-gd1-test-workflow-engine-token` (1 version).
  Chi tiết + bằng chứng: `docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md` **§46**.
* Working tree có **29 mục của việc song song** (16 modified + 13 untracked).
  **BẢO TOÀN NGUYÊN TRẠNG.** Không reset/stash/clean/checkout đè.
* ⛔ **`apps/mini/` (untracked) có 7 lỗi `no-unused-vars`** làm `pnpm lint` toàn repo ĐỎ ⇒ pre-push đỏ.
  **KHÔNG sửa `apps/mini/`** — đó là việc của phiên song song. Phiên 10 đã push bằng
  `ECC_SKIP_PREPUSH=1` **sau khi chạy scoped validation** trên đúng các tệp mình sửa. Làm y vậy.

## Việc chính — và vì sao nó KHÔNG phải một dòng env

`.github/workflows/ci.yml` job `integration` hiện chỉ đặt `RUN_PRISMA_IT: '1'`.
`RUN_WORKFLOW_IT` **không xuất hiện ở bất kỳ dòng nào** ⇒ **24 bài IT bị skip ở CẢ hai job**
`verify` và `integration`:

| Tệp | Số bài |
|---|---:|
| `apps/api/src/workflow/workflow-privacy-engine-read.int.spec.ts` | 9 |
| `apps/api/src/workflow/workflow-recovery.int.spec.ts` | 4 |
| `apps/api/src/workflow/workflow-e2e.int.spec.ts` | 3 |
| `apps/api/src/workflow/workflow-outbox-durability.int.spec.ts` | 3 |
| `apps/api/src/workflow/worker-readiness.int.spec.ts` | 3 |
| `apps/api/src/workflow/workflow-worker-recovery.int.spec.ts` | 2 |
| **Tổng** | **24** |

⇒ **"CI xanh" hiện KHÔNG chứng minh gì về workflow engine.** Mọi số liệu W4–W12/D1 chỉ tồn tại
khi có người chạy tay với engine Hatchet thật ở local.

**Bật cờ lên là KHÔNG đủ.** Đã đo ở phiên 10, `baseEnv()` trong
`apps/api/src/workflow/__tests__/workflow-it.harness.ts:395` đòi một **engine Hatchet SỐNG**:

```
WORKFLOW_ENGINE              = 'on'
WORKFLOW_ENGINE_HOST_PORT    = localhost:7744    <- cổng gRPC, KHÔNG phải REST dashboard
WORKFLOW_ENGINE_TLS_STRATEGY = 'none'
WORKFLOW_ENGINE_TOKEN        = <JWT do chính engine đúc sau migrate + quickstart>
```

Nên CI cần: dựng cụm Hatchet (`postgres → migration → setup-config → engine`, mỗi cái có điều kiện
`depends_on` riêng), **đúc token**, rồi mới chạy test. GitHub Actions `services:` **không diễn tả
được** chuỗi khởi tạo nhiều container có điều kiện này ⇒ nhiều khả năng phải là một step chạy
`docker compose` từ `tools/poc-workflow-engine/` rồi export token ra `$GITHUB_ENV`.

## Bốn cái bẫy ĐÃ ĐO — đừng phát hiện lại bằng tiền

1. **IT của workflow PHẢI chạy TUẦN TỰ**: `vitest run src/workflow --no-file-parallelism`.
   Song song 5 tệp → 9 bài ĐỎ; tuần tự → xanh. Lý do là **kiến trúc**: năm tệp đăng ký **cùng tên**
   `integration-handoff.v1` với **cùng engine**, engine định tuyến theo TÊN nên worker của tệp A
   nhận run của tệp B. Đây là bằng chứng chạy được cho bất biến "mỗi khách/môi trường MỘT engine".
2. **`workflow-outbox-durability.int.spec.ts` cần CẢ HAI** `RUN_PRISMA_IT=1` **và**
   `RUN_WORKFLOW_IT=1` **và** `WORKFLOW_ENGINE_TOKEN` — tức nó cần cả Postgres nghiệp vụ lẫn engine.
3. **Engine POC THOÁI HOÁ sau nhiều vòng stop/start.** Các bài W5/W6/W7 cố ý `docker stop` engine và
   `kill -9` worker; đăng ký của tiến trình đã chết tích lại và engine giao việc cho bản sao không
   còn tồn tại. Triệu chứng *run không tiến triển* **giống hệt** code hỏng.
   ⇒ Trước khi tin một kết quả ĐỎ: `down -v` → `up -d` → đúc token mới → đo lại.
   Nhưng **đỏ trên engine vừa dựng sạch thì KHÔNG được gọi là ô nhiễm môi trường** — điều tra code.
4. **Worker mất 6–38 giây đăng ký xong**, biến động lớn. Đừng đặt timeout chặt trong CI.

## Ràng buộc

* Không deploy production (`production` có `required_reviewers`).
* Không sửa `apps/mini/`. Không đụng 29 mục của việc song song.
* `AUTO_SEND` của gd1-test đang `off` sau deploy — **không tự bật lại**, đó là việc của người
  theo `ci-cd.md §8`.
* Không tự chế workaround. Nếu contract không khớp code, **dừng và báo root cause**.
  **Ưu tiên evidence over assumptions — tên job xanh không phải bằng chứng.**
* Thêm bất kỳ công tắc vận hành mặc định `off` nào ⇒ phải bật nó trong `baseEnv()` của harness IT
  **ngay trong cùng commit**. Harness không tự biết. (Bài học `dce7659`, làm đỏ 9/24 bài IT.)

## Nợ khác chưa động tới

1. **`optional_secret` và lớp gọi probe của preflight gộp mất ba sự thật khác nhau**:
   "chưa tạo" / "không có quyền" / "không hỏi được". Trong `gd1-test-preflight.mjs`, SSH hỏng
   (`safeRun` → `ok:false`) và gcloud từ chối (`denied|0|0`) **đổ vào cùng một `readable=false`**,
   rồi in ra bốn dòng khẳng định về *secret* mà có thể **sai cả bốn**.
   Đã tốn **hai** vòng deploy vì đúng lỗi lớp này (§45.4 và §46.6). Đáng sửa.
2. **Smoke của deploy phụ thuộc một LLM không tất định.** Một lần deploy đỏ vì DeepSeek gán
   `intent="khac"` (confidence 0,3) cho một đơn TH1 đúng chuẩn — trong khi chính nó soạn câu
   *"em xác nhận đơn ạ… 2.500.000đ"*. Run kế tiếp cùng commit thì xanh.
   ⇒ **Deploy có thể đỏ vì lý do không phải deploy.** Cân nhắc tách khẳng định `intent` khỏi cổng
   chặn deploy, hoặc cho retry có giới hạn.
3. `docs/phat-trien/ke-hoach/tong-quan.md:1643` còn ghi *"**Không** nối Hatchet vào `apps/api`,
   **không** deploy lên VM"* — nay đã lỗi thời (đó là phạm vi lúc quyết định ở phiên 5).
   Tệp đang bị phiên song song sửa nên phiên 10 không đụng.

## Đọc trước khi làm

* `docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md` **§46** (phiên 10) và **§45** (phiên 9).
* `docs/phat-trien/van-hanh/workflow-engine-runbook.md` §2 (vòng đời DRAIN) và §7 (tài nguyên).
* `docs/phat-trien/van-hanh/ci-cd.md` trước khi sửa `.github/workflows/` — 7 bất biến + 6 sự cố thật.
