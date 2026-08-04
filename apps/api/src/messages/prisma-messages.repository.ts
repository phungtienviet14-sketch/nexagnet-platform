import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ChannelMessage } from '@ultty/shared';
import { PrismaService } from '../config/prisma.service.js';
import { MessagesRepository, type SaveMessageResult } from './messages.repository.js';

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

  async attachOrder(orderId: string, messageId: string): Promise<void> {
    // updateMany: don khong duoc luu (vd cau hoi khong tao dong don) -> 0 dong, khong throw.
    await this.prisma.order.updateMany({ where: { id: orderId }, data: { messageId } });
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
