import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from '../money.js';
import { businessDateSchema } from '../transport.schemas.js';
import { CASHOUT_ALLOCATION_SOURCES } from './cashout-allocation.js';

/**
 * KIEM DAU VAO cua `TX-07b`.
 *
 * KHONG CO TRUONG `recordedBy` o bat cu dau trong tep nay, va do la co y — cung quy uoc voi
 * `workforce.schemas.ts`. Nguoi ghi den tu PHIEN dang nhap (`transportActorOf`), khong tu than yeu
 * cau: neu no la mot truong cua body thi bat ky ai goi duoc API cung ky duoc ten nguoi khac len
 * mot lan chi tien mat.
 *
 * KHONG CO TRUONG `kind`/`status`: mot lan chi luon ra doi `ORIGINAL`/`POSTED`, va duong sang
 * `REVERSAL` la mot route RIENG voi mot quyen RIENG. Nhan `kind` tu body se cho phep ghi thang mot
 * phieu dao khong tro ve dau ca.
 */

/**
 * DO LON, luon duong. Dau do `cashout-allocation.ts` quyet.
 *
 * Ep nguoi nhap tu go dau am la ep ho nho mot quy uoc ke toan de sai — va mot dau go nham o day
 * bien mot lan chi thanh mot lan thu tien ve.
 */
const vndMagnitude = z.number().int().positive().max(MONEY_MAX_AMOUNT);

const cashoutLineSchema = z
  .object({
    source: z.enum(CASHOUT_ALLOCATION_SOURCES),
    amount: vndMagnitude,
    /** BAT BUOC voi `WAGE`, phai vang voi `REIMBURSEMENT`. Cuong che o `evaluateCashout`. */
    payslipId: z.string().min(1).nullish(),
    note: z.string().max(500).nullish(),
  })
  .strict();

export const recordCashoutSchema = z
  .object({
    driverId: z.string().min(1),
    businessDate: businessDateSchema.optional(),
    method: z.string().min(1).max(40),
    reference: z.string().max(120).nullish(),
    note: z.string().max(500).nullish(),
    correlationKey: z.string().min(1).max(160).optional(),
    lines: z.array(cashoutLineSchema).min(1),
  })
  .strict();

export const reverseCashoutSchema = z
  .object({
    /** Mot lan dao khong ly do la thu nguoi doi soat can doc nhat ma khong co. */
    reason: z.string().min(1).max(500),
  })
  .strict();

export type RecordCashoutBody = z.infer<typeof recordCashoutSchema>;
export type ReverseCashoutBody = z.infer<typeof reverseCashoutSchema>;
