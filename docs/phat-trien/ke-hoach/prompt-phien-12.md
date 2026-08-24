# Prompt phiên 12 — trả hai món nợ vận hành còn lại

> Viết cuối phiên 11 (24/08/2026). Phiên 11 đã đóng `RUN_WORKFLOW_IT` và §10/§11 của nguồn sự thật.
> Hai món nợ còn lại là **code thật**, không phải tài liệu.

---

## Dán nguyên phần dưới đây vào phiên mới

Tiếp tục repo `phungtienviet14-sketch/nexagnet-platform`. Mục tiêu phiên này: **trả hai món nợ vận
hành** đã đo được là gây tốn thật — preflight gộp mất ba sự thật khác nhau về secret, và cổng smoke
của deploy phụ thuộc một LLM không tất định.

### Trạng thái bàn giao (phiên 11, 24/08/2026)

`origin/main` = `7942121465864d4825d47524ea91ddfb0faaa03a` (merge commit của PR #36, hai cha
`29f92af` + `fd68c19`). CI trên đúng SHA đó = **success** (run `32688796394`).

Nhánh `feat/hoi-thoai-chot-don-main` — **KHÔNG được xoá**, mọi PR của repo dùng lại nhánh này, các
PR trước đều merge commit chứ không squash/rebase.

**Phiên 11 đã làm xong:**

| | |
|---|---|
| Job CI **`workflow-integration`** (job thứ 7) | dựng cụm Hatchet thật + chạy 24 bài IT |
| Bằng chứng | run `32688796394`, `Test Files 22 passed (22)` · **`Tests 201 passed (201)`** · 261,6 s |
| `tools/poc-workflow-engine/start-engine.sh` | MỚI — dựng cụm → đợi cổng → đọc tenant theo `slug` → đúc token, in **duy nhất** token ra stdout |
| Hợp đồng chống tái phát | +2 bài trong `deploy/netviet/workflow-isolation.contract.test.mjs` (18 → 20), đã kiểm bằng 3 ca âm tính |
| `docs/phat-trien/van-hanh/chay-kiem-workflow-engine.md` | MỚI — hướng dẫn cho người vận hành |
| `tong-quan.md` §10 + §11 | **đưa vào nguồn sự thật** (trước đó 320 dòng chỉ nằm trong working tree), thêm §11.6 trạng thái |
| `apps/mini/` 7 lỗi lint | đã sửa ⇒ `pnpm lint` toàn repo **exit 0** |

**Đọc `Tests 201 passed (201)`, đừng đọc tên job.** Thiếu cờ thì dòng đó là `177 passed | 24 skipped`
và màn hình **vẫn xanh** — đó chính xác là thứ đã xảy ra nhiều tuần.

**Working tree có 28 mục chưa commit** (15 modified + 13 untracked) của các luồng việc khác
(observability, orders, web/wata, `apps/mini/`). Người dùng xác nhận **không có phiên chạy song
song**, nhưng đây vẫn không phải việc của phiên này — **bảo toàn nguyên trạng**, không
reset/stash/clean/checkout đè.

### ⛔ Cổng trước push đang ĐỎ ở typecheck, không phải chỉ lint

Bàn giao phiên 10 ghi "apps/mini làm `pnpm lint` đỏ". Đo lại 24/08: **lint nay XANH** (phiên 11 đã
sửa 7 lỗi), nhưng **`pnpm typecheck` toàn repo = exit 2**, và thủ phạm duy nhất vẫn là `apps/mini`:

```
apps/mini typecheck: src/App.tsx(1,46): error TS2307: Cannot find module 'react'
apps/mini typecheck: src/App.tsx(31,9): error TS2875: ... 'react/jsx-runtime' ...
```

Nguyên nhân: `apps/mini/` **chưa từng có `node_modules`** — dependency của nó chưa bao giờ được cài.
Nó nằm trong `apps/*` của `pnpm-workspace.yaml` và khai script `typecheck`, nên `pnpm -r typecheck`
gọi tới nó và đỏ. 197 lỗi đều là thiếu types, **không phải lỗi code**.

