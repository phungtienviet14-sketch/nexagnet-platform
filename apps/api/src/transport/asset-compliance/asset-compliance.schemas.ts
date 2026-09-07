import { z } from 'zod';
import {
  COMPLIANCE_DOCUMENT_STATUSES,
  COMPLIANCE_DOCUMENT_TYPES,
  COMPLIANCE_SUBJECT_KINDS,
  MAINTENANCE_PLAN_STATUSES,
  MAINTENANCE_TRIGGER_KINDS,
  MAINTENANCE_WORK_ORDER_KINDS,
} from './asset-compliance.types.js';

/**
 * Kiem BIEN GIOI HTTP cua `transport-asset-compliance`.
 *
 * Cung quy uoc voi `fuel.schemas.ts`: chi cho tang HTTP, khong dung lai o tang mien, va khong dat
 * trong `packages/shared` — mot schema dung chung se keo tang trinh bay vao mien.
 *
 * `.strict()` o moi doi tuong: mot truong go sai ten phai DO, khong duoc lang le bi bo qua. Mot
 * `intervalKm` go thanh `intervalKM` ma bi nuot se tao ra mot lich bao duong khong bao gio den han.
 */

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).nullish();
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngay nghiep vu phai co dang YYYY-MM-DD');
const odoKm = z.number().int().min(0).max(100_000_000);
const vndAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const createMaintenancePlanSchema = z
  .object({
    vehicleId: nonEmpty,
    name: nonEmpty,
    triggerKind: z.enum(MAINTENANCE_TRIGGER_KINDS),
    intervalKm: z.number().int().min(1).max(10_000_000).nullish(),
    intervalDays: z.number().int().min(1).max(3650).nullish(),
    baselineOdoKm: odoKm,
    baselineDate: businessDate,
  })
  .strict();

export const updateMaintenancePlanSchema = z
  .object({
    name: nonEmpty.optional(),
    triggerKind: z.enum(MAINTENANCE_TRIGGER_KINDS).optional(),
    intervalKm: z.number().int().min(1).max(10_000_000).nullish(),
    intervalDays: z.number().int().min(1).max(3650).nullish(),
    status: z.enum(MAINTENANCE_PLAN_STATUSES).optional(),
  })
  .strict();

export const openWorkOrderSchema = z
  .object({
    vehicleId: nonEmpty,
    /** `null` = sua dot xuat, khong theo lich nao. Truong nay BAT BUOC co mat de khong ai quen. */
    planId: nonEmpty.nullable(),
    description: nonEmpty,
    openedDate: businessDate,
    openedOdoKm: odoKm,
    note: optionalText,

    /* ----- `TX-06b` (#237) — deu TUY CHON, nen khong be mat goi nao dang chay phai doi ----- */

    /**
     * Vang mat => suy tat dinh tu `planId`, cung phep suy voi backfill cua migration.
     *
     * KHONG mac dinh o zod: mot `.default()` o day se lam tang HTTP quyet mot dieu ma tang kho da
     * quyet, va hai cho do se troi khoi nhau o lan sua thu nhat.
     */
    kind: z.enum(MAINTENANCE_WORK_ORDER_KINDS).optional(),
    vendorName: optionalText,
    vendorPhone: optionalText,
    /** CHI hop le voi `ROADSIDE_BREAKDOWN` — Postgres tu choi phan con lai. */
    tripId: optionalText,
    plannedDate: businessDate.nullish(),
    plannedOdoKm: odoKm.nullish(),
  })
  .strict();

export const completeWorkOrderSchema = z
  .object({
    completedDate: businessDate,
    completedOdoKm: odoKm,
    costAmount: vndAmount.nullish(),
    costingExpenseRef: optionalText,
    note: optionalText,

    /* ----- `TX-06b` (#237) — hoa don xuong doc duoc luc DONG lenh ----- */

    /**
     * Khi ca ba con so cung co mat thi `costAmount = partsCost + labourCost`.
     *
     * Phep kiem do nam duoi POSTGRES (`CHECK ..._cost_parts_labour`), khong o day: mot rang buoc
     * dat o zod chi bao ve dung mot route, va duong ghi thu hai se ra doi ma khong ai nho.
     */
    partsCost: vndAmount.nullish(),
    labourCost: vndAmount.nullish(),
    evidenceLocator: optionalText,
    vendorName: optionalText,
    vendorPhone: optionalText,
  })
  .strict();

export const cancelWorkOrderSchema = z.object({ reason: nonEmpty }).strict();

export const registerComplianceDocumentSchema = z
  .object({
    subjectKind: z.enum(COMPLIANCE_SUBJECT_KINDS),
    /** `null` chi hop le voi `COMPANY`; cong nghiep vu kiem tiep. */
    subjectId: nonEmpty.nullable(),
    documentType: z.enum(COMPLIANCE_DOCUMENT_TYPES),
    documentNo: optionalText,
    validFrom: businessDate,
    validTo: businessDate,
    evidenceRef: optionalText,
    note: optionalText,
  })
  .strict();

export const setComplianceDocumentStatusSchema = z
  .object({ status: z.enum(COMPLIANCE_DOCUMENT_STATUSES) })
  .strict();
