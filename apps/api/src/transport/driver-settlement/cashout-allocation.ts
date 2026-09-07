import { money, MoneyError } from '../money.js';

/**
 * CONG GHI cua mot lan chi tien cho lai xe — ham THUAN, khong biet Nest, khong biet Prisma.
 *
 * ===========================================================================
 * HAI NGUON TIEN, HAI TRAN, VA CHUNG KHONG DUOC GOP.
 *
 *   · `WAGE`          — rut tu luong da ghi nhan tren mot phieu luong da chot;
 *   · `REIMBURSEMENT` — nhan lai khoan lai xe da bo tui, tuc so du quy dang AM.
 *
 * #237: *"a cash-out may also settle reimbursement but components stay separately traceable"* va
 * *"Do not call reimbursement salary"*. Neu hai nguon nay di qua mot tran chung thi mot lai xe
 * chua den ky luong van rut duoc tien "luong" bang han muc hoan ung cua minh — va bang luong se
 * mang mot con so khong co phieu nao do lung.
 *
 * ===========================================================================
 * THU TU KIEM TRA la mot phan cua thiet ke, khong phai ngau nhien:
 *
 *   1. don vi tien   — sai don vi thi moi phep cong sau do vo nghia;
 *   2. co dong nao khong;
 *   3. hinh dang tung dong (so tien, nguon <-> nguon goc);
 *   4. phieu luong co that va co so du khong;
 *   5. tran TUNG PHIEU;
 *   6. tran CUA LAI XE.
 *
 * Doi thu tu 5 va 6 se lam mot lan chi vuot ca hai tran tra ve `CASHOUT_WAGE_EXCEEDS_REMAINING` —
 * dung ve ky thuat va vo dung voi nguoi nhap: ho khong biet phai sua dong nao.
 */

export const CASHOUT_ALLOCATION_SOURCES = ['WAGE', 'REIMBURSEMENT'] as const;
export type CashoutAllocationSource = (typeof CASHOUT_ALLOCATION_SOURCES)[number];

export const CASHOUT_KINDS = ['ORIGINAL', 'REVERSAL'] as const;
export type CashoutKind = (typeof CASHOUT_KINDS)[number];

export const CASHOUT_STATUSES = ['POSTED', 'REVERSED'] as const;
export type CashoutStatus = (typeof CASHOUT_STATUSES)[number];

/** Mot dong nguoi dung yeu cau. `amount` la DO LON — dau do tang nay quyet, khong phai nguoi goi. */
export interface CashoutLine {
  readonly source: CashoutAllocationSource;
  readonly amount: number;
  readonly payslipId: string | null;
  readonly note?: string | null;
}

/**
 * SUC CHUA hien tai cua mot lai xe — doc mot lan, kiem mot cho.
 *
 * `wageRemainingTotal` KHONG phai tong cua `wageRemainingByPayslip`, va do la co y. Bang tra chi
 * chua nhung phieu con du DUONG; tong thi tinh tren MOI phieu da chot, ke ca phieu `REVERSAL`
 * mang net am. Sau mot lan dao, tong nho hon tong cac phieu duong — va tran dung phai la tong.
 */
export interface CashoutCapacity {
  readonly currencyCode: string;
  readonly wageRemainingByPayslip: ReadonlyMap<string, number>;
  readonly wageRemainingTotal: number;
  /** `max(0, -so du quy)` — so cong ty dang con no lai xe. */
  readonly reimbursementOutstanding: number;
}

export const CASHOUT_DENIED_REASONS = [
  /** Khong dong nao. Mot phieu chi rong khong noi gi va van chiem mot so hieu. */
  'CASHOUT_NO_ALLOCATIONS',
  /** So tien khong phai so nguyen duong. */
  'CASHOUT_AMOUNT_INVALID',
  /** `WAGE` khong co phieu luong, hoac `REIMBURSEMENT` lai mang mot phieu luong. */
  'CASHOUT_ALLOCATION_SHAPE_INVALID',
  /** Phieu luong khong ton tai, hoac khong con mang mot khoan duong nao (vd ban da bi dao). */
  'CASHOUT_PAYSLIP_NOT_CREDITED',
  /** Cung mot phieu xuat hien hai lan — gop lai se lot qua tran cua tung phieu. */
  'CASHOUT_PAYSLIP_DUPLICATED',
  'CASHOUT_PAYSLIP_OVER_ALLOCATED',
  'CASHOUT_WAGE_EXCEEDS_REMAINING',
  /** Hai dong hoan ung tren mot phieu chi: mot but toan quy khong chia doi duoc (`@unique`). */
  'CASHOUT_REIMBURSEMENT_DUPLICATED',
  'CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING',
  'CASHOUT_CURRENCY_MISMATCH',
] as const;
export type CashoutDeniedReason = (typeof CASHOUT_DENIED_REASONS)[number];

export type CashoutDecision =
  | {
      readonly allowed: true;
      readonly reason: 'CASHOUT_ALLOWED';
      readonly wageTotal: number;
      readonly reimbursementTotal: number;
      readonly total: number;
    }
  | {
      readonly allowed: false;
      readonly reason: CashoutDeniedReason;
      /** Ma phieu luong lien quan, khi ly do noi ve mot dong cu the. */
      readonly subject: string | null;
    };

const deny = (reason: CashoutDeniedReason, subject: string | null = null): CashoutDecision => ({
  allowed: false,
  reason,
  subject,
});

