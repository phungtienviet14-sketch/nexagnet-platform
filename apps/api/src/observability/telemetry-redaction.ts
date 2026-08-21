/**
 * BO LOC TAP TRUNG cho MOI thu roi khoi tien trinh duoi dang telemetry (span, log, trace luu DB).
 *
 * VI SAO KHONG DUNG LAI `audit/audit-redaction.ts`:
 * Bo loc cua audit loc theo TEN KHOA va luon xoa `rawText`. Dung cho audit, sai cho telemetry vi
 * hai le:
 *
 *  1. TELEMETRY BAT LOI, ma bi mat trong telemetry hau het nam trong GIA TRI chu khong phai khoa.
 *     `new Error('connect ECONNREFUSED postgresql://zalo:hunter2@postgres:5432/zalo')` di qua bo
 *     loc theo khoa ma khong suy suyen — chuoi do nam duoi khoa `message`, mot khoa vo hai.
 *     Do la duong ro ri THAT cua telemetry, va loc theo khoa khong thay no.
 *  2. `rawText` la thu can nhat khi debug tren stack TEST (`DATA_CLASSIFICATION=test`, du lieu
 *     khong phai cua khach that). Xoa vo dieu kien lam telemetry mat gia tri o dung noi no huu ich.
 *
 * BAT BIEN — doc ky truoc khi sua:
 *   · BI MAT bi xoa o MOI muc (ke ca `full`). Khong co che do nao lo khoa ra ngoai.
 *   · PII duoc xoa THEO MUC, gan voi `DATA_CLASSIFICATION` da co — khong de ra truc cau hinh moi.
 *
 * Muc dich cua tap trung: khong ai phai nho tu sanitize. Ai muon ghi telemetry deu di qua day.
 */

export const REDACTED = '[REDACTED]';
export const REDACTED_SECRET = '[REDACTED_SECRET]';
export const REDACTED_PII = '[REDACTED_PII]';

/**
 * Muc chi tiet noi dung. Gan voi `DATA_CLASSIFICATION` (`test` | `customer`) da ton tai,
 * KHONG phat minh mot truc cau hinh thu hai.
 *
 * `metadata-only` khong tu suy ra tu bien nao — no danh cho khach co dieu khoan rieng, bat bang
 * `TELEMETRY_PRIVACY=metadata-only`.
 */
export type TelemetryPrivacyMode = 'full' | 'redacted' | 'metadata-only';

/** Khoa mang BI MAT. Bi xoa o MOI muc, khong ngoai le. */
const SECRET_KEYS = new Set([
  'password',
  'passphrase',
  'secret',
  'secretkey',
  'apikey',
  'apisecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'zalotoken',
  'zalobottoken',
  'authorization',
  'cookie',
  'cookies',
  'setcookie',
  'credential',
  'credentials',
  'sessionsecret',
  'databaseurl',
  'connectionstring',
  'anthropicapikey',
  'deepseekapikey',
  'privatekey',
  'signature',
]);

/**
 * Khoa mang DU LIEU CA NHAN (Luat BVDLCN 91/2025/QH15 + ND 356/2025).
 * Bi xoa o muc `redacted` va `metadata-only`; giu o `full` (chi dung cho du lieu TEST).
 */
const PII_KEYS = new Set([
  'phone',
  'phonenumber',
  'customerphone',
  'sdt',
  'address',
  'customeraddress',
  'shippingaddress',
  'diachi',
  'email',
  'displayname',
  'senderdisplayname',
  'fullname',
  'zaloname',
  'avatarurl',
  'externaluserid',
  'senderexternalid',
  'customername',
]);

/** Khoa mang NOI DUNG hoi thoai — chi con o muc `full`. */
const CONTENT_KEYS = new Set([
  'rawtext',
  'rawmessage',
  'text',
  'reply',
  'prompt',
  'completion',
  'message',
  'messages',
  'content',
  'caption',
  'input',
  'output',
]);

