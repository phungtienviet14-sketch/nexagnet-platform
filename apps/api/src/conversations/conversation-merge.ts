import type { OrderDraft, ParseResult } from '@netviet/shared';
import type { Product } from '../knowledge/domain.js';
import { mentionedSkus } from '../pipeline/contextual-parse.js';
import { normalize } from '../rules/text.js';
import {
  analyzeDraft,
  draftFromParse,
  draftHasContent,
  mergeDraft,
  toParsedOrder,
  type DraftGaps,
} from './order-draft.js';

/**
 * GHEP mot luot tin vao mach chot don. Thuan (pure).
 *
 * Day la cho bien "bot nho duoc hoi thoai" thanh mot hanh vi thay duoc: tin "20" sau khi bot hoi
 * "may cai a?" khong con la mot tin vo nghia, no la SO LUONG cua don dang do.
 */

export interface ConversationTurnInput {
  readonly result: ParseResult;
  /** Van ban goc cua tin — de doc cau tra loi cut lun ("20", "0912345678"). */
  readonly text: string;
  readonly pendingDraft: OrderDraft | null;
  /** Bot vua hoi va dang cho nguoi nay tra loi. */
  readonly answeringQuestion: boolean;
  readonly products: Product[];
  readonly dealerKnown: boolean;
}

export interface ConversationTurnOutput {
  /** Ket qua parser SAU khi ghep — co `order` day du khi don da du de dua vao rules engine. */
  readonly result: ParseResult;
  /** Don nhap sau khi gop; `null` khi tin nay khong thuoc mot luot chot don. */
  readonly draft: OrderDraft | null;
  readonly gaps: DraftGaps | null;
}

export function mergeConversationTurn(input: ConversationTurnInput): ConversationTurnOutput {
  const { result, pendingDraft, answeringQuestion } = input;
  const continuing = answeringQuestion && pendingDraft !== null && draftHasContent(pendingDraft);
  if (result.intent !== 'dat_don' && !continuing) {
    return { result, draft: null, gaps: null };
  }

  const incoming = pickIncoming(input, continuing);
  const merged = mergeDraft({
    previous: continuing ? pendingDraft : null,
    incoming,
    products: input.products,
  });
  if (!draftHasContent(merged)) return { result, draft: null, gaps: null };

  const gapContext = { products: input.products, dealerKnown: input.dealerKnown };
  const gaps = analyzeDraft(merged, gapContext);
  const order = gaps.complete ? toParsedOrder(merged, gapContext) : null;
  return {
    result: order
      ? { ...result, intent: 'dat_don', order }
      : // Bo `order` di co chu y: mot don nua voi khong duoc xuong rules engine, vi `priceOrder`
        // se tinh ra mot tong tu du lieu chua day du roi `routeStatus` cho no di tiep nhu that.
        { ...result, intent: 'dat_don', order: undefined },
    draft: merged,
    gaps,
  };
}

/**
 * Du kien MOI cua luot nay.
 *
 * CHO NAY LA CHOT CHAN CUA NHIEU KHACH TRONG MOT NHOM. Khi khach dang tra loi cau hoi cua chinh
 * ho ma TIN DO KHONG NHAC TEN SAN PHAM NAO, moi ten SP trong output parser deu la suy dien tu
 * transcript CHUNG cua nhom — ma transcript do co ca tin cua nguoi khac. Da xay ra that trong
 * test: Lan dang cho tra loi ve ghe Felix, go "20", parser ke thua "noi chien" tu tin cua Hung
 * ngay truoc do, va don cua Lan mo them mot dong hang cua nguoi khac.
 *
 * Nen: khong nhac SP -> BO ten SP khoi du kien moi, chi giu con so. Dong hang nao duoc dien la
 * viec cua `mergeDraft`, tren don nhap CUA CHINH nguoi nay.
 */
function pickIncoming(input: ConversationTurnInput, continuing: boolean): OrderDraft {
  const parsed = draftFromParse(input.result);
  if (!continuing) return parsed;
  if (mentionedSkus(input.text, input.products).size === 0) {
    const quantitiesOnly = {
      ...parsed,
      items: parsed.items.flatMap((item) =>
        item.quantity === undefined ? [] : [{ quantity: item.quantity }],
      ),
    };
    return draftHasContent(quantitiesOnly) ? quantitiesOnly : answerFromText(input.text);
  }
  return draftHasContent(parsed) ? parsed : answerFromText(input.text);
}

/** Chi mot con so (co the kem don vi) -> do la SO LUONG. "20", "20 cai", "lay 20 nhe". */
const BARE_QUANTITY = /^(?:lay|dat|mua|cho|gui|can|oke?|ok|dung|van)?\s*(\d{1,4})\s*(?:cai|chiec|con|bo|sp|san pham|thung|hop)?\s*(?:nhe|a|nha|nhá|di|nhen)?$/;

export function answerFromText(text: string): OrderDraft {
  const normalized = normalize(text);
  const quantity = BARE_QUANTITY.exec(normalized)?.[1];
  if (quantity) {
    const value = Number.parseInt(quantity, 10);
    if (Number.isInteger(value) && value > 0) return { items: [{ quantity: value }] };
  }
  return { items: [] };
}
