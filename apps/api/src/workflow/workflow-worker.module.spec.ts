import { NestFactory } from '@nestjs/core';
import { resetTenantCache } from '@netviet/tenant';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CampaignScheduler } from '../campaigns/campaign.scheduler.js';
import { ZaloUserClient } from '../channels/zalo-user.client.js';
import { BotPoller } from '../ingest/bot-poller.js';
import { ZcaListener } from '../ingest/zca-listener.js';
import { WorkflowScheduler } from './workflow.module.js';
import { WorkflowWorkerModule } from './workflow-worker.module.js';
import { WorkflowWorkerService } from './workflow-worker.service.js';
import { WORKFLOW_WORKER_VERSION_ENV } from './worker-registration.js';

/**
 * TIEN TRINH WORKER KHONG DUOC BOOT `AppModule`.
 *
 * Day khong phai so thich kien truc — no la hau qua do duoc. Nam lop trong repo nay lam viec
 * that trong `onModuleInit`:
 *
 *   ZcaListener · ZaloUserClient · BotPoller · CampaignScheduler · WorkflowScheduler
 *
 * Neu worker boot `AppModule`, tien trinh worker se DONG THOI:
 *   · mo mot listener zca THU HAI tren cung tai khoan Zalo — ma mot tai khoan chi chiu duoc MOT
 *     listener, nen listener cua `api` bi da ra. Kenh doc chinh cua GD1 chet vi mot container
 *     phu khoi dong;
 *   · chay mot campaign scheduler thu hai;
 *   · chay mot workflow dispatcher thu hai.
 *
 * Bon khang dinh duoi day la cai chan khong cho ai do "tien tay" doi `WorkflowWorkerModule`
 * thanh `AppModule` de "dung lai cho tien".
 */
const WORKFLOW_FIXTURE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/tenant/src/__tests__/fixtures/workflow-enabled',
);

