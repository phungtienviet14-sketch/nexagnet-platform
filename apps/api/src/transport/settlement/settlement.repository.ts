import type { BusinessDate } from '../business-date.js';
import type { CommissionCalcKind, CommissionScope } from './commission-rules.js';
import type { SettlementDocumentKind, SettlementSourceContext } from './settlement-documents.js';
import type {
  SettlementCounterpartyKind,
  SettlementDirection,
  SettlementFlow,
} from './settlement-flows.js';
import type {
  CommissionCalculation,
  CommissionRule,
  CommissionRuleVersion,
  CustomerSettlementTerms,
  SettlementAllocation,
  SettlementDocument,
  SettlementDocumentChain,
  SettlementPeriod,
  SettlementPeriodStatus,
  SettlementRecognition,
} from './settlement.types.js';

/**
 * HOP DONG KHO cua `transport-settlement`.
 *
 * ===========================================================================
 * BA DUONG GHI KHONG TON TAI O DAY, VA SU VANG MAT DO LA MOT PHAN CUA THIET KE.
 *
 * 1. KHONG co `setDocumentStatus()`. Trang thai mot chung tu chi doi khi mot ban DAO duoc ghi, va
 *    hai lan ghi do nam trong CUNG mot giao dich (`correctDocument`). Mot duong doi trang thai
 *    rieng se lam ton tai duoc mot hang `REVERSED` khong co ban dao nao — tuc mot khoan no bien
 *    mat khoi bao cao ma khong co dong doi ung nao giai thich.
 *
 *    Day dung la lo hong T4R §1 phat hien o `setReconciliationState()` cua `TX-04`. Khong lam lai
 *    lan hai.
 *
 * 2. KHONG co `createDocument()` tho. Moi chung tu goc di qua `recogniseDocument()`, va ham do
 *    kiem khoa chong ghi trung + van tay + ky dong bang TRONG giao dich. Mot duong tao thang se
 *    lam ba cong do thanh tuy chon, va cach re nhat de dung no la bo qua ca ba.
 *
 * 3. KHONG co `updateDocument()`. `INV-20` doc sang `TX-05`: sua = ghi them. Neu mot ngay nao do
 *    can sua mot truong khong phai tien (vd `invoiceRef`), thi do la mot ham RIENG co ten noi ro
 *    no khong dung vao tien — khong phai mot `update` tong quat.
 *
 * ===========================================================================
 * GIAO DICH NAM O TANG KHO, KHONG O SERVICE.
 *
 * Cung ly le voi `fuel.repository.ts` sau T4R: mot cong kiem o service chi dung voi MOT nguoi ghi.
 * Voi hai nguoi ghi cung luc, chi mot lenh ghi co dieu kien di KEM no moi dung. Nen
 * `recognise`/`correct`/`allocate` deu la MOT lenh cua tang kho, khong phai mot chuoi loi goi ma
 * service tu ghep lai.
 */

export interface RecogniseDocumentCommand {
  readonly direction: SettlementDirection;
  readonly flow: SettlementFlow;
  readonly counterpartyKind: SettlementCounterpartyKind;
  readonly counterpartyId: string;
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly tripId: string | null;
  readonly sourceContext: SettlementSourceContext;
  readonly sourceId: string;
  /** Tinh o tang mien (`settlementDocumentFingerprint`) va truyen xuong — kho khong tu nghi ra. */
  readonly sourceFingerprint: string;
  readonly invoiceRef: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
}

export interface CorrectDocumentCommand {
  readonly targetId: string;
  readonly kind: Extract<SettlementDocumentKind, 'ADJUSTMENT' | 'REVERSAL'>;
  /** So tien CO DAU cua ban sua: chenh lech voi `ADJUSTMENT`, so doi dau voi `REVERSAL`. */
  readonly signedAmount: number;
  readonly businessDate: BusinessDate;
  readonly sourceContext: SettlementSourceContext;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly note: string | null;
  readonly recordedBy: string;
}

