import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { INTENTS, parseResultSchema, type ParseResult } from '@ultty/shared';
import type { OrderParser, ParserInput } from './order-parser.js';

/**
 * Parser THAT dung Claude (tool use). Trich xuat co rang buoc trong tu dien dong:
 * ngu canh = danh muc SKU + glossary + dai ly. Doc anh qua vision tu imageUrl.
 * NGUYEN TAC: chi trich xuat + phan loai, KHONG tinh tien (rules engine lo).
 */

// Haiku 4.5: nhanh + re, du cho trich xuat co cau truc (performance.md - worker).
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_order',
  description: 'Phan loai y dinh va trich xuat don hang tho tu tin nhan Zalo cua dai ly.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: [...INTENTS] },
      order: {
        type: 'object',
        properties: {
          orderType: { type: 'string', enum: ['TH1', 'TH2'] },
          dealerNameRaw: { type: 'string' },
          branch: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                skuRaw: { type: 'string' },
                quantity: { type: 'integer' },
                unitPriceRaw: { type: 'number' },
              },
              required: ['skuRaw', 'quantity'],
            },
          },
          totalRaw: { type: 'number' },
          noVat: { type: 'boolean' },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          customerAddress: { type: 'string' },
          codCollect: { type: 'boolean' },
        },
        required: ['orderType', 'items'],
      },
      confidence: { type: 'object', additionalProperties: { type: 'number' } },
    },
    required: ['intent'],
  },
};

export class ClaudeParser implements OrderParser {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly logger = new Logger('ClaudeParser');

  constructor(apiKey: string, private readonly model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
  }

  private systemPrompt(input: ParserInput): string {
    const skus = input.products.map((p) => `- ${p.name} (goi tat: ${p.aliases.join(', ')})`).join('\n');
    const glossary = input.glossary.map((g) => `${g.term}=${g.meaning}`).join(', ');
    return [
      'Ban la bo trich xuat don hang cho U Ultty (gia dung cao cap).',
      'Dai ly nhan tin viet tat, khong dau. Nhiem vu: phan loai intent va trich xuat don THO.',
      'TUYET DOI khong tu tinh gia/ship/tong — chi ghi lai so lieu khach viet (unitPriceRaw, totalRaw) neu co.',
      'Chi tra ket qua qua cong cu extract_order.',
      input.dealerNameRaw ? `Nhom nay thuoc dai ly: ${input.dealerNameRaw}.` : '',
      `Danh muc SKU:\n${skus}`,
      `Tu dien viet tat: ${glossary}`,
      'Neu tin co so luong + ten SP -> intent=dat_don. Neu chi hoi gia -> hoi_gia. Neu khong ro -> khac.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async parse(input: ParserInput): Promise<ParseResult> {
    const content: Anthropic.ContentBlockParam[] = [];
    if (input.imageUrl) {
      content.push({ type: 'image', source: { type: 'url', url: input.imageUrl } });
    }
    content.push({ type: 'text', text: input.text });

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: this.systemPrompt(input),
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_order' },
        messages: [{ role: 'user', content }],
      });

      const toolUse = response.content.find((b) => b.type === 'tool_use');
      if (!toolUse || toolUse.type !== 'tool_use') {
        this.logger.warn('Claude khong tra tool_use, fallback intent=khac');
        return { intent: 'khac', confidence: {} };
      }

      const parsed = parseResultSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        this.logger.warn(`Output Claude khong hop schema: ${parsed.error.message}`);
        return { intent: 'khac', confidence: {} };
      }
      return parsed.data;
    } catch (error) {
      this.logger.error(`Loi goi Claude: ${error instanceof Error ? error.message : String(error)}`);
      return { intent: 'khac', confidence: {} };
    }
  }
}
