import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowEnginePort, type WorkflowRunSummary } from './workflow-engine.port.js';
import {
  WorkflowOutboxRepository,
  type WorkflowOutboxEntry,
} from './workflow-outbox.repository.js';
import { WORKFLOW_ENGINE_DASHBOARD_URL_ENV } from './workflow-run-dashboard.js';
import { WorkflowRunLookup } from './workflow-run-lookup.service.js';

/**
 * DUONG DOC cua mien workflow — cai cua so hep ma man hinh chan doan nhin qua.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI KIEM NAY TON TAI:
 *
 * `describeRun()` cua cong engine tra ve `startedAt`/`finishedAt` — moc THAT cua lan chay, va la
 * nguon DUY NHAT do duoc mot lan cho ben vung. Ban truoc cua tep nay lam mot viec rat de bo qua:
 * no lay `summary.status` roi bo phan con lai.
 *
 * Hau qua khong lo ra o day ma lo ra ba tang phia tren: man hinh chan doan het nguon do thoi gian
 * workflow, nen no quay sang hieu timestamp cua cac LUOT va dan len do mot cau noi ve lan cho ben
 * vung. Mot con so ~2 giay duoc goi la "thoi gian co ca lan cho 90 giay".
 *
 * Nen bai kiem nay khoa dung mot dieu: cai gi engine noi ra thi phai di duoc toi noi hien thi.
 */

const ENTITY_ID = 'don-7';
const RUN_ID = 'e89aa711-1fe1-4b40-a122-4b6328d6aaa9';

function outboxRow(overrides: Partial<WorkflowOutboxEntry> = {}): WorkflowOutboxEntry {
  return {
    id: 'hang-1',
    operationKey: 'op-1',
    workflowKey: 'sales-handoff-followup',
    workflowVersion: 'v1',
    entityType: 'sales-handoff',
    entityId: ENTITY_ID,
    payload: {},
    metadata: {},
    maxAttempts: 5,
    baseBackoffSeconds: 10,
    status: 'dispatched',
    attempts: 1,
    nextAttemptAt: null,
    engineRunId: RUN_ID,
    lastError: null,
    queuedAt: new Date('2026-08-25T10:00:02.000Z'),
    dispatchedAt: new Date('2026-08-25T10:00:02.500Z'),
    ...overrides,
  };
}

/** Kho outbox toi thieu: chi duong DOC duoc dung o day, cac duong GHI nem neu ai lo goi. */
class FakeOutbox extends WorkflowOutboxRepository {
  constructor(private readonly rows: WorkflowOutboxEntry[]) {
    super();
  }

  async findByEntityId(entityId: string): Promise<WorkflowOutboxEntry[]> {
    return this.rows.filter((row) => row.entityId === entityId);
  }

  enqueue(): never {
    throw new Error('duong GHI khong duoc dung o bai kiem duong DOC');
  }
  claimDue(): never {
    throw new Error('duong GHI khong duoc dung o bai kiem duong DOC');
  }
  markDispatched(): never {
    throw new Error('duong GHI khong duoc dung o bai kiem duong DOC');
  }
  markAttemptFailed(): never {
    throw new Error('duong GHI khong duoc dung o bai kiem duong DOC');
  }
  async findByOperationKey(): Promise<null> {
    return null;
  }
  async countPending(): Promise<number> {
    return 0;
  }
  async countFailed(): Promise<number> {
    return 0;
  }
}

class FakeEngine extends WorkflowEnginePort {
  constructor(private readonly answer: () => Promise<WorkflowRunSummary | null>) {
    super();
  }

  async describeRun(): Promise<WorkflowRunSummary | null> {
    return this.answer();
  }

  trigger(): never {
    throw new Error('khong dung o duong doc');
  }
  sendEvent(): never {
    throw new Error('khong dung o duong doc');
  }
  cancel(): never {
    throw new Error('khong dung o duong doc');
  }
  countInFlight(): never {
    throw new Error('khong dung o duong doc');
  }
}

function completedRun(): WorkflowRunSummary {
  return {
    engineRunId: RUN_ID,
    workflowName: 'sales-handoff-followup.v1',
    status: 'COMPLETED',
    startedAt: '2026-08-25T10:00:02.000Z',
    finishedAt: '2026-08-25T10:01:37.000Z',
  };
}

const previousDashboardUrl = process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV];

afterEach(() => {
  if (previousDashboardUrl === undefined) delete process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV];
  else process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV] = previousDashboardUrl;
});

