/**
 * Cau hinh CUC BO cua dispatcher — vung TIN CAY duy nhat cua mat phang nay.
 *
 * Bat bien: khong mot truong nao o day duoc dieu khien boi noi dung GitHub. GitHub chi tra loi
 * duoc CAU HOI "task nao san sang", khong bao gio tra loi duoc "chay cai gi, bang model nao,
 * o dau". Mo mot duong cho GitHub ghi vao cau hinh la mo mot duong thuc thi ma tu xa.
 *
 * Ba luat cung, kiem NGAY LUC DOC, khong doi den luc phong tien trinh:
 *   1. `enabled` mac dinh FALSE. Ban mau trong repo phai luon la false.
 *   2. `model` chi dien dat duoc OPUS. Khong co cach nao viet 'sonnet' ma qua duoc.
 *   3. `effort` chi dien dat duoc 'max'.
 *
 * Va mot luat ve BI MAT: cau hinh nay KHONG PHAI cho de token. Bat ky KHOA nao nghe nhu bi mat,
 * hoac GIA TRI nao trong nhu mot token, deu bi tu choi — de nguoi van hanh khong bao gio "tien
 * tay" dan PAT vao day roi commit len mot repo PUBLIC.
 */
import { REASONS, deny } from './errors.mjs';

/** Chi OPUS. Alias `opus` la cai CLI tu tai lieu hoa; ten day du phai la ho opus. */
const OPUS_PATTERN = /^(opus|claude-opus-[0-9a-z][0-9a-z.-]*)$/;
const REPO_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const LABEL_PATTERN = /^[\x20-\x7e]{1,50}$/;
const BRANCH_PREFIX_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/;

/** Ten khoa nghe nhu bi mat. Quet DE QUY tren moi khoa cua cau hinh. */
const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|api[-_]?key|apikey|cookie|authorization|credential|oauth|private[-_]?key|session[-_]?id)/i;

/** Hinh dang gia tri cua cac bi mat that, de bat truong hop dat ten khoa vo hai roi dan token vao. */
const SECRET_VALUE_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9]{16,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-ant-[A-Za-z0-9_-]{16,}/,
  /\bsk-[A-Za-z0-9]{32,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/**
 * `bypassPermissions` bi loai CO CHU DINH: no la `--dangerously-skip-permissions` doi ten. Cho
 * phep no trong cau hinh la de mot cong tat quyen nam san trong san pham, cho ngay ai do "tam bat
 * cho chay duoc" roi quen tat.
 */
const ALLOWED_PERMISSION_MODES = Object.freeze(['acceptEdits', 'manual', 'plan', 'dontAsk']);
const ALLOWED_PERMISSION_PROMPTS = Object.freeze(['none', 'host']);

const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 12 * 60 * 60 * 1000;

/** @param {unknown} v @returns {v is string} */
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
/** @param {unknown} v */
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Quet de quy tim khoa/gia tri bi mat. Tra ve `null` neu sach.
 * @param {unknown} node
 * @param {string[]} path
 * @returns {import('./errors.mjs').Denied | null}
 */
function findSecretLeak(node, path = []) {
  if (typeof node === 'string') {
    if (SECRET_VALUE_PATTERNS.some((p) => p.test(node))) {
      // Chi bao DUONG DAN, khong bao giu tri — bao gia tri la tu minh in bi mat ra log.
      return deny(REASONS.CONFIG_SECRET_VALUE, { at: path.join('.') || '<root>' });
    }
    return null;
  }
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      const leak = findSecretLeak(item, [...path, String(i)]);
      if (leak) return leak;
    }
    return null;
  }
  if (!isPlainObject(node)) return null;
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (node))) {
    if (SECRET_KEY_PATTERN.test(key)) {
      return deny(REASONS.CONFIG_SECRET_FIELD, { at: [...path, key].join('.') });
    }
    const leak = findSecretLeak(value, [...path, key]);
    if (leak) return leak;
  }
  return null;
}

