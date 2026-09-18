/**
 * MOT LAN DIEU PHOI, tu dau den cuoi.
 *
 * Thu tu cac cong o day KHONG phai tuy y. Moi thu re va khong the dao nguoc duoc dat len TRUOC
 * moi thu dat va co the dao nguoc:
 *
 *   cau hinh -> vu trang -> khoa tien trinh -> tim task -> nguon goc kich hoat -> hop dong ->
 *   so cai -> SHA nen -> ke hoach -> prompt -> kha nang CLI  ||  worktree -> phong -> hau kiem
 *
 * Moi thu ben TRAI hai gach doc la doc va tinh toan: che do `plan` dung dung o do va khong de lai
 * mot dau vet nao tren may. Chi khi da qua HET nhung cong do, va chi trong che do `execute`, moi
 * co mot thu muc duoc tao va mot tien trinh duoc phong.
 *
 * Nho vay "dry-run khong tao worktree, khong phong Claude" khong phai mot loi hua trong tai lieu
 * ma la mot tinh chat cua cau truc: nhanh thuc thi nam SAU mot lenh `return`.
 */
import { definePrincipalRegistry } from '@netviet/autopilot-protocol/validator/index.mjs';
import { assertArmed } from './config.mjs';
import { DISPATCH_STATES, REASONS, deny } from './errors.mjs';
import {
  listReadyIssues,
  readIssue,
  readIssueBodyEdit,
  readIssueTimeline,
} from './github-source.mjs';
import { evaluateTriggerProvenance } from './trigger-provenance.mjs';
import { readTaskContract } from './task-reader.mjs';
import { buildDispatchPlan, ledgerKeyFor } from './planner.mjs';
import { compilePrompt } from './prompt-compiler.mjs';
import { assertPolicySupported, probeClaude } from './claude-capabilities.mjs';
import { buildClaudeArgv, launchClaude } from './claude-launcher.mjs';
import { resolveBaseSha, createWorktree } from './worktree-manager.mjs';
import { verifyHandoff } from './post-run-verifier.mjs';
import { acquireProcessLock } from './process-lock.mjs';

export const MODES = Object.freeze({ PLAN: 'plan', EXECUTE: 'execute' });

/**
 * Chon task khi co nhieu task san sang: SO ISSUE NHO NHAT.
 *
 * Tieu chi phai TAT DINH va khong the tac dong tu ben ngoai. "Moi cap nhat nhat" thi bat ky ai
 * cung day len dau hang bang mot comment; "so nho nhat" thi khong.
 * @param {ReadonlyArray<{ number: number }>} issues
 */
export function selectIssue(issues) {
  return [...issues].sort((a, b) => Number(a.number) - Number(b.number))[0] ?? null;
}

/**
 * @param {object} input
 * @param {import('./config.mjs').DispatcherConfig} input.config
 * @param {string} input.mode
 * @param {object} input.deps
 * @param {import('./gh.mjs').GhClient} input.deps.gh
 * @param {import('./worktree-manager.mjs').Git} input.deps.git
 * @param {import('./ledger.mjs').Ledger} input.deps.ledger
 * @param {import('./exec.mjs').ExecFn} input.deps.exec
 * @param {import('./exec.mjs').SpawnFn} input.deps.spawn
 * @param {import('./logger.mjs').Logger} input.deps.logger
 * @param {{ existsSync?: (p: string) => boolean }} [input.deps.io]
 * @param {typeof acquireProcessLock} [input.deps.acquireLock]
 * @param {number} [input.issue] chi dinh mot Issue cu the thay vi tu tim
 */
