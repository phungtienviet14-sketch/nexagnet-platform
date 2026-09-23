import type { FuelReconciliationStatus } from './fuel-lifecycle.js';
import type { FuelDiscrepancyKind } from './fuel-matching.js';
import { isCashPaidLineAcceptance } from './fuel-payable.js';
import type { FuelDiscrepancyResolution, FuelDiscrepancyStatus } from './fuel.types.js';

/**
 * CHUOI QUYET DINH DOI SOAT — `#317` G0, ham THUAN, khong biet Nest/Prisma.
 *
 * ===========================================================================
 * QUYET DINH CHU SO HUU (`OWNER_DECISIONS_2026_09_17`, G0)
 *
 *   · moi `statementLineId` chi co MOT quyet dinh hieu luc hien tai;
 *   · lich su quyet dinh cu KHONG bi xoa/viet lai;
 *   · quyet dinh moi nhat theo chuoi thay the la quyet dinh co hieu luc;
 *   · `ACCEPT_SUPPLIER_AMOUNT -> IGNORE_WITH_REASON` sau khi mo lai phai lam dong do KHONG con dong
 *     gop vao tong duoc chap nhan — tuc tong DUOC PHEP GIAM.
 *
 * Truoc tep nay, `sumAcceptedSettlement` gom `statementLineId` cua MOI chenh lech mang `ACCEPT`, va
 * mot quyet dinh da ghi khong sua duoc. Mot lan chap nhan nham khong rut lai duoc.
 *
 * ===========================================================================
 * HAI TANG, MOT LUAT
 *
 * CHUOI duoc giu o CSDL: moi lan doi y la MOT HANG `RESOLVED` moi co `supersedesId` tro ve quyet
 * dinh no thay the (UNIQUE — mot quyet dinh bi thay the nhieu nhat mot lan), va trigger tu choi moi
 * `UPDATE`/`DELETE` len hang da quyet. PHEP CHIEU "cai nao dang hieu luc" song o DAY, mot ban, va ca
 * kho Prisma lan kho trong bo nho deu goi no — cung ly le voi `fuel-settlement.ts`.
 *
 * Phep chieu KHONG doc thu tu mang. Voi du lieu cu (truoc migration) co the co hai quyet dinh da ghi
 * cho cung mot dong ma khong hang nao tro toi hang nao; khi do ban quyet MUON hon thang
 * (`resolvedAt`, roi `createdAt`, roi `id`) — tat dinh, khong phu thuoc truy van nao tra ve truoc.
 */

/** Chi nhung truong phep chieu doc — co y NGHEO, cung ly le voi `AcceptableStatementLine`. */
export interface DecisionRecord {
  readonly id: string;
  readonly status: FuelDiscrepancyStatus;
  readonly statementLineId: string | null;
  readonly resolution: FuelDiscrepancyResolution | null;
  readonly supersedesId: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
}

/**
 * CAC QUYET DINH DUOC PHEP SUA SANG / SUA TU — danh sach DONG.
 *
 * `MATCH_CONFIRMED` CO Y vang mat o CA HAI chieu: quyet dinh do da ghi mot CAP KHOP tay
 * (`TransportFuelMatch`), va doi y ve no se phai xoa cap khop — tuc viet lai lich su. Duong dung la
 * mo lai ky, chay lai so khop, roi quyet chenh lech moi; duong do da noi chuoi dung luat nay.
 */
export const REVISABLE_FUEL_RESOLUTIONS = [
  'ACCEPT_SUPPLIER_AMOUNT',
  'REJECT_SUPPLIER_LINE',
  'IGNORE_WITH_REASON',
  'ENTRY_CORRECTION_REQUIRED',
] as const satisfies readonly FuelDiscrepancyResolution[];
export type RevisableFuelResolution = (typeof REVISABLE_FUEL_RESOLUTIONS)[number];

export const FUEL_DECISION_REVISION_DENIED_REASONS = [
  /** Chenh lech chua ai quyet — duong dung la QUYET, khong phai sua. */
  'DECISION_NOT_RESOLVED',
  /** Quyet dinh ve mot phieu le, khong gan dong bang ke nao — khong vao tong tien, khong co chuoi. */
  'DECISION_WITHOUT_STATEMENT_LINE',
  /** Da co mot quyet dinh moi hon cho dong nay — phai sua ban moi nhat, khong sua lich su. */
  'DECISION_NOT_CURRENT',
  /** `MATCH_CONFIRMED` da ghi mot cap khop tay. Xem `REVISABLE_FUEL_RESOLUTIONS`. */
  'DECISION_MATCH_LOCKED',
  /** Sua thanh CHINH quyet dinh dang co — khong ghi mot ban sua doi rong. */
  'DECISION_REVISION_NO_CHANGE',
  /**
   * `#371` — doi y SANG `ACCEPT_SUPPLIER_AMOUNT` tren dong `PAYMENT_METHOD_CONFLICT`: dong do la lan
   * do lai xe da tra tien mat. Cung luat voi lan QUYET dau tien (`isCashPaidLineAcceptance`) — neu
   * chi chan o lan quyet, mo lai ky roi doi y la mot duong vong ra dung khoan tra hai lan do.
   */
  'DECISION_CASH_PAID_NOT_PAYABLE',
] as const;
export type FuelDecisionRevisionDeniedReason =
  (typeof FUEL_DECISION_REVISION_DENIED_REASONS)[number];

