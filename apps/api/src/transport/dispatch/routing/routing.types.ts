import type { GeoPoint } from '../../geo/geo-point.js';

/**
 * CONG DINH TUYEN TRUNG TINH VE NHA CUNG CAP — kieu (`#277 M4`).
 *
 * ===========================================================================
 * MOT DIEU KHONG CO O DAY, VA DO LA CA DIEM: khong mot ten nha cung cap nao xuat hien trong mot
 * KIEU. `providerId` la mot chuoi tu do vi no la SIEU DU LIEU KIEM TOAN ("con so nay tu dau ra"),
 * khong phai mot nhanh dieu kien. Ngay ma mot ham nghiep vu viet `if (provider === 'here')` la
 * ngay cong nay ngung la mot cong.
 *
 * `#277 M4`: *"Do not expose provider objects in domain models."*
 */

/**
 * HO SO XE TAI gui sang nha cung cap.
 *
 * MOI TRUONG DEU NULLABLE, va do la mot tuyen bo chu khong phai su de dai: `TransportVehicle` hom
 * nay CHI co `allowedPayloadKg`, `vehicleClass` va `currentOdoKm`. Khong co chieu cao, khong co
 * chieu rong, khong co tai trong truc. `#277 M5` viet thang: *"Do not fabricate missing
 * dimensions."*
 *
 * Dien mot con so "xe dau keo dien hinh" vao day se lam ca he thong dinh tuyen theo mot chiec xe
 * KHONG TON TAI — va cai gia phai tra khong phai mot bao cao lech, ma mot chiec xe that bi dan
 * vao mot gam cau that.
 */
export interface TruckProfile {
  /** Chieu cao, XENTIMET. Don vi cua `vehicle[height]` ben HERE — giu nguyen de khong doi hai lan. */
  readonly heightCm: number | null;
  readonly widthCm: number | null;
  readonly lengthCm: number | null;
  /** Tong tai trong ky thuat cho phep, KILOGAM. */
  readonly grossWeightKg: number | null;
  /** Khoi luong dang mang, KILOGAM. `null` khi khong ai do. */
  readonly currentWeightKg: number | null;
  /** Tai trong mot truc, KILOGAM. */
  readonly weightPerAxleKg: number | null;
  readonly axleCount: number | null;
  readonly trailerCount: number | null;
  /**
   * HO SO NAY DA DAY DU CHUA.
   *
   * `false` co nghia: nha cung cap se dinh tuyen theo mac dinh cua chinh no cho nhung truong con
   * trong, va ket qua CO THE di qua mot doan duong ma chiec xe that khong qua duoc. Con so van
   * dung de XEP HANG (ca doi xe deu thieu nhu nhau), nhung khong dung de DAN DUONG.
   */
  readonly complete: boolean;
  /** Ten cac truong dang thieu — de DTO noi duoc voi nguoi dung cai gi con trong. */
  readonly missingFields: readonly string[];
}

export const EMPTY_TRUCK_PROFILE: TruckProfile = {
  heightCm: null,
  widthCm: null,
  lengthCm: null,
  grossWeightKg: null,
  currentWeightKg: null,
  weightPerAxleKg: null,
  axleCount: null,
  trailerCount: null,
  complete: false,
  missingFields: [
    'heightCm',
    'widthCm',
    'lengthCm',
    'grossWeightKg',
    'weightPerAxleKg',
    'axleCount',
  ],
};

/**
 * DO TIN CAY cua mot con so quang duong/thoi gian — mot THANG, khong phai mot `boolean`.
 *
 * `ROAD_NETWORK` la con so do mot nha cung cap tinh tren mang luoi duong bo that.
 * `SYNTHETIC` la uoc luong tong hop cua chinh he nay khi chua co nha cung cap nao.
 *
 * Hai gia tri nay KHONG duoc gop, va khong duoc mac dinh thanh `ROAD_NETWORK`. Mot bang xep hang
 * dung so tong hop van la mot bang xep hang co ich — no van xep dung thu tu tuong doi trong phan
 * lon truong hop — nhung nguoi doc phai biet minh dang nhin cai gi truoc khi dieu mot chiec xe
 * 200 km.
 */
export type RouteEstimateQuality = 'ROAD_NETWORK' | 'SYNTHETIC';

