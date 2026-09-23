import { describe, expect, it } from 'vitest';
import {
  effectiveLineDecisions,
  evaluateDecisionRevision,
  lineStatusAfterRevision,
  supersededDecisionIds,
  type DecisionRecord,
  type RevisionTarget,
} from './fuel-decision-revision.js';
import type { FuelDiscrepancyKind } from './fuel-matching.js';
import { sumAcceptedSettlement } from './fuel-settlement.js';

/**
 * `#317` G0 — QUYET DINH HIEU LUC MOI NHAT CUA MOI DONG BANG KE THANG.
 *
 * `OWNER_DECISIONS_2026_09_17`: *"moi statementLineId chi co mot quyet dinh hieu luc hien tai; lich
 * su quyet dinh cu khong bi xoa/rewrite; ACCEPT_SUPPLIER_AMOUNT -> IGNORE_WITH_REASON sau reopen phai
 * lam dong do khong con dong gop vao accepted total"*.
 *
 * Bo bai nay khoa PHEP CHIEU thuan. Tinh chat CSDL (trigger chi-ghi-them, unique `supersedesId`, ghi
 * dong thoi) nam o `transport-fuel-decision-revision.int.spec.ts`, tren Postgres that.
 */

const decision = (id: string, overrides: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id,
  status: 'RESOLVED',
  statementLineId: 'dong-1',
  resolution: 'ACCEPT_SUPPLIER_AMOUNT',
  supersedesId: null,
  resolvedAt: '2026-09-10T08:00:00.000Z',
  createdAt: '2026-09-10T07:00:00.000Z',
  ...overrides,
});

const LINES = [
  { id: 'dong-1', amount: 2_000_000 },
  { id: 'dong-2', amount: 4_200_000 },
];

describe('effectiveLineDecisions — phep chieu "moi nhat thang"', () => {
  it('mot quyet dinh da ghi la quyet dinh hieu luc cua dong do', () => {
    const effective = effectiveLineDecisions([decision('d1')]);
    expect(effective.get('dong-1')?.id).toBe('d1');
  });

  it('chuoi thay the: ban MOI nhat thang, ban cu van con trong lich su', () => {
    const records = [
      decision('d1'),
      decision('d2', { resolution: 'IGNORE_WITH_REASON', supersedesId: 'd1' }),
      decision('d3', { resolution: 'REJECT_SUPPLIER_LINE', supersedesId: 'd2' }),
    ];

    expect(effectiveLineDecisions(records).get('dong-1')?.id).toBe('d3');
    expect([...supersededDecisionIds(records)].sort()).toEqual(['d1', 'd2']);
  });

  /**
   * Thu tu mang KHONG quyet dinh gi — chuoi `supersedesId` moi quyet dinh. Neu phep chieu doc "hang
   * cuoi cung trong mang", mot truy van doi `orderBy` se lang le doi tong tien.
   */
  it('dao thu tu mang khong doi quyet dinh hieu luc', () => {
    const records = [
      decision('d2', { resolution: 'IGNORE_WITH_REASON', supersedesId: 'd1' }),
      decision('d1', { resolvedAt: '2026-09-11T00:00:00.000Z' }),
    ];
    expect(effectiveLineDecisions(records).get('dong-1')?.id).toBe('d2');
    expect(effectiveLineDecisions([...records].reverse()).get('dong-1')?.id).toBe('d2');
  });

  it('chenh lech PENDING khong phai quyet dinh — khong che quyet dinh da ghi', () => {
    const records = [
      decision('d1'),
      decision('p2', { status: 'PENDING', resolution: null, resolvedAt: null }),
    ];
    expect(effectiveLineDecisions(records).get('dong-1')?.id).toBe('d1');
  });

  it('quyet dinh khong gan dong bang ke (phieu le) khong vao phep chieu theo dong', () => {
    const effective = effectiveLineDecisions([decision('e1', { statementLineId: null })]);
    expect(effective.size).toBe(0);
  });

  /**
   * DU LIEU CU (truoc migration) co the co HAI quyet dinh da ghi cho cung mot dong ma khong hang nao
   * tro toi hang nao. Phep chieu van phai TAT DINH: `resolvedAt` muon hon thang, roi `createdAt`, roi
   * `id` — khong phu thuoc thu tu doc.
   */
  it('hai quyet dinh cu khong noi chuoi -> ban quyet MUON hon thang, tat dinh', () => {
    const older = decision('a-old', { resolvedAt: '2026-09-01T00:00:00.000Z' });
    const newer = decision('z-new', {
      resolution: 'IGNORE_WITH_REASON',
      resolvedAt: '2026-09-02T00:00:00.000Z',
    });

    expect(effectiveLineDecisions([older, newer]).get('dong-1')?.id).toBe('z-new');
    expect(effectiveLineDecisions([newer, older]).get('dong-1')?.id).toBe('z-new');
    expect(supersededDecisionIds([newer, older]).has('a-old')).toBe(true);
  });

  it('cung `resolvedAt` va `createdAt` -> `id` lon hon thang (khong phu thuoc thu tu)', () => {
    const left = decision('b');
    const right = decision('c', { resolution: 'IGNORE_WITH_REASON' });
    expect(effectiveLineDecisions([left, right]).get('dong-1')?.id).toBe('c');
    expect(effectiveLineDecisions([right, left]).get('dong-1')?.id).toBe('c');
  });
});

