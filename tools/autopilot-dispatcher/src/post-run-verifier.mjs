/**
 * SU THAT SAU KHI CHAY — GITHUB noi, khong phai stdout cua Claude.
 *
 * `exit 0` chi chung minh mot dieu: tien trinh da ket thuc binh thuong. No khong chung minh co
 * code, co PR, co CI, hay co ban giao. Va mot dong chu "BUILD_READY" trong stdout cang khong
 * chung minh gi — do la van ban do chinh tien trinh vua chay tu viet ra ve chinh no.
 *
 * Nen o day chi co ba nguon bang chung, tat ca deu doc lai tu GitHub sau khi tien trinh da thoat:
 *   1. nhanh co thuc su ton tai tren remote khong;
 *   2. co PR nao co head la nhanh do khong;
 *   3. trong comment cua Issue/PR co mot thong diep GIAO THUC hop le tro dung PR do khong.
 *
 * Buoc 3 dung `readMessage` cua giao thuc — cung bo luat ma orchestrator dung. Mot comment "coi
 * nhu la BUILD_READY" khong qua duoc: marker phai la dong dau tien, va payload phai qua schema.
 *
 * Ket qua co the la `PROCESS_EXITED_0` + `HANDOFF_MISSING`. Do la mot ket qua HOP LE, va no phai
 * nhin thay duoc la CHUA XONG.
 */
import { MESSAGE_TYPES, readMessage } from '@netviet/autopilot-protocol/validator/index.mjs';
import { DISPATCH_STATES, REASONS } from './errors.mjs';
import { findPullRequestByHead, readIssueComments, readRemoteBranch } from './github-source.mjs';

/** Cac loai thong diep duoc tinh la "da ban giao" cho mot lan chay Builder. */
export const HANDOFF_MESSAGE_TYPES = /** @type {ReadonlyArray<string>} */ (
  Object.freeze([MESSAGE_TYPES.BUILD_READY, MESSAGE_TYPES.REVIEW_REQUEST])
);

/**
 * Loc ra thong diep ban giao HOP LE va tro dung PR nay. Ham thuan tuy — kiem duoc khong can mang.
 * @param {ReadonlyArray<{ body?: string }>} comments
 * @param {{ pr: number | null }} bound
 */
export function findHandoffMessages(comments, bound) {
  /** @type {Array<Record<string, unknown>>} */
  const found = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    const parsed = readMessage(String(comment?.body ?? ''));
    if (!parsed.ok) continue;
    const message = parsed.message;
    if (!HANDOFF_MESSAGE_TYPES.includes(/** @type {string} */ (message.type))) continue;
    // Rang buoc voi PR THAT. Hai nua cua dieu kien nay deu can:
    //
    //   - khong co PR nao  => KHONG co gi de rang buoc vao, nen KHONG comment nao duoc tinh. Ban
    //     truoc viet `bound.pr !== null && ...`, nen dung luc khong co PR thi menh de tat nguong
    //     va MOI comment BUILD_READY hop le hinh dang deu duoc nhan. Comment la thu ai cung viet
    //     duoc tren mot repo PUBLIC, nen do la mot duong gia mao bang chung hoan tat.
    //   - co PR nhung so khac => mot BUILD_READY cua task KHAC khong phai ban giao cua lan nay.
    if (bound.pr === null || Number(message.pr) !== Number(bound.pr)) continue;
    found.push(message);
  }
  return found;
}

/**
 * @param {import('./gh.mjs').GhClient} gh
 * @param {{ repo: string, issue: number, branch: string }} input
 */
export async function verifyHandoff(gh, { repo, issue, branch }) {
  const branchState = await readRemoteBranch(gh, { repo, branch });

  const pullResult = await findPullRequestByHead(gh, { repo, branch });
  if (!pullResult.ok) return pullResult;
  const pull = pullResult.pull;

  const bound = { pr: pull ? Number(pull.number) : null };
  const issueComments = await readIssueComments(gh, { repo, number: issue });
  if (!issueComments.ok) return issueComments;

  /** @type {Array<{ body?: string }>} */
  let comments = [...issueComments.comments];
  if (pull) {
    const prComments = await readIssueComments(gh, { repo, number: Number(pull.number) });
    if (!prComments.ok) return prComments;
    comments = [...comments, ...prComments.comments];
  }

  const handoffs = findHandoffMessages(comments, bound);
  const state =
    handoffs.length > 0 ? DISPATCH_STATES.HANDOFF_PRESENT : DISPATCH_STATES.HANDOFF_MISSING;
  return {
    ok: /** @type {const} */ (true),
    state,
    reason: state === DISPATCH_STATES.HANDOFF_MISSING ? REASONS.HANDOFF_MISSING : null,
    branchExists: branchState.exists,
    pr: bound.pr,
    headSha: pull ? String(pull.head?.sha ?? '') : null,
    handoffTypes: handoffs.map((message) => String(message.type)),
  };
}

/**
 * Bat bien duoc phat bieu thang thanh code de mot dot refactor khong lang le lam mat no: KHONG co
 * duong nao tu stdout den `HANDOFF_PRESENT`.
 * @param {{ stdoutBytes: number }} _processOutcome
 */
export function stdoutIsNeverEvidence(_processOutcome) {
  return false;
}
