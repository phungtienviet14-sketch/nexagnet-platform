import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { assertBusinessDate, toBusinessDate } from '../business-date.js';
import { TRANSPORT_CLOCK, TRANSPORT_CORE_POLICY } from '../transport-policy.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  evaluateCashout,
  evaluateCashoutReversal,
  reversalPlanOf,
  type CashoutLine,
} from './cashout-allocation.js';
import {
  TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
  type CashoutPostReason,
  type CashoutReverseReason,
} from './driver-settlement-decisions.js';
import { DriverSettlementReadService } from './driver-settlement-read.service.js';
import { DriverSettlementCoreFacts, DriverSettlementFundPort } from './driver-settlement.ports.js';
import {
  DriverSettlementRepository,
  type CashoutAllocationWriteInput,
} from './driver-settlement.repository.js';
import type { DriverCashoutDetail } from './driver-settlement.types.js';

export interface RecordCashoutCommand {
  readonly driverId: string;
  readonly businessDate?: string;
  readonly method: string;
  readonly reference?: string | null;
  readonly note?: string | null;
  readonly lines: readonly CashoutLine[];
  /** Khoa chong ghi trung do client dua vao. Khong co thi he thong tu sinh mot khoa duy nhat. */
  readonly correlationKey?: string;
}

/**
 * DUONG GHI cua `TX-07b` — mot lan lai xe nhan tien.
 *
 * ===========================================================================
 * THU TU HAI BUOC, va vi sao no la thu tu NAY:
 *
 *   1. ghi but toan quy hoan ung (neu co dong hoan ung);
 *   2. ghi chung tu chi + cac dong phan bo.
 *
 * Hai buoc khong nam trong mot giao dich, vi buoc 1 la lenh cua MOT capability khac va `TX-07b`
 * khong duoc cam vao kho cua no (§4.1 luat 4). Nen phai chon mot thu tu, va moi thu tu de lai mot
 * kieu hong khac khi tien trinh chet o giua:
 *
 *   · quy TRUOC      -> con lai mot but toan hoan ung khong co chung tu chi. So quy noi "da tra
 *                       roi", chung tu chi khong ton tai. LAN THU LAI dung khoa cu se DUNG LAI
 *                       chinh but toan do (`correlationKey` la `@unique`) roi ghi not chung tu —
 *                       TU LANH, va co mot dong `REIMBURSEMENT_FUND_ENTRY_REUSED` de doc.
 *   · chung tu TRUOC -> con lai mot chung tu chi noi da tra, trong khi so quy van noi cong ty CON
 *                       NO. Lan doi soat sau tra mot lan nua, va khong co gi trong he thong noi
 *                       len dieu do — no doc len y het mot khoan no binh thuong.
 *
 * Kieu hong thu nhat TU SUA duoc va nhin ra duoc; kieu thu hai lam mat tien va IM LANG. Nen thu tu
 * la quy truoc. Khoa but toan sinh TAT DINH tu khoa cua chung tu chi, de lan thu lai gap dung no.
 */
