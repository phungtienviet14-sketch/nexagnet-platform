import {
  BusinessDateError,
  assertBusinessDate,
  businessDateDifferenceInDays,
  type BusinessDate,
} from '../business-date.js';
import { money } from '../money.js';
import {
  TOLL_TRANSACTION_KINDS,
  type TollProvider,
  type TollTransactionKind,
} from './toll-provider.port.js';
import type { TollVehicleFacts } from './toll.ports.js';
import type { TollMatchState, TollReviewState } from './toll.types.js';

/**
 * BAO CAO CHI PHI ETC THEO XE / KY — `#314` G9. Ham THUAN, khong cham DB.
 *
 * ============================================================================================
 * NAM LOI HUA, VA MOI LOI HUA LA MOT CACH MOT BAO CAO TIEN CO THE NOI DOI
 * ============================================================================================
 *
 *   1. CHI dong `MATCHED` co `vehicleId` moi vao bang theo xe. Ba trang thai "chua ro" nam o bang
 *      RIENG va KHONG BAO GIO duoc chia cho mot chiec xe — ke ca khi mot dong lo mang `vehicleId`.
 *      TRANG THAI quyet dinh, khong phai su co mat cua mot cot.
 *   2. Dong TRUNG khong vao tong chi phi nao. `toll-classification.ts` CO Y giu `vehicleId` tren dong
 *      nghi trung (de nguoi doi soat thay ca hai mat cua cap trung); doc cot do thay vi trang thai
 *      se lam chi phi cua xe gap doi moi khi mot giao dich ve qua hai tep.
 *   3. `CONFIRMED` nghia la MOT NGUOI DA NHIN dong do — khong phai tien da tra hay da hach toan.
 *      Khong truong nao o day mang chu `paid`/`settled`/`accounted` (#269 J7, #295).
 *   4. So tien GIU NGUYEN DAU nhu bang ke va KHONG netting giua cac loai giao dich: nap tien la tien
 *      di VAO tai khoan, cong no voi luot qua tram se ra mot con so khong tra loi cau hoi nao. Quy
 *      uoc dau cua tung nha cung cap van la `CUSTOMER SAMPLE REQUIRED`, nen tang nay khong lat dau.
 *   5. Hai loai tien KHONG bao gio cong vao nhau (`GD-03`).
 *
 * Va KHONG co mot o nao ve lai xe: ETC la CONG TY TRA (#229 §8).
 */

/** Mot bao cao toi da mot nam (ca nam nhuan). Rong hon thi chia ky — con so nay giu truy van co bien. */
export const TOLL_SPEND_REPORT_MAX_DAYS = 366;

export interface TollSpendWindow {
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly provider: TollProvider | null;
}

/**
 * MOT NHOM dong da doc duoc, NHU KHO GOM RA — cung (xe, ngay, loai, trang thai, loai tien).
 *
 * Chi dong `ACCEPTED` co mat o day: dong bi tu choi luc doc khong co so tien de cong.
 */
export interface TollSpendBucket {
  readonly vehicleId: string | null;
  readonly businessDate: BusinessDate;
  readonly kind: TollTransactionKind;
  readonly matchState: TollMatchState;
  readonly reviewState: TollReviewState;
  readonly currencyCode: string;
  /** `true` = mot nguoi doi soat da noi dong nay TRUNG voi mot dong khac (`duplicateOfCandidateId`). */
  readonly duplicateDeclared: boolean;
  readonly rowCount: number;
  /** Tong `signedAmount` cua nhom, so nguyen DONG, CO DAU. */
  readonly amount: number;
}

export interface TollSpendAmount {
  readonly rowCount: number;
  readonly amount: number;
}

/** Tach theo TIEN DO DOI SOAT — khong theo thanh toan. */
export interface TollSpendProgress {
  /** Da co nguoi xac nhan (`CONFIRMED`). */
  readonly confirmed: TollSpendAmount;
  /** Chua xong: `PENDING` hoac `REOPENED`. */
  readonly open: TollSpendAmount;
}

/**
 * VI SAO MOT DONG KHONG VAO BANG THEO XE.
 *
 * `ACCOUNT_LEVEL` KHONG phai mot loi: nap tien / phi tai khoan xay ra o muc tai khoan va khong co
 * chiec xe nao trong do. Ba ly do con lai la viec con cho mot con nguoi.
 */
export const TOLL_UNATTRIBUTED_REASONS = [
  'ACCOUNT_UNRESOLVED',
  'VEHICLE_UNRESOLVED',
  'AMBIGUOUS',
  'ACCOUNT_LEVEL',
] as const;
export type TollUnattributedReason = (typeof TOLL_UNATTRIBUTED_REASONS)[number];

/** `SUSPECTED` = may nghi, chua ai quyet · `DECLARED` = mot nguoi da noi dong nay trung. */
export const TOLL_DUPLICATE_SPEND_STATES = ['SUSPECTED', 'DECLARED'] as const;
export type TollDuplicateSpendState = (typeof TOLL_DUPLICATE_SPEND_STATES)[number];

