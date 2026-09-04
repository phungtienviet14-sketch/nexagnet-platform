/**
 * MOT CAU TRA LOI NON-2XX PHAI MANG THEO LY DO — va khong mang theo bi mat (Issue #188).
 *
 * VI SAO BAI NAY TON TAI
 *
 * `api()` truoc day VUT than khi non-2xx. Hau qua do duoc mot lan chay THAT: run 33889198070 dung
 * o `COMMENT_POST_FAILED status=403` va khong mot chu nao cua GitHub di kem. Mot con so `403` khong
 * phan biet duoc thieu quyen · PR bi khoa · repo archived · interaction limit · token het han — nam
 * nguyen nhan, nam hanh dong khac han. Nen viec phan biet phai lam bang cac phep do rieng ben
 * ngoai, mot viec le ra khong can neu cau tra loi con nguyen.
 *
 * NHUNG GIU LAI THAN LA MO MOT DUONG MOI: log cua Actions la CONG KHAI tren mot repo public. Nen
 * bai nay do DONG THOI hai huong, va ca hai deu phai dung:
 *
 *   GIU DU     — status + cau cua GitHub du de chan doan ma khong phai chay lai;
 *   KHONG RO   — khong mot token nao di qua duong nay, ke ca khi than mang no.
 *
 * Cac chuoi giong token trong tep nay la GIA — dung tien to that de mau bat duoc, con phan con lai
 * la ky tu bia.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { REDACTED, describeApiError } from '../src/api-error.mjs';
import { api } from '../src/github.mjs';

/** Token gia, dung tien to `ghs_` cua `GITHUB_TOKEN` trong Actions. */
const FAKE_TOKEN = 'ghs_KhongPhaiTokenThat0123456789abcdefGH';

