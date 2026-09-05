import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type {
  ClarifySlot,
  ConversationContext,
  OrderDraft,
  OutboundAuthority,
  OutboundPlan,
} from '@netviet/shared';
import { narrativeOnlyPlan } from '@netviet/shared';
import {
  mergeBusinessFacts,
  NO_BUSINESS_FACTS,
  type TurnBusinessFacts,
} from '../outbound/outbound-facts.js';
import type { ClosedOrderContext } from '../conversations/conversation-thread.js';
import type { AmendSignal } from '../pipeline/amend-detect.js';
import { reportAnthropicUsage, type LlmUsageReporter } from '../observability/llm-usage.js';
import { formatTranscript } from '../messages/conversation-transcript.js';
import { mergeAuthority } from '../outbound/outbound-authority.js';
import { unverifiedAmounts } from './money-guard.js';
import {
  advisorToolsFor,
  runAdvisorTool,
  type AdvisorToolContext,
  type AdvisorToolSpec,
  type AdvisorToolOutcome,
} from './advisor-tools.js';

/**
 * AGENT TU VAN CO CONG CU — LLM tu quyet dinh luc nao can tra cuu nguon su that, roi tu viet cau
 * tra loi dua tren ket qua tra cuu + lich su hoi thoai cua chinh khach do.
 *
 * NO THAY CAI GI: truoc 21/08/2026, cau tra loi tu van khong phai do LLM sinh ra. `productAdvice()`
 * chi doc noi dung `active`; chua duyet thi tra ve MOT CHUOI HARD-CODE ("Thong tin da duyet chua
 * du..."), va `AdviceComposer` chi duoc goi khi da co san snippet. Ket qua: hoi V08 muoi cau khac
 * nhau van ra dung mot cau — dung nhu khach bao, va do khong phai loi xac suat, do la chua he co
 * lan goi LLM nao.
 *
 * BAT BIEN GIU NGUYEN (CLAUDE.md #5): LLM khong tinh tien. Con so den tu `bao_gia`/`tinh_don` —
 * hai cong cu chay rules engine tat dinh.
 *
 * DOI O #189: agent nay khong con tra ve VAN BAN GUI CHO KHACH. No tra ve mot KE HOACH co kieu
 * (`plan`), du kien tat dinh da tra cuu (`facts`) va chuoi he thong so huu (`sources`); van ban
 * that su den tay khach do `outbound-composer.ts` dung. `unverifiedAmounts()` van chay nhung chi
 * con la mot dong canh bao — phep chan con so bia nay nam o hop dong neo nguon cua bo soan, noi
 * phep neo dua tren `sources` chu khong dua tren ket qua cong cu da serialize (ket qua do co echo
 * lai tham so model tu gui).
 */

export interface AdvisorRequest {
  /** Tin hien tai, nguyen van (chua normalize) — LLM can dau cau va ngu khi. */
  readonly customerText: string;
  readonly context?: ConversationContext;
  /** Ten khach dang hoi — de goi dung nguoi trong nhom nhieu nguoi. */
  readonly senderDisplayName?: string;
  /** Don nhap dang do cua CHINH khach nay (neu co) — de LLM khong hoi lai thu da biet. */
  readonly pendingDraft?: OrderDraft;
  /** Slot he thong xac dinh la con thieu; LLM duoc goi y hoi dung nhung thu nay. */
  readonly missingSlots?: readonly ClarifySlot[];
  /** Don VUA CHOT cua chinh khach nay — de hieu "cai do"/"don cu" tro ve dau. */
  readonly closedOrder?: ClosedOrderContext;
  /** He thong da nhan dien tin nay la yeu cau SUA/HUY don, khong phai don moi. */
  readonly amendRequest?: AmendSignal;
  readonly tools: AdvisorToolContext;
  readonly now?: Date;
  /**
   * Cho agent bao so token — MOT LAN cho MOI vong goi cong cu, ben goi tu cong don. Tuy chon,
   * de `NoopAdvisorAgent` va cac ban gia trong test khong phai biet gi ve no.
   */
  readonly reportUsage?: LlmUsageReporter;
}

