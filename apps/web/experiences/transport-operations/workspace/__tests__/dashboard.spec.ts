import type { CapabilityId } from '@netviet/tenant';
import { describe, expect, it } from 'vitest';
import { toDashboard, WORK_LIMIT, type DashboardInput } from '../dashboard';
import { driver, reconciliation, trip, vehicle } from './fixtures';

const CORE: readonly CapabilityId[] = ['transport-core'];
const WITH_SETTLEMENT: readonly CapabilityId[] = ['transport-core', 'transport-settlement'];

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  trips: [],
  vehicles: [],
  drivers: [],
  reconciliations: [],
  capabilities: CORE,
  role: 'ADMIN',
  ...over,
});

describe('con so tren bang dieu khien — dem tren du lieu THAT', () => {
  it('dem chuyen theo trang thai, khong bia', () => {
    const model = toDashboard(
      input({
        trips: [
          trip({ id: 'a', code: 'VT-A', status: 'IN_TRANSIT' }),
          trip({ id: 'b', code: 'VT-B', status: 'IN_TRANSIT' }),
          trip({ id: 'c', code: 'VT-C', status: 'PLANNED' }),
          trip({ id: 'd', code: 'VT-D', status: 'CANCELLED' }),
        ],
      }),
    );
    const value = (key: string) => model.stats.find((stat) => stat.key === key)?.value;
    expect(value('in-transit')).toBe('2');
    expect(value('planned')).toBe('1');
    expect(value('delivered')).toBe('0');
  });

  it('doi xe khong co du lieu thi la 0 that, khong phai o trong', () => {
    const model = toDashboard(input({ vehicles: [vehicle({ status: 'UNDER_MAINTENANCE' })] }));
    const value = (key: string) => model.stats.find((stat) => stat.key === key)?.value;
    expect(value('vehicles-maintenance')).toBe('1');
    expect(value('vehicles-idle')).toBe('0');
  });

  it('chi dem lai xe DANG LAM', () => {
    const model = toDashboard(
      input({
        drivers: [driver({ id: 'd1', status: 'ACTIVE' }), driver({ id: 'd2', status: 'INACTIVE' })],
      }),
    );
    expect(model.stats.find((stat) => stat.key === 'drivers-active')?.value).toBe('1');
  });

  it('the ky doi soat chi hien khi co du lieu ky — khong bay mot so 0 vo nghia', () => {
    expect(toDashboard(input()).stats.some((stat) => stat.key === 'reconciliations-open')).toBe(
      false,
    );
    const withPeriods = toDashboard(input({ reconciliations: [reconciliation()] }));
    expect(withPeriods.stats.find((stat) => stat.key === 'reconciliations-open')?.value).toBe('1');
  });

  it('moi con so bam duoc dan toi dung muc', () => {
    for (const stat of toDashboard(input()).stats) {
      expect(['trips', 'fleet', 'fuel']).toContain(stat.section);
    }
  });
});

