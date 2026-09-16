import { describe, expect, it } from 'vitest';
import { BusinessDateError } from '../business-date.js';
import { MoneyError } from '../money.js';
import {
  TOLL_SPEND_REPORT_MAX_DAYS,
  buildTollSpendReport,
  resolveTollSpendWindow,
  type TollSpendBucket,
  type TollSpendReport,
} from './toll-spend-report.js';

/**
 * BAO CAO CHI PHI ETC THEO XE / KY — `#314` G9, phan QUYET DINH.
 *
 * Moi bai o day do MOT trong nam loi hua cua bao cao. Chung duoc giu o ham thuan vi mot bao cao
 * tien sai khong bao gio lo ra nhu mot loi: no lo ra nhu mot con so, va con so do se duoc tin.
 */

const bucket = (over: Partial<TollSpendBucket> = {}): TollSpendBucket => ({
  vehicleId: 'veh-1',
  businessDate: '2026-08-31',
  kind: 'TOLL_PASS',
  matchState: 'MATCHED',
  reviewState: 'PENDING',
  currencyCode: 'VND',
  duplicateDeclared: false,
  rowCount: 1,
  amount: -52_000,
  ...over,
});

const VEHICLES = [
  { id: 'veh-1', registrationPlate: '15C-556.33' },
  { id: 'veh-2', registrationPlate: '30E-111.22' },
];

const build = (buckets: readonly TollSpendBucket[]): TollSpendReport =>
  buildTollSpendReport({
    window: { from: '2026-08-01', to: '2026-09-30', provider: null },
    generatedOn: '2026-09-16',
    buckets,
    vehicles: VEHICLES,
  });

describe('chi dong DA KHOP XE moi vao bang theo xe', () => {
  it('MATCHED co xe -> mot hang theo xe, tach "da co nguoi xac nhan" khoi "chua xong"', () => {
    const report = build([
      bucket({ reviewState: 'PENDING', amount: -52_000 }),
      bucket({ reviewState: 'CONFIRMED', rowCount: 2, amount: -60_000 }),
      bucket({ reviewState: 'REOPENED', amount: -10_000 }),
    ]);

    expect(report.vehicles).toEqual([
      {
        vehicleId: 'veh-1',
        registrationPlate: '15C-556.33',
        month: '2026-08',
        kind: 'TOLL_PASS',
        currencyCode: 'VND',
        confirmed: { rowCount: 2, amount: -60_000 },
        // `REOPENED` la CHUA XONG: mot nguoi da mo lai dong do de xem tiep.
        open: { rowCount: 2, amount: -62_000 },
      },
    ]);
    expect(report.unattributed).toEqual([]);
    expect(report.duplicates).toEqual([]);
  });

  it('ba trang thai "chua ro xe" KHONG bao gio vao bang theo xe', () => {
    const report = build([
      bucket({ vehicleId: null, matchState: 'VEHICLE_UNRESOLVED', amount: -1_000 }),
      bucket({ vehicleId: null, matchState: 'AMBIGUOUS', amount: -2_000 }),
      bucket({ vehicleId: null, matchState: 'ACCOUNT_UNRESOLVED', amount: -3_000 }),
    ]);

    expect(report.vehicles).toEqual([]);
    expect(report.unattributed.map((row) => [row.reason, row.open.amount])).toEqual([
      ['ACCOUNT_UNRESOLVED', -3_000],
      ['VEHICLE_UNRESOLVED', -1_000],
      ['AMBIGUOUS', -2_000],
    ]);
  });

  /**
   * TRANG THAI quyet dinh, khong phai su CO MAT cua `vehicleId`.
   *
   * Kho khong bao gio ghi mot dong `AMBIGUOUS` co xe — nhung neu mot ngay no ghi (mot lan sua kho,
   * mot lenh `psql`), bao cao van KHONG duoc chia tien cho chiec xe do.
   */
  it('mot dong AMBIGUOUS lo mang `vehicleId` van KHONG duoc gan cho xe do', () => {
    const report = build([bucket({ vehicleId: 'veh-1', matchState: 'AMBIGUOUS' })]);
    expect(report.vehicles).toEqual([]);
    expect(report.unattributed[0]?.reason).toBe('AMBIGUOUS');
  });

  it('MATCHED khong co xe (nap tien, phi tai khoan) -> muc CAP TAI KHOAN, khong phai mot loi', () => {
    const report = build([
      bucket({ vehicleId: null, kind: 'TOP_UP', reviewState: 'CONFIRMED', amount: 5_000_000 }),
    ]);
    expect(report.vehicles).toEqual([]);
    expect(report.unattributed).toEqual([
      {
        reason: 'ACCOUNT_LEVEL',
        month: '2026-08',
        kind: 'TOP_UP',
        currencyCode: 'VND',
        confirmed: { rowCount: 1, amount: 5_000_000 },
        open: { rowCount: 0, amount: 0 },
      },
    ]);
  });
});

