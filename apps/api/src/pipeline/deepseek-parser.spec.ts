import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ParserInput } from './order-parser.js';
import { DeepSeekParser } from './deepseek-parser.js';

const input: ParserInput = {
  text: 'ghe felix bao nhieu tien',
  products: [{ sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix'], unit: 'cái' }],
  glossary: [],
};

function fetchReturning(status: number, content?: string) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => content ?? '',
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

afterEach(() => vi.restoreAllMocks());

describe('DeepSeekParser (fetch mock — khong goi API that)', () => {
  it('output hop le -> tra dung intent + confidence', async () => {
    vi.stubGlobal('fetch', fetchReturning(200, JSON.stringify({ intent: 'hoi_gia', confidence: { intent: 0.95 } })));
    const r = await new DeepSeekParser('key').parse(input);
    expect(r.intent).toBe('hoi_gia');
    expect(r.confidence.intent).toBe(0.95);
  });

  it('output thieu confidence -> gan mac dinh > 0', async () => {
    const body = JSON.stringify({ intent: 'dat_don', order: { orderType: 'TH1', items: [{ skuRaw: 'felix', quantity: 2 }] } });
    vi.stubGlobal('fetch', fetchReturning(200, body));
    const r = await new DeepSeekParser('key').parse(input);
    expect(r.intent).toBe('dat_don');
    expect(r.confidence.intent).toBeGreaterThan(0);
  });

  it('output boc ```json fence van parse duoc', async () => {
    vi.stubGlobal('fetch', fetchReturning(200, '```json\n{"intent":"van_chuyen","confidence":{"intent":0.8}}\n```'));
    const r = await new DeepSeekParser('key').parse(input);
    expect(r.intent).toBe('van_chuyen');
  });

  it('loi 500 -> RETRY roi fallback khac (confidence 0)', async () => {
    const f = fetchReturning(500, 'server error');
    vi.stubGlobal('fetch', f);
    const r = await new DeepSeekParser('key').parse(input);
    expect(r.intent).toBe('khac');
    expect(r.confidence.intent).toBe(0);
    expect(f).toHaveBeenCalledTimes(2); // 1 goc + 1 retry
  });

  it('JSON hong -> fallback khac, KHONG retry', async () => {
    const f = fetchReturning(200, 'day khong phai json');
    vi.stubGlobal('fetch', f);
    const r = await new DeepSeekParser('key').parse(input);
    expect(r.intent).toBe('khac');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