/**
 * @typedef {{ kind: 'APP' | 'USER', id: string }} TrustedPrincipal
 * @typedef {object} ClaudePolicy
 * @property {string} bin duong dan tuyet doi toi executable Claude Code
 * @property {ReadonlyArray<string>} binPrefixArgs argv dat TRUOC co chinh sach; can cho ban cai
 *   chay qua runtime (`node cli.js`) thay vi native binary. Do NGUOI van hanh dat, khong bao gio
 *   do GitHub dat.
 * @property {string} model
 * @property {'max'} effort
 * @property {'none' | 'host'} permissionPrompts
 * @property {string | null} permissionMode
 * @property {number} timeoutMs
 * @property {number} killGraceMs thoi gian an han giua SIGTERM va SIGKILL. **Tren Windows khoang
 *   nay khong ton tai**: Node khong gui duoc tin hieu POSIX, nen `child.kill('SIGTERM')` giet
 *   tien trinh NGAY va dut khoat (do duoc tren may phat trien: tien trinh con cai san mot bo bat
 *   SIGTERM khong bao gio chay). Truong nay chi co tac dung that tren POSIX; tren Windows hay coi
 *   `timeoutMs` la thoi diem tien trinh bi giet khong bao truoc.
 * @property {number} maxCaptureBytes
 *
 * @typedef {object} DispatcherConfig
 * @property {boolean} enabled
 * @property {string} repo
 * @property {string} readyLabel
 * @property {ReadonlyArray<TrustedPrincipal>} trustedTriggerPrincipals
 * @property {string} worktreeRoot
 * @property {string} branchPrefix
 * @property {string} stateDir
 * @property {string} remote
 * @property {string} baseBranch
 * @property {ClaudePolicy} claude
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: true, config: DispatcherConfig } | import('./errors.mjs').Denied}
 */
export function parseConfig(raw) {
  if (!isPlainObject(raw)) return deny(REASONS.CONFIG_INVALID, { field: '<root>', want: 'object' });
  const leak = findSecretLeak(raw);
  if (leak) return leak;

  const r = /** @type {Record<string, any>} */ (raw);

  if (typeof r.enabled !== 'boolean') {
    return deny(REASONS.CONFIG_INVALID, { field: 'enabled', want: 'boolean' });
  }
  if (!isText(r.repo) || !REPO_PATTERN.test(r.repo)) {
    return deny(REASONS.CONFIG_INVALID, { field: 'repo', want: 'owner/name' });
  }
  const readyLabel = r.readyLabel ?? 'agent:ready';
  if (!isText(readyLabel) || !LABEL_PATTERN.test(readyLabel)) {
    return deny(REASONS.CONFIG_INVALID, { field: 'readyLabel', want: 'printable ascii <=50' });
  }
  const principals = r.trustedTriggerPrincipals;
  if (!Array.isArray(principals) || principals.length === 0) {
    // Thieu so do KHONG PHAI "ai cung duoc" — cung luat fail-closed nhu PrincipalRegistry cua
    // giao thuc. Mot dispatcher khong biet ai duoc phep kich hoat thi khong duoc kich hoat gi.
    return deny(REASONS.CONFIG_INVALID, { field: 'trustedTriggerPrincipals', want: 'non-empty' });
  }
  /** @type {TrustedPrincipal[]} */
  const trusted = [];
  for (const [i, p] of principals.entries()) {
    if (!isPlainObject(p) || (p.kind !== 'APP' && p.kind !== 'USER') || !isText(p.id)) {
      return deny(REASONS.CONFIG_INVALID, {
        field: `trustedTriggerPrincipals.${i}`,
        want: '{kind:APP|USER,id:string}',
      });
    }
    trusted.push(Object.freeze({ kind: p.kind, id: p.id.trim() }));
  }
  for (const field of ['worktreeRoot', 'stateDir']) {
    if (!isText(r[field])) return deny(REASONS.CONFIG_INVALID, { field, want: 'absolute path' });
  }
  const branchPrefix = r.branchPrefix ?? 'claude/autopilot';
  if (!isText(branchPrefix) || !BRANCH_PREFIX_PATTERN.test(branchPrefix)) {
    return deny(REASONS.CONFIG_INVALID, { field: 'branchPrefix', want: 'git-safe prefix' });
  }
  const remote = r.remote ?? 'origin';
  const baseBranch = r.baseBranch ?? 'main';
  for (const [field, value] of [
    ['remote', remote],
    ['baseBranch', baseBranch],
  ]) {
    if (!isText(value) || !BRANCH_PREFIX_PATTERN.test(String(value))) {
      return deny(REASONS.CONFIG_INVALID, { field, want: 'git-safe name' });
    }
  }

  const claude = parseClaudePolicy(r.claude);
  if (!claude.ok) return claude;

  return {
    ok: true,
    config: Object.freeze({
      enabled: r.enabled,
      repo: r.repo,
      readyLabel,
      trustedTriggerPrincipals: Object.freeze(trusted),
      worktreeRoot: r.worktreeRoot,
      branchPrefix,
      stateDir: r.stateDir,
      remote: String(remote),
      baseBranch: String(baseBranch),
      claude: claude.policy,
    }),
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, policy: ClaudePolicy } | import('./errors.mjs').Denied}
 */
