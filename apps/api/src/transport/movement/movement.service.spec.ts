import { beforeEach, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryMovementRepository } from './movement.repository.js';
import { MovementService } from './movement.service.js';
import { summariseRunDistance } from './run-distance.js';

/**
 * HAT GIONG NGHIEM THU `MV-001`..`MV-012` -- #234 A1 / #232 `D-01`.
 *
 * Hai kich ban ma #234 goi ten la BAT BUOC nam o `MV-001` va `MV-002`. Chung khong phai vi du
 * minh hoa: chung la dinh nghia cua "xong" cho tranche nay.
 *
 *     MV-001   HN -> HP co hang / don A     +   HP -> HN chay rong
 *     MV-002   HN -> HP co hang / don A     +   HP -> HN co hang / don C
 */

const ACTOR = 'nguoi-van-hanh';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

describe('MovementService -- nghia vu thuong mai vs vong chay vat ly', () => {
  let fleet: InMemoryFleetRepository;
  let repository: InMemoryMovementRepository;
  let service: MovementService;

  beforeEach(() => {
    fleet = new InMemoryFleetRepository();
    repository = new InMemoryMovementRepository();
    service = new MovementService(
      repository,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      POLICY,
    );
  });

  const aVehicle = () =>
    fleet.createVehicle({ registrationPlate: '29C-12345', vehicleClass: 'Dau keo' });

  const anOrder = (code: string, origin: string, destination: string) =>
    service.createOrder(
      {
        code,
        originLabel: origin,
        destinationLabel: destination,
        businessDate: '2026-09-07',
        freightAmount: 5_000_000,
      },
      ACTOR,
    );

  const aRun = async (code = 'RUN-001') => {
    const vehicle = await aVehicle();
    return service.createRun({ code, vehicleId: vehicle.id, businessDate: '2026-09-07' }, ACTOR);
  };

  const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof TransportDomainError) return error.reason;
      throw error;
    }
    throw new Error('mong doi mot TransportDomainError, nhung loi goi da thanh cong');
  };

  it('MV-001 -- HN->HP co hang (don A), HP->HN chay rong', async () => {
    const run = await aRun();
    const orderA = await anOrder('ORD-A', 'Ha Noi', 'Hai Phong');

    await service.addLeg(
      run.id,
      {
        sequence: 1,
        kind: 'LOADED',
        orderId: orderA.id,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        distanceKm: 120,
      },
      ACTOR,
    );
    await service.addLeg(
      run.id,
      {
        sequence: 2,
        kind: 'EMPTY',
        originLabel: 'Hai Phong',
        destinationLabel: 'Ha Noi',
        distanceKm: 120,
      },
      ACTOR,
    );

    const detail = await service.getRun(run.id);
    expect(detail.legs.map((leg) => leg.kind)).toEqual(['LOADED', 'EMPTY']);
    expect(detail.legs[0]?.orderId).toBe(orderA.id);
    expect(detail.legs[1]?.orderId).toBeNull();

    const distance = summariseRunDistance(detail.legs);
    expect(distance).toMatchObject({ loadedKm: 120, emptyKm: 120, totalKm: 240, complete: true });
    expect(distance.emptyRatio).toBeCloseTo(0.5, 10);
  });

  it('MV-002 -- HN->HP don A, HP->HN don C: chieu ve co hang thi khong con km rong', async () => {
    const run = await aRun();
    const orderA = await anOrder('ORD-A', 'Ha Noi', 'Hai Phong');
    const orderC = await anOrder('ORD-C', 'Hai Phong', 'Ha Noi');

    await service.addLeg(
      run.id,
      {
        sequence: 1,
        kind: 'LOADED',
        orderId: orderA.id,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        distanceKm: 120,
      },
      ACTOR,
    );
    await service.addLeg(
      run.id,
      {
        sequence: 2,
        kind: 'LOADED',
        orderId: orderC.id,
        originLabel: 'Hai Phong',
        destinationLabel: 'Ha Noi',
        distanceKm: 118,
      },
      ACTOR,
    );

    const detail = await service.getRun(run.id);
    expect(detail.legs.map((leg) => leg.orderId)).toEqual([orderA.id, orderC.id]);

    const distance = summariseRunDistance(detail.legs);
    expect(distance).toMatchObject({ loadedKm: 238, emptyKm: 0, totalKm: 238, emptyRatio: 0 });
  });

  it('MV-003 -- chang EMPTY khong duoc mang don, va bi tu choi CO TEN', async () => {
    const run = await aRun();
    const orderA = await anOrder('ORD-A', 'Ha Noi', 'Hai Phong');

    const reason = await reasonOf(() =>
      service.addLeg(
        run.id,
        {
          sequence: 1,
          kind: 'EMPTY',
          orderId: orderA.id,
          originLabel: 'Hai Phong',
          destinationLabel: 'Ha Noi',
        },
        ACTOR,
      ),
    );
    expect(reason).toBe('LEG_EMPTY_CANNOT_CARRY_ORDER');
  });

  it('MV-004 -- chang LOADED duoc phep chua co don ("MAY reference", khong phai "must")', async () => {
    const run = await aRun();
    const leg = await service.addLeg(
      run.id,
      { sequence: 1, kind: 'LOADED', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong' },
      ACTOR,
    );
    expect(leg.orderId).toBeNull();
  });

  it('MV-005 -- hai truc doc lap: don ton tai va doc duoc khi chua co vong chay nao', async () => {
    const order = await anOrder('ORD-A', 'Ha Noi', 'Hai Phong');
    expect((await service.getOrder(order.id)).status).toBe('OPEN');
    expect(await service.listRuns()).toEqual([]);
  });

  it('MV-006 -- khong gan duoc don da huy vao mot chang', async () => {
    const run = await aRun();
    const order = await anOrder('ORD-A', 'Ha Noi', 'Hai Phong');
    await service.cancelOrder(order.id, 'khach doi lich', ACTOR);

    const reason = await reasonOf(() =>
      service.addLeg(
        run.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: order.id,
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
        },
        ACTOR,
      ),
    );
    expect(reason).toBe('LEG_ORDER_CANCELLED');
  });

  it('MV-007 -- km rong khong duoc doan: mot chang thieu km lam ket qua KHONG day du', async () => {
    const run = await aRun();
    await service.addLeg(
      run.id,
      {
        sequence: 1,
        kind: 'LOADED',
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        distanceKm: 120,
      },
      ACTOR,
    );
    await service.addLeg(
      run.id,
      { sequence: 2, kind: 'EMPTY', originLabel: 'Hai Phong', destinationLabel: 'Ha Noi' },
      ACTOR,
    );

    const distance = summariseRunDistance((await service.getRun(run.id)).legs);
    expect(distance.complete).toBe(false);
    expect(distance.legsMissingDistance).toEqual({ loaded: 0, empty: 1 });
    expect(distance.emptyRatio).toBeNull();
  });

  it('MV-008 -- phan cong lai xe la LICH SU: ban cu dong lai, khong bi ghi de', async () => {
    const run = await aRun();
    const first = await fleet.createDriver({
      fullName: 'Lai xe A',
      phone: '0900000001',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });
    const second = await fleet.createDriver({
      fullName: 'Lai xe B',
      phone: '0900000002',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });

    await service.assignRun(run.id, { driverId: first.id }, ACTOR);
    await service.assignRun(run.id, { driverId: second.id }, ACTOR);

    const history = await service.runAssignmentHistory(run.id);
    expect(history).toHaveLength(2);
    expect(history.filter((entry) => entry.effectiveTo === null)).toHaveLength(1);
    expect((await service.getRun(run.id)).activeAssignment?.driverId).toBe(second.id);
  });

  it('MV-009 -- phan cong lai dung lai xe la KHONG DOI, khong sinh ban thu hai', async () => {
    const run = await aRun();
    const driver = await fleet.createDriver({
      fullName: 'Lai xe A',
      phone: '0900000001',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
    });

    await service.assignRun(run.id, { driverId: driver.id }, ACTOR);
    await service.assignRun(run.id, { driverId: driver.id }, ACTOR);

    expect(await service.runAssignmentHistory(run.id)).toHaveLength(1);
  });

  it('MV-010 -- vong chay da huy khong nhan them chang', async () => {
    const run = await aRun();
    await service.cancelRun(run.id, 'xe hong', ACTOR);

    const reason = await reasonOf(() =>
      service.addLeg(
        run.id,
        { sequence: 1, kind: 'EMPTY', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong' },
        ACTOR,
      ),
    );
    expect(reason).toBe('LEG_RUN_TERMINAL');
  });

  it('MV-011 -- ma vong chay trung bi tu choi CO TEN', async () => {
    await aRun('RUN-001');
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-99999',
      vehicleClass: 'Dau keo',
    });

    const reason = await reasonOf(() =>
      service.createRun(
        { code: 'RUN-001', vehicleId: vehicle.id, businessDate: '2026-09-07' },
        ACTOR,
      ),
    );
    expect(reason).toBe('RUN_CODE_TAKEN');
  });

  it('MV-012 -- don da hoan thanh khong huy duoc: dieu chinh la viec cua chung tu cong no', async () => {
    const order = await anOrder('ORD-A', 'Ha Noi', 'Hai Phong');
    await service.transitionOrder(order.id, 'FULFILLED', ACTOR);

    const reason = await reasonOf(() => service.cancelOrder(order.id, 'doi y', ACTOR));
    expect(reason).toBe('ORDER_CANCEL_ALREADY_FULFILLED');
  });

  /**
   * `#398`: don da NHAN chang co hang cua viec tai xe nhan truc tiep (lenh adopt = doi `orderId`
   * cua chang co san, trong bo nho la `bindOrderToUnboundLoadedLeg`). Trinh sua vong chay/chang tay
   * khong duoc dat don do len chang co hang THU HAI — tren bat ky vong chay nao.
   */
  describe('MV-013 -- don da nhan viec tai xe khong len chang co hang thu hai (#398)', () => {
    const adoptedOrder = async () => {
      const intakeRun = await aRun('RUN-A-1');
      const intakeLeg = await service.addLeg(
        intakeRun.id,
        { sequence: 1, kind: 'LOADED', originLabel: 'Kho A', destinationLabel: 'Chua xac dinh' },
        ACTOR,
      );
      const order = await anOrder('DH-A-1', 'Kho A', 'Kho B');
      const adopted = await repository.bindOrderToUnboundLoadedLeg({
        legId: intakeLeg.id,
        orderId: order.id,
        destinationLabel: 'Kho B',
        at: new Date(),
      });
      expect(adopted?.orderId).toBe(order.id);
      const otherVehicle = await fleet.createVehicle({
        registrationPlate: '29C-99999',
        vehicleClass: 'Dau keo',
      });
      const otherRun = await service.createRun(
        { code: 'RUN-TAY-1', vehicleId: otherVehicle.id, businessDate: '2026-09-07' },
        ACTOR,
      );
      return { order, intakeRun, intakeLeg, otherRun };
    };

    const loadedLeg = (orderId: string | null, sequence = 1) => ({
      sequence,
      kind: 'LOADED' as const,
      orderId,
      originLabel: 'Kho A',
      destinationLabel: 'Kho B',
    });

    it('chang CO HANG thu hai cho don do: 409 LEG_ORDER_ADOPTED_BY_SITE_INTAKE, khong ghi gi', async () => {
      const { order, intakeRun, otherRun } = await adoptedOrder();

      for (const [runId, sequence] of [
        [otherRun.id, 1],
        [intakeRun.id, 2],
      ] as const) {
        const error = await service
          .addLeg(runId, loadedLeg(order.id, sequence), ACTOR)
          .then(() => null)
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(TransportDomainError);
        expect((error as TransportDomainError).reason).toBe('LEG_ORDER_ADOPTED_BY_SITE_INTAKE');
        expect((error as TransportDomainError).kind).toBe('CONFLICT');
      }
      expect((await service.legsOfOrder(order.id)).length).toBe(1);
      expect(await service.legsOfRun(otherRun.id)).toEqual([]);
    });

    it('trinh sua tay KHONG doi nghia gi khac: chang rong, chang chua co don, don khac van them duoc', async () => {
      const { otherRun } = await adoptedOrder();
      const another = await anOrder('DH-KHAC', 'Kho C', 'Kho D');

      await service.addLeg(otherRun.id, loadedLeg(another.id, 1), ACTOR);
      await service.addLeg(otherRun.id, loadedLeg(null, 2), ACTOR);
      await service.addLeg(
        otherRun.id,
        { sequence: 3, kind: 'EMPTY', originLabel: 'Kho D', destinationLabel: 'Bai xe' },
        ACTOR,
      );
      expect((await service.legsOfRun(otherRun.id)).map((leg) => leg.orderId)).toEqual([
        another.id,
        null,
        null,
      ]);
    });
  });
});
