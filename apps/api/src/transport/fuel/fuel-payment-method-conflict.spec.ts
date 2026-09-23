import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  LEGACY_TRIP,
  VEHICLE_A,
  buildRunFirstWorld,
  runFirstCommand,
  type RunFirstWorld,
} from './__tests__/run-first-harness.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import type { ResolveDiscrepancyInput, ResolveDiscrepancyOutcome } from './fuel.repository.js';
import type { FuelDiscrepancy, FuelEntry } from './fuel.types.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * `#371` — MOT LAN DO DAU KHONG DUOC TRA HAI LAN: Quy lai xe VA cong no cay xang.
 *
 * Hinh dang loi that ma ban ra soat doc lap do duoc tren `ec748fcc`:
 *
 * ```text
 * phieu DRIVER_CASH -> Quy lai xe tru tien (TX-03 hoac RUN_EXPENSE)
 * bang ke cay xang ghi no cung lan do -> khop (tu dong HOAC tay) -> dong ky -> cong no T5
 * ```
 *
 * Tep nay do LUAT va CHUOI THAO TAC qua DICH VU THAT, tren kho trong bo nho: so khop tu dong, xac nhan
 * khop tay, "chap nhan so cay xang", dong ky voi du lieu hong, mo lai - doi y - dong lai. Khoa hang,
 * trigger va dong thoi o `transport-fuel-payment-method-conflict.int.spec.ts`, tren Postgres THAT.
 */

const ACTOR = 'ke-toan-371';
const PERIOD = { start: '2026-09-01', end: '2026-09-30' } as const;

const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: { 'tai-5-tan': 30 }, tolerancePercent: 10 },
};

interface RecordedDecision {
  readonly point: string;
  readonly outcome: string;
  readonly reason: string;
  readonly detail?: Record<string, unknown>;
}

/**
 * Kho bi CHEN mot lenh sua phieu vao DUNG khe giua lan kiem som cua tang mien va lan ghi cua tang kho.
 * Doi tuong doi trong bo nho cua bai dong thoi tren Postgres: lan kiem som thay `SUPPLIER_ACCOUNT`,
 * nhung lan doc cua tang kho thay `DRIVER_CASH`.
 */
class RacingRepository extends InMemoryFuelRepository {
  beforeResolve: (() => Promise<void>) | null = null;

  override async resolveDiscrepancy(
    input: ResolveDiscrepancyInput,
  ): Promise<ResolveDiscrepancyOutcome> {
    const hook = this.beforeResolve;
    this.beforeResolve = null;
    if (hook) await hook();
    return super.resolveDiscrepancy(input);
  }
}

let world: RunFirstWorld;
let repository: RacingRepository;
let decisions: RecordedDecision[];
let reconciliation: FuelReconciliationService;
let odometer: number;

beforeEach(async () => {
  // Bo dung Run-first that, nhung doi kho phieu sang kho co khe chen lenh sua.
  repository = new RacingRepository();
  world = await buildRunFirstWorld({ fuelRepo: repository });
  decisions = [];
  const telemetry = {
    decision: (input: RecordedDecision) => {
      decisions.push(input);
    },
  } as unknown as TelemetryService;
  reconciliation = new FuelReconciliationService(
    repository,
    new AuditLogService(new InMemoryAuditLogRepository()),
    FUEL_POLICY,
    telemetry,
  );
  odometer = 120_000;
});

/** Odo tang dan: moi phieu la mot lan do THAT, khong mang ly do can kiem tra nao. */
const nextOdometer = () => {
  odometer += 300;
  return odometer;
};

async function declareAndVerify(patch: Parameters<typeof runFirstCommand>[1]): Promise<FuelEntry> {
  const entry = await world.fuel.submitFuelEntry(
    runFirstCommand(world, { odometerKm: nextOdometer(), invoiceNo: null, ...patch }),
    'lx.binh',
  );
  return world.fuel.verifyFuelEntry(entry.id, ACTOR);
}

const runFirstCash = (patch: Parameters<typeof runFirstCommand>[1] = {}) =>
  declareAndVerify({ paymentMethod: 'DRIVER_CASH', legId: world.loadedLeg.id, ...patch });

