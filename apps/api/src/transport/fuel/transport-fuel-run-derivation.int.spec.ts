import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { JourneyCoreFactsAdapter, JourneyFuelFactsAdapter } from '../journey/journey-facts.port.js';
import { JourneyReadService } from '../journey/journey-read.service.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { DEFAULT_TRANSPORT_TIME_ZONE } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReadService } from './fuel-read.service.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import { fuelEntryInboxQuerySchema } from './fuel.schemas.js';
import { FuelService, type SubmitFuelEntryCommand } from './fuel.service.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';

/**
 * `#369` R-2 + R-5 tren Postgres THAT — DOC theo vong chay, va SUY ngu canh cho phieu chuyen v1.
 *
 * ```text
 * chuyen v1 --(projectTrip)--> vong chay + chang + TransportTripRunLegLink
 *   phieu dau cua CHUYEN      -> dong thoi gian: SUY ra chang; hop thu: `derivedRun`
 *   phieu dau cua VONG CHAY   -> dong thoi gian: chang DA KHAI, hoac muc vong chay
 *   sau tat ca cac lan DOC    -> hang phieu trong CSDL KHONG DOI mot cot nao (khong ghi nguoc)
 * ```
 *
 * TIEN TO RIENG `IT-F369J` — khong long voi `IT-F369D`, `IT-F369M`, `IT-F364*`, `IT-R8`.
 */
