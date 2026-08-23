import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaWorkflowOutboxRepository } from './prisma-workflow-outbox.repository.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import { createWorkflowEngineAdapter } from './workflow-engine.adapter.js';
import {
  WorkflowEnginePort,
  type TriggerWorkflowCommand,
  type WorkflowRunReference,
  type WorkflowRunSummary,
} from './workflow-engine.port.js';
import {
  CRASH_WINDOW_CHAT_ID,
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  apiDir,
  baseEnv,
  countEngineRuns,
  enginePortOpen,
  runCrashWindowChild,
  waitFor,
} from './__tests__/workflow-it.harness.js';

/**
 * W5 — ENGINE CHET ROI SONG LAI, va NGU NGHIA CUA MOT LAN GUI TRUNG.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG BOOT `AppModule` O DAY (khac han bai W4):
 *
 * Chu de cua bai nay la CHINH `WorkflowDispatcher` — no cu xu ra sao khi engine khong tra loi,
 * va hai luot tick cham nhau thi chuyen gi xay ra. Neu boot ca `AppModule` thi `WorkflowScheduler`
 * that se tick moi 5 giay SONG SONG voi cac luot tick cua bai kiem: `attempts` tro thanh mot con
 * so khong doan duoc, va moi khang dinh ve backoff bien thanh mot cuoc dua.
 *
 * Nen: HANG OUTBOX van duoc tao qua CUA CHINH (tien trinh con cua W4 — no boot `AppModule` that,
 * di qua `WorkflowHandoffService`, roi CHET), sau do bai nay tu dieu khien tung luot tick voi
 * `now` cho truoc. Hang la that, duong tao ra no la that, va phep do thi tat dinh.
 *
 * ---------------------------------------------------------------------------
 * MOT LOI ICH PHU CO THAT: tien trinh con boot `AppModule` LUC ENGINE DANG CHET. No boot duoc
 * va ghi don duoc — do la khang dinh "duong nghiep vu khong chet theo engine", va no duoc kiem
 * mien phi ngay trong buoc dung hang.
 *
 *   docker compose -f docker-compose.yml up -d postgres
 *   docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
 *   RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_TOKEN=… \
 *     pnpm --filter @netviet/api exec vitest run src/workflow/workflow-recovery
 */

const REPO_ROOT = resolve(apiDir, '../..');
const POC_COMPOSE = resolve(REPO_ROOT, 'tools/poc-workflow-engine/compose/hatchet.compose.yml');
const ENGINE_WORKFLOW_NAME = 'integration-handoff.v1';
const LEASE_SECONDS = 60;

function compose(...args: string[]): void {
  execFileSync('docker', ['compose', '-p', 'pocwf', '-f', POC_COMPOSE, ...args], {
    stdio: 'pipe',
    timeout: 120_000,
  });
}


/**
 * Cong BOC LAI: goi engine THAT roi NEM.
 *
 * Mo phong che do hong te nhat va kho nhat cua mot lan goi mang: yeu cau DA TOI NOI va engine
 * DA TAO RUN, nhung ben goi khong bao gio biet dieu do vi ket noi dut truoc khi cau tra loi ve.
 * Khong mo phong duoc canh nay thi cau hoi "co tao run trung khong" chi tra loi duoc bang suy
 * luan chu khong bang phep do.
 */
class TimeoutAfterTriggerPort extends WorkflowEnginePort {
  constructor(private readonly inner: WorkflowEnginePort) {
    super();
  }

  async trigger(command: TriggerWorkflowCommand): Promise<WorkflowRunReference> {
    await this.inner.trigger(command);
    throw new Error('UPSTREAM_TIMEOUT gia lap: engine DA nhan nhung ben goi khong biet');
  }

  sendEvent(key: string, payload: Readonly<Record<string, unknown>>): Promise<void> {
    return this.inner.sendEvent(key, payload);
  }
  cancel(id: string): Promise<void> {
    return this.inner.cancel(id);
  }
  describeRun(id: string): Promise<WorkflowRunSummary | null> {
    return this.inner.describeRun(id);
  }
  countInFlight(key: string, version: string): Promise<number> {
    return this.inner.countInFlight(key, version);
  }
}