const legacyCash = (patch: Parameters<typeof runFirstCommand>[1] = {}) =>
  declareAndVerify({
    runId: null,
    tripId: LEGACY_TRIP,
    vehicleId: VEHICLE_A,
    paymentMethod: 'DRIVER_CASH',
    ...patch,
  });

const supplierAccount = (patch: Parameters<typeof runFirstCommand>[1] = {}) =>
  declareAndVerify({ paymentMethod: 'SUPPLIER_ACCOUNT', ...patch });

async function importStatement(
  lines: readonly { businessDate: string; amount: number; invoiceNo?: string | null }[],
) {
  const created = await repository.createStatementWithReconciliation({
    supplierId: world.supplierId,
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
    format: 'CSV',
    sourceRef: `bang-ke-371-${Math.random()}.csv`,
    sourceDigest: `digest-${Math.random()}`,
    lines: lines.map((item, index) => ({
      rowNumber: index + 1,
      status: 'ACCEPTED' as const,
      rejectReason: null,
      vehiclePlateRaw: '29H-152.44',
      vehicleId: VEHICLE_A,
      businessDate: item.businessDate,
      litersUnits: 100_000,
      amount: item.amount,
      invoiceNo: item.invoiceNo ?? null,
      note: null,
      rawValues: {},
    })),
    importedBy: ACTOR,
    at: new Date('2026-09-30T10:00:00Z'),
  });
  return {
    reconciliationId: created.reconciliation.id,
    lineIds: created.lines.map((item) => item.id),
  };
}

const matchesOf = (reconciliationId: string) => repository.listMatches(reconciliationId);
const pendingFor = async (reconciliationId: string, statementLineId: string) => {
  const found = (await repository.listDiscrepancies(reconciliationId)).find(
    (item) => item.status === 'PENDING' && item.statementLineId === statementLineId,
  );
  if (!found) throw new Error(`khong co chenh lech PENDING cho dong ${statementLineId}`);
  return found;
};

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransportDomainError) return `${error.kind}:${error.reason}`;
    throw error;
  }
  throw new Error('lenh le ra phai bi tu choi');
};

/** Quyet MOI chenh lech con treo bang `IGNORE_WITH_REASON` — de dong duoc ky. */
async function ignoreAllPending(reconciliationId: string): Promise<void> {
  for (const item of await repository.listDiscrepancies(reconciliationId)) {
    if (item.status !== 'PENDING') continue;
    await reconciliation.resolveDiscrepancy(
      item.id,
      { resolution: 'IGNORE_WITH_REASON', note: 'ngoai pham vi bai' },
      ACTOR,
    );
  }
}

/* ============================== AUTO ============================== */

