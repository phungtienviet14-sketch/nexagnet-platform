# NỀN ĐỊA KHÔNG GIAN CHO TRANSPORT v2 — quyết định có số đo

> Lane B của #235 · sửa đổi phán quyết `POSTGIS` của R0 trong
> [transport-domain-v2.md §3.1](transport-domain-v2.md) · đo ngày **07/09/2026** trên
> `main = 669bfef61ba5baf2125ef41e064e29d5158e3c57`.

## 0. Phán quyết một dòng

**KHÔNG thêm PostGIS bây giờ.** Lưu toạ độ bằng hai cột `double precision` và đánh chỉ mục bằng
`cube` + `earthdistance` — hai extension **đã nằm sẵn trong mọi bản Postgres tiêu chuẩn**, kể cả
image `postgres:16-alpine` mà CI và `deploy/netviet/compose.yaml` đang chạy. Đo được: ở mọi quy mô
đã thử, bốn dạng truy vấn mà Lane B thật sự cần chạy **ngang nhau** trên hai đường, với **cùng một
dung lượng đĩa**.

PostGIS vẫn là câu trả lời đúng cho những việc Lane B **chưa** làm — hàng rào đa giác, lưu tuyến
`LINESTRING`, `ST_Simplify`, bản đồ nhiệt. Đường nâng cấp được giữ mở và chỉ cộng thêm (§6).

---

## 1. Ba điều R0 nói mà số đo không xác nhận

### `G-01` — `postgis/postgis:16-3.6` **không tồn tại**

R0 §3.1 ghi *"đổi image `postgres:16` → `postgis/postgis:16-3.6`"*. Liệt kê tag thật trên Docker
Hub (07/09/2026): mọi tag PostGIS **3.6** đều dựng trên **PG 17, 18 hoặc 19beta** —
`18-3.6`, `17-3.6-alpine`, `19beta1-3.6`, … **Không có `16-3.6`.** Bản mới nhất cho PG16 là
**`16-3.5`** / `16-3.5-alpine`.

Sai lệch này không phải chuyện chữ nghĩa: một lệnh `docker pull postgis/postgis:16-3.6` trong một
runbook sẽ **hỏng lúc triển khai**, và nó hỏng ở đúng bước mà cơ sở dữ liệu của khách đang dừng.

### `G-02` — ước lượng dung lượng của R0 thấp hơn thực đo khoảng **2 lần**

R0 §5 ước *"30 giây × 50 xe × 1 năm ≈ 2,4 GB dữ liệu bảng, cộng chỉ mục"*. Phần **heap** thì R0
ước đúng (90–110 byte/hàng; đo được 84,5 B/hàng cho cột `double precision`, 101 B/hàng cho
`geography`). Cái bị bỏ sót là **chỉ mục lớn gần bằng heap**. Tổng thực đo:
**228 byte/hàng** — nên con số phải là **≈ 5,0 GB**, không phải 2,4 GB.

### `G-03` — `earthdistance` **không** bị khai tử

Giả thiết dễ mắc (và tôi đã mắc trước khi kiểm) là `earthdistance` đã bị đánh dấu lỗi thời để đẩy
sang PostGIS. Đọc thẳng tài liệu: trang `earthdistance` của **PG 18** và của **nhánh phát triển
(PG 19)** đều **không có** một dòng khai tử, lỗi thời hay dự kiến gỡ bỏ nào. Điều tài liệu có nói
là mô hình của nó: *"the Earth is assumed to be perfectly spherical"* — tức hình cầu, không phải
ellipsoid, và gợi ý PostGIS **nếu độ chính xác đó chưa đủ**. §3 đo xem "đủ" là bao nhiêu.

---

## 2. Số đo

Hai container trên cùng một máy, cùng dữ liệu tổng hợp trong hành lang Hà Nội–Hải Phòng
(kinh 105,6–107,2 · vĩ 20,5–21,9), cùng lược đồ 7 cột, cùng hai chỉ mục (không gian + `(xe, thời
điểm)`).

