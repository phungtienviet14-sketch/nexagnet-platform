# Conversation Bridge V0 — đánh thức đúng một cuộc hội thoại ChatGPT, chỉ vào

> Mã nguồn: [`tools/conversation-bridge/`](../../../tools/conversation-bridge/) ·
> Hợp đồng nhiệm vụ: Issue #204 · Giao thức: [autopilot-protocol-v0.md](autopilot-protocol-v0.md)
>
> **Chưa cài đặt thật.** Giai đoạn này dừng trước lần ghi registry đầu tiên. Xem §8.

## 1. Cầu nối này làm gì, và cố ý KHÔNG làm gì

Nexagent Autopilot cần một người review độc lập. Người review đó là **một cuộc hội thoại ChatGPT
Web thường** — không phải ChatGPT Work, không phải một lời gọi API. Vấn đề vận hành duy nhất còn
lại là: _ChatGPT không biết có việc mới, trừ khi có ai đó gõ vào ô soạn._

Cho tới nay người đó là **con người**: mở tab, gõ "có PR mới", dán số PR. Cầu nối này thay đúng
động tác đó, và **không thay gì khác**.

| Cầu nối **CÓ** làm                                                    | Cầu nối **KHÔNG** làm                           |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| Đọc GitHub một chiều ra, tìm `REVIEW_REQUEST` hợp lệ                  | Ghi bất cứ thứ gì lên GitHub                    |
| Kiểm người phát carrier bằng metadata GitHub đã xác thực              | Tin `AUTHOR=` / `ROLE=` viết trong thân comment |
| Đối chiếu HEAD sống của PR                                            | Dùng trạng thái PR trong bộ nhớ đệm             |
| Đặt **một tin nhắn cố định** vào khung soạn của cuộc hội thoại đã arm | Chuyển bất kỳ chữ nào của GitHub sang ChatGPT   |
| Gửi tin đó đúng một lần                                               | Đọc, sao chép, tóm tắt hay lưu **câu trả lời**  |
| —                                                                     | Đọc cookie / phiên / token của ChatGPT          |
| —                                                                     | Gọi API nội bộ của ChatGPT                      |
| —                                                                     | Mở một cổng vào trên máy                        |

**Nói thẳng:** cầu nối này **không đọc câu trả lời của ChatGPT**, và không có đường nào để đọc.
Đó không phải một chính sách nội bộ — đó là một tính chất của mã nguồn, được §5 chứng minh.

Sau khi được đánh thức, cuộc hội thoại ChatGPT **tự đọc GitHub sống bằng connector của chính nó**
rồi tự đăng `REVIEW_PASS` / `REVIEW_BLOCK`. Cầu nối không tham gia vào việc đó và không thấy nó.

## 2. Kiến trúc và bốn ranh giới tin cậy

```text
   GitHub (công khai, KHÔNG TIN CẬY)
        │  đọc, một chiều RA (gh api / REST không đăng nhập)
        ▼
   ┌──────────────────────────────────────────────┐
   │ RANH GIỚI 1 — cổng xuất xứ + cổng HEAD sống  │
   │ native-host/  (tiến trình Node do Chrome đẻ) │
   │  · carrier đọc bằng validator Giao thức V0   │
   │  · người phát phải nằm trong sổ đồ cục bộ    │
   │  · HEAD khai phải bằng HEAD SỐNG             │
   │  · sổ khoá giao bền, ghi TRƯỚC khi gửi       │
   └──────────────────────────────────────────────┘
        │  RANH GIỚI 2 — ống Native Messaging
        │  khung chỉ mang {key, repo, pr, headSha}
        │  KHÔNG có trường văn bản nào
        ▼
   ┌──────────────────────────────────────────────┐
   │ RANH GIỚI 3 — trạng thái arm của tiện ích    │
   │ extension/  (service worker MV3)             │
   │  · đúng một URL hội thoại được arm           │
   │  · quyền host xin lúc arm, cho ĐÚNG một path │
   │  · sổ khoá giao cục bộ trong chrome.storage  │
   └──────────────────────────────────────────────┘
        │  RANH GIỚI 4 — bề mặt DOM 11 thao tác, CHỈ GHI
        ▼
   tab ChatGPT đã arm  ──►  khung soạn  ──►  gửi một lần
        │
        │  (từ đây trở đi cầu nối KHÔNG thấy gì nữa)
        ▼
   ChatGPT tự đọc GitHub sống ──► REVIEW_PASS / REVIEW_BLOCK
```

