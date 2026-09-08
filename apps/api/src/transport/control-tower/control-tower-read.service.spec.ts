import { describe, expect, it } from 'vitest';
import type { RunAssignment, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Driver, Vehicle } from '../transport.types.js';
import type { OperationalAlertFeed } from '../asset-compliance/operational-alerts.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import {
  ControlTowerAlertFacts,
  ControlTowerClaimFacts,
  ControlTowerCoreFacts,
  ControlTowerFuelFacts,
  type ControlTowerClaimFact,
  type ControlTowerFuelEntryFact,
  type ControlTowerReconciliationFact,
} from './control-tower-facts.port.js';
import { ControlTowerReadService } from './control-tower-read.service.js';

const TODAY = '2026-09-08';
const NOW = new Date('2026-09-08T03:00:00.000Z');
const RUN_ID = '7c1f0a2e-0000-4000-8000-000000000001';

const policy = { timeZone: 'Asia/Ho_Chi_Minh' } as TransportCorePolicy;

const run = (over: Partial<VehicleRun> = {}): VehicleRun => ({
  id: RUN_ID,
  code: 'VR-001',
  vehicleId: 'b0d1e2f3-0000-4000-8000-000000000001',
  status: 'ACTIVE',
  businessDate: TODAY,
  startedAt: `${TODAY}T01:00:00.000Z`,
  completedAt: null,
  note: null,
  createdAt: `${TODAY}T01:00:00.000Z`,
  updatedAt: `${TODAY}T01:00:00.000Z`,
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (over: Partial<RunLeg> = {}): RunLeg => ({
  id: '9a2b3c4d-0000-4000-8000-000000000001',
  runId: RUN_ID,
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'A',
  destinationLabel: 'B',
  businessDate: TODAY,
  distanceKm: 120,
  plannedDistanceKm: null,
  startedAt: null,
  completedAt: `${TODAY}T05:00:00.000Z`,
  note: null,
  createdAt: `${TODAY}T01:00:00.000Z`,
  updatedAt: `${TODAY}T01:00:00.000Z`,
  ...over,
});

class CoreStub extends ControlTowerCoreFacts {
  constructor(
    private readonly data: {
      runs?: readonly VehicleRun[];
      legs?: readonly RunLeg[];
      assignments?: readonly RunAssignment[];
      vehicles?: readonly Vehicle[];
      drivers?: readonly Driver[];
    } = {},
  ) {
    super();
  }
  listRuns() {
    return Promise.resolve(this.data.runs ?? []);
  }
  listLegs() {
    return Promise.resolve(this.data.legs ?? []);
  }
  listRunAssignments() {
    return Promise.resolve(this.data.assignments ?? []);
  }
  listVehicles() {
    return Promise.resolve(this.data.vehicles ?? []);
  }
  listDrivers() {
    return Promise.resolve(this.data.drivers ?? []);
  }
}

class ClaimStub extends ControlTowerClaimFacts {
  constructor(private readonly claims: readonly ControlTowerClaimFact[]) {
    super();
  }
  listAwaitingReview() {
    return Promise.resolve(this.claims);
  }
}

class FuelStub extends ControlTowerFuelFacts {
  constructor(
    private readonly entries: readonly ControlTowerFuelEntryFact[] = [],
    private readonly reconciliations: readonly ControlTowerReconciliationFact[] = [],
  ) {
    super();
  }
  listEntriesAwaitingVerification() {
    return Promise.resolve(this.entries);
  }
  listOpenReconciliations() {
    return Promise.resolve(this.reconciliations);
  }
}

class ThrowingFuelStub extends ControlTowerFuelFacts {
  listEntriesAwaitingVerification(): Promise<readonly ControlTowerFuelEntryFact[]> {
    return Promise.reject(new Error('kho nhien lieu dang hong'));
  }
  listOpenReconciliations(): Promise<readonly ControlTowerReconciliationFact[]> {
    return Promise.resolve([]);
  }
}

class AlertStub extends ControlTowerAlertFacts {
  constructor(private readonly feedValue: OperationalAlertFeed) {
    super();
  }
  feed() {
    return Promise.resolve(this.feedValue);
  }
}

describe('nguon vang mat phai NOI RA, khong duoc im lang', () => {
  it('khach chi bat `transport-core` — ba nguon deu duoc cong bo la thieu', async () => {
    const service = new ControlTowerReadService(new CoreStub(), policy);

    const view = await service.view(NOW);

    expect([...view.unavailableSources].sort()).toEqual([
      'EXPENSE_CLAIMS',
      'FUEL',
      'OPERATIONAL_ALERTS',
    ]);
    expect(view.queue).toHaveLength(0);
  });

  it('khach bat du ba nguon — khong con nguon nao duoc bao la thieu', async () => {
    const service = new ControlTowerReadService(
      new CoreStub(),
      policy,
      new ClaimStub([]),
      new FuelStub(),
      new AlertStub({ generatedFor: TODAY, alerts: [], unavailableSources: [] }),
    );

    const view = await service.view(NOW);

    expect(view.unavailableSources).toEqual([]);
  });

  /**
   * MOT NGUON HONG KHONG DUOC LAM HONG CA BANG.
   *
   * Day la bai quan trong nhat cua tep: neu no do, nguoi truc se mat CA cong cu chan doan dung luc
   * mot mien nghiep vu dang hong — tuc dung luc ho can no nhat.
   */
  it('mot nguon nem loi thi chi mat DUNG muc do, phan con lai van dung', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ vehicles: [] }),
      policy,
      new ClaimStub([{ id: 'claim-1', driverId: 'driver-1' }]),
      new ThrowingFuelStub(),
    );

    const view = await service.view(NOW);

    expect(view.queue.map((item) => item.kind)).toEqual(['EXPENSE_CLAIM_AWAITING_REVIEW']);
    /* Nguon CO BAT — no hong, khong phai vang. Hai tinh huong do hai hanh dong khac nhau. */
    expect(view.unavailableSources).not.toContain('FUEL');
  });
});

