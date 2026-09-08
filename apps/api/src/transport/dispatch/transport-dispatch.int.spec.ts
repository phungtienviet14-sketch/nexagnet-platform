import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import {
  MovementDispatchAssignmentPlanner,
  dispatchRunCodeForOrder,
} from './dispatch-planner.port.js';

/**
 * CONG GHI cua Lane M tren POSTGRES THAT — `#277 M14` muc 8/9/10 va `M15` muc 10.
 *
 * ===========================================================================
 * VI SAO BO NAY PHAI CHAY TREN POSTGRES CHU KHONG PHAI BAN TRONG BO NHO
 *
 * Tinh chong lap cua `commit()` KHONG den tu mot cau `if` trong TypeScript — mot phep "doc roi
 * ghi" luon co mot khe hep giua hai buoc. No den tu chi muc `@unique` tren
 * `TransportVehicleRun.code` cong voi mot ma vong chay SUY TAT DINH tu ma don. Chi Postgres moi
 * phu nhan duoc ban ghi thu hai, nen chi o day moi chung minh duoc dieu do.
 *
 * Chay bang `RUN_PRISMA_IT=1`.
 */

const PREFIX = 'IT-DSP';
const ACTOR = 'it-dispatch';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const BUSINESS_DATE = '2026-09-08';

describe.runIf(process.env.RUN_PRISMA_IT === '1')('cong ghi dieu xe tren Postgres that', () => {
  const prisma = new PrismaService();
  const movement = new MovementService(
    new PrismaMovementRepository(prisma),
    new PrismaFleetRepository(prisma),
    new AuditLogService(new InMemoryAuditLogRepository()),
    POLICY,
    new PrismaTripRepository(prisma),
  );
  const planner = new MovementDispatchAssignmentPlanner(movement);

  /** Don dep theo THU TU AN TOAN VE KHOA NGOAI: chang -> vong chay -> don -> xe. */
  async function cleanup(): Promise<void> {
    const runs = await prisma.transportVehicleRun.findMany({
      where: { code: { contains: PREFIX } },
      select: { id: true },
    });
    const runIds = runs.map((run) => run.id);
    await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.transportOrder.deleteMany({ where: { code: { startsWith: PREFIX } } });
    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PREFIX } },
    });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const seedVehicle = async (suffix: string): Promise<string> => {
    const row = await prisma.transportVehicle.create({
      data: {
        registrationPlate: `${PREFIX}-XE-${suffix}`,
        vehicleClass: 'TRUCK_10T',
        allowedPayloadKg: 10_000,
      },
    });
    return row.id;
  };

  const seedOrder = async (suffix: string): Promise<{ id: string; code: string }> => {
    const created = await movement.createOrder(
      {
        code: `${PREFIX}-DON-${suffix}`,
        businessDate: BUSINESS_DATE,
        originLabel: 'Kho Hai Phong',
        destinationLabel: 'Bai Ninh Binh',
        customerId: null,
        cargoDescription: null,
        freightAmount: null,
        note: null,
      },
      ACTOR,
    );
    return { id: created.id, code: created.code };
  };

  it('lan bam dau tien sinh DUNG mot vong chay va mot chang CO TAI', async () => {
    const vehicleId = await seedVehicle('A1');
    const order = await seedOrder('A1');

    const result = await planner.commit({ orderId: order.id, vehicleId, actor: ACTOR });

    expect(result.created).toBe(true);
    expect(result.reason).toBe('COMMIT_PLANNED');

    const detail = await movement.getRun(result.runId);
    expect(detail.run.code).toBe(dispatchRunCodeForOrder(order.code));
    expect(detail.run.vehicleId).toBe(vehicleId);
    expect(detail.legs).toHaveLength(1);
    expect(detail.legs[0]?.kind).toBe('LOADED');
    expect(detail.legs[0]?.orderId).toBe(order.id);
    /*
     * `#276 L6` — quang duong THUC TE den tu GPS/dong ho km. Mot uoc luong ban do o cot nay se lam
     * moi bao cao km rong sau nay cong mot con so du bao vao mot cot su that.
     */
    expect(detail.legs[0]?.distanceKm).toBeNull();
  });

  /** `M15` muc 10 — bam lai khong duoc sinh ban thu hai. */
  it('bam lai lan thu hai KHONG sinh them vong chay/chang nao', async () => {
    const vehicleId = await seedVehicle('A2');
    const order = await seedOrder('A2');

    const first = await planner.commit({ orderId: order.id, vehicleId, actor: ACTOR });
    const second = await planner.commit({ orderId: order.id, vehicleId, actor: ACTOR });

    expect(second.created).toBe(false);
    expect(second.reason).toBe('COMMIT_ALREADY_PLANNED_ON_SAME_VEHICLE');
    expect(second.runId).toBe(first.runId);
    expect(second.legId).toBe(first.legId);

    const runs = await prisma.transportVehicleRun.count({
      where: { code: dispatchRunCodeForOrder(order.code) },
    });
    expect(runs).toBe(1);
    expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(1);
  });

  /**
   * `M14` muc 8 — HAI LAN BAM DEN CUNG LUC.
   *
   * Ca hai deu vuot qua phep doc "don nay da co chang chua" (khong lan nao thay lan kia vi chua
   * commit); chi muc unique tren ma vong chay la thu duy nhat phu nhan ban thu hai. Ket qua dung:
   * mot vong chay, mot chang, va CA HAI loi goi deu tra ve chinh no.
   */
  it('hai lan bam DONG THOI van chi ra mot vong chay', async () => {
    const vehicleId = await seedVehicle('A3');
    const order = await seedOrder('A3');

    const [left, right] = await Promise.all([
      planner.commit({ orderId: order.id, vehicleId, actor: ACTOR }),
      planner.commit({ orderId: order.id, vehicleId, actor: ACTOR }),
    ]);

    expect(left.runId).toBe(right.runId);
    expect(left.legId).toBe(right.legId);
    expect([left.created, right.created].filter(Boolean)).toHaveLength(1);
    expect(
      await prisma.transportVehicleRun.count({
        where: { code: dispatchRunCodeForOrder(order.code) },
      }),
    ).toBe(1);
  });

  /** `#276 L3` — mot don khong duoc nam tren hai chang co tai cung luc. */
  it('gan don da co ke hoach sang MOT XE KHAC bi tu choi CO KIEU', async () => {
    const firstVehicle = await seedVehicle('A4');
    const secondVehicle = await seedVehicle('A5');
    const order = await seedOrder('A4');

    await planner.commit({ orderId: order.id, vehicleId: firstVehicle, actor: ACTOR });

    await expect(
      planner.commit({ orderId: order.id, vehicleId: secondVehicle, actor: ACTOR }),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ORDER_ALREADY_ASSIGNED' });

    expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('don da huy khong lap duoc ke hoach dieu xe', async () => {
    const vehicleId = await seedVehicle('A6');
    const order = await seedOrder('A6');
    await movement.cancelOrder(order.id, 'khach doi y', ACTOR);

    await expect(
      planner.commit({ orderId: order.id, vehicleId, actor: ACTOR }),
    ).rejects.toBeInstanceOf(TransportDomainError);
    expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(0);
  });
});