- **A** — `postgis/postgis:16-3.5-alpine`, cột `geography(Point,4326)`, chỉ mục **GiST**,
  truy vấn `ST_DWithin`.
- **B** — `postgres:16-alpine` (đúng image CI đang chạy), hai cột `double precision`, chỉ mục
  **GiST trên `ll_to_earth(lat,lon)`**, truy vấn `earth_box(...) @> ... AND earth_distance(...)`.

### 2.1. Dung lượng và thời gian dựng — 4.380.000 hàng

| | A · PostGIS | B · Postgres tiêu chuẩn |
|---|---|---|
| heap | 422 MB | 353 MB |
| chỉ mục không gian | 304 MB | 366 MB |
| chỉ mục `(xe, thời điểm)` | 132 MB | 132 MB |
| **tổng** | **952 MB** | **944 MB** |
| **byte/hàng** | **228** | **226** |
| nạp 4,38 M hàng | 102,5 s | 81,1 s |
| dựng chỉ mục không gian | **145,3 s** | **435,9 s** |
| image | 724 MB | **420 MB** |

Hai điều đáng nhớ: **dung lượng bằng nhau** (chênh 0,8%), và **PostGIS dựng chỉ mục nhanh gấp 3
lần**. Cái thứ hai là lợi thế thật của PostGIS, nhưng nó chỉ trả giá một lần lúc `REINDEX`, không
phải mỗi ngày.

### 2.1b. Cái quyết định cho #224: gói phần mềm phải cài thêm

Đây là chỗ hai đường **không** ngang nhau, và nó là lý do thật của phán quyết:

| | Trên image `postgres:16-alpine` | Trên Ubuntu 24.04 của khách |
|---|---|---|
| `cube` + `earthdistance` | **có sẵn** (đã kiểm bằng `pg_available_extensions` trong container) | **có sẵn** — `earthdistance.control` nằm ngay trong gói `postgresql-16`, không phải một gói contrib riêng |
| PostGIS | **không có** — phải đổi image | phải `apt install postgresql-16-postgis-3` |

Nói cách khác: đường `cube`/`earthdistance` chạy được trên một PostgreSQL **cài mặc định** mà không
thêm một gói nào. Với mục tiêu "máy chủ của khách" ở #224, khác biệt đó lớn hơn mọi con số mili giây
trong bảng trên. Và nó cũng là lý do CI hiện tại chạy được ngay: hai job `integration` và
`workflow-integration` đang dùng đúng image `postgres:16-alpine` này.

### 2.2. Bốn truy vấn, hai quy mô

Thời gian thực thi (`EXPLAIN ANALYZE`, lần chạy nóng, mili giây). **Đây là một lần đo trên một máy
Windows/Docker — coi chênh lệch dưới ~2 lần là nhiễu.**

| Truy vấn | A @219k | B @219k | A @4,38M | B @4,38M |
|---|---|---|---|---|
| `Q1` tìm mọi điểm trong bán kính 200 m trên toàn lịch sử | 47,8 | **2,1** | 102,9 | **91,3** |
| `Q1b` cùng việc, **không chỉ mục**, haversine viết tay | — | 172,6 | — | **1 927** |
| `Q2` một điểm ⟂ 50 hàng rào (việc làm lúc nhận tin) | **0,52** | 1,76 | **0,94** | 3,20 |
| `Q3` 5 điểm gần nhất (KNN) | 9,10 | 9,82 | 3,45 | **2,06** |
| `Q4` quét liên tục 1 000 điểm của một xe | **17,1** | 32,5 | 50,8 | **21,4** |

**Đọc bảng này cho đúng:** không cột nào thắng. Cái thắng rõ ràng là **`Q1b` thua** — bỏ chỉ mục
làm truy vấn chậm **21 lần** ở 4,38 M hàng và tệ dần tuyến tính. Nên kết luận không phải "PostGIS
hay không", mà là **"phải có một chỉ mục không gian"** — và Postgres tiêu chuẩn đã có sẵn một cái.

