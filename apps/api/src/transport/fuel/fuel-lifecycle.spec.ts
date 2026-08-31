import { describe, expect, it } from 'vitest';
import {
  AMENDABLE_FUEL_RECONCILIATION_STATUSES,
  AMENDABLE_FUEL_VERIFICATION,
  ATTACHABLE_EVIDENCE_RECONCILIATION_STATUSES,
  EVIDENCE_FROZEN_RECONCILIATION_STATUSES,
  FUEL_RECONCILIATION_STATES,
  FUEL_RECONCILIATION_STATUSES,
  FUEL_VERIFICATION_STATUSES,
  evaluateFuelEntryAmendment,
  evaluateFuelReconciliationStateTransition,
  isFrozenFuelReconciliation,
} from './fuel-lifecycle.js';

/**
 * BA SOI DAY GIUA MAY TRANG THAI VA TANG KHO — Issue #103 §1 va §4.
 *
 * ===========================================================================
 * BO TEST NAY KHONG DO MOT LUAT NGHIEP VU NAO MOI.
 *
 * No do mot dieu khac: rang cac HANG SO ma tang kho dat vao menh de `WHERE` van con noi DUNG dieu
 * ma ham quyet dinh cua tang mien noi. Hai ben tra loi cung mot cau hoi bang hai cach viet — mot
 * ben la mot ham, mot ben la mot danh sach di vao SQL — va khong co gi trong bo bien dich buoc
 * chung phai khop nhau.
 *
 * Mot lan them trang thai vao truc 2 ma quen sua danh sach se lam lenh `UPDATE` tu choi mot phieu
 * dang le sua duoc: khong loi, khong canh bao, chi mot nut bam khong an. Bo test nay la thu duy
 * nhat noi ra dieu do.
 */

describe('Dieu kien sua phieu: ham va danh sach noi cung mot dieu', () => {
  const everyPair = FUEL_VERIFICATION_STATUSES.flatMap((verification) =>
    FUEL_RECONCILIATION_STATUSES.map((reconciliation) => [verification, reconciliation] as const),
  );

  it.each(everyPair)(
    'verification=%s reconciliation=%s — hai ben cho cung mot cau tra loi',
    (verification, reconciliation) => {
      const byFunction = evaluateFuelEntryAmendment(verification, reconciliation).allowed;
      const byWhereClause =
        verification === AMENDABLE_FUEL_VERIFICATION &&
        AMENDABLE_FUEL_RECONCILIATION_STATUSES.includes(reconciliation);

      expect(byWhereClause).toBe(byFunction);
    },
  );

  it('danh sach sua duoc khong rong va khong phai TAT CA — hai dau deu la mot loi sinh danh sach', () => {
    expect(AMENDABLE_FUEL_RECONCILIATION_STATUSES.length).toBeGreaterThan(0);
    expect(AMENDABLE_FUEL_RECONCILIATION_STATUSES.length).toBeLessThan(
      FUEL_RECONCILIATION_STATUSES.length,
    );
  });
});

describe('Dieu kien gan bang chung: hai danh sach chia doi truc 2, khong chong nhau', () => {
  it('gan duoc + dong bang = tron bo trang thai, va khong trang thai nao o ca hai ben', () => {
    expect(
      [
        ...ATTACHABLE_EVIDENCE_RECONCILIATION_STATUSES,
        ...EVIDENCE_FROZEN_RECONCILIATION_STATUSES,
      ].sort(),
    ).toEqual([...FUEL_RECONCILIATION_STATUSES].sort());

    for (const status of ATTACHABLE_EVIDENCE_RECONCILIATION_STATUSES) {
      expect(EVIDENCE_FROZEN_RECONCILIATION_STATUSES).not.toContain(status);
    }
  });

  /**
   * Gan anh RONG HON sua so lieu — mot phieu DA KHOP van nhan duoc anh.
   *
   * Neu hai dieu kien nay bang nhau thi mot trong hai ben da sai, va bai test noi ro ben nao:
   * `GD-10` khoa SO LIEU tu luc phieu duoc tin, con `GD-11` khoa CHUNG TU tu luc ky duoc dong.
   */
  it('mot phieu DA KHOP: khong sua so duoc, nhung van gan duoc anh', () => {
    expect(evaluateFuelEntryAmendment('DECLARED', 'MATCHED').allowed).toBe(false);
    expect(ATTACHABLE_EVIDENCE_RECONCILIATION_STATUSES).toContain('MATCHED');
  });
});

/**
 * BAT BIEN MA `applyMatchingRun` DUA VAO.
 *
 * Tang kho tu choi chay so khop DUY NHAT khi ky dong bang, roi dat thang trang thai `MATCHING`. Cau
 * do chi dung chung nao `CLOSED` la trang thai duy nhat KHONG co canh sang `MATCHING`.
 *
 * Hom nay dieu do dung. Bai test nay ton tai de mot trang thai them vao ngay mai — mot `ARCHIVED`,
 * mot `LOCKED_BY_AUDIT` — khong the lang le lam cau do sai: neu no khong co canh sang `MATCHING` ma
 * cung khong dong bang, tang kho se dua ky vao mot trang thai may trang thai chua bao gio cho phep.
 */
describe('CLOSED la trang thai DUY NHAT khong chay so khop duoc', () => {
  it.each(FUEL_RECONCILIATION_STATES.map((state) => [state] as const))(
    '%s — dong bang <=> khong co canh sang MATCHING',
    (state) => {
      const decision = evaluateFuelReconciliationStateTransition(state, 'MATCHING');
      // `ALREADY_IN_STATE` la mot lan chay lai binh thuong, khong phai mot canh bi cam.
      const canRunMatching = decision.allowed || decision.reason === 'ALREADY_IN_STATE';

      expect(canRunMatching).toBe(!isFrozenFuelReconciliation(state));
    },
  );

  /**
   * Va chieu nguoc lai cho lenh DONG: no chap nhan ba trang thai va chi ba.
   *
   * `DRAFT` bi loai co ly do nghiep vu — mot ky chua tung chay so khop lan nao khong co gi de dong,
   * va dong no se phat mot ban giao 0 dong ma khong ai tung nhin vao bang ke.
   */
  it('lenh dong nhan RESOLVED / MATCHING / REOPENED, va DRAFT thi khong', () => {
    for (const state of ['MATCHING', 'REOPENED'] as const) {
      expect(evaluateFuelReconciliationStateTransition(state, 'RESOLVED').allowed).toBe(true);
    }
    expect(evaluateFuelReconciliationStateTransition('RESOLVED', 'CLOSED').allowed).toBe(true);
    expect(evaluateFuelReconciliationStateTransition('DRAFT', 'RESOLVED').allowed).toBe(false);
  });
});