describe('#371 AUTO — may so khop khong bao gio khop phieu lai xe da tra tien mat', () => {
  it('Run-first DRIVER_CASH + dong bang ke cung lan do -> KHONG khop, PAYMENT_METHOD_CONFLICT', async () => {
    const cash = await runFirstCash({ amount: 2_100_000, businessDate: '2026-09-22' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-22', amount: 2_100_000 },
    ]);

    const result = await reconciliation.runMatching(reconciliationId, ACTOR);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([
      expect.objectContaining({
        kind: 'PAYMENT_METHOD_CONFLICT',
        status: 'PENDING',
        statementLineId: lineIds[0],
        candidateEntryIds: [cash.id],
      }),
    ]);
    // Quy lai xe van DUNG MOT lenh (lan duyet), va phieu KHONG bi dua vao trang thai khop.
    expect(world.costing.driverCashCommands).toHaveLength(1);
    expect((await repository.findEntry(cash.id))?.reconciliationStatus).toBe('UNMATCHED');
    expect(decisions).toContainEqual(
      expect.objectContaining({
        point: 'fuel.match',
        outcome: 'denied',
        reason: 'MATCH_PAYMENT_METHOD_CONFLICT',
      }),
    );
  });

  it('phieu CHUYEN V1 DRIVER_CASH -> cung bi chan, TX-03 van dung mot lan', async () => {
    const cash = await legacyCash({ amount: 1_100_000, businessDate: '2026-09-14' });
    const { reconciliationId } = await importStatement([
      { businessDate: '2026-09-14', amount: 1_100_000 },
    ]);

    const result = await reconciliation.runMatching(reconciliationId, ACTOR);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies.map((item) => [item.kind, item.candidateEntryIds])).toEqual([
      ['PAYMENT_METHOD_CONFLICT', [cash.id]],
    ]);
    expect(world.costing.commands).toEqual([
      expect.objectContaining({ tripId: LEGACY_TRIP, fundedBy: 'DRIVER_FUND' }),
    ]);
  });

  it('phieu SUPPLIER_ACCOUNT dung ve moi mat -> VAN khop tuyet doi', async () => {
    const billed = await supplierAccount({ amount: 1_750_000, businessDate: '2026-09-13' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-13', amount: 1_750_000 },
    ]);

    const result = await reconciliation.runMatching(reconciliationId, ACTOR);

    expect(result.discrepancies).toEqual([]);
    expect(result.matches).toEqual([
      expect.objectContaining({
        statementLineId: lineIds[0],
        fuelEntryId: billed.id,
        origin: 'AUTO',
      }),
    ]);
  });

  it('ung vien tron (mot tien mat + mot ghi no, giong het) -> khop phieu ghi no, KHONG nhap nhang', async () => {
    const cash = await runFirstCash({ amount: 900_000, businessDate: '2026-09-15' });
    const billed = await supplierAccount({ amount: 900_000, businessDate: '2026-09-15' });
    const { reconciliationId } = await importStatement([
      { businessDate: '2026-09-15', amount: 900_000 },
    ]);

    const result = await reconciliation.runMatching(reconciliationId, ACTOR);

    expect(result.matches.map((match) => match.fuelEntryId)).toEqual([billed.id]);
    expect(result.discrepancies.map((item) => item.kind)).not.toContain('AMBIGUOUS_CANDIDATES');
    // Phieu tien mat khong len bang ke cong no — nhanh "phieu khong thay" giu nguyen nhu truoc #371.
    expect(result.discrepancies).toEqual([
      expect.objectContaining({ kind: 'FUEL_ENTRY_ONLY', fuelEntryId: cash.id }),
    ]);
  });
});

/* ============================== MANUAL ============================== */

