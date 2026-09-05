/**
 * CAU HINH CUC BO — hep, va co mot dieu no TU CHOI mang.
 *
 * Hop dong #204 §9 liet ke thu cau hinh KHONG duoc chua: cookie/phien ChatGPT, GitHub PAT, token
 * OAuth cua Claude, khoa API. Mot cau van trong tai lieu khong cuong che duoc dieu do, nen o day
 * co HAI cong doc lap, va chung bat duoc hai kieu sai khac nhau:
 *
 *   1. DANH SACH TRANG khoa cap mot — mot khoa la se bi tu choi, ke ca khoa vo hai. Bat "them mot
 *      truong ma khong ai doc lai".
 *   2. QUET DE QUY tim ten khoa co mui bi mat — bat truong hop mot ban sua tuong lai NOI RONG danh
 *      sach trang roi vo tinh mo duong cho mot token. Cong 1 luc do da im, cong 2 thi khong.
 *
 * URL cuoc hoi thoai CO Y khong nam o day, du §9 cho phep. No song trong trang thai arm cua tien
 * ich, va chi o do. Ly do: neu ca hai ben cung giu URL thi co HAI nguon su that ve "danh vao dau",
 * va mot tien trinh Node bi sua co the doi dich ma tien ich khong hay. Giu mot ban duy nhat, o
 * phia doi hoi mot cu cham cua nguoi de doi, la ranh gioi manh hon.
 */
import { readFileSync } from 'node:fs';

const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** Khoa cap mot duoc phep. Khac di la tu choi. */
const ALLOWED_KEYS = Object.freeze([
  'repo',
  'allowedProducers',
  'pollIntervalSeconds',
  'enabled',
  'statePath',
  'githubAccess',
]);

/** Duong doc GitHub. `gh-cli` muon token tu tien trinh `gh` da dang nhap, khong bao gio in ra. */
export const GITHUB_ACCESS_MODES = Object.freeze(['gh-cli', 'unauthenticated']);

/**
 * TU khong bao gio duoc xuat hien trong TEN mot khoa cau hinh, o bat ky do sau nao.
 *
 * So khop theo TU, khong theo chuoi con. Chuoi con tung lam `statePath` bi tu choi vi no chua
 * `pat` — mot cong bao dong gia se bi tat, va luc do no khong con bao gi. Nen ten khoa duoc tach
 * ra tung tu (`githubToken` -> github, token; `GITHUB_PAT` -> github, pat) roi so bang.
 */
const SECRET_KEY_WORDS = Object.freeze(
  new Set([
    'token',
    'cookie',
    'secret',
    'password',
    'passwd',
    'key',
    'authorization',
    'bearer',
    'session',
    'credential',
    'pat',
    'oauth',
    'jwt',
  ]),
);

/** `githubToken` -> ['github','token']; `API_KEY` -> ['api','key']. @param {string} key */
const wordsOf = (key) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());

/** @param {string} word */
const isSecretWord = (word) =>
  SECRET_KEY_WORDS.has(word) || (word.endsWith('s') && SECRET_KEY_WORDS.has(word.slice(0, -1)));

/** @param {unknown} value @param {string[]} trail @returns {string | null} duong dan khoa vi pham */
function findSecretishKey(value, trail = []) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findSecretishKey(value[i], [...trail, String(i)]);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    if (wordsOf(key).some(isSecretWord)) return [...trail, key].join('.');
    const hit = findSecretishKey(child, [...trail, key]);
    if (hit) return hit;
  }
  return null;
}

/**
 * @typedef {object} BridgeConfig
 * @property {string} repo
 * @property {ReadonlyArray<{ kind?: string, id?: string, roles?: ReadonlyArray<string> }>} allowedProducers
 * @property {number} pollIntervalSeconds
 * @property {boolean} enabled
 * @property {string} statePath
 * @property {'gh-cli' | 'unauthenticated'} githubAccess
 */

/**
 * @param {unknown} raw
 * @returns {{ ok: true, config: BridgeConfig } | { ok: false, error: string, detail?: Record<string, unknown> }}
 */
export function validateConfig(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'CONFIG_NOT_OBJECT' };
  }
  const secretish = findSecretishKey(raw);
  if (secretish !== null) {
    return { ok: false, error: 'CONFIG_CONTAINS_SECRET_LIKE_KEY', detail: { key: secretish } };
  }
  const unknown = Object.keys(raw).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unknown.length > 0) {
    return { ok: false, error: 'CONFIG_UNKNOWN_KEY', detail: { keys: unknown } };
  }
  const value = /** @type {Record<string, unknown>} */ (raw);
  if (typeof value.repo !== 'string' || !REPO_PATTERN.test(value.repo)) {
    return { ok: false, error: 'CONFIG_REPO_INVALID' };
  }
  if (!Array.isArray(value.allowedProducers) || value.allowedProducers.length === 0) {
    return { ok: false, error: 'CONFIG_PRODUCERS_EMPTY' };
  }
  if (
    !Number.isSafeInteger(value.pollIntervalSeconds) ||
    Number(value.pollIntervalSeconds) < 30 ||
    Number(value.pollIntervalSeconds) > 3600
  ) {
    return { ok: false, error: 'CONFIG_POLL_INTERVAL_INVALID' };
  }
  if (typeof value.enabled !== 'boolean') return { ok: false, error: 'CONFIG_ENABLED_INVALID' };
  if (typeof value.statePath !== 'string' || value.statePath.trim().length === 0) {
    return { ok: false, error: 'CONFIG_STATE_PATH_INVALID' };
  }
  if (typeof value.githubAccess !== 'string' || !GITHUB_ACCESS_MODES.includes(value.githubAccess)) {
    return { ok: false, error: 'CONFIG_GITHUB_ACCESS_INVALID' };
  }
  return {
    ok: true,
    config: Object.freeze({
      repo: value.repo,
      allowedProducers: Object.freeze([
        .../** @type {ReadonlyArray<any>} */ (value.allowedProducers),
      ]),
      pollIntervalSeconds: Number(value.pollIntervalSeconds),
      enabled: value.enabled,
      statePath: value.statePath,
      githubAccess: /** @type {'gh-cli' | 'unauthenticated'} */ (value.githubAccess),
    }),
  };
}

/**
 * @param {string} path
 * @returns {{ ok: true, config: BridgeConfig } | { ok: false, error: string, detail?: Record<string, unknown> }}
 */
export function loadConfig(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, error: 'CONFIG_UNREADABLE' };
  }
  try {
    return validateConfig(JSON.parse(text));
  } catch {
    return { ok: false, error: 'CONFIG_NOT_JSON' };
  }
}
