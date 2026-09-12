import type {
  WaitingAllowanceDecideReason,
  WaitingAllowanceProposeReason,
} from './allowance-decisions.js';
import type { WaitingAllowanceOutcome, WaitingAllowanceStatus } from './allowance.types.js';

/**
 * QUY TAC cua phu cap cho — ham THUAN, khong cham mang, khong cham dong ho, khong cham dia.
 *
 * ============================================================================================
 * TEP NAY KHONG CO MOT PHEP NHAN NAO
 * ============================================================================================
 *
 * Do la dieu quan trong nhat can noi ve no. `#279` O6 va `#243` F4 deu ghi rang chu khach CHUA dua
 * ra cong thuc doi thoi luong thanh tien. Nen o day khong co `elapsedSeconds`, khong co don gia,
 * khong co nguong gio, va khong co mot phep tinh nao tren thoi gian.
 *
 * Cai duy nhat tep nay lam voi tien la KIEM: so nguyen, duong, va khong lon hon so da de nghi.
 * `no-auto-waiting-allowance-formula.spec.ts` quet ca thu muc va do neu mot phep tinh nao xuat
 * hien — cung khuon `no-auto-profit-distribution.spec.ts` cua `TX-08`.
 */

export interface ProposeAllowanceDecision {
  readonly allowed: boolean;
  readonly reason: WaitingAllowanceProposeReason;
}

export interface ProposeAllowanceEvaluation {
  readonly sessionStatus: 'OPEN' | 'CLOSED';
  /** Trang thai cua nhung de nghi DA CO tren chinh phien nay. */
  readonly existingStatuses: readonly WaitingAllowanceStatus[];
  readonly candidateAmount: number;
  readonly reason: string;
  /** Nguoi de nghi CHINH LA lai xe huong khoan nay. */
  readonly selfDealing: boolean;
}

/**
 * Mot de nghi co duoc ghi khong — tra ve LY DO, khong phai `boolean`.
 *
 * THU TU KIEM la mot phan cua hop dong. `selfDealing` dung DAU TIEN va do la co y: mot nguoi tu de
 * nghi cho chinh minh phai duoc bao dung dieu do, ke ca khi so tien cung sai — vi cai ho phai sua
 * khong phai con so.
 */
export function evaluateAllowanceProposal(
  input: ProposeAllowanceEvaluation,
): ProposeAllowanceDecision {
  if (input.selfDealing) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_SELF_DEALING' };
  }
  if (input.sessionStatus === 'OPEN') {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_SESSION_STILL_OPEN' };
  }
  if (input.existingStatuses.includes('APPROVED')) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_ALREADY_APPROVED' };
  }
  if (input.existingStatuses.includes('PENDING')) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_ALREADY_PENDING' };
  }
  if (!isPositiveInteger(input.candidateAmount)) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_AMOUNT_INVALID' };
  }
  if (input.reason.trim().length === 0) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_REASON_REQUIRED' };
  }
  return { allowed: true, reason: 'WAITING_ALLOWANCE_PROPOSED' };
}

export interface DecideAllowanceDecision {
  readonly allowed: boolean;
  readonly reason: WaitingAllowanceDecideReason;
}

export interface DecideAllowanceEvaluation {
  readonly status: WaitingAllowanceStatus;
  readonly outcome: WaitingAllowanceOutcome;
  readonly candidateAmount: number;
  /** `null` khi tu choi. */
  readonly approvedAmount: number | null;
  /** Nguoi quyet CHINH LA lai xe huong khoan nay. */
  readonly selfDealing: boolean;
}

/**
 * Mot quyet dinh co duoc ghi khong.
 *
 * `WAITING_ALLOWANCE_ABOVE_CANDIDATE` la mot ranh gioi co chu dich: nguoi duyet CAT BOT duoc,
 * KHONG cong them duoc. Cho phep duyet cao hon so de nghi se bien cong duyet thanh mot duong nhap
 * lieu thu hai — va no la duong khong ai kiem, vi nguoi kiem chinh la nguoi go.
 */
export function evaluateAllowanceDecision(
  input: DecideAllowanceEvaluation,
): DecideAllowanceDecision {
  if (input.selfDealing) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_SELF_DEALING' };
  }
  if (input.status !== 'PENDING') {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_ALREADY_DECIDED' };
  }
  if (input.outcome === 'REJECTED') {
    return { allowed: true, reason: 'WAITING_ALLOWANCE_REJECTED' };
  }
  if (input.approvedAmount === null || !isPositiveInteger(input.approvedAmount)) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_AMOUNT_INVALID' };
  }
  if (input.approvedAmount > input.candidateAmount) {
    return { allowed: false, reason: 'WAITING_ALLOWANCE_ABOVE_CANDIDATE' };
  }
  return { allowed: true, reason: 'WAITING_ALLOWANCE_APPROVED' };
}

const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0;
