import { describe, expect, it } from 'vitest';
import {
  calculatePayslip,
  payrollPolicyVersion,
  reversalOf,
  type PayrollDriverInput,
} from './payroll-calculator.js';
import type { PayrollPolicySnapshot } from './workforce.types.js';

const policy: PayrollPolicySnapshot = {
  baseSalaryVnd: 6_000_000,
  perTripVnd: 250_000,
  perKmVnd: 1_200,
  fuelSavingBonusVndPerLiter: 8_000,
};

const driver = (overrides: Partial<PayrollDriverInput> = {}): PayrollDriverInput => ({
  driverId: 'drv-1',
  tripCount: 8,
  distanceKm: 2_400,
  fuelLitersSaved: 0,
  driverFundBalance: 0,
  manualComponents: [],
  ...overrides,
});

describe('tinh luong — tat dinh tu anh chup chinh sach', () => {
  /** ACCEPTANCE 10 — cac thanh phan tinh ra tu chinh sach da chup. */
  it('ACCEPTANCE 10: bon thanh phan tinh dung tu anh chup chinh sach', () => {
    const draft = calculatePayslip(policy, driver({ fuelLitersSaved: 30 }));

    expect(draft.components.map((component) => component.source)).toEqual([
      'BASE_SALARY',
      'PER_TRIP',
      'PER_KM',
      'FUEL_SAVING_BONUS',
    ]);
    expect(draft.grossEarnings).toBe(6_000_000 + 8 * 250_000 + 2_400 * 1_200 + 30 * 8_000);
    expect(draft.totalDeductions).toBe(0);
    expect(draft.netAmount).toBe(draft.grossEarnings);
  });

  it('ACCEPTANCE 10 (bis): chay hai lan tren cung dau vao ra cung ket qua', () => {
    const input = driver({ fuelLitersSaved: 12 });
    expect(calculatePayslip(policy, input)).toEqual(calculatePayslip(policy, input));
  });

  it('can cu tinh duoc chup lai de truy nguoc tung dong', () => {
    const draft = calculatePayslip(policy, driver());
    const perTrip = draft.components.find((component) => component.source === 'PER_TRIP');

    expect(perTrip?.quantity).toBe(8);
    expect(perTrip?.unitAmount).toBe(250_000);
    expect(perTrip?.amount).toBe(2_000_000);
  });

  it('tham so bang 0 thi khong sinh dong rong', () => {
    const draft = calculatePayslip(
      { baseSalaryVnd: 6_000_000, perTripVnd: 0, perKmVnd: 0, fuelSavingBonusVndPerLiter: 0 },
      driver(),
    );
    expect(draft.components.map((component) => component.source)).toEqual(['BASE_SALARY']);
  });

  /**
   * `null` KHAC `0` o truc nhien lieu.
   *
   * `null` = khong doc duoc du lieu tieu hao (khach tat `transport-fuel`); `0` = doc duoc, va lai
   * xe khong tiet kiem duoc lit nao. Ca hai cung khong sinh dong thuong, nhung mot ben la mot con
   * so THIEU va ben kia la mot con so DUNG — va `PayrollRun.missingInputs` la cho phan biet.
   */
  it('fuelLitersSaved = null khong sinh dong thuong, cung nhu 0', () => {
    expect(
      calculatePayslip(policy, driver({ fuelLitersSaved: null })).components.map((c) => c.source),
    ).not.toContain('FUEL_SAVING_BONUS');
    expect(
      calculatePayslip(policy, driver({ fuelLitersSaved: 0 })).components.map((c) => c.source),
    ).not.toContain('FUEL_SAVING_BONUS');
  });

  it('phien ban chinh sach on dinh, va doi khi mot tham so doi', () => {
    expect(payrollPolicyVersion(policy)).toBe(payrollPolicyVersion({ ...policy }));
    expect(payrollPolicyVersion(policy)).not.toBe(
      payrollPolicyVersion({ ...policy, perKmVnd: 1_300 }),
    );
  });
});

