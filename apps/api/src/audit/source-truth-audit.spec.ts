import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { recordSourceTruthAudit } from './source-truth-audit.js';

describe('recordSourceTruthAudit', () => {
  it('writes one redacted append-only record for non-REST mutation surfaces', async () => {
    const create = vi.fn(async () => ({ id: 'audit-1' }));
    const prisma = { auditLog: { create } } as unknown as PrismaClient;

    await recordSourceTruthAudit(prisma, {
      actor: 'mcp',
      action: 'source_truth.price.update',
      entityType: 'Price',
      entityId: 'FELIX',
      after: { wholesale: 1_100_000, phone: '0900000000', token: 'secret' },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor: 'mcp',
        entityId: 'FELIX',
        after: { wholesale: 1_100_000, phone: '[REDACTED]', token: '[REDACTED]' },
      }),
    });
  });
});
