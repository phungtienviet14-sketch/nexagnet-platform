import { describe, expect, it } from 'vitest';
import type {
  DriverPayslipView,
  PayrollPeriod,
  PayrollRun,
  Payslip,
  PayslipDetail,
} from '../../transport-types';
import { toAssetDirectory } from '../assets';
import {
  toDriverPayslipRows,
  toPayrollPeriodRows,
  toPayrollRunRows,
  toPayslipDetail,
  toPayslipRows,
} from '../payroll';
import { driver } from './fixtures';

/**
 * `TX-07` o tang khung nhin.
 *
 * Bai dau tien la bai quan trong nhat, va no la mot bai ve CAI KHONG CO: khong mot ham nao trong
 * `payroll.ts` cong hai so ra mot so tien. Neu mot ngay nao do co, hai nguoi doc cung mot phieu se
 * ra hai con so — va con so sai la con so nguoi lai xe cam ve nha.
 */

const directory = toAssetDirectory({
  vehicles: [],
  drivers: [driver({ id: 'drv-1', fullName: 'Nguyễn Văn Bình' })],
});

const payslip = (over: Partial<Payslip> = {}): Payslip => ({
  id: 'ps-1',
  runId: 'run-1',
  driverId: 'drv-1',
  kind: 'ORIGINAL',
  status: 'DRAFT',
  grossEarnings: 12_000_000,
  totalDeductions: 2_000_000,
  netAmount: 10_000_000,
  currencyCode: 'VND',
  driverFundBalanceSnapshot: 1_500_000,
  tripCount: 18,
  distanceKm: 4200,
  correctsId: null,
  correctionReason: null,
  approvedAt: null,
  paidAt: null,
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
  ...over,
});

describe('KHONG mot phep tinh luong nao o tang man hinh', () => {
  it('thuc nhan lay NGUYEN tu may chu, khong phai gross tru deductions', () => {
    // May chu gui mot bo so KHONG khop nhau (co y). Neu man hinh tu tinh, no se "sua" thanh
    // 10.000.000 va che mat mot loi du lieu that.
    const rows = toPayslipRows([payslip({ netAmount: 9_999_999 })], directory);
    expect(rows[0]?.netLabel).toContain('9.999.999');
  });
});

describe('ky luong', () => {
  const period = (over: Partial<PayrollPeriod> = {}): PayrollPeriod => ({
    id: 'per-1',
    label: 'Tháng 9/2026',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    status: 'OPEN',
    closedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  });

  it('khoang ngay doc theo lich NGHIEP VU, khong doi mui gio', () => {
    expect(toPayrollPeriodRows([period()])[0]?.rangeLabel).toBe('01/09/2026 – 30/09/2026');
  });

  it('ky chua chot thi KHONG hien mot moc chot bia ra', () => {
    expect(toPayrollPeriodRows([period()])[0]?.closedAtLabel).toBe('—');
  });
});

describe('lan chay luong', () => {
  const run = (over: Partial<PayrollRun> = {}): PayrollRun => ({
    id: 'run-1',
    periodId: 'per-1',
    sequence: 1,
    policySnapshot: {
      baseSalaryVnd: 8_000_000,
      perTripVnd: 150_000,
      perKmVnd: 500,
      fuelSavingBonusVndPerLiter: 3_000,
    },
    policyVersion: 'v1',
    missingInputs: [],
    runAt: '2026-09-30T10:00:00.000Z',
    ...over,
  });

  it('ANH CHUP chinh sach hien ra — mot phieu cu phai doc duoc don gia CUA LUC DO', () => {
    const rows = toPayrollRunRows([run()]);
    expect(rows[0]?.policyLines).toHaveLength(4);
    expect(rows[0]?.policyLines[0]).toContain('8.000.000');
  });

  it('NGUON THIEU phai hien ra, khong duoc giau', () => {
    const rows = toPayrollRunRows([run({ missingInputs: ['FUEL_SAVING_UNAVAILABLE'] })]);
    expect(rows[0]?.hasMissingInputs).toBe(true);
    expect(rows[0]?.missingInputs[0]).toContain('tiết kiệm nhiên liệu');
  });

  it('du nguon thi khong bay mot canh bao thua', () => {
    expect(toPayrollRunRows([run()])[0]?.hasMissingInputs).toBe(false);
  });
});

