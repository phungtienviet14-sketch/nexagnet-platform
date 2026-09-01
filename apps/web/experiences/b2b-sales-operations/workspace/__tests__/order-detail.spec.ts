import { describe, expect, it } from 'vitest';
import {
  findOrderByReference,
  toBusinessTimeline,
  toCustomerOrderDetail,
} from '../order-detail';
import {
  collectKeys,
  collectStrings,
  dirtyOrder,
  ENGINEERING_ONLY_KEYS,
  ENGINEERING_ONLY_VALUES,
} from './fixtures';

describe('chi tiet don huong khach — ranh gioi (Issue #110 §Privacy/customer projection)', () => {
  const detail = toCustomerOrderDetail(dirtyOrder());

  it('KHONG mang theo mot ten truong ky thuat nao, o bat ky do sau nao', () => {
    const keys = new Set(collectKeys(detail));
    for (const forbidden of ENGINEERING_ONLY_KEYS) {
      expect(keys.has(forbidden), `truong "${forbidden}" khong duoc co mat`).toBe(false);
    }
  });

  it('KHONG mang theo mot gia tri ky thuat nao — ke ca lot vao giua mot cau', () => {
    const haystack = collectStrings(detail).join(' | ');
    for (const forbidden of ENGINEERING_ONLY_VALUES) {
      expect(haystack, `gia tri "${forbidden}" khong duoc lo ra`).not.toContain(forbidden);
    }
  });

  it('khong chua chuoi nao trong nhu mot dinh danh luot xu ly (32 ky tu hex)', () => {
    for (const value of collectStrings(detail)) {
      expect(value).not.toMatch(/\b[0-9a-f]{32}\b/);
    }
  });

  it('van mang DU thu nguoi ban hang can de lam viec', () => {
    expect(detail.groupName).toBe('Nhóm đại lý Thái Nguyên');
    expect(detail.dealerName).toBe('Đại lý Thái Nguyên');
    expect(detail.branch).toBe('TN');
    expect(detail.orderTypeLabel).toBe('Giao cho đại lý');
    expect(detail.policyLabel).toBe('Công nợ 30 ngày');
    expect(detail.totalQuantity).toBe(2);
    expect(detail.grandTotal).toBe(2_300_000);
    expect(detail.lines).toEqual([
      {
        productName: 'Ghế Felix',
        quantity: 2,
        unitPrice: 1_150_000,
        lineTotal: 2_300_000,
        recognised: true,
      },
    ]);
  });
});

describe('dong hang chua khop danh muc', () => {
  it('lay CHINH CHU khach viet lam ten, va danh dau la chua khop', () => {
    const order = dirtyOrder();
    const detail = toCustomerOrderDetail({
      ...order,
      priced: {
        ...order.priced!,
        lines: [
          {
            skuRaw: 'ghe la',
            sku: null,
            productName: null,
            quantity: 3,
            unitPrice: 0,
            lineTotal: 0,
            matched: false,
          },
        ],
      },
    });
    expect(detail.lines[0]).toEqual({
      productName: 'ghe la',
      quantity: 3,
      unitPrice: null,
      lineTotal: null,
      recognised: false,
    });
  });

  it('gia 0 doc ra la CHUA CO, khong phai 0 dong', () => {
    const order = dirtyOrder();
    const detail = toCustomerOrderDetail(order);
    expect(detail.shippingFee).toBeNull();
    expect(detail.codFee).toBeNull();
    expect(detail.vatAmount).toBeNull();
  });
});

describe('dien bien nghiep vu — chi tu truong ben vung (Issue #110 §Đơn hàng)', () => {
  it('don vua nhan chi co DUNG mot moc', () => {
    expect(toBusinessTimeline(dirtyOrder())).toEqual([
      {
        key: 'received',
        label: 'Nhận tin từ nhóm',
        at: '2026-09-01T02:10:00.000Z',
        detail: null,
      },
    ]);
  });

  it('moc "da gui" lay dau thoi gian THAT tu viec ban giao, khong xap xi bang gio nhan tin', () => {
    const timeline = toBusinessTimeline(
      dirtyOrder({
        status: 'sent',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'pending',
          createdAt: '2026-09-01T03:00:00.000Z',
        },
      }),
    );
    expect(timeline.map((entry) => entry.key)).toEqual(['received', 'sent']);
    expect(timeline[1]!.at).toBe('2026-09-01T03:00:00.000Z');
  });

  it('moc khong co dau thoi gian ben vung thi de TRONG, khong bia mot gio', () => {
    const timeline = toBusinessTimeline(
      dirtyOrder({
        status: 'sent',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'completed',
          createdAt: '2026-09-01T03:00:00.000Z',
        },
      }),
    );
    const entered = timeline.find((entry) => entry.key === 'entered');
    expect(entered).toBeDefined();
    expect(entered!.at).toBeNull();
  });

  it('don huy mang theo ly do huy, va ly do do la cua nghiep vu', () => {
    const timeline = toBusinessTimeline(
      dirtyOrder({ status: 'rejected', cancelReason: 'Khách đổi số lượng' }),
    );
    expect(timeline.at(-1)).toEqual({
      key: 'cancelled',
      label: 'Đã huỷ',
      at: null,
      detail: 'Khách đổi số lượng',
    });
  });

  it('lan nhac cua he thong hien ra dung mot dong, dung thoi diem da ghi', () => {
    const timeline = toBusinessTimeline(
      dirtyOrder({
        status: 'sent',
        salesHandoff: {
          action: 'manual_erp_entry',
          status: 'pending',
          createdAt: '2026-09-01T03:00:00.000Z',
          followUp: { stage: 'reminder', at: '2026-09-01T03:05:00.000Z' },
        },
      }),
    );
    expect(timeline.map((entry) => entry.key)).toEqual(['received', 'sent', 'followup']);
  });
});

describe('tim don theo ma tham chieu — nguon cua duong dan sau', () => {
  it('tim thay dung don', () => {
    const orders = [dirtyOrder(), dirtyOrder({ id: 'ord-fixture-2' })];
    expect(findOrderByReference(orders, 'ord-fixture-2')?.id).toBe('ord-fixture-2');
  });

  it('ma khong con ton tai tra null — mot ket qua binh thuong, khong phai loi', () => {
    expect(findOrderByReference([dirtyOrder()], 'ord-da-bi-don-di')).toBeNull();
    expect(findOrderByReference([dirtyOrder()], null)).toBeNull();
  });
});
