# Bàn giao phiên 12 — 24/08/2026

> **STATUS: HISTORICAL SNAPSHOT**
> **AS OF:** 2026-08-24 (`2c9e006`)
> **SUPERSEDED BY:** [tong-quan.md §12](tong-quan.md#12-trạng-thái-nền-tảng--documentation-truth-reset-27082026)
>
> Giữ nguyên để tra cứu lịch sử nghiên cứu và quyết định. **Không dùng làm trạng thái hiện tại.**
> Chỗ nào tài liệu này mâu thuẫn với bản canonical ở trên, bản canonical đúng.

> Phạm vi phiên: 4 khoản nợ ở [`ban-giao-workflow-engine.md`](ban-giao-workflow-engine.md) §47.8.
> Kế hoạch gốc của phiên: [`prompt-phien-12.md`](prompt-phien-12.md).
> **Dừng giữa phiên theo yêu cầu người dùng.** Mục §5.2 là việc còn treo — đọc trước khi làm tiếp.

Nhánh: `feat/hoi-thoai-chot-don-main`. **Chưa commit gì** — toàn bộ nằm trong working tree.

---

## 1. Dọn tiến trình sót (xong)

Phiên song song hết hạn mức để lại **12 tiến trình dev** chạy từ 22–23/08. Đã giết theo thứ tự
lá-trước-gốc sau khi xác minh không PID nào thuộc cây tiến trình của phiên hiện tại:

| Chuỗi | Nội dung | PID |
|---|---|---|
| PoC workflow engine | `tsx src/proof-endpoint.ts` + esbuild | 18644 · 14608 · 14964 · 1028 |
| `next dev -p 3000` | worker ăn **1,58 GB** | 21408 · 28228 · 17600 · 27340 |
| `next start -p 3100` | | 22360 · 13032 · 9712 |
| worker workflow | `worker-main.ts` | 24876 |

Đo sau khi dọn: **cổng 3000 và 3100 trả về tự do**, ~1,65 GB RAM thu hồi.

> **Cạm bẫy đã tránh:** `claude.exe` PID 7924 (khởi động 22/08 8:39) **là tổ tiên của phiên hiện
> tại** — app shell, không phải phiên sót. Cụm ~11 `claude.exe` cùng mốc 8:39 là tiến trình con
> `--type=renderer|utility|gpu-process` của nó. Giết theo mốc thời gian là tự cắt phiên đang chạy.
> Luôn dựng tập bảo vệ = tổ tiên của `$PID` ∪ hậu duệ của app shell **trước** khi giết.

---

## 2. Nợ #4 — `tong-quan.md:1643` lỗi thời: **ĐÃ ĐÓNG TỪ TRƯỚC**

Commit `2a7d211` (*"sua §11.5 het hieu luc"*) đã sửa: §11.5 nay gạch ngang câu *"Không nối Hatchet
vào apps/api…"* kèm *"→ đã làm cả ba (§11.6)"*, và thêm §11.6 mô tả hiện trạng. Chỉ còn việc cập
nhật §47.8 cho khỏi lệch.

## 3. Nợ #5 — 7 lỗi lint `apps/mini/`: **ĐÃ XANH, NHƯNG CHƯA COMMIT**

Đo thật: `pnpm exec eslint apps/mini` → **18 tệp, 0 lỗi**; `pnpm lint` toàn repo → **exit 0**.
Phiên song song đã sửa trong working tree rồi mới hết hạn mức.

⚠️ `apps/mini/` vẫn **untracked toàn bộ** — thuộc luồng việc khác (Zalo Mini App), phiên này không
commit hộ. Bản sửa lint sẽ mất nếu ai đó `git clean`.

---

## 4. Nợ #2 — `optional_secret` + lớp probe gộp ba sự thật: **XONG, ĐÃ ĐO**

Ba lớp cùng nuốt sự thật; sửa cả ba.

### 4.1 `render-secrets.sh` — `optional_secret` fail-closed

| Tình huống | Trước | Sau |
|---|---|---|
| đọc được | giá trị | giá trị |
| **chưa tạo** (`NOT_FOUND`) | `""` im lặng | `""` + **một dòng stderr nói rõ** → deploy đi tiếp |
| **thiếu IAM** (`PERMISSION_DENIED`) | `""` im lặng ❌ | **`exit 78`** + chỉ đúng việc phải làm |
| **gcloud/mạng hỏng** | `""` im lặng ❌ | **`exit 78`** |

Cùng lý lẽ với cổng idempotent `bootstrap-workflow-engine.sh:101` (`2>&1 >/dev/null` + `grep
NOT_FOUND`, fail-closed). stderr vào **tệp tạm** chứ không `2>&1`: gcloud in được cảnh báo ra stderr
ngay khi thành công, và một dòng `WARNING:` lẫn vào giá trị là một bí mật sai.

**Đã kiểm bằng lần chạy thật, không suy luận:** `set -e` *có* dừng script khi command substitution
thất bại — script thử nghiệm thoát đúng **77**. Nên `exit` trong `$( )` chặn được deploy thật.

### 4.2 `gd1-test-preflight.mjs` — `probeStatus` thay cho một bit dùng ba lần

Script probe trên VM nay phân loại stderr thành `missing` / `denied` / `unknown` thay vì in `denied`
cho mọi thất bại. Lớp gọi thêm `probeStatus`, và **SSH hỏng → `unreachable`**, không còn đổ chung
vào `readable=false`. Ba trường `exists`/`enabledVersion`/`vmCanAccess` giờ **chỉ được đặt khi thật
sự đọc được** — `undefined` là "chưa biết", khác hẳn `false` là "biết là không".

Validator cho **một** lý do chính xác thay bốn khẳng định. Bằng chứng ký trước 24/08/2026 (không có
`probeStatus`) vẫn kiểm lại được bằng nhánh cũ — validator là hàm thuần nhận JSON.

### 4.3 Số đo

| Bộ | Trước | Sau |
|---|---:|---:|
| `pnpm test:deploy-preflight` | 23/23 | **30/30** |
| `pnpm test:deploy-contracts` | 50/50 | **57/57** |

**Kiểm đột biến (quan trọng):** tắt nhánh `probeStatus` (`switch (undefined)`) → **5 bài đỏ, 25
xanh**. Các bài mới thật sự đo, không phải xanh vì không chạy gì. Đã khôi phục tệp, 30/30 lại xanh.

### 4.4 ⚠️ Bán kính ảnh hưởng — PHẢI NÓI VỚI NGƯỜI TRƯỚC KHI MERGE

`optional_secret` nay **fail-closed**. Các stack `zalo-ultty` (production), `zalo-amico`,
`zalo-wata` trước đây **âm thầm đi qua** khi thiếu IAM trên một secret tuỳ chọn; sau bản sửa chúng
sẽ **dừng với exit 78**. Đó là chủ ý.

Đánh giá rủi ro: cả 5 secret tuỳ chọn (`anthropic-api-key`, `zalo-bot-token`, `hatchet-db-password`,
`workflow-engine-token`, `workflow-dashboard-htpasswd`) đều đã nằm trong `$secretSuffixes` của
`deploy.ps1`, tức stack nào lên qua `deploy.ps1` đều có binding. Vòng gà-trứng của
`WORKFLOW_ENGINE_TOKEN` ở lần deploy đầu đi qua nhánh `NOT_FOUND` → vẫn rỗng, vẫn đi tiếp.
**Chưa xác minh trên GCP thật** vì phiên này không gọi `gcloud`.

---

## 5. Nợ #3 — smoke phụ thuộc LLM: **CODE XONG, TEST CHƯA CHỨNG MINH ĐƯỢC**

### 5.1 Đã làm

`smoke-test.mjs`: tách `classifyPilotOrder()` khỏi `assertPilotOrder()`, rồi thử lại **có giới hạn
`INTENT_RETRY_LIMIT = 3`** ở đúng đường `/demo/simulate`.

- Chỉ `kind: 'intent'` được thử lại. Mỗi lần thử là một `/demo/simulate` mới (marker mới, id mới).
- **Tách `!priced` ra khỏi điều kiện của `intent`** — trước đây hai thứ dùng chung một `if` và một
  thông báo. Intent đúng mà thiếu giá là lỗi **rules engine**, tất định ⇒ đỏ ngay, không retry.
  Hình dạng trace sai cũng đỏ ngay.
- Thành công ở lần k > 1 → in `SMOKE_INTENT_ATTEMPTS=k`, cùng khuôn `SMOKE_SKIPPED_ORDER_PATH=1`.
- Sai cả 3 lần → đỏ, liệt kê đủ 3 `intent` + confidence.
- Đường `VERIFY_ORDER_ID` **giữ nguyên** — không nhét retry vào đó, đơn đã mang sẵn intent.

`node --check` OK, `eslint` OK. **Chưa có bài test nào xanh cho phần này.**

### 5.2 ⛔ Việc còn treo — bài test tự treo, và đã biết vì sao

`deploy/netviet/smoke-intent-retry.contract.test.mjs` (mới, **5 ca**) dựng máy chủ `node:http` giả
rồi chạy `smoke-test.mjs` như tiến trình con. Nó **chạy quá 300 s rồi bị dừng tay** — chưa từng
xanh, và **chưa được nối vào `package.json`**.

**Nguyên nhân đã chẩn đoán (chưa sửa):** harness dùng `spawnSync`, mà `spawnSync` **chặn event loop
của Node**. Máy chủ giả nằm *cùng tiến trình* nên không phục vụ được request nào của tiến trình con
— con treo ở `GET /health` cho tới khi hết `timeout: 90_000`, nhân 5 ca = 450 s.

Đây là lỗi **harness test**, không phải lỗi bản sửa `smoke-test.mjs`.

**Việc phải làm, theo đúng thứ tự:**

1. Đổi `spawnSync` → `spawn` bất đồng bộ (bọc Promise, gom `stdout`/`stderr`) trong `withStubApi()`,
   để máy chủ giả phục vụ được trong lúc tiến trình con chạy.
2. Chạy `node --test deploy/netviet/smoke-intent-retry.contract.test.mjs` → phải **5/5**.
3. **Kiểm đột biến** như §4.3: hạ `INTENT_RETRY_LIMIT` về `1` → ca *"một lần gán sai intent rồi
   đúng"* phải ĐỎ. Xanh ngay lần đầu thì không phân biệt được với cổng không chạy gì.
4. Nối vào `test:deploy-contracts` trong `package.json` (cạnh `optional-secret.contract.test.mjs`
   đã có ở cuối danh sách).
5. Chạy lại `pnpm test:deploy-contracts` — kỳ vọng **62/62** (57 + 5).

### 5.3 Chưa làm

Chưa chạy `pnpm lint` và `pnpm test` toàn repo **sau** các sửa đổi ở §4–§5. Chưa deploy, chưa xác
minh trên VM.

---

## 6. Trạng thái tệp — chưa commit gì

| Tệp | Trạng thái |
|---|---|
| `deploy/netviet/gd1-test-preflight.mjs` | sửa — probe phân loại + `probeStatus` + validator |
| `deploy/netviet/gd1-test-preflight.test.mjs` | sửa — +7 ca, đã đo 30/30 |
| `deploy/netviet/render-secrets.sh` | sửa — `optional_secret` fail-closed |
| `deploy/netviet/optional-secret.contract.test.mjs` | **mới** — 7 ca, đã đo 7/7 |
| `deploy/netviet/smoke-test.mjs` | sửa — `classifyPilotOrder` + retry có giới hạn |
| `deploy/netviet/smoke-intent-retry.contract.test.mjs` | **mới** — 5 ca, **chưa xanh lần nào** |
| `package.json` | sửa — nối `optional-secret.contract.test.mjs` vào `test:deploy-contracts` |

Ngoài ra working tree còn **28 mục của luồng việc khác** (`apps/mini/`, `tenants/wata/`,
`apps/web/experiences/agent-workforce/`, các `.png`, `prompt-phien-12.md`, các sửa đổi
observability/orders). Phiên này **không đụng** vào chúng.

---

## 7. Ràng buộc còn hiệu lực

- Không deploy production (`production` có required_reviewers).
- **Không tự bật `AUTO_SEND`** — gd1-test đang `off` sau deploy 24/08, đó là việc của người
  (`ci-cd.md` §8).
- Cổng deploy gd1-test đòi `refs/heads/main` + CI xanh trên main ⇒ mọi kế hoạch tới deploy phải
  tính thêm bước merge.
- Không `pnpm install` (⇒ `pnpm-lock.yaml`) khi chưa hỏi người.
