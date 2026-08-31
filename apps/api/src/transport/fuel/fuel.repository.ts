import type { BusinessDate } from '../business-date.js';
import type {
  FuelReconciliationState,
  FuelReconciliationStatus,
  FuelReviewReason,
  FuelVerificationStatus,
} from './fuel-lifecycle.js';
import type { FuelDiscrepancyKind } from './fuel-matching.js';
import type {
  FuelDiscrepancy,
  FuelDiscrepancyResolution,
  FuelEntry,
  FuelMatch,
  FuelMatchOrigin,
  FuelPaymentMethod,
  FuelReceiptEvidence,
  FuelReconciliation,
  FuelSettlementHandoff,
  FuelStatementFormat,
  FuelStatementLine,
  FuelStatementLineStatus,
  FuelStatementRejectReason,
  FuelSupplier,
  FuelSupplierStatement,
} from './fuel.types.js';

/**
 * Kho cua `TX-04 Fuel`.
 *
 * ===========================================================================
 * BON DIEU TANG NAY KHONG CO, va moi dieu la mot bat bien duoc giu bang HINH DANG API:
 *
 *   1. KHONG `deleteEntry` / `deleteStatement`. `GD-02`/`GD-10`: sua mot chung tu da duoc tin la
 *      viet lai lich su. Duong dung la sua khi con `DECLARED`, hoac dao khoan chi o `TX-03`.
 *
 *   2. KHONG `setEntryVerification(id, to)` mot tham so. Moi lan doi trang thai deu doi `from` —
 *      do la cong chong hai nguoi cung bam "duyet", va thieu no thi mot lan duyet se ghi de mot
 *      lan tu choi ma khong ai thay.
 *
 *   3. KHONG mot ham nao ghi vao bang cua `TX-03`. Chi phi dau di qua `FuelCostingPort`
 *      (`fuel.ports.ts`), tuc qua `CostingService` — xem khoi chu thich o do.
 *
 *   4. KHONG `saveMatches` roi `saveDiscrepancies` rieng. Mot lan chay so khop phai NGUYEN TU:
 *      xem `applyMatchingRun` duoi day.
 */

/* ------------------------------------------------------------------ *
 * Cay xang
 * ------------------------------------------------------------------ */

export interface CreateFuelSupplierInput {
  readonly name: string;
  readonly code: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly taxCode: string | null;
  readonly at: Date;
}

/* ------------------------------------------------------------------ *
 * Phieu do dau
 * ------------------------------------------------------------------ */

export interface CreateFuelEntryInput {
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: Date;
  readonly litersUnits: number;
  readonly amount: number;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly paymentMethod: FuelPaymentMethod;
  /** `INV-26` — chi co gia tri khi phieu duoc de ra TU mot bang ke. */
  readonly sourceStatementId: string | null;
  readonly correlationKey: string;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly declaredBy: string;
  readonly at: Date;
}

/** SUA mot phieu con `DECLARED` — `GD-10`. Chi cac truong lai xe go duoc. */
export interface AmendFuelEntryInput {
  readonly litersUnits: number;
  readonly amount: number;
  readonly odometerKm: number;
  readonly previousOdometerKm: number | null;
  readonly consumptionUnits: number | null;
  readonly reviewReasons: readonly FuelReviewReason[];
  readonly businessDate: BusinessDate;
  readonly occurredAt: Date;
  readonly supplierId: string;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly at: Date;
}

export interface SetFuelVerificationInput {
  readonly to: FuelVerificationStatus;
  readonly actor: string;
  readonly reviewNote: string | null;
  readonly at: Date;
}

/* ------------------------------------------------------------------ *
 * Bang ke
 * ------------------------------------------------------------------ */

export interface CreateStatementLineInput {
  readonly rowNumber: number;
  readonly status: FuelStatementLineStatus;
  readonly rejectReason: FuelStatementRejectReason | null;
  readonly vehiclePlateRaw: string;
  readonly vehicleId: string | null;
  readonly businessDate: BusinessDate | null;
  readonly litersUnits: number | null;
  readonly amount: number | null;
  readonly invoiceNo: string | null;
  readonly note: string | null;
  readonly rawValues: Readonly<Record<string, string>>;
}

