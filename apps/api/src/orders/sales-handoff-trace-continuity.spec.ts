import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditLog, OrderView } from '@netviet/shared';
import { resolve } from 'node:path';
import type { RecentTracesSink, StoredTrace } from '../observability/recent-traces.sink.js';
import type { AuditLogService } from '../audit/audit-log.service.js';
import type { TelemetryRecord } from '../observability/telemetry-record.js';

/**
 * SOI DAY W3C CO DI QUA DUOC DUONG QUAY LAI CUA WORKER KHONG.
 *
 * ---------------------------------------------------------------------------
 * SU CO 25/08/2026 (runtime proof tren `ultty-gd1-test`):
 *
 * Nhanh `approve` co trace day du. Nhung khi worker cua `sales-handoff-followup.v1` goi nguoc
 * `POST /internal/sales-handoff/:id/followup`, ban ghi quyet dinh cua lan danh dau ra doi voi
 * `traceId = "no-trace"` — gia tri du phong cua `TelemetryService.envelope()` khi khong co luot
 * nao dang mo. `RecentTracesSink` bo thang ban ghi do (no khong thuoc luot nao), nen buoc cuoi
 * cua ca day BIEN MAT khoi trace view.
 *
 * Worker DA gui `traceparent` (`sales-handoff-followup.steps.ts` -> `headers()`), va ha tang doc
 * no DA co san (`parseTraceparent`, `runInTrace({ continueFrom })`, `TelemetryService.runTurn`).
 * Cho DUT la RANH GIOI HTTP: khong ai noi header vao ngu canh trace.
 *
 * Hau qua: `approve -> outbox -> Hatchet -> worker -> callback -> mark` khong doc duoc nhu MOT
 * day tuong quan. Day la loi QUAN SAT, khong phai loi nghiep vu — nen bo kiem nay khang dinh ca
 * hai mat: soi day duoc noi, VA khong co gi cua nghiep vu doi.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BOOT CA `AppModule` THAT thay vi goi thang service:
 *
 * Cho hong nam o RANH GIOI HTTP. Mot bai kiem goi `SalesHandoffFollowupService.markFollowup()`
 * truc tiep se KHONG BAO GIO thay no — no da o sai phia cua ranh gioi. Bai kiem phai di qua
 * `fetch` that, qua guard that, voi header that, dung nhu worker lam.
 *
 * Chay o `AUTH_MODE=session` — che do cua ban deploy that — cung ly do voi
 * `sales-handoff-internal-auth.spec.ts`.
 */

const FIXTURE = resolve(
  new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  '../../packages/tenant/src/__tests__/fixtures/sales-handoff-followup',
);

const SERVICE_KEY = 'test-internal-service-key-0123456789';

/** `traceparent` cua worker: khuon W3C day du. Hai nua duoi day phai song sot qua ranh gioi. */
const WORKER_TRACE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const WORKER_SPAN_ID = '0123456789abcdef';
const WORKER_TRACEPARENT = `00-${WORKER_TRACE_ID}-${WORKER_SPAN_ID}-01`;

const HEX32 = /^[0-9a-f]{32}$/;

interface Harness {
  readonly base: string;
  readonly traces: RecentTracesSink;
  readonly audits: () => Promise<AuditLog[]>;
  readonly seed: (id: string) => Promise<string>;
  readonly close: () => Promise<void>;
}

async function bootApi(): Promise<Harness> {
  Object.assign(process.env, {
    TENANT_DIR: FIXTURE,
    PERSISTENCE: 'memory',
    CHANNEL_MODE: 'mock',
    NODE_ENV: 'test',
    AUTH_MODE: 'session',
    API_KEY: SERVICE_KEY,
    SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
    WORKFLOW_ENGINE: 'off',
  });
  delete process.env.TENANT;

  const { resetTenantCache } = await import('@netviet/tenant');
  resetTenantCache();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module.js');
  const { OrdersRepository } = await import('./orders.repository.js');
  const { RecentTracesSink } = await import('../observability/recent-traces.sink.js');
  const { AuditLogService } = await import('../audit/audit-log.service.js');

  const app = await NestFactory.create(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  });
  await app.listen(0, '127.0.0.1');
  const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const repo = app.get(OrdersRepository as never, { strict: false }) as {
    create: (view: OrderView) => Promise<OrderView>;
  };
  const audit = app.get(AuditLogService as never, { strict: false }) as AuditLogService;

  return {
    base: url,
    traces: app.get(RecentTracesSink as never, { strict: false }) as RecentTracesSink,
    audits: () => audit.list({ action: 'order.sales_handoff.followup', limit: 200 }),
    seed: async (id) => {
      const order = await repo.create({
        id,
        status: 'sent',
        intent: 'dat_don',
        chatId: 'IT-handoff-followup',
        rawText: 'lay 1 aaa',
        createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'pending',
          createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
        },
      } as unknown as OrderView);
      return order.id;
    },
    close: () => app.close(),
  };
}

