import { beforeEach, describe, expect, it } from 'vitest';
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
import {
  NoFilePlatformAdapter,
  TransportDocumentFilePort,
  type DocumentFileLookup,
} from './document-file.port.js';
import { InMemoryOperationalDocumentRepository } from './document.repository.js';
import { OperationalDocumentService } from './document.service.js';
import { InMemoryPhysicalReceiptHandoverRepository } from './handover.repository.js';

/**
 * NGHIEM THU DOI KHANG cua chung tu van hanh — `#279` O12/O13 bai 6, 7, 8.
 */

const TZ = 'Asia/Ho_Chi_Minh';

class FakeIdentity extends TransportCheckpointCoreFacts {
  readonly drivers = new Map<string, CheckpointDriverFacts>();
  readonly assignments = new Map<string, string[]>();
  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return this.drivers.get(authUserId) ?? null;
  }
  async findRun(): Promise<CheckpointRunFacts | null> {
    return null;
  }
  async findLeg(): Promise<CheckpointLegFacts | null> {
    return null;
  }
  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    return (this.assignments.get(runId) ?? []).includes(driverId);
  }
}

class FakeCore extends TransportDocumentCoreFacts {
  readonly runs = new Map<string, DocumentRunFacts>();
  readonly legs = new Map<string, DocumentLegFacts>();
  readonly orders = new Set<string>();
  async findRun(runId: string): Promise<DocumentRunFacts | null> {
    return this.runs.get(runId) ?? null;
  }
  async findLeg(legId: string): Promise<DocumentLegFacts | null> {
    return this.legs.get(legId) ?? null;
  }
  async legIdsForOrder(orderId: string): Promise<readonly string[]> {
    return [...this.legs.values()].filter((leg) => leg.orderId === orderId).map((leg) => leg.id);
  }
  async orderExists(orderId: string): Promise<boolean> {
    return this.orders.has(orderId);
  }
}

class FakeSites extends TransportDocumentSiteFacts {
  readonly ids = new Set<string>();
  async exists(id: string): Promise<boolean> {
    return this.ids.has(id);
  }
}

