import { PrismaClient } from '@prisma/client';
import { SEED } from '../src/knowledge/seed.js';

/**
 * Nap nguon su that THAT (SEED) vao Postgres — de che do PERSISTENCE=prisma co du lieu.
 * Idempotent (upsert theo khoa) -> chay lai an toan. Chay:
 *   docker compose up -d postgres
 *   pnpm --filter @ultty/api exec tsx prisma/seed.ts
 * Dealer dung ID co dinh tu SEED (meta-hn...) de group/override tham chieu dung.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const p of SEED.products) {
    const data = { name: p.name, aliases: p.aliases, unit: p.unit, description: p.description };
    await prisma.product.upsert({ where: { sku: p.sku }, create: { sku: p.sku, ...data }, update: data });
  }
  for (const pr of SEED.prices) {
    const data = {
      wholesale: pr.wholesale,
      minRetailPrice: pr.minRetailPrice,
      retailPrice: pr.retailPrice,
      listPrice: pr.listPrice,
      validMonth: '2026-07',
    };
    await prisma.price.upsert({ where: { sku: pr.sku }, create: { sku: pr.sku, ...data }, update: data });
  }
  for (const d of SEED.dealers) {
    const data = { name: d.name, aliases: d.aliases, tier: d.tier, defaultPolicy: d.defaultPolicy };
    await prisma.dealer.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }
  for (const o of SEED.priceOverrides) {
    await prisma.dealerPriceOverride.upsert({
      where: { dealerId_sku: { dealerId: o.dealerId, sku: o.sku } },
      create: { dealerId: o.dealerId, sku: o.sku, price: o.price },
      update: { price: o.price },
    });
  }
  for (const g of SEED.groups) {
    const data = { name: g.name, branch: g.branch, dealerId: g.dealerId, status: 'mapped' as const, source: 'seed' };
    await prisma.group.upsert({
      where: { platform_chatId: { platform: 'zalo', chatId: g.chatId } },
      create: { platform: 'zalo', chatId: g.chatId, ...data },
      update: data,
    });
  }
  for (const gl of SEED.glossary) {
    await prisma.glossaryEntry.upsert({
      where: { term: gl.term },
      create: { term: gl.term, meaning: gl.meaning },
      update: { meaning: gl.meaning },
    });
  }
  console.log(
    `Seeded Postgres: ${SEED.products.length} SP, ${SEED.dealers.length} dai ly, ${SEED.groups.length} nhom, ${SEED.glossary.length} glossary.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed loi:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
