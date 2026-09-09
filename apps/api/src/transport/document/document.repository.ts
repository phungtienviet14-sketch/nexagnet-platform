import { randomUUID } from 'node:crypto';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type {
  DocumentCaptureMode,
  OperationalDocument,
  OperationalDocumentBasis,
  OperationalDocumentType,
} from './document.types.js';

/**
 * MOT UNIQUE cua chung tu van hanh — mot lan bam khong ghi hai to.
 *
 * `#279` O10 doi *"clientEventId generated once ... retry keeps same identity"*. Khoa la
 * `(runId, type, clientEventId)`, cung hinh dang voi `CHECKPOINT_CLIENT_EVENT`: mot to phieu can
 * va mot to bien nhan cua CUNG mot lan bam la hai su kien khac nhau.
 */
export const DOCUMENT_CLIENT_EVENT: UniqueIndexRef = {
  indexName: 'TransportOperationalDocument_run_type_event_key',
  model: 'TransportOperationalDocument',
  column: 'clientEventId',
};

/**
 * MOT MA TEP phuc vu NHIEU NHAT mot chung tu DANG HIEU LUC — unique MOT PHAN.
 *
 * Cung rang buoc ma `TransportOperationalProof` da dat cho ban dinh vi cua no, va cung ly le: neu
 * mot ma tep dung duoc cho nhieu chung tu thi mot nguoi gan DUNG MOT tam anh vao ca bon loai phieu
 * — tuc mot chuyen "day du chung tu" chi bang mot lan chup.
 *
 * MOT PHAN vi hai le: duong chung tu giay co `fileId` rong, va mot to da bia mo phai nhuong lai ma
 * tep cho ban ghi dinh chinh.
 */
export const DOCUMENT_FILE_ONCE: UniqueIndexRef = {
  indexName: 'TransportOperationalDocument_activeFile_key',
  model: 'TransportOperationalDocument',
  column: 'fileId',
};

export interface CreateDocumentInput {
  readonly type: OperationalDocumentType;
  readonly runId: string;
  readonly legId: string | null;
  readonly orderId: string | null;
  readonly checkpointId: string | null;
  readonly counterpartySiteId: string | null;
  readonly driverId: string | null;
  readonly recordedBy: string;
  readonly basis: OperationalDocumentBasis;
  readonly fileId: string | null;
  readonly externalNote: string | null;
  readonly label: string | null;
  readonly captureMode: DocumentCaptureMode;
  readonly clientEventId: string;
  readonly receivedAt: Date;
  readonly businessDate: string;
}

export interface WithdrawDocumentInput {
  readonly documentId: string;
  readonly withdrawnAt: Date;
  readonly withdrawnBy: string;
  readonly reason: string;
}

/**
 * KHO CHUNG TU — ghi them, va DUNG MOT lan chuyen trang thai.
 *
 * Khong co `update` tong quat: khong ai sua duoc loai, ma tep, moc neo hay nguoi ghi cua mot chung
 * tu da vao so. Sua mot to ghi nham la BIA MO no roi ghi mot to moi — hang cu o lai, mang gio va
 * ten nguoi bia. Tang luu tru cuong che them mot lan bang trigger
 * `transport_operational_document_immutable`.
 */
export abstract class OperationalDocumentRepository {
  abstract create(input: CreateDocumentInput): Promise<OperationalDocument>;
  abstract withdraw(input: WithdrawDocumentInput): Promise<OperationalDocument>;
  abstract find(documentId: string): Promise<OperationalDocument | null>;
  abstract findByEvent(
    runId: string,
    type: OperationalDocumentType,
    clientEventId: string,
  ): Promise<OperationalDocument | null>;
  abstract listForRun(runId: string): Promise<readonly OperationalDocument[]>;
  abstract listForLeg(legId: string): Promise<readonly OperationalDocument[]>;
  abstract listForOrder(orderId: string): Promise<readonly OperationalDocument[]>;
  abstract listForDriver(driverId: string): Promise<readonly OperationalDocument[]>;
  /**
   * MOI chung tu CON HIEU LUC co gan chang — nguon canh bao thieu chung tu cua thap dieu hanh.
   *
   * MOT lan doc cho ca doi xe, khong `listForLeg(legId)` cho tung chang: thap dieu hanh ve lai o
   * moi lan nguoi truc mo man hinh, va mot vong N+1 o do la mot vong N+1 tren duong ve cua man hinh
   * duoc mo nhieu nhat trong ngay.
   */
  abstract listActiveWithLeg(): Promise<readonly OperationalDocument[]>;
}

