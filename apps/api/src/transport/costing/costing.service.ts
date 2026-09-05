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
import { TRANSPORT_COSTING_POLICY, type TransportCostingPolicy } from './costing-policy.js';
import {
  CostingRepository,
  FundPeriodFrozenError,
  type CorrelatedPosting,
  type CorrelatedPostingInput,
} from './costing.repository.js';
import {
  fundEntryIdentity,
  fundEntryIdentityOf,
  isSameFundEntry,
  isSameTripExpense,
  tripExpenseIdentity,
  tripExpenseIdentityOf,
  type FundEntryIdentity,
  type TripExpenseIdentity,
} from './costing-replay.js';
import type {
  DriverFundAccount,
  DriverFundEntry,
  DriverFundPeriod,
  TripExpense,
} from './costing.types.js';
import {
  assertExpenseSign,
  assertLedgerSign,
  signedAmountFor,
  type DriverFundEntryKind,
  type ExpenseFundingSource,
  type PostableFundEntryKind,
} from './driver-fund-ledger.js';
import { TransportCoreFacts, type TripFacts } from './transport-core-facts.port.js';

/**
 * BA CONG co the cham vao mot ky dong bang, va MOI cong mang mot ma tu choi rieng (`INV-22`).
 *
 * Bang nay la cho DUY NHAT anh xa cong -> ma. Rai `if` o ba noi se lam mot cong nao do, sau vai
 * lan sua, tra ve ma cua cong ben canh — va bang loc trace se dem sai ma khong ai biet.
 */
type FrozenPeriodGate = 'driver_fund.post_entry' | 'trip_expense.record' | 'costing.reversal';

