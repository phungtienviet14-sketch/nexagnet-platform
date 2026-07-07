/**
 * Checkpoint dau tien cua PoC: xac thuc token + xem danh tinh bot (getMe).
 * Chay ~5 giay, khong can nhom test. Neu buoc nay khong qua thi khong can lam tiep.
 *
 * Cach dung:  pnpm poc:doctor   (tu goc repo, sau khi dien ZALO_BOT_TOKEN vao .env)
 */
import { requireBotToken } from './config.js';
import { callBotApi } from './zalo-api.js';

interface BotIdentity {
  id?: string;
  account_name?: string;
  display_name?: string;
  is_bot?: boolean;
}

const token = requireBotToken();
console.log('Kiem tra token voi getMe...');

const response = await callBotApi<BotIdentity>(token, 'getMe');

if (!response.ok) {
  console.error(`❌ Token KHONG hop le (${response.error_code}): ${response.description}`);
  console.error('   Kiem tra lai token trong .env (tao lai bot qua OA "Zalo Bot Manager" neu can).');
  process.exit(1);
}

const bot = response.result ?? {};
console.log('✅ Token hop le. Bot san sang.');
console.log(`   id           : ${bot.id ?? '(khong ro)'}`);
console.log(`   ten hien thi : ${bot.display_name ?? bot.account_name ?? '(khong ro)'}`);
console.log('\nBuoc tiep theo: them bot vao 1 nhom Zalo test roi chay `pnpm poc:updates`.');
console.log('Kich ban day du: tools/poc-zalo-bot/README.md');
