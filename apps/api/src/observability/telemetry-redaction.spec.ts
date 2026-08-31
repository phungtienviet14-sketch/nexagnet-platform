import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  REDACTED,
  REDACTED_PII,
  REDACTED_SECRET,
  privacyModeFor,
  sanitizeAttributes,
  sanitizeTelemetry,
  scrubSecrets,
} from './telemetry-redaction.js';

/**
 * Test BAO MAT — muc 14 xep P0.
 *
 * Moi gia tri o day la TONG HOP. Khong co bi mat that nao trong file nay, va khong duoc phep co:
 * mot secret dat vao test la mot secret da lo.
 *
 * VI SAO KHOA GIA DUOC GHEP LUC CHAY thay vi viet thang:
 * Bo quet secret cua pre-commit doc SOURCE chu khong doc y dinh, nen mot chuoi DANG khoa nam
 * trong test van bi chan — da xay ra ngay 21/08/2026, dung o file nay. Ghep tu manh cho ra dung
 * gia tri can test ma khong de lai chuoi dang khoa nao trong file. Bo quet dung, khong phai
 * canh bao thua: neu no bo qua "khoa trong test" thi mot khoa THAT nup duoi mot file `.spec.ts`
 * cung se di lot.
 */
const fakeKey = (prefix: string): string => `${prefix}-${'FAKE'.repeat(5)}9`;
const ANTHROPIC_LIKE = fakeKey('sk-ant');
const OPENAI_LIKE = fakeKey('sk');
describe('telemetry-redaction — bi mat', () => {
  it('xoa bi mat nam trong GIA TRI, khong chi theo ten khoa', () => {
    // Day la ly do ton tai cua module: khoa `message` hoan toan vo hai, bi mat nam trong noi dung.
    const input = {
      message: 'connect ECONNREFUSED postgresql://zalo:hunter2@postgres:5432/zalo',
    };

    const output = sanitizeAttributes(input, 'full');

    expect(JSON.stringify(output)).not.toContain('hunter2');
    expect(output.message).toContain(REDACTED_SECRET);
    // Van giu du thong tin de debug duoc: giao thuc, user, host, cong, ten DB.
    expect(output.message).toContain('postgresql://zalo:');
    expect(output.message).toContain('@postgres:5432/zalo');
  });

  it.each([
    ['JWT', 'token la eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk'],
    ['khoa Anthropic', `ANTHROPIC_API_KEY=${ANTHROPIC_LIKE}`],
    ['khoa kieu OpenAI/DeepSeek', `dung ${OPENAI_LIKE}`],
    ['khoa Google', 'key=AIzaFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12'],
    ['Bearer', 'Authorization: Bearer abcdef1234567890xyz'],
    ['Basic', 'Authorization: Basic dXNlcjpwYXNzd29yZA=='],
  ])('quet duoc %s trong chuoi', (_label, raw) => {
    expect(scrubSecrets(raw)).toContain(REDACTED_SECRET);
  });

  it('xoa bi mat o CA muc `full` — khong che do nao duoc phep lo khoa', () => {
    const secret = { apiKey: ANTHROPIC_LIKE, note: 'vo hai' };

    for (const mode of ['full', 'redacted', 'metadata-only'] as const) {
      const output = sanitizeAttributes(secret, mode);
      expect(output.apiKey, `che do ${mode} lam lo khoa`).toBe(REDACTED_SECRET);
    }
  });

  it.each([
    'password',
    'sessionSecret',
    'accessToken',
    'zaloBotToken',
    'authorization',
    'cookie',
    'databaseUrl',
    'anthropicApiKey',
    // Bat theo hau to, khong can liet ke het.
    'someCustomToken',
    'myPassword',
  ])('xoa khoa bi mat `%s` o moi muc', (key) => {
    const output = sanitizeAttributes({ [key]: 'gia-tri-nhay-cam' }, 'full');
    expect(output[key]).toBe(REDACTED_SECRET);
  });
});

