import { InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import {
  FileBlobStore,
  type FileBlob,
  type FileBlobStat,
  type FileBlobStoreHealth,
} from './file-blob.port.js';
import {
  FileDomainAuthorizer,
  type FileDomainAuthorizationRequest,
  type FileDomainVerdict,
} from './file-authorization.port.js';
import {
  FileScannerPort,
  type FileScanVerdict,
  type FileScannerMode,
} from './file-scanner.port.js';
import type { FileStorageProvider } from './file.types.js';

/**
 * BO DOI DONG THE dung chung cho cac bai kiem cua nen tang tep.
 *
 * Tach ra khoi tung tep `.spec.ts` vi ba tep kiem (`file.service`, `file-purge`,
 * `transport-document-file-binding`) deu can dung nhung lop nay, va ba ban sao se troi ra khoi nhau
 * dung vao luc mot hop dong doi.
 *
 * KHONG dat trong mot thu muc `__tests__`: `tsconfig` cua `apps/api` bien dich ca `src`, va mot tep
 * khong `.spec.ts` o day van duoc `tsc` kiem — tuc mot bo doi lech hop dong do o cong typecheck chu
 * khong doi mot lan chay test.
 */

/** Kho byte TRONG BO NHO — dung hop dong cua `FileBlobStore`, khong "de tinh" hon. */
export class FakeFileBlobStore extends FileBlobStore {
  readonly objects = new Map<string, FileBlob>();
  /** Dat `true` de mo phong mot kho khong don duoc byte (`MEDIA_STORE=none`). */
  removable = true;
  /** Dat mot ma de mo phong mot lan don byte NEM — `#287` P3 bat bien 5. */
  removeThrows: string | null = null;
  /** Dem so lan `remove()` that su cham vao kho — de do tinh idempotent. */
  removeCalls = 0;

  constructor(
    readonly provider: FileStorageProvider = 'LOCAL',
    readonly enabled = true,
  ) {
    super();
  }

  get supportsRemove(): boolean {
    return this.removable;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }

  async read(key: string): Promise<FileBlob | null> {
    return this.enabled ? (this.objects.get(key) ?? null) : null;
  }

  async stat(key: string): Promise<FileBlobStat> {
    if (!this.enabled) return { kind: 'UNSUPPORTED' };
    const found = this.objects.get(key);
    return found ? { kind: 'PRESENT', byteSize: found.body.byteLength } : { kind: 'MISSING' };
  }

  async remove(key: string): Promise<boolean> {
    this.removeCalls += 1;
    if (this.removeThrows) throw new Error(this.removeThrows);
    if (!this.enabled || !this.removable) return false;
    this.objects.delete(key);
    return true;
  }

  async check(): Promise<FileBlobStoreHealth> {
    return { healthy: this.enabled, detail: `fake:${this.provider}` };
  }
}

/** May quet GIA — dat `mode` va `verdict` de do bon nhanh cua cong quet. */
export class FakeFileScanner extends FileScannerPort {
  constructor(
    public mode: FileScannerMode = 'OFF',
    public verdict: FileScanVerdict | null = null,
  ) {
    super();
  }

  async scan(): Promise<FileScanVerdict | null> {
    return this.verdict;
  }
}

/**
 * MIEN GIA — tra loi theo mot bang dat san.
 *
 * Khoa la `${businessOwnerId}:${action}`, nen mot bai kiem dat duoc "nguoi nay doc duoc nhung khong
 * rut duoc" — tinh huong cua ke toan trong `#287` P6, va la tinh huong de viet sai nhat neu bo doi
 * chi tra mot cau tra loi cho ca ba hanh dong.
 */
export class FakeDomainAuthorizer extends FileDomainAuthorizer {
  readonly verdicts = new Map<string, FileDomainVerdict>();
  readonly asked: FileDomainAuthorizationRequest[] = [];

  constructor(readonly businessOwnerType = 'FAKE_OWNER') {
    super();
  }

  allow(businessOwnerId: string, ...actions: readonly string[]): this {
    for (const action of actions)
      this.verdicts.set(`${businessOwnerId}:${action}`, { kind: 'GRANTED' });
    return this;
  }

  lock(businessOwnerId: string, action: string): this {
    this.verdicts.set(`${businessOwnerId}:${action}`, { kind: 'LOCKED' });
    return this;
  }

  async authorize(request: FileDomainAuthorizationRequest): Promise<FileDomainVerdict> {
    this.asked.push(request);
    return (
      this.verdicts.get(`${request.link.businessOwnerId}:${request.action}`) ?? { kind: 'DENIED' }
    );
  }
}

export const newAuditService = (): AuditLogService =>
  new AuditLogService(new InMemoryAuditLogRepository());

/** Byte JPEG THAT — phep nhan dang noi dung la mot cong that, khong mot cho de bo qua. */
export const jpegBytes = (marker = 'x'): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(marker)]);
