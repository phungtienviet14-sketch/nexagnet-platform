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
 *   5. KHONG mot lenh ghi nao TIN vao trang thai nguoi goi da doc truoc do. Moi lenh ghi tu kiem
 *      dieu kien cua chinh no BEN TRONG giao dich — xem khoi ngay duoi.
 *
 * ===========================================================================
 * MOT GIAO THUC TUAN TU HOA DUY NHAT CHO CA KY DOI SOAT (Issue #103 §1)
 *
 * Bon lenh cham vao ket qua cua mot ky — chay so khop, quyet chenh lech, dong ky, mo lai ky — deu
 * bat dau bang `SELECT ... FOR UPDATE` tren DUNG hang `TransportFuelReconciliation` do, roi doc lai
 * trang thai BEN TRONG giao dich. Khong phai bon phep khoa khac nhau: MOT hang, nen chung xep hang
 * sau nhau theo dung nghia den cua tu.
 *
 * Vi sao phai the — day la duong hong that:
 *
 * ```text
 * A  chay so khop, doc ky o `RESOLVED`, tinh xong ket qua NGOAI giao dich
 * B  dong ky: `RESOLVED -> CLOSED`, phat ban giao cong no ra ngoai
 * A  ghi ket qua: xoa cac cap `AUTO` cu, ghi bo moi, doi trang thai tung dong
 * A  doi trang thai ky -> that bai, vi hang dang `CLOSED`
 * ```
 *
 * Loi tra ve cho A la mot loi THAT. Nhung ky da dong thi da bi doi roi, va ban giao ma B phat cho
 * T5 gio mo ta mot bo cap khop KHONG CON TON TAI. Chieu nguoc lai cung hong: dem `pending = 0`
 * xong, mot lan so khop de ra mot chenh lech `PENDING` moi, roi lenh dong di tiep — ky `CLOSED`
 * mang mot cau hoi con treo, dung dieu `FUEL-RECON-004` cam.
 *
 * Sau khi tuan tu hoa, ca hai thu tu deu cho ra mot ket cuc doc duoc:
 *
 *   · so khop TRUOC -> lenh dong nhin thay ket qua CUOI CUNG, va tinh tong tren chinh no;
 *   · dong TRUOC    -> lenh so khop doi 0 hang va tra ve mot VA CHAM co ten.
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
 * SUA mot phieu con `DECLARED` — `GD-10`. Chi cac truong lai xe go duoc.
 *
 * `amendEntry` KHONG nhan trang thai ky vong lam tham so, va do la co y: dieu kien sua duoc la mot
 * HANG SO cua mien (`AMENDABLE_FUEL_VERIFICATION` + `AMENDABLE_FUEL_RECONCILIATION_STATUSES`),
 * khong phai mot y kien cua nguoi goi. De nguoi goi truyen vao thi mot lan goi go sai — hoac mot
 * client cu — se mo lai dung khe ho ma menh de `WHERE` sinh ra de bit.
 */
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
 * NHAP CA BANG KE trong MOT giao dich — dau bang ke, moi dong cua no, VA ky doi soat.
 *
 * ===========================================================================
 * BA THU, MOT GIAO DICH. Ca ba, khong phai hai (Issue #103 §3).
 *
 * Ban dau chi dau bang ke va cac dong nam chung mot giao dich, con ky doi soat la mot lan ghi thu
 * hai ngay sau do. Khoang trong giua hai lan ghi la mot trang thai khong loi ra duoc:
 *
 * ```text
 * ghi bang ke + 200 dong   -> COMMIT
 * (tien trinh chet / mat ket noi / het thoi gian)
 * ghi ky doi soat          -> khong bao gio chay
 * ```
 *
 * Con lai: mot bang ke CO THAT voi 200 dong CO THAT, khong ky doi soat nao. No khong so khop duoc,
 * khong dong duoc, va khong hien o dau ca. Nhap lai thi unique `(cay xang, ky)` chan — nguoi dung
 * doc duoc mot loi noi rang bang ke da ton tai, dieu do DUNG, va khong co nut nao di tiep. Duong ra
 * duy nhat la mot cau lenh SQL go tay.
 *
 * Nen ca ba di cung nhau. Mot lan hong o BAT KY diem nao cuon lai toan bo, va lan nhap lai — cung
 * dung mot thao tac nguoi dung — thanh cong.
 *
 * Do cung la ly do `createReconciliation` KHONG con la mot ham rieng cua hop dong nay: con no thi
 * duong ghi khong an toan van mo, va lan sau se co nguoi di lai vao no.
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
  /** Mo cung mot luc voi bang ke — mot bang ke ton tai LA DE duoc doi soat. */
  readonly reconciliation: FuelReconciliation;
}

/* ------------------------------------------------------------------ *
 * Doi soat
 * ------------------------------------------------------------------ */

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
  /** Trang thai cua ky SAU lan chay — doi trong cung giao dich, khong phai mot lenh thu hai. */
  readonly reconciliation: FuelReconciliation;
}

