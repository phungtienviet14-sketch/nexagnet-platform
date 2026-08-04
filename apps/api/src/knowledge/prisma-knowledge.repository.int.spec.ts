import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaKnowledgeRepository } from './prisma-knowledge.repository.js';

/**
 * IT THAT tren Postgres — chi chay khi RUN_PRISMA_IT=1 (can seed truoc: tsx prisma/seed.ts).
 *   docker compose up -d postgres && pnpm --filter @ultty/api exec tsx prisma/seed.ts
 *   RUN_PRISMA_IT=1 DATABASE_URL=... pnpm --filter @ultty/api exec vitest run src/knowledge/prisma-knowledge.repository.int.spec.ts
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('PrismaKnowledgeRepository (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaKnowledgeRepository(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loadSnapshot tra nguon su that da seed (19 SP, dai ly, nhom da map, glossary)', async () => {
    const snap = await repo.loadSnapshot();
    expect(snap.products.length).toBeGreaterThanOrEqual(19);
    expect(snap.dealers.length).toBeGreaterThanOrEqual(3);
    expect(snap.glossary.length).toBeGreaterThan(0);

    // Gia si Felix khop bang gia thang 7 (doi chieu nguon goc).
    expect(snap.prices.find((p) => p.sku === 'FELIX')?.wholesale).toBe(1_250_000);

    // Chi nhom DA MAP moi vao snapshot -> deu co dealerId (dung y "hop thu nhom chua map").
    expect(snap.groups.length).toBeGreaterThan(0);
    expect(snap.groups.every((g) => Boolean(g.dealerId))).toBe(true);
  });
});
