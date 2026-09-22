import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../transport.errors.js';
import {
  AUTH_USER,
  DRIVER,
  LEGACY_TRIP,
  OTHER_AUTH_USER,
  OTHER_DRIVER,
  VEHICLE_A,
  VEHICLE_B,
  buildRunFirstWorld,
  runFirstCommand,
  type RunFirstWorld,
} from './__tests__/run-first-harness.js';
import { driverFuelSubmitSchema, fuelEntryInboxQuerySchema } from './fuel.schemas.js';

/**
 * `#364` — FUEL EVENT RUN-FIRST, do tren kho trong bo nho qua DICH VU that.
 *
 * Cai tep nay chung minh: mot lai xe co vong chay DUOC DIEU ma KHONG co chuyen v1 khai duoc phieu;
 * moi ngu canh sai bi tu choi voi MOT ly do co ma; phat lai khong ghi them; tieu hao van tinh theo
 * xe; duyet phieu Run-first KHONG lot vao gia thanh chuyen / Quy lai xe; khung nhin lai xe va hop thu
 * ke toan thay phieu khong chuyen. Khoa hang, trigger va `CHECK` o `transport-fuel-run-first.int.spec.ts`
 * tren Postgres THAT.
 */

let world: RunFirstWorld;

beforeEach(async () => {
  world = await buildRunFirstWorld();
});

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportDomainError) return `${error.kind}:${error.reason}`;
    throw error;
  }
  throw new Error('lenh le ra phai bi tu choi');
};

describe('#364 §4 — lai xe co vong chay, KHONG co chuyen v1, khai duoc phieu', () => {
  it('phieu ton tai voi `tripId = null`, ngu canh la vong chay, xe LAY TU vong chay', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');

    expect(entry).toMatchObject({
      tripId: null,
      runId: world.run.id,
      legId: null,
      vehicleId: VEHICLE_A,
      driverId: DRIVER,
      verificationStatus: 'DECLARED',
      reconciliationStatus: 'UNMATCHED',
      paymentMethod: 'SUPPLIER_ACCOUNT',
      costExpenseId: null,
    });
    expect(await world.fuelRepo.findEntry(entry.id)).toEqual(entry);
  });

  it('ngu canh CHANG cua chinh vong chay duoc luu dung', async () => {
    const entry = await world.fuel.submitFuelEntry(
      runFirstCommand(world, { legId: world.loadedLeg.id }),
      'lx.binh',
    );
    expect(entry).toMatchObject({ runId: world.run.id, legId: world.loadedLeg.id });
  });

  it('`vehicleId` gui kem va KHOP xe cua vong chay -> nhan', async () => {
    const entry = await world.fuel.submitFuelEntry(
      runFirstCommand(world, { vehicleId: VEHICLE_A }),
      'lx.binh',
    );
    expect(entry.vehicleId).toBe(VEHICLE_A);
  });

  /**
   * "Tung", khong phai "dang" (`GD-06`): nguoi bi thay ca van khai duoc phan duong ho da chay. Doi
   * lai xe o day DONG ban phan cong cua Binh — Binh chi con trong LICH SU.
   */
  it('lai xe DA BI THAY CA van khai duoc (lich su phan cong, khong phai ban dang hieu luc)', async () => {
    await world.movement.assignRun(world.run.id, {
      driverId: OTHER_DRIVER,
      effectiveFrom: new Date('2026-09-22T12:00:00Z'),
      assignedBy: 'dieu-do',
    });
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    expect(entry.runId).toBe(world.run.id);
  });

  it('schema cua lai xe nhan to khai CHI co `runId` — khong `tripId`, khong `vehicleId`, khong `driverId`', () => {
    const parsed = driverFuelSubmitSchema.safeParse({
      runId: world.run.id,
      supplierId: world.supplierId,
      liters: '100',
      amount: 2_100_000,
      odometerKm: 120_000,
      occurredAt: '2026-09-22T11:30:00+07:00',
    });
    expect(parsed.success).toBe(true);
    // Truong `driverId` van bi CHAN o be mat lai xe (`#364` §4.1: "Driver request khong duoc gui driverId").
    expect(
      driverFuelSubmitSchema.safeParse({ ...parsed.data, driverId: OTHER_DRIVER }).success,
    ).toBe(false);
  });
});

