import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { CostingService } from '../costing/costing.service.js';
import { InMemoryCostingRepository } from '../costing/in-memory-costing.repository.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import {
  TransportCoreFacts,
  type DriverFacts,
  type TripFacts,
} from '../costing/transport-core-facts.port.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import {
  AUTH_USER,
  DRIVER,
  LEGACY_TRIP,
  VEHICLE_A,
  buildRunFirstWorld,
  runFirstCommand,
  type RunFirstWorld,
} from './__tests__/run-first-harness.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import { InMemoryFuelStationRepository } from './fuel-station.repository.js';
import { CostingFuelExpenseAdapter } from './fuel.ports.js';
import { FuelService } from './fuel.service.js';

/**
 * `#369` R-4 — `DRIVER_CASH` CHAY DUOC RUN-FIRST: phieu tren vong chay, khong chuyen v1 gia, vao Quy
 * lai xe bang DUNG MOT but toan `RUN_EXPENSE`, va gia thanh van cho ke toan phan bo.
 *
 * Hai lop bai:
 *   · `RecordingCostingPort` cua bo dung `#364` — hoi duoc lan duyet goi `TX-03` BAO NHIEU lan va
 *     voi lenh gi (duong cu `postFuelCost` phai la 0 lan);
 *   · CHUOI THAT trong bo nho — `FuelService` -> `CostingFuelExpenseAdapter` -> `RunExpenseService` ->
 *     `InMemoryCostingRepository`, de "mot su kien, mot anh huong quy" duoc do tren so quy that.
 *
 * Khoa hang, unique, `CHECK` va trigger o `transport-fuel-run-first-driver-cash.int.spec.ts`.
 */

let world: RunFirstWorld;

beforeEach(async () => {
  world = await buildRunFirstWorld();
});

const declareCash = async (patch: Parameters<typeof runFirstCommand>[1] = {}) =>
  world.fuel.submitFuelEntry(
    runFirstCommand(world, { paymentMethod: 'DRIVER_CASH', legId: world.loadedLeg.id, ...patch }),
    'lx.binh',
  );

describe('#369 R-4 — lai xe ung tien mat tren vong chay: nop duoc, duyet vao Quy', () => {
  it('NOP: `DRIVER_CASH` + `runId`, khong `tripId` -> hop le, chua cham Quy', async () => {
    const entry = await declareCash();
    expect(entry).toMatchObject({
      tripId: null,
      runId: world.run.id,
      legId: world.loadedLeg.id,
      vehicleId: VEHICLE_A,
      paymentMethod: 'DRIVER_CASH',
      verificationStatus: 'DECLARED',
      driverFundEntryId: null,
      costExpenseId: null,
    });
    expect(world.costing.driverCashCommands).toEqual([]);
    expect(world.costing.commands).toEqual([]);
  });

  it('DUYET: MOT lenh Quy dung hinh dang, KHONG mot lenh `TX-03`, phieu tro toi chan Quy', async () => {
    const entry = await declareCash();
    const verified = await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');

    expect(world.costing.commands).toEqual([]);
    expect(world.costing.driverCashCommands).toEqual([
      {
        driverId: DRIVER,
        runId: world.run.id,
        legId: world.loadedLeg.id,
        amount: 2_100_000,
        businessDate: '2026-09-22',
        note: `Phieu do dau ${entry.id}`,
        correlationKey: `fuel:${entry.id}`,
      },
    ]);
    expect(verified).toMatchObject({
      verificationStatus: 'VERIFIED',
      driverFundEntryId: `fund-of-fuel:${entry.id}`,
      costExpenseId: null,
    });
    // Gia thanh KHONG tu vao dau ca: van cho mot quyet dinh phan bo rieng.
    expect((await world.attributionRead.viewForEntry(entry.id)).attributedAmount).toBe(0);
  });

  it('DUYET LAI mot phieu da co chan Quy -> khong goi Quy lan hai', async () => {
    const entry = await declareCash();
    await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');
    const again = await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');

    expect(world.costing.driverCashCommands).toHaveLength(1);
    expect(again.driverFundEntryId).toBe(`fund-of-fuel:${entry.id}`);
  });

  it('phieu Run-first `SUPPLIER_ACCOUNT` duyet -> KHONG cham Quy (cong no nha cung cap o duong rieng)', async () => {
    const entry = await world.fuel.submitFuelEntry(runFirstCommand(world), 'lx.binh');
    const verified = await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');

    expect(verified.driverFundEntryId).toBeNull();
    expect(world.costing.driverCashCommands).toEqual([]);
    expect(world.costing.commands).toEqual([]);
  });

  it('phieu chuyen v1 `DRIVER_CASH` VAN di `TX-03` nhu cu — KHONG di duong Run-first', async () => {
    const legacy = await world.fuel.submitFuelEntry(
      runFirstCommand(world, {
        runId: null,
        tripId: LEGACY_TRIP,
        vehicleId: VEHICLE_A,
        paymentMethod: 'DRIVER_CASH',
      }),
      'lx.binh',
    );
    const verified = await world.fuel.verifyFuelEntry(legacy.id, 'ke-toan');

    expect(world.costing.driverCashCommands).toEqual([]);
    expect(world.costing.commands).toEqual([
      expect.objectContaining({
        tripId: LEGACY_TRIP,
        driverId: DRIVER,
        fundedBy: 'DRIVER_FUND',
        correlationKey: `fuel:${legacy.id}`,
      }),
    ]);
    expect(verified).toMatchObject({
      costExpenseId: `expense-of-fuel:${legacy.id}`,
      driverFundEntryId: null,
    });
  });

  it('khung nhin lai xe KHONG lo chan Quy — so cua ke toan', async () => {
    const entry = await declareCash();
    await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');
    const slip = await world.read.getMyFuelSlip(AUTH_USER, entry.id);

    for (const forbidden of ['driverFundEntryId', 'costExpenseId', 'correlationKey']) {
      expect(slip, forbidden).not.toHaveProperty(forbidden);
    }
    expect(slip).toMatchObject({ paymentMethod: 'DRIVER_CASH', runId: world.run.id });
  });
});

