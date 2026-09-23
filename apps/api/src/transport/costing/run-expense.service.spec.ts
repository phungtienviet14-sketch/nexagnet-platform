import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import type { RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { CostingReadService } from './costing-read.service.js';
import type { TransportCostingPolicy } from './costing-policy.js';
import { MovementCostingRunContextAdapter } from './costing-run-context.port.js';
import { CostingService } from './costing.service.js';
import { InMemoryCostingRepository } from './in-memory-costing.repository.js';
import { RunExpenseService, type RecordRunExpenseCommand } from './run-expense.service.js';
import {
  TransportCoreFacts,
  type DriverFacts,
  type TripFacts,
} from './transport-core-facts.port.js';

/**
 * `#369` R-4 — KHOAN CHI RUN-FIRST TU QUY LAI XE, do tren kho trong bo nho qua DICH VU that.
 *
 * Vong chay / chang / phan cong la THAT (`InMemoryMovementRepository` + adapter that), khong gia lap
 * cong `CostingRunContextFacts`. Khoa hang so quy, unique va `CHECK` o `transport-fuel-run-first-
 * driver-cash.int.spec.ts` tren Postgres THAT.
 */

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const COSTING_POLICY: TransportCostingPolicy = {
  expenseCategories: [],
  advanceApprovalRequired: false,
};
const CLOCK = (): Date => new Date('2026-09-23T03:00:00.000Z');
const DRIVER = 'lai-xe-binh';
const OTHER_DRIVER = 'lai-xe-khac';

class FakeCoreFacts extends TransportCoreFacts {
  async findTrip(): Promise<TripFacts | null> {
    return null;
  }

  async findDriver(driverId: string): Promise<DriverFacts | null> {
    return driverId === DRIVER || driverId === OTHER_DRIVER
      ? { id: driverId, fullName: driverId }
      : null;
  }

  async findDriverByAuthUserId(): Promise<DriverFacts | null> {
    return null;
  }

  async wasDriverEverAssignedToTrip(): Promise<boolean> {
    return false;
  }
}

interface RecordedDecision {
  readonly point: string;
  readonly outcome: string;
  readonly reason: string;
}

interface World {
  readonly ledger: InMemoryCostingRepository;
  readonly service: RunExpenseService;
  readonly costing: CostingService;
  readonly read: CostingReadService;
  readonly decisions: RecordedDecision[];
  readonly run: VehicleRun;
  readonly leg: RunLeg;
  readonly otherLeg: RunLeg;
}

let world: World;

beforeEach(async () => {
  const ledger = new InMemoryCostingRepository();
  const core = new FakeCoreFacts();
  const movement = new InMemoryMovementRepository();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  const decisions: RecordedDecision[] = [];
  const telemetry = {
    decision: (input: RecordedDecision) => {
      decisions.push(input);
    },
  } as unknown as TelemetryService;

  const run = await movement.createRun({
    code: 'RUN-369-A',
    vehicleId: 'xe-a',
    businessDate: '2026-09-23',
  });
  const leg = await movement.createLeg({
    runId: run.id,
    sequence: 1,
    kind: 'LOADED',
    orderId: null,
    originLabel: 'Kho A',
    destinationLabel: 'Kho B',
    businessDate: '2026-09-23',
  });
  const otherRun = await movement.createRun({
    code: 'RUN-369-B',
    vehicleId: 'xe-b',
    businessDate: '2026-09-23',
  });
  const otherLeg = await movement.createLeg({
    runId: otherRun.id,
    sequence: 1,
    kind: 'LOADED',
    orderId: null,
    originLabel: 'Kho C',
    destinationLabel: 'Kho D',
    businessDate: '2026-09-23',
  });
  await movement.assignRun(run.id, {
    driverId: DRIVER,
    effectiveFrom: new Date('2026-09-23T00:00:00Z'),
    assignedBy: 'dieu-do',
  });

  world = {
    ledger,
    service: new RunExpenseService(
      ledger,
      core,
      new MovementCostingRunContextAdapter(movement),
      audit,
      CORE_POLICY,
      telemetry,
      CLOCK,
    ),
    costing: new CostingService(ledger, core, audit, CORE_POLICY, COSTING_POLICY, undefined, CLOCK),
    read: new CostingReadService(ledger, core),
    decisions,
    run,
    leg,
    otherLeg,
  };
});

const command = (patch: Partial<RecordRunExpenseCommand> = {}): RecordRunExpenseCommand => ({
  driverId: DRIVER,
  runId: world.run.id,
  legId: world.leg.id,
  amount: 2_100_000,
  businessDate: '2026-09-23',
  note: 'Phieu do dau phieu-1',
  correlationKey: 'fuel:phieu-1',
  ...patch,
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

const balanceOf = async (driverId: string): Promise<number> =>
  (await world.read.driverFundStatement(driverId)).balance;

describe('#369 R-4 — mot khoan chi Run-first, MOT but toan quy, KHONG dong gia thanh', () => {
  it('ghi `RUN_EXPENSE` AM, mang vong chay/chang, KHONG chuyen, KHONG `TripExpense`', async () => {
    const posted = await world.service.recordRunExpense(command(), 'ke-toan');

    expect(posted.replayed).toBe(false);
    expect(posted.entry).toMatchObject({
      kind: 'RUN_EXPENSE',
      signedAmount: -2_100_000,
      tripId: null,
      runId: world.run.id,
      legId: world.leg.id,
      businessDate: '2026-09-23',
      correlationKey: 'fuel:phieu-1',
      reversalOfId: null,
    });
    // Chan tien mat CHI o so quy — chan gia thanh cua khoan Run-first thuoc so cai cua nguon.
    expect(await world.ledger.findExpenseByCorrelation('fuel:phieu-1')).toBeNull();
    expect(await balanceOf(DRIVER)).toBe(-2_100_000);
    expect(world.decisions.at(-1)).toMatchObject({
      point: 'driver_fund.run_expense',
      outcome: 'allowed',
      reason: 'RUN_EXPENSE_RECORDED',
    });
  });

  it('khoan chi o muc vong chay (khong chang) cung hop le', async () => {
    const posted = await world.service.recordRunExpense(command({ legId: null }), 'ke-toan');
    expect(posted.entry).toMatchObject({ runId: world.run.id, legId: null });
  });

  it('dau cua so du: tam ung 3.000.000 roi chi 2.100.000 -> lai xe con giu 900.000', async () => {
    await world.costing.postAdvance(
      { driverId: DRIVER, amount: 3_000_000, businessDate: '2026-09-22', correlationKey: 'ung-1' },
      'ke-toan',
    );
    await world.service.recordRunExpense(command(), 'ke-toan');
    const statement = await world.read.driverFundStatement(DRIVER);
    expect(statement.balance).toBe(900_000);
    expect(statement.balanceStance).toBe('DRIVER_HOLDS_COMPANY_CASH');
    expect(statement.entries.map((entry) => entry.kind)).toEqual(['ADVANCE', 'RUN_EXPENSE']);
  });
});

describe('#369 R-4 — mot su kien, MOT anh huong quy: phat lai tuan tu VA song song', () => {
  it('gui lai CUNG khoa CUNG noi dung -> CHINH but toan cu, `replayed`, khong them dong', async () => {
    const first = await world.service.recordRunExpense(command(), 'ke-toan');
    const again = await world.service.recordRunExpense(command(), 'ke-toan');

    expect(again).toEqual({ entry: first.entry, replayed: true });
    expect(await balanceOf(DRIVER)).toBe(-2_100_000);
    expect(world.decisions.at(-1)?.reason).toBe('RUN_EXPENSE_IDEMPOTENT_REPLAY');
  });

  /**
   * Hai lenh cung doc "chua co" roi cung vao `post()`. Unique cua kho (ban sao cua Postgres o kho
   * trong bo nho) tu choi lan thu hai; dich vu DOC LAI va hoi tu — khong 409, khong dong thu hai.
   */
  it('hai lan ghi SONG SONG cung khoa -> hoi tu ve MOT but toan', async () => {
    const [left, right] = await Promise.all([
      world.service.recordRunExpense(command(), 'ke-toan-1'),
      world.service.recordRunExpense(command(), 'ke-toan-2'),
    ]);

    expect(right.entry.id).toBe(left.entry.id);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
    const account = await world.ledger.findAccountByDriver(DRIVER);
    expect(await world.ledger.listEntries(account!.id)).toHaveLength(1);
    expect(await balanceOf(DRIVER)).toBe(-2_100_000);
  });

  it.each([
    ['so tien', { amount: 2_000_000 }],
    ['vong chay/chang', { legId: null }],
    ['ngay nghiep vu', { businessDate: '2026-09-24' }],
    ['ghi chu', { note: 'mot ghi chu khac' }],
  ])('CUNG khoa, KHAC %s -> VA CHAM, khong tra ve ban cu', async (_field, patch) => {
    await world.service.recordRunExpense(command(), 'ke-toan');
    expect(await reasonOf(world.service.recordRunExpense(command(patch), 'ke-toan'))).toBe(
      'CONFLICT:CORRELATION_KEY_REUSED',
    );
    expect(world.decisions.at(-1)?.reason).toBe('RUN_EXPENSE_KEY_REUSED');
    expect(await balanceOf(DRIVER)).toBe(-2_100_000);
  });

  /**
   * Khoa `fuel:<id>` da vao `TX-03` (vd phieu chuyen v1 tra bang cong no — chi co dong gia thanh,
   * khong but toan quy). Mot khoa su kien, MOT duong vao so cai.
   */
  it('khoa da thuoc mot dong gia thanh chuyen `TX-03` -> VA CHAM, quy KHONG doi', async () => {
    await world.ledger.post({
      correlationKey: 'fuel:phieu-1',
      at: CLOCK(),
      expense: {
        tripId: 'chuyen-cu',
        kind: 'EXPENSE',
        categoryCode: 'FUEL',
        signedAmount: 2_100_000,
        businessDate: '2026-09-23',
        fundedBy: 'COMPANY_DIRECT',
        driverId: null,
        recordedBy: 'ke-toan',
      },
    });

    expect(await reasonOf(world.service.recordRunExpense(command(), 'ke-toan'))).toBe(
      'CONFLICT:CORRELATION_KEY_REUSED',
    );
    expect(await world.ledger.findAccountByDriver(DRIVER)).toBeNull();
  });

  it('khoa da thuoc mot but toan quy KHAC loai (vd `TRIP_EXPENSE`) -> VA CHAM', async () => {
    const account = await world.ledger.ensureAccount(DRIVER, CLOCK());
    await world.ledger.post({
      correlationKey: 'fuel:phieu-1',
      at: CLOCK(),
      entry: {
        accountId: account.id,
        kind: 'TRIP_EXPENSE',
        signedAmount: -2_100_000,
        businessDate: '2026-09-23',
        tripId: 'chuyen-cu',
        note: 'Phieu do dau phieu-1',
        recordedBy: 'ke-toan',
      },
    });
    expect(await reasonOf(world.service.recordRunExpense(command(), 'ke-toan'))).toBe(
      'CONFLICT:CORRELATION_KEY_REUSED',
    );
    expect(await world.ledger.listEntries(account.id)).toHaveLength(1);
  });
});

describe('#369 R-4 — nam cong, moi cong mot ma, va tu choi KHONG de lai so quy', () => {
  it.each<[string, () => Partial<RecordRunExpenseCommand>, string]>([
    [
      'vong chay khong ton tai',
      () => ({ runId: 'khong-co' }),
      'NOT_FOUND:RUN_EXPENSE_RUN_NOT_FOUND',
    ],
    [
      'chang cua vong chay khac',
      () => ({ legId: world.otherLeg.id }),
      'DENIED:RUN_EXPENSE_LEG_NOT_IN_RUN',
    ],
    ['chang khong ton tai', () => ({ legId: 'khong-co' }), 'DENIED:RUN_EXPENSE_LEG_NOT_IN_RUN'],
    [
      'lai xe CHUA TUNG duoc phan cong vao vong chay',
      () => ({ driverId: OTHER_DRIVER }),
      'DENIED:RUN_EXPENSE_DRIVER_NOT_ASSIGNED',
    ],
    ['so tien 0 dong', () => ({ amount: 0 }), 'INVALID:FUND_AMOUNT_INVALID'],
    ['so tien am', () => ({ amount: -1 }), 'INVALID:MONEY_INVALID'],
  ])('%s', async (_label, patch, expected) => {
    expect(await reasonOf(world.service.recordRunExpense(command(patch()), 'ke-toan'))).toBe(
      expected,
    );
    // TRUOC `ensureAccount()`: lenh bi tu choi khong tao so quy cho ai.
    expect(await world.ledger.findAccountByDriver(OTHER_DRIVER)).toBeNull();
    expect(await world.ledger.findEntryByCorrelation('fuel:phieu-1')).toBeNull();
  });

  it('ky quy dang chot -> `RUN_EXPENSE_PERIOD_FROZEN`, khong ghi', async () => {
    const account = await world.ledger.ensureAccount(DRIVER, CLOCK());
    const period = await world.ledger.createPeriod({
      accountId: account.id,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      at: CLOCK(),
    });
    await world.ledger.setPeriodStatus(period.id, 'OPEN', 'CLOSING', { at: CLOCK(), actor: 'kt' });

    expect(await reasonOf(world.service.recordRunExpense(command(), 'ke-toan'))).toBe(
      'DENIED:RUN_EXPENSE_PERIOD_FROZEN',
    );
    expect(await world.ledger.listEntries(account.id)).toEqual([]);
  });

  it('lai xe DA BI THAY CA van ghi duoc phan cua minh — "tung", khong phai "dang"', async () => {
    const movement = new InMemoryMovementRepository();
    const run = await movement.createRun({
      code: 'RUN-369-C',
      vehicleId: 'xe-c',
      businessDate: '2026-09-23',
    });
    await movement.assignRun(run.id, {
      driverId: DRIVER,
      effectiveFrom: new Date('2026-09-23T00:00:00Z'),
      assignedBy: 'dieu-do',
    });
    await movement.assignRun(run.id, {
      driverId: OTHER_DRIVER,
      effectiveFrom: new Date('2026-09-23T02:00:00Z'),
      assignedBy: 'dieu-do',
    });
    const service = new RunExpenseService(
      world.ledger,
      new FakeCoreFacts(),
      new MovementCostingRunContextAdapter(movement),
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
      undefined,
      CLOCK,
    );
    const posted = await service.recordRunExpense(
      command({ runId: run.id, legId: null, correlationKey: 'fuel:phieu-thay-ca' }),
      'ke-toan',
    );
    expect(posted.entry.runId).toBe(run.id);
  });
});

describe('#369 R-4 — sua bang DAO, co dau vet, dung mot lan', () => {
  it('dao qua duong chung cua `TX-03`: dong DAO mang CUNG ngu canh, quy net ve 0', async () => {
    const posted = await world.service.recordRunExpense(command(), 'ke-toan');
    const reversed = await world.costing.reverseFundEntry(posted.entry.id, 'khai nham', 'ke-toan');

    expect(reversed.expense).toBeNull();
    expect(reversed.entry).toMatchObject({
      kind: 'REVERSAL',
      signedAmount: 2_100_000,
      reversalOfId: posted.entry.id,
      tripId: null,
      runId: world.run.id,
      legId: world.leg.id,
      correlationKey: 'fuel:phieu-1:reversal',
      businessDate: '2026-09-23',
    });
    expect(await balanceOf(DRIVER)).toBe(0);

    expect(await reasonOf(world.costing.reverseFundEntry(posted.entry.id, 'lan hai', 'kt'))).toBe(
      'CONFLICT:ENTRY_ALREADY_REVERSED',
    );
    // Ghi lai CUNG su kien sau khi dao KHONG sinh mot dong tien moi: khoa van la cua ban goc.
    expect(await world.service.recordRunExpense(command(), 'ke-toan')).toMatchObject({
      replayed: true,
      entry: { id: posted.entry.id },
    });
    expect(await balanceOf(DRIVER)).toBe(0);
  });
});
