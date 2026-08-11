# Bằng chứng TDD — Đợt A′ Task 1: tin chỉ-ảnh không còn bị vứt

> **Nguồn kế hoạch:** [docs/ke-hoach/gd1.md §4 CHẶN E + §6 Đợt A′](../ke-hoach/gd1.md) · đặc tả task ở [docs/ke-hoach/tong-quan.md §1](../ke-hoach/tong-quan.md).
> Chạy: **11/08/2026**. Nhánh: `main`. Commit: `f29efda` (RED) → `5608b4a` (GREEN) → `170e975` (refactor) → `9af3ee0` (phủ nốt).

---

## 1. Việc phải bảo đảm (user journey)

| # | Journey |
|---|---|
| J1 | Là **Sale/vận hành**, khi đại lý gửi **ảnh trần** (không chú thích) vào nhóm Zalo, tôi cần tin đó **vào được DB kèm link ảnh** — vì link Zalo chết ≤35 ngày, không lưu hôm nay là mất vĩnh viễn. |
| J2 | Là **hệ thống**, tin **không có cả chữ lẫn ảnh** (tin hệ thống, nội dung rỗng) vẫn phải bị bỏ — không tạo rác. |
| J3 | Là **dev**, `text` phải giữ kiểu `string` (KHÔNG optional) để không call-site nào phía sau (parser · repository · `OrderView.rawText`) vỡ kiểu. |

---

## 2. Báo cáo từng việc

### 2.1 Nới `channelMessageSchema` cho tin chỉ-ảnh

Bỏ `.min(1)` khỏi `text`, thêm `.refine(text.trim() !== '' || imageUrl)`.

```
pnpm --filter @ultty/shared test
RED   -> 3 failed | 66 passed
        ZodError too_small: expected string to have >=1 characters
GREEN -> 69 passed (7 file)
```

**Bảo đảm:** ảnh trần hợp lệ · tin rỗng-hoàn-toàn vẫn bị từ chối · `text` vẫn là `string` · trần 10.000 ký tự còn nguyên.

### 2.2 Hai mapper ingest thôi vứt tin

`zca-message.ts` và `bot-poller.ts`: chỉ bỏ tin khi **không có cả chữ lẫn ảnh**.

```
vitest run src/ingest/zca-message.spec.ts src/ingest/bot-poller.spec.ts
RED   -> 3 failed | 28 passed   (2× "expected null not to be null")
GREEN -> nằm trong 389 passed của cả suite API
```

### 2.3 Lỗ hổng phát sinh phải bịt cùng lúc — `photo_url` không được kiểm

Sau thay đổi, `photo_url` trở thành **căn cứ duy nhất** giữ tin không caption. `bot-poller.ts` trước đó gán thẳng `imageUrl: m.photo_url` không kiểm ⇒ một URL hỏng làm `safeParse` **rớt CẢ tin, kể cả tin có chữ**. `zca-message.ts` đã có `toHttpUrl` cho đúng tình huống này từ trước; bot-poller thì chưa.

Đây **không phải nới phạm vi**: nếu bỏ qua, chính thay đổi này tạo ra một đường mất tin mới. Test `tin CO CHU nhung photo_url hong -> giu tin, bo imageUrl` đỏ trước, xanh sau.

### 2.4 Mắt xích cuối — ảnh vào đến DB

Unit test chỉ chứng minh schema/mapper **chấp nhận** tin; chưa chứng minh nó **vào DB**. Hai test ở `pipeline-intake.spec.ts` chạy qua `PipelineService.intake` thật (in-memory repo):

```
vitest run src/pipeline/pipeline-intake.spec.ts   -> 12 passed
```

Log lúc chạy: `[Agent:router] intent=khac` — `text` rỗng **không làm vỡ chặng nào**, MockParser trả `khac` thay vì ném lỗi. (Với `PARSER_MODE=claude` thì vision đọc ảnh thật.)

### 2.5 Refactor — gom `toHttpUrl`

Hàm bị nhân đôi y hệt ở hai mapper cùng thư mục ⇒ tách `apps/api/src/ingest/http-url.ts`, cùng khuôn `message-guard.ts` / `message-ownership.ts` sẵn có. Sau refactor: 383 passed, typecheck + lint xanh — hành vi không đổi.

---

## 3. Đặc tả test — điều gì được bảo đảm

