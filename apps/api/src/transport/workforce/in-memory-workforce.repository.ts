import { randomUUID } from 'node:crypto';
import { TRANSPORT_CURRENCY } from '../money.js';
import type { PayslipComponentDraft } from './payroll-calculator.js';
import {
  WorkforceRepository,
  type ClosePayrollPeriodInput,
  type IssueCorrectionInput,
  type IssueCorrectionOutcome,
  type OpenPayrollPeriodInput,
  type PayslipWriteInput,
  type RecordPayrollRunInput,
  type RecordPayrollRunOutcome,
  type TransitionPayslipInput,
  type TransitionPayslipOutcome,
} from './workforce.repository.js';
import type {
  Payslip,
  PayslipComponent,
  PayslipDetail,
  PayslipStatus,
  PayrollPeriod,
  PayrollRun,
} from './workforce.types.js';

const iso = (at: Date): string => at.toISOString();

/**
 * Ban trong bo nho cua `WorkforceRepository`.
 *
 * CUNG BAT BIEN NGHIEP VU voi ban Prisma — ky khong chong lap, mot phieu goc cho moi (lan chay,
 * lai xe), mot phieu dao cho moi ban goc, va phieu da chot khong sua noi dung. Neu ban nay long
 * hon thi cac bai `*.service.spec.ts` se xanh trong khi duong that do o DB.
 *
 * Cai ban nay CO Y khong mo phong: khoa hang va nguoi ghi dong thoi. Do la viec cua `*.int.spec.ts`.
 */
export class InMemoryWorkforceRepository extends WorkforceRepository {
  private readonly periods = new Map<string, PayrollPeriod>();
  private readonly runs = new Map<string, PayrollRun>();
  private readonly payslips = new Map<string, Payslip>();
  private readonly components = new Map<string, PayslipComponent[]>();

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  async openPeriod(input: OpenPayrollPeriodInput): Promise<PayrollPeriod | null> {
    const overlaps = [...this.periods.values()].some(
      (period) => input.startDate <= period.endDate && period.startDate <= input.endDate,
    );
    if (overlaps) return null;

    const at = iso(this.now());
    const period: PayrollPeriod = {
      id: randomUUID(),
      label: input.label,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'OPEN',
      closedAt: null,
      closedBy: null,
      createdBy: input.createdBy,
      createdAt: at,
      updatedAt: at,
    };
    this.periods.set(period.id, period);
    return period;
  }

  async closePeriod(id: string, input: ClosePayrollPeriodInput): Promise<PayrollPeriod | null> {
    const current = this.periods.get(id);
    if (!current) return null;
    const next: PayrollPeriod = {
      ...current,
      status: 'CLOSED',
      closedAt: iso(input.closedAt),
      closedBy: input.closedBy,
      updatedAt: iso(this.now()),
    };
    this.periods.set(id, next);
    return next;
  }

  async findPeriod(id: string): Promise<PayrollPeriod | null> {
    return this.periods.get(id) ?? null;
  }

  async listPeriods(): Promise<PayrollPeriod[]> {
    return [...this.periods.values()];
  }

  /**
   * `posted` chi duoc dat cho mot BAN DAO — xem ghi chu tren `WorkforceRepository.issueCorrection`.
   * Moi phieu khac ra doi `DRAFT`, va duong duy nhat roi khoi do la `transitionPayslip()`.
   */
  private materialize(
    runId: string,
    input: PayslipWriteInput,
    posted?: { readonly at: string; readonly actor: string },
  ): Payslip {
    const at = iso(this.now());
    const payslip: Payslip = {
      id: randomUUID(),
      runId,
      driverId: input.driverId,
      kind: input.kind,
      status: posted ? 'APPROVED' : 'DRAFT',
      grossEarnings: input.grossEarnings,
      totalDeductions: input.totalDeductions,
      netAmount: input.netAmount,
      currencyCode: TRANSPORT_CURRENCY,
      driverFundBalanceSnapshot: input.driverFundBalanceSnapshot,
      tripCount: input.tripCount,
      distanceKm: input.distanceKm,
      correctsId: input.correctsId,
      correctionReason: input.correctionReason,
      approvedAt: posted?.at ?? null,
      approvedBy: posted?.actor ?? null,
      paidAt: null,
      paidBy: null,
      createdAt: at,
      updatedAt: at,
    };
    this.payslips.set(payslip.id, payslip);
    this.components.set(
      payslip.id,
      input.components.map((c) => this.toComponent(payslip.id, c, at)),
    );
    return payslip;
  }

  private toComponent(
    payslipId: string,
    draft: PayslipComponentDraft,
    at: string,
  ): PayslipComponent {
    return {
      id: randomUUID(),
      payslipId,
      kind: draft.kind,
      source: draft.source,
      label: draft.label,
      amount: draft.amount,
      quantity: draft.quantity,
      unitAmount: draft.unitAmount,
      recordedBy: draft.recordedBy,
      note: draft.note,
      createdAt: at,
    };
  }

