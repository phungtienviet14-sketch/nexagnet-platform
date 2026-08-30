import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CURRENCY, fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  CORRELATION_INDEXES,
  FUND_PERIOD_NO_OVERLAP,
  REVERSAL_ONCE_INDEXES,
} from './costing-storage-conflict.js';
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
import type { FundPeriodStatus } from './fund-period.js';

interface AccountRow {
  id: string;
  driverId: string;
  currencyCode: string;
  createdAt: Date;
  updatedAt: Date;
}

interface EntryRow {
  id: string;
  accountId: string;
  kind: string;
  /** `BIGINT` ve tay Prisma la `bigint` — xem `fromStoredAmount()`. */
  signedAmount: bigint;
  currencyCode: string;
  businessDate: string;
  tripId: string | null;
  correlationKey: string;
  reversalOfId: string | null;
  note: string | null;
  recordedBy: string;
  createdAt: Date;
}

interface ExpenseRow {
  id: string;
  tripId: string;
  kind: string;
  categoryCode: string;
  signedAmount: bigint;
  currencyCode: string;
  businessDate: string;
  fundedBy: string;
  driverFundEntryId: string | null;
  driverId: string | null;
  correlationKey: string;
  reversalOfId: string | null;
  evidenceLocator: string | null;
  note: string | null;
  recordedBy: string;
  createdAt: Date;
}

