import { PrismaClient } from '@prisma/client';
import { SEED } from '../src/knowledge/seed.js';

/**
 * Nap nguon su that THAT (SEED) vao Postgres — de che do PERSISTENCE=prisma co du lieu.
 * Idempotent (upsert theo khoa) -> chay lai an toan. Chay:
 *   docker compose up -d postgres
 *   pnpm --filter @netviet/api exec tsx prisma/seed.ts
 * Dealer dung ID co dinh tu SEED (meta-hn...) de group/override tham chieu dung.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const p of SEED.products) {
    const data = { name: p.name, aliases: p.aliases, unit: p.unit, description: p.description };
    await prisma.product.upsert({
      where: { sku: p.sku },
      create: { sku: p.sku, ...data },
      update: data,
    });
  }
  const period = SEED.pricePeriod;
  if (SEED.prices.length > 0 && (!period?.validMonth || period.status !== 'active')) {
    throw new Error('Tenant seed co gia nhung thieu ky gia active hop le');
  }
  const pricePeriod = period?.validMonth
    ? await prisma.pricePeriod.upsert({
        where: { id: `seed-${period.validMonth}` },
        create: {
          id: `seed-${period.validMonth}`,
          validMonth: period.validMonth,
          status: period.status,
          source: 'tenant-bootstrap',
        },
        update: { status: period.status },
      })
    : null;
  for (const pr of SEED.prices) {
    const data = {
      wholesale: pr.wholesale,
      minRetailPrice: pr.minRetailPrice,
      retailPrice: pr.retailPrice,
      listPrice: pr.listPrice,
    };
    if (!pricePeriod) continue;
    await prisma.price.upsert({
      where: { periodId_sku: { periodId: pricePeriod.id, sku: pr.sku } },
      create: { periodId: pricePeriod.id, sku: pr.sku, ...data },
      update: data,
    });
  }
  for (const d of SEED.dealers) {
    const data = { name: d.name, aliases: d.aliases, tier: d.tier, defaultPolicy: d.defaultPolicy };
    await prisma.dealer.upsert({
      where: { id: d.id },
      create: { id: d.id, ...data },
      update: data,
    });
  }
  for (const o of SEED.priceOverrides) {
    await prisma.dealerPriceOverride.upsert({
      where: { dealerId_sku: { dealerId: o.dealerId, sku: o.sku } },
      create: { dealerId: o.dealerId, sku: o.sku, price: o.price },
      update: { price: o.price },
    });
  }
  // KHONG seed Group vao Postgres: `SEED.groups[].chatId` chi la routing ID cua tai khoan Zalo
  // dung cho demo memory, khong phai identity ben vung. Runtime tao/doi soat nhom tu zca va luu
  // `globalId`; neu seed lai cac chatId cu thi moi lan deploy co the hoi sinh nhom trung.
  for (const gl of SEED.glossary) {
    await prisma.glossaryEntry.upsert({
      where: { term: gl.term },
      create: { term: gl.term, meaning: gl.meaning },
      update: { meaning: gl.meaning },
    });
  }
  console.log(
    `Seeded Postgres: ${SEED.products.length} SP, ${SEED.dealers.length} dai ly, 0 nhom runtime, ${SEED.glossary.length} glossary.`,
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
