import { Logger } from '@nestjs/common';
import { parseResultSchema, type ParseResult } from '@ultty/shared';
import type { OrderParser, ParserInput } from './order-parser.js';

/**
 * Parser THAT dung DeepSeek (API tuong thich OpenAI, JSON mode).
 * Trich xuat co rang buoc trong tu dien dong (SKU + glossary + dai ly).
 * LUU Y: deepseek-chat KHONG doc anh (vision) — don anh can Claude hoac Co-pilot.
 * NGUYEN TAC: chi trich xuat + phan loai, KHONG tinh tien.
 */
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

export class DeepSeekParser implements OrderParser {
  readonly name = 'deepseek';
  private readonly logger = new Logger('DeepSeekParser');

  constructor(private readonly apiKey: string, private readonly model: string = DEFAULT_MODEL) {}

  private systemPrompt(input: ParserInput): string {
    const skus = input.products.map((p) => `- ${p.name} (goi tat: ${p.aliases.join(', ')})`).join('\n');
    const glossary = input.glossary.map((g) => `${g.term}=${g.meaning}`).join(', ');
    return [
      'Ban la bo trich xuat don hang cho U Ultty (gia dung cao cap). Dai ly nhan tin viet tat, khong dau.',
      'Tra ve DUY NHAT mot doi tuong JSON (khong giai thich, khong markdown) dung cau truc:',
      '{"intent":"hoi_san_pham|hoi_gia|dat_don|chinh_sach_cong_no|bao_hanh_khieu_nai|van_chuyen|khac",',
      '"order":{"orderType":"TH1|TH2","items":[{"skuRaw":"ten SP khach ghi","quantity":so_nguyen,"unitPriceRaw":gia_khach_ghi_neu_co}],',
      '"noVat":true/false,"dealerNameRaw":"","branch":"","totalRaw":so,"customerName":"","customerPhone":"","customerAddress":"","codCollect":true/false},',
      '"confidence":{}}',
      'Chi dua "order" khi intent=dat_don. TUYET DOI khong tu tinh gia/ship/tong.',
      'Neu chi HOI GIA ("bao nhieu tien", "gia bao nhieu", "may tien") ma khong co so luong dat -> intent=hoi_gia (khong tao order).',
      'CHI dien cac truong khach thuc su ghi. Khong biet thi BO QUA truong do (dung dien 0 hay chuoi rong).',
      'noVat=true neu khach ghi "khong VAT"/"ko lay VAT". TH2 khi co ten+SDT/dia chi khach le.',
      input.dealerNameRaw ? `Nhom nay thuoc dai ly: ${input.dealerNameRaw}.` : '',
      `Danh muc SKU:\n${skus}`,
      `Tu dien viet tat: ${glossary}`,
      'Vi du: "gui 10 ghe felix ve TN, ko VAT" => {"intent":"dat_don","order":{"orderType":"TH1","items":[{"skuRaw":"ghe felix","quantity":10}],"noVat":true},"confidence":{}}',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async parse(input: ParserInput): Promise<ParseResult> {
    if (input.imageUrl) {
      this.logger.warn('DeepSeek khong doc anh — tin anh nay can Claude/Co-pilot.');
    }
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: this.systemPrompt(input) },
            { role: 'user', content: input.text },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 800,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`DeepSeek loi ${response.status}: ${body.slice(0, 200)}`);
        return { intent: 'khac', confidence: {} };
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.warn('DeepSeek khong tra noi dung, fallback intent=khac');
        return { intent: 'khac', confidence: {} };
      }

      const parsed = parseResultSchema.safeParse(JSON.parse(content));
      if (!parsed.success) {
        this.logger.warn(`Output DeepSeek khong hop schema: ${parsed.error.message}`);
        return { intent: 'khac', confidence: {} };
      }
      return parsed.data;
    } catch (error) {
      this.logger.error(`Loi goi DeepSeek: ${error instanceof Error ? error.message : String(error)}`);
      return { intent: 'khac', confidence: {} };
    }
  }
}
