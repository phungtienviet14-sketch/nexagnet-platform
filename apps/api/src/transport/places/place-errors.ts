import type { PlaceWriteReason } from './place-admin-decisions.js';

/**
 * MA TU CHOI DAU VAO cua tang TIM DIA DIEM (#379) va QUAN TRI DIA DIEM VAN HANH (#395).
 *
 * Tach khoi `place-decisions.ts` theo quy uoc cua mien van tai: tep kia tra loi "he thong quyet
 * dinh gi" (nguoi doc trace), tep nay tra loi "nguoi goi API gui cai gi sai" (nguoi bam nut).
 *
 * Tim kiem that bai (tat, ban, nha cung cap sap) KHONG nam o day: do la ket qua co kieu tra ve voi
 * ma 200, khong phai loi cua nguoi goi. Tep nay chi import KIEU (khong mot dong ma chay nao).
 */
export const TRANSPORT_PLACE_ERROR_REASONS = [
  /** Diem gui len de tim nguoc khong qua duoc `parseGeoPoint` (ngoai bien, NaN, Null Island). */
  'PLACE_POINT_INVALID',
] as const;

/**
 * Ma tu choi DAU VAO cua man "Dia diem van hanh" (`#395`). Ly do QUYET DINH (trung ten, bai xe
 * dang bat, viec dang mo...) nam o `place-admin-decisions.ts` — `PLACE_WRITE_REASONS`.
 */
export const PLACE_ADMIN_ERROR_REASONS = [
  /** Khong co dia diem van hanh nao mang ma do (hoac do la mot hang rao khong quan ly o day). */
  'PLACE_NOT_FOUND',
  /** Dia diem cua don vi khac phai noi ro cua ai: khach hang, don vi co san, hay don vi moi. */
  'PLACE_OWNER_REQUIRED',
  /** Chu cua dia diem khai sai hinh (vd bai xe kem chu, hoac vua chu vua dia diem co san). */
  'PLACE_OWNER_INVALID',
  /** Chu cua dia diem (don vi / khach hang) da ngung hoat dong. */
  'PLACE_OWNER_INACTIVE',
  /** Dia diem co san duoc chon da co hang rao — sua no o chinh dia diem do. */
  'PLACE_SITE_ALREADY_FENCED',
  /** Dia diem co san duoc chon khong thuoc don vi da chon. */
  'PLACE_SITE_OWNER_MISMATCH',
  /** Chi bai xe moi "doi thanh bai chinh" duoc. */
  'PLACE_NOT_A_DEPOT',
] as const;

export type TransportPlaceErrorReason =
  | (typeof TRANSPORT_PLACE_ERROR_REASONS)[number]
  | (typeof PLACE_ADMIN_ERROR_REASONS)[number]
  | PlaceWriteReason;