| # | Điều được bảo đảm | Test | Loại | KQ |
|---|---|---|---|---|
| 1 | Tin `text` rỗng + có `imageUrl` là hợp lệ | `channel-message.test.ts:chap nhan tin CHI CO ANH` | unit | PASS |
| 2 | `text` rỗng mà KHÔNG có ảnh bị từ chối | `channel-message.test.ts:tu choi text rong khi KHONG co anh` | unit | PASS |
| 3 | Chỉ khoảng trắng, không ảnh → từ chối | `channel-message.test.ts:tu choi tin chi co khoang trang` | unit | PASS |
| 4 | Caption toàn khoảng trắng + có ảnh → nhận | `channel-message.test.ts:chap nhan caption toan khoang trang khi co anh` | unit | PASS |
| 5 | `text` vẫn là `string` khi tin chỉ có ảnh | `channel-message.test.ts:text van la string khi tin chi co anh` | unit | PASS |
| 6 | Trần 10.000 ký tự còn hiệu lực dù có ảnh | `channel-message.test.ts:van chan text vuot 10.000 ky tu` | unit | PASS |
| 7 | zca: ảnh không chú thích → giữ tin, `text=''`, còn `imageUrl` | `zca-message.spec.ts:GIU tin anh khong chu thich` | unit | PASS |
| 8 | zca: không chữ lẫn ảnh → bỏ | `zca-message.spec.ts:bo qua tin khong co ca chu lan anh` | unit | PASS |
| 9 | zca: `href` không phải http(s) và không caption → bỏ | `zca-message.spec.ts:bo qua tin khong chu thich khi href khong phai URL` | unit | PASS |
| 10 | zca: `content` không phải string/object → bỏ | `zca-message.spec.ts:bo qua khi content khong phai string lan object` | unit | PASS |
| 11 | Bot: ảnh không caption → giữ tin, `text=''`, còn `photo_url` | `bot-poller.spec.ts:GIU tin anh khong caption` | unit | PASS |
| 12 | Bot: `photo_url` hỏng KHÔNG làm rớt tin có chữ | `bot-poller.spec.ts:tin CO CHU nhung photo_url hong` | unit | PASS |
| 13 | Bot: không caption + `photo_url` hỏng → bỏ | `bot-poller.spec.ts:bo qua tin khong caption khi photo_url hong` | unit | PASS |
| 14 | URL khác giao thức (`javascript:`/`ftp:`/`file:`/`data:`) bị loại | `http-url.spec.ts:bo URL khac giao thuc http(s)` | unit | PASS |
| 15 | **Tin chỉ-ảnh vào đến DB, chạy hết pipeline** | `pipeline-intake.spec.ts:tin CHI CO ANH van vao DB` | integration | PASS |
| 16 | Tin chỉ-ảnh ở nhóm **chưa map** vẫn lưu kèm link ảnh | `pipeline-intake.spec.ts:tin CHI CO ANH o nhom CHUA map` | integration | PASS |

---

## 4. Coverage

```
vitest run src/ingest/ --coverage (chỉ file vừa sửa)
File            | % Stmts | % Branch | % Funcs | % Lines
http-url.ts     |     100 |      100 |     100 |     100
zca-message.ts  |     100 |    94.28 |     100 |     100   (còn 47, 68)
```

Toàn repo sau đợt: **shared 69 · web 29 · api 389 passed / 21 skipped · route contract 8 · typecheck · lint** — đều xanh. Mốc trước đợt: api 378+21 (05/08) → +11 test mới, **không test cũ nào đổi trạng thái**.

`bot-poller.ts` tổng thể 46,75% là nợ sẵn có của **lớp `BotPoller`** (vòng long-poll mạng), không phải của `updateToChannelMessage` — nằm ngoài Task 1.

---

## 5. Đánh đổi đã biết & việc còn lại

**Đánh đổi:** tin **chỉ toàn khoảng trắng và không có ảnh** nay bị từ chối (trước `.min(1)` cho `'   '` đi qua). Không mất nội dung — tin đó không mang chữ lẫn ảnh; kênh zca vốn đã bỏ tin này từ trước bằng `trim()`.

**Task 1 KHÔNG bao gồm** (vẫn thuộc Đợt A′, các task sau — xem [gd1.md §4](../ke-hoach/gd1.md)):

| Còn lại | Vì sao vẫn cấp bách |
|---|---|
| Module `apps/api/src/media/` (`MediaStore` noop/local/s3) | Hôm nay DB mới lưu **link**, chưa lưu **file ảnh** |
| `MediaFetcher` (`fetch` → `sharp` → object storage) | Link Zalo vẫn chết sau ≤35 ngày ⇒ ảnh đã lưu link hôm nay vẫn sẽ mất nếu chưa tải về |
| 4 trường `media*` trong Prisma | Chưa có chỗ ghi khoá object |
| Rule lifecycle prefix `media/` | Chỉ cấu hình, 0 dòng code |

⇒ **Task 1 chặn đứng đường mất tin, chưa chặn đường mất ảnh.** Ảnh trần từ hôm nay đã có bản ghi + link trong DB; muốn giữ được **nội dung ảnh** thì phải làm nốt `MediaFetcher`.
