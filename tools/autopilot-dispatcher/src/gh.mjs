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

  /**
   * Truy van GraphQL. Ton tai vi REST KHONG noi duoc "than Issue sua lan cuoi luc nao" — no chi co
   * `updated_at`, ma truong do nhay ca khi ai do binh luan hay gan nhan, nen dung no lam bang
   * chung se tu choi nham gan nhu moi task. `Issue.lastEditedAt` cua GraphQL la dung thu can.
   *
   * Bien chi nhan gia tri do CAU HINH CUC BO va so nguyen da kiem sinh ra — khong bao gio la mot
   * chuoi den tu GitHub. Va vi di qua `execFile` voi mang argv, chung khong the tro thanh cu phap.
   * @param {string} query
   * @param {Record<string, string | number>} variables
   * @returns {Promise<{ ok: true, data: any } | import('./errors.mjs').Denied>}
   */
  async function graphql(query, variables) {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    for (const [key, value] of Object.entries(variables)) {
      // `-F` de GraphQL nhan Int/Boolean dung kieu; `-f` giu nguyen chuoi.
      args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${value}`);
    }
    const result = await deps.exec(bin, args, { timeoutMs });
    if (!result.ok) {
      return deny(REASONS.GITHUB_CALL_FAILED, {
        path: 'graphql',
        exitCode: result.code,
        errorCode: result.errorCode,
      });
    }
    try {
      const body = JSON.parse(result.stdout);
      // GraphQL tra 200 kem `errors` — mot loi 200 van la mot loi, khong phai du lieu.
      if (body?.errors) return deny(REASONS.GITHUB_BAD_RESPONSE, { path: 'graphql' });
      return { ok: /** @type {const} */ (true), data: body?.data ?? null };
    } catch {
      return deny(REASONS.GITHUB_BAD_RESPONSE, { path: 'graphql' });
    }
  }

  return { api, graphql, bin };
}

/** @typedef {ReturnType<typeof createGh>} GhClient */
