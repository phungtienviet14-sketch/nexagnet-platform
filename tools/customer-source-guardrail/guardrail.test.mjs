import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import {
  ALLOWLIST,
  findStaleAllowlistEntries,
  findViolations,
  isInCustomerSourceArea,
  isRawArtifact,
} from './guardrail.mjs';

/**
 * Bo test cua hop dong NO_RAW_CUSTOMER_ARTIFACT_IN_GIT.
 *
 * Moi bai deu chay tren duong dan TONG HOP. Khong bai nao tao mot tai lieu khach that de chung
 * minh rang tai lieu khach that bi chan — do se la chinh cai viec ma cong nay sinh ra de cam.
 */

test('tai lieu goc cua khach trong vung nguon goc thi bi chan', () => {
  const violations = findViolations([
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-khung.pdf',
    'docs/khach-hang/khach-tong-hop/nguon-goc/bang-gia-thang.xlsx',
    'docs/khach-hang/khach-tong-hop/trao-doi/anh-chup-don.heic',
    'docs/khach-hang/khach-tong-hop/nghiep-vu/ho-so.docx',
  ]);
  assert.deepEqual(violations, [
    'docs/khach-hang/khach-tong-hop/nghiep-vu/ho-so.docx',
    'docs/khach-hang/khach-tong-hop/nguon-goc/bang-gia-thang.xlsx',
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-khung.pdf',
    'docs/khach-hang/khach-tong-hop/trao-doi/anh-chup-don.heic',
  ]);
});

test('vung lam viec rieng trong repo va thu muc nguon cua goi khach cung duoc canh', () => {
  assert.deepEqual(
    findViolations([
      '.customer-sources/khach-tong-hop/khao-sat.docx',
      'tenants/khach-tong-hop/sources/bang-gia.pdf',
    ]),
    [
      '.customer-sources/khach-tong-hop/khao-sat.docx',
      'tenants/khach-tong-hop/sources/bang-gia.pdf',
    ],
  );
});

// KHONG BAO DONG GIA. Mot cong keu oan la mot cong se bi tat.
test('tai san hop le cua repo khong bi bao nham', () => {
  assert.deepEqual(
    findViolations([
      'apps/web/public/netviet-logo.png',
      'apps/api/src/source-registry/source-lifecycle.ts',
      'docs/kien-truc/he-thong.md',
      'docs/khach-hang/khach-tong-hop/nghiep-vu/mo-ta-nghiep-vu.md',
      'docs/khach-hang/khach-tong-hop/nguon-goc/de-xuat-giai-phap.md',
      'tools/excel-template/generate_a4_template.py',
      'pnpm-lock.yaml',
    ]),
    [],
  );
});

// Ranh gioi duong dan: MOT tep nhi phan y het nhau, o hai cho khac nhau, cho ra hai ket qua khac
// nhau. Do dung la y nghia cua "quy tac theo duong dan" o muc 9 cua hop dong nhiem vu.
test('cung mot duoi tep: trong vung khach thi chan, ngoai vung thi khong', () => {
  assert.equal(findViolations(['docs/khach-hang/x/nguon-goc/a.pdf']).length, 1);
  assert.equal(findViolations(['docs/kien-truc/so-do.pdf']).length, 0);
  assert.equal(findViolations(['tools/poc-observability/mau.pdf']).length, 0);
});

test('dinh dang chung ta TRICH XUAT RA thi khong bi chan', () => {
  assert.deepEqual(
    findViolations([
      'docs/khach-hang/x/nguon-goc/trich-xuat.md',
      'docs/khach-hang/x/nguon-goc/su-that.json',
      'docs/khach-hang/x/nguon-goc/bang.csv',
    ]),
    [],
  );
});

test('ngoai le phai co ly do doc duoc, khong duoc de trong', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(entry.reason && entry.reason.trim().length > 40, `Ngoai le ${entry.pattern} thieu ly do`);
    // "Da co tu truoc" khong phai mot ly do — ngoai le phai noi duoc vi sao tep KHONG phai cua khach.
    assert.doesNotMatch(entry.reason, /da co tu truoc|legacy|tam thoi/i);
  }
});

test('ngoai le chi mo dung tep no noi, khong mo ca thu muc', () => {
  // Ban giao do chung ta sinh ra: mo.
  assert.deepEqual(findViolations(['docs/khach-hang/x/ban-giao/01-nghiep-vu.pdf']), []);
  // Nhung mot tai lieu goc cua khach nem vao CUNG thu muc do thi VAN chan.
  assert.deepEqual(findViolations(['docs/khach-hang/x/ban-giao/hop-dong-khach-ky.docx']), [
    'docs/khach-hang/x/ban-giao/hop-dong-khach-ky.docx',
  ]);
});

test('phan loai duong dan va duoi tep tach bach nhau', () => {
  assert.equal(isInCustomerSourceArea('docs/khach-hang/x/nguon-goc/a.md'), true);
  assert.equal(isInCustomerSourceArea('docs/kien-truc/a.pdf'), false);
  assert.equal(isRawArtifact('a.PDF'), true, 'duoi tep viet hoa van phai bat duoc');
  assert.equal(isRawArtifact('a.md'), false);
});

/* ------------------------------------------------------------------ *
 * Doi chieu voi REPO THAT
 * ------------------------------------------------------------------ */

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

// Bai nay la thu duy nhat trong tep noi ve HOM NAY. Cac bai tren chung minh quy tac dung; bai nay
// chung minh repo dang SACH theo quy tac do.
test('repo hien tai khong chua tai lieu goc nao cua khach', () => {
  assert.deepEqual(findViolations(tracked), []);
});

// Danh sach ngoai le no ra theo thoi gian cho toi luc khong ai dam sua. Bai nay giu no bang dung
// so tep no thuc su dang che.
test('khong con ngoai le nao da het tac dung', () => {
  assert.deepEqual(
    findStaleAllowlistEntries(tracked).map((entry) => String(entry.pattern)),
    [],
  );
});
