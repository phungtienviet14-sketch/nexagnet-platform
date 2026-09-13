import { Injectable } from '@nestjs/common';
import { auditLogSchema } from '@netviet/shared';
import type { AuditLog, AuditLogFilter } from '@netviet/shared';
import { redactAuditValue } from './audit-redaction.js';
import { AuditLogRepository, type AppendAuditLogInput } from './audit-log.repository.js';

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

  /**
   * DUNG mot hang dau vet, KHONG ghi no.
   *
   * Ton tai vi mot vai duong ghi phai dat dau vet vao CUNG mot don vi cong viec voi buoc chuyen
   * trang thai (vd dong vong chay do he thong): neu dau vet di qua mot lan goi kho RIENG thi no la
   * mot giao dich khac, va mot cu chet giua hai giao dich de lai mot su that da doi ma khong co
   * bang chung nao ve ly do.
   *
   * Che du lieu nam O DAY chu khong o cho ghi — nen mot hang dat qua duong nay va mot hang dat qua
   * `append()` khong the khac nhau ve muc che.
   */
  entryFor(command: AppendAuditLogCommand): AppendAuditLogInput {
    return {
      actor: command.actor,
      action: command.action,
      entityType: command.entityType,
      entityId: command.entityId ?? null,
      before: command.before === undefined ? null : redactAuditValue(command.before),
      after: command.after === undefined ? null : redactAuditValue(command.after),
      requestId: command.requestId ?? null,
      createdAt: new Date().toISOString(),
    };
  }

  async append(command: AppendAuditLogCommand): Promise<AuditLog> {
    const entry = await this.repository.append(this.entryFor(command));
    return auditLogSchema.parse(entry);
  }

  async list(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    return this.repository.list(filter);
  }
}