describe('#369 R-4 — kho tu choi gan chan Quy vao phieu KHONG du dieu kien (luoi truoc CSDL)', () => {
  it.each([
    ['phieu chuyen v1', { runId: null, legId: null, tripId: LEGACY_TRIP, vehicleId: VEHICLE_A }],
    ['phieu `SUPPLIER_ACCOUNT`', { paymentMethod: 'SUPPLIER_ACCOUNT' as const }],
  ])('%s', async (_label, patch) => {
    const entry = await declareCash(patch);
    await world.fuelRepo.setEntryVerification(entry.id, 'DECLARED', {
      to: 'VERIFIED',
      actor: 'ke-toan',
      reviewNote: null,
      at: new Date('2026-09-22T10:00:00Z'),
    });
    await expect(world.fuelRepo.attachDriverFundEntry(entry.id, 'but-toan-x')).rejects.toThrow(
      /^TransportFuelEntry_driver_fund_leg_shape: /,
    );
    expect((await world.fuelRepo.findEntry(entry.id))?.driverFundEntryId).toBeNull();
  });

  it('phieu CHUA duyet', async () => {
    const entry = await declareCash();
    await expect(world.fuelRepo.attachDriverFundEntry(entry.id, 'but-toan-x')).rejects.toThrow(
      /^TransportFuelEntry_driver_fund_leg_shape: /,
    );
  });

  it('gan LAN HAI -> `null` ("da co"), khong ghi de', async () => {
    const entry = await declareCash();
    await world.fuel.verifyFuelEntry(entry.id, 'ke-toan');
    expect(await world.fuelRepo.attachDriverFundEntry(entry.id, 'but-toan-khac')).toBeNull();
    expect((await world.fuelRepo.findEntry(entry.id))?.driverFundEntryId).toBe(
      `fund-of-fuel:${entry.id}`,
    );
  });
});

/* ------------------------------------------------------------------ *
 * CHUOI THAT trong bo nho: fuel -> adapter -> RunExpenseService -> so quy
 * ------------------------------------------------------------------ */

class ChainCoreFacts extends TransportCoreFacts {
  async findTrip(): Promise<TripFacts | null> {
    return null;
  }

  async findDriver(driverId: string): Promise<DriverFacts | null> {
    return driverId === DRIVER ? { id: DRIVER, fullName: 'Nguyen Van Binh' } : null;
  }

  async findDriverByAuthUserId(): Promise<DriverFacts | null> {
    return null;
  }

  async wasDriverEverAssignedToTrip(): Promise<boolean> {
    return false;
  }
}

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: { 'tai-5-tan': 30 }, tolerancePercent: 10 },
};

