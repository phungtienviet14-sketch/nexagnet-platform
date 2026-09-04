import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { assertBusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_PAYROLL_POLICY } from './payroll-policy.js';
import {
  calculatePayslip,
  payrollPolicyVersion,
  reversalOf,
  type ManualComponentInput,
  type PayslipDraft,
} from './payroll-calculator.js';
import { evaluatePayslipTransition, isCorrectable } from './payslip-lifecycle.js';
import { TRANSPORT_WORKFORCE_DECISIONS } from './workforce-decisions.js';
import {
  WorkforceCoreFacts,
  WorkforceCostingFacts,
  WorkforceFuelFacts,
} from './workforce.ports.js';
import { WorkforceRepository, type PayslipWriteInput } from './workforce.repository.js';
import type {
  PayrollMissingInput,
  PayrollPeriod,
  PayrollPolicySnapshot,
  Payslip,
  PayslipStatus,
} from './workforce.types.js';

/** Khoan thu cong cua mot lai xe trong mot lan chay — duong DUY NHAT mot khoan tru ton tai. */
export interface ManualComponentsByDriver {
  readonly [driverId: string]: readonly ManualComponentInput[];
}

export interface RunPayrollInput {
  readonly periodId: string;
  readonly runBy: string;
  readonly manualComponents?: ManualComponentsByDriver;
}

/**
 * Duong GHI cua `transport-workforce`.
 *
 * `WorkforceFuelFacts` la `@Optional()`: `transport-fuel` KHONG nam trong phu thuoc cua capability
 * nay (T1 §10.1), nen no co the vang mat, va khi vang mat thi lan chay ghi
 * `FUEL_SAVING_UNAVAILABLE` vao `missingInputs` — mot con so thieu doc duoc tren phieu, thay vi
 * mot so khong khong ai giai thich duoc.
 */
