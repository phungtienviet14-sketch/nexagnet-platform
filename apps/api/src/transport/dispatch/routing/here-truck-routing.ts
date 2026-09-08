import type { GeoPoint } from '../../geo/geo-point.js';
import type {
  MatrixCell,
  MatrixRequest,
  RouteEstimate,
  RouteRequest,
  TruckProfile,
} from './routing.types.js';

/**
 * ANH XA MIEN -> HERE Routing/Matrix API v8 — HAM THUAN, khong mang, khong khoa.
 *
 * ===========================================================================
 * VI SAO TACH DUNG/PARSE RA KHOI ADAPTER HTTP
 *
 * Doi xe cua khach chua co mot khoa HERE nao, va `#277 M11` cam di xin/mua mot cai. Nen phan
 * "goi mang" cua adapter se KHONG BAO GIO chay trong CI hay tren ban xem truoc.
 *
 * Nhung phan DE SAI NHAT cua mot tich hop khong phai lan goi mang — no la PHEP DOI DON VI va cach
 * doc lai mot ma tran phang. Ca hai deu la ham thuan, va o day chung duoc tach ra de mot bai kiem
 * thu ngoai tuyen chay duoc tren chung. Do la khac biet giua *"tich hop nay dung theo tai lieu"*
 * va *"tich hop nay se biet minh sai vao lan dau chay that"*.
 *
 * ===========================================================================
 * NGUON — doc ngay 08/09/2026, tai lieu chinh thuc dang song
 *
 *   · `https://docs.here.com/routing/docs/routing-v8-truck-routing` — `transportMode=truck`, va
 *     tham so xe di theo khuon `vehicle[<ten>]=<gia tri>`;
 *   · `https://docs.here.com/routing/docs/routing-v8-vehicle-properties` — `vehicle[height]` tinh
 *     bang XENTIMET (vi du trong tai lieu: `270` cho 2,7 m); cac ten `width`, `length`,
 *     `weightPerAxle`, `currentWeight`, `grossWeight`, `trailerCount`, `tiresCount`;
 *   · `https://docs.here.com/routing/docs/routing-v8-route-summary` — phan hoi la `routes[]` ->
 *     `sections[]` -> `summary` voi `length` (MET) va `duration` (GIAY);
 *   · `https://docs.here.com/routing/docs/get-started-matrix` — `POST
 *     https://matrix.router.hereapi.com/v8/matrix?async=false`, than yeu cau co `origins`,
 *     `destinations`, `regionDefinition`, `matrixAttributes`.
 *
 * TEN NAO KHONG DOC DUOC XAC NHAN THI KHONG DUOC PHAT. `axleCount` la mot vi du: no xuat hien
 * trong tai lieu cua vai nha cung cap khac va trong nhieu bai viet, nhung trang thuoc tinh xe cua
 * HERE ma tep nay doi chieu KHONG liet ke no. Gui mot tham so ma may chu khong hieu la mot loi
 * 400 tra ve giua mot ca dieu xe — nen no khong nam trong bang duoi.
 */

export const HERE_ROUTES_URL = 'https://router.hereapi.com/v8/routes';
export const HERE_MATRIX_URL = 'https://matrix.router.hereapi.com/v8/matrix';

const formatPoint = (point: GeoPoint): string => `${point.latitude},${point.longitude}`;

/**
 * `TruckProfile` -> cac tham so `vehicle[...]` cua HERE.
 *
 * Don vi da TRUNG KHOP tu goc: `TruckProfile` giu chieu cao bang XENTIMET va khoi luong bang
 * KILOGAM dung vi day la don vi cua HERE. Mot phep doi don vi o day la mot phep doi co the sai;
 * khong co phep doi nao thi khong.
 *
 * Truong `null` KHONG duoc phat. Day khong phai toi uu — do la dieu kien: mot `vehicle[height]=0`
 * hay mot `vehicle[grossWeight]=40000` mac dinh se lam HERE dinh tuyen cho MOT CHIEC XE KHAC voi
 * chiec xe that. Vang mat mot tham so nghia la "khong rang buoc chieu nay", va do dung la su that.
 */