describe('sumAcceptedSettlement — chi quyet dinh HIEU LUC duoc tinh tien (G0)', () => {
  it('ACCEPT roi bi thay bang IGNORE -> dong KHONG con trong tong', () => {
    const accepted = sumAcceptedSettlement({
      lines: LINES,
      matches: [{ statementLineId: 'dong-2' }],
      discrepancies: [
        decision('d1'),
        decision('d2', { resolution: 'IGNORE_WITH_REASON', supersedesId: 'd1' }),
      ],
    });

    expect(accepted).toEqual({ amount: 4_200_000, lineCount: 1, lineIds: ['dong-2'] });
  });

  it('IGNORE roi bi thay bang ACCEPT -> dong VAO tong (chieu tang van chay)', () => {
    const accepted = sumAcceptedSettlement({
      lines: LINES,
      matches: [{ statementLineId: 'dong-2' }],
      discrepancies: [
        decision('d1', { resolution: 'IGNORE_WITH_REASON' }),
        decision('d2', { supersedesId: 'd1' }),
      ],
    });

    expect(accepted).toEqual({ amount: 6_200_000, lineCount: 2, lineIds: ['dong-1', 'dong-2'] });
  });

  /**
   * DOI CHUNG AM — phep cong CU (truoc `#317`) chay tren CUNG du lieu.
   *
   * Ham duoi day la NGUYEN VAN than cua `sumAcceptedSettlement` ban cu (`e748305`): gom `statementLineId`
   * cua MOI chenh lech mang `ACCEPT_SUPPLIER_AMOUNT`, khong nhin chuoi thay the. Bai nay chung minh
   * canh dung o tren THAT SU tai hien loi G0 — neu phep cong cu cung ra 4.200.000 thi bai tren xanh
   * vo nghia.
   */
  it('doi chung am: phep cong CU van tinh dong da bi thay the (tong khong giam duoc)', () => {
    const legacySum = (input: {
      readonly lines: readonly { readonly id: string; readonly amount: number | null }[];
      readonly matches: readonly { readonly statementLineId: string }[];
      readonly discrepancies: readonly {
        readonly statementLineId: string | null;
        readonly resolution: string | null;
      }[];
    }) => {
      const acceptedLineIds = new Set(input.matches.map((match) => match.statementLineId));
      for (const discrepancy of input.discrepancies) {
        if (discrepancy.resolution !== 'ACCEPT_SUPPLIER_AMOUNT') continue;
        if (discrepancy.statementLineId) acceptedLineIds.add(discrepancy.statementLineId);
      }
      const accepted = input.lines.filter((line) => acceptedLineIds.has(line.id));
      return accepted.reduce((total, line) => total + (line.amount ?? 0), 0);
    };

    const input = {
      lines: LINES,
      matches: [{ statementLineId: 'dong-2' }],
      discrepancies: [
        decision('d1'),
        decision('d2', { resolution: 'IGNORE_WITH_REASON', supersedesId: 'd1' }),
      ],
    };

    expect(legacySum(input)).toBe(6_200_000);
    expect(sumAcceptedSettlement(input).amount).toBe(4_200_000);
  });

  it('dong DA KHOP van duoc tinh — cap khop khong phai mot quyet dinh bi thay the', () => {
    const accepted = sumAcceptedSettlement({
      lines: LINES,
      matches: [{ statementLineId: 'dong-1' }],
      discrepancies: [decision('d1', { resolution: 'IGNORE_WITH_REASON' })],
    });
    expect(accepted.lineIds).toEqual(['dong-1']);
  });
});