export interface AllocateCommand {
  readonly documentId: string;
  readonly amount: number;
  readonly businessDate: BusinessDate;
  readonly method: string;
  readonly sourceContext: string;
  readonly sourceId: string;
  readonly note: string | null;
  readonly recordedBy: string;
}

export interface RecordCommissionCommand {
  readonly tripId: string;
  readonly partnerId: string;
  readonly ruleVersionId: string;
  readonly ruleScopeSnapshot: CommissionScope;
  readonly calcKindSnapshot: CommissionCalcKind;
  readonly rateBasisPointsSnapshot: number | null;
  readonly fixedAmountSnapshot: number | null;
  readonly basisAmount: number;
  readonly rawAmount: string;
  readonly resultAmount: number;
  readonly businessDate: BusinessDate;
  /** Chung tu cong no hoa hong di kem — ghi CUNG giao dich voi anh chup. */
  readonly document: RecogniseDocumentCommand;
}

export interface DocumentQuery {
  readonly direction?: SettlementDirection;
  readonly flow?: SettlementFlow;
  readonly counterpartyId?: string;
  readonly tripId?: string;
  /** Chi lay ban goc — bao cao cong no doc theo CHUOI, khong theo tung hang. */
  readonly originalsOnly?: boolean;
}

/** Ung vien luat hoa hong doc len tu kho: mot BAN, kem pham vi cua luat so huu no. */
export interface CommissionCandidateRow extends CommissionRuleVersion {
  readonly partnerId: string | null;
  readonly routeKey: string | null;
}

export abstract class SettlementRepository {
  /* ----------------------------- Chung tu ----------------------------- */

  /**
   * GHI NHAN mot nghia vu tien. Nguyen tu, va la duong DUY NHAT tao ban goc.
   *
   * Ba viec trong mot giao dich: kiem ky dong bang theo `(flow, businessDate)`, tra khoa
   * `(sourceContext, sourceId)`, va so van tay neu khoa da ton tai. Tach ba viec do ra thanh ba
   * loi goi se de mot lenh ghi khac chen vao giua — va cho de chen nhat la giua "tra khoa" va
   * "ghi", tuc dung cho sinh ra hang trung.
   *
   * Tra `replayed: true` khi khoa da ton tai VA van tay trung. Van tay LECH thi NEM, khong tra ve
   * ban cu — xem `SETTLEMENT_SOURCE_FINGERPRINT_CONFLICT`.
   */
  abstract recogniseDocument(command: RecogniseDocumentCommand): Promise<SettlementRecognition>;

  /**
   * SUA mot chung tu bang cach GHI THEM. Nguyen tu.
   *
   * Khoa hang ban goc, kiem lai `canAdjust()` TU HANG DA KHOA, ghi ban sua, va — chi voi
   * `REVERSAL` — dat `status` cua ban goc thanh `REVERSED`. Ca hai lan ghi trong mot giao dich.
   *
   * Doc lai trang thai TU HANG DA KHOA chu khong tin vao lan doc truoc do la diem mau chot: giua
   * lan doc cua service va lan ghi nay, mot lenh dao khac co the da chay xong.
   */
  abstract correctDocument(command: CorrectDocumentCommand): Promise<SettlementDocument>;

  /** PHAN BO mot lan thu/tra. Nguyen tu: khoa chuoi, cong lai so du, roi moi ghi. */
  abstract allocate(command: AllocateCommand): Promise<{
    readonly allocation: SettlementAllocation;
    readonly replayed: boolean;
  }>;

  abstract findDocument(id: string): Promise<SettlementDocument | null>;

  /** Doc CA CHUOI: ban goc, moi ban sua, moi lan phan bo, va hai con so cong don. */
  abstract findChain(originalId: string): Promise<SettlementDocumentChain | null>;

  /**
   * Liet ke chung tu. `query.direction` la tham so BAT BUOC ve mat nghiep vu o moi bao cao tong
   * hop — `GD-15` cam bu tru, nen mot phep cong quen loc chieu CHINH LA mot phep bu tru.
   */
  abstract listDocuments(query: DocumentQuery): Promise<SettlementDocument[]>;

