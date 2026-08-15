import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type { ConversationContext } from '@netviet/shared';

/**
 * Tang soan van ban tu van (Uu tien 2 — bao cao chan doan 15/08/2026).
 *
 * VAN DE no giai: truoc day cau tra loi tu van KHONG duoc sinh ra, no la mot cau `SELECT` roi
 * `body.join('\n')` — noi nguyen van cac cau tra loi FAQ. Nen khach doc thay mot buc tuong chu
 * roi rac, khong lien quan den cach ho vua hoi, va khong bao gio nhac lai duoc dieu da noi truoc.
 *
 * RANG BUOC BAT BIEN (CLAUDE.md quyet dinh #5 — KHONG duoc dao nguoc):
 *   LLM chi duoc SOAN VAN BAN tu du kien da duoc cap.
 *   Gia / ship / chinh sach / VAT VAN do rules engine TypeScript tinh va duoc ghep vao SAU.
 * Vi vay prompt cam tuyet doi viec noi con so tien, va `compose()` tra ve `null` de ben goi giu
 * nguyen van ban tra bang cu — fail-safe, khong bao gio lam hong duong dang chay.
 */
export interface AdviceSnippet {
  readonly question?: string;
  readonly body: string;
}

export interface AdviceComposeInput {
  /** Tin hien tai cua khach, nguyen van (chua normalize) de LLM doc duoc dau cau/ngu khi. */
  readonly customerText: string;
  /** Ten san pham da nhan dien — de LLM goi dung ten, khong tu dat ten khac. */
  readonly productNames: readonly string[];
  /** FAQ/advice DA DUYET (`active`). Day la TOAN BO su that LLM duoc phep dung. */
  readonly snippets: readonly AdviceSnippet[];
  /** Lich su hoi thoai (neu co) — de tra loi tiep mach, khong lap lai dieu da noi. */
  readonly context?: ConversationContext;
}

export abstract class AdviceComposer {
  abstract readonly name: string;
  /** Tra ve van ban da soan, hoac `null` de ben goi dung nguyen van ban tra bang. */
  abstract compose(input: AdviceComposeInput): Promise<string | null>;
}

/** Mac dinh: khong soan gi ca — giu y nguyen hanh vi noi FAQ. Dung cho demo/CI offline. */
export class NoopAdviceComposer extends AdviceComposer {
  readonly name = 'noop';
  async compose(): Promise<string | null> {
    return null;
  }
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;

/**
 * Nhung gi LLM TUYET DOI khong duoc lam. De rieng thanh hang so vi day la ranh gioi tuan thu,
 * khong phai tuy chon van phong: noi sai mot con so tien trong nhom dai ly la mot sai sot that.
 */
const GUARDRAILS = [
  'CHI duoc dung du kien trong phan TU LIEU DA DUYET ben duoi. Khong duoc them thong so, cong dung, cam ket bao hanh hay so lieu nao khong co trong do.',
  'TUYET DOI KHONG noi bat ky con so tien nao (gia, khuyen mai, phi ship). He thong se ghep bang gia vao sau. Neu khach hoi gia, chi noi se bao gia ngay ben duoi.',
  'Khong bia ten san pham khac. Chi noi ve san pham duoc liet ke.',
  'Neu tu lieu khong tra loi duoc dieu khach hoi, noi that la se nho Sale xac minh — khong doan.',
].join('\n');

export class ClaudeAdviceComposer extends AdviceComposer {
  readonly name = 'claude';
  private readonly logger = new Logger('AdviceComposer');
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string = DEFAULT_MODEL,
  ) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async compose(input: AdviceComposeInput): Promise<string | null> {
    if (!input.snippets.length) return null;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: buildComposerSystemPrompt(input),
        messages: [{ role: 'user', content: input.customerText }],
      });
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();
      if (!text) return null;
      // Chan hau kiem: LLM lo noi con so tien thi BO ban soan, quay ve van ban tra bang. Re hon
      // nhieu so voi viec gui mot con gia sai vao nhom dai ly.
      if (looksLikeMoney(text)) {
        this.logger.warn('Ban soan co con so tien — bo, dung van ban tra bang.');
        return null;
      }
      return text;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      // Fail-safe: hong thi khach van nhan duoc noi dung da duyet, chi la kem muot hon.
      this.logger.warn(`Soan tu van that bai, dung van ban tra bang: ${detail}`);
      return null;
    }
  }
}

/**
 * Bat "1.150k", "2tr5", "1.150.000d", "2 trieu" — cac cach viet tien pho bien trong nhom Zalo.
 *
 * Hai cai bay da lam sai ban dau tien:
 *   - `\b` sau "đ" KHONG khop: "đ" khong phai \w trong JS regex (ASCII), nen "1.150.000đ" lot.
 *   - "2tr5" lot vi sau "tr" con chu so; phai la `tr\d*` chu khong phai `tr\b`.
 * Lookahead `(?![\p{L}\d])` de "20m2 dùng tốt" KHONG bi doc thanh "20 d" — dien tich khong phai gia.
 */
export function looksLikeMoney(text: string): boolean {
  return /\d[\d.,]*\s*(k|tr\d*|tri[eệ]u|vnd|ngh[iì]n|[dđ])(?![\p{L}\d])/iu.test(text);
}

export function buildComposerSystemPrompt(input: AdviceComposeInput): string {
  const snippets = input.snippets
    .map((snippet, index) =>
      snippet.question
        ? `[${index + 1}] Hoi: ${snippet.question}\n    Dap: ${snippet.body}`
        : `[${index + 1}] ${snippet.body}`,
    )
    .join('\n');
  const history = formatHistory(input.context);
  return [
    'Ban la nhan vien tu van ban hang, dang tra loi trong nhom Zalo cua dai ly/khach hang.',
    'Nhiem vu: doc dung dieu khach vua hoi, roi tra loi bang giong noi tu nhien cua nguoi ban hang — KHONG dan nguyen van tai lieu.',
    '',
    'CACH VIET:',
    '- Tieng Viet co dau, xung "em", goi khach la "anh/chi". Lich su, ngan gon.',
    '- Toi da 4-5 cau. Tra loi THANG dieu khach hoi truoc, roi moi bo sung y phu neu that su can.',
    '- Neu lich su hoi thoai cho thay da noi roi thi KHONG lap lai — noi tiep mach.',
    '- Khong dung markdown, khong bullet, khong tieu de. Viet nhu dang nhan tin.',
    '',
    'RANG BUOC BAT BUOC:',
    GUARDRAILS,
    '',
    input.productNames.length ? `SAN PHAM KHACH DANG HOI: ${input.productNames.join(', ')}` : '',
    history,
    '',
    'TU LIEU DA DUYET (nguon su that DUY NHAT):',
    snippets,
  ]
    .filter(Boolean)
    .join('\n');
}

function formatHistory(context: ConversationContext | undefined): string {
  if (!context) return '';
  const lines = [
    context.quotedMessage ? `Khach reply tin: ${context.quotedMessage.text}` : '',
    ...context.recentMessages.map(
      (message) => `${message.senderDisplayName ?? 'Khach'}: ${message.text}`,
    ),
  ].filter(Boolean);
  return lines.length ? `\nLICH SU HOI THOAI GAN DAY:\n${lines.join('\n')}` : '';
}