`Q2` là truy vấn **chạy nhiều nhất trong đời hệ thống** (mỗi bản định vị nhận vào đều phải chấm với
tập hàng rào). Ở đó cả hai đều dưới 4 ms, và cả hai đều **không đụng bảng lịch sử** — nên trên thực
tế nó sẽ không chạy trong SQL chút nào: xem §4.

---

## 3. Sai số của mô hình hình cầu có đổi được kết luận nào không

Câu hỏi thật không phải "cái nào chính xác hơn" (PostGIS `geography` chính xác hơn — nó tính trên
ellipsoid WGS84) mà là **"sai số 0,5% có làm đổi một quyết định nào của hệ này không"**:

| Việc | Đại lượng | Sai số mô hình cầu | Đổi kết luận? |
|---|---|---|---|
| Hàng rào kho, bán kính 200 m | 200 m | ±1 m | Không — và sai số **thiết bị** ở đây là 8–80 m, lớn hơn hai bậc |
| Di chuyển bất khả thi, ngưỡng 55 m/s | 55 m/s | ±0,3 m/s | Không |
| Quãng đường một chặng, để người đọc ước lượng | 100 km | ±500 m | Không |
| Đo đạc / ranh giới pháp lý | — | — | **Có** — nhưng đó không phải việc của hệ này |

Sai số của **máy thu GPS trong điện thoại** (8–80 m ngoài trời, hàng trăm mét trong đô thị dày) lớn
hơn sai số **mô hình Trái Đất** hai bậc độ lớn. Chọn ellipsoid để "chính xác hơn" ở đây là làm mịn
một con số mà thứ đứng trước nó đã thô sẵn.

---

## 4. Nên tính hàng rào ở đâu — và vì sao không phải trong SQL

Phán quyết hàng rào **là một quyết định nghiệp vụ**, không phải một truy vấn. Nó phải:

- sinh ra một **mã lý do có kiểu** đi vào sổ quyết định (quy ước `.claude/rules/ecc/common/code-review.md`);
- phân biệt được **`INSIDE` / `OUTSIDE` / `INDETERMINATE`** — xem dưới;
- lặp lại được **y hệt** khi chạy lại, không phụ thuộc phiên bản extension của máy khách.

Nên nó nằm trong TypeScript tất định (`apps/api/src/transport/geo/geofence.ts`), chạy **lúc nhận
tin**, đối chiếu với vài chục hàng rào đang có hiệu lực. Đó là O(số hàng rào), không phải O(lịch
sử) — không cần chỉ mục nào cả. Đây cũng đúng nguyên tắc #5 của `CLAUDE.md`: luật lệ tất định nằm
trong TypeScript, không nằm trong nơi lưu trữ.

