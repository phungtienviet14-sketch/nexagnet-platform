import { describe, expect, it } from 'vitest';
import { TRANSPORT_SECTIONS } from '../../navigation';
import type {
  ActionQueueItem,
  ControlTowerView,
  OperationsBoardCard,
  OperationsBoardColumnView,
} from '../../transport-types';
import { OPERATIONS_BOARD_ORDER, toControlTower } from '../control-tower';

const TODAY = '2026-09-08';

const column = (over: Partial<OperationsBoardColumnView> = {}): OperationsBoardColumnView => ({
  column: 'PLANNED',
  cards: [],
  total: 0,
  unavailableReason: null,
  ...over,
});

const card = (over: Partial<OperationsBoardCard> = {}): OperationsBoardCard => ({
  runId: 'r1',
  runCode: 'VR-001',
  vehicleId: 'v1',
  businessDate: TODAY,
  driverId: null,
  loadedLegs: 2,
  emptyLegs: 1,
  totalKm: 300,
  emptyKm: 100,
  currentLeg: null,
  ...over,
});

/**
 * BANG cua mot khach DA bat `transport-checkpoint`.
 *
 * Ba cot giai doan MO; chi `WAITING` con dong, va no dong vi mot ly do KHAC — phien cho chua ton
 * tai. Do la hinh dang that cua bang sau `#278` N4, nen cac bai duoi day chay tren no.
 */
const emptyBoard = (): OperationsBoardColumnView[] =>
  OPERATIONS_BOARD_ORDER.map((name) =>
    column({
      column: name,
      unavailableReason: name === 'WAITING' ? 'AWAITING_WAITING_SESSION_SOURCE' : null,
    }),
  );

/** BANG cua mot khach CHUA bat `transport-checkpoint` — ba cot giai doan dong lai. */
const boardWithoutCheckpoints = (): OperationsBoardColumnView[] =>
  OPERATIONS_BOARD_ORDER.map((name) =>
    column({
      column: name,
      unavailableReason: ['PICKUP', 'LOADING', 'ARRIVED'].includes(name)
        ? 'AWAITING_CHECKPOINT_SOURCE'
        : name === 'WAITING'
          ? 'AWAITING_WAITING_SESSION_SOURCE'
          : null,
    }),
  );

/** Dat MOT the vao MOT cot cua mot bang da co day du bay cot. */
const boardWith = (
  target: OperationsBoardColumnView['column'],
  entry: OperationsBoardCard,
): OperationsBoardColumnView[] =>
  emptyBoard().map((existing) =>
    existing.column === target ? { ...existing, total: 1, cards: [entry] } : existing,
  );

const item = (over: Partial<ActionQueueItem> = {}): ActionQueueItem => ({
  kind: 'RUN_ACTIVE_WITHOUT_DRIVER',
  severity: 'CRITICAL',
  subject: { kind: 'RUN', id: '7c1f0a2e-0000-4000-8000-000000000001', reference: 'VR-001' },
  detail: {},
  ...over,
});

const view = (over: Partial<ControlTowerView> = {}): ControlTowerView => ({
  generatedFor: TODAY,
  board: emptyBoard(),
  fleet: { total: 0, idle: 0, onTrip: 0, underMaintenance: 0, activeDrivers: 0 },
  queue: [],
  queueTotal: 0,
  unavailableSources: [],
  pendingWork: [],
  ...over,
});