export async function runOnce({ config, mode, deps, issue: requestedIssue }) {
  const log = deps.logger.log.bind(deps.logger);
  const execute = mode === MODES.EXECUTE;

  if (execute) {
    const armed = assertArmed(config);
    if (!armed.ok) {
      log('dispatch.refused', { mode, reason: armed.reason });
      return armed;
    }
  }

  const acquire = deps.acquireLock ?? acquireProcessLock;
  /** @type {{ ok: true, release: () => boolean } | import("./errors.mjs").Denied} */
  const lock = execute
    ? acquire({ dir: config.stateDir })
    : { ok: /** @type {const} */ (true), release: () => true };
  if (!lock.ok) {
    log('dispatch.refused', { mode, reason: lock.reason });
    return lock;
  }

  try {
    return await runInsideLock({ config, mode, deps, requestedIssue, log });
  } finally {
    if (execute) /** @type {{ release: () => boolean }} */ (lock).release();
  }
}

/**
 * @param {{ config: import('./config.mjs').DispatcherConfig, mode: string, deps: any, requestedIssue?: number, log: (event: string, fields?: Record<string, unknown>) => unknown }} input
 */
async function runInsideLock({ config, mode, deps, requestedIssue, log }) {
  const execute = mode === MODES.EXECUTE;

  // --- 0. so do phan quyen PHAT THONG DIEP (cong cau hinh, khong cham mang) --------------------
  //
  // Dung o day chu khong o cho goi `verifyHandoff` la co y: mot so do hong la loi CAU HINH, va
  // phat hien no SAU khi da tao worktree va chay xong mot lan Claude thi tra gia bang ca lan chay
  // do. Dat truoc moi thu, `plan` cung di qua no — nen nguoi van hanh thay duoc loi ma khong phai
  // vu trang cai gi.
  //
  // Day KHONG PHAI `trustedTriggerPrincipals`: quyen kich hoat mot lan chay va quyen khang dinh
  // lan chay do da ban giao la hai thu khac nhau.
  const handoffRegistry = definePrincipalRegistry(
    config.handoffPrincipals.map((entry) => ({
      kind: entry.kind,
      id: entry.id,
      roles: entry.roles,
    })),
  );
  if (!handoffRegistry.ok) return refuse(log, mode, handoffRegistry);

  // --- 1. tim task san sang -------------------------------------------------------------------
  /** @type {{ number: number } | null} */
  let candidate = null;
  if (requestedIssue !== undefined) {
    candidate = { number: Number(requestedIssue) };
  } else {
    const ready = await listReadyIssues(deps.gh, {
      repo: config.repo,
      readyLabel: config.readyLabel,
    });
    if (!ready.ok) return refuse(log, mode, ready);
    candidate = selectIssue(ready.issues);
    if (candidate === null) {
      log('dispatch.idle', { mode, repo: config.repo, reason: REASONS.NO_READY_TASK });
      return deny(REASONS.NO_READY_TASK);
    }
  }

  const issueResult = await readIssue(deps.gh, { repo: config.repo, issue: candidate.number });
  if (!issueResult.ok) return refuse(log, mode, issueResult, { issue: candidate.number });
  const issue = issueResult.issue;
  if (String(issue.state).toLowerCase() !== 'open') {
    return refuse(log, mode, deny(REASONS.ISSUE_NOT_OPEN, { state: String(issue.state) }), {
      issue: candidate.number,
    });
  }

  // --- 2. nguon goc kich hoat (truoc ca khi doc hop dong) --------------------------------------
  const timeline = await readIssueTimeline(deps.gh, {
    repo: config.repo,
    issue: Number(issue.number),
  });
  if (!timeline.ok) return refuse(log, mode, timeline, { issue: Number(issue.number) });

  // Doc rieng: mot lan gan nhan duyet MOT noi dung, nen phai biet noi dung do co bi doi sau do
  // khong. Khong doc duoc => tu choi, khong coi nhu "chua doi".
  const bodyEdit = await readIssueBodyEdit(deps.gh, {
    repo: config.repo,
    issue: Number(issue.number),
  });
  if (!bodyEdit.ok) return refuse(log, mode, bodyEdit, { issue: Number(issue.number) });

  const provenance = evaluateTriggerProvenance({
    issue,
    timeline: timeline.timeline,
    readyLabel: config.readyLabel,
    allowlist: config.trustedTriggerPrincipals,
    bodyLastEditedAt: bodyEdit.lastEditedAt,
  });
  if (!provenance.ok) return refuse(log, mode, provenance, { issue: Number(issue.number) });

  // --- 3. hop dong task (ngu nghia cua giao thuc) ----------------------------------------------
  const task = readTaskContract({ body: String(issue.body ?? ''), issue: Number(issue.number) });
  if (!task.ok) return refuse(log, mode, task, { issue: Number(issue.number) });

  // --- 4. so cai: da nhan chua, va hop dong co doi sau khi nhan khong --------------------------
  const key = ledgerKeyFor({
    repo: config.repo,
    issue: Number(issue.number),
    contractDigest: task.digest,
  });
  const existing = deps.ledger.get(key);
  if (!existing.ok) return refuse(log, mode, existing, { issue: Number(issue.number) });
  if (existing.record) {
    return refuse(log, mode, deny(REASONS.TASK_ALREADY_CLAIMED, { state: existing.record.state }), {
      issue: Number(issue.number),
      ledger_key: key,
      state: existing.record.state,
    });
  }
  const priors = deps.ledger.priorContractsFor({
    repo: config.repo,
    issue: Number(issue.number),
    contractDigest: task.digest,
  });
  if (!priors.ok) return refuse(log, mode, priors, { issue: Number(issue.number) });
  if (priors.records.length > 0) {
    // Cung Issue, khac dau van tay: Architect da sua hop dong sau khi may nay nhan no. Chay tiep
    // la chay MOT TASK KHAC duoi mot lan nhan cu — nen dung, va noi ro ra.
    return refuse(
      log,
      mode,
      deny(REASONS.TASK_CONTRACT_CHANGED_AFTER_CLAIM, { priorRuns: priors.records.length }),
      { issue: Number(issue.number), contract_digest: task.digest },
    );
  }

  // --- 5. SHA nen chinh xac tu remote vua fetch ------------------------------------------------
  const base = await resolveBaseSha(deps.git, {
    remote: config.remote,
    baseBranch: config.baseBranch,
  });
  if (!base.ok) return refuse(log, mode, base, { issue: Number(issue.number) });

  // --- 6. ke hoach + prompt + kha nang CLI -----------------------------------------------------
  const planned = buildDispatchPlan({
    config,
    issue,
    contract: task.contract,
    contractDigest: task.digest,
    principal: provenance.principal,
    triggerEventAt: provenance.event.createdAt,
    baseSha: base.baseSha,
  });
  if (!planned.ok) return refuse(log, mode, planned, { issue: Number(issue.number) });
  const plan = planned.plan;

  const { prompt, digest: promptDigest } = compilePrompt({ plan, contract: task.contract });

  const probe = await probeClaude({ exec: deps.exec }, config.claude);
  if (!probe.ok) return refuse(log, mode, probe, { issue: plan.issue });
  const supported = assertPolicySupported(probe.capabilities, {
    model: config.claude.model,
    effort: config.claude.effort,
  });
  if (!supported.ok) return refuse(log, mode, supported, { issue: plan.issue });

  const argv = buildClaudeArgv({ ...config.claude });

  const planFields = {
    mode,
    repo: plan.repo,
    issue: plan.issue,
    task_id: plan.taskId,
    base_sha: plan.baseSha,
    branch: plan.branch,
    worktree_label: plan.worktreeLabel,
    contract_digest: plan.contractDigest,
    prompt_digest: promptDigest,
    trigger_principal: plan.triggerPrincipal,
    model: plan.model,
    effort: plan.effort,
    permission_prompts: config.claude.permissionPrompts,
    claude_version: probe.capabilities.version,
    ledger_key: plan.ledgerKey,
  };

  // --- 7. RANH GIOI: tu day tro xuong moi co tac dong len may ---------------------------------
  if (!execute) {
    log('dispatch.planned', { ...planFields, state: DISPATCH_STATES.PLANNED });
    return {
      ok: /** @type {const} */ (true),
      mode,
      state: DISPATCH_STATES.PLANNED,
      plan,
      promptDigest,
      promptBytes: Buffer.byteLength(prompt, 'utf8'),
      argv,
      capabilities: probe.capabilities,
    };
  }

  return executeDispatch({
    config,
    deps,
    log,
    plan,
    prompt,
    promptDigest,
    argv,
    planFields,
    handoffRegistry: handoffRegistry.registry,
  });
}