  /** Chuoi cua nhieu ban goc mot lan — tranh N+1 o bao cao tuoi no. */
  abstract listChains(query: DocumentQuery): Promise<SettlementDocumentChain[]>;

  /* ------------------------------- Ky ------------------------------- */

  abstract openPeriod(input: {
    readonly flow: SettlementFlow;
    readonly startDate: BusinessDate;
    readonly endDate: BusinessDate;
  }): Promise<SettlementPeriod>;

  abstract transitionPeriod(input: {
    readonly periodId: string;
    readonly to: SettlementPeriodStatus;
    readonly actor: string;
    readonly reason: string | null;
  }): Promise<SettlementPeriod>;

  abstract findPeriod(id: string): Promise<SettlementPeriod | null>;

  /** Ky CHUA mot ngay nghiep vu cua mot dong. `null` = ngay do khong thuoc ky nao. */
  abstract findPeriodCovering(
    flow: SettlementFlow,
    businessDate: BusinessDate,
  ): Promise<SettlementPeriod | null>;

  abstract listPeriods(flow?: SettlementFlow): Promise<SettlementPeriod[]>;

  /* ---------------------------- Dieu khoan ---------------------------- */

  abstract upsertCustomerTerms(input: {
    readonly customerId: string;
    readonly paymentTermDays: number;
    readonly creditLimit: number | null;
    readonly currencyCode: string;
    readonly updatedBy: string;
  }): Promise<CustomerSettlementTerms>;

  abstract findCustomerTerms(customerId: string): Promise<CustomerSettlementTerms | null>;

  /* ----------------------------- Hoa hong ----------------------------- */

  abstract createCommissionRule(input: {
    readonly partnerId: string | null;
    readonly routeKey: string | null;
    readonly createdBy: string;
  }): Promise<CommissionRule>;

  /**
   * CONG BO mot ban luat moi. `version` do KHO cap phat, khong do nguoi goi truyen vao.
   *
   * Neu nguoi goi tu chon so ban, hai lan cong bo dong thoi se cung nham toi mot so — va mot trong
   * hai se do o `@@unique([ruleId, version])`, tuc mot lan cong bo hop le that bai vi mot ly do
   * khong lien quan gi den noi dung cua no.
   */
  abstract publishCommissionRuleVersion(input: {
    readonly ruleId: string;
    readonly calcKind: CommissionCalcKind;
    readonly rateBasisPoints: number | null;
    readonly fixedAmount: number | null;
    readonly effectiveFrom: BusinessDate;
    readonly effectiveTo: BusinessDate | null;
    readonly publishedBy: string;
  }): Promise<CommissionRuleVersion>;

  abstract findCommissionRule(id: string): Promise<CommissionRule | null>;

  /** Luat theo dung mot pham vi. Dung de chan hai luat cung pham vi TRUOC khi tao. */
  abstract findCommissionRuleByScope(
    partnerId: string | null,
    routeKey: string | null,
  ): Promise<CommissionRule | null>;

  /**
   * MOI ban luat co the ap cho mot doi tac + tuyen, KHONG loc theo ngay.
   *
   * Loc hieu luc lam o tang mien (`selectCommissionRule`) chu khong o SQL: phep chon bac uu tien
   * va phep loc hieu luc phai nhin CUNG mot tap. Neu SQL loc truoc, hai ban chong lap ngay se bi
   * loai bot mot cai truoc khi `AMBIGUOUS` kip phat hien — va cong fail-closed cua Issue #87 se im
   * lang khong bao gio dong.
   */
  abstract listCommissionCandidates(
    partnerId: string,
    routeKey: string,
  ): Promise<CommissionCandidateRow[]>;

  /** Ghi anh chup + chung tu hoa hong trong MOT giao dich. */
  abstract recordCommission(command: RecordCommissionCommand): Promise<{
    readonly calculation: CommissionCalculation;
    readonly document: SettlementDocument;
    readonly replayed: boolean;
  }>;

  abstract findCommissionByTrip(tripId: string): Promise<CommissionCalculation | null>;
}
