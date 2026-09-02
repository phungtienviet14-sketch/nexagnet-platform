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

  it('dua quote va lich su bounded vao prompt kem quy tac khong doan', () => {
    const p = buildSystemPrompt({
      ...input,
      // Moc thoi gian co dinh -> "5 phut truoc" on dinh, test khong phu thuoc dong ho.
      sentAt: new Date('2026-08-12T02:06:00.000Z'),
      context: {
        quotedMessage: {
          externalMessageId: 'm-1',
          text: '10 Ghế Felix',
          senderRole: 'customer',
          sentAt: new Date('2026-08-12T02:00:00.000Z'),
        },
        recentMessages: [
          {
            externalMessageId: 'm-2',
            text: 'giao ve TN',
            senderDisplayName: 'Meta HN',
            senderRole: 'customer',
            sentAt: new Date('2026-08-12T02:01:00.000Z'),
          },
        ],
        participants: [],
      },
    });

    expect(p).toContain('TIN DUOC REPLY: 10 Ghế Felix');
    expect(p).toContain('[KHACH Meta HN] (5 phut truoc): giao ve TN');
    expect(p).toContain('Context mo ho');
  });

  /*
   * SU CO 02/09/2026 (deploy ultty/gd1-test #33625765042): mot don viet dang BANG KE
   * "<Chi nhanh>_<Ngay>_<Dai ly>, <so luong> x <SP>" bi phan loai `khac` voi confidence 0.30.
   *
   * Cai thieu la o HOP DONG PHAN LOAI, khong o mot khach cu the: moi vi du few-shot cua `dat_don`
   * deu la cau MENH LENH co dong tu ("gui 10 ...", "... dat 5 ..."), trong khi dang bang ke —
   * dang ma dai ly go nhieu nhat — khong co vi du nao. Mot cau nam ngay ranh gioi quyet dinh thi
   * chi can them mot token la la lat sang `khac`, va do dung la thu da xay ra.
   *
   * Hai quy tac duoi day la HINH DANG CAU, khong phai ten khach: khong SKU, khong ten dai ly,
   * khong `if tenant === ...`. Dung cho moi goi khach.
   */
  it('day dang BANG KE "<so luong> x <SP>" ve dat_don, khong doi phai co dong tu', () => {
    const p = buildSystemPrompt(input);
    expect(p).toContain('<so luong> x <ten SP>');
    expect(p).toContain('intent=dat_don');
    expect(p).toMatch(/KHONG doi phai co dong tu/);
    // Tieu de chi nhanh_ngay_dai ly la SIEU DU LIEU, khong phai co de goi tin la "mo ho".
    expect(p).toContain('<Chi nhanh>_<Ngay>_<Ten dai ly>');
  });

  it('mot token la khong duoc lam doi phan loai', () => {
    const p = buildSystemPrompt(input);
    expect(p).toMatch(/MOT TOKEN LA KHONG DOI DUOC PHAN LOAI/);
    expect(p).toMatch(/BO QUA phan khong hieu duoc/);
  });

  /**
   * DOI CHUNG AM — quy tac tren KHONG duoc bien thanh "cu co so la dat_don". Tin mo ho that su
   * van phai co duong ve `khac`, va mot y dinh khac da ro rang van phai thang.
   */
  it('VAN giu duong ve khac cho tin mo ho — khong noi long chong over-classify', () => {
    const p = buildSystemPrompt(input);
    expect(p).toContain('intent=khac va confidence.intent thap');
    expect(p).toMatch(/TRU KHI trong tin co dau hieu ro rang cua mot y dinh khac/);
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
