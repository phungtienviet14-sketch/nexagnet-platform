/**
 * Thong diep giao thuc o dang VAN BAN (GitHub comment) <-> dang JSON canonical.
 *
 * Dang van ban:
 *
 *   <!-- AUTOPILOT_REVIEW_REQUEST_V0 -->      <- marker: dong dau tien, chinh xac dang nay
 *   REVIEW_REQUEST                            <- loai thong diep
 *   ISSUE=200                                 <- KEY=VALUE, moi dong mot truong
 *   PR=201
 *   HEAD_SHA=<40 hex>
 *   BLOCKERS:                                 <- KEY: mo mot danh sach
 *   - dong 1                                  <-   moi phan tu mot dong, bat dau bang "- "
 *   - dong 2
 *                                             <- dong trong: het payload, phan sau la loi nguoi
 *   Ghi chu tu do cho nguoi doc, bo qua.
 *
 * Fail-closed: bat ky dong nao trong khoi payload khong dung mot trong ba dang tren la LOI,
 * khong phai "bo qua". Marker nam trong trich dan (`> <!-- ... -->`) khong khop => khong phai
 * thong diep => khong kich hoat gi.
 */
import { FIELD_TYPES, MARKERS, MESSAGE_TYPES, PROTOCOL_VERSION } from './constants.mjs';
import { REASONS, deny } from './reasons.mjs';
import { validateMessagePayload } from './schemas.mjs';

const MARKER_LINE = /^<!--\s+([A-Z][A-Z0-9_]*_V0)\s+-->$/;
const TYPE_LINE = /^[A-Z][A-Z_]*$/;
const KEY_VALUE_LINE = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const LIST_HEAD_LINE = /^([A-Z][A-Z0-9_]*):$/;
const LIST_ITEM_LINE = /^- (.+)$/;

const KNOWN_MARKERS = new Set(Object.values(MARKERS));
const KNOWN_TYPES = /** @type {ReadonlySet<string>} */ (new Set(Object.values(MESSAGE_TYPES)));

/** Cac loai thong diep hop le duoi mot marker (CHATGPT_REVIEW_V0 mang hai loai). */
const TYPES_BY_MARKER = Object.values(MESSAGE_TYPES).reduce((acc, type) => {
  const marker = MARKERS[type];
  return { ...acc, [marker]: [...(acc[marker] ?? []), type] };
}, /** @type {Record<string, string[]>} */ ({}));

/**
 * @param {string} key
 * @param {string} raw
 * @returns {{ ok: true, value: string | number | boolean } | { ok: false, reason: string }}
 */
function coerceScalar(key, raw) {
  const kind = FIELD_TYPES[key];
  if (kind === undefined) return { ok: false, reason: REASONS.UNKNOWN_FIELD };
  if (kind === 'list') return { ok: false, reason: REASONS.MALFORMED_LINE };
  const value = raw.trim();
  if (kind === 'integer') {
    if (!/^[1-9][0-9]{0,15}$/.test(value)) return { ok: false, reason: REASONS.BAD_FIELD_VALUE };
    return { ok: true, value: Number(value) };
  }
  if (kind === 'boolean') {
    if (value !== 'true' && value !== 'false')
      return { ok: false, reason: REASONS.BAD_FIELD_VALUE };
    return { ok: true, value: value === 'true' };
  }
  if (value.length === 0) return { ok: false, reason: REASONS.BAD_FIELD_VALUE };
  return { ok: true, value };
}

/**
 * Tach van ban thanh payload JSON canonical. KHONG kiem schema — xem `readMessage`.
 * @param {string} text
 * @returns {{ ok: true, payload: Record<string, unknown> } | import('./reasons.mjs').Denied}
 */
