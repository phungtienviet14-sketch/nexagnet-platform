import { describe, expect, it } from 'vitest';
import { UNASSIGNED_CONVERSATION_KEY } from '../../customer-view';
import {
  conversationTitle,
  resolveConversationKey,
  toConversationDetail,
  toConversationList,
} from '../conversations';
import { collectKeys, dirtyOrder, ENGINEERING_ONLY_KEYS } from './fixtures';

const ORDERS = [
  dirtyOrder({ id: 'tn-1', createdAt: '2026-09-01T01:00:00.000Z' }),
  dirtyOrder({
    id: 'tn-2',
    createdAt: '2026-09-01T04:00:00.000Z',
    status: 'sent',
    salesHandoff: {
      action: 'manual_erp_entry',
      status: 'pending',
      createdAt: '2026-09-01T04:05:00.000Z',
    },
  }),
  dirtyOrder({
    id: 'hn-1',
    createdAt: '2026-09-01T02:00:00.000Z',
    groupName: 'Nhóm đại lý Hà Nội',
    dealerName: 'Đại lý Hà Nội',
  }),
  dirtyOrder({ id: 'la-1', createdAt: '2026-09-01T00:30:00.000Z', groupName: undefined }),
];

describe('danh sach hoi thoai gom theo NHOM, khong theo dinh danh ky thuat', () => {
  it('moi nhom mot cuoc, tin chua map nhom vao mot muc rieng co ten tu te', () => {
    const list = toConversationList(ORDERS);
    expect(list.map((entry) => entry.key)).toEqual([
      'Nhóm đại lý Thái Nguyên',
      'Nhóm đại lý Hà Nội',
      UNASSIGNED_CONVERSATION_KEY,
    ]);
    expect(conversationTitle(list.at(-1)!)).toBe('Chưa gán nhóm');
  });
});

describe('chon cuoc hoi thoai — TAT DINH va luu lai duoc (Issue #110 §Hội thoại)', () => {
  const list = toConversationList(ORDERS);

  it('mo dung cuoc duoc yeu cau khi cuoc do con ton tai', () => {
    expect(resolveConversationKey(list, 'Nhóm đại lý Hà Nội')).toBe('Nhóm đại lý Hà Nội');
  });

  it('duong dan luu tro toi cuoc khong con thi roi ve cuoc dau, khong de trong', () => {
    expect(resolveConversationKey(list, 'Nhóm đã giải tán')).toBe('Nhóm đại lý Thái Nguyên');
  });

  it('chua chon gi thi mo cuoc dau — khong doi nguoi dung bam them mot lan', () => {
    expect(resolveConversationKey(list, null)).toBe('Nhóm đại lý Thái Nguyên');
  });

  it('khong co cuoc nao thi tra null, va do khong phai mot loi', () => {
    expect(resolveConversationKey([], 'bat ky')).toBeNull();
  });

  it('cung du lieu + cung yeu cau -> cung ket qua, moi lan goi', () => {
    expect(resolveConversationKey(list, null)).toBe(resolveConversationKey(list, null));
  });
});

describe('chi tiet mot cuoc hoi thoai', () => {
  const detail = toConversationDetail(ORDERS, 'Nhóm đại lý Thái Nguyên')!;

  it('gom dung cac tin cua nhom do, tin moi nhat len truoc', () => {
    expect(detail.messages.map((message) => message.order.reference)).toEqual(['tn-2', 'tn-1']);
  });

  it('noi ro viec CON LAI cua con nguoi tren tung tin', () => {
    expect(detail.messages.map((message) => message.humanAction)).toEqual([
      'Chờ nhập vào phần mềm bán hàng',
      'Chờ người duyệt & gửi',
    ]);
  });

  it('dem dung so tin dang cho mot nguoi', () => {
    expect(detail.needsPerson).toBe(2);
  });

  it('gop canh bao va BO TRUNG — mot viec lap lai van la mot viec', () => {
    const order = dirtyOrder();
    const warned = {
      ...order,
      priced: { ...order.priced!, warnings: ['Tổng đơn khách ghi lệch.'] },
    };
    const withDuplicates = toConversationDetail(
      [{ ...warned, id: 'w1' }, { ...warned, id: 'w2' }],
      'Nhóm đại lý Thái Nguyên',
    )!;
    expect(withDuplicates.attentionNotes).toEqual(['Tổng đơn khách ghi lệch.']);
  });

  it('khong mang mot truong ky thuat nao sang o chi tiet', () => {
    const keys = new Set(collectKeys(detail));
    for (const forbidden of ENGINEERING_ONLY_KEYS) {
      expect(keys.has(forbidden), `truong "${forbidden}" khong duoc co mat`).toBe(false);
    }
  });

  it('khoa khong ton tai tra null thay vi nem', () => {
    expect(toConversationDetail(ORDERS, 'khong-co')).toBeNull();
    expect(toConversationDetail(ORDERS, null)).toBeNull();
  });
});
