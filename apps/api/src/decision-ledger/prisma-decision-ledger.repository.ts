import { Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { TenantScope } from '../source-registry/tenant-scope.js';
import {
  DecisionLedgerRepository,
  type DecisionAppendInput,
} from './decision-ledger.repository.js';
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
 * Kho tren POSTGRES — su that nghiep vu ben vung, mat phang thu nhat cua hop dong bon mat phang.
 *
 * MOI cau truy van deu mang `tenantId` trong `where`, cung ly do voi kho nguon su that: ngay dau
 * tien hai khach dung chung mot DB, cau `where` nay la thu duy nhat con dung — va no phai co san
 * TU TRUOC ngay do.
 *
 * KHONG CO `update` NAO cham vao noi dung quyet dinh. `markStatus` la duong duy nhat sua mot hang,
 * va no chi dat mot cot `status`. Append-only nam trong be mat kho, khong trong loi hua tai lieu.
 */
@Injectable()
export class PrismaDecisionLedgerRepository extends DecisionLedgerRepository {
  /**
   * Nhan `PrismaClient` chu khong `PrismaService`: kho nay duoc dung o CA HAI noi — trong tien
   * trinh NestJS va trong tien trinh MCP dung rieng. Buoc kieu hep hon se lam noi thu hai phai ep kieu.
   */
  constructor(
    private readonly prisma: PrismaClient,
    /** `true` khi `prisma` la client CUA MOT GIAO DICH dang mo. Xem `runInTransaction`. */
    private readonly insideTransaction = false,
  ) {
    super();
  }

  async runInTransaction<T>(fn: (repository: DecisionLedgerRepository) => Promise<T>): Promise<T> {
    if (this.insideTransaction) return fn(this);
    return this.prisma.$transaction(async (tx) =>
      fn(new PrismaDecisionLedgerRepository(tx as unknown as PrismaClient, true)),
    );
  }

  async append(scope: TenantScope, input: DecisionAppendInput): Promise<BusinessDecisionRecord> {
    const row = await this.prisma.businessDecision.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        tenantId: scope.tenantId,
        decisionPoint: input.decisionPoint,
        outcome: input.outcome,
        reasonCode: input.reasonCode,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
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
        idempotencyKey: input.idempotencyKey,
        fingerprint: input.fingerprint,
        supersedesId: input.supersedesId ?? null,
        detail: (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        ...(input.factRefs?.length
          ? {
              factRefs: {
                create: input.factRefs.map((ref) => ({
                  factId: ref.factId,
                  factDomain: ref.factDomain,
                  factKey: ref.factKey,
                  factStatusAtUse: ref.factStatusAtUse,
                  sourceId: ref.sourceId ?? null,
                  sourceKey: ref.sourceKey ?? null,
                  sourceVersion: ref.sourceVersion ?? null,
                })),
              },
            }
          : {}),
        ...(input.relations?.length
          ? {
              relations: {
                create: input.relations.map((relation) => ({
                  kind: relation.kind,
                  targetType: relation.targetType,
                  targetId: relation.targetId,
                  note: relation.note ?? null,
                })),
              },
            }
          : {}),
      },
      include: INCLUDE_CHILDREN,
    });
    return toDecision(row);
  }

  async findById(scope: TenantScope, id: string): Promise<BusinessDecisionRecord | null> {
    const row = await this.prisma.businessDecision.findFirst({
      where: { id, tenantId: scope.tenantId },
      include: INCLUDE_CHILDREN,
    });
    return row ? toDecision(row) : null;
  }

  async findByIdempotencyKey(
    scope: TenantScope,
    idempotencyKey: string,
  ): Promise<BusinessDecisionRecord | null> {
    const row = await this.prisma.businessDecision.findFirst({
      where: { tenantId: scope.tenantId, idempotencyKey },
      include: INCLUDE_CHILDREN,
    });
    return row ? toDecision(row) : null;
  }

  async listForSubject(
    scope: TenantScope,
    subjectType: string,
    subjectId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    const rows = await this.prisma.businessDecision.findMany({
      where: { tenantId: scope.tenantId, subjectType, subjectId },
      orderBy: ORDER_BY,
      include: INCLUDE_CHILDREN,
    });
    return rows.map(toDecision);
  }

  async listForTrace(
    scope: TenantScope,
    traceId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    const rows = await this.prisma.businessDecision.findMany({
      where: { tenantId: scope.tenantId, traceId },
      orderBy: ORDER_BY,
      include: INCLUDE_CHILDREN,
    });
    return rows.map(toDecision);
  }

  async listForWorkflowRun(
    scope: TenantScope,
    workflowRunId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    const rows = await this.prisma.businessDecision.findMany({
      where: { tenantId: scope.tenantId, workflowRunId },
      orderBy: ORDER_BY,
      include: INCLUDE_CHILDREN,
    });
    return rows.map(toDecision);
  }

  async listForFact(
    scope: TenantScope,
    factId: string,
  ): Promise<readonly BusinessDecisionRecord[]> {
    const rows = await this.prisma.businessDecision.findMany({
      where: { tenantId: scope.tenantId, factRefs: { some: { factId } } },
      orderBy: ORDER_BY,
      include: INCLUDE_CHILDREN,
    });
    return rows.map(toDecision);
  }

  async markStatus(
    scope: TenantScope,
    id: string,
    status: Extract<DecisionStatus, 'SUPERSEDED' | 'CORRECTED'>,
  ): Promise<BusinessDecisionRecord> {
    // `updateMany` co dieu kien `tenantId` chu khong `update({ where: { id } })`: ban thu hai se
    // ghi de duoc mot hang cua khach khac neu ai do doan trung id. Doc lai sau khi ghi de tra ve
    // ban day du kem con.
    const changed = await this.prisma.businessDecision.updateMany({
      where: { id, tenantId: scope.tenantId },
      data: { status },
    });
    if (changed.count === 0) {
      throw new Error(`Khong tim thay quyet dinh ${id} trong pham vi hien tai`);
    }
    const row = await this.findById(scope, id);
    if (!row) throw new Error(`Khong doc lai duoc quyet dinh ${id} sau khi doi trang thai`);
    return row;
  }
}

