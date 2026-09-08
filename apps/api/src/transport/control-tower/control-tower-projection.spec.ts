import { describe, expect, it } from 'vitest';
import type { RunAssignment, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Driver, Vehicle } from '../transport.types.js';
import {
  buildOperationsBoard,
  countFleetPresence,
  sortActionQueue,
  type ControlTowerCoreInput,
} from './control-tower-projection.js';
import {
  OPERATIONS_BOARD_COLUMNS,
  PHASE_DERIVED_COLUMNS,
  WAITING_COLUMN,
  type ActionQueueItem,
} from './control-tower.types.js';
import type { RunLegPhase } from '../checkpoint/run-timeline.js';

const TODAY = '2026-09-08';

const run = (over: Partial<VehicleRun> = {}): VehicleRun => ({
  id: '7c1f0a2e-0000-4000-8000-000000000001',
  code: 'VR-001',
  vehicleId: 'b0d1e2f3-0000-4000-8000-000000000001',
  status: 'PLANNED',
  businessDate: TODAY,
  startedAt: null,
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
  runId: '7c1f0a2e-0000-4000-8000-000000000001',
  sequence: 1,
  kind: 'LOADED',
  status: 'PLANNED',
  orderId: null,
  originLabel: 'A',
  destinationLabel: 'B',
  businessDate: TODAY,
  distanceKm: 120,
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: `${TODAY}T01:00:00.000Z`,
  updatedAt: `${TODAY}T01:00:00.000Z`,
  ...over,
});

const assignment = (over: Partial<RunAssignment> = {}): RunAssignment => ({
  id: 'aa11bb22-0000-4000-8000-000000000001',
  runId: '7c1f0a2e-0000-4000-8000-000000000001',
  driverId: 'dd44ee55-0000-4000-8000-000000000001',
  effectiveFrom: `${TODAY}T01:00:00.000Z`,
  effectiveTo: null,
  assignedBy: 'operator',
  createdAt: `${TODAY}T01:00:00.000Z`,
  ...over,
});

const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'b0d1e2f3-0000-4000-8000-000000000001',
  registrationPlate: '29C-123.45',
  vehicleClass: 'TRACTOR',
  allowedPayloadKg: 20000,
  currentOdoKm: 100_000,
  status: 'IDLE',
  // `TX-08` (#242): mac dinh trung voi `DEFAULT` cua Postgres — xe cua cong ty, so dang ky so huu
  // chua khai day du. Bang dieu hanh khong doc hai truong nay; chung o day de khop kieu `Vehicle`.
  operationalControl: 'INTERNAL_OPERATED',
  ownershipRegisterComplete: false,
  createdAt: `${TODAY}T00:00:00.000Z`,
  updatedAt: `${TODAY}T00:00:00.000Z`,
  ...over,
});

const driver = (over: Partial<Driver> = {}): Driver => ({
  id: 'dd44ee55-0000-4000-8000-000000000001',
  fullName: 'Nguyen Van A',
  phone: '0900000000',
  licenceClass: 'FC',
  licenceExpiry: '2027-01-01',
  status: 'ACTIVE',
  authUserId: null,
  createdAt: `${TODAY}T00:00:00.000Z`,
  updatedAt: `${TODAY}T00:00:00.000Z`,
  ...over,
});

const coreInput = (over: Partial<ControlTowerCoreInput> = {}): ControlTowerCoreInput => ({
  runs: [],
  legsByRun: new Map(),
  assignmentsByRun: new Map(),
  vehicles: [],
  drivers: [],
  orderCodesById: new Map(),
  // MAC DINH LA `null` = capability `transport-checkpoint` DANG TAT. Bai nao muon moc thi phai noi
  // ra — nho vay mot bai viet cau tha khong vo tinh chung minh mot cot ma no khong cau hinh.
  legPhasesByRun: null,
  ...over,
});

const RUN_ID = '7c1f0a2e-0000-4000-8000-000000000001';

