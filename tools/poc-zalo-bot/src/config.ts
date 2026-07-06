import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const ENV_CANDIDATES = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

for (const envPath of ENV_CANDIDATES) {
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

export const BOT_API_BASE = 'https://bot-api.zaloplatforms.com';

export function requireBotToken(): string {
  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) {
    console.error(
      [
        'Thieu ZALO_BOT_TOKEN.',
        'Cach lay: mo app Zalo -> tim OA "Zalo Bot Manager" -> Tao bot -> nhan token qua tin nhan.',
        'Sau do dien vao file .env o goc repo (xem .env.example).',
      ].join('\n'),
    );
    process.exit(1);
  }
  return token;
}

export function webhookSecret(): string | undefined {
  return process.env.ZALO_BOT_WEBHOOK_SECRET || undefined;
}
