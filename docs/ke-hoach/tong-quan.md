# KẾ HOẠCH — TỔNG QUAN & TRẠNG THÁI (nguồn sự thật duy nhất)

> **Vai trò:** tài liệu DUY NHẤT giữ **trạng thái** mọi kế hoạch (đang ở đâu, xong gì, chờ gì, quyết định treo, dữ liệu thiếu). Các kế hoạch con CHỈ mô tả phạm vi/thiết kế — **không chứa trạng thái**; muốn biết tiến độ, quay về đây.
> **Kế hoạch con:** [gd1.md](gd1.md) (**GĐ1 theo spec khách — 3 agent, đọc TRƯỚC khi làm tiếp**) · [nen-tang.md](nen-tang.md) (Đợt 0 — nền phải xong) · [tinh-nang-dai-han.md](tinh-nang-dai-han.md) (Đợt 1-4 — 6 tính năng mới) · [nen-tang-da-khach.md](nen-tang-da-khach.md) (**Đợt B1-B5 — base dùng chung cho nhiều khách**, lập 11/08 khi có khách thứ 2 Amico; đề xuất D26-D31).
> **Thay thế (11/07/2026):** `tien-do-va-ke-hoach.md` + `checklist-du-lieu-khach.md` + phần trạng thái của `ke-hoach-dai-han.md` + 2 plan code trong `.claude/plans/` — tất cả đã xóa, git history còn.
> Cập nhật: **08/08/2026**.

---

## 1. Ảnh chụp nhanh (08/08/2026)

- **✅ ĐỢT A′ TASK 1 XONG (11/08/2026) — tin chỉ-ảnh không còn bị vứt.** Làm theo TDD, 4 commit: `f29efda` (RED) → `5608b4a` (GREEN) → `170e975` (refactor) → `9af3ee0` (phủ nốt + chứng minh vào đến DB). Bằng chứng đầy đủ: [docs/testing/dot-a-phay-task-1.tdd.md](../testing/dot-a-phay-task-1.tdd.md). Đã sửa: `channelMessageSchema` bỏ `.min(1)` trên `text` + thêm `.refine(text.trim() !== '' || imageUrl)` (**`text` giữ nguyên kiểu `string`, KHÔNG optional** — nên không call-site nào phía sau phải đổi); hai mapper `zca-message.ts` + `bot-poller.ts` chỉ bỏ tin khi **không có cả chữ lẫn ảnh**. **Phát sinh phải bịt cùng lúc:** sau thay đổi, `photo_url` thành căn cứ DUY NHẤT giữ tin không caption, mà `bot-poller` trước đó gán thẳng vào `imageUrl` không kiểm ⇒ một URL hỏng làm `safeParse` rớt **cả tin, kể cả tin có chữ**; đã thêm `toHttpUrl` (zca vốn đã có guard này) rồi gom hai bản sao vào `ingest/http-url.ts`. Kiểm: **api 389 passed / 21 skipped** (mốc cũ 378+21, +11 test mới, không test cũ nào đổi trạng thái) · shared 69 · web 29 · route 8 · typecheck · lint — xanh. Đánh đổi đã biết: tin **chỉ toàn khoảng trắng và không có ảnh** nay bị từ chối (trước `.min(1)` cho `'   '` đi qua) — không mất nội dung, và zca vốn đã bỏ tin này bằng `trim()`. ⚠️ Task 1 mới chặn đường mất TIN, chưa chặn đường mất ẢNH — **đã làm nốt ở Task 2 (mục dưới)**.
- **✅ ĐỢT A′ TASK 2 XONG (11/08/2026) — ảnh được TẢI VỀ kho bền vững, không còn chỉ là cái link.** TDD, 3 commit: `03a6a03` (RED) → `4c6f1fa` (GREEN) → `8205ba3` (refactor + phủ nốt). Bằng chứng: [docs/testing/dot-a-phay-task-2.tdd.md](../testing/dot-a-phay-task-2.tdd.md). Đã có: module `apps/api/src/media/` 7 file nhân bản khuôn `channels/` (`MediaStore` interface + `media.provider.ts` chọn theo `MEDIA_STORE=none|local|s3` + 3 store + `media-policy.ts` thuần + `MediaFetcherService`); Prisma `Message` **+4 cột nullable** (`mediaKey`/`mediaBytes`/`mediaFetchedAt`/`mediaError`) kèm migration `20260811120000_message_media`; `deploy/netviet/gcs-lifecycle.json` **+2 rule prefix `media/`** (60n → Nearline, 365n → Coldline, **KHÔNG có rule Delete**). Thư viện: `sharp` 0.35.3 + `p-limit` 7.3.1 + `@aws-sdk/client-s3` 3.1107.0 (**chuẩn S3**, không `@google-cloud/storage` — để đổi GCP → OVHcloud không phải sửa code). **Phát sinh phải bịt cùng lúc:** trước Task 2 không chỗ nào trong `apps/api/src` tải một URL do người khác đưa vào; Task 2 tạo ra đúng điều đó ⇒ đã thêm cổng chặn **SSRF** `MEDIA_ALLOWED_HOSTS` (mặc định `zdn.vn`, khớp theo **biên dấu chấm** nên `evil-zdn.vn` bị chặn, để rỗng = chặn hết), chặn **trước khi ra mạng**. Hai bất biến là test: tải ảnh hỏng (404 · không phải ảnh · quá lớn · kho lỗi · **DB lỗi**) KHÔNG làm rớt tin — chỉ ghi `mediaError`; tải chạy **ngoài** đường đi của tin (`schedule`, không `await`) nên mạng chậm không làm chậm chốt đơn. Kiểm: **api 430 passed / 21 skipped** (mốc cũ 389+21, **+41 test mới, không test cũ nào đổi trạng thái**) · coverage `src/media` **97,88% stmt / 95,65% branch** · typecheck · lint — xanh.
  **⚠️ CHƯA LƯU ẢNH NÀO CHO TỚI KHI VẬN HÀNH BẬT:** mặc định vẫn `MEDIA_STORE=none` (demo/CI offline). **▶️ VIỆC TIẾP THEO là việc VẬN HÀNH, không phải lập trình:** cấp khóa HMAC cho bucket + đặt `MEDIA_STORE=s3` · `MEDIA_BUCKET` · `MEDIA_ENDPOINT=https://storage.googleapis.com` · `MEDIA_ACCESS_KEY_ID` · `MEDIA_SECRET_ACCESS_KEY`. **Bẫy:** rule lifecycle gắn vào **bucket sao lưu** (`$BackupBucket`, [deploy.ps1:367](../../deploy/netviet/deploy.ps1:367)) ⇒ `MEDIA_BUCKET` phải trỏ đúng bucket đó, nếu không rule `media/` không có tác dụng mà cũng không báo lỗi. Chưa có: đường **đọc lại** ảnh (endpoint/UI), hiển thị `mediaError` trên `/settings`, backfill ảnh cũ (chưa cần — `CHANNEL_MODE=mock` từ 08/08 nên chưa có tin Zalo thật trong DB).
