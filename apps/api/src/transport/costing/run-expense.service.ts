import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { decisionReasonLabel } from '../../observability/decision-vocabulary.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_COSTING_DECISIONS,
  type DriverFundRunExpenseReason,
} from './costing-decisions.js';
import {
  mapLedgerError,
  requireDriverFacts,
  requireNonNegativeAmount,
  resolveCostingBusinessDate,
} from './costing-guards.js';
import {
  fundEntryIdentity,
  fundEntryIdentityOf,
  isSameFundEntry,
  type FundEntryIdentity,
} from './costing-replay.js';
import { CostingRunContextFacts } from './costing-run-context.port.js';
import { CostingRepository, FundPeriodFrozenError } from './costing.repository.js';
import type { DriverFundEntry, DriverFundPeriod } from './costing.types.js';
import { assertLedgerSign, signedAmountFor } from './driver-fund-ledger.js';
import { TransportCoreFacts } from './transport-core-facts.port.js';

/**
 * MOT KHOAN CHI RUN-FIRST lai xe tra bang tien cua quy — `#369` R-4.
 *
 * `correlationKey` BAT BUOC va phai TAT DINH tu su kien nguon (vd `fuel:<id>`), khong phai mot khoa
 * ngau nhien: day la thu duy nhat bien "lan gui lai" va "hai lan duyet song song" thanh CUNG mot but
 * toan. Mot khoa ngau nhien moi lan goi se tru quy lai xe moi lan goi.
 */
export interface RecordRunExpenseCommand {
  readonly driverId: string;
  readonly runId: string;
  /** Chang cua CHINH `runId`. Bo trong = khoan chi o muc vong chay. */
  readonly legId?: string | null;
  /** DO LON, khong am. Dau do `driver-fund-ledger.ts` quyet (`RUN_EXPENSE` luon AM). */
  readonly amount: number;
  readonly businessDate?: string;
  readonly note?: string | null;
  readonly correlationKey: string;
}

export interface RunExpensePosting {
  readonly entry: DriverFundEntry;
  /** `true` = khoa da thuoc CHINH su kien nay — khong co dong tien thu hai nao duoc sinh ra. */
  readonly replayed: boolean;
}

/**
 * DUONG GHI QUY LAI XE CHO KHOAN CHI RUN-FIRST — `#369` R-4. KHONG can chuyen v1, KHONG ghi gia thanh.
 *
 * ===========================================================================
 * MOT CHAN, KHONG PHAI HAI
 *
 * `recordTripExpense` ghi HAI chan cung khoa (`INV-03`): dong gia thanh `TripExpense` + but toan quy
 * `TRIP_EXPENSE`. Duong nay ghi DUNG MOT: but toan quy `RUN_EXPENSE`. Chan gia thanh cua khoan chi
 * Run-first thuoc so cai Run-first CUA NGUON (nhien lieu: `TransportFuelCostAttribution`, ke toan quyet
 * sau, chia duoc cho nhieu chang). Ghi them mot dong gia thanh o day se lam cung mot khoan tien nam o
 * hai so cai gia thanh — dung dieu `#364` §3 da dong lai o tang CSDL.
 *
 * TAI SU DUNG DUOC cho moi khoan Run-first tuong lai (phi duong, gui xe, sua doc duong tren vong chay):
 * cong nay khong biet gi ve nhien lieu. Nguon nao cung chi can mot vong chay, mot lai xe, mot so tien
 * va mot khoa tat dinh cua su kien cua no.
 *
 * ===========================================================================
 * NAM CONG, THEO DUNG THU TU, moi cong mot ma
 *
 *   1. vong chay co that                        -> `RUN_EXPENSE_RUN_NOT_FOUND` (404)
 *   2. chang (neu co) thuoc CHINH vong chay do  -> `RUN_EXPENSE_LEG_NOT_IN_RUN`
 *   3. lai xe TUNG duoc phan cong vao vong chay -> `RUN_EXPENSE_DRIVER_NOT_ASSIGNED`
 *   4. khoa chua thuoc su kien nao khac, o CA HAI bang cua `TX-03` -> `RUN_EXPENSE_KEY_REUSED` (409)
 *      — ca bon cong deu TRUOC `ensureAccount()`: lenh bi tu choi khong de lai mot so quy moi tinh
 *   5. ky quy KHONG dong bang — kiem BEN TRONG giao dich ghi, sau khoa so quy (`INV-22`)
 *                                               -> `RUN_EXPENSE_PERIOD_FROZEN`
 *
 * ===========================================================================
 * HAI LAN GHI CUNG KHOA CHAY SONG SONG — HOI TU, khong 409, khong dong thu hai
 *
 * Ca hai doc "chua co" roi cung vao `post()`. Khoa so quy (`FOR UPDATE`) xep hang chung; ben sau dam
 * unique `correlationKey` va nhan `CORRELATION_KEY_REUSED`. Ben do DOC LAI: cung noi dung thi tra ve
 * but toan cua ben truoc (`replayed: true`) — mot lan duyet phieu bam hai lan khong phai mot loi cua ai.
 */
