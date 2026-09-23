import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRIVER,
  LEGACY_TRIP,
  VEHICLE_A,
  buildRunFirstWorld,
  runFirstCommand,
  type RunFirstWorld,
} from './__tests__/run-first-harness.js';
import { fuelEntryInboxQuerySchema } from './fuel.schemas.js';

/**
 * `#369` R-5 — PHIEU CHUYEN v1 SUY RA VONG CHAY/CHANG KHI DOC, va KHONG mot lan ghi nguoc nao.
 *
 * Duong suy la `TransportTripRunLegLink` (`tripId` khoa chinh, `legId` unique): mot chuyen chieu ra
 * TOI DA MOT chang, chang do thuoc DUNG MOT vong chay. Khong co cho nao de chon giua nhieu ung vien,
 * nen khong co "vong chay gan dung" nao duoc bia ra — chuyen chua chieu thi khung nhin noi `null`.
 */

let world: RunFirstWorld;

beforeEach(async () => {
  world = await buildRunFirstWorld();
});

/** Chieu chuyen v1 sang CHINH chang co hang cua vong chay trong bo dung. */
const projectLegacyTrip = async (): Promise<void> => {
  await world.movement.projectTrip({
    tripId: LEGACY_TRIP,
    projectedBy: 'dieu-do',
    order: null,
    run: { code: 'RUN-CHIEU-TU-CHUYEN', vehicleId: VEHICLE_A, businessDate: '2026-09-22' },
    leg: {
      sequence: 1,
      kind: 'LOADED',
      originLabel: 'Kho A',
      destinationLabel: 'Kho B',
      businessDate: '2026-09-22',
    },
  });
};

const legacyEntry = () =>
  world.fuel.submitFuelEntry(
    runFirstCommand(world, {
      runId: null,
      legId: null,
      tripId: LEGACY_TRIP,
      vehicleId: VEHICLE_A,
      driverId: DRIVER,
    }),
    'lx.binh',
  );

const inbox = (overrides: Record<string, unknown> = {}) =>
  world.read.fuelEntryInbox(fuelEntryInboxQuerySchema.parse(overrides));

describe('#369 R-5 — hop thu suy ra vong chay cho phieu chuyen v1', () => {
  it('phieu chuyen v1 DA CHIEU: `derivedRun` co, `runId`/`legId` cua phieu VAN `null`', async () => {
    await projectLegacyTrip();
    const entry = await legacyEntry();

    const [row] = (await inbox()).rows;
    expect(row).toMatchObject({
      id: entry.id,
      tripId: LEGACY_TRIP,
      // Ngu canh DA KHAI khong bi dien ho — day la cho de sai nhat cua ca tinh nang.
      runId: null,
      legId: null,
      derivedRun: {
        runCode: 'RUN-CHIEU-TU-CHUYEN',
        legSequence: 1,
        via: 'TRIP_RUN_LEG_LINK',
      },
    });

    // Va lan doc KHONG ghi gi: hang phieu duoi kho van y nguyen.
    expect(await world.fuelRepo.findEntry(entry.id)).toMatchObject({
      tripId: LEGACY_TRIP,
      runId: null,
      legId: null,
    });
  });

  it('phieu chuyen v1 CHUA CHIEU: `derivedRun` la `null` — khong doan theo (xe, ngay)', async () => {
    const entry = await legacyEntry();
    const [row] = (await inbox()).rows;
    expect(row?.id).toBe(entry.id);
    expect(row?.derivedRun).toBeNull();
  });

  it('phieu Run-first: khong co gi de suy — ngu canh THAT nam ngay tren phieu', async () => {
    await world.fuel.submitFuelEntry(
      runFirstCommand(world, { legId: world.loadedLeg.id }),
      'lx.binh',
    );
    const [row] = (await inbox()).rows;
    expect(row).toMatchObject({
      tripId: null,
      runId: world.run.id,
      legId: world.loadedLeg.id,
      derivedRun: null,
    });
  });
});

describe('#369 R-5 — loc theo MA VONG CHAY thay CA hai loai phieu cua vong chay do', () => {
  it('phieu Run-first VA phieu chuyen v1 da chieu deu hien, moi phieu MOT lan', async () => {
    await projectLegacyTrip();
    const legacy = await legacyEntry();
    const runFirst = await world.fuel.submitFuelEntry(
      runFirstCommand(world, { legId: world.emptyLeg.id }),
      'lx.binh',
    );

    const projected = await inbox({ runCode: 'RUN-CHIEU-TU-CHUYEN' });
    expect(projected.rows.map((row) => row.id)).toEqual([legacy.id]);

    const own = await inbox({ runCode: 'RUN-364-A' });
    expect(own.rows.map((row) => row.id)).toEqual([runFirst.id]);
    expect(own.total).toBe(1);
  });

  it('ma vong chay khong co that -> hop thu RONG, khong phai toan bo hop thu', async () => {
    await projectLegacyTrip();
    await legacyEntry();
    await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');

    const none = await inbox({ runCode: 'RUN-KHONG-CO' });
    expect(none.rows).toEqual([]);
    expect(none.total).toBe(0);
  });

  /**
   * Mot vong chay CHUA co chuyen v1 nao chieu sang: bo loc phai tra ve dung phieu Run-first cua no,
   * khong keo theo moi phieu chuyen cu cua doi xe.
   */
  it('vong chay chua co chuyen nao chieu sang -> chi phieu khai thang vong chay do', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    await legacyEntry();

    const page = await inbox({ runCode: 'RUN-364-A' });
    expect(page.rows.map((row) => row.id)).toEqual([entry.id]);
  });
});