describe('phieu luong — be mat van hanh', () => {
  it('lai xe hien bang TEN, khong bang driverId', () => {
    const rows = toPayslipRows([payslip()], directory);
    expect(rows[0]?.driverLabel).toBe('Nguyễn Văn Bình');
    expect(rows[0]?.driverLabel).not.toContain('drv-1');
  });

  it('ba co thao tac di theo dung VONG DOI, khong tu nghi ra dieu kien', () => {
    expect(toPayslipRows([payslip({ status: 'DRAFT' })], directory)[0]?.canApprove).toBe(true);
    expect(toPayslipRows([payslip({ status: 'DRAFT' })], directory)[0]?.canPay).toBe(false);
    expect(toPayslipRows([payslip({ status: 'APPROVED' })], directory)[0]?.canPay).toBe(true);
    expect(toPayslipRows([payslip({ status: 'PAID' })], directory)[0]?.canApprove).toBe(false);
    expect(toPayslipRows([payslip({ status: 'PAID' })], directory)[0]?.canCorrect).toBe(true);
  });

  it('ANH CHUP so du quy hien tren chi tiet — de NGUOI DUYET nhin truoc khi quyet', () => {
    const detail: PayslipDetail = { payslip: payslip(), components: [] };
    expect(toPayslipDetail(detail, directory)?.fundSnapshotLabel).toContain('1.500.000');
  });

  it('khoan cau thanh co so luong x don gia thi ghep lai duoc', () => {
    const detail: PayslipDetail = {
      payslip: payslip(),
      components: [
        {
          id: 'c-1',
          payslipId: 'ps-1',
          kind: 'EARNING',
          source: 'PER_TRIP',
          label: 'Theo chuyến',
          amount: 2_700_000,
          quantity: 18,
          unitAmount: 150_000,
          note: null,
          createdAt: '2026-09-30T00:00:00.000Z',
        },
      ],
    };
    const model = toPayslipDetail(detail, directory);
    expect(model?.components[0]?.quantityLabel).toContain('18');
    expect(model?.components[0]?.quantityLabel).toContain('150.000');
    expect(model?.components[0]?.isDeduction).toBe(false);
  });
});

describe('phieu luong — be mat LAI XE', () => {
  const view = (over: Partial<DriverPayslipView> = {}): DriverPayslipView => ({
    id: 'ps-1',
    period: {
      id: 'per-1',
      label: 'Tháng 9/2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    },
    kind: 'ORIGINAL',
    status: 'PAID',
    grossEarnings: 12_000_000,
    totalDeductions: 2_000_000,
    netAmount: 10_000_000,
    currencyCode: 'VND',
    tripCount: 18,
    distanceKm: 4200,
    correctsId: null,
    correctionReason: null,
    components: [],
    approvedAt: '2026-10-01T02:00:00.000Z',
    paidAt: '2026-10-05T02:00:00.000Z',
    createdAt: '2026-09-30T00:00:00.000Z',
    ...over,
  });

  /**
   * Bai nay khoa mot dieu KHONG duoc lam: loc `DRAFT` o day. May chu da chan bang KIEU
   * (`Exclude<PayslipStatus,'DRAFT'>`) va bang ham dung khung nhin. Mot lop loc thu hai o man hinh
   * se lech khoi lop dau vao mot ngay nao do.
   */
  it('khong loc lai gi ca — moi phieu may chu gui deu hien', () => {
    expect(toDriverPayslipRows([view(), view({ id: 'ps-2', status: 'REVERSED' })])).toHaveLength(2);
  });

  it('phieu DA BI DAO van hien, de chuoi sua doc duoc tron ven', () => {
    const rows = toDriverPayslipRows([view({ status: 'REVERSED' })]);
    expect(rows[0]?.statusLabel).toBe('Đã bị đảo');
    expect(rows[0]?.tone).toBe('stop');
  });

  it('moc duyet/tra hien ra — do la cau hoi cua chinh nguoi nhan luong', () => {
    const rows = toDriverPayslipRows([view()]);
    expect(rows[0]?.approvedAtLabel).not.toBe('—');
    expect(rows[0]?.paidAtLabel).not.toBe('—');
  });
});