const PREFIX = 'IT-F369J';
const PHONE_PREFIX = '0999F369J';
const ACTOR = 'it-f369j-dieu-do';

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Dong thoi gian va hop thu doc phieu Run-first / suy vong chay cho phieu chuyen cu — #369 R-2/R-5',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const fuelRepo = new PrismaFuelRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);

    const corePolicy = { timeZone: DEFAULT_TRANSPORT_TIME_ZONE };
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
    const movement = new MovementService(movementRepo, fleet, audit, corePolicy, trips);
    const fuelRuns = new MovementFuelRunContextAdapter(movementRepo);
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      fuelRuns,
      new CostingFuelExpenseAdapter(
        new CostingService(costingRepo, core, audit, corePolicy, COSTING_POLICY),
        new RunExpenseService(
          costingRepo,
          core,
          new MovementCostingRunContextAdapter(movementRepo),
          audit,
          corePolicy,
        ),
      ),
      audit,
      corePolicy,
      FUEL_POLICY,
    );
    const read = new FuelReadService(
      fuelRepo,
      fuelCore,
      new PrismaFuelStationRepository(prisma),
      fuelRuns,
    );
    /** Bao cao hanh trinh KHONG co nguon moc/vi tri — dung phan `#369` them vao moi duoc do. */
    const journey = new JourneyReadService(
      new JourneyCoreFactsAdapter(movementRepo, fleet),
      undefined,
      undefined,
      new JourneyFuelFactsAdapter(fuelRepo),
    );

    const state = {
      supplierId: '',
      driverId: '',
      vehicleId: '',
      tripId: '',
      runId: '',
      runCode: '',
      loadedLegId: '',
      emptyLegId: '',
      legacyId: '',
      declaredId: '',
      runLevelId: '',
    };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: `${PREFIX}-CX` } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

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
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      await prisma.transportTripRunLegLink.deleteMany({
        where: { legId: { in: legs.map((leg) => leg.id) } },
      });
      await prisma.transportTripRunLegLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTripOrderLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { code: { contains: PREFIX } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: `${PREFIX}-XE` } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      await prisma.transportCustomer.deleteMany({ where: { name: { startsWith: `${PREFIX} ` } } });
    }

    const command = (patch: Partial<SubmitFuelEntryCommand> = {}): SubmitFuelEntryCommand => ({
      runId: state.runId,
      driverId: state.driverId,
      supplierId: state.supplierId,
      liters: '80',
      amount: 1_600_000,
      odometerKm: 500_000,
      occurredAt: '2027-05-06T04:30:00.000Z',
      businessDate: '2027-05-06',
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
          name: 'Cay xang IT #369 R-2',
          code: `${PREFIX}-CX`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2027-05-01T00:00:00.000Z'),
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
          fullName: 'IT F369J Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'FC',
          licenceExpiry: '2030-01-01',
          authUserId: null,
        })
      ).id;
      const customer = await fleet.createCustomer({ name: `${PREFIX} Khach` });

      const trip = await trips.create({
        code: `${PREFIX}-CH`,
        kind: 'OWN_DIRECT',
        businessDate: '2027-05-06',
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        customerId: customer.id,
        freightAmount: 8_000_000,
        distanceKm: 120,
      });
      state.tripId = trip.id;
      await trips.assign(trip.id, {
        vehicleId: state.vehicleId,
        driverId: state.driverId,
        assignedBy: ACTOR,
        at: new Date('2027-05-06T00:00:00.000Z'),
      });

      const projection = await movement.projectTrip(trip.id, ACTOR);
      state.runId = projection.run.id;
      state.runCode = projection.run.code;
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

      state.legacyId = (
        await fuel.submitFuelEntry(
          command({ runId: null, tripId: state.tripId, vehicleId: state.vehicleId }),
          'lx',
        )
      ).id;
      state.declaredId = (
        await fuel.submitFuelEntry(
          command({ legId: state.emptyLegId, odometerKm: 500_400, amount: 900_000, liters: '40' }),
          'lx',
        )
      ).id;
      state.runLevelId = (
        await fuel.submitFuelEntry(
          command({ odometerKm: 500_800, amount: 500_000, liters: '20' }),
          'lx',
        )
      ).id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('R2-IT-01 — dong thoi gian co CA BA phieu, moi phieu MOT lan, kem ly do dat cho', async () => {
      const view = await journey.runJourney(state.runId);
      const fuelEvents = view.timeline.filter((event) => event.kind === 'FUEL');

      expect(fuelEvents).toHaveLength(3);
      expect(
        Object.fromEntries(
          fuelEvents.map((event) => [event.subjectId, [event.placement, event.legId]]),
        ),
      ).toEqual({
        [state.legacyId]: ['DERIVED_FROM_TRIP_LINK', state.loadedLegId],
        [state.declaredId]: ['DECLARED', state.emptyLegId],
        [state.runLevelId]: ['RUN_LEVEL', null],
      });
      // Nguon MOC vang mat duoc NOI RA — con nhien lieu thi khong. (`LOCATION_PROOF` chi duoc hoi o
      // tuyen BAN DO, khong o bao cao nay — xem `runJourneyMap`.)
      expect([...view.unavailableSources]).toEqual(['CHECKPOINT']);
    });

    it('R2-IT-02 — bao cao tra ve qua MA vong chay cung cho dung dong thoi gian do', async () => {
      const byCode = await journey.runJourney(state.runCode);
      expect(byCode.timeline.filter((event) => event.kind === 'FUEL')).toHaveLength(3);
    });

    it('R5-IT-01 — hop thu: phieu chuyen v1 mang `derivedRun`, phieu Run-first thi khong', async () => {
      const page = await read.fuelEntryInbox(
        fuelEntryInboxQuerySchema.parse({ tripCode: `${PREFIX}-CH` }),
      );
      const [row] = page.rows;
      expect(row).toMatchObject({
        id: state.legacyId,
        tripId: state.tripId,
        runId: null,
        legId: null,
        derivedRun: {
          runId: state.runId,
          runCode: state.runCode,
          legId: state.loadedLegId,
          legSequence: 1,
          via: 'TRIP_RUN_LEG_LINK',
        },
      });

      const runFirst = await read.fuelEntryInbox(
        fuelEntryInboxQuerySchema.parse({ runCode: state.runCode }),
      );
      for (const entry of runFirst.rows.filter((item) => item.tripId === null)) {
        expect(entry.derivedRun).toBeNull();
      }
    });

    it('R5-IT-02 — loc theo MA VONG CHAY thay CA phieu chuyen v1 da chieu sang vong chay do', async () => {
      const page = await read.fuelEntryInbox(
        fuelEntryInboxQuerySchema.parse({ runCode: state.runCode }),
      );
      expect(page.rows.map((row) => row.id).sort()).toEqual(
        [state.legacyId, state.declaredId, state.runLevelId].sort(),
      );
      expect(page.total).toBe(3);

      const none = await read.fuelEntryInbox(
        fuelEntryInboxQuerySchema.parse({ runCode: `${PREFIX}-KHONG-CO` }),
      );
      expect(none.total).toBe(0);
    });

    /**
     * R5-IT-03 — SUY, KHONG GHI. Sau moi lan doc o tren, hang phieu trong CSDL phai y nguyen: phieu
     * chuyen v1 van `runId`/`legId` NULL. Neu mot ngay nao do ai do "tien tay" backfill, bai nay do —
     * va no do TRUOC khi mot phieu chuyen v1 doi sang so cai cua phieu Run-first (`#364` §3).
     */
    it('R5-IT-03 — khong mot cot nao cua phieu cu bi ghi nguoc', async () => {
      const rows = await prisma.transportFuelEntry.findMany({
        where: { supplierId: state.supplierId },
        select: { id: true, tripId: true, runId: true, legId: true },
        orderBy: { id: 'asc' },
      });
      expect(
        Object.fromEntries(rows.map((row) => [row.id, [row.tripId, row.runId, row.legId]])),
      ).toEqual({
        [state.legacyId]: [state.tripId, null, null],
        [state.declaredId]: [null, state.runId, state.emptyLegId],
        [state.runLevelId]: [null, state.runId, null],
      });
    });
  },
);
