import type { LoggerService, LogLevel } from '@nestjs/common';
import type { TelemetryRecord, TelemetrySink } from './telemetry-record.js';
import { scrubSecrets } from './telemetry-redaction.js';
import { traceSnapshot } from './trace-context.js';

/**
 * Mot DONG JSON cho mot su kien — dinh dang NDJSON.
 *
 * VI SAO KHONG DUNG PINO: audit cho thay 42 file da dung `new Logger('<Ten>')` cua Nest va
 * KHONG co `console.log` nao. Ky luat do dang gia. Doi sang Pino nghia la sua 42 file de doi lay
 * dung mot thu — JSON — ma mot `LoggerService` tu viet cung cho duoc, trong khi van giu nguyen
 * moi cho goi. REUSE API, thay TRANSPORT (muc 15).
 *
 * Cai thuc su thieu khong phai thu vien log, ma la HAI thu:
 *   1. log co truong de MAY loc duoc (`intent=` trong template string thi khong loc duoc);
 *   2. moi dong deu mang `traceId` de noi duoc voi cac dong khac cua cung mot luot.
 * Ca hai deu nam o day.
 */

/** Ghi mot dong ra stdout. Tach rieng de test thay duoc, va de doi huong khi can. */
export type LineWriter = (line: string) => void;

const defaultWriter: LineWriter = (line) => process.stdout.write(`${line}\n`);

/**
 * Serialize an toan. `JSON.stringify` co the nem (vong tron, BigInt); mot dong log hong khong
 * duoc phep lam chet tien trinh.
 */
function toLine(payload: Record<string, unknown>): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      logger: 'StructuredLogging',
      msg: 'khong serialize duoc ban ghi log',
    });
  }
}

/* ------------------------------------------------------------------ *
 * 1. Sink: ban ghi telemetry -> NDJSON
 * ------------------------------------------------------------------ */

/**
 * Day ban ghi telemetry ra stdout duoi dang NDJSON.
 *
 * Dong bo va khong co bo dem: `process.stdout.write` sang pipe cua Docker la mot lan ghi
 * khong chan (non-blocking) o Linux, va khoi luong that la 10-20 don/ngay. Them mot hang doi o
 * day la them mot thu co the day tran ma khong doi lay gi.
 */
export class StructuredLogSink implements TelemetrySink {
  constructor(private readonly write: LineWriter = defaultWriter) {}

  record(record: TelemetryRecord): void {
    const { type, traceId, spanId, parentSpanId, at, tenant, environment, release, anchors } =
      record;
    const base: Record<string, unknown> = {
      ts: at,
      level: levelFor(record),
      // `event` la khoa loc chinh: `event=decision`, `event=ai_call`.
      event: type,
      traceId,
      spanId,
      ...(parentSpanId ? { parentSpanId } : {}),
      tenant,
      environment,
      ...(release ? { release } : {}),
      ...anchors,
    };

    switch (record.type) {
      case 'step':
        this.write(
          toLine({
            ...base,
            step: record.name,
            durationMs: record.durationMs,
            status: record.status,
            ...(record.error ? { error: record.error } : {}),
            ...(record.attributes ? { attributes: record.attributes } : {}),
          }),
        );
        return;
      case 'decision':
        this.write(
          toLine({
            ...base,
            decision: record.point,
            outcome: record.outcome,
            reason: record.reason,
            ...(record.detail ? { detail: record.detail } : {}),
          }),
        );
        return;
      case 'state_change':
        this.write(
          toLine({
            ...base,
            entity: record.entity,
            entityId: record.entityId,
            from: record.from,
            to: record.to,
            ...(record.reason ? { reason: record.reason } : {}),
          }),
        );
        return;
      case 'data_change':
        this.write(
          toLine({
            ...base,
            entity: record.entity,
            ...(record.entityId ? { entityId: record.entityId } : {}),
            field: record.field,
            from: record.from,
            to: record.to,
          }),
        );
        return;
      case 'ai_call':
        this.write(
          toLine({
            ...base,
            // Ten theo OpenTelemetry GenAI semantic conventions — de day sang SigNoz/Langfuse
            // sau nay khong phai doi ten lai (muc 19 + 22).
            'gen_ai.system': record.provider,
            'gen_ai.request.model': record.model,
            'gen_ai.operation.name': record.operation,
            durationMs: record.durationMs,
            status: record.status,
            ...(record.inputTokens !== undefined
              ? { 'gen_ai.usage.input_tokens': record.inputTokens }
              : {}),
            ...(record.outputTokens !== undefined
              ? { 'gen_ai.usage.output_tokens': record.outputTokens }
              : {}),
            ...(record.toolRounds !== undefined ? { toolRounds: record.toolRounds } : {}),
            ...(record.toolNames ? { toolNames: record.toolNames } : {}),
            ...(record.error ? { error: record.error } : {}),
            ...(record.attributes ? { attributes: record.attributes } : {}),
          }),
        );
        return;
    }
  }
}