@Injectable()
export class RunExpenseService {
  constructor(
    private readonly ledger: CostingRepository,
    private readonly core: TransportCoreFacts,
    private readonly runs: CostingRunContextFacts,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  async recordRunExpense(
    command: RecordRunExpenseCommand,
    actor: string,
  ): Promise<RunExpensePosting> {
    const businessDate = resolveCostingBusinessDate(
      command.businessDate,
      this.now(),
      this.corePolicy.timeZone,
    );
    const magnitude = requireNonNegativeAmount(command.amount);
    // `assertLedgerSign` chan ca so 0: mot khoan chi 0 dong khong noi gi, va `CHECK` cung tu choi no.
    const signedAmount = mapLedgerError(
      () =>
        assertLedgerSign('RUN_EXPENSE', signedAmountFor('RUN_EXPENSE', magnitude).amount).amount,
    );
    await requireDriverFacts(this.core, command.driverId);

    const run = await this.runs.findRun(command.runId);
    if (!run) this.deny('RUN_EXPENSE_RUN_NOT_FOUND', { runId: command.runId });

    const legId = command.legId ?? null;
    if (legId !== null) {
      const leg = await this.runs.findLeg(legId);
      if (!leg || leg.runId !== run.id) {
        this.deny('RUN_EXPENSE_LEG_NOT_IN_RUN', { runId: run.id, legId });
      }
    }

    if (!(await this.runs.wasDriverEverAssignedToRun(run.id, command.driverId))) {
      this.deny('RUN_EXPENSE_DRIVER_NOT_ASSIGNED', { runId: run.id, driverId: command.driverId });
    }

    const incoming = (accountId: string): FundEntryIdentity =>
      fundEntryIdentity({
        accountId,
        kind: 'RUN_EXPENSE',
        signedAmount,
        businessDate,
        tripId: null,
        runId: run.id,
        legId,
        note: command.note ?? null,
      });

    // PHAT LAI truoc `ensureAccount()`: mot lenh bi tu choi vi khoa da thuoc su kien khac cung khong
    // duoc de lai mot so quy moi tinh.
    const replay = await this.replayOf(command.correlationKey, command.driverId, incoming);
    if (replay) return { entry: replay, replayed: true };

    const account = await this.ledger.ensureAccount(command.driverId, this.now());
    let entry: DriverFundEntry | null;
    try {
      entry = (
        await this.ledger.post({
          correlationKey: command.correlationKey,
          at: this.now(),
          periodGuard: { accountId: account.id, businessDate },
          entry: {
            accountId: account.id,
            kind: 'RUN_EXPENSE',
            signedAmount,
            businessDate,
            tripId: null,
            runId: run.id,
            legId,
            note: command.note ?? null,
            recordedBy: actor,
          },
        })
      ).entry;
    } catch (error) {
      if (error instanceof FundPeriodFrozenError) this.denyFrozen(error.period, run.id);
      if (!isCorrelationConflict(error)) throw error;
      // Lan ghi SONG SONG cung khoa vua thang. Doc lai: cung noi dung -> tra ve CHINH but toan do.
      const converged = await this.replayOf(command.correlationKey, command.driverId, incoming);
      if (!converged) throw error;
      return { entry: converged, replayed: true };
    }
    if (!entry) throw new Error('Kho khong tra ve but toan vua ghi');

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.run_expense',
      outcome: 'allowed',
      reason: 'RUN_EXPENSE_RECORDED',
      detail: {
        entryId: entry.id,
        runId: entry.runId,
        legId: entry.legId,
        businessDate,
        correlationKey: command.correlationKey,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.costing.driver_fund.run_expense',
      entityType: 'TransportDriverFundEntry',
      entityId: entry.id,
      after: entry,
    });
    return { entry, replayed: false };
  }