test('cau cua GitHub duoc giu lai — day la thu lan chay 33889198070 khong co', () => {
  const described = describeApiError(
    JSON.stringify({
      message: 'Resource not accessible by integration',
      documentation_url: 'https://docs.github.com/rest/issues/comments#create-an-issue-comment',
      status: '403',
    }),
  );
  assert.equal(described?.message, 'Resource not accessible by integration');
  assert.match(String(described?.documentationUrl), /^https:\/\/docs\.github\.com\//);
});

test('`errors[]` duoc giu — mot loi validation noi ro TRUONG nao hong', () => {
  const described = describeApiError(
    JSON.stringify({
      message: 'Validation Failed',
      errors: [{ resource: 'Label', code: 'invalid', field: 'name' }],
    }),
  );
  assert.equal(described?.message, 'Validation Failed');
  assert.deepEqual(described?.errors, [{ resource: 'Label', field: 'name', code: 'invalid' }]);
});

test('CHI bon truong tai lieu hoa cua `errors[]` di qua — khong `...entry`', () => {
  // Mot truong GitHub them sau nay khong duoc tu dong chay vao log cong khai.
  const described = describeApiError(
    JSON.stringify({
      message: 'Validation Failed',
      errors: [{ resource: 'Label', code: 'invalid', truong_moi_cua_github: 'chua ai xem xet' }],
    }),
  );
  const [first] = /** @type {Array<Record<string, unknown>>} */ (described?.errors ?? []);
  assert.deepEqual(Object.keys(first ?? {}).sort(), ['code', 'resource']);
});

test('KHONG RO BI MAT: mot token trong than bi cat truoc khi ve toi log', () => {
  const described = describeApiError(JSON.stringify({ message: `Bad credentials: ${FAKE_TOKEN}` }));
  const text = JSON.stringify(described);
  assert.ok(!text.includes(FAKE_TOKEN), 'token khong duoc con trong chan doan');
  assert.ok(text.includes(REDACTED), 'cho bi cat phai duoc danh dau, khong lang le bien mat');
  // Phan con lai cua cau van phai doc duoc — cat bi mat khong duoc bien thanh cat het.
  assert.match(String(described?.message), /^Bad credentials: /);
});

test('KHONG RO BI MAT: mau neo o TIEN TO nen mot SHA 40 ky tu van nguyen ven', () => {
  // Neu mau neo o "do hon loan" thay vi tien to, no se cat luon SHA — tuc cat dung thu moi chan
  // doan can nhat.
  const sha = 'c86219b22be19ce3db7a9753bd9866316b654cbe';
  const described = describeApiError(
    JSON.stringify({ message: `No commit found for SHA: ${sha}` }),
  );
  assert.ok(String(described?.message).includes(sha));
});

test('KHONG RO BI MAT: mot header bi doi nguoc vao than cung bi cat', () => {
  const described = describeApiError(`{"message":"upstream sent: Bearer ${FAKE_TOKEN}"}`);
  const text = JSON.stringify(described);
  assert.ok(!text.includes(FAKE_TOKEN));
  assert.ok(text.includes(REDACTED));
});

test('than KHONG phai JSON van cho mot chan doan — "khong doc duoc" cung la mot cau tra loi', () => {
  const described = describeApiError('<html><body>502 Bad Gateway</body></html>');
  assert.match(String(described?.raw), /502 Bad Gateway/);
});

test('than RONG tra ve `null` — "GitHub khong noi gi" khac "GitHub noi khong du quyen"', () => {
  assert.equal(describeApiError(''), null);
  assert.equal(describeApiError('   '), null);
  assert.equal(describeApiError(undefined), null);
});

test('mot than dai bi CAT — mot trang loi cua proxy khong duoc do het vao log', () => {
  const described = describeApiError(JSON.stringify({ message: 'x'.repeat(5_000) }));
  assert.ok(String(described?.message).length < 400, 'phai duoc cat ngan');
  assert.ok(String(described?.message).endsWith('...'), 'cho bi cat phai nhin ra duoc');
});

// ------------------------------------------------------------------------------------------------
// QUA CHINH `api()` — cho ma `main.mjs` va `preflight.mjs` thuc su goi.
// ------------------------------------------------------------------------------------------------

/**
 * Dung lai `globalThis.fetch` cho DUNG mot lan goi, roi tra lai nguyen trang.
 * @param {{ ok: boolean, status: number, text: string }} response
 * @param {() => Promise<any>} run
 */
async function withStubbedFetch(response, run) {
  const original = globalThis.fetch;
  globalThis.fetch = /** @type {any} */ (
    async () => ({ ok: response.ok, status: response.status, text: async () => response.text })
  );
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('REGRESSION: `api()` non-2xx mang CA status LAN cau cua GitHub', async () => {
  const result = await withStubbedFetch(
    {
      ok: false,
      status: 403,
      text: JSON.stringify({ message: 'Resource not accessible by integration' }),
    },
    () => api(FAKE_TOKEN, '/repos/o/r/issues/167/comments', { method: 'POST', body: '{}' }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403, 'status phai giu nguyen — bang chung cu van phai doc duoc');
  assert.equal(result.error?.message, 'Resource not accessible by integration');
  // `body` giu dung hop dong cu: chi parse khi 2xx. Duong chan doan la `error`, khong phai `body`.
  assert.equal(result.body, null);
});

test('REGRESSION: token KHONG bao gio nam trong ket qua cua `api()`', async () => {
  const result = await withStubbedFetch(
    { ok: false, status: 401, text: JSON.stringify({ message: `Bad credentials ${FAKE_TOKEN}` }) },
    () => api(FAKE_TOKEN, '/repos/o/r/pulls/167'),
  );
  assert.ok(
    !JSON.stringify(result).includes(FAKE_TOKEN),
    'ket qua cua `api()` di thang vao log — mot token o day la mot token cong khai',
  );
});

test('2xx thi `error` la `null` — khong bat nguoi doc phan biet bang mot object rong', async () => {
  const result = await withStubbedFetch(
    { ok: true, status: 201, text: JSON.stringify({ id: 5538400001 }) },
    () => api(FAKE_TOKEN, '/repos/o/r/issues/167/comments', { method: 'POST', body: '{}' }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
  assert.equal(result.body.id, 5538400001);
});

test('non-2xx voi than RONG: `error` la `null`, va `status` van la bang chung', async () => {
  const result = await withStubbedFetch({ ok: false, status: 404, text: '' }, () =>
    api(FAKE_TOKEN, '/repos/o/r/issues/167/labels/mot-nhan'),
  );
  assert.equal(result.status, 404);
  assert.equal(result.error, null);
});