/**
 * Nhanh CO TAC DONG. Tach ham rieng de doc mot lan la thay het nhung gi dispatcher lam voi may
 * nguoi dung: ghi so cai, tao worktree, phong mot tien trinh, roi hoi lai GitHub.
 * @param {{ config: any, deps: any, log: any, plan: import('./planner.mjs').DispatchPlan, prompt: string, promptDigest: string, argv: string[], planFields: Record<string, unknown>, handoffRegistry: unknown }} input
 */
async function executeDispatch({
  config,
  deps,
  log,
  plan,
  prompt,
  promptDigest,
  argv,
  planFields,
  handoffRegistry,
}) {
  // Nhan TRUOC khi tao worktree: neu tien trinh chet giua chung, dau vet cua lan nhan van con va
  // vong hoi ke tiep khong phong lai. Ghi so cai sau khi phong thi mat dien la chay trung.
  const claimed = deps.ledger.claim({
    key: plan.ledgerKey,
    repo: plan.repo,
    issue: plan.issue,
    taskId: plan.taskId,
    contractDigest: plan.contractDigest,
    promptDigest,
    triggerPrincipal: plan.triggerPrincipal,
    baseSha: plan.baseSha,
    branch: plan.branch,
    worktreeLabel: plan.worktreeLabel,
    model: plan.model,
    effort: plan.effort,
    state: DISPATCH_STATES.CLAIMED,
    claimedAt: '',
    updatedAt: '',
    launches: 0,
    lastReason: null,
  });
  if (!claimed.ok) return refuse(log, MODES.EXECUTE, claimed, planFields);
  log('dispatch.claimed', { ...planFields, state: DISPATCH_STATES.CLAIMED });

  /**
   * Ghi trang thai vao so cai VA doc lai ket qua ghi.
   *
   * Bo qua ket qua cua `update` la mot cai bay im lang: neu mot lan ghi hong (dia day, thu muc
   * mat quyen mot luc, tep bi dong ngoai), ban ghi dung o `CLAIMED` vinh vien — va vi khoa so cai
   * da ton tai, MOI lan chay sau deu tu choi bang `TASK_ALREADY_CLAIMED` ma khong o dau ghi lai
   * LY DO trang thai khong bao gio tien. Task do khong bao gio ra khoi day ma khong co nguoi sua
   * tay tep.
   * @param {string} state
   * @param {string | null} [reason]
   * @param {Record<string, unknown>} [extra]
   */
  const mark = (state, reason = null, extra = {}) => {
    const written = deps.ledger.update(plan.ledgerKey, { state, lastReason: reason, ...extra });
    if (!written.ok) {
      log('dispatch.ledger_write_failed', { ...planFields, state, reason: written.reason });
    }
    log('dispatch.state', { ...planFields, state, ...(reason ? { reason } : {}) });
    return written;
  };

  const worktree = await createWorktree(
    deps.git,
    {
      branch: plan.branch,
      worktreePath: plan.worktreePath,
      baseSha: plan.baseSha,
      remote: config.remote,
    },
    deps.io ?? {},
  );
  if (!worktree.ok) {
    mark(DISPATCH_STATES.FAILED, worktree.reason);
    return worktree;
  }
  mark(DISPATCH_STATES.WORKTREE_READY);

  // Lan ghi NAY la lan duy nhat bat buoc phai thanh cong truoc khi phong: no la thu ghi lai rang
  // mot tien trinh sap chay. Ghi hong ma van phong thi so cai khong con dem duoc so lan phong.
  const starting = mark(DISPATCH_STATES.CLAUDE_STARTING, null, { launches: 1 });
  if (!starting.ok) return starting;

  const launched = await launchClaude({
    spawn: deps.spawn,
    bin: config.claude.bin,
    argv,
    cwd: plan.worktreePath,
    prompt,
    timeoutMs: config.claude.timeoutMs,
    killGraceMs: config.claude.killGraceMs,
    maxCaptureBytes: config.claude.maxCaptureBytes,
  });
  if (!launched.ok) {
    mark(DISPATCH_STATES.FAILED, launched.reason);
    return launched;
  }
  const outcome = launched.outcome;
  log('dispatch.claude_exited', {
    ...planFields,
    state: outcome.state,
    exit_code: outcome.exitCode,
    signal: outcome.signal,
    duration_ms: outcome.durationMs,
    stdout_bytes: outcome.stdoutBytes,
    stderr_bytes: outcome.stderrBytes,
  });
  mark(outcome.state);

  // Hau kiem chay cho MOI ket cuc, ke ca timeout va exit khac 0: Claude co the da mo PR roi moi
  // chet. Bo qua buoc nay khi exit != 0 la tu bo mat mot ban giao co that.
  log('dispatch.state', { ...planFields, state: DISPATCH_STATES.POST_RUN_VERIFY });
  const verified = await verifyHandoff(deps.gh, {
    repo: plan.repo,
    issue: plan.issue,
    branch: plan.branch,
    registry: handoffRegistry,
  });
  if (!verified.ok) {
    mark(DISPATCH_STATES.FAILED, verified.reason);
    return verified;
  }

  // Trang thai cuoi cung: mot lan chay KHONG ket thuc sach thi ket cuc cua TIEN TRINH thang.
  //
  // Ly do KHONG phai "so doc nham mot PR cu": ten nhanh mang dau van tay hop dong va worktree tu
  // choi moi va cham, nen mot PR tren nhanh do chi co the sinh ra trong CHINH lan chay nay. Ly do
  // that la: mot tien trinh bi giet giua chung co the da kip mo PR nhung chua kip lam xong viec
  // (tren Windows, xem `killGraceMs`, no bi giet KHONG co thoi gian an han). Bao "da ban giao"
  // cho mot lan chay nhu vay la bao xong cho mot viec co the dang do.
  //
  // Nhung ket qua hau kiem KHONG bi vut di: no duoc ghi rieng vao `handoffState`, de mot lan
  // timeout co ban giao that van doc ra duoc, thay vi bien mat sau mot chu `TIMED_OUT`.
  const processClean = outcome.state === DISPATCH_STATES.CLAUDE_EXITED_0;
  const finalState = processClean ? verified.state : outcome.state;
  mark(finalState, verified.reason, { handoffState: verified.state, pr: verified.pr });
  log('dispatch.finished', {
    ...planFields,
    state: finalState,
    pr: verified.pr,
    head_sha: verified.headSha,
    exit_code: outcome.exitCode,
    ...(verified.reason ? { reason: verified.reason } : {}),
    // "Khong co ban giao" va "co mot ban giao trong nhu that nhung khong duoc tinh" phai la HAI
    // dong log khac nhau. Chi ghi MA — ma la sieu du lieu, con chi tiet (ai, so hieu nao) o lai
    // trong ket qua tra ve.
    ...(verified.rejected.length > 0
      ? { handoff_rejected: [...new Set(verified.rejected.map((r) => r.reason))].sort().join(',') }
      : {}),
  });

  return {
    ok: /** @type {const} */ (true),
    mode: MODES.EXECUTE,
    state: finalState,
    plan,
    promptDigest,
    argv,
    process: outcome,
    handoff: verified,
  };
}

/**
 * @param {(event: string, fields?: Record<string, unknown>) => unknown} log
 * @param {string} mode
 * @param {import('./errors.mjs').Denied} denied
 * @param {Record<string, unknown>} [fields]
 */
function refuse(log, mode, denied, fields = {}) {
  log('dispatch.refused', { ...fields, mode, reason: denied.reason });
  return denied;
}
