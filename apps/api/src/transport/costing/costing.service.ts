import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_COSTING_DECISIONS } from './costing-decisions.js';
import {
  mapLedgerError,
  requireDriverFacts,
  requireNonNegativeAmount,
  requireTripFacts,
  resolveCostingBusinessDate,
} from './costing-guards.js';
import {
  TRANSPORT_COSTING_POLICY,
  type TransportCostingPolicy,
} from './costing-policy.js';
import { CostingRepository, type CorrelatedPosting } from './costing.repository.js';
import type { DriverFundEntry, TripExpense } from './costing.types.js';
import {
  assertExpenseSign,
  assertLedgerSign,
  signedAmountFor,
  type DriverFundEntryKind,
  type ExpenseFundingSource,
  type PostableFundEntryKind,
} from './driver-fund-ledger.js';
import { isFrozenFundPeriod } from './fund-period.js';
import { TransportCoreFacts, type TripFacts } from './transport-core-facts.port.js';

export interface PostFundMovementInput {
  readonly driverId: string;
  /** DO LON, luon khong am. Dau do `driver-fund-ledger.ts` quyet, khong phai nguoi goi. */
  readonly amount: number;
  readonly businessDate?: string;
  readonly tripId?: string | null;
  readonly note?: string | null;
  /** Khoa chong ghi trung do client dua vao. Khong co thi he thong tu sinh mot khoa duy nhat. */
  readonly correlationKey?: string;
}

/** Dieu chinh kiem ke mang so CO DAU: no la duong duy nhat co the di ca hai chieu. */
export interface AdjustFundInput extends Omit<PostFundMovementInput, 'amount'> {
  readonly signedAmount: number;
}

export interface RecordTripExpenseCommand {
  readonly tripId: string;
  readonly categoryCode: string;
  readonly amount: number;
  readonly fundedBy: ExpenseFundingSource;
  readonly driverId?: string | null;
  readonly businessDate?: string;
  readonly evidenceLocator?: string | null;
  readonly note?: string | null;
  readonly correlationKey?: string;
}

/**
 * `TX-03 Costing + Driver Fund`.
 *
 * Service la noi DUY NHAT quyet dinh dau, ky va duong dao. Kho chi ghi cai da duoc quyet o day —
 * no khong tu suy luan gi, va khong controller nao duoc goi thang vao no.
 *
 * BA DIEU KHONG DUOC PHEP LAM O BAT CU DAU trong tep nay, ke ca khi tien:
 *   1. `UPDATE`/`DELETE` mot but toan hay mot khoan chi da ghi (`INV-20`) — kho khong co ham do;
 *   2. ghi thang vao bang cua `transport-core` — `TransportCoreFacts` khong co ham ghi (§4.1 luat 4);
 *   3. cong so du quy voi gia thanh chuyen vao mot tong (`INV-23`) — hai con so, hai khung nhin.
 */
@Injectable()
export class CostingService {
  constructor(
    private readonly ledger: CostingRepository,
    private readonly core: TransportCoreFacts,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Inject(TRANSPORT_COSTING_POLICY) private readonly policy: TransportCostingPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
  ) {}

  /* ----------------------- So quy: tien vao/ra ----------------------- */

  /**
   * TAM UNG — `FUND-002`: `tripId` co the NULL va do la duong chay thuong ngay, khong phai ngoai le.
   *
   * `INV-10`/VT-085: khong co buoc cho duyet trong ban demo nay. Do la mot LUA CHON DA GHI TEN o
   * `costing-policy.ts`, va mot goi khach bat duyet len se lam he thong chet luc boot thay vi lang
   * le bo qua cai khoa ma khach vua yeu cau.
   */
  postAdvance(input: PostFundMovementInput, actor: string): Promise<DriverFundEntry> {
    return this.postMovement('ADVANCE', input, actor);
  }

  /** HOAN TRA tien mat con thua. */
  postReturn(input: PostFundMovementInput, actor: string): Promise<DriverFundEntry> {
    return this.postMovement('RETURN', input, actor);
  }

  /** DIEU CHINH kiem ke. KHONG dung de sua mot but toan cu — duong do la dao. */
  async postAdjustment(input: AdjustFundInput, actor: string): Promise<DriverFundEntry> {
    const signedAmount = this.requireLedgerSign('ADJUSTMENT', input.signedAmount);
    return this.postEntryOnly('ADJUSTMENT', { ...input, signedAmount }, actor);
  }

