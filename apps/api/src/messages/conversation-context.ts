import { Injectable, Optional } from '@nestjs/common';
import type {
  ChannelMessage,
  ConversationContext,
  ConversationMessage,
  ConversationParticipant,
} from '@netviet/shared';
import { MessagesRepository, type StoredMessage } from './messages.repository.js';

export interface ConversationContextLimits {
  maxMessages: number;
  maxCharacters: number;
}

/**
 * 16 tin (Pha 1, truoc do 6). Mot luot chot don thuc te tren Zalo — hoi gia, hoi ship, doi so
 * luong, xac nhan — thuong dai hon 6 tin, nen cua so cu cat mat chinh doan LLM can de hieu
 * "cai do", "vay tong bao nhieu". Ngan sach ky tu van la tran cung: 16 tin ngan thi vao het,
 * vai tin dai thi cat bot, khong bao gio vuot han muc token.
 */
export const DEFAULT_CONTEXT_LIMITS: Readonly<ConversationContextLimits> = {
  maxMessages: 16,
  maxCharacters: 8_000,
};

@Injectable()
export class ConversationContextBuilder {
  private readonly limits: ConversationContextLimits;

  constructor(
    private readonly messages: MessagesRepository,
    @Optional() limits?: Partial<ConversationContextLimits>,
  ) {
    this.limits = {
      maxMessages: positiveInteger(limits?.maxMessages, DEFAULT_CONTEXT_LIMITS.maxMessages),
      maxCharacters: positiveInteger(
        limits?.maxCharacters,
        DEFAULT_CONTEXT_LIMITS.maxCharacters,
      ),
    };
  }

  async build(
    current: ChannelMessage,
    excludeExternalMessageIds: readonly string[] = [],
  ): Promise<ConversationContext> {
    const excludedIds = new Set(excludeExternalMessageIds);
    const quotedMessage = await this.resolveQuote(current);
    // Lich su cua CA NHOM, khong loc theo nguoi gui: cau tra loi cua bot va tin cua Sale la
    // ve TRUOC cua mach hoi thoai. Loc chung di chinh la ly do bot lap lai chinh no.
    const rows = await this.messages.findRecent(
      current.platform,
      current.externalChatId,
      current.sentAt,
      current.externalMessageId,
      this.limits.maxMessages + 1,
    );
    const recentMessages = boundedRecent(
      rows.filter(
        (row) =>
          row.externalMessageId !== quotedMessage?.externalMessageId &&
          !excludedIds.has(row.externalMessageId),
      ),
      this.limits,
    );
    const participants = normalizeParticipants(current, quotedMessage, recentMessages);
    return {
      ...(quotedMessage ? { quotedMessage } : {}),
      recentMessages,
      participants,
    };
  }

  private async resolveQuote(current: ChannelMessage): Promise<ConversationMessage | undefined> {
    const reply = current.replyTo;
    if (!reply) return undefined;
    if (reply.externalMessageId) {
      const stored = await this.messages.findByExternalMessage(
        current.platform,
        reply.externalMessageId,
      );
      if (stored?.externalChatId === current.externalChatId) return toContextMessage(stored);
    }
    if (!reply.text?.trim() && !reply.imageUrl) return undefined;
    return {
      externalMessageId: reply.externalMessageId ?? `inline:${current.externalMessageId}`,
      text: reply.text ?? '',
      imageUrl: reply.imageUrl,
      senderExternalId: reply.senderExternalId,
      senderDisplayName: reply.senderDisplayName,
      // Quote inline khong resolve duoc ve dong trong DB thi khong biet vai — tin duoc reply
      // gan nhu luon la tin khach, va doan sai 'bot' se lam LLM tuong minh da noi cau do.
      senderRole: 'customer',
      sentAt: reply.sentAt ?? current.sentAt,
    };
  }
}

function boundedRecent(
  newestFirst: StoredMessage[],
  limits: ConversationContextLimits,
): ConversationMessage[] {
  const selected: ConversationMessage[] = [];
  let usedCharacters = 0;
  for (const row of newestFirst) {
    if (selected.length >= limits.maxMessages) break;
    // `break`, KHONG `continue`: het ngan sach thi dung han. Bo qua mot tin dai roi van lay
    // tin CU HON se tao lich su thung lo — LLM doc thay hai tin canh nhau va tuong chung lien
    // tiep, trong khi that ra co mot tin da bien mat o giua.
    if (usedCharacters + row.text.length > limits.maxCharacters) break;
    selected.push(toContextMessage(row));
    usedCharacters += row.text.length;
  }
  return selected.reverse();
}

function toContextMessage(row: StoredMessage): ConversationMessage {
  return {
    externalMessageId: row.externalMessageId,
    text: row.text,
    imageUrl: row.imageUrl,
    senderExternalId: row.senderExternalId,
    senderDisplayName: row.senderDisplayName,
    senderRole: row.senderRole,
    sentAt: row.sentAt,
  };
}

function normalizeParticipants(
  current: ChannelMessage,
  quoted: ConversationMessage | undefined,
  recent: ConversationMessage[],
): ConversationParticipant[] {
  const byId = new Map<string, ConversationParticipant>();
  for (const row of [quoted, ...recent, current]) {
    if (!row?.senderExternalId) continue;
    byId.set(row.senderExternalId, {
      externalId: row.senderExternalId,
      ...(row.senderDisplayName ? { displayName: row.senderDisplayName } : {}),
    });
  }
  return [...byId.values()].sort((left, right) => left.externalId.localeCompare(right.externalId));
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}
