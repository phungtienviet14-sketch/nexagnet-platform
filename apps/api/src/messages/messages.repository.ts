import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ChannelMessage, MessageDirection, SenderRole } from '@netviet/shared';

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
/**
 * Ket qua tai anh ve kho ben vung (Dot A' Task 2). Union phan biet: mot ket qua HOAC co khoa
 * object, HOAC co loi — khong bao gio ca hai, va khong bao gio thieu ca hai. Cung khuon
 * `IntakeResult` trong pipeline.service.ts: bat bien nam trong kieu, khong nam o quy uoc.
 */
export type MessageMedia =
  | { key: string; bytes: number; fetchedAt: Date; error?: undefined }
  | { key?: undefined; bytes?: undefined; fetchedAt?: undefined; error: string };

/**
 * Sieu du lieu khong den tu kenh ma tu CHO GOI: tin nay do ai gui va gui theo huong nao.
 * Mac dinh la tin khach gui vao — moi call-site cu giu nguyen hanh vi.
 */
export interface SaveMessageOptions {
  direction?: MessageDirection;
  senderRole?: SenderRole;
}

/** Dong tin da luu, kem huong/vai va ket qua tai anh (neu co). */
export type StoredMessage = ChannelMessage & {
  id: string;
  direction: MessageDirection;
  senderRole: SenderRole;
  mediaKey?: string;
  mediaBytes?: number;
  mediaFetchedAt?: Date;
  mediaError?: string;
};

export abstract class MessagesRepository {
  abstract save(
    message: ChannelMessage,
    options?: SaveMessageOptions,
  ): Promise<SaveMessageResult>;
  async findByExternalMessage(
    platform: ChannelMessage['platform'],
    externalMessageId: string,
  ): Promise<StoredMessage | null> {
    void platform;
    void externalMessageId;
    return null;
  }
  /**
   * Cua so hoi thoai cua CA NHOM (khong loc theo nguoi gui — Pha 1). Loc theo nguoi gui la
   * nguyen nhan goc lam bot khong doc duoc cau tra loi cua chinh no lan tin cua Sale.
   */
  async findRecent(
    platform: ChannelMessage['platform'],
    chatId: string,
    before: Date,
    excludeExternalMessageId: string,
    limit: number,
  ): Promise<StoredMessage[]> {
    void platform;
    void chatId;
    void before;
    void excludeExternalMessageId;
    void limit;
    return [];
  }
  /** Noi don voi tin goc (FK orders.messageId). Order khong ton tai -> bo qua, khong loi. */
  abstract attachOrder(orderId: string, messageId: string): Promise<void>;
  /**
   * Ghi ket qua tai anh vao dong tin da luu. Goi tu MediaFetcher SAU khi tin da o trong DB —
   * tin khong con ton tai thi bo qua, KHONG nem (loi o day se thanh unhandled rejection).
   */
  abstract recordMedia(messageId: string, media: MessageMedia): Promise<void>;
}

@Injectable()
export class InMemoryMessagesRepository extends MessagesRepository {
  // Key trung voi unique DB: `${platform}:${externalMessageId}`
  private readonly store = new Map<string, StoredMessage>();

  async save(
    message: ChannelMessage,
    options: SaveMessageOptions = {},
  ): Promise<SaveMessageResult> {
    const key = `${message.platform}:${message.externalMessageId}`;
    const existing = this.store.get(key);
    if (existing) return { id: existing.id, duplicate: true };
    const id = randomUUID();
    this.store.set(key, {
      ...message,
      id,
      direction: options.direction ?? 'inbound',
      senderRole: options.senderRole ?? 'customer',
    });
    return { id, duplicate: false };
  }

  override async findByExternalMessage(
    platform: ChannelMessage['platform'],
    externalMessageId: string,
  ): Promise<StoredMessage | null> {
    return this.store.get(`${platform}:${externalMessageId}`) ?? null;
  }

  override async findRecent(
    platform: ChannelMessage['platform'],
    chatId: string,
    before: Date,
    excludeExternalMessageId: string,
    limit: number,
  ): Promise<StoredMessage[]> {
    return [...this.store.values()]
      .filter(
        (row) =>
          row.platform === platform &&
          row.externalChatId === chatId &&
          row.externalMessageId !== excludeExternalMessageId &&
          row.sentAt.getTime() <= before.getTime(),
      )
      .sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime())
      .slice(0, Math.max(0, limit));
  }

  /** Memory khong co bang orders de noi FK — no-op (chi co y nghia o che do prisma). */
  override async attachOrder(_orderId?: string, _messageId?: string): Promise<void> {}

  override async recordMedia(messageId: string, media: MessageMedia): Promise<void> {
    for (const [key, row] of this.store) {
      if (row.id !== messageId) continue;
      // Thay ca dong thay vi sua tai cho (coding-style: khong mutate).
      this.store.set(key, {
        ...row,
        mediaKey: media.key,
        mediaBytes: media.bytes,
        mediaFetchedAt: media.fetchedAt,
        mediaError: media.error,
      });
      return;
    }
  }

  list(): StoredMessage[] {
    return [...this.store.values()];
  }
}
