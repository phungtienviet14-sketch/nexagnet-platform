import { describe, expect, it } from 'vitest';
import { parseGoldenEvalReport } from './golden-eval-report.js';

describe('parseGoldenEvalReport', () => {
  it('returns the explicit missing dataset reason when no external report exists', () => {
    expect(parseGoldenEvalReport(null)).toEqual({
      evaluated: false,
      passed: false,
      reason: 'missing_golden_dataset',
    });
  });

  it('accepts a complete passing report written by the eval harness', () => {
    expect(
      parseGoldenEvalReport(
        JSON.stringify({
          goLiveReady: true,
          evaluatedAt: '2026-08-12T03:00:00.000Z',
          totalCases: 25,
          metrics: {
            intentAccuracy: 1,
            fieldAccuracy: 1,
            skuAccuracy: 1,
            quantityAccuracy: 1,
            dealerAccuracy: 1,
            policyResolutionAccuracy: 1,
            totalRulesAccuracy: 1,
            autoConfirmEligibilityAccuracy: 1,
          },
          mismatches: [],
        }),
      ),
    ).toMatchObject({ evaluated: true, passed: true, totalCases: 25 });
  });

  it('fails closed for malformed or incomplete reports', () => {
    expect(parseGoldenEvalReport('{bad json')).toMatchObject({
      evaluated: false,
      passed: false,
      reason: 'invalid_golden_eval_report',
    });
    expect(parseGoldenEvalReport('{"goLiveReady":true}')).toMatchObject({
      evaluated: false,
      passed: false,
      reason: 'invalid_golden_eval_report',
    });
  });
});
