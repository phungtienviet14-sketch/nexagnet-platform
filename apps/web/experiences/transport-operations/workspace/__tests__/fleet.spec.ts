import { describe, expect, it } from 'vitest';
import { formatInstant } from '../../customer-view';
import type { VehicleDriverAssignment } from '../../transport-types';
import {
  NO_RESPONSIBLE_DRIVER,
  RECENT_DRIVER_HISTORY_LIMIT,
  toVehicleResponsibility,
  UNKNOWN_DRIVER_LABEL,
  type ResponsibleDriver,
  type VehicleResponsibility,
} from '../fleet';
import { driver } from './fixtures';

/**
 * #335 — "Xe nay hien ai dang phu trach?".
 *
 * `driverId` o day CO Y mang khuon CUID nhu Postgres sinh ra: bai kiem phai bat duoc viec man hinh
 * dan chinh chuoi do len lam nhan, va mot `driverId` kieu `drv-1` thi khong ai nhan ra la da lo.
 */
const BINH_ID = 'cmf3k2x9d0001qz8h7v6b5n4m';
const MAI_ID = 'cmf3k2x9d0002qz8h7v6b5n4m';

const BINH = driver({ id: BINH_ID, fullName: 'Nguyễn Văn Bình' });
const MAI = driver({ id: MAI_ID, fullName: 'Trần Thị Mai', authUserId: null });

const assignment = (over: Partial<VehicleDriverAssignment> = {}): VehicleDriverAssignment => ({
  id: 'cmf3vda000001qz8h7v6b5n4m',
  vehicleId: 'cmf3veh000001qz8h7v6b5n4m',
  driverId: BINH_ID,
  effectiveFrom: '2026-09-01T01:00:00.000Z',
  effectiveTo: null,
  createdAt: '2026-09-01T01:00:00.000Z',
  ...over,
});

/** Moi chu nguoi dieu hanh doc duoc tren khoi nay — noi duy nhat mot ID lot ra ngoai la ra day. */
const shownText = (model: VehicleResponsibility): string => {
  const people: readonly ResponsibleDriver[] =
    model.kind === 'none' ? [] : model.kind === 'assigned' ? [model.current] : model.current;
  return [
    ...people.flatMap((row) => [
      row.driverLabel,
      row.sinceLabel,
      row.statusLabel,
      row.accountLabel,
    ]),
    ...model.previous.flatMap((row) => [row.driverLabel, row.fromLabel, row.toLabel]),
  ].join(' | ');
};

