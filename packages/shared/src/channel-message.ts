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

export const channelMessageSchema = z.object({
  /** ID tin nhan phia kenh — dung de idempotent, khong xu ly trung */
  externalMessageId: z.string().min(1),
  platform: z.enum(PLATFORMS),
  source: z.enum(MESSAGE_SOURCES),
  chatType: z.enum(CHAT_TYPES),
  /** ID nhom/hoi thoai phia kenh — map ve dai ly qua bang groups */
  externalChatId: z.string().min(1),
  senderExternalId: z.string().min(1).optional(),
  senderDisplayName: z.string().min(1).optional(),
  text: z.string().min(1).max(10_000),
  /** photo_url neu tin la anh (Zalo message.image.received) — Claude doc bang vision */
  imageUrl: z.string().url().optional(),
  sentAt: z.coerce.date(),
});

export type ChannelMessage = z.infer<typeof channelMessageSchema>;