describe('#371 MANUAL — xac nhan khop tay vao phieu tien mat bi tu choi, khong ghi gi', () => {
  it.each([
    ['Run-first', runFirstCash],
    ['chuyen v1', legacyCash],
  ] as const)(
    '%s: MATCH_CONFIRMED -> 403 MATCH_PAYMENT_METHOD_CONFLICT, KHONG cap khop',
    async (_label, make) => {
      const cash = await make({ amount: 2_100_000, businessDate: '2026-09-22' });
      const { reconciliationId, lineIds } = await importStatement([
        { businessDate: '2026-09-22', amount: 2_100_000 },
      ]);
      await reconciliation.runMatching(reconciliationId, ACTOR);
      const pending = await pendingFor(reconciliationId, lineIds[0]!);
      const lineBefore = (await repository.listStatementLines(pending.reconciliationId))[0];

      expect(
        await reasonOf(
          reconciliation.resolveDiscrepancy(
            pending.id,
            { resolution: 'MATCH_CONFIRMED', statementLineId: lineIds[0], fuelEntryId: cash.id },
            ACTOR,
          ),
        ),
      ).toBe('DENIED:MATCH_PAYMENT_METHOD_CONFLICT');

      expect(await matchesOf(reconciliationId)).toEqual([]);
      expect((await repository.findDiscrepancy(pending.id))?.status).toBe('PENDING');
      expect((await repository.listStatementLines(pending.reconciliationId))[0]).toEqual(
        lineBefore,
      );
      expect((await repository.findEntry(cash.id))?.reconciliationStatus).toBe('UNMATCHED');
      expect(decisions).toContainEqual(
        expect.objectContaining({
          point: 'fuel.match',
          reason: 'MATCH_PAYMENT_METHOD_CONFLICT',
          detail: expect.objectContaining({ fuelEntryId: cash.id, checkedUnderLock: false }),
        }),
      );
    },
  );

  /**
   * TANG KHO tu dung vung, khong nho lan kiem som cua dich vu: goi thang `resolveDiscrepancy` voi mot
   * cap khop tay vao phieu tien mat -> ket cuc CO KIEU, va khong mot hang nao doi.
   */
  it('tang kho tu choi ngay ca khi bi goi thang, bo qua dich vu', async () => {
    const cash = await runFirstCash({ amount: 700_000, businessDate: '2026-09-20' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-20', amount: 700_000 },
    ]);
    await reconciliation.runMatching(reconciliationId, ACTOR);
    const pending = await pendingFor(reconciliationId, lineIds[0]!);

    const outcome = await repository.resolveDiscrepancy({
      reconciliationId,
      discrepancyId: pending.id,
      resolution: 'MATCH_CONFIRMED',
      resolutionNote: null,
      actor: ACTOR,
      at: new Date('2026-09-30T11:00:00Z'),
      confirmedMatch: {
        statementLineId: lineIds[0]!,
        fuelEntryId: cash.id,
        amountDeltaVnd: 0,
        businessDateDeltaDays: 0,
        origin: 'MANUAL',
      },
      lineStatus: { id: lineIds[0]!, status: 'MATCHED' },
      entryStatus: { id: cash.id, status: 'MATCHED' },
      stateWhenSettled: 'RESOLVED',
    });

    expect(outcome).toEqual({
      kind: 'MATCH_PAYMENT_METHOD_CONFLICT',
      fuelEntryId: cash.id,
      paymentMethod: 'DRIVER_CASH',
    });
    expect(await matchesOf(reconciliationId)).toEqual([]);
    expect((await repository.findDiscrepancy(pending.id))?.status).toBe('PENDING');
    expect((await repository.findEntry(cash.id))?.reconciliationStatus).toBe('UNMATCHED');
  });

  /**
   * LAN KIEM SOM KHONG PHAI RANH GIOI: phieu con `SUPPLIER_ACCOUNT` luc dich vu kiem, roi bi sua sang
   * `DRIVER_CASH` TRUOC lan ghi. Lan doc cua tang kho bat duoc, va trace noi ro lop nao da chan.
   */
  it('phieu bi sua sang tien mat GIUA lan kiem som va lan ghi -> tang kho chan', async () => {
    const declared = await world.fuel.submitFuelEntry(
      runFirstCommand(world, {
        paymentMethod: 'SUPPLIER_ACCOUNT',
        amount: 650_000,
        businessDate: '2026-09-21',
        odometerKm: nextOdometer(),
        invoiceNo: null,
      }),
      'lx.binh',
    );
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-21', amount: 650_000 },
    ]);
    await reconciliation.runMatching(reconciliationId, ACTOR);
    // Phieu con `DECLARED` nen khong vao vong so khop: dong ra `STATEMENT_LINE_ONLY`.
    const pending = await pendingFor(reconciliationId, lineIds[0]!);
    expect(pending.kind).toBe('STATEMENT_LINE_ONLY');

    repository.beforeResolve = async () => {
      const current = (await repository.findEntry(declared.id))!;
      const amended = await repository.amendEntry(
        declared.id,
        { verification: 'DECLARED', lockedReconciliation: ['MATCHED', 'SETTLED'] },
        {
          litersUnits: current.litersUnits,
          amount: current.amount,
          odometerKm: current.odometerKm,
          previousOdometerKm: current.previousOdometerKm,
          consumptionUnits: current.consumptionUnits,
          reviewReasons: current.reviewReasons,
          businessDate: current.businessDate,
          occurredAt: new Date(current.occurredAt),
          supplierId: current.supplierId,
          stationId: current.stationId,
          paymentMethod: 'DRIVER_CASH',
          invoiceNo: current.invoiceNo,
          note: current.note,
          at: new Date('2026-09-30T11:30:00Z'),
        },
      );
      expect(amended?.paymentMethod).toBe('DRIVER_CASH');
    };

    expect(
      await reasonOf(
        reconciliation.resolveDiscrepancy(
          pending.id,
          { resolution: 'MATCH_CONFIRMED', statementLineId: lineIds[0], fuelEntryId: declared.id },
          ACTOR,
        ),
      ),
    ).toBe('DENIED:MATCH_PAYMENT_METHOD_CONFLICT');
    expect(await matchesOf(reconciliationId)).toEqual([]);
    expect((await repository.findDiscrepancy(pending.id))?.status).toBe('PENDING');
    expect(decisions).toContainEqual(
      expect.objectContaining({
        reason: 'MATCH_PAYMENT_METHOD_CONFLICT',
        detail: expect.objectContaining({ fuelEntryId: declared.id, checkedUnderLock: true }),
      }),
    );
  });

  it('xac nhan khop tay vao phieu GHI NO dung van ghi duoc — khong chan qua tay', async () => {
    const billed = await world.fuel.submitFuelEntry(
      runFirstCommand(world, {
        amount: 640_000,
        businessDate: '2026-09-19',
        odometerKm: nextOdometer(),
        invoiceNo: null,
      }),
      'lx.binh',
    );
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-19', amount: 640_000 },
    ]);
    await reconciliation.runMatching(reconciliationId, ACTOR);
    const pending = await pendingFor(reconciliationId, lineIds[0]!);

    await reconciliation.resolveDiscrepancy(
      pending.id,
      { resolution: 'MATCH_CONFIRMED', statementLineId: lineIds[0], fuelEntryId: billed.id },
      ACTOR,
    );
    expect(await matchesOf(reconciliationId)).toEqual([
      expect.objectContaining({ fuelEntryId: billed.id, origin: 'MANUAL' }),
    ]);
  });
});

