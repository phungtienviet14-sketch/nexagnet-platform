import type { BusinessDate } from '../office/types';

/**
 * BAN SAO TOI THIEU hop dong may chu cho ke toan — `apps/api/src/transport/{fuel,customer-ar,
 * driver-settlement,costing}/**`. Enum de `string` o cho may chu co the them gia tri: man hinh hien
 * ma la thay vi vo.
 */

/* --- Phieu dau — `GET /transport/fuel/entries` (`fuel.types.ts` FuelEntryInboxRow) --- */

export interface FuelEvidenceRef {
  readonly id: string;
  readonly contentType: string | null;
}

export interface FuelEntryRow {
  readonly id: string;
  readonly tripId: string | null;
  readonly tripCode: string | null;
  readonly runCode: string | null;
  readonly legSequence: number | null;
  readonly driverId: string;
  readonly driverName: string | null;
  readonly vehicleId: string;
  readonly vehiclePlate: string | null;
  readonly supplierName: string | null;
  readonly stationId: string | null;
  readonly stationName: string | null;
  readonly businessDate: BusinessDate;
  readonly occurredAt: string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly currencyCode: string;
  readonly invoiceNo: string | null;
  readonly paymentMethod: string;
  readonly verificationStatus: string;
  readonly reviewReasons: readonly string[];
  readonly reviewNote: string | null;
  readonly evidenceCount: number;
  readonly evidence: readonly FuelEvidenceRef[];
}

export interface FuelEntryPage {
  readonly rows: readonly FuelEntryRow[];
  readonly total: number;
  /** So phieu DANG CHO XAC THUC, khong theo bo loc — con so cua huy hieu. */
  readonly pendingVerificationCount: number;
  readonly limit: number;
  readonly offset: number;
}

/* --- Phai thu khach — `customer-ar.types.ts` --- */

export interface CustomerPaymentBalance {
  readonly payment: {
    readonly id: string;
    readonly customerId: string;
    readonly amount: number;
    readonly receivedAt: string;
    readonly businessDate: BusinessDate;
    readonly externalRef: string | null;
  };
  readonly allocatedAmount: number;
  readonly unallocatedAmount: number;
}

export interface CustomerArSummary {
  readonly asOf: BusinessDate;
  readonly pendingReconciliationAmount: number;
  readonly officialReceivableAmount: number;
  readonly outstandingAmount: number;
  readonly notYetDueAmount: number;
  readonly dueAmount: number;
  readonly overdueAmount: number;
  readonly paidAmount: number;
  readonly unallocatedCreditAmount: number;
  readonly payments: readonly CustomerPaymentBalance[];
}

export interface RecordPaymentResult {
  readonly payment: { readonly id: string; readonly amount: number; readonly receivedAt: string };
  /** `true` = may chu da co khoan nay tu truoc (cung khoa), KHONG ghi them. */
  readonly replayed: boolean;
}

/* --- Lai xe — `driver-settlement.types.ts`, `costing.types.ts` --- */

export interface DriverSettlementBalance {
  readonly driverId: string;
  readonly currencyCode: string;
  readonly wageCredited: number;
  readonly wageCashedOut: number;
  readonly wageRemaining: number;
  readonly fundBalance: number;
  readonly fundStance: string;
  readonly reimbursementOutstanding: number;
  readonly reimbursementCashedOut: number;
}

export interface DriverFundEntry {
  readonly id: string;
  readonly kind: string;
  readonly signedAmount: number;
  readonly currencyCode: string;
  readonly businessDate: BusinessDate;
  readonly tripId: string | null;
  readonly reversalOfId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface DriverFundStatement {
  readonly account: { readonly id: string } | null;
  readonly driverId: string;
  readonly balance: number;
  /** CACH DOC dau cua `balance` — do may chu tinh, man hinh khong tu suy tu dau so. */
  readonly balanceStance: string;
  readonly currencyCode: string;
  readonly entries: readonly DriverFundEntry[];
}
