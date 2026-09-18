import { randomUUID } from 'node:crypto';
import type { UniqueIndexRef } from '../config/storage-conflict.js';
import { PLATFORM_FILE_ACTIVE_LINK } from './file-storage-conflict.js';
import type {
  FileLink,
  FilePurpose,
  FileRecord,
  FileScanState,
  FileStorageProvider,
} from './file.types.js';

/**
 * KHO cua nen tang tep — `#287` P1/P2/P3.
 *
 * ============================================================================================
 * MOI PHEP DOI TRANG THAI LA MOT LAN SO-ROI-DAT, khong mot lan doc-roi-ghi
 * ============================================================================================
 *
 * Moi ham chuyen trang thai duoi day tra `FileRecord | null`, va `null` co nghia CHINH XAC: hang
 * khong con o trang thai nguon ma phep nay doi hoi — tuc mot nguoi khac da doi no truoc, mot phan
 * nghin giay.
 *
 * `#287` P12 bai 16 doi *"concurrent/retry upload/link/withdraw paths have one truthful effect"*.
 * Neu cac ham nay nhan `FileRecord` da doc san roi ghi de, thi hai lan rut dong thoi se ghi hai lan
 * va ban ghi cuoi thang — tuc mat ten nguoi rut that su. Hien thuc Prisma dung mot `updateMany` co
 * dieu kien (MOT lenh `UPDATE ... WHERE`), nen CSDL la trong tai.
 *
 * ============================================================================================
 * KHONG MOT HAM XOA NAO
 * ============================================================================================
 *
 * `#287` P3 bat bien 1. Khong co `delete`, khong co `deleteMany`, khong co duong nao go mot hang di.
 * `markPurged` doi mot TRANG THAI va ghi mot moc — byte bien mat, dong metadata o lai.
 */

export interface CreateFileInput {
  /**
   * MA SINH O TANG GOI, khong o CSDL.
   *
   * `storageKey` duoc dung TU ma nay (xem `buildPlatformFileKey`), nen ma phai co TRUOC khi hang
   * duoc ghi. De CSDL sinh ma se buoc phai ghi hang truoc roi cap nhat khoa sau — tuc mot cua so
   * ma hang ton tai voi mot khoa khong tro vao dau, va mot duong `UPDATE` vao dung cai cot ma
   * trigger cua Postgres khoa cung.
   */
  readonly id: string;
  readonly purpose: FilePurpose;
  readonly originalFilename: string;
  readonly safeFilename: string;
  readonly declaredMimeType: string;
  readonly detectedMimeType: string | null;
  readonly byteSize: number;
  readonly sha256: string;
  readonly storageProvider: FileStorageProvider;
  readonly storageKey: string;
  readonly createdBy: string;
  readonly retainUntil: Date | null;
  readonly captureMetadata: Readonly<Record<string, unknown>> | null;
}

export interface CreateFileLinkInput {
  readonly fileId: string;
  readonly businessOwnerType: string;
  readonly businessOwnerId: string;
  readonly purpose: string;
  readonly createdBy: string;
}

export abstract class FileRepository {
  /** TAO mot hang o trang thai `STAGED`. Ma va khoa luu tru deu do tang goi dua vao. */
  abstract create(input: CreateFileInput): Promise<FileRecord>;
  abstract findById(id: string): Promise<FileRecord | null>;

  /** `STAGED -> ACTIVE`. `null` = hang khong con o `STAGED`. */
  abstract activate(id: string, scanState: FileScanState, at: Date): Promise<FileRecord | null>;
  /** `STAGED|ACTIVE -> QUARANTINED`. */
  abstract quarantine(id: string, scanState: FileScanState, at: Date): Promise<FileRecord | null>;

  /**
   * `STAGED|ACTIVE -> WITHDRAWN`, va go MOI lien ket dang hieu luc — TRONG MOT GIAO DICH.
   *
   * `#287` P3 bat bien 2. Tach lam hai lan goi se de lai mot cua so ma tep da rut nhung lien ket
   * van hieu luc: dung cua so do, mot lan doc di qua cong nghiep vu se thay mot bang chung hop le.
   */
  abstract withdraw(id: string, withdrawnBy: string, at: Date): Promise<FileRecord | null>;

  /** Danh dau CAN don byte. Tach khoi lan don that su — `#287` P3 bat bien 3. */
  abstract requestPurge(id: string, at: Date): Promise<FileRecord | null>;
  /** Byte da bien mat. `WITHDRAWN|QUARANTINED -> PURGED`. */
  abstract markPurged(id: string, at: Date): Promise<FileRecord | null>;
  /**
   * Lan don byte HONG — ghi lai ma loi va tang so lan thu. TRANG THAI LOGIC KHONG DOI.
   *
   * `#287` P3 bat bien 5 (*"failed purge is observable/retryable"*) va bai 7 cua P12 (*"logical
   * withdrawal survives physical delete failure"*). Neu lan don hong keo trang thai ve `WITHDRAWN`
   * thi mot kho tam thoi khong voi toi duoc se lam ca lo tep song lai.
   */
  abstract markPurgeFailed(id: string, code: string, at: Date): Promise<FileRecord | null>;

