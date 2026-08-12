import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataService } from './master-data.service.js';

const method = () => vi.fn();

function build() {
  const prisma = {
    dealer: { findMany: method(), findUnique: method(), upsert: method(), update: method() },
    dealerPriceOverride: {
      findMany: method(),
      findUnique: method(),
      upsert: method(),
      update: method(),
    },
    group: { findMany: method(), findUnique: method(), upsert: method() },
    groupMappingHistory: { create: method() },
    product: { findMany: method() },
    $transaction: vi.fn(async (operations: readonly Promise<unknown>[]) => Promise.all(operations)),
  };
  prisma.dealer.findMany.mockResolvedValue([]);
  prisma.dealerPriceOverride.findMany.mockResolvedValue([]);
  prisma.group.findMany.mockResolvedValue([]);
  prisma.product.findMany.mockResolvedValue([]);
  const audit = { append: method() };
  const knowledge = { reload: method() };
  return {
    prisma,
    audit,
    knowledge,
    service: new MasterDataService(prisma as never, knowledge as never, audit as never, 'prisma'),
  };
}

const jsonImport = {
  format: 'json',
  encoding: 'utf8',
  content: JSON.stringify({
    dealers: [
      {
        id: 'dealer-2',
        name: 'Đại lý 2',
        aliases: [],
        tier: 'ctv',
        defaultPolicy: 'thanh_toan_ngay',
        status: 'active',
        metadata: { region: 'north' },
      },
    ],
    deals: [],
    groups: [],
  }),
};

describe('MasterDataService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists Postgres runtime data with an explicit unmapped-groups projection', async () => {
    const { service, prisma } = build();
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', chatId: 'chat-1', status: 'pending', dealerId: null },
      { id: 'g2', chatId: 'chat-2', status: 'mapped', dealerId: 'dealer-1' },
    ]);

    const result = await service.list();

    expect(result.groups).toHaveLength(2);
    expect(result.unmappedGroups).toEqual([
      expect.objectContaining({ chatId: 'chat-1', status: 'pending' }),
    ]);
  });

  it('soft-disables a dealer and a deal, preserving records and writing audits', async () => {
    const { service, prisma, audit, knowledge } = build();
    prisma.dealer.findUnique.mockResolvedValue({ id: 'dealer-1', status: 'active' });
    prisma.dealer.update.mockResolvedValue({ id: 'dealer-1', status: 'inactive' });
    prisma.dealerPriceOverride.findUnique.mockResolvedValue({ id: 'deal-1', enabled: true });
    prisma.dealerPriceOverride.update.mockResolvedValue({ id: 'deal-1', enabled: false });

    await service.disableDealer('dealer-1', 'operator', 'request-1');
    await service.disableDeal('deal-1', 'operator', 'request-2');

    expect(prisma.dealer.update).toHaveBeenCalledWith({
      where: { id: 'dealer-1' },
      data: { status: 'inactive' },
    });
    expect(prisma.dealerPriceOverride.update).toHaveBeenCalledWith({
      where: { id: 'deal-1' },
      data: { enabled: false },
    });
    expect(audit.append).toHaveBeenCalledTimes(2);
    expect(knowledge.reload).toHaveBeenCalledTimes(2);
  });

  it('previews without writes, applies only a matching current-state token, then reloads once', async () => {
    const { service, prisma, audit, knowledge } = build();

    const preview = await service.previewImport(jsonImport);
    expect(preview.valid).toBe(true);
    expect(preview.totals.create).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    const result = await service.applyImport(
      { ...jsonImport, previewToken: preview.previewToken, confirmed: true },
      'operator',
      'request-1',
    );

    expect(result.applied).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.dealer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'dealer-2' } }),
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'master_data.import.apply' }),
    );
    expect(knowledge.reload).toHaveBeenCalledTimes(1);
  });

  it('rejects stale preview tokens and invalid rows before any transaction', async () => {
    const { service, prisma } = build();

    await expect(
      service.applyImport(
        { ...jsonImport, previewToken: '0'.repeat(64), confirmed: true },
        'operator',
        null,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    const invalid = {
      format: 'json',
      encoding: 'utf8',
      content: JSON.stringify({
        dealers: [],
        groups: [],
        deals: [{ dealerId: 'missing', sku: 'missing', price: 1 }],
      }),
    };
    const invalidPreview = await service.previewImport(invalid);
    await expect(
      service.applyImport(
        { ...invalid, previewToken: invalidPreview.previewToken, confirmed: true },
        'operator',
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed outside Prisma persistence', async () => {
    const { prisma, audit, knowledge } = build();
    const service = new MasterDataService(prisma as never, knowledge as never, audit as never, 'memory');

    await expect(service.list()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.previewImport(jsonImport)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
