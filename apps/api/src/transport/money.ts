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

/**
 * KHOANG TIEN — mot hop dong DUY NHAT, doc chung boi bon tang.
 *
 * T2.1/F1 vá mot lech that: `money()` nhan toi `2^53-1` con cot DB la `INTEGER` (`2^31-1`), nen
 * mot cuoc 3 ty dong qua duoc CA kiem HTTP LAN kiem mien roi chet o lenh `INSERT` — tuc mot loi
 * nguoi dung bi bao thanh loi may chu. Bay gio cot la `BIGINT` va co mot `CHECK` dung bang hai
 * hang so duoi day, nen bon tang HTTP -> mien -> kho -> Postgres cung MOT khoang:
 *
 *   -(2^53-1) .. (2^53-1)   = -9.007.199.254.740.991 .. 9.007.199.254.740.991 dong
 *
 * Vi sao lay bien la `2^53-1` chu khong phai bien cua `BIGINT` (`2^63-1`): tien di ra ngoai bang
 * JSON, va `number` cua JavaScript chi dem chinh xac toi `2^53-1`. Neu cho DB rong hon mien thi
 * chinh cai lech vua vá se quay lai theo CHIEU NGUOC — mot hang doc len khong con bieu dien duoc,
 * va lan nay no hong luc DOC, cho khong ai dang nhin. Hep hon `BIGINT` la CO Y: khoang nay van gap
 * ~4 trieu lan tran `INTEGER` cu, du cho so cong don cua T3/T5.
 */
export const MONEY_MAX_AMOUNT = Number.MAX_SAFE_INTEGER;
export const MONEY_MIN_AMOUNT = -Number.MAX_SAFE_INTEGER;

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
 *
 * Bien cua vi ham nay TRUNG dung bien cua cot DB (`MONEY_MAX_AMOUNT`) — do la ca noi dung cua F1.
 */
export function money(amount: number): Money {
  if (!Number.isSafeInteger(amount)) {
    throw new MoneyError(
      `Tien phai la so nguyen dong trong khoang ${MONEY_MIN_AMOUNT}..${MONEY_MAX_AMOUNT}, ` +
        `nhan duoc: ${String(amount)}`,
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

/* ------------------------- Bien gioi LUU TRU ------------------------- */

/**
 * DONG (JS `number`) -> cot `BIGINT` (JS `bigint`).
 *
 * Di qua `money()` chu khong `BigInt(value)` thang: neu mot so thuc lot toi day thi `BigInt(1.5)`
 * nem `RangeError` — mot loi khong mang ten mien nao, roi ra HTTP thanh 500. Qua `money()` thi no
 * la `MoneyError`, va tang tren doi no thanh `MONEY_INVALID` / 400 nhu moi duong tu choi khac.
 */
export function toStoredAmount(amount: number | null): bigint | null {
  if (amount === null) return null;
  return BigInt(money(amount).amount);
}

/**
 * Cot `BIGINT` -> DONG (JS `number`).
 *
 * Kiem lai bien mot lan nua tuy DB da co `CHECK`. Khong phai vi nghi `CHECK` sai, ma vi mot hang
 * VUOT bien chi co the den tu mot duong ghi KHONG di qua ung dung (nhap tay, khoi phuc backup cu,
 * mot migration tuong lai). Neu khong kiem, gia tri do se lang le mat chinh xac o phep doi sang
 * `number` va di tiep vao mot bao cao — im lang, dung cai ma `GD-03` sinh ra de chan.
 */
export function fromStoredAmount(stored: bigint | null): number | null {
  if (stored === null) return null;
  if (stored > BigInt(MONEY_MAX_AMOUNT) || stored < BigInt(MONEY_MIN_AMOUNT)) {
    throw new MoneyError(
      `Hang du lieu co so tien ngoai khoang bieu dien duoc: ${stored.toString()}`,
    );
  }
  return Number(stored);
}