  abstract createLink(input: CreateFileLinkInput): Promise<FileLink>;
  abstract linksOf(fileId: string): Promise<readonly FileLink[]>;
  abstract activeLinksOf(fileId: string): Promise<readonly FileLink[]>;
  abstract findActiveLink(
    fileId: string,
    businessOwnerType: string,
    businessOwnerId: string,
    purpose: string,
  ): Promise<FileLink | null>;

  /**
   * DAT hoac GO lenh giu theo phap ly — `#287` P8.
   *
   * Khong cho dat tren mot tep DA don byte: lenh giu la de chan byte bien mat, va byte do da bien
   * mat roi. Dat duoc o do se tao ra mot ho so trong trang thai "dang duoc giu" ma khong con gi de
   * giu — mot dong noi doi voi nguoi doc no.
   */
  abstract setLegalHold(id: string, legalHold: boolean): Promise<FileRecord | null>;

  /** Tep dang cho don byte — dau vao cua `FilePurgeService`. Co chan, khong quet ca bang. */
  abstract listPendingPurge(limit: number): Promise<readonly FileRecord[]>;
  /** Tep CON BYTE tren ly thuyet — dau vao cua phep do mo coi (`#287` P8). Co chan. */
  abstract listWithBlob(limit: number): Promise<readonly FileRecord[]>;
}

/**
 * VA CHAM UNIQUE GIA LAP, de duong trong-bo-nho hong GIONG duong Postgres.
 *
 * Cung khuon voi `InMemoryPhysicalReceiptHandoverRepository`. Neu ban trong bo nho nem mot `Error`
 * thuong, thi `isUniqueViolationOn()` khong nhan ra no — va duong xu ly va cham o `FileService` se
 * XANH o cuc bo trong khi KHONG bao gio chay. Do dung la mot lop kiem thu noi doi.
 */
class InMemoryUniqueViolation extends Error {
  readonly code = 'P2002';
  readonly meta: { modelName: string; target: string[] };

  constructor(index: UniqueIndexRef) {
    super('Unique constraint failed on the fields: (`' + index.column + '`)');
    this.name = 'InMemoryUniqueViolation';
    this.meta = { modelName: index.model, target: [index.column] };
  }
}

/**
 * KHO TRONG BO NHO — mac dinh khi `PERSISTENCE=memory` (demo/CI).
 *
 * Giu DUNG ngu nghia so-roi-dat cua ban Prisma: moi phep doi trang thai kiem lai trang thai nguon
 * va tra `null` khi khong khop. Mot ban trong bo nho "de tinh" se lam ca bo bai test o duong nay
 * xanh o cuc bo va do o Postgres.
 *
 * `structuredClone` o moi loi ra: neu tra ve chinh doi tuong dang giu, mot ben goi sua no la sua
 * thang vao kho — va `.claude/rules/ecc/common/coding-style.md` cam dung dieu do o muc rong hon.
 */
export class InMemoryFileRepository extends FileRepository {
  private readonly files = new Map<string, FileRecord>();
  private readonly links = new Map<string, FileLink>();

  async create(input: CreateFileInput): Promise<FileRecord> {
    const record: FileRecord = {
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
      state: 'STAGED',
      scanState: 'NOT_SCANNED',
      scannedAt: null,
      retainUntil: input.retainUntil,
      legalHold: false,
      captureMetadata: input.captureMetadata,
      createdAt: new Date(),
      activatedAt: null,
      withdrawnAt: null,
      withdrawnBy: null,
      quarantinedAt: null,
      purgeRequestedAt: null,
      purgedAt: null,
      purgeAttempts: 0,
      purgeFailedAt: null,
      purgeFailureCode: null,
    };
    this.files.set(record.id, record);
    return structuredClone(record);
  }

  async findById(id: string): Promise<FileRecord | null> {
    const found = this.files.get(id);
    return found ? structuredClone(found) : null;
  }

  async activate(id: string, scanState: FileScanState, at: Date): Promise<FileRecord | null> {
    return this.transition(id, ['STAGED'], (file) => ({
      ...file,
      state: 'ACTIVE',
      scanState,
      scannedAt: scanState === 'NOT_SCANNED' ? file.scannedAt : at,
      activatedAt: at,
    }));
  }

  async quarantine(id: string, scanState: FileScanState, at: Date): Promise<FileRecord | null> {
    return this.transition(id, ['STAGED', 'ACTIVE'], (file) => ({
      ...file,
      state: 'QUARANTINED',
      scanState,
      scannedAt: at,
      quarantinedAt: at,
    }));
  }