Mỗi ranh giới **fail closed một cách độc lập**. Một ranh giới thủng không đủ để gây hại: ví dụ nếu
tiến trình Node bị thay hoàn toàn, nó vẫn chỉ đẩy được ba nguyên thuỷ đã kiểm hình dạng qua ống, và
thứ vào khung soạn vẫn là bản mẫu của kho này, vào đúng cuộc hội thoại mà **người dùng** đã arm.

## 3. Vì sao Native Messaging, và vì sao không có cổng vào

Cách hiển nhiên là để cầu nối chạy một máy chủ `localhost` rồi cho GitHub (hoặc một webhook) gọi
vào. Cách đó bị loại **cứng**, vì ba lý do khác nhau:

1. **Một cổng nghe là một bề mặt tấn công mới trên máy cá nhân.** Bất kỳ trang web nào đang mở
   cũng thử được `fetch('http://localhost:<port>')`. Một cầu nối đẩy chữ vào ChatGPT mà nghe trên
   localhost là một cầu nối mà _quảng cáo trong một tab khác_ cũng gọi được.
2. **Nó đòi hỏi mở đường từ ngoài vào** (tunnel/port-forward) để GitHub gọi tới — tức là biến máy
   cá nhân thành một endpoint công khai.
3. **Vòng đời không ai quản.** Một tiến trình nghe cổng sống độc lập với trình duyệt; nó vẫn chạy
   khi người dùng đã đóng ChatGPT.

Native Messaging đảo ngược cả ba: **Chrome đẻ tiến trình** khi tiện ích gọi `connectNative`, nối
`stdin`/`stdout` vào ống, và **giết nó** khi tiện ích ngắt. Không có cổng, không có đường vào, và
vòng đời gắn với chính trình duyệt đang mở cuộc hội thoại.

Đánh đổi: cầu nối **hỏi** GitHub theo chu kỳ (mặc định 120 giây) thay vì được GitHub gọi. Với một
việc mà độ trễ chấp nhận được tính bằng phút, đó là cái giá đúng.

## 4. Bốn cổng, theo thứ tự chúng chạy

### 4.1 Cổng xuất xứ — _ai_ được phép đánh thức

Comment trên một kho **công khai** là đầu vào không tin cậy: ai cũng dán được đúng khối văn bản
carrier vào một comment. Nên cầu nối **không đọc một chữ nào trong thân comment để xét quyền**.

Nó đọc metadata mà GitHub xác thực — `performed_via_github_app.slug`, `user.login` — rồi tra sổ
đồ principal **cục bộ** (`config.allowedProducers`) qua đúng ba tầng của Giao thức V0:

```text
principal (GitHub xác thực) ──[sổ đồ cục bộ]──► vai ──[MESSAGE_PRODUCERS]──► REVIEW_REQUEST
```

Fail closed ở mọi bước: không suy ra được principal ⇒ từ chối; **không có sổ đồ ⇒ từ chối** (thiếu
sổ đồ _không_ có nghĩa là "ai cũng được"); principal không giữ vai phát được `REVIEW_REQUEST` ⇒ từ
chối. Không ID nào được viết cứng trong mã nguồn — sổ đồ là cấu hình của từng máy.

`AUTHOR=` hay `ROLE=` viết trong thân comment **không bao giờ** tới được cổng này.

### 4.2 Cổng HEAD sống — _cho commit nào_

Trước khi giao, cầu nối đọc `/repos/<kho>/pulls/<pr>` **sống** và đối chiếu:

| Điều kiện                                      | Kết cục                                            |
| ---------------------------------------------- | -------------------------------------------------- |
| `HEAD_SHA` khai ≠ `pull_request.head.sha` sống | `REJECTED_STALE` / `HEAD_MISMATCH`                 |
| PR đã đóng hoặc đã merge                       | `REJECTED_STALE` / `PR_NOT_OPEN`                   |
| PR không tồn tại                               | `REJECTED_STALE` / `PR_NOT_FOUND`                  |
| Comment thuộc kho khác                         | `REJECTED_STALE` / `REPOSITORY_MISMATCH`           |
| Đọc GitHub thất bại                            | `REJECTED_STALE` / `LIVE_STATE_UNAVAILABLE`        |
| SHA rút gọn / chữ hoa / sai hình dạng          | `REJECTED_MALFORMED` (validator Giao thức V0 chặn) |

