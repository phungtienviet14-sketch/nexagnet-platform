import { MoneyError, money, type Money } from '../money.js';

/**
 * LUAT SO CAI cua quy lai xe — ham THUAN, khong biet Nest, khong biet Prisma.
 *
 * Day la cho DUY NHAT quyet dinh DAU cua mot but toan. Neu dau duoc gan o service hay o repository
 * thi moi duong ghi moi se phai nho lai quy uoc, va lan quen dau tien khong bao ra loi nao ca — no
 * chi lam so du di sai huong roi nam yen do toi khi ai do doi chieu tien mat cuoi thang.
 *
 * ---------------------------------------------------------------------------
 * QUY UOC DAU — doc ky truoc khi doi bat cu thu gi:
 *
 *   so du quy = SO TIEN CUA CONG TY MA LAI XE DANG GIU
 *
 *   ADVANCE       + : cong ty giao tien cho lai xe
 *   RETURN        - : lai xe tra tien mat lai cong ty
 *   TRIP_EXPENSE  - : lai xe tieu tien cua quy cho mot chuyen
 *   ADJUSTMENT    +/- : sua lech kiem ke, ca hai chieu
 *   REVERSAL      +/- : dung bang so doi dau cua but toan goc
 *
 * Quy uoc nay lay tu T1 §9.2, la cho DUY NHAT trong hop dong co mot vi du tinh ra so: ung
 * 10.000.000 roi chi 150.000 thi so du con 9.850.000 (hat giong `FUND-001`). Bo test khoa lai
 * chinh vi du do.
 *
 * ---------------------------------------------------------------------------
 * MOT LECH TRONG TAI LIEU, GHI RO O DAY THAY VI IM LANG (`DEMO_ASSUMPTION` DA-T3-01):
 *
 * T1 §9.4 viet "so du quy duoc phep am — do la cach bieu dien *lai xe dang no*". Voi quy uoc dau
 * ma chinh §9.2 dat ra, cau do doc nguoc: so du AM nghia la lai xe da tieu QUA so da ung, tuc
 * CONG TY DANG NO LAI XE mot khoan hoan ung. Hat giong `FUND-003` cung mo ta dung tinh huong do
 * ("lai xe da chi nhieu hon da ung") va chi doi mot CANH BAO, khong doi mot khoan thu hoi.
 *
 * Chon: theo §9.2 + `FUND-001` + `FUND-003`, vi chung co vi du tinh ra so va co hat giong nghiem
 * thu; cau chu o §9.4 khong co. Dieu KHONG doi la phan cot loi cua `INV-23`: so tien do nam o
 * DUNG MOT cho — so du quy — va khong tu sinh ra mot khoan phai thu hay khau tru nao o so khac
 * (`GD-12`). Can khach xac nhan chieu doc truoc khi T6/T7 dung bao cao len tren no.
 */

export const DRIVER_FUND_ENTRY_KINDS = [
  /** Tam ung tien mat cho lai xe. `tripId` co the NULL — `INV-02`, hat giong `FUND-002`. */
  'ADVANCE',
  /** Lai xe nop lai tien mat con thua. */
  'RETURN',
  /** Lai xe chi tien cua quy cho mot chuyen. Luon di kem MOT `TripExpense` — `INV-03`. */
  'TRIP_EXPENSE',
  /** Dieu chinh kiem ke, hai chieu. KHONG dung de "sua" but toan cu — do la viec cua REVERSAL. */
  'ADJUSTMENT',
  /** Dao mot but toan da ghi. Khong bao gio duoc tao truc tiep boi nguoi dung. */
  'REVERSAL',
] as const;
export type DriverFundEntryKind = (typeof DRIVER_FUND_ENTRY_KINDS)[number];

/** Loai but toan ma nguoi dung duoc phep tao THANG. `REVERSAL` chi den tu duong dao. */
export const POSTABLE_FUND_ENTRY_KINDS = ['ADVANCE', 'RETURN', 'ADJUSTMENT'] as const;
export type PostableFundEntryKind = (typeof POSTABLE_FUND_ENTRY_KINDS)[number];

/** Huong dau BAT BUOC cua tung loai. `null` = ca hai chieu deu hop le. */
const REQUIRED_SIGN: Readonly<Record<DriverFundEntryKind, 1 | -1 | null>> = {
  ADVANCE: 1,
  RETURN: -1,
  TRIP_EXPENSE: -1,
  ADJUSTMENT: null,
  REVERSAL: null,
};

export const TRIP_EXPENSE_KINDS = [
  'EXPENSE',
  /** Dong DAO cua mot khoan chi. Mang so AM de tong gia thanh chuyen tu tru ra. */
  'REVERSAL',
] as const;
export type TripExpenseKind = (typeof TRIP_EXPENSE_KINDS)[number];

/**
 * NGUON TIEN cua mot khoan chi — mot THUOC TINH cua `TripExpense`, khong phai mot bang khac.
 *
 * T1 §5 ghi ro dieu nay. Neu tach thanh hai bang thi moi bao cao gia thanh chuyen phai UNION hai
 * nguon, va lan quen mot ve dau tien se cho ra mot chuyen re hon thuc te ma khong bao loi nao.
 */
