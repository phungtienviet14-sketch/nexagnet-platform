import { beforeEach, describe, expect, it } from 'vitest';
import {
  TransportCheckpointCoreFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointRunFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { InMemoryCheckpointRepository } from '../checkpoint/checkpoint.repository.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { InMemoryOperationalDocumentRepository } from '../document/document.repository.js';
import { InMemoryPhysicalReceiptHandoverRepository } from '../document/handover.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import { InMemoryWaitingSessionRepository } from '../waiting/waiting.repository.js';
import { TransportFieldCoreFactsAdapter, type FieldRunFacts } from './field-facts.port.js';
import { DriverFieldReadService } from './field-read.service.js';
import type { DriverFieldWork } from './field.types.js';

/**
 * UAT BUG-03 (`#333`) — VONG CHAY DA KET THUC KHONG CON MOT NUT NAO TREN MAN HINH HIEN TRUONG.
 *
 * ============================================================================================
 * HINH DANG CHU XE GAP
 * ============================================================================================
 *
 * Chang co hang da `Khach da nhan hang`, chua chup bien nhan — nen may chu chao dung mot nut
 * `Chup bien nhan giao hang`. Roi luot quet (`RunClosureSweepScheduler`, bat dong bo) dong vong
 * chay. Man hinh cu van hien o chon tep + nut do; bam vao thi `DOCUMENT_RUN_TERMINAL`.
 *
 * Bai nay do phia MAY CHU cua chuyen do, o HAI lop doc lap:
 *
 *   1. kho that (`listOpenRunsForDriver`) khong con liet ke vong chay da ket thuc — nen mot lan doc
 *      MOI khong co the cua no;
 *   2. neu mot ngay nao do mot adapter lo ra vong chay do, `fieldActionsFor({ runTerminal })` van
 *      tra RONG — khong mot DOCUMENT/CHECKPOINT/WAITING_START/RECEIPT_HANDOVER nao.
 *
 * Phan con lai cua loi (man hinh KHONG doc lai) la viec cua `FieldScreen`, va duoc do o
 * `apps/web/e2e/transport/field-terminal-run.spec.ts`.
 */

const DRIVER_AUTH = 'u.binh';
const AT = new Date('2026-09-21T03:00:00.000Z');

class FakeIdentity extends TransportCheckpointCoreFacts {
  constructor(private readonly driverId: string) {
    super();
  }
  async findDriverByAuthUserId(authUserId: string): Promise<CheckpointDriverFacts | null> {
    return authUserId === DRIVER_AUTH ? { id: this.driverId, fullName: 'Nguyen Van Binh' } : null;
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

/**
 * ADAPTER "RO" — tra CA vong chay da ket thuc.
 *
 * Khong phai mot hinh dang cua san pham hom nay: no dung o day de do rieng lop thu hai. Khong co
 * no, bai "vong chay terminal khong co nut" se xanh chi nho lop loc o kho, va mot lan sua lop do
 * se mo lai loi ma khong bai nao do.
 */
class LeakyFieldCoreFacts extends TransportFieldCoreFactsAdapter {
  constructor(private readonly repository: InMemoryMovementRepository) {
    super(repository);
  }
  override async listOpenRunsForDriver(driverId: string): Promise<readonly FieldRunFacts[]> {
    const runs = await this.repository.listRuns();
    const mine: FieldRunFacts[] = [];
    for (const run of runs) {
      const assignment = await this.repository.activeRunAssignment(run.id);
      if (assignment?.driverId === driverId) {
        mine.push({ id: run.id, code: run.code, status: run.status });
      }
    }
    return mine;
  }
}

describe('Hien truong cua vong chay da ket thuc — #333 BUG-03', () => {
  let movement: InMemoryMovementRepository;
  let checkpoints: InMemoryCheckpointRepository;
  let runId: string;
  let loadedLegId: string;
  let emptyLegId: string;
  const driverId = 'drv_a';

  const serviceOver = (core: TransportFieldCoreFactsAdapter): DriverFieldReadService =>
    new DriverFieldReadService(
      core,
      new FakeIdentity(driverId),
      checkpoints,
      new InMemoryWaitingSessionRepository(),
      new InMemoryOperationalDocumentRepository(),
      new InMemoryPhysicalReceiptHandoverRepository(),
      undefined,
      () => AT,
    );

  const record = async (type: RunCheckpointType, legId: string): Promise<void> => {
    await checkpoints.create({
      type,
      runId,
      legId,
      recordedBy: DRIVER_AUTH,
      driverId,
      observationId: null,
      clientEventId: `${legId}:${type}`,
      capturedAt: null,
      receivedAt: AT,
      businessDate: '2026-09-21',
      note: null,
    });
  };

  const terminalize = async (status: VehicleRunStatus): Promise<void> => {
    await movement.setRunStatus(runId, status, AT);
  };

  const actionsOf = (work: DriverFieldWork) =>
    work.runs.flatMap((run) => run.legs.flatMap((leg) => leg.nextActions));

  beforeEach(async () => {
    movement = new InMemoryMovementRepository();
    checkpoints = new InMemoryCheckpointRepository();

    const order = await movement.createOrder({
      code: 'ORD-1',
      businessDate: '2026-09-21',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
    });
    const run = await movement.createRun({
      code: 'VC-001',
      vehicleId: 'veh_1',
      businessDate: '2026-09-21',
    });
    runId = run.id;
    await movement.assignRun(runId, { driverId, effectiveFrom: AT, assignedBy: 'u.dieu-hanh' });
    const loaded = await movement.createLeg({
      runId,
      sequence: 1,
      kind: 'LOADED',
      orderId: order.id,
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      businessDate: '2026-09-21',
    });
    const empty = await movement.createLeg({
      runId,
      sequence: 2,
      kind: 'EMPTY',
      orderId: null,
      originLabel: 'Hải Phòng',
      destinationLabel: 'Bãi xe',
      businessDate: '2026-09-21',
    });
    loadedLegId = loaded.id;
    emptyLegId = empty.id;
    await movement.setRunStatus(runId, 'ACTIVE', AT);

    // Chang co hang da giao xong, CHUA chup bien nhan; chang rong moi den noi.
    for (const type of [
      'PICKUP_ARRIVAL',
      'PICKUP_DEPARTURE',
      'DELIVERY_ARRIVAL',
      'DELIVERY_ACCEPTED',
    ] as const) {
      await record(type, loadedLegId);
    }
    await record('PICKUP_ARRIVAL', emptyLegId);
  });

  it('DIEM XUAT PHAT cua UAT: vong chay con chay thi nut `Chup bien nhan giao hang` duoc chao', async () => {
    const work = await serviceOver(new TransportFieldCoreFactsAdapter(movement)).workFor(
      DRIVER_AUTH,
    );
    const loaded = work.runs[0]?.legs.find((leg) => leg.legId === loadedLegId);
    expect(loaded?.nextActions.map((action) => action.label)).toContain('Chụp biên nhận giao hàng');
  });

  for (const status of ['COMPLETED', 'CANCELLED'] as const) {
    it(`lop 1 — kho that: vong chay ${status} bien mat khoi man hinh, khong con the nao`, async () => {
      await terminalize(status);
      const work = await serviceOver(new TransportFieldCoreFactsAdapter(movement)).workFor(
        DRIVER_AUTH,
      );
      expect(work.runs).toEqual([]);
      expect(actionsOf(work)).toEqual([]);
    });

    it(`lop 2 — adapter lo vong chay ${status} ra: moi chang van KHONG co mot nut nao`, async () => {
      await terminalize(status);
      const work = await serviceOver(new LeakyFieldCoreFacts(movement)).workFor(DRIVER_AUTH);

      // Adapter that su da lo: the van den, nen bai nay do dung lop thu hai chu khong xanh nho lop 1.
      expect(work.runs.map((run) => run.runId)).toEqual([runId]);
      expect(work.runs[0]?.legs.map((leg) => leg.legId)).toEqual([loadedLegId, emptyLegId]);

      for (const leg of work.runs[0]?.legs ?? []) {
        expect(leg.nextActions, `chang ${leg.sequence}`).toEqual([]);
      }
      // Va rieng hai loai ma UAT gap: khong o chon tep, khong nut ban giao.
      const kinds = actionsOf(work).map((action) => action.kind);
      expect(kinds).not.toContain('DOCUMENT');
      expect(kinds).not.toContain('RECEIPT_HANDOVER');
    });
  }
});
