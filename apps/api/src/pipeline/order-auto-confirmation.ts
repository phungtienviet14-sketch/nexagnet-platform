import type { OrderView } from '@netviet/shared';
import type { OrderAutomation } from '@netviet/tenant';
import type { AutoConfirmReason } from '../orders/sales-order-decisions.js';

export interface AutoConfirmationContext {
  policy: OrderAutomation | null;
  killSwitchEnabled: boolean;
  manualReview: boolean;
}

/** Quyet dinh kem LY DO. `detail` chi chua so lieu lam ro nguong, khong chua noi dung don. */
export interface AutoConfirmDecision {
  readonly allowed: boolean;
  readonly reason: AutoConfirmReason;
  readonly detail?: Readonly<Record<string, number>>;
}

/**
 * Cong outbound tat dinh cho don GĐ1 — ban CO LY DO.
 *
 * Co y KHONG doc Supervisor risk: 30 SP/20 trieu la nguong quan sat, khong phai policy tu gui.
 * Du lieu thieu/sai van fail-closed qua mapping, gia va warnings cua rules engine.
 *
 * VI SAO TACH RA KHOI HAM `boolean`:
 * Ham cu co BAY duong tra ve `false` gop lam mot. Khi Sale hoi "sao don nay khong tu gui",
 * cau tra loi duy nhat rut ra duoc tu he thong la "khong", con vi sao thi phai mo source doc lai
 * bay dieu kien roi doan. Thu tu kiem tra o day GIU NGUYEN Y HET ban cu — day la mot thay doi
 * ve QUAN SAT, khong phai ve NGHIEP VU (muc 1).
 */
export function evaluateAutoConfirm(
  view: OrderView,
  context: AutoConfirmationContext,
): AutoConfirmDecision {
  const { policy } = context;
  if (!policy?.enabled) return { allowed: false, reason: 'POLICY_DISABLED' };
  if (!context.killSwitchEnabled) return { allowed: false, reason: 'KILL_SWITCH_OFF' };
  if (context.manualReview) return { allowed: false, reason: 'MANUAL_REVIEW' };
  if (view.intent !== 'dat_don') return { allowed: false, reason: 'NOT_ORDER_INTENT' };
  if (!view.priced) return { allowed: false, reason: 'ORDER_NOT_PRICED' };
  if (!view.dealerName) return { allowed: false, reason: 'DEALER_UNKNOWN' };
  if (view.priced.warnings.length > 0) {
    return {
      allowed: false,
      reason: 'PRICING_WARNINGS',
      detail: { warnings: view.priced.warnings.length },
    };
  }
  if (view.priced.lines.length === 0) return { allowed: false, reason: 'NO_ORDER_LINES' };

  const allLinesArePriced = view.priced.lines.every(
    (line) => line.matched && line.sku !== null && line.quantity > 0 && line.unitPrice > 0,
  );
  if (!allLinesArePriced) return { allowed: false, reason: 'LINE_NOT_FULLY_PRICED' };

  const totalQuantity = view.priced.lines.reduce((sum, line) => sum + line.quantity, 0);
  const detail = { totalQuantity, threshold: policy.maxAutoConfirmQuantity };
  return totalQuantity <= policy.maxAutoConfirmQuantity
    ? { allowed: true, reason: 'ALLOWED', detail }
    : { allowed: false, reason: 'QUANTITY_ABOVE_THRESHOLD', detail };
}

/**
 * Chu ky cu, giu nguyen cho moi noi dang goi va moi test dang co.
 * Uy quyen hoan toan cho `evaluateAutoConfirm` — mot nguon su that, hai cach doc.
 */
export function shouldAutoConfirmOrder(view: OrderView, context: AutoConfirmationContext): boolean {
  return evaluateAutoConfirm(view, context).allowed;
}
