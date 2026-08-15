import { describe, expect, it } from 'vitest';
import {
  NoopAdviceComposer,
  buildComposerSystemPrompt,
  looksLikeMoney,
  type AdviceComposeInput,
} from './advice-composer.js';

const INPUT: AdviceComposeInput = {
  customerText: 'con nay dung cho phong 20m2 duoc khong c',
  productNames: ['Máy hút ẩm Hercules'],
  snippets: [{ question: 'Dùng cho phòng bao nhiêu m2?', body: 'Phù hợp phòng 15-25m2.' }],
};

describe('looksLikeMoney — chan hau kiem ban soan', () => {
  // Rules engine moi duoc quyet con so tien (CLAUDE.md #5). Ban soan lo noi gia thi phai bi bo,
  // nen cac cach viet tien pho bien trong nhom Zalo deu phai bat duoc.
  it.each(['1.150k', '2tr5', '1.150.000đ', 'khoảng 2 triệu', '890 nghìn', '5000000 VND'])(
    'bat cach viet tien "%s"',
    (text) => {
      expect(looksLikeMoney(`Dạ sản phẩm này giá ${text} ạ`)).toBe(true);
    },
  );

  it('khong nham so do dien tich thanh tien', () => {
    expect(looksLikeMoney('Phòng 20m2 dùng tốt ạ.')).toBe(false);
  });

  it('khong bao dong gia voi cau tu van khong co tien', () => {
    expect(looksLikeMoney('Dạ con này phù hợp phòng 15-25m2 anh nhé.')).toBe(false);
  });
});

describe('buildComposerSystemPrompt', () => {
  it('bat buoc chi dung tu lieu da duyet va cam noi so tien', () => {
    const prompt = buildComposerSystemPrompt(INPUT);
    expect(prompt).toContain('TU LIEU DA DUYET');
    expect(prompt).toContain('TUYET DOI KHONG noi bat ky con so tien nao');
    expect(prompt).toContain('Phù hợp phòng 15-25m2.');
    expect(prompt).toContain('Máy hút ẩm Hercules');
  });

  it('dua lich su hoi thoai vao prompt de tra loi tiep mach', () => {
    const prompt = buildComposerSystemPrompt({
      ...INPUT,
      context: {
        recentMessages: [
          {
            externalMessageId: 'm1',
            text: 'shop con hut am nao khong',
            senderDisplayName: 'Chị Lan',
            sentAt: new Date('2026-08-15T03:00:00.000Z'),
          },
        ],
        participants: [],
      },
    });
    expect(prompt).toContain('LICH SU HOI THOAI GAN DAY');
    expect(prompt).toContain('Chị Lan: shop con hut am nao khong');
  });

  it('khong co lich su thi khong chen khoi rong', () => {
    expect(buildComposerSystemPrompt(INPUT)).not.toContain('LICH SU HOI THOAI');
  });
});

describe('NoopAdviceComposer', () => {
  it('tra null de ben goi giu nguyen ban noi FAQ', async () => {
    await expect(new NoopAdviceComposer().compose()).resolves.toBeNull();
  });
});
