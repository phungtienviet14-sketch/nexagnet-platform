# Quản trị GitHub — bảo vệ `main` (P3)

> **Trạng thái: CLOSED / CONFIG-PROVEN + NEGATIVE-PROVEN** — đo ngày 28/08/2026.
> Trước đó `main` **không** có cơ chế cưỡng chế nào (0 ruleset, `branches/main/protection` → 404).
>
> ⚠️ **Tệp này KHÔNG phải là cơ chế cưỡng chế.** Cưỡng chế nằm ở cấu hình GitHub phía máy chủ.
> `.github/rulesets/main-protection.json` chỉ là **bản ghi + nguồn để dựng lại**, GitHub **không**
> tự đọc nó. Muốn biết thực tế đang bật gì thì **hỏi API**, đừng đọc tệp này (xem §6).

## 1. Vì sao

Một agent (Claude/Codex) mở PR vào một repo không bắt buộc review và không bắt buộc CI thì "mở PR"
và "ghi thẳng vào production" là **cùng một hành động**. P3 tồn tại để biến luồng dưới đây thành thứ
*không thể đi vòng*, chứ không phải thứ *nên tuân thủ*:

```
Claude/Codex → nhánh → PR → CI bắt buộc → duyệt → merge → deploy bất biến
```

Không bao giờ: `agent → push thẳng main → production`. Không sửa mã nguồn qua SSH.

## 2. Đang cưỡng chế cái gì

**Ruleset `main-protection`** — id `21740233`, `enforcement: active`, target `~DEFAULT_BRANCH`.

| Kiểm soát | Rule | Tác dụng |
|---|---|---|
| Bắt buộc PR | `pull_request` | Không ai ghi thẳng vào `main` |
| Bắt buộc CI xanh | `required_status_checks` | 7 job, `strict` = nhánh phải cập nhật với `main` |
| Chặn force-push | `non_fast_forward` | Không viết lại lịch sử `main` |
| Chặn xoá nhánh | `deletion` | Không xoá `main` |
| Buộc giải quyết review thread | `required_review_thread_resolution` | Bình luận review phải được xử lý trước khi merge |

**`bypass_actors: []` — KHÔNG AI được miễn trừ, kể cả chủ repo.** Đây là khác biệt cốt lõi so với
branch protection cổ điển (nơi `enforce_admins` là một cờ bật/tắt). Bằng chứng: các phép thử ở §4
đều chạy bằng **token của chính chủ repo với vai admin** và **đều bị từ chối**.

### 2.1 Bảy status check bắt buộc

`verify` · `integration` · `workflow-integration` · `tenant-packs` · `e2e` · `audit` · `images`

Đây là **toàn bộ** job của `.github/workflows/ci.yml`, tất cả đều chạy vô điều kiện trên
`pull_request` (không path filter, không `if:` mức job). Tên check đã đối chiếu với check-run thật
trên `main` và trên head-sha của 3 PR merged gần nhất — trùng khít, đều do app `github-actions`
(`integration_id: 15368`) báo cáo.

> **Bẫy vận hành — đọc trước khi đổi tên job.** Required check khớp theo **tên**. Đổi tên một job
> trong `ci.yml` mà không cập nhật ruleset ⇒ check bắt buộc **không bao giờ được báo cáo** ⇒ mọi PR
> kẹt vĩnh viễn ở "Expected". Đổi tên job là thao tác **hai bước**: sửa `ci.yml` **và** sửa ruleset
> trong cùng một PR. Thêm job mới vào `ci.yml` thì nó **không** tự trở thành bắt buộc.

## 3. Cổng môi trường deploy

| Environment | Nhánh được deploy | Người duyệt | Admin bỏ qua được? |
|---|---|---|---|
| `dev` | *(mọi nhánh)* | không | — |
| `gd1-test` | **chỉ `main`** | không *(cố ý — stack tham chiếu chạy tự động)* | có |
| `production` | **chỉ `main`** | **bắt buộc** (`phungtienviet14-sketch`) | **KHÔNG** |

