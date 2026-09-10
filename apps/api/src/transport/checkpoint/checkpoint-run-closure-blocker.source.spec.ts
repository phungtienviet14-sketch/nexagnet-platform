import { describe, expect, it } from 'vitest';
import { CheckpointRunClosureBlockerSource } from './checkpoint-run-closure-blocker.source.js';
import { InMemoryCheckpointRepository } from './checkpoint.repository.js';
import { CheckpointService } from './checkpoint.service.js';
import type { RunCheckpointType } from './checkpoint.types.js';
import {
  TransportCheckpointCoreFacts,
  TransportCheckpointLocationFacts,
  type CheckpointDriverFacts,
  type CheckpointLegFacts,
  type CheckpointRunFacts,
} from './checkpoint-facts.port.js';

/**
 * HANG TREN THUNG — nguon su that that cho `CARGO_STILL_CARRIED` (`#293` R4).
 *
 * Bai kiem di qua DUNG duong da duoc chap nhan: ghi moc that vao `CheckpointRepository`, roi doc
 * lai bang `buildRunTimeline()`. Khong mot bang gia, khong mot cot trang thai moi — neu mot ngay
 * `deriveLegPhase()` doi y nghia, bai nay do chu khong lang le doi theo.
 */

const RUN_ID = 'run-1';
const LEG_ID = 'leg-1';
const OPERATOR = 'dieu-hanh';

class FakeCoreFacts extends TransportCheckpointCoreFacts {
  constructor(private readonly status: CheckpointRunFacts['status'] = 'ACTIVE') {
    super();
  }

  async findDriverByAuthUserId(): Promise<CheckpointDriverFacts | null> {
    return null;
  }

  async findRun(runId: string): Promise<CheckpointRunFacts | null> {
    return runId === RUN_ID ? { id: RUN_ID, code: 'RUN-S1', status: this.status } : null;
  }

  async findLeg(legId: string): Promise<CheckpointLegFacts | null> {
    return legId === LEG_ID ? { id: LEG_ID, runId: RUN_ID } : null;
  }

  async wasDriverEverAssignedToRun(): Promise<boolean> {
    return false;
  }
}

class FakeLocationFacts extends TransportCheckpointLocationFacts {
  async findObservation(): Promise<null> {
    return null;
  }
}

const build = () => {
  const checkpoints = new CheckpointService(
    new InMemoryCheckpointRepository(),
    new FakeCoreFacts(),
    new FakeLocationFacts(),
    { timeZone: 'Asia/Ho_Chi_Minh' },
    /*
     * Chinh sach vi tri RONG, va do la mot lua chon cua BAI KIEM chu khong mot noi long nghiep vu:
     * `DEFAULT_CHECKPOINT_POLICY` doi hoi bang chung vi tri o `DELIVERY_ARRIVAL`/`DELIVERY_ACCEPTED`,
     * con bai kiem nay hoi mot cau khac — *"giai doan suy ra tu chuoi moc noi gi"*. Trong bai cua
     * `#169`/`#243` thi rang buoc do van nguyen ven.
     */
    { locationRequiredTypes: [] },
    undefined,
    () => new Date('2026-09-11T10:00:00.000Z'),
  );
  return { checkpoints, source: new CheckpointRunClosureBlockerSource(checkpoints) };
};

let eventCounter = 0;

/**
 * Ghi mot moc THAT qua dung duong cua dieu hanh.
 *
 * `legId: null` = moc thuoc muc VONG CHAY. Khong dung gia tri mac dinh cho tham so nay: trong
 * JavaScript, truyen `undefined` se KICH HOAT gia tri mac dinh, va mot moc vong chay se bi gan vao
 * chang ma khong ai goi y — bay do lam bai kiem do o mot cho khong lien quan.
 */
