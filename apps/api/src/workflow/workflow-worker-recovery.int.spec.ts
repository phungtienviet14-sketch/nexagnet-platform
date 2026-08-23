import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaWorkflowOutboxRepository } from './prisma-workflow-outbox.repository.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import { createWorkflowEngineAdapter } from './workflow-engine.adapter.js';
import type { WorkflowEnginePort } from './workflow-engine.port.js';
import {
  CRASH_WINDOW_CHAT_ID,
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  baseEnv,
  bootAppContext,
  runCrashWindowChild,
  waitFor,
  type BootedApp,
} from './__tests__/workflow-it.harness.js';

/**
 * W6/W7 — WORKER BI GIET GIUA CHUNG, va HAI WORKER CUNG MOT PHIEN BAN.
 *
 * ---------------------------------------------------------------------------
 * HAI CON SO PHAI BAO RIENG, va ca file nay ton tai de tach chung ra:
 *
 *   so lan HE NGOAI BI GOI        (`postsFor`)   — tang giao van
 *   so BAN GHI he ngoai TAO RA    (`appliedFor`) — tang nghiep vu
 *
 * Hatchet tu cong bo *at-least-once*. Nghia la mot task DA chay xong mot nua van co the chay
 * lai tren worker khac khi worker cu bien mat. Neu chi bao mot con so thi bao cao se noi doi
 * theo mot trong hai chieu: hoac giau mat viec he ngoai bi goi hai lan, hoac bao dong gia rang
 * co hai don.
 *
 * KHONG tuyen bo "buoc da xong thi khong chay lai". Do la dieu Hatchet KHONG hua, va thu that
 * su bao ve don khoi bi nhan doi la `Idempotency-Key` cua Nexagnet chu khong phai engine.
 *
 *   docker compose -f docker-compose.yml up -d postgres
 *   docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
 *   RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=… \
 *     pnpm --filter @netviet/api exec vitest run src/workflow/workflow-worker-recovery
 */

const LEASE_SECONDS = 60;
/**
 * Hatchet phai phat hien worker da chet qua nhip tim roi moi giao lai viec. Do khong phai tuc
 * thi, va con so nay la thoi gian CHO chu khong phai mot con so cho dep.
 */
const WORKER_FAILOVER_TIMEOUT_MS = 240_000;