/* ============================== ACCEPT ============================== */

describe('#371 ACCEPT — dong phieu tien mat khong thanh cong no bang "chap nhan so cay xang"', () => {
  it('ACCEPT_SUPPLIER_AMOUNT tren PAYMENT_METHOD_CONFLICT -> 403, chenh lech van treo', async () => {
    await runFirstCash({ amount: 2_100_000, businessDate: '2026-09-22' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-22', amount: 2_100_000 },
    ]);
    await reconciliation.runMatching(reconciliationId, ACTOR);
    const pending = await pendingFor(reconciliationId, lineIds[0]!);

    expect(
      await reasonOf(
        reconciliation.resolveDiscrepancy(
          pending.id,
          { resolution: 'ACCEPT_SUPPLIER_AMOUNT', note: 'cay xang noi da ghi no' },
          ACTOR,
        ),
      ),
    ).toBe('DENIED:DISCREPANCY_CASH_PAID_NOT_PAYABLE');
    expect((await repository.findDiscrepancy(pending.id))?.status).toBe('PENDING');
    expect(await reasonOf(reconciliation.closeReconciliation(reconciliationId, ACTOR))).toBe(
      'DENIED:RECONCILIATION_HAS_PENDING_DISCREPANCY',
    );
  });

  it.each(['REJECT_SUPPLIER_LINE', 'IGNORE_WITH_REASON', 'ENTRY_CORRECTION_REQUIRED'] as const)(
    '%s duoc — va dong ky KHONG dua dong tien mat vao cong no',
    async (resolution) => {
      const billed = await supplierAccount({ amount: 1_750_000, businessDate: '2026-09-13' });
      await runFirstCash({ amount: 2_100_000, businessDate: '2026-09-22' });
      const { reconciliationId, lineIds } = await importStatement([
        { businessDate: '2026-09-13', amount: 1_750_000 },
        { businessDate: '2026-09-22', amount: 2_100_000 },
      ]);
      await reconciliation.runMatching(reconciliationId, ACTOR);
      const cashLine = await pendingFor(reconciliationId, lineIds[1]!);

      await reconciliation.resolveDiscrepancy(
        cashLine.id,
        { resolution, note: 'da tra tien mat' },
        ACTOR,
      );
      const closed = await reconciliation.closeReconciliation(reconciliationId, ACTOR);

      expect(closed.handoff).toMatchObject({
        revision: 1,
        acceptedAmount: 1_750_000,
        acceptedLineCount: 1,
        acceptedLineIds: [lineIds[0]],
      });
      expect((await matchesOf(reconciliationId)).map((match) => match.fuelEntryId)).toEqual([
        billed.id,
      ]);
    },
  );
});

/* ============================== CLOSE ============================== */