describe('dong TRUNG khong vao mot tong chi phi nao', () => {
  /**
   * `toll-classification.ts` GIU `vehicleId` tren dong nghi trung, de nguoi doi soat nhin thay ca
   * hai mat cua cap trung. Neu bao cao doc `vehicleId` thay vi trang thai, mot giao dich ve qua
   * hai tep se lam chi phi cua chiec xe do gap doi.
   */
  it('nghi trung do MAY danh dau -> tach rieng, du dong do CO xe', () => {
    const report = build([
      bucket({ reviewState: 'CONFIRMED', amount: -52_000 }),
      bucket({ matchState: 'DUPLICATE_CANDIDATE', vehicleId: 'veh-1', amount: -52_000 }),
    ]);

    expect(report.vehicles).toHaveLength(1);
    expect(report.vehicles[0]?.confirmed).toEqual({ rowCount: 1, amount: -52_000 });
    expect(report.vehicles[0]?.open).toEqual({ rowCount: 0, amount: 0 });
    expect(report.duplicates).toEqual([
      {
        state: 'SUSPECTED',
        month: '2026-08',
        kind: 'TOLL_PASS',
        currencyCode: 'VND',
        total: { rowCount: 1, amount: -52_000 },
      },
    ]);
  });

  it('NGUOI da noi trung -> `DECLARED`, loai khoi moi tong', () => {
    const report = build([
      bucket({
        matchState: 'DUPLICATE_CANDIDATE',
        reviewState: 'CONFIRMED',
        duplicateDeclared: true,
      }),
    ]);
    expect(report.vehicles).toEqual([]);
    expect(report.unattributed).toEqual([]);
    expect(report.duplicates[0]?.state).toBe('DECLARED');
  });

  /**
   * `CONFIRM` tren mot dong nghi trung khong noi no LA hay KHONG LA trung — nen no van la nghi
   * trung. Chi `FLAG_DUPLICATE` (co dong doi ung) hoac `CLEAR_DUPLICATE` moi tra loi cau do.
   */
  it('`CONFIRMED` tren mot dong nghi trung KHONG bien no thanh chi phi', () => {
    const report = build([bucket({ matchState: 'DUPLICATE_CANDIDATE', reviewState: 'CONFIRMED' })]);
    expect(report.vehicles).toEqual([]);
    expect(report.duplicates[0]?.state).toBe('SUSPECTED');
  });
});

