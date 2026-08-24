import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

/**
 * SOI CHI XUYEN SUOT mot luot xu ly.
 *
 * VAN DE NO GIAI: duong tin Zalo (`ZcaListener`/`BotPoller` -> `PipelineService.intake()`) KHONG
 * di qua HTTP, nen khong co header nao de gan `x-request-id` vao. Ket qua truoc file nay: luong
 * nghiep vu CHINH cua GD1 khong co mot dinh danh nao cho toi khi `AgentOrchestrator.run()` sinh
 * `orderId` — tuc la o giua duong. Cac ca can debug nhat (`ignored`, `stored_only`, `duplicate`)
 * KHONG BAO GIO co `orderId`, nen chung khong the truy vet duoc bang bat ky thu gi.
 *
 * VI SAO `AsyncLocalStorage` chu khong phai truyen tham so:
 * De co `traceId` o moi noi bang tham so, phai them mot doi so vao ~30 chu ky ham xuyen 6 module.
 * Do la sua NGHIEP VU de tracing de hon — dung thu muc 1 cam. ALS mang context di theo chuoi
 * async ma khong ai phai khai bao no.
 *
 * VI SAO SCOPE CO THE GHI DE (mutable):
 * `orderId` chi ra doi o buoc 8/13, `intent` o buoc 5. Neu scope bat bien thi moi lan biet them
 * mot du kien lai phai vao lai mot ALS moi — tuc la boc them mot lop closure quanh dung nhung
 * doan code nghiep vu ma ta khong duoc phep dong vao. Chon mot o chua ghi de duoc, va DONG GOI
 * viec ghi trong `enrichTrace()` de khong ai set bua truong khac.
 *
 * ID theo chuan W3C Trace Context (16 byte hex cho trace, 8 byte cho span) — KHONG phai UUID.
 * Ly do: n8n, Dify, Langfuse, Tempo, SigNoz deu doc `traceparent`. Dung UUID la tu cat minh khoi
 * moi thu do ma khong duoc gi (muc 22).
 */

/** Danh tinh trien khai — doc mot lan luc boot, khong doi trong doi song tien trinh. */
export interface ReleaseIdentity {
  /** Slug khach (`ultty`, `wata`, …). */
  readonly tenant: string;
  /** `dev` | `gd1-test` | `pilot` | `production` — tu `DEPLOYMENT_ENVIRONMENT`. */
  readonly environment: string;
  /** Git SHA day du cua ban dang chay. `unknown` khi chay local/test. */
  readonly gitSha: string;
  /** Digest image ung dung; co tren VM, vang khi chay local. */
  readonly appDigest?: string;
  /** Tem thoi gian deploy (ISO 8601). */
  readonly deployedAt?: string;
}

/**
 * Neo NGHIEP VU cua mot luot. Moi truong deu tuy chon vi chung xuat hien dan theo duong di:
 * `chatId` co tu tin dau tien, `orderId` mai buoc 8 moi co.
 */