const FROZEN_PERIOD_REASONS = {
  'driver_fund.post_entry': 'FUND_ENTRY_PERIOD_FROZEN',
  'trip_expense.record': 'EXPENSE_PERIOD_FROZEN',
  'costing.reversal': 'REVERSAL_PERIOD_FROZEN',
} as const satisfies Record<FrozenPeriodGate, string>;

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

    const incoming = fundEntryIdentity({
      accountId: account.id,
      kind,
      signedAmount: input.signedAmount,
      businessDate,
      tripId: input.tripId ?? null,
      note: input.note ?? null,
    });

    const replay = await this.ledger.findEntryByCorrelation(correlationKey);
    if (replay) {
      this.assertSameEntry(replay, incoming);
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'driver_fund.post_entry',
        outcome: 'allowed',
        reason: 'FUND_ENTRY_IDEMPOTENT_REPLAY',
        detail: { correlationKey, entryId: replay.id },
      });
      return replay;
    }

    const posted = await this.postGuarded('driver_fund.post_entry', {
      correlationKey,
      at: this.now(),
      periodGuard: { accountId: account.id, businessDate },
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
    if (driverId) {
      await requireDriverFacts(this.core, driverId);
      // TRUOC `ensureAccount()`: mot lenh se bi tu choi khong duoc phep de lai mot so quy moi tinh
      // cho mot lai xe khong lien quan gi den chuyen nay.
      await this.requireDriverAssignedToTrip(trip, driverId, command.fundedBy);
    }
    const account = driverId ? await this.ledger.ensureAccount(driverId, this.now()) : null;

    const correlationKey = command.correlationKey ?? this.newCorrelationKey();
    const incoming = tripExpenseIdentity({
      tripId: command.tripId,
      signedAmount: assertExpenseSign('EXPENSE', magnitude).amount,
      businessDate,
      fundedBy: command.fundedBy,
      categoryCode: command.categoryCode,
      driverId,
      evidenceLocator: command.evidenceLocator ?? null,
      note: command.note ?? null,
    });

    const replay = await this.ledger.findExpenseByCorrelation(correlationKey);
    if (replay) {
      const replayLeg = await this.ledger.findEntryByCorrelation(correlationKey);
      this.assertSameExpense(replay, incoming, replayLeg, account);
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'trip_expense.record',
        outcome: 'allowed',
        reason: 'EXPENSE_IDEMPOTENT_REPLAY',
        detail: { correlationKey, expenseId: replay.id },
      });
      return { entry: replayLeg, expense: replay };
    }

    const posted = await this.postGuarded('trip_expense.record', {
      correlationKey,
      at: this.now(),
      ...(account ? { periodGuard: { accountId: account.id, businessDate } } : {}),
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

  /**
   * LAI XE TU GHI mot khoan chi cua chinh minh — `#168 B3`.
   *
   * Mot lop MONG dat tren `recordTripExpense`, va do la ca thiet ke. No lam dung hai viec ma be mat
   * lai xe can, roi giao toan bo phan con lai cho duong da co:
   *
   *   1. DICH `authUserId` -> ho so lai xe. Danh tinh den tu phien, khong tu than yeu cau;
   *   2. CHOT `fundedBy = DRIVER_FUND` va `driverId` = chinh nguoi dang dang nhap.
   *
   * KHONG mot phep kiem quyen nao duoc viet lai o day — va do la diem quan trong nhat. Cau hoi
   * "lai xe nay co duoc ghi chi phi vao chuyen do khong" da co mot cau tra loi DUY NHAT trong he
   * thong: `requireDriverAssignedToTrip()` ben trong `recordTripExpense`, chay vi `driverId` khac
   * `null`. Viet mot phep kiem thu hai o day se tao ra hai luat cho mot cau hoi, va den mot luc nao
   * do chung se lech nhau.
   *
   * Cung ly do, ky quy dang dong / chuyen da doi soat / chuyen thue ngoai / danh muc chi phi deu
   * van do duong cu tu choi, kem nguyen ma ly do cu.
   */
  /**
   * DANH GIA SOM quyen ghi cua chinh lai xe — KHONG ghi gi, khong tao mot hang nao.
   *
   * Ton tai vi DUNG mot ly do, va ly do do thuoc ve duong bang chung (#169): route anh phai LUU
   * BYTE truoc khi goi `recordSelfTripExpense`, boi `TripExpense.evidenceLocator` duoc dat luc
   * INSERT — so cai la append-only (`INV-22`), khong co duong sua mot hang da ghi de gan anh sau.
   * Va `MediaStore` khong co lenh xoa. Nen neu de lenh ghi tu choi SAU khi byte da nam trong
   * bucket, moi lan tu choi de lai mot object mo coi ma khong ai don.
   *
   * KHONG phai mot luat thu hai. No goi DUNG hai phep kiem ma `recordSelfTripExpense` se goi lai
   * ngay sau do — `findDriverByAuthUserId` va `requireDriverAssignedToTrip` — va lenh ghi VAN kiem
   * lai day du. Day chi la mot lan danh gia som de khong phai don rac; bo no di thi nghiep vu van
   * dung, chi ton bucket.
   */
  async assertSelfTripExpenseAllowed(authUserId: string, tripId: string): Promise<void> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'driver.self_expense_scope',
        outcome: 'denied',
        reason: 'SELF_EXPENSE_SCOPE_NO_DRIVER_BINDING',
        detail: { authUserId },
      });
      throw TransportDomainError.denied(
        'SELF_EXPENSE_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      );
    }
    const trip = await requireTripFacts(this.core, tripId);
    await this.requireDriverAssignedToTrip(trip, driver.id, 'DRIVER_FUND');
  }

  async recordSelfTripExpense(
    authUserId: string,
    input: Omit<RecordTripExpenseCommand, 'driverId' | 'fundedBy'>,
    actor: string,
  ): Promise<CorrelatedPosting> {
    const driver = await this.core.findDriverByAuthUserId(authUserId);
    if (!driver) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_COSTING_DECISIONS,
        point: 'driver.self_expense_scope',
        outcome: 'denied',
        reason: 'SELF_EXPENSE_SCOPE_NO_DRIVER_BINDING',
        detail: { authUserId },
      });
      throw TransportDomainError.denied(
        'SELF_EXPENSE_SCOPE_NO_DRIVER_BINDING',
        'Tai khoan nay chua duoc noi voi ho so lai xe nao',
      );
    }

    const posted = await this.recordTripExpense(
      { ...input, driverId: driver.id, fundedBy: 'DRIVER_FUND' },
      actor,
    );

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'driver.self_expense_scope',
      outcome: 'allowed',
      reason: 'SELF_EXPENSE_SCOPE_GRANTED',
      detail: {
        driverId: driver.id,
        tripId: input.tripId,
        expenseId: posted.expense?.id ?? null,
      },
    });
    return posted;
  }

  /**
   * DANH MUC NHOM CHI PHI ma goi khach cho phep — `#168 B4`.
   *
   * Truoc task nay danh muc ton tai nhung KHONG doc ra duoc: `requireCategory()` kiem theo no va tra
   * 400, con nguoi dung thi khong co cach nao biet duoc danh sach — nen duong "dung" tren giao dien
   * la GO THU roi doi may chu bao sai.
   *
   * Dat CANH `requireCategory()` chu khong o `CostingReadService`, va do khong phai tien tay: hai
   * ham nay doc CUNG MOT `this.policy.expenseCategories`. Tach chung sang hai lop se mo ra kha nang
   * mot ben doc cau hinh cua tenant nay con ben kia doc cua tenant khac — va trieu chung se la
   * "danh sach tren man hinh khong khop voi cai may chu nhan".
   *
   * `unrestricted` la mot truong TUONG MINH, khong phai mot mang rong de nguoi doc tu doan:
   * `[]` o day nghia la "nhap tu do", khong phai "khong nhom nao hop le" — va hai nghia do doi
   * nguoc nhau hoan toan tren giao dien.
   */
  expenseCatalogue(): { categories: readonly string[]; unrestricted: boolean } {
    const categories = this.policy.expenseCategories;
    return { categories, unrestricted: categories.length === 0 };
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
  async reverseExpense(
    expenseId: string,
    reason: string,
    actor: string,
  ): Promise<CorrelatedPosting> {
    const expense = await this.ledger.findExpense(expenseId);
    if (!expense) {
      throw TransportDomainError.notFound(
        'TRIP_EXPENSE_NOT_FOUND',
        `Khong tim thay khoan chi ${expenseId}`,
      );
    }
    return this.reverseCorrelation(expense.correlationKey, reason, actor);
  }

  async reverseFundEntry(
    entryId: string,
    reason: string,
    actor: string,
  ): Promise<CorrelatedPosting> {
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

    // Khoa TAT DINH: dao lai lan hai gap dung unique cua khoa nay va thanh mot lan phat lai vo hai,
    // thay vi ghi them mot but toan dao thu hai.
    const posted = await this.postGuarded('costing.reversal', {
      correlationKey: `${correlationKey}:reversal`,
      at: this.now(),
      ...(entry
        ? { periodGuard: { accountId: entry.accountId, businessDate: entry.businessDate } }
        : {}),
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
   * MOT CUA GHI cho ca ba cong, va la noi `INV-22` duoc dich sang ngon ngu cua tung cong.
   *
   * Kho nem `FundPeriodFrozenError` — mot su that tho: "ky nay dang dong bang". Kho khong biet
   * ai dang goi no. Cong nao dang mo thi cong do dat ten cho viec bi tu choi, vi `.claude/rules`
   * doi N duong tu choi thi N ma: nguoi truc doc trace phai thay ngay "khoan chi bi chan" khac
   * "but toan dao bi chan", chu khong phai mot ma chung roi phai mo source doan tiep.
   */
  private async postGuarded(
    point: FrozenPeriodGate,
    input: CorrelatedPostingInput,
  ): Promise<CorrelatedPosting> {
    try {
      return await this.ledger.post(input);
    } catch (error) {
      if (error instanceof FundPeriodFrozenError) this.denyFrozenPeriod(point, error.period);
      throw error;
    }
  }

  private denyFrozenPeriod(point: FrozenPeriodGate, period: DriverFundPeriod): never {
    const reason = FROZEN_PERIOD_REASONS[point];
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail: {
        accountId: period.accountId,
        periodId: period.id,
        periodStatus: period.status,
        startDate: period.startDate,
        endDate: period.endDate,
      },
    });
    throw TransportDomainError.denied(
      reason,
      `Ngay nghiep vu thuoc ky quy ${period.id} dang ${period.status} — khong ghi vao ky da chot`,
    );
  }

  /**
   * `DA-T3-04` — mot khoan chi TU QUY chi gan duoc cho lai xe DA TUNG chay chuyen do.
   *
   * ---------------------------------------------------------------------------
   * KHE HO DA CO O BAN T3 DAU (Issue #94 §5):
   *
   * `recordTripExpense()` chi kiem "chuyen co that" va "lai xe co that", khong kiem hai thu do co
   * lien quan gi den nhau khong. Nen mot lan go nham `driverId` se TRU TIEN quy cua mot lai xe
   * chua bao gio thay chuyen do — va vi so cai la append-only, khong co duong sua nao ngoai mot
   * but toan dao. Doi voi lai xe bi tru, do la tien that trong so cua ho.
   *
   * T1/`GD-06` da giu san lich su phan cong de truy trach nhiem; day la cho no duoc dung den.
   *
   * ---------------------------------------------------------------------------
   * "DA TUNG", KHONG PHAI "DANG": mot lai xe bi thay ca van chiu phan chuyen ho da chay, nen ho
   * van phai ghi duoc khoan chi cua doan do. Doc "dang" se khoa het khoan chi cua nguoi lai dau
   * tien ngay khi nguoi thu hai nhan xe.
   *
   * VA KHONG DOI CHIEU TOI TUNG PHUT: khoan chi hien chi co NGAY (`businessDate`), con ban phan
   * cong co dau thoi gian. So "khoan chi luc 14:30 co roi vao ca cua ai" tu mot du lieu chi co
   * ngay la bia ra mot do chinh xac khong ton tai. Khi nao khoan chi mang duoc gio thi cong nay
   * siet them duoc — luc do la mot dieu kien phai them, khong phai mot cau truc phai doi.
   *
   * `COMPANY_DIRECT` khong di qua day: no khong co lai xe nao de doi chieu.
   */
  private async requireDriverAssignedToTrip(
    trip: TripFacts,
    driverId: string,
    fundedBy: ExpenseFundingSource,
  ): Promise<void> {
    if (await this.core.wasDriverEverAssignedToTrip(trip.id, driverId)) return;

    this.telemetry?.decision({
      vocabulary: TRANSPORT_COSTING_DECISIONS,
      point: 'trip_expense.record',
      outcome: 'denied',
      reason: 'EXPENSE_DRIVER_NOT_ASSIGNED',
      detail: { tripId: trip.id, driverId, fundedBy },
    });
    throw TransportDomainError.denied(
      'EXPENSE_DRIVER_NOT_ASSIGNED',
      `Lai xe ${driverId} chua tung duoc phan cong vao chuyen ${trip.code} — khong tru quy cua ho`,
    );
  }

  /**
   * PHAT LAI hay TAI SU DUNG KHOA? Hai chuyen khac han nhau.
   *
   * Cung khoa + cung noi dung = mang chap chon, lan gui thu hai cua cung mot su kien -> tra lai ban
   * cu, khong ghi them. Cung khoa + KHAC noi dung = client dung lai mot khoa cho mot su kien moi ->
   * neu tra lai ban cu thi khoan chi moi bien mat khong dau vet, va so sach thieu di dung so tien
   * do. Nen truong hop thu hai phai la mot va cham on ao.
   *
   * "Cung noi dung" duoc do bang VAN TAY DAY DU cua lenh (`costing-replay.ts`), khong bang vai
   * truong de nho. Ban T3 dau so ba truong va bo mat `accountId` — xem khoi chu thich dau tep do.
   */
  private assertSameEntry(existing: DriverFundEntry, incoming: FundEntryIdentity): void {
    if (!isSameFundEntry(fundEntryIdentityOf(existing), incoming)) {
      this.denyCorrelationReuse(existing.correlationKey);
    }
  }

  /**
   * Khoan chi phat lai phai khop CA HAI CHAN, khong chi chan gia thanh.
   *
   * Van tay cua `TripExpense` da mang `driverId` va `fundedBy`, nhung no khong noi gi ve BUT
   * TOAN QUY sinh doi that su dang nam o dau. Mot hang gia thanh co the ton tai voi chan quy tro
   * sang so quy khac (mot ban khoi phuc cu, mot `UPDATE` tay). Kiem them chan quy la kiem `INV-03`
   * o dung cho ma no co the da gay: tra ve mot cap khong con doi soat duoc voi nhau.
   */
  private assertSameExpense(
    existing: TripExpense,
    incoming: TripExpenseIdentity,
    existingLeg: DriverFundEntry | null,
    account: DriverFundAccount | null,
  ): void {
    if (!isSameTripExpense(tripExpenseIdentityOf(existing), incoming)) {
      this.denyCorrelationReuse(existing.correlationKey);
    }
    // `null` o ca hai ve = `COMPANY_DIRECT` phat lai dung. Mot ve `null` con ve kia co gia tri =
    // hai lenh khac nguon tien dung chung mot khoa.
    if ((account?.id ?? null) !== (existingLeg?.accountId ?? null)) {
      this.denyCorrelationReuse(existing.correlationKey);
    }
  }

  private denyCorrelationReuse(correlationKey: string): never {
    throw TransportDomainError.conflict(
      'CORRELATION_KEY_REUSED',
      `Khoa chong ghi trung ${correlationKey} da duoc dung cho mot su kien khac`,
    );
  }
}