export interface AdvisorReply {
  /**
   * LOI NHAN model viet — KHONG con la van ban gui cho khach (Issue #189).
   *
   * Truoc #189, chuoi nay CHINH LA tin nhan. Nay no la mot UNG VIEN cho phan van xuoi cua tin, va
   * no chi den duoc tay khach neu qua hop dong neo nguon o `outbound-narrative.ts`. Phan nghiep vu
   * cua tin (tien, chinh sach, cam ket don) khong bao gio den tu day.
   */
  readonly text: string;
  /** Cong cu da goi, theo thu tu — di vao AgentTrace de Sale nhin duoc LLM da tra cuu gi. */
  readonly usedTools: string[];
  /** True khi LLM ket luan phai chuyen nguoi that. */
  readonly handoff: boolean;
  /**
   * THAM QUYEN TAT DINH da thu thap duoc trong chinh luot nay — KHONG phai mot phan quyet cua LLM.
   *
   * Di kem ban soan vi ben goi (`AgentOrchestrator.composeReply`) can ca hai de xet: van ban model
   * viet, va nhung gi rules engine / bang gia / cap dai ly / trang thai don thuc su cho phep noi.
   * Rong la mot gia tri BINH THUONG va co nghia — mot luot khong tra cuu gi thi khong duoc khang
   * dinh gi co he qua.
   */
  readonly authority: OutboundAuthority;
  /**
   * KE HOACH co kieu model de xuat — loai khoi no muon, khong phai noi dung khoi.
   *
   * Model khong goi `soan_tra_loi` -> ben goi nhan ke hoach IT DAC QUYEN NHAT (`requestedBlocks`
   * rong). Do la mot MAC DINH CUA HE THONG, khong phai mot phep doc van ban model viet ra thanh
   * khang dinh co kieu — muc 3 hop dong cam dung viec sau.
   */
  readonly plan: OutboundPlan;
  /** Du kien tat dinh luot nay tra cuu duoc — thu duy nhat bo soan render duoc. */
  readonly facts: TurnBusinessFacts;
  /** Chuoi he thong so huu da tra cuu — bang chung neo nguon cho loi nhan. */
  readonly sources: readonly string[];
}

export abstract class AdvisorAgent {
  abstract readonly name: string;
  /** Model THAT dang chay. Xem chu thich cung ten trong `OrderParser` — nhan model sai
   *  con te hon khong co nhan. `NoopAdvisorAgent` khong co model nao. */
  readonly model?: string;
  /**
   * CO goi LLM that khong? `false` = khong co ban soan nao duoc cau hinh.
   *
   * Vi sao la mot co CO KIEU chu khong phai `advisor == null` hay so sanh `name === 'noop'`:
   * DI luon tiem MOT `AdvisorAgent` (token bat buoc), nen "chua cau hinh" den tay ben goi duoi
   * dang `NoopAdvisorAgent` chu khong phai `undefined`. Khong co co nay thi nhanh
   * `COMPOSER_DISABLED` KHONG BAO GIO chay tren stack that — do dung la thu do duoc tren trace
   * that `6c46754f...` ngay 22/08/2026: `ADVICE_COMPOSER` rong hien ra thanh `AI compose noop/noop`
   * + `LLM_RETURNED_NOTHING`, tuc dung cai nhan chi nguoi debug sang "LLM hong" trong khi LLM chua
   * he duoc goi. So sanh theo `name` thi mot ban Noop thu hai doi ten la gay lai loi cu.
   */
  readonly composes: boolean = true;
  /** `null` = khong soan duoc; ben goi PHAI co duong tat dinh de lui ve. */
  abstract reply(request: AdvisorRequest): Promise<AdvisorReply | null>;
}

/** Mac dinh: khong co agent. Giu nguyen duong tat dinh cu — dung cho demo/CI offline. */
export class NoopAdvisorAgent extends AdvisorAgent {
  readonly name = 'noop';
  override readonly composes = false;
  async reply(): Promise<AdvisorReply | null> {
    return null;
  }
}

