/**
 * CONG NGHIEP VU cua giao thuc — cac quy tac ma schema khong dien ta duoc.
 *
 * Moi ham o day THUAN: nhan du lieu, tra `{ ok: true }` hoac `{ ok: false, reason, detail }`.
 * Khong ham nao goi GitHub. Orchestrator (task sau) lay bang chung tu GitHub roi dua vao day.
 *
 *   Exact-SHA : phan xet review chi co gia tri cho DUNG HEAD no neu ten.
 *   CI        : REVIEW_REQUEST chi khi MOI required check xanh tren DUNG HEAD.
 *   Risk      : HIGH (hoac human_gate) => KHONG co duong auto-merge.
 *   Retry     : vong sua co tran; can tran => BLOCKED.
 *   Runtime   : DONE can RUNTIME_PROOF PASS cho DUNG release, DUNG env, neu hop dong doi.
 *               Claim != Proof: RUNTIME_VERIFIED=true ma khong co proof la loi khai.
 */
import { MESSAGE_TYPES, RETRY_CEILINGS, RISK_LEVELS } from './constants.mjs';
import { REASONS, deny, ok } from './reasons.mjs';

/**
 * @typedef {{ name: string, conclusion: string | null, head_sha?: string }} CheckRun
 * @typedef {{ type: string, head_sha: string, pr: number }} Verdict
 * @typedef {{ release_sha: string, env: string, verdict: 'PASS' | 'FAIL' }} RuntimeProof
 */

/**
 * Doc danh sach required check tu ruleset (`.github/rulesets/main-protection.json`).
 * Khong hard-code 7 cai ten: ruleset la nguon, va doi ten job la phai doi ruleset (xem
 * docs/phat-trien/van-hanh/github-governance.md §2.1).
 * @param {unknown} ruleset
 * @returns {string[]}
 */
export function requiredChecksFromRuleset(ruleset) {
  const rules =
    /** @type {{ rules?: Array<{ type?: string, parameters?: { required_status_checks?: Array<{ context?: string }> } }> }} */ (
      ruleset ?? {}
    ).rules;
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((rule) => rule?.type === 'required_status_checks')
    .flatMap((rule) => rule.parameters?.required_status_checks ?? [])
    .flatMap((check) =>
      typeof check?.context === 'string' && check.context.length > 0 ? [check.context] : [],
    )
    .sort();
}

/**
 * MOI required check phai co mot check-run tren dung HEAD voi conclusion=success.
 * Thieu mot check = chua xanh. Check cua HEAD khac = khong tinh.
 * @param {{ headSha: string, checkRuns: CheckRun[] | undefined, requiredChecks: string[] | undefined }} input
 */
export function evaluateCiGreen({ headSha, checkRuns, requiredChecks }) {
  if (!Array.isArray(requiredChecks) || requiredChecks.length === 0)
    return deny(REASONS.NO_REQUIRED_CHECKS);
  if (!Array.isArray(checkRuns)) return deny(REASONS.CI_EVIDENCE_MISSING, { headSha });
  const onHead = checkRuns.filter((run) => run.head_sha === undefined || run.head_sha === headSha);
  const missing = requiredChecks.filter((name) => !onHead.some((run) => run.name === name));
  if (missing.length > 0) return deny(REASONS.CI_CHECK_MISSING, { headSha, missing });
  const notGreen = requiredChecks.filter((name) =>
    onHead.filter((run) => run.name === name).some((run) => run.conclusion !== 'success'),
  );
  if (notGreen.length > 0) return deny(REASONS.CI_CHECK_NOT_GREEN, { headSha, notGreen });
  return ok();
}

/**
 * REVIEW_REQUEST: HEAD trong thong diep phai la HEAD hien tai cua PR, va CI phai xanh tren no.
 * @param {{ message: { head_sha: string }, currentHeadSha: string, checkRuns?: CheckRun[], requiredChecks?: string[] }} input
 */
export function evaluateReviewRequestGate({ message, currentHeadSha, checkRuns, requiredChecks }) {
  if (message.head_sha !== currentHeadSha) {
    return deny(REASONS.HEAD_MISMATCH, { claimed: message.head_sha, current: currentHeadSha });
  }
  return evaluateCiGreen({ headSha: currentHeadSha, checkRuns, requiredChecks });
}

/**
 * Exact-SHA: mot phan xet chi hien hanh khi HEAD no neu ten == HEAD hien tai.
 * @param {{ verdict: { head_sha: string }, currentHeadSha: string }} input
 */
export function evaluateReviewVerdict({ verdict, currentHeadSha }) {
  if (verdict.head_sha !== currentHeadSha) {
    return deny(REASONS.STALE_VERDICT, {
      verdictHead: verdict.head_sha,
      currentHead: currentHeadSha,
    });
  }
  return ok();
}

/** Duong auto-merge chi mo cho LOW/MEDIUM khong co human_gate. */
export const isAutoMergeEligible = (
  /** @type {{ risk: string, humanGate: boolean }} */ { risk, humanGate },
) => risk !== RISK_LEVELS.HIGH && humanGate !== true;