describe('gom theo THANG — va khong bao gio gop khac loai hay khac tien', () => {
  it('hai ngay cung thang cong lai; hai thang tach hai hang', () => {
    const report = build([
      bucket({ businessDate: '2026-08-01', amount: -10_000 }),
      bucket({ businessDate: '2026-08-31', amount: -20_000 }),
      bucket({ businessDate: '2026-09-01', amount: -40_000 }),
    ]);
    expect(report.vehicles.map((row) => [row.month, row.open.amount])).toEqual([
      ['2026-08', -30_000],
      ['2026-09', -40_000],
    ]);
  });

  it('luot qua tram va dieu chinh cua CUNG mot xe la hai hang', () => {
    const report = build([
      bucket({ kind: 'TOLL_PASS' }),
      bucket({ kind: 'ADJUSTMENT', amount: 7_000 }),
    ]);
    expect(report.vehicles.map((row) => [row.kind, row.open.amount])).toEqual([
      ['TOLL_PASS', -52_000],
      ['ADJUSTMENT', 7_000],
    ]);
  });

  it('hai loai tien KHONG bao gio cong vao nhau, ca o hang lan o tong', () => {
    const report = build([
      bucket({ currencyCode: 'VND' }),
      bucket({ currencyCode: 'USD', amount: -3 }),
    ]);
    expect(report.vehicles.map((row) => [row.currencyCode, row.open.amount])).toEqual([
      ['USD', -3],
      ['VND', -52_000],
    ]);
    expect(report.totals.map((row) => [row.currencyCode, row.attributed.open.amount])).toEqual([
      ['USD', -3],
      ['VND', -52_000],
    ]);
  });
});

describe('dau so tien giu nguyen nhu bang ke — khong netting giua cac loai', () => {
  it('nap tien duong van duong, luot qua tram am van am, va tong TACH theo loai', () => {
    const report = build([
      bucket({ amount: -52_000 }),
      bucket({ vehicleId: null, kind: 'TOP_UP', amount: 5_000_000 }),
    ]);

    expect(report.totals).toEqual([
      {
        currencyCode: 'VND',
        kind: 'TOLL_PASS',
        attributed: {
          confirmed: { rowCount: 0, amount: 0 },
          open: { rowCount: 1, amount: -52_000 },
        },
        unattributed: {
          confirmed: { rowCount: 0, amount: 0 },
          open: { rowCount: 0, amount: 0 },
        },
        excludedDuplicates: { rowCount: 0, amount: 0 },
      },
      {
        currencyCode: 'VND',
        kind: 'TOP_UP',
        attributed: {
          confirmed: { rowCount: 0, amount: 0 },
          open: { rowCount: 0, amount: 0 },
        },
        unattributed: {
          confirmed: { rowCount: 0, amount: 0 },
          open: { rowCount: 1, amount: 5_000_000 },
        },
        excludedDuplicates: { rowCount: 0, amount: 0 },
      },
    ]);
  });

  it('dong trung duoc dem vao cot "da loai", khong vao hai cot kia', () => {
    const report = build([
      bucket({ matchState: 'DUPLICATE_CANDIDATE', amount: -52_000 }),
      bucket({ matchState: 'DUPLICATE_CANDIDATE', duplicateDeclared: true, amount: -30_000 }),
    ]);
    expect(report.totals[0]?.excludedDuplicates).toEqual({ rowCount: 2, amount: -82_000 });
    expect(report.totals[0]?.attributed.open).toEqual({ rowCount: 0, amount: 0 });
  });
});

describe('xe va thu tu', () => {
  /** Man hinh hien ma xe cho dong nay; no KHONG duoc doan mot bien so tu mot xe khac. */
  it('xe khong con trong doi xe -> bien so `null`, khong doan', () => {
    const report = build([bucket({ vehicleId: 'veh-da-ban' })]);
    expect(report.vehicles[0]?.vehicleId).toBe('veh-da-ban');
    expect(report.vehicles[0]?.registrationPlate).toBeNull();
  });

  it('dau ra TAT DINH bat ke thu tu cac nhom doc tu kho', () => {
    const buckets = [
      bucket({ vehicleId: 'veh-2', businessDate: '2026-09-02' }),
      bucket({ vehicleId: null, matchState: 'AMBIGUOUS' }),
      bucket({ vehicleId: 'veh-1', businessDate: '2026-09-01', kind: 'ADJUSTMENT' }),
      bucket({ vehicleId: 'veh-1', businessDate: '2026-08-02' }),
      bucket({ matchState: 'DUPLICATE_CANDIDATE' }),
    ];
    const forward = build(buckets);
    const backward = build([...buckets].reverse());
    expect(backward).toEqual(forward);
    expect(forward.vehicles.map((row) => [row.registrationPlate, row.month, row.kind])).toEqual([
      ['15C-556.33', '2026-08', 'TOLL_PASS'],
      ['15C-556.33', '2026-09', 'ADJUSTMENT'],
      ['30E-111.22', '2026-09', 'TOLL_PASS'],
    ]);
  });
});

