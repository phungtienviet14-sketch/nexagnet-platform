import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/broadcast-only',
);

/**
 * KHACH CHI GUI TIN — `[knowledge, messaging, campaign]`, khong `turn-processing`.
 *
 * Chay trong TIEN TRINH RIENG co chu y: cache goi khach la module-level va bo test cua apps/api
 * chot `TENANT=ultty` o `vitest.setup.ts`. Doi goi khach ngay trong tien trinh nay se ro ri sang
 * moi tep khac chay song song. Mot tien trinh con la cach duy nhat hoi duoc cau "khach nay boot
 * len thi ra gi" ma khong lam hong cau tra loi cua khach kia.
 *
 * Truoc ban nay ca hai ham duoi deu NEM `Capability turn-processing khong duoc bat`: nhan tin tu
 * dong (nghia vu theo dieu khoan Zalo) va ten bot doc qua mot shape persona gop, ma shape do doi
 * mot capability khach nay khong bat va khong can.
 */
describe('persona cua messaging o khach khong doc tin', () => {
  it('gan duoc nhan tin tu dong va lay duoc ten bot ma KHONG can turn-processing', () => {
    const script = `
      const { autoLabel } = await import('./src/channels/auto-label.ts');
      const { resolveBotName } = await import('./src/channels/bot-name.ts');
      const { tenantHasCapability } = await import('@netviet/tenant');
      process.stdout.write(JSON.stringify({
        turnProcessing: tenantHasCapability('turn-processing'),
        salesOrder: tenantHasCapability('sales-order'),
        label: autoLabel(),
        botName: resolveBotName(),
      }));
    `;
    const env = { ...process.env };
    delete env.TENANT;
    delete env.BOT_NAME;
    env.TENANT_DIR = fixtureDir;
    env.PERSISTENCE = 'memory';
    env.CHANNEL_MODE = 'mock';
    env.NODE_ENV = 'test';

    const child = spawnSync(
      process.execPath,
      ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
      { cwd: apiDir, env, encoding: 'utf8', timeout: 60_000 },
    );

    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      turnProcessing: false,
      salesOrder: false,
      label: '\n— Tin tự động từ Bot Loa Phuong',
      botName: 'Bot Loa Phuong',
    });
  }, 70_000);
});
