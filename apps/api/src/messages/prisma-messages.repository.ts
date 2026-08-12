import { Injectable } from '@nestjs/common';
import type { Message as PrismaMessage, Prisma } from '@prisma/client';
import { channelMessageSchema, type ChannelMessage } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import {
  MessagesRepository,
  type MessageMedia,
  type SaveMessageResult,
} from './messages.repository.js';

/**
 * Luu tin tren Postgres (PERSISTENCE=prisma). Chong trung bang unique (platform, externalMessageId)
 * ngay o DB — ben qua restart (Set trong ingest chi song trong tien trinh).
 * groupId de null: map nhom -> dai ly da co bang groups, join theo chatId khi can (khong denormalize som).
 */
@Injectable()
export class PrismaMessagesRepository extends MessagesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(message: ChannelMessage): Promise<SaveMessageResult> {
    try {
      const row = await this.prisma.message.create({
        data: {
          externalMessageId: message.externalMessageId,
          platform: message.platform,
          source: message.source,
          chatId: message.externalChatId,
          senderExternalId: message.senderExternalId ?? null,
          senderDisplayName: message.senderDisplayName ?? null,
          text: message.text,
          imageUrl: message.imageUrl ?? null,
          sentAt: message.sentAt,
          raw: message as unknown as Prisma.InputJsonValue,
        },
      });
      return { id: row.id, duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.prisma.message.findUnique({
        where: {
          platform_externalMessageId: {
            platform: message.platform,
            externalMessageId: message.externalMessageId,
          },
        },
      });
      if (!existing) throw error;
      return { id: existing.id, duplicate: true };
    }
  }

  override async findByExternalMessage(
    platform: ChannelMessage['platform'],
    externalMessageId: string,
  ): Promise<import('./messages.repository.js').StoredMessage | null> {
    const row = await this.prisma.message.findUnique({
      where: { platform_externalMessageId: { platform, externalMessageId } },
    });
    return row ? toStoredMessage(row) : null;
  }

  override async findRecent(
    platform: ChannelMessage['platform'],
    chatId: string,
    before: Date,
    excludeExternalMessageId: string,
    limit: number,
  ): Promise<import('./messages.repository.js').StoredMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        platform,
        chatId,
        sentAt: { lte: before },
        NOT: { externalMessageId: excludeExternalMessageId },
      },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: Math.max(0, limit),
    });
    return rows.map(toStoredMessage);
  }

  override async attachOrder(orderId: string, messageId: string): Promise<void> {
    // updateMany: don khong duoc luu (vd cau hoi khong tao dong don) -> 0 dong, khong throw.
    await this.prisma.order.updateMany({ where: { id: orderId }, data: { messageId } });
  }

  override async recordMedia(messageId: string, media: MessageMedia): Promise<void> {
    // updateMany vi cung ly do voi attachOrder: tin co the khong con -> 0 dong, khong throw.
    // Ghi ca nhanh null de mot lan tai lai thanh cong xoa duoc mediaError cu.
    await this.prisma.message.updateMany({
      where: { id: messageId },
      data: {
        mediaKey: media.key ?? null,
        mediaBytes: media.bytes ?? null,
        mediaFetchedAt: media.fetchedAt ?? null,
        mediaError: media.error ?? null,
      },
    });
  }
}

/** P2002 = vi pham unique constraint (Prisma known request error). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function toStoredMessage(row: PrismaMessage): import('./messages.repository.js').StoredMessage {
  const raw = channelMessageSchema.safeParse(row.raw);
  const base: ChannelMessage = raw.success
    ? raw.data
    : {
        externalMessageId: row.externalMessageId,
        platform: 'zalo',
        source: row.source as ChannelMessage['source'],
        chatType: row.groupId ? 'group' : 'private',
        externalChatId: row.chatId,
        senderExternalId: row.senderExternalId ?? undefined,
        senderDisplayName: row.senderDisplayName ?? undefined,
        text: row.text,
        imageUrl: row.imageUrl ?? undefined,
        sentAt: row.sentAt,
      };
  return {
    ...base,
    id: row.id,
    mediaKey: row.mediaKey ?? undefined,
    mediaBytes: row.mediaBytes ?? undefined,
    mediaFetchedAt: row.mediaFetchedAt ?? undefined,
    mediaError: row.mediaError ?? undefined,
  };
}
