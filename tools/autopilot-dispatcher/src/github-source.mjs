/**
 * Kham pha task tren GitHub — chi doc, chi mot repo da cau hinh.
 *
 * Ba dieu package nay CO Y KHONG lam:
 *   1. khong doc comment cua Issue de lam dau vao prompt (xem `prompt-compiler.mjs`);
 *   2. khong tin bat ky truong nao trong THAN Issue de suy ra quyen (xem `trigger-provenance.mjs`);
 *   3. khong nhan `repo` tu GitHub — `repo` den tu cau hinh cuc bo, va cau tra loi cua GitHub con
 *      bi DOI CHIEU nguoc lai voi no.
 */
import { REASONS, deny } from './errors.mjs';

/** @param {string} value */
const encodeSegment = (value) => encodeURIComponent(String(value));

/**
 * Danh sach Issue MO dang mang nhan san sang. GitHub tra ca PR trong `/issues`; PR bi loai.
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, readyLabel: string }} input
 */
export async function listReadyIssues(gh, { repo, readyLabel }) {
  const path =
    `/repos/${repo}/issues?state=open&per_page=100` + `&labels=${encodeSegment(readyLabel)}`;
  const result = await gh.api(path, { paginate: true });
  if (!result.ok) return result;
  if (!Array.isArray(result.body)) return deny(REASONS.GITHUB_BAD_RESPONSE, { path });
  const issues = result.body.filter((item) => item && item.pull_request === undefined);
  return { ok: /** @type {const} */ (true), issues };
}

/**
 * Doc mot Issue cu the va DOI CHIEU no voi repo da cau hinh.
 *
 * `repository_url` la thu GitHub tra ve; so no voi `repo` cuc bo la cach duy nhat bat duoc truong
 * hop mot cau hinh tro nham repo, hoac mot cau tra loi bi thay the.
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, issue: number }} input
 */
