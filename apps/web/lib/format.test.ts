import { describe, expect, it } from 'vitest';
import { formatVnd } from './format';

describe('formatVnd', () => {
  it('dinh dang tong don mau TH1 11.500.000', () => {
    expect(formatVnd(11_500_000)).toContain('11.500.000');
  });

  it('dinh dang so 0', () => {
    expect(formatVnd(0)).toContain('0');
  });

  it('nem loi voi gia tri khong huu han', () => {
    expect(() => formatVnd(Number.NaN)).toThrowError(TypeError);
    expect(() => formatVnd(Number.POSITIVE_INFINITY)).toThrowError(TypeError);
  });
});
