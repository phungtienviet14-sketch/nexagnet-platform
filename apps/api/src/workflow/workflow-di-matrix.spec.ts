import { NestFactory } from '@nestjs/core';
import { resetTenantCache } from '@netviet/tenant';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import { WorkflowEnginePort } from './workflow-engine.port.js';
import { WorkflowHandoffService } from './workflow-handoff.service.js';
import { WorkflowScheduler } from './workflow.module.js';

/**
 * W9 — MA TRAN DI TREN DO THI NEST THAT.
 *
 * ---------------------------------------------------------------------------
 * Ba cau hinh khach, ba KET CUC KHAC NHAU, va su khac nhau do phai la CO CHU DICH:
 *
 *   A  khach khong khai workflow      -> boot BINH THUONG, khong doi token, ban giao `skipped`
 *   B  khach bat, du cau hinh         -> boot, cong la adapter that, dispatcher co mat
 *   C  khach bat, THIEU token         -> boot NEM ngay, khong am tham roi ve `none`
 *
 * Cau C la cau quan trong nhat va cung de lam sai nhat. Mot he thong "chiu loi" bang cach roi
 * ve `none` khi thieu token se boot xanh, chay xanh, va lang le KHONG BAO GIO ban giao gi —
 * dung che do hong ma `NoopErpAdapter` da tung day ta mot lan.
 *
 * KHONG can ha tang: khong Postgres, khong engine. Cong Hatchet khoi tao TRE, nen boot khong mo
 * ket noi nao. Neu mot ngay bai nay treo hoac doi mang, do la dau hieu boot da bat dau noi ra
 * ngoai — va do se la mot hoi quy that su.
 */

const WORKFLOW_FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/tenant/src/__tests__/fixtures/workflow-enabled',
);

interface Ctx {
  get: (token: never, options?: object) => unknown;
  close: () => Promise<void>;
}

describe('W9 — ma tran DI theo goi khach, tren do thi Nest that', () => {
  const saved = { ...process.env };
  let context: Ctx | undefined;

  beforeEach(() => {
    process.env.PERSISTENCE = 'memory';
    process.env.CHANNEL_MODE = 'mock';
    resetTenantCache();
  });

  afterEach(async () => {
    await context?.close();
    context = undefined;
    process.env = { ...saved };
    resetTenantCache();
  });

  /**
   * `abortOnError: false` la BAT BUOC: mac dinh cua Nest khi do thi DI hong la `process.abort()`,
   * no giet luon worker cua vitest nen bai C se lam sap ca file thay vi do mot khang dinh.
   */
  async function boot(): Promise<Ctx> {
    const { AppModule } = await import('../app.module.js');
    return (await NestFactory.createApplicationContext(await AppModule.forRoot(), {
      logger: ['error'],
      abortOnError: false,
    })) as never as Ctx;
  }

  const resolvable = (ctx: Ctx, token: unknown): boolean => {
    try {
      ctx.get(token as never, { strict: false });
      return true;
    } catch {
      return false;
    }
  };

  // ------------------------------------------------------------------- A

  it('A — khach KHONG khai workflow: boot binh thuong, khong doi token, ban giao bao dung ly do', async () => {
    // Goi khach mac dinh cua bo test (`ultty`) khong khai `integrations.workflowEngine`.
    delete process.env.TENANT_DIR;
    process.env.TENANT = 'ultty';
    // Va KHONG co token. Day la mot nua cua khang dinh: khach khong dung engine thi khong phai
    // cau hinh gi ca — nguoc lai thi moi khach deu phai mang mot bien ma ho khong dung toi.
    delete process.env.WORKFLOW_ENGINE_TOKEN;
    resetTenantCache();

    context = await boot();

    const port = context.get(WorkflowEnginePort as never, { strict: false });
    expect(port).toBeInstanceOf(DisabledWorkflowEngineAdapter);

    // Ban giao tra ve MA LY DO dung, khong phai chi "khong no". Phan biet duoc "khach nay khong
    // chay khuon nay" voi "co gi do hong" la ca diem cua `HandoffReason`.
    const handoff = context.get(WorkflowHandoffService as never, {
      strict: false,
    }) as WorkflowHandoffService;
    const result = await handoff.handoff({
      workflowKey: 'integration-handoff',
      operation: 'sync',
      entityType: 'work-item',
      entityId: 'WI-di-a',
    });
    expect(result.outcome).toBe('skipped');
    expect(result.reason).toBe('NO_TENANT_BINDING');
  }, 90_000);

  // ------------------------------------------------------------------- B

  it('B — khach BAT va du cau hinh: cong la adapter that, dispatcher va bo dem co mat', async () => {
    delete process.env.TENANT;
    process.env.TENANT_DIR = WORKFLOW_FIXTURE;
    process.env.WORKFLOW_ENGINE_TOKEN = 'token-gia-khong-bao-gio-duoc-dung';
    resetTenantCache();

    context = await boot();

    const port = context.get(WorkflowEnginePort as never, { strict: false });
    // KHONG phai ban vo hieu hoa — do la toan bo khac biet giua A va B.
    expect(port).not.toBeInstanceOf(DisabledWorkflowEngineAdapter);
    expect((port as object).constructor.name).toBe('HatchetWorkflowEngineAdapter');

    // Duong ban giao co du ca ba mat xich phia Nexagnet.
    expect(resolvable(context, WorkflowHandoffService)).toBe(true);
    expect(resolvable(context, WorkflowDispatcher)).toBe(true);
    expect(resolvable(context, WorkflowScheduler)).toBe(true);
  }, 90_000);

  // ------------------------------------------------------------------- C

  it('C — khach BAT nhung THIEU token: boot NEM ngay, khong am tham roi ve `none`', async () => {
    delete process.env.TENANT;
    process.env.TENANT_DIR = WORKFLOW_FIXTURE;
    // `credentialRef` cua goi khach tro toi bien nay. Khong dat no = ha tang chua cau hinh xong.
    delete process.env.WORKFLOW_ENGINE_TOKEN;
    resetTenantCache();

    // Fail-fast, va thong bao phai NOI RA phai lam gi. Mot he thong roi ve `none` o day se boot
    // xanh roi lang le khong ban giao gi — hong mot cach im lang la hong te nhat.
    await expect(boot()).rejects.toThrow(/WORKFLOW_ENGINE_TOKEN_MISSING/);
  }, 90_000);
});