describe('GD-12 — so du quy KHONG bao gio thanh khoan tru', () => {
  /**
   * ACCEPTANCE 11 — khong co khau tru tu dong tu chenh lech / no ung.
   *
   * Bai nay khang dinh ba dieu tren cung mot lan chay voi so du AM lon:
   *   1. khong mot `component` nao co `kind = 'DEDUCTION'`;
   *   2. `totalDeductions` bang khong;
   *   3. so du VAN hien ra o `driverFundBalanceSnapshot` — tuc no khong bi giau di, chi khong bi
   *      bien thanh tien.
   *
   * Dieu thu ba quan trong khong kem hai dieu dau: neu ai do "sua" bang cach bo han so du khoi
   * phieu thi VT-062 khong con duoc dap ung, va nguoi duyet mat dung thong tin ho can.
   */
  it('ACCEPTANCE 11: so du quy AM khong sinh mot khoan tru nao', () => {
    const draft = calculatePayslip(policy, driver({ driverFundBalance: -4_500_000 }));

    expect(draft.components.filter((component) => component.kind === 'DEDUCTION')).toEqual([]);
    expect(draft.totalDeductions).toBe(0);
    expect(draft.netAmount).toBe(draft.grossEarnings);
    expect(draft.driverFundBalanceSnapshot).toBe(-4_500_000);
  });

  it('ACCEPTANCE 11 (bis): so du AM lon hon ca luong van khong tru dong nao', () => {
    const draft = calculatePayslip(policy, driver({ driverFundBalance: -999_000_000 }));
    expect(draft.netAmount).toBeGreaterThan(0);
    expect(draft.totalDeductions).toBe(0);
  });

  /**
   * Duong DUY NHAT mot khoan tru ton tai: mot nguoi ky ten.
   *
   * Va ma nguon cua no la `MANUAL_DEDUCTION` — khong phai mot ma nao goi y rang may tinh da quyet.
   */
  it('khoan tru chi den tu mot dong THU CONG co nguoi ky', () => {
    const draft = calculatePayslip(
      policy,
      driver({
        driverFundBalance: -4_500_000,
        manualComponents: [
          {
            kind: 'DEDUCTION',
            label: 'Thu hoi tam ung theo thoa thuan',
            amount: 1_000_000,
            recordedBy: 'giam-doc',
          },
        ],
      }),
    );

    const deductions = draft.components.filter((component) => component.kind === 'DEDUCTION');
    expect(deductions).toHaveLength(1);
    expect(deductions[0]?.source).toBe('MANUAL_DEDUCTION');
    expect(deductions[0]?.recordedBy).toBe('giam-doc');
    expect(draft.totalDeductions).toBe(1_000_000);
    expect(draft.netAmount).toBe(draft.grossEarnings - 1_000_000);
  });

  it('so du quy = null (costing dang tat) van khong sinh gi, va ghi ro la null', () => {
    const draft = calculatePayslip(policy, driver({ driverFundBalance: null }));
    expect(draft.driverFundBalanceSnapshot).toBeNull();
    expect(draft.totalDeductions).toBe(0);
  });
});

describe('phieu dao — moi dong doi chieu, tong ve khong', () => {
  it('dao mot phieu thuan tuy thu nhap thanh mot phieu thuan tuy khau tru', () => {
    const original = calculatePayslip(policy, driver({ fuelLitersSaved: 10 }));
    const reversal = reversalOf(original, 'giam-doc');

    expect(reversal.totalDeductions).toBe(original.grossEarnings);
    expect(reversal.grossEarnings).toBe(original.totalDeductions);
    expect(reversal.netAmount).toBe(-original.netAmount);
  });

  it('moi dong cua ban dao deu co nguoi ky — rang buoc DB doi dieu do', () => {
    const original = calculatePayslip(policy, driver());
    const reversal = reversalOf(original, 'giam-doc');

    expect(reversal.components.length).toBeGreaterThan(0);
    for (const component of reversal.components) {
      expect(component.recordedBy).toBe('giam-doc');
      expect(component.source).toMatch(/^MANUAL_/);
    }
  });

  it('ban goc KHONG bi sua khi dao', () => {
    const original = calculatePayslip(policy, driver());
    const snapshot = JSON.stringify(original);
    reversalOf(original, 'giam-doc');
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