const INCLUDE_CHILDREN = { factRefs: true, relations: true } as const;

/**
 * THU TU TAT DINH cua dong thoi gian.
 *
 * `occurredAt` truoc, roi `recordedAt`, roi `id`. Hai khoa sau la de PHA THE: mot luot ra ba
 * quyet dinh trong cung mot mili-giay la chuyen thuong, va Postgres khong hua gi ve thu tu tra ve
 * khi khoa sap xep bang nhau. Thieu chung thi cung mot cau truy van co the tra ve hai thu tu khac
 * nhau giua hai lan chay — mot bai test nhay va, te hon, mot dong thoi gian doc lan.
 *
 * `id` la khoa cuoi cung CHI de bao dam tinh tat dinh; no khong mang y nghia thoi gian nao, va
 * `recordedAt` phia truoc da la thu tu ghi that.
 */
const ORDER_BY = [
  { occurredAt: 'asc' },
  { recordedAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.BusinessDecisionOrderByWithRelationInput[];

type DecisionRow = Prisma.BusinessDecisionGetPayload<{ include: typeof INCLUDE_CHILDREN }>;

function toDecision(row: DecisionRow): BusinessDecisionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    decisionPoint: row.decisionPoint,
    outcome: row.outcome as DecisionOutcome,
    reasonCode: row.reasonCode,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    actorKind: row.actorKind as DecisionActorKind,
    actorRef: row.actorRef,
    criticality: row.criticality as DecisionCriticality,
    policyRef: row.policyRef,
    policyVersion: row.policyVersion,
    modelProvider: row.modelProvider,
    modelRef: row.modelRef,
    releaseSha: row.releaseSha,
    traceId: row.traceId,
    spanId: row.spanId,
    workflowRunId: row.workflowRunId,
    approvalRef: row.approvalRef,
    status: row.status as DecisionStatus,
    idempotencyKey: row.idempotencyKey,
    fingerprint: row.fingerprint,
    supersedesId: row.supersedesId,
    // `detail` da qua `buildDecisionEvidence` truoc khi ghi, nen no la mot bang phang cac vo huong.
    // Ep kieu o DUNG mot cho nay thay vi kiem lai ca cay khi doc: gia tri chi vao duoc qua mot cong.
    detail: (row.detail as DecisionDetail | null) ?? null,
    factRefs: row.factRefs.map((ref) => ({
      id: ref.id,
      decisionId: ref.decisionId,
      factId: ref.factId,
      factDomain: ref.factDomain,
      factKey: ref.factKey,
      factStatusAtUse: ref.factStatusAtUse,
      sourceId: ref.sourceId,
      sourceKey: ref.sourceKey,
      sourceVersion: ref.sourceVersion,
    })),
    relations: row.relations.map((relation) => ({
      id: relation.id,
      decisionId: relation.decisionId,
      kind: relation.kind as DecisionRelationKind,
      targetType: relation.targetType,
      targetId: relation.targetId,
      note: relation.note,
    })),
  };
}
