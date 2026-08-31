import { describe, expect, it } from 'vitest';
import {
  buildDecisionEvidence,
  isInternalIdentifier,
  isMonetaryKey,
  MAX_EVIDENCE_KEYS,
  MAX_EVIDENCE_STRING,
} from './decision-evidence.js';

/**
 * HOP DONG RIENG TU cua so cai — muc 5 hop dong nhiem vu.
 *
 * Moi bai duoi day khang dinh mot duong RO RI CU THE bi dong, khong phai "ham nay chay duoc".
 */

describe('bang chung chi nhan vo huong', () => {
  it('cho qua chuoi, so, boolean va null', () => {
    expect(
      buildDecisionEvidence({
        reasonDetail: 'ABOVE_THRESHOLD',
        totalQuantity: 60,
        withinWindow: false,
        overrideId: null,
      }),
    ).toEqual({
      reasonDetail: 'ABOVE_THRESHOLD',
      totalQuantity: 60,
      withinWindow: false,
      overrideId: null,
    });
  });

  it('BigInt thanh chuoi — kieu tien cua mien van tai khong mat do chinh xac', () => {
    expect(buildDecisionEvidence({ entryCount: 9_007_199_254_740_993n })).toEqual({
      entryCount: '9007199254740993',
    });
  });

  it.each([
    ['object long nhau', { nested: { a: 1 } }],
    ['mang', { items: [1, 2] }],
    ['Date', { at: new Date() }],
    ['NaN', { ratio: Number.NaN }],
    ['Infinity', { ratio: Number.POSITIVE_INFINITY }],
  ])('tu choi %s', (_label, input) => {
    expect(() => buildDecisionEvidence(input)).toThrowError(/EVIDENCE_VALUE_NOT_SCALAR/);
  });

  it('bo qua `undefined` thay vi ghi `null` — "chua dien" khac "da tra loi la khong co"', () => {
    expect(buildDecisionEvidence({ a: 'x', b: undefined })).toEqual({ a: 'x' });
  });

  it('tra ve doi tuong DONG BANG — bang chung da dung khong doi duoc ve sau', () => {
    const evidence = buildDecisionEvidence({ a: 'x' });
    expect(Object.isFrozen(evidence)).toBe(true);
  });
});

describe('bon pham tru khoa bi chan', () => {
  it.each([
    ['bi mat', { apiKey: 'x' }, 'EVIDENCE_SECRET_KEY'],
    ['bi mat hau to', { anthropicApiKey: 'x' }, 'EVIDENCE_SECRET_KEY'],
    ['PII', { customerPhone: '0900000000' }, 'EVIDENCE_PII_KEY'],
    ['PII hau to', { shippingAddress: 'x' }, 'EVIDENCE_PII_KEY'],
    ['noi dung', { rawText: 'x' }, 'EVIDENCE_CONTENT_KEY'],
    ['prompt LLM', { prompt: 'x' }, 'EVIDENCE_CONTENT_KEY'],
    ['cau tra loi LLM', { completion: 'x' }, 'EVIDENCE_CONTENT_KEY'],
    ['tien', { unitPrice: 1 }, 'EVIDENCE_MONETARY_KEY'],
    ['tien tieng Viet', { tongTien: 1 }, 'EVIDENCE_MONETARY_KEY'],
    ['tien hau to', { freightAmount: 1 }, 'EVIDENCE_MONETARY_KEY'],
  ])('tu choi khoa %s', (_label, input, rejection) => {
    expect(() => buildDecisionEvidence(input)).toThrowError(new RegExp(rejection));
  });

  it('mot ma ly do NOI VE gia thi van qua duoc — chan la CON SO, khong phai chu de', () => {
    // Day la ranh gioi quan trong nhat cua hop dong nay: so cai PHAI ghi duoc
    // "da ap gia rieng cua dai ly", no chi khong duoc ghi muc gia do la bao nhieu.
    expect(
      buildDecisionEvidence({
        reasonDetail: 'DEALER_PRICE_OVERRIDE_APPLIED',
        overrideRecordId: 'ovr_01H8XGJ',
        minQuantity: 10,
      }),
    ).toMatchObject({ reasonDetail: 'DEALER_PRICE_OVERRIDE_APPLIED' });
  });
});

