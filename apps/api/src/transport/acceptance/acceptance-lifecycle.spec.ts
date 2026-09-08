import { describe, expect, it } from 'vitest';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import {
  evaluateAcceptanceDecision,
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
 * LUAT cua truc nghiem thu — `#268` I4 va I5, kiem o muc ham THUAN.
 *
 * Bo bai nay CO Y khong dung Nest, khong dung Prisma, khong dung dong ho. Bat bien tai chinh trung
 * tam cua lane (`COMPLETED + APPROVED`) phai doc duoc va kiem duoc ma khong can dung mot ha tang
 * nao — neu no chi chung minh duoc khi co CSDL that thi no khong con la mot luat, no la mot hanh vi.
 */

/** Mot lenh HOP LE lam nen: da chay xong, chua co lich su, duyet theo chung tu. */
const base: AcceptanceEvaluation = {
  outcome: 'APPROVED',
  basis: 'DOCUMENT',
  runStatus: 'COMPLETED',
  currentState: 'PENDING',
  latestDecisionId: null,
  supersedesId: null,
  evidenceCount: 1,
  externalNote: null,
};

const evaluate = (patch: Partial<AcceptanceEvaluation> = {}) =>
  evaluateAcceptanceDecision({ ...base, ...patch });

describe('evaluateAcceptanceDecision — cong nghiem thu chung tu', () => {
  it('cho qua mot lan duyet dau tien co chung tu tren vong chay da chay xong', () => {
    expect(evaluate()).toEqual({ allowed: true, reason: 'ACCEPTANCE_DECIDED' });
  });

  describe('vong chay phai chay xong truoc — #268 I5 bai 6', () => {
    const notCompleted: readonly VehicleRunStatus[] = ['PLANNED', 'ACTIVE', 'CANCELLED'];

    it.each(notCompleted)('tu choi khi vong chay dang %s', (runStatus) => {
      expect(evaluate({ runStatus })).toEqual({
        allowed: false,
        reason: 'ACCEPTANCE_RUN_NOT_COMPLETED',
      });
    });

    it.each(COMMERCIAL_ACCEPTANCE_OUTCOMES)(
      'chan ca ket qua %s chu khong rieng APPROVED',
      (outcome) => {
        // Mot chuyen dang chay thi khong co gi de tu choi hay doi bo sung. Cho tu choi som se sinh
        // ra nhung ho so REJECTED cua chinh nhung chuyen chua ket thuc.
        expect(evaluate({ runStatus: 'ACTIVE', outcome }).allowed).toBe(false);
      },
    );

    it('trang thai vong chay duoc kiem TRUOC can cu', () => {
      // Vua sai trang thai vua thieu chung tu -> phai bao trang thai, vi do la cai phai sua truoc.
      expect(evaluate({ runStatus: 'ACTIVE', evidenceCount: 0 }).reason).toBe(
        'ACCEPTANCE_RUN_NOT_COMPLETED',
      );
    });
  });

  describe('sua mot quyet dinh phai KHAI RO — #268 I4', () => {
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

    it('tu choi khi ban dang sua KHONG con la ban moi nhat — hai nguoi cung bam', () => {
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

  describe('can cu — #268 I2', () => {
    it('duyet theo chung tu ma khong co chung tu nao thi bi tu choi', () => {
      expect(evaluate({ basis: 'DOCUMENT', evidenceCount: 0 }).reason).toBe(
        'ACCEPTANCE_EVIDENCE_REQUIRED',
      );
    });

    it('duyet khong co ban so thi phai ghi ro B da nhan cai gi', () => {
      expect(
        evaluate({
          basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
          evidenceCount: 0,
          externalNote: null,
        }).reason,
      ).toBe('ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED');
    });

    it('duyet khong co ban so DUOC PHEP khi co ghi chu can cu', () => {
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

describe('isSettlementEligible — bat bien tai chinh trung tam cua #268 I5', () => {
  const otherThanApproved = COMMERCIAL_ACCEPTANCE_STATES.filter(
    (state): state is CommercialAcceptanceState => state !== 'APPROVED',
  );

  it('COMPLETED + APPROVED la truong hop DUY NHAT du dieu kien', () => {
    expect(isSettlementEligible({ runStatus: 'COMPLETED', state: 'APPROVED' })).toBe(true);
  });

  it.each(otherThanApproved)('COMPLETED + %s KHONG du dieu kien', (state) => {
    expect(isSettlementEligible({ runStatus: 'COMPLETED', state })).toBe(false);
  });

  it.each(['PLANNED', 'ACTIVE', 'CANCELLED'] as const)(
    '%s + APPROVED khong co duong tat nao — #268 I5 "non-completed + APPROVED cannot bypass"',
    (runStatus) => {
      expect(isSettlementEligible({ runStatus, state: 'APPROVED' })).toBe(false);
    },
  );

  it('khong to hop nao ngoai COMPLETED+APPROVED cho ra true', () => {
    const runStatuses: readonly VehicleRunStatus[] = [
      'PLANNED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
    ];
    const eligible = runStatuses.flatMap((runStatus) =>
      COMMERCIAL_ACCEPTANCE_STATES.filter((state) =>
        isSettlementEligible({ runStatus, state }),
      ).map((state) => `${runStatus}+${state}`),
    );
    expect(eligible).toEqual(['COMPLETED+APPROVED']);
  });
});
