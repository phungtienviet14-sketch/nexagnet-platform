import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import { CostingReadService } from '../costing/costing-read.service.js';
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
import { FuelService, type SubmitFuelEntryCommand } from './fuel.service.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';

/**
 * `#369` R-4 — `DRIVER_CASH` RUN-FIRST tren Postgres THAT: phieu tren vong chay, KHONG chuyen v1 gia,
 * vao Quy lai xe bang DUNG MOT but toan `RUN_EXPENSE`.
 *
 * ```text
 * vong chay + lai xe duoc phan cong (khong TransportTrip)
 *   -> lai xe nop phieu DRIVER_CASH (tripId NULL) -> ke toan duyet
 *   -> MOT but toan RUN_EXPENSE (khoa fuel:<id>) + phieu tro toi no; KHONG TX-03, KHONG phan bo tu dong
 *   -> duyet lai tuan tu / SONG SONG (thu tu ep bang khoa so quy): VAN mot but toan
 *   -> CSDL chan moi hinh dang sai o tang du lieu (unique, CHECK, trigger)
 *   -> dao qua duong chung TX-03: co dau vet, net 0, dao lan hai bi tu choi
 *   -> cong no nha cung cap chay tron chu ky ma Quy khong doi; phieu chuyen v1 DRIVER_CASH van nhu cu
 * ```
 *
 * TIEN TO RIENG, khong la tien to cua ai (`tien-to-fixture-it-khong-duoc-long-nhau`): `IT-F369D-`, so
 * dien thoai `0999F369D`. Don o `beforeAll` VA `afterAll`.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Quy lai xe Run-first (DRIVER_CASH khong chuyen) tren Postgres THAT — #369 R-4',
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
    const fundRead = new CostingReadService(costingRepo, core);
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
    const reconciliation = new FuelReconciliationService(fuelRepo, audit, FUEL_POLICY);

    /** Duong cay xang KHONG hoi cong ket thuc don — ban gia nay NEM neu bi hoi (khuon `#295` P0). */
    class UnusedCompletionGate extends SettlementOrderCompletionGate {
      eligibilityForTrip(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }

      eligibilityForOrder(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }
    }

    const PREFIX = 'IT-F369D';
    const PHONE_PREFIX = '0999F369D';
    const ACTOR = 'it-f369d-ke-toan';
    const PERIOD = { start: '2026-09-01', end: '2026-09-30' };
    const ADVANCE = 5_000_000;

    const state = {
      supplierId: '',
      driverA: '',
      driverB: '',
      vehicleA: '',
      vehicleB: '',
      runA: '',
      emptyLegA: '',
      loadedLegA: '',
      runB: '',
      legB: '',
      tripA: '',
      cash: '',
      cashFund: '',
      concurrent: '',
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
      // DAO truoc GOC: `reversalOfId` tro nguoc ve dong goc.
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

    /** Moi but toan Quy cua MOT lai xe, theo thu tu so cai. */
    const fundRows = (driverId: string) =>
      prisma.transportDriverFundEntry.findMany({
        where: { account: { driverId } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

    const balanceOf = async (driverId: string): Promise<number> =>
      (await fundRows(driverId)).reduce((total, row) => total + Number(row.signedAmount), 0);

    const command = (patch: Partial<SubmitFuelEntryCommand> = {}): SubmitFuelEntryCommand => ({
      runId: state.runA,
      legId: state.loadedLegA,
      driverId: state.driverA,
      supplierId: state.supplierId,
      liters: '100',
      amount: 2_100_000,
      odometerKm: 300_000,
      occurredAt: '2026-09-12T11:30:00+07:00',
      businessDate: '2026-09-12',
      paymentMethod: 'DRIVER_CASH',
      invoiceNo: null,
      note: null,
      correlationKey: `${PREFIX}-${randomUUID()}`,
      ...patch,
    });

    /**
     * Gan chan Quy THANG vao phieu voi trigger hinh dang TAT — TRONG mot giao dich, nen lenh `ALTER`
     * cung lui khi giao dich lui (DDL cua Postgres co giao dich).
     *
     * Trigger `BEFORE` chay TRUOC `CHECK`, nen o duong thuong CHECK khong bao gio la ben tu choi. Tat
     * trigger la cach duy nhat do rieng CHECK — tuc chung minh moi luoi TU DUNG VUNG, khong phai mot
     * luoi dang dung nho luoi kia.
     */
    const linkWithoutTrigger = (entryId: string, fundId: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "TransportFuelEntry" DISABLE TRIGGER "transport_fuel_entry_driver_fund_leg"',
        );
        await tx.transportFuelEntry.update({
          where: { id: entryId },
          data: { driverFundEntryId: fundId },
        });
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

    /**
     * GIU khoa hang SO QUY trong mot giao dich rieng cho toi khi `release()`.
     *
     * `locked` tra ve `pid` cua giao dich giu khoa SAU khi cau `FOR UPDATE` da lay duoc khoa — moi
     * lan ghi Quy goi sau do CHAC CHAN xep hang sau no (`assertWritablePeriod` khoa CUNG hang nay).
     */
    function holdAccountLock(accountId: string): {
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
          await tx.$executeRaw`SELECT "id" FROM "TransportDriverFundAccount" WHERE "id" = ${accountId} FOR UPDATE`;
          signalLocked(Number(self!.pid));
          await gate;
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      return { locked, release, done };
    }

    /**
     * Cho toi khi `count` phien nam trong CHUOI CHAN cua giao dich `holderPid` (`pg_blocking_pids`).
     *
     * CHUOI, khong chi mot bac: Postgres xep hang khoa hang theo chuoi — phien cho THU HAI cho khoa
     * tuple ma phien cho THU NHAT dang giu, nen `pg_blocking_pids` cua no la phien thu nhat, khong phai
     * giao dich giu khoa. CTE de quy gom moi phien bi chan BAC CAU boi `holderPid`.
     *
     * Loc theo pid chu khong theo chuoi truy van: CSDL dung chung voi tep khac chay song song, va mot
     * phien cua tep khac cho mot khoa so quy KHAC se lam mot phep dem theo chuoi xanh gia.
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

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang IT #369',
          code: `${PREFIX}-CX`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-09-01T00:00:00Z'),
        })
      ).id;
      for (const [key, suffix] of [
        ['driverA', 'A'],
        ['driverB', 'B'],
      ] as const) {
        state[key] = (
          await fleet.createDriver({
            fullName: `IT F369D Lai xe ${suffix}`,
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

      const runA = await movement.createRun({
        code: `${PREFIX}-RUN-A`,
        vehicleId: state.vehicleA,
        businessDate: '2026-09-12',
      });
      state.runA = runA.id;
      state.emptyLegA = (
        await movement.createLeg({
          runId: runA.id,
          sequence: 1,
          kind: 'EMPTY',
          orderId: null,
          originLabel: 'Bai xe',
          destinationLabel: 'Kho A',
          businessDate: '2026-09-12',
        })
      ).id;
      state.loadedLegA = (
        await movement.createLeg({
          runId: runA.id,
          sequence: 2,
          kind: 'LOADED',
          orderId: null,
          originLabel: 'Kho A',
          destinationLabel: 'Kho B',
          businessDate: '2026-09-12',
        })
      ).id;
      await movement.assignRun(runA.id, {
        driverId: state.driverA,
        effectiveFrom: new Date('2026-09-12T00:00:00Z'),
        assignedBy: ACTOR,
      });

      const runB = await movement.createRun({
        code: `${PREFIX}-RUN-B`,
        vehicleId: state.vehicleB,
        businessDate: '2026-09-12',
      });
      state.runB = runB.id;
      state.legB = (
        await movement.createLeg({
          runId: runB.id,
          sequence: 1,
          kind: 'LOADED',
          orderId: null,
          originLabel: 'Kho C',
          destinationLabel: 'Kho D',
          businessDate: '2026-09-12',
        })
      ).id;
      await movement.assignRun(runB.id, {
        driverId: state.driverB,
        effectiveFrom: new Date('2026-09-12T00:00:00Z'),
        assignedBy: ACTOR,
      });

      // Chuyen v1 THAT cua lai xe A — doi chung "phieu chuyen cu van di TX-03 nhu cu" (D8).
      state.tripA = (
        await trips.create({
          code: `${PREFIX}-CHUYEN`,
          kind: 'OWN_DIRECT',
          businessDate: '2026-09-12',
          originLabel: 'Ha Noi',
          destinationLabel: 'Thai Nguyen',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 12_000_000,
          distanceKm: 300,
        })
      ).id;
      await trips.assign(state.tripA, {
        vehicleId: state.vehicleA,
        driverId: state.driverA,
        assignedBy: ACTOR,
        at: new Date('2026-09-12T00:00:00Z'),
      });

      // Quy lai xe A co so du THAT: 5.000.000 tam ung. Moi khang dinh ve so du tinh tu moc nay.
      await costing.postAdvance(
        {
          driverId: state.driverA,
          amount: ADVANCE,
          businessDate: '2026-09-11',
          correlationKey: `${PREFIX}-tam-ung-a`,
        },
        ACTOR,
      );
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    /* ============================== D1-D3 ============================== */

    it('D1 — lai xe co vong chay, KHONG chuyen, nop `DRIVER_CASH` -> CSDL nhan (CHECK #364 da go)', async () => {
      const entry = await fuel.submitFuelEntry(command(), 'lx.a');
      state.cash = entry.id;

      const row = await prisma.transportFuelEntry.findUnique({ where: { id: entry.id } });
      expect(row).toMatchObject({
        tripId: null,
        runId: state.runA,
        legId: state.loadedLegA,
        paymentMethod: 'DRIVER_CASH',
        verificationStatus: 'DECLARED',
        driverFundEntryId: null,
        costExpenseId: null,
      });
      // Nop phieu KHONG cham Quy — chi lan duyet moi ghi.
      expect(await balanceOf(state.driverA)).toBe(ADVANCE);
      expect(
        await prisma.transportTrip.count({ where: { code: { startsWith: `${PREFIX}-RUN` } } }),
      ).toBe(0);
    });

    it('D2 — duyet: DUNG MOT `RUN_EXPENSE`, phieu tro toi no, KHONG TX-03, KHONG phan bo tu dong', async () => {
      const verified = await fuel.verifyFuelEntry(state.cash, ACTOR);
      const rows = await prisma.transportDriverFundEntry.findMany({
        where: { correlationKey: `fuel:${state.cash}` },
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind: 'RUN_EXPENSE',
        signedAmount: -2_100_000n,
        tripId: null,
        runId: state.runA,
        legId: state.loadedLegA,
        businessDate: '2026-09-12',
        reversalOfId: null,
      });
      state.cashFund = rows[0]!.id;
      expect(verified).toMatchObject({
        verificationStatus: 'VERIFIED',
        driverFundEntryId: state.cashFund,
        costExpenseId: null,
      });
      expect(
        await prisma.transportTripExpense.count({
          where: { correlationKey: `fuel:${state.cash}` },
        }),
      ).toBe(0);
      expect(
        await prisma.transportFuelCostAttribution.count({ where: { fuelEntryId: state.cash } }),
      ).toBe(0);
      expect(await balanceOf(state.driverA)).toBe(ADVANCE - 2_100_000);
    });

    it('D3 — duyet lai TUAN TU: khong but toan thu hai, so du dung yen', async () => {
      await fuel.verifyFuelEntry(state.cash, ACTOR);
      await fuel.verifyFuelEntry(state.cash, ACTOR);
      expect(
        await prisma.transportDriverFundEntry.count({
          where: { correlationKey: `fuel:${state.cash}` },
        }),
      ).toBe(1);
      expect(await balanceOf(state.driverA)).toBe(ADVANCE - 2_100_000);
    });

    /* ============================== D4 ============================== */

    /**
     * D4 — HAI LAN DUYET LAI SONG SONG, THU TU DUOC EP.
     *
     * Phieu `VERIFIED` chua co chan Quy (lan duyet truoc chet giua chung — trang thai tu sua duoc).
     * Mot giao dich giu khoa hang SO QUY cua lai xe A; hai lan duyet lai bat dau va DEU phai vao hang
     * doi sau no (do bang `pg_blocking_pids`, khong doan) — tuc CA HAI da qua buoc doc "chua co but
     * toan" truoc khi mot ben ghi. Roi moi tha.
     *
     * Ket qua duy nhat hop le: MOT but toan, hai lan duyet cung tro toi no, so du tru DUNG MOT lan.
     * Gia su khoa su kien khong tat dinh, hai but toan se ra doi ngay tai day.
     */
    it('D4 — hai lan duyet lai song song (thu tu ep bang khoa so quy) -> MOT but toan', async () => {
      const entry = await fuel.submitFuelEntry(
        command({ amount: 1_300_000, odometerKm: 300_400, liters: '60' }),
        'lx.a',
      );
      state.concurrent = entry.id;
      // Lan duyet dau "chet" sau khi doi trang thai — dung trang thai ma `verifyFuelEntry` sua duoc.
      await fuelRepo.setEntryVerification(entry.id, 'DECLARED', {
        to: 'VERIFIED',
        actor: ACTOR,
        reviewNote: null,
        at: new Date('2026-09-12T06:00:00Z'),
      });
      const before = await balanceOf(state.driverA);
      const account = await costingRepo.findAccountByDriver(state.driverA);

      const holder = holdAccountLock(account!.id);
      const holderPid = await holder.locked;

      // Bat ket cuc NGAY khi gai (`int-spec-racer-phai-bat-ket-cuc-ngay`).
      const settle = (promise: Promise<{ driverFundEntryId: string | null }>) =>
        promise.then(
          (result) => `OK:${result.driverFundEntryId}`,
          (error: unknown) =>
            error instanceof TransportDomainError ? error.reason : `LOI:${String(error)}`,
        );
      const first = settle(fuel.verifyFuelEntry(entry.id, `${ACTOR}-1`));
      const second = settle(fuel.verifyFuelEntry(entry.id, `${ACTOR}-2`));

      try {
        await waitForBlockedBy(holderPid, 2);
      } finally {
        // Tha khoa DU bai do — neu khong, giao dich giu khoa treo va lam chet ca buoc don dep.
        holder.release();
        await holder.done;
      }

      // Doi CA HAI ket cuc truoc khi dem — sau khi tha khoa, hai giao dich moi thuc su chay tiep.
      const outcomes = [await first, await second];
      const rows = await prisma.transportDriverFundEntry.findMany({
        where: { correlationKey: `fuel:${entry.id}` },
      });
      expect(rows).toHaveLength(1);
      expect(outcomes).toEqual([`OK:${rows[0]!.id}`, `OK:${rows[0]!.id}`]);
      expect((await fuelRepo.findEntry(entry.id))?.driverFundEntryId).toBe(rows[0]!.id);
      expect(await balanceOf(state.driverA)).toBe(before - 1_300_000);
    });

    /**
     * D4b — DOI CHUNG AM: cung hai lenh ghi Quy song song, nhung voi khoa KHONG tat dinh (moi lan goi
     * mot khoa ngau nhien — dung kieu hong ma `fuelCostCorrelationKey` sinh ra de chan).
     *
     * So quy khong the tu biet hai lenh la mot su kien: HAI but toan ra doi, so du tru HAI lan. Bai
     * nay giu cho D4 con nghia — no chung minh chinh KHOA SU KIEN la thu chan dem hai lan, khong phai
     * mot su tinh co cua lich chay. Chan Quy cua phieu van chi gan duoc MOT — va trigger tu choi gan
     * mot but toan mang khoa la.
     */
    it('D4b — doi chung am: khoa ngau nhien -> HAI but toan (khoa su kien moi la cai chan)', async () => {
      const key = () => `${PREFIX}-khoa-ngau-nhien-${randomUUID()}`;
      const post = () =>
        runExpenses.recordRunExpense(
          {
            driverId: state.driverB,
            runId: state.runB,
            legId: state.legB,
            amount: 700_000,
            businessDate: '2026-09-12',
            note: 'doi chung am',
            correlationKey: key(),
          },
          ACTOR,
        );
      const [left, right] = await Promise.all([post(), post()]);

      expect(left.entry.id).not.toBe(right.entry.id);
      expect(await balanceOf(state.driverB)).toBe(-1_400_000);

      const entry = await fuel.submitFuelEntry(
        command({
          runId: state.runB,
          legId: state.legB,
          driverId: state.driverB,
          amount: 700_000,
          liters: '30',
          odometerKm: 50_000,
        }),
        'lx.b',
      );
      await fuelRepo.setEntryVerification(entry.id, 'DECLARED', {
        to: 'VERIFIED',
        actor: ACTOR,
        reviewNote: null,
        at: new Date('2026-09-12T07:00:00Z'),
      });
      await expect(fuelRepo.attachDriverFundEntry(entry.id, left.entry.id)).rejects.toThrow(
        /transport_fuel_entry_driver_fund_leg/,
      );
    });

    /* ============================== D5 ============================== */

    /**
     * D5 — LUOI CUOI O TANG CSDL: ghi THANG, khong qua tang mien. Moi hinh dang duoi day la mot duong
     * ma tang mien da chan; o day Postgres chan lan nua.
     */
    it('D5 — unique + CHECK + trigger chan moi hinh dang sai cua chan Quy', async () => {
      const accountA = (await costingRepo.findAccountByDriver(state.driverA))!.id;
      const rawFund = (data: Record<string, unknown>) =>
        prisma.transportDriverFundEntry.create({
          data: {
            accountId: accountA,
            kind: 'RUN_EXPENSE',
            signedAmount: -2_100_000n,
            businessDate: '2026-09-12',
            runId: state.runA,
            correlationKey: `${PREFIX}-raw-${randomUUID()}`,
            recordedBy: ACTOR,
            ...data,
          },
        });

      // (a) mot but toan Quy GOC thu hai cho CUNG phieu: unique `correlationKey`.
      await expect(rawFund({ correlationKey: `fuel:${state.cash}` })).rejects.toThrow(
        /correlationKey|Unique constraint/,
      );
      // (b) `RUN_EXPENSE` khong vong chay.
      await expect(rawFund({ runId: null })).rejects.toThrow(
        /TransportDriverFundEntry_run_expense_shape/,
      );
      // (c) chang cua vong chay KHAC.
      await expect(rawFund({ legId: state.legB })).rejects.toThrow(
        /transport_driver_fund_entry_leg_run/,
      );
      // (d) ca chuyen v1 LAN vong chay — `CHECK` chay TRUOC khoa ngoai.
      await expect(rawFund({ tripId: `${PREFIX}-chuyen-khong-co` })).rejects.toThrow(
        /TransportDriverFundEntry_one_context_kind/,
      );
      // (e) dau duong.
      await expect(rawFund({ signedAmount: 2_100_000n })).rejects.toThrow(
        /TransportDriverFundEntry_sign_by_kind/,
      );

      // (f) gan vao phieu mot but toan KHONG phai chan Quy cua no (tam ung cua lai xe A).
      const advance = await prisma.transportDriverFundEntry.findFirstOrThrow({
        where: { accountId: accountA, kind: 'ADVANCE' },
      });
      const linkRaw = (entryId: string, fundId: string) =>
        prisma.transportFuelEntry.update({
          where: { id: entryId },
          data: { driverFundEntryId: fundId },
        });
      const unlinked = await fuel.submitFuelEntry(
        command({ amount: 900_000, odometerKm: 300_800, liters: '40' }),
        'lx.a',
      );
      await fuelRepo.setEntryVerification(unlinked.id, 'DECLARED', {
        to: 'VERIFIED',
        actor: ACTOR,
        reviewNote: null,
        at: new Date('2026-09-12T08:00:00Z'),
      });
      await expect(linkRaw(unlinked.id, advance.id)).rejects.toThrow(
        /transport_fuel_entry_driver_fund_leg/,
      );
      // (g) doi so tien cua phieu DA gan chan Quy — but toan khong con khop.
      await expect(
        prisma.transportFuelEntry.update({
          where: { id: state.cash },
          data: { amount: 2_000_000n },
        }),
      ).rejects.toThrow(/transport_fuel_entry_driver_fund_leg/);
      // (h) chan Quy tren phieu `SUPPLIER_ACCOUNT` — `CHECK` hinh dang.
      const supplierBilled = await fuel.submitFuelEntry(
        command({
          paymentMethod: 'SUPPLIER_ACCOUNT',
          amount: 1_750_000,
          odometerKm: 301_200,
          liters: '80',
          occurredAt: '2026-09-13T09:00:00+07:00',
          businessDate: '2026-09-13',
          invoiceNo: 'HD-F369D-CONG-NO',
        }),
        'lx.a',
      );
      await fuel.verifyFuelEntry(supplierBilled.id, ACTOR);
      await expect(linkRaw(supplierBilled.id, state.cashFund)).rejects.toThrow(
        /transport_fuel_entry_driver_fund_leg/,
      );
      await expect(linkWithoutTrigger(supplierBilled.id, state.cashFund)).rejects.toThrow(
        /TransportFuelEntry_driver_fund_leg_shape/,
      );

      // Khong mot lan ghi nao o tren lot qua: phieu va so quy y nguyen.
      expect((await fuelRepo.findEntry(state.cash))?.amount).toBe(2_100_000);
      expect(
        await prisma.transportDriverFundEntry.count({
          where: { accountId: accountA, correlationKey: { startsWith: `${PREFIX}-raw-` } },
        }),
      ).toBe(0);
    });

    /* ============================== D6 ============================== */

    it('D6 — dao qua duong chung TX-03: co dau vet, net 0, dao lan hai bi tu choi', async () => {
      const before = await balanceOf(state.driverA);
      const reversed = await costing.reverseFundEntry(
        state.cashFund,
        'lai xe khong ung tien',
        ACTOR,
      );

      expect(reversed.expense).toBeNull();
      expect(reversed.entry).toMatchObject({
        kind: 'REVERSAL',
        signedAmount: 2_100_000,
        reversalOfId: state.cashFund,
        runId: state.runA,
        legId: state.loadedLegA,
        tripId: null,
        correlationKey: `fuel:${state.cash}:reversal`,
      });
      expect(await balanceOf(state.driverA)).toBe(before + 2_100_000);

      expect(await reasonOf(costing.reverseFundEntry(state.cashFund, 'lan hai', ACTOR))).toBe(
        'CONFLICT:ENTRY_ALREADY_REVERSED',
      );
      // Duyet lai phieu sau khi dao KHONG ghi lai tien: chan Quy van tro toi ban goc (da dao).
      await fuel.verifyFuelEntry(state.cash, ACTOR);
      expect(await balanceOf(state.driverA)).toBe(before + 2_100_000);
      expect(
        await prisma.transportDriverFundEntry.count({
          where: { correlationKey: { startsWith: `fuel:${state.cash}` } },
        }),
      ).toBe(2);
    });

    /* ============================== D7 ============================== */

    /**
     * D7 — CONG NO NHA CUNG CAP DOC LAP: bang ke -> khop -> dong ky -> ban giao chay tron chu ky tren
     * phieu Run-first `SUPPLIER_ACCOUNT`, va Quy lai xe KHONG doi mot dong. Phieu `DRIVER_CASH` khong
     * co tren bang ke thi khong khop, khong vao cong no.
     */
    it('D7 — cong no nha cung cap chay tron chu ky, Quy lai xe khong doi', async () => {
      const fundBefore = await fundRows(state.driverA);
      const plate = `${PREFIX}-XE-A`;
      const csv = [
        'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
        `${plate},2026-09-13,80,1.750.000,HD-F369D-CONG-NO,`,
      ].join('\n');
      const imported = await statements.commitImport(
        {
          supplierId: state.supplierId,
          periodStart: PERIOD.start,
          periodEnd: PERIOD.end,
          filename: 'it-f369d-bang-ke.csv',
          format: 'CSV',
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        },
        ACTOR,
      );
      const reconciliationId = imported.reconciliation.id;
      await reconciliation.runMatching(reconciliationId, ACTOR);
      const matches = await fuelRepo.listMatches(reconciliationId);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.fuelEntryId).not.toBe(state.cash);

      const pending = (await fuelRepo.listDiscrepancies(reconciliationId)).filter(
        (item) => item.status === 'PENDING',
      );
      for (const item of pending) {
        await reconciliation.resolveDiscrepancy(
          item.id,
          { resolution: 'IGNORE_WITH_REASON', note: 'ngoai pham vi bai' },
          ACTOR,
        );
      }
      const closed = await reconciliation.closeReconciliation(reconciliationId, ACTOR);
      await new SettlementService(
        settlementRepo,
        new SettlementCoreFactsAdapter(trips),
        new FuelSettlementSourceAdapter(fuelRepo),
        new UnusedCompletionGate(),
      ).ingestFuelHandoff(reconciliationId, ACTOR);

      const documents = await prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: state.supplierId },
      });
      expect(documents).toHaveLength(1);
      expect(documents[0]).toMatchObject({ flow: 'FUEL_SUPPLIER', sourceId: closed.handoff.id });
      expect(Number(documents[0]!.signedAmount)).toBe(-1_750_000);

      // Quy lai xe KHONG doi mot dong, va phieu tien mat van UNMATCHED voi DUNG mot chan Quy goc.
      expect(await fundRows(state.driverA)).toEqual(fundBefore);
      expect((await fuelRepo.findEntry(state.cash))?.reconciliationStatus).not.toBe('MATCHED');
    });

    /* ============================== D8 ============================== */

    it('D8 — phieu chuyen v1 `DRIVER_CASH` VAN di TX-03 hai chan; khong mang chan Quy rieng', async () => {
      const before = await balanceOf(state.driverA);
      const legacy = await fuel.submitFuelEntry(
        command({
          runId: null,
          legId: null,
          tripId: state.tripA,
          vehicleId: state.vehicleA,
          amount: 1_100_000,
          odometerKm: 301_600,
          liters: '50',
          occurredAt: '2026-09-14T09:00:00+07:00',
          businessDate: '2026-09-14',
        }),
        'lx.a',
      );
      const verified = await fuel.verifyFuelEntry(legacy.id, ACTOR);

      const expense = await prisma.transportTripExpense.findUniqueOrThrow({
        where: { correlationKey: `fuel:${legacy.id}` },
      });
      const fund = await prisma.transportDriverFundEntry.findUniqueOrThrow({
        where: { correlationKey: `fuel:${legacy.id}` },
      });
      expect(expense).toMatchObject({ tripId: state.tripA, fundedBy: 'DRIVER_FUND' });
      expect(fund).toMatchObject({ kind: 'TRIP_EXPENSE', tripId: state.tripA, runId: null });
      expect(expense.driverFundEntryId).toBe(fund.id);
      expect(verified).toMatchObject({ costExpenseId: expense.id, driverFundEntryId: null });
      expect(await balanceOf(state.driverA)).toBe(before - 1_100_000);

      // Chan Quy RIENG tren phieu chuyen v1 — hai lan tru quy cho mot lan do dau — CSDL tu choi, bang
      // CA HAI luoi, moi luoi tu dung vung.
      await expect(
        prisma.transportFuelEntry.update({
          where: { id: legacy.id },
          data: { driverFundEntryId: fund.id },
        }),
      ).rejects.toThrow(/transport_fuel_entry_driver_fund_leg/);
      await expect(linkWithoutTrigger(legacy.id, fund.id)).rejects.toThrow(
        /TransportFuelEntry_driver_fund_leg_shape/,
      );
      expect((await fuelRepo.findEntry(legacy.id))?.driverFundEntryId).toBeNull();
    });

    /* ============================== D9 ============================== */

    it('D9 — doc lai qua ket noi MOI: so quy mang ngu canh vong chay, phieu tro toi chan Quy', async () => {
      const freshPrisma = new PrismaService();
      try {
        const freshCosting = new PrismaCostingRepository(freshPrisma);
        const statement = await new CostingReadService(
          freshCosting,
          new TransportCoreFactsAdapter(
            new PrismaTripRepository(freshPrisma),
            new PrismaFleetRepository(freshPrisma),
          ),
        ).driverFundStatement(state.driverA);

        const runExpense = statement.entries.find((row) => row.id === state.cashFund);
        expect(runExpense).toMatchObject({
          kind: 'RUN_EXPENSE',
          runId: state.runA,
          legId: state.loadedLegA,
          tripId: null,
        });
        expect(statement.balance).toBe(await balanceOf(state.driverA));
        expect(
          (await new PrismaFuelRepository(freshPrisma).findEntry(state.cash))?.driverFundEntryId,
        ).toBe(state.cashFund);
      } finally {
        await freshPrisma.$disconnect();
      }
      expect((await fundRead.driverFundStatement(state.driverA)).entries.length).toBeGreaterThan(0);
    });
  },
);
