import type { BusinessDate } from '../business-date.js';
import type { DriverFundEntry, TripExpense } from './costing.types.js';
import type { DriverFundEntryKind, ExpenseFundingSource } from './driver-fund-ledger.js';

/**
 * DANH TINH CUA MOT LENH GHI — cai ma "cung khoa chong ghi trung" phai co nghia la "cung cai".
 *
 * ---------------------------------------------------------------------------
 * LOI DA CO O BAN T3 DAU (Issue #94 §3), va vi sao no im lang:
 *
 * Ban truoc so ba truong: `kind`, `signedAmount`, `businessDate`. Ba truong do KHONG chua mot chu
 * nao ve viec tien di vao SO QUY CUA AI. Nen:
 *
 * ```text
 * POST advances { driverId: A, amount: 100_000, businessDate: D, correlationKey: K }  -> ghi
 * POST advances { driverId: B, amount: 100_000, businessDate: D, correlationKey: K }  -> "phat lai"
 * ```
 *
 * Lan thu hai TRA VE BUT TOAN CUA LAI XE A va bao thanh cong. Lai xe B khong duoc ung dong nao,
 * so quy cua B khong doi, va **khong co loi nao duoc nem**. Ke toan thay 200 (khong phai 409), tin
 * la da ung xong, va dua tien mat cho B. Khoan do bien mat khoi so sach — chi lo ra o lan kiem ke
 * quy tiep theo, luc khong con ai nho hom do da xay ra chuyen gi.
 *
 * Mot 409 on ao thi nguoi ta doi khoa roi gui lai. Mot 200 sai thi khong ai lam gi ca.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA "DANH TINH" CHU KHONG PHAI MOT DANH SACH TRUONG DE SO:
 *
 * Danh sach de so thi lan them truong tiep theo (`evidenceLocator` cua T3, `fuelCardId` cua T4)
 * se KHONG duoc them vao phep so — va khong gi bao ca, vi phep so van bien dich va van xanh. Cach
 * duy nhat de lan quen do khong xay ra la de TRINH BIEN DICH dem: moi truong cua kieu danh tinh
 * phai co ten trong danh sach truong, neu khong thi khong build duoc (xem `Covers` duoi).
 *
 * Nen quy tac cho nguoi sua sau: them mot truong co the doi QUY KET KINH TE cua lenh thi them no
 * vao kieu danh tinh o day. Trinh bien dich se bat ban them not vao danh sach.
 */

/** Danh tinh kinh te cua MOT but toan so quy. */
export interface FundEntryIdentity {
  /** SO QUY CUA AI. Truong bi thieu o ban dau, va la truong nguy hiem nhat khi thieu. */
  readonly accountId: string;
  readonly kind: DriverFundEntryKind;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly tripId: string | null;
  readonly note: string | null;
}

/** Danh tinh kinh te cua MOT dong gia thanh chuyen. */
export interface TripExpenseIdentity {
  readonly tripId: string;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly fundedBy: ExpenseFundingSource;
  readonly categoryCode: string;
  /** LAI XE NAO chiu khoan chi. `null` cho `COMPANY_DIRECT`. */
  readonly driverId: string | null;
  readonly evidenceLocator: string | null;
  readonly note: string | null;
}

/**
 * KHOA COMPILE-TIME: moi truong cua `T` phai co ten trong danh sach truong.
 *
 * `Exclude<keyof T, Fields[number]>` la tap cac truong BI BO SOT. Neu tap do khong rong thi kieu
 * tra ve la `never` va lenh gan khong bien dich duoc — tuc "quen mot truong" la mot loi BUILD, chu
 * khong phai mot bai test co the vo tinh khong ai viet.
 */
type Covers<T, Fields extends readonly (keyof T)[]> =
  Exclude<keyof T, Fields[number]> extends never ? Fields : never;

const FUND_ENTRY_FIELDS = [
  'accountId',
  'kind',
  'signedAmount',
  'businessDate',
  'tripId',
  'note',
] as const satisfies Covers<
  FundEntryIdentity,
  ['accountId', 'kind', 'signedAmount', 'businessDate', 'tripId', 'note']
