import type { OrderView } from '@netviet/shared';

/** Gom ca can thiep truoc outbound va handoff nhap ERP sau outbound vao mot hang viec Sale. */
export function requiresSalesAction(order: OrderView): boolean {
  if (order.status === 'pending_review' || order.status === 'needs_edit') return true;
  return order.status === 'sent' && order.salesHandoff?.status === 'pending';
}