export function hereVehicleParams(truck: TruckProfile): Readonly<Record<string, string>> {
  const params: Record<string, string> = {};
  const put = (name: string, value: number | null): void => {
    if (value !== null && Number.isFinite(value)) params[`vehicle[${name}]`] = String(value);
  };

  put('height', truck.heightCm);
  put('width', truck.widthCm);
  put('length', truck.lengthCm);
  put('grossWeight', truck.grossWeightKg);
  put('currentWeight', truck.currentWeightKg);
  put('weightPerAxle', truck.weightPerAxleKg);
  put('trailerCount', truck.trailerCount);

  return params;
}

/**
 * Dung chuoi truy van cho `GET /v8/routes`.
 *
 * `return=summary` va KHONG `polyline`, co chu y: HERE tra hinh duong di duoi dang *flexible
 * polyline* — mot dinh dang nen rieng can mot bo giai ma. Repo nay khong co bo do, va `#277 M4`
 * noi hinh duong di chi lay *"where requested"*. Xep hang thi khong can hinh. Khi Lane N can ve
 * mot tuyen len ban do, do la luc them mot phu thuoc giai ma — khong phai bay gio, va khong phai
 * bang cach tra ve mot duong thang gia lam mot tuyen duong.
 */
export function buildHereRouteQuery(
  request: RouteRequest,
  apiKey: string,
): Readonly<Record<string, string>> {
  const query: Record<string, string> = {
    transportMode: 'truck',
    origin: formatPoint(request.origin),
    destination: formatPoint(request.destination),
    return: 'summary',
    apiKey,
    ...hereVehicleParams(request.truck),
  };
  if (request.departAt !== null) query.departureTime = request.departAt;
  return query;
}

/** Than yeu cau `POST /v8/matrix`. `regionDefinition.type = 'world'` la che do khong gioi han vung. */
export function buildHereMatrixBody(request: MatrixRequest): Readonly<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    origins: request.origins.map((point) => ({ lat: point.latitude, lng: point.longitude })),
    destinations: request.destinations.map((point) => ({
      lat: point.latitude,
      lng: point.longitude,
    })),
    regionDefinition: { type: 'world' },
    matrixAttributes: ['travelTimes', 'distances'],
    transportMode: 'truck',
  };
  if (request.departAt !== null) body.departureTime = request.departAt;
  return body;
}

/* ------------------------------------------------------------------ *
 * DOC LAI PHAN HOI — cho nao mot tich hop that su hong
 * ------------------------------------------------------------------ */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export interface HereSummary {
  readonly roadDistanceMetres: number;
  readonly durationSeconds: number;
}

/**
 * `routes[0].sections[*].summary` -> tong quang duong/thoi gian.
 *
 * CONG MOI SECTION lai chu khong lay section dau tien. Mot tuyen HERE bi cat thanh nhieu section
 * o moi cho doi phuong tien hoac moi diem dung; lay section dau se cho ra mot con so nho hon that
 * ma van trong hoan toan hop ly — kieu sai te nhat vi khong ai nghi ngo no.
 *
 * Tra `null` khi than phan hoi khong co hinh dang mong doi. KHONG nem, va KHONG suy ra 0: mot
 * quang duong 0 met giua hai tinh se dung dau bang xep hang.
 */
export function parseHereRouteSummary(payload: unknown): HereSummary | null {
  const root = asRecord(payload);
  const routes = root?.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;

  const sections = asRecord(routes[0])?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return null;

  let roadDistanceMetres = 0;
  let durationSeconds = 0;
  for (const section of sections) {
    const summary = asRecord(asRecord(section)?.summary);
    const length = asFiniteNumber(summary?.length);
    const duration = asFiniteNumber(summary?.duration);
    if (length === null || duration === null) return null;
    roadDistanceMetres += length;
    durationSeconds += duration;
  }
  return { roadDistanceMetres, durationSeconds };
}

