import { describe, expect, it } from 'vitest';
import { addMoney, money, MoneyError, TRANSPORT_CURRENCY, zeroMoney } from './money.js';

/**
 * MONEY-CORE-001 (T1 §17, `GD-03`) — tien la SO NGUYEN DONG, khong bao gio la so thuc.
 *
 * Bai test nay giu mot quyet dinh CAU TRUC, khong phai mot chi tiet hien thuc: VND khong co don vi
 * phu, nen mot gia tri le hon 1 dong khong the la tien that — no chi co the la ket qua cua mot
 * phep chia da mat chinh xac. Chan tai bien gioi re hon rat nhieu so voi di tim mot dong lech
 * 0,0000001 dong trong mot bang doi soat cuoi thang.
 */
describe('Money (VND) — MONEY-CORE-001', () => {
  it('nhan so nguyen dong va gan currencyCode VND', () => {
    expect(money(1_150_000)).toEqual({ amount: 1_150_000, currencyCode: 'VND' });
    expect(TRANSPORT_CURRENCY).toBe('VND');
  });

  it('TU CHOI so thuc — khong co "1150.5 dong"', () => {
    expect(() => money(1150.5)).toThrow(MoneyError);
    expect(() => money(0.1 + 0.2)).toThrow(MoneyError);
  });

  it('TU CHOI NaN va Infinity', () => {
    expect(() => money(Number.NaN)).toThrow(MoneyError);
    expect(() => money(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => money(Number.NEGATIVE_INFINITY)).toThrow(MoneyError);
  });

  it('TU CHOI so vuot khoang nguyen an toan cua JavaScript', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });

  it('cho phep so am — so du co the am, do la mot trang thai nghiep vu hop le', () => {
    expect(money(-150_000).amount).toBe(-150_000);
  });

  it('cong tien la phep cong so nguyen chinh xac, khong tich luy sai so', () => {
    let total = zeroMoney();
    for (let i = 0; i < 10; i += 1) total = addMoney(total, money(10));
    expect(total.amount).toBe(100);
  });
});
