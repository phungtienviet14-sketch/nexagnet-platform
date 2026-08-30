import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import { TRANSPORT_CURRENCY } from '../money.js';
import {
  CostingRepository,
  type AppendSnapshotInput,
  type CorrelatedPosting,
  type CorrelatedPostingInput,
  type CreateFundPeriodInput,
  type FundPeriodStatusPatch,
  type LedgerRange,
  type LedgerTotal,
} from './costing.repository.js';
import type {
  DriverFundAccount,
  DriverFundEntry,
  DriverFundPeriod,
  FundPeriodSnapshot,
  TripExpense,
} from './costing.types.js';
import {
  INITIAL_FUND_PERIOD_STATUS,
  periodCovers,
  periodsOverlap,
  type FundPeriodStatus,
} from './fund-period.js';

const iso = (at: Date): string => at.toISOString();

const inRange = (businessDate: BusinessDate, range?: LedgerRange): boolean => {
  if (!range) return true;
  if (range.before !== undefined && !(businessDate < range.before)) return false;
  if (range.from !== undefined && businessDate < range.from) return false;
  if (range.to !== undefined && businessDate > range.to) return false;
  return true;
};

/** Thu tu doc ON DINH: ngay nghiep vu, roi khoanh khac ghi, roi id lam tie-break tat dinh. */
const byLedgerOrder = <T extends { businessDate: string; createdAt: string; id: string }>(
  left: T,
  right: T,
): number =>
  left.businessDate.localeCompare(right.businessDate) ||
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

/**
 * Kho trong bo nho — duong chay mac dinh (`PERSISTENCE=memory`), va la thu cho demo/CI chay ma
 * khong can Postgres.
 *
 * NO KHONG chung minh duoc cac bat bien TANG LUU TRU: khong unique tren khoa chong trung, khong
 * `CHECK` dau, khong giao dich. Do la ly do bo `transport-costing.int.spec.ts` ton tai va chay
 * tren Postgres that o CI — bai hoc da tra gia mot lan o T2.1.
 */
export class InMemoryCostingRepository extends CostingRepository {
  private readonly accounts = new Map<string, DriverFundAccount>();
  private readonly entries: DriverFundEntry[] = [];
  private readonly expenses: TripExpense[] = [];
  private readonly periods = new Map<string, DriverFundPeriod>();
  private readonly snapshots: FundPeriodSnapshot[] = [];

