import { describe, expect, it } from 'vitest';
import { ApiError, classifyHttpError } from '../../api/errors';
import { buildQueue, cardModel, chipCount, queueCounts } from '../accounting/queue';
import { actionLabelFor, decisionSheetFor, queueItemSubline } from '../director/inbox';
import { composeHeadline, queueKindLabel, unavailableSourceNotes } from './control-tower';
import { officeReasonText } from './reasons';
import {
  commandOutcomeText,
  driverOrderCard,
  exceptionCaption,
  exceptionConsequence,
  exceptionOutcomeText,
  exceptionReasonReady,
  filterKnownPlaces,
  isNotDriverDirect,
  locationLine,
  missingLine,
  orderSourceLines,
  READINESS_REASON_LABEL,
  READY_TO_COMPLETE_TEXT,
  reviewActions,
  siteIntakeQueueNote,
} from './site-intake-review';
import type {
  DriverOrderActivityView,
  QueueItem,
  SiteIntakeCommercialOutcome,
  SiteIntakeReviewView,
} from './types';

const queueItem = (reasons: string): QueueItem => ({
  kind: 'SITE_INTAKE_NEEDS_REVIEW',
  severity: 'WARNING',
  subject: { kind: 'SITE_INTAKE', id: 'i1', reference: 'RUN-A260926-ABCDEF12' },
  detail: { runId: 'r1', driverId: 'd1', vehicleId: 'v1', siteName: 'Kho số 2', reasons },
});

const review = (over: Partial<SiteIntakeReviewView> = {}): SiteIntakeReviewView => ({
  intakeId: 'i1',
  status: 'PENDING',
  confirmedAt: '2026-09-26T01:05:00Z',
  businessDate: '2026-09-26',
  driver: { id: 'd1', name: 'Nguyễn Văn A' },
  vehicle: { id: 'v1', plate: '29C-111.11' },
  run: { id: 'r1', code: 'RUN-1', status: 'PLANNED' },
  leg: { id: 'l1', status: 'PLANNED' },
  origin: {
    siteId: 's1',
    label: 'Công ty A — Kho số 2',
    siteName: 'Kho số 2',
    counterpartyName: 'Công ty A',
    address: null,
    active: true,
  },
  location: { trust: 'DRIVER_REPORTED', siteMatch: 'UNIQUE_INSIDE', distanceMetres: 42 },
  destination: null,
  originAttestedAt: null,
  readiness: { kind: 'NEEDS_REVIEW', reasons: ['DESTINATION_MISSING'], rejectedReason: null },
  order: null,
  exception: null,
  movementStarted: false,
  actions: {
    canSetDestination: true,
    canAttestOrigin: false,
    canBindExistingOrder: true,
    canReportException: true,
  },
  ...over,
});

const activity: DriverOrderActivityView = {
  intakeId: 'i1',
  orderId: 'o1',
  orderCode: 'DH-A260926-1A2B3C4D',
  orderStatus: 'OPEN',
  bindingMode: 'AUTO_CREATED',
  boundAt: '2026-09-26T01:10:00Z',
  confirmedAt: '2026-09-26T01:05:00Z',
  driverName: 'Nguyễn Văn A',
  vehiclePlate: '29C-111.11',
  originLabel: 'Kho số 2',
  destinationLabel: 'Kho Đình Vũ',
  exceptionOutcome: null,
};