@Injectable()
export class DriverSettlementService {
  constructor(
    private readonly repository: DriverSettlementRepository,
    private readonly read: DriverSettlementReadService,
    private readonly core: DriverSettlementCoreFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly fund?: DriverSettlementFundPort,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async recordCashout(command: RecordCashoutCommand, actor: string): Promise<DriverCashoutDetail> {
    const businessDate = this.businessDate(command.businessDate);
    const method = command.method.trim();
    if (method.length === 0) {
      throw TransportDomainError.invalid(
        'CASHOUT_METHOD_BLANK',
        'Phai ghi hinh thuc chi — tien mat hay chuyen khoan',
      );
    }

    const driver = await this.core.findDriver(command.driverId);
    if (!driver) {
      this.denyPost('CASHOUT_DRIVER_UNKNOWN', command.driverId);
      throw TransportDomainError.notFound(
        'CASHOUT_DRIVER_NOT_FOUND',
        `Khong tim thay lai xe ${command.driverId}`,
      );
    }

    const correlationKey = command.correlationKey ?? `driver-cashout:${randomUUID()}`;
    const replay = await this.repository.findByCorrelation(correlationKey);
    if (replay) return this.assertSameCashout(replay, command, businessDate, method);

    const snapshot = await this.read.snapshotOf(driver.id);
    const decision = evaluateCashout(
      command.lines,
      snapshot.capacity,
      snapshot.capacity.currencyCode,
    );
    if (!decision.allowed) {
      this.denyPost(decision.reason, decision.subject ?? driver.id);
      throw TransportDomainError.invalid(
        decision.reason,
        `Lan chi khong hop le: ${decision.reason}`,
      );
    }

    if (decision.reimbursementTotal > 0 && !this.fund) {
      this.denyPost('CASHOUT_FUND_UNAVAILABLE', driver.id);
      throw TransportDomainError.denied(
        'CASHOUT_FUND_UNAVAILABLE',
        'Khong doc duoc so quy nen khong chi hoan ung duoc',
      );
    }

    const allocations: CashoutAllocationWriteInput[] = [];
    for (const line of command.lines) {
      if (line.source === 'WAGE') {
        allocations.push({
          source: 'WAGE',
          amount: line.amount,
          payslipId: line.payslipId,
          driverFundEntryId: null,
          note: line.note ?? null,
        });
        continue;
      }

      // BUOC 1 — xem chu thich dau lop ve thu tu.
      const fund = this.requireFund();
      const posted = await fund.postReimbursement(
        {
          driverId: driver.id,
          amount: line.amount,
          businessDate,
          correlationKey: `${correlationKey}:reimbursement`,
          note: line.note ?? null,
        },
        actor,
      );
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
        point: 'driver_settlement.reimbursement_post',
        outcome: 'allowed',
        reason: posted.replayed
          ? 'REIMBURSEMENT_FUND_ENTRY_REUSED'
          : 'REIMBURSEMENT_FUND_ENTRY_POSTED',
        detail: { driverId: driver.id, entryId: posted.entry.id },
      });

      allocations.push({
        source: 'REIMBURSEMENT',
        amount: line.amount,
        payslipId: null,
        driverFundEntryId: posted.entry.id,
        note: line.note ?? null,
      });
    }

    // BUOC 2.
    const outcome = await this.repository.record({
      driverId: driver.id,
      kind: 'ORIGINAL',
      businessDate,
      currencyCode: snapshot.capacity.currencyCode,
      method,
      reference: command.reference ?? null,
      reversesId: null,
      reversalReason: null,
      note: command.note ?? null,
      correlationKey,
      recordedBy: actor,
      at: this.now(),
      allocations,
    });