  async ensureAccount(driverId: string, at: Date): Promise<DriverFundAccount> {
    const existing = await this.findAccountByDriver(driverId);
    if (existing) return existing;
    const stamp = iso(at);
    const account: DriverFundAccount = {
      id: randomUUID(),
      driverId,
      currencyCode: TRANSPORT_CURRENCY,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async findAccount(id: string): Promise<DriverFundAccount | null> {
    return this.accounts.get(id) ?? null;
  }

  async findAccountByDriver(driverId: string): Promise<DriverFundAccount | null> {
    return [...this.accounts.values()].find((entry) => entry.driverId === driverId) ?? null;
  }

  async post(input: CorrelatedPostingInput): Promise<CorrelatedPosting> {
    const stamp = iso(input.at);
    let entry: DriverFundEntry | null = null;
    let expense: TripExpense | null = null;

    if (input.entry) {
      entry = {
        id: randomUUID(),
        accountId: input.entry.accountId,
        kind: input.entry.kind,
        signedAmount: input.entry.signedAmount,
        currencyCode: TRANSPORT_CURRENCY,
        businessDate: input.entry.businessDate,
        tripId: input.entry.tripId,
        correlationKey: input.correlationKey,
        reversalOfId: input.entry.reversalOfId ?? null,
        note: input.entry.note ?? null,
        recordedBy: input.entry.recordedBy,
        createdAt: stamp,
      };
      this.entries.push(entry);
    }

    if (input.expense) {
      expense = {
        id: randomUUID(),
        tripId: input.expense.tripId,
        kind: input.expense.kind,
        categoryCode: input.expense.categoryCode,
        signedAmount: input.expense.signedAmount,
        currencyCode: TRANSPORT_CURRENCY,
        businessDate: input.expense.businessDate,
        fundedBy: input.expense.fundedBy,
        driverFundEntryId: entry?.id ?? null,
        driverId: input.expense.driverId,
        correlationKey: input.correlationKey,
        reversalOfId: input.expense.reversalOfId ?? null,
        evidenceLocator: input.expense.evidenceLocator ?? null,
        note: input.expense.note ?? null,
        recordedBy: input.expense.recordedBy,
        createdAt: stamp,
      };
      this.expenses.push(expense);
    }

    return { entry, expense };
  }

  async findEntry(id: string): Promise<DriverFundEntry | null> {
    return this.entries.find((entry) => entry.id === id) ?? null;
  }

  async findEntryByCorrelation(correlationKey: string): Promise<DriverFundEntry | null> {
    return this.entries.find((entry) => entry.correlationKey === correlationKey) ?? null;
  }

  async findReversalOfEntry(entryId: string): Promise<DriverFundEntry | null> {
    return this.entries.find((entry) => entry.reversalOfId === entryId) ?? null;
  }

  async listEntries(accountId: string): Promise<DriverFundEntry[]> {
    return this.entries.filter((entry) => entry.accountId === accountId).sort(byLedgerOrder);
  }

  async sumSignedAmounts(accountId: string, range?: LedgerRange): Promise<LedgerTotal> {
    const matching = this.entries.filter(
      (entry) => entry.accountId === accountId && inRange(entry.businessDate, range),
    );
    return {
      total: matching.reduce((sum, entry) => sum + entry.signedAmount, 0),
      count: matching.length,
    };
  }

  async findExpense(id: string): Promise<TripExpense | null> {
    return this.expenses.find((expense) => expense.id === id) ?? null;
  }

  async findExpenseByCorrelation(correlationKey: string): Promise<TripExpense | null> {
    return this.expenses.find((expense) => expense.correlationKey === correlationKey) ?? null;
  }

  async findReversalOfExpense(expenseId: string): Promise<TripExpense | null> {
    return this.expenses.find((expense) => expense.reversalOfId === expenseId) ?? null;
  }

  async listExpenses(tripId: string): Promise<TripExpense[]> {
    return this.expenses.filter((expense) => expense.tripId === tripId).sort(byLedgerOrder);
  }

  async createPeriod(input: CreateFundPeriodInput): Promise<DriverFundPeriod> {
    const clashing = [...this.periods.values()].find(
      (period) => period.accountId === input.accountId && periodsOverlap(period, input),
    );
    // Kho THAT cuong che dieu nay bang mot EXCLUDE constraint; o day chi la ban sao de kho trong bo
    // nho khong ke mot cau chuyen de dai hon su that.
    if (clashing) throw new Error(`Ky quy chong lap voi ky ${clashing.id}`);

    const stamp = iso(input.at);
    const period: DriverFundPeriod = {
      id: randomUUID(),
      accountId: input.accountId,
      startDate: input.startDate,
      endDate: input.endDate,
      status: INITIAL_FUND_PERIOD_STATUS,
      closedAt: null,
      closedBy: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.periods.set(period.id, period);
    return period;
  }

  async findPeriod(id: string): Promise<DriverFundPeriod | null> {
    return this.periods.get(id) ?? null;
  }

  async listPeriods(accountId: string): Promise<DriverFundPeriod[]> {
    return [...this.periods.values()]
      .filter((period) => period.accountId === accountId)
      .sort((left, right) => left.startDate.localeCompare(right.startDate));
  }

  /**
   * Goi `periodCovers()` thay vi so lai hai dau tai cho.
   *
   * Phep so "ngay nay co thuoc ky khong" co MOT quy uoc de sai (hai dau DEU tinh) va no da duoc
   * quyet o `fund-period.ts`. Viet lai o day nghia la co hai ban cua cung mot luat, va lan troi dau
   * tien se lam kho trong bo nho va kho that tra loi khac nhau cho dung mot cau hoi.
   */
  async periodsCovering(accountId: string, businessDate: BusinessDate): Promise<DriverFundPeriod[]> {
    return [...this.periods.values()].filter(
      (period) => period.accountId === accountId && periodCovers(period, businessDate),
    );
  }

  async setPeriodStatus(
    id: string,
    from: FundPeriodStatus,
    to: FundPeriodStatus,
    patch: FundPeriodStatusPatch,
  ): Promise<DriverFundPeriod | null> {
    const current = this.periods.get(id);
    if (!current || current.status !== from) return null;
    const stamp = iso(patch.at);
    const next: DriverFundPeriod = {
      ...current,
      status: to,
      updatedAt: stamp,
      ...(to === 'CLOSED' ? { closedAt: stamp, closedBy: patch.actor } : {}),
      ...(to === 'REOPENED'
        ? { reopenedAt: stamp, reopenedBy: patch.actor, reopenReason: patch.reopenReason ?? null }
        : {}),
    };
    this.periods.set(id, next);
    return next;
  }

  async appendSnapshot(input: AppendSnapshotInput): Promise<FundPeriodSnapshot> {
    const sequence = this.snapshots.filter((row) => row.periodId === input.periodId).length + 1;
    const snapshot: FundPeriodSnapshot = {
      id: randomUUID(),
      periodId: input.periodId,
      sequence,
      openingBalance: input.openingBalance,
      periodNet: input.periodNet,
      closingBalance: input.closingBalance,
      entryCount: input.entryCount,
      currencyCode: TRANSPORT_CURRENCY,
      takenAt: iso(input.at),
      takenBy: input.takenBy,
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  async listSnapshots(periodId: string): Promise<FundPeriodSnapshot[]> {
    return this.snapshots
      .filter((row) => row.periodId === periodId)
      .sort((left, right) => left.sequence - right.sequence);
  }
}
