import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-site-intake',
);

/**
 * MOT KHACH BAT `transport-site-intake` PHAI KHOI DONG DUOC.
 *
 * Cung ly do voi `app.module.transport-proof.boot.spec.ts`, va do la mot ly do da ton mot lan
 * deploy: `DriverSiteIntakeController` duoc dang ky o GOC (`app-composition.ts`), nen no CHI thay
 * phan EXPORT cua `TransportSiteIntakeModule`. Mot ngay nao do ai do tiem
 * `TRANSPORT_SITE_INTAKE_POLICY` hay mot cong facts thang vao controller thi `tsc` van xanh, bo
 * test don vi van xanh (chung tu tay dung controller), bai composition van xanh (no chi doi chieu
 * DANH SACH ten) — va tien trinh chet luc khoi dong tren ban dang chay.
 *
 * Mot danh sach ten khong chung minh Nest RESOLVE duoc. Chi mot lan boot that moi chung minh.
 *
 * Bai nay di XA HON mot phep resolve: no chay ca duong DE NGHI trong tien trinh that, tren mot
 * hang rao vua khai qua chinh `GeofenceService` cua Lane B. Nho vay no khoa luon dieu quan trong
 * nhat cua lane — *"khong vong chay nao ra doi chi vi mot de nghi"* — o muc tien trinh, chu khong
 * chi o muc ham.
 */
describe('transport-site-intake process boot contract', () => {
  it(
    'boot Nest that, resolve duoc be mat lai xe, va mot de nghi KHONG tao vong chay nao',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { DriverSiteIntakeController } = await import('./src/transport/site-intake/driver-site-intake.controller.ts');
      const { CounterpartySitesController } = await import('./src/transport/counterparty/counterparty-sites.controller.ts');
      const { SiteIntakeService } = await import('./src/transport/site-intake/site-intake.service.ts');
      const { CounterpartySiteService } = await import('./src/transport/counterparty/site.service.ts');
      const { CounterpartyService } = await import('./src/transport/counterparty/counterparty.service.ts');
      const { GeofenceService } = await import('./src/transport/proof/geofence.service.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { MovementRepository } = await import('./src/transport/movement/movement.repository.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const counterparties = context.get(CounterpartyService, { strict: false });
      const sites = context.get(CounterpartySiteService, { strict: false });
      const geofences = context.get(GeofenceService, { strict: false });
      const fleet = context.get(FleetService, { strict: false });
      const intake = context.get(SiteIntakeService, { strict: false });
      const movement = context.get(MovementRepository, { strict: false });

      const party = await counterparties.create({ name: 'Cong ty Boot' }, 'boot');
      const site = await sites.create(party.id, { name: 'Kho Boot Hai Phong' }, 'boot');
      await geofences.register({
        label: 'Kho Boot Hai Phong', subjectKind: 'COUNTERPARTY_SITE', subjectId: site.id,
        latitude: 20.8449, longitude: 106.6881, radiusMetres: 300, note: null, recordedBy: 'boot',
      });

      const driver = await fleet.registerDriver({
        fullName: 'Lai xe Boot', phone: '0900000000', licenceClass: 'FC',
        licenceExpiry: '2030-01-01', authUserId: 'boot-driver',
      }, 'boot');
      const vehicle = await fleet.registerVehicle({ registrationPlate: '15C-99999', vehicleClass: 'Dau keo' }, 'boot');
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, 'boot');

      const proposal = await intake.propose({
        authUserId: 'boot-driver', latitude: 20.8449, longitude: 106.6881, accuracyMetres: 10,
      });

      // MOT ma quyen chua khai o hang so hanh dong se lam guard nem luc chay, khong luc bien dich.
      let confirmedRunCode = null;
      const created = await intake.confirm({
        authUserId: 'boot-driver', siteId: site.id, clientEventId: 'boot-cham-mot',
        latitude: 20.8449, longitude: 106.6881, accuracyMetres: 10,
      });
      confirmedRunCode = created.runCode;

      const replay = await intake.confirm({
        authUserId: 'boot-driver', siteId: site.id, clientEventId: 'boot-cham-mot',
        latitude: 20.8449, longitude: 106.6881, accuracyMetres: 10,
      });

      const proof = {
        driverIntake: has(DriverSiteIntakeController),
        counterpartySites: has(CounterpartySitesController),
        proposalOutcome: proposal.outcome,
        proposalSite: proposal.candidates[0]?.siteName ?? null,
        proposalCounterparty: proposal.candidates[0]?.counterpartyName ?? null,
        // DE NGHI KHONG TAO GI. Doc SAU khi de nghi va TRUOC khi xac nhan.
        runsAfterProposal: proposal.openRuns.length,
        confirmedRunPrefix: confirmedRunCode?.slice(0, 5) ?? null,
        destinationPending: created.destinationPending,
        locationTrust: created.locationTrust,
        replayed: replay.replayed,
        replaySameRun: replay.runId === created.runId,
        runCount: (await movement.listRuns()).length,
      };
      await context.close();
      process.stdout.write('<<TRANSPORT_SITE_INTAKE_BOOT_PROOF>>' + JSON.stringify(proof));
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
      const proof = child.stdout.split('<<TRANSPORT_SITE_INTAKE_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        driverIntake: true,
        counterpartySites: true,
        proposalOutcome: 'UNIQUE',
        proposalSite: 'Kho Boot Hai Phong',
        proposalCounterparty: 'Cong ty Boot',
        // Dong nay la bat bien trung tam cua ca lane, do o muc TIEN TRINH.
        runsAfterProposal: 0,
        confirmedRunPrefix: 'RUN-A',
        destinationPending: true,
        locationTrust: 'DRIVER_REPORTED',
        replayed: true,
        replaySameRun: true,
        runCount: 1,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
