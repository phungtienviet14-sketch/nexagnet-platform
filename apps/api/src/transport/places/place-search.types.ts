import type { GeoPoint } from '../geo/geo-point.js';

/**
 * KIEU cua tang TIM DIA DIEM (#379) — tim theo chu va tim nguoc tu mot diem tren ban do.
 *
 * ===========================================================================
 * KET QUA TIM KIEM LA MOT GOI Y, KHONG PHAI SU THAT CUA DON
 *
 * Mot `PlaceCandidate` chi di vao don khi NGUOI DUNG bam chon no; luc do toa do cua no tro thanh
 * toa do cua don va nhan chu chi con de hien thi. Tang nay khong bao gio tu ghi mot toa do nao vao
 * dau — no tra loi mot cau hoi roi quen.
 *
 * ===========================================================================
 * THAT BAI LA MOT KET QUA CO KIEU, KHONG PHAI MOT LOI HTTP
 *
 * Man hinh tao don VAN chay duoc khi tim kiem tat, ban, hay nha cung cap sap: nguoi dung chon tren
 * ban do, tu dia diem da biet, hoac "Vi tri cua toi". Nen mot lan tim khong ra ket qua duoc tra ve
 * nhu mot trang thai de man hinh noi cau dung, chu khong phai mot ma 5xx de man hinh doan.
 */

/** Mot goi y dia diem. `point` DA qua `parseGeoPoint` — ket qua hong bi bo tu tang parse. */
export interface PlaceCandidate {
  /** Ten ngan de hien thi ("Khu cong nghiep Dinh Vu"). */
  readonly label: string;
  /** Dia chi day du nha cung cap tra ve, hoac `null` khi khong co. */
  readonly address: string | null;
  readonly point: GeoPoint;
}

/**
 * VI SAO khong tim duoc. Moi ma dan toi MOT cau khac tren man hinh — gop hai ma lam mot se lam mot
 * su co cau hinh trong y het mot phut dong khach.
 */
export type PlaceLookupFailureReason =
  /** Nguoi van hanh chua bat nha cung cap nao (mac dinh), hoac khai mot ten la. */
  | 'PROVIDER_UNCONFIGURED'
  /** Nha cung cap chua nam trong danh sach ben thu ba duoc duyet cho du lieu khach that. */
  | 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA'
  /** Cong gioi han toan ung dung dang day — dung truoc khi goi ra ngoai. */
  | 'PROVIDER_BUSY'
  /** Nha cung cap tra 429. */
  | 'PROVIDER_RATE_LIMITED'
  /** Loi mang, het gio, ma trang thai khac 2xx, hoac than phan hoi sai hinh dang. */
  | 'PROVIDER_UNAVAILABLE';

export type PlaceLookupStatus = 'OK' | 'DISABLED' | 'BUSY' | 'UNAVAILABLE';

export type PlaceLookupOutcome<T> =
  | { readonly status: 'OK'; readonly value: T; readonly fromCache: boolean }
  | {
      readonly status: 'DISABLED' | 'BUSY' | 'UNAVAILABLE';
      readonly reason: PlaceLookupFailureReason;
    };

/** Nha cung cap co dung duoc khong — tra loi TRUOC khi ai do bam tim. */
export type PlaceSearchAvailability =
  | { readonly available: true; readonly providerId: string; readonly attribution: string }
  | {
      readonly available: false;
      readonly providerId: string;
      readonly reason: 'PROVIDER_UNCONFIGURED' | 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA';
    };

/**
 * Dong ghi nguon cua du lieu OpenStreetMap (ODbL). Nominatim tra ve du lieu OSM, va giay phep do
 * doi ghi nguon o moi cho hien thi ket qua — nen no di kem MOI phan hoi thanh cong.
 */
export const OPENSTREETMAP_ATTRIBUTION = '© OpenStreetMap contributors';

/* ------------------------------------------------------------------ *
 * Hinh dang phan hoi HTTP — luon 200, trang thai nam trong than
 * ------------------------------------------------------------------ */

export interface PlaceSearchResponse {
  readonly status: PlaceLookupStatus;
  readonly reason: PlaceLookupFailureReason | null;
  readonly results: readonly PlaceCandidate[];
  readonly attribution: string | null;
  readonly fromCache: boolean;
}

export interface PlaceReverseResponse {
  readonly status: PlaceLookupStatus;
  readonly reason: PlaceLookupFailureReason | null;
  readonly result: PlaceCandidate | null;
  readonly attribution: string | null;
  readonly fromCache: boolean;
}

/* ------------------------------------------------------------------ *
 * Dia diem DA BIET — doc tu hang rao, khong phai mot kho thu hai
 * ------------------------------------------------------------------ */

/**
 * Ba loai hang rao co nghia la "mot cho ta hay lay/giao hang".
 *
 * `FUEL_SUPPLIER` va `AD_HOC` CO Y vang mat: mot cay xang khong phai diem lay/giao cua mot don, va
 * mot hang rao tam la mot vong ve cho mot lan kiem, khong phai mot dia diem nguoi ta chon lai.
 */
export type KnownPlaceKind = 'DEPOT' | 'COUNTERPARTY_SITE' | 'CUSTOMER';

export interface KnownPlace {
  /** `TransportGeofence.id` — hang rao LA dia diem da biet. */
  readonly id: string;
  readonly kind: KnownPlaceKind;
  readonly name: string;
  /** Dong phu: ten phap nhan so huu dia diem (chi `COUNTERPARTY_SITE`), con lai `null`. */
  readonly detail: string | null;
  readonly point: GeoPoint;
  readonly radiusMetres: number;
}

export interface KnownPlacesResponse {
  /**
   * `false` khi khach khong bat `transport-proof` — khong co so hang rao nao de doc. KHAC voi
   * `true` kem danh sach rong ("co so, chua ai khai dia diem nao"), va man hinh noi hai cau khac.
   */
  readonly available: boolean;
  readonly places: readonly KnownPlace[];
}
