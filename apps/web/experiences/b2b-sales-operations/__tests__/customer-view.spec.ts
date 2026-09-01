import type { OrderView } from '@netviet/shared';
import { describe, expect, it } from 'vitest';
import {
  excerptOf,
  summarizeWorkload,
  toConversations,
  toCustomerOrder,
  toCustomerOrders,
} from '../customer-view';

/**
 * Mot `OrderView` DAY DU — co ca nhung truong chi ky su moi duoc nhin.
 *
 * Fixture co y "ban": neu phep chieu de lot bat ky truong nao trong so do, bai kiem tra ranh gioi
 * ben duoi phai do. Mot fixture sach se lam bai kiem tra do luon xanh ma khong chung minh gi.
 */
function fullOrder(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 'ord_1',
    status: 'sent',
    createdAt: '2026-09-01T03:20:00.000Z',
    chatId: 'chat-1',
    groupName: 'Nhóm mẫu',
    dealerName: 'Đại lý mẫu',
    rawText: 'HN_1.9_Dai ly mau, 2 x San pham mau',
    intent: 'dat_don',
    parsed: null,
    priced: {
      orderType: 'TH1',
      dealerName: 'Đại lý mẫu',
      branch: 'HN',
      lines: [
        {
          skuRaw: 'san pham mau',
          sku: 'SPM',
          productName: 'Sản phẩm mẫu',
          quantity: 2,
          unitPrice: 1_000_000,
          lineTotal: 2_000_000,
          matched: true,
        },
      ],
      itemsSubtotal: 2_000_000,
      shippingFee: 0,
      policy: 'thanh_toan_ngay',
      codCollect: false,
      codFee: 0,
      vat: false,
      vatAmount: 0,
      grandTotal: 2_000_000,
      warnings: ['Tổng đơn khách ghi lệch so với hệ thống tính.'],
      confirmationText: 'Xác nhận đơn',
    },
    confidence: {},
    salesHandoff: {
      action: 'manual_erp_entry',
      status: 'pending',
      createdAt: '2026-09-01T03:21:00.000Z',
    },
    senderType: 'dai_ly',
    senderExternalId: 'uid-synthetic',
    traceId: '0af7651916cd43dd8448eb211c80319c',
    ruleConfigVersion: 3,
    ...overrides,
  } as OrderView;
}

describe('ranh gioi ngon ngu khach hang (Issue #107 §4, §9.5)', () => {
  const projected = toCustomerOrder(fullOrder());

  it('khong mang theo mot truong ky thuat nao', () => {
    for (const forbidden of [
      'traceId',
      'trace',
      'spanId',
      'workflowRunId',
      'ruleConfigVersion',
      'senderExternalId',
      'senderType',
      'confidence',
      'parsed',
      'chatId',
      'replyChannel',
    ]) {
      expect(Object.keys(projected)).not.toContain(forbidden);
    }
  });

  it('khong con dau vet cua chung o BAT KY do sau nao khi tuan tu hoa', () => {
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toMatch(/trace|span|workflow|prompt|ruleConfig|senderExternal/i);
    // Dinh danh luot xu ly la 32 ky tu hex — dang de lot qua nhat vi no khong co ten truong.
    expect(serialized).not.toMatch(/[0-9a-f]{32}/i);
  });

  it('van giu du thu nguoi ban hang can', () => {
    expect(projected).toMatchObject({
      reference: 'ord_1',
      groupName: 'Nhóm mẫu',
      dealerName: 'Đại lý mẫu',
      intent: 'dat_don',
      totalQuantity: 2,
      grandTotal: 2_000_000,
      needsPerson: true,
    });
    expect(projected.attentionNotes).toEqual(['Tổng đơn khách ghi lệch so với hệ thống tính.']);
  });
});

describe('trang thai doc ra duoc', () => {
  it('da gui nhung con cho nhap don la MOT trang thai rieng, khong phai "da xong"', () => {
    expect(toCustomerOrder(fullOrder()).stage).toBe('cho_nhap_don');
  });

  it('da gui va khong con viec ban giao thi la da gui', () => {
    expect(toCustomerOrder(fullOrder({ salesHandoff: undefined })).stage).toBe('da_gui');
  });

  it.each([
    ['pending_review', 'cho_duyet'],
    ['needs_edit', 'cho_duyet'],
    ['rejected', 'da_huy'],
    ['draft', 'dang_xu_ly'],
    ['approved', 'dang_xu_ly'],
  ] as const)('%s -> %s', (status, expected) => {
    expect(toCustomerOrder(fullOrder({ status, salesHandoff: undefined })).stage).toBe(expected);
  });
});

describe('trich tin', () => {
  it('gom khoang trang thua lai', () => {
    expect(excerptOf('  gui  ve\n  TN cho c  ')).toBe('gui ve TN cho c');
  });

  it('cat tin dai va bao hieu bang dau lung', () => {
    const excerpt = excerptOf('a'.repeat(400));
    expect(excerpt).toHaveLength(160);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('so lieu tren trang Tong quan', () => {
  const now = new Date('2026-09-01T10:00:00.000Z');

  it('dem theo NGAY DIA PHUONG, khong theo UTC', () => {
    const today = fullOrder({ createdAt: '2026-09-01T02:00:00.000Z' });
    const older = fullOrder({ id: 'ord_2', createdAt: '2026-08-30T02:00:00.000Z' });
    const summary = summarizeWorkload(toCustomerOrders([today, older]), now);

    expect(summary.total).toBe(2);
    expect(summary.awaitingOrderEntry).toBe(2);
    expect(summary.sentToday).toBe(1);
  });

  it('khong co tin nao thi moi con so bang khong — khong bia mot con so nao', () => {
    expect(summarizeWorkload([], now)).toEqual({
      total: 0,
      awaitingApproval: 0,
      awaitingOrderEntry: 0,
      sentToday: 0,
      groups: 0,
    });
  });
});

describe('gom hoi thoai theo nhom', () => {
  it('gom theo ten nhom, dem viec can nguoi, va xep nhom moi nhat len truoc', () => {
    const conversations = toConversations(
      toCustomerOrders([
        fullOrder({ id: 'a', groupName: 'Nhóm A', createdAt: '2026-09-01T01:00:00.000Z' }),
        fullOrder({ id: 'b', groupName: 'Nhóm A', createdAt: '2026-09-01T05:00:00.000Z' }),
        fullOrder({ id: 'c', groupName: 'Nhóm B', createdAt: '2026-09-01T09:00:00.000Z' }),
      ]),
    );

    expect(conversations.map((item) => item.groupName)).toEqual(['Nhóm B', 'Nhóm A']);
    expect(conversations[1]).toMatchObject({ messageCount: 2, needsPerson: 2 });
  });

  it('tin chua map duoc nhom duoc goi dung ten thay vi lo chatId', () => {
    const [conversation] = toConversations(toCustomerOrders([fullOrder({ groupName: undefined })]));
    expect(conversation!.groupName).toBeNull();
    expect(conversation!.key).not.toContain('chat-1');
  });
});