@Injectable()
export class WorkforceService {
  constructor(
    private readonly repository: WorkforceRepository,
    private readonly core: WorkforceCoreFacts,
    @Inject(TRANSPORT_PAYROLL_POLICY) private readonly policy: PayrollPolicySnapshot,
    @Optional() private readonly costing?: WorkforceCostingFacts,
    @Optional() private readonly fuel?: WorkforceFuelFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async openPeriod(input: {
    label: string;
    startDate: string;
    endDate: string;
    createdBy: string;
  }): Promise<PayrollPeriod> {
    const startDate = assertBusinessDate(input.startDate);
    const endDate = assertBusinessDate(input.endDate);
    if (startDate > endDate) {
      throw TransportDomainError.invalid(
        'PAYROLL_PERIOD_RANGE_INVALID',
        'Ngay bat dau ky luong phai truoc hoac bang ngay ket thuc',
      );
    }
    const period = await this.repository.openPeriod({ ...input, startDate, endDate });
    if (!period) {
      throw TransportDomainError.conflict(
        'PAYROLL_PERIOD_OVERLAPS',
        'Ky luong nay chong lap mot ky da co',
      );
    }
    return period;
  }

  async closePeriod(id: string, closedBy: string): Promise<PayrollPeriod> {
    const period = await this.repository.closePeriod(id, { closedBy, closedAt: new Date() });
    if (!period) {
      throw TransportDomainError.notFound(
        'PAYROLL_PERIOD_NOT_FOUND',
        `Khong tim thay ky luong ${id}`,
      );
    }
    return period;
  }

  /**
   * Mot khoan thu cong mang chieu TRU bat buoc phai co nguoi ky.
   *
   * `GD-12` cho phep DUNG MOT duong de mot khoan tru xuat hien, va duong do di qua mot con nguoi.
   * Mot khoan tru khong ten nguoi ky la mot khau tru tu dong da doi ten — nen no bi chan o day,
   * truoc khi cham vao DB, du rang buoc `..._manual_needs_signer` cung se chan no o duoi.
   */
  private assertManualComponents(components: readonly ManualComponentInput[]): void {
    for (const component of components) {
      if (!Number.isInteger(component.amount) || component.amount <= 0) {
        throw TransportDomainError.invalid(
          'PAYSLIP_COMPONENT_AMOUNT_INVALID',
          'So tien cua mot thanh phan luong phai la so nguyen duong',
        );
      }
      if (component.recordedBy.trim().length === 0) {
        throw TransportDomainError.invalid(
          'PAYSLIP_MANUAL_COMPONENT_UNSIGNED',
          'Khoan thu cong phai ghi ten nguoi duyet',
        );
      }
    }
  }

  /**
   * CHAY LUONG cho mot ky — acceptance 10 va 11.
   *
   * Anh chup chinh sach duoc lay MOT LAN o day va di theo lan chay: neu ai do doi tham so luong
   * ngay giua chung, cac phieu trong CUNG mot lan chay van dung mot bo so. Doc lai chinh sach cho
   * tung lai xe se cho ra mot bang luong ma hai nguoi cung viec nhan hai muc khac nhau.
   */
  async runPayroll(input: RunPayrollInput) {
    const period = await this.repository.findPeriod(input.periodId);
    if (!period) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payroll.run',
        outcome: 'denied',
        reason: 'PAYROLL_PERIOD_UNKNOWN',
        detail: { periodId: input.periodId },
      });
      throw TransportDomainError.notFound(
        'PAYROLL_PERIOD_NOT_FOUND',
        `Khong tim thay ky luong ${input.periodId}`,
      );
    }

    const policy = this.policy;
    const missingInputs: PayrollMissingInput[] = [];

    const work = await this.core.workByDriver(period.startDate, period.endDate);
    const workByDriver = new Map(work.map((row) => [row.driverId, row]));
    const driverIds = await this.core.listActiveDriverIds();

    let litersSaved: ReadonlyMap<string, number> = new Map();
    if (this.fuel) {
      litersSaved = await this.fuel.litersSavedByDriver(period.startDate, period.endDate);
    } else {
      missingInputs.push('FUEL_SAVING_UNAVAILABLE');
    }
    if (!this.costing) missingInputs.push('DRIVER_FUND_UNAVAILABLE');

    const payslips: PayslipWriteInput[] = [];
    for (const driverId of driverIds) {
      const manual = input.manualComponents?.[driverId] ?? [];
      this.assertManualComponents(manual);

      const fundBalance = this.costing ? await this.costing.fundBalanceOf(driverId) : null;
      this.emitFundDisclosure(driverId, fundBalance);

      const row = workByDriver.get(driverId);
      const draft = calculatePayslip(policy, {
        driverId,
        tripCount: row?.tripCount ?? 0,
        distanceKm: row?.distanceKm ?? 0,
        fuelLitersSaved: this.fuel ? (litersSaved.get(driverId) ?? 0) : null,
        driverFundBalance: fundBalance,
        manualComponents: manual,
      });
      payslips.push(toWriteInput(draft, 'ORIGINAL', null, null));
    }

    for (const missing of missingInputs) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payroll.run',
        outcome: 'degraded',
        reason: 'PAYROLL_INPUT_UNAVAILABLE',
        detail: { missing },
      });
    }

    const outcome = await this.repository.recordRun({
      periodId: period.id,
      policySnapshot: policy,
      policyVersion: payrollPolicyVersion(policy),
      missingInputs,
      runBy: input.runBy,
      payslips,
    });

    if (outcome.kind === 'PERIOD_NOT_FOUND') {
      throw TransportDomainError.notFound(
        'PAYROLL_PERIOD_NOT_FOUND',
        `Khong tim thay ky luong ${input.periodId}`,
      );
    }
    if (outcome.kind === 'PERIOD_CLOSED') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payroll.run',
        outcome: 'denied',
        reason: 'PAYROLL_PERIOD_CLOSED',
        detail: { periodId: period.id },
      });
      throw TransportDomainError.invalid(
        'PAYROLL_PERIOD_CLOSED',
        'Ky luong da dong — khong chay them duoc',
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'payroll.run',
      outcome: 'allowed',
      reason: 'PAYROLL_RUN_COMPLETED',
      detail: {
        periodId: period.id,
        sequence: outcome.run.sequence,
        payslips: outcome.payslips.length,
      },
    });
    return outcome;
  }

  /**
   * BANG CHUNG O RUNTIME cho `GD-12`.
   *
   * Mot bat bien "khong bao gio xay ra" ma khong de lai dau vet nao thi khong chung minh duoc la no
   * dang duoc giu. Dong nay noi ro: da NHIN THAY so du quy, va da KHONG bien no thanh khoan tru.
   * `detail` mang dau cua so du chu khong mang so tien — du de loc, khong du de lo luong ai.
   */
  private emitFundDisclosure(driverId: string, balance: number | null): void {
    if (balance === null) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payroll.driver_fund_disclosure',
        outcome: 'degraded',
        reason: 'DRIVER_FUND_NOT_AVAILABLE',
        detail: { driverId },
      });
      return;
    }
    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'payroll.driver_fund_disclosure',
      outcome: 'allowed',
      reason: 'DRIVER_FUND_SHOWN_WITHOUT_DEDUCTION',
      detail: { driverId, sign: balance < 0 ? 'NEGATIVE' : balance > 0 ? 'POSITIVE' : 'ZERO' },
    });
  }

  /** Chuyen trang thai mot phieu — cong duy nhat, dung cho ca `APPROVED` lan `PAID`. */
  private async movePayslip(id: string, to: PayslipStatus, actor: string): Promise<Payslip> {
    const detail = await this.repository.findPayslip(id);
    if (!detail) {
      throw TransportDomainError.notFound('PAYSLIP_NOT_FOUND', `Khong tim thay phieu luong ${id}`);
    }

    const transition = evaluatePayslipTransition(detail.payslip.status, to);
    if (transition.kind !== 'PERMITTED') {
      const reason =
        transition.kind === 'ALREADY_IN_STATE'
          ? 'PAYSLIP_ALREADY_IN_STATE'
          : 'PAYSLIP_TRANSITION_NOT_PERMITTED';
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payslip.transition',
        outcome: 'denied',
        reason,
        detail: { payslipId: id, from: detail.payslip.status, to },
      });
      throw TransportDomainError.invalid(
        to === 'PAID' ? 'PAYSLIP_NOT_APPROVED' : 'PAYSLIP_NOT_DRAFT',
        `Phieu luong dang o ${detail.payslip.status}, khong chuyen sang ${to} duoc`,
      );
    }

    const outcome = await this.repository.transitionPayslip(id, detail.payslip.status, {
      to,
      actor,
      at: new Date(),
    });
    if (outcome.kind === 'NOT_FOUND') {
      throw TransportDomainError.notFound('PAYSLIP_NOT_FOUND', `Khong tim thay phieu luong ${id}`);
    }
    if (outcome.kind === 'REJECTED') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payslip.transition',
        outcome: 'denied',
        reason: 'PAYSLIP_TRANSITION_NOT_PERMITTED',
        detail: { payslipId: id, current: outcome.current, to },
      });
      throw TransportDomainError.conflict(
        'PAYSLIP_ALREADY_EXISTS_FOR_RUN',
        `Phieu luong vua duoc nguoi khac chuyen sang ${outcome.current}`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'payslip.transition',
      outcome: 'allowed',
      reason: to === 'PAID' ? 'PAYSLIP_PAID' : 'PAYSLIP_APPROVED',
      detail: { payslipId: id },
    });
    return outcome.payslip;
  }

  async approvePayslip(id: string, actor: string): Promise<Payslip> {
    return this.movePayslip(id, 'APPROVED', actor);
  }

  async payPayslip(id: string, actor: string): Promise<Payslip> {
    return this.movePayslip(id, 'PAID', actor);
  }

  /**
   * SUA mot phieu DA CHOT — acceptance 12.
   *
   * Hai duong, va ca hai deu GHI THEM: `SUPPLEMENTAL` bu them mot khoan, `REVERSAL` dao toan bo.
   * Khong co duong thu ba nao sua ban goc, va do la ca thiet ke — `WorkforceRepository` khong co
   * mot ham nao lam duoc dieu do.
   */
  async issueCorrection(input: {
    payslipId: string;
    kind: 'SUPPLEMENTAL' | 'REVERSAL';
    reason: string;
    actor: string;
    components?: readonly ManualComponentInput[];
  }): Promise<Payslip> {
    const detail = await this.repository.findPayslip(input.payslipId);
    if (!detail) {
      throw TransportDomainError.notFound(
        'PAYSLIP_NOT_FOUND',
        `Khong tim thay phieu luong ${input.payslipId}`,
      );
    }
    if (!isCorrectable(detail.payslip.status)) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payslip.correction',
        outcome: 'denied',
        reason: 'PAYSLIP_NOT_CORRECTABLE',
        detail: { payslipId: input.payslipId, status: detail.payslip.status },
      });
      throw TransportDomainError.invalid(
        'PAYSLIP_NOT_CORRECTABLE',
        `Phieu luong o ${detail.payslip.status} khong phat phieu bu duoc`,
      );
    }

    const base: PayslipDraft = {
      driverId: detail.payslip.driverId,
      components: detail.components.map((component) => ({
        kind: component.kind,
        source: component.source,
        label: component.label,
        amount: component.amount,
        quantity: component.quantity,
        unitAmount: component.unitAmount,
        recordedBy: component.recordedBy,
        note: component.note,
      })),
      grossEarnings: detail.payslip.grossEarnings,
      totalDeductions: detail.payslip.totalDeductions,
      netAmount: detail.payslip.netAmount,
      tripCount: detail.payslip.tripCount,
      distanceKm: detail.payslip.distanceKm,
      driverFundBalanceSnapshot: detail.payslip.driverFundBalanceSnapshot,
    };

    let draft: PayslipDraft;
    if (input.kind === 'REVERSAL') {
      draft = reversalOf(base, input.actor);
    } else {
      const manual = input.components ?? [];
      this.assertManualComponents(manual);
      draft = calculatePayslip(
        { baseSalaryVnd: 0, perTripVnd: 0, perKmVnd: 0, fuelSavingBonusVndPerLiter: 0 },
        {
          driverId: detail.payslip.driverId,
          tripCount: 0,
          distanceKm: 0,
          fuelLitersSaved: null,
          driverFundBalance: detail.payslip.driverFundBalanceSnapshot,
          manualComponents: manual,
        },
      );
    }

    const outcome = await this.repository.issueCorrection({
      correctsId: input.payslipId,
      runId: detail.payslip.runId,
      reason: input.reason,
      actor: input.actor,
      // Voi `REVERSAL` day la moc DUYET cua ban dao: phat mot phieu dao chinh la hanh dong chot,
      // nen ban dao khong bao gio ton tai o `DRAFT` ben canh mot ban goc da mang `REVERSED`.
      at: new Date(),
      payslip: toWriteInput(draft, input.kind, input.payslipId, input.reason),
    });

    if (outcome.kind === 'NOT_FOUND') {
      throw TransportDomainError.notFound(
        'PAYSLIP_NOT_FOUND',
        `Khong tim thay phieu luong ${input.payslipId}`,
      );
    }
    if (outcome.kind === 'NOT_CORRECTABLE') {
      throw TransportDomainError.invalid(
        'PAYSLIP_NOT_CORRECTABLE',
        `Phieu luong o ${outcome.current} khong phat phieu bu duoc`,
      );
    }
    if (outcome.kind === 'ALREADY_REVERSED') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
        point: 'payslip.correction',
        outcome: 'denied',
        reason: 'PAYSLIP_ALREADY_REVERSED',
        detail: { payslipId: input.payslipId },
      });
      throw TransportDomainError.conflict(
        'PAYSLIP_ALREADY_REVERSED',
        'Ban goc nay da co mot phieu dao',
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_WORKFORCE_DECISIONS,
      point: 'payslip.correction',
      outcome: 'allowed',
      reason: input.kind === 'REVERSAL' ? 'PAYSLIP_REVERSAL_ISSUED' : 'PAYSLIP_SUPPLEMENT_ISSUED',
      detail: { payslipId: input.payslipId, correctionId: outcome.payslip.id },
    });
    return outcome.payslip;
  }
}

const toWriteInput = (
  draft: PayslipDraft,
  kind: Payslip['kind'],
  correctsId: string | null,
  correctionReason: string | null,
): PayslipWriteInput => ({
  driverId: draft.driverId,
  kind,
  correctsId,
  correctionReason,
  grossEarnings: draft.grossEarnings,
  totalDeductions: draft.totalDeductions,
  netAmount: draft.netAmount,
  driverFundBalanceSnapshot: draft.driverFundBalanceSnapshot,
  tripCount: draft.tripCount,
  distanceKm: draft.distanceKm,
  components: draft.components,
});
