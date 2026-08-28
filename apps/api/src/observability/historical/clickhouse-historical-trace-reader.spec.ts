import { describe, expect, it, vi } from 'vitest';
import {
  ClickHouseHistoricalTraceReader,
  readClickHouseReaderConfig,
  type ClickHouseReaderConfig,
} from './clickhouse-historical-trace-reader.js';

const TRACE = 'e2807496aa1b4c3d8e5f60718293a4b5';
const OTHER_TRACE = 'aaaa0000bbbb1111cccc2222dddd3333';
const RELEASE = '270ef27ade9a67f3a586acc3682287eb1a8c0010';
/**
 * Gia tri GIA LAP cho khoa doc. Dat thanh mot hang so co ten thay vi viet thang vao truong
 * `password` — mot chuoi nam canh chu `password` trong ma nguon la thu ma may quet bi mat phai
 * chan, va no dung khi lam vay ke ca khi lan nay la mot bai test.
 */
const FIXTURE_READER_KEY = 'gia-lap-khong-phai-bi-mat';

function config(overrides: Partial<ClickHouseReaderConfig> = {}): ClickHouseReaderConfig {
  return {
    endpoint: 'http://clickhouse:8123',
    database: 'obs_ultty_gd1_test',
    user: 'ultty_gd1_test_reader',
    password: FIXTURE_READER_KEY,
    tenant: 'ultty',
    timeoutMs: 3_000,
    maxSpans: 2_000,
    maxTraces: 20,
    ...overrides,
  };
}

function spanLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
      'nexagnet.release': RELEASE,
      'deployment.environment.name': 'gd1-test',
    },
    'Events.Timestamp': [],
    'Events.Name': [],
    'Events.Attributes': [],
    ...overrides,
  });
}

