import { Injectable } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeSnapshot } from './domain.js';
import { KnowledgeRepository } from './knowledge.repository.js';
import { currentPriceMonth } from './price-periods.js';

/**
 * Nguon su that tren Postgres (PERSISTENCE=prisma). Nap 1 lan thanh KnowledgeSnapshot.
 * CHI lay group da map (status=mapped + co dealerId) — nhom "pending" (chua map) khong vao
 * ngu canh dinh tuyen (resolveByChatId), dung y "hop thu nhom chua map".
 */
@Injectable()
export class PrismaKnowledgeRepository extends KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadSnapshot(): Promise<KnowledgeSnapshot> {
    const currentMonth = currentPriceMonth();
    const now = new Date();
    const [products, pricePeriod, overrides, dealers, groups, glossary] = await Promise.all([
      this.prisma.product.findMany(),
      this.prisma.pricePeriod.findFirst({
        where: { validMonth: currentMonth, status: 'active' },
        include: { prices: true },
      }),
      this.prisma.dealerPriceOverride.findMany({
        where: {
          enabled: true,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
          ],
          dealer: { status: 'active' },
        },
      }),
      this.prisma.dealer.findMany({ where: { status: 'active' } }),
      this.prisma.group.findMany({
        where: { status: 'mapped', NOT: { dealerId: null }, dealer: { status: 'active' } },
      }),
      this.prisma.glossaryEntry.findMany(),
    ]);

    return {
      products: products.map((p) => ({
        sku: p.sku,
        name: p.name,
        aliases: p.aliases,
        unit: p.unit,
        description: p.description ?? undefined,
      })),
      pricePeriod: pricePeriod
        ? { validMonth: pricePeriod.validMonth, status: pricePeriod.status, source: pricePeriod.source }
        : null,
      prices: (pricePeriod?.prices ?? []).map((p) => ({
        id: p.id,
        periodId: p.periodId,
        sku: p.sku,
        wholesale: p.wholesale,
        minRetailPrice: p.minRetailPrice ?? undefined,
        retailPrice: p.retailPrice ?? undefined,
        listPrice: p.listPrice ?? undefined,
        validMonth: pricePeriod?.validMonth,
        periodStatus: pricePeriod?.status,
      })),
      priceOverrides: overrides.map((o) => ({
        dealerId: o.dealerId,
        sku: o.sku,
        price: o.price,
        // NULL trong DB = ap moi so luong; giu `undefined` de rules dung mac dinh 1.
        ...(o.minQuantity === null ? {} : { minQuantity: o.minQuantity }),
      })),
      dealers: dealers.map((d) => ({
        id: d.id,
        name: d.name,
        aliases: d.aliases,
        tier: d.tier,
        defaultPolicy: d.defaultPolicy,
      })),
      groups: groups.map((g) => ({
        chatId: g.chatId,
        dealerId: g.dealerId as string,
        branch: g.branch ?? '',
        name: g.name ?? '',
      })),
      glossary: glossary.map((g) => ({ term: g.term, meaning: g.meaning })),
    };
  }
}