    if (outcome.kind === 'DUPLICATE_KEY') {
      return this.assertSameCashout(outcome.existing, command, businessDate, method);
    }
    if (outcome.kind !== 'RECORDED') {
      throw TransportDomainError.conflict(
        'CASHOUT_REPLAY_CONTENT_MISMATCH',
        `Khong ghi duoc lan chi: ${outcome.kind}`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.cashout_post',
      outcome: 'allowed',
      reason: 'CASHOUT_POSTED',
      detail: {
        driverId: driver.id,
        cashoutId: outcome.detail.cashout.id,
        wageLines: allocations.filter((row) => row.source === 'WAGE').length,
        reimbursementLines: allocations.filter((row) => row.source === 'REIMBURSEMENT').length,
      },
    });
    return outcome.detail;
  }

  /**
   * DAO mot lan chi — GHI THEM, khong sua.
   *
   * Dong hoan ung cua ban goc keo theo mot but toan quy DAO: neu khong, so quy se noi cong ty da
   * tra trong khi chung tu chi da bi huy — dung cai lech ma ca tranche nay ton tai de tranh.
   */
  async reverseCashout(id: string, reason: string, actor: string): Promise<DriverCashoutDetail> {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      throw TransportDomainError.invalid(
        'CASHOUT_REVERSAL_REASON_BLANK',
        'Phai ghi ly do dao mot lan chi',
      );
    }

    const target = await this.repository.find(id);
    if (!target) {
      this.denyReverse('CASHOUT_UNKNOWN', id);
      throw TransportDomainError.notFound('CASHOUT_NOT_FOUND', `Khong tim thay lan chi ${id}`);
    }

    const decision = evaluateCashoutReversal(target.cashout.kind, target.cashout.status);
    if (!decision.allowed) {
      this.denyReverse(decision.reason, id);
      throw TransportDomainError.conflict(
        decision.reason,
        `Khong dao duoc lan chi ${id}: ${decision.reason}`,
      );
    }

    const plan = reversalPlanOf(target.allocations);
    if (plan.reimbursement.length > 0 && !this.fund) {
      throw TransportDomainError.denied(
        'CASHOUT_FUND_UNAVAILABLE',
        'Khong doc duoc so quy nen khong dao duoc phan hoan ung',
      );
    }

    const allocations: CashoutAllocationWriteInput[] = plan.wage.map((line) => ({
      source: 'WAGE' as const,
      amount: line.amount,
      payslipId: line.payslipId,
      driverFundEntryId: null,
      note: null,
    }));

    for (const line of plan.reimbursement) {
      const reversed = await this.requireFund().reverseReimbursement(
        line.reversesFundEntryId,
        trimmed,
        actor,
      );
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
        point: 'driver_settlement.reimbursement_post',
        outcome: 'allowed',
        reason: 'REIMBURSEMENT_FUND_ENTRY_REVERSED',
        detail: { cashoutId: id, entryId: reversed.id },
      });
      allocations.push({
        source: 'REIMBURSEMENT',
        amount: line.amount,
        payslipId: null,
        driverFundEntryId: reversed.id,
        note: null,
      });
    }

    const outcome = await this.repository.record({
      driverId: target.cashout.driverId,
      kind: 'REVERSAL',
      businessDate: this.businessDate(),
      currencyCode: target.cashout.currencyCode,
      method: target.cashout.method,
      reference: target.cashout.reference,
      reversesId: target.cashout.id,
      reversalReason: trimmed,
      note: null,
      correlationKey: `${target.cashout.correlationKey}:reversal`,
      recordedBy: actor,
      at: this.now(),
      allocations,
    });

    if (outcome.kind === 'DUPLICATE_KEY') return outcome.existing;
    if (outcome.kind === 'ALREADY_REVERSED') {
      this.denyReverse('CASHOUT_ALREADY_REVERSED', id);
      throw TransportDomainError.conflict(
        'CASHOUT_ALREADY_REVERSED',
        `Lan chi ${id} da co mot phieu dao`,
      );
    }
    if (outcome.kind !== 'RECORDED') {
      throw TransportDomainError.notFound('CASHOUT_NOT_FOUND', `Khong tim thay lan chi ${id}`);
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.cashout_reverse',
      outcome: 'allowed',
      reason: 'CASHOUT_REVERSED',
      detail: { cashoutId: id, reversalId: outcome.detail.cashout.id },
    });
    return outcome.detail;
  }

  /**
   * MOT LAN GUI LAI phai mang CUNG noi dung.
   *
   * Tra ve ban cu khi noi dung da doi se lam ben goi tin rang con so MOI cua ho da duoc ghi. Bai
   * hoc T4R §5, va o day no dat hon: mot lan chi la tien mat da roi khoi cong ty.
   */
  private assertSameCashout(
    existing: DriverCashoutDetail,
    command: RecordCashoutCommand,
    businessDate: string,
    method: string,
  ): DriverCashoutDetail {
    const sameShape =
      existing.cashout.driverId === command.driverId &&
      existing.cashout.businessDate === businessDate &&
      existing.cashout.method === method &&
      existing.allocations.length === command.lines.length &&
      command.lines.every((line) =>
        existing.allocations.some(
          (allocation) =>
            allocation.source === line.source &&
            allocation.amount === line.amount &&
            allocation.payslipId === (line.payslipId ?? null),
        ),
      );

    if (!sameShape) {
      throw TransportDomainError.conflict(
        'CASHOUT_REPLAY_CONTENT_MISMATCH',
        'Cung khoa chong ghi trung nhung noi dung khac lan chi da ghi',
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.cashout_post',
      outcome: 'allowed',
      reason: 'CASHOUT_IDEMPOTENT_REPLAY',
      detail: { cashoutId: existing.cashout.id },
    });
    return existing;
  }

  /**
   * Cong so quy PHAI co mat o day.
   *
   * Duong goi da kiem `this.fund` truoc do va nem `CASHOUT_FUND_UNAVAILABLE` neu vang. Ham nay ton
   * tai de kieu doc duoc ma khong rai `!` khap noi — mot dau `!` la mot cho co the sai lang le sau
   * mot lan refactor.
   */
  private requireFund(): DriverSettlementFundPort {
    if (!this.fund) {
      throw TransportDomainError.denied(
        'CASHOUT_FUND_UNAVAILABLE',
        'Khong doc duoc so quy nen khong chi hoan ung duoc',
      );
    }
    return this.fund;
  }

  private denyPost(reason: CashoutPostReason, subject: string): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.cashout_post',
      outcome: 'denied',
      reason,
      detail: { subject },
    });
  }

  private denyReverse(reason: CashoutReverseReason, subject: string): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_DRIVER_SETTLEMENT_DECISIONS,
      point: 'driver_settlement.cashout_reverse',
      outcome: 'denied',
      reason,
      detail: { subject },
    });
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private businessDate(provided?: string): string {
    if (provided !== undefined) return assertBusinessDate(provided);
    return toBusinessDate(this.now(), this.corePolicy.timeZone);
  }
}
