import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import type { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import { PricePeriodsService, buildPriceImportPreview } from './price-periods.service.js';

const rows = [
  { sku: 'A', wholesale: 100, minRetailPrice: 120 },
  { sku: 'B', wholesale: 200 },
];

describe('price period import preview', () => {
  it('is deterministic/idempotent and reports unchanged rows', () => {
    const preview = buildPriceImportPreview(rows, rows, new Set(['A', 'B']));
    expect(preview).toMatchObject({ valid: true, created: 0, updated: 0, unchanged: 2 });
    expect(preview.diff).toEqual([]);
  });

  it('does not overwrite operator rows without explicit overwrite', () => {
    const preview = buildPriceImportPreview(
      [{ sku: 'A', wholesale: 999 }],
      [{ sku: 'A', wholesale: 100 }],
      new Set(['A']),
    );
    expect(preview.valid).toBe(false);
    expect(preview.errors.join(' ')).toContain('overwrite');
  });

  it('rejects duplicate and unknown SKU before DB writes', () => {
    const preview = buildPriceImportPreview(
      [
        { sku: 'A', wholesale: 100 },
        { sku: 'A', wholesale: 100 },
        { sku: 'X', wholesale: 1 },
      ],
      [],
      new Set(['A']),
    );
    expect(preview.valid).toBe(false);
    expect(preview.errors.join(' ')).toContain('trùng');
    expect(preview.errors.join(' ')).toContain('không tồn tại');
  });
});

describe('PricePeriodsService lifecycle', () => {
  function make() {
    const prisma = {
      pricePeriod: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => ({
          id: 'p1', validMonth: '2026-08', status: 'draft', prices: rows,
        })),
        create: vi.fn(async ({ data }: { data: object }) => ({ id: 'p1', status: 'draft', ...data })),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => ({ id: 'p1', validMonth: '2026-08', status: 'active' })),
      },
      product: { findMany: vi.fn(async () => [{ sku: 'A' }, { sku: 'B' }]) },
      price: { createMany: vi.fn(async () => ({ count: 2 })), upsert: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (input: ((tx: unknown) => unknown) | unknown[]) =>
        typeof input === 'function' ? input(prisma) : Promise.all(input),
      ),
    } as unknown as PrismaService;
    const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
    const knowledge = { reload: vi.fn(async () => undefined) } as unknown as KnowledgeService;
    return { service: new PricePeriodsService(prisma, audit, knowledge, 'prisma'), prisma, audit, knowledge };
  }

  it('creates draft only; creation can never activate implicitly', async () => {
    const { service, prisma } = make();
    await service.createDraft({ validMonth: '2026-08' }, 'sale', null);
    expect(prisma.pricePeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ validMonth: '2026-08', status: 'draft' }),
      include: { prices: true },
    });
  });

  it('rejects activation until every catalog SKU has a valid price', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findUnique).mockResolvedValue({
      id: 'p1', validMonth: '2026-08', status: 'draft', prices: [rows[0]],
    } as never);
    await expect(service.activate('p1', 'sale', null)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives old same-month active period and activates atomically', async () => {
    const { service, prisma, knowledge } = make();
    await expect(service.activate('p1', 'sale', 'req')).resolves.toMatchObject({ status: 'active' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.pricePeriod.updateMany).toHaveBeenCalledWith({
      where: { validMonth: '2026-08', status: 'active', NOT: { id: 'p1' } },
      data: { status: 'archived' },
    });
    expect(knowledge.reload).toHaveBeenCalled();
  });

  it('applies an explicitly confirmed preview and keeps upsert idempotency key', async () => {
    const { service, prisma } = make();
    await expect(
      service.applyImport('p1', { rows, overwrite: false, confirmed: true }, 'sale', null),
    ).resolves.toMatchObject({ periodId: 'p1', preview: { valid: true, unchanged: 2 } });
    expect(prisma.price.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.price.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodId_sku: { periodId: 'p1', sku: 'A' } } }),
    );
  });

  it('allows a draft revision for a month that already has history', async () => {
    const { service, prisma } = make();
    vi.mocked(prisma.pricePeriod.findMany).mockResolvedValueOnce([{ id: 'exists' }] as never);
    await expect(service.copyDraft('p1', { validMonth: '2026-09' }, 'sale', null)).resolves.toMatchObject({
      status: 'draft',
      validMonth: '2026-09',
    });
  });
});