describe('evaluateDecisionRevision — ai sua duoc, sua thanh gi', () => {
  const records = [
    decision('d1'),
    decision('d2', { resolution: 'IGNORE_WITH_REASON', supersedesId: 'd1' }),
    decision('p3', {
      id: 'p3',
      status: 'PENDING',
      resolution: null,
      resolvedAt: null,
      statementLineId: 'dong-2',
    }),
    decision('e4', { statementLineId: null, resolution: 'IGNORE_WITH_REASON' }),
    decision('m5', { statementLineId: 'dong-3', resolution: 'MATCH_CONFIRMED' }),
  ];
  /** Loai chenh lech chi doi luat `#371`; moi bai cu dung mot loai trung tinh. */
  const find = (id: string, kind: FuelDiscrepancyKind = 'STATEMENT_LINE_ONLY'): RevisionTarget => ({
    ...(records.find((record) => record.id === id) as DecisionRecord),
    kind,
  });

  it('quyet dinh HIEU LUC sang mot quyet dinh khac -> cho phep', () => {
    expect(
      evaluateDecisionRevision({
        target: find('d2'),
        records,
        resolution: 'ACCEPT_SUPPLIER_AMOUNT',
      }),
    ).toEqual({ allowed: true });
  });

  it('quyet dinh DA BI THAY THE -> DECISION_NOT_CURRENT (phai sua ban moi nhat)', () => {
    expect(
      evaluateDecisionRevision({ target: find('d1'), records, resolution: 'REJECT_SUPPLIER_LINE' }),
    ).toEqual({ allowed: false, reason: 'DECISION_NOT_CURRENT' });
  });

  it('chenh lech con PENDING -> DECISION_NOT_RESOLVED (duong dung la quyet, khong phai sua)', () => {
    expect(
      evaluateDecisionRevision({ target: find('p3'), records, resolution: 'IGNORE_WITH_REASON' }),
    ).toEqual({ allowed: false, reason: 'DECISION_NOT_RESOLVED' });
  });

  it('quyet dinh khong gan dong bang ke -> DECISION_WITHOUT_STATEMENT_LINE', () => {
    expect(
      evaluateDecisionRevision({
        target: find('e4'),
        records,
        resolution: 'ENTRY_CORRECTION_REQUIRED',
      }),
    ).toEqual({ allowed: false, reason: 'DECISION_WITHOUT_STATEMENT_LINE' });
  });

  /**
   * `MATCH_CONFIRMED` da ghi mot CAP KHOP tay. Sua no di se phai xoa cap khop do — tuc viet lai lich
   * su. Duong dung la mo lai ky, chay lai so khop, quyet chenh lech moi.
   */
  it('quyet dinh MATCH_CONFIRMED -> DECISION_MATCH_LOCKED', () => {
    expect(
      evaluateDecisionRevision({ target: find('m5'), records, resolution: 'IGNORE_WITH_REASON' }),
    ).toEqual({ allowed: false, reason: 'DECISION_MATCH_LOCKED' });
  });

  it('sua thanh CHINH quyet dinh dang co -> DECISION_REVISION_NO_CHANGE (khong ghi ban rong)', () => {
    expect(
      evaluateDecisionRevision({ target: find('d2'), records, resolution: 'IGNORE_WITH_REASON' }),
    ).toEqual({ allowed: false, reason: 'DECISION_REVISION_NO_CHANGE' });
  });

  /**
   * `#371` — dong `PAYMENT_METHOD_CONFLICT` la lan do lai xe DA TRA TIEN MAT. Doi y sang "chap nhan so
   * cay xang" sau khi mo ky la duong vong ra dung khoan tra hai lan ma lan QUYET dau tien da chan.
   */
  it('#371 — dong phieu tien mat: doi y sang ACCEPT -> DECISION_CASH_PAID_NOT_PAYABLE', () => {
    expect(
      evaluateDecisionRevision({
        target: find('d2', 'PAYMENT_METHOD_CONFLICT'),
        records,
        resolution: 'ACCEPT_SUPPLIER_AMOUNT',
      }),
    ).toEqual({ allowed: false, reason: 'DECISION_CASH_PAID_NOT_PAYABLE' });
  });

  it('#371 — dong phieu tien mat: doi y giua cac duong KHONG tra tien van duoc', () => {
    for (const resolution of ['REJECT_SUPPLIER_LINE', 'ENTRY_CORRECTION_REQUIRED'] as const) {
      expect(
        evaluateDecisionRevision({
          target: find('d2', 'PAYMENT_METHOD_CONFLICT'),
          records,
          resolution,
        }),
      ).toEqual({ allowed: true });
    }
  });

  /** Luat `#371` gan voi LOAI chenh lech, khong gan voi quyet dinh — loai khac van doi y nhu cu. */
  it('#371 — loai chenh lech KHAC van doi y sang ACCEPT duoc nhu truoc', () => {
    expect(
      evaluateDecisionRevision({
        target: find('d2', 'OUT_OF_TOLERANCE'),
        records,
        resolution: 'ACCEPT_SUPPLIER_AMOUNT',
      }),
    ).toEqual({ allowed: true });
  });
});