Không có bộ nhớ đệm. Mỗi lần cân nhắc giao là một lần đọc thật.

### 4.3 Cổng arm — _vào cuộc hội thoại nào_

Mặc định là `DISARMED`: **không cuộc hội thoại nào** đủ điều kiện. Người dùng phải mở trang tuỳ
chọn của tiện ích, dán đúng một URL dạng `https://chatgpt.com/c/<id>` và bấm arm.

Lúc arm, tiện ích gọi `chrome.permissions.request` xin quyền host **cho đúng đường dẫn đó** —
không phải cho `https://chatgpt.com/*`. Manifest **không khai `host_permissions`** nào; nó chỉ khai
`optional_host_permissions` làm tập cha để lời xin lúc chạy là hợp lệ. Nghĩa là ngay sau khi cài,
tiện ích **không có quyền trên bất kỳ trang nào**.

URL được so **chính xác** (chỉ tha dấu `/` cuối và chữ hoa/thường của scheme+host). Query và
fragment không được bỏ qua — `?model=x` là một trang khác. Chỉ host `chatgpt.com`; host cũ của
ChatGPT và mọi host của ChatGPT Work đều không arm được.

### 4.4 Cổng idempotency — _đúng một lần_

Khoá canonical:

```text
conversation-bridge:<kho>:<pr>:<head_sha>
```

Phần `<pr>:<head_sha>` lấy từ **chính** `idempotencyKeyFor` của Giao thức V0, không ghép tay, để
nếu giao thức đổi định nghĩa "cùng một lần review" thì cầu nối đổi theo. Phần `<kho>` là bổ sung
của cầu nối: nó là tiến trình cục bộ và có thể theo dõi nhiều kho, mà khoá của giao thức không có
trường kho — PR #7 của hai kho sẽ dùng chung khoá, và đó là một vụ **mất tin nhắn im lặng**.

**Ngữ nghĩa đạt được là AT-MOST-ONCE, không phải exactly-once.** Xem §9.

## 5. Tiện ích thấy gì, và làm được gì

Ba quyền, mỗi quyền một lời gọi cụ thể:

| Quyền             | Lời gọi duy nhất dùng tới nó                         |
| ----------------- | ---------------------------------------------------- |
| `nativeMessaging` | `chrome.runtime.connectNative`                       |
| `storage`         | trạng thái arm + sổ khoá giao cục bộ                 |
| `scripting`       | `chrome.scripting.executeScript` vào đúng tab đã arm |

**Không** `tabs`, **không** `cookies`, **không** `webRequest`, **không** `history`, **không**
`debugger`, **không** `<all_urls>`, **không content script thường trú**. Không có mã nào của cầu
nối sống sẵn trên trang ChatGPT: mã chỉ được tiêm vào **đúng thời điểm giao**, vào **đúng tab đã
arm**, ở `world: 'ISOLATED'` (không thấy biến của trang).

Toàn bộ bề mặt DOM mà cầu nối chạm tới:

```text
location.href                 đọc  — từ chối nếu trang đã điều hướng
document.querySelectorAll     tìm  — theo danh sách selector đóng
document.execCommand          ghi  — đặt chữ vào vùng contenteditable
el.isContentEditable          đọc  — một boolean về KIỂU phần tử
el.value                      ghi  — cho <textarea>
el.focus / el.click           hành động
el.dispatchEvent              hành động
el.closest / el.querySelectorAll  tìm — trong phạm vi form soạn
el.disabled                   đọc  — một boolean về TRẠNG THÁI nút
```

Không có đường nào đọc nội dung một nút, duyệt vào cây con, sang nút anh em, theo dõi thay đổi
trang, đọc vùng chọn, hay chụp màn hình. `closest()` đi **lên**, nên không thể chạm tới một nút
chứa nội dung.

Điều đó được chứng minh bằng **hành vi**, không bằng lời: bộ kiểm chạy chính bộ nối này trên một
cây DOM giống ChatGPT, trong đó **mọi nút của khối hội thoại đều đặt mìn** — chạm vào bất kỳ thuộc
tính nào là ghi lại rồi ném. Bài kiểm đòi hỏi danh sách "đã chạm" **rỗng**, và có một đối chứng
khẳng định mìn thật sự nổ khi bị chạm (nếu không, một cây không mìn cũng cho ra màu xanh).

