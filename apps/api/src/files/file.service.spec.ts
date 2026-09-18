import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFileDomainAuthorizerRegistry } from './file-authorization.port.js';
import { FileAuthorizationService } from './file-authorization.service.js';
import { PLATFORM_FILE_KEY_PREFIX } from './file-policy.js';
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
import type { FileRecord, StageFileCommand } from './file.types.js';

/**
 * NEN TANG TEP — vong doi, quyen, rut. `#287` P1/P2/P3/P5/P6, va cac bai 1..6 cua P12.
 *
 * Bo nay chay HOAN TOAN trong bo nho. Cai no chung minh la LUAT: ai doc duoc gi, cai gi chan cai
 * gi. Cai no KHONG chung minh la rang buoc cua Postgres va hanh vi khi hai lan ghi den cung luc —
 * do la viec cua `platform-file.int.spec.ts`, va hai bo khong duoc chong len nhau.
 */

const DRIVER_A = 'user-driver-a';
const DRIVER_B = 'user-driver-b';
const ACCOUNTANT = 'user-accounting';
const NOW = new Date('2026-09-18T02:00:00.000Z');

const upload = (overrides: Partial<StageFileCommand> = {}): StageFileCommand => ({
  bytes: jpegBytes(),
  purpose: 'OPERATIONAL_DOCUMENT',
  originalFilename: 'bien-nhan.jpg',
  declaredMimeType: 'image/jpeg',
  createdBy: DRIVER_A,
  ...overrides,
});

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof FileDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('Nen tang tep — PF-020', () => {
  let files: InMemoryFileRepository;
  let blobs: FakeFileBlobStore;
  let scanner: FakeFileScanner;
  let registry: InMemoryFileDomainAuthorizerRegistry;
  let domain: FakeDomainAuthorizer;
  let service: FileService;

  beforeEach(() => {
    files = new InMemoryFileRepository();
    blobs = new FakeFileBlobStore();
    scanner = new FakeFileScanner();
    registry = new InMemoryFileDomainAuthorizerRegistry();
    domain = new FakeDomainAuthorizer();
    registry.register(domain);
    service = new FileService(
      files,
      blobs,
      scanner,
      new FileAuthorizationService(files, registry),
      registry,
      newAuditService(),
      undefined,
      () => NOW,
    );
  });

  /* ---------------------------------------------------------------- *
   * MUC 1 CUA NGHIEM THU CUOI — mot lan tai len ra mot ma DUC
   * ---------------------------------------------------------------- */
  describe('Tai len', () => {
    it('sinh mot ma on dinh, doc lap voi khoa luu tru', async () => {
      const file = await service.upload(upload());

      expect(file.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(file.state).toBe('ACTIVE');
      expect(file.storageKey).toContain(PLATFORM_FILE_KEY_PREFIX);
      // Ma KHONG suy ra duoc tu khoa, va khoa KHONG suy ra duoc tu ma ma khong biet thang/muc dich.
      expect(file.storageKey).not.toBe(file.id);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(blobs.objects.get(file.storageKey)?.body).toEqual(jpegBytes());
    });

    it('ten hien thi la ten DA CHUAN HOA, khong ten nguoi dung gui len', async () => {
      const file = await service.upload(upload({ originalFilename: '../../etc/passwd.exe' }));

      expect(file.safeFilename).toBe('passwd.jpg');
      expect(file.originalFilename).toBe('../../etc/passwd.exe');
    });

    /**
     * FAIL-CLOSED khi kho tat. Nhan roi vut se lam nguoi dung thay "tai len xong" trong khi khong
     * byte nao ton tai — lo ra vai tuan sau, dung luc doi chieu.
     */
    it('tu choi khi kho dang tat, thay vi nhan roi vut', async () => {
      const off = new FakeFileBlobStore('NONE', false);
      const offService = new FileService(
        files,
        off,
        scanner,
        new FileAuthorizationService(files, registry),
        registry,
        newAuditService(),
        undefined,
        () => NOW,
      );

      expect(await reasonOf(offService.upload(upload()))).toBe('FILE_STORE_DISABLED');
      // KHONG duoc de lai mot hang metadata cho mot tep khong co byte.
      expect(await files.listWithBlob(10)).toHaveLength(0);
    });

    it('tu choi noi dung chay duoc truoc ca danh sach trang', async () => {
      const reason = await reasonOf(
        service.upload(
          upload({ bytes: Buffer.from('MZ\u0090program'), declaredMimeType: 'image/jpeg' }),
        ),
      );
      expect(reason).toBe('FILE_ACTIVE_CONTENT_REJECTED');
      expect(blobs.objects.size).toBe(0);
    });

    it('ghi han luu tru theo muc dich', async () => {
      const file = await service.upload(upload());
      expect(file.retainUntil).not.toBeNull();
      expect(file.retainUntil!.getTime()).toBeGreaterThan(NOW.getTime());

      const casual = await service.upload(upload({ purpose: 'GENERIC_ATTACHMENT' }));
      expect(casual.retainUntil).toBeNull();
    });
  });

  /* ---------------------------------------------------------------- *
   * BAI 11 CUA P12 — cong quet la mot cong THAT
   * ---------------------------------------------------------------- */
  describe('Cong quet — PF-021', () => {
    it('may quet tat: kich hoat, va ghi ro la KHONG AI NHIN', async () => {
      const file = await service.upload(upload());
      expect(file.state).toBe('ACTIVE');
      expect(file.scanState).toBe('NOT_SCANNED');
    });

    /**
     * BAI 11: *"scanner-required path fails closed"*. Mot he thong doi phai quet ma khong co may
     * quet nao tra loi KHONG duoc tu cho qua.
     */
    it('bat buoc quet nhung khong may quet nao tra loi: KHONG kich hoat', async () => {
      scanner.mode = 'REQUIRED';
      scanner.verdict = null;

      expect(await reasonOf(service.upload(upload()))).toBe('FILE_SCAN_REQUIRED');
      const staged = await files.listWithBlob(10);
      expect(staged.map((file) => file.state)).toEqual(['STAGED']);
    });

    it.each([
      ['INFECTED', 'FILE_SCAN_INFECTED'],
      ['FAILED', 'FILE_SCAN_FAILED'],
    ] as const)('ket qua %s: chuyen cach ly va nem %s', async (verdict, reason) => {
      scanner.mode = 'REQUIRED';
      scanner.verdict = verdict;

      expect(await reasonOf(service.upload(upload()))).toBe(reason);
      const quarantined = await files.listWithBlob(10);
      expect(quarantined.map((file) => file.state)).toEqual(['QUARANTINED']);
      expect(quarantined[0]?.scanState).toBe(verdict);
    });

    it('ket qua CLEAN: kich hoat va ghi lai la da quet', async () => {
      scanner.mode = 'REQUIRED';
      scanner.verdict = 'CLEAN';

      const file = await service.upload(upload());
      expect(file.state).toBe('ACTIVE');
      expect(file.scanState).toBe('CLEAN');
      expect(file.scannedAt).toEqual(NOW);
    });
  });
});

/** Mot bo may moi cho moi bai — cung hinh dang voi `beforeEach` o tren, dung duoc o pham vi khac. */
function harness(): {
  files: InMemoryFileRepository;
  blobs: FakeFileBlobStore;
  domain: FakeDomainAuthorizer;
  registry: InMemoryFileDomainAuthorizerRegistry;
  service: FileService;
} {
  const files = new InMemoryFileRepository();
  const blobs = new FakeFileBlobStore();
  const registry = new InMemoryFileDomainAuthorizerRegistry();
  const domain = new FakeDomainAuthorizer();
  registry.register(domain);
  const service = new FileService(
    files,
    blobs,
    new FakeFileScanner(),
    new FileAuthorizationService(files, registry),
    registry,
    newAuditService(),
    undefined,
    () => NOW,
  );
  return { files, blobs, domain, registry, service };
}

/* ------------------------------------------------------------------ *
 * BAI 3/4 CUA P12 + MUC 2 CUA NGHIEM THU CUOI
 * ------------------------------------------------------------------ */
describe('Quyen doc — PF-022', () => {
  it('nguoi tao doc duoc tep CHUA gan vao dau', async () => {
    const { service } = harness();
    const file = await service.upload(upload());

    await expect(service.describeFor(file.id, DRIVER_A)).resolves.toMatchObject({ id: file.id });
  });

  /**
   * BAI 4: *"cross-owner/self access denied"*. Lai xe B khong doc duoc tep cua lai xe A, ke ca khi
   * ho cam dung ma.
   */
  it('nguoi khac KHONG doc duoc tep chua gan vao dau', async () => {
    const { service } = harness();
    const file = await service.upload(upload());

    expect(await reasonOf(service.describeFor(file.id, DRIVER_B))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });

  /**
   * BAI 3: *"foreign/unknown File ID fails closed"* — VA khong de dem duoc.
   *
   * Mot ma khong ton tai va mot ma co that nhung khong phai cua minh phai tra CUNG MOT ma loi va
   * CUNG MOT loai HTTP. Neu khac nhau, thi thu lan luot cac ma la dem duoc bao nhieu tep co that.
   */
  it('ma khong ton tai va ma cua nguoi khac tra ve KHONG PHAN BIET DUOC', async () => {
    const { service } = harness();
    const file = await service.upload(upload());

    const stranger = await reasonOf(service.describeFor(file.id, DRIVER_B));
    const nonsense = await reasonOf(service.describeFor('khong-co-ma-nay', DRIVER_B));
    expect(stranger).toBe(nonsense);
    expect(stranger).toBe('FILE_NOT_AVAILABLE_TO_CALLER');

    const kinds = await Promise.all(
      [file.id, 'khong-co-ma-nay'].map(async (id) => {
        try {
          await service.describeFor(id, DRIVER_B);
          return 'NO_ERROR';
        } catch (error) {
          return error instanceof FileDomainError ? error.kind : 'UNEXPECTED';
        }
      }),
    );
    expect(kinds).toEqual(['DENIED', 'DENIED']);
  });

  it('mot danh tinh rong khong bao gio la mot danh tinh', async () => {
    const { service } = harness();
    const file = await service.upload(upload());

    expect(await reasonOf(service.describeFor(file.id, ''))).toBe('FILE_NOT_AVAILABLE_TO_CALLER');
  });

  /**
   * MOT KHI DA GAN, NGUOI TAO KHONG CON LA NGUOI QUYET.
   *
   * Day la cho de nhat de lam sai: giu lai mot "cua sau cho nguoi tai len" nghe rat hop ly, va no
   * pha dung bai kiem ma `#287` P6 dat ra ve bang chung bat bien.
   */
  it('tep da gan: MIEN quyet, khong phai nguoi tao', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });

    // Mien chua cho ai doc — ke ca nguoi tai len cung khong con doc duoc.
    expect(await reasonOf(service.describeFor(file.id, DRIVER_A))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );

    domain.allow('DOC-1', 'READ');
    await expect(service.describeFor(file.id, ACCOUNTANT)).resolves.toMatchObject({ id: file.id });
  });

  /** Mot ten so huu khong ai dang ky = TU CHOI, khong "cho qua vi khong biet" — `#287` P6. */
  it('lien ket tro vao mot mien khong ai dang ky: tu choi', async () => {
    const { service, files, domain } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });
    // Mot lien ket thu hai, tro vao mot ten khong ai nhan tra loi.
    await files.createLink({
      fileId: file.id,
      businessOwnerType: 'MIEN_KHONG_AI_DANG_KY',
      businessOwnerId: 'X-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      createdBy: DRIVER_A,
    });

    expect(await reasonOf(service.describeFor(file.id, ACCOUNTANT))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });
});