export interface TollVehicleSpendRow extends TollSpendProgress {
  readonly vehicleId: string;
  /** `null` = xe khong con trong doi xe. Man hinh hien ma xe — KHONG doan mot bien so. */
  readonly registrationPlate: string | null;
  /** `YYYY-MM` cua ngay nghiep vu. */
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

/** Tong theo (loai tien, loai giao dich) — KHONG co mot tong nao gop hai loai giao dich. */
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
  /** Ngay nghiep vu cua MAY CHU luc lap bao cao — man hinh noi ra moc nay, khong lay dong ho trinh duyet. */
  readonly generatedOn: BusinessDate;
  readonly vehicles: readonly TollVehicleSpendRow[];
  readonly unattributed: readonly TollUnattributedSpendRow[];
  readonly duplicates: readonly TollDuplicateSpendRow[];
  readonly totals: readonly TollSpendTotalRow[];
}

/* ------------------------------------------------------------------ *
 * Ky bao cao
 * ------------------------------------------------------------------ */

/**
 * KY BAO CAO, voi mac dinh la THANG NGHIEP VU HIEN TAI cua may chu.
 *
 * `today` den tu nguoi goi (dong ho may chu + mui gio khach), khong tu `new Date()` o day: mot ham
 * thuan doc dong ho la mot ham khong kiem duoc, va mot trinh duyet lech mui gio khong duoc doi nghia
 * cua chu "thang nay".
 */
export function resolveTollSpendWindow(
  input: {
    readonly from: string | null;
    readonly to: string | null;
    readonly provider: TollProvider | null;
  },
  today: BusinessDate,
): TollSpendWindow {
  const from = assertBusinessDate(input.from ?? `${today.slice(0, 7)}-01`);
  const to = assertBusinessDate(input.to ?? today);
  if (from > to) {
    throw new BusinessDateError(
      `Ngay bat dau (${from}) phai truoc hoac bang ngay ket thuc (${to})`,
    );
  }
  const days = businessDateDifferenceInDays(from, to) + 1;
  if (days > TOLL_SPEND_REPORT_MAX_DAYS) {
    throw new BusinessDateError(
      `Mot bao cao chi phi ETC toi da ${String(TOLL_SPEND_REPORT_MAX_DAYS)} ngay, nhan duoc ${String(days)} ngay`,
    );
  }
  return { from, to, provider: input.provider };
}

/* ------------------------------------------------------------------ *
 * Xep tung nhom vao DUNG MOT bang
 * ------------------------------------------------------------------ */

type Placement =
  | { readonly table: 'VEHICLE'; readonly vehicleId: string }
  | { readonly table: 'UNATTRIBUTED'; readonly reason: TollUnattributedReason }
  | { readonly table: 'DUPLICATE'; readonly state: TollDuplicateSpendState };

/**
 * MOT nhom vao DUNG MOT bang — thu tu cac phep so la mot phan cua hop dong.
 *
 * Trung truoc het: mot dong da bi noi la trung thi no khong con la chi phi, bat ke no dang mang
 * trang thai khop xe nao. Sau do moi den trang thai khop xe.
 */
function placeBucket(bucket: TollSpendBucket): Placement {
  if (bucket.duplicateDeclared) return { table: 'DUPLICATE', state: 'DECLARED' };
  switch (bucket.matchState) {
    case 'DUPLICATE_CANDIDATE':
      return { table: 'DUPLICATE', state: 'SUSPECTED' };
    case 'MATCHED':
      return bucket.vehicleId === null
        ? { table: 'UNATTRIBUTED', reason: 'ACCOUNT_LEVEL' }
        : { table: 'VEHICLE', vehicleId: bucket.vehicleId };
    case 'ACCOUNT_UNRESOLVED':
    case 'VEHICLE_UNRESOLVED':
    case 'AMBIGUOUS':
      return { table: 'UNATTRIBUTED', reason: bucket.matchState };
  }
}

const ZERO: TollSpendAmount = { rowCount: 0, amount: 0 };
const ZERO_PROGRESS: TollSpendProgress = { confirmed: ZERO, open: ZERO };

/** Cong co kiem bien: qua `money()` de mot tong vuot `2^53-1` NEM thay vi mat chinh xac im lang. */
const plus = (left: TollSpendAmount, right: TollSpendAmount): TollSpendAmount => ({
  rowCount: left.rowCount + right.rowCount,
  amount: money(money(left.amount).amount + money(right.amount).amount).amount,
});

const addToProgress = (progress: TollSpendProgress, bucket: TollSpendBucket): TollSpendProgress => {
  const part = { rowCount: bucket.rowCount, amount: bucket.amount };
  return bucket.reviewState === 'CONFIRMED'
    ? { confirmed: plus(progress.confirmed, part), open: progress.open }
    : { confirmed: progress.confirmed, open: plus(progress.open, part) };
};

