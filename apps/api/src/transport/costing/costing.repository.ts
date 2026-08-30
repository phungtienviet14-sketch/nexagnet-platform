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
  /**
   * CONG `INV-22` — kiem BEN TRONG giao dich ghi, khong phai truoc no.
   *
   * Xem `FundPeriodFrozenError` ngay duoi ve vi sao cho kiem phai nam o day.
   */
  readonly periodGuard?: FundPeriodWriteGuard;
}

/**
 * "Ngay nghiep vu nay, tren so quy nay, co roi vao mot ky dang dong bang khong?"
 *
 * Mot cau hoi, mot cho hoi: ben trong giao dich cua chinh lan ghi do.
 */
export interface FundPeriodWriteGuard {
  readonly accountId: string;
  readonly businessDate: BusinessDate;
}

/**
 * KY DA DONG BANG — phat hien BEN TRONG giao dich, sau khi da giu khoa so quy.
 *
 * ---------------------------------------------------------------------------
 * KHE HO DA CO O BAN T3 DAU (Issue #94 §1), va vi sao no chi lo ra o so lieu:
 *
 * Ban truoc kiem ky o `CostingService` TRUOC khi goi `post()`. Hai lan cham DB do khong nam
 * trong cung mot pham vi tuan tu hoa, nen thu tu nay hoan toan hop le voi Postgres:
 *
 * ```text
 * Nguoi ghi A : doc ky -> OPEN, di tiep
 * Nguoi chot B: OPEN -> CLOSING
 * Nguoi chot B: cong so cai, ghi anh chup
 * Nguoi chot B: CLOSING -> CLOSED
 * Nguoi ghi A : INSERT ... commit  <-- lot vao mot ky DA CHOT
 * ```
 *
 * Ket qua: mot ky `CLOSED` chua mot but toan KHONG co trong anh chup cua chinh no. Khong loi,
 * khong canh bao. `INV-22` va ban than anh chup mat het y nghia — con so da bao cao ra ngoai
 * khong con la con so cua so cai, va khong co gi trong he thong noi len dieu do.
 *
 * Sua bang cach chuyen cho kiem VAO TRONG giao dich, sau mot `SELECT ... FOR UPDATE` tren hang so
 * quy. Tu do hai lenh tren cung mot so quy phai xep hang, va chi con DUNG hai ket cuc:
 *
 *   A. lan ghi thang truoc -> commit -> anh chup CHUA no;
 *   B. lan chot thang truoc -> ky thanh `CLOSING` -> lan ghi bi TU CHOI.
 *
 * Khong con ket cuc thu ba.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHO NEM MOT LOI RIENG chu khong tu dung `TransportDomainError`:
 *
 * Ba cong goi `post()` (`driver_fund.post_entry`, `trip_expense.record`, `costing.reversal`)
 * va MOI cong mang mot ma tu choi rieng — do la yeu cau cua `.claude/rules`: N duong tu choi thi
 * N ma, khong gop. Kho khong biet minh dang phuc vu cong nao va khong duoc doan. Nen kho nem su
 * THAT ("ky nay dang dong bang"), con service dich no sang NGON NGU CUA CONG dang mo.
 */
export class FundPeriodFrozenError extends Error {
  constructor(readonly period: DriverFundPeriod) {
    super(`Ky quy ${period.id} dang ${period.status} — khong nhan them but toan`);
    this.name = 'FundPeriodFrozenError';
  }
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

/**
 * PHA HAI CUA MOT LAN DONG KY: chup anh + `CLOSING -> CLOSED`, MOT giao dich.
 *
 * Hai viec nay o ban T3 dau la hai lan commit roi nhau. Mot lan chet dung giua chung de lai mot
 * anh chup DA COMMIT tren mot ky VAN o `CLOSING` — va lenh dong goi lai se chup THEM mot anh nua
 * cho cung mot lan dong (Issue #94 §2). Hai anh chup cho mot lan dong nghia la cau hoi "ky nay da
 * bao cao con so nao?" co hai cau tra loi, va khong cach nao biet cau nao da gui cho ke toan.
 *
 * Gop lam mot giao dich thi ket cuc chi con hai: hoac ca hai cung co, hoac khong cai nao. Mot lan
 * chet giua chung tra ky ve dung `CLOSING` — DONG BANG, khong mat du lieu, va lan goi sau chup
 * DUNG mot anh.
 *
 * Pha MOT (`OPEN|REOPENED -> CLOSING`) VAN commit rieng, va do van la co y: no phai co hieu luc
 * voi nguoi ghi khac TRUOC khi mot con so nao duoc cong.
 */
export interface FinalizeClosePeriodInput {
  readonly periodId: string;
  readonly takenBy: string;
  readonly at: Date;
}

export interface FinalizedClosePeriod {
  readonly period: DriverFundPeriod;
  readonly snapshot: FundPeriodSnapshot;
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

  /**
   * Chot pha hai cua mot lan dong ky, NGUYEN TU.
   *
   * Tra `null` khi ky khong con o `CLOSING` — tuc mot phien khac da chot xong truoc. Do la mot
   * VA CHAM, khong phai mot loi dau vao: nguoi goi tai lai roi quyet lai. Tra `null` thay vi nem
   * de nguoi goi con phan biet duoc no voi mot su co that.
   */
  abstract finalizeClose(input: FinalizeClosePeriodInput): Promise<FinalizedClosePeriod | null>;
  abstract listSnapshots(periodId: string): Promise<FundPeriodSnapshot[]>;
}
