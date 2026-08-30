import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ALLOWLIST,
  VIOLATION_CODES,
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

/** Chi lay duong dan — phan lon cac bai chi quan tam "co bi chan khong", khong quan tam ma nao. */
const paths = (violations) => violations.map((row) => row.path);

test('tai lieu goc cua khach trong vung nguon goc thi bi chan', () => {
  const violations = findViolations([
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-khung.pdf',
    'docs/khach-hang/khach-tong-hop/nguon-goc/bang-gia-thang.xlsx',
    'docs/khach-hang/khach-tong-hop/trao-doi/anh-chup-don.heic',
    'docs/khach-hang/khach-tong-hop/nghiep-vu/ho-so.docx',
  ]);
  assert.deepEqual(paths(violations), [
    'docs/khach-hang/khach-tong-hop/nghiep-vu/ho-so.docx',
    'docs/khach-hang/khach-tong-hop/nguon-goc/bang-gia-thang.xlsx',
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-khung.pdf',
    'docs/khach-hang/khach-tong-hop/trao-doi/anh-chup-don.heic',
  ]);
});

test('vung lam viec rieng trong repo va thu muc nguon cua goi khach cung duoc canh', () => {
  assert.deepEqual(
    paths(
      findViolations([
        '.customer-sources/khach-tong-hop/khao-sat.docx',
        'tenants/khach-tong-hop/sources/bang-gia.pdf',
      ]),
    ),
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
    ]),
    [],
  );
});

/* ------------------------------------------------------------------ *
 * DINH DANG TAI LIEU GOC MA BAN TRUOC BO LOT
 * ------------------------------------------------------------------ */

/**
 * Theo `CLAUDE.md`, duoi 20% don hang Ultty vao he thong duoi dang ANH CHUP BANG. Tuc anh la mot
 * trong nhung dinh dang tai lieu goc pho bien nhat cua khach nay — va ban truoc cua cong nay cho
 * no di thang qua.
 */
test('anh chup cua khach bi chan — day la dinh dang tai lieu goc pho bien nhat cua Ultty', () => {
  assert.deepEqual(
    paths(
      findViolations([
        'docs/khach-hang/x/trao-doi/anh-chup-don-hang.jpg',
        'docs/khach-hang/x/trao-doi/bang-gia-chup-man.png',
        '.customer-sources/x/screenshot.jpeg',
        'tenants/x/sources/bang-ke.webp',
      ]),
    ),
    [
      '.customer-sources/x/screenshot.jpeg',
      'docs/khach-hang/x/trao-doi/anh-chup-don-hang.jpg',
      'docs/khach-hang/x/trao-doi/bang-gia-chup-man.png',
      'tenants/x/sources/bang-ke.webp',
    ],
  );
});

// Trong mot vung nguon goc cua khach, mot CSV gan nhu chac chan la ban xuat khach gui sang: thu
// chung ta trich xuat RA la `.md` va `.json`, khong phai `.csv`.
test('ban xuat CSV/TSV trong vung khach bi chan', () => {
  assert.deepEqual(
    paths(
      findViolations([
        'docs/khach-hang/x/nguon-goc/danh-sach-dai-ly.csv',
        'tenants/x/sources/ton-kho.tsv',
      ]),
    ),
    ['docs/khach-hang/x/nguon-goc/danh-sach-dai-ly.csv', 'tenants/x/sources/ton-kho.tsv'],
  );
  // Ngoai vung khach thi khong dinh — bang du lieu cua chinh chung ta van song binh thuong.
  assert.deepEqual(findViolations(['docs/phat-trien/so-lieu/benchmark.csv']), []);
});

/* ------------------------------------------------------------------ *
 * NGOAI LE PHAI CO BANG CHUNG DO DUOC
 * ------------------------------------------------------------------ */

test('ngoai le phai co ly do doc duoc, khong duoc de trong', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(
      entry.reason && entry.reason.trim().length > 40,
      `Ngoai le ${entry.pattern} thieu ly do`,
    );
    // "Da co tu truoc" khong phai mot ly do — ngoai le phai noi duoc vi sao tep KHONG phai cua khach.
    assert.doesNotMatch(entry.reason, /da co tu truoc|legacy|tam thoi/i);
  }
});

// Bai QUAN TRONG NHAT cua tep nay. Mot cau van xuoi khong phai bang chung: ngoai le `.xlsx` cu
// noi "khong co sharedStrings tuc khong co du lieu", va cau do SAI — tep chua ba ten dai ly va
// hai chat ID nhom, ghi duoi dang inlineStr.
test('moi ngoai le phai mang bang chung do duoc, khong chi mot cau van', () => {
  for (const entry of ALLOWLIST) {
    assert.ok(entry.evidence, `Ngoai le ${entry.pattern} khong co bang chung`);
    assert.ok(
      ['digest', 'sourceFile'].includes(entry.evidence.kind),
      `Ngoai le ${entry.pattern} mang loai bang chung khong kiem chung duoc`,
    );
    if (entry.evidence.kind === 'digest') {
      assert.match(entry.evidence.sha256, /^[0-9a-f]{64}$/, 'sha256 phai la 64 ky tu hex');
    }
  }
});

