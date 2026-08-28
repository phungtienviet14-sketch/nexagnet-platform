import { describe, expect, it, vi } from 'vitest';
import { RecentTracesSink } from '../recent-traces.sink.js';
import type { TelemetryRecord } from '../telemetry-record.js';
import {
  HistoricalTraceReaderPort,
  type HistoricalLookup,
} from './historical-trace-reader.port.js';
import { TraceLookupService } from './trace-lookup.service.js';

const TRACE = 'e2807496aa1b4c3d8e5f60718293a4b5';
const OLD_TRACE = 'aaaa0000bbbb1111cccc2222dddd3333';

function step(overrides: Partial<TelemetryRecord> = {}): TelemetryRecord {
  return {
    type: 'step',
    name: 'order.persist',
    durationMs: 5,
    status: 'ok',
    traceId: TRACE,
    spanId: '1111111111111111',
    at: '2026-08-28T07:30:00.000Z',
    tenant: 'ultty',
    environment: 'gd1-test',
    anchors: {},
    ...overrides,
  } as TelemetryRecord;
}

class StubReader extends HistoricalTraceReaderPort {
  readonly byTraceIdCalls: string[] = [];
  readonly byOrderIdCalls: string[] = [];

  constructor(private readonly answer: HistoricalLookup) {
    super();
  }

  async byTraceId(traceId: string): Promise<HistoricalLookup> {
    this.byTraceIdCalls.push(traceId);
    return this.answer;
  }

  async byOrderId(orderId: string): Promise<HistoricalLookup> {
    this.byOrderIdCalls.push(orderId);
    return this.answer;
  }
}

function historicalTrace(traceId: string, records: TelemetryRecord[] = [step({ traceId })]) {
  return { traceId, records, startedAt: '2026-08-20T01:00:00.000Z' };
}

describe('TraceLookupService', () => {
  describe('A. vong dem CON GIU -> khong mot lan hoi nao roi vao kho lich su', () => {
    it('theo traceId', async () => {
      const buffer = new RecentTracesSink();
      buffer.record(step());
      const reader = new StubReader({ status: 'found', traces: [historicalTrace(TRACE)] });

      const result = await new TraceLookupService(buffer, reader).byTraceId(TRACE);

      expect(result).toMatchObject({ status: 'found', origin: 'buffer' });
      expect(reader.byTraceIdCalls).toEqual([]);
    });

    it('theo don', async () => {
      const buffer = new RecentTracesSink();
      buffer.record(step({ anchors: { orderId: 'ORD-9' } }));
      const reader = new StubReader({ status: 'found', traces: [historicalTrace(OLD_TRACE)] });

      const result = await new TraceLookupService(buffer, reader).allByOrderId('ORD-9');

      expect(result).toMatchObject({ status: 'found', origin: 'buffer' });
      expect(reader.byOrderIdCalls).toEqual([]);
    });
  });

  describe('B. vong dem TRUOT -> lui ve kho lich su', () => {
    it('tra ve luot cua kho, va NOI RO no den tu dau', async () => {
      const reader = new StubReader({ status: 'found', traces: [historicalTrace(OLD_TRACE)] });

      const result = await new TraceLookupService(new RecentTracesSink(), reader).byTraceId(
        OLD_TRACE,
      );

      expect(result).toMatchObject({ status: 'found', origin: 'historical' });
      expect(reader.byTraceIdCalls).toEqual([OLD_TRACE]);
    });

    it('luot trong bo nho cua MOT don KHAC khong lam tat duong lui', async () => {
      const buffer = new RecentTracesSink();
      buffer.record(step({ anchors: { orderId: 'ORD-KHAC' } }));
      const reader = new StubReader({ status: 'found', traces: [historicalTrace(OLD_TRACE)] });

      const result = await new TraceLookupService(buffer, reader).allByOrderId('ORD-9');

      expect(result).toMatchObject({ status: 'found', origin: 'historical' });
    });
  });

  describe('C. kho hong -> noi ra la KHONG HOI DUOC, khong bia ra "khong co"', () => {
    it('het gio', async () => {
      const reader = new StubReader({ status: 'unavailable', reason: 'TIMEOUT' });
      const result = await new TraceLookupService(new RecentTracesSink(), reader).byTraceId(TRACE);
      expect(result).toEqual({ status: 'unavailable', reason: 'TIMEOUT' });
    });

    it('kho tra loi duoc va that su khong co -> not_found', async () => {
      const reader = new StubReader({ status: 'not_found' });
      const result = await new TraceLookupService(new RecentTracesSink(), reader).byTraceId(TRACE);
      expect(result).toEqual({ status: 'not_found' });
    });

    it('khong co duong doc nao -> NOT_CONFIGURED, khong phai not_found', async () => {
      const result = await new TraceLookupService(new RecentTracesSink()).byTraceId(TRACE);
      expect(result).toEqual({ status: 'unavailable', reason: 'NOT_CONFIGURED' });
    });

    it('hien thuc NEM ra ngoai van khong lam sap man hinh', async () => {
      const broken = {
        byTraceId: vi.fn(async () => {
          throw new Error('vo tinh');
        }),
        byOrderId: vi.fn(async () => {
          throw new Error('vo tinh');
        }),
      } as unknown as HistoricalTraceReaderPort;

      const result = await new TraceLookupService(new RecentTracesSink(), broken).byTraceId(TRACE);
      expect(result).toEqual({ status: 'unavailable', reason: 'STORE_ERROR' });
    });
  });

  describe('luot GOC duoc chon giong het duong trong bo nho', () => {
    it('bo luot DAN XUAT (co causationTraceId) khi hoi "luot nao sinh ra don nay"', async () => {
      const derived = historicalTrace('11112222333344445555666677778888', [
        step({ traceId: '11112222333344445555666677778888', anchors: { causationTraceId: TRACE } }),
      ]);
      const origin = historicalTrace(OLD_TRACE);
      const reader = new StubReader({ status: 'found', traces: [derived, origin] });

      const result = await new TraceLookupService(new RecentTracesSink(), reader).byOrderId('ORD-9');

      expect(result).toMatchObject({ status: 'found', origin: 'historical' });
      if (result.status !== 'found') return;
      expect(result.traces).toHaveLength(1);
      expect(result.traces[0]!.traceId).toBe(OLD_TRACE);
    });
  });
});