/**
 * `matrix.travelTimes` / `matrix.distances` -> cac o.
 *
 * ===========================================================================
 * HAI MANG PHANG, VA MOT CACH DOC SAI RAT DE MAC.
 *
 * HERE tra ve ma tran duoi dang MOT mang phang theo HANG (`row-major`): o cua diem xuat phat `i`
 * va diem den `j` nam o chi so `i * numDestinations + j`. Doc nham thanh `j * numOrigins + i` van
 * cho ra mot mang du so phan tu, van khong nem loi nao, va van cho ra mot bang xep hang trong
 * hoan hao — voi khoang cach cua nhung cap diem khac.
 *
 * `numDestinations` duoc doc TU PHAN HOI chu khong tu yeu cau, vi phan hoi la ben noi cuoi cung
 * ve hinh dang cua chinh no.
 *
 * `errorCodes` (khi co) danh dau cac o KHONG tinh duoc. Gia tri khac 0 la mot o hong — no tro
 * thanh mot `MatrixCell` co `failure`, khong phai mot o co quang duong bang 0.
 */
export function parseHereMatrix(
  payload: unknown,
  meta: { readonly providerId: string; readonly computedAt: string },
): readonly MatrixCell[] | null {
  const matrix = asRecord(asRecord(payload)?.matrix);
  if (!matrix) return null;

  const numOrigins = asFiniteNumber(matrix.numOrigins);
  const numDestinations = asFiniteNumber(matrix.numDestinations);
  const travelTimes = matrix.travelTimes;
  const distances = matrix.distances;
  if (numOrigins === null || numDestinations === null) return null;
  if (!Array.isArray(travelTimes) || !Array.isArray(distances)) return null;
  if (travelTimes.length !== numOrigins * numDestinations) return null;
  if (distances.length !== numOrigins * numDestinations) return null;

  const errorCodes = Array.isArray(matrix.errorCodes) ? matrix.errorCodes : null;
  const cells: MatrixCell[] = [];

  for (let originIndex = 0; originIndex < numOrigins; originIndex += 1) {
    for (let destinationIndex = 0; destinationIndex < numDestinations; destinationIndex += 1) {
      const flat = originIndex * numDestinations + destinationIndex;
      const errorCode = errorCodes ? asFiniteNumber(errorCodes[flat]) : 0;
      const distance = asFiniteNumber(distances[flat]);
      const travelTime = asFiniteNumber(travelTimes[flat]);

      if (errorCode !== null && errorCode !== 0) {
        cells.push({
          originIndex,
          destinationIndex,
          estimate: null,
          failure: {
            reason: 'ROUTE_NOT_FOUND',
            providerId: meta.providerId,
            // Chi ma so cua nha cung cap, khong phai than loi cua no. Xem `#277 M13`.
            detail: `Nha cung cap khong tinh duoc o nay (ma ${errorCode}).`,
          },
        });
        continue;
      }

      if (distance === null || travelTime === null) {
        cells.push({
          originIndex,
          destinationIndex,
          estimate: null,
          failure: {
            reason: 'PROVIDER_UNAVAILABLE',
            providerId: meta.providerId,
            detail: 'Phan hoi thieu quang duong hoac thoi gian cho o nay.',
          },
        });
        continue;
      }

      const estimate: RouteEstimate = {
        providerId: meta.providerId,
        providerProfile: 'here-routing-v8;transportMode=truck',
        quality: 'ROAD_NETWORK',
        roadDistanceMetres: distance,
        durationSeconds: travelTime,
        estimated: true,
        geometry: null,
        computedAt: meta.computedAt,
        fromCache: false,
      };
      cells.push({ originIndex, destinationIndex, estimate, failure: null });
    }
  }

  return cells;
}