Nên phiên này vẫn phải push bằng `ECC_SKIP_PREPUSH=1` sau scoped validation, y như phiên 10 và 11.

**Chạy `pnpm install` để sửa sẽ đụng `pnpm-lock.yaml`** — và `apps/mini/` đang untracked, tức chưa ai
quyết định nó có vào repo hay không. **Đó là quyết định của người, không phải của agent.** Hỏi trước.

---

## Món nợ #1 — preflight gộp mất ba sự thật về secret

**Đã tốn HAI vòng deploy vì đúng lớp lỗi này** (bàn giao workflow engine §45.4 và §46.6). Đây không
phải suy đoán về một lỗi có thể xảy ra; nó đã xảy ra hai lần.

### Chỗ hỏng thứ nhất — `deploy/netviet/render-secrets.sh:90`

```bash
optional_secret() {
  gcloud secrets versions access latest --project "${PROJECT_ID}" --secret "$1" 2>/dev/null | tr -d '\r' || true
}
```

Bốn tình huống khác hẳn nhau đều ra **chuỗi rỗng**:

| Thực tế | Hàm trả về | Hệ thống hiểu thành |
|---|---|---|
| secret chưa được tạo | `""` | "tuỳ chọn, không có" ✅ đúng |
| secret CÓ, VM thiếu `secretAccessor` | `""` | "tuỳ chọn, không có" ❌ **SAI** |
| gcloud/mạng hỏng | `""` | "tuỳ chọn, không có" ❌ **SAI** |
| secret có, đọc được | giá trị | ✅ |

Hai hàng ❌ là hai vòng deploy đã mất. Triệu chứng ngoài mặt: `WORKFLOW_ENGINE=on nhung thieu secret
zalo-ultty-gd1-test-hatchet-db-password` — trong khi secret **có thật**, chỉ là VM chưa được cấp
quyền đọc.

**Mẫu đúng đã có sẵn trong repo**, đừng phát minh lại: `deploy/netviet/bootstrap-workflow-engine.sh`
— cổng idempotent của nó phân biệt đúng ba trạng thái bằng `2>&1 >/dev/null` và `grep NOT_FOUND`, và
fail-closed khi không kết luận được. Chép đúng lý lẽ đó sang `optional_secret`:

- rc=0 → giá trị
- stderr có `NOT_FOUND` → rỗng, **và in một dòng ra stderr nói rõ "chưa tạo"** (đây là ca "tuỳ chọn" hợp lệ)
- còn lại (`PERMISSION_DENIED`, mạng, gcloud lỗi) → **dừng hẳn**, exit khác 0

> ⚠️ `render-secrets.sh` có `set -euo pipefail`. `exit` bên trong `$( )` chỉ giết subshell, nhưng
> `VALUE="$(optional_secret x)"` với rc khác 0 **sẽ** làm `set -e` dừng script — kiểm lại điều này
> bằng một lần chạy thật, đừng tin suy luận.

> ⚠️ **Đổi sang fail-closed làm rộng bán kính ảnh hưởng.** Deploy của `zalo-ultty` (production),
> `zalo-amico`, `zalo-wata` hiện đang **âm thầm đi qua** nếu thiếu IAM trên một secret tuỳ chọn nào
> đó. Sau bản sửa chúng sẽ **dừng**. Đó là chủ ý — nhưng phải kiểm trước xem có stack nào đang dựa
> vào hành vi cũ không, và nói rõ với người trước khi merge.

### Chỗ hỏng thứ hai — `deploy/netviet/gd1-test-preflight.mjs`

Hai đường gộp vào cùng một `readable = false`:

```js
// dòng 232 — MỌI lỗi gcloud đều thành 'denied'
`gcloud secrets versions access latest ... >"$probe" 2>/dev/null || { echo 'denied|0|0'; exit 0; }`

// dòng 283-284 — SSH hỏng (safeRun ok:false) cũng rơi vào cùng chỗ
const probe = probed.ok ? parseSecretProbe(probed.stdout) : {};
const readable = probed.ok && probe.accessible === true;
```

