import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import {
  InMemoryWorkflowOutboxRepository,
  type NewWorkflowOutboxEntry,
} from './workflow-outbox.repository.js';
import {
  WorkflowEnginePort,
  type TriggerWorkflowCommand,
  type WorkflowRunReference,
  type WorkflowRunSummary,
} from './workflow-engine.port.js';

/** Engine gia — ghi lai moi lan goi de dem duoc "co bao nhieu lan cham vao he ngoai". */
class RecordingEngine extends WorkflowEnginePort {
  readonly triggered: TriggerWorkflowCommand[] = [];
  failNext = 0;

  async trigger(command: TriggerWorkflowCommand): Promise<WorkflowRunReference> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error('ENGINE_UNAVAILABLE');
    }
    this.triggered.push(command);
    return {
      engineRunId: `run-${this.triggered.length}`,
      workflowName: `${command.workflowKey}.${command.workflowVersion}`,
    };
  }
  async sendEvent(): Promise<void> {}
  async cancel(): Promise<void> {}
  async describeRun(): Promise<WorkflowRunSummary | null> {
    return null;
  }
  async countInFlight(): Promise<number> {
    return 0;
  }
}

const entry = (overrides: Partial<NewWorkflowOutboxEntry> = {}): NewWorkflowOutboxEntry => ({
  operationKey: 'tenant-alpha:gd1-test:integration-handoff:v1:order:ord_1:create:erp-primary',
  workflowKey: 'integration-handoff',
  workflowVersion: 'v1',
  entityType: 'order',
  entityId: 'ord_1',
  payload: { tenant: 'tenant-alpha', entityType: 'order', entityId: 'ord_1' },
  metadata: { 'nexagnet.tenant': 'tenant-alpha' },
  maxAttempts: 3,
  baseBackoffSeconds: 30,
  ...overrides,
});

describe('WorkflowOutboxRepository — ban giao mot lan, khong hai lan', () => {
  let repository: InMemoryWorkflowOutboxRepository;

  beforeEach(() => {
    repository = new InMemoryWorkflowOutboxRepository();
  });

  it('hai lan xep cung mot khoa thao tac chi ra MOT hang', async () => {
    await repository.enqueue(entry());
    await repository.enqueue(entry());

    expect(await repository.countPending()).toBe(1);
  });

  it('hai dispatcher chay dong thoi thi chi MOT nguoi nhan duoc viec', async () => {
    await repository.enqueue(entry());
    const now = new Date();

    const [first, second] = await Promise.all([
      repository.claimDue('worker-a', now, 60, 10),
      repository.claimDue('worker-b', now, 60, 10),
    ]);

    expect(first.length + second.length).toBe(1);
  });

  it('lease het han thi worker khac nhan lai duoc — worker chet khong lam mat viec', async () => {
    await repository.enqueue(entry());
    const t0 = new Date('2026-08-22T10:00:00Z');
    expect((await repository.claimDue('worker-chet', t0, 60, 10)).length).toBe(1);

    // Ngay sau do thi khong ai nhan duoc...
    expect((await repository.claimDue('worker-khac', t0, 60, 10)).length).toBe(0);
    // …nhung sau khi lease het han thi co.
    const t1 = new Date(t0.getTime() + 61_000);
    expect((await repository.claimDue('worker-khac', t1, 60, 10)).length).toBe(1);
  });
});

