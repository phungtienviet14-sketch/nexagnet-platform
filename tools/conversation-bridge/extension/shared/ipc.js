/**
 * IPC GIUA NATIVE HOST VA TIEN ICH — mot kenh HEP CO Y.
 *
 * Duong ong Native Messaging la ranh gioi tin cay cuoi cung truoc khi cham vao mot tab dang dang
 * nhap cua nguoi dung. Neu no cho di qua mot doi tuong tuy y, thi bat ky loi nao o phia Node —
 * mot bug parse, mot tep cau hinh bi sua, mot tien trinh bi thay the — deu tro thanh mot duong
 * viet chu tuy y vao ChatGPT.
 *
 * Nen o day kenh chi mang BA loai khung, moi khung co tap truong DONG:
 *
 *   HOST -> TIEN ICH   WAKE    { v, kind, key, repo, pr, headSha }
 *   TIEN ICH -> HOST   RESULT  { v, kind, key, state, reason }
 *   TIEN ICH -> HOST   HELLO   { v, kind }
 *
 * Chu y truong KHONG co trong `WAKE`: **khong co truong van ban**. Tien ich TU DUNG tin nhan tu
 * `buildWakeMessage(repo, pr, headSha)`. Do la khac biet quan trong nhat cua tep nay: ke ca khi
 * phia Node bi thay the hoan toan, no van chi doc duoc ba nguyen thuy da kiem hinh dang, va cai
 * di vao khung soan van la ban mau cua repo nay.
 */

export const IPC_VERSION = 1;

export const IPC_KINDS = Object.freeze({
  WAKE: 'WAKE',
  RESULT: 'RESULT',
  HELLO: 'HELLO',
});

/**
 * Tap truong DONG cua tung loai khung. Thua mot truong = tu choi, khong phai bo qua.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
const FRAME_FIELDS = Object.freeze({
  [IPC_KINDS.WAKE]: Object.freeze(['v', 'kind', 'key', 'repo', 'pr', 'headSha']),
  [IPC_KINDS.RESULT]: Object.freeze(['v', 'kind', 'key', 'state', 'reason']),
  [IPC_KINDS.HELLO]: Object.freeze(['v', 'kind']),
});

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const KEY_PATTERN =
  /^conversation-bridge:[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+:[1-9][0-9]{0,15}:[0-9a-f]{40}$/;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * @param {Record<string, unknown>} frame
 * @param {string} kind
 * @returns {string | null} ma loi, hoac `null` neu tap truong dung y nguyen
 */
function checkFieldSet(frame, kind) {
  const expected = FRAME_FIELDS[kind];
  const actual = Object.keys(frame).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length) return 'FRAME_FIELD_SET_MISMATCH';
  for (let i = 0; i < wanted.length; i += 1) {
    if (actual[i] !== wanted[i]) return 'FRAME_FIELD_SET_MISMATCH';
  }
  return null;
}

/**
 * Doc mot khung da giai ma JSON. FAIL-CLOSED: bat ky sai lech nao la tu choi co ma.
 * @param {unknown} value
 * @returns {{ ok: true, frame: Record<string, unknown> } | { ok: false, error: string }}
 */
export function decodeFrame(value) {
  if (!isPlainObject(value)) return { ok: false, error: 'FRAME_NOT_OBJECT' };
  if (value.v !== IPC_VERSION) return { ok: false, error: 'FRAME_VERSION_MISMATCH' };
  const kind = value.kind;
  if (typeof kind !== 'string' || !(kind in FRAME_FIELDS)) {
    return { ok: false, error: 'FRAME_KIND_UNKNOWN' };
  }
  const fieldError = checkFieldSet(value, kind);
  if (fieldError) return { ok: false, error: fieldError };
  if (kind === IPC_KINDS.HELLO) return { ok: true, frame: Object.freeze({ ...value }) };
  if (typeof value.key !== 'string' || !KEY_PATTERN.test(value.key)) {
    return { ok: false, error: 'FRAME_KEY_INVALID' };
  }
  if (kind === IPC_KINDS.RESULT) {
    if (typeof value.state !== 'string' || !CODE_PATTERN.test(value.state)) {
      return { ok: false, error: 'FRAME_STATE_INVALID' };
    }
    if (typeof value.reason !== 'string' || !CODE_PATTERN.test(value.reason)) {
      return { ok: false, error: 'FRAME_REASON_INVALID' };
    }
    return { ok: true, frame: Object.freeze({ ...value }) };
  }
  if (typeof value.repo !== 'string' || !REPO_PATTERN.test(value.repo)) {
    return { ok: false, error: 'FRAME_REPO_INVALID' };
  }
  if (!Number.isSafeInteger(value.pr) || Number(value.pr) < 1) {
    return { ok: false, error: 'FRAME_PR_INVALID' };
  }
  if (typeof value.headSha !== 'string' || !SHA40_PATTERN.test(value.headSha)) {
    return { ok: false, error: 'FRAME_HEAD_SHA_INVALID' };
  }
  return { ok: true, frame: Object.freeze({ ...value }) };
}

/**
 * @param {{ key: string, repo: string, pr: number, headSha: string }} input
 * @returns {{ v: number, kind: string, key: string, repo: string, pr: number, headSha: string }}
 */
export function wakeFrame({ key, repo, pr, headSha }) {
  const frame = { v: IPC_VERSION, kind: IPC_KINDS.WAKE, key, repo, pr, headSha };
  const decoded = decodeFrame(frame);
  if (!decoded.ok) throw new Error(`Khung WAKE tu dung khong hop le: ${decoded.error}`);
  return frame;
}

/**
 * @param {{ key: string, state: string, reason: string }} input
 */
export function resultFrame({ key, state, reason }) {
  const frame = { v: IPC_VERSION, kind: IPC_KINDS.RESULT, key, state, reason };
  const decoded = decodeFrame(frame);
  if (!decoded.ok) throw new Error(`Khung RESULT tu dung khong hop le: ${decoded.error}`);
  return frame;
}

/** @returns {{ v: number, kind: string }} */
export const helloFrame = () => ({ v: IPC_VERSION, kind: IPC_KINDS.HELLO });
