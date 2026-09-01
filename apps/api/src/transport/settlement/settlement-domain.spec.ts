import { describe, expect, it } from 'vitest';
import {
  calculateCommission,
  commissionRouteKey,
  scopeOf,
  selectCommissionRule,
  type CommissionRuleCandidate,
} from './commission-rules.js';
import { computeDirectMargin, rollupDirectMargin, type DirectMarginInput } from './direct-margin.js';
import {
  adjustmentDelta,
  canAdjust,
  outstandingOf,
  reversalAmount,
  settlementDocumentFingerprint,
  type SettlementDocumentIdentity,
} from './settlement-documents.js';
import {
  counterpartyKindForFlow,
  directionForFlow,
  isSameLedger,
  ledgerKey,
  SETTLEMENT_FLOWS,
} from './settlement-flows.js';
import {
  agingBucketFor,
  assessCreditExposure,
  daysOverdue,
  dueDateFrom,
  isOverdue,
} from './settlement-terms.js';

/* ==================================================================== *
 * §1 NAM DONG GIU RIENG — Issue #87 acceptance 9 va 10
 * ==================================================================== */

describe('TX-05 §1 — nam dong tien giu rieng', () => {
  it('moi dong co DUNG mot chieu va mot loai doi tac', () => {
    expect(directionForFlow('CUSTOMER_FREIGHT')).toBe('RECEIVABLE');
    expect(directionForFlow('FUEL_SUPPLIER')).toBe('PAYABLE');
    expect(directionForFlow('CARRIER_SERVICE')).toBe('PAYABLE');
    expect(directionForFlow('PARTNER_COMMISSION')).toBe('PAYABLE');

    expect(counterpartyKindForFlow('CUSTOMER_FREIGHT')).toBe('CUSTOMER');
    expect(counterpartyKindForFlow('FUEL_SUPPLIER')).toBe('FUEL_SUPPLIER');
    expect(counterpartyKindForFlow('CARRIER_SERVICE')).toBe('PARTNER');
    expect(counterpartyKindForFlow('PARTNER_COMMISSION')).toBe('PARTNER');
  });

  /**
   * VT-054 / acceptance 9: mot doi tac vua cho thue xe vua mang don ve. Hai chieu cong no cua ho
   * la HAI so cai, ke ca khi `counterpartyId` trung tuyet doi.
   */
  it('cung mot doi tac o hai dong => HAI so cai, khong phai mot', () => {
    const partner = 'partner-1';
    const carrier = { flow: 'CARRIER_SERVICE' as const, counterpartyId: partner };
    const referrer = { flow: 'PARTNER_COMMISSION' as const, counterpartyId: partner };

    expect(isSameLedger(carrier, referrer)).toBe(false);
    expect(ledgerKey(carrier.flow, partner)).not.toBe(ledgerKey(referrer.flow, partner));
  });

  it('cung dong + cung doi tac => cung mot so cai', () => {
    expect(
      isSameLedger(
        { flow: 'CARRIER_SERVICE', counterpartyId: 'p1' },
        { flow: 'CARRIER_SERVICE', counterpartyId: 'p1' },
      ),
    ).toBe(true);
  });

  it('cung dong + KHAC doi tac => hai so cai', () => {
    expect(
      isSameLedger(
        { flow: 'CUSTOMER_FREIGHT', counterpartyId: 'c1' },
        { flow: 'CUSTOMER_FREIGHT', counterpartyId: 'c2' },
      ),
    ).toBe(false);
  });

  /** Dong "cong ty va quy lai xe" thuoc `TX-03`; no khong duoc phep xuat hien o day. */
  it('KHONG co dong quy lai xe trong TX-05', () => {
    expect(SETTLEMENT_FLOWS).toHaveLength(4);
    expect(SETTLEMENT_FLOWS.some((flow) => flow.includes('DRIVER'))).toBe(false);
    expect(SETTLEMENT_FLOWS.some((flow) => flow.includes('FUND'))).toBe(false);
  });
});

/* ==================================================================== *
 * §2 DIEU KHOAN + CANH BAO — acceptance 2 va 3
 * ==================================================================== */

