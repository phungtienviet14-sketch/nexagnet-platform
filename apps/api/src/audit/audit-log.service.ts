import { Injectable } from '@nestjs/common';
import { auditLogSchema } from '@netviet/shared';
import type { AuditLog, AuditLogFilter } from '@netviet/shared';
import { redactAuditValue } from './audit-redaction.js';
import { AuditLogRepository } from './audit-log.repository.js';

export interface AppendAuditLogCommand {
  actor: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  async append(command: AppendAuditLogCommand): Promise<AuditLog> {
    const entry = await this.repository.append({
      actor: command.actor,
      action: command.action,
      entityType: command.entityType,
      entityId: command.entityId ?? null,
      before: command.before === undefined ? null : redactAuditValue(command.before),
      after: command.after === undefined ? null : redactAuditValue(command.after),
      requestId: command.requestId ?? null,
      createdAt: new Date().toISOString(),
    });
    return auditLogSchema.parse(entry);
  }

  async list(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    return this.repository.list(filter);
  }
}
