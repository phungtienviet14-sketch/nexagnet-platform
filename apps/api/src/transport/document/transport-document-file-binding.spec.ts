import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryUserRepository, UserRepository } from '../../auth/user.repository.js';
import type { AuthUserRecord } from '../../auth/user.repository.js';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryFileDomainAuthorizerRegistry } from '../../files/file-authorization.port.js';
import { FileAuthorizationService } from '../../files/file-authorization.service.js';
import {
  FakeFileBlobStore,
  FakeFileScanner,
  jpegBytes,
  newAuditService,
} from '../../files/file-test-doubles.js';
import { FileDomainError } from '../../files/file.errors.js';
import { InMemoryFileRepository } from '../../files/file.repository.js';
import { FileService } from '../../files/file.service.js';
import type { FileRecord } from '../../files/file.types.js';
import { TransportCheckpointCoreFacts } from '../checkpoint/checkpoint-facts.port.js';
import type {
  CheckpointDriverFacts,
  CheckpointLegFacts,
  CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryOperationalDocumentRepository } from './document.repository.js';
import { FilePlatformDocumentAdapter } from './file-platform.adapter.js';
import { InMemoryPhysicalReceiptHandoverRepository } from './handover.repository.js';
import {
  OperationalDocumentFileAuthorizer,
  TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
} from './operational-document-file.authorizer.js';

/**
 * BINH DIEN NOI cua Lane P va Lane O — `#287` P6/P11, muc 10 cua nghiem thu cuoi.
 *
 * ============================================================================================
 * CAI BO NAY CHUNG MINH
 * ============================================================================================
 *
 * `#287` P6 liet ke nam tinh huong quyen, va bon trong so do chi kiem duoc khi CA HAI ben cung o
 * trong mot bai:
 *
 *   · lai xe A khong doc/rut duoc bang chung cua lai xe B bang cach doan ma tep;
 *   · ke toan DOC duoc bang chung khi van tai cho phep, nhung KHONG sua duoc nguon bang chung do;
 *   · mot ma tep la khong bien thanh mot chung tu hop le;
 *   · bang chung da ban giao ve van phong thi khong AI rut duoc.
 *
 * Bo nay chay hoan toan trong bo nho: cai duoc do la LUAT, khong phai rang buoc cua Postgres.
 */

const NOW = new Date('2026-09-18T02:00:00.000Z');
const RUN_ID = 'run-1';

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

