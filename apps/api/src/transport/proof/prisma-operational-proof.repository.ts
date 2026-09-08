import { Injectable } from '@nestjs/common';
import type {
  TransportOperationalProof as PrismaProof,
  TransportProofPhoto as PrismaPhoto,
} from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  OperationalProofRepository,
  type CreateProofInput,
  type WithdrawProofInput,
} from './operational-proof.repository.js';
import type { OperationalProof, OperationalProofKind } from './operational-proof.types.js';

type ProofRow = PrismaProof & { photos: PrismaPhoto[] };

/**
 * Hien thuc Postgres cua kho chung cu.
 *
 * KHONG bat `P2002` o day — hai unique cua bang nay (`(chuyen, loai, ma su kien)` va
 * `observationId`) mang HAI y nghia nghiep vu khac han nhau, va viec dich chung thanh cau nguoi
 * dung hieu la viec cua `OperationalProofService`.
 */
@Injectable()
export class PrismaOperationalProofRepository extends OperationalProofRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateProofInput): Promise<OperationalProof> {
    // Chung cu va anh cua no vao cung MOT lenh ghi long nhau: mot chung cu giao hang ton tai ma
    // khong co anh se vi pham dung quy tac ma `record()` vua cuong che o tang tren.
    const row = await this.prisma.transportOperationalProof.create({
      data: {
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
        challengeVerified: input.challengeVerified,
        photos: {
          create: input.photos.map((photo) => ({
            locator: photo.locator,
            captureMode: photo.captureMode,
            contentType: photo.contentType,
            byteSize: photo.byteSize,
            capturedAt: input.capturedAt,
            uploadedBy: input.recordedBy,
          })),
        },
      },
      include: { photos: true },
    });
    return toProof(row);
  }

  async findByEvent(
    tripId: string,
    kind: OperationalProofKind,
    clientEventId: string,
  ): Promise<OperationalProof | null> {
    const row = await this.prisma.transportOperationalProof.findFirst({
      where: { tripId, kind, clientEventId },
      include: { photos: true },
    });
    return row ? toProof(row) : null;
  }

  async findById(proofId: string): Promise<OperationalProof | null> {
    const row = await this.prisma.transportOperationalProof.findUnique({
      where: { id: proofId },
      include: { photos: true },
    });
    return row ? toProof(row) : null;
  }

  async listForTrip(tripId: string): Promise<readonly OperationalProof[]> {
    const rows = await this.prisma.transportOperationalProof.findMany({
      where: { tripId },
      include: { photos: true },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map(toProof);
  }

  async listForDriver(driverId: string): Promise<readonly OperationalProof[]> {
    const rows = await this.prisma.transportOperationalProof.findMany({
      where: { driverId },
      include: { photos: true },
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map(toProof);
  }

  /**
   * Chung cu va anh cua no phai mang dau trong CUNG mot giao dich.
   *
   * Neu tach lam hai lenh va lenh thu hai truot, ta con lai mot chung cu "da rut" ma anh van con
   * hieu luc — dung trang thai ma rang buoc `*_withdrawal_shape` sinh ra de ngan.
   *
   * `updateMany` voi dieu kien `withdrawnAt: null` la mot cong CHONG CHAY DUA, khong phai mot cach
   * viet ngan: hai nguoi duyet bam rut cung luc thi ban ghi thu hai sua 0 hang, va tang dich vu
   * doc lai thay dau cua nguoi thu nhat.
   */
  async withdraw(input: WithdrawProofInput): Promise<OperationalProof | null> {
    return this.prisma.$transaction(async (transaction) => {
      const tx = transaction as unknown as PrismaService;
      const marked = await tx.transportOperationalProof.updateMany({
        where: { id: input.proofId, withdrawnAt: null },
        data: { withdrawnAt: input.withdrawnAt, withdrawnBy: input.withdrawnBy },
      });
      if (marked.count === 1) {
        await tx.transportProofPhoto.updateMany({
          where: { proofId: input.proofId, withdrawnAt: null },
          data: { withdrawnAt: input.withdrawnAt, withdrawnBy: input.withdrawnBy },
        });
      }
      const row = await tx.transportOperationalProof.findUnique({
        where: { id: input.proofId },
        include: { photos: true },
      });
      return row ? toProof(row) : null;
    });
  }

  async markChallengeVerified(proofId: string): Promise<OperationalProof | null> {
    const row = await this.prisma.transportOperationalProof.update({
      where: { id: proofId },
      data: { challengeVerified: true },
      include: { photos: true },
    });
    return toProof(row);
  }
}

function toProof(row: ProofRow): OperationalProof {
  return {
    id: row.id,
    kind: row.kind,
    tripId: row.tripId,
    driverId: row.driverId,
    observationId: row.observationId,
    sessionId: row.sessionId,
    clientEventId: row.clientEventId,
    capturedAt: row.capturedAt,
    receivedAt: row.receivedAt,
    businessDate: row.businessDate,
    note: row.note,
    recordedBy: row.recordedBy,
    withdrawnAt: row.withdrawnAt,
    withdrawnBy: row.withdrawnBy,
    challengeVerified: row.challengeVerified,
    photos: row.photos.map((photo) => ({
      id: photo.id,
      proofId: photo.proofId,
      locator: photo.locator,
      captureMode: photo.captureMode,
      contentType: photo.contentType,
      byteSize: photo.byteSize,
      capturedAt: photo.capturedAt,
      uploadedBy: photo.uploadedBy,
      withdrawnAt: photo.withdrawnAt,
      withdrawnBy: photo.withdrawnBy,
    })),
  };
}
