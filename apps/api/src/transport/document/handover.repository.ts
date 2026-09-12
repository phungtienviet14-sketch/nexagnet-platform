import { randomUUID } from 'node:crypto';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type { PhysicalReceiptHandover, ReceiptHandoverState } from './handover.types.js';

/**
 * HAI UNIQUE cua ban giao bien nhan.
 *
 * `#279` O12 doi rang mot buoc ban giao *"cannot be forged by caller-supplied actor/time"* — do la
 * viec cua bien vao. Hai khoa duoi day lo mot viec khac: mot buoc khong duoc ghi HAI LAN.
 */

/** Mot lan bam gui lai khong ghi hai buoc — `#279` O10. */
export const HANDOVER_CLIENT_EVENT: UniqueIndexRef = {
  indexName: 'TransportPhysicalReceiptHandover_order_event_key',
  model: 'TransportPhysicalReceiptHandover',
  column: 'clientEventId',
};

/**
 * MOT DON, MOT BUOC, MOT LAN.
 *
 * Khac khoa tren: khoa kia chan hai lan bam CUNG mot lenh; cai nay chan hai nguoi cung ghi
 * `RETURNED_TO_OFFICE` cho mot don vao hai luc khac nhau. Buoc thu hai khong them mot su that nao —
 * no chi lam chuoi ban giao doc ra nhu the to giay ve hai lan.
 */
export const HANDOVER_STATE_ONCE: UniqueIndexRef = {
  indexName: 'TransportPhysicalReceiptHandover_order_state_key',
  model: 'TransportPhysicalReceiptHandover',
  column: 'state',
};

export interface CreateHandoverInput {
  readonly orderId: string;
  readonly sequence: number;
  readonly state: ReceiptHandoverState;
  readonly legId: string | null;
  readonly documentId: string | null;
  readonly externalNote: string | null;
  readonly driverId: string | null;
  readonly recordedBy: string;
  readonly recordedAt: Date;
  readonly clientEventId: string;
  readonly note: string | null;
  readonly businessDate: string;
}

/**
 * KHO BAN GIAO — chi GHI THEM va DOC.
 *
 * Khong co `update`, khong co `delete`, va do la mot khang dinh chu khong mot thieu sot: mot chuoi
 * ban giao la lich su cua mot to giay that di qua may ban tay. Ghi nham thi ghi mot buoc dinh
 * chinh. Tang luu tru cuong che them mot lan bang trigger
 * `transport_physical_receipt_handover_append_only`.
 */
export abstract class PhysicalReceiptHandoverRepository {
  abstract create(input: CreateHandoverInput): Promise<PhysicalReceiptHandover>;
  abstract findByEvent(
    orderId: string,
    clientEventId: string,
  ): Promise<PhysicalReceiptHandover | null>;
  abstract listForOrder(orderId: string): Promise<readonly PhysicalReceiptHandover[]>;
  /** Nhung don DA co mot buoc ban giao — nguon cua dong thoi gian van hanh (`#279` O11). */
  abstract listForOrders(
    orderIds: readonly string[],
  ): Promise<readonly PhysicalReceiptHandover[]>;
  /** Chung tu nay da duoc ban giao ve van phong chua — bien bat bien cua `#279` O2. */
  abstract isDocumentHandedOver(documentId: string): Promise<boolean>;
}

/** Va cham unique gia lap, de duong trong-bo-nho hong GIONG duong Postgres. */
class InMemoryUniqueViolation extends Error {
  readonly code = 'P2002';
  readonly meta: { modelName: string; target: string[] };

  constructor(index: UniqueIndexRef) {
    super(`Unique constraint failed on the fields: (\`${index.column}\`)`);
    this.name = 'InMemoryUniqueViolation';
    this.meta = { modelName: index.model, target: [index.column] };
  }
}

export class InMemoryPhysicalReceiptHandoverRepository extends PhysicalReceiptHandoverRepository {
  private readonly rows: PhysicalReceiptHandover[] = [];

  async create(input: CreateHandoverInput): Promise<PhysicalReceiptHandover> {
    const duplicateEvent = this.rows.find(
      (row) => row.orderId === input.orderId && row.clientEventId === input.clientEventId,
    );
    if (duplicateEvent) throw new InMemoryUniqueViolation(HANDOVER_CLIENT_EVENT);

    const duplicateState = this.rows.find(
      (row) => row.orderId === input.orderId && row.state === input.state,
    );
    if (duplicateState) throw new InMemoryUniqueViolation(HANDOVER_STATE_ONCE);

    const row: PhysicalReceiptHandover = {
      id: randomUUID(),
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
      createdAt: input.recordedAt,
    };
    this.rows.push(row);
    return row;
  }

  async findByEvent(
    orderId: string,
    clientEventId: string,
  ): Promise<PhysicalReceiptHandover | null> {
    return (
      this.rows.find(
        (row) => row.orderId === orderId && row.clientEventId === clientEventId,
      ) ?? null
    );
  }

  async listForOrder(orderId: string): Promise<readonly PhysicalReceiptHandover[]> {
    return this.rows
      .filter((row) => row.orderId === orderId)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async listForOrders(
    orderIds: readonly string[],
  ): Promise<readonly PhysicalReceiptHandover[]> {
    return this.rows
      .filter((row) => orderIds.includes(row.orderId))
      .sort((left, right) => left.sequence - right.sequence);
  }

  async isDocumentHandedOver(documentId: string): Promise<boolean> {
    return this.rows.some(
      (row) => row.documentId === documentId && row.state !== 'WITH_DRIVER',
    );
  }
}
