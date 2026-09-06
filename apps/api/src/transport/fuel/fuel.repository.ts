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
 *
 *   5. KHONG `createReconciliation` rieng. Mot bang ke va ky doi soat cua no ra doi CUNG mot lan
 *      ghi — xem `createStatementWithReconciliation` (T4R §3).
 *
 * ===========================================================================
 * GIAO THUC NOI TIEP HOA cua mot ky doi soat — MOT luat, BON lenh (T4R §1).
 *
 * `applyMatchingRun`, `resolveDiscrepancy`, `closeReconciliation` va `reopenReconciliation` deu:
 *
 * ```text
 * 1. mo mot giao dich
 * 2. KHOA DOC QUYEN hang `TransportFuelReconciliation` (`SELECT ... FOR UPDATE`)
 * 3. doc lai trang thai TU HANG DA KHOA — khong tin gia tri doc truoc giao dich
 * 4. tu choi neu trang thai khong con nhan duoc lenh nay
 * 5. ghi MOI THU, ke ca buoc chuyen trang thai
 * ```
 *
 * Bon lenh cung xin mot hang khoa nen chung XEP HANG voi nhau. Do la thu bien hai va cham nguy hiem
 * thanh hai ket cuc doc duoc:
 *
 * ```text
 * so khop TRUOC -> lenh dong nhin thay ket qua CUOI CUNG
 * dong ky TRUOC -> lan so khop doi DUNG KHONG hang nao, va bao mot va cham co ma
 * ```
 *
 * Truoc T4R, buoc 2 va 3 khong co: `runMatching` doc trang thai roi tinh toan NGOAI giao dich, va
 * `applyMatchingRun` ghi ma khong kiem lai. Mot lenh dong chen vao giua se de lai mot ky `CLOSED`
 * co ban giao cong no da phat, trong khi bo cap khop lam nen ban giao do vua bi viet lai.
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

/**
 * DIEU KIEN de mot lan SUA duoc phep ghi — kiem LUC GHI, khong phai luc doc (T4R §4).
 *
 * ===========================================================================
 * VI SAO KHONG DU khi chi kiem o tang mien.
 *
 * `amendFuelEntry` doc phieu, thay `DECLARED`, roi ghi. Giua hai viec do:
 *
 * ```text
 * A doc phieu   -> DECLARED
 * B duyet phieu -> VERIFIED, va day chi phi that vao gia thanh chuyen o `TX-03`
 * A ghi de      -> UPDATE ... WHERE id = ...   (thanh cong)
 * ```
 *
 * Ket cuc: mot phieu `VERIFIED` — theo `GD-10` la BAT BIEN — mang so tien khac voi khoan chi da
 * nam trong gia thanh chuyen. Khong loi, khong canh bao, va chi lo ra khi ai do doi chieu hai bang.
 *
 * Nen dieu kien di THEO lenh ghi vao menh de `WHERE`. Khong con hang nao khop = co nguoi da doi
 * trang thai truoc — mot VA CHAM, va tang mien bao lai bang mot ma rieng.
 */
