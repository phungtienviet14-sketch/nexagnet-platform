import { describe, expect, it } from 'vitest';
import { legAcceptsNewCheckpoints } from '../checkpoint/checkpoint-lifecycle.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import type { RunLegStatus } from '../movement/movement.types.js';
import {
  deliveryAlreadyAccepted,
  evaluateWaitingClose,
  evaluateWaitingStart,
  legAcceptsNewWaiting,
} from './waiting-lifecycle.js';
import { elapsedSecondsOf, type DeliveryWaitingSession } from './waiting.types.js';

/**
 * WT-010 — luat cua phien cho, do o tang HAM THUAN.
 *
 * Do o day chu khong chi qua HTTP: mot bai di qua controller cung xanh, nhung no do CA duong day
 * va khong chi ra duoc luat nao da hong khi no do.
 */

const ARRIVED: readonly RunCheckpointType[] = [
  'PICKUP_ARRIVAL',
  'PICKUP_DEPARTURE',
  'DELIVERY_ARRIVAL',
];

const startInput = (over: Partial<Parameters<typeof evaluateWaitingStart>[0]> = {}) => ({
  runTerminal: false,
  legStatus: 'IN_TRANSIT' as RunLegStatus,
  legCheckpointTypes: ARRIVED,
  hasOpenSession: false,
  ...over,
});

