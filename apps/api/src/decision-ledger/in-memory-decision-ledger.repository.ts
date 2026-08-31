import { randomUUID } from 'node:crypto';
import type { TenantScope } from '../source-registry/tenant-scope.js';
import {
  DecisionLedgerRepository,
  type DecisionAppendInput,
} from './decision-ledger.repository.js';
import type {
  BusinessDecisionRecord,
  DecisionFactReferenceRecord,
  DecisionRelationRecord,
  DecisionStatus,
} from './decision-ledger.types.js';

/**
 * Kho TRONG BO NHO — mac dinh khi `PERSISTENCE=memory`, va la kho ma phan lon bo test dung.
 *
 * CO Y giu `tenantId` va loc theo no y het ban Postgres, du mot Map trong mot tien trinh chang co
 * ranh gioi ha tang nao. Neu ban nay bo qua pham vi thi bai test cach ly se xanh o day va do o
 * production — tuc bai test do se do dung cai no khong duoc phep do.
 *
 * VA CO Y giu ca khoa duy nhat `(tenantId, idempotencyKey)`: bai chong trung phai do o day neu
 * dich vu quen kiem, chu khong doi den luc gap Postgres that.
 */
export class InMemoryDecisionLedgerRepository extends DecisionLedgerRepository {
  private readonly decisions = new Map<string, BusinessDecisionRecord>();
  /**
   * Thu tu GHI toan cuc. Day la thu pha the khi hai quyet dinh cung `occurredAt` — xem `ordered()`
   * de biet vi sao khong duoc pha the bang `id`.
   */
  private sequence = 0;
  private readonly writtenAt = new Map<string, number>();

  private transactionDepth = 0;

  async runInTransaction<T>(fn: (repository: DecisionLedgerRepository) => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) return fn(this);

    // Chup NONG la du: moi ban ghi o day BAT BIEN — `markStatus` tao doi tuong moi bang spread
    // roi `set` de len, khong bao gio sua tai cho.
    const decisionsCopy = new Map(this.decisions);
    const writtenAtCopy = new Map(this.writtenAt);
    const sequenceCopy = this.sequence;

