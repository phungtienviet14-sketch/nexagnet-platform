import type { BusinessDate } from '../business-date.js';
import type { CommissionCalcKind, CommissionScope } from './commission-rules.js';
import type { SettlementDocumentKind, SettlementSourceContext } from './settlement-documents.js';
import type {
  SettlementCounterpartyKind,
  SettlementDirection,
  SettlementFlow,
} from './settlement-flows.js';
import type { FuelHandoffScanPosition, FuelHandoffScanState } from './settlement.ports.js';
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
  /** Snapshot doc truoc khi tinh delta; neu da doi trong luc tranh chap thi fail, khong ghi delta cu. */
  readonly expectedGrossAmount?: number;
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
   *
   * CHONG GHI TRUNG giong het duong ghi nhan: cung `(sourceContext, sourceId)` va cung van tay thi
   * PHAT LAI ban da ghi; van tay lech thi NEM. Su doi xung nay khong phai cho dep — mot lan nap
   * lai ban giao cua `TX-04` di qua duong nay, va neu no khong phat lai duoc thi mot duong tich
   * hop chay lai binh thuong se do o `@@unique` thay vi tra ve ket qua cu.
   */
  abstract correctDocument(command: CorrectDocumentCommand): Promise<{
    readonly document: SettlementDocument;
    readonly replayed: boolean;
  }>;

  /** PHAN BO mot lan thu/tra. Nguyen tu: khoa chuoi, cong lai so du, roi moi ghi. */
  abstract allocate(command: AllocateCommand): Promise<{
    readonly allocation: SettlementAllocation;
    readonly replayed: boolean;
  }>;

  abstract findDocument(id: string): Promise<SettlementDocument | null>;
  /**
   * Chung tu GOC cua mot khoa nguon, neu da co.
   *
   * Ton tai cho DUNG MOT cau hoi cua `#268` I5: *day co phai mot lan chon nguon MOI khong*.
   * Neu da co chung tu cho khoa nay thi su kien kinh te DA XAY RA, va cong nghiem thu khong
   * duoc ap nguoc len no — *"existing authoritative settlement links remain authoritative"*.
   *
   * Tach khoi `listDocuments()` vi `DocumentQuery` khong loc theo khoa nguon, va noi long no de
   * lam viec do se mo mot duong doc theo `sourceId` cho moi bao cao — mot truong ma bao cao
   * khong bao gio nen nhin thay.
   */
  abstract findDocumentBySource(
    sourceContext: string,
    sourceId: string,
  ): Promise<SettlementDocument | null>;

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

  /* --------------------- Con tro tieu thu ban giao --------------------- */

  /**
   * DA DOC TOI BAN NAO cua nhung ky duoc hoi. Tra ve mot ban do `reconciliationId -> revision`.
   *
   * Hoi CA LO chu khong tung ky: vong quet vua doc mot lo ban giao va can biet lo do con viec gi.
   * Hoi tung ky se thanh N+1 truy van cho mot cau hoi von la mot.
   *
   * Ky VANG MAT khoi ban do = chua tieu thu ban nao. Do la mot trang thai KHAC voi "da tieu thu
   * ban 0" — khong co ban 0, `revision` dem tu 1 (xem `TransportFuelSettlementHandoff`).
   */
  abstract fuelHandoffCursors(reconciliationIds: readonly string[]): Promise<Map<string, number>>;

  /**
   * DAY con tro len sau khi ban giao da duoc ghi thanh cong.
   *
   * ===========================================================================
   * CHI TIEN, KHONG LUI. Lenh ghi co dieu kien `consumedRevision < revision`: hai vong quet chay
   * song song, ben cham hon KHONG duoc keo con tro ve so cu cua no. Neu khong co dieu kien do,
   * mot vong quet cham mot nhip se lam ky do duoc doc lai mai mai.
   *
   * Goi SAU khi ghi chung tu, khong truoc. Mot lan ghi hong phai de lai viec cho luot sau, chu
   * khong de lai mot dau "da xong" gia — do la yeu cau 6 cua `#295` P0.
   *
   * `advanced: false` nghia la mot ai do da di truoc toi day roi, va do khong phai loi.
   */
  abstract advanceFuelHandoffCursor(input: {
    readonly reconciliationId: string;
    readonly revision: number;
    readonly handoffId: string;
  }): Promise<{ readonly advanced: boolean }>;

  /* --------------------- Vi tri quet hop thu di ---------------------- */

  /**
   * NHIP TRUOC DUNG O DAU, VA O VONG THU MAY. `position: null` = bat dau lai tu dau hop thu.
   *
   * ===========================================================================
   * BA HAM DUOI DAY GIU MOT TINH CHAT KHAC HAN con tro tieu thu o tren. Doc `settlement.ports.ts`
   * (`FuelHandoffScanPosition`) truoc khi sua bat cu ham nao trong so chung.
   *
   * Con tro tieu thu giu cho SO TIEN dung. Vi tri quet giu cho vong quet CHAY. He thong nay da tung
   * co con tro tieu thu hoan hao va VAN khong bao gio tra tien cho ky thu 501, vi no luon doc lai
   * dung 500 hang dau tien.
   */
  abstract fuelHandoffScan(): Promise<FuelHandoffScanState>;

  /**
   * DAY vi tri quet toi hang vua NHIN TOI — ke ca hang vua ghi HONG.
   *
   * ===========================================================================
   * DAY LA CHO DE SAI NHAT TRONG CA CO CHE, nen viet ro:
   *
   * Mot phan xa tu nhien la *"ghi hong thi dung day vi tri, de con lam lai"*. Lam the la dung lai
   * chinh cai bay vua thoat: 25 ky hong lien tiep se an tron chan ghi cua moi nhip, va moi ky lanh
   * manh dung sau chung khong bao gio duoc nhin toi. Bo cong no cua ca doanh nghiep chet vi 25 hang
   * hong — dung hinh dang cua loi cu, chi doi cho.
   *
   * Viec cua ky hong KHONG mat: `advanceFuelHandoffCursor` chua he duoc goi cho no, nen vong quet
   * SAU se lam lai. Cai doi la LUC lam lai: vong sau, khong phai nhip sau.
   *
   * ===========================================================================
   * `observed` LA BAT BUOC — cho de sai thu ba, them sau `INDEPENDENT_CHATGPT_REVIEW_3`.
   *
   * `observed` la trang thai nhip nay DOC RA luc bat dau (`fuelHandoffScan()`), tuc chinh anh chup
   * ma trang vua duyet duoc doc tu do. Lan ghi chi xay ra khi CA HAI dieu sau dung, trong MOT lenh
   * ghi co dieu kien o tang CSDL:
   *
   *   1. `cycles` ben VAN BANG `observed.cycles` — chua co lan quay ve dau nao vuot mat nhip nay.
   *      Thieu dieu kien nay, mot nhip cua vong N ghi duoc vao vong N+1 va bo qua mot doan cua
   *      chinh vong moi. Chuoi day du nam o `FuelHandoffScanState`;
   *   2. vi tri ben la `null` hoac nam TRUOC `next` theo `(emittedAt, handoffId)` — chi tien, khong
   *      lui, ke ca truoc mot nhip CUNG vong cham hon.
   *
   * `observed.position` KHONG nam trong phep so sanh, va do la co y: hai nhip cung vong doc tu cung
   * mot cho roi duyet toi hai cho khac nhau thi cho XA HON phai thang, du no ghi sau.
   *
   * KHONG doc lai trang thai ngay truoc khi goi ham nay. Anh chup doc lai luon mang so hieu vong
   * MOI NHAT, nen dieu kien 1 luon dung — tuc dung lai dung loi vua sua.
   *
   * `advanced: false` = mot tien trinh khac da di truoc (sang vong moi, hoac xa hon trong cung
   * vong). KHONG phai loi, va viec cua nhip nay khong mat: con tro TIEU THU cua moi ky no ghi da
   * duoc day rieng.
   */
  abstract advanceFuelHandoffScan(
    observed: FuelHandoffScanState,
    next: FuelHandoffScanPosition,
  ): Promise<{ readonly advanced: boolean }>;

  /**
   * DA DOC TOI DUOI HOP THU — quay ve dau va dem them mot vong, NEU trang thai chua doi.
   *
   * Khong co ham nay thi vi tri quet chi tien mai, va hai thu se bi bo lai vinh vien: viec cua
   * nhung ky GHI HONG (da bi di qua o tren), va mot ban sua doi phat ra voi `emittedAt` lui ve
   * truoc vi tri hien tai.
   *
   * ===========================================================================
   * `expected` LA BAT BUOC, va day la cho de sai thu hai cua ca co che.
   *
   * Ham nay tung khong co tham so nao: quay ve dau duoc coi la LUON hop le, vi no chi keo vi tri ve
   * `null`. Lap luan do sai o dung mot cho — no gia dinh chi co MOT tien trinh quet. Lich quet cua
   * duong nay (`fuel-handoff-drain.scheduler.ts`) chi chan trung LAP TRONG MOT TIEN TRINH; nhieu
   * tien trinh API cung quet la mot hinh dang trien khai that.
   *
   * Voi hai tien trinh, mot lan ghi tran keo lui duoc tien do THAT:
   *
   *     A doc trang thai `S`, cham day hop thu, roi KHUNG lai (GC, mang, lich CPU)
   *     B cham day hop thu -> quay ve dau
   *     C quet vong moi    -> tien toi `H`
   *     A tinh day, quay ve dau VO DIEU KIEN -> `H` bi xoa
   *
   * Tien khong sai (`@@unique([sourceContext, sourceId])` van chan cong no thu hai), nhung vong
   * quet co the bi day lui lai mai — dung cai tinh chat SONG ma vi tri quet sinh ra de giu.
   *
   * Nen nguoi goi phai noi ro NO DA THAY GI khi ket luan la het hop thu, va lan ghi chi xay ra neu
   * trang thai ben VAN la trang thai do. Doc `FuelHandoffScanState` de biet vi sao phep so sanh
   * phai gom ca `cycles` chu khong rieng `position`.
   *
   * `rewound: false` = mot tien trinh khac da di truoc; lan quay ve dau nay la CU va phai khong
   * lam gi. Do KHONG phai loi, va cung KHONG phai mot lan quay ve dau.
   */
  abstract rewindFuelHandoffScan(
    expected: FuelHandoffScanState,
  ): Promise<{ readonly rewound: boolean }>;
}
