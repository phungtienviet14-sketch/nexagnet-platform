import type { Prisma } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
import {
  FileRepository,
  type CreateFileInput,
  type CreateFileLinkInput,
} from './file.repository.js';
import type {
  FileLink,
  FileLinkState,
  FilePurpose,
  FileRecord,
  FileScanState,
  FileState,
  FileStorageProvider,
} from './file.types.js';

/** Hang tho cua Prisma — go ra thay vi `any`, de doi hinh o schema do o `tsc`. */
type PlatformFileRow = Prisma.PlatformFileGetPayload<Record<string, never>>;
type PlatformFileLinkRow = Prisma.PlatformFileLinkGetPayload<Record<string, never>>;

/**
 * KHO PRISMA cua nen tang tep — `#287` P1/P2/P3.
 *
 * ============================================================================================
 * MOI PHEP DOI TRANG THAI LA MOT `updateMany` CO DIEU KIEN
 * ============================================================================================
 *
 * `updateMany` voi bo loc tren cot thuong sinh ra DUNG MOT lenh `UPDATE ... WHERE`, nen CSDL — chu
 * khong ma nay — la trong tai quyet dinh ai thang khi hai lan ghi den cung luc. `count === 0` nghia
 * chinh xac la "hang khong con o trang thai nguon", va do la cau tra loi `null` ma hop dong o
 * `FileRepository` mo ta.
 *
 * Duong doc-roi-ghi (`findUnique` roi `update`) se de mot cua so giua hai lenh; trong cua so do hai
 * nguoi cung rut mot tep se ghi hai lan, va ten nguoi rut that su bi ghi de.
 *
 * ============================================================================================
 * KHONG MOT HAM XOA NAO, va CSDL cung khong cho
 * ============================================================================================
 *
 * Khong `delete`, khong `deleteMany`. Trigger `platform_file_immutable` chan ca lenh `DELETE` di
 * thang bang `psql` — hai lop, vi mot bat bien chi ton tai o tang ung dung la mot bat bien cho toi
 * lan ai do mo mot phien `psql`.
 */
export class PrismaFileRepository extends FileRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateFileInput): Promise<FileRecord> {
    const row = await this.prisma.platformFile.create({
      data: {
        id: input.id,
        purpose: input.purpose,
        originalFilename: input.originalFilename,
        safeFilename: input.safeFilename,
        declaredMimeType: input.declaredMimeType,
        detectedMimeType: input.detectedMimeType,
        byteSize: input.byteSize,
        sha256: input.sha256,
        storageProvider: input.storageProvider,
        storageKey: input.storageKey,
        createdBy: input.createdBy,
        retainUntil: input.retainUntil,
        captureMetadata: (input.captureMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    return toFileRecord(row);
  }

  async findById(id: string): Promise<FileRecord | null> {
    const row = await this.prisma.platformFile.findUnique({ where: { id } });
    return row ? toFileRecord(row) : null;
  }

  async activate(id: string, scanState: FileScanState, at: Date): Promise<FileRecord | null> {
    return this.transition(
      { id, state: 'STAGED' },
      {
        state: 'ACTIVE',
        scanState,
        activatedAt: at,
        ...(scanState === 'NOT_SCANNED' ? {} : { scannedAt: at }),
      },
    );
  }

  async quarantine(id: string, scanState: FileScanState, at: Date): Promise<FileRecord | null> {
    return this.transition(
      { id, state: { in: ['STAGED', 'ACTIVE'] } },
      { state: 'QUARANTINED', scanState, scannedAt: at, quarantinedAt: at },
    );
  }

  /**
   * RUT + GO MOI LIEN KET — TRONG MOT GIAO DICH. `#287` P3 bat bien 2.
   *
   * Giao dich TUONG TAC (`$transaction(async tx => ...)`) chu khong dang mang: dang mang chay het
   * moi lenh roi moi tra ket qua, nen khong co cho nao de dung lai khi lan `UPDATE` thu nhat khong
   * khop hang nao. O day, `count === 0` la roi khoi ham va KHONG lenh nao cham vao bang lien ket.
   */
  async withdraw(id: string, withdrawnBy: string, at: Date): Promise<FileRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.platformFile.updateMany({
        where: { id, state: { in: ['STAGED', 'ACTIVE'] } },
        data: { state: 'WITHDRAWN', withdrawnAt: at, withdrawnBy },
      });
      if (changed.count === 0) return null;

      await tx.platformFileLink.updateMany({
        where: { fileId: id, state: 'ACTIVE' },
        data: { state: 'WITHDRAWN', withdrawnAt: at, withdrawnBy },
      });

      const row = await tx.platformFile.findUnique({ where: { id } });
      return row ? toFileRecord(row) : null;
    });
  }

  async requestPurge(id: string, at: Date): Promise<FileRecord | null> {
    // `purgeRequestedAt: null` trong bo loc: mot lan danh dau thu hai KHONG doi moc cua lan dau.
    // Neu doi, thi moi lan chay lai vong don se day moc cham mai ve phia truoc, va phep do "cho bao
    // lau roi" khong bao gio chi ra duoc mot tep dang ket.
    const first = await this.transition(
      { id, state: { in: ['WITHDRAWN', 'QUARANTINED'] }, purgeRequestedAt: null },
      { purgeRequestedAt: at },
    );
    if (first) return first;

    // Da danh dau tu truoc — lam lai la khong doi gi, va do KHONG phai mot loi.
    const row = await this.prisma.platformFile.findFirst({
      where: { id, state: { in: ['WITHDRAWN', 'QUARANTINED'] } },
    });
    return row ? toFileRecord(row) : null;
  }