describe('toVehicleResponsibility — xe nay hien ai dang phu trach', () => {
  it('xe CO ban phan cong hieu luc: tra loi bang TEN, kem moc bat dau va trang thai', () => {
    const model = toVehicleResponsibility([assignment()], [BINH, MAI]);

    expect(model.kind).toBe('assigned');
    if (model.kind !== 'assigned') return;
    expect(model.current).toMatchObject({
      driverLabel: 'Nguyễn Văn Bình',
      sinceLabel: formatInstant('2026-09-01T01:00:00.000Z'),
      statusLabel: 'Đang làm',
      statusTone: 'flat',
      accountLabel: 'Đã nối',
    });
    expect(shownText(model)).not.toContain(BINH_ID);
  });

  it('xe KHONG co ban phan cong nao: noi thang "Chưa có lái xe phụ trách"', () => {
    const model = toVehicleResponsibility([], [BINH, MAI]);

    expect(model).toEqual({ kind: 'none', previous: [], olderCount: 0 });
    expect(NO_RESPONSIBLE_DRIVER).toBe('Chưa có lái xe phụ trách');
  });

  it('moi ban deu DA DONG: khong ai dang phu trach, nhung nguoi cu van doc duoc ten', () => {
    const model = toVehicleResponsibility(
      [assignment({ effectiveTo: '2026-09-10T09:00:00.000Z' })],
      [BINH],
    );

    expect(model.kind).toBe('none');
    expect(model.previous).toEqual([
      {
        id: 'cmf3vda000001qz8h7v6b5n4m',
        driverLabel: 'Nguyễn Văn Bình',
        fromLabel: formatInstant('2026-09-01T01:00:00.000Z'),
        toLabel: formatInstant('2026-09-10T09:00:00.000Z'),
        isActive: false,
      },
    ]);
  });

  it('lich su NGAN: moi nhat truoc, khong lap lai nguoi dang phu trach, cat va DEM phan cu hon', () => {
    // May chu tra ve theo `effectiveFrom` TANG DAN — day la dung thu tu that.
    const closed = Array.from({ length: RECENT_DRIVER_HISTORY_LIMIT + 2 }, (_, index) =>
      assignment({
        id: `closed-${index + 1}`,
        driverId: index % 2 === 0 ? BINH_ID : MAI_ID,
        effectiveFrom: `2026-0${index + 1}-01T01:00:00.000Z`,
        effectiveTo: `2026-0${index + 2}-01T01:00:00.000Z`,
      }),
    );
    const active = assignment({ id: 'active', effectiveFrom: '2026-09-01T01:00:00.000Z' });

    const model = toVehicleResponsibility([...closed, active], [BINH, MAI]);

    expect(model.kind).toBe('assigned');
    expect(model.previous.map((row) => row.id)).toEqual([
      'closed-7',
      'closed-6',
      'closed-5',
      'closed-4',
      'closed-3',
    ]);
    expect(model.previous.every((row) => !row.isActive)).toBe(true);
    expect(model.olderCount).toBe(2);
  });

  it('thu tu dau vao khong doi cau tra loi', () => {
    const rows = [
      assignment({
        id: 'a',
        effectiveFrom: '2026-08-01T01:00:00.000Z',
        effectiveTo: '2026-08-20T01:00:00.000Z',
      }),
      assignment({ id: 'b', driverId: MAI_ID, effectiveFrom: '2026-08-20T01:00:00.000Z' }),
    ];

    expect(toVehicleResponsibility([...rows].reverse(), [BINH, MAI])).toEqual(
      toVehicleResponsibility(rows, [BINH, MAI]),
    );
  });

  it('khong tra duoc ho so lai xe: nhan thay the, KHONG in driverId, KHONG doan trang thai', () => {
    const model = toVehicleResponsibility(
      [
        assignment({
          id: 'old',
          effectiveFrom: '2026-08-01T01:00:00.000Z',
          effectiveTo: '2026-09-01T01:00:00.000Z',
        }),
        assignment(),
      ],
      [],
    );

    expect(model.kind).toBe('assigned');
    if (model.kind !== 'assigned') return;
    expect(model.current).toMatchObject({
      driverLabel: UNKNOWN_DRIVER_LABEL,
      statusLabel: null,
      accountLabel: null,
    });
    expect(model.previous[0]?.driverLabel).toBe(UNKNOWN_DRIVER_LABEL);
    expect(shownText(model)).not.toContain(BINH_ID);
  });

  it('lai xe DA NGHI van dung ten, va chua noi tai khoan: bay ra, khong giau', () => {
    const model = toVehicleResponsibility(
      [assignment({ driverId: MAI_ID })],
      [driver({ id: MAI_ID, fullName: 'Trần Thị Mai', status: 'INACTIVE', authUserId: null })],
    );

    expect(model.kind).toBe('assigned');
    if (model.kind !== 'assigned') return;
    expect(model.current).toMatchObject({
      driverLabel: 'Trần Thị Mai',
      statusLabel: 'Đã nghỉ',
      statusTone: 'stop',
      accountLabel: 'Chưa nối',
    });
  });

  it('hai ban cung hieu luc (du lieu sai): bay CA HAI, khong chon bua mot nguoi', () => {
    const model = toVehicleResponsibility(
      [
        assignment({ id: 'x', effectiveFrom: '2026-09-01T01:00:00.000Z' }),
        assignment({ id: 'y', driverId: MAI_ID, effectiveFrom: '2026-09-02T01:00:00.000Z' }),
      ],
      [BINH, MAI],
    );

    expect(model.kind).toBe('conflict');
    if (model.kind !== 'conflict') return;
    expect(model.current.map((row) => row.driverLabel)).toEqual([
      'Trần Thị Mai',
      'Nguyễn Văn Bình',
    ]);
  });
});
