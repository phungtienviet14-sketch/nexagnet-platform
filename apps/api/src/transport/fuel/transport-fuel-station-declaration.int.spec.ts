import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReadService } from './fuel-read.service.js';
import { driverFuelSubmitSchema } from './fuel.schemas.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import { FuelService } from './fuel.service.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';

/**
 * `#317` G1 + thanh toan mac dinh — TRAM TREN TO KHAI, TREN POSTGRES THAT.
 *
 * ============================================================================================
 * NHUNG GI CHI POSTGRES CHUNG MINH DUOC
 *
 *   · `TransportFuelEntry.stationId` + khoa ngoai toi `TransportFuelStation` that su luu va doc lai;
 *   · trigger `TransportFuelEntry_station_supplier` tu choi mot tram cua nha cung cap KHAC ngay ca khi
 *     lenh ghi KHONG di qua tang mien (doi chung am: `UPDATE` thang, va `amendEntry` bo qua service);
 *   · to khai voi thanh toan MAC DINH (`SUPPLIER_ACCOUNT`) va lan duyet sau do KHONG sinh mot chung tu
 *     Settlement nao, KHONG mot ban giao cong no nao, KHONG mot dong quy lai xe nao — pham vi theo
 *     fixture, khong theo so toan cuc.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'G1 — tram tren to khai + SUPPLIER_ACCOUNT mac dinh, tren Postgres THAT — #317',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
    const stationRepo = new PrismaFuelStationRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);

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
    const fuelRuns = new MovementFuelRunContextAdapter(new PrismaMovementRepository(prisma));
    const fuel = new FuelService(
      fuelRepo,
      stationRepo,
      fuelCore,
      fuelRuns,
      new CostingFuelExpenseAdapter(costing, runExpenses),
      audit,
      CORE_POLICY,
      FUEL_POLICY,
    );
    const read = new FuelReadService(fuelRepo, fuelCore, stationRepo, fuelRuns);

    // Tien to RIENG, khong long voi tien to nao dang co.
    const SUPPLIER_CODE = 'IT-G1S-CX';
    const CODE_PREFIX = 'IT-G1S-CH';
    const PHONE_PREFIX = '0944G1S';
    const PLATE_PREFIX = 'IT-G1S-XE';
    const AUTH_USER = 'IT-G1S-user';
    const ACTOR = 'it-g1s-lai-xe';

    const state = {
      supplierA: '',
      supplierB: '',
      stationA: '',
      stationA2: '',
      stationB: '',
      stationClosed: '',
      driverId: '',
      vehicleId: '',
      tripId: '',
      entryId: '',
    };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: SUPPLIER_CODE } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);

      const entries = await prisma.transportFuelEntry.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      await prisma.transportFuelReceiptEvidence.deleteMany({
        where: { fuelEntryId: { in: entries.map((row) => row.id) } },
      });
      // Phieu TRUOC tram: `TransportFuelEntry_stationId_fkey` la RESTRICT.
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelStation.deleteMany({ where: { supplierId: { in: supplierIds } } });
      for (const kind of ['ADJUSTMENT', 'REVERSAL', 'ORIGINAL'] as const) {
        await prisma.transportSettlementDocument.deleteMany({
          where: { counterpartyId: { in: supplierIds }, kind },
        });
      }
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

      const owned = await prisma.transportTrip.findMany({
        where: { code: { startsWith: CODE_PREFIX } },
        select: { id: true },
      });
      const tripIds = owned.map((row) => row.id);
      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      for (const kind of ['REVERSAL', 'ADVANCE', 'RETURN', 'TRIP_EXPENSE', 'ADJUSTMENT'] as const) {
        await prisma.transportDriverFundEntry.deleteMany({
          where: { accountId: { in: accountIds }, kind },
        });
      }
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
    }

    const station = (supplierId: string, name: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') =>
      stationRepo.createStation({
        supplierId,
        name,
        nameNormalized: name.toUpperCase(),
        code: null,
        codeNormalized: null,
        address: null,
        latitudeE7: null,
        longitudeE7: null,
        geofenceRadiusM: null,
        status,
        note: null,
        at: new Date('2026-09-01T00:00:00Z'),
      });

    /** Than yeu cau cua LAI XE, KHONG co `paymentMethod` — mac dinh do schema dat. */
    const driverBody = (overrides: Record<string, unknown> = {}) =>
      driverFuelSubmitSchema.parse({
        tripId: state.tripId,
        vehicleId: state.vehicleId,
        supplierId: state.supplierA,
        stationId: state.stationA,
        liters: '150',
        amount: 3_150_000,
        odometerKm: 200_000,
        occurredAt: '2026-09-06T07:00:00+07:00',
        businessDate: '2026-09-06',
        correlationKey: 'it-g1s-phieu-1',
        ...overrides,
      });

    beforeAll(async () => {
      await cleanup();
      const supplier = (code: string, name: string) =>
        fuelRepo.createSupplier({
          name,
          code,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-09-01T00:00:00Z'),
        });
      state.supplierA = (await supplier(SUPPLIER_CODE, 'Cay xang G1S A')).id;
      state.supplierB = (await supplier(`${SUPPLIER_CODE}-B`, 'Cay xang G1S B')).id;
      state.stationA = (await station(state.supplierA, 'CHXD G1S so 1')).id;
      state.stationA2 = (await station(state.supplierA, 'CHXD G1S so 2')).id;
      state.stationB = (await station(state.supplierB, 'CHXD G1S nha khac')).id;
      state.stationClosed = (await station(state.supplierA, 'CHXD G1S da dong', 'INACTIVE')).id;

      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT G1S Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'C',
          licenceExpiry: '2030-01-01',
          authUserId: AUTH_USER,
        })
      ).id;
      state.vehicleId = (
        await fleet.createVehicle({
          registrationPlate: `${PLATE_PREFIX}-A`,
          vehicleClass: 'tai-5-tan',
          allowedPayloadKg: 5_000,
        })
      ).id;
      state.tripId = (
        await trips.create({
          code: `${CODE_PREFIX}-OWN`,
          kind: 'OWN_DIRECT',
          businessDate: '2026-09-06',
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 8_000_000,
          distanceKm: 120,
        })
      ).id;
      await trips.assign(state.tripId, {
        vehicleId: state.vehicleId,
        driverId: state.driverId,
        assignedBy: 'it-g1s',
        at: new Date('2026-09-06T00:00:00Z'),
      });
    }, 120_000);

    /*
     * DON SAU KHI CHAY, khong chi truoc. Buoc ke tiep cua job `integration` la lenh reset PHA HUY cua
     * du lieu mau (`demo-seed.int.spec.ts`), va danh sach bang cua no KHONG co `TransportFuelStation`:
     * mot tram fixture con sot se chan lenh xoa `TransportFuelSupplier` o
     * `TransportFuelStation_supplierId_fkey`. Cung khuon `transport-fuel-station.int.spec.ts`.
     */
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, 120_000);

    it('G1S-1 — to khai lai xe KHONG gui cach tra tien -> luu SUPPLIER_ACCOUNT va dung tram', async () => {
      const body = driverBody();
      expect(body.paymentMethod).toBe('SUPPLIER_ACCOUNT');

      const entry = await fuel.submitFuelEntry({ ...body, driverId: state.driverId }, ACTOR);
      state.entryId = entry.id;

      const row = await prisma.transportFuelEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(row).toMatchObject({
        stationId: state.stationA,
        supplierId: state.supplierA,
        paymentMethod: 'SUPPLIER_ACCOUNT',
      });
      await expect(read.getMyFuelSlip(AUTH_USER, entry.id)).resolves.toMatchObject({
        stationId: state.stationA,
        stationName: 'CHXD G1S so 1',
        paymentMethod: 'SUPPLIER_ACCOUNT',
      });
    });

    it('G1S-2 — gui lai cung tram -> phat lai; doi tram cung khoa -> FUEL_CORRELATION_KEY_REUSED', async () => {
      const replay = await fuel.submitFuelEntry(
        { ...driverBody(), driverId: state.driverId },
        ACTOR,
      );
      expect(replay.id).toBe(state.entryId);

      await expect(
        fuel.submitFuelEntry(
          { ...driverBody({ stationId: state.stationA2 }), driverId: state.driverId },
          ACTOR,
        ),
      ).rejects.toMatchObject({ reason: 'FUEL_CORRELATION_KEY_REUSED' });
      expect(
        await prisma.transportFuelEntry.count({ where: { supplierId: state.supplierA } }),
      ).toBe(1);
    });

    it('G1S-3 — tram cua nha cung cap KHAC / tram da dong -> tu choi co ma, khong ghi hang', async () => {
      await expect(
        fuel.submitFuelEntry(
          {
            ...driverBody({ stationId: state.stationB, correlationKey: 'it-g1s-phieu-sai-tram' }),
            driverId: state.driverId,
          },
          ACTOR,
        ),
      ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_STATION_SUPPLIER_MISMATCH' });

      await expect(
        fuel.submitFuelEntry(
          {
            ...driverBody({
              stationId: state.stationClosed,
              correlationKey: 'it-g1s-phieu-tram-dong',
            }),
            driverId: state.driverId,
          },
          ACTOR,
        ),
      ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_STATION_INACTIVE' });

      expect(
        await prisma.transportFuelEntry.count({ where: { supplierId: state.supplierA } }),
      ).toBe(1);
    });

    /**
     * DOI CHUNG AM: bo qua tang mien. Mot `UPDATE` thang, va `amendEntry` goi thang kho (khong qua
     * `FuelService.requireStation`) deu phai bi trigger chan — va phieu van tro dung tram cu.
     */
    it('G1S-4 — doi chung am CSDL: gan tram cua nha cung cap khac BO QUA service -> trigger tu choi', async () => {
      await expect(
        prisma.transportFuelEntry.update({
          where: { id: state.entryId },
          data: { stationId: state.stationB },
        }),
      ).rejects.toThrow(/TransportFuelEntry_station_supplier/);

      const current = await fuelRepo.findEntry(state.entryId);
      await expect(
        fuelRepo.amendEntry(
          state.entryId,
          { verification: 'DECLARED', lockedReconciliation: ['MATCHED', 'SETTLED'] },
          {
            litersUnits: current!.litersUnits,
            amount: current!.amount,
            odometerKm: current!.odometerKm,
            previousOdometerKm: current!.previousOdometerKm,
            consumptionUnits: current!.consumptionUnits,
            reviewReasons: current!.reviewReasons,
            businessDate: current!.businessDate,
            occurredAt: new Date(current!.occurredAt),
            supplierId: current!.supplierId,
            stationId: state.stationB,
            paymentMethod: current!.paymentMethod,
            invoiceNo: current!.invoiceNo,
            note: current!.note,
            at: new Date(),
          },
        ),
      ).rejects.toMatchObject({ reason: 'FUEL_ENTRY_STATION_SUPPLIER_MISMATCH' });

      // Doi NHA CUNG CAP ma giu tram cu cung bi chan — trigger nghe ca cot `supplierId`.
      await expect(
        prisma.transportFuelEntry.update({
          where: { id: state.entryId },
          data: { supplierId: state.supplierB },
        }),
      ).rejects.toThrow(/TransportFuelEntry_station_supplier/);

      expect(
        (await prisma.transportFuelEntry.findUniqueOrThrow({ where: { id: state.entryId } }))
          .stationId,
      ).toBe(state.stationA);
    });

    it('G1S-5 — khai + duyet voi mac dinh -> COMPANY_DIRECT; KHONG chung tu Settlement, KHONG quy lai xe', async () => {
      await fuel.verifyFuelEntry(state.entryId, 'it-g1s-ke-toan');

      const expenses = await prisma.transportTripExpense.findMany({
        where: { tripId: state.tripId },
      });
      expect(expenses).toHaveLength(1);
      expect(expenses[0]).toMatchObject({ fundedBy: 'COMPANY_DIRECT' });

      // Khong cong no nha cung cap nao sinh tu to khai hay lan duyet: AP chi di qua doi soat + dong ky.
      expect(
        await prisma.transportSettlementDocument.count({
          where: { counterpartyId: { in: [state.supplierA, state.supplierB] } },
        }),
      ).toBe(0);
      expect(
        await prisma.transportFuelSettlementHandoff.count({
          where: { supplierId: { in: [state.supplierA, state.supplierB] } },
        }),
      ).toBe(0);
      expect(
        await prisma.transportDriverFundEntry.count({
          where: { account: { driver: { phone: { startsWith: PHONE_PREFIX } } } },
        }),
      ).toBe(0);
    });

    it('G1S-6 — danh sach tram cua lai xe: chi tram DANG hop tac cua dung nha cung cap', async () => {
      const views = await read.listStationsForDriver(state.supplierA);
      expect(views.map((view) => view.id).sort()).toEqual([state.stationA, state.stationA2].sort());
    });
  },
);