  async withdraw(id: string, withdrawnBy: string, at: Date): Promise<FileRecord | null> {
    const updated = await this.transition(id, ['STAGED', 'ACTIVE'], (file) => ({
      ...file,
      state: 'WITHDRAWN',
      withdrawnAt: at,
      withdrawnBy,
    }));
    if (!updated) return null;
    // Cung "giao dich": trong bo nho thi hai buoc nay khong the xen ngang nhau, vi khong co `await`
    // nao o giua. Ban Prisma dung `$transaction` de dat cung dam bao do.
    for (const [linkId, link] of this.links) {
      if (link.fileId !== id || link.state !== 'ACTIVE') continue;
      this.links.set(linkId, { ...link, state: 'WITHDRAWN', withdrawnBy, withdrawnAt: at });
    }
    return updated;
  }

  async requestPurge(id: string, at: Date): Promise<FileRecord | null> {
    return this.transition(id, ['WITHDRAWN', 'QUARANTINED'], (file) => ({
      ...file,
      purgeRequestedAt: file.purgeRequestedAt ?? at,
    }));
  }

  async markPurged(id: string, at: Date): Promise<FileRecord | null> {
    return this.transition(id, ['WITHDRAWN', 'QUARANTINED'], (file) => ({
      ...file,
      state: 'PURGED',
      purgedAt: at,
      purgeFailedAt: null,
      purgeFailureCode: null,
    }));
  }

  async markPurgeFailed(id: string, code: string, at: Date): Promise<FileRecord | null> {
    return this.transition(id, ['WITHDRAWN', 'QUARANTINED'], (file) => ({
      ...file,
      purgeAttempts: file.purgeAttempts + 1,
      purgeFailedAt: at,
      purgeFailureCode: code,
    }));
  }

  async setLegalHold(id: string, legalHold: boolean): Promise<FileRecord | null> {
    return this.transition(id, ['STAGED', 'ACTIVE', 'WITHDRAWN', 'QUARANTINED'], (file) => ({
      ...file,
      legalHold,
    }));
  }

  async createLink(input: CreateFileLinkInput): Promise<FileLink> {
    const link: FileLink = {
      id: randomUUID(),
      fileId: input.fileId,
      businessOwnerType: input.businessOwnerType,
      businessOwnerId: input.businessOwnerId,
      purpose: input.purpose,
      state: 'ACTIVE',
      createdBy: input.createdBy,
      createdAt: new Date(),
      withdrawnBy: null,
      withdrawnAt: null,
    };
    // Cung rang buoc ma `PlatformFileLink_activeLink_key` dat o Postgres: MOT lien ket dang hieu
    // luc cho mot bo (tep, loai so huu, ma so huu, muc dich). Giu o ca hai cho de bai test o duong
    // bo nho khong xanh gia truoc mot va cham ma Postgres se tu choi.
    const clash = await this.findActiveLink(
      input.fileId,
      input.businessOwnerType,
      input.businessOwnerId,
      input.purpose,
    );
    if (clash) throw new InMemoryUniqueViolation(PLATFORM_FILE_ACTIVE_LINK);
    this.links.set(link.id, link);
    return structuredClone(link);
  }

  async linksOf(fileId: string): Promise<readonly FileLink[]> {
    return [...this.links.values()]
      .filter((link) => link.fileId === fileId)
      .map((link) => structuredClone(link));
  }

  async activeLinksOf(fileId: string): Promise<readonly FileLink[]> {
    return (await this.linksOf(fileId)).filter((link) => link.state === 'ACTIVE');
  }

  async findActiveLink(
    fileId: string,
    businessOwnerType: string,
    businessOwnerId: string,
    purpose: string,
  ): Promise<FileLink | null> {
    const found = [...this.links.values()].find(
      (link) =>
        link.fileId === fileId &&
        link.businessOwnerType === businessOwnerType &&
        link.businessOwnerId === businessOwnerId &&
        link.purpose === purpose &&
        link.state === 'ACTIVE',
    );
    return found ? structuredClone(found) : null;
  }

  async listPendingPurge(limit: number): Promise<readonly FileRecord[]> {
    return [...this.files.values()]
      .filter((file) => file.purgeRequestedAt !== null && file.state !== 'PURGED')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((file) => structuredClone(file));
  }

  async listWithBlob(limit: number): Promise<readonly FileRecord[]> {
    return [...this.files.values()]
      .filter((file) => file.state !== 'PURGED')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((file) => structuredClone(file));
  }

  /**
   * SO trang thai nguon ROI DAT — mot cho duy nhat, nen khong phep nao o tren "quen" kiem.
   *
   * `null` khi trang thai hien tai khong nam trong `from`. Do la cung cau tra loi ma `updateMany`
   * cua Prisma cho khi `count === 0`, va viec hai ban tra cung mot thu la dieu lam bo bai test o
   * duong bo nho co gia tri.
   */
  private async transition(
    id: string,
    from: readonly FileRecord['state'][],
    change: (file: FileRecord) => FileRecord,
  ): Promise<FileRecord | null> {
    const current = this.files.get(id);
    if (!current || !from.includes(current.state)) return null;
    const updated = change(current);
    this.files.set(id, updated);
    return structuredClone(updated);
  }
}
