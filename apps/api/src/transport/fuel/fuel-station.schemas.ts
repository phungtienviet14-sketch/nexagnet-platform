import { z } from 'zod';
import { FUEL_INGEST_CHANNELS } from './fuel-station.types.js';

/**
 * KIEM DAU VAO cua danh tinh cay xang — tang bien gioi, khong phai tang mien.
 *
 * Moi khuon o day LAP LAI mot `CHECK` cua migration `20260908090000_transport_fuel_station`, va do
 * la co y: kiem o day cho nguoi dung mot thong diep doc duoc, kiem o DB dung ke ca khi mot duong
 * ghi khac quen. Hai ban phai giong nhau — `transport-fuel-station-storage.spec.ts` do dieu do.
 *
 * BA LUAT LIEN TRUONG (toa do di theo cap, ban kinh can tam, ky hop dong dung thu tu) KHONG o day:
 * chung phai chay tren trang thai DA GOP voi hang dang co, va zod chi nhin thay ban va. Xem
 * `FuelStationService.requireGeometry()`.
 */

const trimmed = z.string().trim();

/** Ty le 1e-7 do. `90 * 1e7` / `180 * 1e7` — ca hai nam trong `INTEGER` 32-bit. */
const latitudeE7 = z.number().int().min(-900_000_000).max(900_000_000);
const longitudeE7 = z.number().int().min(-1_800_000_000).max(1_800_000_000);

/**
 * `positive()` chu khong `nonnegative()`: `0` met KHONG phai "khong kiem" — no la mot vong tron
 * rong ma moi phieu deu nam ngoai. "Khong kiem" la `null`.
 */
const geofenceRadiusM = z.number().int().positive();

export const createFuelStationSchema = z
  .object({
    supplierId: trimmed.min(1).max(100),
    name: trimmed.min(1).max(200),
    code: trimmed.max(60).nullish(),
    address: trimmed.max(500).nullish(),
    latitudeE7: latitudeE7.nullish(),
    longitudeE7: longitudeE7.nullish(),
    geofenceRadiusM: geofenceRadiusM.nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    note: trimmed.max(1000).nullish(),
  })
  .strict();

export const updateFuelStationSchema = z
  .object({
    name: trimmed.min(1).max(200).optional(),
    code: trimmed.max(60).nullish(),
    address: trimmed.max(500).nullish(),
    latitudeE7: latitudeE7.nullish(),
    longitudeE7: longitudeE7.nullish(),
    geofenceRadiusM: geofenceRadiusM.nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    note: trimmed.max(1000).nullish(),
  })
  .strict();

export const addFuelStationAliasSchema = z
  .object({
    // `raw` la NGUYEN BAN nguoi nhap. Phep chuan hoa nam o tang mien, khong o day: neu zod chuan
    // hoa truoc thi cot `raw` se mat, va khong ai doi chieu lai duoc khi nghi phep chuan hoa sai.
    raw: trimmed.min(1).max(200),
  })
  .strict();

/**
 * `YYYY-MM-DD`. Khuon nay chi kiem DANG — mot ngay khong co that (`2026-02-30`) van lot qua, dung
 * nhu `CHECK` cua Postgres. Cong that su la `assertBusinessDate` trong service.
 */
const businessDate = trimmed.regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay phai dang YYYY-MM-DD');

export const updateFuelSupplierProfileSchema = z
  .object({
    phone: trimmed.max(50).nullish(),
    address: trimmed.max(500).nullish(),
    contactName: trimmed.max(200).nullish(),
    contactEmail: trimmed.max(200).nullish(),
    contractNo: trimmed.max(100).nullish(),
    contractStartDate: businessDate.nullish(),
    contractEndDate: businessDate.nullish(),
    /** `0..365` — lap lai `CHECK TransportFuelSupplier_paymentTermDays_range`. */
    paymentTermDays: z.number().int().min(0).max(365).nullish(),
    termsNote: trimmed.max(2000).nullish(),
    ingestChannels: z
      .array(z.enum(FUEL_INGEST_CHANNELS))
      .max(FUEL_INGEST_CHANNELS.length)
      .optional(),
    ingestAccountRef: trimmed.max(100).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

/**
 * BO LOC cua duong nhan dang — `catch(null)` tung truong, KHONG `BadRequestException`.
 *
 * Cung nguyen tac voi `fuelEntryInboxQuerySchema`: mot tham so go hong phai ra mot ket qua CO TEN
 * (`NO_INPUT`), khong phai mot trang loi. Nguoi goi duong nay thuong la mot tien trinh nhap chung
 * tu, va no can mot cau tra loi doc duoc chu khong mot ma HTTP 400.
 */
export const resolveFuelStationQuerySchema = z
  .object({
    supplierId: trimmed.min(1).max(100).nullish().catch(null),
    code: trimmed.max(60).nullish().catch(null),
    label: trimmed.max(200).nullish().catch(null),
  })
  .partial();

export const listFuelStationsQuerySchema = z
  .object({
    supplierId: trimmed.min(1).max(100).nullish().catch(null),
  })
  .partial();

export type CreateFuelStationBody = z.infer<typeof createFuelStationSchema>;
export type UpdateFuelStationBody = z.infer<typeof updateFuelStationSchema>;
export type AddFuelStationAliasBody = z.infer<typeof addFuelStationAliasSchema>;
export type UpdateFuelSupplierProfileBody = z.infer<typeof updateFuelSupplierProfileSchema>;
