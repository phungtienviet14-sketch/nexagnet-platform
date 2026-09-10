/**
 * HOP DONG BANG CHUNG — bien "toi co doc nguon" thanh mot thu KIEM DUOC.
 *
 * §3 cua hop dong task #194 doi moi khang dinh quan trong ve gh-aw phai co permalink GHIM SHA, khong
 * phai `duong-dan:dong` chep tay. Khac biet khong phai hinh thuc: mot `duong-dan:dong` khong the
 * kiem tu dong, va no im lang tro thanh SAI ngay khi upstream chen mot dong — gh-aw phat hanh ~17
 * ban trong 30 ngay.
 *
 * Nen danh sach khang dinh nam o `evidence-claims.json` (dau vao do nguoi viet), con tep nay lam hai
 * viec, va CA HAI deu that bai to neu co gi sai:
 *
 *   1. Doi soat: `anchor` phai con nam DUNG tai `line` trong ban clone tai SHA da ghim.
 *   2. Dung permalink tu chinh SHA do, de bao cao khong the tro vao `main` troi.
 *
 * Bai kiem `tests/evidence-contract.test.mjs` khep vong con lai: bao cao phai CHUA du moi permalink.
 * Ba manh do ghep lai thanh mot bat bien — bao cao khong mat bang chung duoc, va bang chung khong
 * troi khoi upstream duoc — ma khong ai phai nho kiem tay.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Danh sach khang dinh do nguoi viet — dau vao, khong phai ket qua dan xuat. */
export function readClaims() {
  return JSON.parse(readFileSync(join(here, '..', 'evidence-claims.json'), 'utf8')).claims;
}

/**
 * Doi soat tung khang dinh voi ban clone, roi tra ve chi muc permalink.
 *
 * @param {string} repoRoot Goc ban clone gh-aw tai SHA da ghim.
 * @param {string} auditedSha SHA da ghim — cung la SHA di vao permalink.
 * @throws khi mot `anchor` khong con nam dung tai `line`: bang chung sai thi phai DUNG LAI, khong
 *   duoc am tham sinh ra mot chi muc tro vao dong khac.
 */
export function buildEvidenceIndex(repoRoot, auditedSha) {
  const base = `https://github.com/github/gh-aw/blob/${auditedSha}`;
  /** @type {string[]} */
  const broken = [];

  const claims = readClaims().map((claim) => {
    const lines = readFileSync(join(repoRoot, claim.path), 'utf8').split('\n');
    const actual = lines[claim.line - 1];
    if (typeof actual !== 'string' || !actual.includes(claim.anchor)) {
      broken.push(`${claim.id}: ${claim.path}:${claim.line} khong con chua \`${claim.anchor}\``);
    }
    return {
      id: claim.id,
      area: claim.area,
      line: claim.line,
      permalink: `${base}/${claim.path}#L${claim.line}`,
    };
  });

  if (broken.length > 0) {
    throw new Error(`Bang chung da troi khoi upstream:\n  ${broken.join('\n  ')}`);
  }

  return { claims };
}