function ok(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('ClickHouseHistoricalTraceReader', () => {
  it('doc mot luot theo traceId va dich no ve mo hinh bang chung chung', async () => {
    const fetchImpl = vi.fn(async () =>
      ok(
        [
          spanLine(),
          spanLine({
            SpanId: '2222222222222222',
            ParentSpanId: '1111111111111111',
            SpanName: 'order.persist',
          }),
        ].join('\n'),
      ),
    );
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    const result = await reader.byTraceId(TRACE);

    expect(result.status).toBe('found');
    if (result.status !== 'found') return;
    expect(result.traces).toHaveLength(1);
    expect(result.traces[0]!.records[0]).toMatchObject({
      type: 'step',
      name: 'order.persist',
      releaseSha: RELEASE,
    });
  });

  it('KHONG BAO GIO cho ben goi doi khach — tenant duoc ghim luc dung', async () => {
    const fetchImpl = vi.fn(async () => ok(''));
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    await reader.byTraceId(TRACE);

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get('param_tenant')).toBe('ultty');
    const body = String(fetchImpl.mock.calls[0]![1]?.body);
    expect(body).toContain("ResourceAttributes['nexagnet.tenant'] = {tenant:String}");
  });

  it('tenant khong xac dinh -> TU CHOI DOC, khong hoi kho', async () => {
    const fetchImpl = vi.fn(async () => ok(spanLine()));
    const reader = new ClickHouseHistoricalTraceReader(config({ tenant: 'unknown' }), fetchImpl);

    const result = await reader.byTraceId(TRACE);

    expect(result).toEqual({ status: 'unavailable', reason: 'TENANT_UNRESOLVED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('kho tra ve rong -> not_found, KHONG phai unavailable', async () => {
    const reader = new ClickHouseHistoricalTraceReader(config(), async () => ok('\n  \n'));
    expect(await reader.byTraceId(TRACE)).toEqual({ status: 'not_found' });
  });

  it('kho tu choi -> unavailable/STORE_ERROR, khong bia ra ket qua rong', async () => {
    const reader = new ClickHouseHistoricalTraceReader(
      config(),
      async () => new Response('Code: 497. DB::Exception: not enough privileges', { status: 403 }),
    );
    expect(await reader.byTraceId(TRACE)).toEqual({
      status: 'unavailable',
      reason: 'STORE_ERROR',
    });
  });

  it('het gio -> unavailable/TIMEOUT', async () => {
    const reader = new ClickHouseHistoricalTraceReader(config(), async () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    });
    expect(await reader.byTraceId(TRACE)).toEqual({ status: 'unavailable', reason: 'TIMEOUT' });
  });

  it('kho khong noi toi duoc -> unavailable/STORE_ERROR', async () => {
    const reader = new ClickHouseHistoricalTraceReader(config(), async () => {
      throw new TypeError('fetch failed');
    });
    expect(await reader.byTraceId(TRACE)).toEqual({
      status: 'unavailable',
      reason: 'STORE_ERROR',
    });
  });

  it('traceId khong dung dang -> not_found, va KHONG mot lan hoi nao roi vao kho', async () => {
    const fetchImpl = vi.fn(async () => ok(spanLine()));
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    expect(await reader.byTraceId("' OR 1=1 --")).toEqual({ status: 'not_found' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('gia tri do nguoi dung dua di bang THAM SO, khong ghep vao cau lenh', async () => {
    const fetchImpl = vi.fn(async () => ok(''));
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    await reader.byOrderId("ORD-1'; DROP TABLE otel_traces; --");

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get('param_orderId')).toBe("ORD-1'; DROP TABLE otel_traces; --");
    expect(String(fetchImpl.mock.calls[0]![1]?.body)).not.toContain('DROP TABLE');
  });

  it('truy van bi CHAN TREN: co gioi han dong va co han gio', async () => {
    const fetchImpl = vi.fn(async () => ok(''));
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    await reader.byTraceId(TRACE);

    const url = new URL(String(fetchImpl.mock.calls[0]![0]));
    expect(url.searchParams.get('max_execution_time')).toBe('3');
    expect(url.searchParams.get('param_limit')).toBe('2000');
    expect(String(fetchImpl.mock.calls[0]![1]?.body)).toContain('LIMIT {limit:UInt32}');
  });

  it('khoa doc di o HEADER, khong o URL — de no khong lot vao log truy cap', async () => {
    const fetchImpl = vi.fn(async () => ok(''));
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    await reader.byTraceId(TRACE);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).not.toContain(FIXTURE_READER_KEY);
    const headers = new Headers(init?.headers);
    expect(headers.get('X-ClickHouse-Key')).toBe(FIXTURE_READER_KEY);
    expect(headers.get('X-ClickHouse-User')).toBe('ultty_gd1_test_reader');
  });

  it('doc theo don: tim cac luot truoc, roi lay span cua dung nhung luot do', async () => {
    const fetchImpl = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        ok([JSON.stringify({ TraceId: TRACE }), JSON.stringify({ TraceId: OTHER_TRACE })].join('\n')),
      )
      .mockResolvedValueOnce(ok(spanLine({ SpanName: 'order.persist' })));

    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);
    const result = await reader.byOrderId('ORD-9');

    expect(result.status).toBe('found');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = new URL(String(fetchImpl.mock.calls[1]![0]));
    expect(second.searchParams.get('param_traceIds')).toBe(`['${TRACE}','${OTHER_TRACE}']`);
  });

  it('don khong co luot nao -> not_found, va khong hoi lan thu hai', async () => {
    const fetchImpl = vi.fn(async () => ok(''));
    const reader = new ClickHouseHistoricalTraceReader(config(), fetchImpl);

    expect(await reader.byOrderId('ORD-KHONG-CO')).toEqual({ status: 'not_found' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('mot dong JSON hong khong lam hong ca cau tra loi', async () => {
    const reader = new ClickHouseHistoricalTraceReader(config(), async () =>
      ok([spanLine({ SpanName: 'order.persist' }), '{ khong-phai-json'].join('\n')),
    );

    const result = await reader.byTraceId(TRACE);
    expect(result.status).toBe('found');
  });
});

describe('readClickHouseReaderConfig', () => {
  const base = {
    OTEL_TRACING: 'on',
    CLICKHOUSE_READER_ENDPOINT: 'http://clickhouse:8123',
    CLICKHOUSE_DATABASE: 'obs_ultty_gd1_test',
    CLICKHOUSE_READER_USER: 'ultty_gd1_test_reader',
    CLICKHOUSE_READER_PASSWORD: FIXTURE_READER_KEY,
  } as NodeJS.ProcessEnv;

  it('doc du cau hinh -> co duong doc', () => {
    expect(readClickHouseReaderConfig(base, 'ultty')).toMatchObject({
      database: 'obs_ultty_gd1_test',
      tenant: 'ultty',
    });
  });

  it('thieu bat ky manh nao -> KHONG dung duong doc (null), khong doan mac dinh', () => {
    for (const key of [
      'CLICKHOUSE_READER_ENDPOINT',
      'CLICKHOUSE_DATABASE',
      'CLICKHOUSE_READER_USER',
      'CLICKHOUSE_READER_PASSWORD',
    ]) {
      expect(readClickHouseReaderConfig({ ...base, [key]: '' }, 'ultty')).toBeNull();
    }
  });

  it('quan sat tat -> khong dung duong doc', () => {
    expect(readClickHouseReaderConfig({ ...base, OTEL_TRACING: 'off' }, 'ultty')).toBeNull();
  });
});