describe('Can xu ly — viec tai xe nhan truc tiep chua du', () => {
  it('nhan hang viec + nguon + to truot rieng', () => {
    expect(queueKindLabel('SITE_INTAKE_NEEDS_REVIEW')).toBe(
      'Việc tài xế nhận trực tiếp chưa đủ thông tin',
    );
    expect(unavailableSourceNotes(['SITE_INTAKE'])[0]).toMatch(/^Việc tài xế nhận trực tiếp:/);
    expect(decisionSheetFor('SITE_INTAKE_NEEDS_REVIEW')).toBe('SITE_INTAKE');
    expect(actionLabelFor('SITE_INTAKE_NEEDS_REVIEW')).toBe('Bổ sung hoặc báo bất thường');
    expect(queueItemSubline(queueItem('DESTINATION_MISSING'))).toBe(
      'Kho số 2 · RUN-A260926-ABCDEF12',
    );
  });

  it('"Thiếu: …" tu ma may chu; rong = du dieu kien; muc khac khong co dong nay', () => {
    expect(siteIntakeQueueNote(queueItem('DESTINATION_MISSING'))).toBe('Thiếu: điểm giao');
    expect(siteIntakeQueueNote(queueItem('ORIGIN_LOCATION_UNVERIFIED,SITE_MATCH_AMBIGUOUS'))).toBe(
      'Thiếu: vị trí nơi lấy hàng chưa đối chiếu, nơi lấy hàng chưa chắc',
    );
    expect(siteIntakeQueueNote(queueItem(''))).toBe(READY_TO_COMPLETE_TEXT);
    expect(READY_TO_COMPLETE_TEXT).toBe('Đủ điều kiện — bấm Hoàn thiện để tạo đơn');
    expect(siteIntakeQueueNote({ ...queueItem('X'), kind: 'FUEL_RECONCILIATION_OPEN' })).toBeNull();
    expect(missingLine(['MA_MOI'])).toBe('Thiếu: MA_MOI');
  });

  it('MOI ma ly do cua `commercial-readiness.ts` deu co nhan', () => {
    const codes = [
      'DESTINATION_MISSING',
      'DESTINATION_SAME_AS_ORIGIN',
      'ORIGIN_LOCATION_UNVERIFIED',
      'SITE_MATCH_AMBIGUOUS',
      'ORIGIN_POINT_UNKNOWN',
      'ORIGIN_POINT_AMBIGUOUS',
      'SITE_INACTIVE',
      'DRIVER_INACTIVE',
      'DRIVER_BINDING_CHANGED',
      'VEHICLE_BINDING_CHANGED',
      'LEG_COMPLETED',
      'LEG_ORDER_CONFLICT',
      'RUN_PLAN_CONFLICT',
    ];
    expect(Object.keys(READINESS_REASON_LABEL).sort()).toEqual([...codes].sort());
  });

  it('viec tai xe nhan KHONG lam doi cau mo dau: cau do chi dem `queueTotal` cua may chu', () => {
    const fleet = {
      total: 6,
      idle: 2,
      onTrip: 4,
      underMaintenance: 0,
      activeDrivers: 5,
      runningRuns: 4,
    };
    expect(composeHeadline({ queueTotal: 0, fleet })).toBe(
      'Không có việc cần quyết · 4/6 xe đang chạy',
    );
  });
});

