import type { BusinessDate } from '../business-date.js';
import type { FuelPaymentMethod } from './fuel.types.js';

/**
 * DANH TINH CHUAN HOA cua mot lenh nop phieu dau — ham THUAN, T4R §5.
 *
 * ===========================================================================
 * MOT KHOA CHONG GHI TRUNG KHONG NOI DUOC PHIEU NAO — noi dung moi noi duoc.
 *
 * `submitFuelEntry` nhan mot `correlationKey`. Gap lai khoa da dung, no phai tra loi mot cau hoi:
 * day la MANG CHAP CHON (gui lai dung lenh cu) hay CLIENT DUNG LAI KHOA cho mot phieu khac? Tra
 * nham cau thu hai thanh cau thu nhat se lam mot phieu moi bien mat khong dau vet.
 *
 * Truoc T4R, phep so sanh doc BAY truong va bo qua nam: `supplierId`, `paymentMethod`, `occurredAt`,
 * `invoiceNo`, `note`. Hai truong dau khong phai chi tiet trang tri:
 *
 *   · `supplierId`   doi cay xang la doi doi tuong doi soat — dong bang ke se khop vao mot ky khac;
 *   · `paymentMethod` doi CHINH DUONG TIEN o `TX-03`: `DRIVER_CASH` ghi vao quy lai xe
 *     (`DRIVER_FUND`), `SUPPLIER_ACCOUNT` ghi thang cong ty (`COMPANY_DIRECT`). Cung mot so tien,
 *     hai so sach khac nhau.
 *
 * Nen mot lenh doi mot trong hai truong do KHONG phai lan gui lai cua lenh cu, va tra ve phieu cu
 * la lang le nuot mat mot phieu that.
 *
 * ===========================================================================
 * CHUAN HOA TRUOC KHI SO SANH, va chi hai phep:
 *
 *   · `occurredAt` doc ve MOC THOI GIAN (epoch ms). Ban ghi tra ve chuoi ISO, lenh gui vao mot
 *     `Date`; so sanh chuoi se lam `...T03:00:00Z` va `...T03:00:00.000Z` thanh hai phieu khac nhau.
 *   · `invoiceNo`/`note` cat khoang trang hai dau, va chuoi rong doc ve `null`. Nguoi go mot dau
 *     cach o cuoi so hoa don khong dang bi bao la trung khoa.
 *
 * KHONG chuan hoa gi them. Moi phep chuan hoa la mot phep LAM MO, va lam mo qua tay se dua ta ve
 * dung cho cu: hai phieu khac nhau bi coi la mot.
 */
export interface FuelEntryIdentity {
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAtMs: number;
  readonly litersUnits: number;
  readonly amount: number;
  readonly odometerKm: number;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo: string | null;
  readonly note: string | null;
}

/** Chuoi rong / toan khoang trang la "khong khai", khong phai mot gia tri khac `null`. */
export const normalizeOptionalText = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export const fuelEntryIdentityOf = (input: {
  readonly tripId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly supplierId: string;
  readonly businessDate: BusinessDate;
  readonly occurredAt: Date | string;
  readonly litersUnits: number;
  readonly amount: number;
  readonly odometerKm: number;
  readonly paymentMethod: FuelPaymentMethod;
  readonly invoiceNo: string | null | undefined;
  readonly note: string | null | undefined;
}): FuelEntryIdentity => ({
  tripId: input.tripId,
  vehicleId: input.vehicleId,
  driverId: input.driverId,
  supplierId: input.supplierId,
  businessDate: input.businessDate,
  occurredAtMs: new Date(input.occurredAt).getTime(),
  litersUnits: input.litersUnits,
  amount: input.amount,
  odometerKm: input.odometerKm,
  paymentMethod: input.paymentMethod,
  invoiceNo: normalizeOptionalText(input.invoiceNo),
  note: normalizeOptionalText(input.note),
});

/**
 * TEN cac truong lech nhau — mot DANH SACH chu khong mot `boolean`.
 *
 * Nguoi nhan `FUEL_CORRELATION_KEY_REUSED` phai sua duoc mot cai gi do. "Khoa nay da dung cho phieu
 * khac" khong noi ho phai sua gi; "lech `paymentMethod`" thi co.
 */
export function fuelEntityIdentityDifferences(
  existing: FuelEntryIdentity,
  incoming: FuelEntryIdentity,
): readonly (keyof FuelEntryIdentity)[] {
  const keys = Object.keys(existing) as (keyof FuelEntryIdentity)[];
  return keys.filter((key) => existing[key] !== incoming[key]);
}