describe('TX-05 §2 — han thanh toan va canh bao cong no', () => {
  /** Acceptance 2: dieu khoan 30 ngay => han tat dinh. */
  it('30 ngay tu 2026-09-01 => 2026-10-01', () => {
    expect(dueDateFrom('2026-09-01', 30)).toBe('2026-10-01');
  });

  it('ho tro 15 / 30 / 45 ngay theo cau hinh khach', () => {
    expect(dueDateFrom('2026-09-01', 15)).toBe('2026-09-16');
    expect(dueDateFrom('2026-09-01', 45)).toBe('2026-10-16');
  });

  it('cong ngay di qua bien thang va nam nhuan', () => {
    expect(dueDateFrom('2026-12-20', 30)).toBe('2027-01-19');
    // 2028 la nam nhuan: 29/02 co that.
    expect(dueDateFrom('2028-02-27', 2)).toBe('2028-02-29');
  });

  it('so ngay am bi tu choi', () => {
    expect(() => dueDateFrom('2026-09-01', -1)).toThrow(RangeError);
  });

  /** Den han la ngay CUOI CUNG con dung han — lech mot ngay o day lam lech ca bao cao tuoi no. */
  it('dung ngay den han thi CHUA qua han', () => {
    expect(isOverdue('2026-10-01', '2026-10-01')).toBe(false);
    expect(isOverdue('2026-10-01', '2026-10-02')).toBe(true);
    expect(daysOverdue('2026-10-01', '2026-10-01')).toBe(0);
    expect(daysOverdue('2026-10-01', '2026-10-11')).toBe(10);
  });

  it('chung tu khong co han khong bao gio qua han', () => {
    expect(isOverdue(null, '2030-01-01')).toBe(false);
    expect(daysOverdue(null, '2030-01-01')).toBe(0);
  });

  it('so ngay qua han khong bao gio am', () => {
    expect(daysOverdue('2026-12-01', '2026-10-01')).toBe(0);
  });

  it('khung tuoi no cat dung o 30 va 60 ngay', () => {
    expect(agingBucketFor('2026-10-01', '2026-10-01')).toBe('CURRENT');
    expect(agingBucketFor('2026-10-01', '2026-10-31')).toBe('D1_30');
    expect(agingBucketFor('2026-10-01', '2026-11-30')).toBe('D31_60');
    expect(agingBucketFor('2026-10-01', '2026-12-31')).toBe('D60_PLUS');
    expect(agingBucketFor(null, '2030-01-01')).toBe('CURRENT');
  });

  /** Acceptance 3: canh bao, KHONG chan. Ham tra ve trang thai, khong nem, khong tra co chan. */
  it('vuot han muc => LIMIT_EXCEEDED, va do chi la mot nhan', () => {
    const exposure = assessCreditExposure({
      outstandingAmount: 120_000_000,
      overdueAmount: 0,
      overdueDocumentCount: 0,
      creditLimit: 100_000_000,
    });
    expect(exposure.warning).toBe('LIMIT_EXCEEDED');
    expect(exposure.headroomAmount).toBe(-20_000_000);
  });

  it('co chung tu qua han nhung trong han muc => OVERDUE', () => {
    expect(
      assessCreditExposure({
        outstandingAmount: 10_000_000,
        overdueAmount: 3_000_000,
        overdueDocumentCount: 1,
        creditLimit: 100_000_000,
      }).warning,
    ).toBe('OVERDUE');
  });

  it('vuot han muc thang OVERDUE khi ca hai cung dung', () => {
    expect(
      assessCreditExposure({
        outstandingAmount: 120_000_000,
        overdueAmount: 3_000_000,
        overdueDocumentCount: 1,
        creditLimit: 100_000_000,
      }).warning,
    ).toBe('LIMIT_EXCEEDED');
  });

  /** `null` (chua khai han muc) KHAC `0` (khong duoc no dong nao). */
  it('khong khai han muc KHAC han muc bang 0', () => {
    const unset = assessCreditExposure({
      outstandingAmount: 5_000_000,
      overdueAmount: 0,
      overdueDocumentCount: 0,
      creditLimit: null,
    });
    expect(unset.warning).toBe('NONE');
    expect(unset.headroomAmount).toBeNull();

    const zero = assessCreditExposure({
      outstandingAmount: 5_000_000,
      overdueAmount: 0,
      overdueDocumentCount: 0,
      creditLimit: 0,
    });
    expect(zero.warning).toBe('LIMIT_EXCEEDED');
    expect(zero.headroomAmount).toBe(-5_000_000);
  });
});

