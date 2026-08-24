import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { context, trace, SpanKind } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { OtelWorkerTraceBridge } from './otel-worker-trace-bridge.js';
import {
  NOOP_WORKER_TRACE_BRIDGE,
  resolveWorkerTraceBridge,
  type WorkflowTaskTrace,
} from '../worker-trace-bridge.js';

/**
 * CAU HOI DUY NHAT bai nay tra loi: mot buoc chay trong TIEN TRINH WORKER co noi lai duoc vao
 * luot nghiep vu da bat dau o TIEN TRINH API khong — va no co lam duoc dieu do ma KHONG bao gio
 * lam hong buoc nghiep vu khong?
 *
 * Bon dau vao duoi day la bon truong hop CO THAT tren duong chay, khong phai bon bien:
 *
 *   traceparent HOP LE      run duoc kich hoat tu Nexagnet — duong chinh
 *   traceparent SAI KHUON   ai do sua tay `additionalMetadata` tren dashboard engine
 *   traceparent THIEU       run kich hoat tay tu dashboard, khong co ai o dau kia soi day
 *   OTEL_TRACING=off        toan bo production hom nay
 *
 * Ba truong hop cuoi PHAI ket thuc bang "buoc van chay". Do la bat bien so mot cua ca hai cau
 * noi, va no la thu duy nhat o day khong duoc phep co ngoai le.
 */
const UPSTREAM_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const UPSTREAM_SPAN_ID = '00f067aa0ba902b7';
const UPSTREAM_TRACEPARENT = `00-${UPSTREAM_TRACE_ID}-${UPSTREAM_SPAN_ID}-01`;

function taskInfo(overrides: Partial<WorkflowTaskTrace> = {}): WorkflowTaskTrace {
  return {
    workflowName: 'integration-handoff.v1',
    taskName: 'dispatch',
    traceparent: UPSTREAM_TRACEPARENT,
    attempt: 0,
    attributes: {
      'nexagnet.traceId': UPSTREAM_TRACE_ID,
      'nexagnet.tenant': 'workflow-enabled',
      'nexagnet.environment': 'test',
      'nexagnet.entityType': 'work-item',
      'nexagnet.entityId': 'WI-1',
    },
    ...overrides,
  };
}