describe('telemetry-redaction — du lieu ca nhan theo muc', () => {
  const person = {
    senderDisplayName: 'Nguyen Van A',
    customerPhone: '0912345678',
    shippingAddress: 'So 1 Pho X, Ha Noi',
    rawText: 'gui ve TN cho c',
  };

  it('muc `full` giu PII — stack TEST khong duoc mang du lieu khach that', () => {
    const output = sanitizeAttributes(person, 'full');

    expect(output.senderDisplayName).toBe('Nguyen Van A');
    expect(output.rawText).toBe('gui ve TN cho c');
  });

  it('muc `redacted` xoa PII nhung giu noi dung hoi thoai', () => {
    const output = sanitizeAttributes(person, 'redacted');

    expect(output.senderDisplayName).toBe(REDACTED_PII);
    expect(output.customerPhone).toBe(REDACTED_PII);
    expect(output.shippingAddress).toBe(REDACTED_PII);
    // Noi dung van con: khong co no thi khong debug duoc "vi sao parser hieu sai".
    expect(output.rawText).toBe('gui ve TN cho c');
  });

  it('muc `redacted` quet SDT/email nam LAN trong cau van', () => {
    const output = sanitizeAttributes(
      { rawText: 'goi em 0912345678 hoac mail a@b.com nhe' },
      'redacted',
    );

    expect(output.rawText).not.toContain('0912345678');
    expect(output.rawText).not.toContain('a@b.com');
    expect(output.rawText).toContain(REDACTED_PII);
  });

  it('muc `metadata-only` bo noi dung nhung giu DAU VET rang co noi dung', () => {
    const output = sanitizeAttributes({ rawText: 'mot cau dai' }, 'metadata-only');

    expect(output.rawText).not.toContain('mot cau dai');
    // Do dai van con — du de debug ca "cau tra loi bi cat" ma khong luu mot chu nao.
    expect(String(output.rawText)).toContain('11 ky tu');
  });
});

describe('telemetry-redaction — chong tu ban vao chan minh', () => {
  it('khong ket vong vo han voi tham chieu vong tron', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic.self = cyclic;

    expect(() => sanitizeTelemetry(cyclic, 'full')).not.toThrow();
    expect(JSON.stringify(sanitizeTelemetry(cyclic, 'full'))).toContain('CIRCULAR');
  });

  it('cat chuoi qua dai thay vi day ca trang vao log', () => {
    const output = sanitizeTelemetry('x'.repeat(5_000), 'full');

    expect(String(output).length).toBeLessThan(2_100);
    expect(String(output)).toContain('cat 3000 ky tu');
  });

  it('cat mang qua dai', () => {
    const output = sanitizeTelemetry(
      Array.from({ length: 200 }, (_, index) => index),
      'full',
    );

    expect(Array.isArray(output)).toBe(true);
    expect((output as unknown[]).length).toBe(51);
    expect(String((output as unknown[]).at(-1))).toContain('con 150 phan tu');
  });

  it('cat do sau long nhau', () => {
    let deep: Record<string, unknown> = { leaf: 'day' };
    for (let index = 0; index < 30; index += 1) deep = { nested: deep };

    expect(JSON.stringify(sanitizeTelemetry(deep, 'full'))).toContain(REDACTED);
  });

  it('quet ca thong bao loi cua Error — duong ro ri so mot cua telemetry', () => {
    const error = new Error('login that bai voi Bearer abcdef1234567890xyz');

    const output = sanitizeTelemetry(error, 'full') as Record<string, string>;

    expect(output.name).toBe('Error');
    expect(output.message).toContain(REDACTED_SECRET);
    expect(output.message).not.toContain('abcdef1234567890xyz');
  });
});

describe('privacyModeFor — gan voi DATA_CLASSIFICATION da co', () => {
  it('`customer` mac dinh ve muc an toan', () => {
    expect(privacyModeFor('customer')).toBe('redacted');
  });

  it('`test` cho nhin day du — do la luc can nhin ro nhat', () => {
    expect(privacyModeFor('test')).toBe('full');
  });

  it('ghi de tuong minh duoc ton trong', () => {
    expect(privacyModeFor('test', 'metadata-only')).toBe('metadata-only');
    expect(privacyModeFor('customer', 'full')).toBe('full');
  });

  it('ghi de rac bi bo qua, khong lam sap cau hinh', () => {
    expect(privacyModeFor('customer', 'khong-phai-mot-muc')).toBe('redacted');
  });
});

