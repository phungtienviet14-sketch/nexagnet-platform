import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(apiDir, '../../packages/tenant/src/__tests__/fixtures/transport-toll');

/**
 * MOT KHACH BAT `transport-toll` PHAI KHOI DONG DUOC.
 *
 * ============================================================================================
 * BAI NAY TON TAI VI MOT LOI DA TUNG LOT QUA MOI CONG KHAC VA LAM CHET MOT LAN DEPLOY
 * ============================================================================================
 *
 * `TollController` tiem `TollService` va `TollAccountService` — hai provider NOI BO cua
 * `TransportTollModule`. Controller do lai duoc dang ky o GOC (`app-composition.ts`), nen no chi
 * thay phan EXPORT cua module. Neu mot ngay ai do bo mot ten khoi `exports`, ket qua se la:
 *
 *   Nest can't resolve dependencies of the TollController (..., ?).
 *
 * Va khong cong nao truoc do bat duoc: `tsc` xanh, bai don vi xanh (chung TU TAY dung service),
 * bai composition xanh (no chi doi chieu DANH SACH ten controller). Chi mot lan boot THAT moi
 * chung minh Nest RESOLVE duoc — dung bai hoc cua `app.module.transport-proof.boot.spec.ts`.
 *
 * ============================================================================================
 * VA NO CON CHUNG MINH MOT DIEU THU HAI: `BLOCKED_SAMPLE_REQUIRED` LA THAT
 * ============================================================================================
 *
 * Goi khach fixture CO Y khong khai `transportToll.providers`. Nen mot tien trinh that phai bao
 * ca hai nha cung cap deu bi khoa, va duong `API` deu `NOT_PUBLICLY_PROVEN`. Do la trang thai
 * TRUNG THUC cua mot he thong chua nhin thay tep that nao — va no duoc DO o day, khong phai duoc
 * hua trong tai lieu.
 */
describe('transport-toll process boot contract', () => {
  it(
    'boot Nest that, resolve duoc controller va CHAY duoc mot lan nap tay',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { TollController } = await import('./src/transport/toll/toll.controller.ts');
      const { TollService } = await import('./src/transport/toll/toll.service.ts');
      const { TollAccountService } = await import('./src/transport/toll/toll-account.service.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { CostingService } = await import('./src/transport/costing/costing.service.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const toll = context.get(TollService, { strict: false });
      const accounts = context.get(TollAccountService, { strict: false });
      const fleet = context.get(FleetService, { strict: false });

      const blocked = Object.fromEntries(toll.providerReadiness().map((r) => [r.provider, r.blockedReason]));
      const apiStatus = Object.fromEntries(toll.apiDiagnostics().map((d) => [d.provider, d.status]));

      let apiReason = 'KHONG BI CHAN';
      try {
        await toll.previewImport({
          provider: 'VETC', sourceKind: 'API', sourceLabel: 'boot', periodStart: null, periodEnd: null,
        });
      } catch (error) { apiReason = error.reason ?? error.name; }

      let statementReason = 'KHONG BI CHAN';
      try {
        await toll.previewImport({
          provider: 'EPASS', sourceKind: 'STATEMENT_FILE', sourceLabel: 'boot.csv',
          periodStart: null, periodEnd: null, format: 'CSV',
          contentBase64: Buffer.from(['a,b', '1,2'].join(String.fromCharCode(10))).toString('base64'),
        });
      } catch (error) { statementReason = error.reason ?? error.name; }

      const vehicle = await fleet.registerVehicle({ registrationPlate: '15C-556.33', vehicleClass: 'TRUCK' }, 'boot');
      const account = await accounts.createAccount({ provider: 'VETC', accountNo: 'TK-BOOT-1', holderName: 'Cong ty B' }, 'boot');
      await accounts.openLink({
        accountId: account.id, vehicleId: vehicle.id, providerVehicleRef: null,
        effectiveFrom: '2026-01-01', effectiveTo: null,
      }, 'boot');

      const rows = [
        { accountNo: 'TK-BOOT-1', kind: 'TOLL_PASS', vehiclePlate: '15C-556.33',
          passedAt: '31/08/2026 23:40', businessDate: null, amount: '-52.000',
          station: 'Tram Phap Van', providerRef: null },
        { accountNo: 'TK-BOOT-1', kind: 'TOP_UP', vehiclePlate: null,
          passedAt: '01/08/2026 09:00', businessDate: null, amount: '5.000.000',
          station: null, providerRef: null },
      ];
      const command = {
        provider: 'VETC', sourceKind: 'MANUAL', sourceLabel: 'boot nhap tay',
        periodStart: null, periodEnd: null, rows,
      };
      const imported = await toll.commitImport(command, 'boot');
      const replay = await toll.commitImport(command, 'boot');

      const proof = {
        controller: has(TollController),
        service: has(TollService),
        accountService: has(TollAccountService),
        costing: has(CostingService),
        blocked,
        apiStatus,
        apiReason,
        statementReason,
        acceptedCount: imported.import.acceptedCount,
        matchStates: imported.candidates.map((c) => c.matchState),
        businessDates: imported.candidates.map((c) => c.businessDate),
        replayed: replay.replayed,
        sameImport: replay.import.id === imported.import.id,
      };
      await context.close();
      process.stdout.write('<<TRANSPORT_TOLL_BOOT_PROOF>>' + JSON.stringify(proof));
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
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<TRANSPORT_TOLL_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        // Dong nay la ca ly do bai test ton tai.
        controller: true,
        service: true,
        accountService: true,
        // ETC la CONG TY TRA: no khong keo theo so quy lai xe.
        costing: false,
        blocked: {
          VETC: 'BLOCKED_SAMPLE_REQUIRED',
          EPASS: 'BLOCKED_SAMPLE_REQUIRED',
          OTHER: 'BLOCKED_SAMPLE_REQUIRED',
        },
        apiStatus: {
          VETC: 'NOT_PUBLICLY_PROVEN',
          EPASS: 'NOT_PUBLICLY_PROVEN',
          OTHER: 'NOT_PUBLICLY_PROVEN',
        },
        apiReason: 'TOLL_API_NOT_PUBLICLY_PROVEN',
        statementReason: 'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED',
        acceptedCount: 2,
        matchStates: ['MATCHED', 'MATCHED'],
        // `INV-25` — 23:40 ngay 31/8 gio Viet Nam VAN la ngay nghiep vu 31/8.
        businessDates: ['2026-08-31', '2026-08-01'],
        replayed: true,
        sameImport: true,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