/* ==================================================================== *
 * §3 HOA HONG — acceptance 7 va 8
 * ==================================================================== */

const rule = (
  over: Partial<CommissionRuleCandidate> & { ruleId: string },
): CommissionRuleCandidate => ({
  ruleVersionId: `${over.ruleId}-v1`,
  version: 1,
  partnerId: null,
  routeKey: null,
  calcKind: 'PERCENTAGE',
  rateBasisPoints: 500,
  fixedAmount: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  ...over,
});

const TRIP = { partnerId: 'p1', routeKey: 'HN>HP', businessDate: '2026-09-01' };

describe('TX-05 §3 — chon luat hoa hong tat dinh', () => {
  it('khoa tuyen chuan hoa khoang trang va chu hoa', () => {
    expect(commissionRouteKey(' hn ', 'hp')).toBe('HN>HP');
    expect(commissionRouteKey('Hà Nội', 'Hải Phòng')).toBe('HÀ NỘI>HẢI PHÒNG');
  });

  it('pham vi suy dung tu hai truong tuy chon', () => {
    expect(scopeOf({ partnerId: 'p1', routeKey: 'HN>HP' })).toBe('PARTNER_ROUTE');
    expect(scopeOf({ partnerId: 'p1', routeKey: null })).toBe('PARTNER');
    expect(scopeOf({ partnerId: null, routeKey: 'HN>HP' })).toBe('ROUTE');
    expect(scopeOf({ partnerId: null, routeKey: null })).toBe('GLOBAL');
  });

  /** Mac dinh demo cua Issue #87: partner+route thang partner thang global. */
  it('partner+route THANG partner THANG global', () => {
    const candidates = [
      rule({ ruleId: 'global' }),
      rule({ ruleId: 'partner', partnerId: 'p1' }),
      rule({ ruleId: 'both', partnerId: 'p1', routeKey: 'HN>HP' }),
    ];
    const picked = selectCommissionRule(candidates, TRIP);
    expect(picked.outcome).toBe('SELECTED');
    if (picked.outcome !== 'SELECTED') throw new Error('unreachable');
    expect(picked.rule.ruleId).toBe('both');
    expect(picked.scope).toBe('PARTNER_ROUTE');
  });

  it('partner THANG route-only, va route-only THANG global', () => {
    const withPartner = selectCommissionRule(
      [
        rule({ ruleId: 'global' }),
        rule({ ruleId: 'route', routeKey: 'HN>HP' }),
        rule({ ruleId: 'partner', partnerId: 'p1' }),
      ],
      TRIP,
    );
    expect(withPartner.outcome === 'SELECTED' && withPartner.rule.ruleId).toBe('partner');

    const withoutPartner = selectCommissionRule(
      [rule({ ruleId: 'global' }), rule({ ruleId: 'route', routeKey: 'HN>HP' })],
      TRIP,
    );
    expect(withoutPartner.outcome === 'SELECTED' && withoutPartner.rule.ruleId).toBe('route');
  });

  /** Issue #87: nhap nhang cung bac phai FAIL CLOSED. */
  it('hai luat CUNG BAC => AMBIGUOUS, khong chon bua', () => {
    const picked = selectCommissionRule(
      [
        rule({
          ruleId: 'a',
          partnerId: 'p1',
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-12-31',
        }),
        rule({ ruleId: 'b', partnerId: 'p1', effectiveFrom: '2026-06-01' }),
      ],
      TRIP,
    );
    expect(picked.outcome).toBe('AMBIGUOUS');
    if (picked.outcome !== 'AMBIGUOUS') throw new Error('unreachable');
    expect(picked.ruleIds).toEqual(['a', 'b']);
    expect(picked.scope).toBe('PARTNER');
  });

  it('khong luat nao ap duoc => NO_RULE', () => {
    expect(selectCommissionRule([], TRIP).outcome).toBe('NO_RULE');
    expect(selectCommissionRule([rule({ ruleId: 'other', partnerId: 'p2' })], TRIP).outcome).toBe(
      'NO_RULE',
    );
  });

  it('luat het hieu luc hoac chua hieu luc thi khong ap', () => {
    expect(
      selectCommissionRule([rule({ ruleId: 'past', effectiveTo: '2026-08-31' })], TRIP).outcome,
    ).toBe('NO_RULE');
    expect(
      selectCommissionRule([rule({ ruleId: 'future', effectiveFrom: '2026-09-02' })], TRIP).outcome,
    ).toBe('NO_RULE');
  });

  it('dung ngay bien cua khoang hieu luc VAN ap duoc', () => {
    expect(
      selectCommissionRule(
        [rule({ ruleId: 'edge', effectiveFrom: '2026-09-01', effectiveTo: '2026-09-01' })],
        TRIP,
      ).outcome,
    ).toBe('SELECTED');
  });

  it('phan tram tinh trong so nguyen truoc khi chia', () => {
    // 5% cua 33.333.333 = 1.666.666,65 -> lam tron nua len.
    const amount = calculateCommission(
      { calcKind: 'PERCENTAGE', rateBasisPoints: 500, fixedAmount: null },
      33_333_333,
    );
    expect(amount.rawAmount).toBe('1666666.65');
    expect(amount.resultAmount).toBe(1_666_667);
  });

  it('so tien co dinh khong phu thuoc can cu', () => {
    const amount = calculateCommission(
      { calcKind: 'FIXED', rateBasisPoints: null, fixedAmount: 250_000 },
      99_000_000,
    );
    expect(amount.resultAmount).toBe(250_000);
    expect(amount.rawAmount).toBe('250000.00');
  });
});