describe('#364 §4.2 / §9 — ngu canh sai bi tu choi voi MOT ly do co ma', () => {
  it.each([
    [
      'vong chay khong ton tai',
      () => ({ runId: 'khong-co' }),
      'NOT_FOUND:FUEL_ENTRY_RUN_NOT_FOUND',
    ],
    [
      'xe gui kem KHAC xe vong chay',
      () => ({ vehicleId: VEHICLE_B }),
      'DENIED:FUEL_ENTRY_VEHICLE_NOT_RUN_VEHICLE',
    ],
    [
      'chang cua vong chay KHAC',
      () => ({ legId: world.otherLeg.id }),
      'DENIED:FUEL_ENTRY_LEG_NOT_IN_RUN',
    ],
    ['chang khong ton tai', () => ({ legId: 'khong-co' }), 'DENIED:FUEL_ENTRY_LEG_NOT_IN_RUN'],
    [
      'chang ma khong vong chay',
      () => ({ runId: null, legId: world.loadedLeg.id }),
      'DENIED:FUEL_ENTRY_LEG_NOT_IN_RUN',
    ],
    [
      'vong chay cua xe khac, lai xe chua tung duoc phan cong',
      () => ({ runId: world.otherRun.id }),
      'DENIED:FUEL_ENTRY_DRIVER_NOT_ASSIGNED_TO_RUN',
    ],
    [
      'khong chuyen, khong vong chay -> FAIL CLOSED',
      () => ({ runId: null }),
      'DENIED:FUEL_ENTRY_CONTEXT_REQUIRED',
    ],
    [
      'ca chuyen v1 lan vong chay',
      () => ({ tripId: LEGACY_TRIP, vehicleId: VEHICLE_A }),
      'DENIED:FUEL_ENTRY_CONTEXT_CONFLICT',
    ],
    [
      'tien mat lai xe ung tren phieu Run-first',
      () => ({ paymentMethod: 'DRIVER_CASH' as const }),
      'DENIED:FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP',
    ],
  ])('%s', async (_label, patch, expected) => {
    expect(
      await reasonOf(world.fuel.submitFuelEntry(runFirstCommand(world, patch()), 'lx.binh')),
    ).toBe(expected);
    // Moi lan tu choi deu KHONG de lai hang nao.
    expect((await world.read.listMyFuelSlips(AUTH_USER)).length).toBe(0);
  });

  it('lai xe KHAC khai tren vong chay cua Binh -> tu choi (driverId luon tu phien)', async () => {
    expect(
      await reasonOf(
        world.fuel.submitFuelEntry(runFirstCommand(world, { driverId: OTHER_DRIVER }), 'lx.khac'),
      ),
    ).toBe('DENIED:FUEL_ENTRY_DRIVER_NOT_ASSIGNED_TO_RUN');
  });

  it('SUA mot phieu Run-first sang `DRIVER_CASH` cung bi chan', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    expect(
      await reasonOf(
        world.fuel.amendFuelEntry(
          entry.id,
          {
            supplierId: world.supplierId,
            liters: '100',
            amount: 2_100_000,
            odometerKm: 120_000,
            occurredAt: '2026-09-22T11:30:00+07:00',
            businessDate: '2026-09-22',
            paymentMethod: 'DRIVER_CASH',
          },
          'ke-toan',
        ),
      ),
    ).toBe('DENIED:FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP');
    expect((await world.fuelRepo.findEntry(entry.id))?.paymentMethod).toBe('SUPPLIER_ACCOUNT');
  });
});

describe('#364 §10 — phat lai dung, doi ngu canh la phieu KHAC', () => {
  it('gui lai CUNG khoa CUNG noi dung -> CUNG phieu, khong them hang', async () => {
    const command = runFirstCommand(world, { legId: world.emptyLeg.id });
    const first = await world.fuel.submitFuelEntry(command, 'lx.binh');
    const second = await world.fuel.submitFuelEntry(command, 'lx.binh');

    expect(second.id).toBe(first.id);
    expect((await world.read.listMyFuelSlips(AUTH_USER)).length).toBe(1);
  });

  it('hai lan gui SONG SONG cung khoa -> hoi tu ve MOT phieu', async () => {
    const command = runFirstCommand(world);
    const [left, right] = await Promise.all([
      world.fuel.submitFuelEntry(command, 'lx.binh'),
      world.fuel.submitFuelEntry(command, 'lx.binh'),
    ]);
    expect(right.id).toBe(left.id);
    expect((await world.read.listMyFuelSlips(AUTH_USER)).length).toBe(1);
  });

  it.each([
    ['legId', () => ({ legId: world.loadedLeg.id })],
    ['runId', () => ({ runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A })],
  ])('cung khoa nhung doi `%s` -> VA CHAM co ten truong', async (field, patch) => {
    const command = runFirstCommand(world);
    await world.fuel.submitFuelEntry(command, 'lx.binh');

    const retry = world.fuel.submitFuelEntry({ ...command, ...patch() }, 'lx.binh');
    await expect(retry).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
    await expect(world.fuel.submitFuelEntry({ ...command, ...patch() }, 'lx.binh')).rejects.toThrow(
      new RegExp(field),
    );
  });
});

