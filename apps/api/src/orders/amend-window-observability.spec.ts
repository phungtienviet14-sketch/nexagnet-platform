import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AgentTrace, OrderView, PricedOrder, SalesHandoff } from '@netviet/shared';
import { MockAdapter } from '../channels/mock.adapter.js';
import { OutboundChannelRouter } from '../channels/outbound-channel.router.js';
import type { TelemetryRecord } from '../observability/telemetry-record.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import { InMemoryOrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

/**
 * CUA SO SUA DON — cong duy nhat tu choi mot yeu cau HUY/SUA cua chinh khach hang.
 *
 * `order.amend_window` co trong bo tu vung tu 24/08/2026 nhung KHONG CO diem phat nao. Nghia la
 * khi khach nhan tin "huy don cu, lay 5 cai thoi" va he thong tu choi, trace cua luot do khong
 * ghi lai mot chu nao ve viec do — ke ca khi loi 422 da di toi tan tay khach duoi dang mot cau
 * tieng Viet. Nguoi doc trace se ket luan "he thong khong lam gi", y het su co 22/08/2026.
 *
 * Va bo ma cu la mot `boolean` doi lot: `AMEND_ALLOWED` / `AMEND_BLOCKED`. `canAmendOrder()` co
 * BON duong tu choi khac han nhau — "chua tung la don", "da huy roi", "da dong bo ERP", "Sale da
 * go vao ERP" — va bon cau tra loi do doi hoi bon hanh dong sua khac nhau. Gop chung thanh mot
 * ma la dung cai loi ma `evaluateAutoConfirm()` da duoc tach ra de khong lap lai.
 */
const TRACE: AgentTrace = {
  steps: [],
  primaryRole: 'policy_finance',
  senderType: 'dai_ly',
  llmCalls: 1,
  brainMode: 'stub',
  supervisor: { riskLevel: 'none', escalate: false, reasons: [] },
};

function build() {
  const repo = new InMemoryOrdersRepository();
  const router = new OutboundChannelRouter(new MockAdapter(), new MockAdapter(), new MockAdapter());
  const records: TelemetryRecord[] = [];
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'fixture', environment: 'test', gitSha: 'unknown' },
    privacy: 'redacted',
    sinks: [{ record: (record) => records.push(record) }],
  });
  return { orders: new OrdersService(repo, router, undefined, telemetry), repo, records };
}

/** Sale DA go don vao ERP — diem KHONG QUAY LAI cua GĐ1. */
const HANDED_TO_ERP: SalesHandoff = {
  action: 'manual_erp_entry',
  status: 'completed',
  createdAt: new Date().toISOString(),
};

function priced(): PricedOrder {
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

function view(patch: Partial<OrderView>): OrderView {
  return {
    id: `o-${Math.random()}`,
    status: 'pending_review',
    createdAt: new Date().toISOString(),
    chatId: '8827137437588696665',
    replyChannel: 'mock',
    rawText: 'huy don cu lay 5 cai thoi',
    intent: 'dat_don',
    parsed: null,
    priced: priced(),
    confidence: {},
    senderType: 'dai_ly',
    trace: TRACE,
    ...patch,
  };
}

const decisionsOf = (records: readonly TelemetryRecord[]): string[] =>
  records
    .filter((record) => record.type === 'decision')
    .map((record) => `${record.point}:${record.outcome}:${record.reason}`);

describe('order.amend_window de lai dau vet', () => {
  it('huy duoc -> ghi ALLOWED', async () => {
    const { orders, repo, records } = build();
    const saved = await repo.create(view({ status: 'pending_review' }));

    await orders.cancelOrder(saved.id, 'khach doi y');

    expect(decisionsOf(records)).toContain('order.amend_window:allowed:AMEND_ALLOWED');
  });

  it('Sale DA go vao ERP -> ghi dung ly do do, khong phai mot ma "bi chan" chung chung', async () => {
    const { orders, repo, records } = build();
    const saved = await repo.create(
      view({ status: 'sent', salesHandoff: HANDED_TO_ERP }),
    );

    await expect(orders.cancelOrder(saved.id, 'khach doi y')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(decisionsOf(records)).toContain('order.amend_window:denied:AMEND_HANDED_TO_ERP');
  });

  it('khong phai mot don -> ly do RIENG, de mot cau tu van khong bao gio bao "da nhap ERP"', async () => {
    const { orders, repo, records } = build();
    const saved = await repo.create(view({ intent: 'hoi_gia', priced: null }));

    await expect(orders.cancelOrder(saved.id, 'khach doi y')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(decisionsOf(records)).toContain('order.amend_window:denied:AMEND_NOT_AN_ORDER');
  });

  it('da dong bo ERP -> ma khac han "Sale da go tay"', async () => {
    const { orders, repo, records } = build();
    const saved = await repo.create(view({ status: 'synced' }));

    await expect(orders.cancelOrder(saved.id, 'khach doi y')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    expect(decisionsOf(records)).toContain('order.amend_window:denied:AMEND_SYNCED_TO_ERP');
  });

  it('BON duong tu choi -> BON ma phan biet duoc, khong gop thanh mot boolean', async () => {
    const seen = new Set<string>();
    for (const patch of [
      { intent: 'hoi_gia' as const, priced: null },
      { status: 'rejected' as const },
      { status: 'synced' as const },
      { status: 'sent' as const, salesHandoff: HANDED_TO_ERP },
    ]) {
      const { orders, repo, records } = build();
      const saved = await repo.create(view(patch as Partial<OrderView>));
      // `rejected` tra ve som, khong nem — van phai de lai dau vet.
      await orders.cancelOrder(saved.id, 'x').catch(() => undefined);
      for (const entry of decisionsOf(records)) {
        if (entry.startsWith('order.amend_window:')) seen.add(entry.split(':')[2]!);
      }
    }
    expect(seen.size, `bon duong tu choi phai ra bon ma, nhan duoc: ${[...seen]}`).toBe(4);
  });
});