/* ==================================================================== *
 * §4 SUA = GHI THEM — acceptance 11
 * ==================================================================== */

const identity = (over: Partial<SettlementDocumentIdentity> = {}): SettlementDocumentIdentity => ({
  direction: 'RECEIVABLE',
  flow: 'CUSTOMER_FREIGHT',
  counterpartyKind: 'CUSTOMER',
  counterpartyId: 'c1',
  kind: 'ORIGINAL',
  signedAmount: 10_000_000,
  currencyCode: 'VND',
  businessDate: '2026-09-01',
  dueDate: '2026-10-01',
  tripId: 'trip-1',
  adjustsId: null,
  ...over,
});

describe('TX-05 §4 — chung tu chi them, khong ghi de', () => {
  it('cung noi dung => cung van tay', () => {
    expect(settlementDocumentFingerprint(identity())).toBe(
      settlementDocumentFingerprint(identity()),
    );
  });

  it.each([
    ['signedAmount', { signedAmount: 10_000_001 }],
    ['dueDate', { dueDate: '2026-10-02' }],
    ['counterpartyId', { counterpartyId: 'c2' }],
    ['flow', { flow: 'CARRIER_SERVICE' as const }],
    ['businessDate', { businessDate: '2026-09-02' }],
  ])('lech `%s` => van tay KHAC', (_field, patch) => {
    expect(settlementDocumentFingerprint(identity(patch))).not.toBe(
      settlementDocumentFingerprint(identity()),
    );
  });

  it('ban dieu chinh mang CHENH LECH, khong mang so tuyet doi', () => {
    expect(adjustmentDelta(10_000_000, 12_000_000)).toBe(2_000_000);
    expect(adjustmentDelta(10_000_000, 8_000_000)).toBe(-2_000_000);
  });

  it('khong co gi doi thi khong sinh ban dieu chinh', () => {
    expect(adjustmentDelta(10_000_000, 10_000_000)).toBeNull();
  });

  it('ban dao doi dau toan bo, tong chuoi ve 0', () => {
    expect(reversalAmount(10_000_000)).toBe(-10_000_000);
    expect(outstandingOf([{ signedAmount: 10_000_000 }, { signedAmount: -10_000_000 }], [])).toBe(0);
  });

  it('da bi dao thi khong sua duoc nua', () => {
    expect(canAdjust({ kind: 'ORIGINAL', status: 'POSTED' })).toBe(true);
    expect(canAdjust({ kind: 'ORIGINAL', status: 'REVERSED' })).toBe(false);
  });

  it('khong sua mot ban sua — chi ban goc moi la dich', () => {
    expect(canAdjust({ kind: 'ADJUSTMENT', status: 'POSTED' })).toBe(false);
    expect(canAdjust({ kind: 'REVERSAL', status: 'POSTED' })).toBe(false);
  });

  it('so du = ban goc + moi ban sua - da thu', () => {
    const documents = [{ signedAmount: 10_000_000 }, { signedAmount: 2_000_000 }];
    expect(outstandingOf(documents, [])).toBe(12_000_000);
    expect(outstandingOf(documents, [{ amount: 5_000_000 }])).toBe(7_000_000);
  });

  it('chieu PAYABLE tien ve 0 tu phia am', () => {
    expect(outstandingOf([{ signedAmount: -8_000_000 }], [{ amount: 3_000_000 }])).toBe(-5_000_000);
  });
});

