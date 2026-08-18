import { Logger } from '@nestjs/common';
import { parseResultSchema, type ParseResult } from '@netviet/shared';
import type { OrderParser, ParserInput } from './order-parser.js';
import {
  buildSystemPrompt,
  ensureIntentConfidence,
  normalizeParserOutput,
  parseJsonLoose,
} from './parser-prompt.js';

/**
 * Parser THAT dung DeepSeek (API tuong thich OpenAI, JSON mode).
 * Dung prompt chung (7 intent + few-shot) de phan loai on dinh; retry 1 lan khi loi
 * mang/5xx/429; loi cuoi -> fallback intent=khac (confidence.intent=0 de Giam sat gan co).
 * LUU Y: DeepSeek KHONG doc anh (moi bien the) — don anh can Claude/Co-pilot. KHONG tinh tien.
 *
 * MODEL MAC DINH: deepseek-v4-flash (ra 24/04/2026, MIT; deepseek-chat/deepseek-reasoner bi khai
 * tu 24/07/2026 15:59 UTC va nay alias ve Flash). Cap nhat 18/08/2026:
 *   - MoE thua thot 284B tong / 13B kich hoat moi token (256 expert dinh tuyen, 6 active).
 *   - Cua so 1M token, output toi da 384K — cung muc voi V4 Pro; chon Flash la chon
 *     chi-phi-tren-chat-luong, KHONG phai danh doi do dai context.
 *   - Gia API goc 0.14$/1M vao, 0.28$/1M ra (~1/3 muc ra cua V4 Pro); cache hit 0.0028$/1M vao.
 *   - GPQA Diamond 89.6%, TAU-Bench 77.5% (so nha cung cap cong bo).
 *   - API noi ca giao thuc OpenAI ChatCompletions lan Anthropic.
 *
 * VI SAO HOP VOI VIEC O DAY: viec cua parser la TRICH XUAT CO RANG BUOC trong tu dien dong
 * (18-20 SKU + glossary) roi ep ve JSON schema co dinh — khong phai suy luan mo. Cua so 1M
 * token cung du sac cho cua so hoi thoai da noi rong o Pha 1 ma khong lo tran.
 *
 * RANG BUOC TUAN THU (CLAUDE.md, muc Bao mat) — DOC TRUOC KHI BAT VOI DU LIEU THAT:
 * DeepSeek CHUA nam trong danh sach ben thu 3 duoc duyet (moi chi co KiotViet + Claude), ma
 * kenh zca doc MOI tin trong nhom roi day sang parser. Nen: demo/test khong PII -> dung duoc;
 * chay that voi du lieu khach -> hoac doi PARSER_MODE=claude, hoac bo sung DeepSeek vao thoa
 * thuan xu ly du lieu TRUOC khi bat.
 */
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 400;
const TIMEOUT_MS = 30_000;

/** LLM tra ket qua nhung quen confidence -> gan mac dinh vua phai. */
const OK_CONFIDENCE = 0.7;

export class DeepSeekParser implements OrderParser {
  readonly name = 'deepseek';
  private readonly logger = new Logger('DeepSeekParser');

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {}

  async parse(input: ParserInput): Promise<ParseResult> {
    if (input.imageUrl) {
      this.logger.warn('DeepSeek khong doc anh — tin anh nay can Claude/Co-pilot.');
    }
    const system = buildSystemPrompt(input);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: input.text },
            ],
            response_format: { type: 'json_object' },
            // v4 mac dinh BAT thinking -> tat de giu hanh vi/latency nhu deepseek-chat cu
            // (thinking mode khong ho tro temperature).
            thinking: { type: 'disabled' },
            temperature: 0,
            max_tokens: 800,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!response.ok) {
          const body = await response.text();
          this.logger.error(`DeepSeek loi ${response.status}: ${body.slice(0, 200)}`);
          if (this.retriable(response.status) && attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          return fallback();
        }

        const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          this.logger.warn('DeepSeek khong tra noi dung.');
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAY_MS);
            continue;
          }
          return fallback();
        }

        return this.toResult(content);
      } catch (error) {
        // Loi mang/timeout -> retry (con luot); het luot -> fallback.
        this.logger.error(`Loi goi DeepSeek: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return fallback();
      }
    }
    return fallback();
  }

  /** Output content -> ParseResult qua schema; schema hong thi fallback (khong retry vi LLM da tra). */
  private toResult(content: string): ParseResult {
    let json: unknown;
    try {
      json = parseJsonLoose(content);
    } catch {
      this.logger.warn('DeepSeek tra JSON khong parse duoc.');
      return fallback();
    }
    const parsed = parseResultSchema.safeParse(normalizeParserOutput(json));
    if (!parsed.success) {
      this.logger.warn(`Output DeepSeek khong hop schema: ${parsed.error.message}`);
      return fallback();
    }
    return { ...parsed.data, confidence: ensureIntentConfidence(parsed.data.confidence, OK_CONFIDENCE) };
  }

  private retriable(status: number): boolean {
    return status >= 500 || status === 429;
  }
}

/** Loi/khong hieu -> khac + confidence.intent=0 (Giam sat se gan co "do tin cay thap"). */
function fallback(): ParseResult {
  return { intent: 'khac', confidence: { intent: 0 } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
