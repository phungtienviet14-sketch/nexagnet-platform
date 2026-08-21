import { describe, expect, it } from 'vitest';
import { parseResultSchema } from '@netviet/shared';
import { normalizeParserOutput } from './parser-prompt.js';

/**
 * Don NUA VOI di tu LLM ve tang pipeline (Pha 6).
 *
 * Day la mot duong LOI IM LANG dac trung: `partialOrderSchema` doi `quantity` la SO, LLM tra
 * `"20"`, ca `parseResultSchema` hong, parser roi ve `intent=khac` — cau tra loi cua khach bi vut
 * ma khong co dong log nao noi vi sao. Cac ca duoi khoa dung cho do.
 */

const parse = (raw: unknown) => parseResultSchema.safeParse(normalizeParserOutput(raw));

describe('normalizeParserOutput — don nua voi', () => {
  it('giu draft khi intent=dat_don', () => {
    const result = parse({
      intent: 'dat_don',
      draft: { items: [{ skuRaw: 'ghe felix' }] },
      confidence: { intent: 0.8 },
    });

    expect(result.success && result.data.draft?.items).toEqual([{ skuRaw: 'ghe felix' }]);
  });

  it('ep so luong dang CHUOI ve so — neu khong ca ket qua parse bi vut', () => {
    const result = parse({
      intent: 'dat_don',
      draft: { items: [{ quantity: '20' }] },
      confidence: { intent: 0.7 },
    });

    expect(result.success && result.data.draft?.items).toEqual([{ quantity: 20 }]);
  });

  it('ep gia viet tat trong draft ("1.150k") ve so nguyen dong', () => {
    const result = parse({
      intent: 'dat_don',
      draft: { items: [{ skuRaw: 'ghe felix', unitPriceRaw: '1.150k' }] },
      confidence: { intent: 0.7 },
    });

    expect(result.success && result.data.draft?.items[0]?.unitPriceRaw).toBe(1_150_000);
  });

  it('BO draft khi intent khong phai dat_don — cung luat voi order', () => {
    const result = parse({
      intent: 'hoi_gia',
      draft: { items: [{ skuRaw: 'ghe felix' }] },
      confidence: { intent: 0.9 },
    });

    expect(result.success && result.data.draft).toBeUndefined();
  });

  it('BO draft rong — mot tin khong noi ve don hang khong duoc mo mach', () => {
    const result = parse({ intent: 'dat_don', draft: { items: [] }, confidence: { intent: 0.5 } });

    expect(result.success && result.data.draft).toBeUndefined();
  });

  it('don DAY DU van di duong cu, khong bi draft chen vao', () => {
    const result = parse({
      intent: 'dat_don',
      order: { orderType: 'TH1', items: [{ skuRaw: 'ghe felix', quantity: 10 }], noVat: true },
      confidence: { intent: 0.95 },
    });

    expect(result.success && result.data.order?.items).toEqual([
      { skuRaw: 'ghe felix', quantity: 10 },
    ]);
  });
});
