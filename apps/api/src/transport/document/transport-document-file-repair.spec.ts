import { beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../../auth/user.repository.js';
import { InMemoryFileDomainAuthorizerRegistry } from '../../files/file-authorization.port.js';
import { FileAuthorizationService } from '../../files/file-authorization.service.js';
import {
  FakeFileBlobStore,
  FakeFileScanner,
  jpegBytes,
  newAuditService,
} from '../../files/file-test-doubles.js';
import { FileDomainError } from '../../files/file.errors.js';
import { InMemoryFileRepository, type CreateFileLinkInput } from '../../files/file.repository.js';
import { FileService } from '../../files/file.service.js';
import type { FileRecord } from '../../files/file.types.js';
import {
  TransportCheckpointCoreFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TransportDocumentCoreFacts,
  TransportDocumentSiteFacts,
  type DocumentLegFacts,
  type DocumentRunFacts,
} from './document-facts.port.js';
import { InMemoryOperationalDocumentRepository } from './document.repository.js';
import { OperationalDocumentService } from './document.service.js';
import type { OperationalDocument } from './document.types.js';
import { FilePlatformDocumentAdapter } from './file-platform.adapter.js';
import { InMemoryPhysicalReceiptHandoverRepository } from './handover.repository.js';
import {
  OperationalDocumentFileAuthorizer,
  TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
} from './operational-document-file.authorizer.js';

/**
 * LIEN KET TEP PHAI SUA DUOC — DC-022 / PF-062 (`#287` P2/P11).
 *
 * ============================================================================================
 * LO HONG MA BO BAI NAY DONG LAI
 * ============================================================================================
 *
 * `OperationalDocumentService.append()` ghi HAI noi: hang chung tu o mien van tai, lien ket tep o
 * nen tang tep. Khong mot giao dich nao bao duoc ca hai. Nen co that mot cua so ma lan ghi thu nhat
 * xong con lan thu hai hong.
 *
 * Truoc, cua so do de lai mot trang thai VINH VIEN:
 *
 *     `OperationalDocument.fileId != null` MA KHONG co mot `FileLink` nao dang hieu luc.
 *
 * Ba thu cong lai lam no khong sua duoc: `bind()` tra `void` nen khong ai biet no hong; adapter
 * nuot MOI `FileDomainError`; va ca hai duong gui lai tra ve hang chung tu cu NGAY LAP TUC, truoc
 * khi thu gan lai lan nao. Ke toan mo khong ra to bang chung, va khong mot thao tac nao cua nguoi
 * dung sua duoc.
 *
 * ============================================================================================
 * VI SAO BO NAY DUNG NEN TANG TEP THAT
 * ============================================================================================
 *
 * `document.service.spec.ts` do cung mot luat bang mot cong tep GIA — nhanh, va do duoc THU TU goi.
 * Nhung mot cong gia khong chung minh duoc rang ke toan DOC DUOC sau khi va, vi chinh phep doc do
 * di qua bang lien ket that va bo may quyen that.
 *
 * Nen bo nay rap ca hai ben lai: `FileService` that, `FileRepository` that (ban bo nho), va
 * `OperationalDocumentFileAuthorizer` that. Cai duoc do la LUAT, khong phai rang buoc cua Postgres.
 */

const NOW = new Date('2026-09-18T02:00:00.000Z');
const TZ = 'Asia/Ho_Chi_Minh';
const RUN_ID = 'run_1';
const LEG_ID = 'leg_1';
const DRIVER_ID = 'drv_a';
const DRIVER_USER = 'user-driver-a';
const ACCOUNTANT = 'user-accounting';
const ADMIN = 'user-admin';
const EVENT = 'evt-1';

const userRecord = (id: string, role: UserRole): AuthUserRecord => ({
  id,
  username: id,
  name: id,
  email: null,
  phone: null,
  passwordHash: 'x',
  role,
  disabledAt: null,
  credentialVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  lastLoginAt: null,
  passwordChangedAt: NOW,
});

class FakeIdentity extends TransportCheckpointCoreFacts {
  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return authUserId === DRIVER_USER ? { id: DRIVER_ID, fullName: 'Lai xe A' } : null;
  }
  async findRun(): Promise<CheckpointRunFacts | null> {
    return null;
  }
  async findLeg(): Promise<CheckpointLegFacts | null> {
    return null;
  }
  async wasDriverEverAssignedToRun(): Promise<boolean> {
    return true;
  }
}

class FakeCore extends TransportDocumentCoreFacts {
  async findRun(runId: string): Promise<DocumentRunFacts | null> {
    return runId === RUN_ID ? { id: RUN_ID, code: 'VC-001', status: 'ACTIVE' } : null;
  }
  async findLeg(legId: string): Promise<DocumentLegFacts | null> {
    return legId === LEG_ID ? { id: LEG_ID, runId: RUN_ID, orderId: 'ord_1' } : null;
  }
  async legIdsForOrder(): Promise<readonly string[]> {
    return [LEG_ID];
  }
  async orderExists(): Promise<boolean> {
    return true;
  }
}

