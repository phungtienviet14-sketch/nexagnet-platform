import { beforeEach, describe, expect, it } from 'vitest';
import {
  TransportCheckpointCoreFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { InMemoryOperationalDocumentRepository } from '../document/document.repository.js';
import { InMemoryPhysicalReceiptHandoverRepository } from '../document/handover.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import type { RunLegStatus } from '../movement/movement.types.js';
import { InMemoryWaitingSessionRepository } from '../waiting/waiting.repository.js';
import { TransportFieldCoreFactsAdapter } from './field-facts.port.js';
import { DriverFieldReadService } from './field-read.service.js';
import type { DriverFieldLeg } from './field.types.js';

/**
 * MAN HINH HIEN TRUONG khong moi mot moc nao tren CHANG da ket thuc — `#354`.
 *
 * ============================================================================================
 * HINH DANG
 * ============================================================================================
 *
 * Vong chay con `ACTIVE` (nen van tren man hinh), nhung mot chang CO HANG cua no da `COMPLETED`
 * (van phong ghi de khi hien truong moi toi noi) hay da `CANCELLED`. `fieldActionsFor` truoc `#354`
 * chi biet LOAI chang va trang thai VONG CHAY, nen chang do van con nut moc — va `toFieldScreen`
 * (web) chon chang DAU TIEN con nut lam "chang dang lam". Bam nut do la ghi mot moc len mot chang da
 * dong: dung lich su bat kha ma `#332` do tren DB live.
 *
 * Bai nay do tren kho TRONG-BO-NHO THAT va dich vu doc THAT, qua cong `TransportFieldCoreFacts` —
 * khong qua mot ban gia nao cua phep suy nut.
 */

const DRIVER_AUTH = 'u.binh';
const AT = new Date('2026-09-22T03:00:00.000Z');

class FakeIdentity extends TransportCheckpointCoreFacts {
  constructor(private readonly driverId: string) {
    super();
  }
  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return authUserId === DRIVER_AUTH ? { id: this.driverId, fullName: 'Nguyen Van Binh' } : null;
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

describe('Hien truong cua chang da ket thuc — #354', () => {
  const driverId = 'drv_a';
  let movement: InMemoryMovementRepository;
  let checkpoints: InMemoryCheckpointRepository;
  let runId: string;
  /** Chang CO HANG #1 — se bi dong (hoan tat hoac huy) trong tung bai. */
  let closingLegId: string;
  /** Chang CO HANG #2 — van chay: doi chung. */
  let openLegId: string;

  const service = (): DriverFieldReadService =>
    new DriverFieldReadService(
      new TransportFieldCoreFactsAdapter(movement),
      new FakeIdentity(driverId),
      checkpoints,
      new InMemoryWaitingSessionRepository(),
      new InMemoryOperationalDocumentRepository(),
      new InMemoryPhysicalReceiptHandoverRepository(),
      undefined,
      () => AT,
    );

  const record = async (type: RunCheckpointType, legId: string): Promise<void> => {
    await checkpoints.create({
      type,
      runId,
      legId,
      recordedBy: DRIVER_AUTH,
      driverId,
      observationId: null,
      clientEventId: `${legId}:${type}`,
      capturedAt: null,
      receivedAt: AT,
      businessDate: '2026-09-22',
      note: null,
    });
  };

  /** Doi trang thai chang qua DUNG cong kho ma `MovementService` goi. */
  const move = async (legId: string, from: RunLegStatus, to: RunLegStatus): Promise<void> => {
    const written = await movement.setLegStatus({ legId, from, to, at: AT });
    expect(written?.applied).toBe(true);
  };

  const legsNow = async (): Promise<readonly DriverFieldLeg[]> =>
    (await service().workFor(DRIVER_AUTH)).runs.find((run) => run.runId === runId)?.legs ?? [];

  const checkpointActionsOf = (leg: DriverFieldLeg | undefined) =>
    (leg?.nextActions ?? []).filter((action) => action.kind === 'CHECKPOINT');

  beforeEach(async () => {
    movement = new InMemoryMovementRepository();
    checkpoints = new InMemoryCheckpointRepository();

    const run = await movement.createRun({
      code: 'VC-354',
      vehicleId: 'veh_1',
      businessDate: '2026-09-22',
    });
    runId = run.id;
    await movement.assignRun(runId, { driverId, effectiveFrom: AT, assignedBy: 'u.dieu-hanh' });
    for (const sequence of [1, 2]) {
      const order = await movement.createOrder({
        code: `ORD-354-${sequence}`,
        businessDate: '2026-09-22',
        originLabel: 'Hà Nội',
        destinationLabel: 'Hải Phòng',
      });
      const leg = await movement.createLeg({
        runId,
        sequence,
        kind: 'LOADED',
        orderId: order.id,
        originLabel: 'Hà Nội',
        destinationLabel: 'Hải Phòng',
        businessDate: '2026-09-22',
      });
      if (sequence === 1) closingLegId = leg.id;
      else openLegId = leg.id;
    }
    await movement.setRunStatus(runId, 'ACTIVE', AT);
  });

  it('chang CO HANG da COMPLETED khi hien truong moi toi noi: khong con nut moc, chang dang chay moi co', async () => {
    await move(closingLegId, 'PLANNED', 'IN_TRANSIT');
    for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'] as const) {
      await record(type, closingLegId);
    }
    // Doi chung TRUOC khi dong: chang dang chay nay chao `Khach da nhan hang`.
    const before = (await legsNow()).find((leg) => leg.legId === closingLegId);
    expect(checkpointActionsOf(before).map((action) => action.checkpointType)).toEqual([
      'DELIVERY_ACCEPTED',
    ]);

    await move(closingLegId, 'IN_TRANSIT', 'COMPLETED');
    const legs = await legsNow();

    expect(checkpointActionsOf(legs.find((leg) => leg.legId === closingLegId))).toEqual([]);
    // Chang con chay van giu nguyen viec dau tien cua no.
    expect(
      checkpointActionsOf(legs.find((leg) => leg.legId === openLegId)).map(
        (action) => action.checkpointType,
      ),
    ).toEqual(['PICKUP_ARRIVAL']);
    // Moi nut moc con lai tren man hinh deu thuoc chang chua ket thuc.
    const legsWithCheckpointButtons = legs.filter((leg) => checkpointActionsOf(leg).length > 0);
    expect(legsWithCheckpointButtons.map((leg) => leg.legId)).toEqual([openLegId]);
  });

  it('chang da HUY khi chua chay: khong con nut moc nao', async () => {
    const before = (await legsNow()).find((leg) => leg.legId === closingLegId);
    expect(checkpointActionsOf(before).map((action) => action.checkpointType)).toEqual([
      'PICKUP_ARRIVAL',
    ]);

    await move(closingLegId, 'PLANNED', 'CANCELLED');
    const after = (await legsNow()).find((leg) => leg.legId === closingLegId);

    expect(after?.nextActions).toEqual([]);
  });

  /*
   * `#358` — CUNG hai hinh dang, nut `Bat dau cho`. `#354` go nut MOC; nut CHO khong di qua cong do,
   * nen chang da dong van chao mot phien cho moi — phien se giu vong chay `ACTIVE` mai.
   */
  const waitingActionsOf = (leg: DriverFieldLeg | undefined) =>
    (leg?.nextActions ?? []).filter((action) => action.kind === 'WAITING_START');

  it('#358 — chang CO HANG da COMPLETED sau `Da den noi`: khong con nut `Bat dau cho`', async () => {
    await move(closingLegId, 'PLANNED', 'IN_TRANSIT');
    for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'] as const) {
      await record(type, closingLegId);
    }
    const before = (await legsNow()).find((leg) => leg.legId === closingLegId);
    expect(waitingActionsOf(before)).toHaveLength(1);

    await move(closingLegId, 'IN_TRANSIT', 'COMPLETED');
    const after = (await legsNow()).find((leg) => leg.legId === closingLegId);

    expect(waitingActionsOf(after)).toEqual([]);
  });

  it('#358 — chang da HUY khi con PLANNED du da `Da den noi`: khong con nut `Bat dau cho`', async () => {
    for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'] as const) {
      await record(type, closingLegId);
    }
    const before = (await legsNow()).find((leg) => leg.legId === closingLegId);
    expect(waitingActionsOf(before)).toHaveLength(1);

    await move(closingLegId, 'PLANNED', 'CANCELLED');
    const after = (await legsNow()).find((leg) => leg.legId === closingLegId);

    expect(waitingActionsOf(after)).toEqual([]);
  });
});
