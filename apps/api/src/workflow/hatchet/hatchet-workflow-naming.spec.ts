import { describe, expect, it } from 'vitest';
import { HatchetWorkflowWorker } from './hatchet-workflow-worker.adapter.js';
import type { HatchetClientType } from './hatchet-sdk.js';
import type { WorkerRegistration } from '../worker-registration.js';
import type { WorkerTraceBridge } from '../../observability/worker-trace-bridge.js';
import { describeWorkflow, describeWorkflowStep } from '../workflow-catalog.js';
import { INTEGRATION_HANDOFF_KEY, SALES_HANDOFF_FOLLOWUP_KEY } from '../workflow-registry.js';

/**
 * CAI GI THAT SU DUOC GUI SANG ENGINE — va cai gi TUYET DOI khong duoc doi.
 *
 * ---------------------------------------------------------------------------
 * HAI SUC EP KEO NGUOC NHAU, va bai kiem nay giu ca hai cung mot luc:
 *
 * ① NGUOI DOC. Tren dashboard cua engine, mot nguoi Viet chi nhin thay `sales-handoff-followup.v1`
 *    / `load-state` / `wait` / `recheck-mark`. Doc duoc thi hieu, khong doc duoc thi chiu.
 *
 * ② MAY DINH TUYEN. Chinh nhung chuoi do LA danh tinh: `name` cua khuon la thu engine ghim phien
 *    ban theo, `name` cua buoc la `actionId` ma worker dang ky va engine dinh tuyen viec theo.
 *    Doi mot chu = moi run DANG CHO mo coi, va `recheck-mark` cua mot lan cho 3 ngay khong bao gio
 *    duoc goi. Khong co gi do khi dieu do xay ra — no chi im lang.
 *
 * Nen ban giao uoc la: NHAN doi duoc, DANH TINH thi khong. Bai duoi day khoa dung ranh gioi do.
 */

const REGISTRATIONS: Record<string, WorkerRegistration> = {
  [SALES_HANDOFF_FOLLOWUP_KEY]: {
    workflowKey: SALES_HANDOFF_FOLLOWUP_KEY,
    workflowVersion: 'v1',
    engineName: 'sales-handoff-followup.v1',
    workerName: 'workflow-worker-sales-handoff-followup-v1',
  },
  [INTEGRATION_HANDOFF_KEY]: {
    workflowKey: INTEGRATION_HANDOFF_KEY,
    workflowVersion: 'v1',
    engineName: 'integration-handoff.v1',
    workerName: 'workflow-worker-v1',
  },
};

interface WorkflowSpec {
  readonly name: string;
  readonly description?: string;
}

type TaskFn = (input: unknown, ctx: unknown) => Promise<unknown>;

/**
 * Ban gia cua SDK GHI LAI DUNG NHUNG GI DI SANG ENGINE.
 *
 * Khac ban gia trong `hatchet-workflow-worker.trace.spec.ts` o hai cho, va ca hai deu can thiet
 * o day: ban nay GIU LAI spec cua khuon (`name`/`description` — ban kia vut di), va no co
 * `durableTask()` (khuon `sales-handoff-followup` co buoc `wait` la durable, ban kia khong chay
 * duoc khuon do).
 */
function capturingHatchet(): {
  client: HatchetClientType;
  specs: WorkflowSpec[];
  taskNames: string[];
  fns: Map<string, TaskFn>;
} {
  const specs: WorkflowSpec[] = [];
  const taskNames: string[] = [];
  const fns = new Map<string, TaskFn>();

  const register = (spec: { name: string; fn: TaskFn }) => {
    taskNames.push(spec.name);
    fns.set(spec.name, spec.fn);
    return { _name: spec.name };
  };
  const workflow = { task: register, durableTask: register };

  const client = {
    workflow: (spec: WorkflowSpec) => {
      specs.push(spec);
      return workflow;
    },
    worker: () =>
      Promise.resolve({
        start: () => new Promise<void>(() => undefined),
        stop: () => Promise.resolve(),
        waitUntilReady: () => Promise.resolve(),
      }),
  };
  return { client: client as unknown as HatchetClientType, specs, taskNames, fns };
}

/** Cau noi trace KHONG LAM GI — bai nay khong noi ve trace, chi ve ten. */
const PASSTHROUGH: WorkerTraceBridge = { task: (_info, run) => run(undefined) };

async function register(workflowKey: string) {
  const hatchet = capturingHatchet();
  const worker = new HatchetWorkflowWorker(
    REGISTRATIONS[workflowKey]!,
    // Ban gia SDK duoc tiem thang qua `overrides.client`, nen `HatchetClient.init()` khong bao
    // gio duoc goi va gia tri nay khong di dau ca.
    { token: 'bo-qua' },
    { env: {} as NodeJS.ProcessEnv },
    { client: hatchet.client, traceBridge: PASSTHROUGH },
  );
  await worker.start();
  return hatchet;
}