/**
 * Mau BI MAT trong GIA TRI chuoi. Day la phan ma bo loc theo khoa khong lam duoc.
 *
 * Cac mau nay KHONG CO nhom bat: ca doan khop deu la bi mat, thay tron bang mot hang so.
 * Mau CO nhom bat nam rieng o `CREDENTIAL_URL_PATTERN` — xem chu thich o do de biet vi sao
 * hai loai khong duoc tron chung mot vong lap.
 *
 * Thu tu quan trong: mau HEP (`sk-ant-`) chay TRUOC mau RONG (`sk-`).
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /** JWT — ba doan base64url ngan cach bang dau cham. */
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
  /** Khoa Anthropic. */
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
  /** Khoa kieu OpenAI/DeepSeek. */
  /\bsk-[A-Za-z0-9]{16,}/g,
  /** Khoa API Google. */
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /** `Bearer <token>` trong header hoac thong bao loi. */
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /** `Basic <base64>`. */
  /\bBasic\s+[A-Za-z0-9+/]{8,}=*/gi,
];

/**
 * Mat khau trong URL co credential — `postgresql://user:PASS@host`, `redis://user:PASS@host`.
 * Giu lai giao thuc + user + host de con debug duoc; chi thay doan mat khau.
 *
 * TACH RIENG khoi `SECRET_VALUE_PATTERNS` sau khi test bat duoc mot loi BAO MAT that (21/08/2026):
 * ban dau ca hai loai dung chung mot vong lap voi ham thay the `(match, ...groups)`, roi doan xem
 * co nhom bat hay khong bang `groups.filter(g => typeof g === 'string')`. Cach doan do SAI, vi
 * `String.replace` truyen them `offset` (so) VA CA CHUOI GOC (chuoi) vao cuoi danh sach doi so —
 * nen chuoi goc bi nham la "nhom bat thu nhat". Ket qua: `Bearer <token>` duoc thay bang chinh ca
 * chuoi goc cong hau to, tuc TOKEN VAN NAM NGUYEN trong telemetry va thong bao con bi lap doi.
 * Hai loai mau co hai hinh dang thay the khac nhau; gop chung lai la moi doan.
 */
const CREDENTIAL_URL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+(@)/gi;

/** Mau PII trong GIA TRI chuoi — chi ap o muc `redacted`/`metadata-only`. */
const PII_VALUE_PATTERNS: readonly RegExp[] = [
  /** So dien thoai Viet Nam: `0912345678`, `+84912345678`, co the co dau cach/gach. */
  /(?:\+84|0)(?:[\s.-]?\d){8,10}\b/g,
  /** Email. */
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
];

const MAX_DEPTH = 12;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 50;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSecretKey(key: string): boolean {
  const k = normalizeKey(key);
  return (
    SECRET_KEYS.has(k) ||
    k.endsWith('token') ||
    k.endsWith('secret') ||
    k.endsWith('password') ||
    k.endsWith('apikey') ||
    k.endsWith('credential')
  );
}

function isPiiKey(key: string): boolean {
  const k = normalizeKey(key);
  return PII_KEYS.has(k) || k.endsWith('phone') || k.endsWith('address') || k.endsWith('email');
}

function isContentKey(key: string): boolean {
  return CONTENT_KEYS.has(normalizeKey(key));
}

/**
 * Quet BI MAT trong mot chuoi. Chay o MOI muc — ke ca `full`.
 * Tach rieng va export de test duoc truc tiep, va de cho goi duoc tren thong bao loi.
 */
export function scrubSecrets(input: string): string {
  let output = input;
  // 1. Mau khong co nhom bat: ca doan khop la bi mat -> thay tron.
  for (const pattern of SECRET_VALUE_PATTERNS) {
    output = output.replace(pattern, REDACTED_SECRET);
  }
  // 2. Mau co nhom bat: chi thay DOAN GIUA, giu hai dau de con debug duoc.
  //    `$1`/`$2` la cu phap thay the cua chinh `String.replace`, khong phai ham — nen khong
  //    dinh cai bay `offset`/`wholeString` da mo ta o `CREDENTIAL_URL_PATTERN`.
  output = output.replace(CREDENTIAL_URL_PATTERN, `$1${REDACTED_SECRET}$2`);
  return output;
}