describe('WorkflowWorkerModule — module HEP cho tien trinh worker', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env[WORKFLOW_WORKER_VERSION_ENV] = 'v1';
    process.env.PERSISTENCE = 'memory';
    // Goi khach CO BAT engine — de bai test nay di dung duong ma tien trinh worker that se di.
    delete process.env.TENANT;
    process.env.TENANT_DIR = WORKFLOW_FIXTURE;
    resetTenantCache();
    // Token gia: boot KHONG duoc mo ket noi nao, nen gia tri nay khong bao gio duoc dung toi.
    // Neu mot ngay test nay treo hoac doi mang, do la dau hieu boot da bat dau noi ra ngoai.
    process.env.WORKFLOW_ENGINE_TOKEN = 'fixture-token-khong-dung-that';
  });

  afterEach(() => {
    process.env = { ...saved };
    resetTenantCache();
  });

  /**
   * `abortOnError: false` la BAT BUOC o day, khong phai tuy chon cho dep.
   *
   * Mac dinh cua Nest khi do thi DI hong la `process.abort()` — no giet luon worker cua vitest,
   * nen bai test cuoi (thieu phien ban -> phai NEM) se lam sap ca file thay vi do mot khang dinh.
   * Da vap dung vao dieu do khi viet bai nay.
   */
  async function bootWorker() {
    return NestFactory.createApplicationContext(WorkflowWorkerModule, {
      logger: ['error'],
      abortOnError: false,
    });
  }

  const resolvable = (context: { get: (token: never, options: object) => unknown }, token: unknown): boolean => {
    try {
      context.get(token as never, { strict: false });
      return true;
    } catch {
      return false;
    }
  };

  it('boot duoc va lay ra duoc WorkflowWorkerService', async () => {
    const context = await bootWorker();
    expect(context.get(WorkflowWorkerService)).toBeInstanceOf(WorkflowWorkerService);
    await context.close();
  }, 60_000);

  it('KHONG keo theo listener Zalo — mot tai khoan chi chiu duoc mot listener', async () => {
    const context = await bootWorker();

    expect(resolvable(context, ZcaListener)).toBe(false);
    expect(resolvable(context, ZaloUserClient)).toBe(false);
    // `BotPoller` co trong binh luan cua module tu dau nhung KHONG co trong khang dinh nao —
    // tuc la no duoc bao ve bang mot cau van, va mot cau van thi khong do.
    expect(resolvable(context, BotPoller)).toBe(false);

    await context.close();
  }, 60_000);

  it('KHONG keo theo campaign scheduler hay workflow dispatcher', async () => {
    const context = await bootWorker();

    // Dispatcher la viec cua tien trinh API. Hai dispatcher khong lam hong du lieu (co lease +
    // khoa duy nhat) nhung chung khong co ly do gi de ton tai, va chung lam log kho doc gap doi.
    expect(resolvable(context, WorkflowScheduler)).toBe(false);
    expect(resolvable(context, CampaignScheduler)).toBe(false);

    await context.close();
  }, 60_000);

  it('boot NEM ngay khi thieu phien ban — khong de tien trinh song ma khong dang ky gi', async () => {
    delete process.env[WORKFLOW_WORKER_VERSION_ENV];
    // Fail-fast la co y: mot worker song nhung khong dang ky workflow nao la truong hop TE NHAT —
    // container xanh, healthcheck xanh, va moi run nam cho mai mai.
    //
    // THU GON KET CUC TRUOC KHI KHANG DINH — khong dung `expect(bootWorker()).rejects`.
    // Neu mot ngay boot KHONG con nem (vi du them mot mac dinh cho phien ban), khuon `.rejects`
    // se dinh ca `NestApplicationContext` vao `actual` cua AssertionError, va vitest tuan tu hoa
    // no thanh mot cu OOM 4 GB thay vi mot dong khang dinh doc duoc. Da xay ra that 23/08/2026 —
    // xem `nest-context-assertion.contract.spec.ts`.
    let message = 'boot KHONG nem';
    try {
      const booted = await bootWorker();
      await booted.close();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/WORKFLOW_WORKER_VERSION/);
  }, 60_000);

  /**
   * HOP DONG THEO HINH DANG, khong theo danh sach ten.
   *
   * Bon khang dinh o tren giu duoc bon lop MA TA DA BIET TEN. Chung khong giu duoc lop thu sau:
   * neu mai co nguoi them mot service lam viec that trong `onModuleInit` roi import nham vao day,
   * moi bai tren van xanh va tien trinh worker lai lang le mo mot vong lap thu hai tren stack.
   *
   * Bai duoi day hoi mot cau khac: do thi DI cua module worker co DUNG BANG danh sach duoc phep
   * khong. Them mot provider vao `WorkflowWorkerModule` se lam bai nay DO — va do la y muon:
   * viec them do phai la mot quyet dinh duoc noi ra, khong phai mot dong import tien tay.
   */
  it('do thi DI cua module worker DUNG BANG danh sach duoc phep — them provider la phai noi ra', async () => {
    const context = await bootWorker();

    // Doc thang tu container cua Nest: day la danh sach THAT, khong phai danh sach ta nho.
    const container = (context as unknown as { container: { getModules: () => Map<unknown, {
      metatype?: { name?: string };
      providers: Map<unknown, unknown>;
    }> } }).container;

    const found = new Set<string>();
    for (const [, module] of container.getModules()) {
      if (module.metatype?.name !== 'WorkflowWorkerModule') continue;
      for (const [token] of module.providers) {
        found.add(typeof token === 'symbol' ? String(token) : String((token as { name?: string })?.name ?? token));
      }
    }

    // MOT tien trinh worker chi can dung nhung thu nay. Khong hon.
    const allowed = new Set([
      'WorkflowWorkerService',
      'Symbol(WORKFLOW_WORKER_REGISTRATION)',
      'Symbol(WORKFLOW_WORKER_ENGINE)',
      'Symbol(WORKFLOW_WORKER_CREDENTIALS)',
      // Nest tu them chinh module va cac tro giup noi bo cua no vao danh sach provider.
      'WorkflowWorkerModule',
      'ModuleRef',
      'ApplicationConfig',
      'Reflector',
      'SerializedGraph',
      'LazyModuleLoader',
    ]);

    // CHONG XANH GIA: neu vong lap tren khong khop module nao thi `found` rong va phep tru
    // duoi day cho ra rong — bai test se "xanh" ma khong do gi. Chan bang cach doi thay dung
    // cac provider ma ta BIET chac phai co.
    expect(found).toContain('WorkflowWorkerService');
    expect(found).toContain('Symbol(WORKFLOW_WORKER_REGISTRATION)');

    const unexpected = [...found].filter((name) => !allowed.has(name));
    expect(unexpected).toEqual([]);
  }, 60_000);
});
