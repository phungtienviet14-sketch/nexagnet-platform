import { describe, expect, it } from 'vitest';
import {
  resolveLinkedVehicle,
  tollLinkPeriodInvalid,
  tollPeriodsOverlap,
  vehicleLinkConflict,
  type TollActiveLinkView,
  type TollLinkPeriod,
} from './toll-account-link.js';

const period = (from: string, to: string | null): TollLinkPeriod => ({
  effectiveFrom: from,
  effectiveTo: to,
});

const link = (over: Partial<TollActiveLinkView> = {}): TollActiveLinkView => ({
  vehicleId: 'veh-1',
  vehiclePlate: '15C-556.33',
  providerVehicleRef: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  ...over,
});

/**
 * ND 119/2024/ND-CP Dieu 11 khoan 3 — *"moi phuong tien tham gia giao thong chi duoc nhan chi tra
 * tu MOT tai khoan giao thong"*. Nen hai doan hieu luc chong nhau cho cung mot xe la mot VI PHAM
 * PHAP LY, khong phai mot lua chon thiet ke.
 */
describe('mot xe chi nhan chi tra tu MOT tai khoan tai mot thoi diem', () => {
  it('doan dang mo chan moi doan bat dau sau no', () => {
    expect(tollPeriodsOverlap(period('2026-01-01', null), period('2026-06-01', null))).toBe(true);
  });

  it('hai doan lien tiep KHONG chong nhau', () => {
    expect(
      tollPeriodsOverlap(period('2026-01-01', '2026-03-31'), period('2026-04-01', null)),
    ).toBe(false);
  });

  /**
   * HAI DAU DEU TINH — cung quy uoc voi ky bang ke cua nhien lieu.
   *
   * Neu ngay dong va ngay mo trung nhau ma coi la khong chong, thi trong DUNG mot ngay do chiec xe
   * nhan chi tra tu HAI tai khoan. Do la ngay ma mot luot qua tram khong biet thuoc ve ai.
   */
  it('dong va mo trong CUNG mot ngay VAN la chong nhau', () => {
    expect(
      tollPeriodsOverlap(period('2026-01-01', '2026-03-31'), period('2026-03-31', null)),
    ).toBe(true);
  });

  it('doan moi nam gon truoc doan cu thi khong chong', () => {
    expect(
      tollPeriodsOverlap(period('2026-06-01', null), period('2026-01-01', '2026-05-31')),
    ).toBe(false);
  });

  it('doan moi bao trum doan cu thi chong', () => {
    expect(
      tollPeriodsOverlap(period('2026-02-01', '2026-02-28'), period('2026-01-01', null)),
    ).toBe(true);
  });

  it('va cham duoc do tren MOI doan da co cua chiec xe do, khong chi doan cuoi', () => {
    const existing = [period('2026-01-01', '2026-03-31'), period('2026-07-01', null)];
    expect(vehicleLinkConflict(existing, period('2026-04-01', '2026-06-30'))).toBe(false);
    // Chen vao giua nhung cham doan DAU — mot phep do chi nhin doan cuoi se bo lot.
    expect(vehicleLinkConflict(existing, period('2026-03-01', '2026-06-30'))).toBe(true);
  });

  it('ngay dong truoc ngay mo la mot khoang khong co that', () => {
    expect(tollLinkPeriodInvalid(period('2026-05-01', '2026-04-30'))).toBe(true);
    expect(tollLinkPeriodInvalid(period('2026-05-01', '2026-05-01'))).toBe(false);
    expect(tollLinkPeriodInvalid(period('2026-05-01', null))).toBe(false);
  });
});

describe('doc mot dong ve dung chiec xe', () => {
  it('bien so khop mot ban ghi noi DANG HIEU LUC thi ra chiec xe do', () => {
    expect(
      resolveLinkedVehicle({
        links: [link()],
        onDate: '2026-06-01',
        plateRaw: '15c 556 33',
        providerVehicleRef: null,
      }),
    ).toEqual({ kind: 'RESOLVED', vehicleId: 'veh-1' });
  });

  it('ban ghi noi da dong TRUOC ngay giao dich thi khong dung duoc', () => {
    expect(
      resolveLinkedVehicle({
        links: [link({ effectiveTo: '2026-05-31' })],
        onDate: '2026-06-01',
        plateRaw: '15C-556.33',
        providerVehicleRef: null,
      }),
    ).toEqual({ kind: 'UNRESOLVED' });
  });

  it('ban ghi noi chua bat dau thi cung khong dung duoc', () => {
    expect(
      resolveLinkedVehicle({
        links: [link({ effectiveFrom: '2026-07-01' })],
        onDate: '2026-06-01',
        plateRaw: '15C-556.33',
        providerVehicleRef: null,
      }),
    ).toEqual({ kind: 'UNRESOLVED' });
  });

  /**
   * ===========================================================================
   * KHONG BAO GIO NHAT DAI LAY CAI DAU TIEN.
   *
   * #269 J2: *"ambiguous/unknown plate never silently maps to the first vehicle"*. Khi du lieu noi
   * hong (dieu ma D.11 kh.3 cam, nhung du lieu cu van co the co), cau tra loi dung la NEU RA ca
   * hai — khong phai chon mot roi di tiep.
   */
  it('bien so ung voi HAI xe thi neu ra ca hai, khong chon bua mot', () => {
    const result = resolveLinkedVehicle({
      links: [link(), link({ vehicleId: 'veh-2' })],
      onDate: '2026-06-01',
      plateRaw: '15C-556.33',
      providerVehicleRef: null,
    });
    expect(result).toEqual({ kind: 'AMBIGUOUS', vehicleIds: ['veh-1', 'veh-2'] });
  });

  /**
   * ND 119 Phu luc co "ma dinh danh the dau cuoi" — mot khoa BEN HON bien so, vi bien so doi khi
   * sang ten con the thi khong.
   */
  it('ma the dau cuoi duoc uu tien hon bien so khi ca hai cung co', () => {
    expect(
      resolveLinkedVehicle({
        links: [
          link({ vehicleId: 'veh-1', providerVehicleRef: 'TAG-A' }),
          link({ vehicleId: 'veh-2', vehiclePlate: '30E-111.22', providerVehicleRef: 'TAG-B' }),
        ],
        onDate: '2026-06-01',
        plateRaw: '30E-111.22',
        providerVehicleRef: 'TAG-A',
      }),
    ).toEqual({ kind: 'RESOLVED', vehicleId: 'veh-1' });
  });

  it('khong bien so va khong ma the thi khong co gi de doc', () => {
    expect(
      resolveLinkedVehicle({
        links: [link()],
        onDate: '2026-06-01',
        plateRaw: null,
        providerVehicleRef: null,
      }),
    ).toEqual({ kind: 'UNRESOLVED' });
  });

  it('khong ban ghi noi nao thi khong doc duoc', () => {
    expect(
      resolveLinkedVehicle({
        links: [],
        onDate: '2026-06-01',
        plateRaw: '15C-556.33',
        providerVehicleRef: null,
      }),
    ).toEqual({ kind: 'UNRESOLVED' });
  });
});
