import type {
  BusinessDate,
  TollCandidate,
  TollProvider,
  TollTransactionKind,
} from './transport-types';

/**
 * GUONG cua be mat DOC ETC — `#314` (G8/G9). Nguon: `apps/api/src/transport/toll/toll-spend-report.ts`
 * va `toll-report.service.ts`.
 *
 * ==============================================================================================
 * VI SAO LA MOT TEP RIENG chu khong nam trong `transport-types.ts`
 * ==============================================================================================
 *
 * `transport-types.ts` dang duoc mot lane khac sua (#308). Cac kieu o day la MOI va chi phuc vu be
 * mat bao cao/doi ung, nen tach ra khong lam mat dieu gi — va tranh mot va cham khong can thiet.
 *
 * ==============================================================================================
 * KHONG MOT TRUONG NAO NOI VE TIEN DA TRA
 * ==============================================================================================
 *
 * `confirmed` nghia la MOT NGUOI DA NHIN dong do (`CONFIRMED`), khong phai tien da tra hay da hach
 * toan. `open` la dong con `PENDING`/`REOPENED`. So tien GIU NGUYEN DAU nhu bang ke.
 */

export interface TollSpendAmount {
  readonly rowCount: number;
  readonly amount: number;
}

export interface TollSpendProgress {
  readonly confirmed: TollSpendAmount;
  readonly open: TollSpendAmount;
}

/** Vi sao mot dong KHONG vao bang theo xe. `ACCOUNT_LEVEL` khong phai loi — xem nhan hien thi. */
export const TOLL_UNATTRIBUTED_REASONS = [
  'ACCOUNT_UNRESOLVED',
  'VEHICLE_UNRESOLVED',
  'AMBIGUOUS',
  'ACCOUNT_LEVEL',
] as const;
export type TollUnattributedReason = (typeof TOLL_UNATTRIBUTED_REASONS)[number];

export const TOLL_DUPLICATE_SPEND_STATES = ['SUSPECTED', 'DECLARED'] as const;
export type TollDuplicateSpendState = (typeof TOLL_DUPLICATE_SPEND_STATES)[number];

export interface TollVehicleSpendRow extends TollSpendProgress {
  readonly vehicleId: string;
  /** `null` = xe khong con trong doi xe. Hien ma xe — KHONG doan mot bien so. */
  readonly registrationPlate: string | null;
  /** `YYYY-MM`. */
  readonly month: string;
  readonly kind: TollTransactionKind;
  readonly currencyCode: string;
}

export interface TollUnattributedSpendRow extends TollSpendProgress {
  readonly reason: TollUnattributedReason;
  readonly month: string;
  readonly kind: TollTransactionKind;
  readonly currencyCode: string;
}

export interface TollDuplicateSpendRow {
  readonly state: TollDuplicateSpendState;
  readonly month: string;
  readonly kind: TollTransactionKind;
  readonly currencyCode: string;
  readonly total: TollSpendAmount;
}

export interface TollSpendTotalRow {
  readonly currencyCode: string;
  readonly kind: TollTransactionKind;
  readonly attributed: TollSpendProgress;
  readonly unattributed: TollSpendProgress;
  readonly excludedDuplicates: TollSpendAmount;
}

export interface TollSpendReport {
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly provider: TollProvider | null;
  /** Ngay nghiep vu CUA MAY CHU luc lap bao cao. */
  readonly generatedOn: BusinessDate;
  readonly vehicles: readonly TollVehicleSpendRow[];
  readonly unattributed: readonly TollUnattributedSpendRow[];
  readonly duplicates: readonly TollDuplicateSpendRow[];
  readonly totals: readonly TollSpendTotalRow[];
}

/** Ca ba deu TUY CHON: vang ky thi may chu lay thang nghiep vu hien tai theo mui gio khach. */
export interface TollSpendReportQuery {
  readonly from?: BusinessDate | null;
  readonly to?: BusinessDate | null;
  readonly provider?: TollProvider | null;
}

export interface TollDuplicatePeer {
  readonly candidate: TollCandidate;
  /** Nhan cua lan nap sinh ra dong doi ung. */
  readonly importLabel: string | null;
}

export interface TollDuplicatePeerListing {
  readonly candidateId: string;
  /** `false` = dong khong co dau van: he thong KHONG de xuat duoc — khac "khong co dong trung". */
  readonly fingerprintAvailable: boolean;
  readonly peers: readonly TollDuplicatePeer[];
  /** `true` = con dong doi ung ngoai so dong da tra ve. */
  readonly truncated: boolean;
}