- **Nền tảng server — CHỐT 11/08/2026:** **giữ nguyên GCP**, sau này chuyển **OVHcloud**. ⇒ tầng lưu ảnh phải dùng **chuẩn S3** (`@aws-sdk/client-s3`), **KHÔNG** dùng `@google-cloud/storage`. Yêu cầu khách: **giữ ảnh ≥ 60 ngày**. *(Đã cân nhắc chuyển server về VN cho gọn nghĩa vụ Điều 18 NĐ 356/2025 — user quyết định giữ GCP; nghĩa vụ hồ sơ chuyển dữ liệu xuyên biên giới vì vậy vẫn còn, xem D22.)*
- **Nhánh hiện tại:** `main`.
- **Pilot GCP đã khóa `CHANNEL_MODE=mock` ngày 08/08/2026:** không đọc/gửi Bot Platform hoặc zca, không dùng PII thật. Source deploy cũng luôn render `mock` để lần deploy sau không tự bật lại kênh Zalo; Flowise/PostgreSQL/SSE vẫn dùng dữ liệu TEST qua luồng bơm tin demo.
- **🔴 ĐANG MẤT ẢNH MỖI NGÀY — đo thật 11/08/2026.** Lấy URL ảnh trong log PoC `updates-2026-07-07-06-05.jsonl` (cách 35 ngày) đem `HEAD` lại: **404** (`server: za-ngx-srv`). Thêm UA Chrome + `Referer: chat.zalo.me` vẫn **404** ⇒ **không phải chặn hotlink**; một ảnh tĩnh khác trên `zdn.vn` trả **200 image/png 346 KB** ⇒ CDN vẫn sống. URL dạng `photo-stal-16.zdn.vn/gr/jpg/<hash>/<key>.jpg` **không có query/chữ ký/`expires`** ⇒ không phải pre-signed URL, mà **Zalo xóa object phía server**, cửa sổ sống **≤35 ngày**. Nhưng vấn đề nặng hơn nằm ở code: `Message.imageUrl` **chỉ lưu link, không tải ảnh về** (`writeFile` duy nhất trong `apps/api/src` là ghi phiên zca), và [bot-poller.ts:73](../../apps/api/src/ingest/bot-poller.ts:73) + [zca-message.ts:27](../../apps/api/src/ingest/zca-message.ts:27) đều `if (!text) return null` (cộng `text: z.string().min(1)` trong `channelMessageSchema`) ⇒ **ảnh gửi không kèm chữ chưa từng vào DB**. Trái thẳng `CLAUDE.md` "Lưu mọi tin nhắn/đơn về DB ngay khi nhận", và làm spec khách **2.3.1** (ảnh biên bản giao hàng từ nhóm vận chuyển) không chạy được. **Không hồi tố được** — ảnh của ngày nào không lưu là mất ngày đó. ⇒ [gd1.md §4 CHẶN E](gd1.md) + **Đợt A′** (làm song song, không chờ khách): module `media/` (`MediaStore` noop/local/gcs theo khuôn `ChannelAdapter`) + `MediaFetcher` (`fetch` → `sharp` → GCS) + 4 trường `media*` trong Prisma. **Cơ chế xóa KHÔNG cần viết** — GCS Object Lifecycle đã có sẵn `deploy/netviet/gcs-lifecycle.json`, chỉ thêm rule prefix `media/` (Standard → Nearline 90n → Coldline 365n, **chuyển tầng chứ không xóa**).
- **🟢 KẾT LUẬN "BOT PLATFORM CHẾT" ĐÃ SAI — kênh sống lại, đo lại 11/08/2026.** Dùng đúng token đang có: `getUpdates` trả **HTTP 200 + `error_code:408 Request timeout`** và **tôn trọng đúng tham số `timeout`** — 1s→1.196ms, 5s→5.092ms, 20s→20.111ms. Theo chú thích sẵn có trong [zalo-bot.client.ts:3](../../apps/api/src/channels/zalo-bot.client.ts:3), `408` = *rảnh, không có tin mới* ⇒ **long-poll khỏe mạnh bình thường**, không còn 504-ở-5,13s. Đường **gửi cũng sống**: `sendMessage` và `sendPhoto` trả `410 "The chat_id is invaild"` (endpoint đã validate chat_id) khi thử với chat_id không tồn tại — **không tin nào tới người thật**. ⇒ Sự cố 05/08 là **gián đoạn tạm thời phía Zalo, nay đã hết**; có kênh chính thức hợp pháp cho cả đọc lẫn gửi. **Ràng buộc còn nguyên:** mention-gating (bot chỉ nhận tin @mention) ⇒ D2 thành câu hỏi quyết định kiến trúc; và `sendVideo`/`sendFile` trả **404 — API không tồn tại** ⇒ video/catalog phải gửi bằng link. Chi tiết: [gd1.md §2](gd1.md). *(Đoạn dưới giữ nguyên làm nhật ký điều tra 05/08 — không còn là trạng thái hiện tại.)*
- **⛔ KÊNH BOT PLATFORM CHẾT — xác nhận bằng token mới (05/08/2026).** Người vận hành cấp lại `ZALO_BOT_TOKEN`; token cũ nay trả **401 Unauthorized** (đã thu hồi thật), token mới `getMe` **200 OK** cùng bot id `4055584533866160964`. **Nhưng `getUpdates` vẫn 504** — thử `{timeout:20|5|1}` và body rỗng, cả POST lẫn GET, từ máy local lẫn từ VM: **lần nào cũng 504 ở đúng ~5,13 giây** (nginx của Zalo bỏ cuộc chờ upstream), tham số `timeout` không có tác dụng nào. `getWebhookInfo` trả **404** ⇒ Bot Platform **không có đường webhook** để thay long-polling. ⇒ Kết luận: **sự cố phía Zalo, không có cách sửa bằng code, không có đường vòng.** Từ 08/08 runtime đã khóa `CHANNEL_MODE=mock`, vì vậy BotPoller và zca đều không chạy; token version 2 chỉ còn lưu trong Secret Manager, không làm kênh hoạt động.
- **Trang vận hành `/settings` (03/08/2026)** — 6 tab cho người non-technical: trạng thái/đăng xuất kênh Zalo + đồng bộ thành viên nhóm allowlist bằng zca; phân loại từng thành viên (`customerRank` · `operationalRole` · `handlingMode`, mặc định `unknown + inherit_group` nên sync KHÔNG tự đổi hành vi pipeline); CRUD đại lý/SKU/giá/override; rules typed có draft → preview → activate (không cho nhập công thức tự do); công tắc `AUTO_SEND` dùng chung một state với TopBar; lịch sử thay đổi (audit append-only, đã lọc token/PII). **Rank thành viên không đổi đơn giá** — giá vẫn là `DealerPriceOverride > Price.wholesale`.
- **`/settings` — sửa lỗi KHÔNG AI VÀO ĐƯỢC (04/08/2026, đợt 2):** trang 6 tab ở trên đã deploy và đọc/ghi Postgres thật (19 SKU, 3 đại lý), nhưng người vận hành báo "chưa có giao diện sửa nguồn sự thật / chưa có danh sách thành viên". Đối chiếu code: **giao diện có đủ, chỉ là không có đường đi tới** — (a) không một link `/settings` nào trong toàn app (mục "Link Settings" của plan §9 bị bỏ sót); (b) Caddy `@blocked` trả 404 cho `demo.../settings`; (c) matcher `/settings/*` nuốt luôn `/settings/` (dấu `/` cuối) đẩy sang API → 404. Đã sửa cả ba: nút **⚙ Cấu hình** trên TopBar + link chéo `/zalo ↔ /settings`, bỏ `@blocked`, tách từng endpoint API dưới `/settings`. Kèm 3 lỗi cùng gốc: **mọi thao tác ghi đều im lặng** (chỉ có tone `error`, không có `success`) → thêm `SettingsPanelState tone="success"` + banner sau "Lưu và bắt đầu nhận tin" (hiện số nhóm đang nghe + lối sang bước đồng bộ thành viên) và sau đồng bộ (hiện số thành viên, phân biệt đủ/thiếu); nút "Mở Admin nâng cao" dẫn tới `/admin` đang 404 vì `ADMIN_UI=off` → summary trả thêm `adminUi`, UI ẩn nút khi tắt; đồng bộ thành viên nay **loại tài khoản zca của chính mình và UID Bot Platform** khỏi danh sách.
- **Test với dữ liệu Zalo THẬT (04/08/2026) — 2 lỗi chỉ lộ khi chạy thật:** sau khi người vận hành đăng nhập tài khoản phụ `Nhân Viên AI` và allowlist 2 nhóm, lộ ra: (1) **chatId trong nguồn sự thật là ID cũ** (`2508…`, `3787…`) không khớp ID thật (`5418…`, `6732…`) → `POST /zalo/groups/:id/members/sync` trả 400 "Nhom Zalo chua duoc map vao nguon su that", và mọi đơn từ 2 nhóm này sẽ không tra được đại lý ⇒ không có giá. Đã map lại qua tab "Map nhóm Zalo" (2 bản ghi mới, giữ bản cũ để không mất lịch sử). (2) **Zalo trả `GroupInfo.memberIds` RỖNG** và dồn toàn bộ thành viên vào `currentMems` — code chỉ đọc `memberIds` nên sync trả `expectedCount: 0` mà vẫn báo `complete: true` (**hỏng âm thầm**, không có lỗi nào). Đã sửa: gộp cả hai nguồn và dùng luôn hồ sơ nhúng trong `currentMems` (`dName`/`zaloName`/`avatar`) nên **không cần gọi `getGroupMembersInfo`** cho các thành viên đã có sẵn.
- **Khai thác hai kênh hybrid (04/08/2026, đợt 3) — 4 lỗ hổng "biết mà không ghi":** soát lại toàn bộ đường dữ liệu sau câu hỏi của người vận hành *"tại sao lại có đoạn map nhóm trong khi bạn có thể lấy được id nhóm, tên nhóm"*. Hệ thống đã biết đủ id + tên nhóm và id + tên người gửi trên **cả hai kênh** nhưng không ghi lại gì cả. Đã sửa cả bốn:
  1. **Tin của nhóm chưa map bị VỨT, không lưu** — `ZcaListener` và `BotPoller` đều `return` trước khi gọi pipeline; Zalo không phát lại ⇒ mất vĩnh viễn, trái `CLAUDE.md` "Lưu mọi tin nhắn/đơn về DB ngay khi nhận". Cổng chặn có lý do đúng (không đẩy PII sang DeepSeek) nhưng đặt sai chỗ. Nay `PipelineService.intake()` **lưu trước, lọc parser sau**, trả kết quả **có nhãn** (`processed`/`stored_only`/`duplicate`/`ignored`) dạng union phân biệt. Sửa kèm một **lỗi tiềm ẩn sẵn có**: listener gọi `guard.release()` cho mọi giá trị `null`, tức coi "bỏ qua có chủ ý" là thất bại và để tin chạy lại. `isGroupMapped` **fail-closed**: thiếu `KnowledgeService` thì coi như chưa map (đoán "đã map" = rò PII nếu DI hỏng trong im lặng).
  2. **Nhóm không tự vào nguồn sự thật** dù `Group.status`/`source`/`lastSeenAt` có sẵn trong schema từ đầu mà **chưa hề có writer nào**. Nay `GroupDiscoveryService.observe()` upsert theo khoá tự nhiên `(platform, chatId)` ngay khi thấy tin đầu tiên (`pending` + `auto_suggest`, throttle 5 phút/nhóm, chỉ cập nhật `lastSeenAt` cho hàng đã có nên nhóm đã `mapped` không bị hạ cấp). Bỏ log *"copy ID này vào seed.ts"* — hệ thống không còn bắt người vận hành chép chatId vào mã nguồn.
  3. **Map nhóm phải gõ chatId tay** (19 chữ số) dù UI đã hiện sẵn cả ID lẫn tên — chính chỗ này gây sai hôm nay. Nay `PUT /settings/groups/:chatId/mapping` + **dropdown chọn đại lý ngay trên bảng nhóm**; kiểm dealer tồn tại trước khi chạm bảng `Group`; gọi `knowledge.reload()` để pipeline thấy ngay. `/settings/summary` trả thêm `groups[].status`, parser web mặc định `pending`.
  4. **Bot Platform bỏ qua allowlist** — chỉ `ZcaListener` kiểm, nên nhóm người vận hành **cố ý không chọn** vẫn được xử lý qua kênh Bot nếu tình cờ đã map. `shouldAcceptBotMessage` áp allowlist cho cả hai kênh trong hybrid; bot thuần (allowlist rỗng) không bị áp.