Chỉ mục không gian chỉ phục vụ **`Q1`/`Q3`** — tra cứu lịch sử của người điều hành ("xe nào đã qua
đây", "điểm gần nhất"). Đó là tính năng của bảng điều khiển, không phải của luồng quyết định.

### `INDETERMINATE` — phán quyết thứ ba, và lý do nó phải tồn tại

Một bản định vị **không phải một điểm**: nó là một điểm **kèm một bán kính sai số**. Nếu so điểm
với bán kính hàng rào mà bỏ qua sai số thì:

- một xe đứng **đúng trong kho** với tín hiệu kém (sai số 80 m) bị ghi là **ngoài** hàng rào;
- một xe đứng **ngoài đường** với tín hiệu kém bị ghi là **trong** hàng rào.

Cả hai là **kết luận sai được phát ngôn với vẻ chắc chắn tuyệt đối** — thứ nguy hiểm nhất mà một hệ
bằng chứng có thể làm. Nên `assessGeofences()` trả về ba giá trị, và `INDETERMINATE` là câu trả lời
trung thực cho *"hình học không đủ để nói"*.

### Cái bẫy tương tự ở phép kiểm di chuyển bất khả thi

Quãng đường chia thời gian là công thức ai cũng viết được, và nó **sai ngay ngày đầu chạy thật**:
khi xe **đứng yên**, hai bản định vị liên tiếp vẫn lệch nhau vài chục mét do nhiễu. Chia 60 m cho
0,5 giây ra 120 m/s — hệ thống sẽ tố một chiếc xe đang đỗ là "dịch chuyển tức thời", vài phút một
lần, cả ngày. Người trực sẽ tắt hết cảnh báo, và tầng chống gian lận về không.

Cách chữa (`continuity.ts`): **trừ sai số của cả hai bản định vị ra khỏi quãng đường trước khi
chia**. Phần còn lại là phần dịch chuyển mà hình học **không** giải thích được bằng nhiễu.

---

## 5. Khối lượng và lưu giữ — theo 228 byte/hàng đã đo

Số hàng/xe/năm: chỉ-theo-sự-kiện **2 190** · 30 giây × 10 h/ngày **438 000** · 10 giây × 10 h/ngày
**1 314 000**.

| Chế độ | 10 xe | 50 xe | 100 xe |
|---|---|---|---|
| **Chỉ theo sự kiện** (bắt đầu · đổ dầu · giao hàng) | 21,9 k hàng · **5 MB** | 110 k · **25 MB** | 219 k · **50 MB** |
| 30 giây/lần khi đang chạy | 4,38 M · **1,0 GB** | 21,9 M · **5,0 GB** | 43,8 M · **10,0 GB** |
| 10 giây/lần khi đang chạy | 13,1 M · **3,0 GB** | 65,7 M · **15,0 GB** | 131,4 M · **30,0 GB** |

*(đã gồm cả hai chỉ mục; một năm; chưa tính WAL và bản sao lưu)*

### Chính sách lấy mẫu đề nghị

Ba điều kiện phát một điểm khi **và chỉ khi** một chuyến đang chạy:

```text
đã đi >= 500 m kể từ điểm trước        (kích hoạt theo quãng đường)
HOẶC đã 300 giây kể từ điểm trước khi đang di chuyển
HOẶC đã 900 giây kể từ điểm trước khi đứng yên
VÀ   >= 30 giây kể từ điểm trước       (chặn trên, KHÔNG BAO GIỜ phá)
```

Điều quan trọng nhất là **cái chặn dưới 30 giây**, vì nó là thứ **duy nhất** làm chi phí có trần
tính được: dù xe chạy nhanh đến đâu, một xe không bao giờ vượt dòng "30 giây" trong bảng trên. Hai
điều kiện quãng đường/thời gian chỉ **giảm** số hàng so với trần đó — trên đường trường ~90 km/h,
mốc 500 m rơi đúng vào khoảng 20 giây nên chặn dưới sẽ khống chế, còn xe đỗ ở bãi chỉ sinh 4
điểm/giờ.

### Lưu giữ có hạn

Mặc định đề nghị: **90 ngày** ở độ phân giải đầy đủ. Với 100 xe ở chế độ 30 giây, đó là
**≈ 2,5 GB** — nằm gọn trên một VPS của #224. Quá 90 ngày thì giữ lại **bằng chứng** (bắt đầu, đổ
dầu, giao hàng — thứ gắn với một chứng từ tài chính) và bỏ các điểm bám đường.

