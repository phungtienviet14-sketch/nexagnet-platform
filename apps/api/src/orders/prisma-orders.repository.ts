import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { OrderView } from '@netviet/shared';
import { PrismaService } from '../config/prisma.service.js';
import { OrdersRepository } from './orders.repository.js';
import type { CompareAndSetDecision } from '../turns/turn-records.repository.js';

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
   * DOC — QUYET DINH — GHI nguyen tu, bang KHOA HANG cua Postgres.
   *
   * `SELECT ... FOR UPDATE` la phan quan trong nhat, khong phai `$transaction`. Chi boc hai lan
   * di DB vao mot giao dich thi VAN HONG: muc co lap mac dinh la `READ COMMITTED`, nen hai giao
   * dich cung doc duoc hang cu roi ca hai cung ghi de. Do duoc that truoc ban vá — 5 lan goi
   * song song ra 5 lan danh dau.
   *
   * `FOR UPDATE` bat giao dich thu hai CHO cho toi khi giao dich thu nhat commit, roi no doc lai
   * hang MOI. Nho vay `decide` cua no nhin thay dau vet ma ben kia vua ghi va tra `commit: false`.
   *
   * Doc `view` bang truy van THO vi dieu kien nam trong cot JSON; sau do van ghi qua Prisma de
   * `toRow()` giu dong bo cac cot scalar da denormalize.
   */
  override readonly compareAndSet = async <T>(
    id: string,
    decide: (current: OrderView) => CompareAndSetDecision<T>,
  ): Promise<{ view: OrderView; result: T } | null> => {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ view: unknown }>>`
        SELECT "view" FROM "Order" WHERE "id" = ${id} FOR UPDATE
      `;
      const current = locked[0]?.view as OrderView | undefined;
      if (!current) return null;

      const decision = decide(current);
      if (!decision.commit) return { view: current, result: decision.result };

      const next: OrderView = { ...current, ...decision.patch };
      await tx.order.update({ where: { id }, data: this.toRow(next) });
      return { view: next, result: decision.result };
    });
  };

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
