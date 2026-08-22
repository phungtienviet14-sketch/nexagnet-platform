/**
 * DEM TOKEN cua mot lan goi LLM, mang tu nha cung cap ve cho `telemetry.aiCall()`.
 *
 * VI SAO KHONG NHET VAO KET QUA TRA VE: `ParseResult` nam trong `@netviet/shared` (web cung dung)
 * va la kieu NGHIEP VU — "parser hieu duoc gi". So token la du lieu VAN HANH; tron hai thu vao
 * mot schema la bat ca app web phai biet ve hoa don LLM. Con `AdvisorReply` thi tra `null` khi
 * LLM hong — ma dung luc do moi can biet no da dot bao nhieu token.
 *
 * VI SAO LA CALLBACK: ca hai agent tu van goi API NHIEU VONG (toi da `MAX_TOOL_ROUNDS` + 1). Moi
 * vong la mot hoa don rieng, nen nha cung cap bao tung vong va ben goi cong don — khong nha cung
 * cap nao phai tu nho trang thai giua cac vong, va khong co bien dung chung giua hai luot chay
 * song song cua cung mot nguoi.
 *
 * Fail-open giong moi thu khac trong `observability/`: thieu bao cao thi truong token vang mat
 * khoi trace, nghiep vu khong doi.
 */

/** So token cua MOT lan goi API. */
export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** Nha cung cap goi ham nay MOT LAN cho MOI lan goi API. Ben goi tu cong don. */
export type LlmUsageReporter = (usage: LlmUsage) => void;

export interface LlmUsageMeter {
  /** Truyen cai nay xuong nha cung cap. */
  readonly report: LlmUsageReporter;
  /** Tong cua ca luot; `null` khi nha cung cap khong bao gi (khong dem duoc / khong goi API). */
  total(): LlmUsage | null;
}

/**
 * `null` chu khong phai `{0,0}` khi khong co bao cao nao: "khong dem duoc" va "ton 0 token" la hai
 * su that khac han nhau, va mot trace ghi `0->0 tok` se lam nguoi doc tin rang da co so lieu.
 */
export function createUsageMeter(): LlmUsageMeter {
  let inputTokens = 0;
  let outputTokens = 0;
  let reported = false;
  return {
    report: (usage: LlmUsage): void => {
      // Nha cung cap co the tra `undefined`/NaN khi doi phien ban API — bo qua, dung de no lam
      // hong ca ban ghi telemetry.
      if (!Number.isFinite(usage.inputTokens) || !Number.isFinite(usage.outputTokens)) return;
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      reported = true;
    },
    total: (): LlmUsage | null => (reported ? { inputTokens, outputTokens } : null),
  };
}

/** Khoi `usage` cua Anthropic. Moi truong deu tuy chon — xem `reportAnthropicUsage`. */
export interface AnthropicCompatibleUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_read_input_tokens?: number | null;
}

/**
 * Doi khoi `usage` cua Anthropic sang `LlmUsage`. Dung chung cho `ClaudeParser` va
 * `ClaudeAdvisorAgent` — CA HAI deu gui prompt co `cache_control` ephemeral.
 *
 * HAI ly do ham nay ton tai thay vi doc thang `response.usage.input_tokens`:
 *
 * 1. `input_tokens` KHONG bao gom token doc tu cache. Chi lay no thi tu tin thu hai tro di trace
 *    bao mot prompt teo di dot ngot — dung luc prompt caching bat dau chay — va nguoi doc se tuong
 *    prompt bi cat trong khi no van nguyen ven.
 * 2. **Fail-open.** Kieu cua SDK khai `usage` la bat buoc, nhung mot proxy, mot ban SDK khac hay
 *    mot ban gia trong test co the khong co no. Doc thang se nem `TypeError` — ma ca hai cho goi
 *    deu nam trong `try`, nen loi do bi nuot thanh "LLM tra ve rong" (advisor lui ve duong tat
 *    dinh) hoac thanh mot luot parse hong. Tuc code QUAN SAT lam hong NGHIEP VU, dung dieu
 *    `.claude/rules/ecc/common/code-review.md` cam. Thieu so lieu thi bo truong token, khong sap.
 */
export function reportAnthropicUsage(
  usage: AnthropicCompatibleUsage | undefined,
  report: LlmUsageReporter | undefined,
): void {
  if (!report || !usage) return;
  report({
    inputTokens: (usage.input_tokens ?? Number.NaN) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? Number.NaN,
  });
}

/** Khoi `usage` theo giao thuc OpenAI — DeepSeek va moi provider tuong thich deu dung khuon nay. */
export interface OpenAiCompatibleUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
}

/**
 * Doi khoi `usage` kieu OpenAI sang `LlmUsage`. Dung chung cho DeepSeek parser va DeepSeek
 * advisor: hai cho doc CUNG mot khuon JSON, nen chung phai doc no bang CUNG mot ham — khong thi
 * mot ben sua theo phien ban API moi con ben kia im lang tra so cu.
 */
export function reportOpenAiCompatibleUsage(
  usage: OpenAiCompatibleUsage | undefined,
  report: LlmUsageReporter | undefined,
): void {
  if (!report || !usage) return;
  report({
    inputTokens: usage.prompt_tokens ?? Number.NaN,
    outputTokens: usage.completion_tokens ?? Number.NaN,
  });
}