describe('hang viec — con so tieu de KHONG duoc bao thieu', () => {
  const pendingTrips = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      trip({ id: `t${index}`, code: `VT-${index}`, status: 'PLANNED' }),
    );

  it('it viec thi tieu de dung bang so viec', () => {
    const model = toDashboard(input({ trips: pendingTrips(3) }));
    expect(model.pendingTotal).toBe(3);
    expect(model.work).toHaveLength(3);
    expect(model.headline).toBe('3 việc đang chờ người xử lý.');
  });

  it('nhieu viec hon suc bay thi tieu de noi TONG THAT, va noi ro dang bay mot phan', () => {
    // Day la loi da tung co: tieu de doc `work.length` (da bi cat) nen 9 viec ra "6 viec".
    const model = toDashboard(input({ trips: pendingTrips(9) }));
    expect(model.pendingTotal).toBe(9);
    expect(model.work).toHaveLength(WORK_LIMIT);
    expect(model.headline).toContain('9 việc');
    expect(model.headline).toContain('6 việc đầu');
    expect(model.headline).not.toBe('6 việc đang chờ người xử lý.');
  });

  it('dem CA hai loai viec: chua cho chay va da giao cho doi soat', () => {
    const model = toDashboard(
      input({
        trips: [
          trip({ id: 'a', code: 'VT-A', status: 'PLANNED' }),
          trip({ id: 'b', code: 'VT-B', status: 'DELIVERED' }),
          trip({ id: 'c', code: 'VT-C', status: 'IN_TRANSIT' }),
          trip({ id: 'd', code: 'VT-D', status: 'RECONCILED' }),
        ],
      }),
    );
    expect(model.pendingTotal).toBe(2);
    expect(model.work.map((item) => item.title)).toEqual([
      'Chuyến VT-A chưa cho chạy',
      'Chuyến VT-B đã giao, chờ chốt đối soát',
    ]);
  });

  it('khong co viec thi noi ro la khong co viec CAN NGUOI, khong noi "moi thu deu on"', () => {
    const model = toDashboard(input({ trips: [trip({ status: 'IN_TRANSIT' })] }));
    expect(model.hasWork).toBe(false);
    expect(model.pendingTotal).toBe(0);
    expect(model.headline).toBe('Không có chuyến nào đang chờ người xử lý.');
  });

  it('mot dong viec mang MA chuyen de mo dung dong, khong mang id', () => {
    const model = toDashboard(input({ trips: [trip({ id: 'uuid-xyz', code: 'VT-0912' })] }));
    expect(model.work[0]!.selection).toBe('VT-0912');
    expect(model.work[0]!.selection).not.toBe('uuid-xyz');
  });
});

describe('the KHONG dung duoc — noi that thay vi bia so', () => {
  it('luon noi ten ba con so chua lay ra duoc, ke ca khi chi bat transport-core', () => {
    const labels = toDashboard(input()).unavailable.map((card) => card.label);
    expect(labels).toContain('Số dư quỹ toàn đội');
    expect(labels).toContain('Phiếu dầu chờ xác thực');
    expect(labels).toContain('Chênh lệch chờ xử lý');
  });

  it('moi the deu co LY DO doc len duoc, khong de trong', () => {
    for (const card of toDashboard(input()).unavailable) {
      expect(card.reason.length).toBeGreaterThan(20);
    }
  });

  it('chi noi ve cong no va bien khi khach DA bat nghiep vu quyet toan', () => {
    const withoutSettlement = toDashboard(input()).unavailable.map((card) => card.label);
    expect(withoutSettlement).not.toContain('Công nợ phải thu / phải trả');
    expect(withoutSettlement).not.toContain('Biên trực tiếp');

    // Bat roi thi day tro thanh mot khoang cach THAT (`TX-05` khong co route HTTP nao), nen phai noi.
    const withSettlement = toDashboard(input({ capabilities: WITH_SETTLEMENT })).unavailable.map(
      (card) => card.label,
    );
    expect(withSettlement).toContain('Công nợ phải thu / phải trả');
    expect(withSettlement).toContain('Biên trực tiếp');
  });

  it('KHONG bia the bao duong / tuan thu / luong truoc khi TX-06 va TX-07 co san', () => {
    const model = toDashboard(input({ capabilities: WITH_SETTLEMENT }));
    const text = [
      ...model.stats.map((stat) => stat.label),
      ...model.unavailable.map((card) => card.label),
    ];
    for (const forbidden of ['Bảo dưỡng', 'Giấy tờ', 'Lương', 'Phiếu lương']) {
      expect(text.some((label) => label.includes(forbidden))).toBe(false);
    }
  });
});

describe('tat dinh', () => {
  it('cung dau vao cho ra cung ket qua', () => {
    const source = input({
      trips: [trip({ status: 'PLANNED' })],
      vehicles: [vehicle()],
      drivers: [driver()],
      capabilities: WITH_SETTLEMENT,
    });
    expect(toDashboard(source)).toEqual(toDashboard(source));
  });
});
