# Nền bản đồ vận tải — OpenFreeMap mặc định, Google tuỳ chọn, cục bộ dự phòng (#374)

> Áp dụng cho `Báo cáo → Bản đồ vòng chạy` và `Điều xe` (cùng component `TransportMap`).
> Mã: `apps/web/experiences/transport-operations/visual/`. Quyết định kiến trúc:
> [`kien-truc/transport-geospatial.md` §7](../../kien-truc/transport-geospatial.md#7-bản-đồ--nền-openfreemap-mặc-định-lớp-nghiệp-vụ-không-đổi).
> Quyết định của chủ dự án: comment `OWNER_DECISION_UPDATE_2026_09_23` trên #374.

## 0. Khuyến nghị hiện tại

```
OpenFreeMap (instance công khai) + MapLibre
  không khoá API · không GCP · không phương thức thanh toán · không biến môi trường nào
```

Build web **không đặt biến nào** là người dùng thấy đường sá, địa danh, sông hồ thật dưới tuyến.
Google Maps **không** còn là điều kiện để có bản đồ nền — chỉ là một nhà cung cấp tuỳ chọn (§6).

## 1. Nền chỉ là nền

```
JourneyMapModel (API) ──buildJourneyLayers──▶ lớp deck.gl (tuyến / chặng RỖNG / mốc / GPS thô)
                                                    │
                  ┌──────────────────┬──────────────┼───────────────────┬────────────────────┐
             OPENFREEMAP        GOOGLE_MAPS   CONFIGURED_STYLE_URL   LOCAL_FALLBACK
        (MapLibre + Liberty)   (tuỳ chọn)      (MapLibre + style)   (MapLibre, không mạng)
            ← mặc định
```

- Nền **chỉ vẽ nền**. Tuyến, chặng RỖNG, mốc, vệt GPS thô là lớp deck.gl vẽ **thẳng từ toạ độ
  máy chủ trả về** — cùng một hàm dựng lớp cho mọi nền (`journey-layers.ts`).
- `distanceKm`, trạng thái Run/Leg, mốc, vệt GPS thô, tiền: **không đổi theo nền**. Không "bám
  đường" theo hình học của nhà cung cấp, không tính lại quãng đường.
- Không Directions, routing, Places, Geocoding, tối ưu tuyến — ở bất kỳ nhà cung cấp nào.

## 2. Biến môi trường (lúc BUILD)

| Biến                                        | Giá trị                                            | Ghi chú                                                              |
| ------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER`        | `openfreemap` \| `google` \| `maplibre` \| `local` | **Để trống = `openfreemap`** (trừ khi có `STYLE_URL`, xem bảng dưới) |
| `NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL`       | URL style MapLibre                                 | Chỉ cho style tự khai (`maplibre`, hoặc để trống provider)           |
| `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY` | khoá trình duyệt Maps JS API                       | Chỉ đọc khi provider = `google` (§6)                                 |
| `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID`  | Map ID (tuỳ chọn)                                  | Chỉ đọc khi provider = `google` (§6)                                 |

OpenFreeMap **không** có biến bí mật nào. URL style là hằng số trong mã
(`OPENFREEMAP_LIBERTY_STYLE_URL = https://tiles.openfreemap.org/styles/liberty`).

Phán quyết **tất định** (`resolveBasemap`, bài kiểm ở `map-style.spec.ts`):

| Cấu hình                                        | Nền                                   | `data-basemap-fallback`  |
| ----------------------------------------------- | ------------------------------------- | ------------------------ |
| không khai gì (kể cả chuỗi rỗng / khoảng trắng) | **OpenFreeMap Liberty**               | —                        |
| chỉ có khoá Google, không khai provider         | OpenFreeMap — **không** gọi Google    | —                        |
| `openfreemap`                                   | OpenFreeMap Liberty                   | —                        |
| chỉ có `STYLE_URL`, không khai provider         | style đó (giữ hành vi trước #374)     | —                        |
| `maplibre` + style URL                          | style đó                              | —                        |
| `maplibre`, thiếu style URL                     | cục bộ                                | `MAPLIBRE_STYLE_MISSING` |
| `google` + khoá                                 | Google Maps                           | —                        |
| `google`, thiếu khoá                            | cục bộ — **không** nhảy sang nền khác | `GOOGLE_KEY_MISSING`     |
| `local`                                         | cục bộ                                | `LOCAL_SELECTED`         |
| tên lạ (vd `mapbox`)                            | cục bộ                                | `UNKNOWN_PROVIDER`       |

Google chỉ được gọi khi khai **tường minh** `provider=google`: khoá nằm sẵn trong môi trường mà
không khai provider thì Google không nhận một yêu cầu nào — và mã Google (`@deck.gl/google-maps`,
trình nạp `@googlemaps/js-api-loader`) nằm ở chunk tải lười, trang dùng OpenFreeMap không tải nó.

### Biến `NEXT_PUBLIC_*` là biến lúc BUILD

Next.js thay giá trị vào gói JS lúc `next build`. Đổi provider = **build lại** web; `redeploy` một
bản build cũ **không** đổi nền. Image chung do CI dựng (`deploy/netviet/Dockerfile`) không truyền
biến nào ⇒ **OpenFreeMap**. Muốn khác cho một môi trường, biến phải có mặt **lúc build** của chính
môi trường đó (Railway dựng từ nguồn: đặt biến ở service rồi kích một **build mới**).

### Worker của MapLibre 6 — tệp tĩnh cùng origin

MapLibre 6 nạp web worker (nơi tile vector được **xin** và giải mã) từ một tệp riêng lúc chạy. Dưới
webpack nó không tự tìm được tệp đó: không cấu hình gì thì style vẫn tải về, dòng ghi nguồn vẫn hiện,
nhưng **không một ô tile nào** được xin — nền be trống trơn (đo trên trình duyệt thật 23/09/2026).
Theo [tài liệu cài đặt của MapLibre](https://maplibre.org/maplibre-gl-js/docs/) (mục Next.js):

- `apps/web/next.config.mjs` sao `maplibre-gl-worker.mjs` + `maplibre-gl-shared.mjs` từ
  `node_modules` vào `apps/web/public/maplibre/` **mỗi lần Next nạp cấu hình** (`next dev`,
  `next build`, Playwright, `dev-transport.mjs`) — thư mục đó nằm trong `.gitignore`, luôn cùng phiên
  bản với MapLibre đang cài. Chỉ **ghi** khi bản sao thiếu hoặc khác: `next start` trên image đã build
  không ghi tệp nào;
- `MapLibreBasemap` gọi `setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')` trước bản đồ đầu tiên.

`maplibre-worker.spec.ts` khoá: bản sao giống từng byte, mọi tệp worker import đều được sao (bắt một
bản MapLibre sau tách thêm chunk), và bài Lane N của CI đòi `/maplibre/maplibre-gl-worker.mjs` trả
200 kiểu JavaScript. CSP phía trước (nếu có) cần `worker-src 'self'`.

## 3. Khi nền hỏng

Instance công khai của OpenFreeMap **không có SLA**. Hỏng ở đâu, bản đồ cũng dựng lại một bản đồ
**mới** trên nền cục bộ — kèm lớp deck.gl **mới** — nên tuyến, mốc và vệt GPS vẫn hiện (bài học
23/09/2026: đưa lại lớp đã khởi tạo trên nền cũ sang nền mới thì nền mới hiện ra **không có tuyến**).

| Tình huống (OpenFreeMap / style tự khai)             | `data-basemap-fallback`                                |
| ---------------------------------------------------- | ------------------------------------------------------ |
| đang tải                                             | `aria-busy="true"`, **không** câu nào đè lên bản đồ    |
| tải style thất bại (mạng, DNS, CSP, máy chủ sập)     | `OPENFREEMAP_STYLE_FAILED`                             |
| style áp vào nhưng **không một ô tile nào** nạp được | `OPENFREEMAP_TILES_FAILED`                             |
| 15 giây mà chưa một ô tile nào hiện                  | `OPENFREEMAP_TIMEOUT`                                  |
| như trên với style tự khai                           | `MAPLIBRE_STYLE_FAILED` / `_TILES_FAILED` / `_TIMEOUT` |

Người dùng thấy một câu phụ dưới bản đồ: **“Không tải được nền bản đồ; tuyến và mốc vẫn đang được
hiển thị đúng trên nền đơn giản.”** — nói _nền_ hỏng, không nói toạ độ sai, và không nêu tên hạ
tầng. Nền OpenFreeMap tải thành công thì **không** có câu nào.

Luật phân loại nằm ở `maplibre-basemap-watch.ts` (bài kiểm `maplibre-basemap-watch.spec.ts`):

- lỗi đến **trước** lần `styledata` đầu tiên = hỏng style; lỗi sau đó (sprite, vài ô tile lẻ) **không**
  làm bỏ cả nền;
- đếm ô tile **nạp thành công**, không đếm lỗi — MapLibre im lặng với ô tile 404;
- **hỏng tile kết luận ngay ở lỗi của ô cuối cùng** (hỏi `map.areTilesLoaded()`), không chờ `idle`:
  MapLibre 6.8 không lên lịch khung vẽ mới sau lỗi ô tile khác 404, nên `idle` có khi không bao giờ
  đến (đo trên trình duyệt thật: ô tile bị chặn lúc 15,2 s, tới 25,1 s vẫn chưa có `idle`);
- **luôn ra trạng thái cuối trong 15 giây**: đã có ô tile hiện mà một yêu cầu khác (ô tile, phông
  chữ) treo nên `idle` không đến → coi như nền đã hiện, `aria-busy` về `false`, không lùi;
- **đã hiện ra rồi thì không lùi nền nữa**: mất mạng giữa chừng chỉ làm thiếu vài ô ở vùng vừa kéo
  tới, không dựng lại bản đồ ngay dưới tay người đang thao tác.

Google hỏng (thiếu khoá, script bị chặn, `gm_authFailure`, quá hạn) giữ câu riêng: “Nền Google Maps
chưa khả dụng; …” — xem §6.

## 4. Ghi nguồn và quyền riêng tư

- **Ghi nguồn bắt buộc** và luôn bật cho nền ngoài: MapLibre đọc `attribution` của chính style
  (“OpenFreeMap © OpenMapTiles Data from OpenStreetMap”) và hiện đầy đủ ở góc phải dưới khi khung
  rộng hơn 640px, thu gọn thành nút (i) khi hẹp hơn. Không quy tắc CSS nào che nó. Nền cục bộ không
  có dữ liệu ngoài nên không có gì để ghi.
- **Không một định danh nào ra ngoài.** URL style là hằng số; MapLibre chỉ gọi những URL do style
  của OpenFreeMap khai (TileJSON, ô tile, sprite, phông chữ) — không `transformRequest`, không tham
  số truy vấn. Mã khách, mã người dùng, mã đơn, mã vòng chạy, mã khách hàng **không** nằm trong URL
  nào gửi tới OpenFreeMap. `apps/web/next.config.mjs` khai tường minh `Referrer-Policy:
strict-origin-when-cross-origin` cho mọi trang (không dựa vào mặc định của từng trình duyệt), nên
  `Referer` ra ngoài chỉ là **origin** — đường dẫn `?selected=RUN-…` của trang không ra ngoài. Bài
  Lane N của CI kiểm header đó; bài "sống" `@openfreemap-basemap` kiểm URL không tham số và `Referer`
  chỉ là origin trên trình duyệt thật.
- Toạ độ tuyến là dữ liệu phía trình duyệt, vẽ bằng deck.gl; không gửi hình học vòng chạy tới API
  nào của OpenFreeMap ngoài các yêu cầu tile/style bình thường của bất kỳ trình duyệt nào.

## 5. Đánh đổi và đường nâng cấp

|                | Instance công khai OpenFreeMap (hiện tại)                                |
| -------------- | ------------------------------------------------------------------------ |
| Chi phí / khoá | 0 đ, không đăng ký, không khoá, cho phép dùng thương mại                 |
| Giới hạn       | không giới hạn lượt xem / yêu cầu (theo trang chủ OpenFreeMap)           |
| **Cam kết**    | **Không SLA, không hỗ trợ riêng** — sập là bản đồ lùi về nền cục bộ (§3) |

Khi cần bảo đảm cao hơn cho production, hai đường — **cả hai là quyết định của chủ dự án**, không
làm ngầm:

1. **Tự dựng** OpenFreeMap (mã nguồn mở) hoặc một bộ **PMTiles** Việt Nam trên hạ tầng của mình, rồi
   trỏ `provider=maplibre` + `STYLE_URL` vào style đó. Không đổi mã — `CONFIGURED_STYLE_URL` đã có
   sẵn cùng cơ chế lùi nền. (Ước tính ~215 MB tile Việt Nam của R0 **chưa đo** — dựng rồi đo.)
2. **Chọn tường minh** một nhà cung cấp thương mại (Google ở §6, hoặc một nhà tile trả phí qua
   style URL) — kèm hợp đồng, giới hạn khoá và cảnh báo ngân sách.

**CSP.** Nếu phía trước web có một `Content-Security-Policy` chặn kết nối ra ngoài — vd edge Caddy
dùng chung trên VM (`deploy/netviet/edge/Caddyfile`: `connect-src 'self'`) — style/tile của
OpenFreeMap bị chặn và bản đồ lùi về nền cục bộ (`OPENFREEMAP_STYLE_FAILED`). Muốn có nền thật sau
edge đó phải mở `connect-src https://tiles.openfreemap.org` (tile được xin từ worker, và tệp worker
cùng origin cũng nhận CSP đó) — một thay đổi `deploy/`, **không** thuộc #374. Môi trường xem trước vận tải hiện chạy trên
Railway, không đi qua edge này.

## 6. Google Maps — TUỲ CHỌN, chỉ khi chủ dự án chọn

Không cần cho bản đồ vận tải. Chỉ làm khi chủ dự án **quyết định** dùng Google và có một dự án
Google Cloud đã duyệt thanh toán. Task #374 **không** tự bật thanh toán, không thêm phương thức thanh
toán, không tăng hạn mức, không tạo tài nguyên trả phí.

1. **Dự án Google Cloud có tài khoản thanh toán** — thiếu thì Google gọi `gm_authFailure` và bản đồ
   tự lùi về nền cục bộ (`GOOGLE_AUTH_FAILED`).
2. **Bật đúng một API: Maps JavaScript API.** Tạo **Map ID** (loại JavaScript, kiểu **Vector**) rồi
   đặt vào `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID`. Không dùng `DEMO_MAP_ID` cho production.
3. **Khoá trình duyệt có GIỚI HẠN:** _Websites (HTTP referrers)_ chỉ tên miền thật của môi trường
   (`http://localhost:<cổng>/*` chỉ cho một khoá thử riêng); _API restriction_ chỉ **Maps JavaScript
   API**. Không bao giờ dùng khoá không giới hạn. Khoá Maps JS **luôn công khai** trong trình duyệt —
   bảo vệ bằng giới hạn, không bằng việc giấu.
4. **Chi phí:** mỗi lần dựng `google.maps.Map` là một _map load_ (SKU Dynamic Maps) — mở màn bản đồ,
   hoặc chọn vòng chạy khác. Đối chiếu [bảng giá hiện hành](https://developers.google.com/maps/billing-and-pricing/pricing)
   và đặt **budget alert**.
5. **CSP:** mở theo [hướng dẫn CSP của Google](https://developers.google.com/maps/documentation/javascript/content-security-policy)
   nếu phía trước web có CSP (thay đổi `deploy/`).
6. Đặt `NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google` + khoá (+ Map ID) **rồi build lại**. Kiểm: khung
   bản đồ có `data-basemap="GOOGLE_MAPS"`, không câu thông báo, DevTools không có
   `InvalidKeyMapError` / `RefererNotAllowedMapError` / cảnh báo thiếu Map ID.

**Map ID quyết định cách tuyến nằm trên nền Google** (đo trên Google thật 23/09/2026: _"The map is
initialized without a valid map ID, which will prevent use of WebGLOverlayView."_):

| Có Map ID (vector)                                                      | Không Map ID (raster)                                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| deck.gl vẽ **trong** vòng vẽ WebGL của Google (interleaved): một canvas | canvas của deck.gl nằm trong pane của Google, vẽ lại mỗi lần Google `draw()` |
| nhãn đường/địa danh của Google nằm **trên** tuyến                       | tuyến đè lên nhãn (nhãn nằm sẵn trong ảnh tile)                              |

Google hỏng: `GOOGLE_KEY_MISSING` · `GOOGLE_SCRIPT_FAILED` (mạng, CSP, chặn quảng cáo) ·
`GOOGLE_AUTH_FAILED` (kể cả khi bản đồ Google đã hiện rồi mới bị từ chối) · `GOOGLE_TIMEOUT` (15 s).
Trong lúc tải: `Đang tải nền Google Maps…` đè lên khung. Trình nạp chỉ xin thư viện `core` + `maps`.

Không đưa khoá vào ảnh chụp, tài liệu, fixture hay log. Thay khoá = tạo khoá mới đã giới hạn, build
lại, rồi xoá khoá cũ.

## 7. Kiểm thử

- **CI bắt buộc**: máy chủ e2e khai `NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=local`
  (`playwright.transport.config.ts`, `playwright.transport-toll.config.ts`) ⇒ nền cục bộ, **không
  Internet**. Bài Lane N trong `apps/web/e2e/transport/transport-operations.spec.ts` đòi **0** yêu cầu
  ra khỏi máy chủ web và **0** chunk mã Google.
- **Tuỳ chọn** (không nằm trong 7 check bắt buộc) — biến đặt trước lệnh, chạy từ `apps/web`:

  ```bash
  # OpenFreeMap: hai bài chặn/giả mạng (KHÔNG cần Internet) + bài "sống" gọi instance thật, lưu ảnh 1440×900:
  NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=openfreemap TRANSPORT_MAP_OPENFREEMAP_LIVE=1 \
    pnpm exec playwright test --config playwright.transport.config.ts --grep @openfreemap-basemap

  # Google bị chặn trong trình duyệt — KHÔNG cần mạng, khoá chỉ cần khác rỗng:
  NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY=khoa-thu \
    pnpm exec playwright test --config playwright.transport.config.ts --grep @google-basemap

  # Google thật bằng khoá chủ dự án cấp (đã giới hạn cho localhost):
  TRANSPORT_MAP_GOOGLE_LIVE=1 NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google \
  NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY=<khoa> NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID=<map-id> \
    pnpm exec playwright test --config playwright.transport.config.ts --grep @google-basemap
  ```

  Bài OpenFreeMap "sống" đòi: nền `OPENFREEMAP`, không câu thông báo, ghi nguồn chứa _OpenFreeMap_ và
  _OpenStreetMap_, cả hai màu tuyến hiện ra (đếm điểm ảnh), **mọi** yêu cầu ngoài chỉ tới
  `tiles.openfreemap.org` không tham số truy vấn với `Referer` chỉ là origin, không chunk Google nào;
  rồi kéo bản đồ và đo trọng tâm tuyến dời **đúng** bằng quãng kéo (lệch < 8 px), phóng to, chụp lại.

## 8. Giới hạn đã biết

- Instance công khai **không SLA** (§5). Lùi nền là an toàn, nhưng khi OpenFreeMap sập người dùng mất
  hình đường sá cho tới khi nó sống lại (hoặc tới khi tự dựng).
- Lùi nền chỉ xét **lần hiện ra đầu tiên** của bản đồ. Mất mạng sau đó chỉ làm thiếu ô tile ở vùng
  mới kéo tới — có chủ ý (§3).
- Mỗi lần dựng bản đồ = một lần tải style + tile (trình duyệt tự đệm HTTP); chọn vòng chạy khác thì
  màn hình gỡ rồi dựng lại bản đồ (hành vi sẵn có của `JourneyView`).
- Khung bản đồ mang `role="img"` như trước #374, nên nút điều khiển và dòng ghi nguồn bên trong không
  được trình đọc màn hình đọc riêng; nội dung nghiệp vụ nằm ở bảng chặng và dòng thời gian bên dưới.
- Google: **chưa có ảnh ROADMAP/TERRAIN với khoá hợp lệ** — không còn là điều kiện của #374; chỉ là
  bằng chứng tuỳ chọn nếu sau này có khoá được duyệt.