describe('to truot — nut theo `actions` cua may chu VA quyen', () => {
  const all = () => true;
  it('giam doc: bo sung + gan don + bao bat thuong; khong co "Hoàn thiện" khi con thieu', () => {
    expect(reviewActions(review(), all)).toEqual({
      setDestination: true,
      attestOrigin: false,
      bindOrder: true,
      complete: false,
      reportException: true,
    });
  });

  it('ke toan (khong co quyen bao bat thuong) KHONG thay nut Hủy', () => {
    const accounting = (action: string) => action !== 'transport.site_intake.exception';
    expect(reviewActions(review(), accounting).reportException).toBe(false);
    expect(reviewActions(review(), accounting).setDestination).toBe(true);
  });

  it('du dieu kien -> "Hoàn thiện"; may chu tat mot viec thi nut tat theo', () => {
    const ready = review({
      readiness: { kind: 'READY_TO_AUTO_CREATE', reasons: [], rejectedReason: null },
      actions: {
        canSetDestination: false,
        canAttestOrigin: false,
        canBindExistingOrder: false,
        canReportException: false,
      },
    });
    expect(reviewActions(ready, all)).toEqual({
      setDestination: false,
      attestOrigin: false,
      bindOrder: false,
      complete: true,
      reportException: false,
    });
    expect(reviewActions(ready, () => false).complete).toBe(false);
  });

  it('ly do bao bat thuong BAT BUOC, it nhat 3 ky tu that', () => {
    expect(exceptionReasonReady('')).toBe(false);
    expect(exceptionReasonReady('  ab  ')).toBe(false);
    expect(exceptionReasonReady('abc')).toBe(true);
  });

  it('bao truoc hau qua theo su that may chu tra', () => {
    expect(exceptionConsequence({ order: null, movementStarted: false })).toMatch(
      /^Xe chưa lăn bánh/,
    );
    expect(exceptionConsequence({ order: { status: 'OPEN' }, movementStarted: true })).toMatch(
      /giữ nguyên/,
    );
    expect(exceptionConsequence({ order: { status: 'FULFILLED' }, movementStarted: true })).toMatch(
      /trạng thái cuối/,
    );
  });

  it('vi tri doc duoc bang chu; dia diem loc khong dau', () => {
    expect(locationLine(review().location)).toBe(
      'Vị trí do máy lái xe báo · một địa điểm, nằm trong hàng rào · cách 42 m',
    );
    expect(locationLine({ trust: 'SERVER_BOUND', siteMatch: null })).toBe(
      'Vị trí đã xác thực · chưa rõ cách khớp địa điểm',
    );
    const places = [
      {
        id: 'p1',
        kind: 'CUSTOMER',
        name: 'Kho Đình Vũ',
        detail: null,
        point: { latitude: 1, longitude: 1 },
        radiusMetres: 1,
      },
      {
        id: 'p2',
        kind: 'DEPOT',
        name: 'Bãi xe',
        detail: null,
        point: { latitude: 1, longitude: 1 },
        radiusMetres: 1,
      },
    ];
    expect(filterKnownPlaces(places, 'dinh vu').map((place) => place.id)).toEqual(['p1']);
  });
});

