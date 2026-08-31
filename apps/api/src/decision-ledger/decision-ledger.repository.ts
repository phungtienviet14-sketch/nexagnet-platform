import type { TenantScope } from '../source-registry/tenant-scope.js';
import type {
  BusinessDecisionRecord,
  DecisionActorKind,
  DecisionCriticality,
  DecisionDetail,
  DecisionRelationKind,
  DecisionStatus,
} from './decision-ledger.types.js';
import type { DecisionOutcome } from '../observability/decision-vocabulary.js';

/**
 * KHO cua so cai quyet dinh.
 *
 * MOI ham nhan `TenantScope` lam THAM SO DAU, cung ly do voi `SourceRegistryRepository`: bat bien
 * cach ly khach nam trong KIEU, khong trong thoi quen. Mot ham `findDecision(id)` khong tham so
 * pham vi la mot ham ma ke goi khong the goi sai, va vi the cung khong the bi bat sai.
 *
 * DUNG LAI `TenantScope` cua `source-registry/` chu khong tu dinh nghia mot ban thu hai. Muc 3
 * hop dong: khong nhan ban mot cau truc ben vung da co chi de doi ten no. Hai tang nay la hai mat
 * cua cung mot cau hoi ("so lieu tu dau" va "vi sao da xu su nhu vay"), va mot khach chi co MOT
 * danh tinh — hai kieu pham vi se cho phep hai cau tra loi khac nhau cho cung mot cau hoi do.
 *
 * KHONG CO `update*` NAO cho noi dung mot quyet dinh. `markCorrected` la duong duy nhat doi mot
 * hang da ghi, va no chi doi `status`. Do la append-only nam trong be mat kho, khong trong loi
 * hua cua tai lieu.
 */
export abstract class DecisionLedgerRepository {
  /**
   * Chay nhieu buoc nhu MOT don vi.
   *
   * VI SAO CAN O DAY, ngoai ly do cua tang nguon su that: mot ban SUA la HAI phep ghi — them hang
   * moi va doi `status` hang cu. Nua duong la mot so cai co hai hang RECORDED cho cung mot ca,
   * hoac mot hang CORRECTED khong co ban sua nao. Ca hai deu la trang thai ma khong truy van nao
   * doc ra dung duoc.
   *
   * Va la ly do muc `FINANCIAL_OR_AUTHORIZATION` fail-closed CO NGHIA: ben goi boc ca thay doi
   * nghiep vu lan lan ghi so cai trong mot don vi, nen ghi that bai thi nghiep vu cuon nguoc.
   *
   * TAI NHAP DUOC: goi long nhau tra ve chinh don vi dang mo.
   */
  abstract runInTransaction<T>(
    fn: (repository: DecisionLedgerRepository) => Promise<T>,
  ): Promise<T>;

  /**
   * Ghi mot quyet dinh MOI. Nem neu `(tenantId, idempotencyKey)` da ton tai — cong chong trung o
   * tang dich vu doc TRUOC, nhung dieu kien tranh chap giua hai tien trinh chi co DB chan duoc.
   */
  abstract append(scope: TenantScope, input: DecisionAppendInput): Promise<BusinessDecisionRecord>;

  abstract findById(scope: TenantScope, id: string): Promise<BusinessDecisionRecord | null>;

  abstract findByIdempotencyKey(
    scope: TenantScope,
    idempotencyKey: string,
  ): Promise<BusinessDecisionRecord | null>;

  /**
   * DONG THOI GIAN cua mot ca nghiep vu — cu nhat truoc.
   *
   * Thu tu phai TAT DINH ke ca khi hai quyet dinh cung mot moc `occurredAt` (chuyen thuong xuyen:
   * mot luot ra ba quyet dinh trong cung mot mili-giay). Hien thuc phai pha the bang mot khoa thu
   * hai on dinh — xem chu thich o tung ban.
   */
  abstract listForSubject(
    scope: TenantScope,
    subjectType: string,
    subjectId: string,
  ): Promise<readonly BusinessDecisionRecord[]>;

  abstract listForTrace(
    scope: TenantScope,
    traceId: string,
  ): Promise<readonly BusinessDecisionRecord[]>;

  abstract listForWorkflowRun(
    scope: TenantScope,
    workflowRunId: string,
  ): Promise<readonly BusinessDecisionRecord[]>;

  /** MOI quyet dinh da dung mot ban su that — duong doc nguoc de danh gia thiet hai. */
  abstract listForFact(
    scope: TenantScope,
    factId: string,
  ): Promise<readonly BusinessDecisionRecord[]>;

  /**
   * Doi `status` cua MOT hang da ghi. Duong DUY NHAT sua mot hang, va no khong xoa gi.
   * `SUPERSEDED` / `CORRECTED` chi duoc dat khi da co hang sua tro nguoc ve day.
   */
  abstract markStatus(
    scope: TenantScope,
    id: string,
    status: Extract<DecisionStatus, 'SUPERSEDED' | 'CORRECTED'>,
  ): Promise<BusinessDecisionRecord>;
}

/** Anh chup mot su that LUC DUOC DUNG. Khong chua `value` — xem `schema.prisma`. */
export interface DecisionFactReferenceInput {
  readonly factId: string;
  readonly factDomain: string;
  readonly factKey: string;
  readonly factStatusAtUse: string;
  readonly sourceId?: string | null;
  readonly sourceKey?: string | null;
  readonly sourceVersion?: string | null;
}

export interface DecisionRelationInput {
  readonly kind: DecisionRelationKind;
  readonly targetType: string;
  readonly targetId: string;
  readonly note?: string | null;
}

/**
 * Dau vao cua mot lan ghi. Da qua MOI cong kiem cua dich vu — kho khong kiem lai nghiep vu, chi
 * kiem cai ma DB kiem duoc (khoa duy nhat, khoa ngoai).
 */
export interface DecisionAppendInput {
  readonly id?: string;
  readonly decisionPoint: string;
  readonly outcome: DecisionOutcome;
  readonly reasonCode: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly actorKind: DecisionActorKind;
  readonly actorRef?: string | null;
  readonly criticality: DecisionCriticality;
  readonly policyRef?: string | null;
  readonly policyVersion?: string | null;
  readonly modelProvider?: string | null;
  readonly modelRef?: string | null;
  readonly releaseSha?: string | null;
  readonly traceId?: string | null;
  readonly spanId?: string | null;
  readonly workflowRunId?: string | null;
  readonly approvalRef?: string | null;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly supersedesId?: string | null;
  readonly detail?: DecisionDetail | null;
  readonly factRefs?: readonly DecisionFactReferenceInput[];
  readonly relations?: readonly DecisionRelationInput[];
}