/* ------------------------------------------------------------------ *
 * MUC 3 CUA NGHIEM THU CUOI — lien ket nghiep vu chung
 * ------------------------------------------------------------------ */
describe('Gan tep vao doi tuong nghiep vu — PF-023', () => {
  it('gan duoc khi ca hai cong deu mo', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH');

    const link = await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });

    expect(link).toMatchObject({ fileId: file.id, businessOwnerId: 'DOC-1', state: 'ACTIVE' });
  });

  /**
   * CONG THU NHAT la cai chan leo thang: neu chi kiem cong cua mien dich, thi ai nam quyen tren mot
   * doi tuong cua chinh minh se gan duoc MOT MA TEP BAT KY vao do — roi doc no qua chinh lien ket
   * vua tao. Mot ma doan trung se thanh mot lan doc du lieu cua nguoi la.
   */
  it('KHONG gan duoc mot tep cua nguoi khac, du mien dich dong y', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload({ createdBy: DRIVER_A }));
    domain.allow('DOC-B', 'ATTACH', 'READ');

    expect(
      await reasonOf(
        service.link({
          fileId: file.id,
          businessOwnerType: domain.businessOwnerType,
          businessOwnerId: 'DOC-B',
          purpose: 'OPERATIONAL_DOCUMENT',
          authUserId: DRIVER_B,
        }),
      ),
    ).toBe('FILE_NOT_AVAILABLE_TO_CALLER');
  });

  it('tu choi khi mien dich khong nhan', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());

    expect(
      await reasonOf(
        service.link({
          fileId: file.id,
          businessOwnerType: domain.businessOwnerType,
          businessOwnerId: 'DOC-1',
          purpose: 'OPERATIONAL_DOCUMENT',
          authUserId: DRIVER_A,
        }),
      ),
    ).toBe('FILE_LINK_DENIED_BY_DOMAIN');
  });

  it('tu choi khi khong mien nao nhan ten so huu do', async () => {
    const { service } = harness();
    const file = await service.upload(upload());

    expect(
      await reasonOf(
        service.link({
          fileId: file.id,
          businessOwnerType: 'MIEN_LA',
          businessOwnerId: 'X-1',
          purpose: 'OPERATIONAL_DOCUMENT',
          authUserId: DRIVER_A,
        }),
      ),
    ).toBe('FILE_LINK_OWNER_UNKNOWN');
  });

  /** BAI 16 CUA P12: lam lai mot lan gan la khong doi gi, va KHONG phai mot loi. */
  it('gan hai lan cung mot thu: mot lien ket, khong nem', async () => {
    const { service, domain, files } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH');
    const command = {
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    };

    const first = await service.link(command);
    const second = await service.link(command);

    expect(second.id).toBe(first.id);
    expect(await files.activeLinksOf(file.id)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * BAI 5/6 CUA P12 + MUC 4/5 CUA NGHIEM THU CUOI
 * ------------------------------------------------------------------ */
describe('Rut tep — PF-024', () => {
  const linkTo = async (
    service: FileService,
    domain: FakeDomainAuthorizer,
    file: FileRecord,
    ownerId: string,
  ): Promise<void> => {
    domain.allow(ownerId, 'ATTACH');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: ownerId,
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });
  };

  it('rut xong thi duong doc hieu luc dong, nhung hang o lai', async () => {
    const { service, domain, files } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    domain.allow('DOC-1', 'WITHDRAW', 'READ');

    const withdrawn = await service.withdraw(file.id, ACCOUNTANT, 'tai nham');

    expect(withdrawn.state).toBe('WITHDRAWN');
    expect(withdrawn.withdrawnBy).toBe(ACCOUNTANT);
    expect(await reasonOf(service.describeFor(file.id, ACCOUNTANT))).toBe('FILE_NOT_ACTIVE');

    // LICH SU O LAI: hang van doc duoc tu kho, va lien ket van con mang gio go.
    const kept = await files.findById(file.id);
    expect(kept?.withdrawnAt).toEqual(NOW);
    const links = await files.linksOf(file.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ state: 'WITHDRAWN', withdrawnBy: ACCOUNTANT });
  });

  /** `#287` P3 bat bien 2: rut tep va go lien ket la MOT don vi cong viec. */
  it('rut tep go MOI lien ket dang hieu luc', async () => {
    const { service, domain, files } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    await linkTo(service, domain, file, 'DOC-2');
    domain.allow('DOC-1', 'WITHDRAW');
    domain.allow('DOC-2', 'WITHDRAW');

    await service.withdraw(file.id, ACCOUNTANT, 'tai nham');

    expect(await files.activeLinksOf(file.id)).toHaveLength(0);
  });

  /**
   * BAI 6 CUA P12 + MUC 5 CUA NGHIEM THU CUOI: mot lien ket BAT BIEN chan lan rut, va no tra mot
   * ma KHAC HAN voi "ban khong co quyen".
   */
  it('mot mien da chot bang chung: KHONG AI rut duoc, va ma noi ro dieu do', async () => {
    const { service, domain, files } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    domain.lock('DOC-1', 'WITHDRAW');

    expect(await reasonOf(service.withdraw(file.id, ACCOUNTANT, 'thu rut'))).toBe(
      'FILE_WITHDRAWAL_LOCKED_BY_DOMAIN',
    );
    expect((await files.findById(file.id))?.state).toBe('ACTIVE');
  });
});

