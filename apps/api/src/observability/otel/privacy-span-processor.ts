import { createHash } from 'node:crypto';
import type { Context } from '@opentelemetry/api';
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  isContentKey,
  isPiiKey,
  isSecretKey,
  scrubPii,
  scrubSecrets,
  REDACTED,
  REDACTED_PII,
  REDACTED_SECRET,
  type TelemetryPrivacyMode,
} from '../telemetry-redaction.js';

/**
 * CONG RIENG TU CHO SPAN TU DONG — P0, va la ly do rieng de POC nay co the that bai.
 *
 * ---------------------------------------------------------------------------
 * VAN DE NO GIAI:
 *
 * `sanitizeTelemetry()` bao ve moi thu di qua `TelemetryService`. Span do
 * `instrumentation-undici` / `instrumentation-http` / `@prisma/instrumentation` sinh ra KHONG di
 * qua duong do — chung duoc SDK tao thang roi day sang exporter. Nen bat auto-instrumentation
 * ma khong co cong nay la mo mot duong ro ri MOI:
 *
 *   · `http.request.header.authorization` -> `Bearer sk-...` cua DeepSeek/Anthropic;
 *   · `url.full`                          -> query string co the mang SDT/token;
 *   · `db.query.parameter.*`              -> tham so SQL, tuc du lieu khach nguyen ban;
 *   · than request/response               -> prompt kem du lieu khach.
 *
 * ---------------------------------------------------------------------------
 * VI SAO LA DECORATOR CHU KHONG PHAI MOT PROCESSOR DANG KY SONG SONG:
 *
 * `MultiSpanProcessor` goi `onEnd` cua tung processor theo THU TU DANG KY. Neu cong rieng tu la
 * mot processor doc lap dat truoc `BatchSpanProcessor`, thi tinh dung dan cua no phu thuoc vao
 * thu tu mot mang — mot dong sap xep lai la mot lan ro ri im lang. Boc lay processor xuat di
 * thi KHONG CON thu tu nao de sai: khong co duong nao toi exporter ma khong di qua bo loc.
 *
 * ---------------------------------------------------------------------------
 * CHAT HON `sanitizeAttributes` MOT BAC O NOI DUNG:
 *
 * Bo loc noi bo giu `prompt`/`completion` o muc `redacted` (chi bo o `metadata-only`). O day
 * noi dung bi bo tu muc `redacted` tro len. Ly do: thuoc tinh noi bo do CHINH TA dat va ta biet
 * trong do co gi; thuoc tinh cua mot thu vien ben thu ba thi khong. Voi thu khong kiem soat
 * duoc, mac dinh phai la BO. `DATA_CLASSIFICATION=test` -> `full` -> giu, va do dung la stack
 * duoc phep giu (khong co PII that).
 */

/** Tien to thuoc tinh BO THANG — khong che, vi ban than khoa da la than tin. */
const DROPPED_PREFIXES = [
  'http.request.header.',
  'http.response.header.',
  'db.query.parameter.',
  'undici.request.header.',
  'undici.response.header.',
] as const;

/** Thuoc tinh BO THANG theo ten day du. */
const DROPPED_KEYS = new Set([
  'url.query',
  'http.url.query',
  'http.request.body',
  'http.response.body',
  'db.statement.parameters',
]);

/** Thuoc tinh chua URL day du — giu host+path, cat query. */
const URL_KEYS = new Set(['url.full', 'http.url', 'http.target']);

/** Neo NGUOI GUI — bam thay vi xoa, de con nhom duoc cac luot cua cung mot nguoi. */
const HASHED_KEYS = new Set(['nexagnet.senderExternalId', 'enduser.id', 'user.id']);

/**
 * DINH DANH KY THUAT — giu NGUYEN VAN, khong cho bo quet PII dung toi.
 *
 * BAI DO BAT DUOC LOI NAY (24/08/2026): `chatId` cua mot nhom Zalo la `2508572440887686813`.
 * Ben trong no co doan `0887686813` — mot so bat dau bang `0` va co du chu so — nen mau SDT
 * Viet Nam khop, va `scrubPii` bien no thanh `250857244[REDACTED_PII]`.
 *
 * Hau qua khong phai tham my: `chatId` la KHOA TIM KIEM chinh khi chua co `orderId`, tuc dung
 * cai ma ca POC nay dat ra de sua ("tim duoc luot ma khong can orderId"). Bam nat no o muc
 * `redacted` nghia la tren MOI stack khach that, duong tim kiem do khong con dung duoc.
 *
 * Chung khong phai du lieu ca nhan: day la dinh danh do NEN TANG cap (id nhom, id tin, id don),
 * khong noi gi ve mot con nguoi. `senderExternalId` — thu DUY NHAT tro toi mot nguoi — van bi
 * bam qua `HASHED_KEYS`.
 *
 * Duong NDJSON noi bo khong dinh loi nay vi `envelope()` dat `anchors` VAO NGOAI bo loc. Danh
 * sach nay lam duong span hanh xu giong duong do.
 */
const IDENTIFIER_KEYS = new Set([
  'nexagnet.chatId',
  'nexagnet.messageId',
  'nexagnet.externalMessageId',
  'nexagnet.conversationId',
  'nexagnet.orderId',
  'nexagnet.entityId',
  'nexagnet.causationTraceId',
]);

