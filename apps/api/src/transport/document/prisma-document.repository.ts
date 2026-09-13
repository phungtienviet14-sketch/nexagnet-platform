import { Injectable } from '@nestjs/common';
import type { TransportOperationalDocument as PrismaDocument } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import {
  DocumentAlreadyWithdrawnError,
  OperationalDocumentRepository,
  type CreateDocumentInput,
  type WithdrawDocumentInput,
} from './document.repository.js';
import type { OperationalDocument, OperationalDocumentType } from './document.types.js';

/**
 * Hien thuc Postgres cua kho chung tu.
 *
 * KHONG bat `P2002` o day — hai unique cua bang nay mang HAI y nghia nghiep vu khac han nhau (mot
 * lan gui lai, va mot ma tep bi gan hai lan), va viec dich chung thanh cau nguoi dung hieu la viec
 * cua `OperationalDocumentService`.
 *
 * `withdraw()` ghi bang `updateMany` co DIEU KIEN `status: 'ACTIVE'`: hai lan bia mo cung luc thi
 * ban thu hai sua zero hang va bao ra ngoai, thay vi ghi de len gio bia va ten nguoi bia that.
 */
@Injectable()
export class PrismaOperationalDocumentRepository extends OperationalDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateDocumentInput): Promise<OperationalDocument> {
    const row = await this.prisma.transportOperationalDocument.create({
      data: {
        type: input.type,
        runId: input.runId,
        legId: input.legId,
        orderId: input.orderId,
        checkpointId: input.checkpointId,
        counterpartySiteId: input.counterpartySiteId,
        driverId: input.driverId,
        recordedBy: input.recordedBy,
        basis: input.basis,
        fileId: input.fileId,
        externalNote: input.externalNote,
        label: input.label,
        captureMode: input.captureMode,
        clientEventId: input.clientEventId,
        receivedAt: input.receivedAt,
        businessDate: input.businessDate,
      },
    });
    return toDomain(row);
  }

  async withdraw(input: WithdrawDocumentInput): Promise<OperationalDocument> {
    const current = await this.prisma.transportOperationalDocument.findUnique({
      where: { id: input.documentId },
    });
    if (current === null) throw new DocumentAlreadyWithdrawnError(input.documentId);

    const outcome = await this.prisma.transportOperationalDocument.updateMany({
      where: { id: input.documentId, status: 'ACTIVE' },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: input.withdrawnAt,
        withdrawnBy: input.withdrawnBy,
        label: current.label === null ? input.reason : `${current.label} - ${input.reason}`,
      },
    });
    if (outcome.count === 0) throw new DocumentAlreadyWithdrawnError(input.documentId);

    const row = await this.prisma.transportOperationalDocument.findUnique({
      where: { id: input.documentId },
    });
    if (row === null) throw new DocumentAlreadyWithdrawnError(input.documentId);
    return toDomain(row);
  }

  async find(documentId: string): Promise<OperationalDocument | null> {
    const row = await this.prisma.transportOperationalDocument.findUnique({
      where: { id: documentId },
    });
    return row ? toDomain(row) : null;
  }

  async findByEvent(
    runId: string,
    type: OperationalDocumentType,
    clientEventId: string,
  ): Promise<OperationalDocument | null> {
    const row = await this.prisma.transportOperationalDocument.findFirst({
      where: { runId, type, clientEventId },
    });
    return row ? toDomain(row) : null;
  }

  async listForRun(runId: string): Promise<readonly OperationalDocument[]> {
    return this.list({ runId });
  }

  async listForLeg(legId: string): Promise<readonly OperationalDocument[]> {
    return this.list({ legId });
  }

  async listForOrder(orderId: string): Promise<readonly OperationalDocument[]> {
    return this.list({ orderId });
  }

  async listForDriver(driverId: string): Promise<readonly OperationalDocument[]> {
    return this.list({ driverId });
  }

  async listActiveWithLeg(): Promise<readonly OperationalDocument[]> {
    return this.list({ status: 'ACTIVE', legId: { not: null } });
  }

  private async list(where: Record<string, unknown>): Promise<readonly OperationalDocument[]> {
    const rows = await this.prisma.transportOperationalDocument.findMany({
      where,
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map(toDomain);
  }
}

const toDomain = (row: PrismaDocument): OperationalDocument => ({
  id: row.id,
  type: row.type,
  runId: row.runId,
  legId: row.legId,
  orderId: row.orderId,
  checkpointId: row.checkpointId,
  counterpartySiteId: row.counterpartySiteId,
  driverId: row.driverId,
  recordedBy: row.recordedBy,
  basis: row.basis,
  fileId: row.fileId,
  externalNote: row.externalNote,
  label: row.label,
  captureMode: row.captureMode,
  status: row.status,
  clientEventId: row.clientEventId,
  receivedAt: row.receivedAt,
  withdrawnAt: row.withdrawnAt,
  withdrawnBy: row.withdrawnBy,
  extractionCandidate: row.extractionCandidate,
  extractionProvider: row.extractionProvider,
  businessDate: row.businessDate as BusinessDate,
  createdAt: row.createdAt,
});
