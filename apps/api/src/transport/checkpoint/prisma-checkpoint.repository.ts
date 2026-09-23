import { Injectable } from '@nestjs/common';
import type { TransportRunCheckpoint as PrismaCheckpoint } from '@prisma/client';
import type { PrismaService } from '../../config/prisma.service.js';
import type { RunWriteTransaction } from '../movement/movement.repository.js';
import { CheckpointRepository, type CreateCheckpointInput } from './checkpoint.repository.js';
import type { RunCheckpoint, RunCheckpointType } from './checkpoint.types.js';

/**
 * Delegate cua bang moc, doc duoc tu CA client goc LAN mot loi ra giao dich.
 *
 * Cung ly le voi `model()` trong `prisma-movement.repository.ts`. Ranh gioi kieu THAT van la
 * `toDomain()` ben duoi.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const checkpoints = (client: unknown): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (client as Record<string, any>).transportRunCheckpoint;

/**
 * Hien thuc Postgres cua kho moc.
 *
 * KHONG bat `P2002` o day — hai unique cua bang nay mang HAI y nghia nghiep vu khac han nhau (mot
 * lan gui lai, va mot ban dinh vi bi dung hai lan), va viec dich chung thanh cau nguoi dung hieu
 * la viec cua `CheckpointService`. Cung quy uoc voi `PrismaOperationalProofRepository`.
 *
 * Lop nay cung KHONG co `update`/`delete`, va do khong phai su tin tuong vao ky luat: trigger
 * `transport_run_checkpoint_append_only` chan ca hai o tang Postgres, nen ngay ca mot lenh viet
 * tay tren `psql` cung khong sua duoc mot moc da ghi.
 */
@Injectable()
export class PrismaCheckpointRepository extends CheckpointRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateCheckpointInput, tx?: RunWriteTransaction): Promise<RunCheckpoint> {
    const row = await checkpoints(tx ?? this.prisma).create({
      data: {
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
      },
    });
    return toDomain(row);
  }

  async findByEvent(
    runId: string,
    type: RunCheckpointType,
    clientEventId: string,
  ): Promise<RunCheckpoint | null> {
    const row = await this.prisma.transportRunCheckpoint.findFirst({
      where: { runId, type, clientEventId },
    });
    return row ? toDomain(row) : null;
  }

  async listForRun(runId: string): Promise<readonly RunCheckpoint[]> {
    const rows = await this.prisma.transportRunCheckpoint.findMany({
      where: { runId },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listForLeg(legId: string, tx?: RunWriteTransaction): Promise<readonly RunCheckpoint[]> {
    const rows: PrismaCheckpoint[] = await checkpoints(tx ?? this.prisma).findMany({
      where: { legId },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async listForDriver(driverId: string): Promise<readonly RunCheckpoint[]> {
    const rows = await this.prisma.transportRunCheckpoint.findMany({
      where: { driverId },
      orderBy: { receivedAt: 'asc' },
    });
    return rows.map(toDomain);
  }
}

const toDomain = (row: PrismaCheckpoint): RunCheckpoint => ({
  id: row.id,
  type: row.type,
  runId: row.runId,
  legId: row.legId,
  recordedBy: row.recordedBy,
  driverId: row.driverId,
  observationId: row.observationId,
  clientEventId: row.clientEventId,
  capturedAt: row.capturedAt,
  receivedAt: row.receivedAt,
  businessDate: row.businessDate,
  note: row.note,
  createdAt: row.createdAt,
});