const DEFAULT_MODEL = 'claude-opus-5';
const MAX_TOKENS = 8_000;
/**
 * Bon vong la du cho chuoi dai nhat that su xay ra: tra cuu SP -> tra cuu tai lieu -> bao gia ->
 * tinh don. Cao hon nua chi lam tang do tre ma khach dang cho trong nhom.
 */
export const MAX_TOOL_ROUNDS = 4;
/** Danh dau LLM tu nhan la khong tra loi duoc — de ben goi dinh tuyen Sale, khong doan tu van ban. */
export const HANDOFF_MARKER = '[CHUYEN_SALE]';

/**
 * Van ban tho tu LLM -> `AdvisorReply`, DUNG CHUNG cho moi nha cung cap.
 *
 * Day la cho dat chan hau kiem tien, nen no phai la MOT ham: mot nha cung cap thu hai bo qua buoc
 * nay se la mot duong vong quanh bat bien #5 ma khong ai thay tu ben ngoai.
 */
export function finalizeAdvisorReply(
  raw: string,
  outcomes: readonly AdvisorToolOutcome[],
  usedTools: string[],
  logger: Logger,
): AdvisorReply | null {
  /*
   * KE HOACH THANG VAN BAN TU DO (Issue #189).
   *
   * Model goi `soan_tra_loi` -> dung ke hoach do. Khong goi -> KHONG doc van ban tu do thanh mot
   * ke hoach co khoi; ta lay ke hoach IT DAC QUYEN NHAT (`requestedBlocks` rong) va coi van ban do
   * la loi nhan. Su khac nhau la quan trong: mot mac dinh khong cap gi thi khong the bi loi dung,
   * con mot phep "doc van ban roi gan nhan" thi chinh la thu muc 3 hop dong cam.
   */
  const planned = outcomes.flatMap((outcome) => (outcome.plan ? [outcome.plan] : [])).at(-1);
  const rawText = raw.trim();
  const narrative = stripMarker(planned ? planned.narrative : rawText);
  // `handoff` co HAI nguon va chung duoc HOP: nhan trong van ban (ban cu, ca hai nha cung cap deu
  // dung) va y dinh trong ke hoach. Bo mot trong hai la mo lai duong ma LLM da tu xin chuyen
  // nguoi that nhung he thong van gui.
  const handoff =
    planned?.kind === 'handoff' ||
    rawText.includes(HANDOFF_MARKER) ||
    (planned?.narrative ?? '').includes(HANDOFF_MARKER);
  const plan: OutboundPlan = planned ? { ...planned, narrative } : narrativeOnlyPlan(narrative);

  /*
   * Khong co loi nhan VA khong xin khoi nao = khong co gi de soan. Ben goi dung duong tat dinh.
   *
   * TRU KHI model tu xin chuyen nguoi that. `handoff` la tin hieu DUY NHAT ma he thong con tin o
   * loi tu khai cua model, va tra `null` o day se xoa han no: ben goi doc `null` la "LLM khong tra
   * loi duoc" va lui ve duong tat dinh — mot duong khong biet gi ve yeu cau chuyen Sale va co the
   * tu no `sendable`. Mot ke hoach `chuyen_sale` voi `loi_nhan` rong (schema doi truong co mat,
   * khong doi khac rong) du de roi vao day.
   */
  if (!narrative && !plan.requestedBlocks.length && !handoff) return null;

  /*
   * HAU KIEM TIEN cua ban truoc — nay la TELEMETRY, khong con la mot cong (muc 7 hop dong).
   *
   * Hai ly do no khong con duoc quyen bo ban soan. (a) No neo vao `JSON.stringify(output)`, ma
   * `output` co ECHO tham so model tu gui — tuc model tu tao duoc bang chung cho chinh con so no
   * sap viet. (b) Hop dong neo nguon o `outbound-narrative.ts` (G2) chat hon han: no quet MOI con
   * so chu khong chi con so mang hinh dang tien, va no neo vao chuoi HE THONG SO HUU. Giu lai o
   * day nhu mot dau hieu bat thuong thi van co ich; de no bo ca luot thi chi lam mat mot cau tra
   * loi ma G2 se xu ly dung hon o buoc sau.
   */
  const invented = unverifiedAmounts(
    narrative,
    outcomes.map((outcome) => outcome.output),
  );
  if (invented.length) {
    // SO LUONG, khong phai gia tri: day la `Logger` thuong, khong di qua `sanitizeTelemetry`, va
    // mot chuoi chu so bi doc nham la tien co the la so dien thoai khach. Ban than con so thi da
    // nam trong ban ghi `ai_call` — noi co bo loc rieng tu — nen o day khong mat gi.
    logger.warn(`[advisor] loi nhan co ${invented.length} con so ngoai ket qua cong cu.`);
  }
  logger.log(
    `[advisor] cong cu=${usedTools.join(',') || 'khong'} handoff=${handoff} khoi=${plan.requestedBlocks.join(',') || 'khong'}`,
  );
  return {
    text: narrative,
    usedTools,
    handoff,
    authority: mergeAuthority(...outcomes.map((outcome) => outcome.grants)),
    plan,
    facts: mergeBusinessFacts(
      NO_BUSINESS_FACTS,
      ...outcomes.flatMap((outcome) => (outcome.facts ? [outcome.facts] : [])),
    ),
    sources: outcomes.flatMap((outcome) => [...(outcome.sources ?? [])]),
  };
}