/**
 * HAI KET CUC cua mot lan chay so khop, khong mot `null` chung.
 *
 * `RECONCILIATION_FROZEN` khong phai mot loi cua nguoi bam nut: mot nguoi khac vua dong ky truoc ho
 * mot nhip. Ho can doc "ky vua duoc dong roi" chu khong phai "khong ghi duoc" — hai cau day ho di
 * hai huong khac nhau.
 */
export type MatchingRunOutcome =
  | { readonly status: 'APPLIED'; readonly result: MatchingRunResult }
  | { readonly status: 'RECONCILIATION_FROZEN'; readonly state: FuelReconciliationState };

export interface ResolveDiscrepancyInput {
  readonly discrepancyId: string;
  /**
   * Ky chua chenh lech nay — de tang kho KHOA no truoc khi ghi, khong phai de doc lai.
   *
   * Truyen vao thay vi tu tra cuu tu `discrepancyId`: lan tra cuu do se nam NGOAI giao dich, tuc
   * dung khoang trong ma khoa hang sinh ra de bit.
   */
  readonly reconciliationId: string;
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
  /**
   * Trang thai ky SAU quyet dinh — doi trong cung giao dich neu day la chenh lech treo cuoi cung.
   *
   * Nguoi goi doc truong nay thay vi tu hoi lai: mot phep doc rieng sau do se cho ra trang thai cua
   * mot THOI DIEM KHAC, va do dung la kieu khoang trong ma khoa hang sinh ra de bit.
   */
  readonly reconciliation: FuelReconciliation;
}

/**
 * BA KET CUC cua mot lan quyet chenh lech.
 *
 * Tang mien kiem ca hai dieu kien truoc; hai nhanh tu choi o day chi mo khi mot phien KHAC xen vao
 * giua luc doc va luc ghi. Chung van phai phan biet duoc: "ky vua bi dong" va "chenh lech vua duoc
 * nguoi khac quyet" dan toi hai viec khac han — mot ben phai xin mo lai ky, mot ben chi can doc lai
 * quyet dinh da co.
 */
export type ResolveDiscrepancyOutcome =
  | { readonly status: 'RESOLVED'; readonly resolved: ResolvedDiscrepancy }
  | { readonly status: 'RECONCILIATION_FROZEN'; readonly state: FuelReconciliationState }
  | { readonly status: 'DISCREPANCY_NOT_PENDING' };

/**
 * DONG MOT KY DOI SOAT — MOT giao dich, NAM viec.
 *
 * ```text
 * 1. khoa hang doi soat (`FOR UPDATE`) va doc lai trang thai
 * 2. DEM LAI chenh lech `PENDING` — ben trong chinh giao dich do
 * 3. TINH LAI tong duoc chap nhan tu du lieu vua khoa (`sumAcceptedSettlement`)
 * 4. `RESOLVED -> CLOSED`, va moi dong/phieu trong ky chuyen `SETTLED` (`GD-11`)
 * 5. ghi mot BAN SUA DOI ban giao cho T5 — hoac phat lai ban gan nhat neu ket qua khong doi
 * ```
 *
 * Nam viec, mot giao dich, vi day dung la bai hoc T3R da tra gia (Issue #94 §2): mot lan chet giua
 * chung de lai mot ky `CLOSED` ma phieu chua khoa, hoac mot ban giao da phat cho mot ky chua dong.
 * Ca hai deu la trang thai khong co duong loi ra bang giao dien.
 *
 * ===========================================================================
 * BUOC 2 VA 3 O TRONG giao dich chu khong o service (Issue #103 §1).
 *
 * Truoc day service dem `pending`, roi cong tong, roi moi goi lenh dong — ba lan doc rieng le. Mot
 * lan chay so khop xen vao giua lam con so ban giao mo ta mot trang thai KHONG TUNG TON TAI, hoac
 * de mot ky dong lai voi mot chenh lech chua ai quyet. Dem va cong o day thi con so di sang T5 luon
 * la con so cua dung trang thai vua bi khoa lai.
 *
 * `acceptedAmount` bien khoi dau vao vi the: no khong con la thu nguoi goi noi, ma la thu giao dich
 * DO DUOC.
 */
export interface CloseReconciliationInput {
  readonly reconciliationId: string;
  readonly actor: string;
  readonly at: Date;
}

export interface ClosedReconciliation {
  readonly reconciliation: FuelReconciliation;
  readonly handoff: FuelSettlementHandoff;
  /**
   * `true` khi ket qua kinh te KHONG DOI so voi ban giao gan nhat — phat lai chinh no.
   *
   * `false` co hai nghia, va ca hai deu la "co mot ban moi": ban dau tien cua ky, hoac mot ban sua
   * doi vi ai do mo lai va sua. Phan biet hai truong hop do la viec cua `handoff.revision`.
   */
  readonly handoffReplayed: boolean;
}

