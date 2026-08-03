import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { SourceTruthWriteService } from './source-truth-write.service.js';

describe('SourceTruthWriteService', () => {
  const reload = vi.fn(async () => undefined);
  const append = vi.fn(async () => undefined);
  const prisma = {
    price: { findUnique: vi.fn(async () => null), upsert: vi.fn(async () => undefined) },
    product: { findUnique: vi.fn(async () => ({ sku: 'FELIX' })) },
  } as unknown as PrismaService;
  const knowledge = {
    reload,
    prices: vi.fn(() => [{ sku: 'FELIX', wholesale: 1_150_000 }]),
  } as unknown as KnowledgeService;
  const audit = { append } as unknown as AuditLogService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('chi cho phep ghi khi persistence=prisma', async () => {
    const service = new SourceTruthWriteService(prisma, knowledge, audit, 'memory');

    await expect(
      service.write('prices', 'FELIX', { wholesale: 1_100_000 }, 'operator', null),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('chan gia am truoc khi cham database', async () => {
    const service = new SourceTruthWriteService(prisma, knowledge, audit, 'prisma');

    await expect(
      service.write('prices', 'FELIX', { wholesale: -1 }, 'operator', null),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.price.upsert).not.toHaveBeenCalled();
  });

  it('ghi gia typed, audit va reload snapshot sau khi DB thanh cong', async () => {
    const service = new SourceTruthWriteService(prisma, knowledge, audit, 'prisma');

    await service.write('prices', 'FELIX', { wholesale: 1_100_000 }, 'operator', 'req-1');

    expect(prisma.price.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sku: 'FELIX' },
        update: expect.objectContaining({ wholesale: 1_100_000 }),
      }),
    );
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'operator',
        action: 'source_truth.update',
        entityType: 'prices',
        entityId: 'FELIX',
      }),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('uses the typed canonical Prisma table for every source-truth resource', async () => {
    const method = () => vi.fn(async () => null);
    const fullPrisma = {
      dealer: { findUnique: method(), upsert: method() },
      group: { findUnique: method(), upsert: method() },
      product: {
        findUnique: vi.fn(async ({ where }: { where: { sku: string } }) =>
          where.sku === 'FELIX' ? { sku: 'FELIX' } : null),
        upsert: method(),
      },
      price: { findUnique: method(), upsert: method() },
      dealerPriceOverride: { upsert: method() },
      glossaryEntry: { findUnique: method(), upsert: method() },
    } as unknown as PrismaService;
    const fullKnowledge = {
      reload,
      dealers: () => [],
      groups: () => [],
      products: () => [],
      prices: () => [],
      priceOverrides: () => [],
      glossary: () => [],
    } as unknown as KnowledgeService;
    const service = new SourceTruthWriteService(fullPrisma, fullKnowledge, audit, 'prisma');

    await service.write(
      'dealers',
      'dealer-1',
      { name: 'Dai ly', tier: 'dai_ly', defaultPolicy: 'cong_no_30' },
      'operator',
      null,
    );
    await service.write(
      'groups',
      'zca-chat-1',
      { chatId: 'zca-chat-1', name: null, dealerId: 'dealer-1', status: 'mapped' },
      'operator',
      null,
    );
    await service.write(
      'products',
      'SKU-NEW',
      { name: 'San pham', unit: 'chiec' },
      'operator',
      null,
    );
    await service.write('prices', 'FELIX', { wholesale: 1_000_000 }, 'operator', null);
    await service.write(
      'overrides',
      'dealer-1:FELIX',
      { dealerId: 'dealer-1', sku: 'FELIX', price: 900_000 },
      'operator',
      null,
    );
    await service.write('glossary', 'HN', { meaning: 'Ha Noi' }, 'operator', null);

    expect(fullPrisma.dealer.upsert).toHaveBeenCalled();
    expect(fullPrisma.group.upsert).toHaveBeenCalled();
    expect(fullPrisma.product.upsert).toHaveBeenCalled();
    expect(fullPrisma.price.upsert).toHaveBeenCalled();
    expect(fullPrisma.dealerPriceOverride.upsert).toHaveBeenCalled();
    expect(fullPrisma.glossaryEntry.upsert).toHaveBeenCalled();
    expect(append).toHaveBeenCalledTimes(6);
    expect(reload).toHaveBeenCalledTimes(6);
  });

  it('returns safe errors for a missing SKU and database constraint failures', async () => {
    const missingPrisma = {
      price: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
      product: { findUnique: vi.fn(async () => null) },
      dealer: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => Promise.reject({ code: 'P2002', secret: 'hidden' })),
      },
    } as unknown as PrismaService;
    const service = new SourceTruthWriteService(missingPrisma, knowledge, audit, 'prisma');

    await expect(
      service.write('prices', 'MISSING', { wholesale: 1 }, 'operator', null),
    ).rejects.toThrow('SKU MISSING khong ton tai');
    await expect(
      service.write(
        'dealers',
        'duplicate',
        { name: 'Dai ly', tier: 'dai_ly', defaultPolicy: 'cong_no_30' },
        'operator',
        null,
      ),
    ).rejects.toThrow('P2002');
  });
});