describe('#369 R-4 — chuoi that: mot su kien, MOT anh huong Quy', () => {
  let ledger: InMemoryCostingRepository;
  let fuel: FuelService;
  let costing: CostingService;
  let fundRead: CostingReadService;

  beforeEach(() => {
    ledger = new InMemoryCostingRepository();
    const core = new ChainCoreFacts();
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    costing = new CostingService(ledger, core, audit, CORE_POLICY, {
      expenseCategories: [],
      advanceApprovalRequired: false,
    });
    const runExpenses = new RunExpenseService(
      ledger,
      core,
      new MovementCostingRunContextAdapter(world.movement),
      audit,
      CORE_POLICY,
    );
    fuel = new FuelService(
      world.fuelRepo,
      new InMemoryFuelStationRepository(),
      world.core,
      new MovementFuelRunContextAdapter(world.movement),
      new CostingFuelExpenseAdapter(costing, runExpenses),
      audit,
      CORE_POLICY,
      FUEL_POLICY,
    );
    fundRead = new CostingReadService(ledger, core);
  });

  it('duyet -> but toan `RUN_EXPENSE` that, so du lai xe giam dung so tien phieu', async () => {
    const entry = await fuel.submitFuelEntry(
      runFirstCommand(world, { paymentMethod: 'DRIVER_CASH', legId: world.emptyLeg.id }),
      'lx.binh',
    );
    const verified = await fuel.verifyFuelEntry(entry.id, 'ke-toan');
    const statement = await fundRead.driverFundStatement(DRIVER);

    expect(statement.entries).toEqual([
      expect.objectContaining({
        id: verified.driverFundEntryId,
        kind: 'RUN_EXPENSE',
        signedAmount: -2_100_000,
        runId: world.run.id,
        legId: world.emptyLeg.id,
        tripId: null,
        correlationKey: `fuel:${entry.id}`,
      }),
    ]);
    expect(statement.balance).toBe(-2_100_000);
    expect(statement.balanceStance).toBe('COMPANY_OWES_DRIVER');
    expect(await ledger.findExpenseByCorrelation(`fuel:${entry.id}`)).toBeNull();
  });

  /**
   * Lan duyet THU NHAT da doi trang thai roi chet truoc khi ghi Quy (vd ky quy dang chot). Phieu
   * `VERIFIED` khong chan Quy la trang thai DOC DUOC va TU SUA DUOC: goi lai `verify` hoan tat phan
   * con thieu, DUNG mot but toan.
   */
  it('duyet dang do (ky quy dong bang) -> duyet lai sau khi mo ky: DUNG mot but toan', async () => {
    const entry = await fuel.submitFuelEntry(
      runFirstCommand(world, { paymentMethod: 'DRIVER_CASH' }),
      'lx.binh',
    );
    const account = await ledger.ensureAccount(DRIVER, new Date('2026-09-22T00:00:00Z'));
    const period = await ledger.createPeriod({
      accountId: account.id,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      at: new Date('2026-09-22T00:00:00Z'),
    });
    await ledger.setPeriodStatus(period.id, 'OPEN', 'CLOSING', {
      at: new Date('2026-09-22T00:00:00Z'),
      actor: 'kt',
    });

    await expect(fuel.verifyFuelEntry(entry.id, 'ke-toan')).rejects.toMatchObject({
      reason: 'RUN_EXPENSE_PERIOD_FROZEN',
    });
    const stuck = await world.fuelRepo.findEntry(entry.id);
    expect(stuck).toMatchObject({ verificationStatus: 'VERIFIED', driverFundEntryId: null });

    await ledger.setPeriodStatus(period.id, 'CLOSING', 'REOPENED', {
      at: new Date('2026-09-22T01:00:00Z'),
      actor: 'admin',
      reopenReason: 'mo lai de ghi quy',
    });
    const repaired = await fuel.verifyFuelEntry(entry.id, 'ke-toan');
    expect(repaired.driverFundEntryId).not.toBeNull();
    expect(await ledger.listEntries(account.id)).toHaveLength(1);
  });

  /**
   * Hai ke toan bam "duyet lai" CUNG LUC tren mot phieu da `VERIFIED` ma chua co chan Quy. Ca hai
   * cung vao duong Quy voi CUNG khoa `fuel:<id>`: mot ben ghi, ben kia hoi tu ve CHINH but toan do.
   */
  it('hai lan duyet lai SONG SONG -> MOT but toan, phieu tro dung no', async () => {
    const entry = await fuel.submitFuelEntry(
      runFirstCommand(world, { paymentMethod: 'DRIVER_CASH' }),
      'lx.binh',
    );
    await world.fuelRepo.setEntryVerification(entry.id, 'DECLARED', {
      to: 'VERIFIED',
      actor: 'ke-toan',
      reviewNote: null,
      at: new Date('2026-09-22T05:00:00Z'),
    });

    const [left, right] = await Promise.all([
      fuel.verifyFuelEntry(entry.id, 'ke-toan-1'),
      fuel.verifyFuelEntry(entry.id, 'ke-toan-2'),
    ]);

    const account = await ledger.findAccountByDriver(DRIVER);
    const entries = await ledger.listEntries(account!.id);
    expect(entries).toHaveLength(1);
    expect(left.driverFundEntryId).toBe(entries[0]!.id);
    expect(right.driverFundEntryId).toBe(entries[0]!.id);
  });

  it('dao chan Quy qua duong chung `TX-03` -> net ve 0; duyet lai KHONG ghi lai tien', async () => {
    const entry = await fuel.submitFuelEntry(
      runFirstCommand(world, { paymentMethod: 'DRIVER_CASH' }),
      'lx.binh',
    );
    const verified = await fuel.verifyFuelEntry(entry.id, 'ke-toan');
    await costing.reverseFundEntry(verified.driverFundEntryId!, 'lai xe khong ung tien', 'ke-toan');

    await fuel.verifyFuelEntry(entry.id, 'ke-toan');
    const statement = await fundRead.driverFundStatement(DRIVER);
    // SAP XEP truoc khi so: hai but toan cung ngay nghiep vu va cung khoanh khac ghi, nen thu tu doc
    // ra do `id` quyet — mot khang dinh theo thu tu se xanh/do theo may.
    expect(statement.entries.map((row) => row.kind).sort()).toEqual(['REVERSAL', 'RUN_EXPENSE']);
    expect(statement.balance).toBe(0);
  });
});
