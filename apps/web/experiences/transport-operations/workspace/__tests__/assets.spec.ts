import { describe, expect, it } from 'vitest';
import type {
  ComplianceAlert,
  EffectiveVehicleState,
  MaintenanceDue,
  MaintenanceWorkOrder,
  OperationalAlertFeed,
} from '../../transport-types';
import {
  toAssetDirectory,
  toComplianceAlertRows,
  toFleetStatusRows,
  toMaintenanceDueRows,
  toOperationalAlerts,
  toWorkOrderRows,
} from '../assets';
import { driver, vehicle } from './fixtures';

/**
 * `TX-06` o tang khung nhin.
 *
 * Bai quan trong nhat trong tep nay la bai ve NGUON THIEU: mot bang canh bao rong trong khi thieu
 * nguon doc y het mot doi xe khong co van de gi. Do la loi doc nguy hiem nhat cua man hinh nay.
 */

const directory = toAssetDirectory({
  vehicles: [vehicle({ id: 'veh-1', registrationPlate: '29H-123.45' })],
  drivers: [driver({ id: 'drv-1', fullName: 'Nguyễn Văn Bình' })],
});

const due = (over: Partial<MaintenanceDue> = {}): MaintenanceDue => ({
  planId: 'plan-1',
  vehicleId: 'veh-1',
  planName: 'Thay dầu máy',
  triggerKind: 'ODOMETER',
  state: 'OK',
  dueAtOdoKm: 125_000,
  dueOnDate: null,
  odoRemainingKm: 5000,
  daysRemaining: null,
  reachedBy: null,
  currentOdoKm: 120_000,
  lastServicedDate: '2026-06-01',
  lastServicedOdoKm: 115_000,
  ...over,
});

describe('bao duong den han', () => {
  it('xe hien bang BIEN SO, khong bang vehicleId', () => {
    const rows = toMaintenanceDueRows([due()], directory);
    expect(rows[0]?.vehicleLabel).toBe('29H-123.45');
    expect(rows[0]?.vehicleLabel).not.toContain('veh-1');
  });

  it('QUA HAN len dau bang, khong xep theo ten', () => {
    const rows = toMaintenanceDueRows(
      [
        due({ planId: 'a', state: 'OK' }),
        due({ planId: 'b', state: 'OVERDUE' }),
        due({ planId: 'c', state: 'DUE_SOON' }),
      ],
      directory,
    );
    expect(rows.map((row) => row.planId)).toEqual(['b', 'c', 'a']);
  });

  it('con bao xa doc duoc thanh cau, ca khi da vuot', () => {
    expect(toMaintenanceDueRows([due()], directory)[0]?.remainingLabel).toContain('còn');
    expect(
      toMaintenanceDueRows([due({ odoRemainingKm: -800, state: 'OVERDUE' })], directory)[0]
        ?.remainingLabel,
    ).toContain('vượt');
  });

  it('khong co moc nao thi khong bia mot con so', () => {
    const rows = toMaintenanceDueRows(
      [due({ odoRemainingKm: null, daysRemaining: null, dueAtOdoKm: null, dueOnDate: null })],
      directory,
    );
    expect(rows[0]?.remainingLabel).toBe('—');
    expect(rows[0]?.dueAtLabel).toBe('—');
  });
});

describe('lenh sua chua', () => {
  const order = (over: Partial<MaintenanceWorkOrder> = {}): MaintenanceWorkOrder => ({
    id: 'wo-1',
    vehicleId: 'veh-1',
    planId: null,
    status: 'OPEN',
    description: 'Thay lốp trước',
    openedDate: '2026-09-10',
    openedOdoKm: 120_500,
    openedAt: '2026-09-10T02:00:00.000Z',
    completedDate: null,
    completedOdoKm: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    costAmount: null,
    currencyCode: 'VND',
    note: null,
    updatedAt: '2026-09-10T02:00:00.000Z',
    ...over,
  });

  it('lenh chua xong thi KHONG hien mot ngay hoan thanh bia ra', () => {
    expect(toWorkOrderRows([order()], directory)[0]?.completedLabel).toBe('—');
  });

  it('chi phi chua nhap khac han chi phi bang 0', () => {
    expect(toWorkOrderRows([order()], directory)[0]?.costLabel).toBe('—');
    expect(toWorkOrderRows([order({ costAmount: 0 })], directory)[0]?.costLabel).not.toBe('—');
  });

  it('ly do huy duoc giu nguyen van', () => {
    const rows = toWorkOrderRows(
      [order({ status: 'CANCELLED', cancellationReason: 'Nhầm xe' })],
      directory,
    );
    expect(rows[0]?.cancellationReason).toBe('Nhầm xe');
    expect(rows[0]?.isOpen).toBe(false);
  });
});

