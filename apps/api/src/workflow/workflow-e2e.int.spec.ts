import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * E2E QUA BIEN PRODUCTION THAT — khong duoc phep goi tat.
 *
 * Chuoi phai di TRON:
 *
 *   AppModule.forRoot() that  ->  WorkflowHandoffService.handoff()  ->  outbox giao dich
 *   ->  WorkflowScheduler tick THAT  ->  WorkflowDispatcher  ->  WorkflowEnginePort
 *   ->  adapter Hatchet  ->  engine  ->  TIEN TRINH WORKER RIENG  ->  integration-handoff.v1
 *   ->  diem cuoi co kiem soat  ->  xong
 *
 * DIEU CAM: goi thang `hatchet.runNoWait()` tu test roi goi do la E2E. Lam vay se bo qua dung
 * bon lop dang duoc kiem — rang buoc khach, khoa thao tac, bien gioi rieng tu, va outbox — tuc
 * la bo qua toan bo phan co the hong that.
 *
 * CAN HA TANG THAT nen mac dinh BO QUA, giong `prisma-campaign.repository.int.spec.ts`:
 *
 *   docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
 *   RUN_WORKFLOW_IT=1 pnpm --filter @netviet/api exec vitest run src/workflow/workflow-e2e
 *
 * Bien bat buoc: WORKFLOW_ENGINE_TOKEN (+ HOST_PORT/TLS_STRATEGY neu khong dung mac dinh).
 */

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, '../..');
const WORKFLOW_FIXTURE = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/workflow-enabled',
);

/**
 * Worker mat ~38 giay de dang ky xong tren may dev (do duoc 22/08/2026). Moi thoi han duoi day
 * lay tu con so do chu khong phai tu cam giac — va chinh no la con so phai vao `start_period`
 * cua healthcheck luc viet compose.
 */
const WORKER_READY_TIMEOUT_MS = 120_000;
const RUN_COMPLETE_TIMEOUT_MS = 90_000;

// ------------------------------------------------------- diem cuoi co kiem soat

interface EndpointCall {
  readonly idempotencyKey: string | null;
  readonly traceparent: string | null;
  readonly body: Record<string, unknown>;
  readonly attempt: number;
}

/**
 * He ngoai GIA LAP nhung la mot may chu HTTP THAT — no phai tra 500/429/treo theo yeu cau de
 * chung minh retry chay that chu khong phai chi doc tai lieu. Dem theo khoa idempotency de do
 * duoc "mot tac dung co bi ap dung hai lan khong".
 */
class ProofEndpoint {
  private server?: Server;
  readonly calls: EndpointCall[] = [];
  private readonly attemptsByKey = new Map<string, number>();
  /** Doi mode giua chung de kich ban hong tai lap duoc ma khong phai dung may chu. */
  mode: 'ok' | 'fail_then_ok' | 'rate_limited' | 'timeout' = 'ok';
  failTimes = 2;

  async listen(): Promise<number> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const key = String(req.headers['idempotency-key'] ?? 'no-key');
        const attempt = (this.attemptsByKey.get(key) ?? 0) + 1;
        this.attemptsByKey.set(key, attempt);
        this.calls.push({
          idempotencyKey: (req.headers['idempotency-key'] as string) ?? null,
          traceparent: (req.headers.traceparent as string) ?? null,
          body: JSON.parse(raw || '{}') as Record<string, unknown>,
          attempt,
        });

        if (this.mode === 'timeout') return; // khong tra loi — de ben goi tu het gio
        if (this.mode === 'rate_limited') {
          res.writeHead(429).end(JSON.stringify({ error: 'RATE_LIMITED' }));
          return;
        }
        if (this.mode === 'fail_then_ok' && attempt <= this.failTimes) {
          res.writeHead(500).end(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ externalRef: `EXT-${attempt}` }));
      });
    });

    await new Promise<void>((done) => {
      this.server!.listen(0, '127.0.0.1', done);
    });
    return (this.server!.address() as AddressInfo).port;
  }

  attemptsFor(key: string): number {
    return this.attemptsByKey.get(key) ?? 0;
  }

  async close(): Promise<void> {
    await new Promise<void>((done) => {
      this.server?.close(() => done());
    });
  }
}