describe.runIf(process.env.RUN_PRISMA_IT === '1' && process.env.RUN_WORKFLOW_IT === '1')(
  'W5 — engine chet/song lai + ngu nghia gui trung',
  () => {
    const endpoint = new ProofEndpoint();
    const prisma = new PrismaService();
    const outbox = new PrismaWorkflowOutboxRepository(prisma);
    let engine: WorkflowEnginePort;
    let worker: WorkerProcess | undefined;
    let childEnv: NodeJS.ProcessEnv;
    let endpointPort = 0;

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
    }

    /** Mot dispatcher moi cho moi luot do — `workerId` khac nhau de doc log ra ai giu lease. */
    function dispatcherFor(port: WorkflowEnginePort, workerId: string): WorkflowDispatcher {
      return new WorkflowDispatcher(outbox, port, { workerId, leaseSeconds: LEASE_SECONDS });
    }

    /**
     * Bat buoc engine phai SONG LAI du bai kiem di duong nao.
     *
     * Khong co cai nay, mot khang dinh do o giua bai "engine chet" se de stack nam chet, va moi
     * bai SAU do se do theo voi mot ly do CHANG LIEN QUAN GI toi loi that. Da vap dung vao:
     * mot loi duy nhat o phep do song/chet lam ba bai bao "worker khong bao READY".
     */
    async function withEngineDown(body: () => Promise<void>): Promise<void> {
      compose('stop', '-t', '2', 'hatchet-engine');
      try {
        await waitFor(
          async () => !(await enginePortOpen()),
          60_000,
          () => 'cong gRPC cua engine van mo sau khi da stop',
        );
        await body();
      } finally {
        compose('start', 'hatchet-engine');
        await waitFor(enginePortOpen, 180_000, () => 'cong gRPC cua engine khong mo lai');
      }
    }

    async function ensureWorker(): Promise<void> {
      if (worker) return;
      worker = new WorkerProcess('v1', childEnv);
      await worker.start();
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
      await worker?.stop();
      await endpoint.close();
      await cleanup();
      await prisma.$disconnect();
      // De stack lai DUNG trang thai da muon: cac bai sau (va nguoi chay tay) can engine song.
      try {
        compose('start', 'hatchet-engine');
      } catch {
        /* da chay roi */
      }
    }, 180_000);

    // ------------------------------------------------- engine chet -> song lai

    it('engine CHET: hang khong mat, co backoff, duong nghiep vu van song; engine LEN: gui tiep, khong trung', async () => {
      await cleanup();
      let first!: Awaited<ReturnType<typeof runCrashWindowChild>>;
      let failed!: NonNullable<Awaited<ReturnType<typeof prisma.workflowOutbox.findUnique>>>;
      let t0!: Date;

      await withEngineDown(async () => {
        // ① DUONG NGHIEP VU VAN SONG khi engine chet. Tien trinh con boot `AppModule` THAT, nen
        //    viec no boot duoc va commit duoc CHINH LA khang dinh nay — khong can gi them.
        //
        //    LAM TRUOC, khong lam sau: moi tien trinh con mang theo mot `WorkflowScheduler` that,
        //    va no tick NGAY luc boot. Neu spawn con nay SAU khi hang cua ta da nam do, no se
        //    nhan hang cua ta roi CHET giua chung — de lai hang o `claimed` voi mot lease 60 giay
        //    cua mot tien trinh khong con ton tai. Hanh vi do DUNG (bai lease phia duoi do chinh
        //    no), nhung o day no la nhieu. Da mat mot luot chay de tim ra.
        const alive = await runCrashWindowChild([], childEnv);
        expect(alive.outcome).toBe('COMMITTED');
        const aliveRow = await prisma.workflowOutbox.findUnique({
          where: { operationKey: alive.operationKey },
        });
        // Su kien CON NGUYEN — chua di dau ca, va do la dieu duy nhat can khang dinh o buoc nay.
        expect(aliveRow).not.toBeNull();
        expect(aliveRow!.status).not.toBe('dispatched');

        // ② Hang de do backoff. Tao SAU CUNG -> khong tien trinh con nao con boot sau no.
        first = await runCrashWindowChild([], childEnv);
        expect(first.outcome).toBe('COMMITTED');

        // ③ Mot luot tick voi engine dang chet.
        t0 = new Date();
        await dispatcherFor(engine, 'w5-down').tick(t0);

        failed = (await prisma.workflowOutbox.findUnique({
          where: { operationKey: first.operationKey },
        }))!;
        // Hang KHONG MAT. Day la ca diem cua outbox.
        expect(failed).not.toBeNull();
        expect(failed.status).toBe('pending');
        expect(failed.attempts).toBe(1);
        expect(failed.engineRunId).toBeNull();
        // Ly do hong duoc ghi vao chinh hang do — nguoi truc dem doc duoc no o day.
        expect(failed.lastError ?? '').not.toBe('');
        // Backoff luy thua tinh tu SO LAN DA THU: base=1s, attempts=1 -> +1s.
        expect(failed.nextAttemptAt!.getTime()).toBe(t0.getTime() + 1_000);
      });

      // ④ Engine DA LEN LAI (do `withEngineDown` bao dam, ke ca khi tren co khang dinh do).
      await ensureWorker();

      // ⑤ CUNG hang do duoc gui di o luot tick sau. `now` vuot qua `nextAttemptAt`.
      await dispatcherFor(engine, 'w5-up').tick(new Date(t0.getTime() + 10_000));

      const dispatched = await prisma.workflowOutbox.findUnique({
        where: { operationKey: first.operationKey },
      });
      expect(dispatched!.status).toBe('dispatched');
      expect(dispatched!.engineRunId).not.toBeNull();
      // Lan thu thu hai — tren DUNG hang do, khong phai mot hang moi.
      expect(dispatched!.attempts).toBe(2);
      expect(dispatched!.id).toBe(failed.id);

      // ⑥ Va no chay den noi den chon, DUNG MOT LAN.
      await waitFor(
        () => endpoint.postsFor(first.operationKey) >= 1,
        RUN_COMPLETE_TIMEOUT_MS,
        () => 'he ngoai khong nhan duoc ban giao sau khi engine len lai',
      );
      expect(endpoint.postsFor(first.operationKey)).toBe(1);
      expect(endpoint.appliedFor(first.operationKey)).toBe(true);

      // ⑦ MOT run tren engine, khong phai hai: mot lan GUI HONG khong de lai run ma.
      expect(await countEngineRuns(ENGINE_WORKFLOW_NAME, 'nexagnet.entityId', first.orderId)).toBe(
        1,
      );
    }, 600_000);

    // ------------------------------------------------- hai tick cham nhau

    it('HAI dispatcher tick cung luc -> CHI MOT nhan duoc hang', async () => {
      await cleanup();
      const child = await runCrashWindowChild([], childEnv);
      const now = new Date();

      // Hai tien trinh API (hai ban sao) cung thuc day. `pg_try_advisory_xact_lock` +
      // `FOR UPDATE SKIP LOCKED` phai lam cho dung mot ben nhan duoc.
      const claims = await Promise.all([
        outbox.claimDue('w5-a', now, LEASE_SECONDS, 20),
        outbox.claimDue('w5-b', now, LEASE_SECONDS, 20),
      ]);
      const gotIt = claims.filter((batch) =>
        batch.some((row) => row.operationKey === child.operationKey),
      );
      expect(gotIt).toHaveLength(1);

      const row = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      // Nhan MOT lan -> dem MOT lan. Dem hai lan se an mon ngan sach thu lai ma khong ai goi ai.
      expect(row!.attempts).toBe(1);
      expect(row!.status).toBe('claimed');
    }, 240_000);

    // ------------------------------------------------- lease het han

    it('LEASE HET HAN -> hang quay lai va duoc nhan lai, khong nam ket', async () => {
      await cleanup();
      const child = await runCrashWindowChild([], childEnv);
      const now = new Date();

      const first = await outbox.claimDue('w5-chet-giua-chung', now, LEASE_SECONDS, 20);
      expect(first.some((r) => r.operationKey === child.operationKey)).toBe(true);

      // Nguoi giu lease CHET (khong `markDispatched`, khong `markAttemptFailed`). Truoc khi
      // lease het han, khong ai duoc dong vao.
      const tooEarly = await outbox.claimDue(
        'w5-nguoi-khac',
        new Date(now.getTime() + (LEASE_SECONDS - 5) * 1_000),
        LEASE_SECONDS,
        20,
      );
      expect(tooEarly.some((r) => r.operationKey === child.operationKey)).toBe(false);

      // Sau khi het han thi nguoi khac nhan lai duoc — day la thu ngan hang nam ket vinh vien
      // khi mot tien trinh API bien mat giua chung.
      const reclaimed = await outbox.claimDue(
        'w5-nguoi-khac',
        new Date(now.getTime() + (LEASE_SECONDS + 5) * 1_000),
        LEASE_SECONDS,
        20,
      );
      const mine = reclaimed.find((r) => r.operationKey === child.operationKey);
      expect(mine).toBeDefined();
      expect(mine!.attempts).toBe(2);
    }, 240_000);

    // ------------------------------- timeout mo ho: engine DA nhan

    it('TIMEOUT MO HO (engine DA tao run) -> gui lai tao RUN THU HAI, nhung he ngoai chi AP DUNG mot lan', async () => {
      await cleanup();
      await ensureWorker();
      const child = await runCrashWindowChild([], childEnv);

      // ① Luot tick "mo ho": engine nhan that, ben goi thi tin la hong.
      await dispatcherFor(new TimeoutAfterTriggerPort(engine), 'w5-mo-ho').tick(new Date());

      const afterAmbiguous = await prisma.workflowOutbox.findUnique({
        where: { operationKey: child.operationKey },
      });
      // Ben Nexagnet: hang van `pending` — dung theo hieu biet cua no, vi no khong biet gi khac.
      expect(afterAmbiguous!.status).toBe('pending');
      expect(afterAmbiguous!.engineRunId).toBeNull();

      // ② Luot tick sau gui LAI. Day la hanh vi DUNG cua at-least-once, khong phai loi.
      await dispatcherFor(engine, 'w5-gui-lai').tick(new Date(Date.now() + 10_000));
      expect(
        (await prisma.workflowOutbox.findUnique({ where: { operationKey: child.operationKey } }))!
          .status,
      ).toBe('dispatched');

      await waitFor(
        () => endpoint.postsFor(child.operationKey) >= 2,
        RUN_COMPLETE_TIMEOUT_MS,
        () =>
          `moi thay ${endpoint.postsFor(child.operationKey)} lan goi — chua du de ket luan ve trung lap`,
      );

      // ③ BA CON SO, BA TANG khac nhau. Day la toan bo ket luan cua bai nay, va chung PHAI duoc
      //    bao rieng chu khong duoc gop thanh mot chu "exactly-once".
      const engineRuns = await countEngineRuns(
        ENGINE_WORKFLOW_NAME,
        'nexagnet.entityId',
        child.orderId,
      );

      // engine: HAI run. `TriggerWorkflowCommand.operationKey` KHONG duoc truyen sang
      // `runNoWait`, nen engine khong co gi de chan trung LUC TAO RUN. Day la su that do duoc,
      // khong phai thieu sot cua bai kiem — xem G1 trong ke hoach.
      expect(engineRuns).toBe(2);
      // he ngoai bi GOI hai lan (mot lan cho moi run)…
      expect(endpoint.postsFor(child.operationKey)).toBeGreaterThanOrEqual(2);
      // …nhung chi AP DUNG mot lan, vi ca hai lan mang CUNG mot `Idempotency-Key`.
      expect(endpoint.appliedFor(child.operationKey)).toBe(true);
      expect(
        new Set(endpoint.callsFor(child.operationKey).map((c) => c.idempotencyKey)).size,
      ).toBe(1);
    }, 600_000);
  },
);
