/**
 * Tien ich webhook cho PoC (che do production cua Bot Platform).
 *
 *   pnpm --filter @netviet/poc-zalo-bot webhook serve [port]   - chay server nhan webhook local
 *   pnpm --filter @netviet/poc-zalo-bot webhook set <url>      - dang ky webhook URL (https)
 *   pnpm --filter @netviet/poc-zalo-bot webhook info           - xem webhook dang gan
 *   pnpm --filter @netviet/poc-zalo-bot webhook delete         - go webhook (de dung lai getUpdates)
 *
 * De expose server local ra https tam thoi: dung cloudflared/ngrok roi lay URL do `set`.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { requireBotToken, webhookSecret } from './config.js';
import { callBotApi } from './zalo-api.js';

const [command, argument] = process.argv.slice(2);
const token = requireBotToken();

async function printApiResult(method: string, body: Record<string, unknown> = {}): Promise<void> {
  const response = await callBotApi(token, method, body);
  console.log(JSON.stringify(response, null, 2));
  if (!response.ok) process.exit(1);
}

switch (command) {
  case 'serve': {
    const port = Number(argument ?? 8787);
    const secret = webhookSecret();
    const logDir = resolve(process.cwd(), 'logs');
    mkdirSync(logDir, { recursive: true });
    const logFile = resolve(logDir, `webhook-${Date.now()}.jsonl`);

    const server = createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      const headerSecret = req.headers['x-bot-api-secret-token'];
      if (secret && headerSecret !== secret) {
        console.error('Sai X-Bot-Api-Secret-Token - tu choi request');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Unauthorized' }));
        return;
      }
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      req.on('end', () => {
        appendFileSync(logFile, `${JSON.stringify({ receivedAt: Date.now(), raw: body })}\n`);
        try {
          console.log(JSON.stringify(JSON.parse(body), null, 2));
        } catch {
          console.log(`(body khong phai JSON) ${body.slice(0, 500)}`);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Success' }));
      });
    });

    server.listen(port, () => {
      console.log(`Webhook server: http://localhost:${port} (log: ${logFile})`);
      console.log('Expose https bang cloudflared/ngrok roi chay: webhook set <url_https>');
    });
    break;
  }
  case 'set': {
    if (!argument) {
      console.error('Thieu URL. Cach dung: webhook set https://<domain>/webhooks');
      process.exit(1);
    }
    await printApiResult('setWebhook', {
      url: argument,
      secret_token: webhookSecret(),
    });
    break;
  }
  case 'info': {
    await printApiResult('getWebhookInfo');
    break;
  }
  case 'delete': {
    await printApiResult('deleteWebhook');
    break;
  }
  default: {
    console.error('Lenh khong hop le. Dung: serve [port] | set <url> | info | delete');
    process.exit(1);
  }
}