export interface RouteEstimate {
  /** Ai tinh ra con so nay. Sieu du lieu kiem toan; KHONG duoc dung lam nhanh dieu kien. */
  readonly providerId: string;
  /** Phien ban/ho so cua nha cung cap, neu no noi. Giup doc lai mot ket qua cu. */
  readonly providerProfile: string | null;
  readonly quality: RouteEstimateQuality;
  /** Quang duong theo DUONG BO, met. */
  readonly roadDistanceMetres: number;
  /** Thoi gian di, giay. */
  readonly durationSeconds: number;
  /**
   * `true` khi con so la mot UOC LUONG — luon luon `true` o tang nay.
   *
   * Giu lai mot truong lam nhu la thua: no ton tai de khong ai o tang tren viet mot cau kieu
   * "quang duong THUC TE cua chang nay". Quang duong thuc te den tu GPS/dong ho km, khong tu mot
   * API ban do (`L6`).
   */
  readonly estimated: true;
  /** Hinh duong di, chi khi nguoi goi xin — `M4`: *"route geometry only where requested"*. */
  readonly geometry: readonly GeoPoint[] | null;
  /** Ket qua nay duoc tinh luc nao. Bat buoc, de mot so cu khong gia lam so song. */
  readonly computedAt: string;
  /** Lay lai tu bo nho dem hay vua goi nha cung cap. */
  readonly fromCache: boolean;
}

export type RoutingFailureReason =
  /** Khong co duong bo noi hai diem. Mot su that, khong phai mot su co. */
  | 'ROUTE_NOT_FOUND'
  /** Mang/nha cung cap khong tra loi, hoac tra loi khong doc duoc. */
  | 'PROVIDER_UNAVAILABLE'
  /** Nha cung cap tu choi vi vuot han muc. Tach rieng vi cach xu ly khac han. */
  | 'PROVIDER_RATE_LIMITED'
  /** Nha cung cap khong ho tro dieu duoc hoi (vd ho so xe tai o vung khong phu). */
  | 'PROVIDER_UNSUPPORTED'
  /** Yeu cau vuot tran ma tran cua chinh sach — chan TRUOC khi goi ra ngoai (`M12`). */
  | 'REQUEST_BOUND_EXCEEDED';

export interface RoutingFailure {
  readonly reason: RoutingFailureReason;
  readonly providerId: string;
  /**
   * Mot cau NGAN, an toan, do CHINH TANG NAY viet — khong bao gio la than loi cua nha cung cap.
   *
   * `#277 M13`: *"provider credentials/headers never appear in public DTO/logs"*. Cach re nhat de
   * lam ro ri mot khoa la chuyen tiep nguyen van mot thong bao loi HTTP co chua URL yeu cau.
   */
  readonly detail: string;
}

export type RouteOutcome =
  | { readonly ok: true; readonly estimate: RouteEstimate }
  | { readonly ok: false; readonly failure: RoutingFailure };

export interface RouteRequest {
  readonly origin: GeoPoint;
  readonly destination: GeoPoint;
  readonly truck: TruckProfile;
  /** Xin hinh duong di. Mac dinh khong — hinh la thu dat nhat trong mot phan hoi. */
  readonly withGeometry?: boolean;
  /**
   * Gio khoi hanh du kien, ISO. Dung cho nha cung cap co ho tro giao thong theo thoi diem.
   *
   * `null` = "bay gio". KHONG suy ra tu dong ho he thong o tang nay: mot ham dinh tuyen doc dong
   * ho la mot ham khong lap lai duoc trong bai kiem thu.
   */
  readonly departAt: string | null;
}

export interface MatrixRequest {
  readonly origins: readonly GeoPoint[];
  readonly destinations: readonly GeoPoint[];
  readonly truck: TruckProfile;
  readonly departAt: string | null;
}

/**
 * MOT O cua ma tran. `null` o `estimate` nghia la o do rieng no that bai — mot ma tran hong MOT o
 * khong duoc lam hong ca ma tran.
 */
export interface MatrixCell {
  readonly originIndex: number;
  readonly destinationIndex: number;
  readonly estimate: RouteEstimate | null;
  readonly failure: RoutingFailure | null;
}

export type MatrixOutcome =
  | { readonly ok: true; readonly cells: readonly MatrixCell[] }
  | { readonly ok: false; readonly failure: RoutingFailure };
