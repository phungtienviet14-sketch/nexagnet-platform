import { describe, expect, it } from 'vitest';
import { rankFaqs, type GlossaryTerm } from './faq-ranking.js';

/**
 * Pha 5 — RED truoc GREEN.
 *
 * Bo xep hang cu (`content.service.ts` truoc 19/08/2026) dem so tu >=3 ky tu cua CAU HOI FAQ
 * xuat hien trong tin khach bang `String.includes` — tuc so khop CHUOI CON, khong phai token, va
 * khong biet gi ve viet tat. Ma viet tat chinh la dac thu dau vao da ghi trong CLAUDE.md.
 */

const faq = (id: string, question: string) => ({ id, question });

const GLOSSARY: GlossaryTerm[] = [
  { term: 'bn', meaning: 'bao nhiêu' },
  { term: 't', meaning: 'tiền' },
  { term: 'cs', meaning: 'công suất' },
  { term: 'w', meaning: 'watt' },
  { term: 'ntn', meaning: 'như thế nào' },
  { term: 'k', meaning: 'không (sau chữ) / nghìn (sau số)' },
  { term: 'c', meaning: 'chị' },
];

describe('rankFaqs — mo rong viet tat qua glossary tenant', () => {
  it('"bn tien" khop FAQ viet du "Gia bao nhieu tien?"', () => {
    const faqs = [faq('gia', 'Giá bao nhiêu tiền?'), faq('bh', 'Bảo hành mấy năm?')];

    const ranked = rankFaqs(faqs, 'bn tien', GLOSSARY);

    expect(ranked.map((item) => item.id)).toEqual(['gia']);
  });

  it('"con nay cs bn w" khop FAQ cong suat — ba viet tat trong mot cau', () => {
    const faqs = [faq('cs', 'Công suất bao nhiêu watt?'), faq('mau', 'Có những màu nào?')];

    const ranked = rankFaqs(faqs, 'con nay cs bn w', GLOSSARY);

    expect(ranked[0]?.id).toBe('cs');
  });

  it('"ve sinh mang loc ntn" khop FAQ ve sinh', () => {
    const faqs = [faq('vs', 'Vệ sinh màng lọc như thế nào?'), faq('ship', 'Phí ship bao nhiêu?')];

    const ranked = rankFaqs(faqs, 've sinh mang loc ntn', GLOSSARY);

    expect(ranked[0]?.id).toBe('vs');
  });

  it('khong co glossary thi van chay — mo rong la phan cong them, khong phai dieu kien', () => {
    const faqs = [faq('vs', 'Vệ sinh màng lọc thế nào?')];

    expect(rankFaqs(faqs, 've sinh mang loc', []).map((item) => item.id)).toEqual(['vs']);
  });
});

describe('rankFaqs — khop theo TOKEN, khong phai chuoi con', () => {
  it('"giao hang" khong keo FAQ chua "gia" (chuoi con cua "giao")', () => {
    const faqs = [faq('gia', 'Giá sản phẩm?')];

    expect(rankFaqs(faqs, 'giao hang toi dau', GLOSSARY)).toEqual([]);
  });

  it('"bao hanh" van khop dung FAQ bao hanh', () => {
    const faqs = [faq('bh', 'Bảo hành bao lâu?'), faq('gia', 'Giá sản phẩm?')];

    expect(rankFaqs(faqs, 'bao hanh bao lau', GLOSSARY).map((item) => item.id)).toEqual(['bh']);
  });
});

describe('rankFaqs — tu xa giao khong duoc tinh la khop', () => {
  it('tin chi co loi chao khong keo FAQ nao', () => {
    const faqs = [faq('mn', 'Shop mình giao Hà Nội không ạ?')];

    expect(rankFaqs(faqs, 'shop oi minh hoi voi a', GLOSSARY)).toEqual([]);
  });
});

describe('rankFaqs — xep hang theo do hiem cua tu (BM25)', () => {
  it('FAQ khop tu HIEM xep tren FAQ khop tu pho bien', () => {
    // "may loc" co trong ca 3 cau hoi -> gan nhu khong phan biet duoc.
    // "uvc" chi co trong mot cau -> phai keo cau do len dau.
    const faqs = [
      faq('gia', 'Máy lọc giá bao nhiêu?'),
      faq('uvc', 'Máy lọc bật UVC diệt khuẩn chỗ nào?'),
      faq('ship', 'Máy lọc có ship COD không?'),
    ];

    const ranked = rankFaqs(faqs, 'may loc uvc', GLOSSARY);

    expect(ranked[0]?.id).toBe('uvc');
  });
});

describe('rankFaqs — san diem tuong doi', () => {
  it('FAQ khop yeu bi loai du con cho trong danh sach tra ve', () => {
    const faqs = [
      faq('manh', 'Vệ sinh màng lọc HEPA như thế nào?'),
      faq('yeu', 'Vệ sinh vỏ ngoài ra sao?'),
    ];

    const ranked = rankFaqs(faqs, 've sinh mang loc hepa', GLOSSARY);

    expect(ranked[0]?.id).toBe('manh');
    expect(ranked.map((item) => item.id)).not.toContain('yeu');
  });

  it('tra ve nhieu nhat 5 FAQ du co nhieu cau cung diem', () => {
    const faqs = Array.from({ length: 8 }, (_, index) => faq(`f${index}`, 'Bảo hành bao lâu?'));

    expect(rankFaqs(faqs, 'bao hanh bao lau', GLOSSARY)).toHaveLength(5);
  });
});

describe('rankFaqs — bang chung mong thi khong tra loi', () => {
  it('mot tu CHUNG khop khong du — tra sai con te hon chuyen Sale', () => {
    // Ca that (21 FAQ BB-GREY): khach hoi cong suat, ma BB-GREY khong co cau nao ve cong suat.
    // "cong" trung mat chu giua "cong suat" va "cong nghe" — khong bo loc tan suat nao bat duoc
    // dieu do, chi co luat "bang chung phai day hon mot tu" moi chan.
    const faqs = [
      faq('cn1', 'Công nghệ lọc không khí của quạt BB là công nghệ gì?'),
      faq('cn2', 'Công nghệ Plasmacluster ion có tác dụng gì?'),
    ];

    expect(rankFaqs(faqs, 'con nay cs bn w b', GLOSSARY)).toEqual([]);
  });

  it('mot tu khop la tu DUY NHAT trong tap FAQ thi van du', () => {
    // "hanh" (bao hanh) chi xuat hien o dung mot cau -> khop mot tu nhung la bang chung chac.
    const faqs = [
      faq('bh', 'Quạt được bảo hành bao lâu?'),
      faq('mau', 'Màu sắc của quạt BB?'),
      faq('on', 'Quạt ồn thế e?'),
    ];

    expect(rankFaqs(faqs, 'bao hanh bnhieu lau b', GLOSSARY).map((item) => item.id)).toEqual([
      'bh',
    ]);
  });
});