/**
 * NHAP CA BANG KE trong MOT giao dich — dau bang ke va moi dong cua no.
 *
 * Tach lam hai lan ghi thi mot lan hong o giua de lai mot dau bang ke KHONG co dong nao: doc len
 * trong nhu mot ky khong co giao dich, va lan nhap lai se bi unique `(cay xang, ky)` chan. Nguoi
 * dung ket o mot trang thai khong loi ra duoc bang giao dien.
 */
export interface CreateStatementInput {
  readonly supplierId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly format: FuelStatementFormat;
  readonly sourceRef: string;
  readonly sourceDigest: string;
  readonly lines: readonly CreateStatementLineInput[];
  readonly importedBy: string;
  readonly at: Date;
}

export interface CreatedStatement {
  readonly statement: FuelSupplierStatement;
  readonly lines: readonly FuelStatementLine[];
}

/* ------------------------------------------------------------------ *
 * Doi soat
 * ------------------------------------------------------------------ */

export interface CreateReconciliationInput {
  readonly supplierId: string;
  readonly statementId: string;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
  readonly at: Date;
}

export interface SetReconciliationStateInput {
  readonly at: Date;
  readonly actor: string;
  readonly reopenReason?: string | null;
  /** Dat `lastMatchedAt` khi lan chuyen trang thai nay di kem mot lan chay so khop. */
  readonly markMatched?: boolean;
}

export interface MatchToApply {
  readonly statementLineId: string;
  readonly fuelEntryId: string;
  readonly amountDeltaVnd: number;
  readonly businessDateDeltaDays: number;
  readonly origin: FuelMatchOrigin;
}

export interface DiscrepancyToApply {
  readonly kind: FuelDiscrepancyKind;
  readonly statementLineId: string | null;
  readonly fuelEntryId: string | null;
  readonly candidateEntryIds: readonly string[];
  readonly candidateLineIds: readonly string[];
}

/**
 * MOT LAN CHAY SO KHOP — NGUYEN TU, va co y THAY THE ket qua tu dong cu.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI THAY THE chu khong CONG DON:
 *
 * Chay lai so khop sau khi ai do sua mot phieu phai cho ra bo ket qua cua DU LIEU HIEN TAI. Neu
 * cong don, mot chenh lech da het ly do ton tai se nam lai mai mai — va no chan viec dong ky
 * (`FUEL-RECON-004`) ma khong ai xoa duoc no bang mot thao tac nghiep vu nao.
 *
 * ---------------------------------------------------------------------------
 * NHUNG CHI THAY THE PHAN MAY LAM RA:
 *
 * Cap khop `MANUAL` va chenh lech DA CO NGUOI QUYET (`RESOLVED`) khong bi dong toi. Xoa chung la
 * xoa cong cua nguoi doi soat, va lan bam "chay lai" thu hai se lam ho mat mot buoi lam viec.
 *
 * Do la ranh gioi duy nhat co the ve o day: MAY xoa duoc cai MAY vua lam, khong xoa duoc cai NGUOI
 * da quyet.
 */
export interface ApplyMatchingRunInput {
  readonly reconciliationId: string;
  readonly matches: readonly MatchToApply[];
  readonly discrepancies: readonly DiscrepancyToApply[];
  /** Trang thai moi cua tung dong bang ke sau lan chay. */
  readonly lineStatuses: ReadonlyMap<string, FuelReconciliationStatus>;
  /** Trang thai moi cua tung phieu sau lan chay. */
  readonly entryStatuses: ReadonlyMap<string, FuelReconciliationStatus>;
  readonly actor: string;
  readonly at: Date;
}

export interface MatchingRunResult {
  readonly matches: readonly FuelMatch[];
  readonly discrepancies: readonly FuelDiscrepancy[];
}

