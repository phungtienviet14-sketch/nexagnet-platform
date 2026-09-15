/**
 * NOI DUY NHAT TRONG PACKAGE NAY DUOC PHONG TIEN TRINH.
 *
 * Mot rang buoc, khong co ngoai le: `shell` KHONG BAO GIO duoc bat. Doi so di vao duoi dang MANG
 * argv, nen mot chuoi chua dau cham phay, dau ong, dau ngoac dola, dau huyen, hai dau va, xuong
 * dong hay cu phap PowerShell chi la MOT phan tu argv — la DU LIEU. Khong co lop nao ben duoi doc
 * lai no nhu cu phap. Day la ranh gioi giua "GitHub anh huong duoc prompt" va "GitHub chay duoc
 * lenh tren may nguoi dung", nen no nam RIENG mot tep, de mot lan grep doc het duoc.
 *
 * `execFile` (khong phai `exec`) va `spawn` voi mang doi so la hai loi vao duy nhat. Dang nhan
 * chuoi lenh cua `exec`/`execSync`, va `shell: true`, khong xuat hien o dau trong package.
 */
import { execFile as execFileCb, spawn as nodeSpawn } from 'node:child_process';

/**
 * @typedef {object} ExecResult
 * @property {boolean} ok
 * @property {number | null} code
 * @property {string | null} signal
 * @property {string} stdout
 * @property {string} stderr
 * @property {string | null} errorCode `ENOENT` khi khong tim thay executable, ...
 */

/**
 * Chay mot lenh doc-va-tra-ve. Khong ke thua stdio, khong shell.
 * @param {string} file
 * @param {ReadonlyArray<string>} args
 * @param {{ cwd?: string, timeoutMs?: number, maxBuffer?: number, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<ExecResult>}
 */
export function execFile(file, args, options = {}) {
  return new Promise((resolve) => {
    execFileCb(
      file,
      [...args],
      {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? 120_000,
        maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
        shell: false,
        ...(options.env ? { env: options.env } : {}),
      },
      (error, stdout, stderr) => {
        const err = /** @type {(Error & { code?: number | string, signal?: string }) | null} */ (
          error
        );
        const numericCode = typeof err?.code === 'number' ? err.code : err ? null : 0;
        resolve({
          ok: !err,
          code: numericCode,
          signal: err?.signal ?? null,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          errorCode: typeof err?.code === 'string' ? err.code : null,
        });
      },
    );
  });
}

/**
 * Phong mot tien trinh chay lau, co stdin. Tra ve doi tuong con cua Node de nguoi goi tu quan ly
 * vong doi (timeout, kill) — `claude-launcher.mjs` la nguoi goi duy nhat.
 * @param {string} file
 * @param {ReadonlyArray<string>} args
 * @param {{ cwd: string, env?: NodeJS.ProcessEnv }} options
 */
export function spawnProcess(file, args, options) {
  return nodeSpawn(file, [...args], {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
    ...(options.env ? { env: options.env } : {}),
  });
}

/** @typedef {typeof execFile} ExecFn */
/** @typedef {typeof spawnProcess} SpawnFn */