/** Quet PII trong mot chuoi. Chi chay o muc `redacted`/`metadata-only`. */
export function scrubPii(input: string): string {
  let output = input;
  for (const pattern of PII_VALUE_PATTERNS) {
    output = output.replace(pattern, REDACTED_PII);
  }
  return output;
}

function scrubString(value: string, mode: TelemetryPrivacyMode): string {
  const secretsGone = scrubSecrets(value);
  const piiGone = mode === 'full' ? secretsGone : scrubPii(secretsGone);
  return piiGone.length > MAX_STRING_LENGTH
    ? `${piiGone.slice(0, MAX_STRING_LENGTH)}…[cat ${piiGone.length - MAX_STRING_LENGTH} ky tu]`
    : piiGone;
}

export type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | SanitizedValue[]
  | { [key: string]: SanitizedValue };

function sanitizeValue(
  value: unknown,
  mode: TelemetryPrivacyMode,
  seen: WeakSet<object>,
  depth: number,
): SanitizedValue {
  if (depth > MAX_DEPTH) return REDACTED;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return scrubString(value, mode);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      // Thong bao loi la duong ro ri bi mat so mot cua telemetry — luon di qua bo quet.
      message: scrubString(value.message, mode),
    };
  }
  if (typeof value === 'function' || typeof value === 'symbol') return null;
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return '[CIRCULAR]';

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitizeValue(item, mode, seen, depth + 1));
      return value.length > MAX_ARRAY_ITEMS
        ? [...items, `…[con ${value.length - MAX_ARRAY_ITEMS} phan tu]`]
        : items;
    }
    const out: Record<string, SanitizedValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSecretKey(key)) {
        out[key] = REDACTED_SECRET;
        continue;
      }
      if (mode !== 'full' && isPiiKey(key)) {
        out[key] = REDACTED_PII;
        continue;
      }
      if (mode === 'metadata-only' && isContentKey(key)) {
        // Giu DAU VET rang co noi dung va no dai bao nhieu — thuong du de debug ca
        // "vi sao cau tra loi bi cat" ma khong luu mot chu noi dung nao.
        out[key] = typeof item === 'string' ? `${REDACTED} (${item.length} ky tu)` : REDACTED;
        continue;
      }
      out[key] = sanitizeValue(item, mode, seen, depth + 1);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Cong DUY NHAT de mot gia tri tro thanh telemetry.
 *
 * Luon tra ban SAO roi rac (khong giu tham chieu toi doi tuong nghiep vu), nen mot span da ghi
 * khong the bi doi noi dung boi code chay sau no.
 */
export function sanitizeTelemetry(value: unknown, mode: TelemetryPrivacyMode): SanitizedValue {
  return sanitizeValue(value, mode, new WeakSet<object>(), 0);
}

/** Sanitize mot tui thuoc tinh span. Khoa giu nguyen, gia tri di qua bo loc. */
export function sanitizeAttributes(
  attributes: Readonly<Record<string, unknown>>,
  mode: TelemetryPrivacyMode,
): Record<string, SanitizedValue> {
  const result = sanitizeValue(attributes, mode, new WeakSet<object>(), 0);
  return typeof result === 'object' && result !== null && !Array.isArray(result) ? result : {};
}

/**
 * Suy muc rieng tu tu cau hinh da co.
 *
 * `test` -> `full`: stack test khong duoc phep cam du lieu khach that (CLAUDE.md), nen noi dung o
 * do khong phai PII — va do la luc can nhin ro nhat.
 * `customer` -> `redacted`: mac dinh AN TOAN cho du lieu that.
 */
export function privacyModeFor(
  dataClassification: 'test' | 'customer',
  override?: string,
): TelemetryPrivacyMode {
  if (override === 'full' || override === 'redacted' || override === 'metadata-only') {
    return override;
  }
  return dataClassification === 'customer' ? 'redacted' : 'full';
}
