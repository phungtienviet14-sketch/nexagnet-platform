import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN_CLOSURE_IDLE_HOURS, resolveDepot, sameSite } from './planning-policy.js';
import type { Depot, TransportPlanningPolicy } from './planning.types.js';
import { evaluateRunClosure, type ClosureLegFacts, type RunClosureFacts } from './run-closure.js';

/**
 * DONG VONG CHAY — bai kiem TAT DINH tren ham thuan (`#276` L4).
 *
 * Nhung bai cua `#276` L9 thuoc ve day:
 *
 *     bai 12  con phien cho / con chang tuong lai thi KHONG dong
 *     bai 13  ve bai va het viec thi DONG
 *
 * Va mot bat bien khong nam trong danh sach do nhung quan trong hon ca hai: ham nay khong nhan
 * mot tham so nao ten `orderId`. `RUN CLOSED != ORDER COMPLETED`.
 */

const DEPOT: Depot = { code: 'DEPOT-HN', label: 'Bãi xe Hà Nội' };
const NOW = new Date('2026-09-11T18:00:00.000Z');

const leg = (over: Partial<ClosureLegFacts> = {}): ClosureLegFacts => ({
  id: 'leg-1',
  sequence: 1,
  status: 'COMPLETED',
  destinationLabel: 'Bãi xe Hà Nội',
  completedAt: '2026-09-11T10:00:00.000Z',
  ...over,
});

const facts = (over: Partial<RunClosureFacts> = {}): RunClosureFacts => ({
  runStatus: 'ACTIVE',
  legs: [leg()],
  openPlanCount: 0,
  depot: DEPOT,
  policy: { idleHours: null },
  now: NOW,
  ...over,
});

describe('dong vong chay do he thong (#276 L4)', () => {
  describe('dieu kien chan', () => {
    it.each(['PLANNED', 'COMPLETED', 'CANCELLED'] as const)(
      'vong chay o trang thai %s -> RUN_NOT_ACTIVE',
      (runStatus) => {
        const verdict = evaluateRunClosure(facts({ runStatus }));
        expect(verdict.closable).toBe(false);
        expect(verdict.blockers).toContain('RUN_NOT_ACTIVE');
      },
    );

    it.each(['PLANNED', 'IN_TRANSIT'] as const)(
      'bai 12 -- con mot chang %s thi khong dong',
      (status) => {
        const verdict = evaluateRunClosure(
          facts({ legs: [leg(), leg({ id: 'leg-2', status, completedAt: null })] }),
        );
        expect(verdict.closable).toBe(false);
        expect(verdict.blockers).toContain('LEG_STILL_OPEN');
      },
    );

    it('con ke hoach chua chay xong -> PLAN_STILL_OPEN', () => {
      const verdict = evaluateRunClosure(facts({ openPlanCount: 1 }));
      expect(verdict.closable).toBe(false);
      expect(verdict.blockers).toContain('PLAN_STILL_OPEN');
    });

    it('khong chang nao hoan thanh -> NO_COMPLETED_WORK, va KHONG dong mot vong chay trong', () => {
      const verdict = evaluateRunClosure(
        facts({ legs: [leg({ status: 'CANCELLED', completedAt: null })] }),
      );
      expect(verdict.closable).toBe(false);
      expect(verdict.blockers).toContain('NO_COMPLETED_WORK');
    });

    it('bai 12 -- phien cho mo (Lane O) truyen vao chan dong', () => {
      const verdict = evaluateRunClosure(facts({ additionalBlockers: ['OPEN_WAITING_SESSION'] }));
      expect(verdict.closable).toBe(false);
      expect(verdict.blockers).toContain('OPEN_WAITING_SESSION');
    });

    it('con hang tren thung (transport-checkpoint) truyen vao chan dong', () => {
      const verdict = evaluateRunClosure(facts({ additionalBlockers: ['CARGO_STILL_CARRIED'] }));
      expect(verdict.closable).toBe(false);
      expect(verdict.blockers).toContain('CARGO_STILL_CARRIED');
    });

    it('bi chan thi KHONG phai `holding` -- hai trang thai khac nhau', () => {
      const verdict = evaluateRunClosure(facts({ openPlanCount: 1 }));
      expect(verdict.holding).toBe(false);
      expect(verdict.trigger).toBeNull();
    });
  });

  describe('truong hop dong manh: xe ve bai', () => {
    it('bai 13 -- ve bai va het viec thi dong ngay', () => {
      const verdict = evaluateRunClosure(facts());
      expect(verdict).toEqual({
        closable: true,
        trigger: 'DEPOT_RETURN',
        blockers: [],
        holding: false,
      });
    });

    it('nhan bai khac hoa/thuong/khoang trang van tinh la ve bai', () => {
      const verdict = evaluateRunClosure(
        facts({ legs: [leg({ destinationLabel: '  bãi   XE hà nội ' })] }),
      );
      expect(verdict.trigger).toBe('DEPOT_RETURN');
    });

    it('khach chua khai bai -> khong co duong dong manh nao', () => {
      const verdict = evaluateRunClosure(facts({ depot: null }));
      expect(verdict.closable).toBe(false);
      expect(verdict.holding).toBe(true);
    });

    it('doc chang hoan thanh MUON NHAT theo `completedAt`, khong theo `sequence`', () => {
      // Chang so 1 ket thuc SAU chang so 2 (dieu xe dao thu tu). Xe dang o bai, khong o Hai Phong.
      const verdict = evaluateRunClosure(
        facts({
          legs: [
            leg({ id: 'leg-1', sequence: 1, completedAt: '2026-09-11T12:00:00.000Z' }),
            leg({
              id: 'leg-2',
              sequence: 2,
              destinationLabel: 'Hải Phòng',
              completedAt: '2026-09-11T09:00:00.000Z',
            }),
          ],
        }),
      );
      expect(verdict.trigger).toBe('DEPOT_RETURN');
    });

    it('hai chang dong trong CUNG mot mili giay: `sequence` pha hoa, khong phai thu tu doc', () => {
      const sameInstant = '2026-09-11T10:00:00.000Z';
      const legs = [
        leg({ id: 'leg-1', sequence: 1, destinationLabel: 'Hải Phòng', completedAt: sameInstant }),
        leg({ id: 'leg-2', sequence: 2, completedAt: sameInstant }),
      ];
      // Dao thu tu MANG khong duoc lam doi ket qua: chang so 2 (ve bai) la chang di sau.
      expect(evaluateRunClosure(facts({ legs })).trigger).toBe('DEPOT_RETURN');
      expect(evaluateRunClosure(facts({ legs: [...legs].reverse() })).trigger).toBe('DEPOT_RETURN');
    });
  });

  describe('truong hop ket thuc XA BAI', () => {
    const awayFromDepot = (over: Partial<RunClosureFacts> = {}) =>
      facts({
        legs: [leg({ destinationLabel: 'Hải Phòng', completedAt: '2026-09-11T10:00:00.000Z' })],
        ...over,
      });

    it('khong khai nguong nghi -> KHONG dong, va do la trang thai CHO chu khong loi', () => {
      const verdict = evaluateRunClosure(awayFromDepot());
      expect(verdict).toEqual({ closable: false, trigger: null, blockers: [], holding: true });
    });

    it('chua qua nguong -> van cho', () => {
      const verdict = evaluateRunClosure(awayFromDepot({ policy: { idleHours: 12 } }));
      expect(verdict.holding).toBe(true);
      expect(verdict.closable).toBe(false);
    });

    it('vua dung nguong -> dong voi ly do IDLE_TIMEOUT', () => {
      const verdict = evaluateRunClosure(awayFromDepot({ policy: { idleHours: 8 } }));
      expect(verdict).toEqual({
        closable: true,
        trigger: 'IDLE_TIMEOUT',
        blockers: [],
        holding: false,
      });
    });

    it('nguong khong bo qua dieu kien chan', () => {
      const verdict = evaluateRunClosure(
        awayFromDepot({ policy: { idleHours: 1 }, openPlanCount: 1 }),
      );
      expect(verdict.closable).toBe(false);
      expect(verdict.blockers).toContain('PLAN_STILL_OPEN');
    });

    it('mac dinh cua nen tang la KHONG co nguong -- khong doan mot con so khach chua noi', () => {
      expect(DEFAULT_RUN_CLOSURE_IDLE_HOURS).toBeNull();
    });
  });

  it('chang DA HUY khong lam doi ket qua', () => {
    const withCancelled = evaluateRunClosure(
      facts({ legs: [leg(), leg({ id: 'leg-9', status: 'CANCELLED', completedAt: null })] }),
    );
    expect(withCancelled).toEqual(evaluateRunClosure(facts()));
  });
});