/**
 * DIA CHI MANG, KHONG PHAI DIA CHI NHA. Vuot qua bo loc PII.
 *
 * BAI TEST BAT DUOC LOI NAY (24/08/2026): `isPiiKey('server.address')` -> `normalizeKey` ->
 * `serveraddress` -> `endsWith('address')` -> DUNG. Nen MOI span HTTP ra ngoai mat host, va
 * `api.deepseek.com` tro thanh `[REDACTED_PII]`. Ket qua la khong con tra loi duoc cau hoi
 * "goi ai" — dung cau hoi ma span HTTP ton tai de tra loi. Bo loc chat qua tay lam telemetry
 * vo dung cung la mot cach that bai, chi la mot cach im lang hon.
 *
 * `client.address` CO Y khong nam trong danh sach nay: do la IP cua nguoi goi, va mot IP nhan
 * dang duoc mot con nguoi. Host DICH thi khong.
 */
const NETWORK_HOST_KEYS = new Set([
  'server.address',
  'network.peer.address',
  'network.local.address',
  'net.peer.name',
  'net.host.name',
  'http.host',
  'peer.service',
]);

export function hashAnchor(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function scrubString(value: string, mode: TelemetryPrivacyMode): string {
  const secretsGone = scrubSecrets(value);
  return mode === 'full' ? secretsGone : scrubPii(secretsGone);
}

/**
 * Cat query string roi scrub phan con lai.
 * Giu `scheme://host/path` la du de tra loi "goi ai, duong nao"; query la cho PII hay nam nhat.
 */
function sanitizeUrl(value: string, mode: TelemetryPrivacyMode): string {
  const cut = value.split('?')[0] ?? value;
  return scrubString(cut, mode);
}

/**
 * Khoa OTel co CHAM (`nexagnet.customerPhone`), con `isPiiKey` lam viec tren khoa PHANG:
 * `normalizeKey` bo dau cham nen `nexagnetcustomerphone` khong con khop `endsWith('phone')`.
 * Nen phai kiem CA khoa day du LAN doan cuoi sau dau cham cuoi cung.
 */
function matchesKey(key: string, predicate: (k: string) => boolean): boolean {
  if (predicate(key)) return true;
  const leaf = key.slice(key.lastIndexOf('.') + 1);
  return leaf !== key && predicate(leaf);
}

function sanitizeAttributeValue(value: unknown, mode: TelemetryPrivacyMode): unknown {
  if (typeof value === 'string') return scrubString(value, mode);
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? scrubString(item, mode) : item));
  }
  return value;
}

/**
 * Bo loc mot tui thuoc tinh span. Tra ve tui MOI — ben goi tu quyet dinh gan de len dau.
 *
 * Export de test truc tiep duoc: cong nay phai chung minh duoc bang bai test doc lap, khong chi
 * bang mot lan grep tren du lieu da xuat.
 */
export function sanitizeSpanAttributes(
  attributes: Readonly<Record<string, unknown>>,
  mode: TelemetryPrivacyMode,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (DROPPED_KEYS.has(key)) continue;
    if (DROPPED_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;

    // BI MAT — bi che o MOI muc, ke ca `full`. Khong co che do nao lo khoa ra ngoai.
    if (matchesKey(key, isSecretKey)) {
      out[key] = REDACTED_SECRET;
      continue;
    }
    // Dinh danh ky thuat di TRUOC moi bo quet — xem `IDENTIFIER_KEYS`.
    if (IDENTIFIER_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    if (HASHED_KEYS.has(key)) {
      out[key] = mode === 'full' ? value : hashAnchor(String(value));
      continue;
    }
    if (URL_KEYS.has(key)) {
      out[key] = typeof value === 'string' ? sanitizeUrl(value, mode) : REDACTED;
      continue;
    }
    // Host mang di TRUOC bo loc PII — xem `NETWORK_HOST_KEYS`.
    if (NETWORK_HOST_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    // PII theo TEN KHOA — chi con o `full` (du lieu test).
    if (mode !== 'full' && matchesKey(key, isPiiKey)) {
      out[key] = REDACTED_PII;
      continue;
    }
    // NOI DUNG (prompt/completion/body) — chat hon bo loc noi bo mot bac, xem dau file.
    if (mode !== 'full' && matchesKey(key, isContentKey)) {
      out[key] = typeof value === 'string' ? `${REDACTED} (${value.length} ky tu)` : REDACTED;
      continue;
    }
    out[key] = sanitizeAttributeValue(value, mode);
  }
  return out;
}

/**
 * Boc mot `SpanProcessor` va bo loc MOI span truoc khi no toi duoc processor do.
 *
 * FAIL-OPEN THEO HUONG AN TOAN: neu chinh bo loc nem loi thi span bi BO, chu khong duoc day di
 * nguyen ban. Day la ngoai le CO Y voi bat bien fail-open cua telemetry — fail-open o huong nay
 * nghia la "mat mot span", con fail-open o huong kia nghia la "ro mot bi mat".
 */
export class PrivacySpanProcessor implements SpanProcessor {
  constructor(
    private readonly delegate: SpanProcessor,
    private readonly mode: TelemetryPrivacyMode,
  ) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    try {
      // Ghi de TAI CHO: `ReadableSpan.attributes` cua SDK la mot object thuong. Thay ca tui bang
      // cach xoa het roi gan lai — khong tao span moi, vi exporter con doc `resource`,
      // `instrumentationScope`, `links`, `status` tu chinh doi tuong nay.
      const target = span.attributes as Record<string, unknown>;
      const sanitized = sanitizeSpanAttributes(target, this.mode);
      for (const key of Object.keys(target)) delete target[key];
      Object.assign(target, sanitized);

      for (const event of span.events) {
        if (!event.attributes) continue;
        const eventTarget = event.attributes as Record<string, unknown>;
        const clean = sanitizeSpanAttributes(eventTarget, this.mode);
        for (const key of Object.keys(eventTarget)) delete eventTarget[key];
        Object.assign(eventTarget, clean);
      }

      if (span.status.message) {
        (span.status as { message?: string }).message = scrubString(span.status.message, this.mode);
      }
    } catch {
      return;
    }
    this.delegate.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}
