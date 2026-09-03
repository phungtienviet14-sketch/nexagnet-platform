import { z } from 'zod';
import { PAYSLIP_COMPONENT_KINDS } from './workforce.types.js';

/**
 * Kiem BIEN GIOI HTTP cua `transport-workforce`.
 *
 * `.strict()` o moi doi tuong. O mien luong dieu do quan trong hon binh thuong: mot truong go sai
 * ten bi nuot lang le nghia la mot khoan tien khong duoc ghi, va no chi lo ra khi lai xe hoi.
 *
 * KHONG CO schema nao nhan mot khoan tru KHONG co nguoi ky, va khong co schema nao nhan mot so tien
 * AM — chieu nam o `kind`. Ca hai deu la `GD-12` duoc dat o lop ngoai cung.
 */

const nonEmpty = z.string().trim().min(1);
const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngay nghiep vu phai co dang YYYY-MM-DD');
const vndAmount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const openPayrollPeriodSchema = z
  .object({ label: nonEmpty, startDate: businessDate, endDate: businessDate })
  .strict();

const manualComponentSchema = z
  .object({
    kind: z.enum(PAYSLIP_COMPONENT_KINDS),
    label: nonEmpty,
    /** DUONG, luon. Chieu nam o `kind` — mot so am se lam mot khoan tru thanh khoan cong tra hinh. */
    amount: vndAmount,
    note: z.string().trim().min(1).nullish(),
  })
  .strict();

/**
 * Khoan thu cong theo lai xe cho mot lan chay.
 *
 * `recordedBy` KHONG nam trong than yeu cau: no den tu phien dang nhap. Cho nguoi goi tu khai ten
 * nguoi ky se lam chu ky do vo nghia — bat ky ai cung go duoc ten giam doc vao.
 */
export const runPayrollSchema = z
  .object({
    periodId: nonEmpty,
    manualComponents: z.record(nonEmpty, z.array(manualComponentSchema)).optional(),
  })
  .strict();

export const issueCorrectionSchema = z
  .object({
    kind: z.enum(['SUPPLEMENTAL', 'REVERSAL']),
    reason: nonEmpty,
    /** Chi dung cho `SUPPLEMENTAL`; phieu dao lay nguyen cac dong cua ban goc va doi chieu. */
    components: z.array(manualComponentSchema).optional(),
  })
  .strict();
