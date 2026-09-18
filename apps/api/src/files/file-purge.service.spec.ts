import { describe, expect, it } from 'vitest';
import { InMemoryFileDomainAuthorizerRegistry } from './file-authorization.port.js';
import { FileAuthorizationService } from './file-authorization.service.js';
import { FILE_PURGE_MAX_ATTEMPTS, FilePurgeService } from './file-purge.service.js';
import {
  FakeDomainAuthorizer,
  FakeFileBlobStore,
  FakeFileScanner,
  jpegBytes,
  newAuditService,
} from './file-test-doubles.js';
import { FileDomainError } from './file.errors.js';
import { InMemoryFileRepository } from './file.repository.js';
import { FileService } from './file.service.js';
import type { FileRecord } from './file.types.js';

/**
 * DON BYTE + PHEP DO MO COI — `#287` P3/P8, va cac bai 7/8/12/13 cua P12.
 *
 * Bo nay do dung mot thu: mot lan don byte co lam dieu no noi khong. Ba cong chan, tinh idempotent,
 * va — quan trong nhat — chuyen gi xay ra khi kho HONG.
 */

const OWNER = 'user-owner';
const NOW = new Date('2026-09-18T02:00:00.000Z');

interface Harness {
  readonly files: InMemoryFileRepository;
  readonly blobs: FakeFileBlobStore;
  readonly domain: FakeDomainAuthorizer;
  readonly service: FileService;
  readonly purge: FilePurgeService;
  clock: Date;
}

function harness(): Harness {
  const files = new InMemoryFileRepository();
  const blobs = new FakeFileBlobStore();
  const registry = new InMemoryFileDomainAuthorizerRegistry();
  const domain = new FakeDomainAuthorizer();
  registry.register(domain);
  const state = { clock: NOW };
  const now = (): Date => state.clock;

  const service = new FileService(
    files,
    blobs,
    new FakeFileScanner(),
    new FileAuthorizationService(files, registry),
    registry,
    newAuditService(),
    undefined,
    now,
  );
  const purge = new FilePurgeService(files, blobs, newAuditService(), undefined, now);
  return {
    files,
    blobs,
    domain,
    service,
    purge,
    get clock(): Date {
      return state.clock;
    },
    set clock(value: Date) {
      state.clock = value;
    },
  };
}

/** Mot tep DA RUT, tuc da san sang cho buoc don byte. */
async function withdrawnFile(
  h: Harness,
  purpose: 'OPERATIONAL_DOCUMENT' | 'GENERIC_ATTACHMENT' = 'GENERIC_ATTACHMENT',
): Promise<FileRecord> {
  const file = await h.service.upload({
    bytes: jpegBytes(),
    purpose,
    originalFilename: 'x.jpg',
    declaredMimeType: 'image/jpeg',
    createdBy: OWNER,
  });
  h.domain.allow('DOC-1', 'ATTACH', 'WITHDRAW');
  await h.service.link({
    fileId: file.id,
    businessOwnerType: h.domain.businessOwnerType,
    businessOwnerId: 'DOC-1',
    purpose: 'OPERATIONAL_DOCUMENT',
    authUserId: OWNER,
  });
  return h.service.withdraw(file.id, OWNER, 'tai nham');
}

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof FileDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('Ba cong chan truoc khi mot byte bi don — PF-030', () => {
  it('tep dang la bang chung hieu luc: khong don duoc', async () => {
    const h = harness();
    const file = await h.service.upload({
      bytes: jpegBytes(),
      purpose: 'GENERIC_ATTACHMENT',
      originalFilename: 'x.jpg',
      declaredMimeType: 'image/jpeg',
      createdBy: OWNER,
    });

    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGE_STILL_IN_BUSINESS_USE');
    expect(h.blobs.objects.has(file.storageKey)).toBe(true);
    expect(h.blobs.removeCalls).toBe(0);
  });

  /** BAI 12 CUA P12: *"retention/legal hold prevents purge"*. */
  it('chua toi han luu tru: khong don duoc', async () => {
    const h = harness();
    const file = await withdrawnFile(h, 'OPERATIONAL_DOCUMENT');
    expect(file.retainUntil).not.toBeNull();

    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGE_BLOCKED_BY_RETENTION');
    expect(h.blobs.objects.has(file.storageKey)).toBe(true);

    // Qua han thi don duoc — chung minh cong do la MOT HAN, khong mot lenh cam vinh vien.
    h.clock = new Date(file.retainUntil!.getTime() + 1000);
    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGED');
  });

  it('dang giu theo lenh phap ly: khong don duoc, ke ca khi da qua han luu tru', async () => {
    const h = harness();
    const file = await withdrawnFile(h);
    // Khong con han luu tru rieng (`GENERIC_ATTACHMENT`), nen chi con MOT cong co the chan.
    expect(file.retainUntil).toBeNull();
    await h.purge.setLegalHold(file.id, true, OWNER);

    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGE_BLOCKED_BY_LEGAL_HOLD');
    expect(h.blobs.objects.has(file.storageKey)).toBe(true);
    expect(h.blobs.removeCalls).toBe(0);

    // Go lenh giu thi don duoc — cong la mot LENH, khong mot trang thai chet.
    await h.purge.setLegalHold(file.id, false, OWNER);
    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGED');
  });

  /** Mot lenh giu dat sau khi byte da bien mat la mot dong noi doi voi nguoi doc ho so. */
  it('khong dat duoc lenh giu tren mot tep da don byte', async () => {
    const h = harness();
    const file = await withdrawnFile(h);
    await h.purge.purge(file.id);

    expect(await reasonOf(h.purge.setLegalHold(file.id, true, OWNER))).toBe(
      'FILE_ALREADY_INACTIVE',
    );
  });
});

