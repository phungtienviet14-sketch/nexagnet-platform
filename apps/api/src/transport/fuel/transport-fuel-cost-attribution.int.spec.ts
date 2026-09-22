import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import type { TransportCostingPolicy } from '../costing/costing-policy.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { FuelCostAttributionReadService } from './fuel-cost-attribution-read.service.js';
import { FuelCostAttributionService } from './fuel-cost-attribution.service.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { MovementFuelRunContextAdapter } from './fuel-run-context.port.js';
import {
  deleteFuelCostAttributionsForTest,
  deleteFuelDiscrepanciesForTest,
} from './fuel-test-cleanup.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from './fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from './fuel.service.js';
import { PrismaFuelCostAttributionRepository } from './prisma-fuel-cost-attribution.repository.js';
import { PrismaFuelRepository } from './prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from './prisma-fuel-station.repository.js';

/**
 * `#364` §3.1 — BAT BIEN PHAN BO GIA THANH tren Postgres THAT.
 *
 * ===========================================================================
 * VI SAO PHAI CO TEP NAY ben canh `fuel-cost-attribution.spec.ts`
 *
 * Kho trong bo nho chay MOT luong: "hai cap phat dong thoi khong cung vuot" xanh o do ma khong
 * chung minh gi ve khoa hang. Tep nay ep THU TU bang mot giao dich GIU khoa hang phieu, cho HAI lenh
 * cap phat cung vao hang doi khoa (do bang `pg_stat_activity`, khong doan), roi moi tha — nen ket
 * qua "mot thanh cong, mot `EXCEEDS`" la ket qua cua khoa, khong phai cua lich chay may man.
 *
 * Cung khuon do chay lai voi hai lenh `INSERT` THO (khong qua tang mien): trigger
 * `transport_fuel_cost_attribution_guard` tu khoa hang phieu, nen luoi o tang CSDL cung dung duoc
 * voi hai nguoi ghi.
 *
 * TIEN TO RIENG: `IT-F364A-`, so dien thoai `0999F364A`. Don o `beforeAll` VA `afterAll`.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Phan bo gia thanh nhien lieu Run-first tren Postgres THAT — #364',
  () => {
    const prisma = new PrismaService();
    const fuelRepo = new PrismaFuelRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const movement = new PrismaMovementRepository(prisma);
    const attributionRepo = new PrismaFuelCostAttributionRepository(prisma);

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
      new PrismaCostingRepository(prisma),
      new TransportCoreFactsAdapter(trips, fleet),
      audit,
      CORE_POLICY,
      COSTING_POLICY,
    );
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuelRuns = new MovementFuelRunContextAdapter(movement);
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      fuelRuns,
      new CostingFuelExpenseAdapter(costing),
      audit,
      CORE_POLICY,
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

    const PREFIX = 'IT-F364A';
    const PHONE_PREFIX = '0999F364A';
    const ACTOR = 'it-f364a-ke-toan';

    const state = {
      supplierId: '',
      driver: '',
      vehicleA: '',
      vehicleB: '',
      runA: '',
      emptyLegA: '',
      loadedLegA: '',
      runB: '',
      legB: '',
      tripId: '',
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

      await deleteFuelCostAttributionsForTest(prisma, entryIds);
      const recons = await prisma.transportFuelReconciliation.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      await deleteFuelDiscrepanciesForTest(
        prisma,
        recons.map((row) => row.id),
      );
      await prisma.transportFuelReceiptEvidence.deleteMany({
        where: { fuelEntryId: { in: entryIds } },
      });

      const owned = await prisma.transportTrip.findMany({
        where: { code: { startsWith: `${PREFIX}-CH` } },
        select: { id: true },
      });
      const tripIds = owned.map((row) => row.id);
      // Phieu chuyen v1 da duyet de lai mot dong gia thanh o `TX-03` — xoa TRUOC phieu va chuyen.
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });
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

    const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
      try {
        await promise;
      } catch (error) {
        if (error instanceof TransportDomainError) return `${error.kind}:${error.reason}`;
        throw error;
      }
      throw new Error('lenh le ra phai bi tu choi');
    };

    /** Mot phieu Run-first DA DUYET cua xe A — `amount` dong. */
    async function verifiedNativeEntry(amount: number): Promise<string> {
      const command: SubmitFuelEntryCommand = {
        runId: state.runA,
        driverId: state.driver,
        supplierId: state.supplierId,
        liters: '50',
        amount,
        odometerKm: 300_000,
        occurredAt: '2026-09-12T09:00:00+07:00',
        businessDate: '2026-09-12',
        paymentMethod: 'SUPPLIER_ACCOUNT',
        correlationKey: `${PREFIX}-${randomUUID()}`,
      };
      const entry = await fuel.submitFuelEntry(command, 'lx');
      await fuel.verifyFuelEntry(entry.id, ACTOR);
      return entry.id;
    }

    /** Mot dong THO qua Prisma — KHONG qua tang mien, chi co trigger cua CSDL dung giua. */
    const rawAllocation = (data: {
      fuelEntryId: string;
      runId: string;
      legId?: string | null;
      signedAmount: bigint;
    }) =>
      prisma.transportFuelCostAttribution.create({
        data: {
          fuelEntryId: data.fuelEntryId,
          kind: 'ALLOCATION',
          targetKind: data.legId ? 'LEG' : 'RUN',
          runId: data.runId,
          legId: data.legId ?? null,
          signedAmount: data.signedAmount,
          correlationKey: `${PREFIX}-raw-${randomUUID()}`,
          recordedBy: ACTOR,
        },
      });

    const activeSum = async (fuelEntryId: string): Promise<number> => {
      const rows = await prisma.transportFuelCostAttribution.findMany({
        where: { fuelEntryId },
        select: { signedAmount: true },
      });
      return rows.reduce((total, row) => total + Number(row.signedAmount), 0);
    };

    /**
     * GIU khoa hang phieu trong mot giao dich rieng cho toi khi `release()`.
     *
     * `locked` chi hoan tat SAU khi cau `FOR UPDATE` da lay duoc khoa — tuc moi lenh cap phat goi
     * sau do CHAC CHAN xep hang sau giao dich nay.
     */
    function holdEntryLock(fuelEntryId: string): {
      locked: Promise<void>;
      release: () => void;
      done: Promise<void>;
    } {
      let signalLocked = (): void => {};
      let release = (): void => {};
      const locked = new Promise<void>((resolve) => {
        signalLocked = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT "id" FROM "TransportFuelEntry" WHERE "id" = ${fuelEntryId} FOR UPDATE`;
          signalLocked();
          await gate;
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      return { locked, release, done };
    }

    /** Cho toi khi `count` phien cua CHINH bai nay dang doi khoa voi cau lenh chua `marker`. */
    async function waitForLockQueue(marker: string, count: number): Promise<void> {
      for (let attempt = 0; attempt < 400; attempt += 1) {
        const rows = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT count(*) AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE ${`%${marker}%`}`;
        if (Number(rows[0]?.n ?? 0) >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Khong thay ${count} phien doi khoa voi "${marker}"`);
    }

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang IT #364 phan bo',
          code: `${PREFIX}-CX`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2026-09-01T00:00:00Z'),
        })
      ).id;
      state.driver = (
        await fleet.createDriver({
          fullName: 'IT F364A Lai xe',
          phone: `${PHONE_PREFIX}A`,
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
        driverId: state.driver,
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

      state.tripId = (
        await trips.create({
          code: `${PREFIX}-CH-OWN`,
          kind: 'OWN_DIRECT',
          businessDate: '2026-09-12',
          originLabel: 'Ha Noi',
          destinationLabel: 'Thai Nguyen',
          cargoDescription: null,
          customerId: null,
          carrierPartnerId: null,
          referrerPartnerId: null,
          freightAmount: 9_000_000,
          distanceKm: 100,
        })
      ).id;
      await trips.assign(state.tripId, {
        vehicleId: state.vehicleA,
        driverId: state.driver,
        assignedBy: ACTOR,
        at: new Date('2026-09-12T00:00:00Z'),
      });
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    /* ============================== A1 ============================== */

    it('A1 — cap phat + phat lai: CUNG khoa -> MOT dong; KHAC so tien -> va cham co ma', async () => {
      const entryId = await verifiedNativeEntry(2_100_000);
      const key = `${PREFIX}-khoa-${randomUUID()}`;
      const command = {
        target: { kind: 'RUN' as const, runId: state.runA },
        amount: 1_400_000,
        note: 'phan bo IT',
        correlationKey: key,
      };

      await attribution.attribute(entryId, command, ACTOR);
      await attribution.attribute(entryId, command, ACTOR);
      await Promise.all([
        attribution.attribute(entryId, command, ACTOR),
        attribution.attribute(entryId, command, ACTOR),
      ]);
      expect(
        await prisma.transportFuelCostAttribution.count({ where: { fuelEntryId: entryId } }),
      ).toBe(1);
      expect(
        await reasonOf(attribution.attribute(entryId, { ...command, amount: 1_000_000 }, ACTOR)),
      ).toBe('CONFLICT:FUEL_COST_ATTRIBUTION_KEY_REUSED');
      expect(await activeSum(entryId)).toBe(1_400_000);
    });

    /* ============================== A2 ============================== */

    /**
     * A2 — HAI CAP PHAT DONG THOI, THU TU DUOC EP.
     *
     * 2.000.000 d, hai lenh 1.500.000 d. Giao dich giu khoa lay hang phieu TRUOC; hai lenh cap phat
     * vao hang doi (do bang `pg_stat_activity`); roi moi tha. Neu kho doc tong NGOAI khoa, ca hai se
     * doc 0 va cung ghi — tong 3.000.000 > 2.000.000. Voi khoa, lan sau doc 1.500.000 va bi tu choi.
     */
    it('A2 — hai cap phat song song qua dich vu khong cung vuot so tien phieu', async () => {
      const entryId = await verifiedNativeEntry(2_000_000);
      const holder = holdEntryLock(entryId);
      await holder.locked;

      // Bat ket cuc NGAY khi gai (`int-spec-racer-phai-bat-ket-cuc-ngay`).
      const settle = (promise: Promise<unknown>) =>
        promise.then(
          () => 'OK',
          (error: unknown) =>
            error instanceof TransportDomainError ? error.reason : `LOI:${String(error)}`,
        );
      const first = settle(
        attribution.attribute(
          entryId,
          {
            target: { kind: 'RUN', runId: state.runA },
            amount: 1_500_000,
            correlationKey: `${PREFIX}-dong-thoi-1-${randomUUID()}`,
          },
          ACTOR,
        ),
      );
      const second = settle(
        attribution.attribute(
          entryId,
          {
            target: { kind: 'LEG', legId: state.loadedLegA },
            amount: 1_500_000,
            correlationKey: `${PREFIX}-dong-thoi-2-${randomUUID()}`,
          },
          ACTOR,
        ),
      );

      try {
        await waitForLockQueue('"verificationStatus"::text AS "verificationStatus"', 2);
      } finally {
        // Tha khoa DU bai do — neu khong, giao dich giu khoa treo va lam chet ca buoc don dep.
        holder.release();
        await holder.done;
      }

      expect([await first, await second].sort()).toEqual([
        'FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY',
        'OK',
      ]);
      expect(await activeSum(entryId)).toBe(1_500_000);
      expect(
        await prisma.transportFuelCostAttribution.count({ where: { fuelEntryId: entryId } }),
      ).toBe(1);
    });

    /**
     * A3 — LUOI O TANG CSDL CUNG DUNG VOI HAI NGUOI GHI: hai `INSERT` THO, cung ep thu tu.
     *
     * Khong mot dong nao cua tang mien chay o day. Trigger `transport_fuel_cost_attribution_guard` tu
     * khoa hang phieu `FOR UPDATE` roi moi cong, nen lan `INSERT` thu hai doc tong da commit cua lan
     * dau va bi CSDL tu choi.
     */
    it('A3 — hai INSERT tho song song: trigger tu choi lan vuot', async () => {
      const entryId = await verifiedNativeEntry(2_000_000);
      const holder = holdEntryLock(entryId);
      await holder.locked;

      const settle = (promise: Promise<unknown>) =>
        promise.then(
          () => 'OK',
          (error: unknown) =>
            String(error).includes('transport_fuel_cost_attribution_exceeds_entry')
              ? 'EXCEEDS'
              : `LOI:${String(error)}`,
        );
      const first = settle(
        rawAllocation({ fuelEntryId: entryId, runId: state.runA, signedAmount: 1_500_000n }),
      );
      const second = settle(
        rawAllocation({
          fuelEntryId: entryId,
          runId: state.runA,
          legId: state.emptyLegA,
          signedAmount: 1_500_000n,
        }),
      );

      try {
        await waitForLockQueue('INSERT INTO "public"."TransportFuelCostAttribution"', 2);
      } finally {
        holder.release();
        await holder.done;
      }

      expect([await first, await second].sort()).toEqual(['EXCEEDS', 'OK']);
      expect(await activeSum(entryId)).toBe(1_500_000);
    });

    it('A4 — trigger chan tung hinh dang sai khi ghi THANG', async () => {
      const entryId = await verifiedNativeEntry(1_000_000);

      await expect(
        rawAllocation({ fuelEntryId: entryId, runId: state.runA, signedAmount: 1_000_001n }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_exceeds_entry/);
      await expect(
        rawAllocation({ fuelEntryId: entryId, runId: state.runB, signedAmount: 1_000n }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_target_vehicle/);
      await expect(
        rawAllocation({
          fuelEntryId: entryId,
          runId: state.runA,
          legId: state.legB,
          signedAmount: 1_000n,
        }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_leg_run/);

      // Phieu CHUA duyet.
      const declared = await fuel.submitFuelEntry(
        {
          runId: state.runA,
          driverId: state.driver,
          supplierId: state.supplierId,
          liters: '10',
          amount: 200_000,
          odometerKm: 300_100,
          occurredAt: '2026-09-12T15:00:00+07:00',
          businessDate: '2026-09-12',
          paymentMethod: 'SUPPLIER_ACCOUNT',
          correlationKey: `${PREFIX}-${randomUUID()}`,
        },
        'lx',
      );
      await expect(
        rawAllocation({ fuelEntryId: declared.id, runId: state.runA, signedAmount: 1_000n }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_not_verified/);
      expect(
        await reasonOf(
          attribution.attribute(
            declared.id,
            {
              target: { kind: 'RUN', runId: state.runA },
              amount: 1_000,
              correlationKey: `${PREFIX}-${randomUUID()}`,
            },
            ACTOR,
          ),
        ),
      ).toBe('DENIED:FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED');
    });

    /**
     * A5 — MOT PHIEU, MOT SO CAI. Phieu chuyen v1 da duyet co dong gia thanh o `TX-03`; ca dich vu
     * lan `INSERT` tho deu khong them duoc dong phan bo nao cho no.
     */
    it('A5 — phieu chuyen v1: da vao TX-03, KHONG phan bo duoc (ca dich vu lan CSDL)', async () => {
      const legacy = await fuel.submitFuelEntry(
        {
          tripId: state.tripId,
          vehicleId: state.vehicleA,
          driverId: state.driver,
          supplierId: state.supplierId,
          liters: '40',
          amount: 800_000,
          odometerKm: 300_200,
          occurredAt: '2026-09-12T18:00:00+07:00',
          businessDate: '2026-09-12',
          paymentMethod: 'SUPPLIER_ACCOUNT',
          correlationKey: `${PREFIX}-${randomUUID()}`,
        },
        ACTOR,
      );
      const verified = await fuel.verifyFuelEntry(legacy.id, ACTOR);
      expect(verified.costExpenseId).not.toBeNull();
      expect(
        await prisma.transportTripExpense.count({ where: { correlationKey: `fuel:${legacy.id}` } }),
      ).toBe(1);

      expect(
        await reasonOf(
          attribution.attribute(
            legacy.id,
            {
              target: { kind: 'RUN', runId: state.runA },
              amount: 1_000,
              correlationKey: `${PREFIX}-${randomUUID()}`,
            },
            ACTOR,
          ),
        ),
      ).toBe('DENIED:FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED');
      await expect(
        rawAllocation({ fuelEntryId: legacy.id, runId: state.runA, signedAmount: 1_000n }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_legacy_trip/);

      const view = await attributionRead.viewForEntry(legacy.id);
      expect(view).toMatchObject({
        ledger: 'LEGACY_TRIP_EXPENSE',
        legacyTrip: { tripId: state.tripId, tripCode: `${PREFIX}-CH-OWN` },
        attributedAmount: null,
        lines: [],
      });
    });

    it('A6 — dao giu lich su; hai lan dao song song -> MOT dong dao; UPDATE/DELETE bi chan', async () => {
      const entryId = await verifiedNativeEntry(1_200_000);
      const allocated = await attribution.attribute(
        entryId,
        {
          target: { kind: 'LEG', legId: state.emptyLegA },
          amount: 1_200_000,
          correlationKey: `${PREFIX}-${randomUUID()}`,
        },
        ACTOR,
      );
      const allocationId = allocated.lines[0]!.id;

      const [left, right] = await Promise.all([
        attribution.reverse(allocationId, 'nham chang', ACTOR),
        attribution.reverse(allocationId, 'nham chang (bam lai)', ACTOR),
      ]);
      expect(left.lines).toHaveLength(2);
      expect(right.lines).toHaveLength(2);
      expect(
        await prisma.transportFuelCostAttribution.count({ where: { reversalOfId: allocationId } }),
      ).toBe(1);
      expect(await activeSum(entryId)).toBe(0);

      await expect(
        prisma.transportFuelCostAttribution.update({
          where: { id: allocationId },
          data: { note: 'sua lich su' },
        }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_append_only/);
      await expect(
        prisma.transportFuelCostAttribution.delete({ where: { id: allocationId } }),
      ).rejects.toThrow(/transport_fuel_cost_attribution_append_only/);

      // Cap phat LAI sau khi dao — lich su giu ca ba dong.
      const again = await attribution.attribute(
        entryId,
        {
          target: { kind: 'RUN', runId: state.runA },
          amount: 1_200_000,
          correlationKey: `${PREFIX}-${randomUUID()}`,
        },
        ACTOR,
      );
      expect(again).toMatchObject({ attributedAmount: 1_200_000, unattributedAmount: 0 });
      expect(again.lines.map((line) => line.kind)).toEqual([
        'ALLOCATION',
        'REVERSAL',
        'ALLOCATION',
      ]);
    });

    /**
     * A7 — PHAN BO KHONG CHAM gi ngoai bang cua no: su that cua phieu, `TX-03`, Quy lai xe dung yen;
     * bao cao vong chay doc DUNG; doc lai qua ket noi MOI cho cung ket qua.
     */
    it('A7 — khong cham phieu/TX-03/Quy; bao cao vong chay dung; doc lai qua ket noi MOI', async () => {
      const entryId = await verifiedNativeEntry(900_000);
      const before = await prisma.transportFuelEntry.findUnique({ where: { id: entryId } });
      const expensesBefore = await prisma.transportTripExpense.count({
        where: { tripId: state.tripId },
      });
      const fundBefore = await prisma.transportDriverFundEntry.count({
        where: { account: { driverId: state.driver } },
      });

      await attribution.attribute(
        entryId,
        {
          target: { kind: 'RUN', runId: state.runA },
          amount: 300_000,
          correlationKey: `${PREFIX}-${randomUUID()}`,
        },
        ACTOR,
      );
      await attribution.attribute(
        entryId,
        {
          target: { kind: 'LEG', legId: state.loadedLegA },
          amount: 600_000,
          correlationKey: `${PREFIX}-${randomUUID()}`,
        },
        ACTOR,
      );

      expect(await prisma.transportFuelEntry.findUnique({ where: { id: entryId } })).toEqual(
        before,
      );
      expect(await prisma.transportTripExpense.count({ where: { tripId: state.tripId } })).toBe(
        expensesBefore,
      );
      expect(
        await prisma.transportDriverFundEntry.count({
          where: { account: { driverId: state.driver } },
        }),
      ).toBe(fundBefore);

      const freshPrisma = new PrismaService();
      try {
        const freshFuel = new PrismaFuelRepository(freshPrisma);
        const freshRead = new FuelCostAttributionReadService(
          freshFuel,
          new PrismaFuelCostAttributionRepository(freshPrisma),
          new MovementFuelRunContextAdapter(new PrismaMovementRepository(freshPrisma)),
          new TransportFuelCoreFactsAdapter(
            new PrismaTripRepository(freshPrisma),
            new PrismaFleetRepository(freshPrisma),
          ),
        );
        const view = await freshRead.viewForEntry(entryId);
        expect(view).toMatchObject({
          ledger: 'FUEL_COST_ATTRIBUTION',
          attributedAmount: 900_000,
          unattributedAmount: 0,
        });

        const report = await freshRead.reportForRun(state.runA);
        const mine = report.entries.find((entry) => entry.fuelEntryId === entryId);
        expect(mine).toEqual({ fuelEntryId: entryId, businessDate: '2026-09-12', amount: 900_000 });
        expect(report.legacyTripExpenseIncluded).toBe(false);
        // Tong cua bao cao = tong DANG HIEU LUC cua moi dong co dich trong vong chay nay.
        const rows = await freshPrisma.transportFuelCostAttribution.findMany({
          where: { runId: state.runA },
          select: { signedAmount: true },
        });
        expect(report.totalAmount).toBe(
          rows.reduce((total, row) => total + Number(row.signedAmount), 0),
        );
        expect(report.runLevelAmount + report.legs.reduce((t, leg) => t + leg.amount, 0)).toBe(
          report.totalAmount,
        );
      } finally {
        await freshPrisma.$disconnect();
      }
    });
  },
);
