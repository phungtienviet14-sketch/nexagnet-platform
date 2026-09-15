/**
 * NOI DUY NHAT CHAM VAO MANG — va no chi DOC, chi RA.
 *
 * Ba tinh chat cua tep nay la mot phan cua hop dong an toan, khong phai chi tiet cai dat:
 *
 *   1. KHONG CO MAY CHU. Khong module socket cap thap, khong may chu HTTP/TLS/UDP, khong loi goi
 *      nao bat dau lang nghe. Cau noi khong bao gio mo mot cong VAO tren may nguoi dung (#204 §1.3).
 *      `tests/native-host.test.mjs` khoa dieu do bang ca mot bo quet van ban lan mot lan hoi Node
 *      xem no dang giu tai nguyen nao sau khi da chay tron mot vong poll.
 *   2. KHONG CHAM VAO TOKEN. O che do `gh-cli`, ta chay `gh api` nhu mot tien trinh con va doc
 *      stdout cua no. Token nam trong kho thong tin dang nhap cua `gh`; tien trinh nay khong doc,
 *      khong ghi, khong in no. O che do `unauthenticated` khong co token nao ton tai.
 *   3. KHONG TRA THAN LOI THO. Khi HTTP that bai, ta giu `status` va vut than di. Than mot loi
 *      GitHub co the mang tieu de, doan van ban cua comment, hay chi tiet ha tang; §11 cam ghi
 *      chung ra log, va cach chac chan nhat de khong ghi la khong bao gio cam no.
 *
 * Duong dan bi rang buoc vao DUNG kho da cau hinh. Neu mot ban sua tuong lai ghep duong dan tu
 * du lieu khong tin cay, `assertRepoScopedPath` chan tai day chu khong de no thanh mot lan goi
 * ra ngoai pham vi.
 */
import { execFile } from 'node:child_process';

export const GITHUB_API = 'https://api.github.com';

/** Tran so comment doc mot lan. Che do khong dang nhap chi co 60 lan goi/gio. */
export const MAX_COMMENTS_PER_POLL = 50;

/**
 * @typedef {{ ok: boolean, status: number, body: unknown }} ApiResult
 * @typedef {(path: string) => Promise<ApiResult>} ApiReader
 */

/**
 * @param {string} repo
 * @param {string} path
 */
function assertRepoScopedPath(repo, path) {
  const prefix = `/repos/${repo}/`;
  if (typeof path !== 'string' || !path.startsWith(prefix)) {
    throw new Error('Duong dan GitHub nam ngoai pham vi kho da cau hinh');
  }
  if (path.includes('..')) throw new Error('Duong dan GitHub chua doan di len');
}

/**
 * Doc qua `gh api` — muon xac thuc cuc bo cua nguoi dung ma khong bao gio nhin thay token.
 * @param {{ repo: string, run?: typeof execFile }} options
 * @returns {ApiReader}
 */
export function ghCliReader({ repo, run = execFile }) {
  return (path) =>
    new Promise((resolve) => {
      assertRepoScopedPath(repo, path);
      run(
        'gh',
        ['api', '--method', 'GET', '--header', 'Accept: application/vnd.github+json', path],
        { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (error, stdout) => {
          if (error) {
            // stderr CO THE mang chi tiet ha tang; khong doc, khong chuyen di.
            resolve({ ok: false, status: 0, body: null });
            return;
          }
          try {
            resolve({ ok: true, status: 200, body: JSON.parse(String(stdout)) });
          } catch {
            resolve({ ok: false, status: 0, body: null });
          }
        },
      );
    });
}

/**
 * Doc khong dang nhap — chi hop le voi kho PUBLIC, va co tran ro rang.
 * @param {{ repo: string, fetchImpl?: typeof fetch }} options
 * @returns {ApiReader}
 */
export function unauthenticatedReader({ repo, fetchImpl = fetch }) {
  return async (path) => {
    assertRepoScopedPath(repo, path);
    let response;
    try {
      response = await fetchImpl(`${GITHUB_API}${path}`, {
        method: 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'nexagnet-conversation-bridge/0.1',
        },
      });
    } catch {
      return { ok: false, status: 0, body: null };
    }
    if (!response.ok) return { ok: false, status: response.status, body: null };
    try {
      return { ok: true, status: response.status, body: await response.json() };
    } catch {
      return { ok: false, status: response.status, body: null };
    }
  };
}

/**
 * @param {{ repo: string, githubAccess: string }} config
 * @param {{ run?: typeof execFile, fetchImpl?: typeof fetch }} [overrides]
 * @returns {ApiReader}
 */
export function readerFor(config, overrides = {}) {
  return config.githubAccess === 'gh-cli'
    ? ghCliReader({ repo: config.repo, run: overrides.run })
    : unauthenticatedReader({ repo: config.repo, fetchImpl: overrides.fetchImpl });
}

/**
 * Comment cua CA kho (Issue lan PR — GitHub coi PR la mot Issue), moi nhat truoc.
 * @param {ApiReader} read
 * @param {string} repo
 * @param {number} [perPage]
 */
export async function listRepositoryComments(read, repo, perPage = MAX_COMMENTS_PER_POLL) {
  const bounded = Math.max(1, Math.min(MAX_COMMENTS_PER_POLL, perPage));
  const result = await read(
    `/repos/${repo}/issues/comments?sort=created&direction=desc&per_page=${bounded}`,
  );
  if (!result.ok || !Array.isArray(result.body)) {
    return { ok: /** @type {false} */ (false), status: result.status };
  }
  return { ok: /** @type {true} */ (true), status: result.status, comments: result.body };
}

/**
 * Trang thai SONG cua mot PR. Khong bao gio doc tu bo nho dem — do la ca muc dich cua §5.
 * @param {ApiReader} read
 * @param {string} repo
 * @param {number} pr
 * @returns {Promise<{ ok: true, pr: { state: string, merged: boolean, headSha: string } } | { ok: false, status: number }>}
 */
export async function getPullRequest(read, repo, pr) {
  const result = await read(`/repos/${repo}/pulls/${pr}`);
  if (!result.ok || typeof result.body !== 'object' || result.body === null) {
    return { ok: false, status: result.status };
  }
  const body = /** @type {Record<string, any>} */ (result.body);
  const headSha = body.head?.sha;
  if (typeof body.state !== 'string' || typeof headSha !== 'string') {
    return { ok: false, status: result.status };
  }
  return {
    ok: true,
    pr: Object.freeze({
      state: body.state,
      merged: body.merged === true,
      headSha,
    }),
  };
}