  async recordRun(input: RecordPayrollRunInput): Promise<RecordPayrollRunOutcome> {
    const period = this.periods.get(input.periodId);
    if (!period) return { kind: 'PERIOD_NOT_FOUND' };
    if (period.status === 'CLOSED') return { kind: 'PERIOD_CLOSED' };

    const sequence =
      [...this.runs.values()].filter((run) => run.periodId === input.periodId).length + 1;
    const run: PayrollRun = {
      id: randomUUID(),
      periodId: input.periodId,
      sequence,
      policySnapshot: input.policySnapshot,
      policyVersion: input.policyVersion,
      missingInputs: [...input.missingInputs],
      runBy: input.runBy,
      runAt: iso(this.now()),
    };
    this.runs.set(run.id, run);

    const payslips = input.payslips.map((payslip) => this.materialize(run.id, payslip));
    return { kind: 'RECORDED', run, payslips };
  }

  async findRun(id: string): Promise<PayrollRun | null> {
    return this.runs.get(id) ?? null;
  }

  async listRuns(periodId: string): Promise<PayrollRun[]> {
    return [...this.runs.values()].filter((run) => run.periodId === periodId);
  }

  private detail(payslip: Payslip): PayslipDetail {
    return { payslip, components: this.components.get(payslip.id) ?? [] };
  }

  async findPayslip(id: string): Promise<PayslipDetail | null> {
    const payslip = this.payslips.get(id);
    return payslip ? this.detail(payslip) : null;
  }

  async listPayslips(runId: string): Promise<PayslipDetail[]> {
    return [...this.payslips.values()]
      .filter((payslip) => payslip.runId === runId)
      .map((payslip) => this.detail(payslip));
  }

  async listPayslipsByDriver(driverId: string): Promise<PayslipDetail[]> {
    return [...this.payslips.values()]
      .filter((payslip) => payslip.driverId === driverId)
      .map((payslip) => this.detail(payslip));
  }

  /**
   * Dieu kien `from` nam TRONG lenh ghi, khong o mot lan doc truoc do.
   *
   * Ban trong bo nho khong co nguoi ghi dong thoi, nen ky thuat nay o day khong bao ve gi — no ton
   * tai de HAI hien thuc cua cung mot kho co CUNG mot giao dien, va de mot bai test viet cho ban
   * nay khong phai viet lai cho ban kia.
   */
  async transitionPayslip(
    id: string,
    from: PayslipStatus,
    input: TransitionPayslipInput,
  ): Promise<TransitionPayslipOutcome> {
    const current = this.payslips.get(id);
    if (!current) return { kind: 'NOT_FOUND' };
    if (current.status !== from) return { kind: 'REJECTED', current: current.status };

    const at = iso(input.at);
    const next: Payslip = {
      ...current,
      status: input.to,
      approvedAt: input.to === 'APPROVED' ? at : current.approvedAt,
      approvedBy: input.to === 'APPROVED' ? input.actor : current.approvedBy,
      paidAt: input.to === 'PAID' ? at : current.paidAt,
      paidBy: input.to === 'PAID' ? input.actor : current.paidBy,
      updatedAt: iso(this.now()),
    };
    this.payslips.set(id, next);
    return { kind: 'MOVED', payslip: next };
  }

  async issueCorrection(input: IssueCorrectionInput): Promise<IssueCorrectionOutcome> {
    const target = this.payslips.get(input.correctsId);
    if (!target) return { kind: 'NOT_FOUND' };
    if (target.status !== 'APPROVED' && target.status !== 'PAID') {
      return { kind: 'NOT_CORRECTABLE', current: target.status };
    }
    if (input.payslip.kind === 'REVERSAL') {
      const existing = [...this.payslips.values()].some(
        (payslip) => payslip.kind === 'REVERSAL' && payslip.correctsId === input.correctsId,
      );
      if (existing) return { kind: 'ALREADY_REVERSED' };
    }

    const reversing = input.payslip.kind === 'REVERSAL';
    const payslip = this.materialize(
      input.runId,
      { ...input.payslip, correctsId: input.correctsId, correctionReason: input.reason },
      reversing ? { at: iso(input.at), actor: input.actor } : undefined,
    );

    if (reversing) {
      // CHI `status`. Moc duyet va moc da tra cua ban goc khong duoc dong vao — trigger
      // `TransportPayslip_posted_immutable` chan dung dieu do o duoi Postgres, va ban trong bo
      // nho phai giu cung mot bat bien, neu khong cac bai `*.service.spec.ts` se xanh trong khi
      // duong that do o DB.
      this.payslips.set(target.id, {
        ...target,
        status: 'REVERSED',
        updatedAt: iso(this.now()),
      });
    }
    return { kind: 'ISSUED', payslip };
  }
}
