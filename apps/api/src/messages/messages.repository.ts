import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ChannelMessage } from '@ultty/shared';

/** Ket qua luu tin: id dong trong DB + co phai tin trung (da luu truoc do) khong. */
export interface SaveMessageResult {
  id: string;
  duplicate: boolean;
}

/**
 * Repository luu MOI tin ngay khi nhan (Phase 3 — NĐ13 + chong mat don khi Zalo khoa kenh).
 * Seam memory|prisma nhu Orders/Knowledge: mac dinh in-memory (demo/CI khong can DB),
 * PERSISTENCE=prisma -> Postgres voi unique (platform, externalMessageId) chong trung ben.
 */
export abstract class MessagesRepository {
  abstract save(message: ChannelMessage): Promise<SaveMessageResult>;
  /** Noi don voi tin goc (FK orders.messageId). Order khong ton tai -> bo qua, khong loi. */
  abstract attachOrder(orderId: string, messageId: string): Promise<void>;
}

@Injectable()
export class InMemoryMessagesRepository extends MessagesRepository {
  // Key trung voi unique DB: `${platform}:${externalMessageId}`
  private readonly store = new Map<string, ChannelMessage & { id: string }>();

  async save(message: ChannelMessage): Promise<SaveMessageResult> {
    const key = `${message.platform}:${message.externalMessageId}`;
    const existing = this.store.get(key);
    if (existing) return { id: existing.id, duplicate: true };
    const id = randomUUID();
    this.store.set(key, { ...message, id });
    return { id, duplicate: false };
  }

  /** Memory khong co bang orders de noi FK — no-op (chi co y nghia o che do prisma). */
  async attachOrder(): Promise<void> {}

  list(): Array<ChannelMessage & { id: string }> {
    return [...this.store.values()];
  }
}
