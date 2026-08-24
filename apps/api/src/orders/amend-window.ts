import type { OrderView } from '@netviet/shared';
import type { AmendWindowReason } from './sales-order-decisions.js';

/**
 * CUA SO CON SUA DUOC mot don hang.
 *
 * Day la cho quyet dinh LLM co duoc phep dong vao mot don hay khong, nen no phai THUAN va phai
 * tai lap duoc: khi khach cai "sao don cua toi bi doi", cau tra loi phai doc duoc tu mot ham,
 * khong phai suy tu mot chuoi tac dung phu.
 *
 * MOC CHAN LA `salesHandoff`, KHONG PHAI `status`. Ly do nghiep vu: GĐ1 khong goi KiotViet —
 * Sale go tay don vao ERP sau khi khach nhan xac nhan. Thoi diem do la diem KHONG QUAY LAI:
 * truoc no, doi don chi la doi mot tin nhan; sau no, doi don la lam lech giua Zalo va ERP ma
 * khong he thong nao biet. Vi vay `sent` + `salesHandoff.pending` VAN sua duoc, con `sent` +
 * `completed` thi khoa cung — ke ca khi tich hop KiotViet that o giai doan sau, moc nay van dung.
 */

export type AmendBlockReason =
  | 'da_nhap_erp'
  | 'da_tu_choi'
  | 'da_dong_bo_erp'
  | 'khong_phai_don';

export type AmendVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: AmendBlockReason; readonly message: string };

const BLOCKED: Record<AmendBlockReason, string> = {
  da_nhap_erp:
    'Sale đã nhập đơn này vào hệ thống bán hàng. Em không tự sửa được nữa, phải nhờ Sale xử lý.',
  da_tu_choi: 'Đơn này đã bị huỷ trước đó rồi ạ.',
  da_dong_bo_erp: 'Đơn này đã đồng bộ sang hệ thống bán hàng, phải nhờ Sale xử lý ạ.',
  khong_phai_don: 'Tin này không phải một đơn hàng nên không sửa được.',
};

function deny(reason: AmendBlockReason): AmendVerdict {
  return { allowed: false, reason, message: BLOCKED[reason] };
}

/**
 * Don nay con sua/huy duoc khong.
 *
 * Thu tu xet co y: `khong_phai_don` truoc de mot cau hoi tu van khong bao gio bao "da nhap ERP".
 */
export function canAmendOrder(order: OrderView): AmendVerdict {
  if (order.intent !== 'dat_don' || !order.priced) return deny('khong_phai_don');
  if (order.status === 'rejected') return deny('da_tu_choi');
  if (order.status === 'synced') return deny('da_dong_bo_erp');
  // Da gui cho khach nhung Sale CHUA go vao ERP -> con kip sua, chi phai bao lai khach.
  if (order.status === 'sent') {
    return order.salesHandoff?.status === 'completed' ? deny('da_nhap_erp') : { allowed: true };
  }
  // `draft` | `pending_review` | `needs_edit` | `approved`: khach chua nhan gi, sua thoai mai.
  return { allowed: true };
}

/**
 * Ma QUAN SAT tuong ung voi mot phan quyet.
 *
 * Nam canh chinh bang `BLOCKED` co chu y: them mot duong tu choi ma quen ma quan sat cua no thi
 * TypeScript bao ngay, thay vi mot ma im lang bien mat khoi trace.
 */
const DECISION_REASON: Record<AmendBlockReason, AmendWindowReason> = {
  khong_phai_don: 'AMEND_NOT_AN_ORDER',
  da_tu_choi: 'AMEND_ALREADY_REJECTED',
  da_dong_bo_erp: 'AMEND_SYNCED_TO_ERP',
  da_nhap_erp: 'AMEND_HANDED_TO_ERP',
};

/** Phan quyet -> ma quan sat. Mot nguon su that, hai cach doc — cung khuon `evaluateAutoConfirm`. */
export function amendDecisionReason(verdict: AmendVerdict): AmendWindowReason {
  return verdict.allowed ? 'AMEND_ALLOWED' : DECISION_REASON[verdict.reason];
}

/** Don da GUI cho khach roi thi sua no phai bao lai khach; sua don chua gui thi khong can. */
export function amendNeedsCustomerNotice(order: OrderView): boolean {
  return order.status === 'sent';
}