interface PeriodRow {
  id: string;
  accountId: string;
  startDate: string;
  endDate: string;
  status: string;
  closedAt: Date | null;
  closedBy: string | null;
  reopenedAt: Date | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SnapshotRow {
  id: string;
  periodId: string;
  sequence: number;
  openingBalance: bigint;
  periodNet: bigint;
  closingBalance: bigint;
  entryCount: number;
  currencyCode: string;
  takenAt: Date;
  takenBy: string;
}

const iso = (value: Date): string => value.toISOString();

/** `fromStoredAmount` tra `null` cho `null`; o day cot la `NOT NULL` nen `0` khong bao gio den. */
const amount = (stored: bigint): number => fromStoredAmount(stored) ?? 0;

const toAccount = (row: AccountRow): DriverFundAccount => ({
  id: row.id,
  driverId: row.driverId,
  currencyCode: row.currencyCode,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toEntry = (row: EntryRow): DriverFundEntry => ({
  id: row.id,
  accountId: row.accountId,
  kind: row.kind as DriverFundEntry['kind'],
  signedAmount: amount(row.signedAmount),
  currencyCode: row.currencyCode,
  businessDate: row.businessDate,
  tripId: row.tripId,
  correlationKey: row.correlationKey,
  reversalOfId: row.reversalOfId,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: iso(row.createdAt),
});

const toExpense = (row: ExpenseRow): TripExpense => ({
  id: row.id,
  tripId: row.tripId,
  kind: row.kind as TripExpense['kind'],
  categoryCode: row.categoryCode,
  signedAmount: amount(row.signedAmount),
  currencyCode: row.currencyCode,
  businessDate: row.businessDate,
  fundedBy: row.fundedBy as TripExpense['fundedBy'],
  driverFundEntryId: row.driverFundEntryId,
  driverId: row.driverId,
  correlationKey: row.correlationKey,
  reversalOfId: row.reversalOfId,
  evidenceLocator: row.evidenceLocator,
  note: row.note,
  recordedBy: row.recordedBy,
  createdAt: iso(row.createdAt),
});

const toPeriod = (row: PeriodRow): DriverFundPeriod => ({
  id: row.id,
  accountId: row.accountId,
  startDate: row.startDate,
  endDate: row.endDate,
  status: row.status as FundPeriodStatus,
  closedAt: row.closedAt ? iso(row.closedAt) : null,
  closedBy: row.closedBy,
  reopenedAt: row.reopenedAt ? iso(row.reopenedAt) : null,
  reopenedBy: row.reopenedBy,
  reopenReason: row.reopenReason,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toSnapshot = (row: SnapshotRow): FundPeriodSnapshot => ({
  id: row.id,
  periodId: row.periodId,
  sequence: row.sequence,
  openingBalance: amount(row.openingBalance),
  periodNet: amount(row.periodNet),
  closingBalance: amount(row.closingBalance),
  entryCount: row.entryCount,
  currencyCode: row.currencyCode,
  takenAt: iso(row.takenAt),
  takenBy: row.takenBy,
});

/*
 * Xem chu thich cung ten trong `prisma-trip.repository.ts`: ranh gioi kieu that su nam o cac ham
 * `to*` co kieu ben tren, khong o delegate cua Prisma.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

const dateFilter = (range?: LedgerRange): Record<string, string> | undefined => {
  if (!range) return undefined;
  const filter: Record<string, string> = {};
  if (range.before !== undefined) filter.lt = range.before;
  if (range.from !== undefined) filter.gte = range.from;
  if (range.to !== undefined) filter.lte = range.to;
  return Object.keys(filter).length > 0 ? filter : undefined;
};

@Injectable()
export class PrismaCostingRepository extends CostingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * TAO NEU CHUA CO, chiu duoc hai nguoi goi cung luc.
   *
   * `upsert` tren `driverId` (co unique) thay vi "tim roi tao": hai request dau tien cua cung mot
   * lai xe deu thay `null` roi deu `INSERT`, va lan thu hai se do — mot lai xe khong mo duoc so quy
   * chi vi ai do bam nhanh hon nua giay.
   */
  async ensureAccount(driverId: string, at: Date): Promise<DriverFundAccount> {
    return toAccount(
      await model(this.prisma, 'transportDriverFundAccount').upsert({
        where: { driverId },
        create: { driverId, currencyCode: TRANSPORT_CURRENCY, updatedAt: at },
        update: {},
      }),
    );
  }

  async findAccount(id: string): Promise<DriverFundAccount | null> {
    const row = await model(this.prisma, 'transportDriverFundAccount').findUnique({ where: { id } });
    return row ? toAccount(row) : null;
  }

  async findAccountByDriver(driverId: string): Promise<DriverFundAccount | null> {
    const row = await model(this.prisma, 'transportDriverFundAccount').findUnique({
      where: { driverId },
    });
    return row ? toAccount(row) : null;
  }

  /**
   * HAI CHAN CUA MOT SU KIEN, MOT GIAO DICH — `INV-03` + ranh gioi `TX-03`.
   *
   * Tach lam hai lan ghi thi mot lan hong o giua de lai mot but toan quy KHONG co dong gia thanh di
   * kem: so du dung, gia thanh chuyen thieu, va khong co gi bao ca. Do la kieu sai lech chi lo ra
   * cuoi thang, luc khong con ai nho chuyen gi da xay ra.
   *
   * GIAO DICH LA DIEU KIEN CAN, KHONG PHAI DU — dung bai hoc T2.1/F2. No giu hai lan ghi cua MOT
   * nguoi di cung nhau; no khong noi gi ve nguoi thu hai gui LAI cung mot khoa. Thu chan viec do la
   * unique tren `correlationKey` o DB; doan `catch` duoi day chi la phan DICH loi cua no sang ngon
   * ngu cua mien, khong phai phan cuong che.
   */
  async post(input: CorrelatedPostingInput): Promise<CorrelatedPosting> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;
        let entry: DriverFundEntry | null = null;

        if (input.entry) {
          entry = toEntry(
            await model(scoped, 'transportDriverFundEntry').create({
              data: {
                accountId: input.entry.accountId,
                kind: input.entry.kind,
                signedAmount: toStoredAmount(input.entry.signedAmount),
                currencyCode: TRANSPORT_CURRENCY,
                businessDate: input.entry.businessDate,
                tripId: input.entry.tripId,
                correlationKey: input.correlationKey,
                reversalOfId: input.entry.reversalOfId ?? null,
                note: input.entry.note ?? null,
                recordedBy: input.entry.recordedBy,
                createdAt: input.at,
              },
            }),
          );
        }

        let expense: TripExpense | null = null;
        if (input.expense) {
          expense = toExpense(
            await model(scoped, 'transportTripExpense').create({
              data: {
                tripId: input.expense.tripId,
                kind: input.expense.kind,
                categoryCode: input.expense.categoryCode,
                signedAmount: toStoredAmount(input.expense.signedAmount),
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
                createdAt: input.at,
              },
            }),
          );
        }

        return { entry, expense };
      });
    } catch (error) {
      throw this.translatePostingError(error, input.correlationKey);
    }
  }