const monthOf = (date: BusinessDate): string => date.slice(0, 7);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const kindRank = (kind: TollTransactionKind): number => TOLL_TRANSACTION_KINDS.indexOf(kind);

/* ------------------------------------------------------------------ *
 * Lap bao cao
 * ------------------------------------------------------------------ */

export interface BuildTollSpendReportInput {
  readonly window: TollSpendWindow;
  readonly generatedOn: BusinessDate;
  readonly buckets: readonly TollSpendBucket[];
  readonly vehicles: readonly TollVehicleFacts[];
}

interface Keyed<Row> {
  readonly sortKey: readonly (string | number)[];
  readonly row: Row;
}

const compareKeys = (
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): number => {
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return compareText(String(a), String(b));
  }
  return 0;
};

const sorted = <Row>(entries: Iterable<Keyed<Row>>): readonly Row[] =>
  [...entries]
    .sort((left, right) => compareKeys(left.sortKey, right.sortKey))
    .map((entry) => entry.row);

export function buildTollSpendReport(input: BuildTollSpendReportInput): TollSpendReport {
  const plateOf = new Map(input.vehicles.map((vehicle) => [vehicle.id, vehicle.registrationPlate]));

  const vehicles = new Map<string, Keyed<TollVehicleSpendRow>>();
  const unattributed = new Map<string, Keyed<TollUnattributedSpendRow>>();
  const duplicates = new Map<string, Keyed<TollDuplicateSpendRow>>();
  const totals = new Map<string, Keyed<TollSpendTotalRow>>();

  for (const bucket of input.buckets) {
    const month = monthOf(bucket.businessDate);
    const { kind, currencyCode } = bucket;
    const placement = placeBucket(bucket);

    const totalKey = `${currencyCode}|${kind}`;
    const total = totals.get(totalKey)?.row ?? {
      currencyCode,
      kind,
      attributed: ZERO_PROGRESS,
      unattributed: ZERO_PROGRESS,
      excludedDuplicates: ZERO,
    };

    if (placement.table === 'VEHICLE') {
      const key = `${placement.vehicleId}|${month}|${kind}|${currencyCode}`;
      const registrationPlate = plateOf.get(placement.vehicleId) ?? null;
      const current = vehicles.get(key)?.row ?? {
        vehicleId: placement.vehicleId,
        registrationPlate,
        month,
        kind,
        currencyCode,
        ...ZERO_PROGRESS,
      };
      vehicles.set(key, {
        sortKey: [
          registrationPlate ?? placement.vehicleId,
          placement.vehicleId,
          month,
          kindRank(kind),
          currencyCode,
        ],
        row: { ...current, ...addToProgress(current, bucket) },
      });
      totals.set(totalKey, {
        sortKey: [currencyCode, kindRank(kind)],
        row: { ...total, attributed: addToProgress(total.attributed, bucket) },
      });
      continue;
    }

    if (placement.table === 'UNATTRIBUTED') {
      const key = `${placement.reason}|${month}|${kind}|${currencyCode}`;
      const current = unattributed.get(key)?.row ?? {
        reason: placement.reason,
        month,
        kind,
        currencyCode,
        ...ZERO_PROGRESS,
      };
      unattributed.set(key, {
        sortKey: [
          TOLL_UNATTRIBUTED_REASONS.indexOf(placement.reason),
          month,
          kindRank(kind),
          currencyCode,
        ],
        row: { ...current, ...addToProgress(current, bucket) },
      });
      totals.set(totalKey, {
        sortKey: [currencyCode, kindRank(kind)],
        row: { ...total, unattributed: addToProgress(total.unattributed, bucket) },
      });
      continue;
    }

    const key = `${placement.state}|${month}|${kind}|${currencyCode}`;
    const part = { rowCount: bucket.rowCount, amount: bucket.amount };
    const current = duplicates.get(key)?.row ?? {
      state: placement.state,
      month,
      kind,
      currencyCode,
      total: ZERO,
    };
    duplicates.set(key, {
      sortKey: [
        TOLL_DUPLICATE_SPEND_STATES.indexOf(placement.state),
        month,
        kindRank(kind),
        currencyCode,
      ],
      row: { ...current, total: plus(current.total, part) },
    });
    totals.set(totalKey, {
      sortKey: [currencyCode, kindRank(kind)],
      row: { ...total, excludedDuplicates: plus(total.excludedDuplicates, part) },
    });
  }

  return {
    from: input.window.from,
    to: input.window.to,
    provider: input.window.provider,
    generatedOn: input.generatedOn,
    vehicles: sorted(vehicles.values()),
    unattributed: sorted(unattributed.values()),
    duplicates: sorted(duplicates.values()),
    totals: sorted(totals.values()),
  };
}
