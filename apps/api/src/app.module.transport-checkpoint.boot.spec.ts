import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-checkpoint',
);

/**
 * MOT KHACH BAT `transport-checkpoint` PHAI KHOI DONG DUOC — VA BANG DIEU HANH PHAI DOC DUOC MOC.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI
 *
 * `ControlTowerCheckpointFactsAdapter` duoc dang ky o GOC (`app-composition.ts`), nen no CHI thay
 * phan EXPORT cua `TransportCheckpointModule`. Neu mot ngay nao do no doi sang tiem
 * `CheckpointRepository` rieng le, hay `TRANSPORT_CHECKPOINT_POLICY`, hay mot cong facts noi bo,
 * thi `tsc` van xanh, bai don vi van xanh (chung tu tay dung adapter), bai composition van xanh
 * (no chi doi chieu DANH SACH ten) — va tien trinh chet luc khoi dong o moi khach co bat
 * `transport-checkpoint`.
 *
 * Do khong phai mot gia dinh: `ControlTowerClaimFactsAdapter` da tung tiem `ExpenseClaimRepository`
 * trong khi `TransportCostingModule` chi export service, va chinh mot bai boot bat duoc.
 *
 * ============================================================================================
 * VA NO DI XA HON MOT PHEP RESOLVE
 *
 * `#278` N13 bai 1 doi rang go tich hop moc di thi bai phai DO. Bai o
 * `control-tower-projection.spec.ts` khoa dieu do o muc ham thuan; bai nay khoa o muc TIEN TRINH:
 * mot vong chay that, hai chang that, mot chuoi moc that ghi qua `CheckpointService`, roi doc
 * `ControlTowerReadService` va doi cot `LOADING` co dung vong chay do.
 *
 * Va no khoa luon chieu nguoc lai — `#278` N13 bai 2: cot `WAITING` phai VAN rong, kem ma ly do
 * rieng cua no, ngay ca khi moc da co day du.
 */
