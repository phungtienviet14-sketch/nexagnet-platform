import { describe, expect, it, vi } from 'vitest';
import {
  createUsageMeter,
  reportOpenAiCompatibleUsage,
  type OpenAiCompatibleUsage,
} from './llm-usage.js';

describe('createUsageMeter', () => {
  it('cong don qua NHIEU vong goi cong cu', () => {
    const meter = createUsageMeter();
    meter.report({ inputTokens: 3_100, outputTokens: 120 });
    meter.report({ inputTokens: 880, outputTokens: 90 });
    expect(meter.total()).toEqual({ inputTokens: 3_980, outputTokens: 210 });
  });

  /*
   * `null` chu khong phai `{0,0}`. Hai su that khac han nhau: "khong dem duoc" (Flowise, Mock,
   * provider doi phien ban) va "ton 0 token" (khong ton tai trong thuc te). Mot trace ghi
   * `0 -> 0 tok` lam nguoi doc tin rang da co so lieu — do la kieu nhan sai ma muc 9.4 goi la
   * "te hon khong co nhan".
   */
  it('khong ai bao gi -> `null`, khong phai so 0', () => {
    expect(createUsageMeter().total()).toBeNull();
  });

  it('so rac tu provider khong lam hong ban ghi', () => {
    const meter = createUsageMeter();
    meter.report({ inputTokens: Number.NaN, outputTokens: 10 });
    expect(meter.total()).toBeNull();

    meter.report({ inputTokens: 100, outputTokens: 20 });
    meter.report({ inputTokens: 5, outputTokens: Number.POSITIVE_INFINITY });
    expect(meter.total()).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  it('hai luot chay song song khong tron so vao nhau', () => {
    const a = createUsageMeter();
    const b = createUsageMeter();
    a.report({ inputTokens: 10, outputTokens: 1 });
    b.report({ inputTokens: 500, outputTokens: 50 });
    a.report({ inputTokens: 10, outputTokens: 1 });
    expect(a.total()).toEqual({ inputTokens: 20, outputTokens: 2 });
    expect(b.total()).toEqual({ inputTokens: 500, outputTokens: 50 });
  });
});

describe('reportOpenAiCompatibleUsage', () => {
  it('doi khuon `prompt_tokens`/`completion_tokens` cua DeepSeek', () => {
    const meter = createUsageMeter();
    reportOpenAiCompatibleUsage({ prompt_tokens: 1_200, completion_tokens: 64 }, meter.report);
    expect(meter.total()).toEqual({ inputTokens: 1_200, outputTokens: 64 });
  });

  it('thieu khoi `usage` (loi HTTP, phien ban API khac) -> khong bao gi', () => {
    const meter = createUsageMeter();
    reportOpenAiCompatibleUsage(undefined, meter.report);
    expect(meter.total()).toBeNull();
  });

  it('khoi `usage` thieu truong -> bo qua, KHONG ghi mot nua su that', () => {
    const meter = createUsageMeter();
    reportOpenAiCompatibleUsage({ prompt_tokens: 1_200 } as OpenAiCompatibleUsage, meter.report);
    expect(meter.total()).toBeNull();
  });

  it('khong co nguoi nhan -> khong no', () => {
    expect(() =>
      reportOpenAiCompatibleUsage({ prompt_tokens: 1, completion_tokens: 1 }, undefined),
    ).not.toThrow();
  });

  it('goi dung MOT lan cho moi lan goi API', () => {
    const report = vi.fn();
    reportOpenAiCompatibleUsage({ prompt_tokens: 5, completion_tokens: 5 }, report);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
