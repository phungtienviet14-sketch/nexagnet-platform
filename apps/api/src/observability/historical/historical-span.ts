import type { SourceLocation } from '@netviet/shared';
import type { StoredTrace } from '../recent-traces.sink.js';
import type { DecisionOutcome } from '../decision-vocabulary.js';
import type { TelemetryRecord } from '../telemetry-record.js';

/**
 * DICH NGUOC: mot hang span trong kho quan sat -> ban ghi telemetry ma Debug View da biet doc.
 *
 * ---------------------------------------------------------------------------
 * VI SAO DICH NGUOC THAY VI DUNG MOT MAN HINH THU HAI:
 *
 * `buildTraceView()` da biet dung cay, danh dau buoc ky thuat, dich ma ly do sang tieng Viet va
 * dung permalink. Viet mot duong hien thi thu hai cho du lieu lich su se sinh ra hai man hinh
 * TRA LOI KHAC NHAU cho cung mot cau hoi — va cai khac nhau se chi lo ra dung luc co su co.
 * Nen mieng ghep duy nhat can la mot phep DICH, va no dung o day.
 *
 * File nay la PHEP NGHICH cua `TelemetryService.forward()` + `OtelTraceBridge`. Doi ten thuoc
 * tinh o mot ben ma quen ben kia se lam duong lich su im lang mat mot loai bang chung — do la ly
 * do bai test o canh no khoa dung nhung ten do.
 *
 * ---------------------------------------------------------------------------
 * BAT BIEN: KHONG DUOC NEM. Du lieu vao day den tu mot he thong khac, co the cu hon ma nguon
 * dang chay vai thang, va co the bi cat cut. Mot hang hong duoc BO QUA; mot cot thieu tra ve
 * "khong biet". Man hinh chan doan sap vi mot span thieu truong la dung luc no can nhat.
 */

/** Mot hang `otel_traces` doc bang `JSONEachRow`. Moi truong deu co the vang o ban cu. */
export interface HistoricalSpanRow {
  readonly TraceId: string;
  readonly SpanId: string;
  readonly ParentSpanId: string;
  readonly SpanName: string;
  readonly ServiceName: string;
  /** `DateTime64` — ClickHouse tra `'2026-08-28 07:30:00.123456789'`, gio UTC. */
  readonly Timestamp: string;
  /** `Int64` NANO-giay. JSONEachRow boc 64-bit thanh CHUOI theo mac dinh, nen nhan ca hai kieu. */
  readonly Duration: string | number;
  readonly StatusCode: string;
  readonly StatusMessage: string;
  readonly SpanAttributes: Readonly<Record<string, string>>;
  readonly ResourceAttributes: Readonly<Record<string, string>>;
  readonly 'Events.Timestamp': readonly string[];
  readonly 'Events.Name': readonly string[];
  readonly 'Events.Attributes': readonly Readonly<Record<string, string>>[];
}

/**
 * Ten span GOC do `OtelTraceBridge.turn()` mo. No KHONG phai mot buoc nghiep vu: o duong trong
 * bo nho khong ban ghi nao ung voi no, nen dung no thanh mot nut se lam cay lich su co them mot
 * nhip ma cay hien tai khong co — tuc hai man hinh cho cung mot luot.
 *
 * No van duoc doc, chi la doc cho viec khac: neo nghiep vu va moc bat dau.
 */
const TURN_SPAN_NAME = 'turn';

const ANCHOR_PREFIX = 'nexagnet.';
const EMPTY_SPAN_ID = '0000000000000000';

/** Ten su kien do `TelemetryService.forward()` phat. Ten khac -> khong phai cua ta, bo qua. */
const EVENT_DECISION = 'decision';
const EVENT_STATE_CHANGE = 'state_change';
const EVENT_DATA_CHANGE = 'data_change';

const DECISION_OUTCOMES: readonly string[] = ['allowed', 'denied', 'degraded', 'ok', 'error'];

