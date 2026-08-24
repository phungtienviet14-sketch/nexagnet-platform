import { Injectable } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';

/**
 * CONG GHI CUA MOT LUOT — trung tinh ve nghiep vu.
 *
 * Moi tin di qua pipeline deu sinh MOT ban ghi o day, bat ke y dinh la gi: hoi san pham, hoi bao
 * hanh, hay dat don. `MessagesController` tra ve CA kho nay, con `OrdersService.listOrders()` moi loc
 * `intent === 'dat_don'` — tuc "don" luon la mot GOC NHIN cua sales-order tren kho luot, khong
 * phai chinh kho.
 *
 * Truoc 24/08/2026 cong nay ten la `OrdersRepository` va thuoc `sales-order`, nen mot khach khong
 * ban hang khong the luu duoc mot luot nao. Ten kieu du lieu (`OrderView`) va bang Postgres
 * (`Order`) GIU NGUYEN co chu y: doi chung la mot cuoc di tru du lieu, khong phai mot ranh gioi.
 */
export abstract class TurnRecordsRepository {
  abstract create(view: OrderView): Promise<OrderView>;
  abstract list(): Promise<OrderView[]>;
  abstract findById(id: string): Promise<OrderView | null>;
  abstract update(id: string, patch: Partial<OrderView>): Promise<OrderView | null>;
}

/** Kho luot trong bo nho — mac dinh cua demo/CI (`PERSISTENCE=memory`). */
@Injectable()
export class InMemoryTurnRecordsRepository extends TurnRecordsRepository {
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