describe.runIf(process.env.RUN_PRISMA_IT === '1' && process.env.RUN_WORKFLOW_IT === '1')(
  'W6/W7 — worker chet giua chung, va hai worker cung phien ban',
  () => {
    const endpoint = new ProofEndpoint();
    const prisma = new PrismaService();
    const outbox = new PrismaWorkflowOutboxRepository(prisma);
    let engine: WorkflowEnginePort;
    let childEnv: NodeJS.ProcessEnv;
    let endpointPort = 0;
    const workers: WorkerProcess[] = [];
    let app: BootedApp | undefined;

    async function cleanup(): Promise<void> {
      const orders = await prisma.order.findMany({
        where: { chatId: CRASH_WINDOW_CHAT_ID },
        select: { id: true },
      });
      const ids = orders.map((o) => o.id);
      if (ids.length > 0) {
        await prisma.workflowOutbox.deleteMany({ where: { entityId: { in: ids } } });
        await prisma.order.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.workflowOutbox.deleteMany({ where: { entityId: { startsWith: 'WI-w7-' } } });
    }

    function dispatcherFor(workerId: string): WorkflowDispatcher {
      return new WorkflowDispatcher(outbox, engine, { workerId, leaseSeconds: LEASE_SECONDS });
    }

    async function startWorker(label: string): Promise<WorkerProcess> {
      const worker = new WorkerProcess('v1', childEnv, { label });
      await worker.start();
      workers.push(worker);
      return worker;
    }

    beforeAll(async () => {
      endpointPort = await endpoint.listen();
      childEnv = baseEnv(WORKFLOW_FIXTURE, endpointPort, { PERSISTENCE: 'prisma' });
      engine = await createWorkflowEngineAdapter('hatchet', {
        token: process.env.WORKFLOW_ENGINE_TOKEN!,
        hostPort: process.env.WORKFLOW_ENGINE_HOST_PORT ?? 'localhost:7744',
        tlsStrategy: 'none',
      });
      await cleanup();
    }, 120_000);

    afterAll(async () => {
      for (const worker of workers) await worker.stop();
      await app?.context.close();
      await endpoint.close();
      await cleanup();
      await prisma.$disconnect();
    }, 180_000);

    // ------------------------------------------------------------------ W6

    it('worker bi kill -9 GIUA khi dang goi he ngoai -> run khong mat, worker moi chay tiep, MOT ban ghi', async () => {
      await cleanup();
      const victim = await startWorker('nan-nhan');

      // ① Mot run di vao `dispatch` va BI GIU o do. Tac dung phu DA XAY RA mot phan: he ngoai
      //    da nhan yeu cau va da dem no.
      endpoint.mode = 'hold';
      const child = await runCrashWindowChild([], childEnv);
      expect(child.outcome).toBe('COMMITTED');
      await dispatcherFor('w6-gui').tick(new Date());

      const row = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      expect(row!.status).toBe('dispatched');
      const engineRunId = row!.engineRunId!;

      await waitFor(
        () => endpoint.postsFor(child.operationKey) >= 1,
        RUN_COMPLETE_TIMEOUT_MS,
        () => 'run chua vao duoc buoc dispatch',
      );
      expect(endpoint.postsFor(child.operationKey)).toBe(1);
      // Chua AP DUNG: yeu cau dang bi giu, he ngoai chua tra loi, chua tao ban ghi nao.
      expect(endpoint.appliedFor(child.operationKey)).toBe(false);
      const traceparentBefore = endpoint.callsFor(child.operationKey)[0]!.traceparent;

      // ② GIET. Khong SIGTERM, khong don dep — mo phong container bi OOM hoac VM mat dien.
      await victim.kill();

      // ③ Worker MOI, CUNG phien ban. Day la dieu kien de run cu chay tiep duoc: engine dinh
      //    tuyen theo `actionId = <tenWorkflow>:<tenBuoc>`, va ten do mang phien ban.
      const successor = await startWorker('ke-nhiem');
      // He ngoai lan nay tra loi binh thuong. KHONG `release()` yeu cau cu: de nguyen no bi treo
      // dung nhu mot ket noi da chet cung worker, va de lan AP DUNG duy nhat den tu worker moi.
      endpoint.mode = 'ok';

      // ④ Run chay tiep va ket thuc.
      await waitFor(
        () => endpoint.appliedFor(child.operationKey),
        WORKER_FAILOVER_TIMEOUT_MS,
        () =>
          `run khong duoc chay tiep sau khi worker chet. posts=${endpoint.postsFor(child.operationKey)}`,
      );

      // ⑤ HAI CON SO, bao rieng:
      // he ngoai bi GOI it nhat hai lan (worker chet mot lan, worker moi mot lan)…
      expect(endpoint.postsFor(child.operationKey)).toBeGreaterThanOrEqual(2);
      // …nhung chi co MOT ban ghi, vi moi lan goi mang CUNG mot khoa thao tac.
      expect(endpoint.appliedFor(child.operationKey)).toBe(true);
      expect(new Set(endpoint.callsFor(child.operationKey).map((c) => c.idempotencyKey)).size).toBe(
        1,
      );

      // ⑥ KHOA THAO TAC KHONG DOI qua mot lan chet tien trinh. Worker moi DUNG LAI khoa tu input
      //    (`recomputeOperationKey`) chu khong nhan kem — nen day la bang chung tinh TAT DINH
      //    cua khoa, khong phai bang chung mot chuoi duoc chuyen tiep.
      expect(endpoint.callsFor(child.operationKey).at(-1)!.idempotencyKey).toBe(child.operationKey);
      // ⑦ Va soi trace khong dut qua lan chet do.
      expect(endpoint.callsFor(child.operationKey).at(-1)!.traceparent).toBe(traceparentBefore);

      // ⑧ Run khong mat khoi engine.
      expect(await engine.describeRun(engineRunId)).not.toBeNull();

      // ⑨ Buoc `dispatch` DA CHAY LAI tren worker moi — do chinh la ngu nghia at-least-once cua
      //    Hatchet, va `postsFor >= 2` o tren la bang chung truc tiep cua no. Ta GHI NHAN dieu do
      //    chu khong phu nhan; thu chan don bi nhan doi la khoa idempotency, khong phai engine.
      //
      //    KHONG do cac buoc khong co tac dung phu (`resolve`) bang cach dem dong log stdout:
      //    `ctx.logger` cua SDK gui log ve ENGINE chu khong ra stdout mot cach day du, nen phep
      //    dem do chi bat duoc mot phan (do duoc: 4/6 o bai W7 duoi day). Mot phep do bat duoc
      //    mot phan la mot phep do SAI, va no se bien thanh mot bai test lung lay.
      expect(successor.output).toContain('READY workflow=integration-handoff.v1');
    }, 900_000);

    // ------------------------------------------------------------------ W7

    it('HAI worker CUNG phien ban -> moi run xong dung mot lan; giet mot con, con lai chay tiep', async () => {
      await cleanup();
      endpoint.mode = 'ok';

      const workerA = await startWorker('v1-A');
      const workerB = await startWorker('v1-B');

      // Nhieu run cung luc. Vao bang CUA CHINH — `WorkflowScheduler` that cua tien trinh nay
      // day chung di, khong phai test goi tay.
      app = await bootAppContext(childEnv);
      const keys: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const result = await app.handoff.handoff({
          workflowKey: 'integration-handoff',
          operation: 'sync',
          entityType: 'work-item',
          entityId: `WI-w7-${Date.now()}-${i}`,
        });
        expect(result.outcome).toBe('queued');
        keys.push(result.operationKey!);
      }

      await waitFor(
        () => keys.every((key) => endpoint.appliedFor(key)),
        WORKER_FAILOVER_TIMEOUT_MS,
        () => `moi ${keys.filter((k) => endpoint.appliedFor(k)).length}/6 run xong`,
      );

      // MOT run -> MOT ban ghi. Sau run khac nhau -> sau ban ghi khac nhau, khong nhan doi.
      for (const key of keys) {
        expect(endpoint.postsFor(key)).toBe(1);
        expect(endpoint.appliedFor(key)).toBe(true);
      }

      // ⚠️ KHONG QUY DUOC RUN VE MOT BAN SAO — day la mot phat hien, khong phai mot thieu sot
      //    cua bai kiem.
      //
      //    `resolveWorkerRegistration()` sinh `workerName` TAT DINH theo phien ban
      //    (`workflow-worker-integration-handoff-v1`), nen hai tien trinh dang ky voi engine
      //    duoi CUNG MOT TEN. Payload thi khong mang danh tinh tien trinh (dung — do la bien
      //    gioi rieng tu). Hau qua: tren dashboard, hai ban sao doc ra nhu MOT.
      //
      //    Cai KHONG hong: viec van chay het, va giet mot con thi con lai ganh tiep (khang dinh
      //    ngay duoi). Cai hong: khi mot ban sao cu xu la, khong co duong nao chi ra la ban nao.
      //    Ghi nhan de xuat them hau to danh tinh tien trinh vao `workerName`; KHONG sua o day
      //    vi phan phoi viec va chuyen giao deu dang dung.
      expect(workerA.output).toContain('READY workflow=integration-handoff.v1');
      expect(workerB.output).toContain('READY workflow=integration-handoff.v1');

      // GIET mot con. Con lai phai ganh tiep — do la ca ly do chay hai ban sao.
      await workerA.kill();

      const afterKill: string[] = [];
      for (let i = 0; i < 2; i += 1) {
        const result = await app.handoff.handoff({
          workflowKey: 'integration-handoff',
          operation: 'sync',
          entityType: 'work-item',
          entityId: `WI-w7-sau-khi-giet-${Date.now()}-${i}`,
        });
        afterKill.push(result.operationKey!);
      }

      await waitFor(
        () => afterKill.every((key) => endpoint.appliedFor(key)),
        WORKER_FAILOVER_TIMEOUT_MS,
        () => 'worker con lai khong ganh duoc viec sau khi worker kia chet',
      );
      for (const key of afterKill) expect(endpoint.postsFor(key)).toBe(1);

      // DRAIN do duoc: het run dang chay thi con so nay ve 0. Day la dieu kien de rut worker cu
      // trong thu tuc REGISTER -> ACTIVATE -> DRAIN -> DEACTIVATE -> REMOVE, va no la mot SO DO
      // chu khong phai "cho cho chac".
      await waitFor(
        async () => (await engine.countInFlight('integration-handoff', 'v1')) === 0,
        WORKER_FAILOVER_TIMEOUT_MS,
        () => 'van con run chua ket thuc — chua duoc rut worker',
      );
      expect(await engine.countInFlight('integration-handoff', 'v1')).toBe(0);
    }, 900_000);
  },
);
