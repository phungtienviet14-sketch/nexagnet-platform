import { createHash } from 'node:crypto';
import { money } from '../money.js';
import type {
  PayrollPolicySnapshot,
  PayslipComponentKind,
  PayslipComponentSource,
} from './workforce.types.js';

/**
 * TINH LUONG — TAT DINH VA THUAN TUY (acceptance 10, 11).
 *
 * Khong doc DB, khong doc dong ho, khong goi LLM. Guardrail `NO_LLM_FINANCIAL_DECISION` cua T1 §16
 * duoc giu o day theo cach re nhat co the: tep nay khong co mot duong nao de mot mo hinh ngon ngu
 * chen vao. Luong la mot phep cong cua nhung con so dem duoc, va no phai ra CUNG mot ket qua moi
 * lan chay tren cung dau vao.
 *
 * ---------------------------------------------------------------------------
 * `GD-12` — VI SAO KHONG CO NHANH NAO SINH KHOAN TRU.
 *
 * `driverFundBalance` di vao ket qua DUNG MOT CHO: `driverFundBalanceSnapshot`, mot truong de
 * NHIN. No khong xuat hien trong mot phep tinh nao, khong sinh mot `component` nao, va khong co
 * mot nhanh `if (balance < 0)` nao trong tep nay. VT-062 muon nguoi duyet nhin thay so du truoc
 * khi quyet dinh; quyet dinh do la cua NGUOI, va neu ho quyet tru thi khoan do vao bang
 * `manualComponents` voi ten nguoi ky.
 *
 * Ba lop giu cung mot dieu, tu ngoai vao: bo tu vung `PayslipComponentSource` khong co ma nao cho
 * khau tru tu dong; tep nay khong co nhanh sinh ra no; va rang buoc
 * `TransportPayslipComponent_deduction_manual_only` duoi Postgres lam hang do KHONG GHI DUOC.
 * ---------------------------------------------------------------------------
 */

/** Mot dong do NGUOI them vao — duong duy nhat mot khoan tru ton tai. */
export interface ManualComponentInput {
  readonly kind: PayslipComponentKind;
  readonly label: string;
  /** DUONG. Chieu nam o `kind`. */
  readonly amount: number;
  readonly recordedBy: string;
  readonly note?: string | null;
}

export interface PayrollDriverInput {
  readonly driverId: string;
  readonly tripCount: number;
  readonly distanceKm: number;
  /**
   * So LIT tiet kiem duoc so voi dinh muc, lam tron xuong. `null` = khong co du lieu tat dinh —
   * khong phai `0`. Xem `PAYROLL_MISSING_INPUTS`.
   */
  readonly fuelLitersSaved: number | null;
  /** `GD-12` — CHI de hien thi. `null` khi khach tat `transport-costing`. */
  readonly driverFundBalance: number | null;
  readonly manualComponents: readonly ManualComponentInput[];
}

export interface PayslipComponentDraft {
  readonly kind: PayslipComponentKind;
  readonly source: PayslipComponentSource;
  readonly label: string;
  readonly amount: number;
  readonly quantity: number | null;
  readonly unitAmount: number | null;
  readonly recordedBy: string | null;
  readonly note: string | null;
}

export interface PayslipDraft {
  readonly driverId: string;
  readonly components: readonly PayslipComponentDraft[];
  readonly grossEarnings: number;
  readonly totalDeductions: number;
  readonly netAmount: number;
  readonly tripCount: number;
  readonly distanceKm: number;
  readonly driverFundBalanceSnapshot: number | null;
}

/**
 * MA BAM cua mot anh chup chinh sach.
 *
 * Bam tren mot chuoi co THU TU TRUONG CO DINH, khong tren `JSON.stringify(policy)`: thu tu khoa
 * cua mot doi tuong phu thuoc cach no duoc dung nen, va hai lan chay cung tham so co the cho ra hai
 * ma bam khac nhau — dung kieu khong on dinh ma mot "phien ban" khong duoc phep co.
 */
export function payrollPolicyVersion(policy: PayrollPolicySnapshot): string {
  const canonical = [
    `base=${policy.baseSalaryVnd}`,
    `trip=${policy.perTripVnd}`,
    `km=${policy.perKmVnd}`,
    `fuel=${policy.fuelSavingBonusVndPerLiter}`,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 64);
}

const sumOf = (components: readonly PayslipComponentDraft[], kind: PayslipComponentKind): number =>
  components.reduce(
    (total, component) => (component.kind === kind ? total + component.amount : total),
    0,
  );

