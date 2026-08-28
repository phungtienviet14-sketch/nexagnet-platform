import { describe, expect, it } from 'vitest';
import { spansToStoredTraces, type HistoricalSpanRow } from './historical-span.js';

const TRACE = 'e2807496aa1b4c3d8e5f60718293a4b5';
const OLD_RELEASE = '270ef27ade9a67f3a586acc3682287eb1a8c0010';

function row(overrides: Partial<HistoricalSpanRow> = {}): HistoricalSpanRow {
  return {
    TraceId: TRACE,
    SpanId: '1111111111111111',
    ParentSpanId: '',
    SpanName: 'turn',
    ServiceName: 'nexagnet-api',
    Timestamp: '2026-08-28 07:30:00.123456789',
    Duration: '1500000000',
    StatusCode: 'Unset',
    StatusMessage: '',
    SpanAttributes: {},
    ResourceAttributes: {
      'nexagnet.tenant': 'ultty',
      'nexagnet.release': OLD_RELEASE,
      'nexagnet.release_source': 'manifest',
      'deployment.environment.name': 'gd1-test',
    },
    'Events.Timestamp': [],
    'Events.Name': [],
    'Events.Attributes': [],
    ...overrides,
  };
}

describe('spansToStoredTraces', () => {
  it('dung lai mot luot tu cac span, giu dung traceId va moc bat dau', () => {
    const traces = spansToStoredTraces([
      row(),
      row({
        SpanId: '2222222222222222',
        ParentSpanId: '1111111111111111',
        SpanName: 'conversation.resolve',
        Timestamp: '2026-08-28 07:30:00.200000000',
        Duration: '40000000',
        StatusCode: 'Ok',
      }),
    ]);

    expect(traces).toHaveLength(1);
    expect(traces[0]!.traceId).toBe(TRACE);
    // Moc bat dau la span GOC, khong phai ban ghi dau tien con lai sau khi loc.
    expect(traces[0]!.startedAt).toBe('2026-08-28T07:30:00.123Z');
    const step = traces[0]!.records[0]!;
    expect(step.type).toBe('step');
    expect(step).toMatchObject({ name: 'conversation.resolve', durationMs: 40, status: 'ok' });
  });

  it('span GOC khong tro thanh mot buoc, nhung neo cua no thi giu lai', () => {
    const traces = spansToStoredTraces([
      row({ SpanAttributes: { 'nexagnet.orderId': 'ORD-9', 'nexagnet.chatId': 'g1' } }),
      row({
        SpanId: '2222222222222222',
        ParentSpanId: '1111111111111111',
        SpanName: 'order.persist',
      }),
    ]);

    expect(traces[0]!.records.map((r) => r.type)).toEqual(['step']);
    expect(traces[0]!.records[0]!.anchors).toMatchObject({ orderId: 'ORD-9', chatId: 'g1' });
  });

  it('su kien quyet dinh tro lai thanh ban ghi quyet dinh CO MA LY DO', () => {
    const traces = spansToStoredTraces([
      row(),
      row({
        SpanId: '2222222222222222',
        ParentSpanId: '1111111111111111',
        SpanName: 'order.persist',
        'Events.Timestamp': ['2026-08-28 07:30:00.500000000'],
        'Events.Name': ['decision'],
        'Events.Attributes': [
          {
            'nexagnet.decision.point': 'order.auto_confirm',
            'nexagnet.decision.outcome': 'denied',
            'nexagnet.decision.reason': 'KILL_SWITCH_OFF',
            'code.file.path': 'apps/api/src/orders/sales-order-outcome.service.ts',
            'code.function.name': 'decide',
            'code.line.number': '42',
            totalQuantity: '60',
          },
        ],
      }),
    ]);

    const decision = traces[0]!.records.find((r) => r.type === 'decision');
    expect(decision).toMatchObject({
      type: 'decision',
      point: 'order.auto_confirm',
      outcome: 'denied',
      reason: 'KILL_SWITCH_OFF',
      parentSpanId: '2222222222222222',
    });
  });

  it('VI TRI MA NGUON di theo ban ghi, doc tu chinh su kien', () => {
    const traces = spansToStoredTraces([
      row(),
      row({
        SpanId: '2222222222222222',
        ParentSpanId: '1111111111111111',
        SpanName: 'order.persist',
        'Events.Timestamp': ['2026-08-28 07:30:00.500000000'],
        'Events.Name': ['decision'],
        'Events.Attributes': [
          {
            'nexagnet.decision.point': 'order.auto_confirm',
            'nexagnet.decision.outcome': 'denied',
            'nexagnet.decision.reason': 'KILL_SWITCH_OFF',
            'code.file.path': 'apps/api/src/orders/sales-order-outcome.service.ts',
            'code.line.number': '42',
          },
        ],
      }),
    ]);

    const decision = traces[0]!.records.find((r) => r.type === 'decision')!;
    expect(decision.source).toEqual({
      filePath: 'apps/api/src/orders/sales-order-outcome.service.ts',
      line: 42,
    });
  });

  it('giu DUNG release CU cua luot, ca ban 12 ky tu lan ban day du', () => {
    const withStep = spansToStoredTraces([
      row(),
      row({ SpanId: '2222222222222222', ParentSpanId: '1111111111111111', SpanName: 'turn.body' }),
    ]);
    expect(withStep[0]!.records[0]).toMatchObject({
      release: OLD_RELEASE.slice(0, 12),
      releaseSha: OLD_RELEASE,
      tenant: 'ultty',
      environment: 'gd1-test',
    });
  });

  it('span goi LLM tro lai thanh ban ghi ai_call', () => {
    const traces = spansToStoredTraces([
      row(),
      row({
        SpanId: '3333333333333333',
        ParentSpanId: '1111111111111111',
        SpanName: 'parse deepseek-v4-flash',
        Duration: '820000000',
        SpanAttributes: {
          'gen_ai.system': 'deepseek',
          'gen_ai.request.model': 'deepseek-v4-flash',
          'gen_ai.operation.name': 'parse',
          'gen_ai.usage.input_tokens': '1200',
          'gen_ai.usage.output_tokens': '80',
        },
      }),
    ]);

    expect(traces[0]!.records[0]).toMatchObject({
      type: 'ai_call',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      operation: 'parse',
      durationMs: 820,
      inputTokens: 1200,
      outputTokens: 80,
    });
  });

  it('tach nhieu luot ra dung, va sap xep CU NHAT TRUOC', () => {
    const other = 'ffffffffffffffffffffffffffffffff';
    const traces = spansToStoredTraces([
      row({ TraceId: other, Timestamp: '2026-08-28 09:00:00.000000000' }),
      row(),
    ]);
    expect(traces.map((t) => t.traceId)).toEqual([TRACE, other]);
  });

  describe('span hong / thieu truong KHONG duoc lam sap man hinh', () => {
    it('bo qua hang khong co TraceId hoac SpanId', () => {
      const traces = spansToStoredTraces([
        row(),
        row({ SpanId: '', ParentSpanId: '1111111111111111', SpanName: 'x' }),
        { ...row(), TraceId: '' },
      ]);
      expect(traces).toHaveLength(1);
      expect(traces[0]!.records).toHaveLength(0);
    });

    it('chiu duoc hang thieu han cac cot lieu ke va cot thuoc tinh', () => {
      const broken = {
        TraceId: TRACE,
        SpanId: '4444444444444444',
        SpanName: 'order.persist',
      } as unknown as HistoricalSpanRow;

      const traces = spansToStoredTraces([broken]);
      expect(traces).toHaveLength(1);
      expect(traces[0]!.records[0]).toMatchObject({ type: 'step', name: 'order.persist' });
      // Khong biet release thi KHONG bia ra mot chuoi — truong vang mat.
      expect(traces[0]!.records[0]!.releaseSha).toBeUndefined();
    });

    it('chiu duoc lieu ke su kien LECH DO DAI nhau', () => {
      const traces = spansToStoredTraces([
        row(),
        row({
          SpanId: '5555555555555555',
          ParentSpanId: '1111111111111111',
          SpanName: 'order.persist',
          'Events.Name': ['decision', 'state_change'],
          'Events.Timestamp': ['2026-08-28 07:30:00.500000000'],
          'Events.Attributes': [],
        }),
      ]);
      expect(traces[0]!.records.map((r) => r.type)).toEqual(['step']);
    });

    it('bo qua su kien khong co ten quen thuoc thay vi nem', () => {
      const traces = spansToStoredTraces([
        row(),
        row({
          SpanId: '6666666666666666',
          ParentSpanId: '1111111111111111',
          SpanName: 'order.persist',
          'Events.Name': ['exception'],
          'Events.Timestamp': ['2026-08-28 07:30:00.500000000'],
          'Events.Attributes': [{ 'exception.type': 'Error' }],
        }),
      ]);
      expect(traces[0]!.records.map((r) => r.type)).toEqual(['step']);
    });
  });
});
