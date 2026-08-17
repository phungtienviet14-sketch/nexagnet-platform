import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaKnowledgeRepository } from './prisma-knowledge.repository.js';

/**
 * IT THAT tren Postgres — chi chay khi RUN_PRISMA_IT=1 (can seed truoc: tsx prisma/seed.ts).
 *   docker compose up -d postgres && pnpm --filter @netviet/api exec tsx prisma/seed.ts
 *   RUN_PRISMA_IT=1 DATABASE_URL=... pnpm --filter @netviet/api exec vitest run src/knowledge/prisma-knowledge.repository.int.spec.ts
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('PrismaKnowledgeRepository (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaKnowledgeRepository(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loadSnapshot tra nguon su that da seed (19 SP, dai ly, glossary; group la runtime)', async () => {
    const snap = await repo.loadSnapshot();
    expect(snap.products.length).toBeGreaterThanOrEqual(19);
    expect(snap.dealers.length).toBeGreaterThanOrEqual(3);
    expect(snap.glossary.length).toBeGreaterThan(0);

    // Seed chi co ky T7/2026, va `vitest.setup.ts` ghim PRICE_CURRENT_MONTH='2026-07' de bo test
    // chay tren dung ky do — nen o day ky gia PHAI hien ra. Truoc 17/08/2026 cho nay khang dinh
    // `toBeNull()` voi ly le "runtime dang la T8": ly le do dung khi test chay theo dong ho that,
    // nhung tu khi co bien ghim thi no chi con dung cho toi het thang 7 va sau do do vinh vien.
    expect(snap.pricePeriod?.validMonth).toBe('2026-07');
    expect(snap.prices.length).toBeGreaterThan(0);

    // Seed khong tao Group tu routing ID cua mot tai khoan Zalo. Neu runtime da phat hien/map nhom,
    // snapshot chi tra nhom DA MAP va moi dong deu co dealerId; DB moi hoan toan co the la mang rong.
    expect(snap.groups.every((g) => Boolean(g.dealerId))).toBe(true);
  });

  // Rang buoc nghiep vu (CLAUDE.md #10): thang khong co bang gia thi GIU TRANG THAI THIEU, tuyet doi
  // khong muon gia thang truoc. Khang dinh nay truoc day chi dung NHO dong ho that da sang thang 8 —
  // tuc la no se tu tat khi seed duoc cap nhat sang ky moi. O day ep thang bang bien de no kiem dung
  // thu no noi la kiem, khong phu thuoc hom nay la ngay nao.
  it('thang khong co ky gia active thi fail closed, khong muon gia ky truoc', async () => {
    const pinned = process.env.PRICE_CURRENT_MONTH;
    process.env.PRICE_CURRENT_MONTH = '2026-08';
    try {
      const snap = await repo.loadSnapshot();
      expect(snap.pricePeriod).toBeNull();
      expect(snap.prices).toEqual([]);
      // Danh muc SP van con — thieu GIA khong duoc lam bien mat ca nguon su that.
      expect(snap.products.length).toBeGreaterThanOrEqual(19);
    } finally {
      process.env.PRICE_CURRENT_MONTH = pinned;
    }
  });
});
