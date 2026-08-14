import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../config/prisma.service.js';
import { PrismaMessagesRepository } from './prisma-messages.repository.js';

describe('PrismaMessagesRepository provenance', () => {
  it('giu messageId legacy dau tien va them moi message vao relation provenance', async () => {
    const findUnique = vi.fn(async () => ({ id: 'order-1' }));
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsert = vi.fn(async () => ({}));
    const prisma = {
      order: { findUnique, updateMany },
      orderMessage: { upsert },
    } as unknown as PrismaService;
    const repository = new PrismaMessagesRepository(prisma);

    await repository.attachOrder('order-1', 'message-1');
    await repository.attachOrder('order-1', 'message-2');

    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: { orderId_messageId: { orderId: 'order-1', messageId: 'message-1' } },
      create: { orderId: 'order-1', messageId: 'message-1' },
      update: {},
    });
    expect(upsert).toHaveBeenNthCalledWith(2, {
      where: { orderId_messageId: { orderId: 'order-1', messageId: 'message-2' } },
      create: { orderId: 'order-1', messageId: 'message-2' },
      update: {},
    });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'order-1', messageId: null },
      data: { messageId: 'message-1' },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'order-1', messageId: null },
      data: { messageId: 'message-2' },
    });
  });

  it('order khong ton tai -> bo qua nhu hop dong repository cu', async () => {
    const upsert = vi.fn();
    const updateMany = vi.fn();
    const prisma = {
      order: { findUnique: vi.fn(async () => null), updateMany },
      orderMessage: { upsert },
    } as unknown as PrismaService;
    const repository = new PrismaMessagesRepository(prisma);

    await expect(repository.attachOrder('missing', 'message-1')).resolves.toBeUndefined();
    expect(upsert).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });
});
