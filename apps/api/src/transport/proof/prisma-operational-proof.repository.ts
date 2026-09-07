import { Injectable } from '@nestjs/common';
import type {
  TransportOperationalProof as PrismaProof,
  TransportProofPhoto as PrismaPhoto,
} from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  OperationalProofRepository,
  type CreateProofInput,
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
    })),
  };
}