// ---------------------------------------------------------- tien trinh worker

/**
 * Tien trinh worker duoi quyen kiem soat cua test: len duoc, tat duoc, GIET duoc.
 * Khuon lay tu `tools/poc-workflow-engine/src/version-spike.ts` — no da chay that.
 */
class WorkerProcess {
  private child?: ChildProcess;
  private output = '';

  constructor(
    private readonly version: string,
    private readonly env: NodeJS.ProcessEnv,
  ) {}

  async start(): Promise<void> {
    const child = spawn(
      process.execPath,
      ['--import', '@swc-node/register/esm-register', 'src/workflow/worker-main.ts'],
      {
        cwd: apiDir,
        env: { ...this.env, WORKFLOW_WORKER_VERSION: this.version },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const collect = (chunk: Buffer): void => {
      this.output += chunk.toString();
    };
    // `stdio` da khai bao 'pipe' cho ca hai, nen hai luong nay chac chan co mat.
    child.stdout!.on('data', collect);
    child.stderr!.on('data', collect);
    this.child = child;

    // Cho DONG READY that su, khong `sleep` mot con so doan mo. Do la giao keo giua worker va
    // test — worker chi in dong nay sau khi `waitUntilReady()` cua SDK tra ve.
    await waitFor(
      () => this.output.includes(`READY workflow=integration-handoff.${this.version}`),
      WORKER_READY_TIMEOUT_MS,
      () => `worker ${this.version} khong bao READY. Output:\n${this.output.slice(-2000)}`,
    );
  }

  /** Tat SACH — duong ma `docker stop` di qua. */
  async stop(): Promise<void> {
    if (!this.child) return;
    this.child.kill('SIGTERM');
    await this.exited();
  }

  /** GIET — mo phong container bi OOM hoac VM mat dien. Khong co co hoi don dep. */
  async kill(): Promise<void> {
    if (!this.child) return;
    this.child.kill('SIGKILL');
    await this.exited();
  }

  private async exited(): Promise<void> {
    const child = this.child;
    await new Promise<void>((done) => {
      if (!child || child.exitCode !== null) {
        done();
        return;
      }
      child.once('exit', () => done());
    });
    this.child = undefined;
  }
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  describeFailure: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`HET GIO sau ${timeoutMs}ms: ${describeFailure()}`);
}

// ------------------------------------------------------------------ bo test

interface HandoffApi {
  handoff: (request: {
    workflowKey: string;
    operation: string;
    entityType: string;
    entityId: string;
  }) => Promise<{ outcome: string; reason: string; operationKey?: string }>;
}

describe.runIf(process.env.RUN_WORKFLOW_IT === '1')(
  'E2E: Nexagnet that -> outbox -> engine -> worker rieng -> diem cuoi',
  () => {
    const endpoint = new ProofEndpoint();
    let worker: WorkerProcess;
    let appContext: { get: (token: never, opts?: object) => unknown; close: () => Promise<void> };
    let handoff: HandoffApi;

    beforeAll(async () => {
      const port = await endpoint.listen();

      const engineEnv: NodeJS.ProcessEnv = {
        ...process.env,
        TENANT_DIR: WORKFLOW_FIXTURE,
        PERSISTENCE: 'memory',
        CHANNEL_MODE: 'mock',
        NODE_ENV: 'test',
        WORKFLOW_ENGINE_HOST_PORT: process.env.WORKFLOW_ENGINE_HOST_PORT ?? 'localhost:7744',
        WORKFLOW_ENGINE_TLS_STRATEGY: process.env.WORKFLOW_ENGINE_TLS_STRATEGY ?? 'none',
        WORKFLOW_DESTINATION_PROOF_ENDPOINT: `http://127.0.0.1:${port}/handoff`,
      };
      delete engineEnv.TENANT;

      worker = new WorkerProcess('v1', engineEnv);
      await worker.start();

      // Boot AppModule THAT — nap dong SAU khi da dat bien, vi `app.module.ts` keo theo loader
      // goi khach va loader do doc `process.env.TENANT` NGAY LUC IMPORT.
      Object.assign(process.env, engineEnv);
      delete process.env.TENANT;
      const { resetTenantCache } = await import('@netviet/tenant');
      resetTenantCache();
      const { NestFactory } = await import('@nestjs/core');
      const { AppModule } = await import('../app.module.js');
      const { WorkflowHandoffService } = await import('./workflow-handoff.service.js');

      appContext = (await NestFactory.createApplicationContext(await AppModule.forRoot(), {
        logger: ['error'],
        abortOnError: false,
      })) as never;
      handoff = appContext.get(WorkflowHandoffService as never, { strict: false }) as HandoffApi;
    }, 240_000);

    afterAll(async () => {
      await worker?.stop();
      await appContext?.close();
      await endpoint.close();
    }, 60_000);

    it('mot su kien nghiep vu di tron chuoi va ket thuc o he ngoai', async () => {
      endpoint.mode = 'ok';

      // Vao bang CUA CHINH: cau noi duy nhat. Khong cham outbox, khong cham dispatcher, khong
      // cham engine — day la dung API ma mot service nghiep vu se goi.
      const result = await handoff.handoff({
        workflowKey: 'integration-handoff',
        operation: 'sync',
        entityType: 'work-item',
        entityId: `WI-${Date.now()}`,
      });

      expect(result.outcome).toBe('queued');
      expect(result.operationKey).toBeDefined();

      // Tu day tro di KHONG con test dieu khien gi nua: `WorkflowScheduler` that danh thuc
      // dispatcher, dispatcher goi engine, engine giao cho worker. Test chi ngoi doi ket qua
      // hien ra o he ngoai.
      await waitFor(
        () => endpoint.calls.some((call) => call.idempotencyKey === result.operationKey),
        RUN_COMPLETE_TIMEOUT_MS,
        () => `he ngoai chua nhan duoc ban giao. Da nhan: ${JSON.stringify(endpoint.calls)}`,
      );

      const call = endpoint.calls.find((c) => c.idempotencyKey === result.operationKey)!;

      // Khoa thao tac DUNG LAI duoc o worker phai TRUNG khoa cau noi sinh ra. Day la bang chung
      // tinh tat dinh di duoc qua ba tien trinh va mot engine.
      expect(call.idempotencyKey).toBe(result.operationKey);
      // Soi day W3C khong dut.
      expect(call.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      // Va bien gioi rieng tu giu nguyen o dau ben kia: chi tham chieu, khong thuc the.
      expect(Object.keys(call.body).sort()).toEqual(
        ['destination', 'entityId', 'entityType', 'operation', 'operationVersion', 'tenant'].sort(),
      );
    }, 180_000);

    it('he ngoai 500 hai lan roi OK -> engine THU LAI, va moi lan mang CUNG mot khoa', async () => {
      endpoint.mode = 'fail_then_ok';
      endpoint.failTimes = 2;

      const result = await handoff.handoff({
        workflowKey: 'integration-handoff',
        operation: 'sync',
        entityType: 'work-item',
        entityId: `WI-retry-${Date.now()}`,
      });
      const key = result.operationKey!;

      await waitFor(
        () => endpoint.attemptsFor(key) >= 3,
        RUN_COMPLETE_TIMEOUT_MS,
        () => `moi thay ${endpoint.attemptsFor(key)} lan thu cho ${key}`,
      );

      // Ba lan NHAN, nhung ca ba mang CUNG mot khoa idempotency — nen he ngoai co du thong tin
      // de chi tao mot ban ghi. Do la toan bo diem cua `operation-key.ts`.
      const seen = endpoint.calls.filter((c) => c.idempotencyKey === key);
      expect(seen.length).toBeGreaterThanOrEqual(3);
      expect(new Set(seen.map((c) => c.idempotencyKey)).size).toBe(1);
    }, 180_000);
  },
);