function parseClaudePolicy(raw) {
  if (!isPlainObject(raw)) return deny(REASONS.CONFIG_INVALID, { field: 'claude', want: 'object' });
  const c = /** @type {Record<string, any>} */ (raw);
  if (!isText(c.bin)) return deny(REASONS.CONFIG_INVALID, { field: 'claude.bin', want: 'path' });

  const prefix = c.binPrefixArgs ?? [];
  if (!Array.isArray(prefix) || prefix.some((a) => typeof a !== 'string')) {
    return deny(REASONS.CONFIG_INVALID, { field: 'claude.binPrefixArgs', want: 'string[]' });
  }

  const model = c.model ?? 'opus';
  if (!isText(model) || !OPUS_PATTERN.test(model)) {
    // Ma RIENG, khong gop vao CONFIG_INVALID: "model khong phai Opus" la mot vi pham CHINH SACH,
    // khong phai mot loi go nham hinh dang.
    return deny(REASONS.CONFIG_MODEL_NOT_OPUS, { model: String(model) });
  }
  const effort = c.effort ?? 'max';
  if (effort !== 'max') return deny(REASONS.CONFIG_EFFORT_NOT_MAX, { effort: String(effort) });

  const permissionPrompts = c.permissionPrompts ?? 'none';
  if (!ALLOWED_PERMISSION_PROMPTS.includes(permissionPrompts)) {
    return deny(REASONS.CONFIG_INVALID, {
      field: 'claude.permissionPrompts',
      want: ALLOWED_PERMISSION_PROMPTS.join('|'),
    });
  }
  const permissionMode = c.permissionMode ?? null;
  if (permissionMode !== null) {
    if (!ALLOWED_PERMISSION_MODES.includes(permissionMode)) {
      return deny(REASONS.CONFIG_PERMISSION_MODE_FORBIDDEN, {
        mode: String(permissionMode),
        allowed: ALLOWED_PERMISSION_MODES,
      });
    }
  }
  const timeoutMs = c.timeoutMs ?? 3_600_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS || timeoutMs > MAX_TIMEOUT_MS) {
    return deny(REASONS.CONFIG_INVALID, {
      field: 'claude.timeoutMs',
      want: `${MIN_TIMEOUT_MS}..${MAX_TIMEOUT_MS}`,
    });
  }
  const killGraceMs = c.killGraceMs ?? 15_000;
  if (!Number.isInteger(killGraceMs) || killGraceMs < 1_000 || killGraceMs > 120_000) {
    return deny(REASONS.CONFIG_INVALID, { field: 'claude.killGraceMs', want: '1000..120000' });
  }
  const maxCaptureBytes = c.maxCaptureBytes ?? 262_144;
  if (!Number.isInteger(maxCaptureBytes) || maxCaptureBytes < 1_024) {
    return deny(REASONS.CONFIG_INVALID, { field: 'claude.maxCaptureBytes', want: '>=1024' });
  }

  return {
    ok: true,
    policy: Object.freeze({
      bin: c.bin,
      binPrefixArgs: Object.freeze([...prefix]),
      model,
      effort: /** @type {'max'} */ ('max'),
      permissionPrompts: /** @type {'none' | 'host'} */ (permissionPrompts),
      permissionMode,
      timeoutMs,
      killGraceMs,
      maxCaptureBytes,
    }),
  };
}

/**
 * Doc cau hinh tu dia. Tach khoi `parseConfig` de moi bai test hinh dang chay duoc thuan tuy.
 * @param {string} file
 * @param {{ readFileSync: (p: string, enc: 'utf8') => string }} fs
 */
export function loadConfig(file, fs) {
  /** @type {string} */
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return deny(REASONS.CONFIG_UNREADABLE, { code: /** @type {any} */ (error)?.code ?? 'ENOENT' });
  }
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return deny(REASONS.CONFIG_NOT_JSON);
  }
  return parseConfig(raw);
}

/**
 * `enabled` la CONG VU TRANG rieng, tach khoi tinh hop le. Mot cau hinh dung nhung chua duoc vu
 * trang van khong duoc phong tien trinh — va nguoi van hanh phai doc ra duoc SU KHAC NHAU do.
 * @param {DispatcherConfig} config
 */
export function assertArmed(config) {
  return config.enabled ? { ok: /** @type {const} */ (true) } : deny(REASONS.CONFIG_DISABLED);
}

export const CONFIG_INTERNALS = Object.freeze({
  OPUS_PATTERN,
  ALLOWED_PERMISSION_MODES,
  ALLOWED_PERMISSION_PROMPTS,
  SECRET_KEY_PATTERN,
  SECRET_VALUE_PATTERNS,
});
