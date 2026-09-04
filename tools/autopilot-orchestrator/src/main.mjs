/**
 * Entrypoint chay trong GitHub Actions. Day la tep DUY NHAT trong package co goi mang va co ghi.
 *
 * Read-only nghia la: chi `POST /issues/{n}/comments` va them/bo nhan. Khong merge, khong ghi ma
 * nguon, khong dispatch agent nao. Workflow cung khong xin `contents: write`, nen ngay ca khi tep
 * nay co loi thi quyen cua no van khong du de sua repo.
 */
import { readFileSync } from 'node:fs';

import {
  extractTaskContract,
  validateTaskContract,
} from '@netviet/autopilot-protocol/validator/index.mjs';

import { ACTIONS, decideOnComment } from './decide.mjs';
import { checkRunsFromApi, headShaFromPull, requiredChecksFromBranchRules } from './evidence.mjs';
import { ORCHESTRATOR_REASONS } from './reasons.mjs';
import { buildPrincipalRegistry, registryInputFromEnv } from './registry.mjs';

const API = 'https://api.github.com';
const ISSUE_LINE = /^ISSUE=(\d+)$/m;

/** @param {Record<string, unknown>} entry */
const log = (entry) => console.log(JSON.stringify(entry));

/**
 * Ket thuc som nhung KHONG lam do job: bo qua khong phai loi.
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
function stop(reason, detail) {
  log({ orchestrator: 'stop', reason, ...(detail ?? {}) });
}

/**
 * Ket thuc VA lam do job: orchestrator khong lam duoc viec cua no.
 * @param {string} reason
 * @param {Record<string, unknown>} [detail]
 */
function abort(reason, detail) {
  log({ orchestrator: 'abort', reason, ...(detail ?? {}) });
  process.exitCode = 1;
}

