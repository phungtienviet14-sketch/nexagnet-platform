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

    // Seed hien chi co T7/2026; runtime T8 phai fail closed, khong fallback T7.
    expect(snap.pricePeriod).toBeNull();
    expect(snap.prices).toEqual([]);

    // Seed khong tao Group tu routing ID cua mot tai khoan Zalo. Neu runtime da phat hien/map nhom,
    // snapshot chi tra nhom DA MAP va moi dong deu co dealerId; DB moi hoan toan co the la mang rong.
    expect(snap.groups.every((g) => Boolean(g.dealerId))).toBe(true);
  });
});
