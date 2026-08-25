import { Injectable } from '@nestjs/common';
import type { OrderView } from '@netviet/shared';

/**
 * Phan quyet cua mot lan doc-roi-ghi nguyen tu. `commit: false` = da doc va quyet dinh KHONG ghi
 * — do la mot ket qua hop le, khong phai mot loi.
 */
export type CompareAndSetDecision<T> =
  | { readonly commit: false; readonly result: T }
  | { readonly commit: true; readonly patch: Partial<OrderView>; readonly result: T };

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

  /**
   * DOC — QUYET DINH — GHI, NGUYEN TU tren mot ban ghi.
   *
   * TON TAI DE DONG MOT CHECK-THEN-ACT: `findById()` roi `update()` la hai lan di DB tach roi,
   * nen hai yeu cau chong nhau cung doc duoc trang thai cu va CA HAI cung ghi. Do duoc that
   * (`sales-handoff-concurrency.int.spec.ts`, truoc ban vá): 5 lan goi song song -> 5 lan danh
   * dau, 5 ban ghi audit.
   *
   * MOT `$transaction` THUONG KHONG DU. Postgres mac dinh `READ COMMITTED` nen hai giao dich van
   * doc cung mot anh chup roi ghi de nhau. Hien thuc Postgres o day KHOA HANG (`FOR UPDATE`)
   * truoc khi goi `decide`.
   *
   * `decide` phai la HAM THUAN va DONG BO: mot `await` giua lan doc va lan ghi se mo lai dung cua
   * so vua dong — ke ca o ban trong bo nho (Node don luong nhung `await` van nhuong luot).
   */
  readonly compareAndSet?: <T>(
    id: string,
    decide: (current: OrderView) => CompareAndSetDecision<T>,
  ) => Promise<{ view: OrderView; result: T } | null>;

  /**
   * Mot lan `update` + mot viec khac trong CUNG MOT GIAO DICH.
   *
   * TON TAI DE DONG BAI TOAN GHI HAI NOI: khi mot thay doi nghiep vu phai keo theo mot hang
   * outbox (`WorkflowOutboxRepository.enqueue`), hai lan ghi do KHONG duoc phep tach roi. Ghi
   * don xong roi chet truoc khi ghi outbox = mot viec bien mat ma khong ai biet.
   *
   * TUY CHON co chu y — `undefined` la mot cau tra loi hop le, khong phai mot thieu sot:
   *
   *   Postgres  co giao dich that -> hien thuc no, va `tx` duoc chuyen tiep xuong `enqueue`.
   *   BO NHO    KHONG hien thuc, va khong can: kho nam trong chinh tien trinh, nen khong co
   *             kich ban "don da commit con outbox thi chua". Tien trinh chet la mat ca hai.
   *
   * Ben goi thay `undefined` thi lam tuan tu — xem `OrdersService.performSendConfirmation`.
   *
   * `tx` de `unknown` co chu y, cung ly do voi `WorkflowOutboxTransaction`: cong nay khong duoc
   * biet Prisma ton tai.
   *
   * Khai bang THUOC TINH ham chu khong phai `abstract` co dau `?`: TypeScript van bat mot
   * `abstract` phai duoc hien thuc du co dau hoi, nen ban trong bo nho se khong bien dich. Mot
   * thuoc tinh tuy chon thi hien thuc bang phuong thuc lop van thoa — va `this` van dung, vi no
   * duoc goi qua chinh doi tuong (`this.repo.updateWithin(...)`).
   */

  readonly updateWithin?: <T>(
    id: string,
    patch: Partial<OrderView>,
    work: (tx: unknown) => Promise<T>,
  ) => Promise<{ view: OrderView | null; result: T }>;
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

  /**
   * Nguyen tu vi KHONG co `await` nao giua lan doc va lan ghi: Node chay mot luong, nen doan nay
   * khong the bi cat ngang. Do la ca ly do `decide` bi ep DONG BO o kieu.
   */
  override readonly compareAndSet = async <T>(
    id: string,
    decide: (current: OrderView) => CompareAndSetDecision<T>,
  ): Promise<{ view: OrderView; result: T } | null> => {
    const current = this.store.get(id);
    if (!current) return null;
    const decision = decide(current);
    if (!decision.commit) return { view: current, result: decision.result };
    const next: OrderView = { ...current, ...decision.patch };
    this.store.set(id, next);
    return { view: next, result: decision.result };
  };
}
