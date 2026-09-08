import { randomUUID } from 'node:crypto';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type { RunCheckpoint, RunCheckpointType } from './checkpoint.types.js';

/**
 * HAI UNIQUE cua `transport-checkpoint`. DANH SACH thuoc capability nay, CO CHE nhan dien nam o
 * `../storage-conflict.js` — cung quy uoc voi `proof-storage-conflict.ts`.
 *
 * Ca hai deu khai CA `indexName` LAN cap `(model, column)`, vi Prisma khong phoi ten index ra
 * ngoai ma doi nguoc thanh ten truong.
 */

/** Mot lenh gui lai khong duoc tao moc thu hai — `#243` F7 *"replayed event"*. */
export const CHECKPOINT_CLIENT_EVENT: UniqueIndexRef = {
  indexName: 'TransportRunCheckpoint_run_type_event_key',
  model: 'TransportRunCheckpoint',
  column: 'clientEventId',
};

/**
 * MOT ban dinh vi phuc vu NHIEU NHAT mot moc.
 *
 * Cung rang buoc ma `TransportOperationalProof` da dat cho chinh no, va cung ly do: neu mot ban
 * dinh vi dung duoc cho nhieu moc thi mot lai xe ghi ca chuoi `PICKUP_ARRIVAL` ->
 * `DELIVERY_ARRIVAL` bang DUNG MOT lan do vi tri — tuc mot chuyen "co GPS day du" ma xe chua he
 * di dau.
 */
export const CHECKPOINT_OBSERVATION_ONCE: UniqueIndexRef = {
  indexName: 'TransportRunCheckpoint_observationId_key',
  model: 'TransportRunCheckpoint',
  column: 'observationId',
};

export interface CreateCheckpointInput {
  readonly type: RunCheckpointType;
  readonly runId: string;
  readonly legId: string | null;
  readonly recordedBy: string;
  readonly driverId: string | null;
  readonly observationId: string | null;
  readonly clientEventId: string;
  readonly capturedAt: Date | null;
  readonly receivedAt: Date;
  readonly businessDate: string;
  readonly note: string | null;
}

/**
 * KHO MOC — chi GHI THEM va DOC.
 *
 * Khong co `update`, khong co `delete`, va do la mot khang dinh chu khong phai mot thieu sot:
 * `#243` F1 doi *"append-only/auditable history"*. Mot moc ghi nham duoc sua bang mot moc dinh
 * chinh. Tang luu tru cuong che them mot lan nua bang trigger
 * `transport_run_checkpoint_append_only`, de mot lan `UPDATE` viet tay tren psql cung bi chan.
 */
export abstract class CheckpointRepository {
  abstract create(input: CreateCheckpointInput): Promise<RunCheckpoint>;
  abstract findByEvent(
    runId: string,
    type: RunCheckpointType,
    clientEventId: string,
  ): Promise<RunCheckpoint | null>;
  abstract listForRun(runId: string): Promise<readonly RunCheckpoint[]>;
  abstract listForLeg(legId: string): Promise<readonly RunCheckpoint[]>;
  abstract listForDriver(driverId: string): Promise<readonly RunCheckpoint[]>;
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

/**
 * Ban trong-bo-nho — duong mac dinh cua demo/CI (`PERSISTENCE=memory`).
 *
 * No CUONG CHE ca hai unique. Bo qua chung se lam bo test trong-bo-nho xanh trong khi Postgres do,
 * va bai `F7` ve replay se khong con y nghia gi o duong mac dinh.
 */
export class InMemoryCheckpointRepository extends CheckpointRepository {
  private readonly rows: RunCheckpoint[] = [];

  async create(input: CreateCheckpointInput): Promise<RunCheckpoint> {
    const duplicateEvent = this.rows.find(
      (row) =>
        row.runId === input.runId &&
        row.type === input.type &&
        row.clientEventId === input.clientEventId,
    );
    if (duplicateEvent) throw new InMemoryUniqueViolation(CHECKPOINT_CLIENT_EVENT);

    if (input.observationId !== null) {
      const usedObservation = this.rows.find((row) => row.observationId === input.observationId);
      if (usedObservation) throw new InMemoryUniqueViolation(CHECKPOINT_OBSERVATION_ONCE);
    }

    const row: RunCheckpoint = {
      id: randomUUID(),
      type: input.type,
      runId: input.runId,
      legId: input.legId,
      recordedBy: input.recordedBy,
      driverId: input.driverId,
      observationId: input.observationId,
      clientEventId: input.clientEventId,
      capturedAt: input.capturedAt,
      receivedAt: input.receivedAt,
      businessDate: input.businessDate,
      note: input.note,
      createdAt: input.receivedAt,
    };
    this.rows.push(row);
    return row;
  }

  async findByEvent(
    runId: string,
    type: RunCheckpointType,
    clientEventId: string,
  ): Promise<RunCheckpoint | null> {
    return (
      this.rows.find(
        (row) => row.runId === runId && row.type === type && row.clientEventId === clientEventId,
      ) ?? null
    );
  }

  async listForRun(runId: string): Promise<readonly RunCheckpoint[]> {
    return this.rows
      .filter((row) => row.runId === runId)
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
  }

  async listForLeg(legId: string): Promise<readonly RunCheckpoint[]> {
    return this.rows
      .filter((row) => row.legId === legId)
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
  }

  async listForDriver(driverId: string): Promise<readonly RunCheckpoint[]> {
    return this.rows
      .filter((row) => row.driverId === driverId)
      .sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
  }
}
