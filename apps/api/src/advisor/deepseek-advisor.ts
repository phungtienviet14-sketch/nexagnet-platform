import { Logger } from '@nestjs/common';
import {
  ADVISOR_STATIC_PROMPT,
  AdvisorAgent,
  MAX_TOOL_ROUNDS,
  buildAdvisorTurnContext,
  finalizeAdvisorReply,
  type AdvisorReply,
  type AdvisorRequest,
} from './advisor-agent.js';
import {
  advisorToolsFor,
  runAdvisorTool,
  type AdvisorToolResult,
  type AdvisorToolSpec,
} from './advisor-tools.js';

/**
 * AGENT TU VAN chay tren DeepSeek (API tuong thich OpenAI, function calling).
 *
 * VI SAO CO BAN NAY: `ClaudeAdvisorAgent` la lua chon dung ve tuan thu (Claude nam trong danh sach
 * ben thu ba DA DUOC DUYET), nhung no khong chay duoc khi tai khoan Anthropic het credit — do la
 * tinh trang do duoc ngay 21/08/2026. Khong co ban nay thi agent lui ve duong tat dinh va tinh nang
 * khong chung minh duoc gia tri nao.
 *
 * RANG BUOC TUAN THU — DOC TRUOC KHI BAT (CLAUDE.md, muc Bao mat):
 * DeepSeek CHUA nam trong danh sach ben thu ba duoc duyet (moi co KiotViet + Claude), ma agent nay
 * doc lich su hoi thoai cua nhom roi day sang provider. Nen no CHI duoc dung cho stack co
 * `DATA_CLASSIFICATION=test` va nhom/du lieu TEST — dung ca CLAUDE.md cho phep o giai doan nay.
 * Chay that voi du lieu khach: hoac doi `ADVICE_COMPOSER=claude`, hoac bo sung DeepSeek vao thoa
 * thuan xu ly du lieu TRUOC khi bat.
 *
 * Bat bien #5 giu nguyen: LLM khong tinh tien. Con so den tu cong cu (rules engine tat dinh), va
 * `finalizeAdvisorReply()` — DUNG mot ham voi ban Claude — kiem lai sau khi LLM viet xong.
 */

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
/**
 * 2000 chu khong phai 1200: do lan dau (21/08) mot cau tra loi bi cat giua chung o dau hai cham
 * khi mo hinh dinh liet ke phu kien. Cau tra loi cut la cau tra loi hong — va no van di qua moi
 * chan kiem tra vi khong co gi trong no la sai.
 */
const MAX_TOKENS = 2_000;
const TIMEOUT_MS = 45_000;

interface DeepSeekToolCall {
  readonly id: string;
  readonly type?: string;
  readonly function: { readonly name: string; readonly arguments: string };
}

interface DeepSeekMessage {
  readonly role: string;
  readonly content?: string | null;
  readonly tool_calls?: DeepSeekToolCall[];
  readonly tool_call_id?: string;
}

export class DeepSeekAdvisorAgent extends AdvisorAgent {
  readonly name = 'deepseek';
  private readonly logger = new Logger('AdvisorAgent');

  constructor(
    private readonly apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {
    super();
  }

  async reply(request: AdvisorRequest): Promise<AdvisorReply | null> {
    const turn = buildAdvisorTurnContext(request);
    const messages: DeepSeekMessage[] = [
      // DeepSeek khong co khai niem cache breakpoint, nen phan tinh va phan bien dong gop lam mot
      // `system` — giong het cach `DeepSeekParser` dung `buildSystemPrompt`.
      { role: 'system', content: [ADVISOR_STATIC_PROMPT, turn].filter(Boolean).join('\n') },
      { role: 'user', content: request.customerText.trim() || '(khach gui mot anh)' },
    ];
    const toolOutputs: AdvisorToolResult[] = [];
    const usedTools: string[] = [];

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const message = await this.call(messages, advisorToolsFor(request.tools));
        const calls = message?.tool_calls ?? [];
        if (!message) return null;
        if (!calls.length) {
          return finalizeAdvisorReply(message.content ?? '', toolOutputs, usedTools, this.logger);
        }
        if (round === MAX_TOOL_ROUNDS) {
          this.logger.warn(`Het ${MAX_TOOL_ROUNDS} vong cong cu — dung duong tat dinh.`);
          return null;
        }
        messages.push(message);
        for (const call of calls) {
          usedTools.push(call.function.name);
          const output = await runAdvisorTool(
            call.function.name,
            parseArguments(call.function.arguments),
            request.tools,
          );
          toolOutputs.push(output);
          // Giao thuc OpenAI doi MOI tin `tool` di RIENG, kem `tool_call_id` — khac Anthropic (mot
          // tin nguoi dung chua tat ca tool_result). Gop chung lai la loi 400.
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(output),
          });
        }
      }
      return null;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      // Fail-safe giong ban Claude: hong thi khach van nhan duoc duong tat dinh.
      this.logger.warn(`Agent tu van (deepseek) that bai, dung duong tat dinh: ${detail}`);
      return null;
    }
  }

  private async call(
    messages: readonly DeepSeekMessage[],
    tools: readonly AdvisorToolSpec[],
  ): Promise<DeepSeekMessage | null> {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: tools.map((spec) => ({
          type: 'function',
          function: {
            name: spec.name,
            description: spec.description,
            parameters: spec.inputSchema,
          },
        })),
        // v4 mac dinh BAT thinking; tat de giu do tre thap — khach dang cho trong nhom Zalo.
        thinking: { type: 'disabled' },
        temperature: 0.3,
        max_tokens: MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // Khong log body cua provider: no co the chua request context/PII.
      this.logger.warn(`DeepSeek loi HTTP ${response.status} — dung duong tat dinh.`);
      return null;
    }
    const data = (await response.json()) as { choices?: Array<{ message?: DeepSeekMessage }> };
    return data.choices?.[0]?.message ?? null;
  }
}

/**
 * `arguments` la CHUOI JSON do mo hinh sinh — coi nhu du lieu ngoai. Hong thi tra doi tuong rong
 * de cong cu tu fail-closed (moi cong cu da tu ep kieu dau vao), khong nem cat ca luot tra loi.
 */
function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}');
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
