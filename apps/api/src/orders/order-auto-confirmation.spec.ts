import type { OrderView } from '@netviet/shared';
import { describe, expect, it } from 'vitest';
import { shouldAutoConfirmOrder } from './order-auto-confirmation.js';

function orderView(quantities: number[]): OrderView {
  return {
    id: 'order-policy-test',
    status: 'needs_edit',
    createdAt: '2026-08-12T00:00:00.000Z',
    chatId: 'group-1',
    dealerName: 'Dai ly da map',
    rawText: 'don test',
    intent: 'dat_don',
    parsed: { orderType: 'TH1', items: [], noVat: false },
    priced: {
      orderType: 'TH1',
      dealerName: 'Dai ly da map',
      branch: 'HN',
      lines: quantities.map((quantity, index) => ({
        skuRaw: `sku-${index}`,
        sku: `SKU-${index}`,
        productName: `San pham ${index}`,
        quantity,
        unitPrice: 1_000_000,
        lineTotal: quantity * 1_000_000,
        matched: true,
      })),
      itemsSubtotal: quantities.reduce((sum, quantity) => sum + quantity * 1_000_000, 0),
      shippingFee: 0,
      policy: 'thanh_toan_ngay',
      codCollect: false,
      codFee: 0,
      vat: false,
      vatAmount: 0,
      grandTotal: quantities.reduce((sum, quantity) => sum + quantity * 1_000_000, 0),
      warnings: [],
      confirmationText: 'xac nhan',
    },
    confidence: { intent: 0.99 },
    trace: {
      steps: [],
      primaryRole: 'sales',
      senderType: 'dai_ly',
      llmCalls: 1,
      brainMode: 'mock',
      supervisor: {
        riskLevel: 'escalate',
        escalate: true,
        reasons: ['Đơn lớn bất thường'],
      },
    },
  };
}

const POLICY = { enabled: true, maxAutoConfirmQuantity: 50 } as const;

describe('shouldAutoConfirmOrder', () => {
  it('tinh tong moi dong va cho phep DUNG 50, doc lap risk 30 SP/20 trieu', () => {
    expect(
      shouldAutoConfirmOrder(orderView([25, 25]), {
        policy: POLICY,
        killSwitchEnabled: true,
        manualReview: false,
      }),
    ).toBe(true);
  });

  it('51 san pham phai chuyen Sale truoc khi gui', () => {
    expect(
      shouldAutoConfirmOrder(orderView([25, 26]), {
        policy: POLICY,
        killSwitchEnabled: true,
        manualReview: false,
      }),
    ).toBe(false);
  });

  it.each([
    ['tenant tat policy', { policy: { ...POLICY, enabled: false }, killSwitchEnabled: true }],
    ['kill switch off', { policy: POLICY, killSwitchEnabled: false }],
    ['participant manual review', { policy: POLICY, killSwitchEnabled: true, manualReview: true }],
  ])('%s -> khong gui', (_name, context) => {
    expect(
      shouldAutoConfirmOrder(orderView([1]), {
        manualReview: false,
        ...context,
      }),
    ).toBe(false);
  });

  it('du lieu/rules co warning -> fail closed', () => {
    const view = orderView([1]);
    view.priced!.warnings = ['SKU la'];
    expect(
      shouldAutoConfirmOrder(view, {
        policy: POLICY,
        killSwitchEnabled: true,
        manualReview: false,
      }),
    ).toBe(false);
  });
});
