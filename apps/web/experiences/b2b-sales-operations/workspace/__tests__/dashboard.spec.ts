import { describe, expect, it } from 'vitest';
import type { AlertSources } from '../alerts';
import { toDashboard, toDashboardStats, urgentHeadline, URGENT_LIMIT } from '../dashboard';
import { dirtyOrder } from './fixtures';

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
};

describe('con so tren Tong quan — dem tren du lieu THAT (Issue #110 §Dashboard)', () => {
  it('bon con so, va con nao cung DAN toi mot cho lam viec', () => {
    const stats = toDashboardStats([]);
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
    const stats = toDashboardStats([
      dirtyOrder({ id: 'a' }),
      dirtyOrder({ id: 'b' }),
      dirtyOrder({ id: 'c', status: 'sent', salesHandoff: HANDOFF }),
      dirtyOrder({ id: 'd', groupName: 'Nhóm đại lý Hà Nội' }),
    ]);
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
