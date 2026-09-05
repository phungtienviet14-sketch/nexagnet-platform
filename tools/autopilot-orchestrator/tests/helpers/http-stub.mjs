/**
 * THAY `globalThis.fetch` BANG MOT BANG TUYEN DUONG — nap qua `--import` truoc khi `main.mjs` chay.
 *
 * VI SAO PHAI LA MOT TIEN TRINH THAT
 *
 * Blocker B5 cua PR #167 khong nam trong mot ham. No nam o THU TU cua ba viec trong `main.mjs`:
 * dang comment, doi nhan, va cong chong trung cua LAN CHAY SAU. Mot bai test goi thang
 * `reconcileLabels` khong bao gio cham vao cai hong do, y het nhu B3: ham thi dung, cho noi hai
 * thu moi sai. Nen bai kiem phai chay chinh entrypoint, hai lan, voi so ledger cua lan hai mang
 * ket qua cua lan mot.
 *
 * `tests/fail-closed.test.mjs` chay duoc offline vi ca hai duong no do deu ket thuc TRUOC loi goi
 * mang dau tien. Duong cua B5 thi nguoc lai — no la phan SAU cung. Nen o day mang duoc dung lai
 * bang mot bang tuyen duong doc tu tep, thay vi bang mot token rac.
 *
 * Tep nay KHONG phai bai kiem (`tests/*.test.mjs` khong khop `tests/helpers/`); no la do nghe.
 *
 *   AUTOPILOT_TEST_ROUTES — tep JSON: [{ method, path (nguon regex), status, body? }]
 *                           Khop DAU TIEN thang. Khong khop nao => HTTP 599, de mot duong dan
 *                           viet sai lo ra thanh mot lan do, khong thanh mot 200 im lang.
 *   AUTOPILOT_TEST_CALLS  — tep JSONL ghi lai TUNG loi goi, ke ca than cua loi goi ghi.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const GITHUB_API = 'https://api.github.com';

const routesPath = String(process.env.AUTOPILOT_TEST_ROUTES ?? '');
const callsPath = String(process.env.AUTOPILOT_TEST_CALLS ?? '');

/** @type {Array<{ method: string, path: string, status: number, body?: unknown }>} */
const routes = JSON.parse(readFileSync(routesPath, 'utf8'));

globalThis.fetch = /** @type {any} */ (
  /**
   * @param {any} input
   * @param {any} [init]
   */
  async (input, init) => {
    const raw = String(input);
    const path = raw.startsWith(GITHUB_API) ? raw.slice(GITHUB_API.length) : raw;
    const method = String(init?.method ?? 'GET').toUpperCase();

    const matched = routes.find(
      (route) => route.method === method && new RegExp(route.path).test(path),
    );
    const status = matched ? matched.status : 599;
    // THAN DUOC PHUC VU CA KHI NON-2XX (Issue #188). GitHub tra ve mot than co noi dung khi hong
    // ("Resource not accessible by integration"), va tu #188 thi `github.mjs` giu lai than do. Mot
    // do nghe chi phuc vu than khi 2xx se lam duong chan doan ay KHONG DO DUOC — bai kiem se thay
    // mot `error: null` sach se va tuong la dung.
    const text = matched && matched.body !== undefined ? JSON.stringify(matched.body) : '';

    appendFileSync(
      callsPath,
      `${JSON.stringify({
        method,
        path,
        status,
        matched: Boolean(matched),
        body: typeof init?.body === 'string' ? init.body : null,
      })}\n`,
      'utf8',
    );

    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  }
);
