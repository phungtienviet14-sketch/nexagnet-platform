import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(apiDir, '../../packages/tenant/src/__tests__/fixtures/transport-proof');

/**
 * MOT KHACH BAT `transport-proof` PHAI KHOI DONG DUOC.
 *
 * ============================================================================================
 * BAI NAY TON TAI VI MOT LOI DA LOT QUA MOI CONG KHAC VA LAM CHET MOT LAN DEPLOY
 * ============================================================================================
 *
 * `ProofReviewController` tiem `TRANSPORT_PROOF_POLICY` — mot provider NOI BO cua
 * `TransportProofModule`. Controller do lai duoc dang ky o GOC (`app-composition.ts`), nen no chi
 * thay phan EXPORT cua module. Ket qua:
 *
 *   Nest can't resolve dependencies of the ProofReviewController (..., ?).
 *
 * Va day la phan dang so: **khong mot cong nao truoc do bat duoc**. `tsc` xanh (kieu dung ca).
 * 126 bai don vi xanh (chung TU TAY dung controller, khong qua injector). Bai composition xanh (no
 * chi doi chieu DANH SACH ten controller). Ca chin cong CI xanh. Cai bat duoc no la phep kiem
 * suc khoe cua lan deploy — tuc sau khi ma da vao `main`.
 *
 * Mot danh sach ten khong chung minh Nest RESOLVE duoc. Chi mot lan boot that moi chung minh.
 */
describe('transport-proof process boot contract', () => {
  it('boot Nest that voi transport-core + transport-proof, va resolve duoc CA BON controller', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { DriverTrackingController } = await import('./src/transport/proof/driver-tracking.controller.ts');
      const { TrackingController } = await import('./src/transport/proof/tracking.controller.ts');
      const { DriverProofController } = await import('./src/transport/proof/driver-proof.controller.ts');
      const { ProofReviewController } = await import('./src/transport/proof/proof-review.controller.ts');
      const { GeofenceService } = await import('./src/transport/proof/geofence.service.ts');
      const { TrackingService } = await import('./src/transport/proof/tracking.service.ts');
      const { OperationalProofService } = await import('./src/transport/proof/operational-proof.service.ts');
      const { VehicleTelematicsPort } = await import('./src/transport/proof/telematics/vehicle-telematics.port.ts');
      const { LocationHealthService } = await import('./src/transport/proof/location-health.service.ts');
      const { ZaloUserClient } = await import('./src/channels/zalo-user.client.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      // Hang rao: khai mot cai, roi doc lai — de duong CHINH SACH that su chay, khong chi duoc resolve.
      const geofences = context.get(GeofenceService, { strict: false });
      const fence = await geofences.register({
        label: 'Boot kho Hai Phong', subjectKind: 'DEPOT', subjectId: 'kho-boot',
        latitude: 20.8449, longitude: 106.6881, radiusMetres: 200, note: null, recordedBy: 'boot',
      });
      const listed = await geofences.listActive();

      // SUC KHOE VI TRI phai chay duoc trong tien trinh THAT, khong chi trong bai don vi: tuyen doc
      // nam tren mot controller dang ky o GOC, nen no chi thay danh sach export cua module.
      // Mot chiec xe khong ai theo doi phai ra NOT_TRACKED — KHONG phai LOST.
      const health = context.get(LocationHealthService, { strict: false });
      const unwatched = await health.forVehicle('xe-khong-ai-theo-doi');

      // Nguong chinh sach phai SONG trong tien trinh that, khong chi trong bai test don vi.
      let radiusReason = 'KHONG BI CHAN';
      try {
        await geofences.register({
          label: 'Boot qua to', subjectKind: 'AD_HOC', subjectId: null,
          latitude: 20.8449, longitude: 106.6881, radiusMetres: 999999, note: null, recordedBy: 'boot',
        });
      } catch (error) { radiusReason = error.reason ?? error.name; }

      let nullIslandReason = 'KHONG BI CHAN';
      try {
        await geofences.register({
          label: 'Boot Null Island', subjectKind: 'AD_HOC', subjectId: null,
          latitude: 0, longitude: 0, radiusMetres: 200, note: null, recordedBy: 'boot',
        });
      } catch (error) { nullIslandReason = error.reason ?? error.name; }

      const proof = {
        driverTracking: has(DriverTrackingController),
        tracking: has(TrackingController),
        driverProof: has(DriverProofController),
        proofReview: has(ProofReviewController),
        trackingService: has(TrackingService),
        operationalProof: has(OperationalProofService),
        locationHealth: has(LocationHealthService),
        unwatchedStatus: unwatched.status,
        unwatchedReason: unwatched.reason,
        // Nguon vi tri thu hai phai co mat, va phai la ban CHUA CAM VAO GI.
        telematics: has(VehicleTelematicsPort),
        // Khach van tai khong phai khai mot kenh Zalo nao de bam vi tri.
        zalo: has(ZaloUserClient),
        fenceRadius: fence.radiusMetres,
        fenceCount: listed.length,
        radiusReason,
        nullIslandReason,
      };
      await context.close();
      process.stdout.write('<<TRANSPORT_PROOF_BOOT_PROOF>>' + JSON.stringify(proof));
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
    const proof = child.stdout.split('<<TRANSPORT_PROOF_BOOT_PROOF>>')[1];
    expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
    expect(JSON.parse(proof ?? '{}')).toEqual({
      driverTracking: true,
      tracking: true,
      driverProof: true,
      // Dong nay la ca ly do bai test ton tai.
      proofReview: true,
      trackingService: true,
      operationalProof: true,
      locationHealth: true,
      // `NOT_TRACKED` khac `LOST`, va o day no duoc chung minh boi mot tien trinh that.
      unwatchedStatus: 'NOT_TRACKED',
      unwatchedReason: 'TRACKING_NOT_EXPECTED',
      telematics: true,
      zalo: false,
      fenceRadius: 200,
      fenceCount: 1,
      radiusReason: 'GEOFENCE_RADIUS_OUT_OF_RANGE',
      nullIslandReason: 'GEOFENCE_COORDINATE_REJECTED',
    });
  }, 70_000);
});
