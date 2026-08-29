/**
 * TIEN cua mien van tai — so nguyen DONG, khong bao gio so thuc (`GD-03`).
 *
 * ĐAT O DAU, VA VI SAO KHONG O `packages/`:
 * T1 §19 xep "primitive tien/lam tron/phan bo" vao `PG-03` — mot nang luc chung cho MOI vertical
 * tai chinh, tuc viec cua Platform Track. Neu van tai dung len mot khung tien tong quat o
 * `packages/shared`, thi khach ke toan hay logistics sau nay se phai boi no ra khoi mot vertical.
 * Nen o day chi co dung phan TOI THIEU ma T2 that su dung, dat trong thu muc cua chinh mien nay,
 * va khong he co API "phan bo largest-remainder" hay "doi tien te" nao — nhung thu do thuoc
 * `PG-03` va se den cung Platform Track.
 *
 * Cai duy nhat KHONG duoc hoan lai la HINH DANG CO SO DU LIEU: cot tien la `Int` va co mot cot
 * `currencyCode` di kem. Them cot tien te sau khi da co du lieu that la mot migration doc du lieu;
 * them bay gio gan nhu mien phi (`GD-03`, chi phi dao nguoc).
 */

/** Demo mot tenant mot loai tien. `GD-03` — VND khong co don vi phu nen don vi luu la DONG. */
export const TRANSPORT_CURRENCY = 'VND' as const;
export type TransportCurrencyCode = typeof TRANSPORT_CURRENCY;

export interface Money {
  /** So nguyen DONG. Am la hop le — so du co the am (T1 §9.4). */
  readonly amount: number;
  readonly currencyCode: TransportCurrencyCode;
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Cua NGO DUY NHAT tao ra mot gia tri tien.
 *
 * `Number.isSafeInteger` bat mot luc ca bon duong hong: so thuc, `NaN`, `Infinity` va so vuot
 * khoang nguyen an toan cua JavaScript. Cai cuoi cung it nguoi nghi toi nhung lai la cai im lang
 * nhat: qua 2^53 thi phep cong bat dau tra ket qua sai ma khong nem gi ca.
 */
export function money(amount: number): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(
      `Tien phai la so nguyen dong trong khoang an toan, nhan duoc: ${String(amount)}`,
    );
  }
  return { amount, currencyCode: TRANSPORT_CURRENCY };
}

export const zeroMoney = (): Money => money(0);

export function addMoney(left: Money, right: Money): Money {
  if (left.currencyCode !== right.currencyCode) {
    throw new MoneyError(`Khong cong duoc hai loai tien: ${left.currencyCode} + ${right.currencyCode}`);
  }
  return money(left.amount + right.amount);
}

/** Tien cua mot khoan thu/chi — khong am. Doanh thu chuyen dung cong nay. */
export function nonNegativeMoney(amount: number): Money {
  const value = money(amount);
  if (value.amount < 0) throw new MoneyError(`Gia tri nay khong duoc am: ${value.amount}`);
  return value;
}