describe('tien vuot khoang bieu dien duoc', () => {
  it('cong vuot `2^53-1` thi NEM, khong tra ve mot so sai im lang', () => {
    expect(() =>
      build([
        bucket({ amount: -Number.MAX_SAFE_INTEGER }),
        bucket({ reviewState: 'REOPENED', amount: -Number.MAX_SAFE_INTEGER }),
      ]),
    ).toThrow(MoneyError);
  });
});

describe('bao cao KHONG noi ve tien da tra, va khong co lai xe nao trong do', () => {
  const keysOf = (value: unknown, into = new Set<string>()): Set<string> => {
    if (Array.isArray(value)) {
      for (const item of value) keysOf(item, into);
    } else if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        into.add(key);
        keysOf(nested, into);
      }
    }
    return into;
  };

  it('khong mot truong nao mang nghia da tra / da hach toan / quy lai xe', () => {
    const report = build([
      bucket({ reviewState: 'CONFIRMED' }),
      bucket({ vehicleId: null, matchState: 'VEHICLE_UNRESOLVED' }),
      bucket({ matchState: 'DUPLICATE_CANDIDATE' }),
    ]);
    for (const key of keysOf(report)) {
      expect(key).not.toMatch(/paid|settled|accounted|payable|driver|payroll|fund/i);
    }
  });
});

describe('ky bao cao', () => {
  it('khong truyen gi -> tu ngay 1 cua THANG NGHIEP VU hien tai toi hom nay', () => {
    expect(resolveTollSpendWindow({ from: null, to: null, provider: null }, '2026-09-16')).toEqual({
      from: '2026-09-01',
      to: '2026-09-16',
      provider: null,
    });
  });

  it('truyen ca hai -> giu nguyen, kem nha cung cap', () => {
    expect(
      resolveTollSpendWindow(
        { from: '2026-08-01', to: '2026-08-31', provider: 'EPASS' },
        '2026-09-16',
      ),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31', provider: 'EPASS' });
  });

  it('ngay bat dau SAU ngay ket thuc -> tu choi', () => {
    expect(() =>
      resolveTollSpendWindow(
        { from: '2026-09-02', to: '2026-09-01', provider: null },
        '2026-09-16',
      ),
    ).toThrow(BusinessDateError);
  });

  it('ngay khong co that -> tu choi', () => {
    expect(() =>
      resolveTollSpendWindow(
        { from: '2026-02-30', to: '2026-03-01', provider: null },
        '2026-09-16',
      ),
    ).toThrow(BusinessDateError);
  });

  it(`dai hon ${String(TOLL_SPEND_REPORT_MAX_DAYS)} ngay -> tu choi; dung ${String(TOLL_SPEND_REPORT_MAX_DAYS)} ngay thi qua`, () => {
    expect(() =>
      resolveTollSpendWindow(
        { from: '2025-01-01', to: '2026-01-02', provider: null },
        '2026-09-16',
      ),
    ).toThrow(BusinessDateError);
    expect(
      resolveTollSpendWindow(
        { from: '2024-01-01', to: '2024-12-31', provider: null },
        '2026-09-16',
      ),
    ).toEqual({ from: '2024-01-01', to: '2024-12-31', provider: null });
  });
});