function stripMarker(text: string): string {
  return text.replaceAll(HANDOFF_MARKER, '').trim();
}

export class ClaudeAdvisorAgent extends AdvisorAgent {
  readonly name = 'claude';
  private readonly logger = new Logger('AdvisorAgent');
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    override readonly model: string = DEFAULT_MODEL,
  ) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async reply(request: AdvisorRequest): Promise<AdvisorReply | null> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: request.customerText.trim() || '(khach gui mot anh)' },
    ];
    const outcomes: AdvisorToolOutcome[] = [];
    const usedTools: string[] = [];

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: buildAdvisorSystem(request),
          tools: advisorToolsFor(request.tools).map(toAnthropicTool),
          messages,
        });
        // Bao NGAY sau khi co response, TRUOC moi duong thoat: cac duong `return null` ben duoi
        // (tu choi, het vong, lo so tien) deu la nhung lan da dot token that.
        reportAnthropicUsage(response.usage, request.reportUsage);
        if (response.stop_reason === 'refusal') {
          this.logger.warn('LLM tu choi tra loi — dung duong tat dinh.');
          return null;
        }
        if (response.stop_reason !== 'tool_use') {
          return this.finalize(response, outcomes, usedTools);
        }
        // Vong CUOI van tra `tool_use` nghia la LLM chua chiu ket luan; ep no viet cau tra loi
        // bang du kien da co thay vi tra ve tay khong.
        if (round === MAX_TOOL_ROUNDS) {
          this.logger.warn(`Het ${MAX_TOOL_ROUNDS} vong cong cu — dung duong tat dinh.`);
          return null;
        }
        const calls = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );
        const results = await Promise.all(
          calls.map(async (call) => {
            usedTools.push(call.name);
            // `input` la JSON do LLM sinh — coi nhu du lieu ngoai, tung cong cu tu ep kieu.
            const outcome = await runAdvisorTool(
              call.name,
              (call.input ?? {}) as Record<string, unknown>,
              request.tools,
            );
            outcomes.push(outcome);
            return {
              type: 'tool_result' as const,
              tool_use_id: call.id,
              // CHI `output` di sang LLM. Tham quyen la thu he thong giu de xet ban soan — dua no
              // vao prompt se bien mot rang buoc thanh mot goi y ma model co the doc va bat chuoc.
              content: JSON.stringify(outcome.output),
            };
          }),
        );
        // `soan_tra_loi` la cong cu KET THUC LUOT: co ke hoach roi thi khong con gi de hoi model
        // nua, va mot vong nua chi ton them mot lan goi API ma ket qua da co.
        if (outcomes.some((outcome) => outcome.plan)) {
          return finalizeAdvisorReply('', outcomes, usedTools, this.logger);
        }
        messages.push({ role: 'assistant', content: response.content });
        // MOT tin nguoi dung chua TAT CA tool_result: tach ra nhieu tin se day LLM ve phia goi
        // cong cu tuan tu, cham hon han ma khong duoc gi.
        messages.push({ role: 'user', content: results });
      }
      return null;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      // Fail-safe: hong thi khach van nhan duoc duong tat dinh, chi la kem tu nhien hon.
      this.logger.warn(`Agent tu van that bai, dung duong tat dinh: ${detail}`);
      return null;
    }
  }

  private finalize(
    response: Anthropic.Message,
    outcomes: readonly AdvisorToolOutcome[],
    usedTools: string[],
  ): AdvisorReply | null {
    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return finalizeAdvisorReply(raw, outcomes, usedTools, this.logger);
  }
}

