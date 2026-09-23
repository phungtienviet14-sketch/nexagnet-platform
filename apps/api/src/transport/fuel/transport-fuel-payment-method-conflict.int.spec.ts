import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PrismaSettlementRepository } from '../settlement/prisma-settlement.repository.js';
import { SettlementOrderCompletionGate } from '../settlement/settlement-order-completion.port.js';
import {
  FuelSettlementSourceAdapter,
  SettlementCoreFactsAdapter,
} from '../settlement/settlement.ports.js';
import { SettlementService } from '../settlement/settlement.service.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import { FileFuelStatementSource } from './fuel-statement-source.js';
import { FuelStatementService } from './fuel-statement.service.js';
import { deleteFuelDiscrepanciesForTest } from './fuel-test-cleanup.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import {
  FuelService,
  type AmendFuelEntryCommand,
  type SubmitFuelEntryCommand,
} from './fuel.service.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';

/**
 * `#371` — MOT LAN DO DAU, MOT LAN TRA, tren Postgres THAT.
 *
 * Loi P1 do tren `ec748fcc`: phieu `DRIVER_CASH` da vao Quy lai xe van khop duoc (tu dong hoac tay)
 * voi bang ke cong no cay xang, dong ky, va sinh cong no nha cung cap — tra hai lan.
 *
 * ```text
 * AUTO     phieu tien mat (Run-first VA chuyen v1) khong thanh cap khop -> PAYMENT_METHOD_CONFLICT
 *          phieu ghi no dung van khop; ung vien tron khong nhap nhang gia
 * MANUAL   xac nhan khop tay vao phieu tien mat -> 403, khong mot hang nao doi (ca khi goi thang kho)
 * ACCEPT   "chap nhan so cay xang" tren dong tien mat -> 403 (cung duong tra hai lan)
 * CSDL     hai trigger chan cap khop / doi cach tra, va loi do duoc dich thanh ma nghiep vu
 * DONG KY  cong no hop le DUNG MOT lan; du lieu hong -> tu choi dong, KHONG cong no
 * DONG THOI ep thu tu bang khoa hang phieu: xac nhan khop tay VS sua phieu sang tien mat
 * DOI CHUNG AM  hai trigger KHONG du — ghi-lech lot qua ca hai; khoa hang phieu moi la cai chan
 * ```
 *
 * TIEN TO RIENG (`tien-to-fixture-it-khong-duoc-long-nhau`): `IT-F371P-`, so dien thoai `0999F371P`.
 * Don o `beforeAll` VA `afterAll`.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Cong no cay xang khong nhan phieu lai xe da tra tien mat tren Postgres THAT — #371',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const settlementRepo = new PrismaSettlementRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const movement = new PrismaMovementRepository(prisma);

    const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
    const COSTING_POLICY: TransportCostingPolicy = {
      expenseCategories: [],
      advanceApprovalRequired: false,
    };
    const FUEL_POLICY: TransportFuelPolicy = {
      matching: { amountVnd: 1_000, businessDateDays: 1 },
      statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
      consumption: { normsByVehicleClass: {}, tolerancePercent: 10 },
    };

    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const core = new TransportCoreFactsAdapter(trips, fleet);
    const costing = new CostingService(costingRepo, core, audit, CORE_POLICY, COSTING_POLICY);
    const runExpenses = new RunExpenseService(
      costingRepo,
      core,
      new MovementCostingRunContextAdapter(movement),
      audit,
      CORE_POLICY,
    );
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      new MovementFuelRunContextAdapter(movement),
      new CostingFuelExpenseAdapter(costing, runExpenses),
      audit,
      CORE_POLICY,
      FUEL_POLICY,
    );
    const statements = new FuelStatementService(
      fuelRepo,
      new FileFuelStatementSource(),
      fuelCore,
      audit,
      FUEL_POLICY,
    );
    const decisions: { reason: string; detail?: Record<string, unknown> }[] = [];
    const reconciliation = new FuelReconciliationService(fuelRepo, audit, FUEL_POLICY, {
      decision: (input: { reason: string; detail?: Record<string, unknown> }) => {
        decisions.push(input);
      },
    } as unknown as TelemetryService);

    /** Duong cay xang KHONG hoi cong ket thuc don — ban gia nay NEM neu bi hoi (khuon `#295` P0). */
    class UnusedCompletionGate extends SettlementOrderCompletionGate {
      eligibilityForTrip(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }

      eligibilityForOrder(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }
    }
    const settlement = new SettlementService(
      settlementRepo,
      new SettlementCoreFactsAdapter(trips),
      new FuelSettlementSourceAdapter(fuelRepo),
      new UnusedCompletionGate(),
    );

    const PREFIX = 'IT-F371P';
    const PHONE_PREFIX = '0999F371P';
    const ACTOR = 'it-f371p-ke-toan';
    const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

    const state = {
      main: '', // cay xang cua ky chinh (AUTO / MANUAL / ACCEPT / dong ky)
      skew: '', // cay xang cua doi chung am ghi-lech + du lieu hong
      race: '', // cay xang cua bai dong thoi
      driverA: '',
      driverB: '',
      vehicleA: '',
      vehicleB: '',
      runA: '',
      legA: '',
      runB: '',
      legB: '',
      tripA: '',
      // Ky chinh
      recMain: '',
      p1RunFirstCash: '',
      p2LegacyCash: '',
      p3Billed: '',
      p4CashTwin: '',
      p5BilledTwin: '',
      l1: '',
      l2: '',
      l3: '',
      l4: '',
    };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: `${PREFIX}-CX` } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);
      const recons = await prisma.transportFuelReconciliation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const reconIds = recons.map((row) => row.id);

      await prisma.transportSettlementFuelHandoffCursor.deleteMany({
        where: { reconciliationId: { in: reconIds } },
      });
      for (const kind of ['ADJUSTMENT', 'REVERSAL', 'ORIGINAL'] as const) {
        await prisma.transportSettlementDocument.deleteMany({
          where: { counterpartyId: { in: supplierIds }, kind },
        });
      }
      await prisma.transportFuelSettlementHandoff.deleteMany({
        where: { reconciliationId: { in: reconIds } },
      });
      await prisma.transportFuelMatch.deleteMany({ where: { reconciliationId: { in: reconIds } } });
      await deleteFuelDiscrepanciesForTest(prisma, reconIds);
      await prisma.transportFuelReconciliation.deleteMany({ where: { id: { in: reconIds } } });
      const statementRows = await prisma.transportFuelSupplierStatement.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const statementIds = statementRows.map((row) => row.id);
      await prisma.transportFuelStatementLine.deleteMany({
        where: { statementId: { in: statementIds } },
      });
      const entries = await prisma.transportFuelEntry.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      await prisma.transportFuelReceiptEvidence.deleteMany({
        where: { fuelEntryId: { in: entries.map((row) => row.id) } },
      });
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplierStatement.deleteMany({
        where: { id: { in: statementIds } },
      });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

      const owned = await prisma.transportTrip.findMany({
        where: { code: { startsWith: PREFIX } },
        select: { id: true },
      });
      const tripIds = owned.map((row) => row.id);
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      await prisma.transportDriverFundEntry.deleteMany({
        where: { accountId: { in: accountIds }, kind: 'REVERSAL' },
      });
      await prisma.transportDriverFundEntry.deleteMany({
        where: { accountId: { in: accountIds } },
      });
      await prisma.transportDriverFundPeriod.deleteMany({
        where: { accountId: { in: accountIds } },
      });
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });

      const runs = await prisma.transportVehicleRun.findMany({
        where: { code: { startsWith: `${PREFIX}-RUN` } },
        select: { id: true },
      });
      const runIds = runs.map((row) => row.id);
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: `${PREFIX}-XE` } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
      try {
        await promise;
      } catch (error) {
        if (error instanceof TransportDomainError) return `${error.kind}:${error.reason}`;
        throw error;
      }
      throw new Error('lenh le ra phai bi tu choi');
    };

    /** Ket cuc cua mot lenh dua — bat NGAY khi gai (`int-spec-racer-phai-bat-ket-cuc-ngay`). */
    const settle = (promise: Promise<unknown>): Promise<string> =>
      promise.then(
        () => 'OK',
        (error: unknown) =>
          error instanceof TransportDomainError
            ? `${error.kind}:${error.reason}`
            : `LOI:${String(error)}`,
      );

    let odometer = 400_000;
    const command = (patch: Partial<SubmitFuelEntryCommand>): SubmitFuelEntryCommand => {
      odometer += 300;
      return {
        runId: state.runA,
        legId: state.legA,
        driverId: state.driverA,
        supplierId: state.main,
        liters: '80',
        amount: 1_000_000,
        odometerKm: odometer,
        occurredAt: '2026-09-12T08:00:00+07:00',
        businessDate: '2026-09-12',
        paymentMethod: 'SUPPLIER_ACCOUNT',
        invoiceNo: null,
        note: null,
        correlationKey: `${PREFIX}-${randomUUID()}`,
        ...patch,
      };
    };

    const declare = (patch: Partial<SubmitFuelEntryCommand>) =>
      fuel.submitFuelEntry(command(patch), 'lx.it');
    const declareVerified = async (patch: Partial<SubmitFuelEntryCommand>) =>
      fuel.verifyFuelEntry((await declare(patch)).id, ACTOR);

    async function importCsv(supplierId: string, rows: readonly string[]) {
      const csv = ['Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu', ...rows].join('\n');
      const imported = await statements.commitImport(
        {
          supplierId,
          periodStart: PERIOD.start,
          periodEnd: PERIOD.end,
          filename: `it-f371p-${randomUUID()}.csv`,
          format: 'CSV',
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        },
        ACTOR,
      );
      // Theo `rowNumber`: thu tu dong trong file la thu tu bai test dat ten cho chung.
      const lineIds = [...imported.lines]
        .sort((left, right) => left.rowNumber - right.rowNumber)
        .map((line) => line.id);
      return { reconciliationId: imported.reconciliation.id, lineIds };
    }

    const pendingFor = async (reconciliationId: string, statementLineId: string) => {
      const found = (await fuelRepo.listDiscrepancies(reconciliationId)).find(
        (item) => item.status === 'PENDING' && item.statementLineId === statementLineId,
      );
      if (!found) throw new Error(`khong co chenh lech PENDING cho dong ${statementLineId}`);
      return found;
    };

    async function resolveAllPending(
      reconciliationId: string,
      resolution: 'IGNORE_WITH_REASON' | 'REJECT_SUPPLIER_LINE' = 'IGNORE_WITH_REASON',
    ): Promise<void> {
      for (const item of await fuelRepo.listDiscrepancies(reconciliationId)) {
        if (item.status !== 'PENDING') continue;
        await reconciliation.resolveDiscrepancy(item.id, { resolution, note: 'it #371' }, ACTOR);
      }
    }

    /** Cap khop cua mot ky toi phieu KHONG ghi no — doc THANG CSDL, pham vi theo ky cua fixture. */
    const cashPaidMatchCount = (reconciliationId: string) =>
      prisma.transportFuelMatch.count({
        where: { reconciliationId, fuelEntry: { paymentMethod: { not: 'SUPPLIER_ACCOUNT' } } },
      });

    const fundEntriesOf = (fuelEntryId: string) =>
      prisma.transportDriverFundEntry.findMany({
        where: { correlationKey: { startsWith: `fuel:${fuelEntryId}` } },
        select: { kind: true, signedAmount: true },
      });

    const supplierDocuments = (supplierId: string) =>
      prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: supplierId, flow: 'FUEL_SUPPLIER' },
      });

    /* ------------------------------------------------------------------ *
     * Khoa hang PHIEU trong mot giao dich rieng + doi chuoi chan (khuon D4 cua #369)
     * ------------------------------------------------------------------ */

    function holdEntryLock(fuelEntryId: string): {
      locked: Promise<number>;
      release: () => void;
      done: Promise<void>;
    } {
      let signalLocked = (_pid: number): void => {};
      let release = (): void => {};
      const locked = new Promise<number>((resolve) => {
        signalLocked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = prisma.$transaction(
        async (tx) => {
          const [self] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          await tx.$executeRaw`SELECT "id" FROM "TransportFuelEntry" WHERE "id" = ${fuelEntryId} FOR UPDATE`;
          signalLocked(Number(self!.pid));
          await gate;
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      return { locked, release, done };
    }

    /**
     * Cho toi khi `count` phien nam trong CHUOI CHAN cua giao dich `holderPid` — CTE de quy, vi phien
     * cho THU HAI bi phien thu nhat chan chu khong truc tiep bi giao dich giu khoa
     * (`pg-blocking-pids-la-chuoi-nhieu-bac`). Loc theo pid: CSDL dung chung voi tep khac.
     */
    async function waitForBlockedBy(holderPid: number, count: number): Promise<void> {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          WITH RECURSIVE chain(pid) AS (
            SELECT ${holderPid}::int
            UNION
            SELECT activity.pid
            FROM pg_stat_activity activity
            JOIN chain ON chain.pid = ANY(pg_blocking_pids(activity.pid))
          )
          SELECT count(*) - 1 AS n FROM chain`;
        if (Number(rows[0]?.n ?? 0) >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Khong thay ${count} phien trong chuoi chan cua giao dich ${holderPid}`);
    }

    /** Lenh SUA cua lai xe: giu nguyen moi so, chi doi cach tra sang tien mat. */
    const amendToCash = async (fuelEntryId: string): Promise<AmendFuelEntryCommand> => {
      const current = (await fuelRepo.findEntry(fuelEntryId))!;
      return {
        supplierId: current.supplierId,
        liters: '70',
        amount: current.amount,
        odometerKm: current.odometerKm,
        occurredAt: current.occurredAt,
        businessDate: current.businessDate,
        paymentMethod: 'DRIVER_CASH',
        invoiceNo: current.invoiceNo,
        note: 'lai xe sua: da tra tien mat',
      };
    };

    beforeAll(async () => {
      await cleanup();

      for (const [key, code] of [
        ['main', 'CX1'],
        ['skew', 'CX2'],
        ['race', 'CX3'],
      ] as const) {
        state[key] = (
          await fuelRepo.createSupplier({
            name: `Cay xang IT #371 ${code}`,
            code: `${PREFIX}-${code}`,
            phone: null,
            address: null,
            taxCode: null,
            at: new Date('2026-09-01T00:00:00Z'),
          })
        ).id;
      }
      for (const [key, suffix] of [
        ['driverA', 'A'],
        ['driverB', 'B'],
      ] as const) {
        state[key] = (
          await fleet.createDriver({
            fullName: `IT F371P Lai xe ${suffix}`,
            phone: `${PHONE_PREFIX}${suffix}`,
            licenceClass: 'C',
            licenceExpiry: '2030-01-01',
            authUserId: null,
          })
        ).id;
      }
      for (const [key, suffix] of [
        ['vehicleA', 'A'],
        ['vehicleB', 'B'],
      ] as const) {
        state[key] = (
          await fleet.createVehicle({
            registrationPlate: `${PREFIX}-XE-${suffix}`,
            vehicleClass: 'tai-5-tan',
            allowedPayloadKg: 5_000,
          })
        ).id;
      }

      for (const [runKey, legKey, vehicleKey, driverKey, suffix] of [
        ['runA', 'legA', 'vehicleA', 'driverA', 'A'],
        ['runB', 'legB', 'vehicleB', 'driverB', 'B'],
      ] as const) {
        const run = await movement.createRun({
          code: `${PREFIX}-RUN-${suffix}`,
          vehicleId: state[vehicleKey],
          businessDate: '2026-09-12',
        });
        state[runKey] = run.id;
        state[legKey] = (
          await movement.createLeg({
            runId: run.id,
            sequence: 1,
            kind: 'LOADED',
            orderId: null,
            originLabel: `Kho ${suffix}1`,
            destinationLabel: `Kho ${suffix}2`,
            businessDate: '2026-09-12',
          })
        ).id;
        await movement.assignRun(run.id, {
          driverId: state[driverKey],
          effectiveFrom: new Date('2026-09-01T00:00:00Z'),
          assignedBy: ACTOR,
        });
      }

      state.tripA = (
        await trips.create({
          code: `${PREFIX}-CHUYEN`,
          kind: 'OWN_DIRECT',
          businessDate: '2026-09-14',
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 9_000_000,
          distanceKm: 120,
        })
      ).id;
      await trips.assign(state.tripA, {
        vehicleId: state.vehicleA,
        driverId: state.driverA,
        assignedBy: ACTOR,
        at: new Date('2026-09-14T00:00:00Z'),
      });
      for (const driverKey of ['driverA', 'driverB'] as const) {
        await costing.postAdvance(
          {
            driverId: state[driverKey],
            amount: 10_000_000,
            businessDate: '2026-09-01',
            correlationKey: `${PREFIX}-tam-ung-${driverKey}`,
          },
          ACTOR,
        );
      }

      // KY CHINH — bon phieu tien mat/ghi no, bon dong bang ke. Moi dong phuc vu mot cau hoi.
      state.p1RunFirstCash = (
        await declareVerified({
          paymentMethod: 'DRIVER_CASH',
          amount: 2_100_000,
          businessDate: '2026-09-12',
          occurredAt: '2026-09-12T08:00:00+07:00',
        })
      ).id;
      state.p3Billed = (
        await declareVerified({
          amount: 1_750_000,
          businessDate: '2026-09-13',
          occurredAt: '2026-09-13T08:00:00+07:00',
        })
      ).id;
      state.p2LegacyCash = (
        await declareVerified({
          runId: null,
          legId: null,
          tripId: state.tripA,
          vehicleId: state.vehicleA,
          paymentMethod: 'DRIVER_CASH',
          amount: 1_100_000,
          businessDate: '2026-09-14',
          occurredAt: '2026-09-14T08:00:00+07:00',
        })
      ).id;
      odometer = 60_000;
      const onRunB = {
        runId: state.runB,
        legId: state.legB,
        driverId: state.driverB,
        amount: 900_000,
        businessDate: '2026-09-15',
      };
      state.p4CashTwin = (
        await declareVerified({
          ...onRunB,
          paymentMethod: 'DRIVER_CASH',
          occurredAt: '2026-09-15T07:00:00+07:00',
        })
      ).id;
      state.p5BilledTwin = (
        await declareVerified({ ...onRunB, occurredAt: '2026-09-15T15:00:00+07:00' })
      ).id;

      const plateA = `${PREFIX}-XE-A`;
      const plateB = `${PREFIX}-XE-B`;
      const imported = await importCsv(state.main, [
        `${plateA},2026-09-12,90,2.100.000,,`,
        `${plateA},2026-09-14,50,1.100.000,,`,
        `${plateA},2026-09-13,80,1.750.000,,`,
        `${plateB},2026-09-15,40,900.000,,`,
      ]);
      state.recMain = imported.reconciliationId;
      [state.l1, state.l2, state.l3, state.l4] = imported.lineIds as [
        string,
        string,
        string,
        string,
      ];
    }, 120_000);

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, 120_000);

    /* ============================== AUTO ============================== */

    it('PMC-IT-01 — AUTO: tien mat (Run-first + chuyen v1) KHONG khop; ghi no khop; ung vien tron khong nhap nhang', async () => {
      const result = await reconciliation.runMatching(state.recMain, ACTOR);

      expect(
        result.matches.map((match) => [match.statementLineId, match.fuelEntryId, match.origin]),
      ).toEqual(
        expect.arrayContaining([
          [state.l3, state.p3Billed, 'AUTO'],
          [state.l4, state.p5BilledTwin, 'AUTO'],
        ]),
      );
      expect(result.matches).toHaveLength(2);
      expect(await cashPaidMatchCount(state.recMain)).toBe(0);

      const byLine = new Map(result.discrepancies.map((item) => [item.statementLineId, item]));
      expect(byLine.get(state.l1)).toMatchObject({
        kind: 'PAYMENT_METHOD_CONFLICT',
        candidateEntryIds: [state.p1RunFirstCash],
      });
      expect(byLine.get(state.l2)).toMatchObject({
        kind: 'PAYMENT_METHOD_CONFLICT',
        candidateEntryIds: [state.p2LegacyCash],
      });
      expect(result.discrepancies.map((item) => item.kind)).not.toContain('AMBIGUOUS_CANDIDATES');
      expect(result.discrepancies).toContainEqual(
        expect.objectContaining({ kind: 'FUEL_ENTRY_ONLY', fuelEntryId: state.p4CashTwin }),
      );

      // Quy lai xe: MOT anh huong cho moi lan tra tien mat — hai duong khac nhau, van mot lan.
      expect(await fundEntriesOf(state.p1RunFirstCash)).toEqual([
        { kind: 'RUN_EXPENSE', signedAmount: -2_100_000n },
      ]);
      expect(await fundEntriesOf(state.p2LegacyCash)).toEqual([
        { kind: 'TRIP_EXPENSE', signedAmount: -1_100_000n },
      ]);
      expect(await fundEntriesOf(state.p4CashTwin)).toEqual([
        { kind: 'RUN_EXPENSE', signedAmount: -900_000n },
      ]);
    });

    /* ============================== MANUAL ============================== */

    it('PMC-IT-02 — MANUAL qua dich vu: khop tay vao phieu tien mat (ca hai loai) -> 403, KHONG mot hang nao doi', async () => {
      for (const [line, entry] of [
        [state.l1, state.p1RunFirstCash],
        [state.l2, state.p2LegacyCash],
      ] as const) {
        const pending = await pendingFor(state.recMain, line);
        expect(
          await reasonOf(
            reconciliation.resolveDiscrepancy(
              pending.id,
              { resolution: 'MATCH_CONFIRMED', statementLineId: line, fuelEntryId: entry },
              ACTOR,
            ),
          ),
        ).toBe('DENIED:MATCH_PAYMENT_METHOD_CONFLICT');

        expect(await prisma.transportFuelMatch.count({ where: { fuelEntryId: entry } })).toBe(0);
        expect(
          (await prisma.transportFuelDiscrepancy.findUnique({ where: { id: pending.id } }))?.status,
        ).toBe('PENDING');
        expect(
          (await prisma.transportFuelStatementLine.findUnique({ where: { id: line } }))
            ?.reconciliationStatus,
        ).toBe('MISMATCHED');
        expect(
          (await prisma.transportFuelEntry.findUnique({ where: { id: entry } }))
            ?.reconciliationStatus,
        ).toBe('UNMATCHED');
      }
      expect((await fuelRepo.findReconciliation(state.recMain))?.state).toBe('MATCHING');
    });

    /**
     * TANG KHO tu dung vung: goi THANG `resolveDiscrepancy` cua kho Prisma (bo qua lan kiem som cua dich
     * vu) -> lan doc duoi khoa tra ket cuc CO KIEU, va giao dich khong ghi gi.
     */
    it('PMC-IT-03 — MANUAL goi thang kho Prisma: lan doc duoi khoa tu choi, zero write', async () => {
      const pending = await pendingFor(state.recMain, state.l2);
      const before = await prisma.transportFuelDiscrepancy.count({
        where: { reconciliationId: state.recMain },
      });

      const outcome = await fuelRepo.resolveDiscrepancy({
        reconciliationId: state.recMain,
        discrepancyId: pending.id,
        resolution: 'MATCH_CONFIRMED',
        resolutionNote: null,
        actor: ACTOR,
        at: new Date('2026-09-30T09:00:00Z'),
        confirmedMatch: {
          statementLineId: state.l2,
          fuelEntryId: state.p2LegacyCash,
          amountDeltaVnd: 0,
          businessDateDeltaDays: 0,
          origin: 'MANUAL',
        },
        lineStatus: { id: state.l2, status: 'MATCHED' },
        entryStatus: { id: state.p2LegacyCash, status: 'MATCHED' },
        stateWhenSettled: 'RESOLVED',
      });

      expect(outcome).toEqual({
        kind: 'MATCH_PAYMENT_METHOD_CONFLICT',
        fuelEntryId: state.p2LegacyCash,
        paymentMethod: 'DRIVER_CASH',
      });
      expect(await cashPaidMatchCount(state.recMain)).toBe(0);
      expect(
        await prisma.transportFuelDiscrepancy.count({ where: { reconciliationId: state.recMain } }),
      ).toBe(before);
      expect(
        (await prisma.transportFuelDiscrepancy.findUnique({ where: { id: pending.id } }))?.status,
      ).toBe('PENDING');
    });

    it('PMC-IT-04 — ACCEPT_SUPPLIER_AMOUNT tren dong tien mat -> 403, chenh lech van treo', async () => {
      const pending = await pendingFor(state.recMain, state.l1);
      expect(
        await reasonOf(
          reconciliation.resolveDiscrepancy(
            pending.id,
            { resolution: 'ACCEPT_SUPPLIER_AMOUNT', note: 'cay xang doi' },
            ACTOR,
          ),
        ),
      ).toBe('DENIED:DISCREPANCY_CASH_PAID_NOT_PAYABLE');
      expect(
        (await prisma.transportFuelDiscrepancy.findUnique({ where: { id: pending.id } }))?.status,
      ).toBe('PENDING');
    });

    /* ============================== CSDL ============================== */

    /**
     * LUOI CUOI O CSDL: ghi THANG, khong qua tang mien. Moi hinh dang la mot duong ma tang mien da chan;
     * o day Postgres chan lan nua — hai chieu cua cung bat bien.
     */
    it('PMC-IT-05 — hai trigger: cap khop toi phieu tien mat, doi phieu dang khop sang tien mat, deu bi tu choi', async () => {
      // (a) INSERT cap khop toi phieu tien mat.
      await expect(
        prisma.transportFuelMatch.create({
          data: {
            reconciliationId: state.recMain,
            statementLineId: state.l1,
            fuelEntryId: state.p1RunFirstCash,
            amountDeltaVnd: 0n,
            businessDateDeltaDays: 0,
            origin: 'MANUAL',
            matchedBy: 'ghi-tho',
          },
        }),
      ).rejects.toThrow(/TransportFuelMatch_payable_entry_only/);

      // (b) UPDATE mot cap khop HOP LE cho no tro sang phieu tien mat.
      const valid = await prisma.transportFuelMatch.findUniqueOrThrow({
        where: { fuelEntryId: state.p3Billed },
      });
      await expect(
        prisma.transportFuelMatch.update({
          where: { id: valid.id },
          data: { fuelEntryId: state.p4CashTwin },
        }),
      ).rejects.toThrow(/TransportFuelMatch_payable_entry_only/);

      // (c) Chieu nguoc: phieu DANG khop khong doi sang tien mat duoc.
      await expect(
        prisma.transportFuelEntry.update({
          where: { id: state.p3Billed },
          data: { paymentMethod: 'DRIVER_CASH' },
        }),
      ).rejects.toThrow(/TransportFuelEntry_matched_stays_payable/);

      // (d) Kho Prisma bi goi voi mot cap khop tien mat (mot "bo so khop" khong qua tang mien): loi
      // trigger duoc dich thanh ma nghiep vu, va CA lan chay lui — cap khop cu nguyen ven.
      const before = await fuelRepo.listMatches(state.recMain);
      await expect(
        fuelRepo.applyMatchingRun({
          reconciliationId: state.recMain,
          matches: [
            {
              statementLineId: state.l1,
              fuelEntryId: state.p1RunFirstCash,
              amountDeltaVnd: 0,
              businessDateDeltaDays: 0,
              origin: 'AUTO',
            },
          ],
          discrepancies: [],
          lineStatuses: new Map(),
          entryStatuses: new Map(),
          stateAfterRun: { whenPending: 'MATCHING', whenSettled: 'RESOLVED' },
          actor: 'bo-so-khop-la',
          at: new Date('2026-09-30T09:30:00Z'),
        }),
      ).rejects.toMatchObject({ kind: 'DENIED', reason: 'MATCH_PAYMENT_METHOD_CONFLICT' });
      expect(await fuelRepo.listMatches(state.recMain)).toEqual(before);
      expect((await fuelRepo.findEntry(state.p3Billed))?.paymentMethod).toBe('SUPPLIER_ACCOUNT');
    });

    /* ============================== DONG KY ============================== */

    it('PMC-IT-06 — dong ky: cong no hop le DUNG MOT lan, dong tien mat khong vao, Quy khong doi', async () => {
      const fundBefore = await prisma.transportDriverFundEntry.findMany({
        where: { account: { driver: { phone: { startsWith: PHONE_PREFIX } } } },
        orderBy: { id: 'asc' },
      });
      await reconciliation.resolveDiscrepancy(
        (await pendingFor(state.recMain, state.l1)).id,
        { resolution: 'REJECT_SUPPLIER_LINE', note: 'cay xang ghi no lan lai xe tra tien mat' },
        ACTOR,
      );
      await resolveAllPending(state.recMain);

      const closed = await reconciliation.closeReconciliation(state.recMain, ACTOR);
      expect(closed.handoff).toMatchObject({
        revision: 1,
        acceptedAmount: 2_650_000,
        acceptedLineCount: 2,
      });
      expect([...closed.handoff.acceptedLineIds].sort()).toEqual([state.l3, state.l4].sort());

      await settlement.ingestFuelHandoff(state.recMain, ACTOR);
      await settlement.ingestFuelHandoff(state.recMain, ACTOR);
      const documents = await supplierDocuments(state.main);
      expect(documents).toHaveLength(1);
      expect(documents[0]).toMatchObject({ sourceId: closed.handoff.id });
      expect(Number(documents[0]!.signedAmount)).toBe(-2_650_000);

      expect(
        await prisma.transportDriverFundEntry.findMany({
          where: { account: { driver: { phone: { startsWith: PHONE_PREFIX } } } },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(fundBefore);
    });

    it('PMC-IT-07 — mo lai / doi y / chay lai / dong lai: khong cap tien mat, cong no khong doi, van mot chung tu', async () => {
      const first = (await fuelRepo.findHandoff(state.recMain))!;
      await reconciliation.reopenReconciliation(state.recMain, 'soat lai dong tien mat', ACTOR);

      const l1Decision = (await fuelRepo.listDiscrepancies(state.recMain)).find(
        (item) => item.statementLineId === state.l1 && item.status === 'RESOLVED',
      )!;
      expect(
        await reasonOf(
          reconciliation.reviseDiscrepancyDecision(
            l1Decision.id,
            { resolution: 'ACCEPT_SUPPLIER_AMOUNT', reason: 'cay xang doi tien' },
            ACTOR,
          ),
        ),
      ).toBe('DENIED:DECISION_CASH_PAID_NOT_PAYABLE');
      const revised = await reconciliation.reviseDiscrepancyDecision(
        l1Decision.id,
        { resolution: 'IGNORE_WITH_REASON', reason: 'da doi chieu voi cay xang' },
        ACTOR,
      );
      expect(revised.revision).toMatchObject({
        kind: 'PAYMENT_METHOD_CONFLICT',
        supersedesId: l1Decision.id,
      });

      await reconciliation.runMatching(state.recMain, ACTOR);
      expect(await cashPaidMatchCount(state.recMain)).toBe(0);
      await resolveAllPending(state.recMain);

      const reclosed = await reconciliation.closeReconciliation(state.recMain, ACTOR);
      expect(reclosed.handoff.id).toBe(first.id);
      expect(await fuelRepo.listHandoffRevisions(state.recMain)).toHaveLength(1);
      await settlement.ingestFuelHandoff(state.recMain, ACTOR);
      expect(await supplierDocuments(state.main)).toHaveLength(1);

      // Moi lan tra tien mat van DUNG MOT anh huong Quy sau ca chu ky mo lai - dong lai.
      for (const entry of [state.p1RunFirstCash, state.p2LegacyCash, state.p4CashTwin]) {
        expect(await fundEntriesOf(entry)).toHaveLength(1);
      }
    });

    /* ======================= DOI CHUNG AM + DU LIEU HONG ======================= */

    /**
     * DOI CHUNG AM — HAI TRIGGER KHONG DU.
     *
     * Duoi `READ COMMITTED`: giao dich T1 ghi cap khop (trigger thay phieu con `SUPPLIER_ACCOUNT`) va
     * CHUA commit; T2 doi phieu sang `DRIVER_CASH` — trigger chieu nguoc KHONG thay cap khop chua commit,
     * va khoa `FOR KEY SHARE` cua khoa ngoai KHONG chan mot `UPDATE` cot thuong. Ca hai commit: mot cap
     * khop toi phieu tien mat ra doi ma khong trigger nao no. Chinh khoa hang phieu trong
     * `resolveDiscrepancy` (PMC-IT-09) la cai chan ghi-lech; bai nay giu cho PMC-IT-09 con nghia.
     *
     * Du lieu hong vua dung duoc la dung hinh dang "da co tu truoc": lenh dong ky PHAI tu choi.
     */
    it('PMC-IT-08 — ghi-lech lot qua hai trigger -> du lieu hong -> dong ky TU CHOI, khong cong no; chay lai lam sach', async () => {
      const plateA = `${PREFIX}-XE-A`;
      const skewEntry = (
        await declare({ supplierId: state.skew, amount: 1_300_000, businessDate: '2026-09-20' })
      ).id; // ghi no, con DECLARED — ngoai vong so khop tu dong
      const billed = (
        await declareVerified({
          supplierId: state.skew,
          amount: 1_200_000,
          businessDate: '2026-09-21',
        })
      ).id;
      const { reconciliationId, lineIds } = await importCsv(state.skew, [
        `${plateA},2026-09-20,60,1.300.000,,`,
        `${plateA},2026-09-21,55,1.200.000,,`,
      ]);
      const [lineSkew, lineBilled] = lineIds as [string, string];
      await reconciliation.runMatching(reconciliationId, ACTOR);
      expect((await fuelRepo.listMatches(reconciliationId)).map((m) => m.fuelEntryId)).toEqual([
        billed,
      ]);

      let signalInserted = (): void => {};
      const inserted = new Promise<void>((resolve) => {
        signalInserted = resolve;
      });
      let releaseT1 = (): void => {};
      const gate = new Promise<void>((resolve) => {
        releaseT1 = resolve;
      });
      const t1 = prisma.$transaction(
        async (tx) => {
          await tx.transportFuelMatch.create({
            data: {
              reconciliationId,
              statementLineId: lineSkew,
              fuelEntryId: skewEntry,
              amountDeltaVnd: 0n,
              businessDateDeltaDays: 0,
              origin: 'AUTO',
              matchedBy: 'bo-so-khop-cu',
            },
          });
          signalInserted();
          await gate;
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      await inserted;
      // T2 — mot duong ghi tho doi cach tra TRONG KHI T1 chua commit. Khong bi chan, khong trigger nao no.
      await prisma.transportFuelEntry.update({
        where: { id: skewEntry },
        data: { paymentMethod: 'DRIVER_CASH' },
      });
      releaseT1();
      await t1;
      expect(await cashPaidMatchCount(reconciliationId)).toBe(1);

      // Dua ky ve dung trang thai mot ky "sach" se dong duoc: dong ghi-lech da duoc nguoi quyet.
      await resolveAllPending(reconciliationId);
      expect((await fuelRepo.findReconciliation(reconciliationId))?.state).toBe('RESOLVED');

      expect(await reasonOf(reconciliation.closeReconciliation(reconciliationId, ACTOR))).toBe(
        'DENIED:RECONCILIATION_HAS_CASH_PAID_MATCH',
      );
      expect(decisions).toContainEqual(
        expect.objectContaining({
          reason: 'RECONCILIATION_HAS_CASH_PAID_MATCH',
          detail: expect.objectContaining({
            fuelEntryIds: [skewEntry],
            statementLineIds: [lineSkew],
          }),
        }),
      );
      expect((await fuelRepo.findReconciliation(reconciliationId))?.state).toBe('RESOLVED');
      expect(
        await prisma.transportFuelSettlementHandoff.count({ where: { reconciliationId } }),
      ).toBe(0);
      expect(
        await prisma.transportFuelStatementLine.count({
          where: { id: { in: lineIds }, reconciliationStatus: 'SETTLED' },
        }),
      ).toBe(0);
      await expect(settlement.ingestFuelHandoff(reconciliationId, ACTOR)).rejects.toBeDefined();
      expect(await supplierDocuments(state.skew)).toHaveLength(0);

      // DUONG RA cua cap AUTO hong: chay lai so khop. Cap cu bi xoa, KHONG duoc de nghi lai.
      await reconciliation.runMatching(reconciliationId, ACTOR);
      expect(await cashPaidMatchCount(reconciliationId)).toBe(0);
      await resolveAllPending(reconciliationId);
      const closed = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
      expect(closed.handoff).toMatchObject({
        acceptedAmount: 1_200_000,
        acceptedLineIds: [lineBilled],
      });
      await settlement.ingestFuelHandoff(reconciliationId, ACTOR);
      expect(await supplierDocuments(state.skew)).toHaveLength(1);
    });

    /* ============================== DONG THOI ============================== */

    /**
     * XAC NHAN KHOP TAY VS SUA PHIEU SANG TIEN MAT — thu tu ep bang khoa HANG PHIEU (khuon D4 cua #369).
     *
     * Mot giao dich giu khoa hang phieu; hai lenh bat dau va DEU vao hang doi sau no (do bang
     * `pg_blocking_pids`, khong doan), roi moi tha. Hai thu tu, hai ket cuc — va KHONG BAO GIO ca hai
     * cung thanh cong:
     *
     * ```text
     * A: khop tay truoc  -> cap khop ghi, phieu MATCHED; lenh sua thay dieu kien khong con -> 409
     * B: sua phieu truoc -> phieu DRIVER_CASH; lan doc DUOI KHOA cua kho -> 403, khong cap khop
     * ```
     *
     * O thu tu B, lan kiem SOM cua dich vu da doc `SUPPLIER_ACCOUNT` (lenh sua chua commit) — chi lan doc
     * duoi khoa bat duoc. Bo khoa hang phieu thi thu tu B ra dung hinh dang ghi-lech cua PMC-IT-08.
     */
    it('PMC-IT-09 — dong thoi: khop tay va sua phieu sang tien mat khong bao gio cung thanh cong', async () => {
      const plateB = `${PREFIX}-XE-B`;
      odometer = 80_000;
      const onRace = {
        runId: state.runB,
        legId: state.legB,
        driverId: state.driverB,
        supplierId: state.race,
      };
      const first = (await declare({ ...onRace, amount: 800_000, businessDate: '2026-09-25' })).id;
      const second = (await declare({ ...onRace, amount: 700_000, businessDate: '2026-09-26' })).id;
      const { reconciliationId, lineIds } = await importCsv(state.race, [
        `${plateB},2026-09-25,35,800.000,,`,
        `${plateB},2026-09-26,30,700.000,,`,
      ]);
      const [lineFirst, lineSecond] = lineIds as [string, string];
      // Hai phieu con DECLARED nen khong vao vong so khop: hai dong ra `STATEMENT_LINE_ONLY`.
      await reconciliation.runMatching(reconciliationId, ACTOR);

      const race = async (entryId: string, lineId: string, resolveFirst: boolean) => {
        const pending = await pendingFor(reconciliationId, lineId);
        const amend = await amendToCash(entryId);
        const holder = holdEntryLock(entryId);
        const holderPid = await holder.locked;
        const outcomes: Promise<string>[] = [];
        try {
          const confirm = () =>
            settle(
              reconciliation.resolveDiscrepancy(
                pending.id,
                { resolution: 'MATCH_CONFIRMED', statementLineId: lineId, fuelEntryId: entryId },
                `${ACTOR}-khop`,
              ),
            );
          const edit = () => settle(fuel.amendFuelEntry(entryId, amend, 'lx.it'));
          outcomes.push(resolveFirst ? confirm() : edit());
          await waitForBlockedBy(holderPid, 1);
          outcomes.push(resolveFirst ? edit() : confirm());
          await waitForBlockedBy(holderPid, 2);
        } finally {
          holder.release();
          await holder.done;
        }
        const [early, late] = await Promise.all(outcomes);
        return resolveFirst ? { confirm: early, edit: late } : { edit: early, confirm: late };
      };

      // A — khop tay xep hang truoc.
      const a = await race(first, lineFirst, true);
      expect(a).toEqual({ confirm: 'OK', edit: 'CONFLICT:FUEL_ENTRY_AMEND_STATE_RACE' });
      expect(await fuelRepo.findEntry(first)).toMatchObject({
        paymentMethod: 'SUPPLIER_ACCOUNT',
        reconciliationStatus: 'MATCHED',
      });
      expect(await prisma.transportFuelMatch.count({ where: { fuelEntryId: first } })).toBe(1);

      // B — sua phieu xep hang truoc.
      const b = await race(second, lineSecond, false);
      expect(b).toEqual({ edit: 'OK', confirm: 'DENIED:MATCH_PAYMENT_METHOD_CONFLICT' });
      expect((await fuelRepo.findEntry(second))?.paymentMethod).toBe('DRIVER_CASH');
      expect(await prisma.transportFuelMatch.count({ where: { fuelEntryId: second } })).toBe(0);
      expect((await pendingFor(reconciliationId, lineSecond)).kind).toBe('STATEMENT_LINE_ONLY');
      expect(decisions).toContainEqual(
        expect.objectContaining({
          reason: 'MATCH_PAYMENT_METHOD_CONFLICT',
          detail: expect.objectContaining({ fuelEntryId: second, checkedUnderLock: true }),
        }),
      );
      expect(await cashPaidMatchCount(reconciliationId)).toBe(0);
    });
  },
);
