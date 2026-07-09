import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrderView } from '@ultty/shared';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaOrdersRepository } from './prisma-orders.repository.js';

/**
 * Integration test THAT tren Postgres — chi chay khi RUN_PRISMA_IT=1 (can docker postgres + migrate).
 * CI / may khong co DB -> tu SKIP (giong deepseek-eval gated). Chay:
 *   docker compose up -d postgres
 *   RUN_PRISMA_IT=1 DATABASE_URL=postgresql://ultty:ultty_local@localhost:5432/ultty \
 *     pnpm --filter @ultty/api exec vitest run src/orders/prisma-orders.repository.int.spec.ts
 * Muc tieu: chung minh round-trip OrderView (ke ca priced/trace long nhau) khong mat field.
 */
const CHAT_ID = 'it-prisma-chat';

function sampleView(): OrderView {
  return {
    id: 'it-order-felix',
    status: 'pending_review',
    createdAt: new Date('2026-07-09T00:00:00.000Z').toISOString(),
    chatId: CHAT_ID,
    groupName: 'Nhóm IT Prisma',
    dealerName: 'Meta HN',
    rawText: 'gui 10 ghe felix ve TN cho c, ko lay VAT',
    intent: 'dat_don',
    parsed: {
      orderType: 'TH1',
      items: [{ skuRaw: 'ghe felix', quantity: 10 }],
      noVat: true,
    },
    priced: {
      orderType: 'TH1',
      dealerName: 'Meta HN',
      branch: 'HN',
      lines: [
        {
          skuRaw: 'ghe felix',
          sku: 'FELIX',
          productName: 'Ghế nâng an toàn trẻ em EUS Felix (màu xám)',
          quantity: 10,
          unitPrice: 1_250_000,
          lineTotal: 12_500_000,
          matched: true,
        },
      ],
      itemsSubtotal: 12_500_000,
      shippingFee: 0,
      policy: 'cong_no_30',
      codCollect: false,
      codFee: 0,
      vat: false,
      vatAmount: 0,
      grandTotal: 12_500_000,
      warnings: [],
      confirmationText: 'HN_9.7_Meta HN\n• 10 x Ghế Felix — 1.250.000đ/SP = 12.500.000đ',
    },
    confidence: { intent: 0.95 },
    senderType: 'dai_ly',
    trace: {
      steps: [],
      primaryRole: 'sales',
      senderType: 'dai_ly',
      llmCalls: 1,
      brainMode: 'deepseek',
      supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
    },
  };
}

describe.runIf(process.env.RUN_PRISMA_IT === '1')('PrismaOrdersRepository (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaOrdersRepository(prisma);

  beforeAll(async () => {
    await prisma.order.deleteMany({ where: { chatId: CHAT_ID } });
  });
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { chatId: CHAT_ID } });
    await prisma.$disconnect();
  });

  it('create -> findById round-trip GIU nguyen field long nhau (priced/trace)', async () => {
    const view = sampleView();
    const created = await repo.create(view);
    expect(created).toEqual(view);

    const fetched = await repo.findById(view.id);
    expect(fetched).toEqual(view); // fidelity: priced.lines, trace.supervisor... khong mat
  });

  it('update -> merge patch, findById phan anh', async () => {
    const found = await repo.update('it-order-felix', {
      status: 'synced',
      kiotVietCode: 'KV-IT-1',
    });
    expect(found?.status).toBe('synced');
    expect(found?.kiotVietCode).toBe('KV-IT-1');
    expect(found?.priced?.grandTotal).toBe(12_500_000); // patch khong lam mat field cu

    const again = await repo.findById('it-order-felix');
    expect(again?.status).toBe('synced');
    expect(again?.kiotVietCode).toBe('KV-IT-1');
  });

  it('update id la -> null', async () => {
    expect(await repo.update('khong-ton-tai', { status: 'rejected' })).toBeNull();
  });

  it('list -> moi nhat truoc, gom don vua tao', async () => {
    const all = await repo.list();
    expect(all.some((v) => v.id === 'it-order-felix')).toBe(true);
  });
});