  async markPurged(id: string, at: Date): Promise<FileRecord | null> {
    return this.transition(
      { id, state: { in: ['WITHDRAWN', 'QUARANTINED'] } },
      { state: 'PURGED', purgedAt: at, purgeFailedAt: null, purgeFailureCode: null },
    );
  }

  async markPurgeFailed(id: string, code: string, at: Date): Promise<FileRecord | null> {
    return this.transition(
      { id, state: { in: ['WITHDRAWN', 'QUARANTINED'] } },
      { purgeAttempts: { increment: 1 }, purgeFailedAt: at, purgeFailureCode: code },
    );
  }

  async setLegalHold(id: string, legalHold: boolean): Promise<FileRecord | null> {
    return this.transition({ id, state: { not: 'PURGED' } }, { legalHold });
  }

  async createLink(input: CreateFileLinkInput): Promise<FileLink> {
    const row = await this.prisma.platformFileLink.create({ data: { ...input } });
    return toFileLink(row);
  }

  async linksOf(fileId: string): Promise<readonly FileLink[]> {
    const rows = await this.prisma.platformFileLink.findMany({
      where: { fileId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toFileLink);
  }

  async activeLinksOf(fileId: string): Promise<readonly FileLink[]> {
    const rows = await this.prisma.platformFileLink.findMany({
      where: { fileId, state: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toFileLink);
  }

  async findActiveLink(
    fileId: string,
    businessOwnerType: string,
    businessOwnerId: string,
    purpose: string,
  ): Promise<FileLink | null> {
    const row = await this.prisma.platformFileLink.findFirst({
      where: { fileId, businessOwnerType, businessOwnerId, purpose, state: 'ACTIVE' },
    });
    return row ? toFileLink(row) : null;
  }

  async listPendingPurge(limit: number): Promise<readonly FileRecord[]> {
    const rows = await this.prisma.platformFile.findMany({
      where: { purgeRequestedAt: { not: null }, state: { in: ['WITHDRAWN', 'QUARANTINED'] } },
      orderBy: { purgeRequestedAt: 'asc' },
      take: limit,
    });
    return rows.map(toFileRecord);
  }

  async listWithBlob(limit: number): Promise<readonly FileRecord[]> {
    const rows = await this.prisma.platformFile.findMany({
      where: { state: { not: 'PURGED' } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map(toFileRecord);
  }

  /**
   * MOT LENH `UPDATE ... WHERE`, roi doc lai.
   *
   * `count === 0` -> `null`: hang khong con o trang thai nguon. Lan doc sau do chi de tra ve gia
   * tri moi; no khong tham gia vao phep quyet dinh, nen mot lan doc ban khong lam hong gi.
   */
  private async transition(
    where: Prisma.PlatformFileWhereInput & { id: string },
    data: Prisma.PlatformFileUpdateManyMutationInput,
  ): Promise<FileRecord | null> {
    const changed = await this.prisma.platformFile.updateMany({ where, data });
    if (changed.count === 0) return null;
    const row = await this.prisma.platformFile.findUnique({ where: { id: where.id } });
    return row ? toFileRecord(row) : null;
  }
}

/**
 * HANG THO -> KIEU CUA MIEN.
 *
 * `purpose` va cac trang thai duoc ep kieu o day thay vi khai `enum` Prisma cho `purpose`: mot
 * enum Prisma cho muc dich se bat moi lan them mot muc dich phai co mot migration, trong khi
 * `FILE_PURPOSE_RULES` da la nguon su that va `tsc` da giu no. Doi lai, hang tu mot ban CU co the
 * mang mot chuoi khong con trong danh sach — nen `FILE_PURPOSE_RULES` phai chiu duoc dieu do, va
 * `FileService` chi doc no qua `FILE_PURPOSE_RULES[purpose]` o duong GHI, khong o duong DOC.
 */
function toFileRecord(row: PlatformFileRow): FileRecord {
  return {
    id: row.id,
    purpose: row.purpose as FilePurpose,
    originalFilename: row.originalFilename,
    safeFilename: row.safeFilename,
    declaredMimeType: row.declaredMimeType,
    detectedMimeType: row.detectedMimeType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    storageProvider: row.storageProvider as FileStorageProvider,
    storageKey: row.storageKey,
    createdBy: row.createdBy,
    state: row.state as FileState,
    scanState: row.scanState as FileScanState,
    scannedAt: row.scannedAt,
    retainUntil: row.retainUntil,
    legalHold: row.legalHold,
    captureMetadata: (row.captureMetadata ?? null) as Readonly<Record<string, unknown>> | null,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    withdrawnAt: row.withdrawnAt,
    withdrawnBy: row.withdrawnBy,
    quarantinedAt: row.quarantinedAt,
    purgeRequestedAt: row.purgeRequestedAt,
    purgedAt: row.purgedAt,
    purgeAttempts: row.purgeAttempts,
    purgeFailedAt: row.purgeFailedAt,
    purgeFailureCode: row.purgeFailureCode,
  };
}

function toFileLink(row: PlatformFileLinkRow): FileLink {
  return {
    id: row.id,
    fileId: row.fileId,
    businessOwnerType: row.businessOwnerType,
    businessOwnerId: row.businessOwnerId,
    purpose: row.purpose,
    state: row.state as FileLinkState,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    withdrawnBy: row.withdrawnBy,
    withdrawnAt: row.withdrawnAt,
  };
}