/** `legPhasesByRun` cho MOT vong chay — cai hinh dang ma `buildRunTimeline().legPhases` tra ve. */
const phasesFor = (
  entries: Readonly<Record<string, RunLegPhase>>,
  runId: string = RUN_ID,
): ReadonlyMap<string, Readonly<Record<string, RunLegPhase>>> => new Map([[runId, entries]]);

const queueItem = (over: Partial<ActionQueueItem> = {}): ActionQueueItem => ({
  kind: 'RUN_ACTIVE_WITHOUT_DRIVER',
  severity: 'WARNING',
  subject: { kind: 'RUN', id: '7c1f0a2e-0000-4000-8000-000000000001', reference: 'VR-001' },
  detail: {},
  ...over,
});

describe('bang dieu hanh — mot PHEP CHIEU cua trang thai da duoc transport-core quyet', () => {
  it('bay cot luon co mat, ke ca khi khong co vong chay nao', () => {
    const board = buildOperationsBoard(coreInput());

    expect(board.map((column) => column.column)).toEqual([...OPERATIONS_BOARD_COLUMNS]);
  });

  it('khong co nguon moc: ba cot giai doan RONG va noi ra ly do — khong cot nao im lang', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'ACTIVE' })],
        legsByRun: new Map([[RUN_ID, [leg({ status: 'IN_TRANSIT' })]]]),
        legPhasesByRun: null,
      }),
    );

    for (const column of board) {
      if (column.column === WAITING_COLUMN) {
        expect(column.unavailableReason).toBe('AWAITING_WAITING_SESSION_SOURCE');
        continue;
      }
      if (!PHASE_DERIVED_COLUMNS.includes(column.column)) {
        expect(column.unavailableReason).toBeNull();
        continue;
      }
      expect(column.unavailableReason).toBe('AWAITING_CHECKPOINT_SOURCE');
      expect(column.cards).toHaveLength(0);
      expect(column.total).toBe(0);
    }
  });

  /*
   * `#278` N13 bai 1 — *"removing F1 source integration restores stale placeholder => test red"*.
   *
   * Bai nay do dung cai do: co nguon moc thi ba cot PHAI mo. Ai go tich hop checkpoint di, hoac
   * quay ve khai bao cung `AWAITING_CHECKPOINT_SOURCE`, se lam bai nay do — khong phai bang mot
   * loi bien dich ma bang mot cau khang dinh ve hanh vi.
   */
  it('co nguon moc: ba cot giai doan MO ra, khong con mot ma ly do nao', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'ACTIVE' })],
        legsByRun: new Map([[RUN_ID, [leg({ status: 'IN_TRANSIT' })]]]),
        legPhasesByRun: phasesFor({ [leg().id]: 'AT_PICKUP' }),
      }),
    );

    for (const column of PHASE_DERIVED_COLUMNS) {
      expect(board.find((entry) => entry.column === column)?.unavailableReason).toBeNull();
    }
  });

  /*
   * `#278` N13 bai 2 — *"WAITING inferred from checkpoint instead of WaitingSession => red"*.
   *
   * Mot chang dang o `ARRIVED` la dung cai cam do de suy ra "dang cho nguoi nhan". Bai nay khoa cua
   * do lai: co moc, co chang da den noi, cot `WAITING` van RONG va van mang ma ly do rieng cua no.
   */
  it('chang da DEN NOI khong bao gio roi vao cot Waiting — cho can mot phien cho', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'ACTIVE' })],
        legsByRun: new Map([[RUN_ID, [leg({ status: 'IN_TRANSIT' })]]]),
        legPhasesByRun: phasesFor({ [leg().id]: 'ARRIVED' }),
      }),
    );

    const waiting = board.find((entry) => entry.column === WAITING_COLUMN);
    expect(waiting?.cards).toHaveLength(0);
    expect(waiting?.unavailableReason).toBe('AWAITING_WAITING_SESSION_SOURCE');
    expect(board.find((entry) => entry.column === 'ARRIVED')?.cards.map((c) => c.runCode)).toEqual([
      'VR-001',
    ]);
  });

  it('giai doan chang quyet dinh cot cua mot vong chay DANG CHAY', () => {
    const columnFor = (phase: RunLegPhase): string | undefined => {
      const board = buildOperationsBoard(
        coreInput({
          runs: [run({ status: 'ACTIVE' })],
          legsByRun: new Map([[RUN_ID, [leg({ status: 'IN_TRANSIT' })]]]),
          legPhasesByRun: phasesFor({ [leg().id]: phase }),
        }),
      );
      return board.find((entry) => entry.cards.length > 0)?.column;
    };

    expect(columnFor('PLANNED')).toBe('IN_TRANSIT');
    expect(columnFor('AT_PICKUP')).toBe('PICKUP');
    expect(columnFor('LOADING')).toBe('LOADING');
    expect(columnFor('IN_TRANSIT')).toBe('IN_TRANSIT');
    expect(columnFor('ARRIVED')).toBe('ARRIVED');
  });

  it('vong chay dang chay ma chua ai bam moc van o In transit, khong bien mat khoi bang', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'ACTIVE' })],
        legsByRun: new Map([[RUN_ID, [leg({ status: 'IN_TRANSIT' })]]]),
        legPhasesByRun: phasesFor({}),
      }),
    );

    expect(board.find((entry) => entry.column === 'IN_TRANSIT')?.cards).toHaveLength(1);
    expect(board.find((entry) => entry.column === 'IN_TRANSIT')?.cards[0]?.currentLeg?.phase).toBe(
      null,
    );
  });

  it('chang dang lam la chang mo co so thu tu NHO NHAT, kem ma don doc duoc', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'ACTIVE' })],
        legsByRun: new Map([
          [
            RUN_ID,
            [
              leg({ id: 'l1', sequence: 1, status: 'COMPLETED', kind: 'EMPTY' }),
              leg({ id: 'l2', sequence: 2, status: 'IN_TRANSIT', orderId: 'o-9' }),
              leg({ id: 'l3', sequence: 3, status: 'PLANNED' }),
            ],
          ],
        ]),
        orderCodesById: new Map([['o-9', 'ORD-2026-09-0009']]),
        legPhasesByRun: phasesFor({ l1: 'DELIVERED', l2: 'LOADING' }),
      }),
    );

    const card = board.find((entry) => entry.column === 'LOADING')?.cards[0];
    expect(card?.currentLeg).toEqual({
      legId: 'l2',
      sequence: 2,
      kind: 'LOADED',
      orderCode: 'ORD-2026-09-0009',
      phase: 'LOADING',
    });
  });

  it('chang RONG khong mang ma don — bat bien cua TransportRunLeg doc len tren the', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'ACTIVE' })],
        legsByRun: new Map([[RUN_ID, [leg({ id: 'e1', kind: 'EMPTY', status: 'IN_TRANSIT' })]]]),
        legPhasesByRun: phasesFor({ e1: 'IN_TRANSIT' }),
      }),
    );

    const card = board.find((entry) => entry.column === 'IN_TRANSIT')?.cards[0];
    expect(card?.currentLeg?.kind).toBe('EMPTY');
    expect(card?.currentLeg?.orderCode).toBeNull();
  });

  it('moi chang deu xong thi khong con chang dang lam — the noi null, khong bia chang cuoi', () => {
    const board = buildOperationsBoard(
      coreInput({
        runs: [run({ status: 'COMPLETED' })],
        legsByRun: new Map([[RUN_ID, [leg({ id: 'l1', status: 'COMPLETED' })]]]),
        legPhasesByRun: phasesFor({ l1: 'DELIVERED' }),
      }),
    );

    expect(board.find((entry) => entry.column === 'DELIVERED')?.cards[0]?.currentLeg).toBeNull();
  });

  it('vong chay PLANNED vao cot Planned, ACTIVE vao In transit, COMPLETED vao Delivered', () => {
    const activeId = '7c1f0a2e-0000-4000-8000-0000000000a1';
    const doneId = '7c1f0a2e-0000-4000-8000-0000000000a2';
    const board = buildOperationsBoard(
      coreInput({
        runs: [
          run(),
          run({ id: activeId, code: 'VR-A', status: 'ACTIVE' }),
          run({ id: doneId, code: 'VR-D', status: 'COMPLETED' }),
        ],
      }),
    );

    const columnOf = (name: string) => board.find((entry) => entry.column === name);
    expect(columnOf('PLANNED')?.cards.map((card) => card.runCode)).toEqual(['VR-001']);
    expect(columnOf('IN_TRANSIT')?.cards.map((card) => card.runCode)).toEqual(['VR-A']);
    expect(columnOf('DELIVERED')?.cards.map((card) => card.runCode)).toEqual(['VR-D']);
  });

  it('vong chay DA HUY khong len bang — mot ke hoach bi bo khong phai mot cot', () => {
    const board = buildOperationsBoard(
      coreInput({ runs: [run({ status: 'CANCELLED', cancelledAt: `${TODAY}T02:00:00.000Z` })] }),
    );

    expect(board.every((column) => column.cards.length === 0)).toBe(true);
  });

  it('the mang ma vong chay chu KHONG mang id ky thuat lam dinh danh dat len dia chi', () => {
    const board = buildOperationsBoard(coreInput({ runs: [run()] }));
    const card = board.find((column) => column.column === 'PLANNED')?.cards[0];

    expect(card?.runCode).toBe('VR-001');
    expect(card?.runId).toBe('7c1f0a2e-0000-4000-8000-000000000001');
  });

  it('thieu km o mot chang thi totalKm la null — khong bao gio bia bang 0', () => {
    const runId = '7c1f0a2e-0000-4000-8000-000000000001';
    const board = buildOperationsBoard(
      coreInput({
        runs: [run()],
        legsByRun: new Map([
          [runId, [leg({ distanceKm: 120 }), leg({ id: 'x', sequence: 2, distanceKm: null })]],
        ]),
      }),
    );
    const card = board.find((column) => column.column === 'PLANNED')?.cards[0];

    expect(card?.totalKm).toBeNull();
    // `#278` N13 bai 3 — km khong biet KHONG duoc ve thanh so 0 tren mot the.
    expect(card?.emptyKm).toBeNull();
    expect(card?.loadedLegs).toBe(2);
  });

  it('du km o moi chang thi totalKm la tong that', () => {
    const runId = '7c1f0a2e-0000-4000-8000-000000000001';
    const board = buildOperationsBoard(
      coreInput({
        runs: [run()],
        legsByRun: new Map([
          [
            runId,
            [
              leg({ distanceKm: 120 }),
              leg({ id: 'x', sequence: 2, kind: 'EMPTY', distanceKm: 30 }),
            ],
          ],
        ]),
      }),
    );
    const card = board.find((column) => column.column === 'PLANNED')?.cards[0];

    expect(card?.totalKm).toBe(150);
    expect(card?.emptyKm).toBe(30);
    expect(card?.loadedLegs).toBe(1);
    expect(card?.emptyLegs).toBe(1);
  });

  it('lai xe tren the den tu ban phan cong DANG HIEU LUC, khong tu ban da dong', () => {
    const runId = '7c1f0a2e-0000-4000-8000-000000000001';
    const board = buildOperationsBoard(
      coreInput({
        runs: [run()],
        assignmentsByRun: new Map([
          [
            runId,
            [
              assignment({ id: 'old', driverId: 'cu', effectiveTo: `${TODAY}T05:00:00.000Z` }),
              assignment({ id: 'now', driverId: 'moi' }),
            ],
          ],
        ]),
      }),
    );
    const card = board.find((column) => column.column === 'PLANNED')?.cards[0];

    expect(card?.driverId).toBe('moi');
  });

  it('the trong mot cot xep on dinh theo ma vong chay — hai lan doc cho cung thu tu', () => {
    const input = coreInput({
      runs: [
        run({ id: 'c', code: 'VR-003' }),
        run({ id: 'a', code: 'VR-001' }),
        run({ id: 'b', code: 'VR-002' }),
      ],
    });

    const first = buildOperationsBoard(input);
    expect(
      first.find((column) => column.column === 'PLANNED')?.cards.map((c) => c.runCode),
    ).toEqual(['VR-001', 'VR-002', 'VR-003']);
    expect(buildOperationsBoard(input)).toEqual(first);
  });
});

