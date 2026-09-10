/**
 * POC-4 — risk policy, human exception, retry cap.
 *
 * The whole point is that automation FAILS CLOSED. There is exactly one path to
 * ELIGIBLE_FOR_AUTOMATION, everything else names a specific reason to stop, and a HIGH-risk
 * change cannot reach that path no matter how green everything else is.
 *
 * The policy lives in policy.json, not in this file. A policy expressed in prose is a
 * policy nobody can test, and a policy expressed in scattered `if` statements is a policy
 * nobody can read.
 */

export const OUTCOME = {
  ELIGIBLE: 'ELIGIBLE_FOR_AUTOMATION',
  HUMAN: 'HUMAN_APPROVAL_REQUIRED',
  BLOCKED_OVERLAP: 'BLOCKED_OVERLAP',
  BLOCKED_BUSINESS: 'BLOCKED_BUSINESS',
  BLOCKED_DATA: 'BLOCKED_DATA',
  BLOCKED_CI: 'BLOCKED_CI',
  BLOCKED_RUNTIME: 'BLOCKED_RUNTIME',
  BLOCKED_CI_RED: 'BLOCKED_CI_RED',
  BLOCKED_REVIEW: 'BLOCKED_REVIEW',
};

export const RISK = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };

/**
 * Classify a change. Paths and declared topics are both consulted, and the HIGHEST class
 * any single signal produces wins — a change that touches one auth file and forty README
 * files is an auth change.
 */
export function classifyRisk({ changedPaths = [], topics = [] }, policy) {
  const reasons = [];
  for (const pattern of policy.highRiskPathPatterns ?? []) {
    const re = new RegExp(pattern);
    for (const p of changedPaths) {
      if (re.test(p)) reasons.push(`path ${p} matches high-risk pattern ${pattern}`);
    }
  }
  for (const topic of topics) {
    if ((policy.highRiskTopics ?? []).includes(topic)) reasons.push(`topic ${topic} is high risk`);
  }
  if (reasons.length > 0) return { risk: RISK.HIGH, reasons };

  for (const pattern of policy.mediumRiskPathPatterns ?? []) {
    const re = new RegExp(pattern);
    for (const p of changedPaths) {
      if (re.test(p)) reasons.push(`path ${p} matches medium-risk pattern ${pattern}`);
    }
  }
  if (reasons.length > 0) return { risk: RISK.MEDIUM, reasons };
  return { risk: RISK.LOW, reasons: ['no path or topic matched a raised-risk pattern'] };
}

/**
 * Decide what may happen to a task.
 *
 * Order is deliberate. Structural blockers come first because they are the ones a human
 * must resolve before any amount of retrying could help; risk class comes last, so a
 * HIGH-risk change that is otherwise perfect lands on HUMAN_APPROVAL_REQUIRED rather than
 * being hidden behind an unrelated red gate.
 */
export function decide(task, policy) {
  const {
    changedPaths = [],
    topics = [],
    ownershipOverlapWith = [],
    // Every default below is the FAILING value. An undeclared gate is not a passed gate:
    // if the orchestrator forgets to report CI, the answer must be "I don't know", and
    // "I don't know" must never be worth the same as "green".
    customerAuthority = 'unknown',
    businessSource = 'unknown',
    ciAttempts = 0,
    runtimeAttempts = 0,
    ci = 'unknown',
    review = 'NONE',
  } = task ?? {};

  const { risk, reasons } = classifyRisk({ changedPaths, topics }, policy);
  const base = { risk, riskReasons: reasons };

  if (ownershipOverlapWith.length > 0) {
    return { ...base, outcome: OUTCOME.BLOCKED_OVERLAP, detail: { overlapWith: ownershipOverlapWith } };
  }
  if (businessSource !== 'present') {
    return { ...base, outcome: OUTCOME.BLOCKED_BUSINESS, detail: { businessSource } };
  }
  if (customerAuthority !== 'present') {
    return { ...base, outcome: OUTCOME.BLOCKED_DATA, detail: { customerAuthority } };
  }
  if (ciAttempts >= policy.maxAttempts.ci) {
    return { ...base, outcome: OUTCOME.BLOCKED_CI, detail: { ciAttempts, cap: policy.maxAttempts.ci } };
  }
  if (runtimeAttempts >= policy.maxAttempts.runtime) {
    return {
      ...base,
      outcome: OUTCOME.BLOCKED_RUNTIME,
      detail: { runtimeAttempts, cap: policy.maxAttempts.runtime },
    };
  }
  if (ci !== 'green') return { ...base, outcome: OUTCOME.BLOCKED_CI_RED, detail: { ci } };
  if (review !== 'ALLOW') return { ...base, outcome: OUTCOME.BLOCKED_REVIEW, detail: { review } };

  // Everything is green. Risk decides, and HIGH never buys its way through.
  if (policy.autoMerge?.[risk] !== true) {
    return { ...base, outcome: OUTCOME.HUMAN, detail: { autoMergeAllowedForRisk: false } };
  }
  return { ...base, outcome: OUTCOME.ELIGIBLE };
}
