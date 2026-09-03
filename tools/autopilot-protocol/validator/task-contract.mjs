/**
 * Hop dong task (Task Contract) — mot Issue = mot hop dong.
 *
 * Hai lop kiem:
 *   1. schema (hinh dang, truong bat buoc, kieu)       -> schemas.mjs
 *   2. ngu nghia (quan he giua cac truong)             -> o day
 *
 * Lop 2 ton tai vi schema khong noi duoc "HIGH thi phai co nguoi": mot hop dong HIGH ma
 * human_gate=false la mot hop dong tu mo duong auto-merge cho chinh no — bi tu choi.
 */
import { MARKERS, RISK_LEVELS } from './constants.mjs';
import { REASONS, deny } from './reasons.mjs';
import { validateTaskContractSchema } from './schemas.mjs';

/**
 * @typedef {object} TaskContract
 * @property {'V0'} protocol
 * @property {string} task_id
 * @property {number} [issue]
 * @property {string} [title]
 * @property {string} goal
 * @property {string} context
 * @property {string[]} scope
 * @property {string[]} out_of_scope
 * @property {string[]} acceptance
 * @property {'LOW'|'MEDIUM'|'HIGH'} risk
 * @property {string[]} [risk_areas]
 * @property {boolean} human_gate
 * @property {Array<Record<string, unknown>>} dependencies
 * @property {{ required: boolean, env?: string, checks?: string[] }} runtime_proof
 */

/**
 * Kiem day du mot payload hop dong (schema + ngu nghia).
 * @param {unknown} payload
 * @returns {{ ok: true, contract: TaskContract } | import('./reasons.mjs').Denied}
 */
export function validateTaskContract(payload) {
  const shape = validateTaskContractSchema(payload);
  if (!shape.ok) return shape;
  const contract = /** @type {TaskContract} */ (payload);
  if (contract.risk === RISK_LEVELS.HIGH && contract.human_gate !== true) {
    return deny(REASONS.HIGH_RISK_REQUIRES_HUMAN_GATE, {
      risk: contract.risk,
      human_gate: contract.human_gate,
    });
  }
  const areas = contract.risk_areas ?? [];
  if (areas.length > 0 && contract.risk !== RISK_LEVELS.HIGH) {
    return deny(REASONS.RISK_UNDERSTATED_FOR_AREAS, { risk: contract.risk, risk_areas: areas });
  }
  return { ok: true, contract };
}

const CONTRACT_MARKER_LINE = new RegExp(`^<!--\\s+${MARKERS.TASK_CONTRACT}\\s+-->$`);
const FENCE_OPEN = /^```json\s*$/;
const FENCE_CLOSE = /^```\s*$/;

/**
 * Lay hop dong may doc ra khoi than mot Issue: marker `<!-- AUTOPILOT_TASK_V0 -->` roi khoi
 * ```json dau tien SAU marker. Phan van xuoi con lai la ban nguoi doc, khong bi dong den.
 * @param {string} issueBody
 * @returns {{ ok: true, contract: TaskContract, raw: Record<string, unknown> } | import('./reasons.mjs').Denied}
 */
export function extractTaskContract(issueBody) {
  const lines = String(issueBody ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());
  const markerIndex = lines.findIndex((line) => CONTRACT_MARKER_LINE.test(line));
  if (markerIndex < 0)
    return deny(REASONS.CONTRACT_MARKER_MISSING, { marker: MARKERS.TASK_CONTRACT });
  const openIndex = lines.findIndex((line, i) => i > markerIndex && FENCE_OPEN.test(line));
  if (openIndex < 0) return deny(REASONS.CONTRACT_BLOCK_MISSING);
  const closeIndex = lines.findIndex((line, i) => i > openIndex && FENCE_CLOSE.test(line));
  if (closeIndex < 0) return deny(REASONS.CONTRACT_BLOCK_MISSING, { unterminated: true });
  const jsonText = lines.slice(openIndex + 1, closeIndex).join('\n');
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(jsonText);
  } catch (error) {
    return deny(REASONS.CONTRACT_BLOCK_NOT_JSON, { message: /** @type {Error} */ (error).message });
  }
  const checked = validateTaskContract(raw);
  if (!checked.ok) return checked;
  return {
    ok: true,
    contract: checked.contract,
    raw: /** @type {Record<string, unknown>} */ (raw),
  };
}
