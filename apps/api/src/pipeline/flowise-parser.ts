import { parseResultSchema, type ParseResult } from '@ultty/shared';
import type { OrderParser, ParserInput } from './order-parser.js';

export interface FlowiseParserOptions {
  baseUrl: string;
  flowId: string;
  apiKey: string;
  timeoutMs: number;
}

interface FlowisePredictionResponse {
  json?: unknown;
}

/**
 * Adapter Flowise Agentflow V2 cho tang parser.
 *
 * Bat bien: Flowise chi trich xuat ParseResult. NestJS van dieu phoi pipeline va rules
 * TypeScript van la noi duy nhat tinh gia, VAT, ship, COD va chinh sach.
 */
export class FlowiseParser implements OrderParser {
  readonly name = 'flowise';
  private readonly predictionUrl: string;

  constructor(private readonly options: Readonly<FlowiseParserOptions>) {
    const baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.predictionUrl = `${baseUrl}/api/v1/prediction/${encodeURIComponent(options.flowId)}`;
  }

  async parse(input: ParserInput): Promise<ParseResult> {
    try {
      const response = await fetch(this.predictionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          form: {
            text: input.text,
            imageUrl: input.imageUrl ?? '',
            productsJson: JSON.stringify(input.products),
            glossaryJson: JSON.stringify(input.glossary),
            dealerNameRaw: input.dealerNameRaw ?? '',
            botName: input.botName ?? '',
          },
          streaming: false,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });

      if (!response.ok) {
        // Khong dua response body vao error: Flowise co the lap lai structured output chua PII.
        throw new Error(`Flowise HTTP ${response.status}`);
      }

      const payload = (await response.json()) as FlowisePredictionResponse;
      const structuredOutput = extractStructuredOutput(payload.json);
      const parsed = parseResultSchema.safeParse(structuredOutput);
      if (!parsed.success) {
        throw new Error(`Flowise output khong hop parseResultSchema: ${parsed.error.message}`);
      }
      return parsed.data;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.startsWith('Flowise HTTP ') || detail.includes('parseResultSchema')) {
        throw error;
      }
      throw new Error(`Goi Flowise that bai: ${detail}`, { cause: error });
    }
  }
}

/**
 * Chi chap nhan `response.json`; khong parse `text`, execution trace hay overrideConfig.
 * Image Flowise 3.1.4 cua du an expose structured output cuoi vao truong nay bang patch
 * co source guard (upstream Agentflow chi tra execution trace).
 */
function extractStructuredOutput(value: unknown): unknown {
  if (value !== undefined && value !== null) return unwrapSingleResult(value);
  throw new Error('Flowise response khong co structured output');
}

function unwrapSingleResult(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.result)) return value;
  if (value.result.length !== 1) {
    throw new Error(`Flowise structured output phai co dung 1 result, nhan ${value.result.length}`);
  }
  return value.result[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
