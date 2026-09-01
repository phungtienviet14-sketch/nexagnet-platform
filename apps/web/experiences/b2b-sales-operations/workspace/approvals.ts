import type { OrderView } from '@netviet/shared';
import { approvalKind, awaitingApproval } from '../../../lib/sales-work';
import { CUSTOMER_INTENT_LABEL } from '../customer-view';
import { toCustomerOrderDetail, type CustomerOrderDetail } from './order-detail';

/**
 * HANG CHO "DUYET & GUI" — tinh nang chiu luc cua U-UI1 (Issue #110 §Duyệt & gửi).
 *
 * Mot muc trong hang cho phai tra loi DU BON cau, bang tieng nghiep vu, TRUOC khi nguoi dung bam
 * bat cu nut nao:
 *
 *   1. he thong dinh gui GI   -> `proposal`
 *   2. VI SAO can den nguoi   -> `reasons` (co ma, khong phai mot cau tu do)
 *   3. cho AI                 -> `groupName` / `dealerName` tren `order`
 *   4. gom nhung gi           -> dong hang, so luong, tong tien tren `order`
 *
 * Thieu cau nao thi nguoi dung phai doan, va mot nguoi doan roi bam "gửi" la cach chac chan nhat
 * de mot con so sai di den tay dai ly.
 *
 * LY DO PHAI CO MA, khong duoc la mot cau tu do: hai nguoi viet hai cau khac nhau cho cung mot
 * tinh huong thi khong loc duoc, khong dem duoc, khong kiem tra duoc bang test — cung ly le ma
 * `.claude/rules/ecc/common/code-review.md` dat ra cho `telemetry.decision()`.
 */

export type ApprovalReasonCode =
  | 'VUOT_NGUONG_TU_DONG'
  | 'CHUA_KHOP_SAN_PHAM'
  | 'CHUA_XAC_DINH_DAI_LY'
  | 'CO_CANH_BAO'
  | 'BAN_TU_VAN_CAN_KIEM_TRA'
  | 'CHO_NGUOI_XAC_NHAN';

export interface ApprovalReason {
  readonly code: ApprovalReasonCode;
  /** Cau doc cho nguoi dung — khong chua ten truong, ma loi hay ten he thong nao. */
  readonly text: string;
}

/**
 * He thong dinh GUI GI khi nguoi dung bam "Duyệt & gửi".
 *
 * `kind` phan biet hai thu khac han nhau ve trach nhiem: `xac_nhan_don` la mot CHUNG TU (con so,
 * chinh sach, tong tien — rules engine tinh, tat dinh), con `tu_van` la mot cau tra loi bang loi.
 * Nguoi duyet phai biet minh dang duyet cai nao.
 *
 * `text` la NOI DUNG SE GUI VAO NHOM — dung cau ma dai ly se doc. No khong phai prompt, khong
 * phai dap an tho cua mo hinh, va cung khong phai mot vet xu ly: giau no di thi thao tac "duyet
 * truoc khi gui" khong con nghia gi ca, vi khong ai duyet duoc mot thu minh khong nhin thay.
 */
export interface ApprovalProposal {
  readonly kind: 'xac_nhan_don' | 'tu_van';
  readonly title: string;
  readonly text: string | null;
}

export interface ApprovalItem {
  readonly reference: string;
  readonly order: CustomerOrderDetail;
  readonly proposal: ApprovalProposal;
  readonly reasons: readonly ApprovalReason[];
  /** Nhan intent, dat san de o duyet khong phai tu tra bang nhan. */
  readonly intentLabel: string;
}

const PROPOSAL_TITLE: Readonly<Record<ApprovalProposal['kind'], string>> = {
  xac_nhan_don: 'Bản xác nhận đơn sẽ gửi vào nhóm',
  tu_van: 'Câu trả lời tư vấn sẽ gửi vào nhóm',
};

export interface ApprovalContext {
  /**
   * Nguong so luong duoc tu dong gui theo cau hinh doanh nghiep, hoac `null` khi CHUA DOC DUOC.
   *
   * `null` khong duoc phep tro thanh `0` hay mot con so mac dinh: noi "đơn này vượt ngưỡng" trong
   * khi khong biet nguong bao nhieu la mot cau bia. Khong biet thi muc do van hien — chi hien
   * kem mot ly do tong quat hon.
   */
  readonly maxAutoConfirmQuantity: number | null;
}