describe('hang viec doc duoc tu chinh `transport-core`', () => {
  it('vong chay dang chay ma khong co phan cong hieu luc thi len hang viec, muc CRITICAL', async () => {
    const service = new ControlTowerReadService(new CoreStub({ runs: [run()] }), policy);

    const view = await service.view(NOW);
    const item = view.queue.find((entry) => entry.kind === 'RUN_ACTIVE_WITHOUT_DRIVER');

    expect(item?.severity).toBe('CRITICAL');
    expect(item?.subject).toEqual({ kind: 'RUN', id: RUN_ID, reference: 'VR-001' });
  });

  it('vong chay CO phan cong hieu luc thi khong len hang viec', async () => {
    const assignment: RunAssignment = {
      id: 'aa11bb22-0000-4000-8000-000000000001',
      runId: RUN_ID,
      driverId: 'dd44ee55-0000-4000-8000-000000000001',
      effectiveFrom: `${TODAY}T01:00:00.000Z`,
      effectiveTo: null,
      assignedBy: 'operator',
      createdAt: `${TODAY}T01:00:00.000Z`,
    };
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], assignments: [assignment] }),
      policy,
    );

    const view = await service.view(NOW);

    expect(view.queue.map((entry) => entry.kind)).not.toContain('RUN_ACTIVE_WITHOUT_DRIVER');
  });

  it('chang DA XONG ma thieu km len hang viec, va tro ve dung chang do', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], legs: [leg({ distanceKm: null })] }),
      policy,
    );

    const view = await service.view(NOW);
    const item = view.queue.find((entry) => entry.kind === 'RUN_LEG_MISSING_DISTANCE');

    expect(item?.subject.kind).toBe('RUN_LEG');
    expect(item?.subject.id).toBe('9a2b3c4d-0000-4000-8000-000000000001');
    /* Ma vong chay, khong phai `id` — day la thu duoc phep dat len dia chi. */
    expect(item?.subject.reference).toBe('VR-001');
  });

  it('chang CHUA XONG ma thieu km thi CHUA phai viec — no chua den luc nhap', async () => {
    const service = new ControlTowerReadService(
      new CoreStub({ runs: [run()], legs: [leg({ status: 'IN_TRANSIT', distanceKm: null })] }),
      policy,
    );

    const view = await service.view(NOW);

    expect(view.queue.map((entry) => entry.kind)).not.toContain('RUN_LEG_MISSING_DISTANCE');
  });
});

describe('viec CHUA THEO DOI DUOC phai duoc cong bo kem ly do', () => {
  it('nam muc, moi muc mot ma ly do doc duoc', async () => {
    const service = new ControlTowerReadService(new CoreStub(), policy);

    const view = await service.view(NOW);

    expect(view.pendingWork).toEqual([
      { kind: 'RECEIVER_WAITING_ABOVE_THRESHOLD', reason: 'AWAITING_CHECKPOINT_SOURCE' },
      { kind: 'DELIVERY_PROOF_DOCUMENT_MISSING', reason: 'AWAITING_CHECKPOINT_SOURCE' },
      { kind: 'DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL', reason: 'AWAITING_CHECKPOINT_SOURCE' },
      { kind: 'CUSTOMER_AR_OVERDUE', reason: 'AWAITING_RECEIVABLE_DUE_DATE_SOURCE' },
      { kind: 'LOCATION_PROOF_REVIEW', reason: 'AWAITING_FLEET_WIDE_PROOF_QUERY' },
    ]);
  });
});

describe('tat dinh', () => {
  it('hai lan doc cung du lieu cho ra cung khung nhin', async () => {
    const build = () =>
      new ControlTowerReadService(
        new CoreStub({ runs: [run(), run({ id: 'r2', code: 'VR-002', status: 'PLANNED' })] }),
        policy,
        new ClaimStub([
          { id: 'c2', driverId: 'd2' },
          { id: 'c1', driverId: 'd1' },
        ]),
      );

    expect(await build().view(NOW)).toEqual(await build().view(NOW));
  });

  it('`queueTotal` la so muc that, khong phai do dai mot danh sach da cat', async () => {
    const service = new ControlTowerReadService(
      new CoreStub(),
      policy,
      new ClaimStub([
        { id: 'c1', driverId: 'd1' },
        { id: 'c2', driverId: 'd2' },
        { id: 'c3', driverId: 'd3' },
      ]),
    );

    const view = await service.view(NOW);

    expect(view.queueTotal).toBe(3);
    expect(view.queue).toHaveLength(3);
  });

  it('ngay nghiep vu tinh theo mui gio tenant, khong theo UTC', async () => {
    const service = new ControlTowerReadService(new CoreStub(), policy);

    /* 2026-09-08T17:30Z la 00:30 ngay 09/09 o Asia/Ho_Chi_Minh (`INV-25`). */
    const view = await service.view(new Date('2026-09-08T17:30:00.000Z'));

    expect(view.generatedFor).toBe('2026-09-09');
  });
});
