import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { INTENTS, parseResultSchema, type ParseResult } from '@ultty/shared';
import type { OrderParser, ParserInput } from './order-parser.js';
import { buildSystemPrompt, ensureIntentConfidence, normalizeParserOutput } from './parser-prompt.js';

/**
 * Parser THAT dung Claude (tool use). Dung prompt chung (7 intent + few-shot) de phan loai
 * on dinh; tool ep JSON schema. Doc anh qua vision tu imageUrl. Retry 1 lan khi loi tam thoi.
 * NGUYEN TAC: chi trich xuat + phan loai, KHONG tinh tien.
 */
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 400;
const OK_CONFIDENCE = 0.7;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_order',
  description: 'Phan loai y dinh (7 loai) va trich xuat don hang tho tu tin nhan Zalo cua dai ly.',
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
          wantVat: { type: 'boolean' },
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

  async parse(input: ParserInput): Promise<ParseResult> {
    const content: Anthropic.ContentBlockParam[] = [];
    if (input.imageUrl) {
      content.push({ type: 'image', source: { type: 'url', url: input.imageUrl } });
    }
    content.push({ type: 'text', text: input.text });

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: buildSystemPrompt(input),
          tools: [EXTRACT_TOOL],
          tool_choice: { type: 'tool', name: 'extract_order' },
          messages: [{ role: 'user', content }],
        });

        const toolUse = response.content.find((b) => b.type === 'tool_use');
        if (!toolUse || toolUse.type !== 'tool_use') {
          this.logger.warn('Claude khong tra tool_use, fallback intent=khac');
          return fallback();
        }
        const parsed = parseResultSchema.safeParse(normalizeParserOutput(toolUse.input));
        if (!parsed.success) {
          this.logger.warn(`Output Claude khong hop schema: ${parsed.error.message}`);
          return fallback();
        }
        return { ...parsed.data, confidence: ensureIntentConfidence(parsed.data.confidence, OK_CONFIDENCE) };
      } catch (error) {
        this.logger.error(`Loi goi Claude: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return fallback();
      }
    }
    return fallback();
  }
}

function fallback(): ParseResult {
  return { intent: 'khac', confidence: { intent: 0 } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
