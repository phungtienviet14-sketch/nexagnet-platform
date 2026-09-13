import { Injectable } from '@nestjs/common';
import type { TransportDriverWaitingAllowance as PrismaAllowance } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import {
  WaitingAllowanceAlreadyDecidedError,
  WaitingAllowanceRepository,
  type ApprovedWaitingAllowanceTotal,
  type CreateWaitingAllowanceInput,
  type DecideWaitingAllowanceInput,
} from './allowance.repository.js';
import type { DriverWaitingAllowance, WaitingAllowanceStatus } from './allowance.types.js';

/**
 * Hien thuc Postgres cua kho phu cap cho.
 *
 * KHONG bat `P2002` o day — hai unique cua bang nay mang HAI y nghia nghiep vu khac han nhau (mot
 * lan bam `Duyet` gui lai, va hai khoan cung duoc duyet tren mot phien), va viec dich chung thanh
 * cau nguoi dung hieu la viec cua `WaitingAllowanceService`.
 *
 * `decide()` ghi bang mot `updateMany` co DIEU KIEN `status: 'PENDING'`, khong bang `update({ where:
 * { id } })`. Hai lan quyet cung luc thi ban thu hai sua zero hang va bao ra ngoai, thay vi ghi de
 * len mot quyet dinh nguoi kia chua he nhin thay.
 *
 * `BigInt` -> `number`: `GD-03` gioi han so tien o mot ty dong (`..._amount_range`), nen moi gia
 * tri hop le deu nam gon trong `Number.MAX_SAFE_INTEGER`. Doi ngoai vung do la mot hang KHONG GHI
 * DUOC, khong phai mot hang doc sai.
 */
@Injectable()
export class PrismaWaitingAllowanceRepository extends WaitingAllowanceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateWaitingAllowanceInput): Promise<DriverWaitingAllowance> {
    const row = await this.prisma.transportDriverWaitingAllowance.create({
      data: {
        waitingSessionId: input.waitingSessionId,
        driverId: input.driverId,
        currencyCode: input.currencyCode,
        candidateAmount: BigInt(input.candidateAmount),
        reason: input.reason,
        proposedBy: input.proposedBy,
        proposedAt: input.proposedAt,
        businessDate: input.businessDate,
      },
    });
    return toDomain(row);
  }

  async decide(input: DecideWaitingAllowanceInput): Promise<DriverWaitingAllowance> {
    const outcome = await this.prisma.transportDriverWaitingAllowance.updateMany({
      where: { id: input.allowanceId, status: 'PENDING' },
      data: {
        status: input.outcome,
        approvedAmount: input.approvedAmount === null ? null : BigInt(input.approvedAmount),
        decidedBy: input.decidedBy,
        decidedAt: input.decidedAt,
        decisionNote: input.decisionNote,
        decisionIdempotencyKey: input.decisionIdempotencyKey,
      },
    });
    if (outcome.count === 0) throw new WaitingAllowanceAlreadyDecidedError(input.allowanceId);

    const row = await this.prisma.transportDriverWaitingAllowance.findUnique({
      where: { id: input.allowanceId },
    });
    if (row === null) throw new WaitingAllowanceAlreadyDecidedError(input.allowanceId);
    return toDomain(row);
  }

  async find(allowanceId: string): Promise<DriverWaitingAllowance | null> {
    const row = await this.prisma.transportDriverWaitingAllowance.findUnique({
      where: { id: allowanceId },
    });
    return row ? toDomain(row) : null;
  }

  async findByDecisionKey(key: string): Promise<DriverWaitingAllowance | null> {
    const row = await this.prisma.transportDriverWaitingAllowance.findUnique({
      where: { decisionIdempotencyKey: key },
    });
    return row ? toDomain(row) : null;
  }

  async listForSession(waitingSessionId: string): Promise<readonly DriverWaitingAllowance[]> {
    const rows = await this.prisma.transportDriverWaitingAllowance.findMany({
      where: { waitingSessionId },
      orderBy: { proposedAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listByStatus(status: WaitingAllowanceStatus): Promise<readonly DriverWaitingAllowance[]> {
    const rows = await this.prisma.transportDriverWaitingAllowance.findMany({
      where: { status },
      orderBy: { proposedAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  /**
   * Tong theo lai xe, GOM O POSTGRES chu khong o Node.
   *
   * Mot ky luong co the trai tren hang nghin hang. Keo tat ca ve roi cong bang `reduce` se lam mot
   * lan chay luong doc ca bang — va con so cuoi cung van the, chi cham hon va ton bo nho hon.
   */
  async approvedTotalsBetween(
    startDate: string,
    endDate: string,
  ): Promise<readonly ApprovedWaitingAllowanceTotal[]> {
    const rows = await this.prisma.transportDriverWaitingAllowance.groupBy({
      by: ['driverId'],
      where: { status: 'APPROVED', businessDate: { gte: startDate, lte: endDate } },
      _sum: { approvedAmount: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      driverId: row.driverId,
      totalAmount: Number(row._sum.approvedAmount ?? 0n),
      count: row._count._all,
    }));
  }
}

const toDomain = (row: PrismaAllowance): DriverWaitingAllowance => ({
  id: row.id,
  waitingSessionId: row.waitingSessionId,
  driverId: row.driverId,
  status: row.status,
  currencyCode: row.currencyCode,
  candidateAmount: Number(row.candidateAmount),
  approvedAmount: row.approvedAmount === null ? null : Number(row.approvedAmount),
  reason: row.reason,
  proposedBy: row.proposedBy,
  proposedAt: row.proposedAt,
  decidedBy: row.decidedBy,
  decidedAt: row.decidedAt,
  decisionNote: row.decisionNote,
  decisionIdempotencyKey: row.decisionIdempotencyKey,
  businessDate: row.businessDate as BusinessDate,
  createdAt: row.createdAt,
});
