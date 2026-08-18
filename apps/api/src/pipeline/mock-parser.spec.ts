import { describe, expect, it } from 'vitest';
import type { GlossaryEntry, Product } from '../knowledge/domain.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
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
    expect(r.order?.items?.[0]?.quantity).toBe(10);
    expect(r.order?.items?.[0]?.skuRaw.toLowerCase()).toContain('felix');
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
    expect(r.order?.items?.[0]?.quantity).toBe(5);
  });

  it('mac dinh noVat=false khi khong ghi ko VAT', async () => {
    const r = await run('gui 3 ghe felix');
    expect(r.order?.noVat).toBe(false);
  });

  it('nhan dien typo thuc te "quat tich dine" tu goi du lieu tenant', async () => {
    const knowledge = new KnowledgeService();
    const r = await parser.parse({
      text: 'gửi tn cho chị 4 con quạt tích đinẹ nhé',
      products: knowledge.products(),
      glossary: knowledge.glossary(),
    });

    expect(r.intent).toBe('dat_don');
    expect(r.order?.items).toEqual([{ skuRaw: 'quat tich dine', quantity: 4 }]);
  });

  it('combo khong bi dem trung voi SP thanh phan (alias con la substring)', async () => {
    const comboProducts: Product[] = [
      { sku: 'WFX', name: 'May rua WFX', aliases: ['wfx', 'may rua thuc pham'], unit: 'cai' },
      { sku: 'COMBO', name: 'Combo WFX PF360', aliases: ['combo wfx', 'wfx pf360', 'combo rua rau'], unit: 'bo' },
    ];
    const r = await parser.parse({
      text: 'cho e 2 combo wfx pf360',
      products: comboProducts,
      glossary,
      botName: 'Bot ultty AI orders',
    });
    // Chi 1 dong (COMBO), khong co dong WFX ma.
    expect(r.order?.items).toHaveLength(1);
    expect(r.order?.items?.[0]?.quantity).toBe(2);
  });

  it('reply bo sung so luong ke thua SKU tu quote duy nhat', async () => {
    const r = await parser.parse({
      text: 'c them 5c nhe',
      products,
      glossary,
      context: {
        quotedMessage: {
          externalMessageId: 'm-original',
          text: '10 ghe felix',
          senderRole: 'customer',
          sentAt: new Date('2026-08-12T02:00:00.000Z'),
        },
        recentMessages: [],
        participants: [],
      },
    });

    expect(r.intent).toBe('dat_don');
    expect(r.order?.items).toEqual([{ skuRaw: 'ghe felix', quantity: 5 }]);
  });

  it('reply mo ho co nhieu SKU -> khong doan', async () => {
    const r = await parser.parse({
      text: 'c them 5c nhe',
      products,
      glossary,
      context: {
        quotedMessage: {
          externalMessageId: 'm-original',
          text: '10 ghe felix va 2 noi chien',
          senderRole: 'customer',
          sentAt: new Date('2026-08-12T02:00:00.000Z'),
        },
        recentMessages: [],
        participants: [],
      },
    });

    expect(r.intent).toBe('khac');
    expect(r.order).toBeUndefined();
  });
});