- **✅ Đã có đường vòng cho bế tắc danh sách thành viên (04/08/2026, đợt 3).** Dò Bot Platform bằng token thật: `getChat`, `getChatMemberCount`, `getChatMembersCount`, `getChatAdministrators` **đều 404** trong khi `getMe` 200 (`account_type: BASIC`) ⇒ kênh chính thức **không có API thành viên**, ngõ này đóng hẳn. Nguồn còn lại **duy nhất** là chính luồng tin: cả hai kênh đều kèm uid + tên người gửi ở **mọi** tin (`data.uidFrom`/`dName` và `from.id`/`display_name`) — hai trường này vốn đã được lưu vào bảng `Message` rồi bỏ đó, trong khi pipeline tra participant theo đúng cặp đó và tra hụt thì lặng lẽ đi tiếp. Nay `recordSeen()` (2 repository + enum `ParticipantSource.message_stream`) ghi người gửi vào danh sách, chạy cho **cả nhóm chưa map** — chỉ nội dung bị chặn khỏi LLM, danh tính thì không. **Ba bất biến là test chứ không phải quy ước:** không bao giờ đánh `active=false` (đây là lát cắt, không phải ảnh chụp đầy đủ) · không đè phân loại của người vận hành · không hạ cấp `source`. UI nói rõ danh sách là **"những người đã nhắn"**, không phải toàn bộ nhóm, kèm nhãn nguồn + lần nhắn gần nhất. ⚠️ Giới hạn: người **chưa bao giờ nhắn** vẫn không xuất hiện; với nhóm 4-6 người thì hội tụ nhanh, nhóm lớn thì không.
- **⛔ CHẶN (nguyên nhân gốc vẫn treo): Zalo không trả danh sách thành viên nhóm (04/08/2026).** *Đã có đường vòng ở mục trên, nhưng bản thân `getGroupInfo` vẫn hỏng.* Tài khoản phụ `Nhân Viên AI` thấy nhóm và `totalMember` đúng (4 và 6) nhưng `getGroupInfo` trả **mọi trường mảng đều rỗng** (`memberIds`, `currentMems`, `adminIds`) trong khi **mọi trường vô hướng đều đầy đủ** (`name`, `totalMember`, `setting`, `creatorId`). Đã loại trừ bằng bằng chứng: **(a)** không phải lỗi parse — các trường có mặt, chỉ rỗng; **(b)** không phải quyền nhóm — `lockViewMember=0`, `e2ee=0`; **(c)** không phải cache version — `getGroupInfo` của zca-js luôn gửi `gridVerMap = 0` nên lần nào cũng xin bản đầy đủ. Còn lại 2 khả năng **chưa kiểm**: zca-js 2.1.2 (pin có chủ ý) lệch so với API `group/getmg-v2` hiện hành của Zalo, hoặc tài khoản phụ bị hạn chế ở mức tài khoản. **Cập nhật 05/08/2026 (đợt 4):** tìm ra `memVerList` — một trường UID nữa trong **cùng** response mà code chưa đọc; đã đọc thêm, nhưng chưa biết Zalo có điền nó không (xem đợt 4 bên dưới). ⇒ Nút **"Đồng bộ"** có thể vẫn vô dụng với dữ liệu thật (tab thì đã dùng được nhờ đường vòng học-từ-luồng-tin ở trên). Lưới an toàn đã có: sync trả `complete: false`, **không** đánh inactive ai, UI báo đỏ "Zalo không trả về danh sách thành viên" thay vì "đã đồng bộ 0 thành viên".
- **Ba lỗi từ một buổi vận hành (05/08/2026, đợt 4).** Người vận hành bấm "Đồng bộ" và báo hai chuyện: lỗi đồng bộ, và *"tôi còn không xóa được mấy nhóm có id 2508…, 3787…"*. Soát ra ba nguyên nhân khác hẳn nhau:
  1. **`getGroupInfo` còn một trường chưa ai đọc.** Log VM ngày 04/08 cho thấy `totalMember=4-5` nhưng `memberIds=0`, `currentMems=0`, trong khi `lockViewMember=0` và `e2ee=0` — nhóm **không khoá gì cả**. Đọc lại kiểu của zca-js 2.1.2 thì response còn `memVerList: string[]` (danh sách `"uid_version"` Zalo dùng để bắt cache) mà code chưa đụng tới. Nay `fetchGroupMembers` gộp nó làm **nguồn UID thứ ba**; hồ sơ còn thiếu vẫn lấy qua `getGroupMembersInfo` như cũ, không tốn thêm request nào. Parser cố tình **không ném lỗi** với phần tử dị dạng — đây là nguồn vét vát, một phần tử lạ không được làm hỏng cả lần đồng bộ. ⚠️ **Chưa xác minh trên dữ liệu thật**: dòng log cũ không đếm `memVerList` nên chưa biết Zalo có điền trường này không; log mới đã thêm số đếm, cứ bấm Đồng bộ một lần là biết.
  2. **Thông báo lỗi đang nói sai nguyên nhân.** UI bảo *"tài khoản này chưa đủ quyền xem thành viên"* và bảo người vận hành đi mở nhóm trên Zalo — trong khi nhật ký chứng minh ngược lại. Đã viết lại theo sự thật (giới hạn phía Zalo, không phải quyền tài khoản) và chỉ sang cơ chế học-từ-luồng-tin đang chạy sẵn.
  3. **Không có đường nào gỡ một nhóm khỏi danh sách.** Enum `GroupMappingStatus` có `ignored` **từ migration đầu tiên** nhưng chưa ai từng ghi giá trị đó; `SettingsQueryService` thì liệt kê **mọi** hàng `Group` bất kể trạng thái. Nên hai nhóm `source=seed` sót từ đợt test trước kẹt vĩnh viễn trong bảng — đúng như người vận hành mô tả. Nay có `PUT /settings/groups/:chatId/hidden` (có audit, `knowledge.reload()`) + khu **"Nhóm đã gỡ"** có nút *Đưa lại*. **Cố ý không xoá hàng:** `Message.groupId` và `Order.groupId` đều trỏ tới `Group` và **không** cascade, nên `delete` sẽ vi phạm khoá ngoại ngay khi nhóm từng nhận tin — mà `CLAUDE.md` thì cấm xoá tin. Gỡ **không** đụng `dealerId` nên đưa lại là chạy tiếp, không phải chọn lại. Kèm theo: `prisma/seed.ts` thôi ghi đè `status`/`dealerId` ở nhánh `update`, nếu không thì chạy lại seed là nhóm đã gỡ sống dậy.
