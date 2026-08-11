import type { AuditJsonValue } from '@netviet/shared';

export const AUDIT_REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'zalotoken',
  'authorization',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'password',
  'passphrase',
  'secret',
  'apikey',
  'rawmessage',
  'rawtext',
  'customerphone',
  'phonenumber',
  'phone',
  'sdt',
  'customeraddress',
  'shippingaddress',
  'address',
  'diachi',
  'displayname',
  'fullname',
  'zaloname',
  'avatarurl',
  // UID Zalo cua thanh vien nhom la dinh danh ca nhan (Luat BVDLCN 91/2025/QH15) — audit chi
  // can ID noi bo cua ban ghi de truy vet, khong can UID that.
  'externaluserid',
  'senderexternalid',
]);

const MAX_REDACTION_DEPTH = 20;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('secretkey') ||
    normalized.endsWith('password') ||
    normalized.endsWith('apikey') ||
    normalized.endsWith('phone') ||
    normalized.endsWith('phonenumber') ||
    normalized.endsWith('address')
  );
}

function redact(value: unknown, seen: WeakSet<object>, depth: number): AuditJsonValue {
  if (depth > MAX_REDACTION_DEPTH) return AUDIT_REDACTED;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return null;
  if (seen.has(value)) return AUDIT_REDACTED;

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => redact(item, seen, depth + 1));
    seen.delete(value);
    return result;
  }

  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? AUDIT_REDACTED : redact(item, seen, depth + 1),
    ]),
  );
  seen.delete(value);
  return result;
}

/** Creates a detached JSON-safe copy while removing credential and customer PII fields. */
export function redactAuditValue(value: unknown): AuditJsonValue {
  return redact(value, new WeakSet<object>(), 0);
}