export function parseMessage(text) {
  const lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());
  const markerLines = lines.map((l, i) => ({ l, i })).filter(({ l }) => MARKER_LINE.test(l));
  if (markerLines.length === 0) return deny(REASONS.NO_MARKER);
  if (markerLines.length > 1) return deny(REASONS.MULTIPLE_MARKERS, { count: markerLines.length });
  const { l: markerLine, i: markerIndex } = markerLines[0];
  // Marker phai la dong CO NOI DUNG DAU TIEN. Neu chi doi hoi "co mot marker o dau do" thi mot
  // comment cua nguoi — "gui anh xem thu:" roi dan mot vi du — se duoc doc thanh thong diep THAT.
  // Do duoc 03/09/2026: van xuoi dat truoc marker van cho ra mot REVIEW_PASS hop le. Van ban tu
  // do khong duoc phep kich hoat agent, nen cho nay fail closed.
  const firstContentIndex = lines.findIndex((line) => line.trim() !== '');
  if (markerIndex !== firstContentIndex) {
    return deny(REASONS.MARKER_NOT_FIRST_LINE, {
      markerLine: markerIndex + 1,
      firstContentLine: firstContentIndex + 1,
    });
  }
  const marker = /** @type {RegExpMatchArray} */ (markerLine.match(MARKER_LINE))[1];
  if (!KNOWN_MARKERS.has(marker)) return deny(REASONS.UNKNOWN_MARKER, { marker });

  let cursor = markerIndex + 1;
  while (cursor < lines.length && lines[cursor].trim() === '') cursor += 1;
  const typeLine = lines[cursor];
  if (typeLine === undefined || !TYPE_LINE.test(typeLine)) {
    return deny(REASONS.MISSING_TYPE_LINE, { marker });
  }
  const type = typeLine;
  if (!KNOWN_TYPES.has(type)) return deny(REASONS.UNKNOWN_MESSAGE_TYPE, { type });
  if (!TYPES_BY_MARKER[marker]?.includes(type)) {
    return deny(REASONS.MARKER_TYPE_MISMATCH, { marker, type });
  }

  /** @type {Record<string, unknown>} */
  const fields = {};
  /** @type {string | null} */
  let openList = null;
  for (cursor += 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    if (line.trim() === '') break;
    const item = line.match(LIST_ITEM_LINE);
    if (item && openList !== null) {
      fields[openList] = [.../** @type {string[]} */ (fields[openList]), item[1].trim()];
      continue;
    }
    const listHead = line.match(LIST_HEAD_LINE);
    const keyValue = line.match(KEY_VALUE_LINE);
    const key = listHead?.[1] ?? keyValue?.[1];
    if (!key) return deny(REASONS.MALFORMED_LINE, { line: cursor + 1, text: line });
    if (key in fields) return deny(REASONS.DUPLICATE_KEY, { key });
    if (listHead) {
      if (FIELD_TYPES[key] === undefined) return deny(REASONS.UNKNOWN_FIELD, { key });
      if (FIELD_TYPES[key] !== 'list')
        return deny(REASONS.MALFORMED_LINE, { line: cursor + 1, text: line });
      fields[key] = [];
      openList = key;
      continue;
    }
    openList = null;
    const rawValue = keyValue?.[2];
    if (rawValue === undefined)
      return deny(REASONS.MALFORMED_LINE, { line: cursor + 1, text: line });
    const scalar = coerceScalar(key, rawValue);
    if (!scalar.ok) return deny(scalar.reason, { key, text: line });
    fields[key] = scalar.value;
  }
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value) && value.length === 0) return deny(REASONS.EMPTY_LIST, { key });
  }
  const payload = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]));
  return { ok: true, payload: { protocol: PROTOCOL_VERSION, marker, type, ...payload } };
}

/**
 * Doc mot comment: tach + kiem schema. Day la ham orchestrator goi truoc khi lam bat ky gi.
 * @param {string} text
 * @returns {{ ok: true, message: Record<string, unknown> } | import('./reasons.mjs').Denied}
 */
export function readMessage(text) {
  const parsed = parseMessage(text);
  if (!parsed.ok) return parsed;
  const type = /** @type {string} */ (parsed.payload.type);
  const checked = validateMessagePayload(type, parsed.payload);
  if (!checked.ok) return checked;
  return { ok: true, message: parsed.payload };
}

/**
 * JSON canonical -> van ban. Doi xung voi parseMessage (roundtrip co test).
 * @param {Record<string, unknown>} message
 */
export function formatMessage(message) {
  const { protocol, marker, type, ...rest } = message;
  if (protocol !== PROTOCOL_VERSION) throw new Error(`protocol phai la ${PROTOCOL_VERSION}`);
  const body = Object.entries(rest).flatMap(([key, value]) => {
    const upper = key.toUpperCase();
    if (Array.isArray(value)) return [`${upper}:`, ...value.map((item) => `- ${item}`)];
    return [`${upper}=${String(value)}`];
  });
  return [`<!-- ${marker} -->`, String(type), ...body].join('\n');
}
