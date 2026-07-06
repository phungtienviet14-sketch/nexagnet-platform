/**
 * PoC cau hoi Beta - chay long polling va thong ke moi update nhan duoc.
 *
 * Cach dung:  pnpm poc:updates   (tu goc repo)
 * Dung bang Ctrl+C -> in bang tong ket de dien vao docs/poc-zalo-bot.md
 *
 * LUU Y: getUpdates khong hoat dong neu bot dang gan webhook.
 * Chay `pnpm --filter @ultty/poc-zalo-bot webhook delete` truoc neu can.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireBotToken } from './config.js';
import { callBotApi, normalizeUpdates, type BotUpdate } from './zalo-api.js';

const token = requireBotToken();

const logDir = resolve(process.cwd(), 'logs');
mkdirSync(logDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const logFile = resolve(logDir, `updates-${stamp}.jsonl`);

const seenMessageIds = new Set<string>();
const stats = {
  totalUpdates: 0,
  duplicates: 0,
  byChatType: new Map<string, number>(),
  byEventName: new Map<string, number>(),
  groupChats: new Map<string, number>(),
  errors: 0,
};

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function describeUpdate(update: BotUpdate): void {
  const message = update.message ?? {};
  const chatType = message.chat?.chat_type ?? 'UNKNOWN';
  const chatId = message.chat?.id ?? '?';
  const sender = message.from?.display_name ?? message.from?.id ?? '?';
  const preview = (message.text ?? `[${update.event_name}]`).slice(0, 80);

  stats.totalUpdates += 1;
  bump(stats.byChatType, chatType);
  bump(stats.byEventName, update.event_name ?? 'unknown');
  if (chatType.toUpperCase() === 'GROUP') bump(stats.groupChats, chatId);

  console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${chatType} ${chatId} | ${sender}: ${preview}`);
}

function printSummary(): void {
  console.log('\n================ TONG KET PoC ================');
  console.log(`Tong update nhan duoc : ${stats.totalUpdates} (trung lap: ${stats.duplicates})`);
  console.log(`Theo chat_type        : ${JSON.stringify(Object.fromEntries(stats.byChatType))}`);
  console.log(`Theo event_name       : ${JSON.stringify(Object.fromEntries(stats.byEventName))}`);
  console.log(`So nhom phan biet     : ${stats.groupChats.size}`);
  for (const [groupId, count] of stats.groupChats) {
    console.log(`  - nhom ${groupId}: ${count} tin`);
  }
  console.log(`Loi API               : ${stats.errors}`);
  console.log(`Log day du            : ${logFile}`);
  console.log('Dien ket qua vao docs/poc-zalo-bot.md (3 cau hoi Beta).');
  console.log('===============================================');
}

process.on('SIGINT', () => {
  printSummary();
  process.exit(0);
});

console.log('Bat dau long polling getUpdates... (Ctrl+C de dung va xem tong ket)');
console.log('Kich ban test: xem tools/poc-zalo-bot/README.md');

let consecutiveErrors = 0;
for (;;) {
  try {
    const response = await callBotApi(token, 'getUpdates', { timeout: 25 });
    if (!response.ok) {
      stats.errors += 1;
      consecutiveErrors += 1;
      console.error(`Loi API (${response.error_code}): ${response.description}`);
      if (consecutiveErrors >= 5) {
        console.error('Loi lien tiep 5 lan - dung PoC. Kiem tra token / webhook dang gan.');
        printSummary();
        process.exit(1);
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 3_000));
      continue;
    }

    consecutiveErrors = 0;
    for (const update of normalizeUpdates(response.result)) {
      const messageId = update.message?.message_id;
      if (messageId && seenMessageIds.has(messageId)) {
        stats.duplicates += 1;
        continue;
      }
      if (messageId) seenMessageIds.add(messageId);
      appendFileSync(logFile, `${JSON.stringify({ receivedAt: Date.now(), update })}\n`);
      describeUpdate(update);
    }
  } catch (error) {
    stats.errors += 1;
    consecutiveErrors += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Loi mang/timeout: ${message} - thu lai sau 3s`);
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 3_000));
  }
}