describe('giay to sap het han', () => {
  const alert = (over: Partial<ComplianceAlert> = {}): ComplianceAlert => ({
    documentId: 'doc-1',
    subjectKind: 'VEHICLE',
    subjectId: 'veh-1',
    documentType: 'VEHICLE_INSPECTION',
    validTo: '2026-10-01',
    health: 'DUE_SOON',
    daysUntilExpiry: 26,
    thresholdDays: 30,
    ...over,
  });

  it('DA HET HAN len dau', () => {
    const rows = toComplianceAlertRows(
      [
        alert({ documentId: 'a', health: 'HEALTHY' }),
        alert({ documentId: 'b', health: 'EXPIRED', daysUntilExpiry: -3 }),
        alert({ documentId: 'c', health: 'DUE_SOON' }),
      ],
      directory,
    );
    expect(rows.map((row) => row.documentId)).toEqual(['b', 'c', 'a']);
  });

  it('nguong canh bao la cau hinh cua khach nen phai HIEN RA', () => {
    expect(toComplianceAlertRows([alert()], directory)[0]?.thresholdLabel).toContain('30');
  });

  it('giay to cua LAI XE lay ten lai xe, cua CONG TY thi khong can chu the', () => {
    expect(
      toComplianceAlertRows(
        [alert({ subjectKind: 'DRIVER', subjectId: 'drv-1', documentType: 'DRIVER_LICENCE' })],
        directory,
      )[0]?.subjectLabel,
    ).toBe('Nguyễn Văn Bình');
    expect(
      toComplianceAlertRows(
        [
          alert({
            subjectKind: 'COMPANY',
            subjectId: null,
            documentType: 'COMPANY_TRANSPORT_LICENSE',
          }),
        ],
        directory,
      )[0]?.subjectLabel,
    ).toBe('Công ty');
  });
});

describe('trang thai hieu luc cua doi xe', () => {
  const state = (over: Partial<EffectiveVehicleState> = {}): EffectiveVehicleState => ({
    vehicleId: 'veh-1',
    registrationPlate: '29H-123.45',
    effectiveStatus: 'IDLE',
    reason: 'NO_ACTIVE_WORK',
    recordedStatus: 'IDLE',
    openWorkOrderIds: [],
    inTransitTripIds: [],
    inconsistencies: [],
    ...over,
  });

  it('MAU THUAN doi mot sac thai canh bao, du trang thai hieu luc trong binh thuong', () => {
    const rows = toFleetStatusRows([
      state({
        effectiveStatus: 'ON_TRIP',
        recordedStatus: 'UNDER_MAINTENANCE',
        inconsistencies: ['MAINTENANCE_WHILE_IN_TRANSIT'],
      }),
    ]);
    expect(rows[0]?.hasInconsistency).toBe(true);
    expect(rows[0]?.tone).toBe('stop');
    expect(rows[0]?.inconsistencies[0]).toContain('lệnh sửa chữa');
  });

  it('khong mau thuan thi sac thai theo dung trang thai', () => {
    expect(toFleetStatusRows([state({ effectiveStatus: 'ON_TRIP' })])[0]?.tone).toBe('go');
  });
});

describe('bang canh bao gom chung', () => {
  const feed = (over: Partial<OperationalAlertFeed> = {}): OperationalAlertFeed => ({
    generatedFor: '2026-09-30',
    alerts: [],
    unavailableSources: [],
    ...over,
  });

  it('BANG RONG + THIEU NGUON phai noi ra, khong doc nhu "moi thu deu on"', () => {
    const model = toOperationalAlerts(
      feed({ unavailableSources: ['FUEL_CONSUMPTION', 'DRIVER_FUND'] }),
      directory,
    );
    expect(model.unavailableNote).not.toBeNull();
    expect(model.unavailableNote).toContain('Mức tiêu hao nhiên liệu');
    expect(model.unavailableNote).toContain('Số dư quỹ lái xe');
  });

  it('du nguon thi khong co cau canh bao thua', () => {
    expect(toOperationalAlerts(feed(), directory).unavailableNote).toBeNull();
  });

  it('dem rieng so canh bao CAN XU LY NGAY', () => {
    const model = toOperationalAlerts(
      feed({
        alerts: [
          {
            kind: 'MAINTENANCE_OVERDUE',
            severity: 'CRITICAL',
            subjectKind: 'VEHICLE',
            subjectId: 'veh-1',
            detail: { odoRemainingKm: -800 },
          },
          {
            kind: 'MAINTENANCE_DUE_SOON',
            severity: 'WARNING',
            subjectKind: 'VEHICLE',
            subjectId: 'veh-1',
            detail: {},
          },
        ],
      }),
      directory,
    );
    expect(model.criticalCount).toBe(1);
    expect(model.headline).toContain('2');
  });

  /**
   * KHOA KY THUAT KHONG DUOC RA MAN HINH. Ban truoc in `${key}: ${value}`, va anh chup E2E cho ra
   * mot dong that: `odoRemainingKm: -450`. Do dung la thu #195/#92 goi la "ten truong ky thuat lam
   * nhan nghiep vu". Khoa chua co trong tu dien bi BO HAN — cho phat hien mot nguon canh bao moi
   * chua ai dich la CI, khong phai man hinh cua khach.
   */
  it('so lieu kem theo doi thanh CAU TIENG VIET, khoa la thi bo han', () => {
    const model = toOperationalAlerts(
      feed({
        alerts: [
          {
            kind: 'FUEL_CONSUMPTION_ABNORMAL',
            severity: 'WARNING',
            subjectKind: 'VEHICLE',
            subjectId: 'veh-1',
            detail: { odoRemainingKm: -450, khoaLaKhongAiDich: 7, expected: null },
          },
        ],
      }),
      directory,
    );
    expect(model.rows[0]?.details).toEqual(['Đã vượt mốc 450 km']);
    expect(model.rows[0]?.details.join(' ')).not.toContain('khoaLaKhongAiDich');
  });

  it('chua doc duoc feed thi noi that, khong dung bang rong', () => {
    expect(toOperationalAlerts(null, directory).headline).toContain('Chưa đọc được');
  });
});