/** Danh tinh lai xe GIA — chi hai cau hoi ma cong quyen that su hoi toi. */
class FakeIdentity extends TransportCheckpointCoreFacts {
  readonly driversByAuthUser = new Map<string, CheckpointDriverFacts>();

  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return this.driversByAuthUser.get(authUserId) ?? null;
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

interface Harness {
  readonly files: InMemoryFileRepository;
  readonly documents: InMemoryOperationalDocumentRepository;
  readonly handovers: InMemoryPhysicalReceiptHandoverRepository;
  readonly identity: FakeIdentity;
  readonly users: UserRepository;
  readonly service: FileService;
  readonly adapter: FilePlatformDocumentAdapter;
}

const DRIVER_A_USER = 'user-driver-a';
const DRIVER_B_USER = 'user-driver-b';
const ACCOUNTANT = 'user-accounting';
const ADMIN = 'user-admin';

function harness(): Harness {
  const files = new InMemoryFileRepository();
  const documents = new InMemoryOperationalDocumentRepository();
  const handovers = new InMemoryPhysicalReceiptHandoverRepository();
  const identity = new FakeIdentity();
  identity.driversByAuthUser.set(DRIVER_A_USER, { id: 'driver-a', fullName: 'Lai xe A' });
  identity.driversByAuthUser.set(DRIVER_B_USER, { id: 'driver-b', fullName: 'Lai xe B' });

  const users = new InMemoryUserRepository([
    userRecord(DRIVER_A_USER, 'SALE'),
    userRecord(DRIVER_B_USER, 'SALE'),
    userRecord(ACCOUNTANT, 'ACCOUNTING'),
    userRecord(ADMIN, 'ADMIN'),
  ]);

  const registry = new InMemoryFileDomainAuthorizerRegistry();
  registry.register(new OperationalDocumentFileAuthorizer(documents, handovers, identity, users));

  const service = new FileService(
    files,
    new FakeFileBlobStore(),
    new FakeFileScanner(),
    new FileAuthorizationService(files, registry),
    registry,
    newAuditService(),
    undefined,
    () => NOW,
  );
  return {
    files,
    documents,
    handovers,
    identity,
    users,
    service,
    adapter: new FilePlatformDocumentAdapter(service),
  };
}

const uploadBy = (h: Harness, createdBy: string): Promise<FileRecord> =>
  h.service.upload({
    bytes: jpegBytes(createdBy),
    purpose: 'OPERATIONAL_DOCUMENT',
    originalFilename: 'bien-nhan.jpg',
    declaredMimeType: 'image/jpeg',
    createdBy,
  });

/** Ghi mot chung tu roi GAN tep — dung thu tu ma `OperationalDocumentService.append` chay. */
async function recordDocument(
  h: Harness,
  input: { fileId: string; recordedBy: string; driverId: string | null; clientEventId: string },
): Promise<string> {
  const document = await h.documents.create({
    type: 'DELIVERY_RECEIPT',
    runId: RUN_ID,
    legId: null,
    orderId: null,
    checkpointId: null,
    counterpartySiteId: null,
    driverId: input.driverId,
    recordedBy: input.recordedBy,
    basis: 'DIGITAL_FILE',
    fileId: input.fileId,
    externalNote: null,
    label: null,
    captureMode: 'UNKNOWN',
    clientEventId: input.clientEventId,
    receivedAt: NOW,
    businessDate: '2026-09-18',
  });
  await h.adapter.bind(input.fileId, document.id, input.recordedBy);
  return document.id;
}

const denialOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof FileDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('Cong tep noi voi nen tang that — PF-060 (`#287` P11)', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  /**
   * MUC 10 CUA NGHIEM THU CUOI: Lane O co mot binh dien duoc chap nhan.
   *
   * KHONG BAO GIO `UNAVAILABLE`: nen tang CO mat o ban nay, nen mot cau tra loi "chua co nen tang
   * tep" tu day se la mot loi noi doi day nguoi dung sang duong chung tu giay.
   */
  it('tra AVAILABLE cho tep cua chinh nguoi goi, va khong mot dinh vi nao', async () => {
    const file = await uploadBy(h, DRIVER_A_USER);

    const lookup = await h.adapter.describe(file.id, DRIVER_A_USER);

    expect(lookup).toEqual({
      kind: 'AVAILABLE',
      file: {
        fileId: file.id,
        state: 'ACTIVE',
        contentType: 'image/jpeg',
        byteSize: file.byteSize,
      },
    });
    expect(JSON.stringify(lookup)).not.toContain('media/platform-file');
  });

  /** `#279` O12 + `#287` P6: mot ma nguoi dung go bua khong thanh mot chung tu hop le. */
  it('ma la: DENIED, va khong de dem duoc', async () => {
    const file = await uploadBy(h, DRIVER_A_USER);

    const foreign = await h.adapter.describe(file.id, DRIVER_B_USER);
    const nonsense = await h.adapter.describe('khong-co-ma-nay', DRIVER_B_USER);

    expect(foreign).toEqual({ kind: 'DENIED', reason: 'FILE_NOT_AVAILABLE_TO_CALLER' });
    expect(nonsense).toEqual(foreign);
  });

  it('tep da rut: mot ma RIENG, khong gop vao ma tu choi chung', async () => {
    const file = await uploadBy(h, DRIVER_A_USER);
    const documentId = await recordDocument(h, {
      fileId: file.id,
      recordedBy: DRIVER_A_USER,
      driverId: 'driver-a',
      clientEventId: 'evt-1',
    });
    await h.service.withdraw(file.id, ADMIN, 'tai nham');

    const lookup = await h.adapter.describe(file.id, ADMIN);
    expect(lookup).toEqual({ kind: 'DENIED', reason: 'FILE_NOT_ACTIVE' });
    expect(documentId).toBeTruthy();
  });

  /**
   * MOT LAN GAN KHONG DUOC LAM HONG MOT LAN GHI CHUNG TU: to giay VAN da duoc chup, va hang chung
   * tu VAN dung. Duong hong lam tep tro ve pham vi cua rieng nguoi tai len — chat hon, khong long
   * hon.
   */
  it('gan that bai khong nem, nhung NOI RA, va tep KHONG mo ra cho nguoi khac', async () => {
    const file = await uploadBy(h, DRIVER_A_USER);

    // KHONG `undefined`. Mot `void` o day chinh la lo hong: ben goi khong con cach nao biet rang
    // lien ket chua co, nen no bao "da ghi xong" cho mot chung tu ma bang chung khong he dinh vao.
    await expect(h.adapter.bind(file.id, 'chung-tu-khong-ton-tai', DRIVER_A_USER)).resolves.toEqual(
      { kind: 'DENIED', reason: 'FILE_BINDING_REFUSED_BY_DOMAIN' },
    );

    expect(await h.files.activeLinksOf(file.id)).toHaveLength(0);
    expect(await denialOf(h.service.describeFor(file.id, ACCOUNTANT))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });

  it('gan xong thi co MOT lien ket mang dung ten mien va ma chung tu', async () => {
    const file = await uploadBy(h, DRIVER_A_USER);
    const documentId = await recordDocument(h, {
      fileId: file.id,
      recordedBy: DRIVER_A_USER,
      driverId: 'driver-a',
      clientEventId: 'evt-1',
    });

    const links = await h.files.activeLinksOf(file.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      businessOwnerType: TRANSPORT_OPERATIONAL_DOCUMENT_OWNER,
      businessOwnerId: documentId,
      purpose: 'OPERATIONAL_DOCUMENT',
    });
  });

  /**
   * `#287` P11: *"DELIVERY_RECEIPT / GATE_PASS / LOADING_SLIP / WEIGH_TICKET business taxonomy
   * remains Lane O"*. Lien ket mang MOT `purpose` cho moi loai chung tu — nen tang khong hoc duoc
   * taxonomy cua van tai qua duong nay.
   */
  it('taxonomy chung tu KHONG ro sang nen tang tep', async () => {
    const file = await uploadBy(h, DRIVER_A_USER);
    await recordDocument(h, {
      fileId: file.id,
      recordedBy: DRIVER_A_USER,
      driverId: 'driver-a',
      clientEventId: 'evt-1',
    });

    const links = await h.files.linksOf(file.id);
    expect(JSON.stringify(links)).not.toContain('DELIVERY_RECEIPT');
  });
});