/** Da bia mo — mot lop loi RIENG de tang dich vu dich duoc thanh mot ma nguoi dung doc duoc. */
export class DocumentAlreadyWithdrawnError extends Error {
  constructor(readonly documentId: string) {
    super(`Chung tu ${documentId} da duoc bia mo tu truoc`);
    this.name = 'DocumentAlreadyWithdrawnError';
  }
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
 * CUONG CHE ca hai unique, ke ca cai MOT PHAN. Bo qua chung se lam bo test trong-bo-nho xanh trong
 * khi Postgres do.
 */
export class InMemoryOperationalDocumentRepository extends OperationalDocumentRepository {
  private readonly rows: OperationalDocument[] = [];

  async create(input: CreateDocumentInput): Promise<OperationalDocument> {
    const duplicateEvent = this.rows.find(
      (row) =>
        row.runId === input.runId &&
        row.type === input.type &&
        row.clientEventId === input.clientEventId,
    );
    if (duplicateEvent) throw new InMemoryUniqueViolation(DOCUMENT_CLIENT_EVENT);

    if (input.fileId !== null) {
      const usedFile = this.rows.find(
        (row) => row.fileId === input.fileId && row.status === 'ACTIVE',
      );
      if (usedFile) throw new InMemoryUniqueViolation(DOCUMENT_FILE_ONCE);
    }

    const row: OperationalDocument = {
      id: randomUUID(),
      type: input.type,
      runId: input.runId,
      legId: input.legId,
      orderId: input.orderId,
      checkpointId: input.checkpointId,
      counterpartySiteId: input.counterpartySiteId,
      driverId: input.driverId,
      recordedBy: input.recordedBy,
      basis: input.basis,
      fileId: input.fileId,
      externalNote: input.externalNote,
      label: input.label,
      captureMode: input.captureMode,
      status: 'ACTIVE',
      clientEventId: input.clientEventId,
      receivedAt: input.receivedAt,
      withdrawnAt: null,
      withdrawnBy: null,
      extractionCandidate: null,
      extractionProvider: null,
      businessDate: input.businessDate,
      createdAt: input.receivedAt,
    };
    this.rows.push(row);
    return row;
  }

  async withdraw(input: WithdrawDocumentInput): Promise<OperationalDocument> {
    const index = this.rows.findIndex((row) => row.id === input.documentId);
    const current = this.rows[index];
    if (current === undefined || current.status !== 'ACTIVE') {
      throw new DocumentAlreadyWithdrawnError(input.documentId);
    }
    const withdrawn: OperationalDocument = {
      ...current,
      status: 'WITHDRAWN',
      withdrawnAt: input.withdrawnAt,
      withdrawnBy: input.withdrawnBy,
      label: current.label === null ? input.reason : `${current.label} - ${input.reason}`,
    };
    this.rows[index] = withdrawn;
    return withdrawn;
  }

  async find(documentId: string): Promise<OperationalDocument | null> {
    return this.rows.find((row) => row.id === documentId) ?? null;
  }

  async findByEvent(
    runId: string,
    type: OperationalDocumentType,
    clientEventId: string,
  ): Promise<OperationalDocument | null> {
    return (
      this.rows.find(
        (row) => row.runId === runId && row.type === type && row.clientEventId === clientEventId,
      ) ?? null
    );
  }

  async listForRun(runId: string): Promise<readonly OperationalDocument[]> {
    return this.sorted(this.rows.filter((row) => row.runId === runId));
  }

  async listForLeg(legId: string): Promise<readonly OperationalDocument[]> {
    return this.sorted(this.rows.filter((row) => row.legId === legId));
  }

  async listForOrder(orderId: string): Promise<readonly OperationalDocument[]> {
    return this.sorted(this.rows.filter((row) => row.orderId === orderId));
  }

  async listForDriver(driverId: string): Promise<readonly OperationalDocument[]> {
    return this.sorted(this.rows.filter((row) => row.driverId === driverId));
  }

  async listActiveWithLeg(): Promise<readonly OperationalDocument[]> {
    return this.sorted(this.rows.filter((row) => row.status === 'ACTIVE' && row.legId !== null));
  }

  private sorted(rows: readonly OperationalDocument[]): readonly OperationalDocument[] {
    return [...rows].sort((left, right) => left.receivedAt.getTime() - right.receivedAt.getTime());
  }
}
