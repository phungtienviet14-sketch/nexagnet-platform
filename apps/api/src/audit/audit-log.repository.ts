import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { auditLogFilterSchema, auditLogSchema } from '@ultty/shared';
import type { AuditJsonValue, AuditLog, AuditLogFilter } from '@ultty/shared';

export interface AppendAuditLogInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: AuditJsonValue | null;
  after: AuditJsonValue | null;
  requestId: string | null;
  createdAt: string;
}

/** Append-only persistence seam: deliberately exposes no update or delete operation. */
export abstract class AuditLogRepository {
  abstract append(input: AppendAuditLogInput): Promise<AuditLog>;
  abstract list(filter?: AuditLogFilter): Promise<AuditLog[]>;
}

function cloneLog(log: AuditLog): AuditLog {
  return structuredClone(log);
}

@Injectable()
export class InMemoryAuditLogRepository extends AuditLogRepository {
  private store: readonly AuditLog[] = [];

  async append(input: AppendAuditLogInput): Promise<AuditLog> {
    const entry = auditLogSchema.parse({ id: randomUUID(), ...structuredClone(input) });
    this.store = [...this.store, entry];
    return cloneLog(entry);
  }

  async list(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    const parsed = auditLogFilterSchema.parse(filter);
    return this.store
      .filter((entry) => {
        if (parsed.actor && entry.actor !== parsed.actor) return false;
        if (parsed.action && entry.action !== parsed.action) return false;
        if (parsed.entityType && entry.entityType !== parsed.entityType) return false;
        if (parsed.entityId && entry.entityId !== parsed.entityId) return false;
        if (parsed.from && entry.createdAt < parsed.from) return false;
        if (parsed.to && entry.createdAt > parsed.to) return false;
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, parsed.limit)
      .map(cloneLog);
  }
}
