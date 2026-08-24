import { UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentTrace, AuditLog, OrderView, PricedOrder } from '@netviet/shared';
import { InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { RecentTracesSink } from '../observability/recent-traces.sink.js';
import type { TelemetryRecord } from '../observability/telemetry-record.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { InMemoryOrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * SU CO 22/08/2026 — MOT TIN RA NHOM KHACH MA KHONG CO MOT VET NAO.
 *
 * Trace that `b44d631ccf83ac96706585179a91c2a6` ket thuc luc 05:24:44.128Z bang
 * `advice.auto_reply -> denied KILL_SWITCH_OFF`. **3,8 giay sau**, luc 05:24:47.909Z, cau tra loi
 * VAN ra nhom (`Message direction=outbound, source=system_outbound`) vi Sale bam "Duyet & gui".
 * Grep toan bo `docker logs` cua so 05:24:44–05:24:59: khong MOT DONG NAO. `AuditLog` tu 05:20:
 * chi `auth.login` + `automation.auto_send`.
 *
 * Hau qua khong phai "thieu log" ma la mot NHAN SAI: doc trace luot do se ket luan "he thong
 * khong gui gi" — trong khi khach da nhan tin. Cung ho loi voi §9.4 muc 5 ("nhan sai te hon
 * khong co nhan"), lan nay o duong NGUOI BAM NUT.
 *
 * File nay tai hien dung trinh tu do: cong tu dong DONG -> nguoi duyet -> tin THAT SU di ra.
 * Sau khi sua, phai nhin duoc CA HAI hanh dong.
 */

const TRACE: AgentTrace = {
  steps: [],
  primaryRole: 'policy_finance',
  senderType: 'dai_ly',
  llmCalls: 1,
  brainMode: 'stub',
  supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
};

/** `traceId` cua luot tin Zalo goc — 32 hex theo W3C, dung dinh dang that. */
const INBOUND_TRACE_ID = 'b44d631ccf83ac96706585179a91c2a6';
const TEST_CHAT_ID = '8827137437588696665';

/** Kenh tu choi gui — de tach `SEND_FAILED` (degraded) khoi cac ma `denied`. */
class FailingAdapter extends ChannelAdapter {
  readonly name = 'failing';
  async sendMessage(): Promise<never> {
    throw new Error('Zalo tu choi');
  }
}

interface Harness {
  readonly orders: OrdersService;
  readonly repo: InMemoryOrdersRepository;
  readonly outbound: MockAdapter;
  readonly telemetry: TelemetryService;
  readonly sink: RecentTracesSink;
  readonly records: TelemetryRecord[];
  readonly auditEntries: () => Promise<AuditLog[]>;
}

function build(replyAdapter: ChannelAdapter = new MockAdapter()): Harness {
  const repo = new InMemoryOrdersRepository();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), replyAdapter);

  const records: TelemetryRecord[] = [];
  const sink = new RecentTracesSink();
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'fixture', environment: 'test', gitSha: 'unknown' },
    privacy: 'redacted',
    sinks: [sink, { record: (record) => records.push(record) }],
  });

  const audit = new AuditLogService(new InMemoryAuditLogRepository());

  return {
    orders: new OrdersService(repo, router, undefined, telemetry, audit),
    repo,
    outbound: replyAdapter instanceof MockAdapter ? replyAdapter : new MockAdapter(),
    telemetry,
    sink,
    records,
    auditEntries: () => audit.list(),
  };
}

function baseView(patch: Partial<OrderView>): OrderView {
  return {
    id: `o-${Math.random()}`,
    status: 'pending_review',
    createdAt: new Date().toISOString(),
    chatId: TEST_CHAT_ID,
    replyChannel: 'mock',
    rawText: 'v08 bao nhieu tien',
    intent: 'hoi_gia',
    parsed: null,
    priced: null,
    confidence: {},
    senderType: 'dai_ly',
    traceId: INBOUND_TRACE_ID,
    ...patch,
  };
}

function pricedOrder(): PricedOrder {
  return {
    orderType: 'TH1',
    dealerName: 'Meta HN',
    branch: 'HN',
    lines: [],
    itemsSubtotal: 4_900_000,
    shippingFee: 0,
    policy: 'cong_no_30',
    codCollect: false,
    codFee: 0,
    vat: false,
    vatAmount: 0,
    grandTotal: 4_900_000,
    warnings: [],
    confirmationText: 'XAC NHAN DON: 4.900.000d',
  };
}

const decisionsOf = (records: readonly TelemetryRecord[]): string[] =>
  records
    .filter((record) => record.type === 'decision')
    .map((record) => `${record.point}:${record.outcome}:${record.reason}`);

