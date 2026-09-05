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
 *
 * VA NO GIU LAI CAU TRA LOI CUA GITHUB KHI HONG.
 *
 * Ban truoc VUT than khi non-2xx, nen mot `403` ve toi log duoi dang dung mot con so. Lan chay that
 * `33889198070` dung o do: `COMMENT_POST_FAILED status=403`, khong mot chu giai thich. Cau
 * "Resource not accessible by integration" nam trong than va bi bo di truoc khi ai kip doc — nen
 * viec phan biet "thieu quyen" voi "PR bi khoa" phai lam bang cac phep do rieng ben ngoai.
 *
 * Than duoc LAM SACH truoc khi tra ve (`api-error.mjs`): log cua Actions la CONG KHAI tren mot repo
 * public. Khong mot header nao di qua duong nay.
 */
import { describeApiError } from './api-error.mjs';

export const GITHUB_API = 'https://api.github.com';

/**
 * @typedef {object} ApiResult
 * @property {boolean} ok
 * @property {number} status
 * @property {any} body Than da parse khi 2xx va co noi dung; `null` neu khong.
 * @property {Record<string, unknown> | null} error Chan doan DA LAM SACH khi non-2xx. `null` khi
 *   2xx, va cung `null` khi GitHub tra ve mot than rong — hai truong hop do phan biet bang `ok`.
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
    error: response.ok ? null : describeApiError(text),
  };
}
