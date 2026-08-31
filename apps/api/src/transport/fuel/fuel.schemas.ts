import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from '../money.js';
import { LITERS_SCALE } from './fuel-quantity.js';
import {
  FUEL_DISCREPANCY_RESOLUTIONS,
  FUEL_PAYMENT_METHODS,
  FUEL_STATEMENT_FORMATS,
} from './fuel.types.js';

/**
 * Kiem dau vao tai BIEN GIOI HTTP cua `transport-fuel`.
 *
 * Cung ly le voi `costing.schemas.ts`: dat trong thu muc cua mien, khong o `packages/shared` — hom
 * nay khong client nao dung chung nhung kieu nay, va dua chung len goi dung chung se buoc moi khach
 * (ke ca khach khong van tai) phai build lai khi mot truong cua phieu dau doi.
 */

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).nullable().optional();

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay nghiep vu phai co dang YYYY-MM-DD');

/** Khoanh khac tren phieu — ISO-8601 co mui gio. Ngay nghiep vu KHONG suy tu day (`INV-25`). */
const instant = z.string().datetime({ offset: true });

const vndAmount = z.number().int().positive().max(MONEY_MAX_AMOUNT);

/**
 * SO LIT — nhan CA chuoi lan so, va do la mot lua chon co y.
 *
 * Mot client go tay se gui `12.345` duoi dang so; mot client doc lai tu file se co san chuoi
 * `"12.345"`. Ep ca hai ve `number` o bien gioi la dua mot phep doi so thuc vao dung cho ma
 * `fuel-quantity.ts` ton tai de tranh. Nhan ca hai, roi de `litersToUnits()` — noi DUY NHAT biet
 * quy uoc ty le — quyet dinh.
 *
 * Bo loc o day chi chan nhung thu KHONG THE la mot so lit; phan chinh xac do tang mien lo.
 */
const liters = z.union([
  z.number().positive(),
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d+(?:\\.\\d{1,${LITERS_SCALE}})?$`), 'so lit phai la so thap phan'),
]);

const odometerKm = z.number().int().min(0);

/**
 * KHOA CHONG GHI TRUNG do client dua vao. TUY CHON — khong co thi he thong tu sinh.
 *
 * Bat buoc no se lam moi loi goi tay tu curl phai bia ra mot UUID, va nguoi ta se bia ra `"1"` —
 * tuc bien mot co che chong trung thanh mot va cham thuong truc.
 */
const correlationKey = z.string().trim().min(8).max(120).optional();

const fuelEntryFields = {
  supplierId: nonEmpty,
  liters,
  amount: vndAmount,
  odometerKm,
  occurredAt: instant,
  businessDate: businessDate.optional(),
  paymentMethod: z.enum(FUEL_PAYMENT_METHODS),
  invoiceNo: optionalText,
  note: optionalText,
};

/**
 * BE MAT VAN HANH nop ho mot phieu — co `driverId`/`vehicleId` tuong minh.
 *
 * Be mat LAI XE thi KHONG (xem `driverFuelSubmitSchema`): danh tinh o do den tu phien, va mot
 * truong `driverId` trong than yeu cau se la duong de mot lai xe nop phieu duoi ten nguoi khac.
 */
export const submitFuelEntrySchema = z
  .object({
    tripId: nonEmpty,
    vehicleId: nonEmpty,
    driverId: nonEmpty,
    ...fuelEntryFields,
    correlationKey,
  })
  .strict();

/**
 * LAI XE nop phieu CUA CHINH MINH.
 *
 * KHONG co `driverId` — do la ca diem cua schema nay. Controller lay danh tinh tu phien roi tu dien
 * vao; mot truong `driverId` o day se lam cong "phieu cua chinh toi" chi con la mot loi khuyen.
 */
export const driverFuelSubmitSchema = z
  .object({
    tripId: nonEmpty,
    vehicleId: nonEmpty,
    ...fuelEntryFields,
    correlationKey,
  })
  .strict();

export const amendFuelEntrySchema = z.object(fuelEntryFields).strict();

export const attachFuelEvidenceSchema = z
  .object({
    /** Dinh vi trong kho anh. `PG-05` chua co, nen day la mot chuoi tham chieu, khong phai upload. */
    locator: z.string().trim().min(1).max(500),
    contentType: z.string().trim().min(1).max(120).nullable().optional(),
    byteSize: z.number().int().min(0).nullable().optional(),
    capturedAt: instant.nullable().optional(),
  })
  .strict();

export const rejectFuelEntrySchema = z.object({ reason: nonEmpty.max(500) }).strict();

/** ~5 MB sau base64 la ~6,7 MB chuoi; bien nay khop bien byte cua `FileFuelStatementSource`. */
const BASE64_MAX_LENGTH = 7_000_000;

export const importStatementSchema = z
  .object({
    supplierId: nonEmpty,
    periodStart: businessDate,
    periodEnd: businessDate,
    filename: z.string().trim().min(1).max(255),
    format: z.enum(FUEL_STATEMENT_FORMATS),
    contentBase64: z.string().min(1).max(BASE64_MAX_LENGTH),
  })
  .strict();

/**
 * QUYET mot chenh lech.
 *
 * `statementLineId`/`fuelEntryId` tuy chon O DAY nhung BAT BUOC voi `MATCH_CONFIRMED` — va cong do
 * nam o service, khong o schema. Ly do: cong do phai doc ca ban ghi chenh lech (mot chenh lech
 * `STATEMENT_LINE_ONLY` da co san mot ve), va zod khong doc DB duoc. Dat mot phan cong o day va
 * mot phan o kia se lam ma tu choi phu thuoc vao duong nao chan truoc.
 */
export const resolveDiscrepancySchema = z
  .object({
    resolution: z.enum(FUEL_DISCREPANCY_RESOLUTIONS),
    note: optionalText,
    statementLineId: z.string().trim().min(1).optional(),
    fuelEntryId: z.string().trim().min(1).optional(),
  })
  .strict();

export const reopenReconciliationSchema = z.object({ reason: nonEmpty.max(500) }).strict();

export const createFuelSupplierSchema = z
  .object({
    name: nonEmpty.max(200),
    code: optionalText,
    phone: optionalText,
    address: optionalText,
    taxCode: optionalText,
  })
  .strict();