Rồi `credentialErrors` (dòng ~615) in ra **bốn dòng khẳng định** cho mỗi secret — `does not exist`,
`has no enabled version`, `VM cannot read`, `is empty` — mà khi SSH hỏng thì **cả bốn đều có thể
sai**, vì ta chưa từng hỏi được câu nào.

**Thiết kế đã phác (chưa viết một dòng code nào):** thêm trường `probeStatus` cho mỗi secret:

| `probeStatus` | Nghĩa | Việc phải làm |
|---|---|---|
| `readable` | đọc được | — |
| `missing` | gcloud nói `NOT_FOUND` | tạo secret |
| `denied` | gcloud nói `PERMISSION_DENIED` | cấp IAM, **đừng** tạo lại |
| `unknown` | gcloud lỗi vì lý do khác | không kết luận gì về secret |
| `unreachable` | **lệnh probe không chạy được** (SSH/IAP hỏng) | sửa đường vào, đây KHÔNG phải bằng chứng về secret |

Khi `probeStatus` khác `readable` → in **một** lý do chính xác thay cho bốn khẳng định.

**Ba ràng buộc của bộ test hiện có — đừng phá:**

1. `gd1-test-preflight.test.mjs` có bài *"formats a redacted plan without credential metadata or
   secret names"*: **tên secret KHÔNG được xuất hiện** trong output của `formatDeploymentPlan`. Giữ
   nhãn `#N`, đừng đưa tên vào thông báo lỗi — log CI cũng đọc được chúng.
2. Ba bài đang khẳng định chuỗi cũ: `/VM cannot read required secret/`, `/secret #1 does not exist/`,
   `/has no enabled version/`, `/is empty/`, `/CR\/LF/`. Chúng dựng object **không có** `probeStatus`
   ⇒ giữ nhánh cũ làm fallback, thêm nhánh mới lên trên. Đây không phải workaround: validator là hàm
   thuần nhận JSON, đầu vào cũ hợp lệ.
3. Mock trong test trả `'nonempty|0|0\n'` cho lệnh chứa `secrets versions access` — mã mới phải vẫn
   hiểu chuỗi đó.

**Phải thêm ca ÂM TÍNH.** Một bộ quét chưa bao giờ đỏ thì không chứng minh gì — đó là chuẩn của tệp
`workflow-isolation.contract.test.mjs`. Ít nhất: mỗi `probeStatus` một bài, và một bài chứng minh
`unreachable` KHÔNG in ra bốn khẳng định về secret.

Validate: `pnpm test:deploy-preflight` (hiện **23/23**) và `pnpm test:deploy-contracts` (hiện
**50/50**).

---

## Món nợ #2 — cổng smoke của deploy phụ thuộc một LLM không tất định

`deploy/netviet/smoke-test.mjs:175`:

```js
if (order.intent !== 'dat_don' || !order.priced) {
  throw new Error(`Flowise khong tao duoc don dat_don: ${order.intent}`);
}
```

`intent` do **DeepSeek** phân loại. Một lần deploy đã ĐỎ vì nó gán `intent="khac"` (confidence 0,3)
cho một đơn TH1 đúng chuẩn — **trong khi chính nó soạn được câu "em xác nhận đơn ạ… 2.500.000đ"**.
Run kế tiếp trên **cùng một commit** thì xanh. ⇒ **deploy có thể đỏ vì lý do không phải deploy.**

Mọi khẳng định khác trong smoke đều tất định (giá do rules engine tính, hình dạng trace 6 vai/1 LLM
call, các bước SSE, trạng thái đơn, không có mã ERP). Chỉ mỗi `intent` là xúc xắc.

**Hướng đã cân nhắc — retry có giới hạn + BÁO TO, không nới lỏng:**

- Chỉ thử lại khi thất bại **đúng là** `intent !== 'dat_don'`. Nếu `intent` đúng mà `priced` thiếu →
  đó là lỗi rules engine, **đỏ ngay**, không retry. Nếu hình dạng trace sai → đỏ ngay.
- Mỗi lần thử là một `/demo/simulate` mới (marker mới, order id mới).
- Thành công ở lần thứ k > 1 → in một dòng **báo to** kiểu `SMOKE_INTENT_ATTEMPTS=k`, cùng khuôn với
  `SMOKE_SKIPPED_ORDER_PATH=1` đã có. Suy giảm phải **nhìn thấy được**, không được im lặng.
