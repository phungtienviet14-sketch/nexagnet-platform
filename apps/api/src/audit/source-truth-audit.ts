import { Prisma, type PrismaClient } from '@prisma/client';
import { redactAuditValue } from './audit-redaction.js';

export interface SourceTruthAuditInput {
  actor: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}

/** Shared append-only audit boundary used by AdminJS and the standalone MCP process. */
export async function recordSourceTruthAudit(
  prisma: PrismaClient,
  input: SourceTruthAuditInput,
): Promise<void> {
  const before = input.before === undefined ? null : redactAuditValue(input.before);
  const after = input.after === undefined ? null : redactAuditValue(input.after);
  await prisma.auditLog.create({
    data: {
      actor: input.actor.slice(0, 200) || 'system',
      action: input.action.slice(0, 200),
      entityType: input.entityType.slice(0, 200),
      entityId: input.entityId?.slice(0, 200) ?? null,
      before: before === null ? Prisma.DbNull : (before as Prisma.InputJsonValue),
      after: after === null ? Prisma.DbNull : (after as Prisma.InputJsonValue),
      requestId: input.requestId?.slice(0, 200) ?? null,
    },
  });
}