Đây là điều mà #229 §3 gọi là "không lưu 1 Hz vô thời hạn", và cũng là **tối thiểu hoá dữ liệu** —
một nghĩa vụ kỹ thuật độc lập với việc chủ sở hữu đã xử lý xong phần pháp lý với lái xe (#232 D-02).

---

## 6. Đường nâng cấp lên PostGIS — chỉ cộng thêm, khi có việc cần

Ba việc mà `cube`/`earthdistance` **không** làm được, và nếu một trong ba xuất hiện thì đổi:

| Việc | Vì sao cần PostGIS |
|---|---|
| Hàng rào **đa giác** (khu công nghiệp hình chữ L mà hình tròn trùm cả quốc lộ) | `ST_Covers`; `earthdistance` chỉ có hình cầu và điểm |
| Lưu **tuyến** `LINESTRING` + `ST_Simplify` cho bản đồ | không có kiểu đường trong `cube` |
| Bản đồ nhiệt / gộp không gian cho phân tích | `ST_ClusterDBSCAN` và bạn bè |

Khi đó, các bước — **không đụng một hàng dữ liệu nào**:

1. đổi image sang `postgis/postgis:16-3.5-alpine` (**cùng PGDATA**, cùng volume: image PostGIS
   dựng trên chính image `postgres` chính thức nên không có bước nâng cấp dữ liệu);
2. `CREATE EXTENSION postgis;` — cần quyền superuser, và chỉ thêm kiểu/hàm/`spatial_ref_sys`;
3. thêm **cột sinh** `geography(Point,4326)` từ hai cột `double precision` đã có + chỉ mục GiST;
4. hai cột gốc **ở nguyên** làm nguồn sự thật khả chuyển.

Bước 3 là lý do phải lưu `double precision` ngay từ đầu: nó giữ cho nguồn sự thật **đọc được trên
một Postgres trắng** kể cả sau khi đã bật PostGIS.

> **Ranh giới sở hữu:** bước 1 sửa `deploy/netviet/compose.yaml`, mà tệp đó đang nằm trong PR #227
> (#224 tính khả chuyển). Lane B **không** đụng vào — và đó là một lý do nữa để đường "không cần
> extension" là đường đúng cho hôm nay.

---

## 7. Bản đồ — chưa quyết, và chưa cần quyết

R0 chọn **MapLibre GL JS + PMTiles tự dựng**. Lane B **không xét lại** kết luận đó, vì chưa có một
màn hình nào cần vẽ bản đồ: dữ liệu phải tồn tại trước. Một điều R0 nói cần được nhắc lại vì nó là
một con số chưa đo: kích thước tile Việt Nam **≈ 215 MB là ước tính suy từ tỷ lệ của Hà Lan**, và
chính R0 đã ghi *"hãy dựng rồi đo"*. Đừng đưa con số đó vào một bảng chi phí trước khi dựng.

---

## 8. Cái vẫn phải để người xem

Lặp lại từ #229 §4 và R0 §4, vì nó là điều kiện của cả tầng này chứ không phải một ghi chú:

- **Không bao giờ tuyên bố chống được GPS giả.** Giả mạo ở tầng vô tuyến (SDR) không để lại một
  dấu vết phần mềm nào — máy thu báo trung thực một vị trí tính từ tín hiệu giả.
- Giả mạo có root/LSPosed vượt được `Location.isMock()`; các module làm việc đó đang được phát
  hành công khai và cập nhật.
- Mọi tín hiệu ở tầng này là **rủi ro để người xem lại**, không phải một cổng chặn nhị phân, và
  **không** bất thường nào được tự sinh ra công nợ, trừ lương hay kết luận gian lận (#232 D-02).

---

## 9. Cái tầng này để lại cho tranche sau

`apps/api/src/transport/geo/` — thuần hàm, không đọc DB, không đọc đồng hồ, không gọi mạng:

| Tệp | Việc |
|---|---|
| `geo-point.ts` | Kiểu `GeoPoint`, kiểm biên vào, **từ chối `(0,0)`**, khung hoạt động thô |
| `geodesy.ts` | Haversine, phương vị, tốc độ mặt đất |
| `geofence.ts` | Hàng rào tròn, phán quyết **ba giá trị**, phân định hoà bằng bán kính hẹp hơn |
| `continuity.ts` | Khoảng trống, dấu thời gian không tiến, di chuyển bất khả thi **đã trừ sai số** |
| `location-quality.ts` | Phân hạng `FINE`/`COARSE`/`POOR`/**`UNKNOWN`** |

51 bài kiểm (`GEO-001`, `GEO-002`, `GEO-003`, `GEO-010`, `GEO-020`, `GEO-030`, `GEO-031`,
`GEO-040`). Chưa có bảng, chưa có capability, chưa có tuyến HTTP — đó là tranche kế tiếp.