describe('Rut tep — dong thuan giua nhieu mien, PF-025', () => {
  const linkTo = async (
    service: FileService,
    domain: FakeDomainAuthorizer,
    file: FileRecord,
    ownerId: string,
  ): Promise<void> => {
    domain.allow(ownerId, 'ATTACH');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: ownerId,
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });
  };

  /**
   * RUT DOI TAT CA DONG Y. Neu chi can mot mien, thi nguoi nam quyen tren doi tuong A se go duoc to
   * bang chung ra khoi ho so cua doi tuong B — ma khong ai ben B biet.
   */
  it('mot mien dong y, mot mien khong: KHONG rut duoc', async () => {
    const { service, domain, files } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    await linkTo(service, domain, file, 'DOC-2');
    domain.allow('DOC-1', 'WITHDRAW');

    expect(await reasonOf(service.withdraw(file.id, ACCOUNTANT, 'thu rut'))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
    expect((await files.findById(file.id))?.state).toBe('ACTIVE');
  });

  /** MOT tieng `LOCKED` thang moi tieng dong y — nguoi dung phai biet di xin quyen la vo ich. */
  it('mot mien chot, mot mien dong y: van la LOCKED', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    await linkTo(service, domain, file, 'DOC-2');
    domain.allow('DOC-1', 'WITHDRAW');
    domain.lock('DOC-2', 'WITHDRAW');

    expect(await reasonOf(service.withdraw(file.id, ACCOUNTANT, 'thu rut'))).toBe(
      'FILE_WITHDRAWAL_LOCKED_BY_DOMAIN',
    );
  });

  /**
   * DOC can MOT tieng dong y, khac han RUT. Bat doi xung nay la co y: ai duoc xem MOT trong hai ho
   * so thi da duoc xem to giay do roi.
   */
  it('doc chi can MOT mien dong y', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    await linkTo(service, domain, file, 'DOC-2');
    domain.allow('DOC-2', 'READ');

    await expect(service.describeFor(file.id, ACCOUNTANT)).resolves.toMatchObject({ id: file.id });
  });

  it('rut hai lan: lan hai noi ro la da o trang thai cuoi', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    domain.allow('DOC-1', 'WITHDRAW');

    await service.withdraw(file.id, ACCOUNTANT, 'tai nham');
    expect(await reasonOf(service.withdraw(file.id, ACCOUNTANT, 'tai nham'))).toBe(
      'FILE_ALREADY_INACTIVE',
    );
  });

  /** BYTE VAN CON sau khi rut — don byte la mot buoc RIENG (`#287` P3 bat bien 3). */
  it('rut KHONG don byte', async () => {
    const { service, domain, blobs, files } = harness();
    const file = await service.upload(upload());
    await linkTo(service, domain, file, 'DOC-1');
    domain.allow('DOC-1', 'WITHDRAW');

    await service.withdraw(file.id, ACCOUNTANT, 'tai nham');

    expect(blobs.objects.has(file.storageKey)).toBe(true);
    expect(blobs.removeCalls).toBe(0);
    expect((await files.findById(file.id))?.purgedAt).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * MUC 2 CUA NGHIEM THU CUOI — doc lai bang MA, khong bang dinh vi
 * ------------------------------------------------------------------ */
describe('Doc byte — PF-026', () => {
  it('tra byte cho nguoi co quyen, va khong doi mot dinh vi nao', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH', 'READ');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });

    const result = await service.read(file.id, ACCOUNTANT);

    expect(result.blob.body).toEqual(jpegBytes());
    expect(result.blob.contentType).toBe('image/jpeg');
  });

  /**
   * "Co dong nhung khong con byte" la mot trang thai NGHIEP VU doc duoc, khong mot ngoai le cua SDK
   * luu tru do ra ngoai. Cung ly le voi `EVIDENCE_OBJECT_MISSING` cua `#169`.
   */
  it('co hang metadata nhung khong con byte: mot ma rieng', async () => {
    const { service, blobs } = harness();
    const file = await service.upload(upload());
    blobs.objects.delete(file.storageKey);

    expect(await reasonOf(service.read(file.id, DRIVER_A))).toBe('FILE_OBJECT_MISSING');
  });

  /**
   * RAO CHONG DOC TUY Y. `storageKey` la mot cot chuoi TU DO: mot dong `UPDATE` go tay hoac mot lan
   * nhap lieu se bien duong nay thanh mot cong doc bat ky object nao trong bucket.
   */
  it('khoa tro ra ngoai khu cua nen tang: tu choi doc', async () => {
    const { service, files, blobs } = harness();
    const created = await files.create({
      id: 'ma-tep-tu-dat',
      purpose: 'OPERATIONAL_DOCUMENT',
      originalFilename: 'x.jpg',
      safeFilename: 'x.jpg',
      declaredMimeType: 'image/jpeg',
      detectedMimeType: 'image/jpeg',
      byteSize: 4,
      sha256: 'a'.repeat(64),
      storageProvider: 'LOCAL',
      // Tro thang vao khu anh tin nhan Zalo — dung duong tan cong ma rao nay ton tai de chan.
      storageKey: 'media/2026/08/anh-cua-khach.webp',
      createdBy: DRIVER_A,
      retainUntil: null,
      captureMetadata: null,
    });
    await files.activate(created.id, 'NOT_SCANNED', NOW);
    await blobs.put('media/2026/08/anh-cua-khach.webp', Buffer.from('bi mat'), 'image/webp');

    expect(await reasonOf(service.read(created.id, DRIVER_A))).toBe('FILE_KEY_OUT_OF_SCOPE');
  });
});

/**
 * SUA LOI DUOC KHOA LAI: mot tep DA RUT khong quay ve thanh "tep cua nguoi tai len".
 *
 * Truoc khi sua, cong quyen chi nhin lien ket DANG HIEU LUC. Vi lan rut go het lien ket, tep roi ve
 * nhanh "chua gan vao dau" — tuc nguoi tai len lay lai duoc quyen ma mien vua tuoc di. Bai nay do
 * dung dieu do, va no do DO neu ai do doi `linksOf` o `FileAuthorizationService` ve `activeLinksOf`.
 */
describe('Mot tep da rut khong tro lai thanh tep cua ai — PF-027', () => {
  it('nguoi tai len KHONG lay lai duoc quyen sau khi tep bi rut', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload({ createdBy: DRIVER_A }));
    domain.allow('DOC-1', 'ATTACH');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });
    domain.allow('DOC-1', 'WITHDRAW');
    await service.withdraw(file.id, ACCOUNTANT, 'tai nham');

    // Neu cong quyen roi ve nhanh "chua gan vao dau", ma nay se la `FILE_NOT_ACTIVE` — tuc nguoi
    // tai len DA di qua duoc cong quyen. `FILE_NOT_AVAILABLE_TO_CALLER` nghia la ho khong qua.
    expect(await reasonOf(service.describeFor(file.id, DRIVER_A))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });

  it('mien VAN tra loi duoc cho mot tep da rut — de noi ro "da bi rut"', async () => {
    const { service, domain } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH');
    await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });
    domain.allow('DOC-1', 'WITHDRAW', 'READ');
    await service.withdraw(file.id, ACCOUNTANT, 'tai nham');

    expect(await reasonOf(service.describeFor(file.id, ACCOUNTANT))).toBe('FILE_NOT_ACTIVE');
  });
});

