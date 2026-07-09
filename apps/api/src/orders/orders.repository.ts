import { Injectable } from '@nestjs/common';
import type { OrderView } from '@ultty/shared';

/**
 * Repository pattern (patterns.md) — boc luu tru don. Async de GD1 thay bang
 * Prisma/Postgres qua useClass ma khong dung service goi no. Demo mac dinh in-memory.
 */
export abstract class OrdersRepository {
  abstract create(view: OrderView): Promise<OrderView>;
  abstract list(): Promise<OrderView[]>;
  abstract findById(id: string): Promise<OrderView | null>;
  abstract update(id: string, patch: Partial<OrderView>): Promise<OrderView | null>;
}

@Injectable()
export class InMemoryOrdersRepository extends OrdersRepository {
  private readonly store = new Map<string, OrderView>();

  async create(view: OrderView): Promise<OrderView> {
    this.store.set(view.id, view);
    return view;
  }

  async list(): Promise<OrderView[]> {
    // Moi nhat truoc
    return [...this.store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<OrderView | null> {
    return this.store.get(id) ?? null;
  }

  async update(id: string, patch: Partial<OrderView>): Promise<OrderView | null> {
    const current = this.store.get(id);
    if (!current) return null;
    const next: OrderView = { ...current, ...patch };
    this.store.set(id, next);
    return next;
  }
}