describe('soi day trace xuyen duong quay lai cua worker workflow', () => {
  let api: Harness;

  beforeAll(async () => {
    api = await bootApi();
  }, 120_000);

  afterAll(async () => {
    await api?.close();
  });

  /** Dung KHUON ma worker that dung: `sales-handoff-followup.steps.ts` -> `ensureFollowup()`. */
  const markFollowup = (
    orderId: string,
    headers: Record<string, string> = {},
  ): Promise<Response> =>
    fetch(`${api.base}/internal/sales-handoff/${orderId}/followup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': SERVICE_KEY,
        'idempotency-key': `op-${orderId}`,
        ...headers,
      },
      body: JSON.stringify({ stage: 'reminder' }),
    });

  /** Ban ghi quyet dinh cua lan danh dau — mat xich cuoi cua day tuong quan. */
  const markDecisions = (stored: StoredTrace | null): TelemetryRecord[] =>
    (stored?.records ?? []).filter(
      (record) => record.type === 'decision' && record.point === 'order.handoff_followup_mark',
    );

  it('A. `traceparent` HOP LE -> callback noi tiep DUNG trace do, khong mo cay thu hai', async () => {
    const orderId = await api.seed('trace-ord-valid');

    const response = await markFollowup(orderId, { traceparent: WORKER_TRACEPARENT });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ applied: true, stage: 'reminder' });

    // Day la khang dinh trung tam: ban ghi cua lan danh dau nam trong CHINH trace cua worker.
    const stored = api.traces.get(WORKER_TRACE_ID);
    expect(stored, 'khong tim thay luot nao mang traceId cua worker').not.toBeNull();

    const decisions = markDecisions(stored);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      traceId: WORKER_TRACE_ID,
      outcome: 'allowed',
      reason: 'FOLLOWUP_MARKED',
    });
    // Khong con gia tri du phong o BAT KY ban ghi nao cua luot nay.
    expect(stored!.records.map((record) => record.traceId)).not.toContain('no-trace');
    // Span cua worker la CHA — quan he cha-con THAT, khong phai hai cay khau lai bang mot truong
    // chung. Thieu khang dinh nay thi mot ban sua chi copy `traceId` sang cung se "xanh" ma van
    // de lai cay trace phang.
    expect(decisions[0]).toMatchObject({ parentSpanId: WORKER_SPAN_ID });
    // Neo nghiep vu con nguyen, nen `findByOrderId` (nut "Xem luong xu ly") tim ra duoc.
    expect(api.traces.findByOrderId(orderId)?.traceId).toBe(WORKER_TRACE_ID);
  });

  it('B. KHONG co `traceparent` -> nghiep vu van chay, va luot van co danh tinh that', async () => {
    const orderId = await api.seed('trace-ord-absent');

    const response = await markFollowup(orderId);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ applied: true, stage: 'reminder' });

    const stored = api.traces.findByOrderId(orderId);
    expect(stored, 'ban ghi khong thuoc luot nao -> sink da bo no').not.toBeNull();
    expect(stored!.traceId).toMatch(HEX32);
    expect(markDecisions(stored)).toHaveLength(1);
  });

  it('C. `traceparent` SAI KHUON -> bo ngu canh do, mo luot moi, KHONG chet va KHONG nhan bua', async () => {
    const orderId = await api.seed('trace-ord-malformed');

    const response = await markFollowup(orderId, {
      // Rac co do dai bat thuong: mot header hong cua ben thu ba khong duoc lam rot mot don hang,
      // va cung khong duoc tro thanh danh tinh cua luot.
      traceparent: `00-${'z'.repeat(200)}-nonsense-01`,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ applied: true, stage: 'reminder' });

    const stored = api.traces.findByOrderId(orderId);
    expect(stored).not.toBeNull();
    expect(stored!.traceId).toMatch(HEX32);
    expect(stored!.traceId).not.toContain('z');
    expect(markDecisions(stored)).toHaveLength(1);
  });

  it('D. THU LAI cung mot callback -> van dung MOT lan danh dau va MOT ban ghi audit', async () => {
    const orderId = await api.seed('trace-ord-retry');

    // `traceparent` RIENG, khong dung lai cua bai A: hai bai gop chung mot luot se lam khang dinh
    // "dung mot ban ghi quyet dinh" cua bai A phu thuoc vao THU TU chay cua bai nay.
    const retryTraceparent = `00-b1b2c3d4e5f60718293a4b5c6d7e8f91-00fedcba98765432-01`;
    const first = await markFollowup(orderId, { traceparent: retryTraceparent });
    const second = await markFollowup(orderId, { traceparent: retryTraceparent });

    expect(await first.json()).toMatchObject({ applied: true, reason: 'FOLLOWUP_MARKED' });
    // `compareAndSet` van la cong quyet dinh duy nhat — tracing khong duoc dong vao ngu nghia do.
    expect(await second.json()).toMatchObject({
      applied: false,
      reason: 'FOLLOWUP_ALREADY_MARKED',
    });

    const audits = (await api.audits()).filter((entry) => entry.entityId === orderId);
    expect(audits).toHaveLength(1);
  });
});
