import { z } from 'zod';
import {
  DRIVER_STATUSES,
  PARTNER_ROLE_KINDS,
  PARTY_STATUSES,
  VEHICLE_STATUSES,
} from './transport.types.js';
import { TRIP_KINDS, TRIP_STATUSES } from './trips/trip-lifecycle.js';

/**
 * Kiem dau vao tai BIEN GIOI HTTP.
 *
 * Dat trong thu muc cua mien (nhu `auth/auth.schemas.ts` da lam) chu khong o `packages/shared`:
 * hom nay khong client nao dung chung nhung kieu nay, va dua chung len goi dung chung se buoc moi
 * khach — ke ca khach khong van tai — phai build lai khi mot truong cua van tai doi.
 */

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).nullable().optional();

/** Tien: SO NGUYEN DONG (`GD-03`). `z.number().int()` chan luon so thuc ngay tai bien gioi. */
const vndAmount = z.number().int().nonnegative();

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay nghiep vu phai co dang YYYY-MM-DD');

export const createVehicleSchema = z
  .object({
    registrationPlate: nonEmpty.max(20),
    vehicleClass: nonEmpty.max(120),
    allowedPayloadKg: z.number().int().positive().nullable().optional(),
    currentOdoKm: z.number().int().nonnegative().optional(),
    status: z.enum(VEHICLE_STATUSES).optional(),
  })
  .strict();

export const updateVehicleSchema = createVehicleSchema
  .omit({ registrationPlate: true })
  .partial()
  .strict();

export const createDriverSchema = z
  .object({
    fullName: nonEmpty.max(120),
    phone: nonEmpty.max(20),
    licenceClass: nonEmpty.max(10),
    licenceExpiry: businessDate,
    status: z.enum(DRIVER_STATUSES).optional(),
    /** Cau noi user dang nhap -> ho so lai xe. Xem `Driver.authUserId`. */
    authUserId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const updateDriverSchema = createDriverSchema.partial().strict();

export const assignVehicleDriverSchema = z.object({ driverId: nonEmpty }).strict();

export const createCustomerSchema = z
  .object({
    name: nonEmpty.max(200),
    phone: optionalText,
    address: optionalText,
    taxCode: optionalText,
    status: z.enum(PARTY_STATUSES).optional(),
  })
  .strict();

export const updateCustomerSchema = createCustomerSchema.partial().strict();

export const createPartnerSchema = z
  .object({
    name: nonEmpty.max(200),
    phone: optionalText,
    /** MOT hoac NHIEU vai — VT-054. Khong bao gio la mot gia tri don. */
    roles: z.array(z.enum(PARTNER_ROLE_KINDS)).min(1),
    status: z.enum(PARTY_STATUSES).optional(),
  })
  .strict();

export const updatePartnerSchema = createPartnerSchema.partial().strict();

export const planTripSchema = z
  .object({
    code: nonEmpty.max(40),
    kind: z.enum(TRIP_KINDS),
    originLabel: nonEmpty.max(200),
    destinationLabel: nonEmpty.max(200),
    businessDate: businessDate.optional(),
    cargoDescription: optionalText,
    customerId: z.string().min(1).nullable().optional(),
    carrierPartnerId: z.string().min(1).nullable().optional(),
    referrerPartnerId: z.string().min(1).nullable().optional(),
    freightAmount: vndAmount.nullable().optional(),
    distanceKm: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

export const updateTripSchema = planTripSchema
  .omit({ code: true, kind: true, businessDate: true })
  .partial()
  .strict();

/**
 * Phan cong: ca hai truong deu nullable — chuyen thue xe ngoai khong co xe/lai xe cua cong ty, va
 * ep chung `NOT NULL` se buoc nguoi dung bia ra mot chiec xe khong ton tai.
 */
export const assignTripSchema = z
  .object({
    vehicleId: z.string().min(1).nullable(),
    driverId: z.string().min(1).nullable(),
  })
  .strict();

export const transitionTripSchema = z.object({ to: z.enum(TRIP_STATUSES) }).strict();

export const cancelTripSchema = z.object({ reason: nonEmpty.max(500) }).strict();

/** Lai xe chi dat duoc hai trang thai; `RECONCILED` la cong cua ke toan (`GD-01`). */
export const driverTripStatusSchema = z
  .object({ to: z.enum(['IN_TRANSIT', 'DELIVERED']) })
  .strict();

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'du lieu khong hop le';
}
