/**
 * POC-5 — GitHub as the engineering state machine.
 *
 * The question is not "can labels be changed by a script". It is whether a second run of
 * the same resolver, on the same state, does nothing — because in an event-driven system
 * every event WILL be delivered more than once, and an orchestrator that starts a task
 * twice is worse than one that never starts it at all.
 *
 * So the resolver is a pure function of observed state. It holds no memory of its own: the
 * record that a task was dispatched lives on the issue, where the next run can see it.
 */

export const STATE = {
  READY: 'agent:ready',
  RUNNING: 'agent:running',
  REVIEWING: 'agent:reviewing',
  FIXING: 'agent:fixing',
  RUNTIME_PROOF: 'agent:runtime-proof',
  DONE: 'agent:done',
};

export const BLOCKED = {
  BUSINESS: 'blocked:business',
  DATA: 'blocked:data',
  SECURITY: 'blocked:security',
  OVERLAP: 'blocked:overlap',
  RUNTIME: 'blocked:runtime',
  CI: 'blocked:ci',
};

export const DEPENDS_ON = 'AUTOPILOT_DEPENDS_ON';
export const DISPATCH_MARKER = 'AUTOPILOT_DISPATCHED';

const DEP_LINE = /^\s*AUTOPILOT_DEPENDS_ON\s*=\s*#?(\d+)\s*$/gm;

/** Dependencies are declared in the issue body, machine-readably. Prose is not a graph. */
export function parseDependencies(body) {
  const out = [];
  for (const m of String(body ?? '').matchAll(DEP_LINE)) out.push(Number(m[1]));
  return [...new Set(out)];
}

export function hasBeenDispatched(issue) {
  return (issue?.comments ?? []).some((c) => String(c?.body ?? '').includes(DISPATCH_MARKER));
}

const labelsOf = (issue) =>
  (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);

/** Complete means closed, or explicitly labelled done. Nothing else counts. */
export function isComplete(issue) {
  if (!issue) return false;
  return issue.state === 'closed' || labelsOf(issue).includes(STATE.DONE);
}

export function isBlocked(issue) {
  const blockers = Object.values(BLOCKED);
  return labelsOf(issue).filter((l) => blockers.includes(l));
}

/**
 * Decide what should happen to one issue, given every issue the resolver can see.
 *
 * Returns a single outcome plus the evidence behind it. Never returns "maybe".
 */
export function resolveIssue(issue, byNumber) {
  const number = issue.number;
  const blockers = isBlocked(issue);
  if (blockers.length > 0) {
    return { number, action: 'HOLD', reason: 'ISSUE_IS_BLOCKED', detail: { blockers } };
  }
  if (isComplete(issue)) {
    return { number, action: 'HOLD', reason: 'ALREADY_COMPLETE' };
  }

  const deps = parseDependencies(issue.body);
  const missing = deps.filter((d) => !byNumber.has(d));
  if (missing.length > 0) {
    return { number, action: 'HOLD', reason: 'DEPENDENCY_NOT_VISIBLE', detail: { missing } };
  }
  if (deps.includes(number)) {
    return { number, action: 'HOLD', reason: 'DEPENDS_ON_ITSELF' };
  }

  const unmet = deps.filter((d) => !isComplete(byNumber.get(d)));
  if (unmet.length > 0) {
    return { number, action: 'HOLD', reason: 'DEPENDENCY_NOT_COMPLETE', detail: { unmet } };
  }

  // Dependencies are satisfied. The only thing standing between here and a dispatch is
  // whether we already did it.
  if (hasBeenDispatched(issue)) {
    return { number, action: 'HOLD', reason: 'ALREADY_DISPATCHED' };
  }
  return {
    number,
    action: 'DISPATCH',
    reason: 'DEPENDENCIES_SATISFIED',
    detail: { addLabel: STATE.READY, dependencies: deps },
  };
}

export function resolve(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const byNumber = new Map(list.map((i) => [i.number, i]));
  return list.map((i) => resolveIssue(i, byNumber));
}
