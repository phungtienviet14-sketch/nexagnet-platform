import type { BusinessDate } from '../business-date.js';
import { normalizeTollPlate } from './toll-identity.js';

/**
 * ANH XA TAI KHOAN GIAO THONG <-> XE — ham THUAN, khong cham DB.
 *
 * ===========================================================================
 * BAT BIEN NAY LA MOT DIEU LUAT, KHONG PHAI MOT LUA CHON THIET KE.
 *
 * ND 119/2024/ND-CP Dieu 11 khoan 3:
 *
 *   "Moi tai khoan giao thong co the su dung de chi tra cho NHIEU phuong tien tham gia giao thong
 *    thuoc so huu cua chu phuong tien; moi phuong tien tham gia giao thong CHI DUOC NHAN CHI TRA
 *    TU MOT TAI KHOAN GIAO THONG."
 *
 * Nua dau ai cung biet. Nua sau moi la thu cuong che duoc, va no doi mot bang noi thanh mot LICH
 * SU CO HIEU LUC: tai moi khoanh khac, mot xe chi duoc co DUNG MOT doan dang mo.
 *
 * "Xe doi tai khoan" (yeu cau cua #269 J2) vi the la DONG doan cu roi MO doan moi — khong bao gio
 * la them mot doan thu hai.
 *
 * Tep nay giu bat bien do o tang MIEN. Postgres giu no lan thu hai bang mot unique index BO PHAN,
 * va lan thu hai moi la lan dung khi co hai nguoi ghi cung luc.
 */

export interface TollLinkPeriod {
  readonly effectiveFrom: BusinessDate;
  /** `null` = dang hieu luc, khong co diem ket. */
  readonly effectiveTo: BusinessDate | null;
}

/**
 * HAI DAU DEU TINH — cung quy uoc voi ky bang ke.
 *
 * Neu ngay dong cua doan cu va ngay mo cua doan moi trung nhau ma coi la khong chong, thi trong
 * DUNG mot ngay do chiec xe nhan chi tra tu HAI tai khoan — va mot luot qua tram hom do khong
 * biet thuoc ve ai. Mot ngay la du de mot ky doi soat lech.
 *
 * `null` duoc doc thanh "vo cung" chu khong thanh mot ngay cu the: mot doan dang mo chan MOI doan
 * bat dau sau no, khong chi doan ke tiep.
 */
export function tollPeriodsOverlap(left: TollLinkPeriod, right: TollLinkPeriod): boolean {
  const leftEnd = left.effectiveTo;
  const rightEnd = right.effectiveTo;
  const leftStartsAfterRightEnds = rightEnd !== null && left.effectiveFrom > rightEnd;
  const rightStartsAfterLeftEnds = leftEnd !== null && right.effectiveFrom > leftEnd;
  return !leftStartsAfterRightEnds && !rightStartsAfterLeftEnds;
}

/** Mot khoang co ngay dong TRUOC ngay mo la mot khoang khong co that. */
export const tollLinkPeriodInvalid = (candidate: TollLinkPeriod): boolean =>
  candidate.effectiveTo !== null && candidate.effectiveTo < candidate.effectiveFrom;

/**
 * Doan moi co cham doan nao DA CO cua CHIEC XE DO khong.
 *
 * Do tren MOI doan chu khong chi doan cuoi: mot ban ghi chen vao GIUA hai doan cu la truong hop
 * that (nhap bu lich su cua nam ngoai), va mot phep do chi nhin doan gan nhat se cho no di qua.
 */
export const vehicleLinkConflict = (
  existingForVehicle: readonly TollLinkPeriod[],
  candidate: TollLinkPeriod,
): boolean => existingForVehicle.some((existing) => tollPeriodsOverlap(existing, candidate));

/* ====================================================================== *
 * DOC MOT DONG VE DUNG CHIEC XE
 * ====================================================================== */

export interface TollActiveLinkView {
  readonly vehicleId: string;
  /** Bien so dang ky cua xe trong doi xe cua ta — KHONG phai chuoi doc tu tep. */
  readonly vehiclePlate: string;
  readonly providerVehicleRef: string | null;
  readonly effectiveFrom: BusinessDate;
  readonly effectiveTo: BusinessDate | null;
}

