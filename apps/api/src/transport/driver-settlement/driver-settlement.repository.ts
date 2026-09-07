import type { BusinessDate } from '../business-date.js';
import type { CashoutAllocationSource, CashoutKind } from './cashout-allocation.js';
import type { DriverCashoutDetail } from './driver-settlement.types.js';

/** MOT dong se duoc ghi — ban ve, chua co `id`. `amount` CO DAU. */
export interface CashoutAllocationWriteInput {
  readonly source: CashoutAllocationSource;
  readonly amount: number;
  readonly payslipId: string | null;
  readonly driverFundEntryId: string | null;
  readonly note: string | null;
}

export interface RecordCashoutInput {
  readonly driverId: string;
  readonly kind: CashoutKind;
  readonly businessDate: BusinessDate;
  readonly currencyCode: string;
  readonly method: string;
  readonly reference: string | null;
  /** Ban goc ma phieu nay dao. BAT BUOC khi `kind = 'REVERSAL'`, va NULL o `ORIGINAL`. */
  readonly reversesId: string | null;
  readonly reversalReason: string | null;
  readonly note: string | null;
  readonly correlationKey: string;
  readonly recordedBy: string;
  readonly at: Date;
  readonly allocations: readonly CashoutAllocationWriteInput[];
}

/**
 * `DUPLICATE_KEY` mang ban DA GHI, khong chi mot co.
 *
 * Nguoi goi phai so noi dung de biet day la mot lan gui lai vo hai hay mot loi ben goi (cung khoa,
 * khac so tien). Tra ve mot `boolean` se buoc ho doc lai lan thu hai, va lan doc do khong nam
 * trong giao dich vua ghi.
 */
export type RecordCashoutOutcome =
  | { readonly kind: 'RECORDED'; readonly detail: DriverCashoutDetail }
  | { readonly kind: 'DUPLICATE_KEY'; readonly existing: DriverCashoutDetail }
  /** Ban goc da co mot phieu dao — `reversesId` la `@unique`, va lan ghi thu hai thua. */
  | { readonly kind: 'ALREADY_REVERSED' }
  | { readonly kind: 'TARGET_NOT_FOUND' };

/**
 * Kho cua `TX-07b`.
 *
 * KHONG co ham nao SUA mot lan chi da ghi, va khong co ham nao XOA. Do khong phai thieu sot — do
 * la `INV-20` duoc dat bang hinh dang cua chinh giao dien nay, cung cach `WorkforceRepository` lam.
 * Duong sua duy nhat la ghi mot phieu `REVERSAL` qua `record()`.
 *
 * KHONG co ham nao doc bang cua capability khac: phieu luong va so du quy den qua
 * `driver-settlement.ports.ts`.
 */
export abstract class DriverSettlementRepository {
  /**
   * MOT lan chi = MOT lan ghi.
   *
   * Khi `input.kind = 'REVERSAL'`, lenh nay con phai dua ban goc tu `POSTED` sang `REVERSED`
   * TRONG CUNG giao dich. Tach lam hai lenh se de lai mot cua so ma ban dao da ton tai trong khi
   * ban goc van doc ra la con hieu luc — va bang can doi luc do tru hai lan.
   */
  abstract record(input: RecordCashoutInput): Promise<RecordCashoutOutcome>;

  abstract find(id: string): Promise<DriverCashoutDetail | null>;
  abstract findByCorrelation(correlationKey: string): Promise<DriverCashoutDetail | null>;
  /** Moi lan chi cua mot lai xe, ke ca cac phieu da bi dao va cac phieu dao. */
  abstract listByDriver(driverId: string): Promise<DriverCashoutDetail[]>;
}
