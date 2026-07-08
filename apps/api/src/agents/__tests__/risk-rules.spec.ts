import { describe, expect, it } from 'vitest';
import type { PricedOrder } from '@ultty/shared';
import type { PriceRow, Product } from '../../knowledge/domain.js';
import { DEFAULT_AGENTS_CONFIG } from '../agents.config.js';
import { annotatePolicy, assessRisk, buildQuoteLines, classifyWarranty } from '../risk-rules.js';

const CFG = DEFAULT_AGENTS_CONFIG;

function priced(grandTotal: number, quantity: number, warnings: string[] = []): PricedOrder {
  return {
    orderType: 'TH1',
    dealerName: 'X',
    branch: 'HN',
    lines: [
      {
        skuRaw: 'x',
        sku: 'X',
        productName: 'X',
        quantity,
        unitPrice: quantity ? grandTotal / quantity : 0,
        lineTotal: grandTotal,
        matched: true,
      },
    ],
    itemsSubtotal: grandTotal,
    shippingFee: 0,
    policy: 'cong_no_30',
    codCollect: false,
    codFee: 0,
    vat: false,
    vatAmount: 0,
    grandTotal,
    warnings,
    confirmationText: '',
  };
}

describe('assessRisk (Giám sát)', () => {
  it('don sach, dai ly ro, tin cay cao -> khong rui ro', () => {
    const r = assessRisk(priced(5_000_000, 5), 0.9, true, 'gui 5 ghe felix', CFG);
    expect(r.riskLevel).toBe('none');
    expect(r.escalate).toBe(false);
  });

  it('don lon bat thuong -> leo thang', () => {
    const r = assessRisk(priced(60_000_000, 50), 0.9, true, 'gui 50 ghe', CFG);
    expect(r.escalate).toBe(true);
    expect(r.reasons.some((x) => x.includes('lớn'))).toBe(true);
  });

  it('chua xac dinh dai ly -> leo thang', () => {
    const r = assessRisk(null, 0.9, false, 'xin bao gia', CFG);
    expect(r.escalate).toBe(true);
  });

  it('khieu nai gat -> leo thang', () => {
    const r = assessRisk(null, 0.9, true, 'dich vu qua te toi se kien', CFG);
    expect(r.escalate).toBe(true);
  });

  it('do tin cay thap -> theo doi (watch), khong leo thang', () => {
    const r = assessRisk(null, 0.3, true, 'abc xyz', CFG);
    expect(r.riskLevel).toBe('watch');
    expect(r.escalate).toBe(false);
  });

  it('priced null khong lam vo (tin khong phai don)', () => {
    expect(() => assessRisk(null, 0.9, true, 'ghe felix co tot khong', CFG)).not.toThrow();
  });
});

describe('classifyWarranty (Hậu mãi)', () => {
  it('giao sai/thieu', () => {
    expect(classifyWarranty('giao thieu 1 cai', CFG).branchLabel).toBe('Giao sai/thiếu');
  });
  it('trong 7 ngay', () => {
    expect(classifyWarranty('moi mua hom qua da loi', CFG).branchLabel).toBe('Trong 7 ngày');
  });
  it('ngoai 7 ngay (mac dinh)', () => {
    expect(classifyWarranty('ghe dung mot thoi gian bi loi', CFG).branchLabel).toBe('Ngoài 7 ngày');
  });
});

describe('buildQuoteLines (báo giá tất định)', () => {
  const products: Product[] = [
    { sku: 'GHE-FELIX', name: 'Ghế Felix', aliases: ['felix', 'ghe felix'], unit: 'cái' },
  ];
  const prices: PriceRow[] = [{ sku: 'GHE-FELIX', prices: { dai_ly: 1_150_000, ctv: 1_250_000 } }];

  it('tra dung don gia theo cap dai ly', () => {
    const q = buildQuoteLines('bao gia ghe felix', products, prices, 'dai_ly');
    expect(q).toEqual([{ name: 'Ghế Felix', unitPrice: 1_150_000 }]);
  });

  it('tra dung don gia theo cap CTV', () => {
    const q = buildQuoteLines('ghe felix bao nhieu', products, prices, 'ctv');
    expect(q[0]?.unitPrice).toBe(1_250_000);
  });
});

describe('annotatePolicy — chỉ format từ PricedOrder', () => {
  it('nhac chinh sach + trang thai VAT tu priced', () => {
    const notes = annotatePolicy(priced(5_000_000, 5));
    expect(notes).toContain('Công nợ 30 ngày');
    expect(notes).toContain('Không xuất VAT');
  });
});
