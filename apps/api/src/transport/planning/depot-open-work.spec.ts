import { describe, expect, it } from 'vitest';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementDepotOpenWorkReader } from './depot-open-work.js';
import type { TransportPlanningPolicy } from './planning.types.js';

/**
 * VIEC DANG MO TAI MOT BAI XE (`#395`) — cai man "Dia diem van hanh" doi nguoi dung xac nhan truoc
 * khi doi ten / tat / doi bai chinh. So khop bang `sameSite()`: CHINH luat cua khau lap ke hoach va
 * dong vong chay.
 */
const DEPOT = 'Bãi xe Hà Nội';
const DAY = '2026-09-25';

const policy = (idleHours: number | null): TransportPlanningPolicy => ({
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [],
  closure: { idleHours },
  sweep: { intervalSeconds: 60, batchSize: 50 },
});

describe('viec dang mo tai mot bai xe (#395)', () => {
  it('vong chay PLANNED/ACTIVE co chang chua huy di tu / ve bai; don chua xong mang nhan bai', async () => {
    const movement = new InMemoryMovementRepository();
    const leg = (runId: string, sequence: number, origin: string, destination: string) =>
      movement.createLeg({
        runId,
        sequence,
        kind: 'EMPTY',
        orderId: null,
        originLabel: origin,
        destinationLabel: destination,
        businessDate: DAY,
      });

    const planned = await movement.createRun({ code: 'VR-PLANNED', vehicleId: 'v1', businessDate: DAY });
    await leg(planned.id, 1, '  bãi xe  hà nội ', 'Kho A');
    const active = await movement.createRun({ code: 'VR-ACTIVE', vehicleId: 'v2', businessDate: DAY });
    await leg(active.id, 1, 'Kho B', DEPOT);
    await movement.setRunStatus(active.id, 'ACTIVE', new Date());
    const done = await movement.createRun({ code: 'VR-DONE', vehicleId: 'v3', businessDate: DAY });
    await leg(done.id, 1, 'Kho C', DEPOT);
    await movement.setRunStatus(done.id, 'COMPLETED', new Date());
    const elsewhere = await movement.createRun({ code: 'VR-XA', vehicleId: 'v4', businessDate: DAY });
    await leg(elsewhere.id, 1, 'Kho D', 'Kho E');
    // Khac dau KHONG phai cung cho theo `sameSite()` — dung nhu khau lap ke hoach.
    const unaccented = await movement.createRun({ code: 'VR-KD', vehicleId: 'v5', businessDate: DAY });
    await leg(unaccented.id, 1, 'Bai xe Ha Noi', 'Kho F');

    const open = await movement.createOrder({ code: 'ORD-OPEN', businessDate: DAY, originLabel: DEPOT, destinationLabel: 'Kho G' });
    const cancelled = await movement.createOrder({ code: 'ORD-HUY', businessDate: DAY, originLabel: 'Kho H', destinationLabel: DEPOT });
    await movement.cancelOrder(cancelled.id, { cancelledAt: new Date(), cancellationReason: 'x' });
    const fulfilled = await movement.createOrder({ code: 'ORD-XONG', businessDate: DAY, originLabel: DEPOT, destinationLabel: 'Kho I' });
    await movement.setOrderStatus(fulfilled.id, 'FULFILLED', new Date());

    const work = await new MovementDepotOpenWorkReader(movement, policy(12)).openWorkAt(DEPOT);

    expect(work.runs.map((run) => run.code).sort()).toEqual(['VR-ACTIVE', 'VR-PLANNED']);
    expect(work.orders).toEqual([{ id: open.id, code: 'ORD-OPEN' }]);
    expect(work.idleHours).toBe(12);
  });

  it('chang da huy khong tinh; khach khong khai nguong nghi -> idleHours null', async () => {
    const movement = new InMemoryMovementRepository();
    const run = await movement.createRun({ code: 'VR-1', vehicleId: 'v1', businessDate: DAY });
    const leg = await movement.createLeg({
      runId: run.id,
      sequence: 1,
      kind: 'EMPTY',
      orderId: null,
      originLabel: DEPOT,
      destinationLabel: 'Kho A',
      businessDate: DAY,
    });
    await movement.setLegStatus({ legId: leg.id, from: 'PLANNED', to: 'CANCELLED', at: new Date() });

    const work = await new MovementDepotOpenWorkReader(movement, policy(null)).openWorkAt(DEPOT);

    expect(work).toEqual({ runs: [], orders: [], idleHours: null });
  });
});