export function spansToStoredTraces(rows: readonly HistoricalSpanRow[]): readonly StoredTrace[] {
  const byTrace = new Map<string, HistoricalSpanRow[]>();
  for (const row of rows) {
    const traceId = text(row?.TraceId);
    const spanId = text(row?.SpanId);
    if (!traceId || !spanId) continue;
    const bucket = byTrace.get(traceId);
    if (bucket) bucket.push(row);
    else byTrace.set(traceId, [row]);
  }

  const traces: StoredTrace[] = [];
  for (const [traceId, spans] of byTrace) traces.push(buildStoredTrace(traceId, spans));

  // CU NHAT TRUOC — cung hop dong voi `RecentTracesSink.findAllByOrderId`, noi thu tu chen chinh
  // la thu tu luot bat dau. Man hinh chan doan doc mot chuoi luot theo thoi gian, khong theo
  // thu tu ma kho tinh co tra ve.
  return traces.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function buildStoredTrace(traceId: string, spans: HistoricalSpanRow[]): StoredTrace {
  const ordered = [...spans].sort((a, b) => isoOf(a).localeCompare(isoOf(b)));
  const root = ordered.find((span) => text(span?.SpanName) === TURN_SPAN_NAME);
  const envelopeSource = root ?? ordered[0]!;
  const anchors = anchorsOf(envelopeSource);
  const identity = identityOf(envelopeSource);

  const records: TelemetryRecord[] = [];
  for (const span of ordered) {
    // Span goc khong thanh buoc — nhung su kien treo tren no (neu co) van la bang chung.
    if (span !== root) records.push(spanRecord(span, anchors, identity));
    records.push(...eventRecords(span, anchors, identity));
  }

  return { traceId, records, startedAt: isoOf(envelopeSource) };
}

/** Phan chung cua moi ban ghi trong mot luot — doc mot lan tu span dai dien. */
interface HistoricalIdentity {
  readonly tenant: string;
  readonly environment: string;
  readonly release?: string;
  readonly releaseSha?: string;
}

function identityOf(span: HistoricalSpanRow): HistoricalIdentity {
  const resource = asRecord(span?.ResourceAttributes);
  const releaseSha = text(resource['nexagnet.release']);
  return {
    tenant: text(resource['nexagnet.tenant']) ?? 'unknown',
    environment: text(resource['deployment.environment.name']) ?? 'unknown',
    // `unknown` la mot GIA TRI THAT trong kho (span cua ban phat hanh truoc khi §7.6 duoc sua),
    // va no khong duoc bien thanh mot permalink. Khong biet thi truong VANG MAT.
    ...(releaseSha && releaseSha !== 'unknown'
      ? { release: releaseSha.slice(0, 12), releaseSha }
      : {}),
  };
}

function anchorsOf(span: HistoricalSpanRow): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(asRecord(span?.SpanAttributes))) {
    if (!key.startsWith(ANCHOR_PREFIX)) continue;
    const name = key.slice(ANCHOR_PREFIX.length);
    // Thuoc tinh cua QUYET DINH / cong cu cung mang tien to `nexagnet.` — chung khong phai neo.
    if (name.includes('.')) continue;
    const value_ = text(value);
    if (value_) out[name] = value_;
  }
  return out;
}

function spanRecord(
  span: HistoricalSpanRow,
  anchors: Readonly<Record<string, string>>,
  identity: HistoricalIdentity,
): TelemetryRecord {
  const attributes = asRecord(span?.SpanAttributes);
  const parentSpanId = text(span?.ParentSpanId);
  const base = {
    traceId: text(span.TraceId)!,
    spanId: text(span.SpanId)!,
    ...(parentSpanId && parentSpanId !== EMPTY_SPAN_ID ? { parentSpanId } : {}),
    at: isoOf(span),
    ...identity,
    anchors,
  };
  const durationMs = durationMsOf(span);
  const status = statusOf(span);

  const provider = text(attributes['gen_ai.system']);
  if (provider) {
    return {
      type: 'ai_call',
      provider,
      model: text(attributes['gen_ai.request.model']) ?? 'unknown',
      operation: text(attributes['gen_ai.operation.name']) ?? 'unknown',
      durationMs,
      status,
      ...numberField('inputTokens', attributes['gen_ai.usage.input_tokens']),
      ...numberField('outputTokens', attributes['gen_ai.usage.output_tokens']),
      ...numberField('toolRounds', attributes['nexagnet.tool_rounds']),
      ...base,
    };
  }

  return {
    type: 'step',
    name: text(span?.SpanName) ?? '(khong ten)',
    durationMs,
    status,
    ...(status === 'error'
      ? { error: { name: 'SpanError', message: text(span?.StatusMessage) ?? 'span bao loi' } }
      : {}),
    ...base,
  };
}

