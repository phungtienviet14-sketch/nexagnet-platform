import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ChannelMessage, OrderView } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaOrdersRepository } from '../orders/prisma-orders.repository.js';
import { PrismaMessagesRepository } from './prisma-messages.repository.js';

/**
 * Integration test THAT tren Postgres — chi chay khi RUN_PRISMA_IT=1 (giong prisma-orders IT). Chay:
 *   docker compose up -d postgres
 *   RUN_PRISMA_IT=1 DATABASE_URL=postgresql://ultty:ultty_local@localhost:5432/ultty \
 *     pnpm --filter @netviet/api exec vitest run src/messages/prisma-messages.repository.int.spec.ts
 * Muc tieu: round-trip tin, chong trung bang unique DB, noi don <-> tin goc (FK orders.messageId).
 */
const CHAT_ID = 'it-msg-chat';
const ORDER_ID = 'it-msg-order';

function sampleMessage(externalMessageId: string): ChannelMessage {
  return {
    externalMessageId,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: CHAT_ID,
    senderDisplayName: 'IT Bot',
    text: 'gui 10 ghe felix ve TN cho c',
    sentAt: new Date('2026-07-11T00:00:00.000Z'),
  };
}

function sampleOrder(): OrderView {
  return {
    id: ORDER_ID,
    status: 'pending_review',
    createdAt: new Date('2026-07-11T00:00:00.000Z').toISOString(),
    chatId: CHAT_ID,
    groupName: 'Nhóm IT Messages',
    dealerName: 'Meta HN',
    rawText: 'gui 10 ghe felix ve TN cho c',
    intent: 'dat_don',
    parsed: null,
    priced: null,
    confidence: { intent: 0.9 },
    senderType: 'dai_ly',
  };
}

describe.runIf(process.env.RUN_PRISMA_IT === '1')('PrismaMessagesRepository (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaMessagesRepository(prisma);

  beforeAll(async () => {
    await prisma.order.deleteMany({ where: { chatId: CHAT_ID } });
    await prisma.message.deleteMany({ where: { chatId: CHAT_ID } });
  });
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { chatId: CHAT_ID } });
    await prisma.message.deleteMany({ where: { chatId: CHAT_ID } });
    await prisma.$disconnect();
  });

  it('save -> dong ton tai voi du field + receivedAt tu dong', async () => {
    const result = await repo.save(sampleMessage('it-m-1'));

    expect(result.duplicate).toBe(false);
    const row = await prisma.message.findUnique({
      where: { platform_externalMessageId: { platform: 'zalo', externalMessageId: 'it-m-1' } },
    });
    expect(row?.chatId).toBe(CHAT_ID);
    expect(row?.text).toContain('ghe felix');
    expect(row?.sentAt.toISOString()).toBe('2026-07-11T00:00:00.000Z');
    expect(row?.receivedAt).toBeInstanceOf(Date);
  });

  it('save trung -> duplicate=true, giu id cu, DB van 1 dong (unique platform+externalMessageId)', async () => {
    const first = await repo.save(sampleMessage('it-m-trung'));
    const second = await repo.save(sampleMessage('it-m-trung'));

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    const count = await prisma.message.count({
      where: { chatId: CHAT_ID, externalMessageId: 'it-m-trung' },
    });
    expect(count).toBe(1);
  });

  it('attachOrder -> orders.messageId tro dung tin goc', async () => {
    const saved = await repo.save(sampleMessage('it-m-link'));
    await new PrismaOrdersRepository(prisma).create(sampleOrder());

    await repo.attachOrder(ORDER_ID, saved.id);

    const order = await prisma.order.findUnique({ where: { id: ORDER_ID } });
    expect(order?.messageId).toBe(saved.id);
  });

  it('attachOrder voi order khong ton tai -> khong throw (updateMany 0 dong)', async () => {
    const saved = await repo.save(sampleMessage('it-m-orphan'));
    await expect(repo.attachOrder('khong-ton-tai', saved.id)).resolves.toBeUndefined();
  });
});