- Hết N lần vẫn sai → đỏ, liệt kê đủ N `intent` + confidence quan sát được.

> **Bất biến #7 của `ci-cd.md`: "Cổng smoke không được làm yếu."** Xoá phăng khẳng định `intent` là
> vi phạm. Retry có giới hạn **kèm báo cáo** thì không: nếu LLM sai cả N lần, cổng vẫn chặn.

Cân nhắc trước khi viết: `assertPilotOrder` còn được gọi ở đường `VERIFY_ORDER_ID` (đọc lại đơn đã
tồn tại sau restart) — chỗ đó **không retry được và không cần**, vì đơn đã mang sẵn intent từ lần
tạo. Đừng nhét retry vào chung một hàm cho gọn.

---

## Ràng buộc

- Không deploy production (`production` có required_reviewers).
- **Không tự bật `AUTO_SEND`** — gd1-test đang `off` sau deploy, đó là việc của người theo `ci-cd.md` §8.
- Không đụng 28 mục chưa commit của luồng việc khác. Không `pnpm install` (⇒ `pnpm-lock.yaml`) khi
  chưa hỏi người.
- **Không tự chế workaround.** Contract không khớp code thì dừng và báo root cause.
- **Evidence over assumptions.** Tên job xanh không phải bằng chứng — đọc dòng số. Phiên 11 có bài
  học sống: lần chạy CI đầu tiên của cổng mới ĐỎ, và đó là thứ chứng minh cổng thật sự đo một cái gì
  đó. Một cổng mới xanh ngay lần đầu **không phân biệt được** với một cổng không chạy gì.
- Thêm bất kỳ công tắc vận hành mặc định `off` nào ⇒ phải bật nó trong `baseEnv()` của harness IT
  **ngay trong cùng commit** (bài học `dce7659`, làm đỏ 9/24 bài IT).

## Bẫy môi trường đã đo — đừng phát hiện lại

1. **Bash tool băm escape trong heredoc.** Viết `\\n` trong `<<'PY'` thì Python nhận một **xuống dòng
   thật** — đã làm hỏng âm thầm hai bản vá trong phiên 11 (một JS `split`, một `printf` trong YAML),
   chỉ lộ ra khi parser kêu "missing closing quote". Dùng tool `Edit` cho mọi chuỗi có backslash,
   hoặc dựng ký tự bằng `chr(92)`.
2. **`python3` là bản Windows** — dùng `C:\Users\...`, `/c/Users/...` là `FileNotFoundError`.
3. **Hook quét bí mật bắt cả `TOKEN="$(lệnh)"`** trong khối `run:` của YAML — cảnh báo giả. Đổi tên
   biến sang thứ không mang nghĩa thông tin đăng nhập. **Đừng** `ECC_SKIP_PRECOMMIT=1`.
4. **IT của workflow PHẢI chạy tuần tự** — `--no-file-parallelism`. Song song → 9 bài đỏ. Đây là bất
   biến "mỗi khách/môi trường MỘT engine" đang tự bảo vệ.
5. **Engine POC thoái hoá** sau nhiều vòng stop/start. Trước khi tin một kết quả ĐỎ: `down -v` →
   `start-engine.sh` → đo lại. Nhưng **đỏ trên engine vừa dựng sạch thì phải điều tra code**, và
   trên CI mỗi lần chạy là một máy mới nên ca này không áp dụng.

## Đọc trước khi làm

- `docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md` §45.4, §46.6 (hai vòng deploy đã mất vì nợ
  #1) và §47 (phiên 11).
- `docs/phat-trien/van-hanh/ci-cd.md` — 7 bất biến + 6 sự cố thật; §3 nay có phần workflow IT.
- `docs/phat-trien/van-hanh/chay-kiem-workflow-engine.md` — cổng CI mới hoạt động thế nào.
- `deploy/netviet/bootstrap-workflow-engine.sh` — **mẫu tham chiếu** cho cách phân biệt ba trạng thái
  secret. Đừng viết lại từ đầu.
