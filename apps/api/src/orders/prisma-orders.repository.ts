import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { OrderView } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import { OrdersRepository } from './orders.repository.js';

/**
 * Repository don tren Postgres (Prisma) — bat khi PERSISTENCE=prisma.
 * Round-trip qua cot `view` (Json) de KHONG mat field OrderView (priced/trace/confidence long nhau).
 * Cac cot scalar (status/chatId/intent/dealerName/grandTotal/erpCode) la ban denormalize
 * de truy van/loc/bao cao sau nay.
 */
@Injectable()
export class PrismaOrdersRepository extends OrdersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(view: OrderView): Promise<OrderView> {
    await this.prisma.order.create({ data: this.toRow(view) });
    return view;
  }

  async list(): Promise<OrderView[]> {
    const rows = await this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => r.view as unknown as OrderView);
  }

  async findById(id: string): Promise<OrderView | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row?.view ? (row.view as unknown as OrderView) : null;
  }

  async update(id: string, patch: Partial<OrderView>): Promise<OrderView | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    if (!row?.view) return null;
    const next: OrderView = { ...(row.view as unknown as OrderView), ...patch };
    await this.prisma.order.update({ where: { id }, data: this.toRow(next) });
    return next;
  }

  /**
   * `update` + mot viec khac trong CUNG mot giao dich Postgres — xem `TurnRecordsRepository`.
   *
   * `work` chay SAU lan ghi don co chu y: hang outbox chi co nghia khi thay doi nghiep vu da
   * nam trong cung giao dich do. Neu `work` nem, ca hai cung bi cuon lai — dung hanh vi can:
   * khong bao gio co mot don da `sent` ma viec theo doi cua no bien mat.
   */
  override readonly updateWithin = async <T>(
    id: string,
    patch: Partial<OrderView>,
    work: (tx: unknown) => Promise<T>,
  ): Promise<{ view: OrderView | null; result: T }> => {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.order.findUnique({ where: { id } });
      if (!row?.view) return { view: null, result: await work(tx) };
      const next: OrderView = { ...(row.view as unknown as OrderView), ...patch };
      await tx.order.update({ where: { id }, data: this.toRow(next) });
      return { view: next, result: await work(tx) };
    });
  };

  /** OrderView -> hang Order: `view` giu ban day du; scalar de truy van. */
  private toRow(view: OrderView): Prisma.OrderUncheckedCreateInput {
    return {
      id: view.id,
      status: view.status,
      intent: view.intent,
      senderType: view.senderType ?? 'unknown',
      chatId: view.chatId,
      rawText: view.rawText,
      dealerName: view.dealerName ?? null,
      groupName: view.groupName ?? null,
      grandTotal: view.priced?.grandTotal ?? null,
      erpCode: view.erpCode ?? null,
      ruleConfigVersion: view.ruleConfigVersion ?? null,
      createdAt: new Date(view.createdAt),
      view: view as unknown as Prisma.InputJsonValue,
    };
  }
}
