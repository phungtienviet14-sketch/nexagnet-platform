import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  CASHOUT_CORRELATION_KEY,
  CASHOUT_ONE_REVERSAL_PER_TARGET,
} from './driver-settlement-storage-conflict.js';
import {
  DriverSettlementRepository,
  type RecordCashoutInput,
  type RecordCashoutOutcome,
} from './driver-settlement.repository.js';
import type {
  DriverCashout,
  DriverCashoutAllocation,
  DriverCashoutDetail,
} from './driver-settlement.types.js';

/**
 * Kho POSTGRES cua `TX-07b`.
 *
 * `model()` truy cap Prisma qua mot chi muc chuoi thay vi kieu sinh ra, cung quy uoc voi cac
 * repository van tai khac: tang nay CO Y khong phu thuoc vao ban `@prisma/client` da sinh, de mot
 * lan `prisma generate` chua chay khong lam ca cay kieu do len.
 */

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toCashout = (row: any): DriverCashout => ({
  id: row.id,
  driverId: row.driverId,
  kind: row.kind,
  status: row.status,
  businessDate: row.businessDate,
  currencyCode: row.currencyCode,
  method: row.method,
  reference: row.reference,
  reversesId: row.reversesId,
  reversalReason: row.reversalReason,
  note: row.note,
  correlationKey: row.correlationKey,
  recordedBy: row.recordedBy,
  createdAt: row.createdAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toAllocation = (row: any): DriverCashoutAllocation => ({
  id: row.id,
  cashoutId: row.cashoutId,
  source: row.source,
  amount: fromStoredAmount(row.amount) ?? 0,
  payslipId: row.payslipId,
  driverFundEntryId: row.driverFundEntryId,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toDetail = (row: any): DriverCashoutDetail => ({
  cashout: toCashout(row),
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  allocations: (row.allocations ?? []).map((allocation: any) => toAllocation(allocation)),
});

const WITH_ALLOCATIONS = { allocations: { orderBy: { createdAt: 'asc' as const } } };

/**
 * LOI NOI BO de huy giao dich va mang theo ket cuc — khong bao gio ra khoi tep nay.
 *
 * Can thiet vi `$transaction` chi huy khi co ngoai le nem ra; tra ve mot gia tri "that bai" tu ben
 * trong se COMMIT ban ghi dang do. Va ket cuc phai di kem: nguoi goi can phan biet "ban goc khong
 * ton tai" voi "ban goc da bi dao roi".
 */
class CashoutReversalTargetError extends Error {
  constructor(readonly outcome: 'ALREADY_REVERSED' | 'TARGET_NOT_FOUND') {
    super(`Khong dao duoc lan chi: ${outcome}`);
    this.name = 'CashoutReversalTargetError';
  }
}

@Injectable()
export class PrismaDriverSettlementRepository extends DriverSettlementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * MOT giao dich cho ca ba viec: dua ban goc sang `REVERSED`, ghi phieu moi, ghi cac dong.
   *
   * Lenh cap nhat ban goc co dieu kien `status: 'POSTED'` NGAY TRONG `where`, chu khong doc truoc
   * roi ghi sau. Hai nguoi bam "dao" cung luc thi nguoi thu hai cap nhat 0 hang va ca giao dich bi
   * huy — thay vi ghi ra hai phieu dao cho cung mot ban goc. Unique `..._reversesId_key` la lop
   * thu hai cua cung mot bat bien.
   */
  async record(input: RecordCashoutInput): Promise<RecordCashoutOutcome> {
    try {
      const created = await this.prisma.$transaction(
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        async (tx: any) => {
          if (input.reversesId !== null) {
            const updated = await tx.transportDriverCashout.updateMany({
              where: { id: input.reversesId, status: 'POSTED' },
              data: { status: 'REVERSED' },
            });
            if (updated.count === 0) {
              const target = await tx.transportDriverCashout.findUnique({
                where: { id: input.reversesId },
              });
              throw new CashoutReversalTargetError(
                target ? 'ALREADY_REVERSED' : 'TARGET_NOT_FOUND',
              );
            }
          }

          return tx.transportDriverCashout.create({
            data: {
              driverId: input.driverId,
              kind: input.kind,
              status: 'POSTED',
              businessDate: input.businessDate,
              currencyCode: input.currencyCode,
              method: input.method,
              reference: input.reference,
              reversesId: input.reversesId,
              reversalReason: input.reversalReason,
              note: input.note,
              correlationKey: input.correlationKey,
              recordedBy: input.recordedBy,
              createdAt: input.at,
              allocations: {
                create: input.allocations.map((allocation) => ({
                  source: allocation.source,
                  amount: toStoredAmount(allocation.amount),
                  payslipId: allocation.payslipId,
                  driverFundEntryId: allocation.driverFundEntryId,
                  note: allocation.note,
                  createdAt: input.at,
                })),
              },
            },
            include: WITH_ALLOCATIONS,
          });
        },
      );

      return { kind: 'RECORDED', detail: toDetail(created) };
    } catch (error) {
      if (error instanceof CashoutReversalTargetError) return { kind: error.outcome };

      if (isUniqueViolationOn(error, CASHOUT_CORRELATION_KEY)) {
        const existing = await this.findByCorrelation(input.correlationKey);
        if (existing) return { kind: 'DUPLICATE_KEY', existing };
      }
      if (isUniqueViolationOn(error, CASHOUT_ONE_REVERSAL_PER_TARGET)) {
        return { kind: 'ALREADY_REVERSED' };
      }
      throw error;
    }
  }

  async find(id: string): Promise<DriverCashoutDetail | null> {
    const row = await model(this.prisma, 'transportDriverCashout').findUnique({
      where: { id },
      include: WITH_ALLOCATIONS,
    });
    return row ? toDetail(row) : null;
  }

  async findByCorrelation(correlationKey: string): Promise<DriverCashoutDetail | null> {
    const row = await model(this.prisma, 'transportDriverCashout').findUnique({
      where: { correlationKey },
      include: WITH_ALLOCATIONS,
    });
    return row ? toDetail(row) : null;
  }

  async listByDriver(driverId: string): Promise<DriverCashoutDetail[]> {
    const rows = await model(this.prisma, 'transportDriverCashout').findMany({
      where: { driverId },
      include: WITH_ALLOCATIONS,
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }],
    });
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return rows.map((row: any) => toDetail(row));
  }
}