describe('hang viec — moi dong phai bam duoc ve ban ghi goc', () => {
  it('moi dong tro toi mot muc CO THAT trong danh muc dieu huong', () => {
    const model = toControlTower(
      view({
        queue: [
          item(),
          item({
            kind: 'EXPENSE_CLAIM_AWAITING_REVIEW',
            severity: 'WARNING',
            subject: { kind: 'EXPENSE_CLAIM', id: 'claim-1', reference: null },
          }),
          item({
            kind: 'FUEL_ENTRY_AWAITING_VERIFICATION',
            severity: 'WARNING',
            subject: { kind: 'FUEL_ENTRY', id: 'entry-1', reference: null },
          }),
          item({
            kind: 'MAINTENANCE_OVERDUE',
            severity: 'CRITICAL',
            subject: { kind: 'VEHICLE', id: 'vehicle-1', reference: null },
          }),
          item({
            kind: 'DRIVER_FUND_BALANCE_UNUSUAL',
            severity: 'INFO',
            subject: { kind: 'DRIVER', id: 'driver-1', reference: null },
          }),
        ],
        queueTotal: 5,
      }),
    );

    const known = TRANSPORT_SECTIONS.map((section) => section.id);
    for (const row of model.queue) {
      expect(known, row.key).toContain(row.section);
    }
  });

  /**
   * MOT `id` KY THUAT KHONG BAO GIO DUOC LEN DIA CHI.
   *
   * Quy uoc cua `navigation.ts` (`SELECTION_QUERY_PARAM`): gia tri phai la mot dinh danh nghiep vu.
   * Khi may chu noi `reference: null`, man hinh phai chiu mat duong dan sau chu KHONG duoc lay
   * `subject.id` ra thay.
   */
  it('`reference` rong thi `selection` rong — khong lay `id` ra thay', () => {
    const model = toControlTower(
      view({
        queue: [
          item({
            kind: 'EXPENSE_CLAIM_AWAITING_REVIEW',
            subject: { kind: 'EXPENSE_CLAIM', id: 'claim-uuid-1', reference: null },
          }),
        ],
        queueTotal: 1,
      }),
    );

    expect(model.queue[0]?.selection).toBeNull();
  });

  it('vong chay chua phan cong dan ve muc `movement` kem MA vong chay', () => {
    const model = toControlTower(view({ queue: [item()], queueTotal: 1 }));

    expect(model.queue[0]?.section).toBe('movement');
    expect(model.queue[0]?.selection).toBe('VR-001');
  });

  it('con so tieu de lay tu `queueTotal`, khong tu do dai danh sach da cat', () => {
    const model = toControlTower(view({ queue: [item()], queueTotal: 9 }));

    expect(model.queueTotal).toBe(9);
    expect(model.headline).toContain('9');
  });

  it('khong con viec nao thi noi thang la khong con viec', () => {
    const model = toControlTower(view());

    expect(model.hasWork).toBe(false);
    expect(model.queue).toHaveLength(0);
  });
});

describe('bang — bay cot, va cot chua co nguon phai noi ra', () => {
  it('giu du bay cot theo dung thu tu quy trinh', () => {
    const model = toControlTower(view());

    expect(model.columns.map((entry) => entry.column)).toEqual([...OPERATIONS_BOARD_ORDER]);
  });

  it('cot doi checkpoint mang mot cau giai thich, khong phai mot o trong', () => {
    const model = toControlTower(view());
    const waiting = model.columns.find((entry) => entry.column === 'WAITING');

    expect(waiting?.isAvailable).toBe(false);
    expect(waiting?.note).not.toBeNull();
    expect(waiting?.note?.length ?? 0).toBeGreaterThan(0);
  });

  it('cot co nguon khong mang cau giai thich nao', () => {
    const model = toControlTower(view());
    const planned = model.columns.find((entry) => entry.column === 'PLANNED');

    expect(planned?.isAvailable).toBe(true);
    expect(planned?.note).toBeNull();
  });

  /**
   * `totalKm === null` nghia la CHUA DU DU LIEU, khong phai 0 km.
   *
   * Day la cho de tuot nhat khi doi tu tang doc sang tang hien thi: `?? 0` doc len rat tu nhien va
   * bien mot vong chay chua nhap km thanh mot vong chay dai 0 km.
   */
  it('thieu km hien ra dau gach, khong bao gio ra so 0', () => {
    const model = toControlTower(
      view({ board: boardWith('PLANNED', card({ totalKm: null, emptyKm: null })) }),
    );
    const row = model.columns.find((entry) => entry.column === 'PLANNED')?.cards[0];

    expect(row?.totalKm).not.toBe('0');
    expect(row?.totalKm).toBe('—');
    /* `#278` N13 bai 3 — km rong khong biet cung khong duoc ve thanh 0. */
    expect(row?.emptyKm).not.toBe('0');
    expect(row?.emptyKm).toBe('—');
  });
});

