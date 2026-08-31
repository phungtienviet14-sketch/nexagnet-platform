import type { DecisionOutcome } from '../observability/decision-vocabulary.js';

/**
 * HINH DANG DU LIEU cua so cai quyet dinh — doc lap voi Prisma.
 *
 * Tach ra cung ly do voi `source-registry.types.ts`: hai hien thuc kho (bo nho / Postgres) phai
 * noi cung mot ngon ngu, va tang nghiep vu phai test duoc ma khong dung DB.
 */

/** AI quyet dinh. Xem chu thich enum trong `schema.prisma` — day la cot chan LLM doi vai. */
export const DECISION_ACTOR_KINDS = [
  'DETERMINISTIC_RULE',
  'HUMAN',
  'LLM_RECOMMENDATION',
  'SYSTEM_CONSEQUENCE',
] as const;
export type DecisionActorKind = (typeof DECISION_ACTOR_KINDS)[number];

export const DECISION_CRITICALITIES = [
  'FINANCIAL_OR_AUTHORIZATION',
  'BUSINESS_STANDARD',
  'ADVISORY',
] as const;
export type DecisionCriticality = (typeof DECISION_CRITICALITIES)[number];

export const DECISION_STATUSES = ['RECORDED', 'SUPERSEDED', 'CORRECTED'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const DECISION_RELATION_KINDS = ['PARENT_DECISION', 'APPROVAL', 'RESULTING_ENTITY'] as const;
export type DecisionRelationKind = (typeof DECISION_RELATION_KINDS)[number];

/**
 * Gia tri duoc phep nam trong `detail`.
 *
 * HEP CO Y — day la nua thu nhat cua hop dong rieng tu (muc 5). Mot cay long nhau tuy y la thu
 * cho phep ca mot tin nhan khach, mot prompt LLM hay mot ban ghi ngan hang di vao so cai duoi mot
 * khoa vo hai. Vo hinh dang phang nay, cong kiem o `decision-evidence.ts` se phai doan.
 */
export type DecisionDetailValue = string | number | boolean | null;
export type DecisionDetail = Readonly<Record<string, DecisionDetailValue>>;

/**
 * MOT SU THAT DA DUNG, kem anh chup trang thai LUC DUNG.
 *
 * `factStatusAtUse` la thu giu muc 9 hop dong dung: khi ban su that bi thay the, `status` cua
 * chinh hang do doi sang `SUPERSEDED`, va mot quyet dinh dung dan hom qua se doc lai nhu "da dung
 * mot su that het hieu luc" neu ta chi giu khoa ngoai.
 */
export interface DecisionFactReferenceRecord {
  readonly id: string;
  readonly decisionId: string;
  readonly factId: string;
  readonly factDomain: string;
  readonly factKey: string;
  readonly factStatusAtUse: string;
  readonly sourceId: string | null;
  readonly sourceKey: string | null;
  readonly sourceVersion: string | null;
}

export interface DecisionRelationRecord {
  readonly id: string;
  readonly decisionId: string;
  readonly kind: DecisionRelationKind;
  readonly targetType: string;
  readonly targetId: string;
  readonly note: string | null;
}

export interface BusinessDecisionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly decisionPoint: string;
  readonly outcome: DecisionOutcome;
  readonly reasonCode: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly occurredAt: Date;
  readonly recordedAt: Date;
  readonly actorKind: DecisionActorKind;
  readonly actorRef: string | null;
  readonly criticality: DecisionCriticality;
  readonly policyRef: string | null;
  readonly policyVersion: string | null;
  readonly modelProvider: string | null;
  readonly modelRef: string | null;
  readonly releaseSha: string | null;
  readonly traceId: string | null;
  readonly spanId: string | null;
  readonly workflowRunId: string | null;
  readonly approvalRef: string | null;
  readonly status: DecisionStatus;
  readonly idempotencyKey: string;
  readonly fingerprint: string;
  readonly supersedesId: string | null;
  readonly detail: DecisionDetail | null;
  readonly factRefs: readonly DecisionFactReferenceRecord[];
  readonly relations: readonly DecisionRelationRecord[];
}

/**
 * KET QUA cua mot lan ghi so cai — UNION TUONG MINH, khong phai mot ban ghi kem mot co.
 *
 * VI SAO UNION. Muc 11 hop dong doi "ledger failure must be explicit". Mot hinh dang
 * `{ decision, replayed }` duy nhat se buoc duong ghi HONG phai tra ve mot thu gi do trong nhu
 * mot ban ghi — va bat ky noi goi nao doc `result.decision.id` se nhan mot id khong ton tai trong
 * DB, roi ghi no vao mot cho khac. Do dung la mat mat im lang, chi khac la lan nay ta tu tao ra
 * bang chung gia cho chinh minh.
 *
 * Voi union, mot noi goi muon `decision` PHAI thu `persisted` truoc. Trinh bien dich la thu thi
 * hanh dieu do, khong phai mot dong chu thich.
 *
 * `replayed` tach rieng vi mot ly do khac: mot lan chay lai tra ve DUNG hang cu, nhung noi goi can
 * phan biet duoc de dem so lan thu lai that su. Cung ly do voi `EXPENSE_IDEMPOTENT_REPLAY`.
 */
export type DecisionAppendResult =
  | {
      readonly persisted: true;
      readonly replayed: boolean;
      readonly decision: BusinessDecisionRecord;
    }
  | {
      readonly persisted: false;
      readonly replayed: false;
      readonly decision: null;
      /** Chinh sach da cho di tiep, va DAY la ly do — de noi goi ghi log/canh bao neu muon. */
      readonly reason: 'LEDGER_WRITE_DEFERRED' | 'LEDGER_WRITE_DROPPED';
      readonly cause: string;
    };
