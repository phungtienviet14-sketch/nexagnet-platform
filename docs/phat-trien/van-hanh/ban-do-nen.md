# Nền bản đồ vận tải — Google Maps / MapLibre / cục bộ (#374)

> Áp dụng cho `Báo cáo → Bản đồ vòng chạy` và `Điều xe` (cùng component `TransportMap`).
> Mã: `apps/web/experiences/transport-operations/visual/`. Quyết định kiến trúc:
> [`kien-truc/transport-geospatial.md` §7](../../kien-truc/transport-geospatial.md#7-bản-đồ--nền-google-maps-có-cấu-hình-lớp-nghiệp-vụ-không-đổi).

## 1. Nền chỉ là nền

```
JourneyMapModel (API)  ──buildJourneyLayers──▶  lớp deck.gl (tuyến / chặng rỗng / mốc / GPS thô)
                                                        │
                                            ┌───────────┼──────────────────────┐
                                        GOOGLE_MAPS  CONFIGURED_STYLE_URL  LOCAL_FALLBACK
                                  (GoogleMapsOverlay)   (MapLibre + style)   (MapLibre, không mạng)
```

- Google **chỉ vẽ nền**. Tuyến, chặng RỖNG, mốc, vệt GPS thô là lớp deck.gl vẽ **thẳng từ toạ độ
  máy chủ trả về** — cùng một mảng lớp cho mọi nền (`journey-layers.ts`).
- `distanceKm` vẫn là số nghiệp vụ. Không tính lại quãng đường từ hình học Google, không ghi đè.
- Không Directions, Places, Geocoding, Street View, `geometry`: trình nạp chỉ xin thư viện `core` +
  `maps` (bài kiểm `google-maps-loader.spec.ts` khoá điều đó).

## 2. Biến môi trường

| Biến                                        | Giá trị                          | Ghi chú                                                            |
| ------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER`        | `google` \| `maplibre` \| `local` | Để trống = hành vi trước #374 (có style URL → MapLibre, không → cục bộ) |
| `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY` | khoá trình duyệt Maps JS API     | Chỉ đọc khi provider = `google`                                     |
| `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID`  | Map ID (tuỳ chọn, **nên có**)    | Có → bản đồ **vector**; không → **raster** (xem dưới)               |
| `NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL`       | URL style MapLibre               | Chỉ đọc khi provider = `maplibre` hoặc để trống                     |

**Map ID quyết định cách tuyến nằm trên nền.** Google chỉ cho `WebGLOverlayView` chạy khi bản đồ có
Map ID — đo trên Google thật 23/09/2026: *"The map is initialized without a valid map ID, which will
prevent use of WebGLOverlayView."*

| Có Map ID (vector)                                                    | Không Map ID (raster)                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| deck.gl vẽ **trong** vòng vẽ WebGL của Google (interleaved): một canvas | canvas của deck.gl nằm trong pane của Google, vẽ lại mỗi lần Google `draw()` |
| nhãn đường/địa danh của Google nằm **trên** tuyến                      | tuyến đè lên nhãn (nhãn nằm sẵn trong ảnh tile)                           |
| kéo/phóng: tuyến và nền cùng một khung hình                            | kéo: đi cùng pane; trong lúc phóng có hiệu ứng, tuyến được vẽ lại khi Google dừng |

Không Map ID thì app xin `RASTER` ngay từ đầu — không xin vector rồi bị Google lùi.

Phán quyết **tất định** (`resolveBasemap`, 22 bài kiểm ở `map-style.spec.ts`):

| Cấu hình                                  | Nền                    | `data-basemap-fallback`  |
| ----------------------------------------- | ---------------------- | ------------------------ |
| không khai gì                             | cục bộ                 | `NOT_CONFIGURED`         |
| chỉ có khoá Google, không khai provider   | cục bộ — **không** gọi Google | `NOT_CONFIGURED`  |
| `google` + khoá                           | Google Maps            | —                        |
| `google`, thiếu khoá (kể cả chỉ khoảng trắng) | cục bộ — **không** nhảy sang MapLibre | `GOOGLE_KEY_MISSING` |
| `maplibre` + style URL                    | MapLibre style đó      | —                        |
| `maplibre`, thiếu style URL               | cục bộ                 | `MAPLIBRE_STYLE_MISSING` |
| `local`                                   | cục bộ                 | `LOCAL_SELECTED`         |
| tên lạ (vd `mapbox`)                      | cục bộ                 | `UNKNOWN_PROVIDER`       |

Không có nhánh nào tự bật một nhà cung cấp trả phí: khoá nằm sẵn trong môi trường mà không khai
`provider=google` thì Google **không** được gọi.

### Biến `NEXT_PUBLIC_*` là biến lúc BUILD

Next.js thay giá trị vào gói JS lúc `next build`. Hệ quả vận hành:

- Đổi khoá/provider = **build lại** web. `redeploy` một bản build cũ **không** đổi nền.
- Image chung do CI dựng (`deploy/netviet/Dockerfile`) **không** có khoá ⇒ luôn chạy nền cục bộ.
  Muốn bật Google cho một môi trường, biến phải có mặt **lúc build** của chính môi trường đó
  (Railway dựng từ nguồn: đặt biến ở service rồi kích một **build mới**).
- Khoá Maps JS API **luôn công khai** trong trình duyệt (nó nằm trong URL script). Bảo vệ nó bằng
  giới hạn referrer, không phải bằng việc giấu.

## 3. Khi Google hỏng

| Tình huống                                  | Máy thấy gì                     | Người dùng thấy gì                                     |
| ------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| đang tải                                    | `aria-busy="true"`              | `Đang tải nền Google Maps…` đè trên khung bản đồ        |
| script không tải được (mạng, CSP, chặn quảng cáo) | `GOOGLE_SCRIPT_FAILED`    | nền cục bộ + câu thông báo dưới đây                    |
| khoá bị từ chối (`gm_authFailure`: sai referrer, chưa bật API, chưa bật thanh toán) | `GOOGLE_AUTH_FAILED` | như trên — kể cả khi bản đồ Google đã hiện rồi mới bị từ chối |
| quá 15 giây                                 | `GOOGLE_TIMEOUT`                | như trên                                               |

Câu thông báo: **“Nền Google Maps chưa khả dụng; tuyến và mốc vẫn đang được hiển thị đúng trên nền
đơn giản.”** — nói *nền* hỏng, không nói toạ độ sai. Mã lý do nằm ở thuộc tính
`data-basemap-fallback` của khung bản đồ (mở DevTools là thấy), không hiện cho người dùng.

## 4. Việc phía chủ dự án trước khi bật Google ở production

Task #374 **không** tự bật thanh toán, không thêm phương thức thanh toán, không tăng hạn mức, không
tạo tài nguyên trả phí. Các bước dưới đây là của chủ dự án:

1. **Dự án Google Cloud có tài khoản thanh toán** — Maps Platform không chạy nếu thiếu, kể cả trong
   hạn mức miễn phí (khi đó Google gọi `gm_authFailure` ⇒ bản đồ tự lùi về nền cục bộ).
2. **Bật đúng một API: Maps JavaScript API.** Không bật Directions/Places/Geocoding cho khoá này.
   **Tạo một Map ID** (Google Maps Platform → *Map management* → *Create map ID*, loại
   **JavaScript**, kiểu **Vector**) rồi đặt vào `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID`. Không dùng
   `DEMO_MAP_ID` — Google ghi rõ nó không dành cho production.
3. **Tạo khoá trình duyệt và GIỚI HẠN nó:**
   - *Application restriction* → **Websites (HTTP referrers)**: chỉ tên miền thật của môi trường,
     vd `https://<ten-mien-preview>/*`. Thêm `http://localhost:<cổng>/*` **chỉ** cho một khoá thử riêng.
   - *API restriction* → **Restrict key** → chỉ **Maps JavaScript API**.
   - Không bao giờ dùng khoá không giới hạn.
4. **Chi phí:** mỗi lần tạo `google.maps.Map` là một *map load* của SKU **Dynamic Maps**. Từ
   01/03/2025 Google thay khoản tín dụng 200 USD/tháng bằng hạn mức miễn phí theo từng SKU — đối
   chiếu [bảng giá hiện hành](https://developers.google.com/maps/billing-and-pricing/pricing) trước
   khi bật; đặt **budget alert** trên tài khoản thanh toán. Mỗi lần khung bản đồ được dựng = một
   map load: mở màn bản đồ, hoặc chọn một vòng chạy khác (màn hình gỡ bản đồ trong lúc đọc toạ độ
   vòng mới rồi dựng lại). Làm tươi dữ liệu của **cùng** vòng chạy không tạo map load mới và không
   kéo bản đồ khỏi chỗ người dùng vừa kéo/phóng. Script Google chỉ tải **một** lần cho cả trang.
5. **CSP.** Nếu phía trước web có một `Content-Security-Policy` (vd edge Caddy
   `deploy/netviet/edge/Caddyfile`: `script-src 'self' 'unsafe-inline'; connect-src 'self'`), script
   Google sẽ bị chặn và bản đồ lùi về nền cục bộ (`GOOGLE_SCRIPT_FAILED`). Muốn bật Google sau một
   CSP như vậy phải mở thêm theo [hướng dẫn CSP của Google](https://developers.google.com/maps/documentation/javascript/content-security-policy)
   — đó là một thay đổi `deploy/`, không thuộc #374.
6. Đặt `NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google` + `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY`
   (+ `NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID`) cho service web **rồi build lại**. Kiểm: khung bản
   đồ có `data-basemap="GOOGLE_MAPS"`, không có câu thông báo, và DevTools không có
   `InvalidKeyMapError` / `RefererNotAllowedMapError` / cảnh báo thiếu Map ID.

Không đưa khoá vào ảnh chụp, tài liệu, fixture hay log. Thay khoá = tạo khoá mới đã giới hạn, build
lại, rồi xoá khoá cũ.

## 5. Kiểm thử

- **CI bắt buộc** không đặt biến nào ở trên ⇒ nền cục bộ, không Internet. Bài Lane N trong
  `apps/web/e2e/transport/transport-operations.spec.ts` đếm mọi yêu cầu tới `*.googleapis.com` /
  `*.gstatic.com` và đòi **0**.
- **Tuỳ chọn** (không nằm trong 7 check bắt buộc), thẻ `@google-basemap`:

  ```bash
  # Google bị chặn trong trình duyệt — KHÔNG cần mạng, khoá chỉ cần khác rỗng:
  NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY=khoa-thu \
    pnpm --filter @netviet/web exec playwright test --config playwright.transport.config.ts --grep @google-basemap

  # Gọi Google thật bằng khoá chủ dự án cấp (đã giới hạn cho localhost) — chụp ROADMAP:
  TRANSPORT_MAP_GOOGLE_LIVE=1 NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER=google \
  NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY=<khoa> NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID=<map-id> \
    pnpm --filter @netviet/web exec playwright test --config playwright.transport.config.ts --grep @google-basemap
  ```

  Bài "sống" lưu ảnh `journey-map-GOOGLE_MAPS.png` (1440×900) vào thư mục kết quả của Playwright,
  và đòi tuyến **thật sự** hiện ra (đếm điểm ảnh mang màu tuyến) ở cả nhánh Google lẫn nhánh lùi.

  Chạy với một khoá cố ý sai + `TRANSPORT_MAP_GOOGLE_EXPECT=GOOGLE_AUTH_FAILED` để đo đường
  `gm_authFailure` trên Google thật.

## 6. Giới hạn đã biết

- Thiếu Map ID, hoặc máy/trình duyệt không hỗ trợ bản đồ vector: nền raster, overlay dùng
  `OverlayView` (canvas riêng trong pane của Google) — tuyến vẫn đúng chỗ, nhưng nhãn đường của
  Google nằm **dưới** tuyến thay vì trên (bảng ở §2).
- **Chưa chụp được nền Google thật với một khoá hợp lệ**: task này không có khoá của chủ dự án.
  Đã đo trên Google thật với một khoá **cố ý sai** (đường `gm_authFailure` → nền cục bộ, tuyến vẫn
  vẽ) và với script Google bị chặn; ảnh ROADMAP/TERRAIN chờ khoá thử (xem §5, bài "sống").
- Khung bản đồ vẫn mang `role="img"` như trước #374, nên các nút điều khiển của Google/MapLibre bên
  trong không được trình đọc màn hình đọc riêng; nội dung nghiệp vụ nằm ở bảng chặng và dòng thời
  gian ngay bên dưới.