describe('WorkflowRunLookup — moc thoi gian cua engine di ra toi noi hien thi', () => {
  it('giu CA HAI moc, khong chi giu trang thai', async () => {
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow()]),
      new FakeEngine(async () => completedRun()),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.engineStatus).toBe('COMPLETED');
    expect(run!.engineStartedAt).toBe('2026-08-25T10:00:02.000Z');
    expect(run!.engineFinishedAt).toBe('2026-08-25T10:01:37.000Z');
  });

  it('run DANG CHAY thi co moc bat dau ma khong co moc ket thuc', async () => {
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow()]),
      new FakeEngine(async () => ({
        engineRunId: RUN_ID,
        workflowName: 'sales-handoff-followup.v1',
        status: 'RUNNING',
        startedAt: '2026-08-25T10:00:02.000Z',
      })),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.engineStatus).toBe('RUNNING');
    expect(run!.engineStartedAt).toBe('2026-08-25T10:00:02.000Z');
    expect(run!.engineFinishedAt).toBeUndefined();
  });

  it('engine im lang thi KHONG co moc nao — va noi ra bang ghi chu', async () => {
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow()]),
      new FakeEngine(async () => {
        throw new Error('ket noi hong');
      }),
    );

    const result = await lookup.forEntity(ENTITY_ID);

    expect(result.runs[0]!.engineStartedAt).toBeUndefined();
    expect(result.runs[0]!.engineFinishedAt).toBeUndefined();
    expect(result.notes.join(' ')).toContain('Không hỏi được trạng thái từ engine');
    // Thong bao loi goc co the mang host/token cua engine — no khong duoc di xuong man hinh.
    expect(result.notes.join(' ')).not.toContain('ket noi hong');
  });

  it('khong khai engine thi van doc duoc ban giao, chi la khong co moc', async () => {
    const lookup = new WorkflowRunLookup(new FakeOutbox([outboxRow()]));

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.handoffStatus).toBe('dispatched');
    expect(run!.engineStatus).toBeUndefined();
    expect(run!.engineStartedAt).toBeUndefined();
  });

  it('chua ban giao duoc thi khong hoi engine, nen khong co moc', async () => {
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow({ status: 'pending', engineRunId: null, dispatchedAt: null })]),
      new FakeEngine(async () => {
        throw new Error('khong duoc phep hoi engine khi chua co engineRunId');
      }),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.handoffStatus).toBe('pending');
    expect(run!.engineStartedAt).toBeUndefined();
  });
});

describe('WorkflowRunLookup — duong bam sang engine', () => {
  /*
   * DUONG DAN, KHONG PHAI QUYEN VAO. Dashboard engine nam sau basic-auth cua Caddy va bai kiem
   * nay khong biet mat khau — no chi khoa mot dieu: cai href dung `engineRunId` THAT cua chinh
   * lan chay do, chu khong phai mot id khac hay mot goc doan mo.
   */

  it('href dung dung engineRunId that cua lan chay', async () => {
    process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV] = 'https://engine.example/';
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow()]),
      new FakeEngine(async () => completedRun()),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.dashboardUrl).toBe('https://engine.example/runs/' + RUN_ID);
    expect(run!.dashboardUrl).toContain(run!.engineRunId!);
  });

  it('khong khai goc dashboard thi KHONG dung mot nut dan toi hu vo', async () => {
    delete process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV];
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow()]),
      new FakeEngine(async () => completedRun()),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.dashboardUrl).toBeUndefined();
  });

  it('chua co engineRunId thi khong co duong bam — khong doan mot id', async () => {
    process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV] = 'https://engine.example';
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow({ status: 'pending', engineRunId: null, dispatchedAt: null })]),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.dashboardUrl).toBeUndefined();
  });

  it('KHONG nhung thong tin dang nhap vao URL — dashboard van sau basic-auth', async () => {
    process.env[WORKFLOW_ENGINE_DASHBOARD_URL_ENV] = 'https://engine.example';
    const lookup = new WorkflowRunLookup(
      new FakeOutbox([outboxRow()]),
      new FakeEngine(async () => completedRun()),
    );

    const [run] = (await lookup.forEntity(ENTITY_ID)).runs;

    expect(run!.dashboardUrl).not.toContain('@');
    expect(run!.dashboardUrl).not.toMatch(/password|token|user=/i);
  });
});
