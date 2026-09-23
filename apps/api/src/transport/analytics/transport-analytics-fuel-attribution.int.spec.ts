import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { FuelCostAttributionReadService } from '../fuel/fuel-cost-attribution-read.service.js';
import { FuelCostAttributionService } from '../fuel/fuel-cost-attribution.service.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from '../fuel/fuel-policy.js';
import { MovementFuelRunContextAdapter } from '../fuel/fuel-run-context.port.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from '../fuel/fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from '../fuel/fuel.service.js';
import { PrismaFuelCostAttributionRepository } from '../fuel/prisma-fuel-cost-attribution.repository.js';
import { PrismaFuelRepository } from '../fuel/prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from '../fuel/prisma-fuel-station.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { DEFAULT_TRANSPORT_TIME_ZONE } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import {
  AnalyticsCostFactsAdapter,
  AnalyticsFuelAttributionFactsAdapter,
  AnalyticsMovementFactsAdapter,
} from './analytics.ports.js';
import { OperatingMetricsReadService } from './operating-metrics-read.service.js';

/**
 * `#369` R-1 — BIEN TRUC TIEP CUA VONG CHAY CONG CA HAI SO CAI GIA THANH, tren Postgres THAT.
 *
 * ```text
 * chuyen v1 -> phieu dau chuyen cu -> TX-03            (so cai 1: TransportTripExpense)
 * vong chay -> phieu dau Run-first -> ke toan phan bo   (so cai 2: TransportFuelCostAttribution)
 * runMargin = so cai 1 + so cai 2, va KHONG mot phieu nao nam o ca hai
 * ```
 *
 * Moi con so duoi day duoc doi chieu voi `SUM` doc lai bang Prisma THO — cung luat voi
 * `transport-analytics.int.spec.ts`: mot bai so bao cao voi hang so viet tay chi chung minh phep
 * cong chay; bai o day chung minh con so tren man hinh la tong cua nhung hang nguoi doi soat mo len
 * xem duoc.
 *
 * TIEN TO RIENG `IT-F369M` — khong long voi `IT-R8`, `IT-F369D`, `IT-F364*`.
 */
