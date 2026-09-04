/**
 * @netviet/autopilot-protocol — diem vao thu vien.
 *
 * Tai lieu: docs/phat-trien/van-hanh/autopilot-protocol-v0.md
 */
export {
  ACTORS,
  EVENTS,
  FIELD_TYPES,
  HIGH_RISK_AREAS,
  MARKERS,
  MESSAGE_PRODUCERS,
  MESSAGE_TYPES,
  PRINCIPAL_KINDS,
  PROTOCOL_VERSION,
  RETRY_CEILINGS,
  RISK_LEVELS,
  ROLE_CONFLICTS,
  STATES,
  STATE_LABELS,
  STATE_LABEL_PREFIX,
  TERMINAL_STATES,
} from './constants.mjs';
export {
  authorizeProducer,
  definePrincipalRegistry,
  isPrincipal,
  principalFromGithubEvent,
  rolesOf,
} from './principal.mjs';
export { REASONS } from './reasons.mjs';
export {
  SCHEMA_PATHS,
  formatSchemaErrors,
  listMessageSchemaFiles,
  validateMessagePayload,
  validateTaskContractSchema,
} from './schemas.mjs';
export { formatMessage, parseMessage, readMessage } from './messages.mjs';
export { extractTaskContract, validateTaskContract } from './task-contract.mjs';
export { NO_STATE, TRANSITIONS, isTerminal, legalEventsFrom, nextState } from './state-machine.mjs';
export { claimKey, createLedger, idempotencyKeyFor } from './idempotency.mjs';
export {
  evaluateCiGreen,
  evaluateMergeGate,
  evaluateRetry,
  evaluateReviewRequestGate,
  evaluateReviewVerdict,
  evaluateTaskDoneGate,
  isAutoMergeEligible,
  requiredChecksFromRuleset,
} from './gates.mjs';
export { applyException, applyMerge, applyMessage, createTask } from './protocol.mjs';
