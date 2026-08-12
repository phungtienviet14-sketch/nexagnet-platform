import { z } from 'zod';

/**
 * Dinh dang chung cho MOI tin nhan di vao he thong, bat ke kenh nao
 * (tang 1-2 trong thiet ke hop nhat). Adapter cua tung kenh co trach nhiem
 * chuan hoa ve schema nay truoc khi day vao pipeline.
 */
export const PLATFORMS = ['zalo'] as const;
// Nguon tin: dan tay (copilot) | webhook/poll Bot Platform | listener zca-js (userbot ca nhan).
export const MESSAGE_SOURCES = ['copilot_paste', 'bot_webhook', 'zca_listener'] as const;
export const CHAT_TYPES = ['private', 'group'] as const;

export const replyReferenceSchema = z
  .object({
    /** ID tin goc neu kenh cung cap; dung de resolve ban ghi ben vung trong cung hoi thoai. */
    externalMessageId: z.string().min(1).optional(),
    senderExternalId: z.string().min(1).optional(),
    senderDisplayName: z.string().min(1).optional(),
    /** Ban text inline cua quote. Chi la fallback khi khong resolve duoc ID trong DB. */
    text: z.string().max(10_000).optional(),
    imageUrl: z.string().url().optional(),
    sentAt: z.coerce.date().optional(),
  })
  .refine((reply) => Boolean(reply.externalMessageId || reply.text?.trim() || reply.imageUrl), {
    message: 'Reply phai co externalMessageId, text hoac imageUrl',
  });

export const channelMessageSchema = z
  .object({
    /** ID tin nhan phia kenh — dung de idempotent, khong xu ly trung */
    externalMessageId: z.string().min(1),
    platform: z.enum(PLATFORMS),
    source: z.enum(MESSAGE_SOURCES),
    chatType: z.enum(CHAT_TYPES),
    /** ID nhom/hoi thoai phia kenh — map ve dai ly qua bang groups */
    externalChatId: z.string().min(1),
    senderExternalId: z.string().min(1).optional(),
    senderDisplayName: z.string().min(1).optional(),
    /**
     * Noi dung chu. RONG la HOP LE khi tin co anh (anh gui tran, khong chu thich) —
     * truoc 11/08/2026 rang buoc `.min(1)` khien anh tran chua bao gio vao DB, ma link
     * Zalo bi xoa phia server sau <=35 ngay nen mat vinh vien.
     *
     * Van la `string` (KHONG optional) co chu y: moi call-site phia sau (parser, repository,
     * OrderView.rawText) doc thang `.text` — doi sang optional la vo kieu ca chuoi do.
     */
    text: z.string().max(10_000),
    /** photo_url neu tin la anh (Zalo message.image.received) — Claude doc bang vision */
    imageUrl: z.string().url().optional(),
    /** Tin duoc reply/quote, neu adapter kenh co cung cap. */
    replyTo: replyReferenceSchema.optional(),
    sentAt: z.coerce.date(),
  })
  // Tin phai mang it nhat MOT thu: chu hoac anh. Khong ca hai = tin he thong/rong -> khong luu.
  .refine((message) => message.text.trim() !== '' || Boolean(message.imageUrl), {
    message: 'Tin phai co van ban hoac anh',
    path: ['text'],
  });

export type ChannelMessage = z.infer<typeof channelMessageSchema>;
export type ReplyReference = z.infer<typeof replyReferenceSchema>;

export interface ConversationMessage {
  externalMessageId: string;
  text: string;
  imageUrl?: string;
  senderExternalId?: string;
  senderDisplayName?: string;
  sentAt: Date;
}

export interface ConversationParticipant {
  externalId: string;
  displayName?: string;
}

/** Context parser co gioi han; khong bao gom toan bo lich su hoi thoai. */
export interface ConversationContext {
  quotedMessage?: ConversationMessage;
  recentMessages: ConversationMessage[];
  participants: ConversationParticipant[];
}