export interface TollVehicleResolutionInput {
  /** Cac ban ghi noi CUA DUNG TAI KHOAN tren dong giao dich do. Nguoi goi da loc theo tai khoan. */
  readonly links: readonly TollActiveLinkView[];
  readonly onDate: BusinessDate;
  readonly plateRaw: string | null;
  readonly providerVehicleRef: string | null;
}

export type TollVehicleResolution =
  | { readonly kind: 'RESOLVED'; readonly vehicleId: string }
  | { readonly kind: 'UNRESOLVED' }
  | { readonly kind: 'AMBIGUOUS'; readonly vehicleIds: readonly string[] };

const effectiveOn = (link: TollActiveLinkView, date: BusinessDate): boolean =>
  link.effectiveFrom <= date && (link.effectiveTo === null || date <= link.effectiveTo);

/**
 * DOC mot dong ve mot chiec xe — QUA BAN GHI NOI, khong qua doi xe.
 *
 * ===========================================================================
 * VI SAO KHONG TRA CUU BIEN SO THANG TRONG DOI XE:
 *
 * Vi D.11 kh.3. Neu mot dong tren tai khoan X mang bien so cua mot chiec xe dang noi voi tai khoan
 * Y, thi do KHONG phai mot phep doc thanh cong — do la mot BAT THUONG that su, va no phai den tay
 * nguoi doi soat. Tra cuu thang trong doi xe se lang le "doc thanh cong" dung cai bat thuong do.
 *
 * Nen tap ung vien luon la cac ban ghi noi CUA CHINH TAI KHOAN DO, dang hieu luc VAO NGAY do.
 *
 * ===========================================================================
 * MA THE DAU CUOI DUOC UU TIEN HON BIEN SO:
 *
 * ND 119 Phu luc liet ke "ma dinh danh the dau cuoi" trong thong tin tai khoan. No BEN HON bien
 * so: xe sang ten thi bien so doi, the van the do. Nen neu ca hai cung co mat, ma the thang.
 *
 * (Chua do duoc ma do co xuat hien tren tep xuat hay khong — xem `transport-etc-ingestion.md`
 * §2.3 muc `UNKNOWN`. Nen day la mot duong DU PHONG san sang, khong phai mot duong bat buoc.)
 */
export function resolveLinkedVehicle(input: TollVehicleResolutionInput): TollVehicleResolution {
  const active = input.links.filter((link) => effectiveOn(link, input.onDate));

  const ref = input.providerVehicleRef?.trim();
  if (ref !== undefined && ref !== '') {
    const byRef = active.filter((link) => link.providerVehicleRef === ref);
    if (byRef.length > 0) return decide(byRef);
  }

  if (input.plateRaw === null) return { kind: 'UNRESOLVED' };
  const plate = normalizeTollPlate(input.plateRaw);
  if (plate === '') return { kind: 'UNRESOLVED' };

  return decide(active.filter((link) => normalizeTollPlate(link.vehiclePlate) === plate));
}

/**
 * KHONG BAO GIO NHAT DAI LAY CAI DAU TIEN.
 *
 * #269 J2 noi thang: *"ambiguous/unknown plate never silently maps to the first vehicle"*. Mot
 * phep chon bua o day khong bao gio lo ra nhu mot loi — no lo ra nhu mot chi phi phi duong bo gan
 * nham xe, sau khi bao cao da phat.
 *
 * `sort()` de ket qua ON DINH: hai lan chay tren cung du lieu phai cho cung mot danh sach, neu
 * khong thi mot bai test se do ngau nhien va khong ai tim ra vi sao.
 */
function decide(matched: readonly TollActiveLinkView[]): TollVehicleResolution {
  const ids = [...new Set(matched.map((link) => link.vehicleId))].sort();
  if (ids.length === 0) return { kind: 'UNRESOLVED' };
  const only = ids[0];
  if (ids.length === 1 && only !== undefined) return { kind: 'RESOLVED', vehicleId: only };
  return { kind: 'AMBIGUOUS', vehicleIds: ids };
}
