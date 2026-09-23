/**
 * MA TU CHOI DAU VAO cua tang TIM DIA DIEM (#379).
 *
 * Tach khoi `place-decisions.ts` theo quy uoc cua mien van tai: tep kia tra loi "he thong quyet
 * dinh gi" (nguoi doc trace), tep nay tra loi "nguoi goi API gui cai gi sai" (nguoi bam nut).
 *
 * Tim kiem that bai (tat, ban, nha cung cap sap) KHONG nam o day: do la ket qua co kieu tra ve voi
 * ma 200, khong phai loi cua nguoi goi. Tep nay CO Y khong import gi.
 */
export const TRANSPORT_PLACE_ERROR_REASONS = [
  /** Diem gui len de tim nguoc khong qua duoc `parseGeoPoint` (ngoai bien, NaN, Null Island). */
  'PLACE_POINT_INVALID',
] as const;
export type TransportPlaceErrorReason = (typeof TRANSPORT_PLACE_ERROR_REASONS)[number];
