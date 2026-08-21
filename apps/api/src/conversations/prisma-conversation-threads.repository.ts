import { Injectable } from '@nestjs/common';
import type { ConversationThread as PrismaThread, Prisma } from '@prisma/client';
import {
  CLARIFY_SLOTS,
  THREAD_STATUSES,
  orderDraftSchemaFallback,
  type ClarifySlot,
  type ConversationThread,
  type ThreadStatus,
} from './thread-serde.js';
import { PrismaService } from '../config/prisma.service.js';
import { ConversationThreadsRepository } from './conversation-threads.repository.js';
import type { ThreadKey } from './conversation-thread.js';

/**
 * Mach hoi thoai tren Postgres (`PERSISTENCE=prisma`).
 *
 * Vi sao phai ben vung chu khong de trong bo nho: API restart giua luc dang cho khach tra loi la
 * chuyen binh thuong (deploy, OOM, doi container). Mat mach trong bo nho nghia la khach go "20"
 * vao mot cai bot vua quen mat no dang hoi gi — dung cai canh ma Pha 6 sinh ra de xoa.
 */
@Injectable()
export class PrismaConversationThreadsRepository extends ConversationThreadsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async find(key: ThreadKey): Promise<ConversationThread | null> {
    const row = await this.prisma.conversationThread.findUnique({
      where: {
        chatId_senderExternalId: {
          chatId: key.chatId,
          senderExternalId: key.senderExternalId,
        },
      },
    });
    return row ? toThread(row) : null;
  }

  async save(thread: ConversationThread): Promise<void> {
    const data = {
      senderDisplayName: thread.senderDisplayName ?? null,
      status: thread.status,
      draft: thread.draft as unknown as Prisma.InputJsonValue,
      awaitingSlots: [...thread.awaitingSlots],
      askCount: thread.askCount,
      lastQuestion: thread.lastQuestion ?? null,
      lastOrderId: thread.lastOrderId ?? null,
      expiresAt: new Date(thread.expiresAt),
    };
    await this.prisma.conversationThread.upsert({
      where: {
        chatId_senderExternalId: {
          chatId: thread.chatId,
          senderExternalId: thread.senderExternalId,
        },
      },
      create: {
        chatId: thread.chatId,
        senderExternalId: thread.senderExternalId,
        ...data,
      },
      update: data,
    });
  }

  async listOpen(chatId: string): Promise<ConversationThread[]> {
    const rows = await this.prisma.conversationThread.findMany({
      where: { chatId, status: { in: ['collecting', 'awaiting_answer'] } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toThread);
  }
}

function toThread(row: PrismaThread): ConversationThread {
  return {
    chatId: row.chatId,
    senderExternalId: row.senderExternalId,
    ...(row.senderDisplayName ? { senderDisplayName: row.senderDisplayName } : {}),
    status: toStatus(row.status),
    draft: orderDraftSchemaFallback(row.draft),
    awaitingSlots: row.awaitingSlots.filter(isClarifySlot),
    askCount: row.askCount,
    ...(row.lastQuestion ? { lastQuestion: row.lastQuestion } : {}),
    ...(row.lastOrderId ? { lastOrderId: row.lastOrderId } : {}),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** Cot la TEXT tu do phia DB — gia tri la thi coi nhu mach da chuyen Sale, KHONG coi la dang cho. */
function toStatus(value: string): ThreadStatus {
  return (THREAD_STATUSES as readonly string[]).includes(value)
    ? (value as ThreadStatus)
    : 'handed_off';
}

function isClarifySlot(value: string): value is ClarifySlot {
  return (CLARIFY_SLOTS as readonly string[]).includes(value);
}