/**
 * CUA SO DUA cua lan gan — `#287` P12 bai 16.
 *
 * `FileService.link()` hoi `findActiveLink` truoc, roi moi ghi. Giua hai buoc do co mot cua so, va
 * mot nguoi khac ghi vao dung cua so do la tinh huong CSDL tu choi bang
 * `PlatformFileLink_activeLink_key`.
 *
 * Bo nho don thuan khong dung duoc cua so do, nen bai nay dung mot kho GIA: lan hoi dau tra `null`
 * (cua so mo), lan ghi nem va cham, va lan hoi sau tra ve hang nguoi kia vua ghi. Duong xu ly do
 * co that tren Postgres — `platform-file.int.spec.ts` PF-IT-08 chung minh chinh va cham do.
 */
describe('Hai lan gan den cung luc — PF-028', () => {
  it('lan thua doc lai lien ket cua nguoi thang, va KHONG nem', async () => {
    const { service, domain, files } = harness();
    const file = await service.upload(upload());
    domain.allow('DOC-1', 'ATTACH');

    const winner = await files.createLink({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      createdBy: 'nguoi-thang',
    });

    // Cua so dua: lan hoi DAU TIEN cua `link()` tra `null` du hang da co that.
    let firstLookup = true;
    const realFind = files.findActiveLink.bind(files);
    files.findActiveLink = async (...args: Parameters<typeof realFind>) => {
      if (firstLookup) {
        firstLookup = false;
        return null;
      }
      return realFind(...args);
    };

    const result = await service.link({
      fileId: file.id,
      businessOwnerType: domain.businessOwnerType,
      businessOwnerId: 'DOC-1',
      purpose: 'OPERATIONAL_DOCUMENT',
      authUserId: DRIVER_A,
    });

    expect(result.id).toBe(winner.id);
    expect(result.createdBy).toBe('nguoi-thang');
    expect(await files.activeLinksOf(file.id)).toHaveLength(1);
  });
});

