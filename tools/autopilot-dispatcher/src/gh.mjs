/**
 * Cong GitHub — DI RA, khong bao gio DI VAO.
 *
 * Dispatcher KHONG doc token. No goi `gh api`, va `gh` tu lay thong tin xac thuc tu keyring/cau
 * hinh cua nguoi dung. Nho vay khong co gia tri bi mat nao di qua bo nho tien trinh nay, khong co
 * gi de lo vao log, va khong co gi de ghi nham vao so cai. Doi lai: dispatcher chi lam duoc dung
 * nhung gi `gh` da duoc phep lam.
 *
 * `gh auth token` KHONG BAO GIO duoc goi — co mot bai test tinh khoa dieu do. Goi no la tu tay
 * keo bi mat vao vung nho cua minh de doi lay khong gi ca.
 */
import { REASONS, deny } from './errors.mjs';

/** Cac lenh phu cua `gh` bi cam tuyet doi trong package nay. */
export const FORBIDDEN_GH_SUBCOMMANDS = Object.freeze(['auth']);

/**
 * @param {{ exec: import('./exec.mjs').ExecFn, bin?: string, timeoutMs?: number }} deps
 */
export function createGh(deps) {
  const bin = deps.bin ?? 'gh';
  const timeoutMs = deps.timeoutMs ?? 60_000;

  /**
   * Goi mot duong dan REST. `path` do CHINH package nay dung, khong bao gio la mot chuoi den tu
   * GitHub — nguoi goi truyen vao cac manh da duoc kiem hinh dang.
   * @param {string} path
   * @param {{ paginate?: boolean }} [options]
   * @returns {Promise<{ ok: true, body: any } | import('./errors.mjs').Denied>}
   */
  async function api(path, options = {}) {
    const args = ['api', path, '-H', 'Accept: application/vnd.github+json'];
    if (options.paginate) args.push('--paginate', '--slurp');
    const result = await deps.exec(bin, args, { timeoutMs });
    if (!result.ok) {
      // Than loi cua `gh` co the chua ten repo/issue nhung khong chua bi mat; van khong dua vao
      // log — nguoi goi chi nhan MA, con chi tiet de nguoi doc tren man hinh khi go tay.
      return deny(REASONS.GITHUB_CALL_FAILED, {
        path,
        exitCode: result.code,
        errorCode: result.errorCode,
      });
    }
    if (result.stdout.trim() === '') return { ok: true, body: null };
    try {
      const body = JSON.parse(result.stdout);
      // `--slurp` gom moi trang thanh mang-cua-mang; lam phang de nguoi goi luon thay mot mang.
      if (options.paginate && Array.isArray(body)) return { ok: true, body: body.flat() };
      return { ok: true, body };
    } catch {
      return deny(REASONS.GITHUB_BAD_RESPONSE, { path });
    }
  }

  return { api, bin };
}

/** @typedef {ReturnType<typeof createGh>} GhClient */
