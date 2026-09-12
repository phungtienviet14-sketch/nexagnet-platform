# ỨNG DỤNG LÁI XE — chọn nền tảng, và cái phải nói ra trước khi hứa

> Lane B của #235 (B3/B4) · sửa đổi `MOBILE_STACK = HOÃN` của R0 trong
> [transport-domain-v2.md §3.4](transport-domain-v2.md) · đo ngày **08/09/2026**.

## 0. Phán quyết một dòng

**React Native + Expo (dev build, không phải Expo Go)** cho ứng dụng lái xe — nhưng **quyết định
đó không phải phần đắt nhất của tài liệu này**. Phần đắt là §3: hai ràng buộc bên ngoài đã thay
đổi kể từ R0 và cả hai đều **chặn đường phát hành**, không phải đường viết mã.

R0 để `MOBILE_STACK = HOÃN, có điều kiện` vì nó treo vào `Q-02` (có lấy được dữ liệu GSHT không).
Chủ sở hữu đã gỡ điều kiện đó: _"Phone/mobile path phải được làm"_, và GSHT là **nguồn đối chiếu
độc lập về sau**, không phải vật thay thế. Nên câu hỏi không còn là _có làm không_ mà là _làm bằng
gì_.

---

## 1. Chấm ba ứng viên theo đúng những gì hệ này cần

Trọng số lấy từ #235 B3, không phải từ sở thích.

