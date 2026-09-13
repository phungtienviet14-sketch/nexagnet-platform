import { z } from 'zod';
import { WAITING_ALLOWANCE_OUTCOMES } from './allowance.types.js';

/**
 * BIEN VAO HTTP cua phu cap cho.
 *
 * MOT DIEU KHONG CO O DAY: **khong lieu do nao nhan `driverId`, `proposedBy`, `decidedBy`,
 * `proposedAt` hay `decidedAt`.**
 *
 *   · lai xe huong khoan nay lay tu CHINH PHIEN CHO;
 *   · danh tinh nguoi thao tac lay tu PHIEN DANG NHAP;
 *   · gio lay tu DONG HO MAY CHU.
 *
 * `#279` O12 doi *"`receipt returned` fact cannot be forged by caller-supplied actor/time"*, va
 * cung dieu do dung o day: mot khoan tien co the bi gan cho nguoi khac neu `driverId` den tu than
 * yeu cau.
 *
 * VA MOT DIEU NUA KHONG CO O DAY: **khong truong nao mang thoi luong cho.** So tien la mot con so
 * NGUOI GO VAO; thoi luong la mot su that VAN HANH doc tu phien. Cho nguoi goi gui ca hai se cho
 * ho co hoi khai mot thoi luong khong khop voi phien — va con so do se nam trong ho so duyet.
 */
export const proposeWaitingAllowanceSchema = z
  .object({
    waitingSessionId: z.string().min(1),
    /** So NGUYEN DONG (`GD-03`). Duong — mot de nghi 0d khong phai mot de nghi. */
    candidateAmount: z.number().int().positive().max(1_000_000_000),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export type ProposeWaitingAllowanceBody = z.infer<typeof proposeWaitingAllowanceSchema>;

/**
 * QUYET DINH — `approvedAmount` BAT BUOC khi duyet, va PHAI VANG MAT khi tu choi.
 *
 * `superRefine` chu khong hai schema roi: mot lieu do `{ outcome: 'REJECTED', approvedAmount:
 * 500000 }` phai bi bao la SAI, khong bi lam ngo. Nhan roi bo di se de lai mot con so trong nhat ky
 * yeu cau ma khong ai giai thich duoc.
 */
export const decideWaitingAllowanceSchema = z
  .object({
    outcome: z.enum(WAITING_ALLOWANCE_OUTCOMES),
    approvedAmount: z.number().int().positive().max(1_000_000_000).optional(),
    note: z.string().trim().max(2000).optional(),
    /** Khoa chong ghi trung cua lan QUYET DINH. BAT BUOC — `#279` O6 *"same approval retry one effect"*. */
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === 'APPROVED' && value.approvedAmount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['approvedAmount'],
        message: 'Duyet thi phai ghi so tien duoc duyet',
      });
    }
    if (value.outcome === 'REJECTED' && value.approvedAmount !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['approvedAmount'],
        message: 'Tu choi thi khong ghi so tien duoc duyet',
      });
    }
  });

export type DecideWaitingAllowanceBody = z.infer<typeof decideWaitingAllowanceSchema>;