const PREFIX = 'IT-F369M';
const PHONE_PREFIX = '0999F369M';
const ACTOR = 'it-f369m-ke-toan';

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Bien truc tiep vong chay cong lop phan bo nhien lieu — #369 R-1',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const fuelRepo = new PrismaFuelRepository(prisma);
    const attributionRepo = new PrismaFuelCostAttributionRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);

    const corePolicy = { timeZone: DEFAULT_TRANSPORT_TIME_ZONE };
    const FUEL_POLICY: TransportFuelPolicy = {
      matching: { amountVnd: 1_000, businessDateDays: 1 },
      statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
      consumption: { normsByVehicleClass: {}, tolerancePercent: 10 },
    };
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const core = new TransportCoreFactsAdapter(trips, fleet);
    const movement = new MovementService(movementRepo, fleet, audit, corePolicy, trips);
    const costing = new CostingService(costingRepo, core, audit, corePolicy, {
      expenseCategories: [],
      advanceApprovalRequired: false,
    });
    const runExpenses = new RunExpenseService(
      costingRepo,
      core,
      new MovementCostingRunContextAdapter(movementRepo),
      audit,
      corePolicy,
    );
    const fuelRuns = new MovementFuelRunContextAdapter(movementRepo);
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      fuelRuns,
      new CostingFuelExpenseAdapter(costing, runExpenses),
      audit,
      corePolicy,
      FUEL_POLICY,
    );
    const attributionRead = new FuelCostAttributionReadService(
      fuelRepo,
      attributionRepo,
      fuelRuns,
      fuelCore,
    );
    const attribution = new FuelCostAttributionService(
      fuelRepo,
      attributionRepo,
      fuelRuns,
      attributionRead,
      audit,
    );
    const fundRead = new CostingReadService(costingRepo, core);

    /** Bao cao VOI cong phan bo — hinh dang ma `app-composition.ts` dung. */
    const read = new OperatingMetricsReadService(
      new AnalyticsMovementFactsAdapter(movementRepo),
      new AnalyticsCostFactsAdapter(costingRepo),
      new AnalyticsFuelAttributionFactsAdapter(attributionRepo),
    );
    /** Bao cao KHONG co cong — hinh dang cua mot khach tat `transport-fuel`. */
    const readWithoutFuel = new OperatingMetricsReadService(
      new AnalyticsMovementFactsAdapter(movementRepo),
      new AnalyticsCostFactsAdapter(costingRepo),
    );

    const state = {
      supplierId: '',
      driverId: '',
      vehicleId: '',
      tripId: '',
      runId: '',
      loadedLegId: '',
      emptyLegId: '',
      legacyEntryId: '',
      billedEntryId: '',
      cashEntryId: '',
      cashFundEntryId: '',
      reversedAllocationId: '',
    };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: `${PREFIX}-CX` } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);
      const entries = await prisma.transportFuelEntry.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const entryIds = entries.map((row) => row.id);
      // Bang phan bo la CHI GHI THEM — trigger chan ca `DELETE`. Tat trigger TRONG mot giao dich,
      // cung khuon `deleteFuelCostAttributionsForTest` cua `#364`.
      if (entryIds.length > 0) {
        await prisma.$transaction([
          prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportFuelCostAttribution" DISABLE TRIGGER "transport_fuel_cost_attribution_append_only"',
          ),
          prisma.transportFuelCostAttribution.deleteMany({
            where: { fuelEntryId: { in: entryIds } },
          }),
          prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportFuelCostAttribution" ENABLE TRIGGER "transport_fuel_cost_attribution_append_only"',
          ),
        ]);
      }
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

      // Vong chay o day do `projectTrip` sinh ra, nen MA cua no KHONG mang tien to cua bai — tim theo
      // chinh chiec xe cua bai la duong tat dinh duy nhat.
      const runs = await prisma.transportVehicleRun.findMany({
        where: { vehicle: { registrationPlate: { startsWith: `${PREFIX}-XE` } } },
        select: { id: true },
      });
      const runIds = runs.map((row) => row.id);
      const tripRows = await prisma.transportTrip.findMany({
        where: { code: { startsWith: `${PREFIX}-CH` } },
        select: { id: true },
      });
      const tripIds = tripRows.map((row) => row.id);
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      });
      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      await prisma.transportDriverFundEntry.deleteMany({
        where: { accountId: { in: accountIds }, kind: 'REVERSAL' },
      });
      await prisma.transportDriverFundEntry.deleteMany({
        where: { accountId: { in: accountIds } },
      });
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });

      // CA HAI chieu cua lien ket: theo chang (vong chay cua bai) va theo chuyen — mot lan chay hong
      // co the de lai mot ben ma khong de lai ben kia.
      await prisma.transportTripRunLegLink.deleteMany({
        where: { legId: { in: legs.map((leg) => leg.id) } },
      });
      await prisma.transportTripRunLegLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTripOrderLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      // `contains` chu khong `startsWith`: don do `projectTrip` sinh ra mang ma `ORD-<ma chuyen>`,
      // tuc tien to cua bai nam o GIUA. Tien to `IT-F369M` khong long voi tien to cua bai nao khac.
      await prisma.transportOrder.deleteMany({ where: { code: { contains: PREFIX } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: `${PREFIX}-XE` } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      await prisma.transportCustomer.deleteMany({ where: { name: { startsWith: `${PREFIX} ` } } });
    }

    /** `SUM` doc lai bang Prisma THO — ve con lai cua moi phep doi soat trong tep nay. */
    const legacyExpenseSum = async (): Promise<number> => {
      const rows = await prisma.transportTripExpense.findMany({
        where: { tripId: state.tripId },
        select: { signedAmount: true },
      });
      return rows.reduce((total, row) => total + Number(row.signedAmount), 0);
    };

    const attributionSum = async (): Promise<number> => {
      const rows = await prisma.transportFuelCostAttribution.findMany({
        where: { runId: state.runId },
        select: { signedAmount: true },
      });
      return rows.reduce((total, row) => total + Number(row.signedAmount), 0);
    };

    const command = (patch: Partial<SubmitFuelEntryCommand> = {}): SubmitFuelEntryCommand => ({
      runId: state.runId,
      driverId: state.driverId,
      supplierId: state.supplierId,
      liters: '100',
      amount: 2_000_000,
      odometerKm: 400_000,
      occurredAt: '2027-04-06T04:30:00.000Z',
      businessDate: '2027-04-06',
      paymentMethod: 'SUPPLIER_ACCOUNT',
      invoiceNo: null,
      note: null,
      correlationKey: `${PREFIX}-${randomUUID()}`,
      ...patch,
    });

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang IT #369 R-1',
          code: `${PREFIX}-CX`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2027-04-01T00:00:00.000Z'),
        })
      ).id;
      state.vehicleId = (
        await fleet.createVehicle({
          registrationPlate: `${PREFIX}-XE-A`,
          vehicleClass: 'Dau keo',
          allowedPayloadKg: 5_000,
        })
      ).id;
      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT F369M Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'FC',
          licenceExpiry: '2030-01-01',
          authUserId: null,
        })
      ).id;
      const customer = await fleet.createCustomer({ name: `${PREFIX} Khach` });

      /*
       * CHUYEN v1 THAT, roi CHIEU sang v2 — day la duong duy nhat sinh `TransportTripRunLegLink`, va
       * lien ket do chinh la cau noi ma `R8` dung de keo chi phi `TX-03` ve chang.
       */
      const trip = await trips.create({
        code: `${PREFIX}-CH`,
        kind: 'OWN_DIRECT',
        businessDate: '2027-04-06',
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        customerId: customer.id,
        freightAmount: 9_000_000,
        distanceKm: 120,
      });
      state.tripId = trip.id;
      await trips.assign(trip.id, {
        vehicleId: state.vehicleId,
        driverId: state.driverId,
        assignedBy: ACTOR,
        at: new Date('2027-04-06T00:00:00.000Z'),
      });

      const projection = await movement.projectTrip(trip.id, ACTOR);
      state.runId = projection.run.id;
      state.loadedLegId = projection.leg.id;
      state.emptyLegId = (
        await movement.addLeg(
          projection.run.id,
          {
            sequence: 2,
            kind: 'EMPTY',
            originLabel: 'Hai Phong',
            destinationLabel: 'Ha Noi',
            distanceKm: 120,
          },
          ACTOR,
        )
      ).id;
      await movement.assignRun(projection.run.id, { driverId: state.driverId }, ACTOR);
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('R1-IT-01 — phieu chuyen cu vao `TX-03`, phieu Run-first KHONG; va nguoc lai', async () => {
      const legacy = await fuel.submitFuelEntry(
        command({
          runId: null,
          tripId: state.tripId,
          vehicleId: state.vehicleId,
          amount: 1_000_000,
          liters: '50',
        }),
        'lx',
      );
      state.legacyEntryId = (await fuel.verifyFuelEntry(legacy.id, ACTOR)).id;

      const billed = await fuel.submitFuelEntry(
        // 2.500.000 d cho phieu Run-first: du cho ba lan cap phat cua R1-IT-02/03 ma khong cham tran
        // "tong phan bo <= so tien phieu" (`#364` §4) — bai nay do phep CONG, khong do cai tran do.
        command({
          legId: state.loadedLegId,
          odometerKm: 400_500,
          amount: 2_500_000,
          liters: '120',
        }),
        'lx',
      );
      state.billedEntryId = (await fuel.verifyFuelEntry(billed.id, ACTOR)).id;

      const legacyRow = await fuelRepo.findEntry(state.legacyEntryId);
      const billedRow = await fuelRepo.findEntry(state.billedEntryId);
      expect(legacyRow?.costExpenseId).not.toBeNull();
      expect(billedRow?.costExpenseId).toBeNull();
      // MOT PHIEU, MOT SO CAI: phieu chuyen cu khong co dong phan bo nao, va nguoc lai.
      expect(
        await prisma.transportFuelCostAttribution.count({
          where: { fuelEntryId: state.legacyEntryId },
        }),
      ).toBe(0);
      expect(await legacyExpenseSum()).toBe(1_000_000);
    });

    it('R1-IT-02 — phan bo `RUN` + `LEG` vao bien vong chay, tach nguon, khop tong hang goc', async () => {
      await attribution.attribute(
        state.billedEntryId,
        {
          target: { kind: 'RUN', runId: state.runId },
          amount: 1_200_000,
          correlationKey: `${PREFIX}-pb-run`,
        },
        ACTOR,
      );
      await attribution.attribute(
        state.billedEntryId,
        {
          target: { kind: 'LEG', legId: state.emptyLegId },
          amount: 800_000,
          correlationKey: `${PREFIX}-pb-leg-rong`,
        },
        ACTOR,
      );

      const margin = await read.runMargin(state.runId);
      expect(margin?.costSources).toEqual({
        legacyTripExpense: await legacyExpenseSum(),
        fuelCostAttribution: await attributionSum(),
      });
      expect(margin?.directCost).toBe(3_000_000);
      expect(margin?.runLevelCost).toBe(1_200_000);
      expect(margin?.legCosts).toEqual([
        {
          legId: state.loadedLegId,
          legacyTripExpense: 1_000_000,
          fuelCostAttribution: 0,
          directCost: 1_000_000,
        },
        {
          legId: state.emptyLegId,
          legacyTripExpense: 0,
          fuelCostAttribution: 800_000,
          directCost: 800_000,
        },
      ]);
      expect(margin?.tripIds).toEqual([state.tripId]);
      expect(margin?.fuelCostAttributionIds).toHaveLength(2);
      expect(margin?.unavailableSources).toEqual([]);
      expect(margin?.directMargin).toBe(9_000_000 - 3_000_000);
    });

    it('R1-IT-03 — dao mot cap phat: bao cao giam dung so do, va van khop tong hang goc', async () => {
      const allocated = await attribution.attribute(
        state.billedEntryId,
        {
          target: { kind: 'LEG', legId: state.loadedLegId },
          amount: 300_000,
          correlationKey: `${PREFIX}-pb-leg-hang`,
        },
        ACTOR,
      );
      state.reversedAllocationId = allocated.lines.at(-1)!.id;
      expect((await read.runMargin(state.runId))?.directCost).toBe(3_300_000);

      await attribution.reverse(state.reversedAllocationId, 'phan bo nham chang', ACTOR);

      const margin = await read.runMargin(state.runId);
      expect(margin?.costSources.fuelCostAttribution).toBe(await attributionSum());
      expect(margin?.directCost).toBe(3_000_000);
      // Ca hai dong deu duoc ke ten — cong `+300.000` roi `-300.000` la mot lich su doc duoc.
      expect(margin?.fuelCostAttributionIds).toHaveLength(4);
    });

    /**
     * R1-IT-04 — QUY LAI XE KHONG PHAI GIA THANH (`#369` R-4 gap R-1).
     *
     * Mot phieu Run-first `DRIVER_CASH` da duyet tru quy lai xe NGAY, nhung so tien do chi vao gia
     * thanh vong chay khi ke toan phan bo. Neu bao cao doc nham so quy, no se cong 600.000 hai lan —
     * mot lan luc duyet, mot lan luc phan bo.
     */
    it('R1-IT-04 — phieu `DRIVER_CASH` tru quy ngay, vao gia thanh CHI khi duoc phan bo', async () => {
      const cash = await fuel.submitFuelEntry(
        command({
          legId: state.emptyLegId,
          paymentMethod: 'DRIVER_CASH',
          amount: 600_000,
          liters: '25',
          odometerKm: 401_000,
        }),
        'lx',
      );
      const verified = await fuel.verifyFuelEntry(cash.id, ACTOR);
      state.cashEntryId = verified.id;
      state.cashFundEntryId = verified.driverFundEntryId ?? '';

      expect(state.cashFundEntryId).not.toBe('');
      expect((await fundRead.driverFundStatement(state.driverId)).balance).toBe(-600_000);
      // Chua ai phan bo -> gia thanh vong chay KHONG doi.
      expect((await read.runMargin(state.runId))?.directCost).toBe(3_000_000);

      await attribution.attribute(
        state.cashEntryId,
        {
          target: { kind: 'RUN', runId: state.runId },
          amount: 600_000,
          correlationKey: `${PREFIX}-pb-tien-mat`,
        },
        ACTOR,
      );
      const margin = await read.runMargin(state.runId);
      expect(margin?.directCost).toBe(3_600_000);
      expect(margin?.runLevelCost).toBe(1_800_000);
      // DUNG MOT LAN: tong bao cao van bang tong hai bang nguon, khong cong them so quy.
      expect(margin?.directCost).toBe((await legacyExpenseSum()) + (await attributionSum()));
      expect((await fundRead.driverFundStatement(state.driverId)).balance).toBe(-600_000);
    });

    /**
     * R1-IT-05 — KHONG CO CONG PHAN BO (khach tat `transport-fuel`): bao cao van dua ra tong THAT cua
     * phan `TX-03`, va NOI RA phan no khong doc duoc. Mot so 0 im lang o day se lam mot vong chay
     * ton 3.600.000 doc len nhu chi ton 1.000.000.
     */
    it('R1-IT-05 — thieu cong phan bo: `unavailableSources` noi ra, phan `TX-03` van dung', async () => {
      const margin = await readWithoutFuel.runMargin(state.runId);
      expect(margin?.unavailableSources).toEqual(['FUEL_COST_ATTRIBUTION']);
      expect(margin?.directCost).toBe(await legacyExpenseSum());
      expect(margin?.costSources).toEqual({ legacyTripExpense: 1_000_000, fuelCostAttribution: 0 });
      expect(margin?.fuelCostAttributionIds).toEqual([]);
    });

    /**
     * R1-IT-06 — DOI SOAT CUOI CUNG, doc lai qua mot ket noi MOI: tong bao cao = tong hai bang nguon,
     * va khong phieu nao nam o ca hai so cai.
     */
    it('R1-IT-06 — doc lai qua ket noi MOI: tong khop hai bang, khong phieu nao o ca hai so', async () => {
      const freshPrisma = new PrismaService();
      try {
        const freshRead = new OperatingMetricsReadService(
          new AnalyticsMovementFactsAdapter(new PrismaMovementRepository(freshPrisma)),
          new AnalyticsCostFactsAdapter(new PrismaCostingRepository(freshPrisma)),
          new AnalyticsFuelAttributionFactsAdapter(
            new PrismaFuelCostAttributionRepository(freshPrisma),
          ),
        );
        const margin = await freshRead.runMargin(state.runId);
        expect(margin?.directCost).toBe((await legacyExpenseSum()) + (await attributionSum()));

        const bothLedgers = await freshPrisma.transportFuelEntry.count({
          where: {
            supplierId: state.supplierId,
            costExpenseId: { not: null },
            costAttributions: { some: {} },
          },
        });
        expect(bothLedgers).toBe(0);
      } finally {
        await freshPrisma.$disconnect();
      }
    });
  },
);
