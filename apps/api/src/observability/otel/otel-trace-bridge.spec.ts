import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { context, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { OtelTraceBridge } from './otel-trace-bridge.js';
import { TelemetryService } from '../telemetry.service.js';
import type { TelemetryRecord } from '../telemetry-record.js';
import { SALES_ORDER_DECISIONS } from '../../orders/sales-order-decisions.js';

/**
 * CAU HOI DUY NHAT bai nay tra loi: cay span cua runtime tracing va cay ban ghi nghiep vu co la
 * MOT khong?
 *
 * Neu khong, ca POC vo nghia — span Prisma/undici se treo o mot cay, con quyet dinh nghiep vu
 * nam o cay khac, va nguoi debug lai phai ghep tay dung nhu hom nay ho ghep giua trace UI va
 * dashboard Hatchet.
 *
 * Dung `NodeTracerProvider.register()` chu khong tu lap `ContextManager`: `register()` la thu
 * `otel-runtime.ts` goi that, nen bai test chay dung duong ma production chay.
 */
describe('OtelTraceBridge', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    provider.register();
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  function telemetryWithBridge(): { telemetry: TelemetryService; records: TelemetryRecord[] } {
    const records: TelemetryRecord[] = [];
    const telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'poc', environment: 'test', gitSha: 'abcdef1234567890' },
      privacy: 'full',
      sinks: [{ record: (record) => records.push(record) }],
      bridge: new OtelTraceBridge(provider.getTracer('test')),
    });
    return { telemetry, records };
  }

  function byName(spans: readonly ReadableSpan[], name: string): ReadableSpan {
    const found = spans.find((span) => span.name === name);
    if (!found) throw new Error(`khong tim thay span ${name} trong [${spans.map((s) => s.name)}]`);
    return found;
  }

  it('gives the business record the SAME traceId as the OTel span', async () => {
    const { telemetry, records } = telemetryWithBridge();

    await telemetry.runTurn({ chatId: 'group-1' }, async () => {
      await telemetry.step('message.persist', async () => undefined);
    });

    const turn = byName(exporter.getFinishedSpans(), 'turn');
    expect(records).toHaveLength(1);
    expect(records[0]!.traceId).toBe(turn.spanContext().traceId);
  });

  it('nests a step span under the turn span, and reuses its spanId in the record', async () => {
    const { telemetry, records } = telemetryWithBridge();

    await telemetry.runTurn({ chatId: 'group-1' }, async () => {
      await telemetry.step('message.persist', async () => undefined);
    });

    const spans = exporter.getFinishedSpans();
    const turn = byName(spans, 'turn');
    const step = byName(spans, 'message.persist');
    expect(step.parentSpanContext?.spanId).toBe(turn.spanContext().spanId);
    // Ban ghi nghiep vu deo DUNG spanId cua span OTel -> mot cay, khong phai hai.
    expect(records[0]!.spanId).toBe(step.spanContext().spanId);
  });

  it('makes a span opened INSIDE a step a child of that step', async () => {
    // Day chinh la co che khien span Prisma/undici tu treo dung cho — chung duoc SDK tao ra
    // trong `context` dang chay, va `step()` da dat context do.
    const { telemetry } = telemetryWithBridge();
    const tracer = provider.getTracer('fake-instrumentation');

    await telemetry.runTurn({}, async () => {
      await telemetry.step('order.persist', async () => {
        tracer.startSpan('prisma:query').end();
      });
    });

    const spans = exporter.getFinishedSpans();
    expect(byName(spans, 'prisma:query').parentSpanContext?.spanId).toBe(
      byName(spans, 'order.persist').spanContext().spanId,
    );
  });

  it('continues an inbound traceparent instead of starting a second tree', async () => {
    const { telemetry } = telemetryWithBridge();
    const inboundTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';

    await telemetry.runTurn({}, async () => undefined, `00-${inboundTraceId}-00f067aa0ba902b7-01`);

    expect(exporter.getFinishedSpans()[0]!.spanContext().traceId).toBe(inboundTraceId);
  });

  it('records a decision as a span event with its typed reason', async () => {
    const { telemetry } = telemetryWithBridge();

    await telemetry.runTurn({}, async () => {
      telemetry.decision({
        vocabulary: SALES_ORDER_DECISIONS,
        point: 'order.auto_confirm',
        outcome: 'denied',
        reason: 'QUANTITY_ABOVE_THRESHOLD',
        detail: { totalQuantity: 80, threshold: 50 },
      });
    });

    const event = byName(exporter.getFinishedSpans(), 'turn').events[0];
    expect(event?.name).toBe('decision');
    expect(event?.attributes?.['nexagnet.decision.reason']).toBe('QUANTITY_ABOVE_THRESHOLD');
    expect(event?.attributes?.['nexagnet.decision.point']).toBe('order.auto_confirm');
  });

  it('turns an LLM call into a child span with real duration and gen_ai attributes', async () => {
    const { telemetry } = telemetryWithBridge();

    await telemetry.runTurn({}, async () => {
      telemetry.aiCall({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        operation: 'parse',
        durationMs: 1_200,
        status: 'error',
        error: new Error('HTTP 500'),
        inputTokens: 900,
      });
    });

    const span = byName(exporter.getFinishedSpans(), 'parse deepseek-v4-flash');
    expect(span.attributes['gen_ai.system']).toBe('deepseek');
    expect(span.attributes['gen_ai.usage.input_tokens']).toBe(900);
    expect(span.status.code).toBe(2); // ERROR
    // Do dai THAT chu khong phai mot su kien khong be rong: span bat dau lui ve `durationMs`.
    const durationMs = span.duration[0] * 1_000 + span.duration[1] / 1_000_000;
    expect(durationMs).toBeGreaterThanOrEqual(1_150);
  });

  it('marks the turn span as error when the business call throws, and rethrows unchanged', async () => {
    const { telemetry } = telemetryWithBridge();
    const boom = new Error('rules engine hong');

    await expect(
      telemetry.runTurn({}, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const turn = byName(exporter.getFinishedSpans(), 'turn');
    expect(turn.status.code).toBe(2);
    expect(turn.events.some((event) => event.name === 'exception')).toBe(true);
  });

  it('FAILS OPEN: business work still runs when the tracer itself throws', async () => {
    const records: TelemetryRecord[] = [];
    const telemetry = new TelemetryService();
    const brokenTracer = {
      startSpan: () => {
        throw new Error('tracer hong');
      },
    } as never;
    telemetry.configure({
      release: { tenant: 'poc', environment: 'test', gitSha: 'unknown' },
      privacy: 'full',
      sinks: [{ record: (record) => records.push(record) }],
      bridge: new OtelTraceBridge(brokenTracer),
    });

    const result = await telemetry.runTurn({ chatId: 'g' }, async () =>
      telemetry.step('order.persist', async () => 'ket qua nghiep vu'),
    );

    expect(result).toBe('ket qua nghiep vu');
    // Va ban ghi nghiep vu van ra doi, voi id tu sinh nhu truoc khi cau noi ton tai.
    expect(records[0]!.type).toBe('step');
    expect(records[0]!.spanId).toMatch(/^[0-9a-f]{16}$/);
  });
});