describe('OtelWorkerTraceBridge', () => {
  let exporter: InMemorySpanExporter;
  let provider: NodeTracerProvider;
  let bridge: OtelWorkerTraceBridge;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
    // `register()` la thu `otel-runtime.ts` goi THAT — no cai luon ContextManager va Propagator
    // W3C toan cuc. Tu lap tay hai thu do se lam bai kiem chay mot duong khac voi production, ma
    // `propagation.extract` lai la dung thu phu thuoc vao Propagator do.
    provider.register();
    bridge = new OtelWorkerTraceBridge(provider.getTracer('test'));
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  function only(): ReadableSpan {
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    return spans[0]!;
  }

  it('noi lai vao trace thuong nguon: cung traceId, cha la span cua tien trinh API', async () => {
    await bridge.task(taskInfo(), async () => 'xong');

    const span = only();
    expect(span.spanContext().traceId).toBe(UPSTREAM_TRACE_ID);
    expect(span.parentSpanContext?.spanId).toBe(UPSTREAM_SPAN_ID);
    // CONSUMER, khong phai INTERNAL: day la dau NHAN cua mot hang doi, va do la thu phan biet do
    // tre CUA BUOC voi thoi gian NAM CHO trong hang.
    expect(span.kind).toBe(SpanKind.CONSUMER);
    expect(span.name).toBe('integration-handoff.v1 dispatch');
  });

  it('traceparent SAI KHUON -> buoc van chay, span thanh GOC (khong nem, khong bo qua)', async () => {
    const result = await bridge.task(
      taskInfo({ traceparent: 'khong-phai-mot-traceparent' }),
      async () => 'xong',
    );

    expect(result).toBe('xong');
    const span = only();
    expect(span.parentSpanContext).toBeUndefined();
    expect(span.spanContext().traceId).not.toBe(UPSTREAM_TRACE_ID);
  });

  it('traceparent THIEU -> buoc van chay, span thanh GOC', async () => {
    const result = await bridge.task(taskInfo({ traceparent: undefined }), async () => 42);

    expect(result).toBe(42);
    expect(only().parentSpanContext).toBeUndefined();
  });

  it('KHONG bao buoc tu dat header traceparent — runtime tiem roi, hai header se dut soi day', async () => {
    let seen: string | undefined | 'chua-goi' = 'chua-goi';
    await bridge.task(taskInfo(), async (outbound) => {
      seen = outbound;
      return null;
    });

    expect(seen).toBeUndefined();
  });

  it('loi cua buoc di ra NGUYEN VEN, va span mang ma ly do CO KIEU', async () => {
    class HandoffStepFailed extends Error {
      constructor(readonly reason: string) {
        super('he ngoai tra 503');
        this.name = 'HandoffStepFailed';
      }
    }

    await expect(
      bridge.task(taskInfo(), async () => {
        throw new HandoffStepFailed('UPSTREAM_5XX');
      }),
    ).rejects.toThrow('he ngoai tra 503');

    const span = only();
    expect(span.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span.attributes['nexagnet.failure.reason']).toBe('UPSTREAM_5XX');
    expect(span.events.map((event) => event.name)).toContain('exception');
  });

  it('ba lan chay sau hai lan sup = ba span ANH EM cung cha, phan biet bang `attempt`', async () => {
    for (const attempt of [0, 1, 2]) {
      await bridge.task(taskInfo({ attempt }), async () => null);
    }

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);
    // MOT trace duy nhat: mot lan sup cua worker khong duoc phep de lai mot cai cay thu hai.
    expect(new Set(spans.map((span) => span.spanContext().traceId))).toEqual(
      new Set([UPSTREAM_TRACE_ID]),
    );
    // CUNG mot cha, KHAC nhau o `attempt`. Doc len se thay ba span cach nhau nhung khoang trong
    // THAT — do la su that, khong phai mot cai cay duoc ve lai cho de nhin.
    expect(new Set(spans.map((span) => span.parentSpanContext?.spanId))).toEqual(
      new Set([UPSTREAM_SPAN_ID]),
    );
    expect(spans.map((span) => span.attributes['nexagnet.workflow.attempt'])).toEqual([0, 1, 2]);
  });

  it('span chi mang NEO DANH TINH — khong mot truong nao cua payload di ra', async () => {
    await bridge.task(
      taskInfo({
        attributes: {
          'nexagnet.traceId': UPSTREAM_TRACE_ID,
          'nexagnet.tenant': 'workflow-enabled',
        },
      }),
      async () => null,
    );

    const keys = Object.keys(only().attributes).sort();
    expect(keys).toEqual([
      'nexagnet.tenant',
      'nexagnet.traceId',
      'nexagnet.workflow.attempt',
      'nexagnet.workflow.name',
      'nexagnet.workflow.task',
    ]);
    // Khong khoa nao nam ngoai khong gian ten cua ta — tuc khong co duong nao cho mot truong cua
    // `input` di lac vao day ma khong bi nhin thay.
    expect(keys.every((key) => key.startsWith('nexagnet.'))).toBe(true);
  });
});

describe('resolveWorkerTraceBridge', () => {
  it('OTEL_TRACING khong bat -> NOOP, va NOOP truyen tiep soi day THUA KE', async () => {
    const bridge = await resolveWorkerTraceBridge({} as NodeJS.ProcessEnv);
    expect(bridge).toBe(NOOP_WORKER_TRACE_BRIDGE);

    let seen: string | undefined | 'chua-goi' = 'chua-goi';
    const result = await bridge.task(taskInfo(), async (outbound) => {
      seen = outbound;
      return 'buoc van chay';
    });

    expect(result).toBe('buoc van chay');
    // KHAC voi nhanh OTel: khong co ai tiem header ho, nen buoc PHAI tu dat soi day thua ke.
    // Day chinh la hanh vi cua production hom nay, va no phai giu nguyen tung byte.
    expect(seen).toBe(UPSTREAM_TRACEPARENT);
  });

  it('OTEL_TRACING=on nhung preload chua chay -> van NOOP (doc SU THAT, khong doc Y DINH)', async () => {
    // Khong co `--import otel-preload`, `startOtel()` chua duoc goi -> `isOtelRunning()` sai. Mo
    // span vao mot provider rong se bao cao "co quan sat" trong khi khong co gi ca.
    const bridge = await resolveWorkerTraceBridge({ OTEL_TRACING: 'on' } as NodeJS.ProcessEnv);
    expect(bridge).toBe(NOOP_WORKER_TRACE_BRIDGE);
  });
});