describe('Don byte: idempotent va chiu duoc kho hong — PF-031', () => {
  /** BAI 8 CUA P12: *"purge idempotent"*. */
  it('don hai lan: lan hai khong cham vao kho', async () => {
    const h = harness();
    const file = await withdrawnFile(h);

    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGED');
    expect(h.blobs.objects.has(file.storageKey)).toBe(false);

    const again = await h.purge.purge(file.id);
    expect(again.reason).toBe('FILE_PURGE_ALREADY_DONE');
    // KHONG cham vao kho lan hai: mot lenh don lap lai co the xoa mot object DA DUOC mot tep khac
    // dung lai cung khoa.
    expect(h.blobs.removeCalls).toBe(1);
    expect((await h.files.findById(file.id))?.state).toBe('PURGED');
  });

  /**
   * BAI 7 CUA P12: *"logical withdrawal survives physical delete failure"*.
   *
   * Neu lan don hong keo trang thai ve `WITHDRAWN` -> `ACTIVE`, thi mot kho tam thoi khong voi toi
   * duoc se lam CA LO tep song lai — tuc mot su co ha tang bien thanh mot lan phuc hoi bang chung
   * ma khong ai yeu cau.
   */
  it('kho nem: trang thai logic KHONG doi, va lan don lam lai duoc', async () => {
    const h = harness();
    const file = await withdrawnFile(h);
    h.blobs.removeThrows = 'kho khong voi toi duoc';

    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGE_FAILED');

    const afterFailure = await h.files.findById(file.id);
    expect(afterFailure?.state).toBe('WITHDRAWN');
    expect(afterFailure?.purgeAttempts).toBe(1);
    expect(afterFailure?.purgeFailureCode).toBe('FILE_BLOB_REMOVE_THREW');
    expect(afterFailure?.purgeFailedAt).toEqual(NOW);

    // Kho hoi lai -> lam lai la xong. Khong mot buoc go tay nao o giua.
    h.blobs.removeThrows = null;
    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGED');
    expect((await h.files.findById(file.id))?.state).toBe('PURGED');
  });

  /**
   * Kho khong don duoc byte (`MEDIA_STORE=none`) la mot ma RIENG, khong mot loi.
   *
   * Tep DA bien mat khoi ho so dung nhu nguoi dung yeu cau; con lai mot object khong ai tro toi, va
   * nguoi van hanh phai thay duoc dong nay de don tay. Cung hop dong voi `EVIDENCE_PURGE_UNSUPPORTED`.
   */
  it('kho khong don duoc: mot ma rieng, va trang thai khong nhay sang PURGED', async () => {
    const h = harness();
    const file = await withdrawnFile(h);
    h.blobs.removable = false;

    expect((await h.purge.purge(file.id)).reason).toBe('FILE_PURGE_UNSUPPORTED');
    expect((await h.files.findById(file.id))?.state).toBe('WITHDRAWN');
  });

  /** `#287` P8 *"bounded retry"*: mot tep hong mai khong lam lo don dung yen mot cho. */
  it('vong don bo qua tep da het so lan thu', async () => {
    const h = harness();
    const file = await withdrawnFile(h);
    await h.purge.requestPurge(file.id);
    h.blobs.removeThrows = 'kho khong voi toi duoc';

    for (let attempt = 0; attempt < FILE_PURGE_MAX_ATTEMPTS; attempt += 1) {
      await h.purge.runPendingPurges(10);
    }
    expect((await h.files.findById(file.id))?.purgeAttempts).toBe(FILE_PURGE_MAX_ATTEMPTS);

    const callsBefore = h.blobs.removeCalls;
    expect(await h.purge.runPendingPurges(10)).toEqual([]);
    expect(h.blobs.removeCalls).toBe(callsBefore);
  });

  it('danh dau can don chi ap cho tep da rut, va lam lai khong doi moc', async () => {
    const h = harness();
    const active = await h.service.upload({
      bytes: jpegBytes(),
      purpose: 'GENERIC_ATTACHMENT',
      originalFilename: 'x.jpg',
      declaredMimeType: 'image/jpeg',
      createdBy: OWNER,
    });
    expect(await reasonOf(h.purge.requestPurge(active.id))).toBe(
      'FILE_PURGE_STILL_IN_BUSINESS_USE',
    );

    const file = await withdrawnFile(h);
    const first = await h.purge.requestPurge(file.id);
    h.clock = new Date(NOW.getTime() + 60_000);
    const second = await h.purge.requestPurge(file.id);
    expect(second.purgeRequestedAt).toEqual(first.purgeRequestedAt);
  });
});