  /**
   * Ba va cham co the xay ra o `post()`, va chung phai ra BA cau tra loi khac nhau.
   *
   * Gop lai thanh mot 409 chung se dan nguoi dung di sai duong: "khoa da dung roi" bao ho doi khoa,
   * con "da dao roi" bao ho di tim but toan dao da co. Mot cau tra loi sai o day khien nguoi ta thu
   * lai mai mot viec khong bao gio thanh cong.
   */
  private translatePostingError(error: unknown, correlationKey: string): unknown {
    for (const index of REVERSAL_ONCE_INDEXES) {
      if (isUniqueViolationOn(error, index)) {
        return TransportDomainError.conflict(
          'ENTRY_ALREADY_REVERSED',
          `Ban ghi goc cua ${correlationKey} vua duoc nguoi khac dao — tai lai roi thu lai`,
        );
      }
    }
    for (const index of CORRELATION_INDEXES) {
      if (isUniqueViolationOn(error, index)) {
        return TransportDomainError.conflict(
          'CORRELATION_KEY_REUSED',
          `Khoa chong ghi trung ${correlationKey} vua duoc dung boi mot lan ghi khac`,
        );
      }
    }
    return error;
  }

  async findEntry(id: string): Promise<DriverFundEntry | null> {
    const row = await model(this.prisma, 'transportDriverFundEntry').findUnique({ where: { id } });
    return row ? toEntry(row) : null;
  }

  async findEntryByCorrelation(correlationKey: string): Promise<DriverFundEntry | null> {
    const row = await model(this.prisma, 'transportDriverFundEntry').findUnique({
      where: { correlationKey },
    });
    return row ? toEntry(row) : null;
  }

  async findReversalOfEntry(entryId: string): Promise<DriverFundEntry | null> {
    const row = await model(this.prisma, 'transportDriverFundEntry').findUnique({
      where: { reversalOfId: entryId },
    });
    return row ? toEntry(row) : null;
  }

