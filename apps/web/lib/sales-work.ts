import type { OrderView } from '@netviet/shared';

/** Gom ca can thiep truoc outbound va handoff nhap ERP sau outbound vao mot hang viec Sale. */
export function requiresSalesAction(order: OrderView): boolean {
  if (order.status === 'pending_review' || order.status === 'needs_edit') return true;
  return order.status === 'sent' && order.salesHandoff?.status === 'pending';
}

/**
 * Tin dang CHO SALE BAM GUI — hep hon `requiresSalesAction`.
 *
 * Khac biet quan trong: `requiresSalesAction` con dem ca don DA GUI dang cho nhap ERP. Hang cho
 * "Duyet & gui" thi chi chua thu CHUA DEN TAY KHACH va da co san noi dung de gui — mot don da
 * tinh gia, hoac mot ban tu van agent da soan. Tin chua co gi de gui khong nam trong hang cho:
 * bam duyet no chi ra loi, va mot hang cho toan nut bam khong an duoc thi khong ai dung.
 */
export function awaitingApproval(order: OrderView): boolean {
  if (order.status !== 'pending_review' && order.status !== 'needs_edit') return false;
  return Boolean(order.priced ?? order.trace?.outbound);
}

/** Nhan cho biet bam duyet se gui thu gi — de Sale khong phai doan. */
export function approvalKind(order: OrderView): 'xac_nhan_don' | 'tu_van' | null {
  if (!awaitingApproval(order)) return null;
  return order.priced ? 'xac_nhan_don' : 'tu_van';
}