describe('DANH TINH gui sang engine — khong duoc doi vi ly do tham my', () => {
  it('ten KHUON van la chuoi may mang phien ban', async () => {
    const sales = await register(SALES_HANDOFF_FOLLOWUP_KEY);
    const integration = await register(INTEGRATION_HANDOFF_KEY);

    expect(sales.specs.map((spec) => spec.name)).toEqual(['sales-handoff-followup.v1']);
    expect(integration.specs.map((spec) => spec.name)).toEqual(['integration-handoff.v1']);
  });

  it('ten BUOC van y nguyen, dung thu tu, khong mot chu tieng Viet nao', async () => {
    const sales = await register(SALES_HANDOFF_FOLLOWUP_KEY);
    const integration = await register(INTEGRATION_HANDOFF_KEY);

    // `wait` chu KHONG phai `durable-wait`: day la ten worker dang ky that.
    expect(sales.taskNames).toEqual(['load-state', 'wait', 'recheck-mark']);
    expect(integration.taskNames).toEqual(['resolve', 'dispatch', 'settle']);

    for (const name of [...sales.taskNames, ...integration.taskNames]) {
      // ASCII thuan: mot dau tieng Viet lot vao day la mot `actionId` khac.
      expect(name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('danh ba nguoi-doc bam theo DUNG khoa may that, khong theo mot ten de doc hon', async () => {
    // Neu danh ba lech khoi ten that thi nhan bien mat trong im lang — buoc van chay, chi la
    // khong ai doc duoc gi. Bai nay noi hai nguon do lai voi nhau.
    const sales = await register(SALES_HANDOFF_FOLLOWUP_KEY);

    const cataloged = describeWorkflow(SALES_HANDOFF_FOLLOWUP_KEY).steps.map((step) => step.key);
    expect(cataloged).toEqual(sales.taskNames);
  });
});

describe('NHAN NGUOI DOC gui sang engine', () => {
  it('mo ta khuon la TIENG VIET, va la chinh cau trong danh ba', async () => {
    const { specs } = await register(SALES_HANDOFF_FOLLOWUP_KEY);
    const catalog = describeWorkflow(SALES_HANDOFF_FOLLOWUP_KEY);

    const description = specs[0]!.description!;
    expect(description.startsWith(`${catalog.displayName} — `)).toBe(true);
    expect(description).toContain('Nhắc Sale sau bàn giao');
    expect(description).toContain(catalog.description);
  });

  it('khuon nen tang cung co mo ta tieng Viet, va no khong nhac ten khach nao', async () => {
    const { specs } = await register(INTEGRATION_HANDOFF_KEY);

    const description = specs[0]!.description!;
    expect(description).toContain('Bàn giao sang hệ ngoài');
    expect(description.toLowerCase()).not.toMatch(/ultty|amico|netviet|nexagnet/);
  });

  it('moi buoc TU IN nhan tieng Viet cua no ra log cua engine', async () => {
    const { fns } = await register(SALES_HANDOFF_FOLLOWUP_KEY);

    for (const taskName of ['load-state', 'wait', 'recheck-mark']) {
      const lines: string[] = [];
      const ctx = stubCtx(lines);
      // Buoc se hong ngay sau do (khong co dich den that) — ta chi quan tam dong dau tien.
      await fns.get(taskName)!({ entityId: 'WI-1', destination: 'x' }, ctx).catch(() => undefined);

      const label = describeWorkflowStep(SALES_HANDOFF_FOLLOWUP_KEY, taskName).label;
      expect(lines[0]).toBe(`[Bước] ${label}`);
    }
  });

  it('`wait` — buoc IM LANG NHAT — nay cung noi duoc no dang lam gi', async () => {
    // Truoc ban nay `wait` khong in gi ca. Tren tab Logs cua mot run 1 phut 26 giay, doan dai
    // nhat cua lan chay la mot khoang trong khong giai thich.
    const { fns } = await register(SALES_HANDOFF_FOLLOWUP_KEY);
    const lines: string[] = [];

    await fns.get('wait')!({ entityId: 'WI-1', destination: 'x' }, stubCtx(lines)).catch(
      () => undefined,
    );

    expect(lines).toContain('[Bước] Chờ đến hạn nhắc');
  });

  it('KHONG lam do buoc khi `ctx` khong co logger', async () => {
    const { fns } = await register(SALES_HANDOFF_FOLLOWUP_KEY);

    // `load-state` cua mot ctx khong logger: van chay toi cho no that bai VI NGHIEP VU
    // (khong co dich den), khong that bai vi mot cai nhan.
    const ctx = { additionalMetadata: () => ({}), retryCount: () => 0 };
    await expect(
      fns.get('load-state')!({ entityId: 'WI-1', destination: 'khong-co' }, ctx),
    ).rejects.toThrow(/dich den|destination/i);
  });

  it('RIENG TU: khong mot mo ta nao mang PII, bi mat hay noi dung hoi thoai', async () => {
    const sales = await register(SALES_HANDOFF_FOLLOWUP_KEY);
    const integration = await register(INTEGRATION_HANDOFF_KEY);

    for (const spec of [...sales.specs, ...integration.specs]) {
      const description = spec.description ?? '';
      // Mo ta la van ban TINH viet tay — khong noi chuoi tu du lieu chay. Bai nay khoa dieu do:
      // khong SDT, khong email, khong khoa/token, khong dia chi.
      expect(description).not.toMatch(/(?:\+84|0)(?:[\s.-]?\d){8,10}/);
      expect(description).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(description.toLowerCase()).not.toMatch(
        /token|password|api[_-]?key|bearer|authorization/,
      );
    }
  });
});

/** `ctx` toi thieu cua Hatchet: du de mot buoc chay toi cho no that bai VI NGHIEP VU. */
function stubCtx(lines: string[]) {
  return {
    logger: {
      info: (message: string) => {
        lines.push(message);
      },
    },
    additionalMetadata: () => ({}),
    retryCount: () => 0,
    parentOutput: () => Promise.resolve({ stillPending: false, waitSeconds: 0, baseUrl: '' }),
    sleepFor: () => Promise.resolve(),
  };
}