describe('#371 DONG KY — luoi cuoi: du lieu hong KHONG duoc lang le thanh cong no', () => {
  /**
   * Dung lai du lieu HONG cua truoc `#371`: bo so khop cu da ghi mot cap `AUTO` toi phieu tien mat.
   * Kho trong bo nho khong co trigger, nen ghi thang qua `applyMatchingRun` la dung "duong ghi khong
   * qua tang mien". Tren Postgres, bai int tat trigger trong mot giao dich de dung dung trang thai nay.
   */
  async function plantCashMatch() {
    const billed = await supplierAccount({ amount: 1_750_000, businessDate: '2026-09-13' });
    const cash = await runFirstCash({ amount: 2_100_000, businessDate: '2026-09-22' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-13', amount: 1_750_000 },
      { businessDate: '2026-09-22', amount: 2_100_000 },
    ]);
    const applied = await repository.applyMatchingRun({
      reconciliationId,
      matches: [
        {
          statementLineId: lineIds[0]!,
          fuelEntryId: billed.id,
          amountDeltaVnd: 0,
          businessDateDeltaDays: 0,
          origin: 'AUTO',
        },
        {
          statementLineId: lineIds[1]!,
          fuelEntryId: cash.id,
          amountDeltaVnd: 0,
          businessDateDeltaDays: 0,
          origin: 'AUTO',
        },
      ],
      discrepancies: [],
      lineStatuses: new Map([
        [lineIds[0]!, 'MATCHED' as const],
        [lineIds[1]!, 'MATCHED' as const],
      ]),
      entryStatuses: new Map([
        [billed.id, 'MATCHED' as const],
        [cash.id, 'MATCHED' as const],
      ]),
      stateAfterRun: { whenPending: 'MATCHING', whenSettled: 'RESOLVED' },
      actor: 'bo-so-khop-cu',
      at: new Date('2026-09-30T10:30:00Z'),
    });
    expect(applied).toMatchObject({ kind: 'APPLIED', state: 'RESOLVED' });
    return { billed, cash, reconciliationId, lineIds };
  }

  it('cap AUTO hong -> tu choi dong, KHONG ban giao, KHONG SETTLED, ky giu nguyen', async () => {
    const { cash, reconciliationId, lineIds } = await plantCashMatch();

    expect(await reasonOf(reconciliation.closeReconciliation(reconciliationId, ACTOR))).toBe(
      'DENIED:RECONCILIATION_HAS_CASH_PAID_MATCH',
    );
    expect(await repository.findHandoff(reconciliationId)).toBeNull();
    expect((await repository.findReconciliation(reconciliationId))?.state).toBe('RESOLVED');
    expect(
      (
        await repository.listStatementLines(
          (await repository.findReconciliation(reconciliationId))!.statementId,
        )
      ).map((item) => item.reconciliationStatus),
    ).toEqual(['MATCHED', 'MATCHED']);
    expect((await repository.findEntry(cash.id))?.reconciliationStatus).toBe('MATCHED');
    expect(decisions).toContainEqual(
      expect.objectContaining({
        point: 'fuel_reconciliation.transition',
        outcome: 'denied',
        reason: 'RECONCILIATION_HAS_CASH_PAID_MATCH',
        detail: expect.objectContaining({
          fuelEntryIds: [cash.id],
          statementLineIds: [lineIds[1]],
        }),
      }),
    );
  });

  /**
   * DUONG RA cua cap `AUTO` hong: chay lai so khop. Bo so khop moi xoa cap may cu, KHONG de nghi lai
   * no, va hoi nguoi bang mot chenh lech co ten. Dong ky sau do chi mang dong ghi no.
   */
  it('chay lai so khop lam sach cap AUTO hong -> hoi nguoi -> dong ky chi mang dong ghi no', async () => {
    const { billed, cash, reconciliationId, lineIds } = await plantCashMatch();

    const rerun = await reconciliation.runMatching(reconciliationId, ACTOR);
    expect(rerun.matches.map((match) => match.fuelEntryId)).toEqual([billed.id]);
    expect(rerun.discrepancies).toEqual([
      expect.objectContaining({
        kind: 'PAYMENT_METHOD_CONFLICT',
        statementLineId: lineIds[1],
        candidateEntryIds: [cash.id],
      }),
    ]);

    await ignoreAllPending(reconciliationId);
    const closed = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    expect(closed.handoff).toMatchObject({
      acceptedAmount: 1_750_000,
      acceptedLineIds: [lineIds[0]],
    });
    expect(world.costing.driverCashCommands).toHaveLength(1);
  });

  /** Cap `MANUAL` hong KHONG bi lan chay lai xoa (cong cua nguoi) — nen lenh dong van tu choi. */
  it('cap MANUAL hong: chay lai khong xoa, dong ky VAN tu choi (dong chat, khong doan)', async () => {
    const cash = await runFirstCash({ amount: 2_100_000, businessDate: '2026-09-22' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-22', amount: 2_100_000 },
    ]);
    await repository.applyMatchingRun({
      reconciliationId,
      matches: [
        {
          statementLineId: lineIds[0]!,
          fuelEntryId: cash.id,
          amountDeltaVnd: 0,
          businessDateDeltaDays: 0,
          origin: 'MANUAL',
        },
      ],
      discrepancies: [],
      lineStatuses: new Map([[lineIds[0]!, 'MATCHED' as const]]),
      entryStatuses: new Map([[cash.id, 'MATCHED' as const]]),
      stateAfterRun: { whenPending: 'MATCHING', whenSettled: 'RESOLVED' },
      actor: 'nguoi-khop-tay-truoc-371',
      at: new Date('2026-09-30T10:30:00Z'),
    });

    await reconciliation.runMatching(reconciliationId, ACTOR);
    expect(await matchesOf(reconciliationId)).toEqual([
      expect.objectContaining({ fuelEntryId: cash.id, origin: 'MANUAL' }),
    ]);
    expect(await reasonOf(reconciliation.closeReconciliation(reconciliationId, ACTOR))).toBe(
      'DENIED:RECONCILIATION_HAS_CASH_PAID_MATCH',
    );
    expect(await repository.findHandoff(reconciliationId)).toBeNull();
  });
});

