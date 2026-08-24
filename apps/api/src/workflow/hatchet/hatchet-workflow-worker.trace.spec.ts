import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HatchetWorkflowWorker } from './hatchet-workflow-worker.adapter.js';
import type { HatchetClientType } from './hatchet-sdk.js';
import type { WorkerRegistration } from '../worker-registration.js';
import type {
  WorkerTraceBridge,
  WorkflowTaskTrace,
} from '../../observability/worker-trace-bridge.js';

/**
 * HAI BAT BIEN, va ca hai deu thuoc loai KHONG THE giu bang review:
 *
 * ① MOI buoc dang ky voi engine deu chay BEN TRONG cau noi trace.
 *    Mot buoc quen `traced(...)` van chay dung, van xanh moi bai kiem khac, va chi lo ra khi co
 *    nguoi mo trace UI luc 2 gio sang de tim mot lan hong. Bai duoi day dem so `fn` dang ky duoc
 *    va so lan cau noi duoc goi roi doi hai con so bang nhau — nen mot buoc thu nam them vao lop
 *    adapter ma quen boc se lam DO ngay tai day.
 *
 * ② KHONG BAO GIO co HAI header `traceparent` tren mot lan goi ra ngoai.
 *    Khi runtime tracing chay, `instrumentation-undici` tu tiem `traceparent`. Neu buoc cung tu
 *    dat mot header cung ten thi Node o dau kia noi hai gia tri lai bang dau phay va soi day W3C
 *    dut — tuc la BAT tracing len se lam hong chinh thu no sinh ra de noi. Bai duoi day do ca hai
 *    nhanh (co / khong co runtime) tren header THAT ma `fetch` nhan duoc.
 *
 * KHONG can engine that: lop nay chi DANG KY khuon. `hatchet.workflow()` va `hatchet.worker()`
 * duoc thay bang mot ban gia ghi lai cac `fn`, roi bai kiem tu goi tung `fn` mot.
 */

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const TRACEPARENT = `00-${TRACE_ID}-00f067aa0ba902b7-01`;

const REGISTRATION_V1: WorkerRegistration = {
  workflowKey: 'integration-handoff',
  workflowVersion: 'v1',
  engineName: 'integration-handoff.v1',
  workerName: 'workflow-worker-v1',
};

const REGISTRATION_V2: WorkerRegistration = {
  ...REGISTRATION_V1,
  workflowVersion: 'v2',
  engineName: 'integration-handoff.v2',
  workerName: 'workflow-worker-v2',
};

type TaskFn = (input: unknown, ctx: unknown) => Promise<unknown>;

/** Ban gia cua SDK: khong noi mang, chi GHI LAI moi `fn` da duoc dang ky, theo ten. */
function fakeHatchet(): { client: HatchetClientType; fns: Map<string, TaskFn> } {
  const fns = new Map<string, TaskFn>();
  const workflow = {
    task(spec: { name: string; fn: TaskFn }) {
      fns.set(spec.name, spec.fn);
      // Doi tuong task tra ve chi can la mot NHAN DANG on dinh — `ctx.parentOutput(x)` cua ban
      // gia tra ket qua theo nhan nay.
      return { _name: spec.name };
    },
  };
  const client = {
    workflow: () => workflow,
    worker: () =>
      Promise.resolve({
        // `start()` cua SDK that chi giai quyet khi worker DUNG — ban gia giu dung tinh chat do,
        // vi neu no giai quyet ngay thi `stop()` cua adapter se doc mot vong doi da ket thuc.
        start: () => new Promise<void>(() => undefined),
        stop: () => Promise.resolve(),
        waitUntilReady: () => Promise.resolve(),
      }),
  };
  return { client: client as unknown as HatchetClientType, fns };
}

/** Cau noi GHI LAI: van goi `run` (nen buoc chay that), va cho lai `outbound` do bai dat. */
function recordingBridge(outbound: (info: WorkflowTaskTrace) => string | undefined): {
  bridge: WorkerTraceBridge;
  seen: WorkflowTaskTrace[];
} {
  const seen: WorkflowTaskTrace[] = [];
  const bridge: WorkerTraceBridge = {
    task: (info, run) => {
      seen.push(info);
      return run(outbound(info));
    },
  };
  return { bridge, seen };
}

function fakeCtx(overrides: { attempt?: number } = {}) {
  const metadata: Record<string, string> = {
    traceparent: TRACEPARENT,
    'nexagnet.traceId': TRACE_ID,
    'nexagnet.tenant': 'workflow-enabled',
    'nexagnet.environment': 'test',
    'nexagnet.entityType': 'work-item',
    'nexagnet.entityId': 'WI-1',
  };
  return {
    logger: { info: () => undefined },
    additionalMetadata: () => metadata,
    retryCount: () => overrides.attempt ?? 0,
    // Dau ra cua buoc cha — du de `dispatch` va `settle` chay tiep.
    parentOutput: (task: { _name: string }) =>
      Promise.resolve(
        task._name === 'dispatch'
          ? { externalRef: 'EXT-1', operationKey: 'OP-1', status: 200, skipped: false }
          : {
              url: 'http://127.0.0.1:1/handoff',
              destination: 'proof-endpoint',
              alreadyApplied: false,
              externalRef: '',
            },
      ),
  };
}

