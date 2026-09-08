import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  ACCEPTANCE_DECISION_IDEMPOTENCY,
  ACCEPTANCE_DECISION_SEQUENCE,
} from './acceptance-storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  AcceptanceRepository,
  projectedStateOf,
  type AcceptanceDecisionOutcome,
  type AppendAcceptanceDecisionCommand,
} from './acceptance.repository.js';
import type {
  CommercialAcceptance,
  CommercialAcceptanceBasis,
  CommercialAcceptanceDecision,
  CommercialAcceptanceDetail,
  CommercialAcceptanceOutcome,
  CommercialAcceptanceState,
} from './acceptance.types.js';

/**
 * KHO Postgres cua truc nghiem thu.
 *
 * ============================================================================================
 * `append()` LA MOT GIAO DICH, VA DO KHONG PHAI MOT LUA CHON VE HIEU NANG
 * ============================================================================================
 *
 * Ba lan ghi (`upsert` ho so, `create` quyet dinh, `update` hinh chieu) phai cung song hoac cung
 * chet. Mot loi mang giua buoc 2 va buoc 3 se de lai mot quyet dinh DA GHI ma hinh chieu van noi
 * "dang cho" — va hang cho se hien mot ho so ma lich su cua no da co ket qua. Ke tu do khong ai
 * doi soat duoc ben nao dung.
 *
 * ============================================================================================
 * SO THU TU TINH TRONG GIAO DICH, KHONG TINH TRUOC
 * ============================================================================================
 *
 * `sequence` = `count + 1` doc BEN TRONG giao dich, va rang buoc `@@unique([acceptanceId,
 * sequence])` la luoi cuoi. Hai nguoi cung ghi thi mot nguoi va vao rang buoc do va nhan
 * `ACCEPTANCE_DECISION_SEQUENCE_CONFLICT` — chu khong phai hai hang cung mang `sequence = 2`.
 *
 * (Tang mien da chan phan lon truong hop nay tu truoc bang `supersedesId` phai bang ban moi nhat.
 * Rang buoc o DB la lop thu hai, cho dung khoanh khac ma ca hai cung doc duoc cung mot ban moi
 * nhat.)
 */
interface AcceptanceRow {
  readonly id: string;
  readonly runId: string;
  readonly state: string;
  readonly counterpartyId: string | null;
  readonly businessDate: string;
  readonly latestDecisionId: string | null;
  readonly openedBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface DecisionRow {
  readonly id: string;
  readonly acceptanceId: string;
  readonly sequence: number;
  readonly outcome: string;
  readonly reasonCode: string;
  readonly basis: string;
  readonly evidenceRefs: string[];
  readonly externalNote: string | null;
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
  readonly decidedBy: string;
  readonly decidedAt: Date;
}

const toAcceptance = (row: AcceptanceRow): CommercialAcceptance => ({
  id: row.id,
  runId: row.runId,
  state: row.state as CommercialAcceptanceState,
  counterpartyId: row.counterpartyId,
  businessDate: row.businessDate as BusinessDate,
  latestDecisionId: row.latestDecisionId,
  openedBy: row.openedBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toDecision = (row: DecisionRow): CommercialAcceptanceDecision => ({
  id: row.id,
  acceptanceId: row.acceptanceId,
  sequence: row.sequence,
  outcome: row.outcome as CommercialAcceptanceOutcome,
  reasonCode: row.reasonCode,
  basis: row.basis as CommercialAcceptanceBasis,
  evidenceRefs: [...row.evidenceRefs],
  externalNote: row.externalNote,
  supersedesId: row.supersedesId,
  idempotencyKey: row.idempotencyKey,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt.toISOString(),
});

export class PrismaAcceptanceRepository extends AcceptanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByRun(runId: string): Promise<CommercialAcceptance | null> {
    const row = await this.prisma.transportCommercialAcceptance.findUnique({ where: { runId } });
    return row ? toAcceptance(row) : null;
  }

  async findDetailByRun(runId: string): Promise<CommercialAcceptanceDetail | null> {
    const row = await this.prisma.transportCommercialAcceptance.findUnique({
      where: { runId },
      include: { decisions: { orderBy: { sequence: 'asc' } } },
    });
    if (!row) return null;
    return {
      acceptance: toAcceptance(row),
      decisions: row.decisions.map(toDecision),
    };
  }

  async findManyByRuns(runIds: readonly string[]): Promise<CommercialAcceptance[]> {
    if (runIds.length === 0) return [];
    const rows = await this.prisma.transportCommercialAcceptance.findMany({
      where: { runId: { in: [...runIds] } },
    });
    return rows.map(toAcceptance);
  }

  async append(command: AppendAcceptanceDecisionCommand): Promise<AcceptanceDecisionOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const opened = await tx.transportCommercialAcceptance.upsert({
          where: { runId: command.runId },
          create: {
            runId: command.runId,
            state: projectedStateOf(command),
            counterpartyId: command.counterpartyId,
            businessDate: command.businessDate,
            openedBy: command.decidedBy,
          },
          /*
           * `update: {}` CO Y RONG o buoc nay. Hinh chieu chi duoc doi SAU khi hang quyet dinh ghi
           * thanh cong — neu doi truoc, mot lan phat lai (cung `idempotencyKey`) se sua trang thai
           * ho so ma khong them mot quyet dinh nao, tuc mot lan bam lap lai lam doi trang thai.
           */
          update: {},
        });

        const replay = await tx.transportCommercialAcceptanceDecision.findFirst({
          where: { acceptanceId: opened.id, idempotencyKey: command.idempotencyKey },
        });
        if (replay) {
          return { acceptance: toAcceptance(opened), decision: toDecision(replay), replayed: true };
        }

        const sequence =
          (await tx.transportCommercialAcceptanceDecision.count({
            where: { acceptanceId: opened.id },
          })) + 1;

        const decision = await tx.transportCommercialAcceptanceDecision.create({
          data: {
            acceptanceId: opened.id,
            sequence,
            outcome: command.outcome,
            reasonCode: command.reasonCode,
            basis: command.basis,
            evidenceRefs: [...command.evidenceRefs],
            externalNote: command.externalNote,
            supersedesId: command.supersedesId,
            idempotencyKey: command.idempotencyKey,
            decidedBy: command.decidedBy,
            decidedAt: command.decidedAt,
          },
        });

        const acceptance = await tx.transportCommercialAcceptance.update({
          where: { id: opened.id },
          data: {
            state: projectedStateOf(command),
            latestDecisionId: decision.id,
            // Mot lan khai `null` KHONG xoa phap nhan da co — xem ban trong bo nho.
            ...(command.counterpartyId === null ? {} : { counterpartyId: command.counterpartyId }),
          },
        });

        return {
          acceptance: toAcceptance(acceptance),
          decision: toDecision(decision),
          replayed: false,
        };
      });
    } catch (error) {
      if (
        isUniqueViolationOn(error, ACCEPTANCE_DECISION_SEQUENCE) ||
        isUniqueViolationOn(error, ACCEPTANCE_DECISION_IDEMPOTENCY)
      ) {
        throw TransportDomainError.conflict(
          'ACCEPTANCE_DECISION_SEQUENCE_CONFLICT',
          'Co nguoi vua ghi mot quyet dinh cho ho so nay — hay tai lai roi quyet lai',
        );
      }
      throw error;
    }
  }
}
