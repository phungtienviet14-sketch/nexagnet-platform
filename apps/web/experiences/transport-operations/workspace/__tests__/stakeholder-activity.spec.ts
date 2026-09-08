import { describe, expect, it } from 'vitest';
import type { StakeholderActivityView, StakeholderVehicleActivity } from '../../transport-types';
import { toStakeholderActivity } from '../stakeholder-activity';

/**
 * BE MAT BEN HUU QUAN — PHAN HOAT DONG (`#278` N9), tang doc.
 *
 * Bo bai nay giu mot dieu ma man hinh rat de lam hong: HAI dau gach khac nhau phai doc ra khac
 * nhau. Mot o trong vi "khach chua bat bao duong" va mot o trong vi "chua co so lieu" trong y het
 * nhau tren man hinh — chi cau chu di kem moi phan biet duoc.
 */

const activity = (over: Partial<StakeholderVehicleActivity> = {}): StakeholderVehicleActivity => ({
  vehicleId: 'v1',
  registrationPlate: '29H-111.11',
  status: 'IDLE',
  runCount: 4,
  activeBusinessDays: 12,
  utilisation: 0.4,
  loadedKm: 1200,
  emptyKm: 300,
  totalKm: 1500,
  emptyRatio: 0.2,
  legsMissingDistance: 0,
  downtime: { workOrderDays: 3, openWorkOrderCount: 1 },
  ...over,
});

const view = (over: Partial<StakeholderActivityView> = {}): StakeholderActivityView => ({
  range: { from: '2026-08-10', to: '2026-09-08', businessDays: 30 },
  utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
  vehicles: [activity()],
  unavailableSources: [],
  ...over,
});

describe('cong thuc ty le su dung di cung con so', () => {
  it('cau cong bo lay tu may chu, khong viet cung o man hinh', () => {
    const model = toStakeholderActivity(view());
    expect(model.utilisationNote).toContain('ngayCoChangKhongHuy / ngayLichTrongKhoang');
    // Va no phai noi ro don vi dem — "theo NGAY", khong phai theo gio chay.
    expect(model.utilisationNote).toContain('NGÀY');
  });

  it('khoang ngay hien ra thanh mot cau doc duoc', () => {
    expect(toStakeholderActivity(view()).rangeLabel).not.toBe('');
  });
});

describe('`null` doc ra thanh dau gach, khong thanh `0`', () => {
  it('thieu km thi bon o km deu la dau gach, kem mot cau giai thich', () => {
    const model = toStakeholderActivity(
      view({
        vehicles: [
          activity({
            loadedKm: null,
            emptyKm: null,
            totalKm: null,
            emptyRatio: null,
            legsMissingDistance: 2,
          }),
        ],
      }),
    );

    const row = model.rows[0];
    expect(row?.loadedKm).toBe('—');
    expect(row?.emptyKm).toBe('—');
    expect(row?.totalKm).toBe('—');
    expect(row?.emptyRatio).toBe('—');
    expect(row?.missingNote).toContain('2 chặng chưa ghi số km');
  });

  it('du lieu day du thi KHONG hien cau giai thich thua', () => {
    expect(toStakeholderActivity(view()).rows[0]?.missingNote).toBeNull();
  });

  it('ty le su dung `null` ra dau gach chu khong phai `0,0%`', () => {
    const model = toStakeholderActivity(view({ vehicles: [activity({ utilisation: null })] }));
    expect(model.rows[0]?.utilisation).toBe('—');
  });
});

describe('hai dau gach khac nhau o cot ngay nghi', () => {
  it('khach CHUA bat bao duong: co cau giai thich cho ca bang', () => {
    const model = toStakeholderActivity(
      view({
        vehicles: [activity({ downtime: null })],
        unavailableSources: ['MAINTENANCE_CAPABILITY_OFF'],
      }),
    );

    expect(model.rows[0]?.downtimeDays).toBe('—');
    expect(model.maintenanceNote).toContain('chưa được bật');
    // Va no phai noi thang rang day KHONG phai "xe chay du thang".
    expect(model.maintenanceNote).toContain('KHÔNG');
  });

  it('khach DA bat nhung dong nay khong doc duoc: dau gach, va KHONG do loi cho tinh nang', () => {
    const model = toStakeholderActivity(
      view({ vehicles: [activity({ downtime: null })], unavailableSources: [] }),
    );

    expect(model.rows[0]?.downtimeDays).toBe('—');
    expect(model.maintenanceNote).toBeNull();
  });

  it('co so lieu thi hien dung con so may chu tra ve', () => {
    const model = toStakeholderActivity(
      view({ vehicles: [activity({ downtime: { workOrderDays: 7, openWorkOrderCount: 2 } })] }),
    );

    expect(model.rows[0]?.downtimeDays).toBe('7');
    expect(model.rows[0]?.openWorkOrders).toBe('2');
  });
});

describe('khong co dong tong', () => {
  it('mo hinh khong de ra mot con so gop nao giua cac xe', () => {
    const model = toStakeholderActivity(
      view({ vehicles: [activity({ vehicleId: 'v1' }), activity({ vehicleId: 'v2' })] }),
    );

    // Cong km cua hai chiec xe co ty le so huu khac nhau se ra mot con so khong thuoc ve ai.
    expect(model.rows).toHaveLength(2);
    expect(Object.keys(model)).toEqual([
      'rangeLabel',
      'utilisationNote',
      'maintenanceNote',
      'rows',
      'chart',
    ]);
  });
});

describe('bieu do bo qua xe thieu so lieu, khong ve chung thanh cot `0`', () => {
  it('xe con chang chua nhap km khong len bieu do, va so bi bo duoc dem', () => {
    const model = toStakeholderActivity(
      view({
        vehicles: [
          activity({ vehicleId: 'v1', registrationPlate: '29H-111.11' }),
          activity({
            vehicleId: 'v2',
            registrationPlate: '29H-222.22',
            loadedKm: null,
            emptyKm: null,
            totalKm: null,
            emptyRatio: null,
            legsMissingDistance: 1,
          }),
        ],
      }),
    );

    // Mot cot cao `0` doc y het mot chiec xe nam bai ca thang — do la mot cau tra loi SAI.
    expect(model.chart.plates).toEqual(['29H-111.11']);
    expect(model.chart.loadedKm).toEqual([1200]);
    expect(model.chart.emptyKm).toEqual([300]);
    expect(model.chart.omittedVehicles).toBe(1);
  });

  it('du lieu day du thi khong bo xe nao', () => {
    expect(toStakeholderActivity(view()).chart.omittedVehicles).toBe(0);
  });
});
