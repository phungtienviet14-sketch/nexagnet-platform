import { describe, expect, it } from 'vitest';
import {
  allocationBalance,
  differenceAmount,
  reconciliationGross,
} from './customer-ar-documents.js';

describe('Customer AR money folds', () => {
  it('giu differenceAmount la do lon chenh lech, khong ghi de proposedAmount', () => {
    expect(differenceAmount(10_000_000, 9_000_000)).toBe(1_000_000);
    expect(differenceAmount(9_000_000, 10_000_000)).toBe(1_000_000);
  });

  it('adjustment va reversal la signed deltas tren confirmed gross', () => {
    expect(reconciliationGross([10_000_000, -1_000_000])).toBe(9_000_000);
    expect(reconciliationGross([10_000_000, -1_000_000, -9_000_000])).toBe(0);
  });

  it('release phan bo khoi phuc ca payment credit va receivable outstanding', () => {
    expect(allocationBalance([{ kind: 'APPLY', amount: 300 }, { kind: 'RELEASE', amount: 300 }])).toBe(
      0,
    );
  });
});
