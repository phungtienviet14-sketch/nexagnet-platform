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

export const DEFAULT_CONTEXT_LIMITS: Readonly<ConversationContextLimits> = {
  maxMessages: 6,
  maxCharacters: 4_000,
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

  async build(current: ChannelMessage): Promise<ConversationContext> {
    const quotedMessage = await this.resolveQuote(current);
    const rows = await this.messages.findRecent(
      current.platform,
      current.externalChatId,
      current.sentAt,
      current.externalMessageId,
      this.limits.maxMessages + 1,
    );
    const recentMessages = boundedRecent(
      rows.filter((row) => row.externalMessageId !== quotedMessage?.externalMessageId),
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
    if (usedCharacters + row.text.length > limits.maxCharacters) continue;
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