describe('transport-checkpoint process boot contract', () => {
  it(
    'boot Nest that, va bang dieu hanh doc giai doan chang tu moc hien truong',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { ControlTowerController } = await import('./src/transport/control-tower/control-tower.controller.ts');
      const { CheckpointsController } = await import('./src/transport/checkpoint/checkpoints.controller.ts');
      const { ControlTowerReadService } = await import('./src/transport/control-tower/control-tower-read.service.ts');
      const { CheckpointService } = await import('./src/transport/checkpoint/checkpoint.service.ts');
      const { MovementService } = await import('./src/transport/movement/movement.service.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const fleet = context.get(FleetService, { strict: false });
      const movement = context.get(MovementService, { strict: false });
      const checkpoints = context.get(CheckpointService, { strict: false });
      const tower = context.get(ControlTowerReadService, { strict: false });

      const vehicle = await fleet.registerVehicle({ registrationPlate: '29H-11111', vehicleClass: 'Dau keo' }, 'boot');
      const driver = await fleet.registerDriver({
        fullName: 'Lai xe Boot', phone: '0900000001', licenceClass: 'FC',
        licenceExpiry: '2030-01-01', authUserId: 'boot-driver',
      }, 'boot');

      const order = await movement.createOrder({
        code: 'ORD-BOOT-1', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong',
      }, 'boot');
      const run = await movement.createRun({ code: 'RUN-BOOT-1', vehicleId: vehicle.id }, 'boot');
      await movement.assignRun(run.id, { driverId: driver.id }, 'boot');

      // Chang 1 CO HANG cho don tren, chang 2 RONG chay ve bai — dung hinh dang ma #274 §4 mo ta.
      const loaded = await movement.addLeg(run.id, {
        sequence: 1, kind: 'LOADED', orderId: order.id,
        originLabel: 'Ha Noi', destinationLabel: 'Hai Phong', distanceKm: 105,
      }, 'boot');
      await movement.addLeg(run.id, {
        sequence: 2, kind: 'EMPTY',
        originLabel: 'Hai Phong', destinationLabel: 'Ha Noi', distanceKm: 105,
      }, 'boot');
      await movement.transitionRun(run.id, 'ACTIVE', 'boot');

      // TRUOC khi co moc: vong chay dang chay nam o In transit.
      const before = await tower.view();
      const columnOf = (view, name) => view.board.find((column) => column.column === name);
      const beforeInTransit = columnOf(before, 'IN_TRANSIT').cards.map((card) => card.runCode);

      // Mot chuoi moc THAT, ghi qua chinh duong cua dieu hanh.
      await checkpoints.recordAsOperator({
        type: 'ASSIGNED', runId: run.id, authUserId: 'boot-operator', clientEventId: 'boot-1',
      });
      await checkpoints.recordAsOperator({
        type: 'DEPARTED', runId: run.id, authUserId: 'boot-operator', clientEventId: 'boot-2',
      });
      await checkpoints.recordAsOperator({
        type: 'PICKUP_ARRIVAL', runId: run.id, legId: loaded.id,
        authUserId: 'boot-operator', clientEventId: 'boot-3',
      });
      await checkpoints.recordAsOperator({
        type: 'LOADING', runId: run.id, legId: loaded.id,
        authUserId: 'boot-operator', clientEventId: 'boot-4',
      });

      const after = await tower.view();
      const loadingColumn = columnOf(after, 'LOADING');
      const waitingColumn = columnOf(after, 'WAITING');
      const card = loadingColumn.cards[0] ?? null;

      const proof = {
        controlTower: has(ControlTowerController),
        checkpointsController: has(CheckpointsController),
        // Nguon moc CO mat -> khong con duoc cong bo la thieu.
        unavailableSources: [...after.unavailableSources].sort(),
        beforeInTransit,
        beforeLoadingReason: columnOf(before, 'LOADING').unavailableReason,
        // Sau khi co moc: vong chay o dung cot LOADING, va roi khoi In transit.
        afterLoadingReason: loadingColumn.unavailableReason,
        afterLoadingRuns: loadingColumn.cards.map((entry) => entry.runCode),
        afterInTransit: columnOf(after, 'IN_TRANSIT').cards.map((entry) => entry.runCode),
        currentLegPhase: card?.currentLeg?.phase ?? null,
        currentLegKind: card?.currentLeg?.kind ?? null,
        currentLegOrderCode: card?.currentLeg?.orderCode ?? null,
        loadedLegs: card?.loadedLegs ?? null,
        emptyLegs: card?.emptyLegs ?? null,
        emptyKm: card?.emptyKm ?? null,
        totalKm: card?.totalKm ?? null,
        // Cot WAITING van rong, va ly do cua no KHONG phai "chua co moc".
        waitingCards: waitingColumn.cards.length,
        waitingReason: waitingColumn.unavailableReason,
        pendingCheckpointReasons: after.pendingWork.filter(
          (entry) => entry.reason === 'AWAITING_CHECKPOINT_SOURCE',
        ).length,
      };
      await context.close();
      process.stdout.write('<<TRANSPORT_CHECKPOINT_BOOT_PROOF>>' + JSON.stringify(proof));
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
      const proof = child.stdout.split('<<TRANSPORT_CHECKPOINT_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        controlTower: true,
        checkpointsController: true,
        /* Khach nay khong bat costing/fuel/asset-compliance, nen ba nguon do van duoc cong bo. */
        unavailableSources: ['EXPENSE_CLAIMS', 'FUEL', 'OPERATIONAL_ALERTS'],
        beforeInTransit: ['RUN-BOOT-1'],
        /* Chua co moc nao: cot LOADING rong nhung KHONG mang ma ly do — nguon CO, chua co du lieu. */
        beforeLoadingReason: null,
        afterLoadingReason: null,
        afterLoadingRuns: ['RUN-BOOT-1'],
        afterInTransit: [],
        currentLegPhase: 'LOADING',
        currentLegKind: 'LOADED',
        currentLegOrderCode: 'ORD-BOOT-1',
        loadedLegs: 1,
        emptyLegs: 1,
        emptyKm: 105,
        totalKm: 210,
        /* `#278` N13 bai 2 — do o muc tien trinh. */
        waitingCards: 0,
        waitingReason: 'AWAITING_WAITING_SESSION_SOURCE',
        pendingCheckpointReasons: 0,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
