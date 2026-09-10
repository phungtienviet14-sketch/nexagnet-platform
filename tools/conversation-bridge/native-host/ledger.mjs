/**
 * SO KHOA GIAO BEN — "da danh thuc cho HEAD nay chua" phai song qua mot lan khoi dong lai.
 *
 * BA QUYET DINH, va ca ba deu nghieng ve phia "tha bo lo con hon lam phien":
 *
 *   · GHI TRUOC KHI GIAO. `withAttempt` duoc ghi xuong dia TRUOC khi khung WAKE roi khoi tien
 *     trinh. Neu may sap nguon dung giua chung, lan chay sau thay khoa da ton tai va KHONG gui lai.
 *     Dinh nghia dat duoc la AT-MOST-ONCE. Exactly-once khong the dat duoc o day va ta khong khai
 *     la dat duoc — giua "da ghi khoa" va "chu da nam trong khung soan" co mot ranh gioi tien
 *     trinh + mot ranh gioi trinh duyet, va khong ranh gioi nao co giao dich.
 *
 *   · SO HONG = DUNG, khong phai = rong. Mot so doc khong ra khong duoc coi nhu "chua giao lan
 *     nao": do dung la cach lam mot lan khoi dong lai bien thanh mot tran tin nhan lap. Hong thi
 *     tu choi chay, va doi mot con nguoi.
 *
 *   · GHI NGUYEN TU. Ghi ra tep tam roi `rename` de trong. `rename` trong cung mot he tep la
 *     nguyen tu, nen khong bao gio ton tai mot so bi cat doi — ma mot so bi cat doi thi theo luat
 *     tren se lam cau noi dung han.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const LEDGER_VERSION = 1;

/** @typedef {{ version: number, records: Readonly<Record<string, { state: string, at: string }>> }} Ledger */

/** @returns {Ledger} */
export const emptyLedger = () =>
  Object.freeze({ version: LEDGER_VERSION, records: Object.freeze({}) });

/**
 * @param {string} path
 * @returns {{ ok: true, ledger: Ledger } | { ok: false, error: string }}
 */
export function loadLedger(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return { ok: true, ledger: emptyLedger() };
    }
    return { ok: false, error: 'LEDGER_UNREADABLE' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'LEDGER_CORRUPT' };
  }
  if (typeof parsed !== 'object' || parsed === null || parsed.version !== LEDGER_VERSION) {
    return { ok: false, error: 'LEDGER_CORRUPT' };
  }
  const records = parsed.records;
  if (typeof records !== 'object' || records === null || Array.isArray(records)) {
    return { ok: false, error: 'LEDGER_CORRUPT' };
  }
  for (const value of Object.values(records)) {
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof (/** @type {any} */ (value).state) !== 'string' ||
      typeof (/** @type {any} */ (value).at) !== 'string'
    ) {
      return { ok: false, error: 'LEDGER_CORRUPT' };
    }
  }
  return {
    ok: true,
    ledger: Object.freeze({ version: LEDGER_VERSION, records: Object.freeze({ ...records }) }),
  };
}

/** @param {Ledger} ledger @param {string} key */
export const hasKey = (ledger, key) => Object.prototype.hasOwnProperty.call(ledger.records, key);

/**
 * @param {Ledger} ledger
 * @param {string} key
 * @param {string} state
 * @param {string} at
 * @returns {Ledger}
 */
export const withRecord = (ledger, key, state, at) =>
  Object.freeze({
    version: LEDGER_VERSION,
    records: Object.freeze({ ...ledger.records, [key]: Object.freeze({ state, at }) }),
  });

/**
 * Go DUNG MOT khoa. Khong co ham nao xoa nhieu khoa, va do la co y: "xoa het so" chinh la cach
 * bien mot lan hoi phuc co dich thanh mot tran phat lai moi carrier cu (xem `reset-request.js`).
 *
 * Khoa khong ton tai thi tra ve chinh so cu — nguoi goi phai kiem `hasKey` truoc do de con phan
 * biet duoc "da go" voi "khong co gi de go".
 *
 * @param {Ledger} ledger
 * @param {string} key
 * @returns {Ledger}
 */
export function withoutRecord(ledger, key) {
  if (!hasKey(ledger, key)) return ledger;
  /** @type {Record<string, { state: string, at: string }>} */
  const records = {};
  for (const [existing, value] of Object.entries(ledger.records)) {
    if (existing !== key) records[existing] = value;
  }
  return Object.freeze({ version: LEDGER_VERSION, records: Object.freeze(records) });
}

/**
 * @param {string} path
 * @param {Ledger} ledger
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function saveLedger(path, ledger) {
  const temp = `${path}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
    renameSync(temp, path);
    return { ok: true };
  } catch {
    return { ok: false, error: 'LEDGER_UNWRITABLE' };
  }
}
