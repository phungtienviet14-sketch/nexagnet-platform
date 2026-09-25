import { ApiError } from '../../api/errors';
import { officeReasonText } from './reasons';

/**
 * PHAN LOAI MOT LAN QUYET DINH THAT BAI — theo VIEC man hinh phai lam, khong theo ma HTTP.
 *
 * Quyet dinh cua van phong la lenh TRUC TUYEN (khong qua hang doi hien truong cua lai xe), nen:
 *
 *   · `RETRY` — chua co phan quyet (mat mang, het gio, 5xx, 429, het phien). GIU to truot MO voi
 *     DUNG khoa chong ghi trung: bam lai la PHAT LAI chinh lenh cu, khong tao lenh thu hai.
 *   · `ALREADY_DONE` — may chu noi viec DA xong (vd `CLAIM_ALREADY_DECIDED` sau mot lan gui ma phan
 *     hoi bi mat). Coi la xong: doc lai, bao nhe "đã được xử lý", khong to do.
 *   · `REFUSED` — may chu PHAN QUYET khong (quyen, tach bach, sai trang thai). Noi thang ly do cua may
 *     chu; khong tu thu lai vi gui lai y het van ra y het.
 */
export type DecisionFailureKind = 'RETRY' | 'ALREADY_DONE' | 'REFUSED';

export interface DecisionFailure {
  readonly kind: DecisionFailureKind;
  readonly message: string;
  readonly reason: string | null;
}

export interface DecisionErrorPolicy {
  /** Ma luon nghia la "da xong" voi loai quyet dinh nay. */
  readonly alreadyDone: readonly string[];
  /**
   * Ma CHI nghia la "da xong" khi day la lan GUI LAI (vd phieu dau: lan dau ma nhan
   * `FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED` la nguoi khac da doi trang thai — van dung, nhung
   * phai noi ro; sau mot lan mat phan hoi thi gan nhu chac chan la chinh lenh cua minh da vao).
   */
  readonly alreadyDoneOnRetry?: readonly string[];
}

const RETRY_MESSAGE =
  'Chưa chắc máy chủ đã nhận lệnh. Bấm lại — ứng dụng gửi lại đúng lệnh cũ, không tạo lệnh thứ hai.';

export function classifyDecisionFailure(
  error: unknown,
  policy: DecisionErrorPolicy,
  isRetry: boolean,
): DecisionFailure {
  if (!(error instanceof ApiError)) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
    return { kind: 'RETRY', message: `${RETRY_MESSAGE}${detail}`, reason: null };
  }
  if (error.isRetryable) {
    return { kind: 'RETRY', message: `${RETRY_MESSAGE} ${error.message}`, reason: error.reason };
  }
  const reason = error.reason;
  const doneOnRetry = isRetry && reason !== null && policy.alreadyDoneOnRetry?.includes(reason);
  if ((reason !== null && policy.alreadyDone.includes(reason)) || doneOnRetry) {
    return {
      kind: 'ALREADY_DONE',
      message: 'Việc này đã được xử lý trước đó — đã tải lại danh sách.',
      reason,
    };
  }
  return { kind: 'REFUSED', message: officeReasonText(reason, error.message), reason };
}

/** Chinh sach cho tung loai quyet dinh — mot cho, de hai man (giam doc, ke toan) noi giong nhau. */
export const CLAIM_POLICY: DecisionErrorPolicy = { alreadyDone: ['CLAIM_ALREADY_DECIDED'] };

export const ALLOWANCE_POLICY: DecisionErrorPolicy = {
  alreadyDone: ['WAITING_ALLOWANCE_ALREADY_DECIDED', 'WAITING_ALLOWANCE_ALREADY_APPROVED'],
};

export const CLOSE_OUT_POLICY: DecisionErrorPolicy = {
  alreadyDone: ['ACCEPTANCE_ALREADY_IN_OUTCOME'],
};

export const FUEL_POLICY: DecisionErrorPolicy = {
  alreadyDone: [],
  alreadyDoneOnRetry: ['FUEL_ENTRY_REVIEW_TRANSITION_NOT_PERMITTED'],
};

export const PAYSLIP_POLICY: DecisionErrorPolicy = { alreadyDone: ['PAYSLIP_NOT_DRAFT'] };

/** Lenh khong co "da xong" rieng (phan cong, ghi tien — da lap lai an toan o may chu). */
export const PLAIN_POLICY: DecisionErrorPolicy = { alreadyDone: [] };
