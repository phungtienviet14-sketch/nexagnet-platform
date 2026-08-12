import { describe, expect, it } from 'vitest';
import {
  computeGoldenMetrics,
  missingGoldenDatasetResult,
  parseGoldenDataset,
  type GoldenCase,
  type OrderViewLike,
} from './eval-core.js';

describe('golden eval core', () => {
  it('khong co golden dataset -> GO_LIVE_READY=false va reason ro rang', () => {
    expect(missingGoldenDatasetResult()).toEqual({
      goLiveReady: false,
      reason: 'missing_golden_dataset',
    });
  });

  it('validate golden dataset va tu choi item thieu expected', () => {
    expect(() => parseGoldenDataset([{ text: 'gui 10 ghe' }])).toThrow(/expected/);
  });

  it('tinh du metric intent, field, sku, quantity, dealer, policy, total va auto-confirm', () => {
    const cases: GoldenCase[] = [
      {
        text: 'Meta HN gui 2 FELIX',
        expected: {
          intent: 'dat_don',
          dealerName: 'Meta HN',
          policy: 'cong_no_30',
          autoConfirmEligible: true,
          order: {
            orderType: 'TH1',
            items: [{ sku: 'FELIX', quantity: 2 }],
            grandTotal: 2_300_000,
          },
        },
      },
    ];
    const views: OrderViewLike[] = [
      {
        intent: 'dat_don',
        dealerName: 'Meta HN',
        status: 'sent',
        parsed: { orderType: 'TH1', items: [{ skuRaw: 'FELIX', quantity: 2 }] },
        priced: {
          grandTotal: 2_300_000,
          lines: [{ sku: 'FELIX', quantity: 2 }],
          policy: 'cong_no_30',
        },
      },
    ];

    const result = computeGoldenMetrics(cases, views);

    expect(result.goLiveReady).toBe(true);
    expect(result.metrics.intentAccuracy).toBe(1);
    expect(result.metrics.fieldAccuracy).toBe(1);
    expect(result.metrics.skuAccuracy).toBe(1);
    expect(result.metrics.quantityAccuracy).toBe(1);
    expect(result.metrics.dealerAccuracy).toBe(1);
    expect(result.metrics.policyResolutionAccuracy).toBe(1);
    expect(result.metrics.totalRulesAccuracy).toBe(1);
    expect(result.metrics.autoConfirmEligibilityAccuracy).toBe(1);
  });
});
