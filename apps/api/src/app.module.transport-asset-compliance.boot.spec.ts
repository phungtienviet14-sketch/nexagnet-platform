import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-asset-compliance',
);

/**
 * MOT KHACH VAN TAI CHI THEO DOI TAI SAN phai boot duoc — voi DUNG hai capability.
 *
 * `asset-compliance.composition.spec.ts` chi noi "artefact nao co trong danh sach". Bai nay noi
 * "Nest co RESOLVE duoc chung khong", va do la mot cau hoi khac han: mot token thieu provider
 * (`AssetComplianceCoreFacts`), mot factory nem luc khoi tao (`TRANSPORT_COMPLIANCE_POLICY`), hay
 * mot phu thuoc vong deu KHONG lo ra o tang danh sach.
 *
 * RIENG VOI T6 con mot cau hoi thu hai, va no la ly do chinh cua bai nay: `OperationalAlertsService`
 * duoc dang ky o TANG UNG DUNG va nhan hai nguon qua `@Optional()`. Voi goi khach nay ca hai deu
 * VANG MAT (khong bat costing, khong bat fuel). Neu wiring do sai — vi du mot trong hai adapter bi
 * dang ky nham duoi quyen so huu cua `transport-asset-compliance` — thi Nest se khong resolve duoc
 * va bai nay do. Danh sach provider thi khong bao gio phat hien duoc dieu do.
 */
describe('transport-asset-compliance process boot contract', () => {
  it('boot Nest that voi DUNG transport-core + transport-asset-compliance', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { AssetComplianceService } = await import('./src/transport/asset-compliance/asset-compliance.service.ts');
      const { AssetComplianceReadService } = await import('./src/transport/asset-compliance/asset-compliance-read.service.ts');
      const { OperationalAlertsService } = await import('./src/transport/asset-compliance/operational-alerts.service.ts');
      const { CostingService } = await import('./src/transport/costing/costing.service.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const fleet = context.get(FleetService, { strict: false });
      const assets = context.get(AssetComplianceService, { strict: false });
      const read = context.get(AssetComplianceReadService, { strict: false });
      const alerts = context.get(OperationalAlertsService, { strict: false });

      const vehicle = await fleet.registerVehicle({ registrationPlate: 'BOOT-T6-0001', vehicleClass: 'Xe tai' }, 'boot');

      // Mot lich bao duong da qua han theo km, va mot giay to da het han.
      await assets.schedulePlan({
        vehicleId: vehicle.id, name: 'Thay dau may', triggerKind: 'ODOMETER',
        intervalKm: 10000, intervalDays: null, baselineOdoKm: 0, baselineDate: '2026-01-01',
        createdBy: 'boot',
      });
      await assets.registerDocument({
        subjectKind: 'VEHICLE', subjectId: vehicle.id, documentType: 'VEHICLE_INSPECTION',
        validFrom: '2025-01-01', validTo: '2026-01-01', recordedBy: 'boot',
      });

      // Mot lenh sua dang mo phai keo trang thai hieu luc ve UNDER_MAINTENANCE.
      await assets.openWorkOrder({
        vehicleId: vehicle.id, planId: null, description: 'Sua phanh',
        openedDate: '2026-09-01', openedOdoKm: 0, openedBy: 'boot',
      });

      const now = new Date('2026-09-03T05:00:00.000Z');
      const fleetStatus = await read.effectiveFleetStatus();
      const feed = await alerts.feed(now);

      const proof = {
        assets: has(AssetComplianceService),
        alerts: has(OperationalAlertsService),
        costing: has(CostingService),
        orders: has(OrdersService),
        zalo: has(ZaloUserClient),
        effectiveStatus: fleetStatus[0].effectiveStatus,
        expiredDocuments: feed.alerts.filter((a) => a.kind === 'COMPLIANCE_DOCUMENT_EXPIRED').length,
        unavailableSources: [...feed.unavailableSources].sort(),
      };
      await context.close();
      process.stdout.write('<<TRANSPORT_ASSET_COMPLIANCE_BOOT_PROOF>>' + JSON.stringify(proof));
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
      { cwd: apiDir, env, encoding: 'utf8', timeout: 60_000 },
    );

    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    const proof = child.stdout.split('<<TRANSPORT_ASSET_COMPLIANCE_BOOT_PROOF>>')[1];
    expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
    expect(JSON.parse(proof ?? '{}')).toEqual({
      assets: true,
      alerts: true,
      // MOT PHU THUOC: khach nay khong bat costing, va khong phai bat.
      costing: false,
      // Khach van tai KHONG khai integration `parser` hay kenh Zalo nao.
      orders: false,
      zalo: false,
      // Lenh sua dang mo THANG chuyen trong phep hop thanh (T1 §18.2).
      effectiveStatus: 'UNDER_MAINTENANCE',
      expiredDocuments: 1,
      // Ca hai nguon TUY CHON deu vang mat, va bang canh bao NOI RA dieu do.
      unavailableSources: ['DRIVER_FUND', 'FUEL_CONSUMPTION'],
    });
  }, 70_000);
});
