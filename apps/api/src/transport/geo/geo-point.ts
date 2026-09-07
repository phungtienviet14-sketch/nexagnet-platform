/**
 * MOT BAN DINH VI, va cai gia phai tra khi tin no.
 *
 * Day la kieu gia tri duy nhat cua tang dia khong gian. No CO Y khong mang thoi diem, khong mang
 * do chinh xac va khong mang ai gui: ba thu do thuoc ve mot QUAN SAT (`LocationObservation`), con
 * o day chi la mot diem tren mat dat. Tron chung lai se khien moi ham hinh hoc phai biet ve phien
 * dang nhap cua tai xe — va do la duong ma mot tien ich toan hoc bien thanh mot phan cua nghiep vu.
 *
 * HE TOA DO: WGS84 (EPSG:4326), do thap phan. Khong nhan do-phut-giay, khong nhan chuoi.
 *
 * VI SAO KHONG DUNG MOT CRS CHIEU: Viet Nam vat qua hai mui UTM cua VN-2000 (EPSG:3405 mui 48N va
 * EPSG:3406 mui 49N, ranh o 108 do dong). Khong co MOT phep chieu phang nao dung cho ca nuoc, nen
 * moi phep do phai lam trong he cau/ellipsoid.
 */
export interface GeoPoint {
  /** Vi do, do thap phan, [-90, 90]. */
  readonly latitude: number;
  /** Kinh do, do thap phan, [-180, 180]. */
  readonly longitude: number;
}

/**
 * VI SAO PHAI TU CHOI (0, 0): do la ngoai khoi vinh Guinea — "Null Island". Khong mot xe tai nao
 * cua khach o do. Nhung rat nhieu tang phan mem tra ve dung cap so do khi CHUA CO DINH VI: mot
 * struct duoc zero-init, mot `parseFloat` that bai, mot truong JSON thieu. Neu ta nhan no, he
 * thong se ghi lai mot toa do "hop le" cho moi lan dinh vi hong, roi bao cao rang tai xe dang o
 * chau Phi. Tu choi tai bien la cach duy nhat de loi do noi ra loi cua no.
 */
export const NULL_ISLAND_TOLERANCE_DEGREES = 1e-9;

export type GeoPointRejection =
  | 'LATITUDE_NOT_FINITE'
  | 'LONGITUDE_NOT_FINITE'
  | 'LATITUDE_OUT_OF_RANGE'
  | 'LONGITUDE_OUT_OF_RANGE'
  | 'NULL_ISLAND';

export type GeoPointParse =
  | { readonly ok: true; readonly point: GeoPoint }
  | { readonly ok: false; readonly rejection: GeoPointRejection };

/**
 * Kiem mot cap so THO tu ngoai bien (than may, tep nhap, ban ghi cu) roi tra ve mot ket qua co
 * NHAN — khong nem. Nguoi goi la tang ingest, va no can ghi mot ma ly do vao nhat ky quyet dinh
 * chu khong can mot exception.
 */
export function parseGeoPoint(latitude: unknown, longitude: unknown): GeoPointParse {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    return { ok: false, rejection: 'LATITUDE_NOT_FINITE' };
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    return { ok: false, rejection: 'LONGITUDE_NOT_FINITE' };
  }
  if (latitude < -90 || latitude > 90) {
    return { ok: false, rejection: 'LATITUDE_OUT_OF_RANGE' };
  }
  if (longitude < -180 || longitude > 180) {
    return { ok: false, rejection: 'LONGITUDE_OUT_OF_RANGE' };
  }
  if (
    Math.abs(latitude) < NULL_ISLAND_TOLERANCE_DEGREES &&
    Math.abs(longitude) < NULL_ISLAND_TOLERANCE_DEGREES
  ) {
    return { ok: false, rejection: 'NULL_ISLAND' };
  }
  return { ok: true, point: { latitude, longitude } };
}

/**
 * Khung bao THO cua vung duong bo ma doi xe co the toi, de GAN CO chu KHONG de tu choi.
 *
 * DAY KHONG PHAI BIEN GIOI VIET NAM, va co y khong phai. Mot hinh chu nhat khong bao gio dien ta
 * duoc mot duong bien gioi: bat ky khung nao phu kin mien Bac Viet Nam deu phu luon mot dai cua
 * Lao va Van Nam. Neu goi no la "Viet Nam" thi nguoi doc log se tin vao mot dieu ma no khong noi.
 *
 * Cai no NOI duoc, va la ly do duy nhat no ton tai: phan biet mot toa do o dau do TRONG khu vuc
 * hoat dong voi mot toa do ro rang KHONG THE la mot chiec xe tai cua khach — Kansas, Bangkok,
 * Quang Chau. Do la mot phep kiem hop ly THO, va no chi gan co cho nguoi xem.
 *
 * Bien dong: bien dong duoc CO Y de ngoai (dung o 110 do dong, tuc qua mui dat lien xa nhat cua
 * Viet Nam o ~109,47 do). Mot chiec xe dau keo khong o ngoai bien. Keo khung ra toi cac quan dao
 * se lam no nuot luon Quang Chau — va luc do phep kiem khong con loai duoc gi.
 */
export const ROAD_NETWORK_BOUNDING_BOX = {
  minLatitude: 8.1,
  maxLatitude: 23.6,
  minLongitude: 102.1,
  maxLongitude: 110.0,
} as const;

/**
 * `true` khi diem nam trong khung hoat dong tho. Cac dai bien gioi cua Lao va Campuchia nam TRONG
 * khung — dung nhu mong doi, vi xe qua cua khau la chuyen binh thuong.
 */
export function isWithinRoadNetworkBoundingBox(point: GeoPoint): boolean {
  return (
    point.latitude >= ROAD_NETWORK_BOUNDING_BOX.minLatitude &&
    point.latitude <= ROAD_NETWORK_BOUNDING_BOX.maxLatitude &&
    point.longitude >= ROAD_NETWORK_BOUNDING_BOX.minLongitude &&
    point.longitude <= ROAD_NETWORK_BOUNDING_BOX.maxLongitude
  );
}