function toAnthropicTool(spec: AdvisorToolSpec): Anthropic.Tool {
  return {
    name: spec.name,
    description: spec.description,
    // `strict: true` va `output_config.effort` la tham so cua API hien tai nhung CHUA co trong
    // `@anthropic-ai/sdk@0.68.0` dang pin. Khong tu nang SDK trong thay doi nay vi `ClaudeParser`
    // dung chung client; thay vao do MOI cong cu tu ep kieu dau vao trong `runAdvisorTool`.
    input_schema: spec.inputSchema as Anthropic.Tool.InputSchema,
  };
}

/**
 * `system` la MANG block de dat duoc diem cat cache (giong `ClaudeParser`):
 *   block 0 = phan TINH (vai tro, rang buoc, huong dan dung cong cu) -> `cache_control` ephemeral
 *   block 1 = phan BIEN DONG (danh tinh khach, lich su, don nhap) -> nam SAU diem cat
 * Prompt caching so khop TIEN TO, nen moi thu doi theo tung tin bat buoc phai nam sau moi thu on dinh.
 */
export function buildAdvisorSystem(request: AdvisorRequest): Anthropic.TextBlockParam[] {
  const turn = buildAdvisorTurnContext(request);
  return [
    { type: 'text', text: ADVISOR_STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(turn ? [{ type: 'text' as const, text: turn }] : []),
  ];
}

export const ADVISOR_STATIC_PROMPT = [
  'Ban la nhan vien tu van ban hang, dang nhan tin trong nhom Zalo cua dai ly/khach hang.',
  'Khach viet tieng Viet VIET TAT, KHONG DAU. Ban tra loi bang tieng Viet CO DAU.',
  '',
  'CACH LAM VIEC — bat buoc theo dung thu tu:',
  '1. Doc lich su hoi thoai de hieu khach dang noi ve cai gi. "cai do", "no", "the con..." deu tro ve thu vua noi.',
  '2. GOI CONG CU de lay du kien. Tuyet doi khong tra loi ve san pham, gia, chinh sach hay don hang bang tri nho cua ban.',
  '3. Ket thuc luot bang cong cu `soan_tra_loi`. Do la CACH DUY NHAT de tra loi khach.',
  '4. Chua du du kien thi goi THEM cong cu; dung ket thuc luot bang mot cau chung chung.',
  '',
  'CACH `soan_tra_loi` LAM VIEC — doc ky, no khac cach ban quen:',
  '- `loi_nhan` la phan BAN viet: giai thich, tra loi cong nang/cach dung/bao hanh tu tai lieu da duyet, hoi lai thu con thieu.',
  '- Con so tien, dieu khoan cong no/thanh toan, cau VAT/COD/cuoc, cau noi don da duoc ghi nhan/chot: KHONG viet vao `loi_nhan`. Hay XIN KHOI trong `khoi_nghiep_vu`, he thong tu dung tung dong tu du lieu goc va ghep vao sau loi nhan cua ban.',
  '- Xin khoi ma he thong khong co du lieu goc thi khoi do se KHONG xuat hien. Do la dung — luc do hay noi that la se nho Sale kiem tra. Tuyet doi khong viet bu con so vao `loi_nhan`.',
  '- Vi du: khach hoi gia -> goi `bao_gia` roi `soan_tra_loi` voi `khoi_nghiep_vu: ["bao_gia"]` va `loi_nhan` chi la mot cau dan ngan. Ban KHONG go lai con so.',
  '- `loi_nhan` phai TRICH NGUYEN VAN TUNG CAU cua tai lieu da duyet, KHONG dien y lai. Don vi la CA CAU: chep tu chu dau den dau cham cuoi, dung tung chu, dung tung dau phay ben trong. Ban chi duoc them tieng xung ho/le phep o hai dau ("Da ...", "... a.") va noi cac cau bang dau cham.',
  '- Chep THIEU MOT CHU cung la sai. Dac biet: KHONG duoc bo ve dieu kien ngan bang dau phay o cuoi cau ("..., neu co loi tu nha san xuat", "..., tru dai ly cap 1", "..., tru khu vuc mien nui") — bo no la doi han y nghia, va he thong se bo ca loi nhan.',
  '- Cau nao tai lieu khong noi thi DUNG viet. Ghep nua cau nay voi nua cau kia, doi thu tu tu ngu, hay noi hai cau bang dau hai cham/gach ngang deu la viet moi.',
  '',
  'RANG BUOC KHONG DUOC PHA:',
  '- Moi CON SO ban viet trong `loi_nhan` phai co trong tai lieu/danh muc cong cu vua tra ve, hoac trong chinh tin khach vua gui. He thong doi chieu tung con so va se BO loi nhan cua ban neu co con so khong truy nguyen duoc.',
  '- Thong so, cong dung, cam ket bao hanh: chi noi nhung gi co trong ket qua `tra_cuu_tai_lieu`. Tai lieu tra ve rong nghia la CHUA DUOC DUYET — khong duoc lay tu kien thuc chung cua ban.',
  '- Khong bia ten san pham. Chi noi ve san pham `tra_cuu_san_pham` tra ve.',
  `- Khi khong du du kien de tra loi dung, viet mot cau ngan noi se nho Sale kiem tra roi them ${HANDOFF_MARKER} o cuoi. Doan bua te hon nhieu so voi noi that.`,
  '',
  'KHI NAO CHUYEN SALE, KHI NAO TU TRA LOI:',
  `- CHUYEN SALE (${HANDOFF_MARKER}): khach bao may HONG/LOI, giao sai, giao thieu, doi tra, khieu nai; xin cong no/gia ngoai chinh sach; hoac cong cu khong tra ve du kien can thiet.`,
  '- TU TRA LOI: hoi CHINH SACH ("bao hanh bao lau", "cong no may ngay", "co duoc doi mau khong"), hoi cong nang/thong so/cach dung, hoi gia — mien la cong cu da tra ve du kien.',
  '- Mot cau HOI VE chinh sach bao hanh KHONG phai mot ca khieu nai. Dung chuyen Sale chi vi trong tin co chu "bao hanh".',
  '- Khach hoi noi tiep ma khong nhac lai ten san pham ("co den ngu khong", "loc duoc bao nhieu m2") thi lay san pham tu LICH SU HOI THOAI roi tra cuu binh thuong — day khong phai ly do chuyen Sale.',
  '',
  'KHI KHACH MUON DAT HANG:',
  '- Thieu thong tin (chua ro san pham nao, chua co so luong, don giao thang khach le ma thieu nguoi nhan) thi HOI LAI khach dung thu con thieu, moi luot hoi toi da 2 y.',
  '- Da du thong tin thi goi `tinh_don` roi `soan_tra_loi` voi `khoi_nghiep_vu: ["tinh_tien_don"]`. Ban khong ke lai tung dong — he thong dung bang tien.',
  '- Da hoi mot lan roi thi khong hoi lai y do bang cau khac.',
  '',
  'CACH VIET:',
  '- Xung "em", goi khach la "anh/chi" hoac goi thang ten neu biet. Lich su, than thien.',
  '- Toi da 4 cau. Tra loi THANG dieu khach vua hoi truoc.',
  '- Khong markdown, khong bullet, khong tieu de. Viet nhu dang nhan tin Zalo.',
  '- Dieu da noi trong lich su thi khong lap lai.',
].join('\n');

export function buildAdvisorTurnContext(request: AdvisorRequest): string {
  const now = request.now ?? new Date();
  const resolved = request.tools.resolved;
  const lines = [
    request.senderDisplayName
      ? `NGUOI DANG HOI: ${request.senderDisplayName}. Tra loi RIENG nguoi nay; trong nhom con nhieu nguoi khac dang nhan tin.`
      : 'NGUOI DANG HOI: chua ro ten.',
    resolved.dealer
      ? `Nhom nay thuoc dai ly: ${resolved.dealer.name}.`
      : 'Nhom nay CHUA map dai ly.',
    formatDraft(request.pendingDraft, request.missingSlots),
    formatClosedOrder(request),
    formatHistory(request.context, now),
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Don nhap dang do CUA CHINH nguoi nay. Vi sao phai dua vao: khong co no, LLM chi thay mot tin
 * "20" troi noi va khong biet 20 cai gi — dung cai canh khien khach phai go lai tu dau.
 */
function formatDraft(draft: OrderDraft | undefined, missing: readonly ClarifySlot[] = []): string {
  if (!draft?.items.length && !missing.length) return '';
  const items = (draft?.items ?? [])
    .map(
      (item) => `${item.skuRaw ?? '(chua ro san pham)'} x ${item.quantity ?? '(chua ro so luong)'}`,
    )
    .join('; ');
  return [
    'DON DANG THU THAP CUA NGUOI NAY (do he thong giu, khong phai ban tu nho):',
    items ? `- Dong hang: ${items}` : '- Chua co dong hang nao.',
    missing.length ? `- He thong xac dinh con thieu: ${missing.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Don VUA CHOT + (neu co) lenh sua don.
 *
 * Khong co khoi nay, mot tin nhu "cho a lay 5 cai" ngay sau khi chot 20 ghe Felix den noi ma
 * khong con gi de neo vao, va agent chi con cach hoi lai "minh lay san pham nao a?" — dung cai
 * canh khach bao la bot khong hieu (21/08/2026).
 */
function formatClosedOrder(request: AdvisorRequest): string {
  const closed = request.closedOrder;
  if (!closed) return '';
  const items = closed.draft.items
    .map((item) => `${item.skuRaw ?? '(chua ro)'} x ${item.quantity ?? '(chua ro)'}`)
    .join('; ');
  const lines = [
    `DON VUA CHOT XONG cua nguoi nay (ma don: ${closed.orderId}, luc ${closed.closedAt}):`,
    items ? `- ${items}` : '- (khong doc duoc dong hang)',
  ];
  if (request.amendRequest) {
    lines.push(
      request.amendRequest.isCancelOnly
        ? 'KHACH DANG MUON HUY DON NAY. Goi `tra_cuu_don` de lay dung ma don, roi goi `huy_don`. Sau do bao khach da huy xong.'
        : 'KHACH DANG MUON DOI DON NAY, khong phai dat them don moi. Goi `tra_cuu_don` de lay dung ma don, roi goi `sua_don` voi TOAN BO dong hang moi. Khong duoc de don cu song song voi don moi.',
    );
  } else {
    lines.push(
      'Tin moi cua khach co the noi tiep don nay ("cai do", "cai nay"). Neu khong ro khach muon DOI don nay hay DAT THEM don moi, hay HOI LAI mot cau ngan cho ro truoc khi lam gi.',
    );
  }
  return lines.join('\n');
}

function formatHistory(context: ConversationContext | undefined, now: Date): string {
  if (!context) return '';
  const lines = [
    context.quotedMessage ? `Khach dang reply tin: ${context.quotedMessage.text}` : '',
    ...formatTranscript(context, now),
  ].filter(Boolean);
  return lines.length
    ? `\nLICH SU HOI THOAI TRONG NHOM (moi dong ghi ro ai noi):\n${lines.join('\n')}`
    : '';
}
