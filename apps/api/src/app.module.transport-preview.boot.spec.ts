import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * GOI KHACH THAT, khong phai mot fixture.
 *
 * Moi boot spec khac tro vao mot fixture rieng trong `packages/tenant/src/__tests__/fixtures/`, va
 * do la dung cho cau hoi cua chung: *"mot khach chi bat DUNG capability nay co boot khong"*.
 *
 * Bai nay hoi mot cau khac, va no la cau ma CI da khong hoi bao gio: *"cai stack ma chung ta THUC
 * SU deploy co boot khong"*. Cau tra loi phai doc tu CHINH goi se duoc upload len VM — mot fixture
 * chep tay se troi khoi goi that dung vao ngay ai do them mot capability vao goi ma quen fixture.
 */
const previewTenantDir = resolve(apiDir, '../../tenants/transport-preview');

/**
 * STACK XEM TRUOC VAN TAI PHAI BOOT DUOC — luoi an toan cua CA doi hinh capability van tai.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI: MOT LAN HONG DA DI QUA MOI CONG ROI CHET O DEPLOY
 * ============================================================================================
 *
 * `#268` (Lane I) them `transport-acceptance`, trong do `AcceptanceCounterpartyFactsAdapter` tiem
 * `CounterpartyRepository`. Nhung `TransportModule` khong EXPORT token do, nen Nest khong giai
 * duoc phu thuoc va tien trinh api chet ngay khi khoi dong.
 *
 * Khong mot cong nao bat duoc:
 *
 *   · `tsc`                   — kieu dung het, DI khong phai chuyen cua trinh bien dich;
 *   · bo test don vi          — dung lop truc tiep, khong qua injector cua Nest;
 *   · `*.composition.spec.ts` — chi hoi "provider/controller co TRONG DANH SACH khong", khong hoi
 *                               "Nest co RESOLVE duoc chung khong";
 *   · cac boot spec dang co   — khong cai nao bat `transport-acceptance`.
 *
 * No lo ra o lan deploy dau tien SAU khi #268 vao `main`: `ROLLOUT` PASS (image len dung), roi
 * `HEALTH` FAIL vi container api crash-loop. Do la mot vong deploy 12 phut de biet mot dieu ma
 * mot lan `NestFactory.createApplicationContext()` biet trong 30 giay.
 *
 * ============================================================================================
 * BAI NAY CHAY MOT TIEN TRINH THAT, VA DO LA CA DIEM
 * ============================================================================================
 *
 * Ba loai loi chi lo ra o lan boot that: mot token thieu provider (dung cai vua ke tren), mot phu
 * thuoc vong, va mot module doi bien moi truong ma goi khach nay khong khai. Khong loai nao trong
 * ba nhin thay duoc tu `buildAppComposition()`.
 */
describe('transport-preview process boot contract', () => {
  it(
    'goi xem truoc van tai boot duoc voi TOAN BO doi hinh capability cua no',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { loadTenantConfig } = await import('@netviet/tenant');
      const { CommercialAcceptanceService } = await import('./src/transport/acceptance/acceptance.service.ts');
      const { PlanningService } = await import('./src/transport/planning/planning.service.ts');
      const { MovementService } = await import('./src/transport/movement/movement.service.ts');

      const capabilities = loadTenantConfig().capabilities;
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const proof = {
        capabilityCount: capabilities.length,
        // Ba dich vu nay la ba tang phu thuoc khac nhau cua cay van tai: mien loi (Lane A),
        // lop lap ke hoach doc mien loi (Lane L), va mot capability RIENG doc nguoc vao mien loi
        // qua mot cong (Lane I). Cai thu ba la cai da hong.
        movement: has(MovementService),
        planning: has(PlanningService),
        acceptance: has(CommercialAcceptanceService),
      };
      await context.close();
      process.stdout.write('<<PREVIEW_BOOT_PROOF>>' + JSON.stringify(proof));
    `;

      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = previewTenantDir;
      env.PERSISTENCE = 'memory';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<PREVIEW_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();

      const parsed = JSON.parse(proof ?? '{}');
      expect(parsed.movement).toBe(true);
      expect(parsed.planning).toBe(true);
      // Dong nay la ly do bai test ton tai. Xem khoi chu thich dau tep.
      expect(parsed.acceptance).toBe(true);
      // Goi that co 11 capability; con so chi de bai noi ra rang no dang boot MOT DOI HINH DAY DU,
      // khong phai mot goi rong tinh co xanh.
      expect(parsed.capabilityCount).toBeGreaterThanOrEqual(10);
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
