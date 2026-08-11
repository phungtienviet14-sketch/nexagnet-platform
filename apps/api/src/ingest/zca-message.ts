import { channelMessageSchema, type ChannelMessage } from '@netviet/shared';
import { ThreadType, type Message } from 'zca-js';
import { toHttpUrl } from './http-url.js';

/**
 * Chuyen 1 tin tu zca-js (userbot) -> ChannelMessage chuan; null neu bo qua.
 * Ham THUAN (khong I/O) de test de dang — song song updateToChannelMessage cua Bot Platform.
 *
 * Bo qua khi: tin do CHINH tai khoan gui (isSelf) va khong bat selfListen; thieu threadId;
 * khong co CA text lan anh (tin he thong — song song bot-poller). Anh khong chu thich thi
 * GIU, `text` la chuoi rong (Dot A' 11/08/2026).
 *
 * Luu y ky thuat:
 * - `data.ts` la chuoi epoch-ms ("1783404428055") -> phai Number() truoc khi new Date()
 *   (z.coerce.date() tren chuoi so se ra Invalid Date).
 * - `data.content` la string (text) HOAC object (anh: href=url, title/description=chu thich).
 */
export function zcaMessageToChannelMessage(
  message: Message,
  selfListen: boolean,
): ChannelMessage | null {
  if (message.isSelf && !selfListen) return null;

  const threadId = message.threadId;
  if (!threadId) return null;

  const { text, imageUrl } = extractContent(message.data.content);
  const trimmed = text?.trim() ?? '';
  // Chi bo khi KHONG co ca chu lan anh (tin he thong / noi dung rong). Anh gui tran van phai
  // vao DB: link Zalo bi xoa phia server sau <=35 ngay, khong luu hom nay la mat vinh vien.
  if (!trimmed && !imageUrl) return null;

  const data = message.data;
  const candidate = {
    externalMessageId: data.msgId || `${threadId}-${data.ts}`,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: message.type === ThreadType.Group ? 'group' : 'private',
    externalChatId: threadId,
    senderExternalId: emptyToUndefined(data.uidFrom),
    senderDisplayName: emptyToUndefined(data.dName),
    text: trimmed,
    imageUrl,
    sentAt: tsToDate(data.ts),
  };
  const parsed = channelMessageSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Tach text + imageUrl tu content (string = text; object = anh/attachment). */
function extractContent(content: unknown): { text?: string; imageUrl?: string } {
  if (typeof content === 'string') return { text: content };
  if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    // Chi giu href la URL hop le -> href rong/khong-URL bi bo qua CHU KHONG lam rot ca tin
    // (schema imageUrl = z.string().url(): '' se fail va lam mat luon caption).
    const imageUrl = toHttpUrl(c.href);
    const caption =
      (typeof c.title === 'string' && c.title) || (typeof c.description === 'string' && c.description) || undefined;
    return { text: caption || undefined, imageUrl };
  }
  return {};
}

/** `ts` la epoch-ms dang chuoi; ep sang so truoc khi tao Date. Fallback: bay gio. */
function tsToDate(ts: string | undefined): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n) : new Date();
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}