/** Cong tep GIA — de do ba nhanh cua `DocumentFileLookup` ma khong can Nen tang Tep that. */
class FakeFilePort extends TransportDocumentFilePort {
  readonly answers = new Map<string, DocumentFileLookup>();
  async describe(fileId: string): Promise<DocumentFileLookup> {
    return this.answers.get(fileId) ?? { kind: 'DENIED', reason: 'FILE_NOT_AVAILABLE_TO_CALLER' };
  }
}

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('OperationalDocumentService — DC-020', () => {
  let documents: InMemoryOperationalDocumentRepository;
  let handovers: InMemoryPhysicalReceiptHandoverRepository;
  let checkpoints: InMemoryCheckpointRepository;
  let identity: FakeIdentity;
  let core: FakeCore;
  let sites: FakeSites;
  let files: FakeFilePort;
  let service: OperationalDocumentService;
  let now: Date;

  const build = (filePort: TransportDocumentFilePort = files): OperationalDocumentService =>
    new OperationalDocumentService(
      documents,
      handovers,
      checkpoints,
      core,
      identity,
      sites,
      filePort,
      { timeZone: TZ },
      undefined,
      () => now,
    );

  beforeEach(() => {
    documents = new InMemoryOperationalDocumentRepository();
    handovers = new InMemoryPhysicalReceiptHandoverRepository();
    checkpoints = new InMemoryCheckpointRepository();
    identity = new FakeIdentity();
    core = new FakeCore();
    sites = new FakeSites();
    files = new FakeFilePort();
    now = new Date('2026-09-09T03:00:00.000Z');

    identity.drivers.set('u.binh', { id: 'drv_a', fullName: 'Nguyen Van Binh' });
    identity.drivers.set('u.cuong', { id: 'drv_b', fullName: 'Tran Van Cuong' });
    identity.assignments.set('run_1', ['drv_a']);
    core.runs.set('run_1', { id: 'run_1', code: 'VC-001', status: 'ACTIVE' });
    core.legs.set('leg_1', { id: 'leg_1', runId: 'run_1', orderId: 'ord_1' });
    core.legs.set('leg_2', { id: 'leg_2', runId: 'run_1', orderId: 'ord_2' });
    core.orders.add('ord_1');
    core.orders.add('ord_2');
    service = build();
  });

  const record = (over: Record<string, unknown> = {}) =>
    service.recordAsDriver({
      type: 'DELIVERY_RECEIPT',
      runId: 'run_1',
      legId: 'leg_1',
      basis: 'EXTERNAL_PHYSICAL',
      externalNote: 'Bien nhan giay co chu ky',
      clientEventId: 'd.1',
      authUserId: 'u.binh',
      ...over,
    } as Parameters<typeof service.recordAsDriver>[0]);

  /**
   * BAI TRUNG TAM — `#279` O13 bai 8.
   *
   * Ma don KHONG den tu than yeu cau: no duoc GIAI tu chinh chang lai xe dang chay. Do la ly do
   * mot to bien nhan cua don A khong the mang ma cua don B.
   */
  it('ma don duoc GIAI tu chang, khong nhan tu than yeu cau', async () => {
    const document = await record();
    expect(document.orderId).toBe('ord_1');
    expect(document.driverId).toBe('drv_a');
    expect(document.recordedBy).toBe('u.binh');
    expect(document.status).toBe('ACTIVE');
    expect(document.businessDate).toBe('2026-09-09');
  });

  it('chung tu tren chang khac mang ma don khac — khong the tro cheo', async () => {
    const first = await record();
    const second = await record({ legId: 'leg_2', clientEventId: 'd.2' });
    expect(first.orderId).toBe('ord_1');
    expect(second.orderId).toBe('ord_2');
  });

  it('gui lai mot lenh khong ghi to thu hai', async () => {
    const first = await record();
    const again = await record();
    expect(again.id).toBe(first.id);
    expect(await documents.listForRun('run_1')).toHaveLength(1);
  });

  it('lai xe khong cam vong chay do thi khong ghi duoc', async () => {
    expect(await reasonOf(record({ authUserId: 'u.cuong' }))).toBe(
      'DOCUMENT_DRIVER_NOT_ASSIGNED',
    );
  });

  /** `#279` O12 — lai xe A khong neo chung tu vao moc cua lai xe B. */
  it('khong neo duoc vao moc cua lai xe khac', async () => {
    identity.assignments.set('run_1', ['drv_a', 'drv_b']);
    const foreign = await checkpoints.create({
      type: 'DELIVERY_ARRIVAL',
      runId: 'run_1',
      legId: 'leg_1',
      recordedBy: 'u.cuong',
      driverId: 'drv_b',
      observationId: null,
      clientEventId: 'cp.b',
      capturedAt: null,
      receivedAt: now,
      businessDate: '2026-09-09',
      note: null,
    });
    expect(await reasonOf(record({ checkpointId: foreign.id }))).toBe(
      'DOCUMENT_CHECKPOINT_NOT_OWNED',
    );
  });

  it('khong neo duoc vao moc cua vong chay khac', async () => {
    expect(await reasonOf(record({ checkpointId: 'khong-co-that' }))).toBe(
      'DOCUMENT_CHECKPOINT_NOT_APPLICABLE',
    );
  });

  /**
   * `#279` O12: *"foreign/unknown File IDs fail closed"*.
   *
   * Ma tep khong duoc TIN — no duoc HOI. Ba ket qua cua cong tep dan den ba ma khac nhau, va bai
   * nay do ca ba.
   */
  it('ma tep la va khong bien thanh mot chung tu hop le', async () => {
    expect(
      await reasonOf(record({ basis: 'DIGITAL_FILE', fileId: 'file-la', externalNote: undefined })),
    ).toBe('DOCUMENT_FILE_NOT_AVAILABLE');
  });

  it('tep da bi rut hoac cach ly khong thoa man mot chung tu nao', async () => {
    files.answers.set('file-rut', { kind: 'DENIED', reason: 'FILE_NOT_ACTIVE' });
    expect(
      await reasonOf(record({ basis: 'DIGITAL_FILE', fileId: 'file-rut', externalNote: undefined })),
    ).toBe('DOCUMENT_FILE_NOT_ACTIVE');
  });

  /**
   * Khi Nen tang Tep (`#287`) chua vao `main`, MOI ma tep tra ve `UNAVAILABLE` — va do la mot ma
   * RIENG. O nhanh do nguoi dung khong sai gi ca; ho chi phai di duong chung tu giay.
   */
  it('chua co nen tang tep thi duong ban so dong lai, duong giay van di duoc', async () => {
    const withoutPlatform = build(new NoFilePlatformAdapter());
    expect(
      await reasonOf(
        withoutPlatform.recordAsDriver({
          type: 'DELIVERY_RECEIPT',
          runId: 'run_1',
          legId: 'leg_1',
          basis: 'DIGITAL_FILE',
          fileId: 'file-1',
          clientEventId: 'd.file',
          authUserId: 'u.binh',
        }),
      ),
    ).toBe('DOCUMENT_FILE_PLATFORM_UNAVAILABLE');

    const paper = await withoutPlatform.recordAsDriver({
      type: 'DELIVERY_RECEIPT',
      runId: 'run_1',
      legId: 'leg_1',
      basis: 'EXTERNAL_PHYSICAL',
      externalNote: 'Bien nhan giay co chu ky',
      clientEventId: 'd.paper',
      authUserId: 'u.binh',
    });
    expect(paper.basis).toBe('EXTERNAL_PHYSICAL');
    expect(paper.fileId).toBeNull();
  });

  it('mot ma tep phuc vu nhieu nhat MOT chung tu dang hieu luc', async () => {
    files.answers.set('file-1', {
      kind: 'AVAILABLE',
      file: { fileId: 'file-1', state: 'ACTIVE', contentType: 'image/jpeg', byteSize: 1000 },
    });
    await record({
      basis: 'DIGITAL_FILE',
      fileId: 'file-1',
      externalNote: undefined,
      clientEventId: 'd.f1',
    });
    expect(
      await reasonOf(
        record({
          type: 'WEIGH_TICKET',
          basis: 'DIGITAL_FILE',
          fileId: 'file-1',
          externalNote: undefined,
          clientEventId: 'd.f2',
        }),
      ),
    ).toBe('DOCUMENT_FILE_NOT_AVAILABLE');
  });

  /**
   * `#279` O13 bai 7 — BIEN BAT BIEN.
   *
   * Tu luc to giay roi khoi tay lai xe va van phong ghi la da nhan, ban ghi so cua no khong con la
   * mot ban nhap. Bai nay do dung chuoi do: ghi chung tu, ban giao hai buoc, roi thu bia mo.
   */
  it('khong bia mo duoc mot to da ban giao ve van phong', async () => {
    const document = await record();
    await handovers.create({
      orderId: 'ord_1',
      sequence: 1,
      state: 'WITH_DRIVER',
      legId: null,
      documentId: document.id,
      externalNote: null,
      driverId: 'drv_a',
      recordedBy: 'u.binh',
      recordedAt: now,
      clientEventId: 'h.1',
      note: null,
      businessDate: '2026-09-09',
    });
    // CON trong tay lai xe: van bia mo duoc, vi chua ai o van phong doi chieu no.
    expect(await service.withdraw({ documentId: document.id, reason: 'chup nham', authUserId: 'u.admin' })).toBeTruthy();

    const second = await record({ clientEventId: 'd.2' });
    await handovers.create({
      orderId: 'ord_1',
      sequence: 2,
      state: 'RETURNED_TO_OFFICE',
      legId: null,
      documentId: second.id,
      externalNote: null,
      driverId: null,
      recordedBy: 'u.vanphong',
      recordedAt: now,
      clientEventId: 'h.2',
      note: null,
      businessDate: '2026-09-09',
    });
    expect(
      await reasonOf(
        service.withdraw({ documentId: second.id, reason: 'thu go', authUserId: 'u.admin' }),
      ),
    ).toBe('DOCUMENT_HANDOVER_LOCKED');
  });

  it('bia mo giu lai hang, khong xoa no', async () => {
    const document = await record();
    const withdrawn = await service.withdraw({
      documentId: document.id,
      reason: 'chup nham',
      authUserId: 'u.admin',
    });
    expect(withdrawn.status).toBe('WITHDRAWN');
    expect(withdrawn.withdrawnBy).toBe('u.admin');
    expect(await documents.find(document.id)).not.toBeNull();
    expect(
      await reasonOf(
        service.withdraw({ documentId: document.id, reason: 'lan hai', authUserId: 'u.admin' }),
      ),
    ).toBe('DOCUMENT_ALREADY_WITHDRAWN');
  });

  /**
   * Duong VAN HANH khong dinh kem ho so lai xe — nguoi ngoi o van phong khong o hien truong.
   * Cung ly le voi `CheckpointService.recordAsOperator`.
   */
  it('duong van hanh ghi bu duoc, va khong mang ten mot lai xe nao', async () => {
    const document = await service.recordAsOperator({
      type: 'GATE_PASS',
      runId: 'run_1',
      legId: 'leg_1',
      basis: 'EXTERNAL_PHYSICAL',
      externalNote: 'Lai xe dua giay tai van phong',
      clientEventId: 'op.1',
      authUserId: 'u.admin',
    });
    expect(document.driverId).toBeNull();
    expect(document.checkpointId).toBeNull();
    expect(document.recordedBy).toBe('u.admin');
  });
});
