import { Injectable } from '@nestjs/common';
import type { ConversationThread } from '@netviet/shared';
import type { ThreadKey } from './conversation-thread.js';

/**
 * Kho mach hoi thoai. Cung seam memory|prisma nhu Orders/Messages/Knowledge: mac dinh in-memory
 * (demo/CI khong can DB), `PERSISTENCE=prisma` -> Postgres.
 *
 * Khoa la `(chatId, senderExternalId)` — KHONG phai chatId. Trong mot nhom 200 dai ly, khoa theo
 * nhom nghia la cau tra loi "20 cai" cua nguoi nay dien vao don nhap cua nguoi kia.
 */
export abstract class ConversationThreadsRepository {
  abstract find(key: ThreadKey): Promise<ConversationThread | null>;
  abstract save(thread: ConversationThread): Promise<void>;
  /** Cac mach dang mo cua mot nhom — de console hien "dang cho ai tra loi gi". */
  abstract listOpen(chatId: string): Promise<ConversationThread[]>;
}

@Injectable()
export class InMemoryConversationThreadsRepository extends ConversationThreadsRepository {
  private readonly store = new Map<string, ConversationThread>();

  async find(key: ThreadKey): Promise<ConversationThread | null> {
    return this.store.get(storeKey(key)) ?? null;
  }

  async save(thread: ConversationThread): Promise<void> {
    this.store.set(storeKey(thread), { ...thread, draft: structuredClone(thread.draft) });
  }

  async listOpen(chatId: string): Promise<ConversationThread[]> {
    return [...this.store.values()].filter(
      (thread) =>
        thread.chatId === chatId &&
        (thread.status === 'collecting' || thread.status === 'awaiting_answer'),
    );
  }
}

export function storeKey(key: ThreadKey): string {
  return `${key.chatId}::${key.senderExternalId}`;
}