/** QUYET DINH MOT LAN CHI. Thuan tuy: khong doc DB, khong doc dong ho. */
export function evaluateCashout(
  lines: readonly CashoutLine[],
  capacity: CashoutCapacity,
  currencyCode: string,
): CashoutDecision {
  if (currencyCode !== capacity.currencyCode) return deny('CASHOUT_CURRENCY_MISMATCH');
  if (lines.length === 0) return deny('CASHOUT_NO_ALLOCATIONS');

  const seenPayslips = new Set<string>();
  let wageTotal = 0;
  let reimbursementTotal = 0;
  let reimbursementLines = 0;

  for (const line of lines) {
    if (!Number.isInteger(line.amount) || line.amount <= 0) {
      return deny('CASHOUT_AMOUNT_INVALID', line.payslipId);
    }

    if (line.source === 'WAGE') {
      if (line.payslipId === null) return deny('CASHOUT_ALLOCATION_SHAPE_INVALID');
      if (seenPayslips.has(line.payslipId)) {
        return deny('CASHOUT_PAYSLIP_DUPLICATED', line.payslipId);
      }
      seenPayslips.add(line.payslipId);

      const remaining = capacity.wageRemainingByPayslip.get(line.payslipId);
      if (remaining === undefined || remaining <= 0) {
        return deny('CASHOUT_PAYSLIP_NOT_CREDITED', line.payslipId);
      }
      if (line.amount > remaining) {
        return deny('CASHOUT_PAYSLIP_OVER_ALLOCATED', line.payslipId);
      }
      wageTotal += line.amount;
      continue;
    }

    if (line.payslipId !== null) return deny('CASHOUT_ALLOCATION_SHAPE_INVALID');
    reimbursementLines += 1;
    if (reimbursementLines > 1) return deny('CASHOUT_REIMBURSEMENT_DUPLICATED');
    reimbursementTotal += line.amount;
  }

  if (wageTotal > capacity.wageRemainingTotal) return deny('CASHOUT_WAGE_EXCEEDS_REMAINING');
  if (reimbursementTotal > capacity.reimbursementOutstanding) {
    return deny('CASHOUT_REIMBURSEMENT_EXCEEDS_OUTSTANDING');
  }

  return {
    allowed: true,
    reason: 'CASHOUT_ALLOWED',
    wageTotal,
    reimbursementTotal,
    total: wageTotal + reimbursementTotal,
  };
}

/**
 * TONG cac dong phan bo — CO DAU, mot phep cong duy nhat.
 *
 * Khong co bo loc "bo cac phieu da dao" o day, va do la ca diem: mot phieu `REVERSAL` dong gop
 * cac dong AM, nen phep cong tu tru ra. Neu dao la mot co `boolean` thi moi truy van tong se phai
 * nho loai tru no — va lan quen dau tien cho ra mot lai xe da rut gap doi thuc te.
 */
export function foldAllocations(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => {
    try {
      return money(money(total).amount + money(amount).amount).amount;
    } catch (error) {
      if (error instanceof MoneyError) {
        throw new MoneyError(`Cong don phan bo vuot khoang bieu dien duoc: ${error.message}`);
      }
      throw error;
    }
  }, 0);
}

export const CASHOUT_REVERSAL_DENIED_REASONS = [
  'CASHOUT_ALREADY_REVERSED',
  /** Dao mot ban dao se lam chuoi lich su khong con doc duoc theo mot chieu — cung ly le `TX-07`. */
  'CASHOUT_IS_A_REVERSAL',
] as const;
export type CashoutReversalDeniedReason = (typeof CASHOUT_REVERSAL_DENIED_REASONS)[number];

export type CashoutReversalDecision =
  | { readonly allowed: true; readonly reason: 'CASHOUT_REVERSAL_ALLOWED' }
  | { readonly allowed: false; readonly reason: CashoutReversalDeniedReason };

export function evaluateCashoutReversal(
  kind: CashoutKind,
  status: CashoutStatus,
): CashoutReversalDecision {
  if (kind === 'REVERSAL') return { allowed: false, reason: 'CASHOUT_IS_A_REVERSAL' };
  if (status === 'REVERSED') return { allowed: false, reason: 'CASHOUT_ALREADY_REVERSED' };
  return { allowed: true, reason: 'CASHOUT_REVERSAL_ALLOWED' };
}

/** Mot dong phan bo DA GHI, doc tu kho. */
export interface PostedAllocation {
  readonly source: CashoutAllocationSource;
  readonly amount: number;
  readonly payslipId: string | null;
  readonly driverFundEntryId: string | null;
}

export interface CashoutReversalPlan {
  readonly wage: readonly { readonly payslipId: string; readonly amount: number }[];
  /**
   * Dong hoan ung can DAO mot but toan quy — nhung but toan dao do chua ton tai o day.
   *
   * Ham nay THUAN, nen no chi noi "phai dao but toan `fe-1` mot khoan `-X`".
   * `DriverSettlementService` la noi goi so quy va nhan ve ma but toan dao that.
   */
  readonly reimbursement: readonly {
    readonly reversesFundEntryId: string;
    readonly amount: number;
  }[];
}

/** Ban DOI DAU cua cac dong da ghi. Giu nguyen nguon goc — thang nao van la thang do. */
export function reversalPlanOf(posted: readonly PostedAllocation[]): CashoutReversalPlan {
  const wage: { payslipId: string; amount: number }[] = [];
  const reimbursement: { reversesFundEntryId: string; amount: number }[] = [];

  for (const allocation of posted) {
    if (allocation.source === 'WAGE' && allocation.payslipId !== null) {
      wage.push({ payslipId: allocation.payslipId, amount: -allocation.amount });
      continue;
    }
    if (allocation.source === 'REIMBURSEMENT' && allocation.driverFundEntryId !== null) {
      reimbursement.push({
        reversesFundEntryId: allocation.driverFundEntryId,
        amount: -allocation.amount,
      });
    }
  }

  return { wage, reimbursement };
}