Hai thay đổi của P3:

- **`gd1-test` giới hạn về `main`.** Trước đó ràng buộc này chỉ tồn tại trong *mã shell* của
  `reusable-deploy-tenant.yml` (`[[ "${GITHUB_REF}" == 'refs/heads/main' ]]`). Một agent sửa
  workflow là gỡ được. Nay nó là **deployment branch policy** ở tầng GitHub — nằm ngoài tầm với của
  mã trong repo. Cổng trong workflow **giữ nguyên**: hai lớp, không thay thế nhau.
- **`production` bỏ quyền admin bỏ qua** (`can_admins_bypass: false`). Trước đó cổng duyệt là thứ
  admin bấm qua được.

`dev` **cố ý không siết**: đó là nơi thử nghiệm từ nhánh feature. Nó không phải môi trường khách.

## 4. Bằng chứng phủ định (đo 28/08/2026)

Cả ba phép thử chạy qua GitHub REST API bằng token của chủ repo (vai admin, không nằm trong
`bypass_actors`). `main` **không hề thay đổi**, trước và sau vẫn là `ae04b2b6`.

| # | Phép thử | Kết quả | Thông điệp của GitHub |
|---|---|---|---|
| A | `PATCH refs/heads/main` → commit mới (fast-forward, không PR) | **BỊ TỪ CHỐI** 422 | `Changes must be made through a pull request.` + `7 of 7 required status checks are expected.` |
| B | `PATCH refs/heads/main` → commit cũ, `force: true` | **BỊ TỪ CHỐI** 422 | `Cannot force-push to this branch` + `Changes must be made through a pull request.` |
| C | PR chưa đủ CI → gọi merge (PR #69) | **BỊ TỪ CHỐI** 405 | `7 of 7 required status checks have not succeeded.` — `mergeStateStatus: BLOCKED` |

> **Phép thử xoá nhánh — không kết luận được, và nói rõ ở đây.** `DELETE refs/heads/main` bị từ chối
> với `Cannot delete the default branch` — đó là **hàng rào mặc định của GitHub cho nhánh mặc định**,
> **không phải** rule `deletion` của ruleset. Rule `deletion` có mặt trong cấu hình (đã đọc lại từ
> API) nhưng **chưa được chứng minh độc lập**: muốn chứng minh phải hạ `main` khỏi vai trò nhánh mặc
> định, và việc đó gây hại thật. Kết luận trung thực: **xoá `main` bị chặn bởi hai lớp, một lớp đã
> quan sát được, một lớp mới chỉ ở mức cấu hình.**

**Bằng chứng khẳng định (cùng PR #69, đóng chính P3 này):** sau khi đủ 7 check,
`mergeStateStatus` chuyển `BLOCKED` → `CLEAN`, và **đúng lời gọi API đã trả `405` ở phép thử C**
lần này trả `merged: true`. Cùng một lệnh, hai kết quả — khác nhau đúng ở chỗ CI đã xanh.

## 5. Giới hạn CHƯA giải quyết

**Repo một chủ — không cưỡng chế được review bởi người thứ hai.** `phungtienviet14-sketch` là
collaborator **duy nhất**. GitHub **cấm tự duyệt PR của chính mình**, nên đặt
`required_approving_review_count: 1` sẽ khoá cứng mọi PR: chủ repo không merge được gì nữa, kể cả
khi CI xanh. Vì thế cấu hình hiện tại là `required_approving_review_count: 0`.

Nói thẳng hậu quả: **"PR bắt buộc" ở đây có nghĩa là bắt buộc đi qua PR + CI xanh, KHÔNG có nghĩa là
có người thứ hai đọc mã.** Cổng người thật duy nhất trong hệ thống là **cổng duyệt của environment
`production`**.

Không dùng CODEOWNERS để lấp chỗ này: `require_code_owner_review` cũng chạm đúng rào tự-duyệt và
cũng khoá cứng. Thêm một tệp CODEOWNERS **không cưỡng chế được gì** mà chỉ làm cấu hình *trông như*
có kiểm soát — đúng thứ mục 8 của brief P3 cấm.

**Gỡ được khi nào:** có collaborator thứ hai (người hoặc bot có tài khoản riêng) ⇒ nâng
`required_approving_review_count` lên `1` và bật `require_last_push_approval: true`.

**Rủi ro còn lại, không gỡ được bằng cấu hình:** chủ repo luôn có quyền **sửa hoặc xoá chính
ruleset này**. Không có cấu hình GitHub nào chặn admin làm điều đó trên repo cá nhân. Cái còn lại là
**dấu vết**: mọi thay đổi ruleset đều vào lịch sử ruleset và audit log. Với repo thuộc **Organization**
thì mới siết thêm được (ruleset cấp org, admin repo không sửa được).

**Không làm — có chủ đích:**

- **Không** bắt lịch sử tuyến tính (`required_linear_history`). Repo đang dùng merge commit
  (`Merge pull request #68 from …`); bật lên là ép đổi cách merge mà không đổi lấy an toàn nào.
- **Không** đặt ruleset cho tag. Repo có **1 tag** (`demo/v1.0`) và **0 release**; deploy định danh
  theo git SHA, không theo tag. Bảo vệ tag lúc này là cưỡng chế một quy trình không tồn tại.
- **Không** viết dịch vụ governance riêng. Dùng tính năng gốc của GitHub (mục "DO NOT DO" của P3).

## 6. Đọc trạng thái thật / dựng lại

Cưỡng chế nằm ở GitHub, không nằm trong repo. Muốn kiểm chứng:

```bash
gh api repos/phungtienviet14-sketch/nexagnet-platform/rules/branches/main --jq '.[].type'
```

Phải ra đủ bốn dòng: `deletion` · `non_fast_forward` · `pull_request` · `required_status_checks`.

> 🚨 **ĐỪNG dùng `branches/main/protection` để kết luận.** Endpoint đó vẫn trả
> **404 `"Branch not protected"`** — và sẽ trả như thế mãi mãi, kể cả bây giờ khi `main` **đang được
> bảo vệ**. Nó báo cáo **branch protection CỔ ĐIỂN**, một cơ chế **khác** với **ruleset**; repo này
> dùng ruleset nên endpoint cũ đương nhiên rỗng.
>
> Đây là một cái bẫy có thật, không phải giả định: chuỗi bằng chứng cũ của P3 (trong `agentic-ops.md`,
> `reference-platform-stack.md §7.5`, `platform-roadmap-v2.md`) **chính là** `0 ruleset` +
> `branches/main/protection → 404`. Ai chạy lại đúng lệnh cũ sau khi P3 đã đóng sẽ thấy **cùng một
> con số 404** và kết luận nhầm rằng **chưa có gì thay đổi**. Dùng `rules/branches/main`, hoặc
> `rulesets`.

Dựng lại ruleset từ bản ghi (khi đã bị xoá):

```bash
gh api -X POST repos/phungtienviet14-sketch/nexagnet-platform/rulesets --input .github/rulesets/main-protection.json
```

Sửa ruleset đang chạy (`21740233`) — sửa tệp trước, rồi đẩy lên, để bản ghi không trôi khỏi thực tế:

```bash
gh api -X PUT repos/phungtienviet14-sketch/nexagnet-platform/rulesets/21740233 --input .github/rulesets/main-protection.json
```

## 7. Luồng làm việc kể từ nay

1. Nhánh riêng từ `main` (agent **không** được ghi thẳng vào `main` — đã chặn ở tầng máy chủ).
2. Mở PR.
3. 7 check phải xanh; nhánh phải cập nhật với `main` (`strict`).
4. Review thread phải được giải quyết.
5. Merge (merge/squash/rebase đều được).
6. Deploy `gd1-test` hoặc `production` **chỉ từ `main`**; `production` cần một lần duyệt thật.