export const EMPTY_APPROVAL_CONTEXT: ApprovalContext = { maxAutoConfirmQuantity: null };

function proposalOf(order: OrderView): ApprovalProposal {
  const kind: ApprovalProposal['kind'] = order.priced ? 'xac_nhan_don' : 'tu_van';
  const raw =
    kind === 'xac_nhan_don'
      ? order.priced?.confirmationText
      : (order.trace?.outbound?.text ?? order.trace?.reply);
  const text = raw?.trim() ?? '';
  return { kind, title: PROPOSAL_TITLE[kind], text: text.length > 0 ? text : null };
}

/**
 * VI SAO viec nay khong tu chay duoc — doc tu chinh don, tu cu the den chung chung.
 *
 * Mot cong nghiep vu co N duong tu choi phai phan biet duoc N ly do, khong gop thanh mot
 * `boolean`. Muc cuoi (`CHO_NGUOI_XAC_NHAN`) la duong lui trung thuc: no noi "đang chờ người xác
 * nhận" chu khong bia ra mot nguyen nhan ma du lieu khong chung minh duoc.
 */
export function approvalReasons(
  order: OrderView,
  context: ApprovalContext = EMPTY_APPROVAL_CONTEXT,
): readonly ApprovalReason[] {
  const reasons: ApprovalReason[] = [];
  const lines = order.priced?.lines ?? [];
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const threshold = context.maxAutoConfirmQuantity;

  if (threshold !== null && lines.length > 0 && totalQuantity > threshold) {
    reasons.push({
      code: 'VUOT_NGUONG_TU_DONG',
      text: `Tổng ${totalQuantity} sản phẩm, vượt mức ${threshold} mà doanh nghiệp cho phép gửi tự động.`,
    });
  }

  if (lines.some((line) => !line.matched)) {
    reasons.push({
      code: 'CHUA_KHOP_SAN_PHAM',
      text: 'Có dòng hàng chưa khớp được với danh mục sản phẩm.',
    });
  }

  if (order.priced && !order.priced.dealerName && !order.dealerName) {
    reasons.push({
      code: 'CHUA_XAC_DINH_DAI_LY',
      text: 'Chưa xác định được đại lý của nhóm này nên chưa chắc bảng giá đang áp dụng là đúng.',
    });
  }

  for (const warning of order.priced?.warnings ?? []) {
    reasons.push({ code: 'CO_CANH_BAO', text: warning });
  }

  if (!order.priced) {
    reasons.push({
      code: 'BAN_TU_VAN_CAN_KIEM_TRA',
      text: 'Đây là câu trả lời tư vấn, cần người đọc lại trước khi gửi vào nhóm.',
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      code: 'CHO_NGUOI_XAC_NHAN',
      text: 'Hệ thống đã chuẩn bị xong nội dung và đang chờ người xác nhận trước khi gửi.',
    });
  }

  return reasons;
}

export function toApprovalItem(order: OrderView, context?: ApprovalContext): ApprovalItem {
  return {
    reference: order.id,
    order: toCustomerOrderDetail(order),
    proposal: proposalOf(order),
    reasons: approvalReasons(order, context),
    intentLabel: CUSTOMER_INTENT_LABEL[order.intent],
  };
}

/**
 * HANG CHO, da loc va da xep.
 *
 * Dung `awaitingApproval` cua `lib/sales-work.ts` chu khong tu viet lai phep loc: hang cho cua be
 * mat khach va hang cho cua be mat noi bo phai la CUNG MOT tap. Hai dinh nghia song song se lech
 * nhau tu lan sua thu hai, va luc do khong ai biet ben nao dung.
 *
 * Xep TIN CU LEN TRUOC — nguoc voi danh sach tin nhan. Hang cho la mot hang doi: thu nam lau nhat
 * la thu sap tre nhat, va no phai o tren cung.
 */
export function toApprovalQueue(
  orders: readonly OrderView[],
  context?: ApprovalContext,
): readonly ApprovalItem[] {
  return orders
    .filter(awaitingApproval)
    .slice()
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .map((order) => toApprovalItem(order, context));
}

/** Bam duyet se gui thu gi — giu nguyen nhan cua `lib/sales-work.ts`, chi doi sang tieng nguoi. */
export function approvalKindLabel(order: OrderView): string | null {
  const kind = approvalKind(order);
  return kind ? PROPOSAL_TITLE[kind] : null;
}
