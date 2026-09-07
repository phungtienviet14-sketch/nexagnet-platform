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
  /**
   * BIA MO — mot phep ghi, khong phai mot phep xoa.
   *
   * Dau duoc dat len CA chung cu VA moi tam anh cua no trong CUNG mot lan. Neu chi danh dau chung
   * cu, `photoCount` trong khung nhin van hanh van dem du anh, va nguoi duyet se thay mot chung cu
   * vua bi rut vua con nguyen bang chung — hai cau tra loi trai nguoc tu cung mot hang.
   *
   * Tra `null` khi khong co chung cu do. Tang dich vu phan biet "khong tim thay" voi "da rut roi";
   * kho luu chi noi duoc cai thu nhat.
   */
  abstract withdraw(input: WithdrawProofInput): Promise<OperationalProof | null>;
}

export interface WithdrawProofInput {
  readonly proofId: string;
  readonly withdrawnBy: string;
  readonly withdrawnAt: Date;
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
      withdrawnBy: null,
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
      withdrawnBy: null,
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

  async withdraw(input: WithdrawProofInput): Promise<OperationalProof | null> {
    const current = this.proofs.get(input.proofId);
    if (!current) return null;

    const withdrawn: OperationalProof = {
      ...current,
      withdrawnAt: input.withdrawnAt,
      withdrawnBy: input.withdrawnBy,
      photos: current.photos.map((photo) =>
        // Mot tam anh da rut TRUOC do giu nguyen dau cu: nguoi rut tam anh do va nguoi rut ca
        // chung cu co the la hai nguoi khac nhau, va ghi de se xoa mat mot trong hai.
        photo.withdrawnAt === null
          ? { ...photo, withdrawnAt: input.withdrawnAt, withdrawnBy: input.withdrawnBy }
          : photo,
      ),
    };
    this.proofs.set(withdrawn.id, withdrawn);
    return withdrawn;
  }
}