const stateChangesOf = (records: readonly TelemetryRecord[]) =>
  records.filter((record) => record.type === 'state_change');

describe('duong NGUOI BAM NUT phai de lai vet (su co 22/08/2026)', () => {
  let harness: Harness;
  beforeEach(() => {
    harness = build();
  });

  it('tin ra nhom qua nut duyet KHONG con im lang — co trace, quyet dinh co ma, va audit', async () => {
    const { orders, repo, outbound, records, auditEntries } = harness;
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    const sent = await orders.approve(view.id, 'phuong.nt');

    // 1. Tin THAT SU di ra — dung nua sau cua su co.
    expect(sent.status).toBe('sent');
    expect(outbound.sent[0]?.text).toContain('XAC NHAN DON');

    // 2. Truoc ban sua, mang nay RONG: khong mot ban ghi telemetry nao.
    expect(records.length).toBeGreaterThan(0);
    const traceIds = new Set(records.map((record) => record.traceId));
    expect(traceIds.size).toBe(1);
    const traceId = [...traceIds][0]!;
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);

    // 3. Quyet dinh co MA CO KIEU, khong phai mot dong log tu do.
    expect(decisionsOf(records)).toContain('order.manual_approve:allowed:ROUTED_TO_CONFIRMATION');

    // 4. Hanh vi gui quan sat duoc, va chuyen trang thai duoc ghi.
    const steps = records.filter((record) => record.type === 'step').map((record) => record.name);
    expect(steps).toContain('order.approve');
    expect(stateChangesOf(records)).toContainEqual(
      expect.objectContaining({ entity: 'Order', from: 'pending_review', to: 'sent' }),
    );

    // 5. So audit ghi dung NGUOI bam, va noi duoc sang trace.
    const approval = (await auditEntries()).find((entry) => entry.action === 'order.approve');
    expect(approval).toBeDefined();
    expect(approval!.actor).toBe('phuong.nt');
    expect(approval!.entityId).toBe(view.id);
    expect(approval!.after).toMatchObject({
      status: 'sent',
      reason: 'ROUTED_TO_CONFIRMATION',
      traceId,
    });
  });

  it('luot cua nguoi la trace MOI, noi voi luot tin goc bang causationTraceId', async () => {
    const { orders, repo, records } = harness;
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    await orders.approve(view.id, 'phuong.nt');

    const record = records[0]!;
    // Trace MOI: khong dung lai traceId cua tin goc — mot cu bam chuot sau 3,8 giay (hay sang hom
    // sau) khong duoc phep tinh vao do dai cua luot xu ly tin.
    expect(record.traceId).not.toBe(INBOUND_TRACE_ID);
    // …nhung phai lan nguoc ve duoc.
    expect(record.anchors.causationTraceId).toBe(INBOUND_TRACE_ID);
    expect(record.anchors.orderId).toBe(view.id);
    expect(record.anchors.chatId).toBe(TEST_CHAT_ID);
    expect(record.anchors.actor).toBe('phuong.nt');
    expect(record.anchors.channel).toBe('operator_console');
  });

  it('nut "Xem luong xu ly" van tra luot GOC, khong phai luot vua bam', async () => {
    const { orders, repo, telemetry, sink } = harness;
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    // Mot luot tin Zalo goc: khong co `causationTraceId`.
    telemetry.runTurn({ orderId: view.id, chatId: view.chatId, channel: 'zca' }, () => {
      telemetry.decision({
        point: 'advice.auto_reply',
        outcome: 'denied',
        reason: 'KILL_SWITCH_OFF',
      });
    });
    const origin = sink.findByOrderId(view.id)!.traceId;

    await orders.approve(view.id, 'phuong.nt');

    expect(sink.findByOrderId(view.id)!.traceId).toBe(origin);
    // Ma luot cua nguoi van co trong vong dem — chi la khong gia danh luot goc.
    expect(sink.list(10).some((stored) => stored.traceId !== origin)).toBe(true);
  });

  it('bam nut ma khong co gi de gui: ghi ma NOTHING_TO_SEND thay vi chi nem 422', async () => {
    const { orders, repo, outbound, records, auditEntries } = harness;
    const view = await repo.create(baseView({ trace: TRACE }));

    await expect(orders.approve(view.id, 'phuong.nt')).rejects.toThrow(
      UnprocessableEntityException,
    );

    expect(outbound.sent).toHaveLength(0);
    expect(decisionsOf(records)).toContain('order.manual_approve:denied:NOTHING_TO_SEND');
    expect((await auditEntries()).map((entry) => entry.action)).toContain('order.approve');
  });

  it('lan gui THAT BAI la `degraded`, khong phai `denied` — hai thu can hai cach sua', async () => {
    const failing = build(new FailingAdapter());
    const view = await failing.repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    await expect(failing.orders.approve(view.id, 'phuong.nt')).rejects.toThrow();

    expect(decisionsOf(failing.records)).toContain('order.manual_approve:degraded:SEND_FAILED');
    // Don giu nguyen de gui lai — khong duoc am tham nhay sang `sent`.
    expect((await failing.repo.findById(view.id))!.status).toBe('pending_review');
  });

  it('tu choi don: ma REJECTED + chuyen trang thai + audit dung nguoi', async () => {
    const { orders, repo, records, auditEntries } = harness;
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    await orders.reject(view.id, 'quan.ly');

    expect(decisionsOf(records)).toContain('order.manual_reject:allowed:REJECTED');
    expect(stateChangesOf(records)).toContainEqual(
      expect.objectContaining({ from: 'pending_review', to: 'rejected' }),
    );
    const rejection = (await auditEntries()).find((entry) => entry.action === 'order.reject');
    expect(rejection?.actor).toBe('quan.ly');
  });

  it('hoan tat nhap ERP — moc khoa bat bien chong lech — co vet ca hai phia', async () => {
    const { orders, repo, records, auditEntries } = harness;
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));
    const sent = await orders.approve(view.id, 'phuong.nt');

    await orders.completeSalesHandoff(sent.id, 'ke.toan');

    expect(decisionsOf(records)).toContain('order.sales_handoff:allowed:HANDOFF_COMPLETED');
    expect(stateChangesOf(records)).toContainEqual(
      expect.objectContaining({ entity: 'SalesHandoff', to: 'completed' }),
    );
    const handoff = (await auditEntries()).find(
      (entry) => entry.action === 'order.sales_handoff.complete',
    );
    expect(handoff?.actor).toBe('ke.toan');
    expect(handoff?.after).toMatchObject({ reason: 'HANDOFF_COMPLETED' });
  });

  it('bam duyet lan hai: ALREADY_SENT, khong gui lai, van co vet', async () => {
    const { orders, repo, outbound, records } = harness;
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));
    await orders.approve(view.id, 'phuong.nt');

    await orders.approve(view.id, 'phuong.nt');

    expect(outbound.sent).toHaveLength(1);
    expect(decisionsOf(records)).toContain('order.manual_approve:denied:ALREADY_SENT');
  });

  it('QUAN SAT HONG KHONG DUOC LAM HONG NGHIEP VU — sink nem loi, tin van gui', async () => {
    const repo = new InMemoryOrdersRepository();
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    const telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'fixture', environment: 'test', gitSha: 'unknown' },
      privacy: 'redacted',
      sinks: [
        {
          record: () => {
            throw new Error('sink hong');
          },
        },
      ],
    });
    const orders = new OrdersService(repo, router, undefined, telemetry);
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    const sent = await orders.approve(view.id, 'phuong.nt');

    expect(sent.status).toBe('sent');
    expect(outbound.sent[0]?.text).toContain('XAC NHAN DON');
  });

  it('AUDIT HONG khong lam hong nghiep vu, nhung PHAI loc duoc: step audit.persist -> error', async () => {
    const repo = new InMemoryOrdersRepository();
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    const records: TelemetryRecord[] = [];
    const telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'fixture', environment: 'test', gitSha: 'unknown' },
      privacy: 'redacted',
      sinks: [{ record: (record) => records.push(record) }],
    });
    // Kho audit hong: dung hinh dang su co dang lo ngai — tin DA ra khoi he thong roi so moi hong.
    const brokenAudit = {
      append: () => Promise.reject(new Error('postgres down')),
    } as unknown as AuditLogService;
    const orders = new OrdersService(repo, router, undefined, telemetry, brokenAudit);
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    const sent = await orders.approve(view.id, 'phuong.nt');

    // Nghiep vu KHONG duoc hong.
    expect(sent.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
    // …nhung that bai phai loc duoc, khong chi la mot dong chu tu do.
    expect(records.filter((record) => record.type === 'step')).toContainEqual(
      expect.objectContaining({ name: 'audit.persist', status: 'error' }),
    );
  });

  it('khach khong co capability `operations` (khong co AuditLogService) van duyet duoc', async () => {
    const repo = new InMemoryOrdersRepository();
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    // Khong telemetry, khong audit — dung hinh dang DI cua mot tenant `sales-order` toi gian.
    const orders = new OrdersService(repo, router);
    const view = await repo.create(baseView({ intent: 'dat_don', priced: pricedOrder() }));

    const sent = await orders.approve(view.id);

    expect(sent.status).toBe('sent');
    expect(outbound.sent).toHaveLength(1);
  });
});