/**
 * Su kien tren span -> ban ghi DIEM (quyet dinh / chuyen trang thai / thay doi du lieu).
 *
 * `parentSpanId` tro ve chinh span mang su kien, nen cay dung ra giong het duong trong bo nho:
 * quyet dinh nam TRONG buoc da sinh ra no.
 *
 * Ba lieu ke (`Events.Timestamp`, `Events.Name`, `Events.Attributes`) la ba cot RIENG cua mot cot
 * long — chung co the ve day khong bang do dai neu truy van bi cat hoac hang bi hong. Vong lap
 * chay theo `Events.Name` va TU TRA gia tri thieu, thay vi tin rang ba mang khop nhau.
 */
function eventRecords(
  span: HistoricalSpanRow,
  anchors: Readonly<Record<string, string>>,
  identity: HistoricalIdentity,
): TelemetryRecord[] {
  const names = asList(span?.['Events.Name']);
  const times = asList(span?.['Events.Timestamp']);
  const attributeList = span?.['Events.Attributes'];
  const out: TelemetryRecord[] = [];

  for (let index = 0; index < names.length; index += 1) {
    const name = text(names[index]);
    if (!name) continue;
    const attributes = asRecord(Array.isArray(attributeList) ? attributeList[index] : undefined);
    const base = {
      traceId: text(span.TraceId)!,
      // Su kien khong co span id rieng — deo mot id dan xuat tu span mang no, de hai su kien
      // tren cung mot buoc khong dung chung mot khoa.
      spanId: `${text(span.SpanId)}-e${index}`,
      parentSpanId: text(span.SpanId)!,
      at: toIso(text(times[index])) ?? isoOf(span),
      ...identity,
      anchors,
    };

    if (name === EVENT_DECISION) {
      const point = text(attributes['nexagnet.decision.point']);
      const reason = text(attributes['nexagnet.decision.reason']);
      if (!point || !reason) continue;
      const detail = detailOf(attributes);
      const source = sourceOf(attributes);
      out.push({
        type: 'decision',
        point,
        outcome: outcomeOf(attributes['nexagnet.decision.outcome']),
        reason,
        ...(detail ? { detail } : {}),
        ...(source ? { source } : {}),
        ...base,
      });
      continue;
    }

    if (name === EVENT_STATE_CHANGE) {
      const entity = text(attributes['nexagnet.entity']);
      const to = text(attributes['nexagnet.to']);
      if (!entity || !to) continue;
      const from = text(attributes['nexagnet.from']);
      const reason = text(attributes['nexagnet.reason']);
      out.push({
        type: 'state_change',
        entity,
        entityId: text(attributes['nexagnet.entityId']) ?? '',
        from: from && from !== '(moi tao)' ? from : null,
        to,
        ...(reason ? { reason } : {}),
        ...base,
      });
      continue;
    }

    if (name === EVENT_DATA_CHANGE) {
      const entity = text(attributes['nexagnet.entity']);
      const field = text(attributes['nexagnet.field']);
      if (!entity || !field) continue;
      const entityId = text(attributes['nexagnet.entityId']);
      out.push({
        type: 'data_change',
        entity,
        field,
        from: attributes['nexagnet.from'] ?? null,
        to: attributes['nexagnet.to'] ?? null,
        ...(entityId ? { entityId } : {}),
        ...base,
      });
    }
    // Ten khac (`exception` cua instrumentation, su kien cua thu vien ngoai) khong thuoc ngon
    // ngu nay. Bo qua, khong doan.
  }

  return out;
}

