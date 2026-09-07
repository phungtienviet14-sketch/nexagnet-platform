import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
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
 * Kho TRONG BO NHO cua `TX-07b` — duong `PERSISTENCE=memory`.
 *
 * Giu DUNG nhung bat bien ma ban Prisma giu, va khong hon: khoa chong ghi trung la duy nhat, mot
 * ban goc chi bi dao mot lan, va mot lan chi da ghi khong sua duoc (khong co ham nao lam viec do).
 * Neu ban nay long tay hon thi mot bai test xanh o CI se do o that — dung kieu lech nguy hiem nhat
 * giua hai hien thuc cua cung mot giao dien.
 */
@Injectable()
export class InMemoryDriverSettlementRepository extends DriverSettlementRepository {
  private readonly cashouts = new Map<string, DriverCashout>();
  private readonly allocations = new Map<string, DriverCashoutAllocation[]>();

  async record(input: RecordCashoutInput): Promise<RecordCashoutOutcome> {
    const replay = this.detailByCorrelation(input.correlationKey);
    if (replay) return { kind: 'DUPLICATE_KEY', existing: replay };

    if (input.reversesId !== null) {
      const target = this.cashouts.get(input.reversesId);
      if (!target) return { kind: 'TARGET_NOT_FOUND' };
      if (target.status !== 'POSTED') return { kind: 'ALREADY_REVERSED' };
      this.cashouts.set(target.id, { ...target, status: 'REVERSED' });
    }

    const id = randomUUID();
    const createdAt = input.at.toISOString();
    const cashout: DriverCashout = {
      id,
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
      createdAt,
    };
    this.cashouts.set(id, cashout);
    this.allocations.set(
      id,
      input.allocations.map((allocation) => ({
        id: randomUUID(),
        cashoutId: id,
        source: allocation.source,
        amount: allocation.amount,
        payslipId: allocation.payslipId,
        driverFundEntryId: allocation.driverFundEntryId,
        note: allocation.note,
        createdAt,
      })),
    );

    const detail = this.detail(id);
    if (!detail) throw new Error('Kho trong bo nho khong doc lai duoc lan chi vua ghi');
    return { kind: 'RECORDED', detail };
  }

  async find(id: string): Promise<DriverCashoutDetail | null> {
    return this.detail(id);
  }

  async findByCorrelation(correlationKey: string): Promise<DriverCashoutDetail | null> {
    return this.detailByCorrelation(correlationKey);
  }

  async listByDriver(driverId: string): Promise<DriverCashoutDetail[]> {
    return [...this.cashouts.values()]
      .filter((cashout) => cashout.driverId === driverId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .flatMap((cashout) => {
        const detail = this.detail(cashout.id);
        return detail ? [detail] : [];
      });
  }

  private detailByCorrelation(correlationKey: string): DriverCashoutDetail | null {
    for (const cashout of this.cashouts.values()) {
      if (cashout.correlationKey === correlationKey) return this.detail(cashout.id);
    }
    return null;
  }

  private detail(id: string): DriverCashoutDetail | null {
    const cashout = this.cashouts.get(id);
    if (!cashout) return null;
    return { cashout, allocations: [...(this.allocations.get(id) ?? [])] };
  }
}