  /**
   * `null` khi khoa chua duoc dung; but toan cu khi CUNG noi dung; NEM khi khoa thuoc mot su kien KHAC.
   *
   * Hoi CA dong gia thanh chuyen: mot khoa da dung cho mot `TripExpense` la mot su kien DA vao `TX-03`
   * (vd phieu dau chuyen v1 tra bang cong no — chi co chan gia thanh, khong co but toan quy). Ghi them
   * mot but toan quy cung khoa se cho cung mot su kien hai duong vao so cai.
   */
  private async replayOf(
    correlationKey: string,
    driverId: string,
    incoming: (accountId: string) => FundEntryIdentity,
  ): Promise<DriverFundEntry | null> {
    const [existing, expense] = await Promise.all([
      this.ledger.findEntryByCorrelation(correlationKey),
      this.ledger.findExpenseByCorrelation(correlationKey),
    ]);
    if (!existing && !expense) return null;

    // So quy CUA CHINH lai xe nay — doc, khong tao. Khong co so quy ma khoa da co but toan nghia la
    // but toan do nam o so quy cua NGUOI KHAC: mot su kien khac, khong phai lan gui lai.
    const account = existing ? await this.ledger.findAccountByDriver(driverId) : null;
    const isSameEvent =
      existing !== null &&
      account !== null &&
      isSameFundEntry(fundEntryIdentityOf(existing), incoming(account.id));

    if (expense || !existing || !isSameEvent) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'driver_fund.run_expense',
        outcome: 'denied',
        reason: 'RUN_EXPENSE_KEY_REUSED',
        detail: {
          correlationKey,
          entryId: existing?.id ?? null,
          expenseId: expense?.id ?? null,
        },
      });
      throw TransportDomainError.conflict(
        'CORRELATION_KEY_REUSED',
        `Khoa chong ghi trung ${correlationKey} da duoc dung cho mot su kien khac`,
      );
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.run_expense',
      outcome: 'allowed',
      reason: 'RUN_EXPENSE_IDEMPOTENT_REPLAY',
      detail: { correlationKey, entryId: existing.id },
    });
    return existing;
  }

  private deny(
    reason: Exclude<
      DriverFundRunExpenseReason,
      | 'RUN_EXPENSE_RECORDED'
      | 'RUN_EXPENSE_IDEMPOTENT_REPLAY'
      | 'RUN_EXPENSE_KEY_REUSED'
      | 'RUN_EXPENSE_PERIOD_FROZEN'
    >,
    detail: Readonly<Record<string, unknown>>,
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.run_expense',
      outcome: 'denied',
      reason,
      detail,
    });
    const message = decisionReasonLabel(reason);
    throw reason === 'RUN_EXPENSE_RUN_NOT_FOUND'
      ? TransportDomainError.notFound(reason, message)
      : TransportDomainError.denied(reason, message);
  }

  private denyFrozen(period: DriverFundPeriod, runId: string): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.run_expense',
      outcome: 'denied',
      reason: 'RUN_EXPENSE_PERIOD_FROZEN',
      detail: {
        accountId: period.accountId,
        periodId: period.id,
        periodStatus: period.status,
        runId,
      },
    });
    throw TransportDomainError.denied(
      'RUN_EXPENSE_PERIOD_FROZEN',
      `Ngay nghiep vu thuoc ky quy ${period.id} dang ${period.status} — khong ghi vao ky da chot`,
    );
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }
}

/** Unique `correlationKey` vua bi dam — hai kho deu dich loi do sang ma nay. */
const isCorrelationConflict = (error: unknown): boolean =>
  error instanceof TransportDomainError && error.reason === 'CORRELATION_KEY_REUSED';
