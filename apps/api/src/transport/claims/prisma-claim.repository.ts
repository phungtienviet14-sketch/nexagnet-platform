import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import {
  ExpenseClaimRepository,
  type CreateExpenseClaimInput,
  type DecideExpenseClaimInput,
  type ExpenseClaimFilter,
} from './claim.repository.js';
import type {
  ExpenseClaim,
  ExpenseClaimDecision,
  ExpenseClaimDecisionOutcome,
  ExpenseClaimStatus,
} from './claim.types.js';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

interface ClaimRow {
  id: string;
  driverId: string;
  status: ExpenseClaimStatus;
  categoryCode: string;
  claimedAmount: bigint;
  approvedAmount: bigint | null;
  currencyCode: string;
  businessDate: string;
  note: string | null;
  evidenceLocator: string | null;
  tripId: string | null;
  runId: string | null;
  legId: string | null;
  submittedBy: string;
  submittedAt: Date;
  decidedAt: Date | null;
  settlementExpenseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface DecisionRow {
  id: string;
  claimId: string;
  sequence: number;
  outcome: ExpenseClaimDecisionOutcome;
  approvedAmount: bigint | null;
  reasonCode: string;
  note: string | null;
  decidedBy: string;
  decidedAt: Date;
}

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value === null ? null : iso(value));

const toClaim = (row: ClaimRow): ExpenseClaim => ({
  id: row.id,
  driverId: row.driverId,
  status: row.status,
  categoryCode: row.categoryCode,
  claimedAmount: fromStoredAmount(row.claimedAmount) ?? 0,
  approvedAmount: fromStoredAmount(row.approvedAmount),
  currencyCode: row.currencyCode,
  businessDate: row.businessDate,
  note: row.note,
  evidenceLocator: row.evidenceLocator,
  tripId: row.tripId,
  runId: row.runId,
  legId: row.legId,
  submittedBy: row.submittedBy,
  submittedAt: iso(row.submittedAt),
  decidedAt: isoOrNull(row.decidedAt),
  settlementExpenseId: row.settlementExpenseId,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toDecision = (row: DecisionRow): ExpenseClaimDecision => ({
  id: row.id,
  claimId: row.claimId,
  sequence: row.sequence,
  outcome: row.outcome,
  approvedAmount: fromStoredAmount(row.approvedAmount),
  reasonCode: row.reasonCode,
  note: row.note,
  decidedBy: row.decidedBy,
  decidedAt: iso(row.decidedAt),
});

@Injectable()
export class PrismaExpenseClaimRepository extends ExpenseClaimRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateExpenseClaimInput): Promise<ExpenseClaim> {
    return toClaim(
      await model(this.prisma, 'transportExpenseClaim').create({
        data: {
          driverId: input.driverId,
          categoryCode: input.categoryCode,
          claimedAmount: toStoredAmount(input.claimedAmount),
          businessDate: input.businessDate,
          tripId: input.tripId,
          runId: input.runId,
          legId: input.legId,
          note: input.note,
          evidenceLocator: input.evidenceLocator,
          submittedBy: input.submittedBy,
        },
      }),
    );
  }

  async find(id: string): Promise<ExpenseClaim | null> {
    const row = await model(this.prisma, 'transportExpenseClaim').findUnique({ where: { id } });
    return row ? toClaim(row) : null;
  }

  async list(filter: ExpenseClaimFilter): Promise<ExpenseClaim[]> {
    const rows: ClaimRow[] = await model(this.prisma, 'transportExpenseClaim').findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.driverId ? { driverId: filter.driverId } : {}),
      },
      // Thu tu la mot phan hop dong doc: hai lan goi lien tiep phai cho ra cung mot day.
      orderBy: [{ businessDate: 'desc' }, { submittedAt: 'desc' }, { id: 'asc' }],
    });
    return rows.map(toClaim);
  }

  async listDecisions(claimId: string): Promise<ExpenseClaimDecision[]> {
    const rows: DecisionRow[] = await model(this.prisma, 'transportExpenseClaimDecision').findMany({
      where: { claimId },
      orderBy: [{ sequence: 'asc' }],
    });
    return rows.map(toDecision);
  }

  /**
   * Ghi hang lich su va doi trang thai de nghi TRONG MOT giao dich.
   *
   * `sequence` duoc dem BEN TRONG giao dich, va `@@unique([claimId, sequence])` la thu dung khi hai
   * nguoi bam duyet cung luc: nguoi thu hai va vao unique thay vi ghi de len quyet dinh cua nguoi
   * thu nhat.
   */
  async decide(
    claimId: string,
    input: DecideExpenseClaimInput,
  ): Promise<{ claim: ExpenseClaim; decision: ExpenseClaimDecision }> {
    return this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaService;
      const approved = input.outcome === 'APPROVED';

      const taken: number = await model(client, 'transportExpenseClaimDecision').count({
        where: { claimId },
      });

      const decisionRow: DecisionRow = await model(client, 'transportExpenseClaimDecision').create({
        data: {
          claimId,
          sequence: taken + 1,
          outcome: input.outcome,
          approvedAmount: approved ? toStoredAmount(input.approvedAmount) : null,
          reasonCode: input.reasonCode,
          note: input.note,
          decidedBy: input.decidedBy,
          decidedAt: input.decidedAt,
        },
      });

      const claimRow: ClaimRow = await model(client, 'transportExpenseClaim').update({
        where: { id: claimId },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          approvedAmount: approved ? toStoredAmount(input.approvedAmount) : null,
          decidedAt: input.decidedAt,
          settlementExpenseId: approved ? input.settlementExpenseId : null,
          updatedAt: input.decidedAt,
        },
      });

      return { claim: toClaim(claimRow), decision: toDecision(decisionRow) };
    });
  }

  async attachSettlement(claimId: string, expenseId: string): Promise<ExpenseClaim | null> {
    const row = await model(this.prisma, 'transportExpenseClaim').update({
      where: { id: claimId },
      data: { settlementExpenseId: expenseId },
    });
    return row ? toClaim(row) : null;
  }
}
