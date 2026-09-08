import type { BusinessDate } from '../business-date.js';
import type { VehicleStatus } from '../transport.types.js';

/**
 * BANG DOI XE + BAO CAO TUYEN — READ MODEL (#278 N6/N7).
 *
 * Cung luat voi `control-tower.types.ts`: khong mot cau tieng Viet nao o day. Moi thu la MA va con
 * so; cau chu la viec cua tang experience.
 */

/* ------------------------------------------------------------------ *
 * KHOANG THOI GIAN
 * ------------------------------------------------------------------ */

/**
 * `#278` N10: *"Time ranges must use tenant business-date/timezone semantics, not browser-local/UTC
 * accidents."*
 *
 * Nen khoang o day la HAI `BusinessDate` (`YYYY-MM-DD`) do may chu doc theo mui gio tenant, khong
 * phai hai `Date`. Mot `Date` di qua JSON thanh mot moc UTC, va `2026-09-08T17:00Z` la ngay 09/09 o
 * Asia/Ho_Chi_Minh — tuc mot bao cao "thang 9" se am tham nuot mat mot ngay o moi dau.
 */
export interface InsightRange {
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  /** So ngay LICH trong khoang, tinh ca hai dau. Mau so cua ty le su dung. */
  readonly businessDays: number;
}

/* ------------------------------------------------------------------ *
 * DOI XE
 * ------------------------------------------------------------------ */

/**
 * CONG THUC TY LE SU DUNG — viet ra thanh chuoi, va di CUNG so len man hinh.
 *
 * `#278` N7: *"Do not invent 'utilization' formula silently. Document exact numerator/denominator
 * and only use facts available in current system."*
 *
 * He nay KHONG co gio chay: `RunLeg` co `startedAt`/`completedAt` nhung ca hai deu nullable va phan
 * lon du lieu lich su khong co. Cai co that la NGAY NGHIEP VU cua tung chang. Nen mau so la so ngay
 * trong khoang, va tu so la so ngay ma chiec xe co it nhat mot chang khong huy.
 *
 * Do la mot ty le NGAY, khong phai ty le gio, va ten cua no phai noi ra dieu do — mot con so 40%
 * doc nhu "xe ranh 60% thoi gian" thi sai, no nghia la "xe khong chay 60% so NGAY".
 */
export const UTILISATION_FORMULA = 'ngayCoChangKhongHuy / ngayLichTrongKhoang' as const;

export interface VehicleInsight {
  readonly vehicleId: string;
  /** BIEN SO — dinh danh nghiep vu, thu duoc phep dat len dia chi. */
  readonly registrationPlate: string;
  readonly status: VehicleStatus;
  readonly runCount: number;
  /** Tu so cua `UTILISATION_FORMULA`. */
  readonly activeBusinessDays: number;
  /**
   * `activeBusinessDays / range.businessDays`, hoac `null` khi khoang rong.
   *
   * KHONG bao gio `0` thay cho "khong tinh duoc": mot khoang khong co ngay nao la mot cau hoi sai,
   * khong phai mot chiec xe khong chay.
   */
  readonly utilisation: number | null;
  /** `null` khi con chang thieu km — cung luat `summariseRunDistance`. */
  readonly loadedKm: number | null;
  readonly emptyKm: number | null;
  readonly totalKm: number | null;
  readonly emptyRatio: number | null;
  /** So chang thieu km — de nguoi van hanh biet vi sao cac o tren la dau gach. */
  readonly legsMissingDistance: number;
}

export interface FleetInsightView {
  readonly range: InsightRange;
  readonly utilisationFormula: typeof UTILISATION_FORMULA;
  readonly vehicles: readonly VehicleInsight[];
  /** DEM theo `VehicleStatus` — cung nguon voi thap dieu hanh, khong mot phep suy thu hai. */
  readonly presence: {
    readonly total: number;
    readonly idle: number;
    readonly onTrip: number;
    readonly underMaintenance: number;
  };
  /** Tong toan doi. `null` khi CON MOT chang nao thieu km — khong cong mot phan. */
  readonly totals: {
    readonly loadedKm: number | null;
    readonly emptyKm: number | null;
    readonly totalKm: number | null;
    readonly emptyRatio: number | null;
    readonly legsMissingDistance: number;
  };
}

