import { z } from 'zod';
import { MONEY_MAX_AMOUNT, MONEY_MIN_AMOUNT } from '../money.js';
import { EXPENSE_FUNDING_SOURCES } from './driver-fund-ledger.js';

/**
 * Kiem dau vao tai BIEN GIOI HTTP cua `transport-costing`.
 *
 * Cung ly le voi `transport.schemas.ts`: dat trong thu muc cua mien, khong o `packages/shared` —
 * hom nay khong client nao dung chung nhung kieu nay, va dua chung len goi dung chung se buoc moi
 * khach (ke ca khach khong van tai) phai build lai khi mot truong cua so quy doi.
 */

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).nullable().optional();

/**
 * TIEN VAO/RA — nguoi dung nhap DO LON, khong bao gio go dau am.
 *
 * Dau do `driver-fund-ledger.ts` quyet theo loai but toan. Neu bien gioi nay nhan so am thi mot lan
 * go nham dau se bien mot khoan tam ung thanh mot khoan hoan tra, va ca hai deu la dau vao "hop le"
 * nen khong tang nao chan duoc.
 */
const vndMagnitude = z.number().int().positive().max(MONEY_MAX_AMOUNT);

/**
 * DIEU CHINH KIEM KE la duong DUY NHAT nhan so CO DAU, va nhan ca hai chieu.
 *
 * `.min(MONEY_MIN_AMOUNT)` khong thua: khoang cua `z.number().int()` rong hon khoang ma `money()`
 * va `CHECK` cua cot chap nhan, nen thieu no thi mot gia tri qua duoc HTTP roi chet o `INSERT` —
 * dung cai lech ma T2.1/F1 da va cho cot gia cuoc.
 */
const vndSigned = z.number().int().min(MONEY_MIN_AMOUNT).max(MONEY_MAX_AMOUNT);

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay nghiep vu phai co dang YYYY-MM-DD');

/**
 * KHOA CHONG GHI TRUNG do client dua vao. TUY CHON — khong co thi he thong tu sinh.
 *
 * Bat buoc no se lam moi loi goi tay tu curl phai bia ra mot UUID, va nguoi ta se bia ra `"1"` —
 * tuc bien mot co che chong trung thanh mot va cham thuong truc.
 */
const correlationKey = z.string().trim().min(8).max(120).optional();

export const postFundMovementSchema = z
  .object({
    driverId: nonEmpty,
    amount: vndMagnitude,
    businessDate: businessDate.optional(),
    tripId: z.string().min(1).nullable().optional(),
    note: optionalText,
    correlationKey,
  })
  .strict();

export const adjustFundSchema = z
  .object({
    driverId: nonEmpty,
    signedAmount: vndSigned.refine((value) => value !== 0, 'dieu chinh 0 dong khong noi gi'),
    businessDate: businessDate.optional(),
    tripId: z.string().min(1).nullable().optional(),
    note: optionalText,
    correlationKey,
  })
  .strict();

export const recordTripExpenseSchema = z
  .object({
    tripId: nonEmpty,
    categoryCode: nonEmpty.max(60),
    amount: vndMagnitude,
    fundedBy: z.enum(EXPENSE_FUNDING_SOURCES),
    /** BAT BUOC khi `fundedBy = DRIVER_FUND`; cong do o service, khong o day. */
    driverId: z.string().min(1).nullable().optional(),
    businessDate: businessDate.optional(),
    /** Tham chieu bang chung (`PG-05` chua co) — mot chuoi dinh vi, khong phai mot file upload. */
    evidenceLocator: z.string().trim().min(1).max(500).nullable().optional(),
    note: optionalText,
    correlationKey,
  })
  .strict();

export const reversalSchema = z.object({ reason: nonEmpty.max(500) }).strict();

export const openFundPeriodSchema = z
  .object({
    driverId: nonEmpty,
    startDate: businessDate,
    endDate: businessDate,
  })
  .strict();

export const reopenFundPeriodSchema = z.object({ reason: nonEmpty.max(500) }).strict();