class FakeSites extends TransportDocumentSiteFacts {
  async exists(): Promise<boolean> {
    return true;
  }
}

interface Harness {
  readonly fileRepo: InMemoryFileRepository;
  readonly files: FileService;
  readonly documents: InMemoryOperationalDocumentRepository;
  readonly service: OperationalDocumentService;
}

/** `registerAuthorizer: false` dung mot ban KHONG mien nao nhan tra loi — mot tu choi VINH VIEN. */
function harness(options: { registerAuthorizer?: boolean } = {}): Harness {
  const fileRepo = new InMemoryFileRepository();
  const documents = new InMemoryOperationalDocumentRepository();
  const handovers = new InMemoryPhysicalReceiptHandoverRepository();
  const identity = new FakeIdentity();
  const users = new InMemoryUserRepository([
    userRecord(DRIVER_USER, 'SALE'),
    userRecord(ACCOUNTANT, 'ACCOUNTING'),
    userRecord(ADMIN, 'ADMIN'),
  ]);

  const registry = new InMemoryFileDomainAuthorizerRegistry();
  if (options.registerAuthorizer !== false) {
    registry.register(new OperationalDocumentFileAuthorizer(documents, handovers, identity, users));
  }

  const files = new FileService(
    fileRepo,
    new FakeFileBlobStore(),
    new FakeFileScanner(),
    new FileAuthorizationService(fileRepo, registry),
    registry,
    newAuditService(),
    undefined,
    () => NOW,
  );

  const service = new OperationalDocumentService(
    documents,
    handovers,
    new InMemoryCheckpointRepository(),
    new FakeCore(),
    identity,
    new FakeSites(),
    new FilePlatformDocumentAdapter(files),
    { timeZone: TZ },
    undefined,
    () => NOW,
  );

  return { fileRepo, files, documents, service };
}

const uploadByDriver = (h: Harness): Promise<FileRecord> =>
  h.files.upload({
    bytes: jpegBytes(DRIVER_USER),
    purpose: 'OPERATIONAL_DOCUMENT',
    originalFilename: 'bien-nhan.jpg',
    declaredMimeType: 'image/jpeg',
    createdBy: DRIVER_USER,
  });

/** DUNG MOT lenh cho moi lan goi — cung `clientEventId`, tuc moi lan sau la mot lan GUI LAI. */
const record = (h: Harness, fileId: string): Promise<OperationalDocument> =>
  h.service.recordAsDriver({
    type: 'DELIVERY_RECEIPT',
    runId: RUN_ID,
    legId: LEG_ID,
    basis: 'DIGITAL_FILE',
    fileId,
    clientEventId: EVENT,
    authUserId: DRIVER_USER,
  });

/**
 * LAM HONG DUNG MOT LAN GHI LIEN KET — va dung o day chu khong o mot cho nao khac.
 *
 * Hong o `createLink` la mo phong dung cua so that: hang chung tu DA vao, `FileService.link()` da
 * qua het cac cong quyen, va chi lan ghi cuoi cung la truot. Nem mot `Error` thuong (khong phai
 * `FileDomainError`) vi day la su co HA TANG — cong tep phai doc no thanh `PENDING`, khong
 * `DENIED`.
 */
function breakLinkWriteOnce(fileRepo: InMemoryFileRepository): void {
  const real = fileRepo.createLink.bind(fileRepo);
  let broken = true;
  fileRepo.createLink = async (input: CreateFileLinkInput) => {
    if (broken) {
      broken = false;
      throw new Error('kho du lieu mat ket noi');
    }
    return real(input);
  };
}

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

const fileDenialOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof FileDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('Lien ket tep sua duoc tren nen tang that — DC-022 (`#287` P2/P11)', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  /**
   * BAI NGHIEM THU CUA BAN SOAT XET DOC LAP.
   *
   * *"inject bind failure after document creation -> retry same `clientEventId` -> one document,
   * one active FileLink, Accounting can read afterward."*
   *
   * Bon khang dinh trong MOT bai, va do la co y: tach chung ra thi mot ban va nua vo — vd va duoc
   * lien ket nhung sinh them mot to thu hai — se di qua duoc tung bai mot.
   */
  it('gan hong roi gui lai: MOT chung tu, MOT lien ket, va ke toan doc duoc', async () => {
    const file = await uploadByDriver(h);
    breakLinkWriteOnce(h.fileRepo);

    // ---- LAN GHI DAU: hang chung tu vao duoc, lien ket thi khong ----------------------------
    expect(await reasonOf(record(h, file.id))).toBe('DOCUMENT_FILE_BINDING_PENDING');

    const afterFailure = await h.documents.listForRun(RUN_ID);
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0]!.fileId).toBe(file.id);
    expect(await h.fileRepo.linksOf(file.id)).toHaveLength(0);

    // THIET HAI THAT SU cua lo hong: to bang chung nam ngoai tam voi cua nguoi phai doi soat no.
    expect(await fileDenialOf(h.files.describeFor(file.id, ACCOUNTANT))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );

    // ---- GUI LAI DUNG LENH CU: day la ca phep sua -------------------------------------------
    const repaired = await record(h, file.id);

    expect(repaired.id).toBe(afterFailure[0]!.id);
    expect(await h.documents.listForRun(RUN_ID)).toHaveLength(1);

    const links = await h.fileRepo.activeLinksOf(file.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      businessOwnerType: TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
      businessOwnerId: repaired.id,
      purpose: 'OPERATIONAL_DOCUMENT',
    });

    // VA KE TOAN MO DUOC — ca mo ta lan byte.
    await expect(h.files.describeFor(file.id, ACCOUNTANT)).resolves.toMatchObject({ id: file.id });
    await expect(h.files.read(file.id, ACCOUNTANT)).resolves.toMatchObject({
      file: { id: file.id },
    });
  });

  /**
   * DUNG MOT LAN: phep bao dam chay tren MOI lan gui lai, va khong lan nao sinh lien ket thu hai.
   *
   * Bai nay do chieu nguoc voi bai tren: sua duoc ma khong dung-mot-lan thi moi lan bam lai cua
   * nguoi dung se dap them mot lien ket vao cung mot to.
   */
  it('gui lai nhieu lan tren mot chung tu dung: van dung MOT lien ket', async () => {
    const file = await uploadByDriver(h);

    const first = await record(h, file.id);
    await record(h, file.id);
    await record(h, file.id);

    expect(await h.documents.listForRun(RUN_ID)).toHaveLength(1);
    expect(await h.fileRepo.linksOf(file.id)).toHaveLength(1);
    expect((await h.fileRepo.activeLinksOf(file.id))[0]).toMatchObject({
      businessOwnerId: first.id,
    });
  });

  /**
   * `RELEASED` KHONG PHAI LO HONG — va day la bai giu cho ban sua nay khong di qua xa.
   *
   * Van hanh rut mot tam anh chup nham: tep ve `WITHDRAWN`, lien ket ve `WITHDRAWN`. Neu phep bao
   * dam chi nhin "co lien ket DANG HIEU LUC khong", no se doc trang thai nay thanh mot lo hong roi
   * hoac bao loi cho mot lenh gui lai binh thuong, hoac — te hon — GAN LAI dung cai ma van hanh vua
   * co y go bo.
   */
  it('tep bi rut sau khi gan xong: gui lai khong bao loi, va KHONG gan lai', async () => {
    const file = await uploadByDriver(h);
    const first = await record(h, file.id);
    expect(await h.fileRepo.activeLinksOf(file.id)).toHaveLength(1);

    await h.files.withdraw(file.id, ADMIN, 'chup nham');
    expect(await h.fileRepo.activeLinksOf(file.id)).toHaveLength(0);
    // Hang lien ket VAN o lai, o trang thai da rut — do la thu phan biet `RELEASED` voi `NONE`.
    expect(await h.fileRepo.linksOf(file.id)).toHaveLength(1);

    const again = await record(h, file.id);

    expect(again.id).toBe(first.id);
    expect(await h.documents.listForRun(RUN_ID)).toHaveLength(1);
    expect(await h.fileRepo.activeLinksOf(file.id)).toHaveLength(0);
    expect(await h.fileRepo.linksOf(file.id)).toHaveLength(1);
  });
});

describe('Tu choi VINH VIEN khong bao gio thanh cong — PF-062 (`#287` P6)', () => {
  /**
   * BAI DOI KHANG cua ban soat xet doc lap.
   *
   * *"prove a replay cannot return success while the required link is still absent unless the API
   * explicitly surfaces a pending/failure state."*
   *
   * Duong vong de nhat la "cu tra ve chung tu da ghi cho no qua" — mot lan gui lai bao 200 trong
   * khi bang chung so khong he dinh vao to nao. Bai nay dong dung duong do: ba lan gui lai, ba lan
   * mang mot ma CO KIEU, khong lan nao im lang thanh cong.
   *
   * Ban nay KHONG dang ky mien nao nhan tra loi quyen cho `TRANSPORT_OPERATIONAL_DOCUMENT`, tuc
   * `FILE_LINK_OWNER_UNKNOWN` — mot loi cau hinh that, va la mot tu choi khong lan gui lai nao va
   * duoc.
   */
  it('gui lai bao nhieu lan cung KHONG bao thanh cong khi lien ket con thieu', async () => {
    const h = harness({ registerAuthorizer: false });
    const file = await uploadByDriver(h);

    expect(await reasonOf(record(h, file.id))).toBe('DOCUMENT_FILE_BINDING_DENIED');
    expect(await reasonOf(record(h, file.id))).toBe('DOCUMENT_FILE_BINDING_DENIED');
    expect(await reasonOf(record(h, file.id))).toBe('DOCUMENT_FILE_BINDING_DENIED');

    // MOT to duy nhat — mot lan tu choi khong duoc sinh them chung tu.
    expect(await h.documents.listForRun(RUN_ID)).toHaveLength(1);
    // Va khong mot lien ket nao — fail closed, dung nhu `#287` P6 doi.
    expect(await h.fileRepo.linksOf(file.id)).toHaveLength(0);
    expect(await fileDenialOf(h.files.describeFor(file.id, ACCOUNTANT))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });
});
