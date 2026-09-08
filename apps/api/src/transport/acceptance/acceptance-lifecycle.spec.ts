import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, type OrderStatus } from '../movement/movement.types.js';
import {
  evaluateAcceptanceDecision,
  isOrderCompletable,
  isSettlementEligible,
  stateAfter,
  type AcceptanceEvaluation,
} from './acceptance-lifecycle.js';
import {
  COMMERCIAL_ACCEPTANCE_OUTCOMES,
  COMMERCIAL_ACCEPTANCE_STATES,
  type CommercialAcceptanceState,
} from './acceptance.types.js';

/**
 * LUAT cua truc KET THUC DON — `#275` K1, K5 va K7, kiem o muc ham THUAN.
 *
 * Bo bai nay CO Y khong dung Nest, khong dung Prisma, khong dung dong ho. Bat bien tai chinh trung
 * tam cua lane (`FULFILLED + APPROVED`) phai doc duoc va kiem duoc ma khong can dung mot ha tang
 * nao — neu no chi chung minh duoc khi co CSDL that thi no khong con la mot luat, no la mot hanh vi.
 */

/** Mot lenh HOP LE lam nen: da giao xong, chua co lich su, ket thuc theo chung tu. */
const base: AcceptanceEvaluation = {
  outcome: 'APPROVED',
  basis: 'DOCUMENT',
  orderStatus: 'FULFILLED',
  currentState: 'PENDING',
  latestDecisionId: null,
  supersedesId: null,
  evidenceCount: 1,
  externalNote: null,
};

const evaluate = (patch: Partial<AcceptanceEvaluation> = {}) =>
  evaluateAcceptanceDecision({ ...base, ...patch });

describe('evaluateAcceptanceDecision — cong ket thuc don', () => {
  it('cho qua mot lan ket thuc dau tien co chung tu tren don da giao xong', () => {
    expect(evaluate()).toEqual({ allowed: true, reason: 'ACCEPTANCE_DECIDED' });
  });

  describe('don phai giao xong truoc — #275 K5', () => {
    it('tu choi khi don con dang OPEN', () => {
      expect(evaluate({ orderStatus: 'OPEN' })).toEqual({
        allowed: false,
        reason: 'ACCEPTANCE_ORDER_NOT_FULFILLED',
      });
    });

    it('don DA HUY co ma RIENG — hai viec phai lam khac han nhau', () => {
      expect(evaluate({ orderStatus: 'CANCELLED' })).toEqual({
        allowed: false,
        reason: 'ACCEPTANCE_ORDER_CANCELLED',
      });
    });

    it.each(COMMERCIAL_ACCEPTANCE_OUTCOMES)(
      'chan ca ket qua %s chu khong rieng APPROVED',
      (outcome) => {
        // Mot don chua giao xong thi khong co gi de tu choi hay doi bo sung. Cho tu choi som se
        // sinh ra nhung ho so REJECTED cua chinh nhung don chua giao.
        expect(evaluate({ orderStatus: 'OPEN', outcome }).allowed).toBe(false);
      },
    );

    it('trang thai don duoc kiem TRUOC can cu', () => {
      // Vua sai trang thai vua thieu chung tu -> phai bao trang thai, vi do la cai phai sua truoc.
      expect(evaluate({ orderStatus: 'OPEN', evidenceCount: 0 }).reason).toBe(
        'ACCEPTANCE_ORDER_NOT_FULFILLED',
      );
    });
  });

  /**
   * `#275` K7 — KHONG COUPLING VOI VONG CHAY, kiem o muc KIEU.
   *
   * Bai nay khong goi mot ham nao. No khang dinh mot dieu ve HINH DANG cua hop dong: khong co
   * truong nao trong `AcceptanceEvaluation` mang trang thai vong chay. Do la cach duy nhat chung
   * minh "vong chay dong/mo khong tu no cho phep hay tu choi mot lan ket thuc" ma khong phai liet
   * ke bon trang thai vong chay nhan bon trang thai don.
   */
  describe('khong doc trang thai vong chay — #275 K7', () => {
    it('hop dong cua cong khong co truong nao ve vong chay', () => {
      expect(Object.keys(base).sort()).toEqual([
        'basis',
        'currentState',
        'evidenceCount',
        'externalNote',
        'latestDecisionId',
        'orderStatus',
        'outcome',
        'supersedesId',
      ]);
    });
  });

  describe('sua mot quyet dinh phai KHAI RO — #275 K1', () => {
    it('tu choi khi da co quyet dinh ma khong khai ban dang sua', () => {
      expect(
        evaluate({ currentState: 'REJECTED', latestDecisionId: 'dec-1', supersedesId: null }),
      ).toEqual({ allowed: false, reason: 'ACCEPTANCE_SUPERSEDES_REQUIRED' });
    });

    it('phan biet "khong co gi de doi" voi "chua khai ban dang sua"', () => {
      expect(
        evaluate({
          outcome: 'APPROVED',
          currentState: 'APPROVED',
          latestDecisionId: 'dec-1',
          supersedesId: null,
        }).reason,
      ).toBe('ACCEPTANCE_ALREADY_IN_OUTCOME');
    });

    it('tu choi khi khai sua mot quyet dinh trong khi chua co quyet dinh nao', () => {
      expect(evaluate({ latestDecisionId: null, supersedesId: 'dec-ma' }).reason).toBe(
        'ACCEPTANCE_SUPERSEDES_UNKNOWN',
      );
    });

    it('tu choi khi ban dang sua KHONG con la ban moi nhat — #275 K8 bai 5', () => {
      expect(
        evaluate({
          currentState: 'REJECTED',
          latestDecisionId: 'dec-2',
          supersedesId: 'dec-1',
        }).reason,
      ).toBe('ACCEPTANCE_SUPERSEDES_STALE');
    });

    it('cho qua khi ban dang sua DUNG la ban moi nhat', () => {
      expect(
        evaluate({
          currentState: 'REJECTED',
          latestDecisionId: 'dec-2',
          supersedesId: 'dec-2',
        }).allowed,
      ).toBe(true);
    });

    it('ban cu duoc bao TRUOC khi noi gi ve can cu', () => {
      // Nguoi nay dang nhin mot man hinh loi thoi; moi nhan xet ve noi dung deu co the sai.
      expect(
        evaluate({
          currentState: 'REJECTED',
          latestDecisionId: 'dec-2',
          supersedesId: 'dec-1',
          evidenceCount: 0,
        }).reason,
      ).toBe('ACCEPTANCE_SUPERSEDES_STALE');
    });
  });

  describe('can cu — #275 K2', () => {
    it('ket thuc theo chung tu ma khong co chung tu nao thi bi tu choi', () => {
      expect(evaluate({ basis: 'DOCUMENT', evidenceCount: 0 }).reason).toBe(
        'ACCEPTANCE_EVIDENCE_REQUIRED',
      );
    });

    it('ket thuc khong co ban so thi phai ghi ro B da nhan cai gi', () => {
      expect(
        evaluate({
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceCount: 0,
          externalNote: null,
        }).reason,
      ).toBe('ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED');
    });

    it('ket thuc khong co ban so DUOC PHEP khi co ghi chu can cu', () => {
      expect(
        evaluate({
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceCount: 0,
          externalNote: 'Bien ban giao nhan ban giay ky ngay 08/09, B giu ban goc',
        }).allowed,
      ).toBe(true);
    });

    it.each(['REJECTED', 'NEEDS_CORRECTION'] as const)(
      '%s KHONG doi can cu — nguoi ta tu choi VI thieu chung tu',
      (outcome) => {
        expect(evaluate({ outcome, basis: 'DOCUMENT', evidenceCount: 0 }).allowed).toBe(true);
      },
    );
  });
});

