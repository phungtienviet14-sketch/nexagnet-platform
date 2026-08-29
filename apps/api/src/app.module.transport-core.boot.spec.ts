import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(apiDir, '../../packages/tenant/src/__tests__/fixtures/transport-core');

/**
 * MOT KHACH VAN TAI THUAN phai boot duoc.
 *
 * Bai test nay chay mot TIEN TRINH THAT, khong dung `buildAppComposition()`: composition chi noi
 * "provider nao co trong danh sach", con boot noi "Nest co RESOLVE duoc chung khong". Ba loai loi
 * chi lo ra o lan boot that — mot token thieu provider, mot phu thuoc vong, va mot module doi bien
 * moi truong ma khach nay khong khai.
 *
 * Khang dinh PHU DINH quan trong khong kem: khach van tai KHONG duoc phai khai mot integration
 * `parser` (tuc khong phai chon nha cung cap LLM) hay mot kenh Zalo nao. Neu mot ngay
 * `transport-core` lang le keo theo duong xu ly luot, bai test nay do — chu khong phai khach phat
 * hien luc lap dat.
 */
describe('transport-core process boot contract', () => {
  it('boot Nest that chi voi transport-core: khong Zalo, khong parser, khong don hang', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { TripService } = await import('./src/transport/trips/trip.service.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');
      const { KnowledgeService } = await import('./src/knowledge/knowledge.service.ts');
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
      const fleet = context.get(FleetService, { strict: false });
      const trips = context.get(TripService, { strict: false });

      // Mot vong nghiep vu that, trong tien trinh that: dang ky xe + lai xe, len chuyen, phan cong,
      // lan banh. Neu bat ky manh nao cua mien khong duoc noi day du thi buoc nay nem.
      const vehicle = await fleet.registerVehicle({ registrationPlate: 'BOOT-0001', vehicleClass: 'Xe tai' }, 'boot');
      const driver = await fleet.registerDriver({ fullName: 'Boot Driver', phone: '0900000000', licenceClass: 'C', licenceExpiry: '2029-01-01' }, 'boot');
      const trip = await trips.planTrip({ code: 'BOOT-CH-1', kind: 'OWN_DIRECT', originLabel: 'A', destinationLabel: 'B', freightAmount: 1000000 }, 'boot');
      await trips.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, 'boot');
      const running = await trips.transition(trip.id, 'IN_TRANSIT', 'boot');

      const proof = {
        fleet: has(FleetService),
        trips: has(TripService),
        orders: has(OrdersService),
        zalo: has(ZaloUserClient),
        // Do duoc, KHONG phai mong muon — xem chu thich duoi phan khang dinh.
        knowledgeLeaksIntoEveryTenant: has(KnowledgeService),
        tripStatus: running.status,
        businessDateLength: trip.businessDate.length,
        currencyCode: trip.currencyCode,
      };
      await context.close();
      // DAU MOC: stdout cua tien trinh nay KHONG chi co ket qua — tang quan sat ghi mot dong log
      // JSON co cau truc cho moi buoc nghiep vu, va do la hanh vi DUNG. Doc "dong JSON dau tien"
      // se doc nham mot ban ghi telemetry.
      process.stdout.write('<<TRANSPORT_BOOT_PROOF>>' + JSON.stringify(proof));
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
    const proof = child.stdout.split('<<TRANSPORT_BOOT_PROOF>>')[1];
    expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
    expect(JSON.parse(proof ?? '{}')).toEqual({
      fleet: true,
      trips: true,
      orders: false,
      zalo: false,
      /**
       * GHIM MOT SU THAT DO DUOC, khong phai mot mong muon.
       *
       * `KnowledgeService` van resolve duoc o mot khach KHONG bat `knowledge`. Duong di do duoc:
       * `AuthModule` (owner `foundation`) import `OperationalSettingsModule` (owner `operations`),
       * va module do import `KnowledgeModule` — von la `@Global()`. Nen do thi module cua hai
       * capability duoc nap cho MOI khach, bat ke ho khai gi.
       *
       * Day la mot khoang cach cua NEN TANG, khong phai cua van tai, va sua no la mot thay doi
       * quyen so huu composition anh huong moi khach — nam ngoai T2. Ghim lai o day de: (a) su that
       * duoc ghi ra thay vi nam im, va (b) ngay ai do sua duoc no thi bai test nay DO, va nguoi sua
       * biet ngay minh vua dong dung cai khe ho da biet.
       *
       * He qua truc tiep len van tai: `TransportModule` PHAI tu cung cap `AuditLogService` cua
       * chinh no. Duong toan cuc kia hom nay co ho no, nhung do la mot tai nan — cai gi den bang
       * tai nan thi cung bien mat bang tai nan.
       */
      knowledgeLeaksIntoEveryTenant: true,
      tripStatus: 'IN_TRANSIT',
      businessDateLength: 10,
      currencyCode: 'VND',
    });
  }, 70_000);
});