describe('Quyen tren bang chung van tai — PF-061 (`#287` P6)', () => {
  let h: Harness;
  let file: FileRecord;
  let documentId: string;

  beforeEach(async () => {
    h = harness();
    file = await uploadBy(h, DRIVER_A_USER);
    documentId = await recordDocument(h, {
      fileId: file.id,
      recordedBy: DRIVER_A_USER,
      driverId: 'driver-a',
      clientEventId: 'evt-1',
    });
  });

  it('lai xe doc duoc bang chung CUA CHINH MINH', async () => {
    await expect(h.service.describeFor(file.id, DRIVER_A_USER)).resolves.toMatchObject({
      id: file.id,
    });
  });

  /**
   * *"Driver A cannot read/withdraw Driver B-owned editable evidence by guessing File ID."*
   *
   * Do CA HAI chieu: doc va rut. Chi do mot chieu se bo lot dung chieu nguy hiem hon.
   */
  it('lai xe B khong doc va khong rut duoc bang chung cua lai xe A', async () => {
    expect(await denialOf(h.service.describeFor(file.id, DRIVER_B_USER))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
    expect(await denialOf(h.service.read(file.id, DRIVER_B_USER))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
    expect(await denialOf(h.service.withdraw(file.id, DRIVER_B_USER, 'thu rut'))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
    expect((await h.files.findById(file.id))?.state).toBe('ACTIVE');
  });

  /**
   * *"Accounting may read evidence when Transport grants that business action but does not gain
   * permission to mutate immutable source proof."*
   *
   * HAI khang dinh trong MOT bai, va do la co y: tach chung se cho phep mot ban hong nua vo (doc
   * duoc + rut duoc) di qua mot trong hai bai.
   */
  it('ke toan DOC duoc, nhung KHONG rut duoc', async () => {
    await expect(h.service.describeFor(file.id, ACCOUNTANT)).resolves.toMatchObject({
      id: file.id,
    });

    expect(await denialOf(h.service.withdraw(file.id, ACCOUNTANT, 'thu rut'))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
    expect((await h.files.findById(file.id))?.state).toBe('ACTIVE');
  });

  /** Van hanh (`ADMIN`) co ca hai — do la bang ma Lane O da chot, khong mot bang moi. */
  it('van hanh doc duoc va rut duoc', async () => {
    await expect(h.service.describeFor(file.id, ADMIN)).resolves.toMatchObject({ id: file.id });
    await expect(h.service.withdraw(file.id, ADMIN, 'tai nham')).resolves.toMatchObject({
      state: 'WITHDRAWN',
    });
  });

  /**
   * MUC 5 CUA NGHIEM THU CUOI + `#287` P3 bat bien 6.
   *
   * To giay DA VE VAN PHONG thi khong AI rut duoc — ke ca `ADMIN`. Va ma tra ra phai la `LOCKED`
   * chu khong `DENIED`: tra `DENIED` se lam ho di tim mot quyen cao hon, mot quyen khong ton tai.
   */
  it('bang chung da ban giao ve van phong: khong AI rut duoc nua', async () => {
    await h.handovers.create({
      orderId: 'order-1',
      sequence: 1,
      state: 'RETURNED_TO_OFFICE',
      legId: null,
      documentId,
      externalNote: null,
      driverId: 'driver-a',
      recordedBy: ACCOUNTANT,
      recordedAt: NOW,
      clientEventId: 'ho-1',
      note: null,
      businessDate: '2026-09-18',
    });

    expect(await denialOf(h.service.withdraw(file.id, ADMIN, 'thu rut'))).toBe(
      'FILE_WITHDRAWAL_LOCKED_BY_DOMAIN',
    );
    expect((await h.files.findById(file.id))?.state).toBe('ACTIVE');
  });

  /**
   * MOT TAI KHOAN DA VO HIEU HOA KHONG CON VAI NAO.
   *
   * Vai doc tu CSDL theo ma nguoi dung ma PHIEN dua ra — `#287` P6 *"caller cannot forge
   * creator/withdrawer/time/tenant scope"*.
   */
  it('tai khoan da vo hieu hoa mat quyen doc', async () => {
    const disabled = await h.users.findByUsername(ACCOUNTANT);
    await h.users.disable(disabled!.id);

    expect(await denialOf(h.service.describeFor(file.id, ACCOUNTANT))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });

  /**
   * MOT MA TEP KHONG PHAI MOT QUYEN — ngay ca voi nguoi da tai no len.
   *
   * Sau khi to giay vao ho so, lai xe A khong con "so huu" tep: ho doc duoc vi ho la lai xe cua
   * chung tu, khong vi ho la nguoi tai len. Bai nay do dung dieu do bang cach chuyen chung tu sang
   * mot lai xe khac.
   */
  it('nguoi tai len khong giu duoc mot cua sau khi chung tu thuoc ve nguoi khac', async () => {
    const other = harness();
    const theirFile = await uploadBy(other, DRIVER_A_USER);
    await recordDocument(other, {
      fileId: theirFile.id,
      recordedBy: DRIVER_B_USER,
      driverId: 'driver-b',
      clientEventId: 'evt-2',
    });

    // Lan gan do `DRIVER_B_USER` thuc hien tren mot tep cua `DRIVER_A_USER` -> bi tu choi, nen
    // khong lien ket nao duoc tao, va tep o lai pham vi nguoi tai len.
    expect(await other.files.activeLinksOf(theirFile.id)).toHaveLength(0);
    expect(await denialOf(other.service.describeFor(theirFile.id, DRIVER_B_USER))).toBe(
      'FILE_NOT_AVAILABLE_TO_CALLER',
    );
  });
});