/**
 * @param {string} token
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
async function api(token, path, init) {
  const response = await fetch(`${API}${path}`, {
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

async function run() {
  const env = process.env;
  const token = env.GITHUB_TOKEN;
  const repoFull = env.GITHUB_REPOSITORY;
  const eventPath = env.GITHUB_EVENT_PATH;
  const dryRun = env.AUTOPILOT_DRY_RUN === 'true';

  if (!token || !repoFull || !eventPath) {
    return abort(ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN, {
      missing: ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_EVENT_PATH'].filter((k) => !env[k]),
    });
  }
  if (env.GITHUB_EVENT_NAME !== 'issue_comment') {
    return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { eventName: env.GITHUB_EVENT_NAME });
  }

  const registryInput = registryInputFromEnv(env);
  if (!registryInput.ok) {
    return abort(ORCHESTRATOR_REASONS.REGISTRY_NOT_CONFIGURED, { missing: registryInput.missing });
  }
  const built = /** @type {{ ok?: boolean, reason?: string, registry?: unknown }} */ (
    buildPrincipalRegistry(registryInput.value)
  );
  if (built.ok === false) {
    return abort(ORCHESTRATOR_REASONS.REGISTRY_NOT_CONFIGURED, { reason: built.reason });
  }
  const registry = built.registry ?? built;

  const payload = JSON.parse(readFileSync(eventPath, 'utf8'));
  const comment = payload?.comment;
  const issueLike = payload?.issue;
  if (!comment || !issueLike) return stop(ORCHESTRATOR_REASONS.EVENT_SHAPE_UNKNOWN, {});
  // Chi xu ly comment tren PR. Comment tren Issue thuong khong co HEAD de buoc bang chung vao.
  if (!issueLike.pull_request) return stop(ORCHESTRATOR_REASONS.EVENT_NOT_HANDLED, { on: 'issue' });

  const prNumber = Number(issueLike.number);
  const claimedIssue = Number(ISSUE_LINE.exec(String(comment.body ?? ''))?.[1] ?? NaN);
  if (!Number.isInteger(claimedIssue)) {
    return stop(ORCHESTRATOR_REASONS.NOT_A_PROTOCOL_MESSAGE, { pr: prNumber });
  }

  // RUI RO lay tu HOP DONG TASK trong than Issue — khong phai tu thong diep, va khong phai do
  // orchestrator dat. Issue khong mang hop dong hop le => dung, khong doan mot muc rui ro.
  const issueResponse = await api(token, `/repos/${repoFull}/issues/${claimedIssue}`);
  if (!issueResponse.ok) {
    return abort('TASK_ISSUE_UNAVAILABLE', { issue: claimedIssue, status: issueResponse.status });
  }
  const extracted = extractTaskContract(String(issueResponse.body?.body ?? ''));
  if (!extracted.ok) {
    return abort('TASK_CONTRACT_INVALID', { issue: claimedIssue, reason: extracted.reason });
  }
  const checked = validateTaskContract(extracted.contract);
  if (!checked.ok) {
    return abort('TASK_CONTRACT_INVALID', { issue: claimedIssue, reason: checked.reason });
  }
  const risk = String(extracted.contract.risk);

  const pull = await api(token, `/repos/${repoFull}/pulls/${prNumber}`);
  if (!pull.ok) return abort(ORCHESTRATOR_REASONS.PR_HEAD_UNAVAILABLE, { status: pull.status });
  const head = headShaFromPull(pull.body);
  if (!head.ok) return abort(head.reason, head.detail);

  const rulesResponse = await api(token, `/repos/${repoFull}/rules/branches/main`);
  const required = requiredChecksFromBranchRules(rulesResponse.ok ? rulesResponse.body : null);
  if (!required.ok) return abort(required.reason, required.detail);

  const checksResponse = await api(
    token,
    `/repos/${repoFull}/commits/${head.value}/check-runs?per_page=100`,
  );
  const checkRuns = checkRunsFromApi(checksResponse.ok ? checksResponse.body : null);
  if (!checkRuns.ok) return abort(checkRuns.reason, checkRuns.detail);

  const runsResponse = await api(
    token,
    `/repos/${repoFull}/actions/runs?head_sha=${head.value}&per_page=50`,
  );
  const workflowRuns = runsResponse.ok ? (runsResponse.body?.workflow_runs ?? []) : [];
  const ciRunId = Number(
    workflowRuns.find((/** @type {{ name?: string }} */ entry) => entry?.name === 'ci')?.id ?? NaN,
  );
  if (!Number.isInteger(ciRunId)) return abort('CI_RUN_UNAVAILABLE', { headSha: head.value });

  const decision = decideOnComment(
    /** @type {never} */ ({
      comment,
      evidence: {
        headSha: head.value,
        checkRuns: checkRuns.value,
        requiredChecks: required.value,
        ciRunId,
      },
      registry,
      issue: claimedIssue,
      pr: prNumber,
      risk,
    }),
  );

  log({
    orchestrator: 'decision',
    action: decision.action,
    reason: decision.reason,
    detail: decision.detail,
    headSha: head.value,
    ciRunId,
    dryRun,
  });

  if (decision.action === ACTIONS.IGNORE || decision.body === null) return;
  if (dryRun) {
    log({ orchestrator: 'dry-run', body: decision.body });
    return;
  }

  const posted = await api(token, `/repos/${repoFull}/issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: decision.body }),
  });
  if (!posted.ok) return abort('COMMENT_POST_FAILED', { status: posted.status });

  for (const label of decision.labels.remove) {
    if (decision.labels.add.includes(label)) continue;
    await api(token, `/repos/${repoFull}/issues/${prNumber}/labels/${encodeURIComponent(label)}`, {
      method: 'DELETE',
    });
  }
  if (decision.labels.add.length > 0) {
    await api(token, `/repos/${repoFull}/issues/${prNumber}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: decision.labels.add }),
    });
  }
}

await run();
