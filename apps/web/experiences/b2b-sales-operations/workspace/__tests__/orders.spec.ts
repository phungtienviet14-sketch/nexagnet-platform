import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDER_FILTER,
  filterOrderBook,
  findInOrderBook,
  foldVietnamese,
  orderBookHeadline,
  resolveOrderSelection,
  toOrderBook,
} from '../orders';
import { dirtyOrder } from './fixtures';

const HANDOFF = {
  action: 'manual_erp_entry' as const,
  status: 'pending' as const,
  createdAt: '2026-09-01T03:00:00.000Z',
};

const ORDERS = [
  dirtyOrder({ id: 'tn', createdAt: '2026-09-01T01:00:00.000Z' }),
  dirtyOrder({
    id: 'hn',
    createdAt: '2026-09-01T04:00:00.000Z',
    groupName: 'Nhóm đại lý Hà Nội',
    dealerName: 'Đại lý Hà Nội',
    status: 'sent',
    salesHandoff: HANDOFF,
  }),
  dirtyOrder({ id: 'hoi-gia', createdAt: '2026-09-01T05:00:00.000Z', intent: 'hoi_gia' }),
];

describe('so don chi chua DON, khong chua moi tin nhan', () => {
  it('bo tin khong phai dat don, va xep tin moi nhat len truoc', () => {
    expect(toOrderBook(ORDERS).map((order) => order.reference)).toEqual(['hn', 'tn']);
  });
});

describe('tim don khong dau (Issue #110 §Đơn hàng)', () => {
  it('bo dau va chuan hoa chu d gach ngang', () => {
    expect(foldVietnamese('Đại lý Hà Nội')).toBe('dai ly ha noi');
    expect(foldVietnamese('  GHẾ Felix ')).toBe('ghe felix');
  });

  it('go khong dau van tim ra nhom co dau', () => {
    const book = toOrderBook(ORDERS);
    const found = filterOrderBook(book, { ...DEFAULT_ORDER_FILTER, search: 'ha noi' });
    expect(found.map((order) => order.reference)).toEqual(['hn']);
  });

  it('tim duoc theo ten san pham trong don', () => {
    const book = toOrderBook(ORDERS);
    expect(filterOrderBook(book, { ...DEFAULT_ORDER_FILTER, search: 'felix' })).toHaveLength(2);
  });

  it('chuoi tim rong thi khong loc gi', () => {
    const book = toOrderBook(ORDERS);
    expect(filterOrderBook(book, { ...DEFAULT_ORDER_FILTER, search: '   ' })).toHaveLength(2);
  });
});

describe('loc theo trang thai nghiep vu', () => {
  const book = toOrderBook(ORDERS);

  it('"tat ca" giu nguyen so don', () => {
    expect(filterOrderBook(book, { stage: 'tat_ca', search: '' })).toHaveLength(2);
  });

  it('loc dung tung hang viec', () => {
    expect(
      filterOrderBook(book, { stage: 'cho_nhap_don', search: '' }).map((o) => o.reference),
    ).toEqual(['hn']);
    expect(
      filterOrderBook(book, { stage: 'cho_duyet', search: '' }).map((o) => o.reference),
    ).toEqual(['tn']);
  });

  it('loc trang thai va tu khoa cong don voi nhau', () => {
    expect(filterOrderBook(book, { stage: 'cho_duyet', search: 'ha noi' })).toEqual([]);
  });
});

describe('don dang mo — tat dinh, va luon nam trong ket qua dang hien', () => {
  const book = toOrderBook(ORDERS);

  it('giu don duoc yeu cau khi no con trong ket qua loc', () => {
    expect(resolveOrderSelection(book, 'tn')).toBe('tn');
  });

  it('don da bi loc khoi danh sach thi KHONG duoc giu — man hinh khong duoc tu mau thuan', () => {
    const filtered = filterOrderBook(book, { stage: 'cho_nhap_don', search: '' });
    expect(resolveOrderSelection(filtered, 'tn')).toBe('hn');
  });

  it('khong con don nao thi tra null', () => {
    expect(resolveOrderSelection([], 'tn')).toBeNull();
  });

  it('tim theo ma tra null khi khong con — mot ket qua binh thuong', () => {
    expect(findInOrderBook(book, 'khong-co')).toBeNull();
    expect(findInOrderBook(book, null)).toBeNull();
    expect(findInOrderBook(book, 'hn')?.reference).toBe('hn');
  });
});

describe('cau tom tat dem tren ket qua DANG HIEN', () => {
  const book = toOrderBook(ORDERS);

  it('khong loc gi thi noi tong so, kem so don con phai nhap', () => {
    expect(orderBookHeadline(book, book.length)).toBe(
      '2 đơn đã ghi nhận · 1 đơn chờ nhập vào phần mềm bán hàng.',
    );
  });

  it('dang loc thi noi ro bao nhieu tren bao nhieu', () => {
    const filtered = filterOrderBook(book, { stage: 'cho_duyet', search: '' });
    expect(orderBookHeadline(filtered, book.length)).toBe('1 / 2 đơn khớp bộ lọc đang chọn.');
  });

  it('chua co don nao thi noi thang la chua co', () => {
    expect(orderBookHeadline([], 0)).toBe('Chưa có đơn hàng nào.');
  });
});
