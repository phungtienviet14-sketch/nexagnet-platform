import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import type { PayslipComponentDraft } from './payroll-calculator.js';
import {
  PAYSLIP_ONE_REVERSAL_PER_TARGET,
  isOverlappingPayrollPeriod,
} from './workforce-storage-conflict.js';
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
  PayrollPolicySnapshot,
  PayrollRun,
} from './workforce.types.js';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toPeriod = (row: any): PayrollPeriod => ({
  id: row.id,
  label: row.label,
  startDate: row.startDate,
  endDate: row.endDate,
  status: row.status,
  closedAt: iso(row.closedAt),
  closedBy: row.closedBy,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toRun = (row: any): PayrollRun => ({
  id: row.id,
  periodId: row.periodId,
  sequence: row.sequence,
  policySnapshot: row.policySnapshot as PayrollPolicySnapshot,
  policyVersion: row.policyVersion,
  missingInputs: row.missingInputs,
  runBy: row.runBy,
  runAt: row.runAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toPayslip = (row: any): Payslip => ({
  id: row.id,
  runId: row.runId,
  driverId: row.driverId,
  kind: row.kind,
  status: row.status,
  grossEarnings: fromStoredAmount(row.grossEarnings) ?? 0,
  totalDeductions: fromStoredAmount(row.totalDeductions) ?? 0,
  netAmount: fromStoredAmount(row.netAmount) ?? 0,
  currencyCode: row.currencyCode,
  driverFundBalanceSnapshot: fromStoredAmount(row.driverFundBalanceSnapshot),
  tripCount: row.tripCount,
  distanceKm: row.distanceKm,
  correctsId: row.correctsId,
  correctionReason: row.correctionReason,
  approvedAt: iso(row.approvedAt),
  approvedBy: row.approvedBy,
  paidAt: iso(row.paidAt),
  paidBy: row.paidBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toComponent = (row: any): PayslipComponent => ({
  id: row.id,
  payslipId: row.payslipId,
  kind: row.kind,
  source: row.source,
  label: row.label,
  amount: fromStoredAmount(row.amount) ?? 0,
  quantity: row.quantity,
  unitAmount: fromStoredAmount(row.unitAmount),
  recordedBy: row.recordedBy,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

const componentData = (draft: PayslipComponentDraft) => ({
  kind: draft.kind,
  source: draft.source,
  label: draft.label,
  amount: toStoredAmount(draft.amount),
  quantity: draft.quantity,
  unitAmount: toStoredAmount(draft.unitAmount),
  recordedBy: draft.recordedBy,
  note: draft.note,
});

const payslipData = (runId: string, input: PayslipWriteInput) => ({
  runId,
  driverId: input.driverId,
  kind: input.kind,
  grossEarnings: toStoredAmount(input.grossEarnings),
  totalDeductions: toStoredAmount(input.totalDeductions),
  netAmount: toStoredAmount(input.netAmount),
  driverFundBalanceSnapshot: toStoredAmount(input.driverFundBalanceSnapshot),
  tripCount: input.tripCount,
  distanceKm: input.distanceKm,
  correctsId: input.correctsId,
  correctionReason: input.correctionReason,
  components: { create: input.components.map(componentData) },
});

@Injectable()
export class PrismaWorkforceRepository extends WorkforceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `null` = ky moi chong lap mot ky da co.
   *
   * Dua vao EXCLUDE constraint `TransportPayrollPeriod_no_overlap` chu KHONG vao mot lan doc truoc
   * do: doc-roi-ghi la hai buoc, va hai nguoi mo ky cung luc se lot qua khe giua chung. Mot ky
   * chong lap khong phai loi trinh bay — no lam cung mot chuyen duoc tra cong hai lan.
   */
  async openPeriod(input: OpenPayrollPeriodInput): Promise<PayrollPeriod | null> {
    try {
      const row = await model(this.prisma, 'transportPayrollPeriod').create({
        data: {
          label: input.label,
          startDate: input.startDate,
          endDate: input.endDate,
          createdBy: input.createdBy,
        },
      });
      return toPeriod(row);
    } catch (error) {
      if (isOverlappingPayrollPeriod(error)) return null;
      throw error;
    }
  }

  async closePeriod(id: string, input: ClosePayrollPeriodInput): Promise<PayrollPeriod | null> {
    const updated = await model(this.prisma, 'transportPayrollPeriod').updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: input.closedAt, closedBy: input.closedBy },
    });
    if (updated.count === 0) return null;
    return this.findPeriod(id);
  }

  async findPeriod(id: string): Promise<PayrollPeriod | null> {
    const row = await model(this.prisma, 'transportPayrollPeriod').findUnique({ where: { id } });
    return row ? toPeriod(row) : null;
  }

  async listPeriods(): Promise<PayrollPeriod[]> {
    const rows = await model(this.prisma, 'transportPayrollPeriod').findMany({
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toPeriod);
  }

  /**
   * MOT lan chay = MOT giao dich.
   *
   * Buoc 0 la KHOA hang ky — cung giao thuc voi `PrismaFuelRepository.lockReconciliation()`. Khong
   * khoa thi hai nguoi bam "chay luong" cung luc se doc cung mot `sequence` va ghi hai lan chay
   * mang cung so thu tu; unique `(periodId, sequence)` chan duoc hang thu hai, nhung khi do mot
   * nua so phieu da ghi xong roi. Khoa truoc thi nguoi thu hai cho, doc `sequence` MOI, va ca hai
   * lan chay deu ton tai dung nhu nguoi dung mong doi.
   *
   * Phieu va cac dong cua no duoc ghi bang `create` long nhau, nen mot phieu khong bao gio ton tai
   * ma thieu dong giai thich no.
   */
  async recordRun(input: RecordPayrollRunInput): Promise<RecordPayrollRunOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      const locked =
        await scoped.$executeRaw`SELECT "id" FROM "TransportPayrollPeriod" WHERE "id" = ${input.periodId} FOR UPDATE`;
      if (locked === 0) return { kind: 'PERIOD_NOT_FOUND' as const };

      const period = await model(scoped, 'transportPayrollPeriod').findUnique({
        where: { id: input.periodId },
      });
      if (!period) return { kind: 'PERIOD_NOT_FOUND' as const };
      if (period.status === 'CLOSED') return { kind: 'PERIOD_CLOSED' as const };

      const previous = await model(scoped, 'transportPayrollRun').count({
        where: { periodId: input.periodId },
      });

      const runRow = await model(scoped, 'transportPayrollRun').create({
        data: {
          periodId: input.periodId,
          sequence: previous + 1,
          policySnapshot: input.policySnapshot,
          policyVersion: input.policyVersion,
          missingInputs: [...input.missingInputs],
          runBy: input.runBy,
        },
      });

      const payslips: Payslip[] = [];
      for (const payslip of input.payslips) {
        const row = await model(scoped, 'transportPayslip').create({
          data: payslipData(runRow.id, payslip),
        });
        payslips.push(toPayslip(row));
      }

      return { kind: 'RECORDED' as const, run: toRun(runRow), payslips };
    });
  }

  async findRun(id: string): Promise<PayrollRun | null> {
    const row = await model(this.prisma, 'transportPayrollRun').findUnique({ where: { id } });
    return row ? toRun(row) : null;
  }

  async listRuns(periodId: string): Promise<PayrollRun[]> {
    const rows = await model(this.prisma, 'transportPayrollRun').findMany({
      where: { periodId },
      orderBy: [{ sequence: 'asc' }],
    });
    return rows.map(toRun);
  }

  private detailOf(
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    row: any,
  ): PayslipDetail {
    return {
      payslip: toPayslip(row),
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      components: (row.components ?? []).map((component: any) => toComponent(component)),
    };
  }

  async findPayslip(id: string): Promise<PayslipDetail | null> {
    const row = await model(this.prisma, 'transportPayslip').findUnique({
      where: { id },
      include: { components: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? this.detailOf(row) : null;
  }

  async listPayslips(runId: string): Promise<PayslipDetail[]> {
    const rows = await model(this.prisma, 'transportPayslip').findMany({
      where: { runId },
      include: { components: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return rows.map((row: any) => this.detailOf(row));
  }

  async listPayslipsByDriver(driverId: string): Promise<PayslipDetail[]> {
    const rows = await model(this.prisma, 'transportPayslip').findMany({
      where: { driverId },
      include: { components: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return rows.map((row: any) => this.detailOf(row));
  }

  /**
   * Dieu kien `from` nam TRONG lenh ghi (`where: { id, status: from }`), khong o mot lan doc truoc
   * do — cung khuon `setEntryVerification` cua T4. Do la thu duy nhat dung khi hai nguoi cung bam
   * "duyet" tren mot phieu.
   *
   * Trigger `TransportPayslip_posted_immutable` duoi DB la lop thu hai, va no bao ve mot thu khac:
   * khong phai hai nguoi bam cung luc, ma MOT nguoi sua noi dung mot phieu da chot.
   */
  async transitionPayslip(
    id: string,
    from: PayslipStatus,
    input: TransitionPayslipInput,
  ): Promise<TransitionPayslipOutcome> {
    const updated = await model(this.prisma, 'transportPayslip').updateMany({
      where: { id, status: from },
      data: {
        status: input.to,
        ...(input.to === 'APPROVED' ? { approvedAt: input.at, approvedBy: input.actor } : {}),
        ...(input.to === 'PAID' ? { paidAt: input.at, paidBy: input.actor } : {}),
      },
    });
    if (updated.count === 1) {
      const row = await model(this.prisma, 'transportPayslip').findUnique({ where: { id } });
      return { kind: 'MOVED', payslip: toPayslip(row) };
    }
    const current = await model(this.prisma, 'transportPayslip').findUnique({ where: { id } });
    if (!current) return { kind: 'NOT_FOUND' };
    return { kind: 'REJECTED', current: current.status };
  }

  /**
   * Phat mot phieu bu — GHI THEM, khong bao gio ghi de (`INV-20`, acceptance 12).
   *
   * Ban goc chi doi DUNG MOT truong khi bi dao: `status` sang `REVERSED`. Moi con so tren no giu
   * nguyen, va trigger `TransportPayslip_posted_immutable` cho phep dung canh do — no chan sua noi
   * dung, khong chan chuyen trang thai tien len.
   */
  async issueCorrection(input: IssueCorrectionInput): Promise<IssueCorrectionOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      const locked =
        await scoped.$executeRaw`SELECT "id" FROM "TransportPayslip" WHERE "id" = ${input.correctsId} FOR UPDATE`;
      if (locked === 0) return { kind: 'NOT_FOUND' as const };

      const target = await model(scoped, 'transportPayslip').findUnique({
        where: { id: input.correctsId },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };
      if (target.status !== 'APPROVED' && target.status !== 'PAID') {
        return { kind: 'NOT_CORRECTABLE' as const, current: target.status };
      }

      const reversing = input.payslip.kind === 'REVERSAL';

      try {
        const row = await model(scoped, 'transportPayslip').create({
          data: {
            ...payslipData(input.runId, input.payslip),
            correctsId: input.correctsId,
            correctionReason: input.reason,
          },
        });

        if (!reversing) return { kind: 'ISSUED' as const, payslip: toPayslip(row) };

        /**
         * BAN DAO RA DOI DA CHOT — nhung phai chot o BUOC THU HAI, khong o `INSERT`.
         *
         * `TransportPayslip_component_frozen` cam them dong vao mot phieu da chot, va cac dong
         * cua ban dao duoc ghi long trong chinh lenh `create` o tren. Sinh thang ra `APPROVED`
         * thi trigger do chan lai cac dong cua no — dung, va la mot phep thu that: bat bien
         * "phieu da chot khong nhan them dong" khong duoc ha xuong cho rieng ban dao.
         *
         * Nen thu tu la: ghi ban nhap kem cac dong -> chot no -> dao ban goc. CA BA nam trong
         * CUNG mot giao dich, nen trang thai `DRAFT` o giua khong bao gio doc duoc tu ben ngoai:
         * mot phien khac hoac thay chua co ban dao nao, hoac thay mot ban dao DA CHOT.
         *
         * `TransportPayslip_posted_fields` doi `approvedAt` + `approvedBy` di kem `APPROVED`,
         * nen ba truong nay luon duoc ghi cung nhau.
         */
        const posted = await model(scoped, 'transportPayslip').update({
          where: { id: row.id },
          data: { status: 'APPROVED', approvedAt: input.at, approvedBy: input.actor },
        });

        await model(scoped, 'transportPayslip').update({
          where: { id: input.correctsId },
          data: { status: 'REVERSED' },
        });

        return { kind: 'ISSUED' as const, payslip: toPayslip(posted) };
      } catch (error) {
        if (isUniqueViolationOn(error, PAYSLIP_ONE_REVERSAL_PER_TARGET)) {
          return { kind: 'ALREADY_REVERSED' as const };
        }
        throw error;
      }
    });
  }
}