  async listEntries(accountId: string): Promise<DriverFundEntry[]> {
    const rows: EntryRow[] = await model(this.prisma, 'transportDriverFundEntry').findMany({
      where: { accountId },
      // `id` la TIE-BREAK TAT DINH: nhieu but toan cung ngay va cung khoanh khac la chuyen thuong
      // ngay, va thu tu doi giua hai lan chay se lam bai test do tren may nhanh, xanh tren may cham.
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toEntry);
  }

  /**
   * SO DU cong o DB, khong keo ca so cai len bo nho.
   *
   * `_sum` cua mot cot `BIGINT` ve tay Prisma la `bigint | null` (`null` khi khong co hang nao), va
   * `fromStoredAmount` kiem lai bien mot lan nua truoc khi doi sang `number` — cung ly le da viet o
   * `money.ts`: mot tong vuot khoang bieu dien duoc phai NEM, khong duoc lang le mat chinh xac roi
   * di tiep vao mot bao cao.
   */
  async sumSignedAmounts(accountId: string, range?: LedgerRange): Promise<LedgerTotal> {
    const businessDate = dateFilter(range);
    const result = await model(this.prisma, 'transportDriverFundEntry').aggregate({
      where: { accountId, ...(businessDate ? { businessDate } : {}) },
      _sum: { signedAmount: true },
      _count: { _all: true },
    });
    const stored = result._sum?.signedAmount as bigint | null | undefined;
    return {
      total: stored === null || stored === undefined ? 0 : (fromStoredAmount(stored) ?? 0),
      count: Number(result._count?._all ?? 0),
    };
  }

  async findExpense(id: string): Promise<TripExpense | null> {
    const row = await model(this.prisma, 'transportTripExpense').findUnique({ where: { id } });
    return row ? toExpense(row) : null;
  }

  async findExpenseByCorrelation(correlationKey: string): Promise<TripExpense | null> {
    const row = await model(this.prisma, 'transportTripExpense').findUnique({
      where: { correlationKey },
    });
    return row ? toExpense(row) : null;
  }

  async findReversalOfExpense(expenseId: string): Promise<TripExpense | null> {
    const row = await model(this.prisma, 'transportTripExpense').findUnique({
      where: { reversalOfId: expenseId },
    });
    return row ? toExpense(row) : null;
  }

  async listExpenses(tripId: string): Promise<TripExpense[]> {
    const rows: ExpenseRow[] = await model(this.prisma, 'transportTripExpense').findMany({
      where: { tripId },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toExpense);
  }

  /**
   * TAO KY. Chong lap bi chan boi EXCLUDE constraint `TransportDriverFundPeriod_no_overlap`.
   *
   * EXCLUDE khong phai unique nen Prisma KHONG mo ra `P2002` cho no — loi ve dang tho, va thu duy
   * nhat con doi chieu duoc la TEN CONSTRAINT trong thong diep. Do la ly do ten do la mot hang so
   * TypeScript (`FUND_PERIOD_NO_OVERLAP`) chu khong phai mot chuoi go thang o day, va co bai test
   * doi chieu no voi chinh tep SQL cua migration.
   */
  async createPeriod(input: CreateFundPeriodInput): Promise<DriverFundPeriod> {
    try {
      return toPeriod(
        await model(this.prisma, 'transportDriverFundPeriod').create({
          data: {
            accountId: input.accountId,
            startDate: input.startDate,
            endDate: input.endDate,
            updatedAt: input.at,
          },
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes(FUND_PERIOD_NO_OVERLAP)) {
        throw TransportDomainError.conflict(
          'FUND_PERIOD_OVERLAP',
          `Khoang ${input.startDate}..${input.endDate} chong lap voi mot ky da co cua so quy nay`,
        );
      }
      throw error;
    }
  }

  async findPeriod(id: string): Promise<DriverFundPeriod | null> {
    const row = await model(this.prisma, 'transportDriverFundPeriod').findUnique({ where: { id } });
    return row ? toPeriod(row) : null;
  }

  async listPeriods(accountId: string): Promise<DriverFundPeriod[]> {
    const rows: PeriodRow[] = await model(this.prisma, 'transportDriverFundPeriod').findMany({
      where: { accountId },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPeriod);
  }

  async periodsCovering(accountId: string, businessDate: string): Promise<DriverFundPeriod[]> {
    const rows: PeriodRow[] = await model(this.prisma, 'transportDriverFundPeriod').findMany({
      where: { accountId, startDate: { lte: businessDate }, endDate: { gte: businessDate } },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPeriod);
  }

  /**
   * `updateMany` co rang buoc `status: from`, roi doc lai.
   *
   * `update` theo `id` khong lam duoc viec nay: no ghi de bat ke trang thai hien tai, nen hai nguoi
   * cung bam "dong ky" se cung thanh cong va de lai hai anh chup cho mot lan dong. `count === 0`
   * nghia la co nguoi da doi truoc — nguoi goi doi no thanh mot va cham va bao tai lai.
   */
  async setPeriodStatus(
    id: string,
    from: FundPeriodStatus,
    to: FundPeriodStatus,
    patch: FundPeriodStatusPatch,
  ): Promise<DriverFundPeriod | null> {
    const result = await model(this.prisma, 'transportDriverFundPeriod').updateMany({
      where: { id, status: from },
      data: {
        status: to,
        updatedAt: patch.at,
        ...(to === 'CLOSED' ? { closedAt: patch.at, closedBy: patch.actor } : {}),
        ...(to === 'REOPENED'
          ? {
              reopenedAt: patch.at,
              reopenedBy: patch.actor,
              reopenReason: patch.reopenReason ?? null,
            }
          : {}),
      },
    });
    if (Number(result?.count ?? 0) === 0) return null;
    return this.findPeriod(id);
  }

  /**
   * ANH CHUP la APPEND-ONLY, va `sequence` phai lien tuc trong mot ky.
   *
   * Dem trong MOT giao dich cung voi lan ghi: dem roi ghi o hai lan cham DB khac nhau se cho hai
   * lan dong gan cung mot `sequence`, va lich su "da bao cao gi, luc nao" mat thu tu.
   */
  async appendSnapshot(input: AppendSnapshotInput): Promise<FundPeriodSnapshot> {
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      const taken = await model(scoped, 'transportDriverFundPeriodSnapshot').count({
        where: { periodId: input.periodId },
      });
      return toSnapshot(
        await model(scoped, 'transportDriverFundPeriodSnapshot').create({
          data: {
            periodId: input.periodId,
            sequence: Number(taken) + 1,
            openingBalance: toStoredAmount(input.openingBalance),
            periodNet: toStoredAmount(input.periodNet),
            closingBalance: toStoredAmount(input.closingBalance),
            entryCount: input.entryCount,
            currencyCode: TRANSPORT_CURRENCY,
            takenAt: input.at,
            takenBy: input.takenBy,
          },
        }),
      );
    });
  }

  async listSnapshots(periodId: string): Promise<FundPeriodSnapshot[]> {
    const rows: SnapshotRow[] = await model(
      this.prisma,
      'transportDriverFundPeriodSnapshot',
    ).findMany({ where: { periodId }, orderBy: { sequence: 'asc' } });
    return rows.map(toSnapshot);
  }
}
