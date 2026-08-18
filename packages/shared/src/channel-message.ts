import { z } from 'zod';

/**
 * Dinh dang chung cho MOI tin nhan di vao he thong, bat ke kenh nao
 * (tang 1-2 trong thiet ke hop nhat). Adapter cua tung kenh co trach nhiem
 * chuan hoa ve schema nay truoc khi day vao pipeline.
 */
export const PLATFORMS = ['zalo'] as const;
// Nguon tin: dan tay (copilot) | webhook/poll Bot Platform | listener zca-js (userbot ca nhan).
// `system_outbound` = tin CHINH HE THONG gui ra nhom. Truoc Pha 1 (18/08/2026) tin outbound khong
// bao gio duoc luu, nen bot khong doc duoc cau tra loi cua chinh minh va lap lai chinh no.
export const MESSAGE_SOURCES = [
  'copilot_paste',
  'bot_webhook',
  'zca_listener',
  'system_outbound',
] as const;
export const CHAT_TYPES = ['private', 'group'] as const;

/** Ai noi cau nay. Quyet dinh nhan hien thi cho LLM trong lich su hoi thoai. */
export const SENDER_ROLES = ['customer', 'bot', 'sale'] as const;
export type SenderRole = (typeof SENDER_ROLES)[number];

/** Huong tin so voi he thong. Suy ra duoc tu senderRole nhung luu rieng de query truc tiep. */
export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/**
 * Du kien de REPLY DUNG TIN tren Zalo. Tam truong nay chinh la `SendMessageQuote` cua zca-js
 * 2.1.2 — deu la truong cua tin den, nen chi can giu lai luc nhan la gui trich dan duoc.
 *
 * Kieu hoa thay vi de `unknown`: `PLATFORMS` chi co 'zalo', nen dung mot kieu chung chung cho
 * cac nen tang chua ton tai la truu tuong hoa som (YAGNI). Doi khi that su co nen tang thu hai.
 */
export const zaloQuoteTargetSchema = z.object({
  msgId: z.string().min(1),
  cliMsgId: z.string(),
  msgType: z.string(),
  uidFrom: z.string(),
  ts: z.string(),
  ttl: z.number(),
  /** string voi tin chu, object voi anh/attachment — zca-js tra lai y nguyen. */
  content: z.unknown(),
  propertyExt: z.unknown().optional(),
});
export type ZaloQuoteTarget = z.infer<typeof zaloQuoteTargetSchema>;

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
    /**
     * Du kien de sau nay TRICH DAN CHINH tin nay khi tra loi. Di theo `raw` xuong DB nen khong
     * can cot rieng. Vang mat khi kenh khong cap du truong (Bot Platform, copilot, mock).
     */
    quoteTarget: zaloQuoteTargetSchema.optional(),
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
  /** BAT BUOC: khong co nhan vai thi LLM khong phan biet duoc cau nao cua bot, cau nao cua khach. */
  senderRole: SenderRole;
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
