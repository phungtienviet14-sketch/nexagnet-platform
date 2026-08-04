import { describe, expect, it } from 'vitest';
import { AUDIT_REDACTED } from './audit-redaction.js';
import { AuditLogService } from './audit-log.service.js';
import { InMemoryAuditLogRepository } from './audit-log.repository.js';

describe('AuditLogService', () => {
  it('redacts sensitive values before appending an audit record', async () => {
    const repository = new InMemoryAuditLogRepository();
    const service = new AuditLogService(repository);

    const entry = await service.append({
      actor: 'sale-1',
      action: 'rule_config.activate',
      entityType: 'RuleConfigVersion',
      entityId: 'rules-1',
      before: { status: 'preview', apiKey: 'secret' },
      after: { status: 'active', customerPhone: '0912345678' },
      requestId: 'request-1',
    });

    expect(entry.before).toEqual({ status: 'preview', apiKey: AUDIT_REDACTED });
    expect(entry.after).toEqual({ status: 'active', customerPhone: AUDIT_REDACTED });
  });

  it('stores append-only copies that callers cannot mutate', async () => {
    const repository = new InMemoryAuditLogRepository();
    const service = new AuditLogService(repository);
    const entry = await service.append({
      actor: 'sale-1',
      action: 'participant.update',
      entityType: 'GroupParticipant',
      entityId: 'participant-1',
      after: { handlingMode: 'ignore' },
    });

    (entry.after as Record<string, unknown>).handlingMode = 'process';
    const stored = await service.list({ entityType: 'GroupParticipant' });

    expect(stored).toHaveLength(1);
    expect(stored[0]?.after).toEqual({ handlingMode: 'ignore' });
    expect('update' in repository).toBe(false);
    expect('delete' in repository).toBe(false);
  });

  it('filters newest-first by actor, action, entity and time window', async () => {
    const repository = new InMemoryAuditLogRepository();
    const service = new AuditLogService(repository);
    await repository.append({
      actor: 'sale-1',
      action: 'rule_config.preview',
      entityType: 'RuleConfigVersion',
      entityId: 'rules-1',
      before: null,
      after: null,
      requestId: null,
      createdAt: '2026-08-03T00:00:00.000Z',
    });
    await repository.append({
      actor: 'sale-2',
      action: 'rule_config.activate',
      entityType: 'RuleConfigVersion',
      entityId: 'rules-2',
      before: null,
      after: null,
      requestId: null,
      createdAt: '2026-08-03T00:02:00.000Z',
    });
    await repository.append({
      actor: 'sale-2',
      action: 'participant.update',
      entityType: 'GroupParticipant',
      entityId: 'participant-1',
      before: null,
      after: null,
      requestId: null,
      createdAt: '2026-08-03T00:03:00.000Z',
    });

    const result = await service.list({
      actor: 'sale-2',
      entityType: 'RuleConfigVersion',
      from: '2026-08-03T00:01:00.000Z',
      to: '2026-08-03T00:04:00.000Z',
      limit: 10,
    });

    expect(result.map((entry) => entry.id)).toHaveLength(1);
    expect(result[0]?.action).toBe('rule_config.activate');
  });
});
