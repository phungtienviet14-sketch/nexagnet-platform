import { describe, expect, it } from 'vitest';
import { INTENTS } from '@netviet/shared';
import type { ParserInput } from './order-parser.js';
import {
  buildSystemPrompt,
  coerceVnd,
  ensureIntentConfidence,
  normalizeParserOutput,
  parseJsonLoose,
} from './parser-prompt.js';

const input: ParserInput = {
  text: 'test',
  products: [{ sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix'], unit: 'cái' }],
  glossary: [{ term: 'TN', meaning: 'Thái Nguyên' }],
};

describe('buildSystemPrompt', () => {
  it('chua DU 7 intent + yeu cau confidence.intent', () => {
    const p = buildSystemPrompt(input);
    for (const intent of INTENTS) expect(p).toContain(intent);
    expect(p).toContain('confidence.intent');
  });

  it('nhung danh muc SKU + glossary + quy tac VAT', () => {
    const p = buildSystemPrompt(input);
    expect(p).toContain('Ghế Felix');
    expect(p).toContain('TN=Thái Nguyên');
    expect(p).toContain('wantVat');
  });
});

describe('ensureIntentConfidence', () => {
  it('giu gia tri khi da co', () => {
    expect(ensureIntentConfidence({ intent: 0.9 }, 0.7).intent).toBe(0.9);
  });
  it('gan mac dinh khi thieu', () => {
    expect(ensureIntentConfidence({}, 0.7).intent).toBe(0.7);
  });
});

describe('normalizeParserOutput', () => {
  it('BO "order" khi intent != dat_don (LLM hay chen order rong)', () => {
    const out = normalizeParserOutput({
      intent: 'hoi_gia',
      order: { orderType: 'TH1', items: [{ skuRaw: '', quantity: 0 }] },
      confidence: { intent: 0.9 },
    }) as Record<string, unknown>;
    expect('order' in out).toBe(false);
    expect(out.intent).toBe('hoi_gia');
  });

  it('GIU "order" khi intent = dat_don', () => {
    const out = normalizeParserOutput({
      intent: 'dat_don',
      order: { orderType: 'TH1', items: [{ skuRaw: 'felix', quantity: 2 }] },
    }) as Record<string, unknown>;
    expect('order' in out).toBe(true);
  });

  it('EP tien tat dang chuoi ve so ("11tr5" -> 11500000)', () => {
    const out = normalizeParserOutput({
      intent: 'dat_don',
      order: { orderType: 'TH1', items: [{ skuRaw: 'felix', quantity: 10 }], totalRaw: '11tr5' },
    }) as { order: { totalRaw: number } };
    expect(out.order.totalRaw).toBe(11_500_000);
  });
});

describe('coerceVnd (đọc tiền tắt VN)', () => {
  it.each([
    ['11tr5', 11_500_000],
    ['4tr', 4_000_000],
    ['1.150k', 1_150_000],
    ['890k', 890_000],
    ['12.950k', 12_950_000],
    ['11500000', 11_500_000],
    ['1.150.000', 1_150_000],
  ])('"%s" -> %d', (input, expected) => {
    expect(coerceVnd(input)).toBe(expected);
  });

  it('so nguyen giu nguyen; chuoi rac -> undefined', () => {
    expect(coerceVnd(5000)).toBe(5000);
    expect(coerceVnd('abc')).toBeUndefined();
  });

  it('cho qua gia tri khong phai object', () => {
    expect(normalizeParserOutput(null)).toBeNull();
  });
});

describe('parseJsonLoose', () => {
  it('parse JSON thuong', () => {
    expect(parseJsonLoose('{"intent":"khac"}')).toEqual({ intent: 'khac' });
  });
  it('parse JSON bi boc ```json fence', () => {
    expect(parseJsonLoose('```json\n{"intent":"dat_don"}\n```')).toEqual({ intent: 'dat_don' });
  });
  it('nem khi khong co JSON', () => {
    expect(() => parseJsonLoose('day khong phai json')).toThrow();
  });
});