export interface ResolveDiscrepancyInput {
  readonly discrepancyId: string;
  readonly resolution: FuelDiscrepancyResolution;
  readonly resolutionNote: string | null;
  readonly actor: string;
  readonly at: Date;
  /** Chi cho `MATCH_CONFIRMED`: cap ma NGUOI chon (`GD-09` — may khong duoc chon ho). */
  readonly confirmedMatch?: MatchToApply;
  /** Trang thai moi cua dong/phieu lien quan sau quyet dinh. */
  readonly lineStatus?: { readonly id: string; readonly status: FuelReconciliationStatus };
  readonly entryStatus?: { readonly id: string; readonly status: FuelReconciliationStatus };
}

export interface ResolvedDiscrepancy {
  readonly discrepancy: FuelDiscrepancy;
  readonly match: FuelMatch | null;
}

/**
 * DONG MOT KY DOI SOAT — MOT giao dich, BA viec.
 *
 * ```text
 * 1. `RESOLVED -> CLOSED` (chi khi ky con dung o `RESOLVED`)
 * 2. moi dong/phieu trong ky chuyen `SETTLED` — khoa (`GD-11`)
 * 3. ghi MOT ban giao cong no cho T5, idempotent theo `reconciliationId`
 * ```
 *
 * Ba viec, mot giao dich, vi day dung la bai hoc T3R da tra gia (Issue #94 §2): mot lan chet giua
 * chung de lai mot ky `CLOSED` ma phieu chua khoa, hoac mot ban giao da phat cho mot ky chua dong.
 * Ca hai deu la trang thai khong co duong loi ra bang giao dien.
 *
 * Tra `null` khi ky khong con o `RESOLVED` — mot VA CHAM, khong phai mot loi dau vao. Nguoi goi
 * tai lai roi doc trang thai da co.
 */
export interface CloseReconciliationInput {
  readonly reconciliationId: string;
  readonly acceptedAmount: number;
  readonly acceptedLineCount: number;
  readonly actor: string;
  readonly at: Date;
}

export interface ClosedReconciliation {
  readonly reconciliation: FuelReconciliation;
  readonly handoff: FuelSettlementHandoff;
  /** `true` khi ky nay DA co ban giao tu mot lan dong truoc — khong phat lan hai. */
  readonly handoffReplayed: boolean;
}

export interface ReopenReconciliationInput {
  readonly reconciliationId: string;
  readonly reason: string;
  readonly actor: string;
  readonly at: Date;
}

/* ------------------------------------------------------------------ *
 * Hop dong
 * ------------------------------------------------------------------ */

export abstract class FuelRepository {
  /* --- Cay xang --- */
  abstract createSupplier(input: CreateFuelSupplierInput): Promise<FuelSupplier>;
  abstract findSupplier(id: string): Promise<FuelSupplier | null>;
  abstract listSuppliers(): Promise<FuelSupplier[]>;

