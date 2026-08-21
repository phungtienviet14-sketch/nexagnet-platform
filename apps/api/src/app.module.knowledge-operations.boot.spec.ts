import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/knowledge-operations',
);

// Su co 21/08/2026: deploy khach WATA (`knowledge` + `operations`, KHONG co `messaging`) dung
// stack len khoe manh roi container api chet ngay luc boot:
//   Nest can't resolve dependencies of the SettingsQueryService (?, BotIdentityService, ...)
//   Please make sure that the argument ZaloUserClient at index [0] is available in the AppModule.
// `SettingsQueryService` thuoc `operations` nhung lai doi hai provider cua `messaging`. Spec
// `knowledge-only` khong bat duoc vi no khong bat `operations`; chinh TO HOP nay la cho trong.
describe('knowledge + operations process boot contract', () => {
  it('boot Nest that voi `operations` ma khong co kenh messaging', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { KnowledgeService } = await import('./src/knowledge/knowledge.service.ts');
      const { SettingsQueryService } = await import('./src/settings/settings-query.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
      const settings = context.get(SettingsQueryService, { strict: false });
      // Khong chi resolve duoc: trang /settings cua khach nay phai TRA LOI that, khong no ra
      // NullPointer o nhanh khong co kenh.
      const summary = await settings.summary();
      const proof = {
        knowledge: has(KnowledgeService),
        settings: has(SettingsQueryService),
        zalo: has(ZaloUserClient),
        orders: has(OrdersService),
        zcaState: summary.zcaState,
        groups: summary.groups.length,
      };
      await context.close();
      process.stdout.write(JSON.stringify(proof));
    `;
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    // `operations` bat RuntimeSettingsService, va no doi khoa parser — day la doi hoi that
    // cua nang luc do, khong phai cai ta dang kiem o spec nay. Cap mot gia tri gia: hop dong
    // nay chi kiem BOOT, khong goi API nao ca.
    env.DEEPSEEK_API_KEY = 'boot-contract-placeholder';
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
      settings: true,
      zalo: false,
      orders: false,
      zcaState: 'unavailable',
      groups: 0,
    });
  }, 70_000);
});