/**
 * VI TRI MA NGUON doc tu chinh su kien, KHONG tra bang `source-manifest`.
 *
 * Day la khac biet quan trong nhat giua duong lich su va duong trong bo nho, va no la mot BAN
 * SUA chu khong phai mot toi uu: `sourceForDecision()` tra loi bang bang duoc sinh luc BUILD cua
 * ban phat hanh DANG CHAY. Voi mot luot cua ban phat hanh CU, bang do mo ta ma nguon khac — cung
 * mot diem quyet dinh co the da doi dong, doi ham, hoac doi tep. Mot permalink dung so dong MOI
 * tro vao commit CU la mot lien ket sai TU TIN, dung loai sai ma toan bo tang danh tinh release
 * ton tai de ngan.
 *
 * Ba khoa `code.*` da duoc ghi kem su kien LUC NO XAY RA, nen chung mo ta dung ma nguon da chay.
 */
function sourceOf(attributes: Readonly<Record<string, string>>): SourceLocation | null {
  const filePath = text(attributes['code.file.path']);
  if (!filePath) return null;
  const functionName = text(attributes['code.function.name']);
  const line = Number(attributes['code.line.number']);
  return {
    filePath,
    ...(functionName ? { functionName } : {}),
    ...(Number.isFinite(line) && line > 0 ? { line } : {}),
  };
}

/** So lieu lam ro quyet dinh — moi thu KHONG phai khoa ky thuat cua chinh su kien do. */
function detailOf(attributes: Readonly<Record<string, string>>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('nexagnet.decision.') || key.startsWith('code.')) continue;
    const value_ = text(value);
    if (value_) out[key] = value_;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Ket cuc khong doc duoc -> `degraded`, khong phai `allowed`.
 *
 * Mot ket cuc khong ro KHONG duoc doc thanh "da cho phep": man hinh chan doan to mau theo truong
 * nay, va to xanh mot quyet dinh ma ta khong biet ket cuc la noi doi ve phia nguy hiem.
 */
function outcomeOf(raw: string | undefined): DecisionOutcome {
  const value = text(raw);
  return (value && DECISION_OUTCOMES.includes(value) ? value : 'degraded') as DecisionOutcome;
}

function durationMsOf(span: HistoricalSpanRow): number {
  const raw = Number(span?.Duration);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.round(raw / 1_000_000);
}

function statusOf(span: HistoricalSpanRow): 'ok' | 'error' {
  return text(span?.StatusCode)?.toLowerCase() === 'error' ? 'error' : 'ok';
}

function isoOf(span: HistoricalSpanRow): string {
  return toIso(text(span?.Timestamp)) ?? new Date(0).toISOString();
}

/**
 * `'2026-08-28 07:30:00.123456789'` -> `'2026-08-28T07:30:00.123Z'`.
 *
 * HAI CHO DE SAI, ca hai deu im lang:
 *   · thieu `Z` thi `new Date()` doc chuoi nay theo gio DIA PHUONG cua may chu, con ClickHouse
 *     luon luu UTC — mot luot se lech vai gio tuy may;
 *   · nano-giay lam `Date` tra `Invalid Date`, nen phai cat con mili.
 */
function toIso(raw: string | undefined): string | null {
  if (!raw) return null;
  if (raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const [date, time = ''] = raw.split(' ');
  if (!date) return null;
  const [clock = '', fraction = ''] = time.split('.');
  const millis = fraction.slice(0, 3).padEnd(3, '0');
  const parsed = new Date(`${date}T${clock || '00:00:00'}.${millis}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function numberField<K extends string>(
  key: K,
  raw: string | undefined,
): Partial<Record<K, number>> {
  if (raw === undefined) return {};
  const value = Number(raw);
  return Number.isFinite(value) ? ({ [key]: value } as Record<K, number>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function asRecord(value: unknown): Readonly<Record<string, string>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};
}

function asList(value: unknown): readonly string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}
