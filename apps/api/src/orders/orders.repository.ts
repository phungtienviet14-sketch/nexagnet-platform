import { Injectable } from '@nestjs/common';
import type { OrderView } from '@ultty/shared';

/**
 * Repository pattern (patterns.md) — boc luu tru don. Demo dung in-memory;
 * GD1 thay bang Prisma/Postgres qua useClass ma khong dung service goi no.
 */
export abstract class OrdersRepository {
  abstract create(view: OrderView): OrderView;
  abstract list(): OrderView[];
  abstract findById(id: string): OrderView | null;
  abstract update(id: string, patch: Partial<OrderView>): OrderView | null;
}

@Injectable()
export class InMemoryOrdersRepository extends OrdersRepository {
  private readonly store = new Map<string, OrderView>();

  create(view: OrderView): OrderView {
    this.store.set(view.id, view);
    return view;
  }

  list(): OrderView[] {
    // Moi nhat truoc
    return [...this.store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findById(id: string): OrderView | null {
    return this.store.get(id) ?? null;
  }

  update(id: string, patch: Partial<OrderView>): OrderView | null {
    const current = this.store.get(id);
    if (!current) return null;
    const next: OrderView = { ...current, ...patch };
    this.store.set(id, next);
    return next;
  }
}