describe('doi xe — dem tren du lieu that, khong suy tu vong chay', () => {
  it('dem theo trang thai xe va chi dem lai xe ACTIVE', () => {
    const presence = countFleetPresence(
      coreInput({
        vehicles: [
          vehicle({ id: '1', status: 'IDLE' }),
          vehicle({ id: '2', status: 'ON_TRIP' }),
          vehicle({ id: '3', status: 'UNDER_MAINTENANCE' }),
          vehicle({ id: '4', status: 'IDLE' }),
        ],
        drivers: [driver({ id: 'd1', status: 'ACTIVE' }), driver({ id: 'd2', status: 'INACTIVE' })],
      }),
    );

    expect(presence).toEqual({
      total: 4,
      idle: 2,
      onTrip: 1,
      underMaintenance: 1,
      activeDrivers: 1,
    });
  });

  it('doi xe rong cho ra so 0 that, khong phai mot o trong', () => {
    expect(countFleetPresence(coreInput())).toEqual({
      total: 0,
      idle: 0,
      onTrip: 0,
      underMaintenance: 0,
      activeDrivers: 0,
    });
  });
});

describe('hang viec — nang truoc, va tat dinh', () => {
  it('CRITICAL truoc WARNING truoc INFO', () => {
    const sorted = sortActionQueue([
      queueItem({ kind: 'MAINTENANCE_DUE_SOON', severity: 'INFO' }),
      queueItem({ kind: 'COMPLIANCE_DOCUMENT_EXPIRED', severity: 'CRITICAL' }),
      queueItem({ kind: 'EXPENSE_CLAIM_AWAITING_REVIEW', severity: 'WARNING' }),
    ]);

    expect(sorted.map((item) => item.severity)).toEqual(['CRITICAL', 'WARNING', 'INFO']);
  });

  it('cung muc nang thi on dinh theo ma roi theo id — khong phu thuoc thu tu dau vao', () => {
    const build = (): readonly ActionQueueItem[] => [
      queueItem({
        kind: 'FUEL_ENTRY_AWAITING_VERIFICATION',
        severity: 'WARNING',
        subject: { kind: 'FUEL_ENTRY', id: 'z', reference: null },
      }),
      queueItem({
        kind: 'EXPENSE_CLAIM_AWAITING_REVIEW',
        severity: 'WARNING',
        subject: { kind: 'EXPENSE_CLAIM', id: 'b', reference: null },
      }),
      queueItem({
        kind: 'EXPENSE_CLAIM_AWAITING_REVIEW',
        severity: 'WARNING',
        subject: { kind: 'EXPENSE_CLAIM', id: 'a', reference: null },
      }),
    ];

    const sorted = sortActionQueue(build());
    expect(sorted.map((item) => item.subject.id)).toEqual(['a', 'b', 'z']);
    expect(sortActionQueue([...build()].reverse())).toEqual(sorted);
  });

  it('khong sua mang dau vao', () => {
    const input = [
      queueItem({ severity: 'INFO', kind: 'MAINTENANCE_DUE_SOON' }),
      queueItem({ severity: 'CRITICAL', kind: 'MAINTENANCE_OVERDUE' }),
    ];
    const snapshot = [...input];

    sortActionQueue(input);

    expect(input).toEqual(snapshot);
  });
});