- **Lưu trữ:** mặc định in-memory (`PERSISTENCE=memory` → demo/CI không cần DB); bật Postgres bằng `PERSISTENCE=prisma`. **MỌI tin nhắn được lưu vào bảng `messages` ngay khi nhận** (11/07, commit `6d1a539` — trước khi qua pipeline, chống trùng unique, nối `orders.messageId`).
- **Nguồn sự thật ĐỘNG:** sửa qua panel `/admin` (AdminJS) hoặc MCP tool (8 tool) → ghi Postgres + pipeline nạp lại ngay.
- **✅ ĐỒNG BỘ THÀNH VIÊN ĐÃ CHẠY ĐƯỢC VỚI DỮ LIỆU THẬT (05/08/2026) — gỡ bỏ mục ⛔ CHẶN bên dưới.** Sau khi deploy đợt 4, bấm "Đồng bộ" trên VM trả về: Meta HN `complete: true, fetchedCount: 3`, Thái Nguyên `complete: true, fetchedCount: 4` (trước đó cả hai đều `fetchedCount: 0, complete: false`). DB có đủ 7 hàng `GroupParticipant` kèm tên thật và avatar. ⚠️ **Chưa quy được công cho đường nào:** cảnh báo "Zalo khong tra danh sach thanh vien" **không** kích hoạt, và log đường link mời **cũng không** — nghĩa là UID đến từ `memberIds`/`currentMems`/`memVerList` (đều là "đường chính"), nhưng không phân biệt được là do `memVerList` mới đọc hay do Zalo tự trả lại 2 trường cũ. Đường **link mời chưa từng chạy thật lần nào** ⇒ vẫn là mã chưa được kiểm chứng ngoài test. Dòng log đã đếm `memVerList` nên nếu tái phát sẽ thấy ngay. Ghi nhận thêm: hàng `Phùng Việt` giữ nguyên `source=manual` sau đồng bộ — bất biến "không hạ cấp source" đúng trên dữ liệu thật.
- **Nguyên nhân gốc bế tắc danh sách thành viên: ĐÃ RÕ (05/08/2026) — và nó bác bỏ cả hai giả thuyết cũ.** Issue [#359](https://github.com/RFS-ADRENO/zca-js/issues/359)/[#349](https://github.com/RFS-ADRENO/zca-js/issues/349) của zca-js cho thấy **Zalo chủ động chặn đọc danh sách thành viên ở diện rộng từ giữa 2026** (*"trước quét được giờ bị zalo lock rồi"*; người bảo trì xác nhận *"Zalo họ biết và có thể là đã sửa lỗi này rồi"*). Không phải zca-js lệch phiên bản, không phải tài khoản phụ bị hạn chế ⇒ **nâng thư viện không cứu được**, và cơ chế học-từ-luồng-tin là **giải pháp chính**, không phải tạm bợ. Đã cài thêm đường vét vát cuối: `getGroupLinkInfo` (endpoint khác — `group/link/ginfo`) chỉ chạy khi cả ba trường UID rỗng **và** nhóm đã sẵn có link mời bật; hệ thống **không bao giờ tự bật link mời** vì đó là đổi cài đặt nhóm của khách. Chi tiết: [so-do-he-thong.md](../so-do-he-thong.md) Phụ lục A.
- **✅ ĐỢT B1 — TRUNG TÍNH HÓA NHÂN XONG (12/08/2026).** Base không còn mang tên một khách: gói `@ultty/*` → `@netviet/*`; nguồn sự thật Ultty (19 SP + bảng giá + 3 đại lý + 24 glossary) rời `apps/api/src/knowledge/seed.ts` sang **gói khách** `tenants/ultty/data/knowledge.json`; tên khách rời `parser-prompt.ts` sang `tenants/ultty/tenant.json` (`persona.parserIntro`); `KiotVietAdapter` → **`ErpPort`** với `KiotVietMockAdapter` là một hiện thực (`apps/api/src/erp/`). Chọn khách bằng `TENANT=<slug>` hoặc `TENANT_DIR=<path>` cho khách chạy hạ tầng riêng — [tenants/README.md](../../tenants/README.md). Nghiệm thu: **430 test API cũ xanh nguyên, không test nào đổi trạng thái** (+8 test mới cho loader gói khách) · shared 69 · web 29 · route 8 · typecheck · lint xanh. Chi tiết + phần cố ý chưa làm: [nen-tang-da-khach.md §9](nen-tang-da-khach.md). **Còn treo:** B2 (gói khách đầy đủ + CI hai gói) · B3 (bỏ `zalo-ultty` khỏi 21 file deploy + chuỗi UI) · B4 (Nhanh.vn/MISA/PDF cho Amico).
- **Chất lượng (05/08/2026, sau đợt 4):** **378** test API pass + 21 skip · **64** shared · **29** web · **4** Playwright E2E `/settings` · **7** contract route · lint · typecheck đều xanh. (Mốc sau đợt 3: 360 API / 3 E2E; mốc đầu ngày 04/08: 312 API / 27 web / 6 route.) Số liệu chi tiết bên dưới là của đợt 03/08.
- **Chất lượng (03/08/2026):** 308 test API (+21 integration/eval skip khi không có DB; bật `RUN_PRISMA_IT=1` trên Postgres thật → **328 xanh**) + 60 shared + 26 web + 2 contract route + **2 Playwright E2E `/settings`** xanh; coverage mục tiêu phần hybrid đạt 93,29% statement/line, 87,32% branch, 86,66% function; Flowise contract thật xanh; eval Flowise **35/35 intent**; lint · typecheck · build xanh; không còn audit high/critical (còn 6 moderate). Field-accuracy vẫn chờ golden B1-B2.
- **Pilot GCP `netviet` — TẮT TOÀN BỘ XÁC THỰC + LUÔN CHẠY (04/08/2026, quyết định người vận hành):** VM được chốt là **môi trường dev/demo**, không dùng PII thật, nên bỏ hết rào đăng nhập cho đỡ vướng khi demo. Đã tắt 4 lớp: Basic Auth `demo`/`netviet` ở Caddy · guard `x-api-key` · kiểm `Origin` chống CSRF cho mutation · đăng nhập AdminJS. Công tắc duy nhất là biến mới **`AUTH_MODE`** (`api-key` mặc định · `none` cho VM này); CORS cũng mở khi `none`. **Flowise vẫn đòi đăng nhập** — Flowise 3.x bắt buộc tài khoản, không có cờ tắt. Luôn chạy: `restart: always` cho 5 service + unit `netviet-stack.service` chạy lúc boot + `health-check.sh` tự khôi phục service chết (log `NETVIET_HEALTH_HEAL`). ⚠️ **Đánh đổi:** VM mở public 80/443 → ai biết URL cũng đọc/sửa được nguồn sự thật và gọi được `/broadcast`. Chỉ hợp lệ khi dùng nhóm/dữ liệu TEST; **trước khi chạy dữ liệu khách thật phải đặt lại `AUTH_MODE=api-key` + bật lại Basic Auth** (D5 auth theo vai vẫn treo). Cách bật lại: [deploy/netviet/README.md](../../deploy/netviet/README.md).
- **Pilot GCP `netviet`:** HTTPS public; Flowise có đăng nhập riêng. Contract, SSE + 6 vai/1 LLM, restart-persistence, backup/restore và rollback `deepseek → flowise` đều đạt. Soak 24 giờ kết thúc **PASS 01/08** (RAM tối đa 56%, disk 21%, không OOM/restart bất thường). ZCA đã chọn Meta HN (`2508572440887686813`) và Thái Nguyên (`3787434804745256898`); còn xác nhận lại E2E duyệt/gửi sau sửa group ID.

### Cách chạy nhanh

```bash
# Demo offline (không cần DB)
pnpm dev:api && pnpm dev:web

# Bản thật: Postgres + panel chỉnh nguồn sự thật
docker compose up -d postgres
pnpm --filter @netviet/api exec prisma migrate deploy
pnpm --filter @netviet/api exec tsx prisma/seed.ts
PERSISTENCE=prisma ADMIN_UI=on pnpm --filter @netviet/api dev   # → /admin

# MCP tool (agent sửa nguồn sự thật bằng hội thoại)
pnpm --filter @netviet/api mcp
```

---

## 2. Bức tranh lớn: lộ trình 3 giai đoạn (NetViet) + vị trí hiện tại

```mermaid
flowchart LR
    subgraph P0["Chuẩn bị ✅"]
        A1["Scaffold monorepo ✅"]
        A2["PoC Bot + zca ✅"]
        A3["Nguồn sự thật thật ✅"]
        A4["Bake-off parser (100%) ✅"]
    end

    subgraph G1["GĐ1 — Đọc tự động + Sale duyệt (⬅ ĐANG Ở CUỐI GĐ NÀY)"]
        B1["Pipeline: intent + trích xuất<br/>+ rules + validation ✅"]
        B2["Console duyệt 1 chạm ✅"]
        B3["Lưu mọi tin ✅ · rules-config động ⬜"]
        B4["KiotViet Excel/API + auth ⬜"]
        B5["Pilot 1-2 nhóm, đo 4 KPI ⬜"]
    end

    subgraph G2["GĐ2 — Tự động hóa & đa kênh ⬜"]
        C1["KiotViet API + Base API"]
        C2["Zalo OA 1:1 + ZNS"]
        C3["Đối soát ký gửi/công nợ + AUTO_SEND"]
    end

    subgraph G3["GĐ3 — Tối ưu & chủ động ⬜"]
        D1["Dự báo mùa vụ, cảnh báo tồn"]
        D2["Up-sell / nhắc tái đặt"]
    end

    P0 --> G1 --> G2 --> G3
```

Đợt 1-4 của [tinh-nang-dai-han.md](tinh-nang-dai-han.md) (6 tính năng mới) đứng TRÊN nền Đợt 0 và đan vào GĐ2-3 NetViet.

---

## 3. BẢNG TRẠNG THÁI kế hoạch (nơi duy nhất có ✅/⬜)

### 3.1 [nen-tang.md](nen-tang.md) — Đợt 0 (việc đang dở, chắc chắn làm)

| Hạng mục (phạm vi chi tiết ở kế hoạch con) | Trạng thái |
|---|---|
| Phase 0-2 — scaffold · PoC · pipeline · rules · console SSE · kênh zca · dữ liệu thật | ✅ XONG |
| Phase 3 — Postgres/Prisma + repo seam + panel `/admin` + MCP tool + seed thật | ✅ XONG |
| Phase 3 còn lại — **lưu MỌI tin vào DB** (`messages`) | ✅ 11/07/2026 — `MessagesRepository` seam memory\|prisma, pipeline lưu TRƯỚC khi xử lý (lỗi lưu không chặn đơn; rerun không lưu lại), chống trùng unique `(platform, externalMessageId)`, nối `orders.messageId`; IT Postgres gated `RUN_PRISMA_IT=1` |
| Phase 3 còn lại — **rules-config động** + sửa nghiệp vụ theo nguồn gốc (VAT-default **D8** · phí COD dạng bảng · xác minh `cong_no_7` **D15** · ship/ngưỡng thành config) | ⬜ chờ D8/D15 + A3 |
| Phase 3 còn lại — **import Excel A4** (đại lý + map nhóm, dùng `read-excel-file` — 🔄 11/07 thay `exceljs`) | 🟡 **mẫu gửi khách ĐÃ soạn 13/07** — `docs/khach-hang/ultty/trao-doi/A4_dai-ly_map-nhom_U-Ultty.xlsx` (3 sheet, dropdown khớp enum `Dealer`/`Group`, kèm 3 đại lý + 2 nhóm thật) sinh từ `tools/excel-template/`; **importer** đọc file khách trả về ⬜ chờ A4 |
| Phase 4 — KiotViet Excel/API + map SKU↔mã số · Base · đổi LLM sang Claude cho dữ liệu thật | ⬜ chờ C1 |
| Phase 5 — auth theo vai (2 cổng KSNB) + ghi `kpi_events` + feedback loop | ⬜ chờ D5 |
| Phase 6 — deploy 1 VM + webhook always-on + sao lưu + **pilot 1-2 nhóm → go/no-go** | 🟡 hạ tầng `netviet` đã public qua HTTPS ở chế độ dev/demo không auth; Flowise/DeepSeek/Postgres thật, KiotViet và kênh Zalo mock; smoke · persistence · backup/restore · monitoring · rollback · soak 24 giờ đạt. Console `/settings` đã deploy; **CI/CD đã có** (`.github/workflows/ci.yml` 5 job gồm Prisma IT + Playwright + audit; `deploy.yml` CD keyless qua Workload Identity Federation). **CI đã chạy xanh 5/5 job trên GitHub 03/08** (run `30803243172`); 2 repository variable đã đặt; environment `production` yêu cầu người duyệt và chỉ cho deploy từ `main`. Việc bật kênh Zalo thật được tách khỏi nghiệm thu hạ tầng D18c |
| Việc "thật hơn" treo — đọc 6 quy trình gốc chưa phản ánh · mô hình hóa sau `synced` · PWA 5 tab | ⬜ |

### 3.2 [tinh-nang-dai-han.md](tinh-nang-dai-han.md) — Đợt 1-4 (6 tính năng mới, định hướng)

| Đợt | Gồm | Trạng thái | Cổng vào (chi tiết ở kế hoạch con) |
|---|---|---|---|
| 1 — Giá trị nhanh | F6a gọi nhân viên → F1 sửa đơn NL → F3 dashboard v1 | ⬜ chưa bắt đầu | Đợt 0 xong phần nền + D10 · D11 · D14 |
| 2 — Dòng tiền | F2 QR + payments → F5 v1 nhắc công nợ | ⬜ chưa bắt đầu | D9 · D13 |
| 3 — Năng lực AI | F4 ảnh viết tay (PoC trước) · F6b chống gian lận v1 | ⬜ chưa bắt đầu | D12 · D14 |
| 4 — Tối ưu (GĐ3) | F5 v2 đối soát · F6b v2 baseline · dự báo/up-sell | ⬜ chưa bắt đầu | vài tháng dữ liệu thật sau pilot |

Ghi chú trạng thái đã chốt cho kế hoạch dài hạn: **lộ trình Đợt 1→4 đã được duyệt** (10/07/2026) · **thư viện/dịch vụ đã chốt qua search-first** (danh sách trong kế hoạch con §7) · ⚠️ deadline kỹ thuật: **DeepSeek khai tử model cũ 24/07/2026** — demo đã chuyển `deepseek-v4-flash` ✅.

---

## 4. DỮ LIỆU CÒN THIẾU (chặn gì — hỏi chị Nguyễn Thu Phương)

> Nguồn sự thật đã **động** → thiếu A2/A3/A4 **không chặn BUILD** (nhập dần qua `/admin`/MCP) nhưng vẫn chặn **chạy thật đúng số**. B1-B2 là **cổng go-live**, không thay thế được.
> Trạng thái: ⬜ chưa có · 🟡 đã hỏi, đang chờ · ✅ đã nhận & kiểm tra.

**Ưu tiên đỏ:** 🔴 A3 (rules hết "tạm tính") · 🔴 A4 (áp đúng đại lý) · 🔴 A2 (deal riêng) · 🟠 B1-B2 (cổng go-live) · 🟡 C1 (Phase 4).

> 📋 **Bản hỏi Sale (không kỹ thuật):** [docs/khach-hang/ultty/trao-doi/checklist-hoi-sale.md](../khach-hang/ultty/trao-doi/checklist-hoi-sale.md)
> — cùng nội dung A/B/D dưới đây nhưng viết lại thành câu hỏi nghiệp vụ cho chị Phương trả lời trực
> tiếp. Bảng ở đây là bản kỹ thuật; đừng gửi bảng này cho khách.

### A — Nguồn sự thật

| # | Cần gì | Chi tiết hỏi | Chặn | TT |
|---|---|---|---|---|
| A1 | Danh mục SKU | ~~Mã, tên, tên gọi tắt, đơn vị~~ — **đã có 19 SKU từ hồ sơ giá tháng 7**; chỉ còn xác nhận đủ/thiếu | — | ✅ |
| A2 | Deal riêng theo đại lý | Ai có deal riêng, SKU nào, giá nào (cơ chế `DealerPriceOverride` sẵn, đang rỗng) | Giá đúng cho đại lý SL lớn | ⬜ |
| A3 | **Biểu phí COD + biểu cước ship + ngưỡng công nợ** | Bảng phí thu hộ COD ("biểu mẫu riêng"); mức cước Grab nội thành/Viettel tỉnh; định nghĩa "nội thành"; ngưỡng SL áp công nợ 30 vs 45 | Rules hết **tạm tính** (COD 20k, ship 30k/40k đang là giả định) | ⬜ |
| A4 | Danh sách đại lý/CTV + map nhóm Zalo | Tên, cấp, chính sách mặc định, SĐT + nhóm Zalo nào thuộc đại lý nào (từ tag Zalo đang dùng); ưu tiên 10-20 nhóm pilot; gửi file mẫu cho Sale điền dần | Áp đúng đại lý/chính sách (cơ chế nhập sẵn: `/admin` + hộp thư nhóm chưa map + import `read-excel-file`) | ⬜ |

### B — Dữ liệu kiểm thử AI (CỔNG GO-LIVE)

| # | Cần gì | Chi tiết | TT |
|---|---|---|---|
| B1 | **20-30 tin đặt hàng THẬT** | Nguyên văn (giữ viết tắt/không dấu), đủ dạng TH1/TH2/sửa đổi/nhiều SP, kèm nhóm/đại lý | ⬜ |
| B2 | Đơn ĐÚNG tương ứng (golden) | Đơn cuối lên KiotViet cho từng tin B1 — đo field-accuracy + bake-off model | ⬜ |
| B3 | 5-10 ảnh chụp bảng đặt hàng | Cho <20% đơn ảnh (sau này là bộ eval F4) | ⬜ |
| B4 | Từ điển viết tắt bổ sung | Đã có 24 mục từ `Viết tắt_.docx`; nhờ Sale bổ sung tên gọi tắt SP/đại lý | 🟡 |
| B5 | Mẫu format xác nhận Sale đang gửi | 2-3 tin xác nhận TH1 + TH2 thật (đúng giọng hiện tại) | ⬜ |

### C — Truy cập hệ thống (hỏi sớm vì chờ lâu)

| # | Cần gì | Chi tiết | TT |
|---|---|---|---|
| C1 | KiotViet — gói & API | Gói nào, có mục Thiết lập → API không (docs công khai: 5.000 GET/giờ, token 24h); xin file Excel export 5-10 đơn gần nhất + file mẫu import | ⬜ |
| C2 | Base — phạm vi dùng & API | App nào (Workflow/Wework), đầu mối kỹ thuật, format đơn nhập Base (ảnh màn hình) | ⬜ |
| C3 | Hóa đơn VAT | Phần mềm nào, thông tin chuẩn bị khi xuất (STK công ty/cá nhân) | ⬜ |

### D — Quyết định cần chốt (bảng thống nhất — đánh số CHUẨN từ 11/07/2026)

> D1-D7 giữ nguyên số cũ của checklist; D9-D14 giữ nguyên số của kế hoạch dài hạn; 2 câu hỏi rules (trước tạm gọi "D6/D7 mới" — bị trùng số) đổi thành **D8/D15**.

| # | Quyết định | Chặn gì | TT |
|---|---|---|---|
| D1 | Nhóm Zalo test + add bot PoC | — | ✅ 07/07 |
| D2 | Đại lý có chấp nhận **tag bot** khi đặt hàng? | Bật Bot mode (kênh phụ) | 🟡 |
| D3 | Design PWA là spec hay tham khảo UX? Console PC hay PWA mobile 5 tab? | Hướng app Sale sau demo | ⬜ |
| D4 | AI có được **tự gửi/trả lời** trong nhóm (`AUTO_SEND`/auto-reply)? | Cần **văn bản đồng ý** — GĐ2 | ⬜ |
| D5 | Danh sách người dùng app (tên + SĐT + vai: BPKD/KSNB/kế toán/quản lý) | Phase 5 auth | ⬜ |
| D6 | Mẫu thông báo "nhóm có hệ thống hỗ trợ tự động" | Tuân thủ Zalo + Luật 91/2025 khi chạy thật | ⬜ |
| D7 | Chốt phạm vi GĐ1 + KPI + mốc pilot 1-2 nhóm | Phase 6 | ⬜ |
| **D8** | **VAT-default** theo chính sách/đại lý (PO công nợ B2B ghi "giá đã gồm GTGT") hay giữ "chỉ VAT khi khách ghi rõ"? | Increment rules-config (Đợt 0) | ⬜ |
| D9 | STK nhận tiền + chọn SePay/Open API bank/bán tự động + bổ sung hợp đồng xử lý dữ liệu giao dịch | F2 (Đợt 2) | ⬜ |
| D10 | Đơn trạng thái nào còn được sửa/hủy qua AI; đơn đã giao đi quy trình hoàn trả nào | F1 (Đợt 1) | ⬜ |
| D11 | Danh sách chỉ số dashboard (đề xuất: 4 KPI + doanh thu đại lý/chi nhánh + phễu đơn) | F3 (Đợt 1) | ⬜ |
| D12 | Cấp Claude API credit + 20-30 ảnh đơn viết tay thật kèm đáp án | F4 (Đợt 3) | ⬜ |
| D13 | Ngưỡng công nợ chính thức (A3) + cách xác định "ngày nhận hàng" + số dư công nợ đầu kỳ từ Excel BPKD | F5 (Đợt 2) | ⬜ |
| D14 | Danh sách Sale trực + kênh nhận cảnh báo + case đơn ảo/gian lận thật + ngưỡng | F6 (Đợt 1+3) | ⬜ |
| **D15** | **"Công nợ 7 ngày"** là chính sách riêng hay điều khoản TT-7-ngày của ký gửi? | Increment rules-config (Đợt 0) | ⬜ |
| **D16** | **Văn bản chấp nhận rủi ro ToS** cho kênh zca (tài khoản phụ) | Chạy thật kênh zca | ⬜ |
| **D17** | ~~DeepSeek: bổ sung vào thỏa thuận HAY đổi `PARSER_MODE=claude`?~~ → **CHỈ CÒN 1 ĐƯỜNG: đổi sang Claude.** Khảo sát 28/07: DeepSeek lưu dữ liệu tại Trung Quốc và **không có DPA để ký**; Privacy Policy loại trừ chính luồng open-platform API đang dùng. Phương án "bổ sung vào thỏa thuận" **bất khả thi** | Chạy thật với dữ liệu khách | 🟡 đã rõ hướng |
| **D18a** | **Quyết định + spike Flowise thay Dify.** NestJS giữ vai trò điều phối; Flowise chỉ gọi LLM để phân loại/trích xuất. Lý do giấy phép ghi chính xác: core Flowise ngoài thư mục enterprise là Apache 2.0; một số phần enterprise dùng điều khoản thương mại, không phải toàn bộ Flowise là Apache | Hướng kỹ thuật phần AI | ✅ 28/07, rà lại 31/07 |
| **D18b** | **Tích hợp Flowise runtime:** `FlowiseParser`, Agentflow V2 versioned, fail-fast env, contract auth/schema, rollback `PARSER_MODE=deepseek`; eval intent 35/35 | Nghiệm thu lớp parser | 🟡 code + contract + intent eval đã đạt 31/07; chưa được đánh ✅ vì chưa có golden B1-B2 để so field-accuracy |
| **D18c** | **Pilot trên GCP:** project `netviet-host-968934832433`, VM `netviet`, stack riêng `/srv/netviet/apps/zalo-ultty`; SSH IAP-only, web/operator public HTTPS dev/demo không auth, Flowise có đăng nhập riêng, backup/monitoring/rollback/soak | Nghiệm thu hạ tầng pilot | ✅ 08/08 — soak mới nhất `soak-20260804T110005Z.tsv`: 1.401 mẫu, failures=0, RAM tối đa 75%, disk tối đa 48%; 5 container healthy, restart=0, OOM=false; endpoint public 200. Runtime đã khóa `CHANNEL_MODE=mock` |
| **D19** | **Mô hình đổi: 5 dự án NỘI BỘ → 5 KHÁCH NGOÀI TRẢ TIỀN.** Kéo theo: DPA từng khách, hồ sơ chuyển dữ liệu xuyên biên giới, cách ly dữ liệu bằng kiến trúc, SLA, on-call, offboarding | Mọi giả định hạ tầng + pháp lý | ✅ 28/07 |
| **D20** | **Ai đứng tên 5 tài khoản Zalo phụ** — bạn hay khách? Nếu bạn đứng tên thì **bạn** là bên vi phạm ToS Zalo và D16 mất phần lớn ý nghĩa | Chạy thật kênh zca | ⬜ |
| **D21** | **ĐO số TIN/ngày thật** trên nhóm khách. Sizing + báo giá hiện dựa trên "10-20 đơn/ngày" nhưng zca đọc **mọi tin** của 200-350 nhóm ⇒ sai 2-3 bậc độ lớn về RAM/disk/hóa đơn LLM | Chốt cỡ máy + báo giá khách | ⬜ |
| **D22** | **Hồ sơ ĐGTĐXLDL + ĐGTĐCDL (Mẫu số 09)** theo Luật 91/2025 + NĐ 356/2025 — 2 điểm chuyển (Singapore + LLM), nộp trong 60 ngày, chế tài tới **5% doanh thu năm liền trước** | Ký hợp đồng khách đầu tiên | ⬜ |
| **D23** | **Đơn vị kinh tế**: giá bán/khách, biên lợi nhuận, điểm hòa vốn. Hiện chỉ biết hạ tầng ~$44/khách/tháng; chưa có chi phí LLM, nhân sự, onboarding (hàng chục giờ công/khách) | Chốt mô hình kinh doanh | ⬜ |
| **D24** | **Ai trực + SLA** khi có 5 khách trả tiền (bus factor hiện = 1). Lưu ý: SLA 99.9% ≈ 43 phút/tháng — kiến trúc 1 droplet/1 vùng **không cam kết nổi** | Ký hợp đồng khách đầu tiên | ⬜ |
| **D25** | **Hai Bot cùng một nhóm:** native @mention Bot Zalo → Bot Platform xử lý/trả lời; không tag → tài khoản zca xử lý/trả lời. Chỉ metadata mention native được tính; nếu không lấy được Bot UID thì zca fail-closed | Kiến trúc kênh hybrid | ✅ user duyệt + code 03/08, **đã deploy pilot 03/08**; còn E2E live trên nhóm test |

### E — Hạ tầng production (chặn chạy 24/7)

| # | Cần gì | TT |
|---|---|---|
| E1 | Máy chủ 24/7 + domain + HTTPS (webhook always-on) — ai cung cấp/trả tiền | 🟡 VM NetViet đã có IP tĩnh + HTTPS public qua `sslip.io`, Basic Auth tách demo/operator và đăng nhập Flowise; official Bot hiện còn dùng long-poll, cần webhook endpoint/secret + kiểm chứng always-on trước production; domain thương hiệu/chi phí dài hạn chưa chốt |
| E2 | Postgres production + lịch sao lưu (managed hay tự host) | 🟡 pilot self-host Postgres, backup GCS 7 ngày + 4 tuần và restore check hai DB đã đạt 31/07; mô hình production vẫn chưa chốt |
| E3 | Ai vận hành hằng ngày sau bàn giao (NetViet managed?) + SLA | ⬜ |
| E4 | Kênh nhận cảnh báo sự cố (bot/kênh chết → báo ai, qua đâu) | ⬜ |

### F — Tài khoản & chi phí

| # | Cần gì | TT |
|---|---|---|
| F1 | Chủ sở hữu bot Zalo + tài khoản Zalo phụ (zca) production — ai giữ token/SIM | 🟡 secret `zalo-ultty-zalo-bot-token` đã tạo 03/08 (nạp từ `.env` qua `deploy.ps1`) nên hybrid deploy được; **câu hỏi quản trị "ai giữ token/SIM" vẫn chưa chốt** |
| F2 | Ai add bot/tài khoản phụ vào ~200 nhóm, theo đợt nào (khớp A4) | ⬜ |
| F3 | Gói Zalo Bot Premium nếu cần (giới hạn nhóm/rate limit — hỏi Zalo) | ⬜ |
| F4 | Tài khoản + ngân sách LLM API (ai trả, hạn mức/tháng) | ⬜ |

### G — AI/LLM production

| # | Cần gì | TT |
|---|---|---|
| G1 | Chốt model qua bake-off trên B1-B2 (demo tạm DeepSeek 35/35) | ⬜ |
| G2 | Quyền gửi dữ liệu cá nhân (SĐT/địa chỉ đơn TH2) sang LLM — tối thiểu hóa. ⚠️ **Cơ sở pháp lý đã đổi**: NĐ 13/2023 **hết hiệu lực**, nay là **Luật 91/2025/QH15 + NĐ 356/2025** (từ 01/01/2026) | ⬜ |

### H — Chặn kỹ thuật trước khi bán dịch vụ (phát hiện 28/07/2026, đã xác minh trong code)

| # | Vấn đề | Bằng chứng | TT |
|---|---|---|---|
| **H1** | Mất tin khi LLM lỗi | `MessageGuard` + `processWithRetry`: lưu tin thô trước xử lý, tối đa 3 lượt, chỉ đánh dấu xong khi thành công | ✅ 28/07 |
| **H2** | API trước đây không xác thực | `ApiKeyGuard` toàn cục; production bắt buộc `API_KEY`; gateway nội bộ tự gắn header, chỉ bind loopback | ✅ 28/07 |
| **H3** | Cách ly nhiều khách | v1 dùng **mỗi dự án một Compose project, DB/user/secret/volume/network riêng**; vì không chia DB nên chưa cần `tenantId`. Nếu chuyển sang DB dùng chung phải mở lại quyết định này | ✅ cho kiến trúc pilot 31/07 |
| **H4** | Đóng gói/vận hành production | CI lint/typecheck/test/build, image theo git SHA+digest, Compose, Secret Manager, backup/restore, Ops Agent, health/restart/RAM/disk alert đã có. Heartbeat zca vẫn cần trước pilot nhóm thật | 🟡 pilot mock đạt phạm vi; zca thật còn treo |

### Gợi ý cách hỏi hiệu quả

1. Gửi khách **đúng 1 email/tin Zalo** kèm bảng A+B (đính file Excel mẫu cho A4, B1-B2 để Sale điền thẳng) — tránh hỏi rải rác.
2. Đề xuất **1 buổi call 30-45 phút với chị Phương** đi qua A3 (chính sách) + B4 (viết tắt) — hỏi miệng nhanh hơn chờ điền form.
3. B1-B2: hướng dẫn Sale mở 10 nhóm gần nhất có đơn → copy tin + chụp đơn KiotViet tương ứng — ~1 giờ đủ 20-30 cặp.
4. Nhấn mạnh: **A + B là điều kiện bật AI thật** ("chuẩn hóa nguồn sự thật trước khi bật AI" — NetViet §1).

---

## 5. Việc nội bộ đang treo (không phải quyết định của khách)

| Việc | Ghi chú |
|---|---|
| Đưa nhánh đã duyệt vào `main` | Chỉ làm sau khi pilot hạ tầng/soak đạt; không còn nhánh console riêng cần merge |
| KiotViet: làm `KiotVietExcelAdapter` ngay hay chờ xác nhận API (C1) | Khảo sát ghi "chưa có API" |
| Regen 3 PDF lãnh đạo (`docs/pdf/`) theo bộ tài liệu mới 11/07 | Cần mạng (mermaid CDN); lệnh trong `docs/pdf/src/README.md` |
| ~~**Việc kế tiếp đề xuất #1 (11/07):** soạn **mẫu file Excel A4** gửi khách điền~~ | ✅ **13/07/2026** — `docs/khach-hang/ultty/trao-doi/A4_dai-ly_map-nhom_U-Ultty.xlsx` (generator `tools/excel-template/generate_a4_template.py` + README bảng map cột→field). **Gửi chị Phương điền** rồi build importer đọc lại (cổng A4) |
| **Việc kế tiếp đề xuất #2 (11/07):** ghi **`kpi_events`** (message_received · order_created · approved/rejected · sửa field) | Phase 5 phần KHÔNG cần dữ liệu khách; model có sẵn chưa ghi — nền cho dashboard F3 ([nen-tang.md §3](nen-tang.md)) |
| Worktree cũ `.claude/worktrees/cool-maxwell-2f02b3/` | Được loại khỏi phạm vi lint; không xóa dữ liệu người dùng |

---

## 6. Chuyển đổi Dify → Flowise và pilot GCP (28-31/07/2026)

**Mốc nền trước chuyển đổi:**

| Commit | Nội dung |
|---|---|
| `6a69b27` | **H1 mất tin nhắn** — `MessageGuard` + `processWithRetry` dùng chung cho `ZcaListener`/`BotPoller`: chỉ đánh dấu khi pipeline **thành công**, thử lại 2 lần, hết lượt thì log ERROR kèm id. **H2 xác thực** — `ApiKeyGuard` toàn cục + `@Public` cho `/health`; `API_KEY` trống = guard mở (demo/CI/HF nguyên vẹn), `NODE_ENV=production` **bắt buộc** có key nếu không fail fast. Test 148 → 166 (api), 33 → 37 (shared) |
| `3cfd364` | Căn cứ pháp lý: NĐ 13/2023 hết hiệu lực → **Luật 91/2025/QH15 + NĐ 356/2025** (7 chỗ / 5 file) |
| `a2a8c3c` | Sửa cùng căn cứ trong nguồn PDF bàn giao lãnh đạo |

**Mốc triển khai Flowise/GCP:**

| Commit | Nội dung |
|---|---|
| `6f62307` | Tích hợp `FlowiseParser`, workflow versioned, test/contract/eval, stack private GCP, backup/restore/health/soak và tài liệu vận hành |
| `8725b52` | Image runtime đã triển khai sau khi hoàn thiện reconcile database, bootstrap Flowise và readiness gate |
| `1f384f1` | Monitoring idempotent qua API, gồm log metric, email channel và ba alert policy |
| `8d2d5fd` | Runtime public: `CHANNEL_MODE=zca`, trang đăng nhập QR + allowlist nhóm, Caddy HTTPS/auth và smoke pre-login an toàn |

**Spike cũ:** VM trong project `ultty-flowise-spike-2607` đã xóa; project giữ 0 VM/đĩa. Số đo Flowise 3.1.2 lúc rảnh là 558 MB; đây chỉ là dữ liệu lịch sử sizing, không phải bản pilot.

### D18a — quyết định + spike

- Bỏ hướng Flowise gọi ngược `/internal/*`. NestJS vẫn là orchestrator và nguồn sự thật.
- Luồng chính thức: `Zalo/Mock → lưu tin thô → FlowiseParser → Agentflow V2 → parseResultSchema → rules TypeScript → SSE/Sale duyệt`.
- Flowise không được tính giá/VAT/ship/COD/chính sách, ghi DB, gọi MCP/tool hay tự gửi Zalo.
- Giấy phép: core ngoài `enterprise/` là Apache 2.0; một số phần enterprise chịu giấy phép thương mại theo [LICENSE chính thức](https://github.com/FlowiseAI/Flowise/blob/main/LICENSE.md). Không mô tả toàn bộ Flowise là Apache 2.0.

### D18b — runtime đã cài đặt, còn cổng nghiệm thu dữ liệu

- `PARSER_MODE=flowise` fail-fast với `FLOWISE_BASE_URL`, `FLOWISE_FLOW_ID`, `FLOWISE_API_KEY`, `FLOWISE_TIMEOUT_MS`.
- `FlowiseParser` chỉ nhận `response.json`, validate lại bằng schema dùng chung; timeout/401/404/429/5xx/schema sai đều ném lỗi để ingest retry tối đa 3 lượt.
- Workflow `zalo-order-parser-v1` là artifact đã bỏ credential: Start form → một LLM structured output → kết thúc; không memory/tool/code/MCP/HTTP callback.
- Flowise khóa bản [3.1.4](https://github.com/FlowiseAI/Flowise/releases/tag/flowise%403.1.4) bằng image digest. Image dẫn xuất có patch source-guarded để gửi `thinking:{type:"disabled"}` cho DeepSeek V4 và expose structured output Agentflow tại `response.json`.
- Contract thật đạt: import idempotent, prediction key chặn request thiếu/sai key, output qua `parseResultSchema`, đúng một LLM call.
- Eval Flowise trên bộ hiện có: **35/35 intent = 100%**, ngang baseline DeepSeek trực tiếp. Bộ hiện có chưa có golden field; vì vậy D18b chưa được đánh ✅ trước B1-B2.

### D18c — pilot `netviet`

- Project `netviet-host-968934832433` (`NetViet Host`), VM đúng tên `netviet`, `asia-southeast1-b`, `e2-standard-2`, Ubuntu 24.04, đĩa balanced 80 GB.
- SSH vẫn chỉ qua IAP. Caddy public duy nhất cổng 80/443: demo/operator đang ở chế độ dev/demo không auth; Flowise dùng đăng nhập riêng. API thô, PostgreSQL, `127.0.0.1:8080` và Flowise thô `127.0.0.1:3002` không public. Chỉ giữ cấu hình này khi `CHANNEL_MODE=mock` và không có PII thật.
- Stack Zalo tách riêng ở `/srv/netviet/apps/zalo-ultty`, Compose project `zalo-ultty`; DB user/password/volume/network riêng cho Zalo và Flowise.
- Runtime app từ commit `8d2d5fd`, digest `sha256:2d0ea92b…`; Flowise dẫn xuất digest `sha256:8e03db16…`. Image được đẩy Artifact Registry và deploy bằng digest; secret ở Secret Manager.
- Contract Flowise và smoke pre-login đạt; SSE có đủ 6 vai/đúng 1 LLM call, draft còn nguyên sau restart API. Operator đã đăng nhập và chọn đúng hai nhóm test; bản sửa dùng group ID cấu hình đã deploy, còn cần xác nhận lại thao tác duyệt/gửi thành công.
- Backup hai DB đã tải lên GCS và restore check độc lập đạt. Cloud Ops Agent, health/backup timer, log metric, email channel và alert health/restart/RAM/disk đều active.
- Diễn tập rollback sang image trước + `PARSER_MODE=deepseek` đạt E2E; sau đó khôi phục digest hiện tại + `flowise` và E2E lại đạt.
- Soak gần nhất kết thúc **PASS 05/08/2026**: báo cáo GCS `soak/soak-20260804T110005Z.tsv` có 1.401 mẫu, `failures=0`, RAM tối đa 75%, disk tối đa 48%. `netviet-soak.service` có `Result=success`; tại lần kiểm tra 08/08, cả 5 container healthy, restart=0, OOM=false, RAM hiện dùng 20%, disk 49%, các endpoint demo/operator/Flowise đều HTTP 200.
- Pilot chỉ dùng dữ liệu TEST với `CHANNEL_MODE=mock`, `PARSER_MODE=flowise`, DeepSeek và `AUTO_SEND=off`. Bot Platform/zca đều bị vô hiệu hóa; không dùng PII thật.

**Cổng còn lại ngoài D18c:** nhận B1-B2 để đo field-accuracy cho D18b; D21 vẫn cần trước sizing 200-350 nhóm thật. Việc bật lại Bot/zca là quyết định vận hành riêng, không nằm trong nghiệm thu hạ tầng D18c.