/* ======================= MO LAI - DOI Y - DONG LAI ======================= */

describe('#371 mo lai / doi y / dong lai — bat bien giu nguyen', () => {
  it('cong no hop le DUNG MOT lan; doi y sang ACCEPT bi chan; doi y hop le khong doi tong', async () => {
    const billed = await supplierAccount({ amount: 1_750_000, businessDate: '2026-09-13' });
    const cash = await runFirstCash({ amount: 2_100_000, businessDate: '2026-09-22' });
    const { reconciliationId, lineIds } = await importStatement([
      { businessDate: '2026-09-13', amount: 1_750_000 },
      { businessDate: '2026-09-22', amount: 2_100_000 },
    ]);
    await reconciliation.runMatching(reconciliationId, ACTOR);
    await ignoreAllPending(reconciliationId);
    const first = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    expect(first.handoff).toMatchObject({ revision: 1, acceptedAmount: 1_750_000 });

    await reconciliation.reopenReconciliation(reconciliationId, 'soat lai dong tien mat', ACTOR);
    const decision = (await repository.listDiscrepancies(reconciliationId)).find(
      (item: FuelDiscrepancy) => item.statementLineId === lineIds[1],
    )!;
    expect(decision).toMatchObject({
      kind: 'PAYMENT_METHOD_CONFLICT',
      resolution: 'IGNORE_WITH_REASON',
    });

    expect(
      await reasonOf(
        reconciliation.reviseDiscrepancyDecision(
          decision.id,
          { resolution: 'ACCEPT_SUPPLIER_AMOUNT', reason: 'cay xang doi tien' },
          ACTOR,
        ),
      ),
    ).toBe('DENIED:DECISION_CASH_PAID_NOT_PAYABLE');

    const revised = await reconciliation.reviseDiscrepancyDecision(
      decision.id,
      { resolution: 'REJECT_SUPPLIER_LINE', reason: 'cay xang ghi no nham lan tra tien mat' },
      ACTOR,
    );
    expect(revised.revision).toMatchObject({
      resolution: 'REJECT_SUPPLIER_LINE',
      supersedesId: decision.id,
    });

    // Chay lai so khop sau khi mo ky: phieu tien mat VAN khong thanh cap khop.
    await reconciliation.runMatching(reconciliationId, ACTOR);
    await ignoreAllPending(reconciliationId);
    expect((await matchesOf(reconciliationId)).map((match) => match.fuelEntryId)).toEqual([
      billed.id,
    ]);

    const reclosed = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
    // Ket qua kinh te KHONG doi -> phat lai ban cu, khong them ban sua doi.
    expect(reclosed.handoff.id).toBe(first.handoff.id);
    expect(await repository.listHandoffRevisions(reconciliationId)).toHaveLength(1);
    expect(
      world.costing.driverCashCommands.filter((item) => item.correlationKey === `fuel:${cash.id}`),
    ).toHaveLength(1);
  });
});