describe('lineStatusAfterRevision — dong bang ke doc lai dung quyet dinh moi', () => {
  it('bo qua co ly do -> IGNORED', () => {
    expect(lineStatusAfterRevision('IGNORE_WITH_REASON', 'MISMATCHED')).toBe('IGNORED');
  });

  it('tu IGNORED sang mot quyet dinh khac -> quay ve MISMATCHED', () => {
    expect(lineStatusAfterRevision('ACCEPT_SUPPLIER_AMOUNT', 'IGNORED')).toBe('MISMATCHED');
  });

  it('dong khong o trang thai chenh lech (MATCHED/SETTLED/UNMATCHED) -> khong dong toi', () => {
    expect(lineStatusAfterRevision('IGNORE_WITH_REASON', 'MATCHED')).toBeNull();
    expect(lineStatusAfterRevision('IGNORE_WITH_REASON', 'SETTLED')).toBeNull();
    expect(lineStatusAfterRevision('ACCEPT_SUPPLIER_AMOUNT', 'UNMATCHED')).toBeNull();
  });

  it('khong doi gi thi tra null — khong ghi mot lan vo ich', () => {
    expect(lineStatusAfterRevision('ACCEPT_SUPPLIER_AMOUNT', 'MISMATCHED')).toBeNull();
    expect(lineStatusAfterRevision('IGNORE_WITH_REASON', 'IGNORED')).toBeNull();
  });
});