    this.transactionDepth += 1;
    try {
      return await fn(this);
    } catch (error) {
      this.decisions.clear();
      for (const [key, value] of decisionsCopy) this.decisions.set(key, value);
      this.writtenAt.clear();
      for (const [key, value] of writtenAtCopy) this.writtenAt.set(key, value);
      this.sequence = sequenceCopy;
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async append(scope: TenantScope, input: DecisionAppendInput): Promise<BusinessDecisionRecord> {
    const duplicate = await this.findByIdempotencyKey(scope, input.idempotencyKey);
    if (duplicate) {
      // Y het rang buoc `@@unique([tenantId, idempotencyKey])` cua Postgres. Thong bao co y giong
      // mot loi khoa duy nhat chu khong giong mot loi nghiep vu: cong nghiep vu nam o dich vu.
      throw new Error(
        `Unique constraint failed on the fields: (tenantId, idempotencyKey) — ${input.idempotencyKey}`,
      );
    }

    const id = input.id ?? randomUUID();
    const record: BusinessDecisionRecord = {
      id,
      tenantId: scope.tenantId,
      decisionPoint: input.decisionPoint,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      occurredAt: input.occurredAt,
      recordedAt: new Date(),
      actorKind: input.actorKind,
      actorRef: input.actorRef ?? null,
      criticality: input.criticality,
      policyRef: input.policyRef ?? null,
      policyVersion: input.policyVersion ?? null,
      modelProvider: input.modelProvider ?? null,
      modelRef: input.modelRef ?? null,
      releaseSha: input.releaseSha ?? null,
      traceId: input.traceId ?? null,
      spanId: input.spanId ?? null,
      workflowRunId: input.workflowRunId ?? null,
      approvalRef: input.approvalRef ?? null,
      status: 'RECORDED',
      idempotencyKey: input.idempotencyKey,
      fingerprint: input.fingerprint,
      supersedesId: input.supersedesId ?? null,
      detail: input.detail ?? null,
      factRefs: (input.factRefs ?? []).map((ref): DecisionFactReferenceRecord => ({
        id: randomUUID(),
        decisionId: id,
        factId: ref.factId,
        factDomain: ref.factDomain,
        factKey: ref.factKey,
        factStatusAtUse: ref.factStatusAtUse,
        sourceId: ref.sourceId ?? null,
        sourceKey: ref.sourceKey ?? null,
        sourceVersion: ref.sourceVersion ?? null,
      })),
      relations: (input.relations ?? []).map((relation): DecisionRelationRecord => ({
        id: randomUUID(),
        decisionId: id,
        kind: relation.kind,
        targetType: relation.targetType,
        targetId: relation.targetId,
        note: relation.note ?? null,
      })),
    };

    this.sequence += 1;
    this.writtenAt.set(id, this.sequence);
    this.decisions.set(id, record);
    return record;
  }

  async findById(scope: TenantScope, id: string): Promise<BusinessDecisionRecord | null> {
    const found = this.decisions.get(id) ?? null;
    // Loc theo pham vi thay vi nem: "khong ton tai" va "cua khach khac" phai KHONG phan biet duoc
    // tu ben ngoai, neu khong thi chinh thong bao loi tro thanh mot kenh do su ton tai.
    return found && found.tenantId === scope.tenantId ? found : null;
  }

  async findByIdempotencyKey(
    scope: TenantScope,
    idempotencyKey: string,
  ): Promise<BusinessDecisionRecord | null> {
    return this.mine(scope).find((row) => row.idempotencyKey === idempotencyKey) ?? null;
  }

  async listForSubject(
    scope: TenantScope,
    subjectType: string,
    subjectId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.ordered(
      this.mine(scope).filter(
        (row) => row.subjectType === subjectType && row.subjectId === subjectId,
      ),
    );
  }

  async listForTrace(
    scope: TenantScope,
    traceId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.ordered(this.mine(scope).filter((row) => row.traceId === traceId));
  }

  async listForWorkflowRun(
    scope: TenantScope,
    workflowRunId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.ordered(this.mine(scope).filter((row) => row.workflowRunId === workflowRunId));
  }

  async listForFact(
    scope: TenantScope,
    factId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    return this.ordered(
      this.mine(scope).filter((row) => row.factRefs.some((ref) => ref.factId === factId)),
    );
  }

  async markStatus(
    scope: TenantScope,
    id: string,
    status: Extract<DecisionStatus, 'SUPERSEDED' | 'CORRECTED'>,
  ): Promise<BusinessDecisionRecord> {
    const current = await this.findById(scope, id);
    if (!current) throw new Error(`Khong tim thay quyet dinh ${id} trong pham vi hien tai`);
    const updated: BusinessDecisionRecord = { ...current, status };
    this.decisions.set(id, updated);
    return updated;
  }

  private mine(scope: TenantScope): BusinessDecisionRecord[] {
    return [...this.decisions.values()].filter((row) => row.tenantId === scope.tenantId);
  }

  /**
   * Cu nhat truoc, pha the bang THU TU GHI.
   *
   * KHONG pha the bang `id`: id la `cuid()` hoac UUID, tuc thu tu tu vung cua chung khong lien
   * quan gi den thu tu xay ra. Mot dong thoi gian sap theo id se ON DINH (khong nhay giua hai lan
   * doc) nhung SAI — no ke lai cau chuyen theo mot thu tu chua bao gio xay ra, va do la kieu sai
   * kho phat hien nhat vi no trong nhu dung.
   */
  private ordered(rows: BusinessDecisionRecord[]): readonly BusinessDecisionRecord[] {
    return [...rows].sort((left, right) => {
      const byTime = left.occurredAt.getTime() - right.occurredAt.getTime();
      if (byTime !== 0) return byTime;
      return (this.writtenAt.get(left.id) ?? 0) - (this.writtenAt.get(right.id) ?? 0);
    });
  }
}
