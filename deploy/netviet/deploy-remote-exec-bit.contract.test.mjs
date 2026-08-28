import { deepStrictEqual, ok } from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * MOI SCRIPT CHUYEN LEN VM PHAI CHAY DUOC.
 *
 * ==============================================================================================
 * VI SAO BAI NAY TON TAI (28/08/2026, run 33146330839):
 *
 * `core.filemode=false` tren may Windows, nen git luu MOI tep `.sh` cua repo o `100644`. Khong
 * tep nao mang bit thuc thi qua duong truyen. `deploy-remote.sh` cap lai no o DUNG MOT dong:
 *
 *     chmod 0750 "$app_dir/"*.sh "$app_dir/postgres/"*.sh "$app_dir/observability/"*.sh
 *
 * Dong do liet ke thu muc TUONG MINH. Them mot thu muc script moi ma quen no thi script van
 * duoc rsync len — no ton tai, doc duoc, dung noi dung — nhung khong chay duoc.
 *
 * DIEU KHIEN NO KHO CHAN DOAN: bash tra ma `126`, thong bao la `Permission denied`. Khong ai doc
 * ra tu do rang "thieu mot duong dan trong `deploy-remote.sh`" — nguoi ta se di tim quyen tren
 * VM, tim SELinux, tim mount `noexec`.
 *
 * VA NO HONG SOM: `render-secrets.sh` chet TRUOC khi tang deploy phat mot tin hieu nao, nen bon
 * tin hieu deu `NOT_REACHED` va phan loai ra `DEPLOY_SIGNAL_INCOMPLETE` — mot lan deploy do ma
 * KHONG chi duoc vao tang nao hong.
 *
 * Bai nay bien "phai nho them vao danh sach" thanh mau do.
 *
 * ==============================================================================================
 * TIEN DE: `deploy-remote.sh` chay
 *
 *     rsync -a --exclude '.runtime' --exclude 'tenant-pack' "$source_dir/" "$app_dir/"
 *
 * tuc CA cay `deploy/netviet/` duoc anh xa 1:1 sang `$app_dir`. Nen tap `.sh` trong repo chinh la
 * tap `.sh` tren VM, va bai nay so sanh duoc hai ben.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DEPLOY_REMOTE = resolve(HERE, 'deploy-remote.sh');

/** Windows tra `a\b`; hop dong duoi day viet bang `/`. */
function toPosix(path) {
  return path.split(sep).join('/');
}

/** Moi `.sh` duoi `deploy/netviet/`, duong dan tuong doi so voi thu muc do. */
function shellScripts(dir = HERE) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      found.push(...shellScripts(full));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      found.push(toPosix(relative(HERE, full)));
    }
  }
  return found;
}

/**
 * Doc dong `chmod 0750 ...` va tra ve tap TIEN TO THU MUC ma no phu.
 * `"$app_dir/"*.sh` -> `''` · `"$app_dir/postgres/"*.sh` -> `'postgres/'`
 */
function coveredPrefixes() {
  const source = readFileSync(DEPLOY_REMOTE, 'utf8');
  const line = source.split('\n').find((candidate) => /^chmod\s+0750\s/.test(candidate.trim()));
  ok(line, 'khong tim thay dong `chmod 0750 ...` trong deploy-remote.sh');

  const prefixes = new Set();
  for (const match of line.matchAll(/"\$app_dir\/([^"]*)"\*\.sh/g)) {
    prefixes.add(match[1] ?? '');
  }
  return { line, prefixes };
}

describe('deploy-remote.sh cap quyen chay cho MOI script da chuyen len', () => {
  const { line, prefixes } = coveredPrefixes();
  const scripts = shellScripts();

  it('tim duoc it nhat mot script va mot tien to — bai khong duoc rong', () => {
    // Neu hai phep doc o tren im lang tra ve rong thi bai duoi xanh ma khong chung minh gi.
    ok(scripts.length > 5, `chi thay ${scripts.length} script, nghi ngo phep quet hong`);
    ok(prefixes.size > 0, `khong boc tach duoc tien to nao tu: ${line}`);
  });

  it('moi thu muc chua `.sh` deu nam trong tam phu cua dong `chmod`', () => {
    const uncovered = scripts.filter((script) => {
      const index = script.lastIndexOf('/');
      const dir = index === -1 ? '' : script.slice(0, index + 1);
      return !prefixes.has(dir);
    });

    deepStrictEqual(
      uncovered,
      [],
      'Cac script nay se len VM o che do 0644 va bash se tra 126 Permission denied.\n' +
        `Them thu muc cua chung vao dong chmod trong deploy-remote.sh:\n  ${line.trim()}`,
    );
  });
});