/**
 * BA KET CUC cua mot lan dong ky.
 *
 * `PENDING_DISCREPANCIES` mang theo SO LUONG chu khong chi mot co: nguoi truc doc "con 3 chenh lech
 * chua quyet" thi biet minh phai lam gi, doc "khong dong duoc" thi khong.
 */
export type CloseReconciliationOutcome =
  | { readonly status: 'CLOSED'; readonly closed: ClosedReconciliation }
  | { readonly status: 'PENDING_DISCREPANCIES'; readonly pending: number }
  | { readonly status: 'STATE_RACE'; readonly state: FuelReconciliationState };

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
  /**
   * SUA mot phieu — CHI KHI no van con sua duoc LUC GHI (Issue #103 §4).
   *
   * Menh de `WHERE` mang ca hai truc: `verificationStatus = 'DECLARED'` VA `reconciliationStatus`
   * nam trong `AMENDABLE_FUEL_RECONCILIATION_STATUSES`. `null` = mot phien khac vua duyet phieu
   * hoac vua khop no, khong phai "khong tim thay".
   */
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
  /**
   * GAN MOT ANH CHUNG TU — CHI KHI phieu chua bi mot ky DA DONG khoa lai (Issue #103 §4).
   *
   * Cung ly le voi `amendEntry`: kiem o service roi ghi o day de ho mot khoang cho mot lenh dong ky
   * xen vao. Khac o cho phep KIEM chu khong phai phep GHI la thu phai nam trong giao dich — nen
   * lenh nay khoa hang phieu (`FOR UPDATE`) roi doc `reconciliationStatus` truoc khi chen.
   *
   * `null` = ky vua duoc dong. Anh khong duoc ghi, va khong co hang mo coi nao o lai.
   */
  abstract addEvidence(input: {
    readonly fuelEntryId: string;
    readonly locator: string;
    readonly contentType: string | null;
    readonly byteSize: number | null;
    readonly capturedAt: Date | null;
    readonly uploadedBy: string;
    readonly at: Date;
  }): Promise<FuelReceiptEvidence | null>;
  abstract listEvidence(fuelEntryId: string): Promise<FuelReceiptEvidence[]>;

  /* --- Bang ke --- */
  /** Dau bang ke + moi dong + ky doi soat, MOT giao dich. Xem `CreateStatementInput`. */
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
  /*
   * KHONG co `setReconciliationState` o hop dong nay — va do la mot BAT BIEN, khong phai mot thieu
   * sot (Issue #103 §1).
   *
   * Moi lan doi trang thai cua mot ky deu phai xay ra BEN TRONG mot giao dich da khoa hang do, cung
   * cho voi cac ban ghi ma no giai thich: `applyMatchingRun`, `resolveDiscrepancy`,
   * `closeReconciliation`, `reopenReconciliation`. Mot ham dat trang thai dung mot minh la mot
   * duong vong quanh giao thuc do — no nhan `from`/`to` tu mot phep doc DA CU, va no la dung thu
   * ma bo ra soat nay dong lai.
   */
  /**
   * Ghi ket qua mot lan chay so khop VA dua ky sang `MATCHING` — cung mot giao dich da khoa.
   *
   * Buoc doi trang thai tung o mot lenh RIENG chay SAU lan ghi. Do la chinh cho ma Issue #103 §1
   * chi ra: lan ghi da xong roi lenh doi trang thai moi phat hien ky da bi dong, va cai da ghi
   * khong con duong lui.
   */
  abstract applyMatchingRun(input: ApplyMatchingRunInput): Promise<MatchingRunOutcome>;
  abstract listMatches(reconciliationId: string): Promise<FuelMatch[]>;
  abstract listDiscrepancies(reconciliationId: string): Promise<FuelDiscrepancy[]>;
  abstract findDiscrepancy(id: string): Promise<FuelDiscrepancy | null>;
  abstract countPendingDiscrepancies(reconciliationId: string): Promise<number>;
  abstract resolveDiscrepancy(input: ResolveDiscrepancyInput): Promise<ResolveDiscrepancyOutcome>;
  abstract closeReconciliation(
    input: CloseReconciliationInput,
  ): Promise<CloseReconciliationOutcome>;
  abstract reopenReconciliation(
    input: ReopenReconciliationInput,
  ): Promise<FuelReconciliation | null>;
  /** Ban giao GAN NHAT cua ky — `revision` cao nhat. Xem `FuelSettlementHandoff`. */
  abstract findHandoff(reconciliationId: string): Promise<FuelSettlementHandoff | null>;
  /**
   * CA CHUOI ban giao cua mot ky, `revision` tang dan.
   *
   * T5 doc ban gan nhat; nguoi doi soat va bo test doc ca chuoi. Giu hai duong doc rieng vi mot
   * `findHandoff` tra ve mang se cam do doc nham "ban dau tien" o vi tri 0.
   */
  abstract listHandoffRevisions(reconciliationId: string): Promise<FuelSettlementHandoff[]>;
}
