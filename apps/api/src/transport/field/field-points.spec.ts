import { beforeEach, describe, expect, it } from 'vitest';
import {
  TransportCheckpointCoreFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { InMemoryOperationalDocumentRepository } from '../document/document.repository.js';
import { InMemoryPhysicalReceiptHandoverRepository } from '../document/handover.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { InMemoryWaitingSessionRepository } from '../waiting/waiting.repository.js';
import { DriverFieldController } from './driver-field.controller.js';
import { TransportFieldCoreFactsAdapter } from './field-facts.port.js';
import { DriverFieldReadService } from './field-read.service.js';
import type { DriverFieldLeg } from './field.types.js';

/**
 * DIEM LAY / DIEM GIAO tren man hinh hien truong — de ban do lai xe biet noi can den.
 *
 * Do tren kho TRONG-BO-NHO THAT va dich vu doc THAT, qua cong `TransportFieldCoreFacts`. Ba hinh
 * dang: chang CO HANG voi don co toa do, chang CO HANG voi don cu khong toa do, chang RONG. Va mot
 * khang dinh `INV-09`: don mang doanh thu, nhung doanh thu khong di theo diem sang be mat lai xe.
 */

const DRIVER_AUTH = 'u.field-points';
const AT = new Date('2026-09-24T03:00:00.000Z');
const PICKUP = { latitude: 20.8264, longitude: 106.7752 };
const DELIVERY = { latitude: 21.0285, longitude: 105.8542 };

class FakeIdentity extends TransportCheckpointCoreFacts {
  constructor(private readonly driverId: string) {
    super();
  }
  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return authUserId === DRIVER_AUTH ? { id: this.driverId, fullName: 'Tran Van Diem' } : null;
  }
  async findRun(): Promise<CheckpointRunFacts | null> {
    return null;
  }
  async findLeg(): Promise<CheckpointLegFacts | null> {
    return null;
  }
  async wasDriverEverAssignedToRun(): Promise<boolean> {
    return true;
  }
}

describe('Hien truong mang diem lay/giao cua don', () => {
  const driverId = 'drv_points';
  let movement: InMemoryMovementRepository;
  let pointedLegId: string;
  let legacyLegId: string;
  let emptyLegId: string;

  const service = (): DriverFieldReadService =>
    new DriverFieldReadService(
      new TransportFieldCoreFactsAdapter(movement),
      new FakeIdentity(driverId),
      new InMemoryCheckpointRepository(),
      new InMemoryWaitingSessionRepository(),
      new InMemoryOperationalDocumentRepository(),
      new InMemoryPhysicalReceiptHandoverRepository(),
      undefined,
      () => AT,
    );

  const legById = async (legId: string): Promise<DriverFieldLeg | undefined> =>
    (await service().workFor(DRIVER_AUTH)).runs
      .flatMap((run) => run.legs)
      .find((leg) => leg.legId === legId);

  beforeEach(async () => {
    movement = new InMemoryMovementRepository();
    const run = await movement.createRun({
      code: 'VC-PTS',
      vehicleId: 'veh_pts',
      businessDate: '2026-09-24',
    });
    await movement.assignRun(run.id, { driverId, effectiveFrom: AT, assignedBy: 'u.dieu-hanh' });

    const pointed = await movement.createOrder({
      code: 'ORD-PTS-1',
      businessDate: '2026-09-24',
      originLabel: 'KCN Đình Vũ',
      destinationLabel: 'Kho Hà Nội',
      originPoint: PICKUP,
      destinationPoint: DELIVERY,
      freightAmount: 12_500_000,
    });
    const legacy = await movement.createOrder({
      code: 'ORD-PTS-2',
      businessDate: '2026-09-24',
      originLabel: 'Kho cũ',
      destinationLabel: 'Khách cũ',
      freightAmount: 3_000_000,
    });

    const leg = (sequence: number, kind: 'LOADED' | 'EMPTY', orderId: string | null) =>
      movement.createLeg({
        runId: run.id,
        sequence,
        kind,
        orderId,
        originLabel: 'A',
        destinationLabel: 'B',
        businessDate: '2026-09-24',
      });
    pointedLegId = (await leg(1, 'LOADED', pointed.id)).id;
    legacyLegId = (await leg(2, 'LOADED', legacy.id)).id;
    emptyLegId = (await leg(3, 'EMPTY', null)).id;
    await movement.setRunStatus(run.id, 'ACTIVE', AT);
  });

  it('chang CO HANG voi don co toa do: diem lay = originPoint, diem giao = destinationPoint', async () => {
    const leg = await legById(pointedLegId);

    expect(leg?.orderCode).toBe('ORD-PTS-1');
    expect(leg?.pickupPoint).toEqual(PICKUP);
    expect(leg?.deliveryPoint).toEqual(DELIVERY);
  });

  it('don cu khong co toa do: null, khong doan tu nhan', async () => {
    const leg = await legById(legacyLegId);

    expect(leg?.orderCode).toBe('ORD-PTS-2');
    expect(leg?.pickupPoint).toBeNull();
    expect(leg?.deliveryPoint).toBeNull();
  });

  it('chang RONG: khong don, khong diem', async () => {
    const leg = await legById(emptyLegId);

    expect(leg?.kind).toBe('EMPTY');
    expect(leg?.pickupPoint).toBeNull();
    expect(leg?.deliveryPoint).toBeNull();
  });

  it('diem chi mang hai so toa do', async () => {
    const leg = await legById(pointedLegId);

    expect(Object.keys(leg?.pickupPoint ?? {}).sort()).toEqual(['latitude', 'longitude']);
    expect(Object.keys(leg?.deliveryPoint ?? {}).sort()).toEqual(['latitude', 'longitude']);
  });

  it('INV-09: payload that cua route khong mang doanh thu', async () => {
    const controller = new DriverFieldController(service());
    const work = await controller.work({
      authUser: { id: DRIVER_AUTH },
    } as unknown as Parameters<DriverFieldController['work']>[0]);
    const serialized = JSON.stringify(work);

    // Neo nguoc lai: payload that su mang diem, nen bai duoi khong xanh tren mot payload rong.
    expect(serialized).toContain('"pickupPoint"');
    expect(serialized.toLowerCase()).not.toContain('freight');
    expect(serialized).not.toContain('12500000');
    expect(serialized).not.toContain('3000000');
  });
});
