import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../business-date.js';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type {
  OperationalProof,
  OperationalProofKind,
  ProofPhoto,
  ProofPhotoCaptureMode,
} from './operational-proof.types.js';
import { storageUniqueViolation } from './proof-storage-conflict.js';

/** Mot lan bam KHONG duoc tao hai chung cu, ke ca khi mang gui lai. */
export const PROOF_CLIENT_EVENT: UniqueIndexRef = {
  indexName: 'TransportOperationalProof_trip_kind_event_key',
  model: 'TransportOperationalProof',
  column: 'clientEventId',
};

/** MOT ban dinh vi phuc vu NHIEU NHAT mot chung cu — chan dung lai vi tri cu cho lan giao sau. */
export const PROOF_OBSERVATION_ONCE: UniqueIndexRef = {
  indexName: 'TransportOperationalProof_observationId_key',
  model: 'TransportOperationalProof',
  column: 'observationId',
};

export interface CreateProofInput {
  readonly kind: OperationalProofKind;
  readonly tripId: string;
  readonly driverId: string;
  readonly observationId: string;
  readonly sessionId: string | null;
  readonly clientEventId: string;
  readonly capturedAt: Date;
  readonly receivedAt: Date;
  readonly businessDate: BusinessDate;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly photos: readonly {
    readonly locator: string;
    readonly captureMode: ProofPhotoCaptureMode;
    readonly contentType: string | null;
    readonly byteSize: number | null;
  }[];
}

export abstract class OperationalProofRepository {
  abstract create(input: CreateProofInput): Promise<OperationalProof>;
  abstract findByEvent(
    tripId: string,
    kind: OperationalProofKind,
    clientEventId: string,
  ): Promise<OperationalProof | null>;
  abstract findById(proofId: string): Promise<OperationalProof | null>;
  abstract listForTrip(tripId: string): Promise<readonly OperationalProof[]>;
  abstract listForDriver(driverId: string): Promise<readonly OperationalProof[]>;
}

export class InMemoryOperationalProofRepository extends OperationalProofRepository {
  private readonly proofs = new Map<string, OperationalProof>();

  async create(input: CreateProofInput): Promise<OperationalProof> {
    for (const existing of this.proofs.values()) {
      if (
        existing.tripId === input.tripId &&
        existing.kind === input.kind &&
        existing.clientEventId === input.clientEventId
      ) {
        throw storageUniqueViolation(PROOF_CLIENT_EVENT);
      }
      if (existing.observationId === input.observationId) {
        throw storageUniqueViolation(PROOF_OBSERVATION_ONCE);
      }
    }

    const id = randomUUID();
    const photos: ProofPhoto[] = input.photos.map((photo) => ({
      id: randomUUID(),
      proofId: id,
      locator: photo.locator,
      captureMode: photo.captureMode,
      contentType: photo.contentType,
      byteSize: photo.byteSize,
      capturedAt: input.capturedAt,
      uploadedBy: input.recordedBy,
      withdrawnAt: null,
    }));

    const proof: OperationalProof = {
      id,
      kind: input.kind,
      tripId: input.tripId,
      driverId: input.driverId,
      observationId: input.observationId,
      sessionId: input.sessionId,
      clientEventId: input.clientEventId,
      capturedAt: input.capturedAt,
      receivedAt: input.receivedAt,
      businessDate: input.businessDate,
      note: input.note,
      recordedBy: input.recordedBy,
      withdrawnAt: null,
      photos,
    };
    this.proofs.set(id, proof);
    return proof;
  }

  async findByEvent(
    tripId: string,
    kind: OperationalProofKind,
    clientEventId: string,
  ): Promise<OperationalProof | null> {
    for (const proof of this.proofs.values()) {
      if (proof.tripId === tripId && proof.kind === kind && proof.clientEventId === clientEventId) {
        return proof;
      }
    }
    return null;
  }

  async findById(proofId: string): Promise<OperationalProof | null> {
    return this.proofs.get(proofId) ?? null;
  }

  async listForTrip(tripId: string): Promise<readonly OperationalProof[]> {
    return [...this.proofs.values()]
      .filter((proof) => proof.tripId === tripId)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  async listForDriver(driverId: string): Promise<readonly OperationalProof[]> {
    return [...this.proofs.values()]
      .filter((proof) => proof.driverId === driverId)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  }
}