/* ------------------------------------------------------------------ *
 * CHINH SACH — bai kiem cua bai xe va so sanh dia diem
 * ------------------------------------------------------------------ */

const policyWith = (depots: TransportPlanningPolicy['depots']): TransportPlanningPolicy => ({
  grouping: 'ONE_ORDER_PER_RUN',
  depots,
  closure: { idleHours: null },
});

describe('bai xe: mot bai hom nay, nhieu bai khong bi dong cua (#276 L5)', () => {
  it('khong khai bai nao -> NOT_CONFIGURED, khong phai loi', () => {
    expect(resolveDepot(policyWith([])).kind).toBe('NOT_CONFIGURED');
  });

  it('dung mot bai dang hoat dong -> RESOLVED', () => {
    const resolution = resolveDepot(policyWith([{ code: 'DEPOT-HN', label: 'Bãi xe Hà Nội' }]));
    expect(resolution).toEqual({ kind: 'RESOLVED', depot: DEPOT });
  });

  it('bai da tat khong duoc tinh', () => {
    const resolution = resolveDepot(
      policyWith([
        { code: 'DEPOT-HN', label: 'Bãi xe Hà Nội' },
        { code: 'DEPOT-HCM', label: 'Bãi xe Sài Gòn', active: false },
      ]),
    );
    expect(resolution).toEqual({ kind: 'RESOLVED', depot: DEPOT });
  });

  it('hai bai dang hoat dong -> AMBIGUOUS, KHONG doan bua mot cai', () => {
    const resolution = resolveDepot(
      policyWith([
        { code: 'DEPOT-HN', label: 'Bãi xe Hà Nội' },
        { code: 'DEPOT-HCM', label: 'Bãi xe Sài Gòn' },
      ]),
    );
    expect(resolution).toEqual({ kind: 'AMBIGUOUS', codes: ['DEPOT-HN', 'DEPOT-HCM'] });
  });
});

describe('so sanh dia diem', () => {
  it('bo khoang thua, gop khoang trang, khong phan biet hoa thuong', () => {
    expect(sameSite('  Hải   Phòng ', 'hải phòng')).toBe(true);
  });

  it('KHONG bo dau — bo dau la mot phep doan ve dia ly khong co nguon', () => {
    expect(sameSite('Hai Phong', 'Hải Phòng')).toBe(false);
  });
});
