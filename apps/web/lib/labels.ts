import type { AgentRole, AgentSource, Intent, OrderStatus, PolicyType } from '@netviet/shared';

/**
 * Nhan/icon/class CHI cho UI (khong thuoc hop dong du lieu). Tach rieng de nhieu
 * component console dung chung (DRY). Nhan nghiep vu (role/intent/sender) lay tu
 * @netviet/shared; day chi bo sung phan trinh bay.
 */

export const ROLE_ICON: Record<AgentRole, string> = {
  router: '🧭',
  product_advisor: '💡',
  sales: '🧾',
  policy_finance: '📋',
  after_sales: '🛠️',
  supervisor: '🛡️',
};

export const ROLE_TAG: Record<AgentRole, string> = {
  router: 'Router',
  product_advisor: 'Advisor',
  sales: 'Sales',
  policy_finance: 'Policy',
  after_sales: 'After-sales',
  supervisor: 'Supervisor',
};

export const SOURCE_META: Record<AgentSource, { label: string; cls: string }> = {
  rules: { label: 'Rules engine', cls: 'src-rules' },
  knowledge: { label: 'Kho tri thức', cls: 'src-knowledge' },
  llm: { label: 'AI', cls: 'src-llm' },
  router: { label: 'Điều phối', cls: 'src-router' },
  none: { label: '', cls: '' },
};

export const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: 'Nháp', cls: 'chip-review' },
  pending_review: { label: 'Chờ duyệt', cls: 'chip-review' },
  needs_edit: { label: 'Cần kiểm tra', cls: 'chip-edit' },
  approved: { label: 'Đã duyệt', cls: 'chip-done' },
  // Trung tinh: `sent` dung cho CA don hang lan cau tra loi tu van. Viec nhap ERP chi phat sinh
  // voi don hang, nen no duoc gan them o `statusMetaFor()` chu khong nam san trong nhan.
  sent: { label: 'Đã gửi', cls: 'chip-done' },
  synced: { label: 'Đã đồng bộ ERP', cls: 'chip-done' },
  rejected: { label: 'Đã từ chối', cls: 'chip-rejected' },
};

/**
 * Nhan trang thai CO NGU CANH cua tin.
 *
 * Truoc 21/08/2026 nhan `sent` luon la "Da gui - cho nhap ERP". Nay mot cau bao gia hay mot cau
 * tu van cung di qua trang thai `sent`, va noi voi Sale rang no "cho nhap ERP" la giao cho ho
 * mot viec khong ton tai. Chi don hang moi sinh viec do, va viec do nam o `salesHandoff`.
 */
export function statusMetaFor(order: {
  status: OrderStatus;
  salesHandoff?: { status: 'pending' | 'completed' | 'cancelled' };
}): { label: string; cls: string } {
  const base = STATUS_META[order.status];
  if (order.status !== 'sent' || order.salesHandoff?.status !== 'pending') return base;
  return { ...base, label: `${base.label} · chờ nhập ERP` };
}

export const INTENT_LABEL: Record<Intent, string> = {
  dat_don: 'Đặt đơn',
  hoi_gia: 'Hỏi giá',
  hoi_san_pham: 'Hỏi sản phẩm',
  chinh_sach_cong_no: 'Chính sách / công nợ',
  bao_hanh_khieu_nai: 'Bảo hành / khiếu nại',
  van_chuyen: 'Vận chuyển',
  khac: 'Khác',
};

export const POLICY_LABEL: Record<PolicyType, string> = {
  cong_no_30: 'Công nợ 30 ngày (từ ngày nhận hàng)',
  cong_no_45: 'Công nợ 45 ngày (từ ngày nhận hàng)',
  ky_gui: 'Ký gửi (chốt số cuối tháng)',
  thanh_toan_ngay: 'Thanh toán ngay (100% khi giao)',
  cod: 'COD (thu hộ khi giao)',
};

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