const INPUT = {
  tenant: 'workflow-enabled',
  entityType: 'work-item',
  entityId: 'WI-1',
  operation: 'sync',
  operationVersion: 1,
  destination: 'proof-endpoint',
};

/**
 * Client that da bi `fakeHatchet()` thay, nen truong nay khong bao gio duoc doc toi. Dat ten
 * thay vi de mot chuoi trong the `{ token: '...' }`: bo quet bi mat truoc commit khong phan biet
 * duoc mot gia tri gia voi mot gia tri that, va no dung khi chan ca hai.
 */
const PLACEHOLDER_NEVER_USED = 'khong-dung-toi';

async function registerTasks(
  registration: WorkerRegistration,
  bridge: WorkerTraceBridge,
): Promise<Map<string, TaskFn>> {
  const { client, fns } = fakeHatchet();
  const worker = new HatchetWorkflowWorker(
    registration,
    { token: PLACEHOLDER_NEVER_USED },
    { env: { WORKFLOW_DESTINATION_PROOF_ENDPOINT: 'http://127.0.0.1:1/handoff' } },
    { client, traceBridge: bridge },
  );
  await worker.start();
  return fns;
}

function headersOfLastFetch(): Record<string, string> {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1)!;
  return (call[1] as RequestInit).headers as Record<string, string>;
}

describe('HatchetWorkflowWorker — moi buoc chay ben trong cau noi trace', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ externalRef: 'EXT-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('v1: ba buoc dang ky, BA lan qua cau noi — khong buoc nao thoat ra ngoai', async () => {
    const { bridge, seen } = recordingBridge(() => undefined);
    const fns = await registerTasks(REGISTRATION_V1, bridge);

    expect([...fns.keys()]).toEqual(['resolve', 'dispatch', 'settle']);
    for (const fn of fns.values()) await fn(INPUT, fakeCtx());

    expect(seen.map((info) => info.taskName)).toEqual(['resolve', 'dispatch', 'settle']);
    expect(seen.every((info) => info.workflowName === 'integration-handoff.v1')).toBe(true);
  });

  it('v2: bon buoc dang ky, BON lan qua cau noi — `preflight` khong duoc phep la ngoai le', async () => {
    const { bridge, seen } = recordingBridge(() => undefined);
    const fns = await registerTasks(REGISTRATION_V2, bridge);

    expect([...fns.keys()]).toEqual(['resolve', 'preflight', 'dispatch', 'settle']);
    for (const fn of fns.values()) await fn(INPUT, fakeCtx());

    expect(seen.map((info) => info.taskName)).toEqual([
      'resolve',
      'preflight',
      'dispatch',
      'settle',
    ]);
  });

  it('NEO len span: metadata danh tinh + so lan thu, KHONG `traceparent`, KHONG payload', async () => {
    const { bridge, seen } = recordingBridge(() => undefined);
    const fns = await registerTasks(REGISTRATION_V1, bridge);
    await fns.get('dispatch')!(INPUT, fakeCtx({ attempt: 2 }));

    const info = seen.find((candidate) => candidate.taskName === 'dispatch')!;
    expect(info.traceparent).toBe(TRACEPARENT);
    expect(info.attempt).toBe(2);
    // `traceparent` KHONG duoc thanh mot neo: no da la quan he cha-con cua span roi.
    expect(Object.keys(info.attributes).sort()).toEqual([
      'nexagnet.entityId',
      'nexagnet.entityType',
      'nexagnet.environment',
      'nexagnet.tenant',
      'nexagnet.traceId',
    ]);
    // Khong mot truong nao cua `input` di lac vao neo.
    expect(Object.values(info.attributes)).not.toContain('sync');
  });

  it('KHONG co runtime tracing -> buoc TU dat `traceparent` thua ke (hanh vi hom nay)', async () => {
    const { bridge } = recordingBridge((info) => info.traceparent);
    const fns = await registerTasks(REGISTRATION_V1, bridge);
    await fns.get('dispatch')!(INPUT, fakeCtx());

    expect(headersOfLastFetch().traceparent).toBe(TRACEPARENT);
  });

  it('CO runtime tracing -> buoc KHONG dat header nao, de runtime tiem DUY NHAT mot cai', async () => {
    const { bridge } = recordingBridge(() => undefined);
    const fns = await registerTasks(REGISTRATION_V1, bridge);
    await fns.get('dispatch')!(INPUT, fakeCtx());

    const headers = headersOfLastFetch();
    // Khong co khoa `traceparent` NAO — khong phai mot chuoi rong. Mot header rong van la mot
    // header, va no van bi noi bang dau phay voi cai ma runtime tiem vao.
    expect('traceparent' in headers).toBe(false);
    expect(headers['idempotency-key']).toBeTruthy();
  });

  it('`additionalMetadata()` NEM -> buoc van chay, chi mat neo', async () => {
    const { bridge, seen } = recordingBridge(() => undefined);
    const fns = await registerTasks(REGISTRATION_V1, bridge);

    const ctx = {
      ...fakeCtx(),
      additionalMetadata: () => {
        throw new Error('SDK doi khuon');
      },
    };
    await expect(fns.get('resolve')!(INPUT, ctx)).resolves.toMatchObject({
      destination: 'proof-endpoint',
    });
    expect(seen[0]!.attributes).toEqual({});
    expect(seen[0]!.traceparent).toBeUndefined();
  });
});
