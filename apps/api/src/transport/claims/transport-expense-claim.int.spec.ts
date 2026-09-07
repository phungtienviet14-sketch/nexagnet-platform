import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { describeStorageError } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { ExpenseClaimService } from './claim.service.js';
import { PrismaExpenseClaimRepository } from './prisma-claim.repository.js';

/**
 * DE NGHI CHI tren POSTGRES THAT (R1-C).
 *
 * Ban trong bo nho khong phu nhan duoc mot `CHECK` cua Postgres. Bo test nay chung minh cai ma ca
 * tranche dua vao: mot de nghi chua duyet KHONG cach nao cham vao gia thanh, ke ca khi ai do ghi
 * thang qua Prisma.
 */

const PREFIX = 'IT-EC';
const PLATE_PREFIX = 'IT-EC-XE';
const PHONE_PREFIX = '0956EC';

const DRIVER_ACTOR = 'it-ec-lai-xe';
const REVIEWER = 'it-ec-ke-toan';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const COSTING_POLICY = { expenseCategories: [], advanceApprovalRequired: false } as const;
const BUSINESS_DATE = '2026-09-07';

describe.runIf(process.env.RUN_PRISMA_IT === '1')('de nghi chi tren Postgres that', () => {
  const prisma = new PrismaService();
  const fleet = new PrismaFleetRepository(prisma);
  const trips = new PrismaTripRepository(prisma);
  const movement = new PrismaMovementRepository(prisma);
  const costingRepo = new PrismaCostingRepository(prisma);
  const core = new TransportCoreFactsAdapter(trips, fleet);
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  const costing = new CostingService(costingRepo, core, audit, POLICY, COSTING_POLICY);
  const costingRead = new CostingReadService(costingRepo, core);
  const claimRepo = new PrismaExpenseClaimRepository(prisma);
  const service = new ExpenseClaimService(claimRepo, costing, core, movement, fleet, audit, POLICY);

  /** Don dep theo THU TU AN TOAN VE KHOA NGOAI. */
  async function cleanup(): Promise<void> {
    const drivers = await prisma.transportDriver.findMany({
      where: { phone: { startsWith: PHONE_PREFIX } },
      select: { id: true },
    });
    const driverIds = drivers.map((driver) => driver.id);

    const claims = await prisma.transportExpenseClaim.findMany({
      where: { driverId: { in: driverIds } },
      select: { id: true },
    });
    const claimIds = claims.map((claim) => claim.id);
    await prisma.transportExpenseClaimDecision.deleteMany({ where: { claimId: { in: claimIds } } });
    await prisma.transportExpenseClaim.deleteMany({ where: { id: { in: claimIds } } });

    const tripRows = await prisma.transportTrip.findMany({
      where: { code: { contains: PREFIX } },
      select: { id: true },
    });
    const tripIds = tripRows.map((trip) => trip.id);
    await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds } } });

    const accounts = await prisma.transportDriverFundAccount.findMany({
      where: { driverId: { in: driverIds } },
      select: { id: true },
    });
    const accountIds = accounts.map((account) => account.id);
    await prisma.transportDriverFundEntry.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });

    const runs = await prisma.transportVehicleRun.findMany({
      where: { code: { contains: PREFIX } },
      select: { id: true },
    });
    const runIds = runs.map((run) => run.id);
    await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });

    await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });

    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PLATE_PREFIX } },
    });
    await prisma.transportDriver.deleteMany({ where: { id: { in: driverIds } } });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof TransportDomainError) return error.reason;
      throw new Error(`loi chua duoc dich sang mien: ${describeStorageError(error)}`);
    }
    throw new Error('mong doi mot TransportDomainError, nhung loi goi da thanh cong');
  };

  let suffix = 0;

  /** Mot lai xe + mot chuyen da phan cong cho chinh lai xe do. */
  async function aDriverOnATrip(): Promise<{ driverId: string; tripId: string }> {
    suffix += 1;
    const vehicle = await fleet.createVehicle({
      registrationPlate: `${PLATE_PREFIX}-${suffix}`,
      vehicleClass: 'Dau keo',
    });
    const driver = await fleet.createDriver({
      fullName: `IT-EC Lai xe ${suffix}`,
      phone: `${PHONE_PREFIX}${String(suffix).padStart(2, '0')}`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    const trip = await trips.create({
      code: `${PREFIX}-CHUYEN-${suffix}`,
      kind: 'OWN_DIRECT',
      businessDate: BUSINESS_DATE,
      originLabel: 'Ha Noi',
      destinationLabel: 'Hai Phong',
    });
    await trips.assign(trip.id, {
      vehicleId: vehicle.id,
      driverId: driver.id,
      assignedBy: REVIEWER,
      at: new Date(),
    });
    return { driverId: driver.id, tripId: trip.id };
  }

  const submit = (driverId: string, tripId: string | null, over: Record<string, unknown> = {}) =>
    service.submit(
      {
        driverId,
        categoryCode: 'Sua chua doc duong',
        claimedAmount: 450_000,
        businessDate: BUSINESS_DATE,
        tripId,
        ...over,
      },
      DRIVER_ACTOR,
    );

  it('EC-IT-01 -- nop roi duyet: gia thanh va so quy chi doi SAU khi duyet', async () => {
    const { driverId, tripId } = await aDriverOnATrip();
    const claim = await submit(driverId, tripId);

    expect((await costingRead.tripCostBreakdown(tripId)).expenses).toHaveLength(0);
    expect((await costingRead.driverFundStatement(driverId)).balance).toBe(0);

    const decided = await service.approve(claim.id, { reasonCode: 'EVIDENCE_OK' }, REVIEWER);
    expect(decided.claim.status).toBe('APPROVED');
    expect(decided.claim.settlementExpenseId).not.toBeNull();

    expect((await costingRead.tripCostBreakdown(tripId)).expenses).toHaveLength(1);
    expect((await costingRead.driverFundStatement(driverId)).balance).toBe(-450_000);
  });

  it('EC-IT-02 -- `CHECK` chan mot de nghi CHUA DUYET gan vao gia thanh, ke ca ghi thang', async () => {
    const { driverId, tripId } = await aDriverOnATrip();
    const claim = await submit(driverId, tripId);

    // Ghi mot khoan chi that qua T3, roi thu gan no vao mot de nghi con dang cho duyet.
    const posting = await costing.recordTripExpense(
      {
        tripId,
        categoryCode: 'Boc xep',
        amount: 100_000,
        fundedBy: 'COMPANY_DIRECT',
        businessDate: BUSINESS_DATE,
      },
      REVIEWER,
    );

    await expect(
      prisma.transportExpenseClaim.update({
        where: { id: claim.id },
        data: { settlementExpenseId: posting.expense?.id },
      }),
    ).rejects.toThrow(/TransportExpenseClaim_settlement_only_when_approved/);
  });

  it('EC-IT-03 -- `CHECK` chan so duyet vuot so de nghi', async () => {
    const { driverId, tripId } = await aDriverOnATrip();
    const claim = await submit(driverId, tripId, { claimedAmount: 200_000 });

    await expect(
      prisma.transportExpenseClaim.update({
        where: { id: claim.id },
        data: { status: 'APPROVED', approvedAmount: 999_999n },
      }),
    ).rejects.toThrow(/TransportExpenseClaim_approved_amount_bounded/);
  });

  it('EC-IT-04 -- `CHECK` chan nhien lieu va ETC, ke ca ghi thang qua Prisma', async () => {
    const { driverId, tripId } = await aDriverOnATrip();

    await expect(
      prisma.transportExpenseClaim.create({
        data: {
          driverId,
          categoryCode: ' fuel ',
          claimedAmount: 500_000n,
          businessDate: BUSINESS_DATE,
          tripId,
          submittedBy: DRIVER_ACTOR,
        },
      }),
    ).rejects.toThrow(/TransportExpenseClaim_category_not_reserved/);
  });

  it('EC-IT-05 -- duyet HAI LAN khong tru tien hai lan', async () => {
    const { driverId, tripId } = await aDriverOnATrip();
    const claim = await submit(driverId, tripId);

    await service.approve(claim.id, { reasonCode: 'EVIDENCE_OK' }, REVIEWER);
    expect(
      await reasonOf(() => service.approve(claim.id, { reasonCode: 'LAN_HAI' }, REVIEWER)),
    ).toBe('CLAIM_ALREADY_DECIDED');

    expect((await costingRead.driverFundStatement(driverId)).balance).toBe(-450_000);
    expect((await costingRead.tripCostBreakdown(tripId)).expenses).toHaveLength(1);
  });

  it('EC-IT-06 -- lich su quyet dinh la mot HANG THAT, doc lai duoc', async () => {
    const { driverId, tripId } = await aDriverOnATrip();
    const claim = await submit(driverId, tripId);
    await service.reject(claim.id, { reasonCode: 'NO_EVIDENCE', note: 'Thieu anh phieu' }, REVIEWER);

    const rows = await prisma.transportExpenseClaimDecision.findMany({
      where: { claimId: claim.id },
      orderBy: { sequence: 'asc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sequence: 1,
      outcome: 'REJECTED',
      approvedAmount: null,
      reasonCode: 'NO_EVIDENCE',
      decidedBy: REVIEWER,
    });
  });

  it('EC-IT-07 -- de nghi gan vao VONG CHAY duyet duoc, va noi ro chua vao gia thanh', async () => {
    const { driverId } = await aDriverOnATrip();
    suffix += 1;
    const vehicle = await fleet.createVehicle({
      registrationPlate: `${PLATE_PREFIX}-R${suffix}`,
      vehicleClass: 'Dau keo',
    });
    const run = await movement.createRun({
      code: `${PREFIX}-RUN-${suffix}`,
      vehicleId: vehicle.id,
      businessDate: BUSINESS_DATE,
    });

    const claim = await submit(driverId, null, { runId: run.id });
    const decided = await service.approve(claim.id, { reasonCode: 'EVIDENCE_OK' }, REVIEWER);

    expect(decided.claim.status).toBe('APPROVED');
    expect(decided.claim.approvedAmount).toBe(450_000);
    expect(decided.claim.settlementExpenseId).toBeNull();
    expect((await costingRead.driverFundStatement(driverId)).balance).toBe(0);
  });
});
