import { describe, expect, it, vi } from 'vitest';
import type { OrderView, PricedOrder } from '@netviet/shared';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import { RecentTracesSink } from '../observability/recent-traces.sink.js';
import type { TelemetryRecord } from '../observability/telemetry-record.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { InMemoryOrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';
import { SalesHandoffFollowupService } from './sales-handoff-followup.service.js';

/**
 * CONG EXACTLY-ONCE cua workflow `sales-handoff-followup`.
 *
 * Bon cau hoi ma bo test nay tra loi — va ca bon deu la cau hoi VAN HANH, khong phai cau hoi
 * ve kieu du lieu:
 *
 *   1. mot viec treo qua han thi co duoc danh dau khong;
 *   2. su kien TRUNG (outbox at-least-once) co tao ra hai lan danh dau khong;
 *   3. NGUOI xu ly xong trong luc workflow dang ngu thi workflow co nhac nham khong;
 *   4. don bien mat thi co no ra loi khong.
 */

function pricedOrder(): PricedOrder {
  return {
    lines: [
      {
        skuRaw: 'AAA',
        sku: 'AAA',
        productName: 'Widget',
        quantity: 1,
        unitPrice: 100_000,
        lineTotal: 100_000,
        matched: true,
      },
    ],
    grandTotal: 100_000,
    warnings: [],
    confirmationText: 'XAC NHAN DON',
    policy: 'thanh_toan_ngay',
  } as unknown as PricedOrder;
}

function sentOrder(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 'ord-1',
    status: 'sent',
    intent: 'dat_don',
    chatId: 'IT-handoff-followup',
    rawText: 'lay 1 aaa',
    createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
    priced: pricedOrder(),
    salesHandoff: {
      action: 'manual_erp_entry',
      status: 'pending',
      createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
    },
    ...overrides,
  } as unknown as OrderView;
}

function harness() {
  const repo = new InMemoryOrdersRepository();
  const records: TelemetryRecord[] = [];
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'fixture', environment: 'test', gitSha: 'unknown' },
    privacy: 'redacted',
    sinks: [new RecentTracesSink(), { record: (record) => records.push(record) }],
  });
  const followup = new SalesHandoffFollowupService(repo, telemetry);
  const reasons = (point: string): string[] =>
    records
      .filter((r) => r.type === 'decision' && r.point === point)
      .map((r) => (r as { reason: string }).reason);
  return { repo, followup, reasons };
}

describe('SalesHandoffFollowupService', () => {
  it('danh dau mot viec ban giao dang treo — dung MOT lan', async () => {
    const { repo, followup, reasons } = harness();
    await repo.create(sentOrder());

    const first = await followup.markFollowup('ord-1', 'reminder');

    expect(first).toMatchObject({ applied: true, stage: 'reminder', reason: 'FOLLOWUP_MARKED' });
    const stored = await repo.findById('ord-1');
    expect(stored?.salesHandoff?.followUp?.stage).toBe('reminder');
    expect(stored?.salesHandoff?.status).toBe('pending');
    expect(reasons('order.handoff_followup_mark')).toEqual(['FOLLOWUP_MARKED']);
  });

  /**
   * SU KIEN TRUNG. Outbox va engine deu la at-least-once, nen lan goi thu hai KHONG phai mot
   * gia thuyet — no la hanh vi da duoc cong bo cua ha tang.
   */
  it('su kien trung khong tao ra lan danh dau thu hai', async () => {
    const { repo, followup, reasons } = harness();
    await repo.create(sentOrder());

    await followup.markFollowup('ord-1', 'reminder');
    const before = (await repo.findById('ord-1'))?.salesHandoff?.followUp?.at;
    const second = await followup.markFollowup('ord-1', 'reminder');

    expect(second).toMatchObject({ applied: false, reason: 'FOLLOWUP_ALREADY_MARKED' });
    // Dau thoi gian KHONG doi: lan hai khong duoc ghi de len lan mot.
    expect((await repo.findById('ord-1'))?.salesHandoff?.followUp?.at).toBe(before);
    expect(reasons('order.handoff_followup_mark')).toEqual([
      'FOLLOWUP_MARKED',
      'FOLLOWUP_ALREADY_MARKED',
    ]);
  });

  /**
   * NGUOI THANG WORKFLOW. Day la bat bien "workflow khong so huu su that nghiep vu": ban chup
   * ma workflow mang theo luc xep hang noi "dang treo", nhung DB noi khac — va DB thang.
   */
  it('nguoi hoan tat trong luc workflow ngu -> khong nhac', async () => {
    const { repo, followup, reasons } = harness();
    await repo.create(sentOrder());

    // Con nguoi bam "da nhap ERP" trong luc workflow dang ngu.
    await repo.update('ord-1', {
      salesHandoff: {
        action: 'manual_erp_entry',
        status: 'completed',
        createdAt: new Date('2026-08-25T00:00:00.000Z').toISOString(),
      },
    });

    const result = await followup.markFollowup('ord-1', 'reminder');

    expect(result).toMatchObject({ applied: false, reason: 'FOLLOWUP_NOT_PENDING' });
    expect((await repo.findById('ord-1'))?.salesHandoff?.followUp).toBeUndefined();
    expect(reasons('order.handoff_followup_mark')).toEqual(['FOLLOWUP_NOT_PENDING']);
  });

  it('don bi huy giua chung -> coi la da xong, khong nhac', async () => {
    const { repo, followup } = harness();
    await repo.create(sentOrder({ status: 'rejected' }));

    expect(await followup.readState('ord-1')).toMatchObject({ state: 'resolved' });
    expect(await followup.markFollowup('ord-1', 'reminder')).toMatchObject({ applied: false });
  });

  it('don khong ton tai -> null (controller doi thanh 404)', async () => {
    const { followup } = harness();
    expect(await followup.readState('khong-co')).toBeNull();
    expect(await followup.markFollowup('khong-co', 'reminder')).toBeNull();
  });

  it('readState tra ve moc thoi gian de workflow tinh con phai cho bao lau', async () => {
    const { repo, followup } = harness();
    await repo.create(sentOrder());

    expect(await followup.readState('ord-1')).toEqual({
      state: 'pending',
      openedAt: '2026-08-25T00:00:00.000Z',
      followUpStage: null,
    });
  });
});

