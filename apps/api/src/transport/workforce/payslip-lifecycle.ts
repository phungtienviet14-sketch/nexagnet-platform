import type { PayslipStatus } from './workforce.types.js';

/**
 * VONG DOI PHIEU LUONG — nguon su that cua acceptance 12.
 *
 * ```text
 * DRAFT ──▶ APPROVED ──▶ PAID
 *              │           │
 *              └───────────┴──▶ REVERSED
 * ```
 *
 * KHONG CO CANH NAO QUAY VE `DRAFT`. Do la toan bo diem cua bat bien nay: tu luc mot phieu duoc
 * duyet, con so tren no da di ra ngoai — vao mot bang luong, mot lan chuyen khoan, mot cau tra loi
 * cho lai xe. Cho phep quay lai `DRAFT` de sua se lam mot con so DA BAO thanh mot con so khac ma
 * khong ai thay, va do la dinh nghia cua viet lai lich su (`INV-20`).
 *
 * Duong sua duy nhat: ghi mot phieu `SUPPLEMENTAL` (bu them) hoac `REVERSAL` (dao toan bo) tro ve
 * ban goc qua `correctsId` — cung khuon `TransportSettlementDocument` cua T5.
 *
 * BA LOP giu cung mot dieu: may trang thai o tep nay, dieu kien trong lenh ghi cua kho, va trigger
 * `TransportPayslip_posted_immutable` duoi Postgres. Lop cuoi la lop duy nhat dung khi co nguoi ghi
 * thang vao DB.
 */

export const INITIAL_PAYSLIP_STATUS: PayslipStatus = 'DRAFT';

const EDGES: Readonly<Record<PayslipStatus, readonly PayslipStatus[]>> = {
  DRAFT: ['APPROVED'],
  APPROVED: ['PAID', 'REVERSED'],
  PAID: ['REVERSED'],
  REVERSED: [],
};

export type PayslipTransitionOutcome =
  | { readonly kind: 'PERMITTED' }
  | { readonly kind: 'ALREADY_IN_STATE' }
  | { readonly kind: 'NOT_PERMITTED'; readonly allowed: readonly PayslipStatus[] };

/**
 * `ALREADY_IN_STATE` tach khoi `NOT_PERMITTED` co chu dich — cung khuon `fuel-lifecycle.ts` cua T4.
 *
 * Bam "duyet" hai lan la mot thao tac vo hai cua nguoi dung; bam "duyet" tren mot phieu da dao la
 * mot hieu nham can duoc noi ro. Gop hai thu do vao mot ma se lam giao dien phai chon: hoac keu
 * len o ca hai, hoac im lang o ca hai.
 */
export function evaluatePayslipTransition(
  from: PayslipStatus,
  to: PayslipStatus,
): PayslipTransitionOutcome {
  if (from === to) return { kind: 'ALREADY_IN_STATE' };
  const allowed = EDGES[from];
  return allowed.includes(to) ? { kind: 'PERMITTED' } : { kind: 'NOT_PERMITTED', allowed };
}

/** Phieu DA CHOT — tu day tro di noi dung bat bien. */
export const isPosted = (status: PayslipStatus): boolean => status !== 'DRAFT';

/**
 * Phieu co the SUA bang mot phieu bo sung / phieu dao khong.
 *
 * `REVERSED` khong sua tiep duoc: mot ban da bi dao thi so du cua no bang khong, va bu them vao no
 * se lam chuoi lich su khong con doc duoc theo mot chieu. Duong dung la mot phieu goc moi.
 */
export const isCorrectable = (status: PayslipStatus): boolean =>
  status === 'APPROVED' || status === 'PAID';