## 6. Tin nhắn đánh thức — toàn bộ những gì ChatGPT nhận được

```text
review autopilot pending
REPO=phungtienviet14-sketch/nexagnet-platform
PR=205
HEAD_SHA=b6d4c1f0a9e83b27d5410fe2c8a7b93d10e5f4a6
```

Bốn dòng. `REPO` lấy từ **cấu hình cục bộ**; `PR` là số nguyên đã qua schema V0; `HEAD_SHA` là
**HEAD sống** vừa đối chiếu, không phải giá trị khai trong carrier.

Hàm dựng tin nhắn **tự kiểm đầu ra** trước khi trả về: kết quả phải khớp một biểu thức neo hai đầu.
Một lần sửa tương lai thêm một trường — kể cả một trường trông vô hại như `RISK=` — sẽ làm hàm
**ném**, chứ không lặng lẽ gửi đi. Bất biến được mã nguồn cưỡng chế, không bởi một câu trong tài liệu.

Khung IPC qua ống cũng **không có trường văn bản nào**: tiện ích tự dựng tin nhắn từ ba nguyên
thuỷ. Một trường lạ trong khung là `FRAME_FIELD_SET_MISMATCH`, không phải "bỏ qua".

## 7. Nhật ký — chín trường, và một ràng buộc về _hình dạng giá trị_

Chỉ chín trường của Issue #204 §11 đi qua: `state`, `repo`, `pr`, `head_sha`,
`idempotency_key_hash`, `github_status`, `bridge_status`, `conversation_target_hash`, `error_code`
(cộng `ts` do **chính** bộ ghi sinh từ đồng hồ hệ thống, nên không thể mang nội dung).

Danh sách trắng theo _tên_ thôi thì vẫn thủng: không gì ngăn một bản sửa nhét cả thân comment vào
`error_code`. Nên có cổng thứ hai — **giá trị** phải là số, boolean, hoặc một chuỗi ngắn trong bảng
chữ cái hẹp `A-Z a-z 0-9 . _ : / -`. Một đoạn văn xuôi có dấu cách, dấu câu, xuống dòng sẽ trượt
khỏi bảng đó và **bị bỏ**.

Không bao giờ ghi: nội dung hội thoại, câu trả lời, thân comment GitHub, token/cookie/header, thân
lỗi HTTP lạ. Khi HTTP thất bại, cầu nối giữ `status` và **vứt thân đi** — cách chắc chắn nhất để
không ghi ra là không bao giờ cầm nó.

Nhật ký ra `stderr`, cố ý: `stdout` **là** ống Native Messaging, và một dòng log lạc vào đó sẽ làm
Chrome đọc phải khung rác rồi ngắt kết nối.

## 8. Cài đặt và gỡ — mặc định là **chạy khô**

```bash
pnpm --filter @netviet/conversation-bridge install:dry-run -- --extension-id=<32 chữ a-p>
pnpm --filter @netviet/conversation-bridge uninstall:dry-run
```

Chạy khô **chỉ in ra** đúng những gì sẽ thay đổi: khoá registry `HKCU\Software\Google\Chrome\
NativeMessagingHosts\com.nexagnet.conversation_bridge` (per-user — **không cần quyền quản trị**),
đường dẫn manifest, đường dẫn `.cmd` khởi động, và số byte của từng tệp. Đầu ra **tất định**.

Ghi thật đòi hỏi **hai** cờ: `--apply` **và** `--i-understand-this-writes-to-my-registry`. Một cờ
thì gõ nhầm được; hai cờ, trong đó một cờ đọc lên thành một câu, thì không.

> **Trạng thái hiện tại: CHƯA CHẠY THẬT.** Không một lần ghi registry, không một tệp nào được đặt
> vào máy, không một tiện ích nào được nạp, không một tin nhắn nào được gửi vào ChatGPT trong suốt
> quá trình xây dựng và kiểm thử. Đó là ranh giới do Issue #204 §10 và §17.14 đặt ra.

### Thủ tục smoke thủ công (giai đoạn sau, có người duyệt)

1. Sao `config.example.json` → `config.json`; điền `repo` và `allowedProducers` thật; giữ
   `enabled: false`.