test('ngoai le chi mo dung tep no noi, khong mo ca thu muc', () => {
  // Ban giao do chung ta sinh ra, VA co nguon HTML tai sinh duoc: mo.
  assert.deepEqual(
    findViolations([
      'docs/khach-hang/x/ban-giao/01-nghiep-vu.pdf',
      'docs/khach-hang/x/ban-giao/nguon-html/01-nghiep-vu.html',
    ]),
    [],
  );
  // Nhung mot tai lieu goc cua khach nem vao CUNG thu muc do thi VAN chan.
  assert.deepEqual(paths(findViolations(['docs/khach-hang/x/ban-giao/hop-dong-khach-ky.docx'])), [
    'docs/khach-hang/x/ban-giao/hop-dong-khach-ky.docx',
  ]);
});

// Day la lo hong that su cua ngoai le "theo duong dan": mot PDF cua khach doi ten cho khop mau
// se di qua. Bay gio no phai co nguon HTML tai sinh duoc trong repo moi qua.
test('PDF trong thu muc ban-giao ma KHONG co nguon HTML thi van bi chan', () => {
  const violations = findViolations(['docs/khach-hang/x/ban-giao/hop-dong-khach-gui.pdf']);
  assert.deepEqual(paths(violations), ['docs/khach-hang/x/ban-giao/hop-dong-khach-gui.pdf']);
  assert.equal(violations[0].code, VIOLATION_CODES.SOURCE_FILE_MISSING);
});

test('ngoai le ghim hash: byte dung thi qua, byte khac thi chan', () => {
  const pinned = ALLOWLIST.find((entry) => entry.evidence?.kind === 'digest');
  const target = 'docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx';

  assert.deepEqual(findViolations([target], { digestOf: () => pinned.evidence.sha256 }), []);

  const drifted = findViolations([target], { digestOf: () => 'f'.repeat(64) });
  assert.equal(drifted.length, 1);
  assert.equal(drifted[0].code, VIOLATION_CODES.DIGEST_MISMATCH);
});

// FAIL CLOSED. Mot ngoai le khong kiem chung duoc va mot ngoai le sai la cung mot thu doi voi mot
// repo public — nen khong do duoc byte thi khong duoc cho qua.
test('ngoai le ghim hash ma khong do duoc byte thi KHONG duoc cho qua', () => {
  const target = 'docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx';

  const noResolver = findViolations([target]);
  assert.equal(noResolver.length, 1);
  assert.equal(noResolver[0].code, VIOLATION_CODES.EVIDENCE_UNVERIFIABLE);

  const resolverFails = findViolations([target], { digestOf: () => null });
  assert.equal(resolverFails.length, 1);
  assert.equal(resolverFails[0].code, VIOLATION_CODES.EVIDENCE_UNVERIFIABLE);
});

test('phan loai duong dan va duoi tep tach bach nhau', () => {
  assert.equal(isInCustomerSourceArea('docs/khach-hang/x/nguon-goc/a.md'), true);
  assert.equal(isInCustomerSourceArea('docs/kien-truc/a.pdf'), false);
  assert.equal(isRawArtifact('a.PDF'), true, 'duoi tep viet hoa van phai bat duoc');
  assert.equal(isRawArtifact('a.JPG'), true);
  assert.equal(isRawArtifact('a.md'), false);
});

/* ------------------------------------------------------------------ *
 * Doi chieu voi REPO THAT
 * ------------------------------------------------------------------ */

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

/** Do byte y het CLI: uu tien index, roi HEAD, cuoi cung moi den dia. */
const digestOf = (path) => {
  for (const ref of [`:${path}`, `HEAD:${path}`]) {
    try {
      const blob = execFileSync('git', ['show', ref], {
        encoding: 'buffer',
        maxBuffer: 256 * 1024 * 1024,
      });
      return createHash('sha256').update(blob).digest('hex');
    } catch {
      // Thu ref ke tiep.
    }
  }
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
};

// Bai nay la thu duy nhat trong tep noi ve HOM NAY. Cac bai tren chung minh quy tac dung; bai nay
// chung minh repo dang SACH theo quy tac do.
test('repo hien tai khong chua tai lieu goc nao cua khach', () => {
  assert.deepEqual(findViolations(tracked, { digestOf }), []);
});

// Doi chung chong bai test rong: neu quy tac bong bi noi long toi muc khong con chan gi, bai tren
// van xanh. Bai nay giu lai bang cach doi cong PHAI chan mot tep tong hop dat trong vung khach.
test('cong that su con chan — doi chung chong bai test rong', () => {
  const withPlant = [...tracked, 'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-gia-dinh.pdf'];
  assert.deepEqual(paths(findViolations(withPlant, { digestOf })), [
    'docs/khach-hang/khach-tong-hop/nguon-goc/hop-dong-gia-dinh.pdf',
  ]);
});

// Danh sach ngoai le no ra theo thoi gian cho toi luc khong ai dam sua. Bai nay giu no bang dung
// so tep no thuc su dang che.
test('khong con ngoai le nao da het tac dung', () => {
  assert.deepEqual(
    findStaleAllowlistEntries(tracked).map((entry) => String(entry.pattern)),
    [],
  );
});
