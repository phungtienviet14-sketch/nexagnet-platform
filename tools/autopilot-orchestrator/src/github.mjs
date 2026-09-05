/**
 * NOI DUY NHAT GOI MANG. Moi tep khac trong package nay la ham thuan.
 *
 * Tach ra khoi `main.mjs` vi co HAI entrypoint can dung chung dung mot client va dung mot bo
 * header: `main.mjs` (chay giao thuc) va `preflight.mjs` (do quyen cua token). Neu preflight tu
 * goi fetch theo cach rieng thi no do mot thu khac voi thu that su chay — va mot bang chung nhu
 * vay khong chung minh gi.
 *
 * `api()` KHONG nem khi HTTP loi. No tra ve `status` de nguoi goi phan biet duoc 403 (thieu quyen)
 * voi 404/200-rong (thieu du lieu) — dung phan biet ma blocker B1 cua PR #167 doi hoi.
 */

export const GITHUB_API = 'https://api.github.com';

/**
 * @typedef {object} ApiResult
 * @property {boolean} ok
 * @property {number} status
 * @property {any} body Than da parse khi 2xx va co noi dung; `null` neu khong.
 */

/**
 * @param {string} token
 * @param {string} path Duong dan tuyet doi bat dau bang `/`, vi du `/repos/o/r/pulls/1`.
 * @param {RequestInit} [init]
 * @returns {Promise<ApiResult>}
 */
export async function api(token, path, init) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: response.ok && text.length > 0 ? JSON.parse(text) : null,
  };
}