/* ==================================================================== *
 * §5 BIEN TRUC TIEP — acceptance 6 va 12
 * ==================================================================== */

const marginInput = (over: Partial<DirectMarginInput> = {}): DirectMarginInput => ({
  tripId: 'trip-1',
  tripKind: 'OWN_DIRECT',
  revenueAmount: 20_000_000,
  directCostAmount: 12_000_000,
  carrierPayableAmount: 0,
  commissionAmount: 0,
  currencyCode: 'VND',
  ...over,
});

describe('TX-05 §5 — bien truc tiep', () => {
  /** Acceptance 6: chuyen thue ngoai X/Y => bien X-Y, khong co chi phi van hanh noi bo. */
  it('chuyen thue xe ngoai: bien = X - Y', () => {
    const margin = computeDirectMargin(
      marginInput({
        tripKind: 'EXTERNAL_CARRIER',
        revenueAmount: 20_000_000,
        directCostAmount: 0,
        carrierPayableAmount: 15_000_000,
      }),
    );
    expect(margin.marginAmount).toBe(5_000_000);
    expect(margin.deductionAmount).toBe(15_000_000);
    expect(margin.unexpectedInternalCost).toBe(false);
  });

  /**
   * `INV-04` noi chuyen thue ngoai khong duoc co chi phi van hanh noi bo. Neu co thi day la du
   * lieu hong — bao ra, khong lang le cong vao roi cho ra mot bien nho hon.
   */
  it('chuyen thue ngoai co chi phi noi bo => BAO mau thuan, khong tru no', () => {
    const margin = computeDirectMargin(
      marginInput({
        tripKind: 'EXTERNAL_CARRIER',
        revenueAmount: 20_000_000,
        directCostAmount: 3_000_000,
        carrierPayableAmount: 15_000_000,
      }),
    );
    expect(margin.unexpectedInternalCost).toBe(true);
    expect(margin.marginAmount).toBe(5_000_000);
  });

  it('chuyen xe nha: bien = doanh thu - chi phi truc tiep - hoa hong', () => {
    const margin = computeDirectMargin(
      marginInput({
        tripKind: 'PARTNER_REFERRED_INTERNAL_RUN',
        revenueAmount: 20_000_000,
        directCostAmount: 12_000_000,
        commissionAmount: 1_000_000,
      }),
    );
    expect(margin.marginAmount).toBe(7_000_000);
    expect(margin.marginBasisPoints).toBe(3500);
  });

  it('chua nhap gia cuoc => khong tinh duoc, KHONG coi la 0', () => {
    const margin = computeDirectMargin(marginInput({ revenueAmount: null }));
    expect(margin.marginAmount).toBeNull();
    expect(margin.marginBasisPoints).toBeNull();
  });

  /** Acceptance 12: `GD-13` — phan bo chi phi co dinh TAT, va nhan phai di kem con so. */
  it('luon khai bao chua gom chi phi co dinh', () => {
    const margin = computeDirectMargin(marginInput());
    expect(margin.fixedCostsIncluded).toBe(false);
    expect(margin.disclosure).toBe('Chưa gồm chi phí cố định');
  });

  it('cong don bo qua chuyen chua co gia cuoc va dem lai', () => {
    const rollup = rollupDirectMargin([
      computeDirectMargin(marginInput({ tripId: 't1' })),
      computeDirectMargin(marginInput({ tripId: 't2', revenueAmount: null })),
    ]);
    expect(rollup.tripCount).toBe(1);
    expect(rollup.skippedTripCount).toBe(1);
    expect(rollup.marginAmount).toBe(8_000_000);
    expect(rollup.fixedCostsIncluded).toBe(false);
  });

  it('cong don rong khong chia cho 0', () => {
    expect(rollupDirectMargin([]).marginBasisPoints).toBeNull();
  });
});
