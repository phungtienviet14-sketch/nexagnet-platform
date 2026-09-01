import { describe, expect, it } from 'vitest';
import type { AlertSources } from '../alerts';
import { toDashboard, toDashboardStats, urgentHeadline, URGENT_LIMIT } from '../dashboard';
import { ACCOUNTING, ADMIN, dirtyOrder, MANAGER, SALE } from './fixtures';

const HANDOFF = {
  action: 'manual_erp_entry' as const,
  status: 'pending' as const,
  createdAt: '2026-09-01T03:00:00.000Z',
};

const EMPTY: AlertSources = {
  orders: [],
  blockedCapabilities: [],
  readinessChecks: null,
  channel: null,
  navigation: SALE,
};

describe('con so tren Tong quan — dem tren du lieu THAT (Issue #110 §Dashboard)', () => {
  it('bon con so, va con nao cung DAN toi mot cho lam viec', () => {
    const stats = toDashboardStats([], SALE);
    expect(stats.map((stat) => stat.key)).toEqual([
      'awaiting-approval',
      'awaiting-entry',
      'sent-today',
      'active-groups',
    ]);
    for (const stat of stats) {
      expect(stat.link, `"${stat.key}" phai dan toi mot muc`).not.toBeNull();
    }
  });

  it('dem dung tung hang viec', () => {
    const stats = toDashboardStats(
      [
        dirtyOrder({ id: 'a' }),
        dirtyOrder({ id: 'b' }),
        dirtyOrder({ id: 'c', status: 'sent', salesHandoff: HANDOFF }),
        dirtyOrder({ id: 'd', groupName: 'Nhóm đại lý Hà Nội' }),
      ],
      SALE,
    );
    const value = (key: string) => stats.find((stat) => stat.key === key)!.value;
    expect(value('awaiting-approval')).toBe(3);
    expect(value('awaiting-entry')).toBe(1);
    expect(value('active-groups')).toBe(2);
  });
});

describe('hang viec "Can xu ly ngay"', () => {
  it('khong co viec thi noi ro la khong co viec CAN NGUOI, khong noi "moi thu deu on"', () => {
    const model = toDashboard(EMPTY);
    expect(model.urgent).toEqual([]);
    expect(model.hasWork).toBe(false);
    expect(urgentHeadline(model)).toBe('Không có việc nào đang chờ người xử lý.');
  });

  it('chi lay canh bao CO DUONG DI TOI CHO LAM', () => {
    const model = toDashboard({
      ...EMPTY,
      orders: [dirtyOrder({ id: 'ord-1' })],
      blockedCapabilities: [{ key: 'vat', label: 'VAT', reason: 'Chưa chốt cách xuất hoá đơn.' }],
    });
    expect(model.urgent.map((alert) => alert.id)).toEqual(['can_duyet:ord-1']);
    expect(model.totalAlerts).toBe(2);
  });

  it('cat bot khi qua dai, va NOI RA con bao nhieu viec nua o muc Cảnh báo', () => {
    const orders = Array.from({ length: URGENT_LIMIT + 3 }, (_unused, index) =>
      dirtyOrder({
        id: `ord-${index}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, index)).toISOString(),
      }),
    );
    const model = toDashboard({ ...EMPTY, orders });
    expect(model.urgent).toHaveLength(URGENT_LIMIT);
    expect(urgentHeadline(model)).toBe(
      `${URGENT_LIMIT} việc cần xử lý ngay · còn 3 cảnh báo khác ở mục Cảnh báo.`,
    );
  });

  it('dung CHINH bo canh bao cua muc Cảnh báo — mot nguon, hai cach hien', () => {
    const sources: AlertSources = { ...EMPTY, orders: [dirtyOrder({ id: 'ord-1' })] };
    const model = toDashboard(sources);
    expect(model.urgent[0]!.link).toEqual({
      section: 'approvals',
      selection: 'ord-1',
      label: 'Mở để duyệt',
    });
  });

  it('cung mot bo nguon cho ra cung mot bang — tat dinh', () => {
    const sources: AlertSources = { ...EMPTY, orders: [dirtyOrder({ id: 'ord-1' })] };
    expect(toDashboard(sources)).toEqual(toDashboard(sources));
  });
});

/**
 * TRANG TONG QUAN TUAN CUNG MOT LUAT — bai kiem tra chan hoi quy cho PR #111.
 *
 * "Cần xử lý ngay" dung LAI bo canh bao cua muc Cảnh báo, nen no thua huong luat duong dan theo
 * vai tro ma khong phai viet luat thu hai. Con day so tren dau trang la mot BE MAT DUONG DAN
 * KHAC, va no phai tuan cung luat do — mot con so bam duoc dua nguoi dung toi mot man hinh khong
 * phai viec cua ho thi cung sai y het mot dong canh bao lam viec do.
 */
describe('duong dan tren Tong quan phai trung thuc voi vai tro (PR #111)', () => {
  const orders = [
    dirtyOrder({ id: 'cho-duyet' }),
    dirtyOrder({
      id: 'cho-nhap',
      status: 'sent',
      salesHandoff: HANDOFF,
    }),
  ];

  it('KE TOAN khong nhan viec duyet vao hang "Cần xử lý ngay"', () => {
    const model = toDashboard({ ...EMPTY, orders, navigation: ACCOUNTING });
    expect(model.urgent.map((alert) => alert.category)).toEqual(['can_nhap_don']);
    expect(model.urgent.some((alert) => alert.link?.section === 'approvals')).toBe(false);
  });

  it('SALE / MANAGER / ADMIN van nhan ca hai viec', () => {
    for (const navigation of [SALE, MANAGER, ADMIN]) {
      const model = toDashboard({ ...EMPTY, orders, navigation });
      expect(model.urgent.map((alert) => alert.category)).toEqual(['can_duyet', 'can_nhap_don']);
    }
  });

  it('viec bi bo khoi hang van duoc DEM — cau tom tat khong noi doi la khong con gi', () => {
    const model = toDashboard({ ...EMPTY, orders, navigation: ACCOUNTING });
    expect(model.totalAlerts).toBe(2);
    expect(model.urgent).toHaveLength(1);
    expect(urgentHeadline(model)).toContain('còn 1 cảnh báo khác');
  });

  it('con so "Chờ duyệt & gửi" van HIEN voi ke toan, nhung khong bam duoc', () => {
    const stats = toDashboardStats(orders, ACCOUNTING);
    const approvals = stats.find((stat) => stat.key === 'awaiting-approval')!;
    expect(approvals.value).toBe(1);
    expect(approvals.link).toBeNull();
  });

  it('con so dan toi Đơn hàng van bam duoc voi ke toan', () => {
    const stats = toDashboardStats(orders, ACCOUNTING);
    expect(stats.find((stat) => stat.key === 'awaiting-entry')!.link).toEqual({
      section: 'orders',
      label: 'Mở đơn hàng',
    });
  });

  it('ke toan khong duoc dan sang Hội thoại — muc do khong thuoc luong viec cua ho', () => {
    const stats = toDashboardStats(orders, ACCOUNTING);
    expect(stats.find((stat) => stat.key === 'active-groups')!.link).toBeNull();
  });

  it('voi SALE thi ca bon con so deu bam duoc', () => {
    for (const stat of toDashboardStats(orders, SALE)) {
      expect(stat.link, `"${stat.key}" phai bam duoc voi Sale`).not.toBeNull();
    }
  });
});
