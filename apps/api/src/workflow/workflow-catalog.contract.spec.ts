import { afterEach, describe, expect, it, vi } from 'vitest';
import * as tenant from '@netviet/tenant';
import { HatchetWorkflowWorker } from './hatchet/hatchet-workflow-worker.adapter.js';
import type { HatchetClientType } from './hatchet/hatchet-sdk.js';
import { NOOP_WORKER_TRACE_BRIDGE } from '../observability/worker-trace-bridge.js';
import { describeWorkflow } from './workflow-catalog.js';
import { INTEGRATION_HANDOFF_KEY, SALES_HANDOFF_FOLLOWUP_KEY } from './workflow-registry.js';
import type { WorkerRegistration } from './worker-registration.js';

/**
 * HOP DONG GIUA "TEN BUOC MAY" VA "NHAN NGUOI DOC".
 *
 * Bat bien: moi buoc ma worker DANG KY VOI ENGINE deu phai co mot nhan tieng Viet trong danh ba,
 * va nguoc lai danh ba khong duoc chua mot buoc khong ai chay.
 *
 * VI SAO PHAI LA MOT BAI KIEM chu khong phai mot lan doc code cho ky:
 *
 * Hai danh sach nay nam o hai tep khac nhau va doi vi hai ly do khac nhau — mot ben doi khi ai
 * do them mot buoc thuc thi, mot ben doi khi ai do sua cau chu. Chung se troi khoi nhau, va khi
 * troi thi KHONG CO GI DO: console van chay, chi la no hien mot chuoi may (`wait`) o giua nhung
 * cai ten tieng Viet, dung luc nguoi ta dang tim mot loi luc 2 gio sang.
 *
 * Doan nay DA suyt xay ra: ban thiet ke goi buoc do la `durable-wait`, con code dang ky no la
 * `wait`. Bai kiem nay la thu bat duoc dieu do.
 *
 * KHONG CAN ENGINE THAT: lop adapter chi DANG KY khuon. `hatchet.workflow()` va `hatchet.worker()`
 * duoc thay bang ban gia ghi lai ten cac buoc — cung khuon voi
 * `hatchet-workflow-worker.trace.spec.ts`, them `durableTask` vi khuon nghiep vu co mot buoc ngu.
 */

/** Ban gia cua SDK: khong noi mang, chi GHI LAI TEN moi buoc duoc dang ky, dung thu tu. */
function fakeHatchet(): { client: HatchetClientType; taskNames: string[] } {
  const taskNames: string[] = [];
  const register = (spec: { name: string }): { _name: string } => {
    taskNames.push(spec.name);
    return { _name: spec.name };
  };
  const workflow = { task: register, durableTask: register };
  const client = {
    workflow: () => workflow,
    worker: () =>
      Promise.resolve({
        // Giu dung tinh chat cua SDK that: `start()` chi giai quyet khi worker DUNG.
        start: () => new Promise<void>(() => undefined),
        stop: () => Promise.resolve(),
        waitUntilReady: () => Promise.resolve(),
      }),
  };
  return { client: client as unknown as HatchetClientType, taskNames };
}

async function registeredTaskNames(registration: WorkerRegistration): Promise<string[]> {
  const { client, taskNames } = fakeHatchet();
  const worker = new HatchetWorkflowWorker(
    registration,
    { token: 'test-token' },
    {},
    { client, traceBridge: NOOP_WORKER_TRACE_BRIDGE },
  );
  await worker.start();
  return taskNames;
}

/** Nguong doc tu goi khach LUC DANG KY khuon. Mock de bai kiem khong phu thuoc goi khach nao. */
function stubFollowupPolicy(): void {
  vi.spyOn(tenant, 'tenantSalesHandoffFollowup').mockReturnValue({
    enabled: true,
    remindAfterSeconds: 90,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('danh ba <-> buoc that: sales-handoff-followup', () => {
  it('moi buoc worker dang ky deu co nhan tieng Viet, dung thu tu chay', async () => {
    stubFollowupPolicy();

    const names = await registeredTaskNames({
      workflowKey: SALES_HANDOFF_FOLLOWUP_KEY,
      workflowVersion: 'v1',
      engineName: 'sales-handoff-followup.v1',
      workerName: 'workflow-worker-sales-handoff-followup-v1',
    });

    expect(names).toEqual(describeWorkflow(SALES_HANDOFF_FOLLOWUP_KEY).steps.map((s) => s.key));
  });

  it('buoc ngu ten that la `wait` — danh ba KHONG duoc doi no cho de doc', async () => {
    stubFollowupPolicy();

    const names = await registeredTaskNames({
      workflowKey: SALES_HANDOFF_FOLLOWUP_KEY,
      workflowVersion: 'v1',
      engineName: 'sales-handoff-followup.v1',
      workerName: 'workflow-worker-sales-handoff-followup-v1',
    });

    expect(names).toContain('wait');
    expect(names).not.toContain('durable-wait');
  });
});

describe('danh ba <-> buoc that: integration-handoff', () => {
  /**
   * v2 dang ky CA BON buoc; v1 bo `preflight`. Danh ba giu ca bon va do la co y — no mo ta KHUON,
   * khong mo ta mot phien ban. Nen o day khang dinh QUAN HE BAO HAM chu khong phai bang nhau.
   */
  it('buoc cua v2 la tap con cua danh ba', async () => {
    const names = await registeredTaskNames({
      workflowKey: INTEGRATION_HANDOFF_KEY,
      workflowVersion: 'v2',
      engineName: 'integration-handoff.v2',
      workerName: 'workflow-worker-integration-handoff-v2',
    });

    const known = describeWorkflow(INTEGRATION_HANDOFF_KEY).steps.map((s) => s.key);
    for (const name of names) expect(known, `buoc '${name}' chua co nhan`).toContain(name);
    expect(names).toEqual(['resolve', 'preflight', 'dispatch', 'settle']);
  });

  it('v1 khong co `preflight`, va danh ba van phu duoc no', async () => {
    const names = await registeredTaskNames({
      workflowKey: INTEGRATION_HANDOFF_KEY,
      workflowVersion: 'v1',
      engineName: 'integration-handoff.v1',
      workerName: 'workflow-worker-integration-handoff-v1',
    });

    expect(names).toEqual(['resolve', 'dispatch', 'settle']);
    const known = describeWorkflow(INTEGRATION_HANDOFF_KEY).steps.map((s) => s.key);
    for (const name of names) expect(known).toContain(name);
  });

  it('danh ba khong chua buoc nao khong ai chay', async () => {
    const v2 = await registeredTaskNames({
      workflowKey: INTEGRATION_HANDOFF_KEY,
      workflowVersion: 'v2',
      engineName: 'integration-handoff.v2',
      workerName: 'workflow-worker-integration-handoff-v2',
    });

    for (const step of describeWorkflow(INTEGRATION_HANDOFF_KEY).steps) {
      expect(v2, `danh ba khai buoc '${step.key}' ma khong khuon nao dang ky`).toContain(step.key);
    }
  });
});