export interface TraceAnchors {
  chatId?: string;
  /** `externalMessageId` cua Zalo — thu Sale doc duoc tren dien thoai. */
  externalMessageId?: string;
  /** Id dong `Message` trong DB cua ta. */
  messageId?: string;
  conversationId?: string;
  orderId?: string;
  intent?: string;
  /** `zca` | `bot` | `mock` | `http` | `operator_console` — kenh viec di vao. */
  channel?: string;
  /** UID nguoi gui. La PII: bo loc telemetry xoa no o muc `redacted`. */
  senderExternalId?: string;
  /**
   * NGUOI VAN HANH da khoi dong luot nay (username phien, hoac `operator`).
   * Chi co o luot do NGUOI bam nut; luot tin Zalo tu dong khong co truong nay.
   */
  actor?: string;
  /**
   * LUOT DA GAY RA luot nay, khi hai luot cach nhau ve THOI GIAN THUC.
   *
   * VI SAO KHONG DUNG LAI `traceId` cua tin goc (quyet dinh 22/08/2026):
   * Mot trace la MOT giao dich. Tin Zalo vao luc T0 chay xong trong ~4 giay; Sale bam "Duyet &
   * gui" luc T0+4s, hoac +5 phut, hoac sang hom sau. Dung lai traceId cu se lam moi bo dung cay
   * (ke ca `tools/trace-view.mjs` va `buildTraceView`) tinh do dai luot = khoang cach tu tin den
   * cu bam chuot — tuc la chon vui tin hieu do tre THAT cua pipeline duoi thoi gian suy nghi cua
   * mot con nguoi. Do cung la ly do OpenTelemetry co LINK tach khoi quan he cha-con: nhan qua
   * KHONG dong nghia voi long nhau trong thoi gian.
   *
   * Nen: luot moi, `traceId` moi, va MOT SOI DAY tro nguoc ve luot goc. Doc xuoi bang
   * `--order <id>`, doc nguoc bang chinh truong nay.
   */
  causationTraceId?: string;
}

export interface TraceScope extends TraceAnchors {
  readonly traceId: string;
  readonly release: ReleaseIdentity;
  readonly startedAtMs: number;
  /** Ten buoc nghiep vu dang chay — de log biet minh dang o dau ma khong can span. */
  currentStep?: string;
  /** Span dang la cha cua buoc ke tiep. Rong = span goc. */
  currentSpanId?: string;
}

const storage = new AsyncLocalStorage<TraceScope>();

/**
 * Danh sach khoa neo, dung chung cho ca `enrichTrace` (ghi) lan `traceSnapshot` (doc).
 * Mot nguon su that: them mot neo moi chi phai sua o day.
 */
const ANCHOR_KEYS = [
  'chatId',
  'externalMessageId',
  'messageId',
  'conversationId',
  'orderId',
  'intent',
  'channel',
  'senderExternalId',
  'actor',
  'causationTraceId',
] as const satisfies readonly (keyof TraceAnchors)[];

/** 16 byte hex — dung khuon `trace-id` cua W3C Trace Context. */
export function newTraceId(): string {
  return randomBytes(16).toString('hex');
}

/** 8 byte hex — dung khuon `parent-id` cua W3C Trace Context. */
export function newSpanId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Dung `traceparent` theo W3C de truyen sang tien trinh khac (n8n/Dify/Flowise sau nay).
 * `01` cuoi = sampled. Ta lay mau toan bo: 10-20 don/ngay, khong co ly do gi de bo bot.
 */
export function toTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

/**
 * Header `traceparent` cua LUOT HIEN TAI, de dinh vao mot lan goi HTTP ra ngoai.
 *
 * Tra `{}` khi dang chay ngoai moi trace (script CLI, boot) — de cho goi viet duoc
 * `{ ...traceparentHeader() }` ma khong phai kiem `null`, va khong bao gio gui mot header rong.
 *
 * `currentSpanId` rong nghia la dang o span goc; luc do sinh mot id moi cho phan `parent-id`:
 * ben nhan can MOT span cha hop le, va trace id — thu de noi hai ben — van dung.
 */
export function traceparentHeader(): { traceparent: string } | Record<string, never> {
  const scope = storage.getStore();
  if (!scope) return {};
  return { traceparent: toTraceparent(scope.traceId, scope.currentSpanId ?? newSpanId()) };
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

/**
 * Doc `traceparent` tu ben ngoai gui vao. Sai khuon -> `null`, va ben goi se mo trace moi.
 * KHONG nem loi: mot header hong cua ben thu ba khong duoc lam rot mot don hang.
 */
export function parseTraceparent(
  header: string | undefined,
): { traceId: string; spanId: string } | null {
  if (!header) return null;
  const matched = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!matched) return null;
  const [, traceId, spanId] = matched;
  // Trace id toan so 0 la gia tri "khong hop le" theo dac ta — coi nhu khong co.
  if (!traceId || !spanId || /^0+$/.test(traceId)) return null;
  return { traceId, spanId };
}