/**
 * HOI QUY 31/08/2026 — dinh danh KHONG duoc quet noi dung.
 *
 * Do that tren CI: mot `ledgerId` cua so cai quyet dinh bi cat thanh
 * `9654fa2[REDACTED_PII]-ae49-332192d5b726`, lam dut soi day tuong quan giua mat phang quan sat
 * va mat phang su that nghiep vu. Nguyen nhan la mau SDT Viet Nam khong neo hai dau, nen khuc
 * `0-1644-4786` ben trong UUID khop.
 *
 * Day la CUNG MOT bug voi ban sua `workflow-input.ts` ngay 25/08/2026, o mot bien gioi khac.
 */
describe('dinh danh noi bo di qua nguyen ven', () => {
  /** UUID THAT tu lan CI do — khong phai mot gia tri bia cho vua bai test. */
  const CI_UUID = '9654fa20-1644-4786-ae49-332192d5b726';

  it('UUID trong `ledgerId` khong bi cat, o CA HAI muc rieng tu', () => {
    expect(sanitizeAttributes({ ledgerId: CI_UUID }, 'redacted')).toEqual({ ledgerId: CI_UUID });
    expect(sanitizeAttributes({ ledgerId: CI_UUID }, 'metadata-only')).toEqual({
      ledgerId: CI_UUID,
    });
  });

  it.each(['orderId', 'messageId', 'traceId', 'decisionId', 'factId', 'id'])(
    'khoa dinh danh "%s" giu nguyen gia tri',
    (key) => {
      expect(sanitizeAttributes({ [key]: CI_UUID }, 'redacted')).toEqual({ [key]: CI_UUID });
    },
  );

  it('KHONG mot UUID nao trong mot mau lon bi cat — bay cu dinh 3,1%', () => {
    // Bai nay chay tren nhieu UUID that de mot ban lui ve quet noi dung se do NGAY, thay vi do
    // ngau nhien mot lan trong ba muoi lan chay.
    const ids = Array.from({ length: 500 }, () => randomUUID());
    for (const id of ids) {
      expect(sanitizeAttributes({ orderId: id }, 'redacted')).toEqual({ orderId: id });
    }
  });

  it('cuid cung di qua nguyen ven', () => {
    const cuid = 'clxyz1234567890abcdef';
    expect(sanitizeAttributes({ orderId: cuid }, 'redacted')).toEqual({ orderId: cuid });
  });

  /* --- Loi hua KHONG bi noi long --- */

  it('SDT nhet vao mot khoa dinh danh VAN bi che', () => {
    // Khuon doi CHU CAI hoac dang UUID; mot day toan chu so khong thoa ca hai.
    expect(sanitizeAttributes({ customerId: '0912345678' }, 'redacted')).toEqual({
      customerId: REDACTED_PII,
    });
  });

  it('email nhet vao mot khoa dinh danh VAN bi che', () => {
    expect(sanitizeAttributes({ userId: 'nguoi@vidu.vn' }, 'redacted')).toEqual({
      userId: REDACTED_PII,
    });
  });

  it('khoa PII co duoi "id" VAN bi che — thu tu kiem la mot phan hop dong', () => {
    // `senderExternalId`/`externalUserId` nam trong `PII_KEYS`, va `isPiiKey` chay TRUOC.
    expect(sanitizeAttributes({ senderExternalId: 'u_123abc' }, 'redacted')).toEqual({
      senderExternalId: REDACTED_PII,
    });
    expect(sanitizeAttributes({ externalUserId: 'u_123abc' }, 'redacted')).toEqual({
      externalUserId: REDACTED_PII,
    });
  });

  it('gia tri trong nhu BI MAT duoi khoa dinh danh VAN bi xoa', () => {
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'abcdefgh'].join('.');
    expect(sanitizeAttributes({ tokenId: jwt }, 'redacted')).toEqual({
      tokenId: REDACTED_SECRET,
    });
  });

  it('khoa KHONG mang nghia dinh danh van bi quet nhu truoc', () => {
    expect(sanitizeAttributes({ note: '0912345678' }, 'redacted')).toEqual({
      note: REDACTED_PII,
    });
  });
});
