/**
 * NO_RAW_CUSTOMER_ARTIFACT_IN_GIT — hop dong repo.
 *
 * `nexagnet-platform` la repo PUBLIC. Mot tai lieu goc cua khach dua vao day la CONG BO no ra
 * ngoai, va git khong quen: xoa o ban sau khong go duoc ban da day len. Vi the cong nay chan o
 * luc THEM, khong phai luc phat hien.
 *
 * KHONG phai mot san pham DLP. No khong doc noi dung, khong doan nhay cam. No thi hanh dung mot
 * cau: **byte goc cua khach song trong kho rieng, repo chi giu SHA-256 va metadata** — dung giao
 * thuc o `docs/phat-trien/van-hanh/nguon-khach-hang.md`.
 *
 * VI SAO KHONG CAM MU MOT LOAT DUOI FILE. Mot lenh cam `*.pdf` toan repo se do ngay o ba tep ban
 * giao do CHINH CHUNG TA sinh ra tu `ban-giao/nguon-html/` — va cach duy nhat di tiep se la tat
 * cong di. Mot cong bi tat thi khong bao ve gi ca. Nen quy tac o day di theo DUONG DAN, va moi
 * ngoai le deu phai mang mot LY DO doc duoc.
 */

/**
 * Vung chua NGUON GOC cua khach. Trong nhung thu muc nay, mot tep nhi phan mac dinh la tai lieu
 * cua khach cho den khi co nguoi noi nguoc lai.
 */
export const CUSTOMER_SOURCE_AREAS = [
  /^docs\/khach-hang\/[^/]+\//,
  /^\.customer-sources\//,
  /^tenants\/[^/]+\/sources\//,
];

/**
 * Duoi tep cua tai lieu goc. Danh sach nay co y NGAN va chi gom thu ma khach that su gui sang —
 * khong gom `.md`/`.json`/`.csv` vi do la dinh dang chung ta trich xuat RA, va chan chung se chan
 * chinh cai viec ma tang nguon su that sinh ra de lam.
 */
export const RAW_ARTIFACT_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'xlsm',
  'ppt',
  'pptx',
  'heic',
  'mov',
  'mp4',
  'zip',
  'rar',
  '7z',
  'msg',
  'eml',
];

/**
 * NGOAI LE — moi dong phai co LY DO, va ly do phai noi duoc vi sao tep nay KHONG phai tai lieu
 * goc cua khach. "Da co tu truoc" khong phai mot ly do.
 */
export const ALLOWLIST = [
  {
    pattern: /^docs\/khach-hang\/[^/]+\/ban-giao\/[^/]+\.pdf$/,
    reason:
      'Ban giao do CHINH CHUNG TA soan va sinh ra tu ban-giao/nguon-html/ — dau ra gui cho khach, khong phai tai lieu goc khach gui sang. Tai sinh duoc tu HTML trong repo.',
  },
  {
    pattern: /^docs\/khach-hang\/ultty\/trao-doi\/a4-dai-ly-map-nhom-ultty\.xlsx$/,
    reason:
      'Bieu mau A4 RONG do tools/excel-template/generate_a4_template.py sinh ra de khach dien — do duoc: khong co sharedStrings, tuc khong chua mot o du lieu nao.',
  },
];

const extensionOf = (path) => {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
};

export const isInCustomerSourceArea = (path) =>
  CUSTOMER_SOURCE_AREAS.some((area) => area.test(path));

export const isRawArtifact = (path) => RAW_ARTIFACT_EXTENSIONS.includes(extensionOf(path));

export const allowlistEntryFor = (path) =>
  ALLOWLIST.find((entry) => entry.pattern.test(path)) ?? null;

/**
 * Ham THUAN: nhan danh sach duong dan (da chuan hoa dau `/`), tra ve cac vi pham.
 *
 * Tach khoi git de bai test dua vao duoc duong dan TONG HOP — khong bai test nao duoc phep tao
 * mot tep khach that de chung minh rang tep khach that bi chan.
 */
export function findViolations(paths) {
  return paths
    .filter((path) => isInCustomerSourceArea(path) && isRawArtifact(path))
    .filter((path) => allowlistEntryFor(path) === null)
    .sort();
}

/**
 * Ngoai le da het tac dung (tep khong con) — mot dang ro ri nguoc: danh sach ngoai le no ra theo
 * thoi gian cho toi luc khong ai dam sua no nua.
 */
export function findStaleAllowlistEntries(paths) {
  return ALLOWLIST.filter((entry) => !paths.some((path) => entry.pattern.test(path)));
}

export function formatReport(violations) {
  if (violations.length === 0) return 'NO_RAW_CUSTOMER_ARTIFACT_IN_GIT: dat.';
  const lines = [
    `NO_RAW_CUSTOMER_ARTIFACT_IN_GIT: ${violations.length} tep nguon goc cua khach dang nam trong git.`,
    '',
    'Repo nay PUBLIC. Git khong quen: xoa o ban sau khong go duoc ban da day len.',
    '',
    ...violations.map((path) => `  · ${path}`),
    '',
    'Cach xu ly (docs/phat-trien/van-hanh/nguon-khach-hang.md):',
    '  1. chuyen tep sang kho rieng NGOAI repo;',
    '  2. do SHA-256 va dang ky mot BusinessSource tro toi do;',
    '  3. git rm --cached tep, them dong .gitignore TRUOC khi commit lai;',
    '  4. neu tep that su la dau ra cua chung ta, them mot dong ALLOWLIST kem LY DO.',
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { execFileSync } = await import('node:child_process');
  // `git ls-files` luon in dau `/`, ke ca tren Windows — nen khong phai chuan hoa gi them.
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const violations = findViolations(tracked);
  const stale = findStaleAllowlistEntries(tracked);

  console.log(formatReport(violations));
  for (const entry of stale) {
    console.log(`CANH BAO: ngoai le khong con khop tep nao — ${entry.pattern}`);
  }
  process.exit(violations.length === 0 ? 0 : 1);
}
