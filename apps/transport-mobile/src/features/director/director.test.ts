import { describe, expect, it } from 'vitest';
import type {
  BoardCard,
  ControlTowerView,
  Driver,
  RunLeg,
  TransportOrder,
  Vehicle,
} from '../office/types';
import { buildVehicleRows, driverRunCodes } from './fleet';
import {
  actionLabelFor,
  buildCloseOut,
  decisionSheetFor,
  documentLabel,
  queueDetailLines,
  queueItemSubline,
} from './inbox';
import { countByStatus, filterOrders, legRows, recentTimeline } from './orders';

const card = (over: Partial<BoardCard>): BoardCard => ({
  runId: 'r1',
  runCode: 'VC-001',
  vehicleId: 'v1',
  businessDate: '2026-09-25',
  driverId: 'd1',
  loadedLegs: 1,
  emptyLegs: 1,
  totalKm: null,
  emptyKm: 12,
  currentLeg: { legId: 'l1', sequence: 2, kind: 'EMPTY', orderCode: null, phase: 'IN_TRANSIT' },
  ...over,
});

const view = (
  columns: Record<string, BoardCard[]>,
): Pick<ControlTowerView, 'board' | 'generatedFor'> => ({
  generatedFor: '2026-09-25',
  board: Object.entries(columns).map(([column, cards]) => ({
    column,
    cards,
    total: cards.length,
    unavailableReason: null,
  })),
});

const vehicles: Vehicle[] = [
  { id: 'v1', registrationPlate: '29C-111.11', vehicleClass: 'Tải 8T', status: 'IDLE' },
  { id: 'v2', registrationPlate: '15C-222.22', vehicleClass: '', status: 'UNDER_MAINTENANCE' },
  { id: 'v3', registrationPlate: '14C-333.33', vehicleClass: 'Tải 5T', status: 'IDLE' },
];
const drivers: Driver[] = [{ id: 'd1', fullName: 'Nguyễn Văn A', phone: '', status: 'ACTIVE' }];

describe('buildVehicleRows', () => {
  it('xe truoc, ghep bien so + ten lai xe, co RONG va km null la gach', () => {
    const rows = buildVehicleRows(view({ IN_TRANSIT: [card({})] }), vehicles, drivers);
    expect(rows[0]?.plate).toBe('29C-111.11');
    const line = rows[0]?.runs[0];
    expect(line?.columnLabel).toBe('Trên đường');
    expect(line?.legLabel).toBe('Chặng 2 · RỖNG · chạy không hàng');
    expect(line?.isEmptyLeg).toBe(true);
    expect(line?.driverName).toBe('Nguyễn Văn A');
    expect(line?.totalKm).toBe('—');
    expect(line?.emptyKm).toBe('12 km');
  });

  it('bo the "đã giao" cua ngay khac, giu the hom nay', () => {
    const rows = buildVehicleRows(
      view({
        DELIVERED: [
          card({ runId: 'old', runCode: 'VC-OLD', businessDate: '2026-09-01' }),
          card({ runId: 'new', runCode: 'VC-NEW', vehicleId: 'v3' }),
        ],
      }),
      vehicles,
      drivers,
    );
    const codes = rows.flatMap((row) => row.runs.map((run) => run.runCode));
    expect(codes).toEqual(['VC-NEW']);
  });

  it('xe dang lam viec len truoc, ke hoach sau, xe trong cuoi; bien so la khong bia', () => {
    const rows = buildVehicleRows(
      view({
        PLANNED: [card({ runId: 'p', runCode: 'VC-P', vehicleId: 'v3' })],
        LOADING: [card({ runId: 'x', runCode: 'VC-X', vehicleId: 'ghost', driverId: 'unknown' })],
      }),
      vehicles,
      drivers,
    );
    expect(rows.map((row) => row.vehicleId)).toEqual(['ghost', 'v3', 'v2', 'v1']);
    expect(rows[0]?.plate).toBe('Xe chưa đọc được biển số');
    expect(rows[0]?.runs[0]?.driverName).toBe('Lái xe chưa đọc được tên');
    expect(rows.find((row) => row.vehicleId === 'v2')?.isUnderMaintenance).toBe(true);
  });

  it('lai xe tren bang -> ma vong chay', () => {
    const map = driverRunCodes(view({ PICKUP: [card({})], DELIVERED: [card({ runId: 'z' })] }));
    expect(map.get('d1')).toEqual(['VC-001']);
  });
});