describe('ket cuc — noi DUNG cau may chu tra', () => {
  it('bao bat thuong: moi ket cuc mot cau, dung chu da duyet', () => {
    expect(exceptionOutcomeText({ outcome: 'ORDER_CANCELLED_WORK_CANCELLED' })).toBe(
      'Đã hủy đơn. Xe chưa chạy nên chuyến cũng đã hủy — không xoá dữ liệu nào.',
    );
    expect(exceptionOutcomeText({ outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED' })).toBe(
      'Đã hủy đơn. Xe đã chạy nên hoạt động vận hành (vòng chạy, mốc, GPS) được giữ nguyên.',
    );
    expect(exceptionOutcomeText({ outcome: 'ANOMALY_RECORDED_ORDER_TERMINAL' })).toBe(
      'Đơn đã ở trạng thái cuối — không hủy được; đã ghi nhận bất thường.',
    );
    expect(exceptionOutcomeText({ outcome: 'INTAKE_REJECTED_WORK_CANCELLED' })).toMatch(
      /Xe chưa chạy/,
    );
    expect(exceptionOutcomeText({ outcome: 'INTAKE_REJECTED_OPERATION_PRESERVED' })).toMatch(
      /Xe đã chạy/,
    );
    expect(
      exceptionOutcomeText({ outcome: 'ORDER_CANCELLED_WORK_CANCELLED', replayed: true }),
    ).toMatch(/Lệnh gửi lại/);
  });

  it('hoan thien / gan don', () => {
    const base: SiteIntakeCommercialOutcome = {
      intakeId: 'i1',
      status: 'ORDER_BOUND',
      readiness: { kind: 'ALREADY_BOUND', orderId: 'o1' },
      orderId: 'o1',
      orderCode: 'DH-1',
      bindingMode: 'OFFICE_COMPLETED',
      bound: true,
      replayed: false,
    };
    expect(commandOutcomeText(base)).toBe('Đã tạo đơn DH-1');
    expect(commandOutcomeText({ ...base, bindingMode: 'OFFICE_EXISTING_ORDER' })).toBe(
      'Đã gắn vào đơn DH-1',
    );
    expect(
      commandOutcomeText({
        ...base,
        status: 'PENDING',
        orderId: null,
        orderCode: null,
        bindingMode: null,
        bound: false,
        readiness: { kind: 'NEEDS_REVIEW', reasons: ['SITE_MATCH_AMBIGUOUS'] },
      }),
    ).toBe('Đã ghi. Thiếu: nơi lấy hàng chưa chắc');
  });

  it('ma tu choi cua van phong duoc dich', () => {
    for (const reason of [
      'SITE_INTAKE_COMMERCIAL_CLOSED',
      'SITE_INTAKE_ORDER_NOT_OPEN',
      'SITE_INTAKE_BINDING_DENIED',
      'SITE_INTAKE_EXCEPTION_ALREADY_RECORDED',
      'SITE_INTAKE_NOT_READY',
    ]) {
      expect(officeReasonText(reason)).not.toMatch(/Máy chủ từ chối/);
    }
  });
});

describe('Hom nay — "Đơn mới từ tài xế" la TIN TUC', () => {
  it('the: ai · xe, tuyen, gio theo mui gio khach, ma don, testID theo ma don', () => {
    expect(driverOrderCard(activity, 'Asia/Ho_Chi_Minh')).toEqual({
      key: 'i1',
      testID: 'director-driver-order-DH-A260926-1A2B3C4D',
      overline: 'ĐƠN MỚI TỪ TÀI XẾ',
      who: 'Nguyễn Văn A · 29C-111.11',
      route: 'Kho số 2 → Kho Đình Vũ',
      when: 'Tạo đơn lúc 08:10 26/09',
      orderCode: 'DH-A260926-1A2B3C4D',
      orderId: 'o1',
      exceptionNote: null,
    });
    expect(
      driverOrderCard(
        { ...activity, exceptionOutcome: 'ORDER_CANCELLED_OPERATION_PRESERVED' },
        'UTC',
      ).exceptionNote,
    ).toBe('Đơn này đã bị hủy sau đó (báo bất thường).');
    expect(exceptionCaption('ANOMALY_RECORDED_ORDER_TERMINAL')).toMatch(/bất thường/);
  });

  it('chi tiet don: dong nguon; 404 = khong phai don tu tai xe (khong ve gi)', () => {
    const lines = orderSourceLines(
      {
        ...activity,
        locationTrust: 'SERVER_BOUND',
        siteMatch: 'CHOSEN_AMONG_SEVERAL',
        movementStarted: false,
        exception: null,
        canReportException: true,
      },
      'Asia/Ho_Chi_Minh',
    );
    expect(lines.map((line) => line.label)).toEqual([
      'Lái xe',
      'Xe',
      'Lấy hàng',
      'Giao hàng',
      'Tài xế xác nhận lúc',
      'Vị trí lúc xác nhận',
    ]);
    expect(
      isNotDriverDirect(classifyHttpError(404, { reason: 'SITE_INTAKE_ORDER_SOURCE_NOT_FOUND' })),
    ).toBe(true);
    expect(isNotDriverDirect(classifyHttpError(404, null))).toBe(true);
    expect(isNotDriverDirect(new ApiError('SERVER', 'x', 500))).toBe(false);
  });
});

describe('Can duyet (ke toan) — cung ban ghi, nguon thu tu', () => {
  it('them nguon INTAKE, khong tien, dong "Thiếu:"', () => {
    const sources = { claims: [], intakes: [review()] };
    const queue = buildQueue(sources);
    expect(queue.map((entry) => `${entry.type}:${entry.id}`)).toEqual(['INTAKE:i1']);
    const model = cardModel(queue[0]!, () => 'x');
    expect(model).toEqual({
      typeLabel: 'Việc tài xế nhận trực tiếp',
      title: 'Nguyễn Văn A',
      amount: null,
      subline: '29C-111.11 · Công ty A — Kho số 2',
      warnings: ['Thiếu: điểm giao'],
    });
    const counts = queueCounts(sources);
    expect(chipCount(counts.INTAKE)).toBe('1');
    expect(counts.ALL.total).toBe(1);
    expect(chipCount(queueCounts({ claims: [] }).INTAKE)).toBeNull();
  });
});
