/**
 * Du lieu gia cua GitHub. KHONG mot bai kiem nao trong goi nay cham vao mang that (#204 §12).
 */
export const REPO = 'phungtienviet14-sketch/nexagnet-platform';
export const APP_SLUG = 'nexagent-autopilot';
export const HEAD_SHA = 'b6d4c1f0a9e83b27d5410fe2c8a7b93d10e5f4a6';
export const OTHER_SHA = '0f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6';

export const ALLOWED_PRODUCERS = Object.freeze([
  { kind: 'APP', id: APP_SLUG, roles: ['GITHUB_ACTIONS'] },
]);

/**
 * Than mot carrier REVIEW_REQUEST hop le theo Giao thuc V0.
 * @param {{ issue?: number, pr?: number, headSha?: string, ciRun?: number, risk?: string }} [over]
 */
export const reviewRequestBody = ({
  issue = 204,
  pr = 205,
  headSha = HEAD_SHA,
  ciRun = 33959076348,
  risk = 'MEDIUM',
} = {}) =>
  [
    '<!-- AUTOPILOT_REVIEW_REQUEST_V0 -->',
    'REVIEW_REQUEST',
    `ISSUE=${issue}`,
    `PR=${pr}`,
    `HEAD_SHA=${headSha}`,
    `CI_RUN=${ciRun}`,
    `RISK=${risk}`,
  ].join('\n');

/**
 * Mot comment tho cua REST API GitHub.
 * @param {{ body?: string, appSlug?: string | null, login?: string | null, issue?: number, repo?: string }} [over]
 */
export function comment({
  body = reviewRequestBody(),
  appSlug = APP_SLUG,
  login = `${APP_SLUG}[bot]`,
  issue = 205,
  repo = REPO,
} = {}) {
  /** @type {Record<string, unknown>} */
  const record = {
    id: 5551107492,
    body,
    issue_url: `https://api.github.com/repos/${repo}/issues/${issue}`,
    html_url: `https://github.com/${repo}/pull/${issue}#issuecomment-5551107492`,
    created_at: '2026-09-05T02:11:00Z',
  };
  if (login !== null) record.user = { login, type: appSlug === null ? 'User' : 'Bot' };
  if (appSlug !== null) record.performed_via_github_app = { slug: appSlug };
  return record;
}

/** @param {{ state?: string, merged?: boolean, headSha?: string }} [over] */
export const pullRequest = ({ state = 'open', merged = false, headSha = HEAD_SHA } = {}) => ({
  state,
  merged,
  head: { sha: headSha },
});

/**
 * Bo doc GitHub gia. Ghi lai moi duong dan da goi de bai kiem khang dinh duoc "co doc SONG that".
 * @param {{ comments?: unknown[], pulls?: Record<number, unknown>, failWith?: number }} [options]
 */
export function fakeReader({ comments = [], pulls = {}, failWith } = {}) {
  /** @type {string[]} */
  const calls = [];
  /** @type {import('../../native-host/github.mjs').ApiReader} */
  const read = async (path) => {
    calls.push(path);
    if (failWith !== undefined) return { ok: false, status: failWith, body: null };
    if (path.includes('/issues/comments')) return { ok: true, status: 200, body: comments };
    const match = /\/pulls\/([0-9]+)$/.exec(path);
    if (match !== null) {
      const pr = pulls[Number(match[1])];
      return pr === undefined
        ? { ok: false, status: 404, body: null }
        : { ok: true, status: 200, body: pr };
    }
    return { ok: false, status: 404, body: null };
  };
  return { read, calls };
}
