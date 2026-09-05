/**
 * Liet ke MA NGUON DUOC GIAO — tuc moi thu chay that, va khong gom bo kiem.
 *
 * Danh sach thu muc o day la mot phan cua hop dong: them mot thu muc ma nguon moi ma quen them
 * vao day se lam moi bai kiem hop dong tinh im lang bo qua no. Nen co bai kiem doi chieu danh
 * sach nay voi nhung gi that su nam trong goi.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Thu muc chua ma nguon duoc giao. `tests/` CO Y khong nam trong day. */
export const SHIPPED_DIRS = Object.freeze(['protocol', 'native-host', 'extension', 'install']);

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** @returns {Array<{ path: string, text: string }>} */
export function shippedSources() {
  return SHIPPED_DIRS.flatMap((dir) =>
    walk(join(PACKAGE_ROOT, dir)).map((path) => ({
      path: relative(PACKAGE_ROOT, path).split(sep).join('/'),
      text: readFileSync(path, 'utf8'),
    })),
  );
}

/**
 * Quet mot tap tep theo mot bang cam. Tra ve MOI vi pham, khong dung o cai dau — mot bao cao chi
 * co mot dong lam nguoi sua tuong nhu chi con mot cho, roi vong lai lan nua.
 * @param {Array<{ path: string, text: string }>} sources
 * @param {ReadonlyArray<{ needle: string, why: string }>} banned
 * @returns {Array<{ path: string, line: number, needle: string, why: string }>}
 */
export function scanForBanned(sources, banned) {
  /** @type {Array<{ path: string, line: number, needle: string, why: string }>} */
  const hits = [];
  for (const source of sources) {
    const lines = source.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of banned) {
        if (line.includes(rule.needle)) {
          hits.push({ path: source.path, line: index + 1, needle: rule.needle, why: rule.why });
        }
      }
    });
  }
  return hits;
}