  private async postMovement(
    kind: PostableFundEntryKind,
    input: PostFundMovementInput,
    actor: string,
  ): Promise<DriverFundEntry> {
    const signedAmount = this.requireMagnitude(kind, input.amount);
    return this.postEntryOnly(kind, { ...input, signedAmount }, actor);
  }

  private async postEntryOnly(
    kind: DriverFundEntryKind,
    input: Omit<AdjustFundInput, 'signedAmount'> & { signedAmount: number },
    actor: string,
  ): Promise<DriverFundEntry> {
    const businessDate = this.businessDate(input.businessDate);
    await requireDriverFacts(this.core, input.driverId);
    if (input.tripId) await requireTripFacts(this.core, input.tripId);

    const account = await this.ledger.ensureAccount(input.driverId, this.now());
    const correlationKey = input.correlationKey ?? this.newCorrelationKey();

    const replay = await this.ledger.findEntryByCorrelation(correlationKey);
    if (replay) {
      this.assertSameEntry(replay, { kind, signedAmount: input.signedAmount, businessDate });
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'driver_fund.post_entry',
        outcome: 'allowed',
        reason: 'FUND_ENTRY_IDEMPOTENT_REPLAY',
        detail: { correlationKey, entryId: replay.id },
      });
      return replay;
    }

    await this.requireWritablePeriod(account.id, businessDate, 'driver_fund.post_entry');

    const posted = await this.ledger.post({
      correlationKey,
      at: this.now(),
      entry: {
        accountId: account.id,
        kind,
        signedAmount: input.signedAmount,
        businessDate,
        tripId: input.tripId ?? null,
        note: input.note ?? null,
        recordedBy: actor,
      },
    });
    const entry = posted.entry;
    if (!entry) throw new Error('Kho khong tra ve but toan vua ghi');

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver_fund.post_entry',
      outcome: 'allowed',
      reason: 'FUND_ENTRY_POSTED',
      detail: { entryId: entry.id, kind, businessDate, tripId: entry.tripId },
    });
    await this.audit.append({
      actor,
      action: 'transport.costing.driver_fund.post',
      entityType: 'TransportDriverFundEntry',
      entityId: entry.id,
      after: entry,
    });
    return entry;
  }

  /* --------------------- Gia thanh chuyen --------------------- */

  /**
   * GHI MOT KHOAN CHI cho chuyen — hai lop hay mot lop, tuy nguon tien (`INV-03`, T1 §9.2).
   *
   * `DRIVER_FUND`   -> MOT but toan quy AM + MOT dong gia thanh DUONG, cung khoa, cung giao dich.
   * `COMPANY_DIRECT`-> chi mot dong gia thanh. Khong but toan quy nao (tien khong di qua tay lai xe).
   *
   * Hai lop KHONG BAO GIO duoc cong vao mot tong. Chung doi soat duoc voi nhau; cong lai la dem
   * mot khoan tien hai lan.
   */
  async recordTripExpense(
    command: RecordTripExpenseCommand,
    actor: string,
  ): Promise<CorrelatedPosting> {
    const businessDate = this.businessDate(command.businessDate);
    const trip = await requireTripFacts(this.core, command.tripId);
    this.requireCategory(command.categoryCode);
    const magnitude = requireNonNegativeAmount(command.amount);

    this.guardTripAcceptsExpense(trip, command.fundedBy);

    const fromFund = command.fundedBy === 'DRIVER_FUND';
    const driverId = fromFund ? this.requireDriverIdForFund(command.driverId) : null;
    if (driverId) await requireDriverFacts(this.core, driverId);
    const account = driverId ? await this.ledger.ensureAccount(driverId, this.now()) : null;

    const correlationKey = command.correlationKey ?? this.newCorrelationKey();
    const replay = await this.ledger.findExpenseByCorrelation(correlationKey);
    if (replay) {
      this.assertSameExpense(replay, {
        tripId: command.tripId,
        signedAmount: magnitude,
        businessDate,
        fundedBy: command.fundedBy,
        categoryCode: command.categoryCode,
      });
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'trip_expense.record',
        outcome: 'allowed',
        reason: 'EXPENSE_IDEMPOTENT_REPLAY',
        detail: { correlationKey, expenseId: replay.id },
      });
      return { entry: await this.ledger.findEntryByCorrelation(correlationKey), expense: replay };
    }

    if (account) {
      await this.requireWritablePeriod(account.id, businessDate, 'trip_expense.record');
    }

    const posted = await this.ledger.post({
      correlationKey,
      at: this.now(),
      ...(account
        ? {
            entry: {
              accountId: account.id,
              kind: 'TRIP_EXPENSE' as const,
              signedAmount: signedAmountFor('TRIP_EXPENSE', magnitude).amount,
              businessDate,
              tripId: command.tripId,
              note: command.note ?? null,
              recordedBy: actor,
            },
          }
        : {}),
      expense: {
        tripId: command.tripId,
        kind: 'EXPENSE' as const,
        categoryCode: command.categoryCode,
        signedAmount: assertExpenseSign('EXPENSE', magnitude).amount,
        businessDate,
        fundedBy: command.fundedBy,
        driverId,
        evidenceLocator: command.evidenceLocator ?? null,
        note: command.note ?? null,
        recordedBy: actor,
      },
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'trip_expense.record',
      outcome: 'allowed',
      reason: 'EXPENSE_RECORDED',
      detail: {
        tripId: command.tripId,
        expenseId: posted.expense?.id ?? null,
        fundEntryId: posted.entry?.id ?? null,
        fundedBy: command.fundedBy,
        correlationKey,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.costing.expense.record',
      entityType: 'TransportTripExpense',
      entityId: posted.expense?.id ?? null,
      after: posted,
    });
    return posted;
  }

  /* ------------------------------ Dao ------------------------------ */

  /**
   * DAO mot SU KIEN KINH TE, khong phai mot DONG.
   *
   * Nguoi dung bam "huy khoan chi" tren mot dong gia thanh, nhung thu phai bien mat la CA HAI chan
   * cua su kien do (`INV-03`). Neu chi dao mot chan thi so du quy va gia thanh chuyen se lech nhau
   * dung bang so tien do, va khong co gi bao ca. Nen ca hai duong vao — dao tu khoan chi hay dao tu
   * but toan — deu quy ve DUNG mot ham nay, dao theo KHOA cua su kien.
   *
   * NGAY NGHIEP VU cua but toan dao = ngay cua ban GOC (`DEMO_ASSUMPTION` DA-T3-02). Nho vay so cai
   * net ve 0 ngay trong ky da phat sinh. Neu ky do da dong thi lenh nay BI TU CHOI voi ly do
   * `REVERSAL_PERIOD_FROZEN` — CHU KHONG lang le day but toan sang ky hien tai. `INV-22` cam dung
   * viec do: "khong bao gio ghi lang le vao ky da chot". Duong hop le la mo lai ky co quyen rieng.
   */
  async reverseExpense(expenseId: string, reason: string, actor: string): Promise<CorrelatedPosting> {
    const expense = await this.ledger.findExpense(expenseId);
    if (!expense) {
      throw TransportDomainError.notFound(
        'TRIP_EXPENSE_NOT_FOUND',
        `Khong tim thay khoan chi ${expenseId}`,
      );
    }
    return this.reverseCorrelation(expense.correlationKey, reason, actor);
  }

  async reverseFundEntry(entryId: string, reason: string, actor: string): Promise<CorrelatedPosting> {
    const entry = await this.ledger.findEntry(entryId);
    if (!entry) {
      throw TransportDomainError.notFound(
        'FUND_ENTRY_NOT_FOUND',
        `Khong tim thay but toan ${entryId}`,
      );
    }
    return this.reverseCorrelation(entry.correlationKey, reason, actor);
  }

  private async reverseCorrelation(
    correlationKey: string,
    reason: string,
    actor: string,
  ): Promise<CorrelatedPosting> {
    const entry = await this.ledger.findEntryByCorrelation(correlationKey);
    const expense = await this.ledger.findExpenseByCorrelation(correlationKey);
    if (!entry && !expense) {
      throw TransportDomainError.notFound(
        'FUND_ENTRY_NOT_FOUND',
        `Khong tim thay su kien ${correlationKey}`,
      );
    }

    if (entry?.kind === 'REVERSAL' || expense?.kind === 'REVERSAL') {
      this.denyReversal('REVERSAL_OF_REVERSAL_DENIED', correlationKey);
    }

    const already =
      (entry ? await this.ledger.findReversalOfEntry(entry.id) : null) ??
      (expense ? await this.ledger.findReversalOfExpense(expense.id) : null);
    if (already) this.denyReversal('REVERSAL_ALREADY_REVERSED', correlationKey);

    const businessDate = (entry ?? expense)!.businessDate;
    if (entry) {
      await this.requireWritablePeriod(entry.accountId, businessDate, 'costing.reversal');
    }

    // Khoa TAT DINH: dao lai lan hai gap dung unique cua khoa nay va thanh mot lan phat lai vo hai,
    // thay vi ghi them mot but toan dao thu hai.
    const posted = await this.ledger.post({
      correlationKey: `${correlationKey}:reversal`,
      at: this.now(),
      ...(entry
        ? {
            entry: {
              accountId: entry.accountId,
              kind: 'REVERSAL' as const,
              signedAmount: assertLedgerSign('REVERSAL', -entry.signedAmount).amount,
              businessDate: entry.businessDate,
              tripId: entry.tripId,
              reversalOfId: entry.id,
              note: reason,
              recordedBy: actor,
            },
          }
        : {}),
      ...(expense
        ? {
            expense: {
              tripId: expense.tripId,
              kind: 'REVERSAL' as const,
              categoryCode: expense.categoryCode,
              signedAmount: assertExpenseSign('REVERSAL', -expense.signedAmount).amount,
              businessDate: expense.businessDate,
              fundedBy: expense.fundedBy,
              driverId: expense.driverId,
              reversalOfId: expense.id,
              note: reason,
              recordedBy: actor,
            },
          }
        : {}),
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'costing.reversal',
      outcome: 'allowed',
      reason: 'REVERSAL_POSTED',
      detail: {
        correlationKey,
        reversedEntryId: entry?.id ?? null,
        reversedExpenseId: expense?.id ?? null,
      },
    });
    await this.audit.append({
      actor,
      action: 'transport.costing.reversal',
      entityType: 'TransportCostingCorrelation',
      entityId: correlationKey,
      before: { entry, expense },
      after: posted,
    });
    return posted;
  }

  private denyReversal(
    reason: 'REVERSAL_ALREADY_REVERSED' | 'REVERSAL_OF_REVERSAL_DENIED',
    correlationKey: string,
  ): never {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'costing.reversal',
      outcome: 'denied',
      reason,
      detail: { correlationKey },
    });
    const message =
      reason === 'REVERSAL_ALREADY_REVERSED'
        ? `Su kien ${correlationKey} da duoc dao truoc do`
        : `Khong dao mot but toan dao (${correlationKey}) — dung but toan dieu chinh`;
    throw reason === 'REVERSAL_ALREADY_REVERSED'
      ? TransportDomainError.conflict('ENTRY_ALREADY_REVERSED', message)
      : TransportDomainError.denied(reason, message);
  }

  /* ------------------------------ Noi bo ------------------------------ */

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private businessDate(provided?: string): string {
    return resolveCostingBusinessDate(provided, this.now(), this.corePolicy.timeZone);
  }

  /** Khoa chong ghi trung tu sinh khi client khong dua. `randomUUID` du duy nhat cho viec nay. */
  private newCorrelationKey(): string {
    return globalThis.crypto.randomUUID();
  }

  private requireMagnitude(kind: DriverFundEntryKind, amount: number): number {
    return mapLedgerError(() => signedAmountFor(kind, amount).amount);
  }

  private requireLedgerSign(kind: DriverFundEntryKind, signedAmount: number): number {
    return mapLedgerError(() => assertLedgerSign(kind, signedAmount).amount);
  }

  /** Danh muc RONG = khong gioi han. Xem `costing-policy.ts` ve vi sao mac dinh la rong. */
  private requireCategory(categoryCode: string): void {
    const allowed = this.policy.expenseCategories;
    if (allowed.length > 0 && !allowed.includes(categoryCode)) {
      throw TransportDomainError.invalid(
        'EXPENSE_CATEGORY_UNKNOWN',
        `Nhom chi phi ${categoryCode} khong co trong danh muc cua goi khach`,
      );
    }
  }

  private requireDriverIdForFund(driverId: string | null | undefined): string {
    if (!driverId) {
      throw TransportDomainError.invalid(
        'FUND_ACCOUNT_NOT_FOUND',
        'Khoan chi lay tu quy phai chi ro lai xe nao dung tien',
      );
    }
    return driverId;
  }

  /**
   * BA CONG cua mot khoan chi moi, moi cong mot ma rieng.
   *
   * `EXTERNAL_CARRIER` + `DRIVER_FUND` la `INV-04` / hat giong `TRIP-002`: chuyen thue xe ngoai
   * khong co chi phi van hanh noi bo. Khoan chi `COMPANY_DIRECT` tren chuyen thue ngoai VAN duoc
   * ghi (`DEMO_ASSUMPTION` DA-T3-03): bat bien ma Issue #85 khai la "outsourced trip must not
   * receive internal Driver Fund expense", va tien tra nha xe di duong `PayableDocument` cua T5 chu
   * khong phai duong nay. Neu khach muon dong ca duong do thi day la MOT dieu kien phai them, khong
   * phai mot cau truc phai doi.
   */
  private guardTripAcceptsExpense(trip: TripFacts, fundedBy: ExpenseFundingSource): void {
    const denial =
      trip.status === 'RECONCILED'
        ? ('EXPENSE_TRIP_RECONCILED' as const)
        : trip.status === 'CANCELLED'
          ? ('EXPENSE_TRIP_CANCELLED' as const)
          : trip.kind === 'EXTERNAL_CARRIER' && fundedBy === 'DRIVER_FUND'
            ? ('EXPENSE_TRIP_OUTSOURCED' as const)
            : null;
    if (!denial) return;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'trip_expense.record',
      outcome: 'denied',
      reason: denial,
      detail: { tripId: trip.id, status: trip.status, kind: trip.kind, fundedBy },
    });
    throw TransportDomainError.denied(
      denial,
      `Chuyen ${trip.code} khong nhan khoan chi nay (${denial})`,
    );
  }

  /**
   * `INV-22` — mot ngay nghiep vu roi vao ky DA DONG hoac DANG CHOT thi khong ghi duoc.
   *
   * Kiem tren MOI ky co khoang chua ngay do, khong chi ky dau tien tim thay: neu du lieu co hai ky
   * chong lap (mot `UPDATE` tay, mot ban khoi phuc cu), "chi nhin ky dau tien" se cho mot but toan
   * lot vao ky da chot chi vi thu tu doc thuan loi. Doc "co BAT KY ky nao dong bang khong" thi ket
   * qua khong phu thuoc thu tu — va do la thu duy nhat an toan de dua vao o mot cong tai chinh.
   */
  private async requireWritablePeriod(
    accountId: string,
    businessDate: string,
    point: 'driver_fund.post_entry' | 'trip_expense.record' | 'costing.reversal',
  ): Promise<void> {
    const covering = await this.ledger.periodsCovering(accountId, businessDate);
    const frozen = covering.find((period) => isFrozenFundPeriod(period.status));
    if (!frozen) return;

    const reason =
      point === 'driver_fund.post_entry'
        ? ('FUND_ENTRY_PERIOD_FROZEN' as const)
        : point === 'trip_expense.record'
          ? ('EXPENSE_PERIOD_FROZEN' as const)
          : ('REVERSAL_PERIOD_FROZEN' as const);

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail: { accountId, businessDate, periodId: frozen.id, periodStatus: frozen.status },
    });
    throw TransportDomainError.denied(
      reason,
      `Ngay ${businessDate} thuoc ky quy ${frozen.id} dang ${frozen.status} — khong ghi vao ky da chot`,
    );
  }

  /**
   * PHAT LAI hay TAI SU DUNG KHOA? Hai chuyen khac han nhau.
   *
   * Cung khoa + cung noi dung = mang chap chon, lan gui thu hai cua cung mot su kien -> tra lai ban
   * cu, khong ghi them. Cung khoa + KHAC noi dung = client dung lai mot khoa cho mot su kien moi ->
   * neu tra lai ban cu thi khoan chi moi bien mat khong dau vet, va so sach thieu di dung so tien
   * do. Nen truong hop thu hai phai la mot va cham on ao.
   */
  private assertSameEntry(
    existing: DriverFundEntry,
    incoming: { kind: DriverFundEntryKind; signedAmount: number; businessDate: string },
  ): void {
    const same =
      existing.kind === incoming.kind &&
      existing.signedAmount === incoming.signedAmount &&
      existing.businessDate === incoming.businessDate;
    if (!same) this.denyCorrelationReuse(existing.correlationKey);
  }

  private assertSameExpense(
    existing: TripExpense,
    incoming: {
      tripId: string;
      signedAmount: number;
      businessDate: string;
      fundedBy: ExpenseFundingSource;
      categoryCode: string;
    },
  ): void {
    const same =
      existing.tripId === incoming.tripId &&
      existing.signedAmount === incoming.signedAmount &&
      existing.businessDate === incoming.businessDate &&
      existing.fundedBy === incoming.fundedBy &&
      existing.categoryCode === incoming.categoryCode;
    if (!same) this.denyCorrelationReuse(existing.correlationKey);
  }

  private denyCorrelationReuse(correlationKey: string): never {
    throw TransportDomainError.conflict(
      'CORRELATION_KEY_REUSED',
      `Khoa chong ghi trung ${correlationKey} da duoc dung cho mot su kien khac`,
    );
  }
}
