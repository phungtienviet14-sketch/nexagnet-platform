import { describe, expect, it } from 'vitest';
import type {
  StakeholderVehicleView,
  VehicleOwnershipInterest,
  VehicleOwnershipRegister,
} from '../../transport-types';
import {
  classifyVehicleOwnership,
  formatBasisPoints,
  toMyVehicleRows,
  toOwnershipInterestRows,
  toRegisterSummary,
  toStakeholderRows,
} from '../asset-ownership';

/**
 * MO HINH KHUNG NHIN cua `TX-08` (#242 E5).
 *
 * Bo test nay do ba dieu ma man hinh de noi sai nhat:
 *
 *   1. dong so huu KHONG duoc hien ra la "nha xe ngoai";
 *   2. diem co ban phai doi sang phan tram DUNG, ke ca voi so le;
 *   3. so dang ky CHUA khai day du phai noi ro phan chua quy — con so dang ky DA khai day du thi
 *      khong duoc hien "chua quy: 0%", vi cau do goi y con cho de dien.
 */

const interest = (over: Partial<VehicleOwnershipInterest> = {}): VehicleOwnershipInterest => ({
  id: 'int-1',
  vehicleId: 'veh-1',
  stakeholderId: 'sth-1',
  stakeholderName: 'Nguyễn Văn A',
  stakeholderKind: 'PERSON',
  ownershipBasisPoints: 3_000,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null,
  recordedBy: 'operator',
  recordedNote: null,
  closedBy: null,
  closedNote: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const register = (over: Partial<VehicleOwnershipRegister> = {}): VehicleOwnershipRegister => ({
  vehicleId: 'veh-1',
  registrationPlate: '29H-123.45',
  operationalControl: 'INTERNAL_OPERATED',
  registerComplete: false,
  current: [],
  currentBasisPointsTotal: 0,
  unattributedBasisPoints: 10_000,
  history: [],
  ...over,
});

describe('diem co ban -> chu cho nguoi doc', () => {
  it.each([
    [10_000, '100%'],
    [3_000, '30%'],
    [2_550, '25,5%'],
    [3_333, '33,33%'],
    [1, '0,01%'],
  ])('%i diem co ban hien la %s', (bps, expected) => {
    expect(formatBasisPoints(bps)).toBe(expected);
  });
});

describe('phan loai xe theo hai truc (#242 E1)', () => {
  /**
   * BAI QUAN TRONG NHAT o phia man hinh.
   *
   * Mot xe co hai nguoi gop von ma cong ty van dieu hanh phai hien ra la "Đồng sở hữu", KHONG phai
   * "Nhà xe ngoài". Neu bai nay do, man hinh dang noi voi dieu do vien rang mot chiec xe cua chinh
   * ho la xe cua doi tac.
   */
  it('xe co nhieu ben huu quan ma cong ty dieu hanh la DONG SO HUU, khong phai nha xe ngoai', () => {
    const result = classifyVehicleOwnership('INTERNAL_OPERATED', [
      interest({ id: 'a', ownershipBasisPoints: 6_000 }),
      interest({ id: 'b', ownershipBasisPoints: 4_000 }),
    ]);
    expect(result).toBe('co-owned');
  });

  it('mot ben huu quan nam tron 100% la MOT CHU SO HUU', () => {
    expect(
      classifyVehicleOwnership('INTERNAL_OPERATED', [interest({ ownershipBasisPoints: 10_000 })]),
    ).toBe('sole-owner');
  });

  it('mot ben huu quan nam duoi 100% van la dong so huu — phan con lai chua quy duoc cho ai', () => {
    expect(
      classifyVehicleOwnership('INTERNAL_OPERATED', [interest({ ownershipBasisPoints: 6_000 })]),
    ).toBe('co-owned');
  });

  /**
   * KHONG suy "chua ghi gi" thanh "100% cua cong ty".
   *
   * Do se la bia ra mot su that phap ly ma khong ai khai. Nhan "Chưa ghi sở hữu" noi dung cai he
   * thong biet.
   */
  it('xe chua ghi ben huu quan nao la CHUA GHI SO HUU, khong phai 100% cua cong ty', () => {
    expect(classifyVehicleOwnership('INTERNAL_OPERATED', [])).toBe('unregistered');
  });

  it('quyen dieu hanh ngoai duoc quyet truoc, ke ca khi co ben huu quan', () => {
    expect(classifyVehicleOwnership('EXTERNAL_CARRIER', [interest()])).toBe('external-carrier');
    expect(classifyVehicleOwnership('EXTERNAL_CARRIER', [])).toBe('external-carrier');
  });
});

describe('tom tat so dang ky', () => {
  it('so dang ky con thieu noi ro phan chua quy duoc cho ai', () => {
    const summary = toRegisterSummary(
      register({
        current: [interest({ ownershipBasisPoints: 2_500 })],
        currentBasisPointsTotal: 2_500,
        unattributedBasisPoints: 7_500,
      }),
    );
    expect(summary.totalLabel).toBe('25%');
    expect(summary.unattributedLabel).toBe('75%');
    expect(summary.completenessNote).toContain('Dữ liệu thiếu là trạng thái hợp lệ');
  });

  /** `null` chu khong `'0%'`: mot dong "chưa quy: 0%" goi y van con cho de dien, va do la loi. */
  it('so dang ky da khai day du KHONG hien dong "chua quy"', () => {
    const summary = toRegisterSummary(
      register({
        registerComplete: true,
        current: [interest({ ownershipBasisPoints: 10_000 })],
        currentBasisPointsTotal: 10_000,
        unattributedBasisPoints: 0,
      }),
    );
    expect(summary.unattributedLabel).toBeNull();
    expect(summary.completenessNote).toContain('từ chối mọi lần ghi làm vượt');
  });
});

describe('nguon goc tung lan ghi (#242 E2)', () => {
  it('hang dang hieu luc noi ai ghi va ghi chu gi', () => {
    const [row] = toOwnershipInterestRows([interest({ recordedNote: 'hợp đồng góp vốn 2026' })]);
    expect(row?.provenanceLabel).toBe('Ghi bởi operator — hợp đồng góp vốn 2026');
    expect(row?.toLabel).toBe('Đang hiệu lực');
    expect(row?.isCurrent).toBe(true);
  });

  it('hang da dong noi ca lan mo lan lan dong', () => {
    const [row] = toOwnershipInterestRows([
      interest({
        effectiveTo: '2026-06-01T00:00:00.000Z',
        closedBy: 'giam-doc',
        closedNote: 'chuyển nhượng một phần',
      }),
    ]);
    expect(row?.provenanceLabel).toContain('Ghi bởi operator');
    expect(row?.provenanceLabel).toContain('Đóng bởi giam-doc — chuyển nhượng một phần');
    expect(row?.isCurrent).toBe(false);
  });
});

describe('ho so ben huu quan', () => {
  /** Man hinh noi CO tai khoan hay khong — khong bao gio noi la tai khoan nao. */
  it('cot tai khoan chi noi da mo hay chua', () => {
    const rows = toStakeholderRows([
      {
        id: 'sth-1',
        kind: 'PERSON',
        displayName: 'Nguyễn Văn A',
        status: 'ACTIVE',
        note: null,
        hasAccount: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    expect(rows[0]?.accountLabel).toBe('Đã mở tài khoản xem');
    expect(rows[0]?.note).toBe('—');
  });
});

describe('be mat ben huu quan — "Xe toi co co phan" (#242 E5)', () => {
  const view = (over: Partial<StakeholderVehicleView> = {}): StakeholderVehicleView => ({
    vehicleId: 'veh-1',
    registrationPlate: '29H-123.45',
    vehicleClass: 'Đầu kéo',
    status: 'ON_TRIP',
    operationalControl: 'INTERNAL_OPERATED',
    currentOdoKm: 120_450,
    myBasisPoints: 3_000,
    myEffectiveFrom: '2026-01-01T00:00:00.000Z',
    myHistory: [
      { ownershipBasisPoints: 3_000, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null },
    ],
    driverName: 'Nguyễn Văn Bình',
    ...over,
  });

  it('hien ty le cua chinh nguoi xem va trang thai xe bang tieng Viet', () => {
    const [row] = toMyVehicleRows([view()]);
    expect(row?.shareLabel).toBe('30%');
    expect(row?.statusLabel).toBe('Đang trên chuyến');
    expect(row?.controlLabel).toBe('Công ty điều hành');
    expect(row?.driverLabel).toBe('Nguyễn Văn Bình');
  });

  it('xe chua phan cong lai xe noi ro dieu do thay vi de trong', () => {
    const [row] = toMyVehicleRows([view({ driverName: null })]);
    expect(row?.driverLabel).toBe('Chưa phân công');
  });

  /**
   * #242 E5: *"Do not expose raw DB IDs as labels"*.
   *
   * `vehicleId` van co trong hang — no can cho `key` cua React va cho duong dan — nhung khong nhan
   * NAO duoc mang no. Do bang cach quet moi truong `*Label` va thay no khong chua dinh danh.
   */
  it('khong nhan nao mang dinh danh tho cua CSDL', () => {
    const [row] = toMyVehicleRows([view({ vehicleId: 'ckv9z1abc000xyz' })]);
    const labels = [
      row?.plate,
      row?.statusLabel,
      row?.controlLabel,
      row?.shareLabel,
      row?.sinceLabel,
      row?.driverLabel,
      row?.odometerLabel,
      ...(row?.historyLabels ?? []),
    ].join(' | ');
    expect(labels).not.toContain('ckv9z1abc000xyz');
  });

  it('lich su cua chinh minh doc duoc thanh cau, ke ca doan da dong', () => {
    const [row] = toMyVehicleRows([
      view({
        myHistory: [
          {
            ownershipBasisPoints: 4_500,
            effectiveFrom: '2026-06-01T00:00:00.000Z',
            effectiveTo: null,
          },
          {
            ownershipBasisPoints: 3_000,
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveTo: '2026-06-01T00:00:00.000Z',
          },
        ],
      }),
    ]);
    expect(row?.historyLabels).toHaveLength(2);
    expect(row?.historyLabels[0]).toContain('45%');
    expect(row?.historyLabels[0]).toContain('đang hiệu lực');
    expect(row?.historyLabels[1]).toContain('30%');
    expect(row?.historyLabels[1]).toContain('đến');
  });
});
