/**
 * KE HOACH DIEU PHOI — ham THUAN TUY bien bang chung da kiem thanh mot ban ke hoach xac dinh.
 *
 * Tach thuan tuy la co chu dinh: moi quyet dinh "chay o dau, tren nhanh nao, tu SHA nao, bang
 * model nao" phai kiem duoc ma khong can Git, khong can mang, khong can tien trinh con. Neu mot
 * bai test ve ranh gioi an toan can dung den I/O thi no khong con la mot bai test ve ranh gioi.
 *
 * Ten nhanh va duong worktree KHONG duoc lay tu bat ky chuoi nao cua GitHub. Chung duoc SINH tu
 * so Issue (so nguyen) va dau van tay hop dong (64 hex), roi con bi doi chieu voi mot mau chat.
 * Nho vay mot `task_id` doc hai — dau cach, `..`, dau gach cheo nguoc, ky tu dieu khien — khong
 * co duong nao cham toi he tep.
 */
import path from 'node:path';
import { REASONS, deny } from './errors.mjs';

/** Ten nhanh sinh ra phai khop chinh xac mau nay. Chat hon `git check-ref-format` mot bac. */
const GENERATED_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*[A-Za-z0-9]$/;
const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

/** Do dai manh dau van tay dua vao ten. 12 hex ~ 48 bit: du de khong va cham trong mot repo. */
const DIGEST_SLUG_LENGTH = 12;

/**
 * @typedef {object} DispatchPlan
 * @property {string} repo
 * @property {number} issue
 * @property {string} issueUrl
 * @property {string} taskId
 * @property {string} contractDigest
 * @property {string} triggerPrincipal
 * @property {string | null} triggerEventAt
 * @property {string} baseSha
 * @property {string} branch
 * @property {string} worktreePath
 * @property {string} worktreeLabel
 * @property {string} model
 * @property {string} effort
 * @property {string} ledgerKey
 */

/**
 * Khoa chinh tac cua so cai. Gom CA dau van tay hop dong: sua hop dong la mot task KHAC, nen no
 * phai co mot khoa khac — do la cach `TASK_CONTRACT_CHANGED_AFTER_CLAIM` phat hien duoc.
 * @param {{ repo: string, issue: number, contractDigest: string }} input
 */
export function ledgerKeyFor({ repo, issue, contractDigest }) {
  return `dispatch:${repo}:${issue}:${contractDigest}`;
}

/**
 * @param {object} input
 * @param {import('./config.mjs').DispatcherConfig} input.config
 * @param {{ number: number, html_url?: string }} input.issue
 * @param {{ task_id: string }} input.contract
 * @param {string} input.contractDigest
 * @param {{ kind: string, id: string }} input.principal
 * @param {string | null} [input.triggerEventAt]
 * @param {string} input.baseSha
 * @returns {{ ok: true, plan: DispatchPlan } | import('./errors.mjs').Denied}
 */
export function buildDispatchPlan({
  config,
  issue,
  contract,
  contractDigest,
  principal,
  triggerEventAt = null,
  baseSha,
}) {
  if (!SHA40_PATTERN.test(String(baseSha))) {
    return deny(REASONS.BASE_SHA_UNRESOLVED, { baseSha: String(baseSha).length });
  }
  if (!DIGEST_PATTERN.test(String(contractDigest))) {
    return deny(REASONS.CONFIG_INVALID, { field: 'contractDigest', want: 'sha256 hex' });
  }
  const issueNumber = Number(issue?.number);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    return deny(REASONS.GITHUB_BAD_RESPONSE, { field: 'issue.number' });
  }

  const slug = contractDigest.slice(0, DIGEST_SLUG_LENGTH);
  const label = `issue-${issueNumber}-${slug}`;
  const branch = `${config.branchPrefix}/${label}`;
  if (!GENERATED_BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.includes('//')) {
    return deny(REASONS.BRANCH_NAME_INVALID, { branch });
  }

  const root = path.resolve(config.worktreeRoot);
  const worktreePath = path.resolve(root, label);
  // Kiem GIAM HAM du `label` da duoc sinh ra tu so nguyen + hex: mot cau hinh `worktreeRoot` la
  // duong tuong doi ky la van co the day duong ket qua ra ngoai. Kiem o day re, va la cai chan
  // cuoi cung truoc khi mot duong dan tro thanh mot lenh `git worktree add`.
  if (worktreePath !== root && !worktreePath.startsWith(root + path.sep)) {
    return deny(REASONS.WORKTREE_PATH_ESCAPES_ROOT, { label });
  }

  return {
    ok: /** @type {const} */ (true),
    plan: Object.freeze({
      repo: config.repo,
      issue: issueNumber,
      issueUrl: String(issue?.html_url ?? ''),
      taskId: String(contract?.task_id ?? ''),
      contractDigest,
      triggerPrincipal: `${principal.kind}:${principal.id}`,
      triggerEventAt,
      baseSha,
      branch,
      worktreePath,
      worktreeLabel: label,
      model: config.claude.model,
      effort: config.claude.effort,
      ledgerKey: ledgerKeyFor({ repo: config.repo, issue: issueNumber, contractDigest }),
    }),
  };
}

export const PLANNER_INTERNALS = Object.freeze({
  GENERATED_BRANCH_PATTERN,
  DIGEST_SLUG_LENGTH,
});
