import {
  context as otelContext,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
  type Attributes,
  type AttributeValue,
  type Span,
  type Tracer,
} from '@opentelemetry/api';
import { toTraceparent } from '../trace-context.js';
import type { TraceBridge } from '../trace-bridge.js';

/**
 * Hien thuc `TraceBridge` bang OpenTelemetry.
 *
 * Day la file DUY NHAT trong tang quan sat NGHIEP VU biet OpenTelemetry ton tai. Moi khai niem
 * rieng cua no — `context.with`, `SpanKind`, `SpanStatusCode`, `propagation.extract` — dung lai
 * o day, dung cach `hatchet-workflow-engine.adapter.ts` giam Hatchet vao mot file.
 *
 * BAT BIEN: khong phuong thuc nao trong file nay duoc phep lam hong `run`. Loi cua span la loi
 * cua QUAN SAT; loi cua `run` la loi cua NGHIEP VU. Hai thu do khong duoc tron.
 */

const TRACER_NAME = 'nexagnet.business';

/** Gia tri thuoc tinh OTel chi nhan vo huong + mang vo huong — ep ve cho dung, khong nem. */
function toAttributes(input: Readonly<Record<string, unknown>>): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
          ? item
          : JSON.stringify(item),
      ) as AttributeValue;
      continue;
    }
    // Object long nhau -> JSON. Bo loc rieng tu chay SAU, tren chuoi nay, nen khong co duong
    // nao mot bi mat lot qua bang cach nam sau mot lop object.
    out[key] = JSON.stringify(value);
  }
  return out;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export class OtelTraceBridge implements TraceBridge {
  private readonly tracer: Tracer;

  constructor(tracer?: Tracer) {
    this.tracer = tracer ?? trace.getTracer(TRACER_NAME);
  }

  turn<T>(continueFrom: string | undefined, run: (traceparent: string | undefined) => T): T {
    let span: Span;
    try {
      const active = otelContext.active();
      /*
       * BA DUONG, va THU TU giua chung la ca van de:
       *
       *   1. DA o trong mot span  -> dung context active NGUYEN VEN, bo qua `continueFrom`;
       *   2. co `traceparent`     -> extract no, span cua ta thanh CON cua span ben goi;
       *   3. khong co gi          -> span goc.
       *
       * VI SAO (1) PHAI DUNG TRUOC (2) — do bang thuc nghiem, khong suy dien:
       *
       * O duong quay lai `internal/sales-handoff`, `HttpInstrumentation` da mo mot span SERVER
       * cho request va TU extract chinh cai header do. Luc `runTurn` chay thi context active DA
       * thuoc dung trace. Neu ta extract LAI header, cha cua span luot tro thanh span cua WORKER
       * — tuc span luot nam CANH span server thay vi TRONG no, va mot nhip cua cay bi lam phang.
       * Do la kieu hong te nhat: BAT tracing len lam xau di dung cai cay ma tracing sinh ra de noi.
       *
       * Noi goi VAN phai truyen `continueFrom`: tang nghiep vu (`trace-context.ts`) khong biet gi
       * ve OTel va can header do khi OTel TAT. Hai duong khong danh nhau — chung xep thu tu.
       */
      const parent = trace.getSpan(active)
        ? active
        : continueFrom
          ? propagation.extract(active, { traceparent: continueFrom })
          : active;
      span = this.tracer.startSpan('turn', { kind: SpanKind.INTERNAL }, parent);
    } catch {
      return run(undefined);
    }

    const spanContext = span.spanContext();
    const traceparent = toTraceparent(spanContext.traceId, spanContext.spanId);

    return otelContext.with(trace.setSpan(otelContext.active(), span), () => {
      try {
        const result = run(traceparent);
        // `runTurn` co the tra ve Promise: dong span khi Promise ket thuc, khong dong som.
        // Dong som se lam span goc ngan hon moi span con cua chinh no — cay van dung nhung do
        // dai luot doc len thanh vo nghia, ma do dai luot la so nguoi debug nhin dau tien.
        if (isPromiseLike(result)) {
          return result.then(
            (value) => {
              this.finish(span);
              return value;
            },
            (error: unknown) => {
              this.finish(span, error);
              throw error;
            },
          ) as T;
        }
        this.finish(span);
        return result;
      } catch (error) {
        this.finish(span, error);
        throw error;
      }
    });
  }

  async step<T>(name: string, run: (spanId: string | undefined) => Promise<T>): Promise<T> {
    let span: Span;
    try {
      span = this.tracer.startSpan(name, { kind: SpanKind.INTERNAL });
    } catch {
      return run(undefined);
    }
    const spanId = span.spanContext().spanId;
    return otelContext.with(trace.setSpan(otelContext.active(), span), async () => {
      try {
        const result = await run(spanId);
        this.finish(span);
        return result;
      } catch (error) {
        this.finish(span, error);
        throw error;
      }
    });
  }

  event(name: string, attributes: Readonly<Record<string, unknown>>): void {
    try {
      trace.getActiveSpan()?.addEvent(name, toAttributes(attributes));
    } catch {
      /* fail-open */
    }
  }

  aiCall(input: {
    readonly name: string;
    readonly durationMs: number;
    readonly status: 'ok' | 'error';
    readonly attributes: Readonly<Record<string, unknown>>;
    readonly error?: { readonly name: string; readonly message: string };
  }): void {
    try {
      // Span dat NGUOC tu thoi diem hien tai: ben goi bao "vua chay xong het `durationMs`".
      // Lam vay de mot lan goi LLM hien ra dung do dai that tren truc thoi gian, thay vi thanh
      // mot su kien khong be rong — ma do tre cua LLM chinh la thu nguoi debug tim.
      const endTime = Date.now();
      const span = this.tracer.startSpan(input.name, {
        kind: SpanKind.CLIENT,
        startTime: endTime - input.durationMs,
      });
      span.setAttributes(toAttributes(input.attributes));
      if (input.status === 'error') {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          ...(input.error ? { message: `${input.error.name}: ${input.error.message}` } : {}),
        });
      }
      span.end(endTime);
    } catch {
      /* fail-open */
    }
  }

  anchor(attributes: Readonly<Record<string, unknown>>): void {
    try {
      trace.getActiveSpan()?.setAttributes(toAttributes(attributes));
    } catch {
      /* fail-open */
    }
  }

  private finish(span: Span, error?: unknown): void {
    try {
      if (error !== undefined) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
        if (error instanceof Error) span.recordException(error);
      }
      span.end();
    } catch {
      /* fail-open */
    }
  }
}
