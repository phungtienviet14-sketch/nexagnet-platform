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
    price: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => undefined),
    },
    product: { findUnique: vi.fn(async () => ({ sku: 'FELIX' })) },
    pricePeriod: {
      findFirst: vi.fn(async () => ({ id: 'period-2026-08' })),
      create: vi.fn(async () => ({ id: 'period-2026-08' })),
    },
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

  it('chan duong ghi gia legacy de bat buoc lifecycle draft-preview-activate', async () => {
    const service = new SourceTruthWriteService(prisma, knowledge, audit, 'prisma');

    await expect(
      service.write('prices', 'FELIX', { wholesale: 1_100_000 }, 'operator', 'req-1'),
    ).rejects.toThrow('/settings/price-periods');
    expect(prisma.price.upsert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
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
      price: { findFirst: method(), findUnique: method(), upsert: method() },
      pricePeriod: {
        findFirst: vi.fn(async () => ({ id: 'period-2026-08' })),
        create: method(),
      },
      dealerPriceOverride: { findUnique: method(), upsert: method() },
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
    expect(fullPrisma.price.upsert).not.toHaveBeenCalled();
    expect(fullPrisma.dealerPriceOverride.upsert).toHaveBeenCalled();
    // Sua mot deal phai DOC trang thai truoc do de audit ghi lai duoc "gia cu la bao nhieu".
    // Truoc Issue #77, nhanh nay tra thang `null` — moi lan sua deu duoc ghi lai nhu mot lan tao.
    expect(fullPrisma.dealerPriceOverride.findUnique).toHaveBeenCalledWith({
      where: { dealerId_sku: { dealerId: 'dealer-1', sku: 'FELIX' } },
    });
    expect(fullPrisma.glossaryEntry.upsert).toHaveBeenCalled();
    expect(append).toHaveBeenCalledTimes(5);
    expect(reload).toHaveBeenCalledTimes(5);
  });

  /* ---------------------------------------------------------------- *
   * DANH TINH: URL va THAN TIN phai noi cung mot thu
   * ---------------------------------------------------------------- */

  /**
   * Ba buoc cua mot lan ghi tung doc danh tinh tu HAI nguon khac nhau:
   *
   * ```text
   * PUT /settings/source-truth/overrides/dealer-A:ELNI  { dealerId: "dealer-B", sku: "FELIX" }
   *   findBefore()  doc   dealer-A / ELNI     <- URL
   *   persist()     ghi   dealer-B / FELIX    <- THAN
   *   audit()       ghi   dealer-A / ELNI     <- URL
   * ```
   *
   * Ket qua: nhat ky khai mot ban ghi da doi, con ban ghi that su doi la mot ban ghi KHAC. Nhat ky
   * la thu duy nhat tra loi duoc "gia nay ai doi, doi luc nao" khi mot don sai di ra toi khach —
   * va o day no tra loi sai mot cach tu tin.
   */
  it('tu choi khi ID tren URL khong khop dealerId/sku trong than tin', async () => {
    const method = () => vi.fn(async () => null);
    const overridePrisma = {
      dealerPriceOverride: { findUnique: method(), upsert: method() },
    } as unknown as PrismaService;
    // Mock day du CO CHU Y: neu thieu `priceOverrides` thi tren code CU bai nay van do, nhung do
    // vi mot `TypeError` o buoc `list()` chu khong phai vi cong danh tinh dong. Mot bai test do
    // nham ly do la mot bai test se xanh tro lai vao dung luc no khong nen xanh.
    const overrideKnowledge = {
      reload,
      priceOverrides: () => [],
    } as unknown as KnowledgeService;
    const service = new SourceTruthWriteService(overridePrisma, overrideKnowledge, audit, 'prisma');

    await expect(
      service.write(
        'overrides',
        'dealer-A:ELNI',
        { dealerId: 'dealer-B', sku: 'FELIX', price: 900_000 },
        'operator',
        'req-mismatch',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // KHONG DOC, KHONG GHI, KHONG AUDIT. Mot lan ghi bi tu choi khong duoc dung vao ban ghi nao —
    // ke ca chi de "xem truoc".
    expect(overridePrisma.dealerPriceOverride.findUnique).not.toHaveBeenCalled();
    expect(overridePrisma.dealerPriceOverride.upsert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('khop thi ca ba buoc dung DUNG mot danh tinh', async () => {
    const method = () => vi.fn(async () => null);
    const overridePrisma = {
      dealerPriceOverride: { findUnique: method(), upsert: method() },
    } as unknown as PrismaService;
    const overrideKnowledge = {
      reload,
      priceOverrides: () => [],
    } as unknown as KnowledgeService;
    const service = new SourceTruthWriteService(overridePrisma, overrideKnowledge, audit, 'prisma');

    await service.write(
      'overrides',
      'dealer-A:ELNI',
      { dealerId: 'dealer-A', sku: 'ELNI', price: 900_000 },
      'operator',
      'req-ok',
    );

    const identity = { dealerId: 'dealer-A', sku: 'ELNI' };
    expect(overridePrisma.dealerPriceOverride.findUnique).toHaveBeenCalledWith({
      where: { dealerId_sku: identity },
    });
    expect(overridePrisma.dealerPriceOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dealerId_sku: identity } }),
    );
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'overrides', entityId: 'dealer-A:ELNI' }),
    );
  });

  it('returns safe errors for a missing SKU and database constraint failures', async () => {
    const missingPrisma = {
      price: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null), upsert: vi.fn() },
      pricePeriod: { findFirst: vi.fn(async () => null), create: vi.fn() },
      product: { findUnique: vi.fn(async () => null) },
      dealer: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => Promise.reject({ code: 'P2002', secret: 'hidden' })),
      },
    } as unknown as PrismaService;
    const service = new SourceTruthWriteService(missingPrisma, knowledge, audit, 'prisma');

    await expect(
      service.write('prices', 'MISSING', { wholesale: 1 }, 'operator', null),
    ).rejects.toThrow('/settings/price-periods');
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