  /* --- Phieu --- */
  abstract createEntry(input: CreateFuelEntryInput): Promise<FuelEntry>;
  abstract findEntry(id: string): Promise<FuelEntry | null>;
  abstract findEntryByCorrelation(correlationKey: string): Promise<FuelEntry | null>;
  abstract listEntriesByTrip(tripId: string): Promise<FuelEntry[]>;
  abstract listEntriesByDriver(driverId: string): Promise<FuelEntry[]>;
  /**
   * Cac phieu CO THE khop voi mot bang ke: cung cay xang, ngay nghiep vu trong khoang DA NOI RONG
   * theo dung sai ngay.
   *
   * Noi rong o TANG KHO chu khong loc lai o tang mien: mot phieu ngay 31/07 van khop duoc voi mot
   * dong bang ke ngay 01/08 khi dung sai la +-1 ngay (`GD-08`). Doc dung khoang ky se lam moi cap
   * qua dem cuoi ky bien mat khoi vong so khop — va chung se hien ra thanh chenh lech o CA HAI ky.
   */
  abstract listEntriesForMatching(input: {
    readonly supplierId: string;
    readonly from: BusinessDate;
    readonly to: BusinessDate;
  }): Promise<FuelEntry[]>;
  /**
   * Odo cua lan do dau GAN NHAT TRUOC moc nay, cua chinh xe do — mau so cua `INV-06`.
   *
   * So sanh theo `(businessDate, occurredAt)` chu khong theo `createdAt`: mot phieu nhap bu ngay
   * hom sau van thuoc ve ngay do dau cua no, va dem theo thu tu NHAP se lam mot lan do dau lui lai
   * bi coi la lan gan nhat cua lan truoc no.
   */
  abstract findPreviousOdometer(input: {
    readonly vehicleId: string;
    readonly businessDate: BusinessDate;
    readonly occurredAt: Date;
    /** Bo qua chinh phieu nay khi tinh lai luc SUA. */
    readonly excludeEntryId?: string;
  }): Promise<number | null>;
  abstract amendEntry(id: string, patch: AmendFuelEntryInput): Promise<FuelEntry | null>;
  /** Doi trang thai duyet CHI KHI phieu dang o `from` — cong chong hai nguoi cung bam. */
  abstract setEntryVerification(
    id: string,
    from: FuelVerificationStatus,
    input: SetFuelVerificationInput,
  ): Promise<FuelEntry | null>;
  /**
   * Gan chan gia thanh vao phieu, CHI KHI phieu chua co chan nao.
   *
   * Tra `null` khi da co — mot lan phat lai vo hai, khong phai mot loi. Cung voi unique tren cot
   * do, day la nua thu hai cua "chi phi dau vao gia thanh chuyen dung mot lan".
   */
  abstract attachCostExpense(id: string, expenseId: string): Promise<FuelEntry | null>;

  /* --- Bang chung --- */
  abstract addEvidence(input: {
    readonly fuelEntryId: string;
    readonly locator: string;
    readonly contentType: string | null;
    readonly byteSize: number | null;
    readonly capturedAt: Date | null;
    readonly uploadedBy: string;
    readonly at: Date;
  }): Promise<FuelReceiptEvidence>;
  abstract listEvidence(fuelEntryId: string): Promise<FuelReceiptEvidence[]>;

  /* --- Bang ke --- */
  abstract createStatement(input: CreateStatementInput): Promise<CreatedStatement>;
  abstract findStatement(id: string): Promise<FuelSupplierStatement | null>;
  abstract findStatementByPeriod(
    supplierId: string,
    periodStart: BusinessDate,
    periodEnd: BusinessDate,
  ): Promise<FuelSupplierStatement | null>;
  abstract listStatementLines(statementId: string): Promise<FuelStatementLine[]>;

  /* --- Doi soat --- */
  abstract createReconciliation(input: CreateReconciliationInput): Promise<FuelReconciliation>;
  abstract findReconciliation(id: string): Promise<FuelReconciliation | null>;
  abstract findReconciliationByStatement(statementId: string): Promise<FuelReconciliation | null>;
  abstract listReconciliations(): Promise<FuelReconciliation[]>;
  abstract setReconciliationState(
    id: string,
    from: FuelReconciliationState,
    to: FuelReconciliationState,
    input: SetReconciliationStateInput,
  ): Promise<FuelReconciliation | null>;
  abstract applyMatchingRun(input: ApplyMatchingRunInput): Promise<MatchingRunResult>;
  abstract listMatches(reconciliationId: string): Promise<FuelMatch[]>;
  abstract listDiscrepancies(reconciliationId: string): Promise<FuelDiscrepancy[]>;
  abstract findDiscrepancy(id: string): Promise<FuelDiscrepancy | null>;
  abstract countPendingDiscrepancies(reconciliationId: string): Promise<number>;
  abstract resolveDiscrepancy(input: ResolveDiscrepancyInput): Promise<ResolvedDiscrepancy | null>;
  abstract closeReconciliation(
    input: CloseReconciliationInput,
  ): Promise<ClosedReconciliation | null>;
  abstract reopenReconciliation(
    input: ReopenReconciliationInput,
  ): Promise<FuelReconciliation | null>;
  abstract findHandoff(reconciliationId: string): Promise<FuelSettlementHandoff | null>;
}