/**
 * Quyet dinh BI SUA — them `kind` so voi `DecisionRecord`: luat `#371` phu thuoc LOAI chenh lech, con
 * phep chieu "cai nao hieu luc" thi khong, nen `DecisionRecord` van ngheo nhu cu.
 */
export type RevisionTarget = DecisionRecord & { readonly kind: FuelDiscrepancyKind };

export type FuelDecisionRevisionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: FuelDecisionRevisionDeniedReason };

/**
 * Hang nao THANG khi hai quyet dinh da ghi cung khong bi ai thay the — chi xay ra voi du lieu cu.
 *
 * `> 0` nghia la `left` MOI hon. So sanh chuoi ISO-8601 co `Z` trung voi thu tu thoi gian.
 */
const compareRecency = (left: DecisionRecord, right: DecisionRecord): number =>
  (left.resolvedAt ?? '').localeCompare(right.resolvedAt ?? '') ||
  left.createdAt.localeCompare(right.createdAt) ||
  (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/**
 * QUYET DINH HIEU LUC cua moi dong bang ke: `statementLineId -> quyet dinh`.
 *
 * Chi hang `RESOLVED` co `statementLineId`. Hang bi mot hang khac tro toi (`supersedesId`) khong con
 * hieu luc; trong so con lai cua mot dong, ban MOI nhat thang.
 */
export function effectiveLineDecisions<T extends DecisionRecord>(
  records: readonly T[],
): ReadonlyMap<string, T> {
  const replaced = new Set(
    records.map((record) => record.supersedesId).filter((id): id is string => id !== null),
  );

  const effective = new Map<string, T>();
  for (const record of records) {
    if (record.status !== 'RESOLVED' || record.statementLineId === null) continue;
    if (replaced.has(record.id)) continue;
    const current = effective.get(record.statementLineId);
    if (current === undefined || compareRecency(record, current) > 0) {
      effective.set(record.statementLineId, record);
    }
  }
  return effective;
}

/**
 * MOI quyet dinh da ghi KHONG con hieu luc — bi thay the tuong minh, hoac thua mot ban moi hon cua
 * cung dong (du lieu cu). Man hinh doc tap nay de ve lich su thay vi tu doan lai luat.
 */
export function supersededDecisionIds(records: readonly DecisionRecord[]): ReadonlySet<string> {
  const effective = new Set(
    [...effectiveLineDecisions(records).values()].map((record) => record.id),
  );
  const superseded = new Set<string>();
  for (const record of records) {
    if (record.status !== 'RESOLVED' || record.statementLineId === null) continue;
    if (!effective.has(record.id)) superseded.add(record.id);
  }
  return superseded;
}

/**
 * SUA MOT QUYET DINH DUOC KHONG — SAU duong tu choi, moi duong mot ma.
 *
 * Tang kho goi lai CHINH ham nay tren du lieu doc DUOI KHOA hang doi soat; lan goi o tang mien chi
 * de tra ve ly do som. Hai lan goi, mot luat.
 */
export function evaluateDecisionRevision(input: {
  readonly target: RevisionTarget;
  readonly records: readonly DecisionRecord[];
  readonly resolution: RevisableFuelResolution;
}): FuelDecisionRevisionDecision {
  const { target } = input;
  if (target.status !== 'RESOLVED') return { allowed: false, reason: 'DECISION_NOT_RESOLVED' };
  if (target.statementLineId === null) {
    return { allowed: false, reason: 'DECISION_WITHOUT_STATEMENT_LINE' };
  }
  if (effectiveLineDecisions(input.records).get(target.statementLineId)?.id !== target.id) {
    return { allowed: false, reason: 'DECISION_NOT_CURRENT' };
  }
  if (target.resolution === 'MATCH_CONFIRMED') {
    return { allowed: false, reason: 'DECISION_MATCH_LOCKED' };
  }
  if (isCashPaidLineAcceptance(target.kind, input.resolution)) {
    return { allowed: false, reason: 'DECISION_CASH_PAID_NOT_PAYABLE' };
  }
  if (target.resolution === input.resolution) {
    return { allowed: false, reason: 'DECISION_REVISION_NO_CHANGE' };
  }
  return { allowed: true };
}

/**
 * TRANG THAI MOI cua dong bang ke sau mot lan SUA quyet dinh — `null` = khong dong toi.
 *
 * Chi dong dang o trang thai CHENH LECH (`MISMATCHED`/`IGNORED`) moi doi. Dong `MATCHED` (vua duoc
 * may khop lai), `SETTLED` hay `UNMATCHED` khong phai viec cua lenh sua quyet dinh.
 */
export function lineStatusAfterRevision(
  resolution: RevisableFuelResolution,
  current: FuelReconciliationStatus,
): FuelReconciliationStatus | null {
  if (current !== 'MISMATCHED' && current !== 'IGNORED') return null;
  const next: FuelReconciliationStatus =
    resolution === 'IGNORE_WITH_REASON' ? 'IGNORED' : 'MISMATCHED';
  return next === current ? null : next;
}