/**
 * TOAN VEN NOI DUNG — `#287` P5, bai 9 cua P12.
 *
 * Mot he thong bang chung luu mot ma bam roi khong bao gio so lai chi dang luu mot vat trang tri.
 * Hai bai duoi day do dung dieu do: byte trong kho doi di, va duong doc PHAI dong lai.
 */
describe('Byte doc ra phai la byte da ghi — PF-029', () => {
  it('kich thuoc lech: tu choi tra byte', async () => {
    const { service, blobs } = harness();
    const file = await service.upload(upload());
    // Mot object bi ghi de trong kho — mot lan don byte di lac, mot lan khoi phuc sai, hay mot
    // nguoi co quyen vao bucket.
    blobs.objects.set(file.storageKey, {
      body: Buffer.concat([jpegBytes(), Buffer.from('them byte')]),
      contentType: 'image/jpeg',
    });

    expect(await reasonOf(service.read(file.id, DRIVER_A))).toBe('FILE_INTEGRITY_MISMATCH');
  });

  /**
   * CUNG KICH THUOC, KHAC NOI DUNG — truong hop ma mot phep kiem kich thuoc don thuan BO LOT, va
   * la ly do ma bam phai duoc so lai chu khong chi cat di.
   */
  it('cung kich thuoc nhung khac noi dung: van tu choi', async () => {
    const { service, blobs } = harness();
    const file = await service.upload(upload());
    const swapped = Buffer.from(jpegBytes());
    swapped[swapped.length - 1] = swapped[swapped.length - 1]! ^ 0xff;
    expect(swapped.byteLength).toBe(file.byteSize);
    blobs.objects.set(file.storageKey, { body: swapped, contentType: 'image/jpeg' });

    expect(await reasonOf(service.read(file.id, DRIVER_A))).toBe('FILE_INTEGRITY_MISMATCH');
  });

  it('byte nguyen ven: tra ra binh thuong', async () => {
    const { service } = harness();
    const file = await service.upload(upload());

    await expect(service.read(file.id, DRIVER_A)).resolves.toMatchObject({
      blob: { contentType: 'image/jpeg' },
    });
  });
});
