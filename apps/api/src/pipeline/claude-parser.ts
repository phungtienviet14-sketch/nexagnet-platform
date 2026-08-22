import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { INTENTS, parseResultSchema, type ParseResult } from '@netviet/shared';
import type { OrderParser, ParserInput } from './order-parser.js';
import {
  buildStaticPrompt,
  buildTurnContext,
  ensureIntentConfidence,
  normalizeParserOutput,
} from './parser-prompt.js';

/**
 * Parser THAT dung Claude (tool use). Dung prompt chung (7 intent + few-shot) de phan loai
 * on dinh; tool ep JSON schema. Doc anh qua vision tu imageUrl. Retry 1 lan khi loi tam thoi.
 * NGUYEN TAC: chi trich xuat + phan loai, KHONG tinh tien.
 */
/** Chi la luoi an toan cho test dung thang lop nay; runtime LUON truyen `env.PARSER_MODEL`. */
const DEFAULT_MODEL = 'claude-sonnet-5';
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
      /**
       * Don NUA VOI (Pha 6): khach ro rang muon dat nhung thieu truong bat buoc. Moi truong deu
       * TUY CHON — day chinh la cho de bieu dien "biet ban ghe Felix, chua biet may cai" ma
       * `order` (quantity bat buoc) khong bieu dien duoc. Khong co no, mo hinh buoc phai bia mot
       * so luong hoac vut ca don.
       */
      draft: {
        type: 'object',
        properties: {
          orderType: { type: 'string', enum: ['TH1', 'TH2'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                skuRaw: { type: 'string' },
                quantity: { type: 'integer' },
                unitPriceRaw: { type: 'number' },
              },
            },
          },
          noVat: { type: 'boolean' },
          wantVat: { type: 'boolean' },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          customerAddress: { type: 'string' },
          codCollect: { type: 'boolean' },
        },
        required: ['items'],
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

  constructor(apiKey: string, readonly model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Bang chung cache co chay hay khong. Tu tin thu HAI trong cung mot khach, `cache_read` phai
   * > 0; van bang 0 nghia la co thu bien dong da lot vao phan tinh va dang pha prefix.
   */
  private logCacheUsage(usage: Anthropic.Usage | undefined): void {
    if (!usage) return;
    const read = usage.cache_read_input_tokens ?? 0;
    const written = usage.cache_creation_input_tokens ?? 0;
    this.logger.log(
      `[cache] doc=${read} ghi=${written} vao=${usage.input_tokens} ra=${usage.output_tokens}`,
    );
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
          system: buildSystem(input),
          tools: [EXTRACT_TOOL],
          tool_choice: { type: 'tool', name: 'extract_order' },
          messages: [{ role: 'user', content }],
        });
        this.logCacheUsage(response.usage);
        // `input_tokens` cua Anthropic KHONG bao gom token doc tu cache — cong ca hai lai moi ra
        // kich thuoc prompt that su gui di, tuc con so nguoi doc trace mong doi.
        input.reportUsage?.({
          inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
          outputTokens: response.usage.output_tokens,
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

/**
 * `system` la MANG block de dat duoc diem cat cache:
 *   block 0 = phan tinh (danh muc SKU, glossary, 7 intent, few-shot) -> `cache_control` ephemeral
 *   block 1 = phan bien dong (dai ly + lich su hoi thoai) -> nam SAU diem cat
 *
 * Thu tu nay la DIEU KIEN de cache chay: prompt caching so khop tien to, nen moi thu doi theo
 * tung tin bat buoc phai nam sau moi thu on dinh.
 */
function buildSystem(input: ParserInput): Anthropic.TextBlockParam[] {
  const turn = buildTurnContext(input);
  return [
    {
      type: 'text',
      text: buildStaticPrompt(input),
      cache_control: { type: 'ephemeral' },
    },
    ...(turn ? [{ type: 'text' as const, text: turn }] : []),
  ];
}
