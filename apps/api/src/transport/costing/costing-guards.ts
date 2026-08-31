import { BusinessDateError, assertBusinessDate, toBusinessDate } from '../business-date.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import { TransportDomainError } from '../transport.errors.js';
import { LedgerSignError } from './driver-fund-ledger.js';
import type { DriverFacts, TransportCoreFacts, TripFacts } from './transport-core-facts.port.js';

/**
 * CONG DUNG CHUNG cua duong GHI va duong DOC cua costing.
 *
 * Ton tai vi hai service can dung mot cau tra loi cho cung mot cau hoi ("chuyen nay co that
 * khong?", "so tien nay hop le khong?"). Neu moi service tu viet lay, hai ban se troi khoi nhau —
 * va lan troi dau tien thuong la mot ben tra 404 con ben kia tra 500 cho y het mot tinh huong.
 *
 * Ham THUAN hoac chi nhan phu thuoc qua tham so: khong `@Injectable`, khong trang thai.
 */

export async function requireTripFacts(
  core: TransportCoreFacts,
  tripId: string,
): Promise<TripFacts> {
  const trip = await core.findTrip(tripId);
  if (!trip) {
    throw TransportDomainError.notFound('TRIP_NOT_FOUND', `Khong tim thay chuyen ${tripId}`);
  }
  return trip;
}

export async function requireDriverFacts(
  core: TransportCoreFacts,
  driverId: string,
): Promise<DriverFacts> {
  const driver = await core.findDriver(driverId);
  if (!driver) {
    throw TransportDomainError.notFound('DRIVER_NOT_FOUND', `Khong tim thay lai xe ${driverId}`);
  }
  return driver;
}

/**
 * NGAY NGHIEP VU cua mot but toan — `INV-25`.
 *
 * Khong khai thi tinh MOT LAN tu dong ho theo mui gio tenant. Khai thi phai la mot ngay CO THAT:
 * `2026-02-30` dung dang nhung khong ton tai, va neu lot qua day thi no se tro thanh mot moc ky ma
 * khong lich nao xep duoc.
 */
export function resolveCostingBusinessDate(
  provided: string | undefined,
  now: Date,
  timeZone: string,
): string {
  if (provided === undefined) return toBusinessDate(now, timeZone);
  try {
    return assertBusinessDate(provided);
  } catch (error) {
    if (error instanceof BusinessDateError) {
      throw TransportDomainError.invalid('BUSINESS_DATE_INVALID', error.message);
    }
    throw error;
  }
}

export function requireNonNegativeAmount(amount: number): number {
  try {
    return nonNegativeMoney(amount).amount;
  } catch (error) {
    if (error instanceof MoneyError) {
      throw TransportDomainError.invalid('MONEY_INVALID', error.message);
    }
    throw error;
  }
}

/**
 * Doi loi cua tang luat so cai thanh loi CUA MIEN.
 *
 * Neu de `LedgerSignError` bay thang ra thi controller khong nhan ra no va tra 500 — mot dau am go
 * nham se duoc bao cho nguoi dung la loi may chu, va ho se thu lai y het.
 */
export function mapLedgerError(run: () => number): number {
  try {
    return run();
  } catch (error) {
    if (error instanceof LedgerSignError) {
      throw TransportDomainError.invalid('FUND_AMOUNT_INVALID', error.message);
    }
    if (error instanceof MoneyError) {
      throw TransportDomainError.invalid('MONEY_INVALID', error.message);
    }
    throw error;
  }
}
