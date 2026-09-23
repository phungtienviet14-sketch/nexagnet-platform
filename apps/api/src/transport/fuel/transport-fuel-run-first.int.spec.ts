import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
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
import { FuelReadService } from './fuel-read.service.js';
import { FuelReconciliationService } from './fuel-reconciliation.service.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import { FileFuelStatementSource } from './fuel-statement-source.js';
import { FuelStatementService } from './fuel-statement.service.js';
import { deleteFuelDiscrepanciesForTest } from './fuel-test-cleanup.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from './fuel.service.js';
import { fuelEntryInboxQuerySchema } from './fuel.schemas.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';

/**
 * `#364` — FUEL EVENT RUN-FIRST tren Postgres THAT, tu dau toi cuoi, KHONG mot chuyen v1 nao.
 *
 * ```text
 * vong chay + lai xe duoc phan cong (khong TransportTrip)
 *   -> lai xe nop phieu (tripId NULL) -> anh chung tu -> ke toan duyet (KHONG vao TX-03)
 *   -> bang ke cay xang -> so khop tat dinh + mot chenh lech -> nguoi quyet -> dong ky
 *   -> cong no nha cung cap DUNG MOT LAN -> Quy lai xe KHONG doi -> doc lai qua ket noi MOI
 * ```
 *
 * Cung ton tai de chung minh nhung gi kho trong bo nho KHONG chung minh duoc: ba `CHECK` va trigger
 * ngu canh cua migration `20260922100000_transport_fuel_run_first` la THAT, khoa ngoai `RESTRICT` la
 * THAT, va duong dong ky -> ban giao -> cong no khong doc `tripId` o bat cu buoc nao.
 *
 * TIEN TO RIENG, khong la tien to cua ai (`tien-to-fixture-it-khong-duoc-long-nhau`): `IT-F364R-`,
 * so dien thoai `0999F364R`. Don dep o `beforeAll` VA `afterAll` — reset demo xoa ca bang ma tep nay
 * ghi, nen du lieu con sot cua mot lan chay hong khong duoc lam do lan chay sau.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Fuel Event Run-first tren Postgres THAT — #364',
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
    const costing = new CostingService(
      costingRepo,
      new TransportCoreFactsAdapter(trips, fleet),
      audit,
      CORE_POLICY,
      COSTING_POLICY,
    );
    // `#369` R-4 — chan Quy cua phieu Run-first `DRIVER_CASH` di qua day.
    const runExpenses = new RunExpenseService(
      new PrismaCostingRepository(prisma),
      new TransportCoreFactsAdapter(trips, fleet),
      new MovementCostingRunContextAdapter(new PrismaMovementRepository(prisma)),
      audit,
      CORE_POLICY,
    );
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuelRuns = new MovementFuelRunContextAdapter(movement);
    const stations = new PrismaFuelStationRepository(prisma);
    const fuel = new FuelService(
      fuelRepo,
      stations,
      fuelCore,
      fuelRuns,
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
    const read = new FuelReadService(fuelRepo, fuelCore, stations, fuelRuns);

    /** Duong cay xang KHONG hoi cong ket thuc don — ban gia nay NEM neu bi hoi (khuon `#295` P0). */
    class UnusedCompletionGate extends SettlementOrderCompletionGate {
      eligibilityForTrip(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }

      eligibilityForOrder(): Promise<OrderCompletionEligibility> {
        throw new Error('Duong ban giao cay xang khong duoc hoi cong ket thuc don');
      }
    }

    const ingest = (): SettlementService =>
      new SettlementService(
        settlementRepo,
        new SettlementCoreFactsAdapter(trips),
        new FuelSettlementSourceAdapter(fuelRepo),
        new UnusedCompletionGate(),
      );

    const PREFIX = 'IT-F364R';
    const PHONE_PREFIX = '0999F364R';
    const ACTOR = 'it-f364r-ke-toan';
    const AUTH_USER_A = 'IT-F364R-user-a';
    const PERIOD = { start: '2026-09-01', end: '2026-09-30' };

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
      exact: '',
      mismatch: '',
      reconciliationId: '',
      handoffId: '',
      fundBalanceBefore: 0,
      fundCountBefore: 0,
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
        where: { reconciliationId: { in: reconIds }, revision: { gt: 1 } },
      });
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

      const runs = await prisma.transportVehicleRun.findMany({
        where: { code: { startsWith: `${PREFIX}-RUN` } },
        select: { id: true },
      });
      const runIds = runs.map((row) => row.id);
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });

      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      for (const kind of ['REVERSAL', 'ADVANCE', 'RETURN', 'TRIP_EXPENSE', 'ADJUSTMENT'] as const) {
        await prisma.transportDriverFundEntry.deleteMany({
          where: { accountId: { in: accountIds }, kind },
        });
      }
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: `${PREFIX}-XE` } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    /** So du + so but toan Quy cua lai xe A — con so PHAI dung yen suot tep. */
    async function fundOfDriverA(): Promise<{ balance: number; count: number }> {
      const rows = await prisma.transportDriverFundEntry.findMany({
        where: { account: { driverId: state.driverA } },
        select: { signedAmount: true },
      });
      return {
        balance: rows.reduce((total, row) => total + Number(row.signedAmount), 0),
        count: rows.length,
      };
    }

    const command = (patch: Partial<SubmitFuelEntryCommand> = {}): SubmitFuelEntryCommand => ({
      runId: state.runA,
      driverId: state.driverA,
      supplierId: state.supplierId,
      liters: '100',
      amount: 2_100_000,
      odometerKm: 200_000,
      occurredAt: '2026-09-10T11:30:00+07:00',
      businessDate: '2026-09-10',
      paymentMethod: 'SUPPLIER_ACCOUNT',
      invoiceNo: null,
      note: null,
      correlationKey: `${PREFIX}-${randomUUID()}`,
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

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang IT #364',
          code: `${PREFIX}-CX`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-09-01T00:00:00Z'),
        })
      ).id;
      state.driverA = (
        await fleet.createDriver({
          fullName: 'IT F364R Lai xe A',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: AUTH_USER_A,
        })
      ).id;
      state.driverB = (
        await fleet.createDriver({
          fullName: 'IT F364R Lai xe B',
          phone: `${PHONE_PREFIX}B`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: null,
        })
      ).id;
      state.vehicleA = (
        await fleet.createVehicle({
          registrationPlate: `${PREFIX}-XE-A`,
          vehicleClass: 'tai-5-tan',
          allowedPayloadKg: 5_000,
        })
      ).id;
      state.vehicleB = (
        await fleet.createVehicle({
          registrationPlate: `${PREFIX}-XE-B`,
          vehicleClass: 'tai-5-tan',
          allowedPayloadKg: 5_000,
        })
      ).id;

      const runA = await movement.createRun({
        code: `${PREFIX}-RUN-A`,
        vehicleId: state.vehicleA,
        businessDate: '2026-09-10',
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
          businessDate: '2026-09-10',
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
          businessDate: '2026-09-10',
        })
      ).id;
      await movement.assignRun(runA.id, {
        driverId: state.driverA,
        effectiveFrom: new Date('2026-09-10T00:00:00Z'),
        assignedBy: ACTOR,
      });

      const runB = await movement.createRun({
        code: `${PREFIX}-RUN-B`,
        vehicleId: state.vehicleB,
        businessDate: '2026-09-10',
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
          businessDate: '2026-09-10',
        })
      ).id;
      await movement.assignRun(runB.id, {
        driverId: state.driverB,
        effectiveFrom: new Date('2026-09-10T00:00:00Z'),
        assignedBy: ACTOR,
      });

      // Quy lai xe A co so du THAT (mot lan tam ung) — de "khong doi" la mot khang dinh co nghia.
      await costing.postAdvance(
        {
          driverId: state.driverA,
          amount: 3_000_000,
          businessDate: '2026-09-09',
          correlationKey: `${PREFIX}-tam-ung`,
        },
        ACTOR,
      );
      const fund = await fundOfDriverA();
      state.fundBalanceBefore = fund.balance;
      state.fundCountBefore = fund.count;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    /* ============================== R1 ============================== */

    it('R1 — lai xe co vong chay, KHONG chuyen v1, nop phieu -> hang voi `tripId` NULL', async () => {
      const entry = await fuel.submitFuelEntry(
        command({ legId: state.loadedLegA, invoiceNo: 'HD-F364R-KHOP' }),
        'lx.a',
      );
      state.exact = entry.id;

      expect(entry).toMatchObject({
        tripId: null,
        runId: state.runA,
        legId: state.loadedLegA,
        vehicleId: state.vehicleA,
        driverId: state.driverA,
        verificationStatus: 'DECLARED',
      });
      const row = await prisma.transportFuelEntry.findUnique({ where: { id: entry.id } });
      expect(row?.tripId).toBeNull();
      expect(row?.runId).toBe(state.runA);
      expect(row?.legId).toBe(state.loadedLegA);
      expect(await prisma.transportTrip.count({ where: { code: { startsWith: PREFIX } } })).toBe(0);
    });

    it('R2 — phat lai tuan tu VA song song cung khoa -> DUNG MOT hang', async () => {
      const sequential = command({ invoiceNo: 'HD-F364R-LAP' });
      const first = await fuel.submitFuelEntry(sequential, 'lx.a');
      expect((await fuel.submitFuelEntry(sequential, 'lx.a')).id).toBe(first.id);

      const parallel = command({ invoiceNo: 'HD-F364R-SONG-SONG' });
      const [left, right] = await Promise.all([
        fuel.submitFuelEntry(parallel, 'lx.a'),
        fuel.submitFuelEntry(parallel, 'lx.a'),
      ]);
      expect(right.id).toBe(left.id);
      expect(
        await prisma.transportFuelEntry.count({
          where: { correlationKey: parallel.correlationKey },
        }),
      ).toBe(1);

      // Hai phieu thu nay khong di tiep vao doi soat: TRA LAI de chung khong vao so khop.
      for (const id of [first.id, left.id]) await fuel.rejectFuelEntry(id, 'phieu thu R2', ACTOR);
    });

    it('R3 — ngu canh sai bi tu choi CO MA, va khong de lai hang nao', async () => {
      const before = await prisma.transportFuelEntry.count({
        where: { supplierId: state.supplierId },
      });
      const cases: ReadonlyArray<readonly [Partial<SubmitFuelEntryCommand>, string]> = [
        [{ vehicleId: state.vehicleB }, 'DENIED:FUEL_ENTRY_VEHICLE_NOT_RUN_VEHICLE'],
        [{ legId: state.legB }, 'DENIED:FUEL_ENTRY_LEG_NOT_IN_RUN'],
        [{ driverId: state.driverB }, 'DENIED:FUEL_ENTRY_DRIVER_NOT_ASSIGNED_TO_RUN'],
        [{ runId: null }, 'DENIED:FUEL_ENTRY_CONTEXT_REQUIRED'],
        [{ runId: `${PREFIX}-khong-co` }, 'NOT_FOUND:FUEL_ENTRY_RUN_NOT_FOUND'],
        // `#369` R-4 — `DRIVER_CASH` tren vong chay THOI bi tu choi: no vao Quy bang but toan
        // `RUN_EXPENSE`. Duong do co bai rieng (`transport-fuel-run-first-driver-cash.int.spec.ts`).
      ];
      for (const [patch, expected] of cases) {
        expect(await reasonOf(fuel.submitFuelEntry(command(patch), 'lx.a')), expected).toBe(
          expected,
        );
      }
      expect(
        await prisma.transportFuelEntry.count({ where: { supplierId: state.supplierId } }),
      ).toBe(before);
    });

    /**
     * R4 — LUOI CUOI O TANG CSDL: ghi THANG qua Prisma, khong di qua tang mien.
     *
     * Moi lan ghi duoi day la mot hinh dang ma `FuelService` da chan o R3. O day no bi chan lan nua
     * boi chinh Postgres — nen mot duong ghi tuong lai quen tang mien (mot script, mot migration du
     * lieu) cung khong lam hong duoc bat bien.
     */
    it('R4 — CHECK + trigger cua migration chan ghi thang', async () => {
      const raw = (data: Record<string, unknown>) =>
        prisma.transportFuelEntry.create({
          data: {
            vehicleId: state.vehicleA,
            driverId: state.driverA,
            supplierId: state.supplierId,
            businessDate: '2026-09-10',
            occurredAt: new Date('2026-09-10T04:30:00Z'),
            liters: '10.000',
            amount: 210_000n,
            odometerKm: 199_000,
            paymentMethod: 'SUPPLIER_ACCOUNT',
            correlationKey: `${PREFIX}-raw-${randomUUID()}`,
            declaredBy: ACTOR,
            ...data,
          },
        });

      await expect(raw({ runId: state.runB })).rejects.toThrow(/transport_fuel_entry_run_vehicle/);
      await expect(raw({ runId: state.runA, legId: state.legB })).rejects.toThrow(
        /transport_fuel_entry_leg_run/,
      );
      // Chang ma khong vong chay: trigger `BEFORE` chay TRUOC `CHECK` va da tu choi (chang khong
      // thuoc vong chay `NULL`); `CHECK TransportFuelEntry_leg_needs_run` la luoi thu hai sau no.
      await expect(raw({ legId: state.loadedLegA })).rejects.toThrow(
        /transport_fuel_entry_leg_run: chang \S+ khong thuoc vong chay <NULL>/,
      );
      // `CHECK` chay TRUOC khoa ngoai: mot `tripId` bat ky cung du de do "hai ngu canh".
      await expect(raw({ tripId: `${PREFIX}-chuyen-khong-co`, runId: state.runA })).rejects.toThrow(
        /TransportFuelEntry_one_context_kind/,
      );
      /*
       * `#369` R-4 da GO `CHECK TransportFuelEntry_driver_cash_needs_trip`: mot phieu Run-first
       * `DRIVER_CASH` la hang HOP LE o tang du lieu. Cai thay cho no la `CHECK
       * TransportFuelEntry_driver_fund_leg_shape` + trigger `transport_fuel_entry_driver_fund_leg`,
       * do o `transport-fuel-run-first-driver-cash.int.spec.ts` (D5).
       */
      const cashRow = await raw({ runId: state.runA, paymentMethod: 'DRIVER_CASH' });
      expect(cashRow.driverFundEntryId).toBeNull();
      await prisma.transportFuelEntry.delete({ where: { id: cashRow.id } });
    });

    it('R5 — anh chung tu gan va doc lai duoc tren phieu khong chuyen', async () => {
      const locator = `media/transport-evidence/2026/09/${randomUUID()}.jpg`;
      const evidence = await fuel.attachEvidence(
        state.exact,
        { locator, contentType: 'image/jpeg', byteSize: 2048 },
        'lx.a',
      );
      const view = await read.getMyFuelSlip(AUTH_USER_A, state.exact);
      expect(view.evidence).toEqual([{ id: evidence.id, contentType: 'image/jpeg' }]);
      const bytesRef = await read.myFuelSlipEvidence(AUTH_USER_A, state.exact, evidence.id);
      expect(bytesRef.locator).toBe(locator);
    });

    it('R6 — duyet: VERIFIED, KHONG mot dong gia thanh chuyen, Quy lai xe dung yen', async () => {
      const verified = await fuel.verifyFuelEntry(state.exact, ACTOR);
      expect(verified).toMatchObject({ verificationStatus: 'VERIFIED', costExpenseId: null });
      expect(
        await prisma.transportTripExpense.count({
          where: { correlationKey: `fuel:${state.exact}` },
        }),
      ).toBe(0);
      expect(await fundOfDriverA()).toEqual({
        balance: state.fundBalanceBefore,
        count: state.fundCountBefore,
      });
    });

    it('R7 — tieu hao tinh tu XE + ODO khi `tripId` NULL', async () => {
      const second = await fuel.submitFuelEntry(
        command({
          liters: '70',
          amount: 1_500_000,
          odometerKm: 200_350,
          occurredAt: '2026-09-11T08:00:00+07:00',
          businessDate: '2026-09-11',
          invoiceNo: 'HD-F364R-LECH',
        }),
        'lx.a',
      );
      state.mismatch = second.id;

      expect(second.tripId).toBeNull();
      expect(second.previousOdometerKm).toBe(200_000);
      // 70 L / 350 km * 100 = 20,000 L/100km (ty le 3).
      expect(second.consumptionUnits).toBe(20_000);
      await fuel.verifyFuelEntry(second.id, ACTOR);
    });

    it('R8 — hop thu ke toan thay phieu khong chuyen, loc duoc theo MA VONG XE', async () => {
      const page = await read.fuelEntryInbox(
        fuelEntryInboxQuerySchema.parse({ runCode: `${PREFIX}-RUN-A`, verification: 'VERIFIED' }),
      );
      expect(page.rows.map((row) => row.id).sort()).toEqual([state.exact, state.mismatch].sort());
      for (const row of page.rows) {
        expect(row).toMatchObject({ tripId: null, tripCode: null, runCode: `${PREFIX}-RUN-A` });
      }
      expect(page.rows.find((row) => row.id === state.exact)?.legSequence).toBe(2);

      const none = await read.fuelEntryInbox(
        fuelEntryInboxQuerySchema.parse({ runCode: `${PREFIX}-RUN-KHONG-CO` }),
      );
      expect(none.total).toBe(0);
    });

    it('R9 — bang ke + so khop tat dinh + MOT chenh lech cho nguoi quyet', async () => {
      const plate = `${PREFIX}-XE-A`;
      const csv = [
        'Bien so,Ngay,So lit,Thanh tien,So hoa don,Ghi chu',
        `${plate},2026-09-10,100,2.100.000,HD-F364R-KHOP,`,
        `${plate},2026-09-11,70,1.700.000,HD-F364R-LECH,cay xang ghi cao hon`,
      ].join('\n');
      const imported = await statements.commitImport(
        {
          supplierId: state.supplierId,
          periodStart: PERIOD.start,
          periodEnd: PERIOD.end,
          filename: 'it-f364r-bang-ke.csv',
          format: 'CSV',
          contentBase64: Buffer.from(csv, 'utf8').toString('base64'),
        },
        ACTOR,
      );
      state.reconciliationId = imported.reconciliation.id;
      expect(imported.statement.acceptedCount).toBe(2);

      await reconciliation.runMatching(state.reconciliationId, ACTOR);
      const matches = await fuelRepo.listMatches(state.reconciliationId);
      expect(matches.map((match) => match.fuelEntryId)).toEqual([state.exact]);
      const discrepancies = await fuelRepo.listDiscrepancies(state.reconciliationId);
      // Mot cau hoi cho nguoi quyet: dong 1.700.000 LECH so voi phieu 1.500.000 cung xe, cung cua so
      // ngay. (Bo so khop liet ke MOI phieu cung xe trong cua so lam ung vien — hanh vi co san, khong
      // doi o `#364`.)
      expect(discrepancies).toEqual([
        expect.objectContaining({
          kind: 'OUT_OF_TOLERANCE',
          status: 'PENDING',
          fuelEntryId: null,
          candidateEntryIds: expect.arrayContaining([state.mismatch]),
        }),
      ]);

      // Con cau hoi treo thi KHONG dong duoc ky — cong cua T4 giu nguyen cho phieu khong chuyen.
      await expect(
        reconciliation.closeReconciliation(state.reconciliationId, ACTOR),
      ).rejects.toMatchObject({ reason: 'RECONCILIATION_HAS_PENDING_DISCREPANCY' });
    });

    it('R10 — nguoi quyet -> dong ky -> cong no nha cung cap DUNG MOT LAN', async () => {
      const [pending] = await fuelRepo.listDiscrepancies(state.reconciliationId);
      await reconciliation.resolveDiscrepancy(
        pending!.id,
        { resolution: 'ACCEPT_SUPPLIER_AMOUNT', note: 'cay xang xac nhan 1.700.000' },
        ACTOR,
      );
      const closed = await reconciliation.closeReconciliation(state.reconciliationId, ACTOR);
      state.handoffId = closed.handoff.id;
      expect(closed.handoff).toMatchObject({
        revision: 1,
        acceptedAmount: 3_800_000,
        acceptedLineCount: 2,
      });

      await ingest().ingestFuelHandoff(state.reconciliationId, ACTOR);
      await ingest().ingestFuelHandoff(state.reconciliationId, ACTOR);
      await Promise.all([
        ingest().ingestFuelHandoff(state.reconciliationId, `${ACTOR}-1`),
        ingest().ingestFuelHandoff(state.reconciliationId, `${ACTOR}-2`),
      ]);

      const documents = await prisma.transportSettlementDocument.findMany({
        where: { counterpartyId: state.supplierId },
      });
      expect(documents).toHaveLength(1);
      expect(documents[0]).toMatchObject({
        kind: 'ORIGINAL',
        flow: 'FUEL_SUPPLIER',
        sourceContext: 'FUEL_SETTLEMENT_HANDOFF',
        sourceId: state.handoffId,
        tripId: null,
      });
      expect(Number(documents[0]!.signedAmount)).toBe(-3_800_000);

      // Phieu Run-first DA KHOP bi khoa (`SETTLED`) nhu moi phieu khac; va van KHONG co dong gia
      // thanh chuyen nao cho ca hai phieu.
      expect((await fuelRepo.findEntry(state.exact))?.reconciliationStatus).toBe('SETTLED');
      expect(
        await prisma.transportTripExpense.count({
          where: { correlationKey: { in: [`fuel:${state.exact}`, `fuel:${state.mismatch}`] } },
        }),
      ).toBe(0);
      expect(await fundOfDriverA()).toEqual({
        balance: state.fundBalanceBefore,
        count: state.fundCountBefore,
      });
    });

    /**
     * R11 — KHOI DONG LAI: mot `PrismaService` MOI, bo kho MOI — khong mot byte nao cua tien trinh
     * truoc con trong bo nho.
     */
    it('R11 — doc lai qua ket noi MOI: phieu, ngu canh, ky dong, cong no, Quy lai xe', async () => {
      const freshPrisma = new PrismaService();
      try {
        const freshFuel = new PrismaFuelRepository(freshPrisma);
        const freshRead = new FuelReadService(
          freshFuel,
          new TransportFuelCoreFactsAdapter(
            new PrismaTripRepository(freshPrisma),
            new PrismaFleetRepository(freshPrisma),
          ),
          new PrismaFuelStationRepository(freshPrisma),
          new MovementFuelRunContextAdapter(new PrismaMovementRepository(freshPrisma)),
        );

        const slip = await freshRead.getMyFuelSlip(AUTH_USER_A, state.exact);
        expect(slip).toMatchObject({
          tripId: null,
          runId: state.runA,
          runCode: `${PREFIX}-RUN-A`,
          legId: state.loadedLegA,
          legSequence: 2,
          vehiclePlate: `${PREFIX}-XE-A`,
          verificationStatus: 'VERIFIED',
          reconciliationStatus: 'SETTLED',
          evidenceCount: 1,
        });

        const workspace = await freshRead.reconciliationWorkspace(state.reconciliationId);
        expect(workspace.reconciliation.state).toBe('CLOSED');
        expect(workspace.handoff).toMatchObject({ id: state.handoffId, acceptedAmount: 3_800_000 });
        expect(
          await freshPrisma.transportSettlementDocument.count({
            where: { counterpartyId: state.supplierId },
          }),
        ).toBe(1);
      } finally {
        await freshPrisma.$disconnect();
      }
      expect(await fundOfDriverA()).toEqual({
        balance: state.fundBalanceBefore,
        count: state.fundCountBefore,
      });
    });
  },
);