describe('Mo mot phien cho — WT-010', () => {
  it('mo duoc khi chang da co moc den noi giao', () => {
    expect(evaluateWaitingStart(startInput())).toEqual({
      allowed: true,
      reason: 'WAITING_STARTED',
    });
  });

  /**
   * Neo la `DELIVERY_ARRIVAL`. Khong co no thi khong co gi chung minh xe da o do — va mot khoang
   * cho khong co dia diem se di thang vao con so ma nguoi duyet phu cap doc.
   */
  it('khong mo duoc khi chua ghi moc den noi giao', () => {
    const decision = evaluateWaitingStart(
      startInput({ legCheckpointTypes: ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE'] }),
    );
    expect(decision).toEqual({ allowed: false, reason: 'WAITING_ARRIVAL_NOT_FOUND' });
  });

  it('khong mo duoc sau khi nguoi nhan da nhan hang', () => {
    const decision = evaluateWaitingStart(
      startInput({ legCheckpointTypes: [...ARRIVED, 'DELIVERY_ACCEPTED'] }),
    );
    expect(decision).toEqual({ allowed: false, reason: 'WAITING_DELIVERY_ALREADY_ACCEPTED' });
  });

  /** `#279` O13 bai 5 — hai lan bam dong thoi khong duoc thanh hai phien. */
  it('khong mo duoc phien thu hai khi chang dang co mot phien mo', () => {
    const decision = evaluateWaitingStart(startInput({ hasOpenSession: true }));
    expect(decision).toEqual({ allowed: false, reason: 'WAITING_ALREADY_OPEN' });
  });

  it('khong mo duoc tren mot vong chay da ket thuc', () => {
    const decision = evaluateWaitingStart(startInput({ runTerminal: true }));
    expect(decision).toEqual({ allowed: false, reason: 'WAITING_RUN_TERMINAL' });
  });

  /**
   * THU TU KIEM la mot phan cua hop dong. Mot yeu cau vua sai vong chay vua trung phien phai bao
   * loi vong chay: do la cai nguoi goi phai sua truoc. Doi thu tu se cho ra mot ma DUNG VE KET QUA
   * nhung SAI VE NGUYEN NHAN.
   */
  it('bao vong chay da ket thuc truoc, khong bao trung phien', () => {
    const decision = evaluateWaitingStart(
      startInput({ runTerminal: true, hasOpenSession: true, legCheckpointTypes: [] }),
    );
    expect(decision.reason).toBe('WAITING_RUN_TERMINAL');
  });

  it('bao da nhan hang truoc, khong bao trung phien', () => {
    const decision = evaluateWaitingStart(
      startInput({ hasOpenSession: true, legCheckpointTypes: [...ARRIVED, 'DELIVERY_ACCEPTED'] }),
    );
    expect(decision.reason).toBe('WAITING_DELIVERY_ALREADY_ACCEPTED');
  });
});

/**
 * CHANG DA KET THUC — `#358`.
 *
 * Hinh dang runtime: chang CO HANG da co `DELIVERY_ARRIVAL`, chua co `DELIVERY_ACCEPTED`, van phong
 * hoan tat chang bang ghi de `#350`, vong chay van `ACTIVE`. Truoc `#358` ham nay chi doc trang thai
 * VONG CHAY, nen no cho mo phien — va phien do giu vong chay mai o `OPEN_WAITING_SESSION`.
 */
describe('Chang da ket thuc khong mo phien cho moi — #358', () => {
  it('chang COMPLETED hay CANCELLED: WAITING_LEG_TERMINAL, du lan den noi da co', () => {
    for (const legStatus of ['COMPLETED', 'CANCELLED'] as const) {
      expect(evaluateWaitingStart(startInput({ legStatus }))).toEqual({
        allowed: false,
        reason: 'WAITING_LEG_TERMINAL',
      });
    }
  });

  it('chang PLANNED hay IN_TRANSIT: giu nguyen luat cu', () => {
    for (const legStatus of ['PLANNED', 'IN_TRANSIT'] as const) {
      expect(evaluateWaitingStart(startInput({ legStatus }))).toEqual({
        allowed: true,
        reason: 'WAITING_STARTED',
      });
    }
  });

  it('vong chay o diem cuoi dung truoc chang: WAITING_RUN_TERMINAL giu nguyen', () => {
    const decision = evaluateWaitingStart(
      startInput({ runTerminal: true, legStatus: 'COMPLETED' }),
    );
    expect(decision.reason).toBe('WAITING_RUN_TERMINAL');
  });

  /**
   * THU TU: "chang nay da xong" la cau tra loi dung cho moi lenh mo con lai — cung quy uoc voi
   * `CHECKPOINT_LEG_TERMINAL` (`#354`). Bao `Phai bam Da den noi` tren mot chang da huy se day lai xe
   * di ghi mot moc ma chinh `#354` se tu choi.
   */
  it('chang da ket thuc dung truoc lan den noi, da nhan hang va trung phien', () => {
    const noArrival = evaluateWaitingStart(
      startInput({ legStatus: 'CANCELLED', legCheckpointTypes: [] }),
    );
    const accepted = evaluateWaitingStart(
      startInput({ legStatus: 'COMPLETED', legCheckpointTypes: [...ARRIVED, 'DELIVERY_ACCEPTED'] }),
    );
    const open = evaluateWaitingStart(startInput({ legStatus: 'COMPLETED', hasOpenSession: true }));
    expect([noArrival.reason, accepted.reason, open.reason]).toEqual([
      'WAITING_LEG_TERMINAL',
      'WAITING_LEG_TERMINAL',
      'WAITING_LEG_TERMINAL',
    ]);
  });

  /**
   * MOT LUAT, KHONG HAI: phien cho chi dong binh thuong bang moc `DELIVERY_ACCEPTED`, va tu `#354`
   * chang da ket thuc khong nhan moc moi. Hai ham lech nhau o bat ky trang thai nao la mot phien mo
   * duoc ma khong bao gio dong duoc — hoac mot nut bam vao thi bao loi.
   */
  it('luat cua phien cho LA luat cua moc dong no, tren ca bon trang thai chang', () => {
    for (const status of ['PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const) {
      expect({ status, waiting: legAcceptsNewWaiting(status) }).toEqual({
        status,
        waiting: legAcceptsNewCheckpoints(status),
      });
    }
    expect(legAcceptsNewWaiting('COMPLETED')).toBe(false);
    expect(legAcceptsNewWaiting('CANCELLED')).toBe(false);
  });
});

/**
 * KHACH DA NHAN HANG — `#363`.
 *
 * `deliveryAlreadyAccepted` la cau hoi CHUNG cua phep kiem som (`evaluateWaitingStart`) va cong duoi
 * khoa (`WaitingSessionService`). Hai ben lech nhau o mot chuoi moc nao do la mot lenh mo bi chan
 * som nhung lot qua duoi khoa — dung cai cua so `#363` dong lai — hoac nguoc lai.
 */
describe('Khach da nhan hang thi khong mo phien cho moi — #363', () => {
  it('co khi va chi khi chuoi moc cua chang co DELIVERY_ACCEPTED', () => {
    expect(deliveryAlreadyAccepted([])).toBe(false);
    expect(deliveryAlreadyAccepted(ARRIVED)).toBe(false);
    expect(deliveryAlreadyAccepted([...ARRIVED, 'DELIVERY_ACCEPTED'])).toBe(true);
    // Mot tap su that, khong phai mot chuoi co thu tu.
    expect(deliveryAlreadyAccepted(['DELIVERY_ACCEPTED', ...ARRIVED])).toBe(true);
  });

  it('phep kiem som hoi DUNG cau do: cung chuoi moc, cung ket luan', () => {
    for (const legCheckpointTypes of [ARRIVED, [...ARRIVED, 'DELIVERY_ACCEPTED'] as const]) {
      const decision = evaluateWaitingStart(startInput({ legCheckpointTypes }));
      expect({
        types: legCheckpointTypes,
        refused: decision.reason === 'WAITING_DELIVERY_ALREADY_ACCEPTED',
      }).toEqual({
        types: legCheckpointTypes,
        refused: deliveryAlreadyAccepted(legCheckpointTypes),
      });
    }
  });
});

describe('Dong mot phien cho — WT-010', () => {
  const startedAt = new Date('2026-09-09T02:00:00.000Z');

  it('dong duoc bang lan nhan hang cua nguoi nhan', () => {
    const decision = evaluateWaitingClose({
      status: 'OPEN',
      startedAt,
      endedAt: new Date('2026-09-09T05:30:00.000Z'),
      by: 'ACCEPTANCE',
    });
    expect(decision).toEqual({ allowed: true, reason: 'WAITING_CLOSED_BY_ACCEPTANCE' });
  });

  it('van hanh dong mot phien bo quen bang mot ma RIENG', () => {
    const decision = evaluateWaitingClose({
      status: 'OPEN',
      startedAt,
      endedAt: new Date('2026-09-10T05:30:00.000Z'),
      by: 'OPERATOR',
    });
    expect(decision).toEqual({ allowed: true, reason: 'WAITING_CLOSED_BY_OPERATOR' });
  });

  /**
   * `#279` O13 bai 4. Mot khoang am se di thang vao con so phu cap, nen no bi tu choi thay vi bi
   * lam tron ve khong — lam tron se giau mat mot dong ho may chu dang chay sai.
   */
  it('tu choi khi gio dong nam truoc gio mo', () => {
    const decision = evaluateWaitingClose({
      status: 'OPEN',
      startedAt,
      endedAt: new Date('2026-09-09T01:59:59.000Z'),
      by: 'ACCEPTANCE',
    });
    expect(decision).toEqual({ allowed: false, reason: 'WAITING_END_BEFORE_START' });
  });

  it('dong bang dung gio mo thi hop le — mot khoang khong giay van la mot khoang', () => {
    const decision = evaluateWaitingClose({
      status: 'OPEN',
      startedAt,
      endedAt: startedAt,
      by: 'ACCEPTANCE',
    });
    expect(decision.allowed).toBe(true);
  });

  it('khong dong duoc mot phien da dong', () => {
    const decision = evaluateWaitingClose({
      status: 'CLOSED',
      startedAt,
      endedAt: new Date('2026-09-09T05:30:00.000Z'),
      by: 'ACCEPTANCE',
    });
    expect(decision).toEqual({ allowed: false, reason: 'WAITING_ALREADY_CLOSED' });
  });

  /**
   * `CLOSED` duoc kiem TRUOC `WAITING_END_BEFORE_START`: mot lenh dong lan hai voi gio sai phai
   * duoc bao la "da dong roi", vi do la ly do thuc su khien lenh khong co tac dung.
   */
  it('bao da dong truoc, khong bao khoang am', () => {
    const decision = evaluateWaitingClose({
      status: 'CLOSED',
      startedAt,
      endedAt: new Date('2026-09-09T01:00:00.000Z'),
      by: 'ACCEPTANCE',
    });
    expect(decision.reason).toBe('WAITING_ALREADY_CLOSED');
  });
});

describe('Thoi luong da cho la mot PHEP TRU, khong mot cot — WT-010', () => {
  const base: DeliveryWaitingSession = {
    id: 'w1',
    runId: 'r1',
    legId: 'l1',
    driverId: 'd1',
    arrivalCheckpointId: 'c1',
    closingCheckpointId: null,
    status: 'OPEN',
    reason: 'RECEIVER_NOT_READY',
    closeReason: null,
    startedAt: new Date('2026-09-09T02:00:00.000Z'),
    endedAt: null,
    startedBy: 'u1',
    endedBy: null,
    startClientEventId: 'e1',
    note: null,
    closeNote: null,
    businessDate: '2026-09-09',
    createdAt: new Date('2026-09-09T02:00:00.000Z'),
  };

  it('phien con mo do den BAY GIO cua may chu', () => {
    const now = new Date('2026-09-09T05:30:00.000Z');
    expect(elapsedSecondsOf(base, now)).toBe(3 * 3600 + 30 * 60);
  });

  it('phien da dong do den gio dong, khong den bay gio', () => {
    const closed: DeliveryWaitingSession = {
      ...base,
      status: 'CLOSED',
      endedAt: new Date('2026-09-09T03:00:00.000Z'),
    };
    // `now` di xa hon gio dong mot ngay — thoi luong KHONG duoc chay theo.
    expect(elapsedSecondsOf(closed, new Date('2026-09-10T03:00:00.000Z'))).toBe(3600);
  });

  /**
   * `#279` O5: *"client time cannot shorten/extend authoritative duration"*.
   *
   * Bai nay do dieu do o dung cho no duoc quyet: kieu `DeliveryWaitingSession` KHONG CO mot truong
   * nao mang gio may khach, nen khong co gi de mot may khach dat vao ma phep tru doc phai.
   */
  it('khong truong nao cua phien mang gio may khach', () => {
    expect(Object.keys(base)).not.toContain('capturedAt');
    expect(Object.keys(base)).not.toContain('clientStartedAt');
    expect(Object.keys(base)).not.toContain('durationSeconds');
  });

  it('khong bao gio tra ve so am, ke ca khi dong ho bi keo lui', () => {
    expect(elapsedSecondsOf(base, new Date('2026-09-09T01:00:00.000Z'))).toBe(0);
  });
});