export function calculatePayslip(
  policy: PayrollPolicySnapshot,
  input: PayrollDriverInput,
): PayslipDraft {
  const components: PayslipComponentDraft[] = [];

  if (policy.baseSalaryVnd > 0) {
    components.push({
      kind: 'EARNING',
      source: 'BASE_SALARY',
      label: 'Luong co ban',
      amount: money(policy.baseSalaryVnd).amount,
      quantity: null,
      unitAmount: policy.baseSalaryVnd,
      recordedBy: null,
      note: null,
    });
  }

  if (policy.perTripVnd > 0 && input.tripCount > 0) {
    components.push({
      kind: 'EARNING',
      source: 'PER_TRIP',
      label: 'Khoan theo chuyen',
      amount: money(policy.perTripVnd * input.tripCount).amount,
      quantity: input.tripCount,
      unitAmount: policy.perTripVnd,
      recordedBy: null,
      note: null,
    });
  }

  if (policy.perKmVnd > 0 && input.distanceKm > 0) {
    components.push({
      kind: 'EARNING',
      source: 'PER_KM',
      label: 'Khoan theo ki-lo-met',
      amount: money(policy.perKmVnd * input.distanceKm).amount,
      quantity: input.distanceKm,
      unitAmount: policy.perKmVnd,
      recordedBy: null,
      note: null,
    });
  }

  /**
   * `null` KHAC `0`. `null` la "khong co du lieu tieu hao tat dinh" va khong sinh dong nao; `0` la
   * "co du lieu, va lai xe khong tiet kiem duoc lit nao" — cung khong sinh dong, nhung vi mot ly do
   * khac han. Su khac biet do doc duoc o `PayrollRun.missingInputs`.
   */
  const litersSaved = input.fuelLitersSaved;
  if (policy.fuelSavingBonusVndPerLiter > 0 && litersSaved !== null && litersSaved > 0) {
    components.push({
      kind: 'EARNING',
      source: 'FUEL_SAVING_BONUS',
      label: 'Thuong tiet kiem dau',
      amount: money(policy.fuelSavingBonusVndPerLiter * litersSaved).amount,
      quantity: litersSaved,
      unitAmount: policy.fuelSavingBonusVndPerLiter,
      recordedBy: null,
      note: null,
    });
  }

  for (const manual of input.manualComponents) {
    components.push({
      kind: manual.kind,
      source: manual.kind === 'DEDUCTION' ? 'MANUAL_DEDUCTION' : 'MANUAL_BONUS',
      label: manual.label,
      amount: money(manual.amount).amount,
      quantity: null,
      unitAmount: null,
      recordedBy: manual.recordedBy,
      note: manual.note ?? null,
    });
  }

  const grossEarnings = sumOf(components, 'EARNING');
  const totalDeductions = sumOf(components, 'DEDUCTION');

  return {
    driverId: input.driverId,
    components,
    grossEarnings,
    totalDeductions,
    netAmount: grossEarnings - totalDeductions,
    tripCount: input.tripCount,
    distanceKm: input.distanceKm,
    driverFundBalanceSnapshot: input.driverFundBalance,
  };
}

/**
 * DAO mot phieu da chot — moi dong doi CHIEU, so tien giu nguyen.
 *
 * `reversedBy` la BAT BUOC, khong phai mot tham so tien nghi: moi dong cua ban dao mang nguon
 * `MANUAL_*`, va rang buoc `TransportPayslipComponent_manual_needs_signer` doi mot nguoi ky. Do
 * cung la dieu dung ve nghiep vu — dao mot phieu luong da tra la mot quyet dinh co nguoi chiu
 * trach nhiem, khong phai mot phep tinh.
 */
export function reversalOf(draft: PayslipDraft, reversedBy: string): PayslipDraft {
  const components: PayslipComponentDraft[] = draft.components.map((component) => ({
    ...component,
    kind: component.kind === 'EARNING' ? 'DEDUCTION' : 'EARNING',
    source: component.kind === 'EARNING' ? 'MANUAL_DEDUCTION' : 'MANUAL_BONUS',
    label: `Dao: ${component.label}`,
    quantity: null,
    unitAmount: null,
    recordedBy: reversedBy,
  }));
  const grossEarnings = sumOf(components, 'EARNING');
  const totalDeductions = sumOf(components, 'DEDUCTION');
  return {
    ...draft,
    components,
    grossEarnings,
    totalDeductions,
    netAmount: grossEarnings - totalDeductions,
  };
}