const record = (
  checkpoints: CheckpointService,
  type: RunCheckpointType,
  legId: string | null = LEG_ID,
) =>
  checkpoints.recordAsOperator({
    type,
    runId: RUN_ID,
    ...(legId === null ? {} : { legId }),
    authUserId: OPERATOR,
    clientEventId: `evt-${(eventCounter += 1)}`,
  });

describe('nguon chan dong tu moc van hanh (#293 R4)', () => {
  it('da boc hang len thung ma chua giao: CARGO_STILL_CARRIED', async () => {
    const { checkpoints, source } = build();
    await record(checkpoints, 'PICKUP_ARRIVAL');
    await record(checkpoints, 'LOADING');

    expect(await source.blockersForRun(RUN_ID)).toEqual(['CARGO_STILL_CARRIED']);
  });

  it('dang tren duong: van la hang tren thung', async () => {
    const { checkpoints, source } = build();
    await record(checkpoints, 'PICKUP_ARRIVAL');
    await record(checkpoints, 'LOADING');
    await record(checkpoints, 'PICKUP_DEPARTURE');

    expect(await source.blockersForRun(RUN_ID)).toEqual(['CARGO_STILL_CARRIED']);
  });

  it('da toi diem giao ma nguoi nhan CHUA KY: van la hang tren thung', async () => {
    const { checkpoints, source } = build();
    await record(checkpoints, 'PICKUP_ARRIVAL');
    await record(checkpoints, 'LOADING');
    await record(checkpoints, 'PICKUP_DEPARTURE');
    await record(checkpoints, 'DELIVERY_ARRIVAL');

    expect(await source.blockersForRun(RUN_ID)).toEqual(['CARGO_STILL_CARRIED']);
  });

  it('nguoi nhan DA KY: khong con gi tren thung', async () => {
    const { checkpoints, source } = build();
    await record(checkpoints, 'PICKUP_ARRIVAL');
    await record(checkpoints, 'LOADING');
    await record(checkpoints, 'PICKUP_DEPARTURE');
    await record(checkpoints, 'DELIVERY_ARRIVAL');
    await record(checkpoints, 'DELIVERY_ACCEPTED');

    expect(await source.blockersForRun(RUN_ID)).toEqual([]);
  });

  it('moi toi diem lay, CHUA boc hang: khong co gi trong thung ca', async () => {
    const { checkpoints, source } = build();
    await record(checkpoints, 'PICKUP_ARRIVAL');
    await record(checkpoints, 'GATE_ENTRY');

    expect(await source.blockersForRun(RUN_ID)).toEqual([]);
  });

  it('chua co moc nao: KHONG suy ra duoc gi — va do khong phai mot phep doan', async () => {
    const { source } = build();

    /*
     * `[]` o day nghia la *"chua co su that nao noi hang da len xe"*, khong phai *"thung chac chan
     * rong"*. Su khac biet do quan trong: neu cong nay tra ve mot ma chan khi khong co du lieu, moi
     * khach khong bat `transport-checkpoint` se khong bao gio dong duoc vong chay nao.
     */
    expect(await source.blockersForRun(RUN_ID)).toEqual([]);
  });

  it('moc cua VONG CHAY (khong gan chang) khong lam cong nay doi y', async () => {
    const { checkpoints, source } = build();
    await record(checkpoints, 'ASSIGNED', null);

    expect(await source.blockersForRun(RUN_ID)).toEqual([]);
  });

  it('vong chay khong ton tai: NEM ra ngoai — de tang tren dong cua lai, khong nuot loi', async () => {
    const { source } = build();

    /*
     * Nem la CO Y. `collectBlockers()` bien mot nguon hong thanh `EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE`
     * va vong chay dung lai. Neu lop nay nuot loi va tra `[]`, "khong doc duoc so ghi hien truong"
     * se tro thanh "so ghi hien truong khong chan gi" — dung kieu fail-open ma `#293` R4 cam.
     */
    await expect(source.blockersForRun('run-khong-ton-tai')).rejects.toThrowError();
  });
});
