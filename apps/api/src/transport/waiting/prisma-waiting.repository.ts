import { Injectable } from '@nestjs/common';
import type { TransportDeliveryWaitingSession as PrismaWaitingSession } from '@prisma/client';
import type { BusinessDate } from '../business-date.js';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  WaitingSessionAlreadyClosedError,
  WaitingSessionRepository,
  type CloseWaitingSessionInput,
  type CreateWaitingSessionInput,
} from './waiting.repository.js';
import type { DeliveryWaitingSession } from './waiting.types.js';

/**
 * Hien thuc Postgres cua kho phien cho.
 *
 * KHONG bat `P2002` o day — hai unique cua bang nay mang HAI y nghia nghiep vu khac han nhau (mot
 * lan gui lai, va hai lan bam cung luc tren mot chang), va viec dich chung thanh cau nguoi dung
 * hieu la viec cua `WaitingSessionService`. Cung quy uoc voi `PrismaCheckpointRepository`.
 *
 * `close()` ghi bang mot `updateMany` co DIEU KIEN `status: 'OPEN'`, khong bang `update({ where:
 * { id } })`. Khac biet nay khong vun vat: hai lan dong cung luc thi ban thu hai se sua zero hang
 * va bao ra ngoai, thay vi ghi de len gio dong that. Trigger
 * `transport_waiting_session_immutable` chan cung dieu do o mot tang thap hon, nhung mot loi
 * `P0001` cua trigger doc kho hon mot con so `count = 0`.
 */
@Injectable()
export class PrismaWaitingSessionRepository extends WaitingSessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateWaitingSessionInput): Promise<DeliveryWaitingSession> {
    const row = await this.prisma.transportDeliveryWaitingSession.create({
      data: {
        runId: input.runId,
        legId: input.legId,
        driverId: input.driverId,
        arrivalCheckpointId: input.arrivalCheckpointId,
        reason: input.reason,
        startedAt: input.startedAt,
        startedBy: input.startedBy,
        startClientEventId: input.startClientEventId,
        note: input.note,
        businessDate: input.businessDate,
      },
    });
    return toDomain(row);
  }

  async close(input: CloseWaitingSessionInput): Promise<DeliveryWaitingSession> {
    const outcome = await this.prisma.transportDeliveryWaitingSession.updateMany({
      where: { id: input.sessionId, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        endedAt: input.endedAt,
        endedBy: input.endedBy,
        closeReason: input.closeReason,
        closingCheckpointId: input.closingCheckpointId,
        closeNote: input.closeNote,
      },
    });
    if (outcome.count === 0) {
      throw new WaitingSessionAlreadyClosedError(input.sessionId);
    }

    const row = await this.prisma.transportDeliveryWaitingSession.findUnique({
      where: { id: input.sessionId },
    });
    if (row === null) throw new WaitingSessionAlreadyClosedError(input.sessionId);
    return toDomain(row);
  }

  async find(sessionId: string): Promise<DeliveryWaitingSession | null> {
    const row = await this.prisma.transportDeliveryWaitingSession.findUnique({
      where: { id: sessionId },
    });
    return row ? toDomain(row) : null;
  }

  async findByEvent(
    legId: string,
    startClientEventId: string,
  ): Promise<DeliveryWaitingSession | null> {
    const row = await this.prisma.transportDeliveryWaitingSession.findFirst({
      where: { legId, startClientEventId },
    });
    return row ? toDomain(row) : null;
  }

  async findOpenForLeg(legId: string): Promise<DeliveryWaitingSession | null> {
    const row = await this.prisma.transportDeliveryWaitingSession.findFirst({
      where: { legId, status: 'OPEN' },
    });
    return row ? toDomain(row) : null;
  }

  async listForRun(runId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.list({ runId });
  }

  async listForLeg(legId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.list({ legId });
  }

  async listForDriver(driverId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.list({ driverId });
  }

  async listOpen(): Promise<readonly DeliveryWaitingSession[]> {
    return this.list({ status: 'OPEN' });
  }

  private async list(where: Record<string, unknown>): Promise<readonly DeliveryWaitingSession[]> {
    const rows = await this.prisma.transportDeliveryWaitingSession.findMany({
      where,
      orderBy: { startedAt: 'asc' },
    });
    return rows.map(toDomain);
  }
}

const toDomain = (row: PrismaWaitingSession): DeliveryWaitingSession => ({
  id: row.id,
  runId: row.runId,
  legId: row.legId,
  driverId: row.driverId,
  arrivalCheckpointId: row.arrivalCheckpointId,
  closingCheckpointId: row.closingCheckpointId,
  status: row.status,
  reason: row.reason,
  closeReason: row.closeReason,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  startedBy: row.startedBy,
  endedBy: row.endedBy,
  startClientEventId: row.startClientEventId,
  note: row.note,
  closeNote: row.closeNote,
  businessDate: row.businessDate as BusinessDate,
  createdAt: row.createdAt,
});