describe('chang dang lam — chang RONG phai doc ra duoc, khong chi nhin ra duoc', () => {
  /*
   * `#278` N13 bai 4 — *"EMPTY segment not visually/emphatically distinguishable/red => red"*.
   *
   * Bai o tang doc khoa nua duoi cua yeu cau do: tang doc phai phat ra MOT CO rieng (`isEmpty`) VA
   * mot chu doc duoc ("RỖNG"). Neu chi co mau o CSS thi nguoi dung mu mau, hay mot ban in den
   * trang, se mat sach thong tin — va khong bai nao bat duoc.
   */
  it('chang rong mang co rieng VA chu RONG trong nhan — mau khong phai tin hieu duy nhat', () => {
    const model = toControlTower(
      view({
        board: boardWith(
          'IN_TRANSIT',
          card({
            currentLeg: {
              legId: 'l2',
              sequence: 2,
              kind: 'EMPTY',
              orderCode: null,
              phase: 'IN_TRANSIT',
            },
          }),
        ),
      }),
    );
    const leg = model.columns.find((entry) => entry.column === 'IN_TRANSIT')?.cards[0]?.currentLeg;

    expect(leg?.isEmpty).toBe(true);
    expect(leg?.label).toContain('RỖNG');
    expect(leg?.phase).toBe('Đang chạy');
  });

  it('chang co hang mang MA DON, va khong bi danh dau rong', () => {
    const model = toControlTower(
      view({
        board: boardWith(
          'LOADING',
          card({
            currentLeg: {
              legId: 'l1',
              sequence: 1,
              kind: 'LOADED',
              orderCode: 'ORD-2026-09-0009',
              phase: 'LOADING',
            },
          }),
        ),
      }),
    );
    const leg = model.columns.find((entry) => entry.column === 'LOADING')?.cards[0]?.currentLeg;

    expect(leg?.isEmpty).toBe(false);
    expect(leg?.label).toContain('ORD-2026-09-0009');
  });

  it('chang chua co moc noi dau gach, KHONG doan mot giai doan', () => {
    const model = toControlTower(
      view({
        board: boardWith(
          'IN_TRANSIT',
          card({
            currentLeg: { legId: 'l1', sequence: 1, kind: 'LOADED', orderCode: null, phase: null },
          }),
        ),
      }),
    );
    const leg = model.columns.find((entry) => entry.column === 'IN_TRANSIT')?.cards[0]?.currentLeg;

    expect(leg?.phase).toBe('—');
    expect(leg?.label).toContain('chưa gắn đơn');
  });
});

describe('cot dong lai — hai ly do, hai cau chu khac nhau', () => {
  it('khach chua bat moc: ba cot giai doan dong, va cau chu noi ve MOC', () => {
    const model = toControlTower(view({ board: boardWithoutCheckpoints() }));
    const pickup = model.columns.find((entry) => entry.column === 'PICKUP');

    expect(pickup?.isAvailable).toBe(false);
    expect(pickup?.note).toContain('mốc hiện trường');
  });

  /*
   * `#278` N13 bai 2, lop cuoi cung — o TANG MAN HINH.
   *
   * Sau khi moc da co that, cot `WAITING` van dong. Neu cau chu cua no van noi "chưa bật nghiệp vụ
   * mốc" thi nguoi truc se di bat mot capability DA bat, va cot van khong mo ra.
   */
  it('da co moc: cot Cho nguoi nhan van dong, nhung cau chu noi ve PHIEN CHO', () => {
    const model = toControlTower(view({ board: emptyBoard() }));
    const waiting = model.columns.find((entry) => entry.column === 'WAITING');
    const pickup = model.columns.find((entry) => entry.column === 'PICKUP');

    expect(pickup?.isAvailable).toBe(true);
    expect(waiting?.isAvailable).toBe(false);
    expect(waiting?.note).toContain('phiên chờ');
    expect(waiting?.note).not.toContain('chưa bật nghiệp vụ');
  });
});

describe('do phu — thieu vi TAT khac thieu vi CHUA CO', () => {
  it('nguon bi tat va viec chua theo doi duoc di ra o HAI danh sach khac nhau', () => {
    const model = toControlTower(
      view({
        unavailableSources: ['FUEL'],
        pendingWork: [
          { kind: 'RECEIVER_WAITING_ABOVE_THRESHOLD', reason: 'AWAITING_CHECKPOINT_SOURCE' },
        ],
      }),
    );

    expect(model.disabledSourceNotes).toHaveLength(1);
    expect(model.pendingWorkNotes).toHaveLength(1);
    expect(model.disabledSourceNotes[0]).not.toEqual(model.pendingWorkNotes[0]);
  });

  it('du nguon thi khong con ghi chu nao', () => {
    const model = toControlTower(view());

    expect(model.disabledSourceNotes).toEqual([]);
    expect(model.pendingWorkNotes).toEqual([]);
  });
});

describe('tat dinh', () => {
  it('hai lan doc cung du lieu cho ra cung ket qua', () => {
    const source = view({
      queue: [item(), item({ kind: 'MAINTENANCE_DUE_SOON', severity: 'INFO' })],
      queueTotal: 2,
      unavailableSources: ['FUEL', 'EXPENSE_CLAIMS'],
    });

    expect(toControlTower(source)).toEqual(toControlTower(source));
  });
});
