import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { DEFAULT_TRANSPORT_TIME_ZONE } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { AnalyticsCostFactsAdapter, AnalyticsMovementFactsAdapter } from './analytics.ports.js';
import { OperatingMetricsReadService } from './operating-metrics-read.service.js';

/**
 * `R8` — DOI SOAT TREN POSTGRES THAT (Issue #237).
 *
 * ===========================================================================
 * BO TEST NAY TON TAI DE TRA LOI MOT CAU: *"do the headline loaded/empty/direct-margin metrics
 * reconcile deterministically to underlying source rows?"*
 *
 * Nen moi bai o day deu co cung mot hinh dang: chay bao cao, roi DOC LAI cac hang goc bang Prisma
 * THO va so hai ben. Mot bai kiem so bao cao voi mot con so viet tay chi chung minh rang ham cong
 * hoat dong; bai o day chung minh rang con so tren man hinh la tong cua nhung hang ma nguoi doi
 * soat mo len xem duoc.
 *
 * Duong du lieu la duong THAT, khong dung fixture cam tay:
 *
 *   chuyen v1 -> `CostingService.recordTripExpense` -> `TransportTripExpense`
 *   `MovementService.projectTrip` -> vong chay + chang + don + `TransportTripRunLegLink`
 *
 * TIEN TO `IT-R8` — khong long nhau voi `IT-MV`, `IT-T7B`, `IT-T6A`, `IT-T6W`, `IT-T3-*`, `IT-T4*`.
 */
const PREFIX = 'IT-R8';
const ACTOR = 'it-analytics';
const BUSINESS_DATE = '2027-04-06';
const CATEGORY = 'BOT';

