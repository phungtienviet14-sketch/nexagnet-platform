import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WORKFLOW_FIXTURE_V2,
  WorkerProcess,
  baseEnv,
  bootAppContext,
  waitFor,
  type BootedApp,
  type HandoffApi,
} from './__tests__/workflow-it.harness.js';

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
 *
 * BO DO (`ProofEndpoint`, `WorkerProcess`, `waitFor`, `bootAppContext`) nam o
 * `__tests__/workflow-it.harness.ts` — dung chung voi cac bai kiem do tin cay khac.
 */

describe.runIf(process.env.RUN_WORKFLOW_IT === '1')(
  'E2E: Nexagnet that -> outbox -> engine -> worker rieng -> diem cuoi',
  () => {
    const endpoint = new ProofEndpoint();
    let worker: WorkerProcess;
    let app: BootedApp;
    let handoff: HandoffApi;

    beforeAll(async () => {
      const port = await endpoint.listen();
      const env = baseEnv(WORKFLOW_FIXTURE, port);

      worker = new WorkerProcess('v1', env);
      await worker.start();

      app = await bootAppContext(env);
      handoff = app.handoff;
    }, 240_000);

    afterAll(async () => {
      await worker?.stop();
      await app?.context.close();
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
      const seen = endpoint.callsFor(key);
      expect(seen.length).toBeGreaterThanOrEqual(3);
      expect(new Set(seen.map((c) => c.idempotencyKey)).size).toBe(1);
    }, 180_000);
  },
);

// ------------------------------------------------------- hoi quy ghim phien ban

/**
 * HOI QUY GATE A TREN DAY NOI PRODUCTION.
 *
 * `evidence/version-gate-a.md` da chung minh chien luoc "ten workflow mang phien ban" tren mot
 * spike rieng. Bai nay hoi mot cau khac va kho hon: DAY NOI PRODUCTION co giu duoc bang chung do
 * khong, khi run di qua outbox, dispatcher, cong, adapter va hai tien trinh worker that.
 *
 * CACH DOC "run nay chay bang phien ban nao" — tu BEN NGOAI, khong moi ruot engine:
 *   v1 = resolve -> dispatch -> settle              => diem cuoi chi thay POST
 *   v2 = resolve -> PREFLIGHT -> dispatch -> settle => diem cuoi thay GET roi moi POST
 *
 * Nen mot lan GET mang khoa cua run v1 se la bang chung worker v2 da cuop run cu — dung che do
 * hong ma ⑨ trong bang chung Gate A mo ta. Khong co GET do tuc la khong bi cuop.
 */
describe.runIf(process.env.RUN_WORKFLOW_IT === '1')(
  'hoi quy ghim phien ban: v2 len khi v1 dang do',
  () => {
    const endpoint = new ProofEndpoint();
    let workerV1: WorkerProcess;
    let workerV2: WorkerProcess;
    let appV1: BootedApp;
    let appV2: BootedApp;
    let endpointPort = 0;

    beforeAll(async () => {
      endpointPort = await endpoint.listen();
      // v1 len TRUOC va o lai suot bai — do la dieu kien cua ca thi nghiem: v2 khong duoc phep
      // thay the v1, no phai chay SONG SONG.
      workerV1 = new WorkerProcess('v1', baseEnv(WORKFLOW_FIXTURE, endpointPort));
      await workerV1.start();
      appV1 = await bootAppContext(baseEnv(WORKFLOW_FIXTURE, endpointPort));
    }, 300_000);

    afterAll(async () => {
      await workerV2?.stop();
      await workerV1?.stop();
      await appV2?.context.close();
      await appV1?.context.close();
      await endpoint.close();
    }, 90_000);

    it('run v1 dang do KHONG bi worker v2 cuop, va run moi di v2', async () => {
      // ① mot run v1 di vao `dispatch` roi BI GIU o do.
      endpoint.mode = 'hold';
      const v1 = await appV1.handoff.handoff({
        workflowKey: 'integration-handoff',
        operation: 'sync',
        entityType: 'work-item',
        entityId: `WI-v1-${Date.now()}`,
      });
      const keyV1 = v1.operationKey!;
      await waitFor(
        () => endpoint.calls.some((c) => c.idempotencyKey === keyV1),
        RUN_COMPLETE_TIMEOUT_MS,
        () => `run v1 chua vao duoc buoc dispatch`,
      );

      // ② v2 len — v1 VAN SONG. Day la rolling deploy, khong phai cat dien.
      workerV2 = new WorkerProcess('v2', baseEnv(WORKFLOW_FIXTURE_V2, endpointPort));
      await workerV2.start();

      // ③ run MOI, tren goi khach da ACTIVATE v2.
      appV2 = await bootAppContext(baseEnv(WORKFLOW_FIXTURE_V2, endpointPort));
      const v2 = await appV2.handoff.handoff({
        workflowKey: 'integration-handoff',
        operation: 'sync',
        entityType: 'work-item',
        entityId: `WI-v2-${Date.now()}`,
      });
      const keyV2 = v2.operationKey!;

      // ④ run moi PHAI di qua buoc `preflight` — buoc chi ton tai o code v2.
      await waitFor(
        () => endpoint.lookupsFor(keyV2) >= 1,
        RUN_COMPLETE_TIMEOUT_MS,
        () => `run moi khong di qua preflight => no khong chay bang code v2`,
      );

      // ⑤ tha diem cuoi cho ca hai run chay het.
      endpoint.release();
      endpoint.mode = 'ok';
      await waitFor(
        () => endpoint.calls.some((c) => c.idempotencyKey === keyV2),
        RUN_COMPLETE_TIMEOUT_MS,
        () => `run v2 chua toi duoc dispatch`,
      );

      // ⑥ KHANG DINH TRUNG TAM: run cu KHONG BAO GIO cham vao code v2.
      // Mot lan GET mang khoa cua no se la bang chung worker v2 da cuop run — dung che do hong
      // ma ⑨ cua Gate A mo ta.
      expect(endpoint.lookupsFor(keyV1)).toBe(0);
      expect(endpoint.lookupsFor(keyV2)).toBeGreaterThanOrEqual(1);
    }, 300_000);
  },
);
