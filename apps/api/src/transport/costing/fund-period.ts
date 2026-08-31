import type { BusinessDate } from '../business-date.js';

/**
 * MAY TRANG THAI KY QUY LAI XE — nguon: T1 §7.3, `INV-22`, nguyen tac cua `GD-11`.
 *
 * ```text
 * OPEN --> CLOSING --> CLOSED --> REOPENED --> CLOSING --> ...
 * ```
 *
 * Ham THUAN, giong `trip-lifecycle.ts`. Neu repository tu gan `status` thi may trang thai chi con
 * la mot loi khuyen trong tai lieu, va mot ky nhay tu OPEN thang sang CLOSED se khong bi chan o
 * dau — no chi lo ra khi ai do doi chieu anh chup voi so cai va thay thieu mot buoc dong bang.
 *
 * ---------------------------------------------------------------------------
 * VI SAO `CLOSING` TON TAI THAT, khong phai mot trang thai trang tri:
 *
 * Dong ky la HAI buoc ghi, va chung CO Y khong nam trong cung mot giao dich:
 *
 *   1. `OPEN -> CLOSING`  — cam ghi vao ky, commit NGAY;
 *   2. chup anh roi `CLOSING -> CLOSED`.
 *
 * Neu gop lam mot giao dich thi trong suot luc tinh anh chup, ky VAN nhan duoc but toan moi tu
 * mot phien khac — va anh chup se noi mot con so ma so cai khong con dong y. Tach ra thi truong
 * hop xau nhat cua mot lan chet giua chung la mot ky ket o `CLOSING`: DONG BANG, khong mat du
 * lieu, va nguoi truc chi can goi lai lenh dong. Do la phia an toan.
 *
 * ---------------------------------------------------------------------------
 * `REOPENED` KHONG quay ve `OPEN`. Hai trang thai nay khac nhau o mot dieu doc duoc: mot ky
 * `REOPENED` la ky da tung duoc bao cao ra ngoai. Gop chung lai se xoa mat dung cai dau vet ma
 * `GD-11` doi ("mo lai can quyen rieng + audit").
 */

export const FUND_PERIOD_STATUSES = [
  /** Dang nhan but toan. */
  'OPEN',
  /** Da cam ghi, dang chup anh. Khong phai trang thai cuoi — nhung da DONG BANG. */
  'CLOSING',
  /** Da chot, co anh chup. */
  'CLOSED',
  /** Da mo lai boi nguoi co quyen rieng. Nhan but toan tro lai, nhung mang dau vet da tung chot. */
  'REOPENED',
] as const;
export type FundPeriodStatus = (typeof FUND_PERIOD_STATUSES)[number];

export const INITIAL_FUND_PERIOD_STATUS: FundPeriodStatus = 'OPEN';

const ALLOWED_EDGES: Readonly<Record<FundPeriodStatus, readonly FundPeriodStatus[]>> = {
  OPEN: ['CLOSING'],
  CLOSING: ['CLOSED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['CLOSING'],
};

/**
 * Trang thai DONG BANG — ky khong nhan them but toan nao co ngay nghiep vu roi vao no.
 *
 * `CLOSING` nam trong nhom nay chu khong o nhom "con ghi duoc": ky dong bang tu luc BAT DAU chot,
 * khong phai tu luc chot xong. Xem khoi chu thich dau tep.
 */
const FROZEN: readonly FundPeriodStatus[] = ['CLOSING', 'CLOSED'];

export const isFrozenFundPeriod = (status: FundPeriodStatus): boolean => FROZEN.includes(status);

export const FUND_PERIOD_TRANSITION_DENIED_REASONS = [
  'PERIOD_ALREADY_IN_STATE',
  'PERIOD_TRANSITION_NOT_PERMITTED',
] as const;
export type FundPeriodTransitionDeniedReason =
  (typeof FUND_PERIOD_TRANSITION_DENIED_REASONS)[number];

export type FundPeriodTransitionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: FundPeriodTransitionDeniedReason };

export function evaluateFundPeriodTransition(
  from: FundPeriodStatus,
  to: FundPeriodStatus,
): FundPeriodTransitionDecision {
  if (from === to) return { allowed: false, reason: 'PERIOD_ALREADY_IN_STATE' };
  if (!ALLOWED_EDGES[from].includes(to)) {
    return { allowed: false, reason: 'PERIOD_TRANSITION_NOT_PERMITTED' };
  }
  return { allowed: true };
}

/**
 * Mot ky co CHUA mot ngay nghiep vu khong — hai dau DEU TINH (khoang dong).
 *
 * So sanh CHUOI `YYYY-MM-DD` chu khong doi sang `Date`: dang nay sap xep tu vung trung voi sap
 * xep thoi gian, nen phep so sanh dung ma khong co mot phep doi mui gio nao chen vao giua. Doi
 * sang `Date` o day chinh la phep tinh ma `INV-25` sinh ra de xoa bo.
 */
export const periodCovers = (
  period: { readonly startDate: BusinessDate; readonly endDate: BusinessDate },
  businessDate: BusinessDate,
): boolean => period.startDate <= businessDate && businessDate <= period.endDate;

/** Hai khoang ngay co giao nhau khong — dung de chan hai ky chong lap cho cung mot so quy. */
export const periodsOverlap = (
  left: { readonly startDate: BusinessDate; readonly endDate: BusinessDate },
  right: { readonly startDate: BusinessDate; readonly endDate: BusinessDate },
): boolean => left.startDate <= right.endDate && right.startDate <= left.endDate;