function levelFor(record: TelemetryRecord): string {
  if (record.type === 'step' || record.type === 'ai_call') {
    return record.status === 'error' ? 'error' : 'info';
  }
  // Mot quyet dinh `denied` KHONG phai loi — no la he thong lam dung viec. Nhung no la thu
  // nguoi ta di tim khi debug, nen nang len `warn` de loc nhanh.
  if (record.type === 'decision') return record.outcome === 'denied' ? 'warn' : 'info';
  return 'info';
}

/* ------------------------------------------------------------------ *
 * 2. LoggerService cua Nest -> NDJSON, tu dinh kem trace context
 * ------------------------------------------------------------------ */

const LEVEL_RANK: Record<string, number> = {
  verbose: 10,
  debug: 20,
  log: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * Thay TRANSPORT cua Nest Logger. Moi `this.logger.log(...)` san co tu dong duoc:
 *   · dinh dang JSON;
 *   · dinh kem `traceId` + tenant + environment + release + neo nghiep vu;
 *   · quet BI MAT tren noi dung (muc 14) — day la luoi an toan cuoi cung, vi log la cho de lo
 *     nhat: khong ai review mot chuoi template nhu review mot payload.
 *
 * KHONG doi mot dong nao trong 42 file dang goi.
 */
export class StructuredNestLogger implements LoggerService {
  private readonly threshold: number;

  constructor(
    level: string = 'log',
    private readonly write: LineWriter = defaultWriter,
  ) {
    this.threshold = LEVEL_RANK[level] ?? LEVEL_RANK.log!;
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.emit('log', message, rest);
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.emit('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.emit('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.emit('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.emit('verbose', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]): void {
    this.emit('fatal', message, rest);
  }

  setLogLevels(_levels: LogLevel[]): void {
    // Muc log dat mot lan qua `LOG_LEVEL` luc boot. Nest goi ham nay khi bootstrap; khong lam gi
    // la co y — de mot lua chon van hanh khong bi framework ghi de.
  }

  private emit(level: string, message: unknown, rest: readonly unknown[]): void {
    if ((LEVEL_RANK[level] ?? 0) < this.threshold) return;
    try {
      // Nest truyen `context` (ten logger) la doi so CUOI cung khi goi tu `new Logger('X')`.
      const context = typeof rest.at(-1) === 'string' ? (rest.at(-1) as string) : undefined;
      const stack = rest.find(
        (item): item is string =>
          typeof item === 'string' && item !== context && item.includes('\n'),
      );
      this.write(
        toLine({
          ts: new Date().toISOString(),
          level,
          ...(context ? { logger: context } : {}),
          msg: scrubSecrets(stringify(message)),
          ...(stack ? { stack: scrubSecrets(stack) } : {}),
          ...traceSnapshot(),
        }),
      );
    } catch {
      /* fail-open: mot dong log hong khong duoc lam gian doan nghiep vu */
    }
  }
}

function stringify(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return `${message.name}: ${message.message}`;
  try {
    return JSON.stringify(message) ?? String(message);
  } catch {
    return String(message);
  }
}
