import type { BusinessDate } from '../business-date.js';
import type {
  DriverFundAccount,
  DriverFundEntry,
  DriverFundPeriod,
  FundPeriodSnapshot,
  TripExpense,
} from './costing.types.js';
import type {
  DriverFundEntryKind,
  ExpenseFundingSource,
  TripExpenseKind,
} from './driver-fund-ledger.js';
import type { FundPeriodStatus } from './fund-period.js';

export interface PostFundEntryInput {
  readonly accountId: string;
  readonly kind: DriverFundEntryKind;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly tripId: string | null;
  readonly reversalOfId?: string | null;
  readonly note?: string | null;
  readonly recordedBy: string;
}

export interface RecordTripExpenseInput {
  readonly tripId: string;
  readonly kind: TripExpenseKind;
  readonly categoryCode: string;
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly fundedBy: ExpenseFundingSource;
  readonly driverId: string | null;
  readonly reversalOfId?: string | null;
  readonly evidenceLocator?: string | null;
  readonly note?: string | null;
  readonly recordedBy: string;
}

/**
 * MOT SU KIEN KINH TE, mot den hai dong so.
 *
 * `INV-03` doi mot khoan chi tu quy phai de lai HAI ban ghi o HAI LOP mang cung mot khoa. Neu tang
 * kho cho ghi tung dong roi de service tu ghep, thi ranh gioi giao dich se do nguoi goi tu nho —
 * va lan quen dau tien de lai mot but toan quy khong co gia thanh chuyen di kem, tuc so du dung ma
 * gia thanh chuyen thieu. Khong loi, khong log, chi mot con so nho hon su that.
 *
 * Nen tang kho chi mo DUNG MOT cua ghi cho so cai, va cua do nhan ca hai chan cung luc.
 */
export interface CorrelatedPostingInput {
  readonly correlationKey: string;
  readonly at: Date;
  readonly entry?: PostFundEntryInput;
  readonly expense?: RecordTripExpenseInput;
}

export interface CorrelatedPosting {
  readonly entry: DriverFundEntry | null;
  readonly expense: TripExpense | null;
}

export interface CreateFundPeriodInput {
  readonly accountId: string;
  readonly startDate: BusinessDate;
  readonly endDate: BusinessDate;
  readonly at: Date;
}

export interface FundPeriodStatusPatch {
  readonly at: Date;
  readonly actor: string;
  readonly reopenReason?: string | null;
}

export interface AppendSnapshotInput {
  readonly periodId: string;
  readonly openingBalance: number;
  readonly periodNet: number;
  readonly closingBalance: number;
  readonly entryCount: number;
  readonly takenBy: string;
  readonly at: Date;
}

export interface LedgerRange {
  /** Chi cong cac but toan co ngay nghiep vu TRUOC gia tri nay. */
  readonly before?: BusinessDate;
  readonly from?: BusinessDate;
  readonly to?: BusinessDate;
}

export interface LedgerTotal {
  readonly total: number;
  readonly count: number;
}

/**
 * Kho cua `TX-03 Costing`.
 *
 * KHONG co `update` va KHONG co `delete` cho but toan hay khoan chi — `INV-20`. Do khong phai thieu
 * sot ma la toan bo diem cua tang nay: sua mot dong tai chinh da ghi la viec khong ai duoc lam, va
 * cach chac chan nhat de khong ai lam la khong co cai nut do o tang kho. "Sua" tren giao dien anh
 * xa sang mot but toan DAO cong mot but toan moi.
 *
 * Ba ham `createPeriod`/`setPeriodStatus`/`appendSnapshot` CO ghi — nhung chung cham BANG KY, khong
 * cham so cai. Dong ky khong tao but toan nao (T1 §7.3).
 */
export abstract class CostingRepository {
  /** Tao so quy neu lai xe chua co. Mot lai xe mot so quy. */
  abstract ensureAccount(driverId: string, at: Date): Promise<DriverFundAccount>;
  abstract findAccount(id: string): Promise<DriverFundAccount | null>;
  abstract findAccountByDriver(driverId: string): Promise<DriverFundAccount | null>;

  abstract post(input: CorrelatedPostingInput): Promise<CorrelatedPosting>;

  abstract findEntry(id: string): Promise<DriverFundEntry | null>;
  abstract findEntryByCorrelation(correlationKey: string): Promise<DriverFundEntry | null>;
  abstract findReversalOfEntry(entryId: string): Promise<DriverFundEntry | null>;
  abstract listEntries(accountId: string): Promise<DriverFundEntry[]>;
  /** SO DU va cac tong cua ky — cong o tang kho de khong keo ca so cai len bo nho. */
  abstract sumSignedAmounts(accountId: string, range?: LedgerRange): Promise<LedgerTotal>;

  abstract findExpense(id: string): Promise<TripExpense | null>;
  abstract findExpenseByCorrelation(correlationKey: string): Promise<TripExpense | null>;
  abstract findReversalOfExpense(expenseId: string): Promise<TripExpense | null>;
  abstract listExpenses(tripId: string): Promise<TripExpense[]>;

  abstract createPeriod(input: CreateFundPeriodInput): Promise<DriverFundPeriod>;
  abstract findPeriod(id: string): Promise<DriverFundPeriod | null>;
  abstract listPeriods(accountId: string): Promise<DriverFundPeriod[]>;
  /** Moi ky cua so quy nay co khoang ngay CHUA `businessDate`. */
  abstract periodsCovering(
    accountId: string,
    businessDate: BusinessDate,
  ): Promise<DriverFundPeriod[]>;
  /**
   * Doi trang thai ky, CHI KHI ky dang o `from`.
   *
   * Rang buoc `from` khong phai de kiem lai cai service vua doc: no la cong chong hai nguoi cung
   * bam "dong ky". Neu chi `update` theo `id`, lan ghi thu hai se ghi de len ket qua cua lan thu
   * nhat va mot lan dong ky se de lai hai anh chup.
   */
  abstract setPeriodStatus(
    id: string,
    from: FundPeriodStatus,
    to: FundPeriodStatus,
    patch: FundPeriodStatusPatch,
  ): Promise<DriverFundPeriod | null>;

  abstract appendSnapshot(input: AppendSnapshotInput): Promise<FundPeriodSnapshot>;
  abstract listSnapshots(periodId: string): Promise<FundPeriodSnapshot[]>;
}
