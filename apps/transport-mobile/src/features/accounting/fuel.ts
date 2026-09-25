import { formatVnd } from '../../format';
import { checkText, type ParseResult } from '../office/form-input';
import type { FuelEntryRow } from './types';

/**
 * PHIEU DAU — nhan va luat nut, chep tu web (`customer-view.ts`, `workspace/fuel.ts`). HAM THUAN.
 *
 * Xac thuc (`POST …/verify`, khong than) lap lai AN TOAN o may chu. Tu choi can ly do 1..500 va chi
 * tu `DECLARED`; cho nop lai chi tu `REJECTED`. May chu KHONG co cong tach bach nguoi nhap/nguoi xac
 * thuc cho phieu dau — man hinh khong duoc noi la co.
 */
export const PAYMENT_METHOD_LABEL: Readonly<Record<string, string>> = {
  DRIVER_CASH: 'Lái xe trả tiền mặt',
  SUPPLIER_ACCOUNT: 'Ghi nợ cây xăng',
};

export const VERIFICATION_LABEL: Readonly<Record<string, string>> = {
  DECLARED: 'Mới khai',
  VERIFIED: 'Đã xác thực',
  REJECTED: 'Bị từ chối',
};

const REVIEW_REASON_LABEL: Readonly<Record<string, string>> = {
  ODOMETER_NOT_ADVANCED: 'Số km chưa tăng so với lần đổ trước',
  NO_PREVIOUS_ODOMETER: 'Chưa có lần đổ trước để tính tiêu hao',
  CONSUMPTION_ABOVE_NORM: 'Tiêu hao vượt định mức — chỉ để soát xét',
};

export const reviewReasonLabel = (reason: string): string => REVIEW_REASON_LABEL[reason] ?? reason;

/** Phieu chuyen cu hien MA CHUYEN; phieu theo vong xe hien ma vong (+ chang); khong bia ma. */
export function fuelContextLabel(
  row: Pick<FuelEntryRow, 'tripCode' | 'runCode' | 'legSequence'>,
): string {
  if (row.tripCode !== null) return row.tripCode;
  if (row.runCode !== null) {
    return row.legSequence === null
      ? `Vòng xe ${row.runCode}`
      : `Vòng xe ${row.runCode} · Chặng ${row.legSequence}`;
  }
  return 'Không gắn việc';
}

/**
 * HAU QUA cua lan xac thuc, noi TRUOC khi bam — theo CACH TRA (web `verifyConsequence`, #385).
 */
export function verifyConsequence(
  row: Pick<FuelEntryRow, 'paymentMethod' | 'amount' | 'tripId'>,
): string {
  if (row.paymentMethod === 'SUPPLIER_ACCOUNT') {
    return 'Sau khi xác thực, phiếu vào được kỳ đối soát bảng kê; công nợ cây xăng chỉ ghi khi chốt kỳ.';
  }
  const cost =
    row.tripId === null
      ? 'Giá thành của phiếu được phân bổ sau ở mục Giá thành nhiên liệu.'
      : 'Khoản này đồng thời vào chi phí của chuyến.';
  return `Sau khi xác thực, ${formatVnd(row.amount)} trừ vào quỹ lái xe (lái xe đã trả tiền mặt) — không vào công nợ cây xăng. ${cost}`;
}

export interface FuelActions {
  readonly canVerify: boolean;
  readonly canReject: boolean;
  readonly canResubmit: boolean;
}

/** Cung luat web (`toFuelInboxRow`): trang thai + quyen `transport.fuel.entry.verify`. */
export function fuelActions(status: string, mayVerify: boolean): FuelActions {
  return {
    canVerify: mayVerify && status === 'DECLARED',
    canReject: mayVerify && status === 'DECLARED',
    canResubmit: mayVerify && status === 'REJECTED',
  };
}

export function checkRejectReason(raw: string): ParseResult<string> {
  return checkText(raw, { label: 'lý do từ chối', min: 1, max: 500 });
}

/** Anh hien truc tiep; tep khac (PDF...) chi noi co, mo tren may tinh. */
export function isImageEvidence(contentType: string | null): boolean {
  return contentType === null || contentType.startsWith('image/');
}