2. `chrome://extensions` → bật _Developer mode_ → _Load unpacked_ → chọn thư mục
   `tools/conversation-bridge/extension/`. **Đây là bước thủ công duy nhất không tự động hoá được**
   (Chrome không cho đăng ký tiện ích chưa đóng gói bằng dòng lệnh), và nó sinh ra _extension ID_
   cần cho bước sau.
3. Chạy `install:dry-run --extension-id=<id vừa lấy>`, **đọc kỹ đầu ra**, rồi mới `--apply
--i-understand-this-writes-to-my-registry`.
4. Mở trang tuỳ chọn của tiện ích, dán URL cuộc hội thoại, bấm arm, chấp nhận lời xin quyền host.
5. Đặt `enabled: true` trong `config.json`.
6. Quan sát `stderr` của native host qua `chrome://extensions` → _service worker_ → _Errors_.

### Tắt và lùi

| Muốn                   | Làm                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Dừng ngay, giữ mọi thứ | Bấm **Disarm** trên trang tuỳ chọn — không cuộc hội thoại nào còn đủ điều kiện                                           |
| Dừng đọc GitHub        | Đặt `enabled: false` trong `config.json` — không một lần đọc nào xảy ra nữa                                              |
| Gỡ hẳn                 | `uninstall:dry-run`, đọc, rồi `--apply …`; sau đó _Remove_ tiện ích trong `chrome://extensions`                          |
| Xoá dấu vết            | Xoá `tools/conversation-bridge/state/` (sổ khoá giao) — **cẩn thận**: sau đó một carrier cũ có thể được giao lại một lần |

## 9. Ngữ nghĩa giao: **AT-MOST-ONCE**, và vì sao không hơn

Sổ khoá được ghi **trước** khi hành động, ở cả hai phía:

```text
native host:  ghi khoá (ATTEMPTED) ──► gửi khung WAKE
tiện ích:     ghi khoá (ATTEMPTED) ──► tiêm vào khung soạn ──► ghi khoá (DELIVERED)
```

Nếu ghi **sau**, một lần sập nguồn giữa hai bước sẽ để lại một khoá _chưa_ ghi cho một tin nhắn
_đã_ gửi — và lần poll kế tiếp gửi lại vào đúng cuộc hội thoại đó. Ghi **trước** thì điều ngược lại
xảy ra: một lần tiêm thất bại có thể "cháy" khoá vĩnh viễn.

Hai kiểu hỏng **không ngang giá**. Một bên là làm phiền một cuộc hội thoại thật, lặp đi lặp lại, mà
không ai chặn được từ xa. Bên kia là một lần đánh thức bị bỏ lỡ, mà con người phát hiện ra ngay khi
nhìn PR và tự chạy lại được. Ta chọn bên thứ hai.

**Exactly-once là không đạt được ở đây, và tài liệu này không khai là đạt được.** Giữa "đã ghi
khoá" và "chữ đã nằm trong khung soạn" có một ranh giới tiến trình (ống Native Messaging) và một
ranh giới trình duyệt (service worker MV3 bị Chrome thu hồi bất kỳ lúc nào) — và **không ranh giới
nào có giao dịch**.

Bốn ranh giới replay đều được kiểm riêng: hai vòng poll cùng tiến trình · khởi động lại tiến trình
host · service worker bị thu hồi · HEAD mới (khoá mới, giao được đúng một lần nữa).

## 10. Rủi ro còn lại