describe('#364 §6 — tieu hao la su that cua XE + ODO, khong can chuyen', () => {
  it('hai phieu Run-first lien tiep cua cung xe -> co odo truoc va L/100km', async () => {
    await world.fuel.submitFuelEntry(
      runFirstCommand(world, {
        odometerKm: 120_000,
        occurredAt: '2026-09-22T07:00:00+07:00',
      }),
      'lx.binh',
    );
    const second = await world.fuel.submitFuelEntry(
      runFirstCommand(world, {
        liters: '100',
        odometerKm: 120_400,
        occurredAt: '2026-09-22T15:00:00+07:00',
      }),
      'lx.binh',
    );

    expect(second.tripId).toBeNull();
    expect(second.previousOdometerKm).toBe(120_000);
    // 100 L / 400 km * 100 = 25,000 L/100km (ty le 3).
    expect(second.consumptionUnits).toBe(25_000);
  });

  it('chuoi odo NOI qua phieu chuyen v1 va phieu Run-first cua cung xe', async () => {
    await world.fuel.submitFuelEntry(
      {
        ...runFirstCommand(world, {
          odometerKm: 119_500,
          occurredAt: '2026-09-21T07:00:00+07:00',
          businessDate: '2026-09-21',
        }),
        runId: null,
        tripId: LEGACY_TRIP,
        vehicleId: VEHICLE_A,
      },
      'ke-toan',
    );
    const native = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    expect(native.previousOdometerKm).toBe(119_500);
    expect(native.consumptionUnits).not.toBeNull();
  });
});

describe('#364 §3 — duyet phieu Run-first KHONG lot vao gia thanh chuyen hay Quy lai xe', () => {
  it('VERIFIED, khong mot lenh `TX-03` nao, `costExpenseId` van null', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    const verified = await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');

    expect(verified.verificationStatus).toBe('VERIFIED');
    expect(verified.costExpenseId).toBeNull();
    expect(world.costing.commands).toHaveLength(0);

    // Duyet lai (duong sua cua ket cuc "duyet roi chet") van khong ghi gi sang `TX-03`.
    await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');
    expect(world.costing.commands).toHaveLength(0);
  });

  it('phieu chuyen v1 van di duong CU: mot lenh `TX-03`, `COMPANY_DIRECT`', async () => {
    const legacy = await world.fuel.submitFuelEntry(
      { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A },
      'ke-toan',
    );
    const verified = await world.fuel.verifyFuelEntry(legacy.id, 'ke-toan');

    expect(verified.costExpenseId).toBe(`expense-of-fuel:${legacy.id}`);
    expect(world.costing.commands).toEqual([
      expect.objectContaining({ tripId: LEGACY_TRIP, fundedBy: 'COMPANY_DIRECT', driverId: null }),
    ]);
  });

  /**
   * MOT PHIEU, MOT SO CAI o TANG KHO — khong chi o nhanh `tripId === null` cua `postFuelCost`.
   *
   * Mot duong goi tuong lai goi thang `attachCostExpense` van khong gan duoc chan `TX-03` vao phieu
   * Run-first. Kho NEM (khong tra `null`): `null` nghia la "da co, phat lai vo hai", va nguoi goi se
   * tin mot khoan chi mo coi la cua mot phien khac. Ban Postgres: IT A8.
   */
  it('kho tu choi gan chan `TX-03` vao phieu Run-first: NEM loi co ten, khong ghi', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');

    await expect(world.fuelRepo.attachCostExpense(entry.id, 'expense-lac')).rejects.toThrow(
      /^TransportFuelEntry_cost_expense_needs_trip: /,
    );
    expect((await world.fuelRepo.findEntry(entry.id))?.costExpenseId).toBeNull();
  });

  it('phieu chuyen v1 van gan chan `TX-03` qua kho; gan lai la `null`, chan dau giu nguyen', async () => {
    const legacy = await world.fuel.submitFuelEntry(
      { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A },
      'ke-toan',
    );

    const attached = await world.fuelRepo.attachCostExpense(legacy.id, 'expense-1');
    expect(attached?.costExpenseId).toBe('expense-1');
    expect(await world.fuelRepo.attachCostExpense(legacy.id, 'expense-2')).toBeNull();
    expect((await world.fuelRepo.findEntry(legacy.id))?.costExpenseId).toBe('expense-1');
  });

  it('phieu chuyen v1 thieu `vehicleId` -> 400 co ma, khong doan xe', async () => {
    expect(
      await reasonOf(
        world.fuel.submitFuelEntry(
          { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP },
          'ke-toan',
        ),
      ),
    ).toBe('INVALID:FUEL_ENTRY_VEHICLE_REQUIRED');
  });

  it('chuyen v1 thue xe ngoai VAN khong nhan phieu (INV-04 khong yeu di)', async () => {
    world.core.tripKind = 'EXTERNAL_CARRIER';
    expect(
      await reasonOf(
        world.fuel.submitFuelEntry(
          { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A },
          'ke-toan',
        ),
      ),
    ).toBe('DENIED:FUEL_ENTRY_TRIP_OUTSOURCED');
  });

  it.each([
    ['RECONCILED', 'DENIED:FUEL_ENTRY_TRIP_RECONCILED'],
    ['CANCELLED', 'DENIED:FUEL_ENTRY_TRIP_CANCELLED'],
  ] as const)('chuyen v1 %s VAN bi khoa', async (status, expected) => {
    world.core.tripStatus = status;
    expect(
      await reasonOf(
        world.fuel.submitFuelEntry(
          { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A },
          'ke-toan',
        ),
      ),
    ).toBe(expected);
  });
});

