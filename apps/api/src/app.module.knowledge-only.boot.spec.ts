import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/knowledge-only',
);

describe('knowledge-only process boot contract', () => {
  it('boot Nest that ma khong can Zalo, parser, dealer, gia hay order graph', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { KnowledgeService } = await import('./src/knowledge/knowledge.service.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');
      const { CampaignService } = await import('./src/campaigns/campaign.service.ts');
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
      const proof = {
        knowledge: has(KnowledgeService),
        orders: has(OrdersService),
        zalo: has(ZaloUserClient),
        campaign: has(CampaignService),
      };
      await context.close();
      process.stdout.write(JSON.stringify(proof));
    `;
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.DEEPSEEK_API_KEY;
    delete env.FLOWISE_API_KEY;
    delete env.FLOWISE_BASE_URL;
    delete env.FLOWISE_FLOW_ID;
    delete env.ZALO_BOT_TOKEN;
    delete env.TENANT;
    env.TENANT_DIR = fixtureDir;
    env.PERSISTENCE = 'memory';
    env.PARSER_MODE = 'deepseek';
    env.CHANNEL_MODE = 'zca';
    env.NODE_ENV = 'test';

    const child = spawnSync(
      process.execPath,
      ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
      { cwd: apiDir, env, encoding: 'utf8', timeout: 60_000 },
    );

    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      knowledge: true,
      orders: false,
      zalo: false,
      campaign: false,
    });
  }, 70_000);
});
