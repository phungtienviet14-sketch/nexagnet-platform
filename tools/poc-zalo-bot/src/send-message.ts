/**
 * Gui tin nhan test tu bot vao mot cuoc tro chuyen (1-1 hoac nhom).
 *
 * Cach dung: pnpm poc:send <chat_id> <noi dung...>
 * chat_id lay tu output cua get-updates (truong chat.id).
 */
import { requireBotToken } from './config.js';
import { callBotApi } from './zalo-api.js';

const [chatId, ...textParts] = process.argv.slice(2);

if (!chatId || textParts.length === 0) {
  console.error('Cach dung: pnpm poc:send <chat_id> <noi dung tin nhan>');
  process.exit(1);
}

const token = requireBotToken();
// Gan nhan tin tu dong theo dieu khoan Zalo Bot Platform (muc 6.3 bao cao Zalo).
const text = `${textParts.join(' ')}\n— Tin tu dong tu Bot (PoC U Ultty)`;

const response = await callBotApi(token, 'sendMessage', { chat_id: chatId, text });
console.log(JSON.stringify(response, null, 2));

if (!response.ok) {
  console.error('Gui that bai - ghi lai error_code/description vao docs/poc-zalo-bot.md');
  process.exit(1);
}
