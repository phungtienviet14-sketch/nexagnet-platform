import { describe, expect, it } from 'vitest';
import type { GlossaryEntry, Product } from '../knowledge/domain.js';
import { MockParser } from './mock-parser.js';

const products: Product[] = [
  { sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix', 'ghe felix'], unit: 'cai' },
  { sku: 'NOI-CHIEN', name: 'Nồi chiên không dầu', aliases: ['noi chien', 'ncked'], unit: 'cai' },
];
const glossary: GlossaryEntry[] = [
  { term: 'TN', meaning: 'Thái Nguyên' },
  { term: 'c', meaning: 'chị' },
];
const parser = new MockParser();

function run(text: string) {
  return parser.parse({ text, products, glossary, botName: 'Bot ultty AI orders' });
}

describe('MockParser', () => {
  it('trich xuat don TH1: so luong + SP + khong VAT', async () => {
    const r = await run('@Bot ultty AI orders gui 10 ghe felix ve TN cho c, ko lay VAT');
    expect(r.intent).toBe('dat_don');
    expect(r.order?.items).toHaveLength(1);
    expect(r.order?.items[0].quantity).toBe(10);
    expect(r.order?.items[0].skuRaw.toLowerCase()).toContain('felix');
    expect(r.order?.noVat).toBe(true);
  });

  it('trich xuat nhieu mat hang', async () => {
    const r = await run('10 x ghe felix va 2 noi chien');
    expect(r.intent).toBe('dat_don');
    expect(r.order?.items).toHaveLength(2);
    const qtys = r.order?.items.map((i) => i.quantity).sort((a, b) => a - b);
    expect(qtys).toEqual([2, 10]);
  });

  it('phan biet cau hoi gia (khong phai dat don)', async () => {
    const r = await run('ghe felix bao nhieu tien c oi');
    expect(r.intent).toBe('hoi_gia');
    expect(r.order).toBeUndefined();
  });

  it('tin khong lien quan -> intent khac', async () => {
    const r = await run('@Bot ultty AI orders xin chao moi nguoi');
    expect(r.intent).toBe('khac');
    expect(r.order).toBeUndefined();
  });

  it('boc @mention khoi noi dung, khong coi ten bot la SP', async () => {
    const r = await run('@Bot ultty AI orders 5 noi chien');
    expect(r.order?.items).toHaveLength(1);
    expect(r.order?.items[0].quantity).toBe(5);
  });

  it('mac dinh noVat=false khi khong ghi ko VAT', async () => {
    const r = await run('gui 3 ghe felix');
    expect(r.order?.noVat).toBe(false);
  });
});
