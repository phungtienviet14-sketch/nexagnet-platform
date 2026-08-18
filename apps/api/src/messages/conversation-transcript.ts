import type { ConversationContext, ConversationMessage, SenderRole } from '@netviet/shared';

/**
 * Dinh dang lich su hoi thoai cho LLM doc — NOI DUY NHAT lam viec nay (truoc Pha 1 co hai ban
 * sao lech nhau o parser-prompt.ts va advice-composer.ts).
 *
 * Hai thay doi so voi ban cu, deu la ly do LLM tra loi kem tu nhien:
 *  1. CO NHAN VAI. Ban cu gan cung 'Khach' cho moi dong khong co displayName, nen LLM khong
 *     phan biet duoc cau nao cua chinh no -> lap lai chinh minh.
 *  2. THOI GIAN TUONG DOI thay vi ISO timestamp. "5 phut truoc" vua re token hon vua la thu
 *     LLM thuc su suy luan duoc; "2026-08-18T10:00:00.000Z" thi khong.
 */

const ROLE_LABELS: Readonly<Record<SenderRole, string>> = {
  customer: 'KHACH',
  bot: 'BOT',
  sale: 'SALE',
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Anh khong chu thich van phai hien dien trong mach — bo di thi LLM tuong khach im lang. */
const IMAGE_PLACEHOLDER = '(gui mot anh)';

/**
 * "vua xong" | "5 phut truoc" | "3 gio truoc" | "2 ngay truoc".
 * Moc tuong lai (lech dong ho giua Zalo va may chu) tra "vua xong" chu khong ra so am.
 */
export function formatRelativeTime(sentAt: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - sentAt.getTime());
  if (elapsed >= DAY_MS) return `${Math.floor(elapsed / DAY_MS)} ngay truoc`;
  if (elapsed >= HOUR_MS) return `${Math.floor(elapsed / HOUR_MS)} gio truoc`;
  const minutes = Math.floor(elapsed / MINUTE_MS);
  return minutes >= 1 ? `${minutes} phut truoc` : 'vua xong';
}

/** Mot dong transcript: `[VAI Ten] (thoi gian): noi dung`. */
export function formatTranscriptLine(message: ConversationMessage, now: Date): string {
  const label = ROLE_LABELS[message.senderRole];
  // Chi tin cua khach moi can danh tinh: nhom co nhieu dai ly, LLM phai biet ai dang noi.
  // Tin cua bot/sale deu la "phia minh" nen ten hien thi khong them thong tin gi.
  const who =
    message.senderRole === 'customer'
      ? [label, message.senderDisplayName ?? message.senderExternalId].filter(Boolean).join(' ')
      : label;
  const body = message.text.trim() || (message.imageUrl ? IMAGE_PLACEHOLDER : '');
  return `[${who}] (${formatRelativeTime(message.sentAt, now)}): ${body}`;
}

/** Toan bo cua so lich su, cu nhat truoc — dung thu tu nguoi doc mong doi. */
export function formatTranscript(context: ConversationContext, now: Date): string[] {
  return context.recentMessages.map((message) => formatTranscriptLine(message, now));
}