/** Scope cua luot hien tai, hoac `null` khi dang chay ngoai moi trace (vd script CLI). */
export function currentTrace(): TraceScope | null {
  return storage.getStore() ?? null;
}

/** `traceId` hien tai — tien cho logger. Rong khi khong o trong trace nao. */
export function currentTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}

/**
 * Mo mot luot moi va chay `fn` ben trong no.
 *
 * `continueFrom` cho phep noi tiep trace cua ben goi (khi co `traceparent`), giu nguyen cay trace
 * xuyen he thong thay vi cat thanh hai cay roi.
 */
export function runInTrace<T>(
  input: {
    release: ReleaseIdentity;
    anchors?: TraceAnchors;
    continueFrom?: string | undefined;
  },
  fn: () => T,
): T {
  const parent = parseTraceparent(input.continueFrom);
  const scope: TraceScope = {
    traceId: parent?.traceId ?? newTraceId(),
    release: input.release,
    startedAtMs: Date.now(),
    ...(parent?.spanId ? { currentSpanId: parent.spanId } : {}),
    ...input.anchors,
  };
  return storage.run(scope, fn);
}

/**
 * Bo sung neo nghiep vu vao luot dang chay.
 *
 * Chi ghi truong CO GIA TRI: mot lan goi `enrichTrace({ orderId })` khong duoc phep xoa `chatId`
 * ma buoc truoc da ghi. Ngoai trace thi khong lam gi (khong nem) — day la duong fail-open co y:
 * goi telemetry o mot ngu canh khong co trace la chuyen binh thuong (script, test), khong phai loi.
 */
export function enrichTrace(anchors: Readonly<TraceAnchors>): void {
  const scope = storage.getStore();
  if (!scope) return;
  // Duyet theo DANH SACH KHOA co kieu, khong duyet `Object.entries` roi ep kieu: cach nay vua
  // giu duoc kiem tra kieu, vua bien loi hua "chi ghi truong neo" thanh mot dieu trinh bien dich
  // ep buoc — khong ai lo tay set `release` hay `traceId` qua duong nay duoc.
  for (const key of ANCHOR_KEYS) {
    const value = anchors[key];
    if (value === undefined || value === null || value === '') continue;
    scope[key] = value;
  }
}

/** Dat ten buoc dang chay; tra ve ten cu de ben goi phuc hoi khi ra khoi buoc. */
export function setCurrentStep(step: string | undefined): string | undefined {
  const scope = storage.getStore();
  if (!scope) return undefined;
  const previous = scope.currentStep;
  scope.currentStep = step;
  return previous;
}

/** Dat span cha cho cac buoc con; tra ve gia tri cu de phuc hoi. */
export function setCurrentSpanId(spanId: string | undefined): string | undefined {
  const scope = storage.getStore();
  if (!scope) return undefined;
  const previous = scope.currentSpanId;
  scope.currentSpanId = spanId;
  return previous;
}

/**
 * Anh chup phang cua scope, danh cho log/span.
 *
 * KHONG bao gio tra chinh doi tuong scope: no ghi de duoc, ma mot ban ghi telemetry da phat di
 * thi khong duoc phep doi noi dung ve sau.
 */
export function traceSnapshot(): Record<string, string> {
  const scope = storage.getStore();
  if (!scope) return {};
  const snapshot: Record<string, string> = {
    traceId: scope.traceId,
    tenant: scope.release.tenant,
    environment: scope.release.environment,
  };
  if (scope.release.gitSha !== 'unknown') snapshot.release = scope.release.gitSha.slice(0, 12);
  for (const key of [...ANCHOR_KEYS, 'currentStep'] as const) {
    const value = scope[key];
    if (typeof value === 'string' && value !== '') snapshot[key] = value;
  }
  return snapshot;
}
