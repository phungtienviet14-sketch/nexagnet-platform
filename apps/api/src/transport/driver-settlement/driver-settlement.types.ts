import type { BusinessDate } from '../business-date.js';
import type { FundBalanceStance } from '../costing/driver-fund-ledger.js';
import type { CashoutAllocationSource, CashoutKind, CashoutStatus } from './cashout-allocation.js';
import type { UnsettledWageMonth, WageMonth } from './wage-credit.js';

/**
 * KIEU DOC cua `TX-07b`.
 *
 * QUY UOC DON VI, khai MOT LAN o day: tien la so nguyen DONG (`GD-03`); moi `*Date` la NGAY nghiep
 * vu `YYYY-MM-DD` (`INV-25`); moi `*At` la khoanh khac ISO.
 */

export interface DriverCashout {
  readonly id: string;
  readonly driverId: string;
  readonly kind: CashoutKind;
  readonly status: CashoutStatus;
  readonly businessDate: BusinessDate;
  readonly currencyCode: string;
  readonly method: string;
  readonly reference: string | null;
  readonly reversesId: string | null;
  readonly reversalReason: string | null;
  readonly note: string | null;
  readonly correlationKey: string;
  readonly recordedBy: string;
  readonly createdAt: string;
}

export interface DriverCashoutAllocation {
  readonly id: string;
  readonly cashoutId: string;
  readonly source: CashoutAllocationSource;
  /** CO DAU. Am tren mot phieu `REVERSAL`. */
  readonly amount: number;
  readonly payslipId: string | null;
  readonly driverFundEntryId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

/** MOT lan chi cung day du cac dong cua no — hinh dang ma ke toan doc. */
export interface DriverCashoutDetail {
  readonly cashout: DriverCashout;
  readonly allocations: readonly DriverCashoutAllocation[];
}

/**
 * SO DU QUYET TOAN cua mot lai xe — BON con so, va chung KHONG duoc gop thanh mot.
 *
 * ===========================================================================
 * `reimbursementCashedOut` KHONG BAO GIO bi tru mot lan nua khoi
 * `reimbursementOutstanding`. Day la cho de dem hai lan nhat trong ca tranche, nen noi ro:
 *
 *   · `reimbursementOutstanding` = `max(0, -so du quy)`, doc TU SO QUY luc nay;
 *   · mot lan chi hoan ung DA ghi mot but toan quy `REIMBURSEMENT` (+), tuc so du DA di len;
 *   · nen `outstanding` da phan anh moi lan chi. Tru them `cashedOut` la tru hai lan.
 *
 * `reimbursementCashedOut` ton tai de tra loi mot cau KHAC: *"da tra lai lai xe bao nhieu"* —
 * lich su, khong phai nghia vu. `driver-settlement.service.spec.ts` khoa dieu nay lai bang mot
 * bai co ten.
 */
export interface DriverSettlementBalance {
  readonly driverId: string;
  readonly currencyCode: string;
  /** Tong net cua moi phieu luong da chot. */
  readonly wageCredited: number;
  /** Tong cac dong `WAGE` da phan bo, CO DAU. */
  readonly wageCashedOut: number;
  readonly wageRemaining: number;
  /** So du quy hien tai, CO DAU (`DA-T3-01`). */
  readonly fundBalance: number;
  readonly fundStance: FundBalanceStance;
  /** `max(0, -fundBalance)` — so cong ty CON no lai xe ngay luc nay. */
  readonly reimbursementOutstanding: number;
  /** LICH SU: tong cac dong `REIMBURSEMENT` da phan bo. KHONG tru vao `outstanding`. */
  readonly reimbursementCashedOut: number;
}

/**
 * BE MAT LAI XE — dung bon con so ma #237 doi, khong hon.
 *
 * KHONG mang `fundBalance` tho: mot lai xe doc "so du quy: -1.500.000" se hieu la minh dang no,
 * dung cai ma `DA-T3-01` canh bao. Con so ho can la `reimbursementOutstanding`, mot so DUONG kem
 * mot cau noi ro do la tien cong ty tra lai ho.
 */
export interface DriverSettlementSelfStatement {
  readonly driverId: string;
  readonly driverName: string;
  readonly currencyCode: string;
  readonly wageCredited: number;
  readonly wageCashedOut: number;
  readonly wageRemaining: number;
  readonly reimbursementOutstanding: number;
  readonly reimbursementCashedOut: number;
  readonly months: readonly WageMonth[];
  readonly cashouts: readonly DriverCashoutDetail[];
}

/** BE MAT KE TOAN — them phan bo chi tiet va canh bao cua so quyet toan. */
export interface DriverSettlementStatement {
  readonly balance: DriverSettlementBalance;
  readonly months: readonly WageMonth[];
  readonly cashouts: readonly DriverCashoutDetail[];
  /** Cac ky da qua cua so ma tien chua ra khoi cong ty. CANH BAO, khong chan gi. */
  readonly unsettled: readonly UnsettledWageMonth[];
  readonly settlementWindowDays: number;
}
