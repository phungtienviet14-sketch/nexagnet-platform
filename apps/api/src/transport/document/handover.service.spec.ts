import { beforeEach, describe, expect, it } from 'vitest';
import {
  TransportCheckpointCoreFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TransportDocumentCoreFacts,
  type DocumentLegFacts,
  type DocumentRunFacts,
} from './document-facts.port.js';
import { InMemoryOperationalDocumentRepository } from './document.repository.js';
import { InMemoryPhysicalReceiptHandoverRepository } from './handover.repository.js';
import { PhysicalReceiptHandoverService } from './handover.service.js';

/**
 * NGHIEM THU DOI KHANG cua ban giao bien nhan — `#279` O7/O13 bai 9.
 *
 * Bat bien trung tam cua ca tranche nam o day:
 *
 *     bien nhan da ve  !=  don da ket thuc ve thuong mai
 *
 * Cai do la mot dieu KHONG XAY RA, nen no duoc do o hai cho: bai cuoi cua tep nay (mien nay khong
 * cam mot cong ghi nao cua `transport-core`), va `no-order-completion.spec.ts` (quet ma nguon).
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

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe('PhysicalReceiptHandoverService — DC-030', () => {
  let handovers: InMemoryPhysicalReceiptHandoverRepository;
  let documents: InMemoryOperationalDocumentRepository;
  let identity: FakeIdentity;
  let core: FakeCore;
  let service: PhysicalReceiptHandoverService;
  let now: Date;

  beforeEach(() => {
    handovers = new InMemoryPhysicalReceiptHandoverRepository();
    documents = new InMemoryOperationalDocumentRepository();
    identity = new FakeIdentity();
    core = new FakeCore();
    now = new Date('2026-09-09T08:00:00.000Z');

    identity.drivers.set('u.binh', { id: 'drv_a', fullName: 'Nguyen Van Binh' });
    identity.drivers.set('u.cuong', { id: 'drv_b', fullName: 'Tran Van Cuong' });
    identity.assignments.set('run_1', ['drv_a']);
    core.runs.set('run_1', { id: 'run_1', code: 'VC-001', status: 'ACTIVE' });
    core.legs.set('leg_1', { id: 'leg_1', runId: 'run_1', orderId: 'ord_1' });
    core.orders.add('ord_1');

    service = new PhysicalReceiptHandoverService(
      handovers,
      documents,
      core,
      identity,
      { timeZone: TZ },
      undefined,
      () => now,
    );
  });

  const withDriver = (over: Record<string, unknown> = {}) =>
    service.recordAsDriver({
      orderId: 'ord_1',
      externalNote: 'Bien nhan giay co chu ky nguoi nhan',
      clientEventId: 'h.1',
      authUserId: 'u.binh',
      ...over,
    } as Parameters<typeof service.recordAsDriver>[0]);

  const office = (state: 'RETURNED_TO_OFFICE' | 'SUBMITTED_FOR_CONFIRMATION', event: string) =>
    service.recordAsOffice({
      orderId: 'ord_1',
      state,
      externalNote: 'Da nhan tren ban',
      clientEventId: event,
      authUserId: 'u.vanphong',
    });

  it('lai xe ghi duoc `dang giu`, va gio/nguoi den tu may chu va tu phien', async () => {
    const step = await withDriver();
    expect(step.state).toBe('WITH_DRIVER');
    expect(step.sequence).toBe(1);
    expect(step.driverId).toBe('drv_a');
    expect(step.recordedBy).toBe('u.binh');
    expect(step.recordedAt).toEqual(now);
  });

  it('lai xe khong ghi duoc cho mot don ho chua tung chay', async () => {
    expect(await reasonOf(withDriver({ authUserId: 'u.cuong' }))).toBe(
      'RECEIPT_HANDOVER_DRIVER_NOT_ASSIGNED',
    );
  });

  it('duong giay di duoc ma khong can mot ban so nao', async () => {
    const step = await withDriver();
    expect(step.documentId).toBeNull();
    expect(step.externalNote).toBe('Bien nhan giay co chu ky nguoi nhan');
  });

  it('nhung mot buoc trong ca hai can cu thi bi tu choi', async () => {
    expect(await reasonOf(withDriver({ externalNote: undefined }))).toBe(
      'RECEIPT_HANDOVER_BASIS_REQUIRED',
    );
  });

  it('khong vien dan duoc chung tu cua don khac', async () => {
    core.legs.set('leg_9', { id: 'leg_9', runId: 'run_1', orderId: 'ord_9' });
    core.orders.add('ord_9');
    const foreign = await documents.create({
      type: 'DELIVERY_RECEIPT',
      runId: 'run_1',
      legId: 'leg_9',
      orderId: 'ord_9',
      checkpointId: null,
      counterpartySiteId: null,
      driverId: 'drv_a',
      recordedBy: 'u.binh',
      basis: 'EXTERNAL_PHYSICAL',
      fileId: null,
      externalNote: 'cua don khac',
      label: null,
      captureMode: 'UNKNOWN',
      clientEventId: 'd.9',
      receivedAt: now,
      businessDate: '2026-09-09',
    });
    expect(await reasonOf(withDriver({ documentId: foreign.id, externalNote: undefined }))).toBe(
      'RECEIPT_HANDOVER_DOCUMENT_NOT_FOR_ORDER',
    );
  });

  /** Mot chuoi ban giao nhay coc la mot chuoi khong doi chieu duoc voi thuc te. */
  it('van phong khong gui di duoc mot to giay chinh ho chua ghi la da nhan', async () => {
    await withDriver();
    expect(await reasonOf(office('SUBMITTED_FOR_CONFIRMATION', 'h.x'))).toBe(
      'RECEIPT_HANDOVER_OUT_OF_ORDER',
    );
    expect(await reasonOf(office('RETURNED_TO_OFFICE', 'h.y'))).toBe('NO_ERROR_THROWN');
    expect(await reasonOf(office('SUBMITTED_FOR_CONFIRMATION', 'h.z'))).toBe('NO_ERROR_THROWN');
  });

  it('mot buoc chi ghi duoc mot lan, va gui lai tra ve chinh buoc do', async () => {
    const first = await withDriver();
    const again = await withDriver();
    expect(again.id).toBe(first.id);

    expect(await reasonOf(withDriver({ clientEventId: 'h.khac' }))).toBe(
      'RECEIPT_HANDOVER_ALREADY_RECORDED',
    );
    expect(await handovers.listForOrder('ord_1')).toHaveLength(1);
  });

  it('trang thai hien tai la mot PHEP CHIEU tu chuoi buoc, khong mot cot', async () => {
    expect((await service.statusOf('ord_1')).state).toBeNull();
    await withDriver();
    expect((await service.statusOf('ord_1')).state).toBe('WITH_DRIVER');
    await office('RETURNED_TO_OFFICE', 'h.2');
    const status = await service.statusOf('ord_1');
    expect(status.state).toBe('RETURNED_TO_OFFICE');
    expect(status.latestBy).toBe('u.vanphong');
    expect(status.history).toHaveLength(2);
  });

  /**
   * BAI QUAN TRONG NHAT CUA TEP — `#279` O13 bai 9.
   *
   *     `PHYSICAL_RECEIPT_RETURNED` does not set Order final completion automatically
   *
   * Do la mot dieu KHONG XAY RA, nen cach do la CAU TRUC: `PhysicalReceiptHandoverService` duoc
   * dung bang bon phu thuoc, va khong cai nao co mot ham ghi vao don. `TransportDocumentCoreFacts`
   * chi co bon ham, ca bon deu DOC — neu mot ngay ai do them mot ham ghi vao cong do, bai nay do.
   */
  it('ghi `da ve van phong` khong dung vao trang thai cua don', async () => {
    await withDriver();
    await office('RETURNED_TO_OFFICE', 'h.2');
    await office('SUBMITTED_FOR_CONFIRMATION', 'h.3');

    // Cong nhin sang `transport-core` CHI CO bon ham doc. Khong co `completeOrder`,
    // `transitionOrder`, `approve` — khong co mot cai but nao de viet nham.
    const surface = Object.getOwnPropertyNames(TransportDocumentCoreFacts.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(surface.sort()).toEqual([]);
    const adapterSurface = Object.getOwnPropertyNames(FakeCore.prototype)
      .filter((name) => name !== 'constructor')
      .sort();
    expect(adapterSurface).toEqual([
      'findLeg',
      'findRun',
      'legIdsForOrder',
      'orderExists',
    ]);
    for (const forbidden of ['complete', 'transition', 'approve', 'settle', 'accept']) {
      expect(adapterSurface.join('|').toLowerCase()).not.toContain(forbidden);
    }
  });
});