describe('hop thu', () => {
  it('ma -> to truot; ma la chi doc', () => {
    expect(decisionSheetFor('EXPENSE_CLAIM_AWAITING_REVIEW')).toBe('CLAIM');
    expect(decisionSheetFor('RUN_ACTIVE_WITHOUT_DRIVER')).toBe('ASSIGN_DRIVER');
    expect(decisionSheetFor('DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL')).toBe('ALLOWANCE');
    expect(decisionSheetFor('FUEL_ENTRY_AWAITING_VERIFICATION')).toBe('READ_ONLY');
    expect(decisionSheetFor('NEW_KIND')).toBe('READ_ONLY');
    expect(actionLabelFor('NEW_KIND')).toBe('Xem chi tiết');
  });

  it('chi tiet chi hien khoa da biet, khong lo id ky thuat', () => {
    const lines = queueDetailLines({
      kind: 'RUN_LEG_MISSING_DISTANCE',
      severity: 'WARNING',
      subject: { kind: 'RUN_LEG', id: 'leg-cuid', reference: 'VC-9' },
      detail: { sequence: 2, legKind: 'EMPTY', runId: 'run-cuid', driverId: 'x', mystery: 5 },
    });
    expect(lines.map((line) => `${line.label}=${line.value}`)).toEqual([
      'Chặng số=2',
      'Loại chặng=RỖNG',
    ]);
  });

  it('dong phu dung ma nghiep vu + so luong, khong dung id', () => {
    expect(
      queueItemSubline({
        kind: 'DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL',
        severity: 'WARNING',
        subject: { kind: 'RUN', id: 'pending-waiting-allowances', reference: null },
        detail: { count: 3 },
      }),
    ).toBe('3 khoản');
  });
});

describe('ket thuc don', () => {
  it('co chung tu -> DOCUMENT, khong can cau van', () => {
    const result = buildCloseOut({
      outcome: 'APPROVED',
      evidence: ['doc1'],
      note: '',
      supersedesId: 'dec-1',
      idempotencyKey: 'm-close-12345678',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        outcome: 'APPROVED',
        reasonCode: 'DOCUMENT_RECEIVED',
        basis: 'DOCUMENT',
        evidenceRefs: ['doc1'],
        externalNote: null,
        supersedesId: 'dec-1',
        idempotencyKey: 'm-close-12345678',
      },
    });
  });

  it('khong chung tu thi bat buoc can cu', () => {
    const base = {
      outcome: 'NEEDS_CORRECTION' as const,
      evidence: [],
      supersedesId: null,
      idempotencyKey: 'k-12345678',
    };
    expect(buildCloseOut({ ...base, note: '  ' }).ok).toBe(false);
    const ok = buildCloseOut({ ...base, note: 'Bên nhận ký bản giấy' });
    expect(ok.ok && ok.value.basis).toBe('EXTERNAL_PHYSICAL_CONFIRMATION');
    expect(ok.ok && ok.value.reasonCode).toBe('DOCUMENT_INCOMPLETE');
  });

  it('nhan chung tu', () => {
    expect(
      documentLabel({
        id: 'd',
        type: 'DELIVERY_RECEIPT',
        basis: 'EXTERNAL_PHYSICAL',
        fileId: null,
        label: null,
        status: 'ACTIVE',
        receivedAt: '2026-09-25T00:00:00Z',
      }),
    ).toBe('Biên bản giao hàng · bản giấy');
  });
});