describe.runIf(process.env.RUN_PRISMA_IT === '1')('Chi so van hanh tren Postgres THAT — R8', () => {
  const prisma = new PrismaService();
  const movementRepo = new PrismaMovementRepository(prisma);
  const costingRepo = new PrismaCostingRepository(prisma);
  const fleet = new PrismaFleetRepository(prisma);
  const trips = new PrismaTripRepository(prisma);

  const corePolicy = { timeZone: DEFAULT_TRANSPORT_TIME_ZONE };
  const movement = new MovementService(
    movementRepo,
    fleet,
    new AuditLogService(new InMemoryAuditLogRepository()),
    corePolicy,
    trips,
  );
  const costing = new CostingService(
    costingRepo,
    new TransportCoreFactsAdapter(trips, fleet),
    { append: async () => undefined } as never,
    corePolicy,
    { expenseCategories: [CATEGORY], advanceApprovalRequired: false },
    undefined,
    () => new Date('2027-04-06T03:00:00.000Z'),
  );
  const read = new OperatingMetricsReadService(
    new AnalyticsMovementFactsAdapter(movementRepo),
    new AnalyticsCostFactsAdapter(costingRepo),
  );

  /** Don dep theo THU TU AN TOAN VE KHOA NGOAI: lien ket -> chang -> vong chay -> don -> chuyen. */
  async function cleanup(): Promise<void> {
    const runs = await prisma.transportVehicleRun.findMany({
      where: { code: { contains: PREFIX } },
      select: { id: true },
    });
    const runIds = runs.map((run) => run.id);
    const legs = await prisma.transportRunLeg.findMany({
      where: { runId: { in: runIds } },
      select: { id: true },
    });
    await prisma.transportTripRunLegLink.deleteMany({
      where: { legId: { in: legs.map((leg) => leg.id) } },
    });
    await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.transportOrder.deleteMany({ where: { code: { contains: PREFIX } } });

    const tripRows = await prisma.transportTrip.findMany({
      where: { code: { contains: PREFIX } },
      select: { id: true },
    });
    const tripIds = tripRows.map((trip) => trip.id);
    await prisma.transportTripRunLegLink.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
    await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });

    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: `${PREFIX}-XE` } },
    });
    await prisma.transportCustomer.deleteMany({
      where: { name: { startsWith: `${PREFIX} Khach` } },
    });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  let suffix = 0;
  const nextCode = (label: string): string => `${PREFIX}-${label}-${++suffix}`;

  /**
   * Dung mot VONG CHAY day du tu duong that: chuyen v1 co khach + xe -> chieu sang v2 -> them mot
   * chang RONG chieu ve. Do dung la kich ban `R1-B` cua #232, va la hinh dang ma bao cao phai do.
   */
  async function aCycle(freightAmount: number, loadedKm: number, emptyKm: number) {
    const vehicle = await fleet.createVehicle({
      registrationPlate: `${PREFIX}-XE-${++suffix}`,
      vehicleClass: 'Dau keo',
    });
    const customer = await fleet.createCustomer({ name: `${PREFIX} Khach ${suffix}` });
    const trip = await trips.create({
      code: nextCode('CH'),
      kind: 'OWN_DIRECT',
      businessDate: BUSINESS_DATE,
      originLabel: 'Ha Noi',
      destinationLabel: 'Hai Phong',
      customerId: customer.id,
      freightAmount,
      distanceKm: loadedKm,
    });
    await trips.assign(trip.id, {
      vehicleId: vehicle.id,
      driverId: null,
      assignedBy: ACTOR,
      at: new Date(),
    });

    const projection = await movement.projectTrip(trip.id, ACTOR);
    await movement.addLeg(
      projection.run.id,
      {
        sequence: 2,
        kind: 'EMPTY',
        originLabel: 'Hai Phong',
        destinationLabel: 'Ha Noi',
        distanceKm: emptyKm,
      },
      ACTOR,
    );

    return { trip, projection };
  }

  /**
   * R8-IT-01 — CHI PHI TREN BAO CAO BANG TONG CAC HANG `TransportTripExpense` THAT.
   *
   * Day la bai chinh cua ca tep. Con so `directCost` khong duoc so voi mot hang so viet tay ma voi
   * `SUM(signedAmount)` doc lai tu DB: neu duong CHANG -> CHUYEN -> KHOAN CHI dut o bat ky mat xich
   * nao, hai ve lech nhau ngay.
   */
  it('R8-IT-01 — chi phi bao cao khop dung tong cac hang chi phi trong DB', async () => {
    const { trip, projection } = await aCycle(9_000_000, 150, 150);
    await costing.recordTripExpense(
      { tripId: trip.id, categoryCode: CATEGORY, amount: 1_200_000, fundedBy: 'COMPANY_DIRECT' },
      ACTOR,
    );
    await costing.recordTripExpense(
      { tripId: trip.id, categoryCode: CATEGORY, amount: 800_000, fundedBy: 'COMPANY_DIRECT' },
      ACTOR,
    );

    const margin = await read.runMargin(projection.run.id);
    const rows = await prisma.transportTripExpense.findMany({
      where: { tripId: trip.id },
      select: { signedAmount: true },
    });
    const fromRows = rows.reduce((total, row) => total + Number(row.signedAmount), 0);

    expect(rows).toHaveLength(2);
    expect(margin?.directCost).toBe(fromRows);
    expect(margin?.directCost).toBe(2_000_000);
    /** Duong doi soat: bao cao phai NOI RA no da cong chi phi cua chuyen nao. */
    expect(margin?.tripIds).toEqual([trip.id]);
  });

  /** R8-IT-02 — DOANH THU bang dung hang `TransportOrder`, va km bang dung cac hang chang. */
  it('R8-IT-02 — doanh thu va km khop dung cac hang nguon', async () => {
    const { projection } = await aCycle(7_500_000, 120, 100);

    const margin = await read.runMargin(projection.run.id);
    const orderRow = await prisma.transportOrder.findUnique({
      where: { id: projection.order?.id ?? '' },
      select: { freightAmount: true },
    });
    const legRows = await prisma.transportRunLeg.findMany({
      where: { runId: projection.run.id },
      select: { id: true, kind: true, distanceKm: true },
    });

    expect(margin?.revenue).toBe(Number(orderRow?.freightAmount));
    expect(margin?.distance.loadedKm).toBe(
      legRows
        .filter((leg) => leg.kind === 'LOADED')
        .reduce((km, leg) => km + (leg.distanceKm ?? 0), 0),
    );
    expect(margin?.distance.emptyKm).toBe(100);
    expect(margin?.distance.totalKm).toBe(220);
    /** Chang RONG khong co lien ket chuyen nao -> khong dong chi phi nao, va do la su that. */
    expect(margin?.directCost).toBe(0);
    expect(margin?.directMargin).toBe(7_500_000);
    expect(margin?.provenance.legIdsCounted).toHaveLength(legRows.length);
  });

  /**
   * R8-IT-03 — DAO MOT KHOAN CHI LAM CHI PHI GIAM, VI PHEP CONG LA CONG CO DAU.
   *
   * `INV-20` cam sua mot khoan chi da ghi; duong dung la ghi mot dong dao MANG SO AM. Neu tang bao
   * cao loc `reversalOfId` hay lay tri tuyet doi, con so se PHONG LEN sau moi lan dao — mot bao cao
   * cang sua cang sai. Bai nay khoa dieu do: sau khi dao, ca hai ve van khop.
   */
  it('R8-IT-03 — dong dao lam giam chi phi, bao cao van khop tong cac hang', async () => {
    const { trip, projection } = await aCycle(5_000_000, 100, 100);
    const posted = await costing.recordTripExpense(
      { tripId: trip.id, categoryCode: CATEGORY, amount: 1_000_000, fundedBy: 'COMPANY_DIRECT' },
      ACTOR,
    );
    const before = await read.runMargin(projection.run.id);
    expect(before?.directCost).toBe(1_000_000);

    /**
     * `CorrelatedPosting.expense` la `null` o nhung lan ghi CHI dong quy (`INV-03` chi doi hai lop
     * o mot ve). Duong nay la khoan chi cong ty tra thang, nen no phai co — va khang dinh o day
     * lam bai do voi mot cau doc duoc, thay vi mot `TypeError` giua chung.
     */
    const expense = posted.expense;
    if (!expense) throw new Error('mong doi mot khoan chi duoc ghi, nhan duoc null');

    await costing.reverseExpense(expense.id, 'ghi nham tram', ACTOR);

    const after = await read.runMargin(projection.run.id);
    const rows = await prisma.transportTripExpense.findMany({
      where: { tripId: trip.id },
      select: { signedAmount: true },
    });
    expect(rows).toHaveLength(2);
    expect(after?.directCost).toBe(
      rows.reduce((total, row) => total + Number(row.signedAmount), 0),
    );
    expect(after?.directCost).toBe(0);
    expect(after?.directMargin).toBe(5_000_000);
  });

  /**
   * R8-IT-04 — VONG CHAY KHONG CO THAT tra `null`, khong tra mot bao cao rong.
   *
   * Mot bao cao toan so 0 doc len y het mot vong chay co that chua chay km nao — hai tinh huong can
   * hai hanh dong khac han cua nguoi van hanh.
   */
  it('R8-IT-04 — vong chay khong ton tai tra `null`', async () => {
    expect(await read.runMargin('khong-co-that')).toBeNull();
  });
});
