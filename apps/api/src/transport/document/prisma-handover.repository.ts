import { Injectable } from '@nestjs/common';
import type { TransportPhysicalReceiptHandover as PrismaHandover } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import type { BusinessDate } from '../business-date.js';
import {
  PhysicalReceiptHandoverRepository,
  type CreateHandoverInput,
} from './handover.repository.js';
import type { PhysicalReceiptHandover } from './handover.types.js';

/**
 * Hien thuc Postgres cua kho ban giao bien nhan.
 *
 * KHONG co `update`, KHONG co `delete`, va do la mot khang dinh: trigger
 * `transport_physical_receipt_handover_append_only` chan ca hai o tang Postgres, nen ngay ca mot
 * lenh viet tay tren `psql` cung khong sua duoc mot buoc ban giao da ghi.
 */
@Injectable()
export class PrismaPhysicalReceiptHandoverRepository extends PhysicalReceiptHandoverRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateHandoverInput): Promise<PhysicalReceiptHandover> {
    const row = await this.prisma.transportPhysicalReceiptHandover.create({
      data: {
        orderId: input.orderId,
        sequence: input.sequence,
        state: input.state,
        legId: input.legId,
        documentId: input.documentId,
        externalNote: input.externalNote,
        driverId: input.driverId,
        recordedBy: input.recordedBy,
        recordedAt: input.recordedAt,
        clientEventId: input.clientEventId,
        note: input.note,
        businessDate: input.businessDate,
      },
    });
    return toDomain(row);
  }

  async findByEvent(
    orderId: string,
    clientEventId: string,
  ): Promise<PhysicalReceiptHandover | null> {
    const row = await this.prisma.transportPhysicalReceiptHandover.findFirst({
      where: { orderId, clientEventId },
    });
    return row ? toDomain(row) : null;
  }

  async listForOrder(orderId: string): Promise<readonly PhysicalReceiptHandover[]> {
    const rows = await this.prisma.transportPhysicalReceiptHandover.findMany({
      where: { orderId },
      orderBy: { sequence: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listForOrders(
    orderIds: readonly string[],
  ): Promise<readonly PhysicalReceiptHandover[]> {
    if (orderIds.length === 0) return [];
    const rows = await this.prisma.transportPhysicalReceiptHandover.findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [{ orderId: 'asc' }, { sequence: 'asc' }],
    });
    return rows.map(toDomain);
  }

  /**
   * `state != 'WITH_DRIVER'` — bien bat bien cua `#279` O2/O12 bai 7.
   *
   * Mot to giay CON trong tay lai xe van bia mo duoc: chua ai o van phong doi chieu no. Tu luc no
   * roi khoi tay ho va van phong ghi la da nhan, ban ghi so cua no khong con la mot ban nhap.
   */
  async isDocumentHandedOver(documentId: string): Promise<boolean> {
    const count = await this.prisma.transportPhysicalReceiptHandover.count({
      where: { documentId, state: { not: 'WITH_DRIVER' } },
    });
    return count > 0;
  }
}

const toDomain = (row: PrismaHandover): PhysicalReceiptHandover => ({
  id: row.id,
  orderId: row.orderId,
  sequence: row.sequence,
  state: row.state,
  legId: row.legId,
  documentId: row.documentId,
  externalNote: row.externalNote,
  driverId: row.driverId,
  recordedBy: row.recordedBy,
  recordedAt: row.recordedAt,
  clientEventId: row.clientEventId,
  note: row.note,
  businessDate: row.businessDate as BusinessDate,
  createdAt: row.createdAt,
});