| #   | Rủi ro                                                               | Ảnh hưởng                                           | Vì sao chấp nhận / cách xử lý                                                                                                                                           |
| --- | -------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Một lần tiêm thất bại "cháy" khoá; HEAD đó không được đánh thức lại  | Bỏ lỡ một lần đánh thức                             | Hướng an toàn có chủ đích (§9). Khôi phục = nút **Xoá sổ khoá giao** trên trang tuỳ chọn — một hành động có ý thức của con người                                        |
| R2  | Ghi đè bản nháp đang có trong khung soạn của cuộc hội thoại đã arm   | Mất một đoạn người dùng đang gõ                     | `selectAll` + `insertText` là _thay thế_, vì nối thêm sẽ cho ra một tin nhắn không tất định (§8 của #204 cấm). Cuộc hội thoại được arm là cuộc **dành cho tự động hoá** |
| R3  | ChatGPT đổi cấu trúc khung soạn                                      | Cầu nối ngừng hoạt động                             | Fail closed: `COMPOSER_NOT_FOUND` / `COMPOSER_AMBIGUOUS`, **không bấm nút tuỳ ý**. Selector là `id` ổn định + thuộc tính ngữ nghĩa, không phải lớp CSS sinh ra          |
| R4  | Chế độ `unauthenticated` chỉ có 60 lần gọi/giờ                       | Poll bị chặn                                        | Chỉ dùng cho kho công khai; mặc định là `gh-cli`. Đọc thất bại ⇒ `LIVE_STATE_UNAVAILABLE`, không giao                                                                   |
| R5  | Native host chạy với **toàn quyền của người dùng**                   | Một `config.json` bị sửa có thể trỏ sang kho khác   | Cấu hình nằm cạnh mã, trong `.gitignore`; khung IPC vẫn chỉ mang ba nguyên thuỷ; **cuộc hội thoại đích do tiện ích giữ, host không đổi được**                           |
| R6  | `optional_host_permissions` khai `https://chatgpt.com/*` làm tập cha | Người dùng _có thể_ cấp rộng hơn nếu Chrome hỏi vậy | Lời xin lúc chạy nêu **đúng một đường dẫn**; và mã vẫn so URL chính xác trước mọi thao tác DOM, nên quyền rộng hơn cũng không mở thêm đích                              |
| R7  | Chưa từng chạy thật với ChatGPT                                      | Chưa có bằng chứng runtime                          | Cố ý (§8). Smoke là bước có người duyệt, sau review độc lập                                                                                                             |

## 11. Bảng mối đe doạ

| Mối đe doạ                                                       | Kiểm soát                                                                                                    | Chứng minh ở đâu                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Người lạ bình luận một `REVIEW_REQUEST` giả để đánh thức ChatGPT | Danh sách principal cục bộ, xét trên metadata GitHub đã xác thực; văn bản trong comment không cấp được quyền | `carrier-provenance` 3, 5                        |
| Yêu cầu cũ đánh thức người review cho một SHA đã qua             | Đối chiếu HEAD **sống** mỗi lần, không bộ nhớ đệm                                                            | `exact-head` 6-8                                 |
| Poll lặp lại làm ChatGPT bị dội tin                              | Sổ khoá bền hai phía, ghi trước khi hành động                                                                | `idempotency` 9-11                               |
| Tab ChatGPT đang mở là một cuộc hội thoại khác                   | URL arm so **chính xác**; nhiều tab khớp ⇒ từ chối                                                           | `browser-target` 12, 12b, 16b                    |
| Trang đổi cấu trúc DOM                                           | Fail closed, không bấm nút tuỳ ý, không đoán khi nhập nhằng                                                  | `browser-target` 15                              |
| Cầu nối bị chiếm và cố quét câu trả lời                          | Bề mặt DOM 11 thao tác chỉ ghi + quyền tiện ích tối thiểu + quét mã nguồn + cây DOM đặt mìn                  | `input-only-contract` 17-18, `browser-target` 16 |
| Trình duyệt / host khởi động lại giữa chừng                      | Trạng thái giao an toàn với replay (at-most-once)                                                            | `idempotency` 10, 10b                            |
| Văn xuôi GitHub được dùng làm chỉ thị cho ChatGPT                | Khung IPC không có trường văn bản; bản mẫu tự kiểm đầu ra                                                    | `input-only-contract` 19, 19b                    |
| Bí mật lọt vào cấu hình rồi lên kho                              | Danh sách trắng khoá + quét đệ quy theo **từ**; `config.json` trong `.gitignore`                             | `config-and-logs`                                |
| Thân comment / thân lỗi HTTP lọt vào nhật ký                     | Chín trường + ràng buộc **hình dạng giá trị**                                                                | `config-and-logs`, `input-only-contract` 20      |
| Một cổng vào bị mở trên máy                                      | Không module máy chủ nào; kiểm bằng cả quét mã nguồn lẫn tài nguyên đang sống của Node                       | `native-host` 24, 24b                            |

## 12. Việc **không** thuộc phạm vi V0

Không đụng tới Orchestrator V0 (#165), quyền ghi (#188/#191), schema reviewer (#166), dispatcher
Claude, auto-merge, CD, mã nghiệp vụ, dữ liệu khách, ChatGPT Work, API OpenAI/Anthropic, dịch vụ
relay đám mây. Cầu nối **không ghi gì lên GitHub** trong V0.