/**
 * DAU KIA cua duong day: luc don chuyen `sent` + `pending`, co dat lich theo doi khong.
 *
 * Day la cho chung minh "khong goi Hatchet tu `OrdersService`": thu duy nhat lop nay cham vao la
 * `WorkflowHandoffService`, va thu duy nhat lop do lam la ghi mot hang outbox.
 */
describe('OrdersService — dat lich theo doi luc chot don', () => {
  function orderReadyToSend(): OrderView {
    return sentOrder({ status: 'approved', salesHandoff: undefined });
  }

  it('xep hang qua CAU NOI outbox — khong goi engine truc tiep', async () => {
    const tenant = await import('@netviet/tenant');
    vi.spyOn(tenant, 'tenantSalesHandoffFollowup').mockReturnValue({
      enabled: true,
      remindAfterSeconds: 3,
    });

    const repo = new InMemoryOrdersRepository();
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    const handoffCalls: Array<Record<string, unknown>> = [];
    const workflows = {
      handoff: async (request: Record<string, unknown>) => {
        handoffCalls.push(request);
        return { outcome: 'queued', reason: 'QUEUED', operationKey: 'k' };
      },
    };

    const orders = new OrdersService(
      repo,
      router,
      undefined,
      undefined,
      undefined,
      undefined,
      workflows as never,
    );
    const view = await repo.create(orderReadyToSend());
    const sent = await orders.sendConfirmation(view.id);

    expect(sent.status).toBe('sent');
    expect(sent.salesHandoff?.status).toBe('pending');
    // MOT lan xep hang, mang THAM CHIEU chu khong phai noi dung don.
    expect(handoffCalls).toEqual([
      {
        workflowKey: 'sales-handoff-followup',
        operation: 'followup',
        entityType: 'sales-handoff',
        entityId: view.id,
      },
    ]);
    vi.restoreAllMocks();
  });

  it('khach khong bat theo doi -> khong xep hang, don van gui binh thuong', async () => {
    const tenant = await import('@netviet/tenant');
    vi.spyOn(tenant, 'tenantSalesHandoffFollowup').mockReturnValue(null);

    const repo = new InMemoryOrdersRepository();
    const outbound = new MockAdapter();
    const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), outbound);
    const handoff = vi.fn();

    const orders = new OrdersService(repo, router, undefined, undefined, undefined, undefined, {
      handoff,
    } as never);
    const view = await repo.create(orderReadyToSend());
    const sent = await orders.sendConfirmation(view.id);

    expect(sent.status).toBe('sent');
    expect(sent.salesHandoff?.status).toBe('pending');
    expect(handoff).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

/**
 * HOP DONG HAI PHIA cua mot cai ten.
 *
 * `packages/tenant` tu choi mot goi khach bat theo doi ma thieu rang buoc workflow, va no nhan
 * dien rang buoc do BANG KHOA. `apps/api` dang ky khuon cung bang khoa do. Hai ben lech nhau
 * thi mot goi khach hop le se tro thanh mot bao dam khong ai thuc hien — dung kieu hong khong
 * mot bo test nao ben trong tung goi bat duoc.
 */
describe('khoa khuon `sales-handoff-followup` khop giua goi khach va ban dang chay', () => {
  it('hang so cua tenant schema == khoa cua workflow registry', async () => {
    const { SALES_HANDOFF_FOLLOWUP_WORKFLOW } = await import('@netviet/tenant');
    const { SALES_HANDOFF_FOLLOWUP_KEY } = await import('../workflow/workflow-registry.js');

    expect(SALES_HANDOFF_FOLLOWUP_WORKFLOW).toBe(SALES_HANDOFF_FOLLOWUP_KEY);
  });
});
