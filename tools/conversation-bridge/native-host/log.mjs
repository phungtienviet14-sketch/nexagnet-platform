/**
 * LOG CO CAU TRUC — mot danh sach trang, va mot rang buoc ve HINH DANG GIA TRI.
 *
 * §11 cua #204 liet ke chin truong duoc phep. Nhung mot danh sach trang chi theo TEN truong van
 * de thung: khong gi ngan mot ban sua tuong lai nhet ca than comment vao `error_code`. Nen o day
 * co cong thu hai — GIA TRI phai la so, boolean, hoac mot chuoi ngan trong bang chu cai hep
 * (`A-Z a-z 0-9 . _ : / -`). Mot doan van ban tu do co dau cach, dau cau, xuong dong deu truot
 * khoi bang chu cai do va bi bo.
 *
 * Cong nay la ly do `sanitizeLogRecord` khong nem: no BO truong sai chu khong lam do mot lan chay.
 * Quan sat khong duoc phep la mot phu thuoc cua thanh cong nghiep vu (cung nguyen tac voi
 * `TelemetryService` cua apps/api).
 *
 * `ts` khong nam trong chin truong cua §11 va do la co y: no do CHINH bo ghi log sinh ra tu dong
 * ho he thong, khong bao gio den tu dau vao, nen no khong the mang noi dung.
 */

/** Chin truong cua #204 §11. Ten khac se bi bo, khong duoc doi ten cho tien. */
export const ALLOWED_LOG_FIELDS = Object.freeze([
  'state',
  'repo',
  'pr',
  'head_sha',
  'idempotency_key_hash',
  'github_status',
  'bridge_status',
  'conversation_target_hash',
  'error_code',
]);

const SAFE_STRING = /^[A-Za-z0-9._:/-]{1,200}$/;

/**
 * @param {Record<string, unknown>} record
 * @returns {Record<string, string | number | boolean>}
 */
export function sanitizeLogRecord(record) {
  /** @type {Record<string, string | number | boolean>} */
  const safe = {};
  if (typeof record !== 'object' || record === null) return safe;
  for (const field of ALLOWED_LOG_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const value = record[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[field] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      safe[field] = value;
      continue;
    }
    if (typeof value === 'string' && SAFE_STRING.test(value)) {
      safe[field] = value;
    }
  }
  return safe;
}

/**
 * Bo ghi log. Viet ra `stderr` CO CHU DICH: `stdout` la duong ong Native Messaging, va mot dong
 * log lac vao do se lam Chrome doc phai mot khung rac roi ngat ket noi.
 * @param {{ write?: (line: string) => void, now?: () => string }} [options]
 */
export function createLogger({
  write = (line) => process.stderr.write(line),
  now = () => new Date().toISOString(),
} = {}) {
  return {
    /** @param {Record<string, unknown>} record */
    emit(record) {
      const safe = sanitizeLogRecord(record);
      write(`${JSON.stringify({ ts: now(), ...safe })}\n`);
      return safe;
    },
  };
}