>;

const TRIP_EXPENSE_FIELDS = [
  'tripId',
  'signedAmount',
  'businessDate',
  'fundedBy',
  'categoryCode',
  'driverId',
  'evidenceLocator',
  'note',
] as const satisfies Covers<
  TripExpenseIdentity,
  [
    'tripId',
    'signedAmount',
    'businessDate',
    'fundedBy',
    'categoryCode',
    'driverId',
    'evidenceLocator',
    'note',
  ]
>;

/**
 * CHUAN HOA VAN BAN TU DO truoc khi so.
 *
 * `null`, `undefined`, `''` va `'  '` la CUNG MOT y dinh cua nguoi goi ("khong ghi chu gi"), nhung
 * la BON gia tri khac nhau voi `===`. Khong chuan hoa thi mot client gui lai y het lenh cu voi mot
 * dau cach thua se an 409 — va no se thu lai mai mai vi lan nao cung "khac".
 */
const text = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * MOT ham dung cho CA HAI phia cua phep so — lenh dang den, va hang da luu.
 *
 * Neu phia lenh chuan hoa `note` con phia hang doc nguyen van, thi mot lan gui lai y het se lech
 * van tay va an 409 mai mai. Chuan hoa hai noi bang hai doan ma la cach chac chan de dieu do xay ra
 * sau vai lan sua; nen o day chi co MOT cho chuan hoa.
 */
export const fundEntryIdentity = (raw: {
  readonly accountId: string;
  readonly kind: DriverFundEntryKind;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly tripId?: string | null;
  readonly note?: string | null;
}): FundEntryIdentity => ({
  accountId: raw.accountId,
  kind: raw.kind,
  signedAmount: raw.signedAmount,
  businessDate: raw.businessDate,
  tripId: raw.tripId ?? null,
  note: text(raw.note),
});

export const tripExpenseIdentity = (raw: {
  readonly tripId: string;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly fundedBy: ExpenseFundingSource;
  readonly categoryCode: string;
  readonly driverId?: string | null;
  readonly evidenceLocator?: string | null;
  readonly note?: string | null;
}): TripExpenseIdentity => ({
  tripId: raw.tripId,
  signedAmount: raw.signedAmount,
  businessDate: raw.businessDate,
  fundedBy: raw.fundedBy,
  categoryCode: raw.categoryCode,
  driverId: raw.driverId ?? null,
  evidenceLocator: text(raw.evidenceLocator),
  note: text(raw.note),
});

export const fundEntryIdentityOf = (entry: DriverFundEntry): FundEntryIdentity =>
  fundEntryIdentity(entry);

export const tripExpenseIdentityOf = (expense: TripExpense): TripExpenseIdentity =>
  tripExpenseIdentity(expense);

/**
 * VAN TAY cua mot lenh — mot chuoi, so bang `===`.
 *
 * Mot chuoi chu khong phai mot chuoi phep so tung truong: khi hai van tay lech nhau, thong diep
 * loi in ra duoc CA HAI ban va nguoi truc thay ngay truong nao khac. Mot `boolean` thi khong noi
 * duoc gi.
 */
const fingerprintOf = <T>(identity: T, fields: readonly (keyof T)[]): string =>
  JSON.stringify(fields.map((field) => identity[field] ?? null));

export const fundEntryFingerprint = (identity: FundEntryIdentity): string =>
  fingerprintOf(identity, FUND_ENTRY_FIELDS);

export const tripExpenseFingerprint = (identity: TripExpenseIdentity): string =>
  fingerprintOf(identity, TRIP_EXPENSE_FIELDS);

export const isSameFundEntry = (left: FundEntryIdentity, right: FundEntryIdentity): boolean =>
  fundEntryFingerprint(left) === fundEntryFingerprint(right);

export const isSameTripExpense = (left: TripExpenseIdentity, right: TripExpenseIdentity): boolean =>
  tripExpenseFingerprint(left) === tripExpenseFingerprint(right);