describe('#364 §7 — khung nhin lai xe: xe + thoi diem, ma vong xe/chang, khong so sach', () => {
  it('phieu Run-first hien bien so, ma vong xe va so chang — khong `tripId`', async () => {
    const entry = await world.fuel.submitFuelEntry(
      runFirstCommand(world, { legId: world.loadedLeg.id }),
      'lx.binh',
    );
    const view = await world.read.getMyFuelSlip(AUTH_USER, entry.id);

    expect(view).toMatchObject({
      tripId: null,
      tripCode: null,
      runId: world.run.id,
      runCode: 'RUN-364-A',
      legId: world.loadedLeg.id,
      legSequence: 2,
      vehicleId: VEHICLE_A,
      vehiclePlate: '29H-152.44',
    });
    for (const forbidden of ['costExpenseId', 'sourceStatementId', 'declaredBy', 'freightAmount']) {
      expect(Object.keys(view)).not.toContain(forbidden);
    }
    expect(JSON.stringify(view)).not.toMatch(/freight|revenue|margin|doanh/i);
  });

  it('lai xe KHAC khong doc duoc phieu cua Binh', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    expect(await reasonOf(world.read.getMyFuelSlip(OTHER_AUTH_USER, entry.id))).toBe(
      'DENIED:SELF_FUEL_SCOPE_NOT_OWNED',
    );
  });

  it('viec duoc dieu cho o khai phieu: vong chay DANG MO cua CHINH toi, kem bien so va chang', async () => {
    const runs = await world.read.listMyFuelRuns(AUTH_USER);

    expect(runs).toEqual([
      expect.objectContaining({
        runId: world.run.id,
        runCode: 'RUN-364-A',
        vehicleId: VEHICLE_A,
        vehiclePlate: '29H-152.44',
        legs: [
          expect.objectContaining({ legId: world.emptyLeg.id, sequence: 1, kind: 'EMPTY' }),
          expect.objectContaining({ legId: world.loadedLeg.id, sequence: 2, kind: 'LOADED' }),
        ],
      }),
    ]);
    expect(JSON.stringify(runs)).not.toContain(world.otherRun.id);
  });
});

describe('#364 §7 — hop thu ke toan nhin thay phieu KHONG chuyen', () => {
  const inbox = (query: Record<string, unknown> = {}) =>
    world.read.fuelEntryInbox(fuelEntryInboxQuerySchema.parse(query));

  it('phieu Run-first xuat hien, `tripCode` null, co ma vong xe + so chang', async () => {
    const entry = await world.fuel.submitFuelEntry(
      runFirstCommand(world, { legId: world.emptyLeg.id }),
      'lx.binh',
    );
    const page = await inbox();

    expect(page.total).toBe(1);
    expect(page.pendingVerificationCount).toBe(1);
    expect(page.rows[0]).toMatchObject({
      id: entry.id,
      tripId: null,
      tripCode: null,
      runId: world.run.id,
      runCode: 'RUN-364-A',
      legId: world.emptyLeg.id,
      legSequence: 1,
      vehiclePlate: '29H-152.44',
      driverName: 'Nguyen Van Binh',
    });
  });

  it('loc theo MA VONG XE; ma khong ton tai -> RONG, khong phai ca hop thu', async () => {
    await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    await world.fuel.submitFuelEntry(
      { ...runFirstCommand(world), runId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A },
      'ke-toan',
    );

    expect((await inbox({ runCode: 'RUN-364-A' })).total).toBe(1);
    expect((await inbox({ runCode: 'RUN-KHONG-CO' })).total).toBe(0);
    // Loc theo ma chuyen v1 KHONG keo theo phieu Run-first (`IN (...)` khong khop `NULL`).
    const byTrip = await inbox({ tripCode: 'CH-CU-01' });
    expect(byTrip.total).toBe(1);
    expect(byTrip.rows[0]?.tripCode).toBe('CH-CU-01');
    expect((await inbox()).total).toBe(2);
  });
});
