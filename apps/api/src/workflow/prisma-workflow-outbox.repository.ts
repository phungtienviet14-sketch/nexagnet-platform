import type { Prisma, WorkflowOutbox } from '@prisma/client';
import type { PrismaService } from '../config/prisma.service.js';
import {
  WorkflowOutboxRepository,
  backoffMs,
  type NewWorkflowOutboxEntry,
  type WorkflowOutboxEntry,
  type WorkflowOutboxStatus,
  type WorkflowOutboxTransaction,
} from './workflow-outbox.repository.js';

/**
 * Hien thuc outbox tren Postgres nghiep vu.
 *
 * CO CHE NHAN VIEC sao nguyen tu `campaigns/prisma-campaign.repository.ts` (`claimDue`) — no da
 * chay that tren pilot:
 *
 *   pg_try_advisory_xact_lock   mot dispatcher moi luot, khong dam nhau khi co nhieu ban sao API
 *   FOR UPDATE … SKIP LOCKED    hai tien trinh khong bao gio nhan cung mot hang
 *   claimExpiresAt (lease)      worker chet giua chung -> lease het han -> nguoi khac nhan lai
 *
 * KHOA ADVISORY khac so voi cua chien dich: hai hang doi phai doc lap, khong duoc chan nhau.
 */
const OUTBOX_ADVISORY_LOCK = 2071164282;

export class PrismaWorkflowOutboxRepository extends WorkflowOutboxRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `tx` la thu lam nen ca lop nay: truyen giao dich cua ben goi vao de hang outbox nam CHUNG
   * giao dich voi thay doi nghiep vu. Khong truyen thi hang duoc ghi doc lap — chi dung cho
   * luong khong co trang thai nghiep vu di kem.
   */
  async enqueue(
    entry: NewWorkflowOutboxEntry,
    tx?: WorkflowOutboxTransaction,
  ): Promise<WorkflowOutboxEntry> {
    const client = (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
    const row = await client.workflowOutbox.upsert({
      where: { operationKey: entry.operationKey },
      // Xep lai cung mot khoa la VO HAI: khong tao hang thu hai, va cung khong ghi de hang cu
      // (hang cu co the dang chay do). `update: {}` la co y, khong phai thieu sot.
      update: {},
      create: {
        operationKey: entry.operationKey,
        workflowKey: entry.workflowKey,
        workflowVersion: entry.workflowVersion,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload as Prisma.InputJsonValue,
        metadata: entry.metadata as Prisma.InputJsonValue,
        traceId: entry.traceId ?? null,
        maxAttempts: entry.maxAttempts,
        baseBackoffSeconds: entry.baseBackoffSeconds,
      },
    });
    return toEntry(row);
  }

  async claimDue(
    workerId: string,
    now: Date,
    leaseSeconds: number,
    limit: number,
  ): Promise<WorkflowOutboxEntry[]> {
    return this.prisma.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${OUTBOX_ADVISORY_LOCK}) AS acquired
      `;
      if (!lock?.acquired) return [];

      const due = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT o."id"
        FROM "WorkflowOutbox" o
        WHERE (
            o."status" = 'pending'::"WorkflowOutboxStatus"
            AND (o."nextAttemptAt" IS NULL OR o."nextAttemptAt" <= ${now})
          )
          OR (
            o."status" = 'claimed'::"WorkflowOutboxStatus"
            AND o."claimExpiresAt" <= ${now}
          )
        ORDER BY o."createdAt" ASC
        FOR UPDATE OF o SKIP LOCKED
        LIMIT ${limit}
      `;
      if (due.length === 0) return [];

      const ids = due.map((row) => row.id);
      await tx.workflowOutbox.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'claimed',
          claimedAt: now,
          claimedBy: workerId,
          claimExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
          attempts: { increment: 1 },
        },
      });
      const claimed = await tx.workflowOutbox.findMany({ where: { id: { in: ids } } });
      return claimed.map(toEntry);
    });
  }

  async markDispatched(id: string, engineRunId: string, now: Date): Promise<void> {
    await this.prisma.workflowOutbox.update({
      where: { id },
      data: {
        status: 'dispatched',
        engineRunId,
        dispatchedAt: now,
        lastError: null,
        claimedBy: null,
        claimExpiresAt: null,
      },
    });
  }

  async markAttemptFailed(id: string, error: string, now: Date): Promise<void> {
    const row = await this.prisma.workflowOutbox.findUnique({ where: { id } });
    if (!row) return;
    const exhausted = row.attempts >= row.maxAttempts;
    await this.prisma.workflowOutbox.update({
      where: { id },
      data: {
        status: exhausted ? 'failed' : 'pending',
        // Cat bot: mot stack trace dai khong lam nguoi doc hieu hon, ma lam bang phinh ra.
        lastError: error.slice(0, 1_000),
        nextAttemptAt: exhausted
          ? null
          : new Date(now.getTime() + backoffMs(row.baseBackoffSeconds, row.attempts)),
        claimedBy: null,
        claimExpiresAt: null,
      },
    });
  }

  async findByOperationKey(operationKey: string): Promise<WorkflowOutboxEntry | null> {
    const row = await this.prisma.workflowOutbox.findUnique({ where: { operationKey } });
    return row ? toEntry(row) : null;
  }

  async countPending(): Promise<number> {
    return this.prisma.workflowOutbox.count({ where: { status: { in: ['pending', 'claimed'] } } });
  }

  async countFailed(): Promise<number> {
    return this.prisma.workflowOutbox.count({ where: { status: 'failed' } });
  }
}

function toEntry(row: WorkflowOutbox): WorkflowOutboxEntry {
  return {
    id: row.id,
    operationKey: row.operationKey,
    workflowKey: row.workflowKey,
    workflowVersion: row.workflowVersion,
    entityType: row.entityType,
    entityId: row.entityId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    metadata: (row.metadata ?? {}) as Record<string, string>,
    ...(row.traceId ? { traceId: row.traceId } : {}),
    status: row.status as WorkflowOutboxStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    baseBackoffSeconds: row.baseBackoffSeconds,
    nextAttemptAt: row.nextAttemptAt,
    engineRunId: row.engineRunId,
    lastError: row.lastError,
  };
}