export const EXPENSE_FUNDING_SOURCES = [
  /** Lai xe ung tien tu quy ra tra. Sinh THEM mot `DriverFundEntry` am — `INV-03`. */
  'DRIVER_FUND',
  /** Cong ty tra thang nha cung cap. KHONG sinh but toan quy nao. */
  'COMPANY_DIRECT',
] as const;
export type ExpenseFundingSource = (typeof EXPENSE_FUNDING_SOURCES)[number];

export class LedgerSignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerSignError';
  }
}

/**
 * Doi DO LON nguoi dung nhap (luon khong am) thanh SO CO DAU cua so cai.
 *
 * Nguoi dung nhap "150.000 phi BOT", khong nhap "-150.000". Ep ho tu go dau am la ep ho nho mot
 * quy uoc ke toan de sai — va mot dau go nham o day la mot khoan chi bien thanh mot khoan thu.
 */
export function signedAmountFor(kind: DriverFundEntryKind, magnitude: number): Money {
  const value = money(magnitude);
  if (value.amount < 0) {
    throw new LedgerSignError(`Do lon cua but toan khong duoc am, nhan duoc: ${value.amount}`);
  }
  const sign = REQUIRED_SIGN[kind];
  if (sign === null) {
    throw new LedgerSignError(
      `Loai but toan ${kind} khong co huong dau co dinh — nguoi goi phai dua so CO DAU`,
    );
  }
  return money(sign * value.amount);
}

/**
 * Kiem mot so CO DAU co hop voi loai but toan khong.
 *
 * Ton tai rieng khoi `signedAmountFor` vi hai duong vao khac nhau: `ADJUSTMENT` va `REVERSAL` mang
 * so co dau san, ba loai kia duoc suy ra tu do lon. Ca hai duong phai gap cung mot cai cong.
 */
export function assertLedgerSign(kind: DriverFundEntryKind, signedAmount: number): Money {
  const value = money(signedAmount);
  if (value.amount === 0) {
    throw new LedgerSignError(`But toan ${kind} khong duoc bang 0 — mot dong 0 dong khong noi gi`);
  }
  const sign = REQUIRED_SIGN[kind];
  if (sign === 1 && value.amount < 0) {
    throw new LedgerSignError(`But toan ${kind} phai duong, nhan duoc: ${value.amount}`);
  }
  if (sign === -1 && value.amount > 0) {
    throw new LedgerSignError(`But toan ${kind} phai am, nhan duoc: ${value.amount}`);
  }
  return value;
}

/** Dau cua mot dong gia thanh chuyen: khoan chi duong, but toan dao am. */
export function assertExpenseSign(kind: TripExpenseKind, signedAmount: number): Money {
  const value = money(signedAmount);
  if (value.amount === 0) {
    throw new LedgerSignError('Khoan chi 0 dong khong ghi — no khong noi gi ve gia thanh chuyen');
  }
  if (kind === 'EXPENSE' && value.amount < 0) {
    throw new LedgerSignError(`Khoan chi phai duong, nhan duoc: ${value.amount}`);
  }
  if (kind === 'REVERSAL' && value.amount > 0) {
    throw new LedgerSignError(`Dong dao phai am, nhan duoc: ${value.amount}`);
  }
  return value;
}

/**
 * SO DU = TONG but toan. `INV-01`.
 *
 * Khong co ham `setBalance` nao trong ca capability nay, va do khong phai thieu sot: mot cot so du
 * ghi de duoc se lech voi so cai ngay lan dau co mot loi giua chung, va tu do khong con cach nao
 * biet ben nao dung. Cong lai thi cham hon vai mili-giay va luon dung.
 *
 * Cong don di qua `money()` TUNG BUOC de mot tong vuot khoang bieu dien duoc bi chan NGAY, thay vi
 * lang le mat chinh xac o dau do quanh 2^53 roi di tiep vao mot bao cao.
 */
export function foldFundBalance(signedAmounts: readonly number[]): Money {
  return signedAmounts.reduce<Money>((total, amount) => {
    try {
      return money(total.amount + money(amount).amount);
    } catch (error) {
      if (error instanceof MoneyError) {
        throw new MoneyError(`Cong don so du vuot khoang bieu dien duoc: ${error.message}`);
      }
      throw error;
    }
  }, money(0));
}

/**
 * GIA THANH TRUC TIEP cua mot chuyen = tong cac dong `TripExpense` CO DAU.
 *
 * KHONG duoc cong voi so du quy. T1 §9.2 goi day la "phep thu doc hieu": hai con so doi soat duoc
 * VOI NHAU nhung khong bao gio vao cung mot tong — ai cong chung lai la dang dem mot khoan tien
 * hai lan (`INV-23`).
 */
export const foldTripDirectCost = (signedAmounts: readonly number[]): Money =>
  foldFundBalance(signedAmounts);
