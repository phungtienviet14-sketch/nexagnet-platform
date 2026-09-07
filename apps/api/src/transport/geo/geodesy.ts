import type { GeoPoint } from './geo-point.js';

/**
 * HINH HOC TREN MAT CAU — tat dinh, khong doc DB, khong doc dong ho, khong goi mang.
 *
 * MO HINH: hinh cau ban kinh trung binh, KHONG phai ellipsoid WGS84. Sai so toi da cua mo hinh
 * cau so voi ellipsoid la khoang 0,5% (thuong ~0,3%). Doi voi ba viec ma tang nay phuc vu, sai so
 * do khong doi duoc mot ket luan nao:
 *
 *   · hang rao dia ly ban kinh 200 m  -> sai +-1 m;
 *   · di chuyen bat kha thi nguong 55 m/s (198 km/h) -> sai +-0,3 m/s tren mot nguong da co bien;
 *   · doan duong 100 km              -> sai +-500 m, trong khi so nay chi de nguoi doc uoc luong.
 *
 * Neu mot ngay nao do co bai toan CAN do chinh xac milimet (do dac, phap ly ve ranh gioi), thi do
 * la luc goi PostGIS `ST_Distance(geography)` — chu khong phai luc lam ham nay phuc tap hon.
 *
 * VI SAO HAVERSINE chu khong phai cong thuc cosin cau: cong thuc cosin mat het do chinh xac o
 * khoang cach ngan vi `acos` cua mot so rat gan 1 — dung o do chinh la truong hop pho bien nhat
 * cua he nay (hai ban dinh vi cach nhau vai met khi xe dung yen). Haversine giu duoc do chinh xac
 * o dau ngan.
 */

/**
 * Ban kinh trung binh so hoc cua Trai Dat theo IUGG: R1 = (2a + b) / 3 tren ellipsoid WGS84.
 * Day cung la ban kinh ma PostGIS dung khi tinh tren hinh cau, nen hai ben so sanh duoc voi nhau.
 */
export const EARTH_MEAN_RADIUS_METRES = 6_371_008.8;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function haversin(theta: number): number {
  const s = Math.sin(theta / 2);
  return s * s;
}

/** Khoang cach cung lon giua hai diem, tinh bang met. */
export function greatCircleMetres(from: GeoPoint, to: GeoPoint): number {
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const deltaLat = (to.latitude - from.latitude) * DEG_TO_RAD;
  const deltaLon = (to.longitude - from.longitude) * DEG_TO_RAD;

  const h = haversin(deltaLat) + Math.cos(lat1) * Math.cos(lat2) * haversin(deltaLon);
  // `min(1, ...)` chan sai so dau phay dong day `h` vuot 1 o hai diem gan doi tam, khien `asin`
  // tra ve NaN. Mot NaN o day se chay am tham qua moi phep so sanh nguong ben duoi.
  return 2 * EARTH_MEAN_RADIUS_METRES * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Huong di BAN DAU (forward azimuth) tu `from` toi `to`, do, trong [0, 360).
 *
 * "Ban dau" khong phai chi tiet thua: tren mat cau, huong doc theo mot cung lon THAY DOI lien tuc.
 * Chi so o diem xuat phat moi so sanh duoc voi huong ma thiet bi bao.
 */
export function initialBearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const deltaLon = (to.longitude - from.longitude) * DEG_TO_RAD;

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearing = Math.atan2(y, x) * RAD_TO_DEG;
  return (bearing + 360) % 360;
}

/**
 * Toc do mat dat suy ra tu hai ban dinh vi va khoang thoi gian giua chung.
 *
 * `null` khi khoang thoi gian khong duong. KHONG nem va KHONG tra 0: mot khoang thoi gian bang 0
 * co nghia la "khong noi duoc gi ve toc do", con 0 co nghia la "dung yen". Gop hai thu do lai se
 * lam moi phep kiem di chuyen bat kha thi im lang bo qua dung cai truong hop dang ngo nhat —
 * hai ban ghi mang cung mot dau thoi gian.
 */
export function groundSpeedMetresPerSecond(
  from: GeoPoint,
  to: GeoPoint,
  elapsedSeconds: number,
): number | null {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return null;
  }
  return greatCircleMetres(from, to) / elapsedSeconds;
}
