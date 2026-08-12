import type { OrderView } from '@netviet/shared';
import type { OrderAutomation } from '@netviet/tenant';

export interface AutoConfirmationContext {
  policy: OrderAutomation | null;
  killSwitchEnabled: boolean;
  manualReview: boolean;
}

/**
 * Cong outbound tat dinh cho don GĐ1.
 *
 * Co y KHONG doc Supervisor risk: 30 SP/20 trieu la nguong quan sat, khong phai policy tu gui.
 * Du lieu thieu/sai van fail-closed qua mapping, gia va warnings cua rules engine.
 */
export function shouldAutoConfirmOrder(
  view: OrderView,
  context: AutoConfirmationContext,
): boolean {
  const { policy } = context;
  if (!policy?.enabled || !context.killSwitchEnabled || context.manualReview) return false;
  if (view.intent !== 'dat_don' || !view.priced || !view.dealerName) return false;
  if (view.priced.warnings.length > 0 || view.priced.lines.length === 0) return false;

  const allLinesArePriced = view.priced.lines.every(
    (line) => line.matched && line.sku !== null && line.quantity > 0 && line.unitPrice > 0,
  );
  if (!allLinesArePriced) return false;

  const totalQuantity = view.priced.lines.reduce((sum, line) => sum + line.quantity, 0);
  return totalQuantity <= policy.maxAutoConfirmQuantity;
}