/**
 * Cong merge: rui ro + phan xet hien hanh. Thu tu kiem co chu dich — rui ro truoc, vi mot
 * REVIEW_PASS cua ChatGPT KHONG BAO GIO thay the duoc nguoi o task HIGH.
 *
 * `humanApproval` la BANG CHUNG BUOC VAO SHA (`{ head_sha }`), khong phai mot boolean. Quy tac
 * exact-SHA da ap cho phan xet cua may thi cang phai ap cho cong manh nhat cua giao thuc: mot cu
 * duyet o HEAD A khong duoc mo merge cho HEAD B. Do duoc 03/09/2026: voi boolean, duyet o HEAD A
 * mo duoc merge cua HEAD B — dung kieu fail-open ma muc 13 (Claim != Proof) cam.
 * @param {{ risk: string, humanGate: boolean, humanApproval?: { head_sha: string } | null, currentHeadSha: string | null, verdicts: Verdict[] }} input
 */
export function evaluateMergeGate({ risk, humanGate, humanApproval, currentHeadSha, verdicts }) {
  if (risk === RISK_LEVELS.HIGH || humanGate === true) {
    const missing =
      risk === RISK_LEVELS.HIGH
        ? REASONS.HIGH_RISK_REQUIRES_HUMAN
        : REASONS.HUMAN_GATE_REQUIRES_HUMAN;
    if (!humanApproval?.head_sha) return deny(missing, { risk, humanGate });
    if (humanApproval.head_sha !== currentHeadSha) {
      return deny(REASONS.STALE_HUMAN_APPROVAL, {
        approvedHead: humanApproval.head_sha,
        currentHead: currentHeadSha,
      });
    }
  }
  if (!currentHeadSha) return deny(REASONS.NO_CURRENT_REVIEW_PASS, { currentHead: null });
  const current = [...verdicts].reverse().find((v) => v.head_sha === currentHeadSha);
  if (!current || current.type !== MESSAGE_TYPES.REVIEW_PASS) {
    return deny(REASONS.NO_CURRENT_REVIEW_PASS, {
      currentHead: currentHeadSha,
      latestVerdict: current?.type ?? null,
    });
  }
  return ok();
}

/**
 * Tran vong sua. `attemptsUsed` = so lan da sua; lan sap toi la attemptsUsed + 1.
 * @param {{ loop: 'ci' | 'review', attemptsUsed: number, ceilings?: typeof RETRY_CEILINGS }} input
 * @returns {{ ok: true, attempt: number, ceiling: number } | import('./reasons.mjs').Denied}
 */
export function evaluateRetry({ loop, attemptsUsed, ceilings = RETRY_CEILINGS }) {
  const ceiling = loop === 'ci' ? ceilings.MAX_CI_FIX_ATTEMPTS : ceilings.MAX_REVIEW_FIX_ATTEMPTS;
  const attempt = attemptsUsed + 1;
  if (attempt > ceiling)
    return deny(REASONS.RETRY_CEILING_EXHAUSTED, { loop, attemptsUsed, ceiling });
  return { ok: true, attempt, ceiling };
}

/**
 * Cong dong task. Xem dau tep cho quy tac.
 * @param {{ runtimeProof: { required: boolean, env?: string }, message: { merge_sha: string, runtime_verified: boolean }, proofs: RuntimeProof[] }} input
 */
export function evaluateTaskDoneGate({ runtimeProof, message, proofs }) {
  const forRelease = proofs.filter((p) => p.release_sha === message.merge_sha);
  const matching = runtimeProof.env
    ? forRelease.filter((p) => p.env === runtimeProof.env)
    : forRelease;
  const latest = matching.at(-1);
  if (latest?.verdict === 'FAIL')
    return deny(REASONS.RUNTIME_PROOF_FAILED, { release: message.merge_sha, env: latest.env });
  if (runtimeProof.required) {
    if (!latest) {
      if (forRelease.length > 0) {
        return deny(REASONS.RUNTIME_PROOF_ENV_MISMATCH, {
          expectedEnv: runtimeProof.env,
          seen: forRelease.map((p) => p.env),
        });
      }
      if (proofs.some((p) => p.env === runtimeProof.env)) {
        return deny(REASONS.RUNTIME_PROOF_RELEASE_MISMATCH, { expectedRelease: message.merge_sha });
      }
      return deny(REASONS.RUNTIME_PROOF_MISSING, {
        release: message.merge_sha,
        env: runtimeProof.env,
      });
    }
    if (message.runtime_verified !== true) return deny(REASONS.RUNTIME_VERIFIED_FLAG_REQUIRED);
    return ok();
  }
  if (message.runtime_verified === true && latest?.verdict !== 'PASS') {
    return deny(REASONS.RUNTIME_VERIFIED_CLAIM_WITHOUT_PROOF, { release: message.merge_sha });
  }
  return ok();
}
