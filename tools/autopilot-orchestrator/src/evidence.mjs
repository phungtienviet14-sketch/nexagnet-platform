/**
 * Chuyen HINH DANG CUA GITHUB REST sang THAM SO CUA VALIDATOR.
 *
 * Day la tang dong NOT PROVEN #3 cua PR #155: giao thuc noi "bang chung do orchestrator dua vao",
 * nhung truoc tep nay chua ai lay bang chung tu API that bao gio. `requiredChecksFromRuleset` van
 * duoc goi voi noi dung `.github/rulesets/main-protection.json` — mot BAN GHI DE DUNG LAI, khong
 * phai co che cuong che.
 *
 * Moi ham o day la HAM THUAN: nhan JSON da tai ve, tra ket qua. Viec goi mang nam o `github.mjs`.
 * Tach nhu vay de test chay duoc tren payload that ma khong can mang.
 */
import { requiredChecksFromRuleset } from '@netviet/autopilot-protocol/validator/index.mjs';

import { ORCHESTRATOR_REASONS, fail, succeed } from './reasons.mjs';

const SHA40 = /^[0-9a-f]{40}$/;

/**
 * `GET /repos/{owner}/{repo}/rules/branches/{branch}` tra ve MOT MANG PHANG cac rule dang
 * `{ type, parameters }`. `requiredChecksFromRuleset` lai doi hinh dang cua TEP ruleset, tuc
 * `{ rules: [...] }`. Hai hinh dang nay KHAC NHAU, va do la ly do tep nay ton tai: hom nay ca hai
 * cho ra dung bay ten, nhung neu dua thang mang API vao ham kia thi no tra ve `[]` — tuc
 * "khong co check bat buoc nao" — va cong CI se mo cho MOI HEAD. Mot duong fail-open im lang.
 *
 * @param {unknown} branchRules Than tra ve cua `/rules/branches/{branch}`.
 * @returns {{ ok: true, value: string[] } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
export function requiredChecksFromBranchRules(branchRules) {
  if (!Array.isArray(branchRules)) {
    return fail(ORCHESTRATOR_REASONS.BRANCH_RULES_UNAVAILABLE, {
      received: branchRules === null ? 'null' : typeof branchRules,
    });
  }
  const checks = requiredChecksFromRuleset({ rules: branchRules });
  if (checks.length === 0) {
    return fail(ORCHESTRATOR_REASONS.BRANCH_RULES_NO_REQUIRED_CHECKS, {
      ruleTypes: branchRules.map((rule) => {
        const type = /** @type {{ type?: unknown }} */ (rule ?? {}).type;
        return typeof type === 'string' ? type : null;
      }),
    });
  }
  return succeed(checks);
}

/**
 * `GET /repos/{owner}/{repo}/commits/{ref}/check-runs` tra ve `{ check_runs: [...] }`, moi phan tu
 * mang RAT NHIEU truong. Cong CI cua giao thuc chi doc ba truong, va doi `head_sha` la BAT BUOC
 * (`CI_EVIDENCE_UNBOUND`). Ta cat xuong dung ba truong do va TU CHOI CA LO neu mot phan tu thieu
 * `head_sha` — bo rieng phan tu hong di la bien mot lo bang chung hong thanh mot lo trong nhin nhu
 * hop le.
 *
 * @param {unknown} payload Than tra ve cua `/commits/{ref}/check-runs`.
 * @returns {{ ok: true, value: Array<{ name: string, conclusion: string | null, head_sha: string }> } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
export function checkRunsFromApi(payload) {
  const runs = /** @type {{ check_runs?: unknown }} */ (payload ?? {}).check_runs;
  if (!Array.isArray(runs)) {
    return fail(ORCHESTRATOR_REASONS.CHECK_RUNS_UNAVAILABLE, {
      received: runs === undefined ? 'missing' : typeof runs,
    });
  }
  /** @type {Array<{ name: string, conclusion: string | null, head_sha: string }>} */
  const mapped = [];
  /** @type {Array<string | null>} */
  const unbound = [];
  for (const run of runs) {
    const entry = /** @type {{ name?: unknown, conclusion?: unknown, head_sha?: unknown }} */ (
      run ?? {}
    );
    const headSha = entry.head_sha;
    const name = typeof entry.name === 'string' ? entry.name : null;
    if (typeof headSha !== 'string' || headSha.length === 0) {
      unbound.push(name);
      continue;
    }
    mapped.push({
      name: name ?? '',
      conclusion: typeof entry.conclusion === 'string' ? entry.conclusion : null,
      head_sha: headSha,
    });
  }
  if (unbound.length > 0) {
    return fail(ORCHESTRATOR_REASONS.CHECK_RUN_UNBOUND, { unbound });
  }
  return succeed(mapped);
}

/**
 * HEAD hien tai cua PR, lay tu API chu khong tu than thong diep. Do la nua con lai cua cong
 * exact-SHA: thong diep KHAI mot `head_sha`, va chi khi so sanh voi mot HEAD lay doc lap thi loi
 * khai bao do moi co nghia.
 *
 * @param {unknown} pull Than tra ve cua `/pulls/{number}`.
 * @returns {{ ok: true, value: string } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
export function headShaFromPull(pull) {
  const head = /** @type {{ head?: unknown }} */ (pull ?? {}).head;
  const sha = /** @type {{ sha?: unknown }} */ (head ?? {}).sha;
  if (typeof sha !== 'string' || !SHA40.test(sha)) {
    return fail(ORCHESTRATOR_REASONS.PR_HEAD_UNAVAILABLE, {
      received: typeof sha === 'string' ? sha : typeof sha,
    });
  }
  return succeed(sha);
}

/**
 * HEAD nay co thuoc CHINH repo nay khong?
 *
 * Kiem MOT cho cho CA BA trigger, tren doi tuong PR lay tu API — khong kiem trong payload cua tung
 * loai su kien, vi ba loai su kien mo ta fork o ba cho khac nhau va bo sot mot cho la du.
 *
 * Vi sao can: `pull_request` chay tren PR den tu fork, va o do `GITHUB_TOKEN` chi con quyen doc —
 * nhung dieu quan trong hon quyen la orchestrator khong nen chay giao thuc tren mot cay ma repo nay
 * khong so huu. Voi mot task HIGH / AUTH_AUTHORIZATION, huong dong la TU CHOI.
 *
 * @param {unknown} pull Than tra ve cua `/pulls/{number}`.
 * @param {string} repoFullName `GITHUB_REPOSITORY`, dang `owner/repo`.
 * @returns {{ ok: true, value: string } | { ok: false, reason: string, detail?: Record<string, unknown> }}
 */
export function headRepoIsSelf(pull, repoFullName) {
  const head = /** @type {{ head?: unknown }} */ (pull ?? {}).head;
  const repo = /** @type {{ repo?: unknown }} */ (head ?? {}).repo;
  const fullName = /** @type {{ full_name?: unknown }} */ (repo ?? {}).full_name;
  // Thieu `full_name` cung bi tu choi: khong doc duoc nguon goc thi khong duoc coi la cua minh.
  if (typeof fullName !== 'string' || fullName !== repoFullName) {
    return fail(ORCHESTRATOR_REASONS.FORK_HEAD_NOT_TRUSTED, {
      headRepo: typeof fullName === 'string' ? fullName : null,
      repo: repoFullName,
    });
  }
  return succeed(fullName);
}