export interface AmendFuelEntryGuard {
  /** Phieu phai CON o dung trang thai duyet nay luc ghi. */
  readonly verification: FuelVerificationStatus;
  /** Va KHONG duoc o mot trong cac trang thai doi soat da khoa (`MATCHED`/`SETTLED`). */
  readonly lockedReconciliation: readonly FuelReconciliationStatus[];
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
 * HOP THU PHIEU cua CA DOI — #222 P1-B
 * ------------------------------------------------------------------ */

/**
 * BO LOC cua hop thu — moi truong `null` nghia la KHONG loc theo truc do.
 *
 * ===========================================================================
 * `tripIds` la MOT DANH SACH ID, khong phai mot chuoi ma chuyen
 *
 * Nguoi dung go MA CHUYEN (`UAT-VIET-01`), nhung phep doi ma -> id thuoc `transport-core` va di qua
 * `TransportFuelCoreFacts`. Tang kho cua fuel KHONG duoc doc bang chuyen (T1 §4.1), nen no nhan ket
 * qua da doi san. `[]` (mang rong) va `null` vi vay la HAI thu khac han:
 *
 * ```text
 * null -> khong loc theo chuyen
 * []   -> co loc, va KHONG chuyen nao khop  ->  ket qua rong
 * ```
 *
 * Gop hai cai lam mot se lam mot lan tim "chuyen khong ton tai" tra ve TOAN BO hop thu.
 */
export interface FuelEntryInboxFilter {
  readonly verification: FuelVerificationStatus | null;
  readonly reconciliation: FuelReconciliationStatus | null;
  readonly tripIds: readonly string[] | null;
  readonly driverId: string | null;
  readonly vehicleId: string | null;
  readonly supplierId: string | null;
  /** Khoang NGAY NGHIEP VU, hai dau DEU TINH. */
  readonly from: BusinessDate | null;
  readonly to: BusinessDate | null;
}

/**
 * MOT TRANG cua hop thu — CO BIEN, luon luon.
 *
 * `limit` do tang ung dung chan trong mot khoang cung (`fuel.schemas.ts`) truoc khi toi day. Tang
 * kho khong tu dat mac dinh: mot `findMany` khong `take` la mot cau lenh doc CA BANG, va no chay
 * tot dung den ngay doi xe cua khach du lon de no khong chay tot nua.
 */
export interface FuelEntryInboxQuery extends FuelEntryInboxFilter {
  readonly limit: number;
  readonly offset: number;
}

export interface FuelEntryPage {
  readonly entries: readonly FuelEntry[];
  /** Bao nhieu phieu KHOP BO LOC — de phan trang. */
  readonly total: number;
  /**
   * Bao nhieu phieu DANG CHO XAC THUC — CO Y bo qua `verification` cua bo loc.
   *
   * Day la con so "còn N việc chờ bạn" tren man hinh. Neu no chay theo bo loc, thi mot nguoi dang
   * loc "da duyet" se thay `0 chờ xác thực` — dung luc ho khong nhin thay cong viec that.
   */
  readonly pendingVerificationCount: number;
}

/* ------------------------------------------------------------------ *
 * GO MOT BANG CHUNG — #222 P1-C
 * ------------------------------------------------------------------ */

/**
 * BIA MO mot hang bang chung — KHONG xoa hang.
 *
 * ===========================================================================
 * DIEU KIEN DI THEO LENH GHI, dung khuon `AmendFuelEntryGuard` (T4R §4)
 *
 * Kiem o tang mien roi buong ra la mot cong mo trong khoang giua luc doc va luc ghi:
 *
 * ```text
 * A doc phieu    -> DECLARED, go duoc
 * B duyet phieu  -> VERIFIED, va chi phi that vao gia thanh chuyen
 * A ghi bia mo   -> UPDATE ... WHERE id = ...   (thanh cong)
 * ```
 *
 * Ket cuc: mot phieu `VERIFIED` mat mot chung tu ma nguoi duyet vua doc de bam duyet. Nen dieu kien
 * nam trong chinh giao dich ghi, tren hang phieu DA KHOA.
 */
export interface WithdrawEvidenceInput {
  readonly fuelEntryId: string;
  readonly evidenceId: string;
  readonly actor: string;
  readonly at: Date;
  /** Phieu KHONG duoc dang o trang thai duyet nay luc ghi. */
  readonly forbiddenVerificationStatuses: readonly FuelVerificationStatus[];
  /** Va KHONG duoc o mot trong cac trang thai doi soat da khoa. */
  readonly forbiddenReconciliationStatuses: readonly FuelReconciliationStatus[];
}

/**
 * NAM ket cuc, va chung KHONG duoc gop.
 *
 * `ENTRY_NOT_FOUND` / `EVIDENCE_NOT_FOUND` / `ALREADY_WITHDRAWN` / `STATE_RACE` doi nguoi dung lam
 * bon viec khac nhau — tai lai, doi id, khong lam gi, hoac di duong dao phieu. `WITHDRAWN` mang
 * theo ca hang da bia mo vi `locator` cua no la thu DUY NHAT biet byte nam o dau, va ben goi phai
 * don no ngay sau do.
 */
export type WithdrawEvidenceOutcome =
  | { readonly kind: 'WITHDRAWN'; readonly evidence: FuelReceiptEvidence }
  | { readonly kind: 'ENTRY_NOT_FOUND' }
  | { readonly kind: 'EVIDENCE_NOT_FOUND' }
  | { readonly kind: 'ALREADY_WITHDRAWN' }
  | {
      readonly kind: 'STATE_RACE';
      readonly verification: FuelVerificationStatus;
      readonly reconciliation: FuelReconciliationStatus;
    };

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

/**
 * MOT BANG KE, CAC DONG CUA NO, VA KY DOI SOAT — mot ket qua, mot giao dich (T4R §3).
 *
 * ===========================================================================
 * VI SAO KHONG CON `createReconciliation` RIENG.
 *
 * Truoc T4R, `commitImport` goi hai lan ghi noi tiep. Mot lan hong o giua de lai:
 *
 * ```text
 * dau bang ke + cac dong  DA GHI
 * ky doi soat             KHONG CO
 * ```
 *
 * Trang thai do khong lam gi duoc: bang ke khong so khop duoc, khong dong duoc, khong hien o dau —
 * va nhap lai thi bi unique `(cay xang, ky)` chan. Nguoi dung ket o mot cho khong co duong ra bang
 * giao dien, va duong ra duy nhat la ai do xoa hang trong DB bang tay.
 *
 * Xoa han ham `createReconciliation` khoi hop dong nay chu khong chi "nho goi ca hai": cach re nhat
 * de tuan thu la ky luat, va ky luat khong song sot qua sau lan sua cua sau nguoi. Khong co ham do
 * thi khong ai viet lai duoc duong hai lan ghi.
 */
export interface CreatedStatement {
  readonly statement: FuelSupplierStatement;
  readonly lines: readonly FuelStatementLine[];
  readonly reconciliation: FuelReconciliation;
}

/* ------------------------------------------------------------------ *
 * Doi soat
 * ------------------------------------------------------------------ */

/*
 * KHONG CO `setReconciliationState` O DAY, va do la mot phan cua ban va T4R §1.
 *
 * Truoc T4R, kho co mot ham doi trang thai ky doi soat DOC LAP voi lan ghi ket qua. Do la mot LO
 * THUNG cua giao thuc noi tiep hoa mo ta o dau tep: no doi trang thai ma khong lay khoa hang, nen
 * mot lan goi no van co the chen vao giua mot lenh dong ky dang chay.
 *
 * Ham do gio khong ton tai. Trang thai chi doi BEN TRONG mot trong bon lenh da khoa hang, va do la
 * mot bat bien duoc giu bang HINH DANG API chu khong bang ky luat: khong co ham thi khong ai goi.
 */

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
/**
 * KY DOI SOAT PHAI DUNG O DAU sau lan chay — do TANG MIEN quyet, tang kho AP (T4R §1).
 *
 * Buoc chuyen trang thai nam TRONG cung giao dich voi lan ghi ket qua. Truoc T4R no la mot lan ghi
 * rieng sau do, va khe ho giua hai lan ghi chinh la cho mot lenh dong ky chen vao.
 *
 * Tang kho khong duoc tu nghi ra buoc chuyen: no goi `planFuelReconciliationPath` (`fuel-lifecycle`)
 * voi trang thai DOC TU HANG DA KHOA, va chi ap chuoi buoc ma may trang thai tra ve. Khong co duong
 * nao = mot va cham, va ca giao dich bi bo.
 */
export interface MatchingRunStatePlan {
  /** Con chenh lech cho nguoi quyet. */
  readonly whenPending: FuelReconciliationState;
  /** Khong con cau hoi nao treo. */
  readonly whenSettled: FuelReconciliationState;
}

export interface ApplyMatchingRunInput {
  readonly reconciliationId: string;
  readonly matches: readonly MatchToApply[];
  readonly discrepancies: readonly DiscrepancyToApply[];
  /** Trang thai moi cua tung dong bang ke sau lan chay. */
  readonly lineStatuses: ReadonlyMap<string, FuelReconciliationStatus>;
  /** Trang thai moi cua tung phieu sau lan chay. */
  readonly entryStatuses: ReadonlyMap<string, FuelReconciliationStatus>;
  readonly stateAfterRun: MatchingRunStatePlan;
  readonly actor: string;
  readonly at: Date;
}

export interface MatchingRunResult {
  readonly matches: readonly FuelMatch[];
  readonly discrepancies: readonly FuelDiscrepancy[];
}

/**
 * HAI ket cuc, va chung KHONG duoc gop thanh mot `null`.
 *
 * `REJECTED` mang theo trang thai da doc duoc TU HANG DA KHOA, nen tang mien noi duoc voi nguoi
 * dung *vi sao* lan chay khong ghi gi — "ky da dong" khac han "ky vua bien mat".
 */
export type ApplyMatchingRunOutcome =
  | {
      readonly kind: 'APPLIED';
      readonly result: MatchingRunResult;
      readonly state: FuelReconciliationState;
    }
  | { readonly kind: 'REJECTED'; readonly state: FuelReconciliationState | null };

export interface ResolveDiscrepancyInput {
  /** Ky doi soat SO HUU chenh lech nay — hang bi khoa dau tien trong giao dich (T4R §1). */
  readonly reconciliationId: string;
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
  /** Khi day la cau hoi treo CUOI CUNG, ky chuyen sang trang thai nay — trong cung giao dich. */
  readonly stateWhenSettled: FuelReconciliationState;
}

export interface ResolvedDiscrepancy {
  readonly discrepancy: FuelDiscrepancy;
  readonly match: FuelMatch | null;
}

/**
 * BA ket cuc phan biet duoc — hai lan tu choi vi hai ly do khac han nhau.
 *
 * `RECONCILIATION_REJECTED` = ky khong con nhan quyet dinh (da dong). `DISCREPANCY_RACE` = ky van
 * mo nhung chenh lech nay vua duoc nguoi khac quyet. Nguoi dung phai lam hai viec khac nhau, nen ho
 * phai nhan hai cau tra loi khac nhau.
 */
export type ResolveDiscrepancyOutcome =
  | {
      readonly kind: 'RESOLVED';
      readonly resolved: ResolvedDiscrepancy;
      readonly state: FuelReconciliationState;
    }
  | { readonly kind: 'RECONCILIATION_REJECTED'; readonly state: FuelReconciliationState | null }
  | { readonly kind: 'DISCREPANCY_RACE' };

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
 * ---------------------------------------------------------------------------
 * TU T4R: BA VIEC DO GIO LA NAM (§1 va §2), va HAI PHEP DEM/CONG chuyen vao trong.
 *
 * ```text
 * 0. khoa doc quyen hang doi soat, doc lai trang thai
 * 0bis. DEM LAI chenh lech con treo — trong giao dich nay
 * 1. `RESOLVED -> CLOSED`
 * 2. moi dong/phieu trong ky chuyen `SETTLED`
 * 2bis. CONG LAI tong duoc chap nhan — trong giao dich nay
 * 3. phat lai ban giao gan nhat, HOAC them mot ban sua doi khi ket qua kinh te da doi
 * ```
 *
 * Hai phep `0bis`/`2bis` truoc day chay o tang mien, TRUOC giao dich. Do la mot khe that:
 *
 * ```text
 * A dem chenh lech treo -> 0
 * B chay so khop        -> sinh mot chenh lech PENDING moi
 * A dong ky             -> CLOSED, va ky do co mot cau hoi chua ai tra loi
 * ```
 *
 * Nen tang kho nhan DU LIEU THO va goi `sumAcceptedSettlement` (`fuel-settlement.ts`) — luat
 * `INV-07` van song mot ban o tang mien, phep doc thi nam trong giao dich da noi tiep hoa.
 */
export interface CloseReconciliationInput {
  readonly reconciliationId: string;
  readonly actor: string;
  readonly at: Date;
}

export interface ClosedReconciliation {
  readonly reconciliation: FuelReconciliation;
  readonly handoff: FuelSettlementHandoff;
  /** `true` khi ket qua kinh te KHONG doi so voi ban gan nhat — phat lai, khong them ban moi. */
  readonly handoffReplayed: boolean;
}

/**
 * BA ket cuc, va `PENDING_DISCREPANCIES` phai tach khoi `REJECTED`.
 *
 * "Con 3 cau hoi chua ai tra loi" la mot viec nguoi doi soat LAM DUOC. "Ky nay vua bi nguoi khac
 * doi trang thai" thi khong. Gop hai cai thanh mot ma se buoc ho doan xem minh phai lam gi.
 */
export type CloseReconciliationOutcome =
  | { readonly kind: 'CLOSED'; readonly closed: ClosedReconciliation }
  | { readonly kind: 'PENDING_DISCREPANCIES'; readonly pending: number }
  | { readonly kind: 'REJECTED'; readonly state: FuelReconciliationState | null };

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
   * Moi phieu dang mang it nhat MOT ly do can kiem tra (`INV-06`, VT-046 vuot dinh muc).
   *
   * Them cho `TX-06`: bang canh bao van hanh gom chung cua Issue #88 phai co dong "tieu hao dau
   * bat thuong", va nguon cua dong do la `TX-04`. Cong nay la duong DUY NHAT T6 doc duoc no —
   * thay cho viec T6 tu truy van `TransportFuelEntry`, dieu ma guardrail
   * `NO_CROSS_CONTEXT_REPOSITORY_WRITE` cua T1 §4.1 cam.
   *
   * CHI DOC. Danh gia "bat thuong" van thuoc `TX-04`: T6 khong tinh lai dinh muc, no chi doc ket
   * luan da co va gan nhan nguon vao bang gom chung.
   */
  abstract listEntriesNeedingReview(): Promise<FuelEntry[]>;
  /**
   * HOP THU cua CA DOI — mot truy van MAY CHU, co bien, co bo loc (#222 P1-B).
   *
   * Truoc lan sua nay `TX-04` chi doc phieu theo TUNG CHUYEN (`listEntriesByTrip`) hoac theo TUNG
   * LAI XE (`listEntriesByDriver`). Hau qua tren man hinh la ke toan phai mo lan luot N chuyen chi
   * de biet phieu nao dang cho ho — tuc cong viec that (xac thuc phieu) khong co duong nao lam
   * duoc o quy mo doi xe, va man Nhien lieu chi con la man nhap bang ke.
   *
   * THU TU: `verificationStatus ASC` roi `businessDate DESC, occurredAt DESC, id ASC`. `DECLARED`
   * la gia tri DAU TIEN cua enum Postgres, nen viec dang cho nguoi len truoc, moi nhat truoc trong
   * tung nhom — "actionable/newest first" ma khong can mot cot xep hang bia them.
   */
  abstract listEntriesForInbox(query: FuelEntryInboxQuery): Promise<FuelEntryPage>;
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
  /** Tra `null` khi `guard` khong con dung LUC GHI — mot va cham, khong phai "khong tim thay". */
  abstract amendEntry(
    id: string,
    guard: AmendFuelEntryGuard,
    patch: AmendFuelEntryInput,
  ): Promise<FuelEntry | null>;
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
  /**
   * Gan mot tam anh, CHI KHI phieu chua bi mot ky doi soat da dong khoa lai.
   *
   * Cung ly le voi `amendEntry` (T4R §4): neu dieu kien chi duoc kiem o tang mien thi mot lenh dong
   * ky chen vao giua se de lai mot chung tu moi trong mot ky DA BAO CAO RA NGOAI. Nen dieu kien
   * duoc kiem trong chinh giao dich ghi, tren hang phieu DA KHOA.
   *
   * `null` = phieu dang o mot trang thai bi cam. KHONG phai "khong tim thay".
   */
  abstract addEvidence(input: {
    readonly fuelEntryId: string;
    readonly locator: string;
    readonly contentType: string | null;
    readonly byteSize: number | null;
    readonly capturedAt: Date | null;
    readonly uploadedBy: string;
    readonly at: Date;
    readonly forbiddenReconciliationStatuses: readonly FuelReconciliationStatus[];
  }): Promise<FuelReceiptEvidence | null>;
  /**
   * Bang chung DANG HIEU LUC cua mot phieu — hang da bia mo (`withdrawnAt`) KHONG co mat.
   *
   * Loc o TANG KHO, mot cho, chu khong de moi noi goi tu loc: co ba duong doc bang chung (be mat
   * lai xe, be mat van hanh, hop thu), va mot trong ba quen loc la mot chung tu da go hien lai
   * nhu dang hieu luc.
   */
  abstract listEvidence(fuelEntryId: string): Promise<FuelReceiptEvidence[]>;
  /**
   * Bang chung DANG HIEU LUC cua NHIEU phieu — MOT lan doc, khong N lan (#222 P1-B).
   *
   * Hop thu ve toi 200 dong mot trang. Goi `listEvidence` cho tung dong la 200 lan cham DB cho mot
   * man hinh — dung kieu N+1 ma #222 cam, chi la doi cho tu trinh duyet xuong may chu. Cho nao chua
   * kip lo ra thanh cham thi cung se lo ra thanh mot cot tai DB ma khong ai doc duoc nguyen nhan.
   *
   * `[]` (khong phieu nao) tra ve mot map RONG, khong phai mot cau lenh `IN ()`.
   */
  abstract listEvidenceForEntries(
    fuelEntryIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly FuelReceiptEvidence[]>>;
  /**
   * GO mot bang chung — bia mo, KHONG xoa hang (#222 P1-C).
   *
   * Xem `WithdrawEvidenceInput`: dieu kien vong doi di THEO lenh ghi, tren hang phieu da khoa.
   */
  abstract withdrawEvidence(input: WithdrawEvidenceInput): Promise<WithdrawEvidenceOutcome>;

  /* --- Bang ke --- */
  abstract createStatementWithReconciliation(
    input: CreateStatementInput,
  ): Promise<CreatedStatement>;
  abstract findStatement(id: string): Promise<FuelSupplierStatement | null>;
  abstract findStatementByPeriod(
    supplierId: string,
    periodStart: BusinessDate,
    periodEnd: BusinessDate,
  ): Promise<FuelSupplierStatement | null>;
  abstract listStatementLines(statementId: string): Promise<FuelStatementLine[]>;

  /* --- Doi soat --- */
  abstract findReconciliation(id: string): Promise<FuelReconciliation | null>;
  abstract findReconciliationByStatement(statementId: string): Promise<FuelReconciliation | null>;
  abstract listReconciliations(): Promise<FuelReconciliation[]>;
  abstract applyMatchingRun(input: ApplyMatchingRunInput): Promise<ApplyMatchingRunOutcome>;
  abstract listMatches(reconciliationId: string): Promise<FuelMatch[]>;
  abstract listDiscrepancies(reconciliationId: string): Promise<FuelDiscrepancy[]>;
  abstract findDiscrepancy(id: string): Promise<FuelDiscrepancy | null>;
  abstract resolveDiscrepancy(input: ResolveDiscrepancyInput): Promise<ResolveDiscrepancyOutcome>;
  abstract closeReconciliation(
    input: CloseReconciliationInput,
  ): Promise<CloseReconciliationOutcome>;
  abstract reopenReconciliation(
    input: ReopenReconciliationInput,
  ): Promise<FuelReconciliation | null>;
  /** Ban giao GAN NHAT cua ky — `revision` lon nhat. Xem `FuelSettlementHandoff.revision`. */
  abstract findHandoff(reconciliationId: string): Promise<FuelSettlementHandoff | null>;
  /** CA CHUOI ban sua doi, theo `revision` tang dan. Chi them, khong bao gio sua ban da phat. */
  abstract listHandoffRevisions(reconciliationId: string): Promise<FuelSettlementHandoff[]>;
}
