import { randomUUID } from 'node:crypto';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type { DeliveryWaitingSession, WaitingCloseReason, WaitingReason } from './waiting.types.js';

/**
 * HAI UNIQUE cua phien cho. DANH SACH thuoc capability nay, CO CHE nhan dien nam o
 * `../storage-conflict.js` — cung quy uoc voi `checkpoint.repository.ts`.
 *
 * Ca hai deu khai CA `indexName` LAN cap `(model, column)`, vi Prisma khong phoi ten index ra
 * ngoai ma doi nguoc thanh ten truong.
 */

/**
 * MOT CHANG co NHIEU NHAT MOT phien cho DANG MO — unique MOT PHAN `WHERE "status" = 'OPEN'`.
 *
 * Day la cong that cho `#279` O13 bai 5 (*"concurrent wait start does not create two active
 * sessions"*). Phep doc `hasOpenSession` o `evaluateWaitingStart` KHONG du: hai yeu cau song song
 * deu doc thay "chua co phien nao" vi ban kia chua commit. Chi mot rang buoc cua Postgres mo duoc
 * nut do — va no phai la unique MOT PHAN, vi mot chang co the co nhieu phien DA DONG (lai xe cho,
 * van phong dong nham, lai xe cho tiep).
 */
export const WAITING_OPEN_PER_LEG: UniqueIndexRef = {
  indexName: 'TransportDeliveryWaitingSession_openLeg_key',
  model: 'TransportDeliveryWaitingSession',
  column: 'legId',
};

/**
 * Mot lenh mo gui lai khong duoc tao phien thu hai — `#279` O13 bai 1/2, va `#279` O10
 * (*"retry keeps same identity"*).
 */
export const WAITING_CLIENT_EVENT: UniqueIndexRef = {
  indexName: 'TransportDeliveryWaitingSession_leg_event_key',
  model: 'TransportDeliveryWaitingSession',
  column: 'startClientEventId',
};

/**
 * Hai lan dong cung luc — ban thua cuoc sua zero hang.
 *
 * Mot lop loi RIENG chu khong mot `Error` chung: `WaitingSessionService` phai phan biet duoc no voi
 * mot su co that de tra ve `WAITING_ALREADY_CLOSED` — mot ma nguoi dung doc duoc — thay vi 500.
 *
 * Ca HAI hien thuc kho deu nem no. Neu chi ban Postgres nem thi bo test trong-bo-nho se xanh o mot
 * duong ma that ra do, va bai `#279` O13 ve hai lan dong mat cho de dung.
 */
export class WaitingSessionAlreadyClosedError extends Error {
  constructor(readonly sessionId: string) {
    super(`Phien cho ${sessionId} da dong tu truoc`);
    this.name = 'WaitingSessionAlreadyClosedError';
  }
}

export interface CreateWaitingSessionInput {
  readonly runId: string;
  readonly legId: string;
  readonly driverId: string | null;
  readonly arrivalCheckpointId: string;
  readonly reason: WaitingReason;
  readonly startedAt: Date;
  readonly startedBy: string;
  readonly startClientEventId: string;
  readonly note: string | null;
  readonly businessDate: string;
}

export interface CloseWaitingSessionInput {
  readonly sessionId: string;
  readonly endedAt: Date;
  readonly endedBy: string;
  readonly closeReason: WaitingCloseReason;
  readonly closingCheckpointId: string | null;
  readonly closeNote: string | null;
}

/**
 * KHO PHIEN CHO — mot bang co DUNG MOT lan chuyen trang thai, va khong gi hon.
 *
 * Khac `CheckpointRepository` (chi ghi them): mot phien cho CO vong doi, vi mot khoang thoi gian
 * khong the ghi xong trong mot lan — no mo truoc, dong sau. Nhung vong doi do chi co MOT canh
 * (`OPEN -> CLOSED`), va khong co `update` tong quat nao: khong ai sua duoc `startedAt`, `reason`
 * hay `arrivalCheckpointId` cua mot phien da ghi.
 *
 * `#279` O6 doi *"approving user cannot rewrite WaitingSession timestamps"*. Cach dat dieu do
 * khong phai mot phep kiem quyen o tang dich vu — la viec kho nay KHONG CO ham nao lam duoc viec
 * ay. Tang luu tru cuong che mot lan nua bang trigger `transport_waiting_session_immutable`.
 */