const order = (over: Partial<TransportOrder>): TransportOrder => ({
  id: 'o1',
  code: 'DH-001',
  status: 'OPEN',
  businessDate: '2026-09-25',
  customerId: 'c1',
  originLabel: 'Cảng Đình Vũ',
  destinationLabel: 'KCN Quế Võ',
  cargoDescription: null,
  freightAmount: null,
  currencyCode: 'VND',
  note: null,
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

describe('don hang', () => {
  const orders = [
    order({}),
    order({ id: 'o2', code: 'DH-002', status: 'FULFILLED', customerId: 'c2' }),
    order({ id: 'o3', code: 'DH-003', status: 'CANCELLED', originLabel: 'Hà Nội' }),
  ];
  const nameOf = (id: string | null) => (id === 'c2' ? 'Công ty Bình Minh' : 'Khách lẻ');

  it('loc trang thai + tim khong dau tren ma, ten khach, dau tuyen', () => {
    expect(filterOrders(orders, { status: 'ALL', search: 'dinh vu' }, nameOf)).toHaveLength(2);
    expect(filterOrders(orders, { status: 'OPEN', search: '' }, nameOf).map((o) => o.code)).toEqual(
      ['DH-001'],
    );
    expect(filterOrders(orders, { status: 'ALL', search: 'binh minh' }, nameOf)[0]?.code).toBe(
      'DH-002',
    );
  });

  it('dem cho chip loc', () => {
    expect(countByStatus(orders)).toEqual({ ALL: 3, OPEN: 1, FULFILLED: 1, CANCELLED: 1 });
  });

  it('chang: thu tu, RONG, km null la gach, IN_TRANSIT la "Trên đường"', () => {
    const legs: RunLeg[] = [
      {
        id: 'b',
        runId: 'r',
        sequence: 2,
        kind: 'EMPTY',
        status: 'IN_TRANSIT',
        orderId: null,
        originLabel: 'A',
        destinationLabel: 'B',
        businessDate: '2026-09-25',
        distanceKm: null,
        plannedDistanceKm: 40,
      },
      {
        id: 'a',
        runId: 'r',
        sequence: 1,
        kind: 'LOADED',
        status: 'COMPLETED',
        orderId: 'o1',
        originLabel: 'X',
        destinationLabel: 'A',
        businessDate: '2026-09-25',
        distanceKm: 55.5,
        plannedDistanceKm: null,
      },
    ];
    const rows = legRows(legs);
    expect(rows.map((row) => row.title)).toEqual(['Chặng 1 · CÓ HÀNG', 'Chặng 2 · RỖNG']);
    expect(rows[1]?.status).toBe('Trên đường');
    expect(rows[1]?.km).toBe('—');
    expect(rows[0]?.plannedKm).toBe('—');
  });

  it('dong thoi gian: moi nhat truoc, noi trung tinh khi thieu vi tri', () => {
    const rows = recentTimeline(
      {
        timeline: [
          {
            kind: 'CHECKPOINT',
            code: 'DEPARTED',
            at: '2026-09-25T01:00:00Z',
            legId: null,
            hasLocationProof: true,
            subjectId: 's1',
          },
          {
            kind: 'CHECKPOINT',
            code: 'DELIVERY_ARRIVAL',
            at: '2026-09-25T03:00:00Z',
            legId: null,
            hasLocationProof: false,
            subjectId: 's2',
          },
          {
            kind: 'FUEL',
            code: 'FUEL_ENTRY',
            at: '2026-09-25T02:00:00Z',
            legId: null,
            hasLocationProof: false,
            subjectId: 's3',
          },
        ],
      },
      'Asia/Ho_Chi_Minh',
    );
    expect(rows.map((row) => row.label)).toEqual(['Đến nơi giao', 'Đổ dầu', 'Xuất phát']);
    expect(rows[0]?.at).toBe('10:00 25/09');
    expect(rows[0]?.proof).toBe('không kèm bằng chứng vị trí');
  });
});