| Tiêu chí                                  | React Native + Expo                  | Flutter                    | Native Kotlin + Swift        |
| ----------------------------------------- | ------------------------------------ | -------------------------- | ---------------------------- |
| **Định vị nền tin cậy trên OEM Việt Nam** | ⚠️ phải mua SDK đóng                 | ⚠️ **cùng SDK, cùng giá**  | ✅ tự viết được, tốn người   |
| **Dùng chung lược đồ với NestJS**         | ✅ **cùng TypeScript + zod**         | ❌ Dart, phải sinh mã      | ❌ hai lần, hai ngôn ngữ     |
| Camera trong ứng dụng                     | ✅ `expo-camera`                     | ✅ `camera`                | ✅                           |
| Hàng đợi ngoại tuyến                      | ✅ `expo-sqlite` (chính chủ)         | ✅ `sqflite`               | ✅                           |
| Play Integrity + App Attest               | ⚠️ `@expo/app-integrity` còn _alpha_ | ⚠️ phải viết module native | ✅ trực tiếp                 |
| Một đội bảo trì được                      | ✅ cùng ngôn ngữ với backend         | ⚠️ thêm một hệ sinh thái   | ❌ hai nền tảng, hai kỹ năng |
| Khách tự dựng máy chủ (#224)              | ✅ không ràng buộc gì                | ✅                         | ✅                           |

**Điểm quyết định là dòng thứ hai, không phải dòng đầu.** Ba việc mà #235 liệt kê — hàng đợi
ngoại tuyến idempotent, `capturedAt` ⟂ `receivedAt`, lược đồ sự kiện khớp máy chủ — đều là **hợp
đồng dữ liệu**. Với React Native, `proof.schemas.ts` mà API đang dùng là **cùng một tệp zod** mà
ứng dụng import; sai lệch giữa hai đầu trở thành lỗi biên dịch. Với Dart hay Kotlin, cùng hợp đồng
đó phải được **chép tay hoặc sinh mã**, và mọi sai lệch chỉ lộ ra lúc chạy — ở đúng chỗ mà lỗi
đắt nhất: một bản định vị đã mất sóng đang gửi lại.

Dòng đầu bảng **không phân biệt được ai** (§2), nên nó không nên quyết định gì.

---

## 2. Định vị nền không phải là lý do để chọn nền tảng

R0 đã ghi và đo lại vẫn đúng: bám vị trí nền **đáng tin** trên Xiaomi/Oppo/Vivo/Samsung trên thực
tế phải mua SDK đóng của Transistor Software — **399–999 USD/ứng dụng**. Điều R0 nói và cần được
nhắc lại vì nó hay bị bỏ qua: `flutter_background_geolocation` và
`react-native-background-geolocation` là **cùng một sản phẩm của cùng một hãng**. Chọn Flutter
không tránh được khoản đó.

**Kiểm lại một lối thoát, và nó không đứng vững.** Có bài viết lan truyền giới thiệu "Tracelet" như
một bản thay thế Apache-2.0 miễn phí. Tra sổ đăng ký npm: gói `tracelet` mới nhất **0.2.1**, giấy
phép MIT, **không khai trường `repository`**, lần sửa cuối **28/04/2026**; `@rapide-om/expo-tracelet`
là **0.1.5**. Đó không phải hình dạng của một SDK định vị nền đã sẵn sàng cho sản xuất, và không
có bằng chứng nào cho các con số hiệu năng bài viết đưa ra. **Không dùng.**

⇒ Khoản 399–999 USD là **có thật và không tránh được bằng cách chọn nền tảng**. Nó là một khoản
mua sắm cần chủ sở hữu duyệt (#232 §8 không cho phép tự mua), nên nó nằm trong `OPEN_BLOCKERS`
chứ không nằm trong một PR.

---

## 3. Hai ràng buộc bên ngoài đã đổi kể từ R0

Đây là phần có giá trị nhất của tài liệu này, và cả hai đều **chặn phát hành chứ không chặn viết mã**.

### `M-01` — Google Play đã **bỏ hàng rào địa lý** khỏi danh sách lý do được duyệt cho foreground service, **26/08/2026**

R0 ghi mốc _"công cụ khai báo 11/2026, hạn tuân thủ 27/01/2027"_ — hai mốc đó vẫn đúng. Cái R0
**chưa có** là: kể từ **26/08/2026**, _geofencing_ đã bị gỡ khỏi các trường hợp được chấp nhận cho
`foregroundServiceType=location`.

Hệ quả trực tiếp cho thiết kế: bản khai của ứng dụng này **không được viện dẫn "hàng rào địa lý"**.
Nó phải được đóng gói theo mẫu mà Google có liệt kê — theo dõi tài sản/đội xe trong lúc một ca làm
đang chạy — và điều đó khớp với thiết kế máy chủ đã có: phiên bám vị trí **chỉ mở khi một chuyến
đang chạy** và đóng khi ca kết thúc. Một ứng dụng bám vị trí 24/7 sẽ không qua được cửa này, và
kiến trúc hiện tại **cố ý không làm thế**.

### `M-02` — tài khoản nhà phát triển cá nhân mới phải qua **14 ngày thử nghiệm đóng với ≥12 người thử**

R0 nói đúng rằng Play Integrity **không đòi niêm yết công khai** (`setCloudProjectNumber` cho ứng
dụng chưa liên kết Play; closed testing là đường phát hành nội bộ chính thức). Cái R0 chưa nói là
**giá vào cửa của closed testing** với một tài khoản cá nhân mới: 14 ngày liên tục, tối thiểu 12
người thử hoạt động.

Với một đội 10–20 xe, **12 người thử là một ràng buộc thật**, và 14 ngày là một khoảng lịch không
lập trình viên nào rút ngắn được. Đây là lý do phải nói ra **trước** khi hứa mốc thời gian, không
phải sau.

> Cả hai mục trên **không chặn** phần máy chủ, phần miền, hay một bản cài tay (sideload) để chạy
> thử nội bộ. Chúng chặn **phát hành qua Play** và **trục thiết bị của Play Integrity**.

---

## 4. Toàn vẹn thiết bị: một thang, không phải một cổng

Đã dựng sẵn ở máy chủ (`transport-proof`): `TransportDeviceIntegrityVerdict` =
`UNKNOWN | UNVERIFIED | BASIC | STRONG`, và **`UNKNOWN` không sinh cờ nào**.

Lý do tách `UNKNOWN` khỏi `UNVERIFIED`: cái đầu là _"chưa hỏi"_ (bản web, bản cài tay nội bộ, máy
không có Play Services), cái sau là _"đã hỏi, không chứng minh được"_. Gộp lại sẽ làm một chiếc
điện thoại bình thường của một lái xe trông y hệt một máy đã bị can thiệp — và danh sách cần xem
sẽ dài toàn người làm đúng.

Nhắc lại giới hạn, vì nó là điều kiện của cả tầng: `Location.isMock()` chỉ bắt đường giả lập **đã
đăng ký**; các module LSPosed đang phát hành công khai ép chính hàm đó trả `false`. App Attest
**không** phát hiện jailbreak và **không** nói gì về vị trí. Giả mạo ở tầng vô tuyến không để lại
một dấu vết phần mềm nào. **Không bao giờ tuyên bố chống được GPS giả** (#229 §4).

Đối chiếu chéo tốt nhất không nằm trên điện thoại — nó nằm ở hộp GSHT hợp quy đã gắn trên xe. Đó
là lý do `VehicleTelematicsPort` và `crossCheckTracks` được làm **trước** ứng dụng.

---

## 5. Hình dạng ứng dụng, khớp với hợp đồng máy chủ đã có

```text
Đăng nhập lái xe            -> phiên, và CHỈ phiên: không màn hình nào nhận driverId
Chuyến được phân công       -> GET /transport/me/trips
Bắt đầu                     -> POST /transport/me/tracking/sessions   (bắt buộc có vị trí)
Đang chạy                   -> POST .../observations   (LÔ, mỗi phần tử một clientEventId)
Giao hàng                   -> vị trí hiện tại + ảnh chụp TRONG ứng dụng
Kết thúc ca                 -> POST .../sessions/:id/close
```

**Hàng đợi ngoại tuyến** trên `expo-sqlite`: mỗi sự kiện mang một `clientEventId` do máy khách
sinh; gửi lại đúng nội dung trả về bản cũ, gửi lại **khác** nội dung là một va chạm ồn ào. Máy chủ
đã cưỡng chế điều đó bằng chỉ mục, nên ứng dụng chỉ cần **không xoá hàng khỏi hàng đợi trước khi
máy chủ xác nhận**.

**`capturedAt` ⟂ `receivedAt`**: ứng dụng gửi `capturedAt` của nó và **không** cố sửa cho khớp máy
chủ. Lệch lớn được ghi và gắn cờ, không bị từ chối — vì với hàng đợi ngoại tuyến, lệch lớn gần như
luôn là _"máy vừa offline bốn tiếng"_.

**Ảnh: chụp trong ứng dụng ≠ chọn từ thư viện.** Máy chủ đã có sẵn hai mã rủi ro
(`PHOTO_FROM_GALLERY`, `PHOTO_MISSING`) trong enum; ứng dụng phải nói **thật** đường nào đã được
dùng. Một ứng dụng khai "chụp tại chỗ" cho một ảnh lấy từ thư viện là một lời nói dối mà máy chủ
không thể tự phát hiện — nên đây là một ranh giới trung thực, không phải một biện pháp an ninh.

---

## 5b. Hàng đợi ngoại tuyến **đã được viết** — `@netviet/driver-outbox`

Phần khó nhất của một ứng dụng ngoại tuyến không cần một chiếc điện thoại để viết đúng, và cũng
không cần một chiếc điện thoại để **chứng minh** là đúng. Nên nó được viết trước, thành một gói
riêng, **không phụ thuộc gì** (nạp được từ React Native, nơi không có `node:*`):

| Bất biến                                                                                      | Cách hỏng nếu thiếu                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capturedAt` đóng băng lúc bấm                                                                | Một bản định vị ghi 14:00 gửi được 18:00 sẽ mang nhãn 18:00 ⇒ máy chủ tính quãng đường/tốc độ/liên tục trên một đường đi **không tồn tại**, và **không báo lỗi** |
| `clientEventId` sinh một lần, giữ qua mọi lần gửi lại                                         | Máy chủ — đúng theo hợp đồng của nó — coi mỗi lần thử lại là một sự kiện MỚI và ghi thêm hàng                                                                    |
| Mục bị từ chối **vĩnh viễn** sang `BLOCKED`, không thử lại                                    | Một yêu cầu sai hình dạng chặn cả hàng đợi phía sau; cả ngày làm việc không có gì lên được máy chủ                                                               |
| Lô bị chặn trên ở `maxBatchSize` (mặc định **200**, đúng trần `reportObservationBatchSchema`) | Sau bốn tiếng mất sóng, lần nối lại đầu tiên là một yêu cầu vài nghìn phần tử và bị từ chối cả lô                                                                |
| Ảnh giữ **tham chiếu tệp**, không giữ byte                                                    | 30 lần giao × 3 ảnh 4 MB = 360 MB nằm trong một bảng SQLite                                                                                                      |
| Thiếu kết cục từ máy chủ ⇒ coi là **thử lại**                                                 | Giả sử "đã nhận" cho phần thiếu làm **mất bằng chứng vĩnh viễn** — hướng sai duy nhất không sửa được                                                             |

`OutboxStore` là một **giao diện**; bản trong bộ nhớ là hiện thực tham chiếu mà bản `expo-sqlite`
phải khớp, và 18 bài test chạy trên nó nên cái phải đạt không còn là một đoạn văn trong tài liệu.

**Cái gói này không chứng minh:** rằng bám vị trí nền chạy được trên một máy Android thật. Đó là
một phép đo khác, cần một thiết bị, và nó **chưa được làm** — xem §6.

---

## 6. Cái tài liệu này **không** khẳng định

- Rằng ứng dụng đã được viết. Chưa — mới có **hàng đợi ngoại tuyến** (§5b) và hợp đồng máy chủ.
  Màn hình, quyền hệ điều hành, dịch vụ nền và đóng gói phát hành đều chưa có.
- Rằng có thể phát hành qua Play trong tháng này — xem `M-02`.
- Rằng bám vị trí nền sẽ đáng tin mà không mua SDK — xem §2.
- Rằng có thiết bị Android thật để chứng minh. Máy dựng hiện tại **không có** máy Android nào cắm
  vào (không có adb/MTP, không có Android SDK). Đó là một chặn **bên ngoài**, và theo #235 nó
  không được chặn phần máy chủ.

---

## 7. Bám vị trí nền: **RESEARCHED / NOT DEVICE-PROVEN** (`#297 T7`, đo 12/09/2026)

Mục §2 trả lời _"chọn nền tảng nào"_. Mục này trả lời câu khác và hẹp hơn: **hệ điều hành cho phép
biết vị trí một chiếc xe liên tục đến mức nào, và cần bằng chứng gì để nói rằng ta làm được.**

Ma trận đầy đủ (Android · iOS · 8 thư viện, mọi khẳng định kèm URL nguồn chính thức) nằm ở
[`#297` comment T0.11](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/297#issuecomment-5645213792).
Không sao lại vào đây — dưới đây chỉ là những điều **đổi quyết định**.

### 7.1 Trần của hệ điều hành, không phải trần của thư viện

- **iOS: không thư viện nào — miễn phí hay 999 USD — cho vị trí liên tục sau khi người dùng
  _terminate_ ứng dụng.** Apple ghi thẳng: _"If your app is terminated, the delivery of new location
  events stops altogether"_. Thứ **có** đánh thức lại ứng dụng là loại thô: significant-change
  ~**500 m** và _"not… more frequently than once every five minutes"_.
  ⇒ Một yêu cầu kiểu _"biết xe ở đâu mỗi 30 giây kể cả khi lái xe tắt hẳn ứng dụng"_ là
  **không thoả được trên iOS ở bất kỳ giá nào**. Nó phải được đàm phán lại thành _"phục hồi thô +
  một khoảng trống phát hiện được"_.
- **Android: ba chế độ chết mà Google KHÔNG tài liệu hoá cách giảm thiểu** — Task Manager "Stop"
  (Android 13+, _"doesn't send your app any callbacks"_), force-stop (Android 15 huỷ mọi pending
  intent, chỉ hết khi **chính người dùng** mở lại ứng dụng), và các trình quản lý pin của OEM
  (AOSP: _"Device implementers can continue to use their custom methods"_).
- **Android 14+ bắt buộc** `foregroundServiceType="location"` + `FOREGROUND_SERVICE_LOCATION`;
  **Android 11+** không còn nút "Allow all the time" trong hộp thoại — phải đưa người dùng sang
  trang cài đặt, và một yêu cầu gộp foreground+background bị **bỏ lặng lẽ**.
- **Android 16 / API 36** áp hạn mức thời gian chạy cho job khởi từ foreground service, nên thiết kế
  _"thu trong FGS → tải lên bằng WorkManager"_ bị ảnh hưởng trực tiếp.

### 7.2 Một cái bẫy kiểm toán về giấy phép

`react-native-background-geolocation` có tệp `LICENSE` **là MIT nguyên văn** và npm khai
`license: MIT`, nhưng SDK native đi kèm là **nhị phân dựng sẵn, chặn bằng khoá**: miễn phí ở
`DEBUG`, **399–999 USD** cho `RELEASE`. ⇒ Một máy quét SPDX đọc tệp `LICENSE` hoặc trường npm sẽ
**kết luận sai rằng nó miễn phí**. Ghi lại ở đây vì đó là loại sai không ai bắt được khi review PR.

### 7.3 Vị thế của Lane T, và vì sao

| Lối                                     | Dựng được hôm nay?                                | Chặn                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Giữ mobile-web, nói thẳng `LOST`** | **CÓ — không cần dựng gì mới**                    | Không có chặn kỹ thuật. Giá phải trả là độ phủ trung thực: điện thoại khoá màn hình thì mọi khoảng đó đọc là `LOST`. Đó là **quyết định sản phẩm cần chấp nhận, không phải lỗi cần che**                                                                                                                                    |
| 2. Native Android-first                 | Không                                             | **Không có máy Android nào được đăng ký, không có môi trường ký/phát hành.** Một FGS chưa từng chạy trên máy thật **không phải bằng chứng** về tính liên tục — đúng những chế độ chết ở §7.1 chỉ hiện trên phần cứng                                                                                                        |
| 3. Vỏ cross-platform (Capacitor/Expo)   | Không                                             | Cùng một chặn máy + ký, **cộng một chặn riêng**: khẳng định "sống sót sau terminate" của plugin là **lời của nhà cung cấp mà ta không kiểm được**, và nó sẽ nằm trên đường tới hạn của đối soát. Plugin miễn phí gần nhất tự ghi _"no on-disk queue and no automatic retry… points are not persisted across process death"_ |
| **4. Hộp GSHT trên xe**                 | Một phần — **cổng `VehicleTelematicsPort` đã có** | Là phụ thuộc **tích hợp và thương mại**, không phải bài toán chứng minh trên thiết bị. Lợi thế quyết định: **nó không chịu một ràng buộc nào ở §7.1** — không force-stop, không hibernate, không mất quyền, không bị Apple/Google duyệt                                                                                     |

⇒ **Vị thế: Lối 1 (nói thẳng `LOST`), với Lối 4 làm nguồn liên tục ở những xe có lắp hộp.** Đó
chính là lý do tầng máy chủ phân biệt `LIVE` ⟂ `DEGRADED` ⟂ `LOST` ⟂ `SOURCE_FALLBACK` thay vì
nội suy cho liền mạch (`apps/api/src/transport/proof/location-health.ts`).

### 7.4 Cần đúng 6 hiện vật này để nâng lên **PROVEN**

1. Một bản dựng **đã ký** cài trên **≥2 máy Android thật của 2 hãng khác nhau** (một gần AOSP, một
   có trình quản lý pin hung hãn), đang chạy `location` foreground service.
2. Một lần chạy liên tục **ghi lại theo từng máy**: tắt màn hình · chuyển nền · gạt khỏi recents ·
   khởi động lại máy — kèm **dấu thời gian nhận ở máy chủ** cho biết điểm còn về không, và bao lâu.
3. Một lần **force-stop** cho thấy khoảng trống được **phát hiện và báo `LOST`**, không nội suy;
   quan sát `ApplicationStartInfo.wasForceStopped()` ở lần mở kế tiếp.
4. Một lần chạy **mất mạng** chứng minh điểm đệm trong lúc mất mạng **đến được sau đó** — đúng thứ
   các plugin miễn phí **không** cung cấp.
5. Trên iOS: một lần **terminate rồi di chuyển**, **đo** khoảng cách và độ trễ phục hồi thật so với
   sàn ~500 m / ≥5 phút.
6. **Cả hai** khai báo Play đã qua duyệt (background location + loại FGS `location`, kèm **video
   minh hoạ**) — một bản dựng không phát hành được thì không phải một năng lực đã chứng minh.

Trước khi có đủ 1–6, mọi câu _"ứng dụng chạy nền được"_ trong tài liệu hay báo cáo phải viết là
**RESEARCHED / NOT DEVICE-PROVEN**, và §6 ở trên vẫn nguyên giá trị.
