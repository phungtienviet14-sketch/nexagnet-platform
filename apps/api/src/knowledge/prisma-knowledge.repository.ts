import { Injectable } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service.js';
import type { KnowledgeSnapshot } from './domain.js';
import { KnowledgeRepository } from './knowledge.repository.js';

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
    const [products, prices, overrides, dealers, groups, glossary] = await Promise.all([
      this.prisma.product.findMany(),
      this.prisma.price.findMany(),
      this.prisma.dealerPriceOverride.findMany(),
      this.prisma.dealer.findMany(),
      this.prisma.group.findMany({ where: { status: 'mapped', NOT: { dealerId: null } } }),
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
      prices: prices.map((p) => ({
        sku: p.sku,
        wholesale: p.wholesale,
        minRetailPrice: p.minRetailPrice ?? undefined,
        retailPrice: p.retailPrice ?? undefined,
        listPrice: p.listPrice ?? undefined,
      })),
      priceOverrides: overrides.map((o) => ({ dealerId: o.dealerId, sku: o.sku, price: o.price })),
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
