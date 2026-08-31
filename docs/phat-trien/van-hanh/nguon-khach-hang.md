# Nguồn khách hàng — giao thức làm việc với tài liệu gốc

> **Đọc trước khi mở một tệp khách hàng bất kỳ trên máy.**
> Tầng runtime tương ứng: `apps/api/src/source-registry/` · Cổng CI: `tools/customer-source-guardrail/`

## 1. Một câu

**Byte gốc của khách sống trong kho riêng ngoài repo. Repo giữ SHA-256 và metadata.**

`nexagnet-platform` là repo **PUBLIC** (đo bằng `gh repo view --json visibility`). Đưa một tài
liệu nội bộ của khách vào đây là **công bố nó ra ngoài**, và git không quên: xoá ở bản sau không
gỡ được bản đã đẩy lên.

## 2. Bốn mặt phẳng — tài liệu gốc thuộc mặt phẳng nào

| Mặt phẳng | Sự thật của | Tài liệu gốc của khách |
|---|---|---|
| Postgres | nghiệp vụ | **metadata + hash** ở đây |
| Hatchet | thực thi bền vững | không |
| OTel/ClickHouse | quan sát | **không bao giờ** — chỉ id/trạng thái/mã lý do |
| Git/release | trạng thái phần mềm mong muốn | **không** — chỉ hợp đồng, code, metadata an toàn |

Byte gốc **không thuộc mặt phẳng nào trong số đó**. Nó nằm ở kho riêng, và được nối vào hệ thống
bằng đúng một sợi dây: `BusinessSource.locator` + `BusinessSource.contentHash`.

## 3. Kho riêng — đặt ở đâu

Ưu tiên theo thứ tự:

1. **Ngoài repo, trên máy vận hành** *(khuyến nghị)*

   ```text
   C:\NexagentCustomerSources\<tenant>\...
   ```

2. **Google Drive / object storage riêng** của khách hoặc của NetViet — dùng khi cần nhiều người đọc.

3. **`.customer-sources/<tenant>/` trong repo** — chỉ khi thật sự bất tiện, và **đã được gitignore**
   (dòng có sẵn trong `.gitignore`). Vẫn kém hơn phương án 1: một `git add -f` là đủ để hỏng.

Kho tương lai (dịch vụ upload có kiểm soát) sẽ là một `locator` scheme khác. Registry **không phụ
thuộc nhà cung cấp nào** — `locator` là chuỗi, và không có dòng code nào trong `source-registry/`
biết Drive là gì.

## 4. Phiên Claude/Codex là BỘ XỬ LÝ, không phải nơi lưu trữ

Một phiên agent đọc được tài liệu khách là chuyện bình thường và cần thiết. Cái **không** được xảy ra:

- lưu tài liệu đó vào repo "cho tiện lần sau";
- dán nguyên văn nội dung nhạy cảm vào commit message, PR, hay telemetry;
- coi bản sao trong thư mục làm việc của phiên là bản gốc.

Phiên kết thúc thì bản sao đó biến mất. Bản gốc vẫn ở kho riêng, và **hash trong Postgres là thứ
chứng minh hai bản đó là một**.

## 5. Luồng nạp một tài liệu — bảy bước

```text
tài liệu khách gửi
  → 1. đặt vào kho riêng (ngoài repo)
  → 2. đo SHA-256
  → 3. registerSource()      → RECEIVED
  → 4. trích xuất            → NORMALIZED   (LLM được phép làm bước này)
  → 5. người đọc & đối chiếu → REVIEWED
  → 6. approveSource()       → APPROVED     (kèm actor + dẫn chứng)
  → 7. makeSourceEffective() → EFFECTIVE
        ↓
     submitFact() → PROPOSED → confirmFact() → CONFIRMED
                             ↘ markWorkingAssumption() → WORKING_ASSUMPTION
```

Đo hash:

```bash
sha256sum "C:/NexagentCustomerSources/<tenant>/<ten-tep>"
```

**Không có bước nào nhảy được.** Bốn bất biến dưới đây là *cổng đóng*, không phải lời khuyên, và
chúng được thi hành ở `source-lifecycle.ts` chứ không phải ở tài liệu này:

| Bất biến | Cổng chặn |
|---|---|
| tải lên ≠ đã duyệt | `RECEIVED` không có cạnh tới `EFFECTIVE` |
| LLM trích xuất ≠ đã duyệt | sự thật luôn vào ở `PROPOSED` |
| bản test nội bộ ≠ khách xác nhận | `INTERNAL_TEST` không nhận `CUSTOMER_CONFIRMED` |
| không kích hoạt fail-open | thiếu hash / locator / mốc hiệu lực → cổng đóng |

## 6. Phân loại và hệ quả

| Phân loại | Vào telemetry? | Byte được ở đâu |
|---|---|---|
| `PUBLIC` | giá trị được | repo cũng được |
| `INTERNAL` | giá trị được | repo cũng được |
| `BUSINESS_SENSITIVE` | **chỉ id/trạng thái** | **kho riêng** |
| `PII` | **chỉ id/trạng thái** | **kho riêng** |
| `SECRET` | **chỉ id/trạng thái** | **kho riêng** |

Đây không phải nhãn trang trí: `isTelemetrySafeClassification()` quyết định `value` có được đưa
vào span hay không, và `requiresPrivateVault()` là quy tắc mà cổng CI thi hành.

## 7. Cổng CI — `NO_RAW_CUSTOMER_ARTIFACT_IN_GIT`

```bash
pnpm check:customer-sources
```

Chạy trong `pnpm test` (job `verify`). Quy tắc **theo đường dẫn**, không cấm mù một loạt đuôi tệp:

- **vùng canh**: `docs/khach-hang/*/`, `.customer-sources/`, `tenants/*/sources/`
- **đuôi tệp gốc**: pdf · doc/docx · xls/xlsx/xlsm · ppt/pptx · heic · mov/mp4 · zip/rar/7z · msg/eml
- **ngoại lệ**: phải kèm **lý do đọc được**; có bài test từ chối lý do rỗng, từ chối *"đã có từ
  trước"*, và từ chối ngoại lệ đã hết tác dụng.

Ngoài `docs/khach-hang/` thì không có luật nào — `apps/web/public/*.png` không bị đụng tới.

### 7bis. Cổng thứ hai — `NO_RAW_CUSTOMER_ARTIFACT_IN_HISTORY` (thêm 31/08/2026)

```bash
pnpm check:customer-sources:range <base>..<head>
```

Cổng ở mục 7 chạy trên `git ls-files` — tức trên **cây cuối cùng** của một PR. Một tài liệu gốc
thêm ở commit A rồi xoá ở commit B **trong cùng PR đó** lọt qua: cây cuối cùng sạch, còn byte thì
đã nằm vĩnh viễn trong lịch sử của một repo public.

Đây không phải giả định. Commit `d05e1e4` (11/08/2026) đưa **mười** tài liệu gốc của khách vào
repo — bản khảo sát có số điện thoại liên hệ của một nhân sự, tám ảnh thiết kế khách gửi, và bản
`.xlsx` mang hai chat ID nhóm Zalo — rồi tất cả đều bị xoá ở các commit sau. Không cổng nào kêu,
vì không cổng nào nhìn vào **khoảng commit**.

Cổng này nhìn. Cùng bộ quy tắc, cùng allowlist, cùng fail-closed — chỉ khác tập đường dẫn đầu vào:
`git log --no-merges --diff-filter=AMR --name-only base..head`. Chạy ở job `verify`, chỉ trên
`pull_request`, và đòi `actions/checkout` đặt `fetch-depth: 0` (clone nông thì cổng **thoát mã 2**
chứ không im lặng báo đạt).

Mã từ chối riêng: `RAW_ARTIFACT_INTRODUCED_THEN_REMOVED` — "đã đẩy lên rồi xoá lại". Nó tách khỏi
`RAW_ARTIFACT_NOT_ALLOWLISTED` vì cách sửa khác nhau: cái sau `git rm` là xong, cái này phải viết
lại lịch sử **của nhánh** trước khi merge.

**Cổng này KHÔNG quét lịch sử toàn repo.** Lịch sử cũ đã công bố rồi; quét lại chỉ sinh ra một danh
sách không ai đóng được, và một cổng luôn đỏ là một cổng sẽ bị tắt. Nó chặn ở **đường vào**.

Khi cổng đỏ:

```bash
# 1. chuyển tệp sang kho riêng, rồi:
git rm --cached <đường-dẫn>
# 2. thêm dòng .gitignore TRƯỚC khi commit lại
# 3. đăng ký một BusinessSource trỏ tới kho riêng, kèm SHA-256
```

## 8. Đã lỡ commit rồi thì sao

`git rm` gỡ tệp khỏi **HEAD**, **không** gỡ khỏi **lịch sử**. Trong một repo public, bất kỳ ai đã
clone đều còn bản cũ.

Vì vậy khi phát hiện một tệp đã lỡ vào:

1. gỡ khỏi HEAD + gitignore **ngay** — chặn phát tán tiếp;
2. **coi nội dung đó là đã lộ** — số điện thoại, số tài khoản, địa chỉ trong đó phải được xử lý
   như dữ liệu đã công khai, không phải như dữ liệu sắp được bảo vệ;
3. dọn lịch sử (`git filter-repo` / BFG + force-push) là **quyết định của chủ repo**: nó viết lại
   nhánh được bảo vệ và làm hỏng mọi bản clone đang có. Không tự làm.

> **Trạng thái 31/08/2026 — đo trên `origin/main` = `905860e`.** Đếm đầy đủ, ở mức **blob**, mọi
> tài liệu gốc của khách từng nằm trong vùng canh (kể cả đường dẫn cũ trước khi sắp xếp lại):
> **13 blob**, trong đó **3 là bản bàn giao do chính chúng ta sinh ra** (còn ở HEAD, có ngoại lệ
> kèm nguồn HTML) và **10 là tài liệu gốc của khách đã gỡ khỏi HEAD nhưng còn vĩnh viễn trong lịch
> sử công khai**:
>
> | Hạng mục | Số blob | Phân loại |
> |---|---|---|
> | `khao-sat-khach-hang-2026-07.docx` | 1 | **PII** — tên + chức vụ + một số di động VN gắn nhãn "số điện thoại liên hệ" |
> | `thiet-ke-giao-dien/01–08.jpg` | 8 | BUSINESS_SENSITIVE — ảnh thiết kế khách gửi |
> | `a4-dai-ly-map-nhom-ultty.xlsx` | 1 | BUSINESS_SENSITIVE — hai chat ID nhóm Zalo (đã **bị thay thế** ở `040922f`) |
>
> Cả ba đều **reachable từ `origin/main`**, và blob lấy được qua API công khai theo SHA. Bản khảo
> sát vào repo từ **commit đầu tiên** (`b6e1b39`).
>
> Mục 2 và 3 ở trên **vẫn đang chờ chủ repo quyết** — xem Issue #96 để có bảng so sánh phương án,
> bán kính ảnh hưởng đo được của việc viết lại lịch sử, và rủi ro tồn dư đã được ghi nhận.