/* ------------------------------------------------------------------ *
 * TUYEN
 * ------------------------------------------------------------------ */

/**
 * GOM TUYEN THEO NHAN TU DO — va bao cao NOI RA rang do la mot phep gom tam.
 *
 * `#278` N6: *"Do not group routes by fragile free-text labels if stable Site/location identities
 * exist. If only labels exist historically, use an explicit compatibility grouping and disclose the
 * limitation."*
 *
 * Tren `main` hom nay `RunLeg.originLabel`/`destinationLabel` la CHUOI TU DO va khong co khoa ngoai
 * nao toi `TransportCounterpartySite`. Nen chi con mot cach gom: chuan hoa chuoi (bo khoang thua,
 * ha chu thuong) roi ghep cap. "Kho Hai Phong" va "kho  hai phong" ra cung mot tuyen; "Kho Hai
 * Phong 2" thi khong — va do la mot HAN CHE, khong phai mot tinh nang.
 *
 * Ma nay di kem moi bao cao tuyen de man hinh in han che do ra, thay vi de nguoi doc tuong day la
 * mot phep gom theo dia diem co that.
 */
export const CORRIDOR_GROUPING = 'FREE_TEXT_LABEL_COMPATIBILITY' as const;

/**
 * QUY TAC QUY KM RONG ve mot tuyen — viet ra, vi khong co quy tac nao la hien nhien.
 *
 * `#278` N6 doi *"associated empty km / empty ratio according to a documented attribution rule"*.
 * Quy tac o day: mot chang RONG duoc quy cho chang CO HANG LIEN TRUOC no trong CUNG vong chay.
 *
 * Ly le: chang rong ton tai vi chiec xe vua tra hang xong va phai di tiep. No la CAI GIA cua chuyen
 * hang vua roi, nen no thuoc ve tuyen cua chuyen hang do. Chang rong dau tien cua mot vong chay
 * (bai -> diem lay hang dau) khong co chang co hang nao truoc no, nen no KHONG duoc quy cho tuyen
 * nao — quy no cho tuyen phia sau se lam tuyen dau tien cua moi vong chay luon nang hon su that.
 */
export const CORRIDOR_EMPTY_ATTRIBUTION = 'PRECEDING_LOADED_LEG_IN_SAME_RUN' as const;

export interface CorridorInsight {
  /** Khoa da chuan hoa — on dinh giua hai lan doc, KHONG hien len man hinh. */
  readonly corridorKey: string;
  /** Nhan doc duoc, lay tu lan xuat hien DAU TIEN theo thu tu ngay/chang. */
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly legCount: number;
  /** MA don da chay tuyen nay — duong lan nguoc ve ban ghi goc. */
  readonly orderCodes: readonly string[];
  /** MA vong chay — duong lan nguoc thu hai, va la cai man hinh mo ban do bang. */
  readonly runCodes: readonly string[];
  readonly loadedKm: number | null;
  /** TRUNG VI km cua cac chang co hang co so — chong lech vi mot chang nhap nham. */
  readonly medianLoadedKm: number | null;
  /** Km rong quy ve tuyen nay theo `CORRIDOR_EMPTY_ATTRIBUTION`. */
  readonly attributedEmptyKm: number | null;
  readonly legsMissingDistance: number;
}

export interface CorridorInsightView {
  readonly range: InsightRange;
  readonly grouping: typeof CORRIDOR_GROUPING;
  readonly emptyAttribution: typeof CORRIDOR_EMPTY_ATTRIBUTION;
  readonly corridors: readonly CorridorInsight[];
}