export async function readIssue(gh, { repo, issue }) {
  const path = `/repos/${repo}/issues/${Number(issue)}`;
  const result = await gh.api(path);
  if (!result.ok) return result;
  const body = result.body;
  if (!body || typeof body !== 'object') return deny(REASONS.GITHUB_BAD_RESPONSE, { path });
  if (body.pull_request !== undefined) {
    return deny(REASONS.ISSUE_IS_PULL_REQUEST, { issue: Number(issue) });
  }
  const belongsTo = String(body.repository_url ?? '').replace(/^.*\/repos\//, '');
  if (belongsTo !== repo) {
    return deny(REASONS.REPO_MISMATCH, { want: repo, got: belongsTo || '<unknown>' });
  }
  return { ok: /** @type {const} */ (true), issue: body };
}

/**
 * Dong su kien cua mot Issue — nguon bang chung DUY NHAT cho "ai da gan nhan".
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, issue: number }} input
 */
export async function readIssueTimeline(gh, { repo, issue }) {
  const path = `/repos/${repo}/issues/${Number(issue)}/timeline?per_page=100`;
  const result = await gh.api(path, { paginate: true });
  if (!result.ok) {
    // Khong doc duoc dong su kien => KHONG co bang chung => khong dieu phoi. Day la duong fail
    // closed quan trong nhat cua kham pha: mot GitHub tam thoi 403 khong duoc bien thanh "cu chay".
    return deny(REASONS.TRIGGER_EVIDENCE_UNAVAILABLE, { path, reason: result.reason });
  }
  if (!Array.isArray(result.body)) return deny(REASONS.TRIGGER_EVIDENCE_UNAVAILABLE, { path });
  return { ok: /** @type {const} */ (true), timeline: result.body };
}

/**
 * Nhanh tren remote (de bat va cham ten nhanh truoc khi tao worktree).
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, branch: string }} input
 */
export async function readRemoteBranch(gh, { repo, branch }) {
  const path = `/repos/${repo}/git/ref/heads/${branch.split('/').map(encodeSegment).join('/')}`;
  const result = await gh.api(path);
  // Khong phan biet duoc 404 voi mot loi tam thoi qua ma thoat cua `gh`, nen KHONG bao "khong co
  // nhanh" — bao KHONG BIET. Mot su co mang doc thanh "Claude chua tao nhanh" la mot ket luan sai
  // ma khong ai kiem lai.
  if (!result.ok)
    return {
      ok: /** @type {const} */ (true),
      exists: /** @type {boolean | null} */ (null),
      ref: null,
    };
  return { ok: /** @type {const} */ (true), exists: result.body !== null, ref: result.body };
}

/**
 * PR co head la nhanh nay (neu co).
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, branch: string }} input
 */
export async function findPullRequestByHead(gh, { repo, branch }) {
  const owner = repo.split('/')[0];
  const path =
    `/repos/${repo}/pulls?state=all&per_page=100` + `&head=${encodeSegment(`${owner}:${branch}`)}`;
  const result = await gh.api(path);
  if (!result.ok) return result;
  // Than sai hinh dang la LOI, khong phai "khong co PR nao". Doc nham huong nay bien mot su co
  // GitHub thanh mot ket luan "Claude chua mo PR" — mot ket luan sai ma khong ai kiem lai.
  if (!Array.isArray(result.body)) return deny(REASONS.GITHUB_BAD_RESPONSE, { path });
  return { ok: /** @type {const} */ (true), pull: result.body[0] ?? null };
}

/**
 * Comment cua mot Issue/PR. CHI dung cho hau kiem (tim thong diep giao thuc) — KHONG BAO GIO
 * dung lam dau vao prompt.
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, number: number }} input
 */
export async function readIssueComments(gh, { repo, number }) {
  const path = `/repos/${repo}/issues/${Number(number)}/comments?per_page=100`;
  const result = await gh.api(path, { paginate: true });
  if (!result.ok) return result;
  // Cung ly do: "khong doc duoc comment" khong duoc bien thanh "khong co ban giao".
  if (!Array.isArray(result.body)) return deny(REASONS.GITHUB_BAD_RESPONSE, { path });
  return { ok: /** @type {const} */ (true), comments: result.body };
}

/**
 * Than Issue duoc SUA LAN CUOI luc nao — `null` neu chua bao gio sua.
 *
 * Phai dung GraphQL: REST chi co `updated_at`, ma truong do nhay ca khi ai do binh luan hoac gan
 * nhan, nen lay no lam bang chung "than da doi" se tu choi nham gan nhu moi task. `lastEditedAt`
 * chi nhay khi CHINH than bi sua — dung thu can de biet nguoi gan nhan da duyet cai gi.
 *
 * Khong doc duoc => TU CHOI, khong coi nhu "chua sua". Day la mot cong fail-closed.
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, issue: number }} input
 */
export async function readIssueBodyEdit(gh, { repo, issue }) {
  const [owner, name] = repo.split('/');
  const query =
    'query($owner:String!,$name:String!,$number:Int!)' +
    '{repository(owner:$owner,name:$name){issue(number:$number){lastEditedAt}}}';
  const result = await gh.graphql(query, { owner, name, number: Number(issue) });
  if (!result.ok) {
    return deny(REASONS.TRIGGER_EVIDENCE_UNAVAILABLE, { probe: 'lastEditedAt' });
  }
  const node = result.data?.repository?.issue;
  if (node === null || node === undefined) {
    return deny(REASONS.TRIGGER_EVIDENCE_UNAVAILABLE, { probe: 'lastEditedAt' });
  }
  const lastEditedAt = node.lastEditedAt;
  if (lastEditedAt !== null && typeof lastEditedAt !== 'string') {
    return deny(REASONS.TRIGGER_EVIDENCE_UNAVAILABLE, { probe: 'lastEditedAt' });
  }
  return { ok: /** @type {const} */ (true), lastEditedAt };
}