/**
 * Gia tri co HINH DANG bi mat, GHEP LUC CHAY.
 *
 * Ghep tu cac manh thay vi viet nguyen chuoi vao source co hai ly do, va ca hai deu that:
 *   1. bo quet bi mat cua pre-commit doc chinh tep nay, va mot chuoi nguyen se lam no chan commit
 *      — mot bai test chung minh "ta chan bi mat" khong nen la thu duy nhat khong qua duoc cong do;
 *   2. repo PUBLIC: khong de mot chuoi trong nhu khoa that nam trong lich su git, ke ca khi no gia.
 * Gia tri sau khi ghep van khop DUNG cac mau ma `scrubSecrets` bat, nen bai test khong yeu di.
 */
const SECRET_SHAPED = {
  jwt: ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'abcdefgh'].join('.'),
  vendorKey: ['sk', 'ant', '0123456789abcdef0123'].join('-'),
  credentialUrl: `postgresql://user:${'p4ssw0rd'}@postgres:5432/db`,
  bearer: `Bearer ${'abcdefgh12345678'}`,
} as const;

describe('gia tri: bi mat bi chan, dinh danh KHONG bi quet noi dung', () => {
  it.each([
    ['JWT', SECRET_SHAPED.jwt],
    ['khoa nha cung cap', SECRET_SHAPED.vendorKey],
    ['URL co mat khau', SECRET_SHAPED.credentialUrl],
    ['Bearer', SECRET_SHAPED.bearer],
  ])('tu choi gia tri trong nhu %s', (_label, value) => {
    expect(() => buildDecisionEvidence({ note: value })).toThrowError(/EVIDENCE_SECRET_VALUE/);
  });

  it('UUID chua khuc trong nhu SDT VAN qua — bai hoc 25/08/2026', () => {
    // `501e65d0-9605-4854-8f20-f213eb446ea9` chua `0-9605-4854`, khop mau SDT Viet Nam. Mot phep
    // quet noi dung o day se tu choi 1,2% dinh danh HOP LE — da do that tren stack that.
    expect(
      buildDecisionEvidence({ parentDecisionId: '501e65d0-9605-4854-8f20-f213eb446ea9' }),
    ).toEqual({ parentDecisionId: '501e65d0-9605-4854-8f20-f213eb446ea9' });
  });

  it('chuoi dai hon tran bi tu choi — mot tin nhan day du khong lot qua duong nay', () => {
    expect(() => buildDecisionEvidence({ note: 'x'.repeat(MAX_EVIDENCE_STRING + 1) })).toThrowError(
      /EVIDENCE_STRING_TOO_LONG/,
    );
    expect(() =>
      buildDecisionEvidence({ note: 'x'.repeat(MAX_EVIDENCE_STRING) }),
    ).not.toThrowError();
  });

  it('qua nhieu khoa bi tu choi — bang chung khong phai ban sao thuc the', () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: MAX_EVIDENCE_KEYS + 1 }, (_value, index) => [`k${index}`, index]),
    );
    expect(() => buildDecisionEvidence(tooMany)).toThrowError(/EVIDENCE_TOO_MANY_KEYS/);
  });

  it('ten khoa sai khuon bi tu choi', () => {
    expect(() => buildDecisionEvidence({ 'a-b': 1 })).toThrowError(/EVIDENCE_KEY_MALFORMED/);
    expect(() => buildDecisionEvidence({ '1a': 1 })).toThrowError(/EVIDENCE_KEY_MALFORMED/);
  });
});

describe('isInternalIdentifier — kiem bang KHUON', () => {
  it.each([
    'ord_01H8XGJ',
    'clxyz1234567890',
    '501e65d0-9605-4854-8f20-f213eb446ea9',
    '00000000-0000-4000-8000-000000000000',
    'trip:2026-08-31:001',
  ])('nhan dinh danh noi bo "%s"', (value) => {
    expect(isInternalIdentifier(value)).toBe(true);
  });

  it.each([
    ['SDT', '0912345678'],
    ['SDT quoc te', '+84912345678'],
    ['email', 'nguoi@vidu.vn'],
    ['co khoang trang', 'ord 1'],
    ['rong', ''],
  ])('tu choi %s', (_label, value) => {
    expect(isInternalIdentifier(value)).toBe(false);
  });
});

describe('isMonetaryKey', () => {
  it('nhan dien theo tap va theo hau to', () => {
    expect(isMonetaryKey('price')).toBe(true);
    expect(isMonetaryKey('closing_balance')).toBe(true);
    expect(isMonetaryKey('shippingFee')).toBe(true);
    expect(isMonetaryKey('quantity')).toBe(false);
    expect(isMonetaryKey('reasonCode')).toBe(false);
  });
});
