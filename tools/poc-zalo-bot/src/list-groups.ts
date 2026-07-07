/**
 * In ra chat_id cua cac NHOM ma bot nhan duoc tin (co @tag), roi THOAT.
 * Dung de dien vao apps/api/src/knowledge/seed.ts (mang `groups`).
 *
 * Cach dung:
 *   1) Trong tung nhom can lay id, gui 1 tin CO @tag bot
 *      (mention-gating: bot chi thay tin duoc tag).
 *   2) pnpm poc:groups
 *
 * LUU Y: neu API dang chay o BOT_MODE=on thi no cung dang doc getUpdates —
 * tat API truoc khi chay lenh nay (hoac doc chat_id tu feed app: GET /messages)
 * de tranh 2 ben tranh nhau tin.
 */
import { requireBotToken } from './config.js';
import { callBotApi, normalizeUpdates, type BotUpdate } from './zalo-api.js';

const token = requireBotToken();
const MAX_MS = 40_000; // tong thoi gian cho toi da truoc khi in ket qua va thoat
const started = Date.now();

interface GroupInfo {
  chatId: string;
  lastSender: string;
  lastText: string;
  count: number;
}

const groups = new Map<string, GroupInfo>();
const seen = new Set<string>();

function record(update: BotUpdate): void {
  const m = update.message;
  const chatType = (m?.chat?.chat_type ?? '').toUpperCase();
  const chatId = m?.chat?.id;
  if (!chatId || chatType !== 'GROUP') return;
  const rawText = String(m?.text ?? m?.caption ?? `[${update.event_name ?? 'event'}]`);
  const prev = groups.get(chatId);
  groups.set(chatId, {
    chatId,
    lastSender: m?.from?.display_name ?? m?.from?.id ?? '?',
    lastText: rawText.slice(0, 60),
    count: (prev?.count ?? 0) + 1,
  });
}

console.log('Dang cho tin co @tag bot trong cac nhom... (toi da 40s)');
console.log('Neu chua thay gi: tag bot trong nhom, vd "@Bot ultty AI orders test".\n');

while (Date.now() - started < MAX_MS) {
  const res = await callBotApi(token, 'getUpdates', { timeout: 15 }, 20_000);
  if (!res.ok) {
    // 408 = het cua so long-poll ma khong co tin (idle binh thuong).
    if (res.error_code === 408) {
      if (groups.size > 0) break; // da co nhom + het tin cho -> du de in
      continue;
    }
    console.error(`Loi getUpdates (${res.error_code}): ${res.description}`);
    await new Promise((r) => setTimeout(r, 2_000));
    continue;
  }
  for (const update of normalizeUpdates(res.result)) {
    const id = update.message?.message_id;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    record(update);
  }
}

if (groups.size === 0) {
  console.log('Chua nhan duoc tin nhom nao.');
  console.log('Kiem tra: (1) da @tag bot chua? (2) API BOT_MODE=on co dang chay tranh chap getUpdates?');
  process.exit(0);
}

console.log('=== CHAT_ID CAC NHOM (dien vao apps/api/src/knowledge/seed.ts) ===');
for (const g of groups.values()) {
  console.log(`chatId: ${g.chatId}`);
  console.log(`  tin gan nhat: ${g.lastSender}: ${g.lastText}  (x${g.count})`);
}
console.log('==================================================================');
process.exit(0);