describe('WorkflowDispatcher — su kien nghiep vu KHONG DUOC MAT', () => {
  let repository: InMemoryWorkflowOutboxRepository;
  let engine: RecordingEngine;
  let dispatcher: WorkflowDispatcher;

  beforeEach(() => {
    repository = new InMemoryWorkflowOutboxRepository();
    engine = new RecordingEngine();
    dispatcher = new WorkflowDispatcher(repository, engine, { workerId: 'w1', leaseSeconds: 60 });
  });

  it('CUA SO SUP: ghi outbox xong roi tien trinh chet truoc khi kich hoat -> tick sau van gui', async () => {
    // "Tien trinh chet" duoc dien ta dung nhu no la: hang da nam trong DB, va KHONG co lan goi
    // engine nao xay ra. Neu thiet ke la trigger-truc-tiep-sau-commit thi luc nay su kien da mat.
    await repository.enqueue(entry());
    expect(engine.triggered).toHaveLength(0);

    await dispatcher.tick(new Date());

    expect(engine.triggered).toHaveLength(1);
    expect(await repository.countPending()).toBe(0);
  });

  it('engine CHET luc kich hoat -> hang khong mat, quay lai cho voi backoff', async () => {
    await repository.enqueue(entry());
    engine.failNext = 1;
    const t0 = new Date('2026-08-22T10:00:00Z');

    await dispatcher.tick(t0);

    expect(engine.triggered).toHaveLength(0);
    expect(await repository.countPending()).toBe(1);
    // Chua toi luc thu lai thi khong duoc thu lai — neu khong se quay vong dot he ngoai.
    await dispatcher.tick(new Date(t0.getTime() + 1_000));
    expect(engine.triggered).toHaveLength(0);
    // Qua backoff thi thu lai, va lan nay thanh cong.
    await dispatcher.tick(new Date(t0.getTime() + 31_000));
    expect(engine.triggered).toHaveLength(1);
  });

  it('het so lan thu thi chuyen `failed` — khong quay vong vo tan', async () => {
    await repository.enqueue(entry({ maxAttempts: 2 }));
    engine.failNext = 5;
    let now = new Date('2026-08-22T10:00:00Z');

    for (let i = 0; i < 5; i += 1) {
      await dispatcher.tick(now);
      now = new Date(now.getTime() + 10 * 60_000);
    }

    expect(await repository.countPending()).toBe(0);
    expect(await repository.countFailed()).toBe(1);
  });

  it('gui THANH CONG mot lan thi khong gui lan hai, du tick bao nhieu lan', async () => {
    await repository.enqueue(entry());

    await dispatcher.tick(new Date());
    await dispatcher.tick(new Date());
    await dispatcher.tick(new Date());

    expect(engine.triggered).toHaveLength(1);
  });

  it('luu `engineRunId` de audit tro nguoc duoc sang engine', async () => {
    await repository.enqueue(entry());

    await dispatcher.tick(new Date());

    const row = await repository.findByOperationKey(entry().operationKey);
    expect(row?.engineRunId).toBe('run-1');
    expect(row?.status).toBe('dispatched');
  });

  it('truyen nguyen payload va metadata da lam sach xuong engine', async () => {
    await repository.enqueue(entry());

    await dispatcher.tick(new Date());

    expect(engine.triggered[0]?.input).toEqual(entry().payload);
    expect(engine.triggered[0]?.metadata).toEqual(entry().metadata);
    expect(engine.triggered[0]?.operationKey).toBe(entry().operationKey);
  });

  it('khach chua bat engine: hang nam yen, khong mat, va khong nem ra ngoai tick', async () => {
    const disabled = new WorkflowDispatcher(repository, new DisabledWorkflowEngineAdapter(), {
      workerId: 'w1',
      leaseSeconds: 60,
    });
    await repository.enqueue(entry());

    await expect(disabled.tick(new Date())).resolves.not.toThrow();

    expect(await repository.countPending()).toBe(1);
  });

  it('mot hang hong khong chan cac hang con lai trong cung mot tick', async () => {
    await repository.enqueue(entry({ operationKey: 'k1', entityId: 'ord_1' }));
    await repository.enqueue(entry({ operationKey: 'k2', entityId: 'ord_2' }));
    const trigger = vi.spyOn(engine, 'trigger');
    trigger.mockRejectedValueOnce(new Error('chi hang dau hong'));

    await dispatcher.tick(new Date());

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(await repository.countPending()).toBe(1);
  });
});