/* ------------------------------------------------------------------ *
 * BAI 13 CUA P12 — phep do mo coi KHONG SUA GI
 * ------------------------------------------------------------------ */
describe('Phep do mo coi — PF-032', () => {
  it('bao cao dung nhung tep mat byte, va KHONG doi mot dong nao', async () => {
    const h = harness();
    const healthy = await withdrawnFile(h);
    const orphan = await h.service.upload({
      bytes: jpegBytes('mo-coi'),
      purpose: 'GENERIC_ATTACHMENT',
      originalFilename: 'y.jpg',
      declaredMimeType: 'image/jpeg',
      createdBy: OWNER,
    });
    // Byte bien mat khoi kho ma khong ai bao — dung tinh huong phep do nay ton tai de phat hien.
    h.blobs.objects.delete(orphan.storageKey);

    const before = await Promise.all([healthy.id, orphan.id].map((id) => h.files.findById(id)));
    const report = await h.purge.scanOrphans(50);

    expect(report.scanned).toBe(2);
    expect(report.metadataWithoutBlob).toEqual([orphan.id]);
    expect(report.inconclusive).toBe(0);

    // KHONG MOT DONG NAO DOI. `#287` P8 doi *"cleanup dry-run first"*, va P14 cam don pha huy trong
    // lane nay — nen ham nay khong co duong nao toi mot lenh ghi.
    const after = await Promise.all([healthy.id, orphan.id].map((id) => h.files.findById(id)));
    expect(after).toEqual(before);
    expect(h.blobs.removeCalls).toBe(0);
  });

  /**
   * Kho khong tra loi duoc (`MEDIA_STORE=none`) KHONG duoc dem thanh "mat byte": lam vay se bao
   * TOAN BO ho so la mo coi moi lan chay CI, tuc bien mot phep do thanh mot nguon bao dong gia.
   */
  it('kho khong tra loi duoc: bao KHONG KET LUAN DUOC, khong bao mo coi', async () => {
    const h = harness();
    await h.service.upload({
      bytes: jpegBytes(),
      purpose: 'GENERIC_ATTACHMENT',
      originalFilename: 'y.jpg',
      declaredMimeType: 'image/jpeg',
      createdBy: OWNER,
    });
    const off = new FakeFileBlobStore('NONE', false);
    const offPurge = new FilePurgeService(h.files, off, newAuditService(), undefined, () => NOW);

    const report = await offPurge.scanOrphans(50);

    expect(report.metadataWithoutBlob).toEqual([]);
    expect(report.inconclusive).toBe(1);
  });

  it('khong doc tep da don byte — chung khong phai mo coi, chung da xong viec', async () => {
    const h = harness();
    const file = await withdrawnFile(h);
    await h.purge.purge(file.id);

    const report = await h.purge.scanOrphans(50);
    expect(report.scanned).toBe(0);
    expect(report.metadataWithoutBlob).toEqual([]);
  });
});
