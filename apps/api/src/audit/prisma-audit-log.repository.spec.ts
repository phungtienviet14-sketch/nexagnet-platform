import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository.js';

describe('PrismaAuditLogRepository', () => {
  it('append-only: ghi mot log va tra DTO ISO', async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'a1',
      ...data,
      createdAt: new Date(String(data.createdAt)),
    }));
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    const repo = new PrismaAuditLogRepository(prisma);

    const result = await repo.append({
      actor: 'operator',
      action: 'member.update',
      entityType: 'GroupParticipant',
      entityId: 'p1',
      before: null,
      after: { handlingMode: 'ignore' },
      requestId: 'req-1',
      createdAt: '2026-08-03T01:00:00.000Z',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 'a1', createdAt: '2026-08-03T01:00:00.000Z' });
    expect('update' in repo).toBe(false);
    expect('delete' in repo).toBe(false);
  });

  it('lists redacted JSON rows with bounded filters and ISO timestamps', async () => {
    const findMany = vi.fn(async () => [
      {
        id: 'a2',
        actor: 'operator',
        action: 'price.update',
        entityType: 'Price',
        entityId: 'FELIX',
        before: null,
        after: { wholesale: 1_100_000 },
        requestId: null,
        createdAt: new Date('2026-08-03T02:00:00.000Z'),
      },
    ]);
    const prisma = { auditLog: { findMany } } as unknown as PrismaService;

    const result = await new PrismaAuditLogRepository(prisma).list({
      actor: 'operator',
      action: 'price.update',
      entityType: 'Price',
      entityId: 'FELIX',
      from: '2026-08-03T00:00:00.000Z',
      to: '2026-08-04T00:00:00.000Z',
      limit: 10,
    });

    expect(result[0]).toMatchObject({ id: 'a2', createdAt: '2026-08-03T02:00:00.000Z' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ actor: 'operator' }), take: 10 }),
    );
  });
});