export abstract class WaitingSessionRepository {
  abstract create(input: CreateWaitingSessionInput): Promise<DeliveryWaitingSession>;
  abstract close(input: CloseWaitingSessionInput): Promise<DeliveryWaitingSession>;
  abstract find(sessionId: string): Promise<DeliveryWaitingSession | null>;
  abstract findByEvent(
    legId: string,
    startClientEventId: string,
  ): Promise<DeliveryWaitingSession | null>;
  abstract findOpenForLeg(legId: string): Promise<DeliveryWaitingSession | null>;
  abstract listForRun(runId: string): Promise<readonly DeliveryWaitingSession[]>;
  abstract listForLeg(legId: string): Promise<readonly DeliveryWaitingSession[]>;
  abstract listForDriver(driverId: string): Promise<readonly DeliveryWaitingSession[]>;
  /** Moi phien DANG MO cua ca doi xe — nguon cot `WAITING` cua thap dieu hanh (`#278`). */
  abstract listOpen(): Promise<readonly DeliveryWaitingSession[]>;
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
 * No CUONG CHE ca hai unique, ke ca cai MOT PHAN. Bo qua chung se lam bo test trong-bo-nho xanh
 * trong khi Postgres do, va hai bai adversarial quan trong nhat cua `#279` O13 se khong con y
 * nghia gi o duong mac dinh.
 */
export class InMemoryWaitingSessionRepository extends WaitingSessionRepository {
  private readonly rows: DeliveryWaitingSession[] = [];

  async create(input: CreateWaitingSessionInput): Promise<DeliveryWaitingSession> {
    const duplicateEvent = this.rows.find(
      (row) => row.legId === input.legId && row.startClientEventId === input.startClientEventId,
    );
    if (duplicateEvent) throw new InMemoryUniqueViolation(WAITING_CLIENT_EVENT);

    const alreadyOpen = this.rows.find((row) => row.legId === input.legId && row.status === 'OPEN');
    if (alreadyOpen) throw new InMemoryUniqueViolation(WAITING_OPEN_PER_LEG);

    const row: DeliveryWaitingSession = {
      id: randomUUID(),
      runId: input.runId,
      legId: input.legId,
      driverId: input.driverId,
      arrivalCheckpointId: input.arrivalCheckpointId,
      closingCheckpointId: null,
      status: 'OPEN',
      reason: input.reason,
      closeReason: null,
      startedAt: input.startedAt,
      endedAt: null,
      startedBy: input.startedBy,
      endedBy: null,
      startClientEventId: input.startClientEventId,
      note: input.note,
      closeNote: null,
      businessDate: input.businessDate,
      createdAt: input.startedAt,
    };
    this.rows.push(row);
    return row;
  }

  async close(input: CloseWaitingSessionInput): Promise<DeliveryWaitingSession> {
    const index = this.rows.findIndex((row) => row.id === input.sessionId);
    const current = this.rows[index];
    // KHONG tim thay, hoac DA dong — ca hai deu la "khong con gi de dong". Ban Postgres cung tra
    // ve dung ket qua nay bang `updateMany({ where: { id, status: 'OPEN' } })` sua zero hang.
    if (current === undefined || current.status !== 'OPEN') {
      throw new WaitingSessionAlreadyClosedError(input.sessionId);
    }

    const closed: DeliveryWaitingSession = {
      ...current,
      status: 'CLOSED',
      endedAt: input.endedAt,
      endedBy: input.endedBy,
      closeReason: input.closeReason,
      closingCheckpointId: input.closingCheckpointId,
      closeNote: input.closeNote,
    };
    this.rows[index] = closed;
    return closed;
  }

  async find(sessionId: string): Promise<DeliveryWaitingSession | null> {
    return this.rows.find((row) => row.id === sessionId) ?? null;
  }

  async findByEvent(
    legId: string,
    startClientEventId: string,
  ): Promise<DeliveryWaitingSession | null> {
    return (
      this.rows.find(
        (row) => row.legId === legId && row.startClientEventId === startClientEventId,
      ) ?? null
    );
  }

  async findOpenForLeg(legId: string): Promise<DeliveryWaitingSession | null> {
    return this.rows.find((row) => row.legId === legId && row.status === 'OPEN') ?? null;
  }

  async listForRun(runId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.sorted(this.rows.filter((row) => row.runId === runId));
  }

  async listForLeg(legId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.sorted(this.rows.filter((row) => row.legId === legId));
  }

  async listForDriver(driverId: string): Promise<readonly DeliveryWaitingSession[]> {
    return this.sorted(this.rows.filter((row) => row.driverId === driverId));
  }

  async listOpen(): Promise<readonly DeliveryWaitingSession[]> {
    return this.sorted(this.rows.filter((row) => row.status === 'OPEN'));
  }

  private sorted(rows: readonly DeliveryWaitingSession[]): readonly DeliveryWaitingSession[] {
    return [...rows].sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
  }
}
