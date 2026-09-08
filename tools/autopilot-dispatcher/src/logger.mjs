/**
 * Log co CAU TRUC voi DANH SACH TRANG — khong phai voi bo loc den.
 *
 * Bo loc den ("xoa cai gi trong nhu token") sai theo thoi gian: ngay nao them mot truong moi la
 * ngay do co the ro. Danh sach trang sai theo huong an toan: truong moi khong duoc khai bao thi
 * KHONG RA log, va so luong bi bo duoc dem lai de nguoi doc thay minh dang thieu gi.
 *
 * Nhung thu KHONG BAO GIO co ten trong danh sach nay, va do la ly do no ton tai:
 *   - `process.env` hay bat ky manh nao cua no;
 *   - noi dung prompt (chi co `prompt_digest`);
 *   - van xuoi cua hop dong task (goal/context/scope...);
 *   - stdout/stderr cua Claude (chi co so BYTE);
 *   - header, cookie, token.
 */

/**
 * Moi khoa duoc phep xuat hien trong mot dong log. Them khoa moi la mot quyet dinh CO Y THUC.
 */
export const ALLOWED_LOG_FIELDS = Object.freeze([
  'event',
  'ts',
  'mode',
  'repo',
  'issue',
  'task_id',
  'base_sha',
  'branch',
  'worktree_label',
  'contract_digest',
  'prompt_digest',
  'trigger_principal',
  'state',
  'reason',
  'detail_code',
  'pr',
  'head_sha',
  // MA cua nhung comment ban giao bi tu choi — khong bao gio danh tinh hay noi dung. Them khoa
  // nay la mot quyet dinh co y: neu khong co no, "chua ban giao" va "co ke dan mot BUILD_READY
  // gia" la cung mot dong log.
  'handoff_rejected',
  'exit_code',
  'signal',
  'duration_ms',
  'model',
  'effort',
  'permission_prompts',
  'claude_version',
  'stdout_bytes',
  'stderr_bytes',
  'lock_pid',
  'ledger_key',
  'dropped_fields',
]);

const ALLOWED = new Set(ALLOWED_LOG_FIELDS);

/**
 * Gia tri nguyen thuy duoc phep. Object/array bi tu choi vi chung la duong de mot than loi GitHub
 * hay mot manh env di lac vao log ma khong ai doc lai.
 * @param {unknown} value
 */
function isLoggableScalar(value) {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  );
}

/**
 * Loc mot ban ghi ve dang an toan. Ham THUAN TUY — test duoc ma khong can I/O.
 * @param {Record<string, unknown>} fields
 * @returns {Record<string, unknown>}
 */
export function sanitizeLogFields(fields) {
  /** @type {Record<string, unknown>} */
  const safe = {};
  /** @type {string[]} */
  const dropped = [];
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (key === 'dropped_fields') continue;
    if (!ALLOWED.has(key) || !isLoggableScalar(value)) {
      dropped.push(key);
      continue;
    }
    safe[key] = value;
  }
  // Bao TEN khoa bi bo, khong bao giu tri. Ten khoa la sieu du lieu cua chinh log; gia tri moi la
  // thu co the la bi mat.
  if (dropped.length > 0) safe.dropped_fields = dropped.sort().join(',');
  return safe;
}

/**
 * @param {{ sink?: (line: string) => void, now?: () => Date }} [options]
 */
export function createLogger(options = {}) {
  const sink = options.sink ?? ((line) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date());
  return {
    /**
     * @param {string} event
     * @param {Record<string, unknown>} [fields]
     */
    log(event, fields = {}) {
      const record = sanitizeLogFields({ ...fields, event, ts: now().toISOString() });
      sink(JSON.stringify(record));
      return record;
    },
  };
}

/** @typedef {ReturnType<typeof createLogger>} Logger */