describe('stateAfter — ket qua doc thanh trang thai', () => {
  it.each(COMMERCIAL_ACCEPTANCE_OUTCOMES)('%s giu nguyen ten khi thanh trang thai', (outcome) => {
    expect(stateAfter(outcome)).toBe(outcome);
  });

  it('khong ket qua nao doc thanh PENDING — quay lai cho la NEEDS_CORRECTION', () => {
    const reachable = COMMERCIAL_ACCEPTANCE_OUTCOMES.map(stateAfter);
    expect(reachable).not.toContain('PENDING');
  });
});

describe('isOrderCompletable — dieu kien van hanh o grain DON', () => {
  it('chi FULFILLED', () => {
    const completable = ORDER_STATUSES.filter(isOrderCompletable);
    expect(completable).toEqual(['FULFILLED']);
  });
});

describe('isSettlementEligible — bat bien tai chinh trung tam cua #275 K5', () => {
  const otherThanApproved = COMMERCIAL_ACCEPTANCE_STATES.filter(
    (state): state is CommercialAcceptanceState => state !== 'APPROVED',
  );

  it('FULFILLED + APPROVED la truong hop DUY NHAT du dieu kien', () => {
    expect(isSettlementEligible({ orderStatus: 'FULFILLED', state: 'APPROVED' })).toBe(true);
  });

  it.each(otherThanApproved)('FULFILLED + %s KHONG du dieu kien', (state) => {
    expect(isSettlementEligible({ orderStatus: 'FULFILLED', state })).toBe(false);
  });

  it.each(['OPEN', 'CANCELLED'] as const)(
    '%s + APPROVED khong co duong tat nao — #275 K5 "APPROVED but operational prerequisite false"',
    (orderStatus) => {
      expect(isSettlementEligible({ orderStatus, state: 'APPROVED' })).toBe(false);
    },
  );

  it('khong to hop nao ngoai FULFILLED+APPROVED cho ra true', () => {
    const orderStatuses: readonly OrderStatus[] = ORDER_STATUSES;
    const eligible = orderStatuses.flatMap((orderStatus) =>
      COMMERCIAL_ACCEPTANCE_STATES.filter((state) =>
        isSettlementEligible({ orderStatus, state }),
      ).map((state) => `${orderStatus}+${state}`),
    );
    expect(eligible).toEqual(['FULFILLED+APPROVED']);
  });

  /**
   * `#275` K5: *"no dependency on whether the internal VehicleRun is open or closed"*.
   *
   * Kiem o muc KIEU chu khong bang mot vong lap qua bon trang thai vong chay: neu chu ky nhan them
   * mot truong `runStatus`, `Object.keys` cua dau vao se dai ra va bai nay do — trong khi mot vong
   * lap se van xanh vi no chi truyen nhung gia tri no biet.
   */
  it('dau vao cua bat bien KHONG co truong nao ve vong chay — #275 K5/K7', () => {
    const input = { orderStatus: 'FULFILLED', state: 'APPROVED' } as const;
    expect(Object.keys(input).sort()).toEqual(['orderStatus', 'state']);
    expect(isSettlementEligible(input)).toBe(true);
  });
});
