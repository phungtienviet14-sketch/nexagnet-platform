import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  baseEnv,
  waitFor,
} from './__tests__/workflow-it.harness.js';
import { createWorkflowEngineAdapter } from './workflow-engine.adapter.js';
import type { WorkflowEnginePort, WorkflowRunSummary } from './workflow-engine.port.js';

/**
 * HOP DONG MOC THOI GIAN voi ENGINE THAT — bai kiem NHO nhat tra loi duoc mot cau hoi ma khong
 * bai nao khac trong repo tra loi duoc.
 *
 * ---------------------------------------------------------------------------
 * CAU HOI: engine CO THUC SU ghi `startedAt`/`finishedAt` cho mot lan chay khong?
 *
 * Toan bo phep do "Thời gian workflow" tren man hinh chan doan dung tren dung hai truong do. Cai
 * ta co truoc bai nay chi la mot LOI HUA VE KIEU: `V1WorkflowRun` trong SDK khai ca hai la tuy
 * chon (`startedAt?`, `finishedAt?`). Mot truong tuy chon khong bao gio duoc dien thi khong khac
 * gi mot truong khong ton tai — va cai gia phai tra la man hinh im lang bao "chưa xác định" mai
 * mai, dung o cho nguoi ta can con so nhat.
 *
 * Mot bai kiem doi voi engine GIA se KHONG tra loi duoc cau nay: engine gia dien gi thi ta doc
 * duoc nay. Nen bai nay phai chay voi cum Hatchet that.
 *
 * ---------------------------------------------------------------------------
 * PHAM VI CO Y HEP — day KHONG phai bai E2E.
 *
 * `workflow-e2e.int.spec.ts` kiem chuoi nghiep vu tron ven va CAM goi thang engine. Bai nay hoi
 * mot cau khac han: CONG cua ta doc duoc gi tu engine. Nen no goi `trigger`/`describeRun` truc
 * tiep, va do la dung tang — hop dong port ↔ engine, khong phai duong nghiep vu.
 *
 * KHONG khang dinh gi ve DO LON cua thoi luong. Khuon fixture chay xong trong vai giay va khong
 * co lan cho ben vung nao; bang chung ve mot lan cho THAT (90 giay) den tu ban chay tren
 * gd1-test. O day chi can biet: hai moc CO MAT, doc duoc, va theo dung thu tu.
 *
 * CAN HA TANG THAT nen mac dinh BO QUA:
 *
 *   docker compose -p pocwf -f tools/poc-workflow-engine/compose/hatchet.compose.yml up -d
 *   export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
 *   RUN_WORKFLOW_IT=1 pnpm --filter @netviet/api exec vitest run src/workflow/workflow-run-timestamps
 */

/** Trang thai KET THUC theo tu vung engine — luc nay hai moc phai da co du. */
const TERMINAL_STATUSES = ['SUCCEEDED', 'COMPLETED', 'FAILED', 'CANCELLED'];

describe.runIf(process.env.RUN_WORKFLOW_IT === '1')(
  'hop dong moc thoi gian: engine that ghi startedAt/finishedAt cho mot lan chay',
  () => {
    const endpoint = new ProofEndpoint();
    let worker: WorkerProcess;
    let engine: WorkflowEnginePort;
    let endpointPort = 0;

    beforeAll(async () => {
      endpointPort = await endpoint.listen();
      worker = new WorkerProcess('v1', baseEnv(WORKFLOW_FIXTURE, endpointPort));
      await worker.start();

      engine = await createWorkflowEngineAdapter('hatchet', {
        token: process.env.WORKFLOW_ENGINE_TOKEN!,
        hostPort: process.env.WORKFLOW_ENGINE_HOST_PORT ?? 'localhost:7744',
        tlsStrategy: 'none',
      });
    }, 300_000);

    afterAll(async () => {
      await worker?.stop();
      await endpoint.close();
    }, 90_000);

    it('mot lan chay DA KET THUC mang du hai moc, dung thu tu, va hieu chung do duoc', async () => {
      endpoint.mode = 'ok';
      const entityId = `WI-ts-${Date.now()}`;

      const reference = await engine.trigger({
        workflowKey: 'integration-handoff',
        workflowVersion: 'v1',
        input: {
          tenant: 'workflow-enabled',
          entityType: 'work-item',
          entityId,
          operation: 'sync',
          operationVersion: 1,
          destination: 'proof-endpoint',
        },
        // `nexagnet.environment` la BAT BUOC: worker dung lai khoa thao tac tu input + moi
        // truong (`recomputeOperationKey`), va thieu no thi buoc dau tien nem ngay. Bo qua no se
        // bien bai nay thanh mot bai do duong HONG — van co hai moc, nhung khong con la duong ma
        // man hinh chan doan thuong nhin thay.
        metadata: { 'nexagnet.environment': 'it-timestamps', 'nexagnet.entityId': entityId },
      });

      expect(reference.engineRunId).toBeTruthy();

      // Doi run KET THUC theo tu vung cua CHINH ENGINE, khong doi theo dau vet o he ngoai: cau
      // hoi o day la "engine da chot lan chay nay chua", va chi engine tra loi duoc cau do.
      let summary: WorkflowRunSummary | null = null;
      await waitFor(
        async () => {
          summary = await engine.describeRun(reference.engineRunId);
          return summary !== null && TERMINAL_STATUSES.includes(summary.status);
        },
        RUN_COMPLETE_TIMEOUT_MS,
        () =>
          `run chua ket thuc. Trang thai cuoi doc duoc: ${
            (summary as WorkflowRunSummary | null)?.status ?? 'khong doc duoc'
          }`,
      );

      const run = summary as unknown as WorkflowRunSummary;

      // ① HAI MOC CO MAT. Day la ca ly do bai nay ton tai — SDK khai ca hai la tuy chon, nen chi
      //    mot lan chay that moi chung minh duoc engine co dien chung hay khong.
      expect(
        run.startedAt,
        'engine khong ghi startedAt — phep do thoi gian workflow mat nen',
      ).toBeTruthy();
      expect(
        run.finishedAt,
        'engine khong ghi finishedAt — phep do thoi gian workflow mat nen',
      ).toBeTruthy();

      // ② DOC DUOC. Mot chuoi engine tra ve ma `Date.parse` khong hieu se thanh `NaN`, va mot
      //    `NaN` roi xuong giao dien te hon nhieu so voi mot o "chưa xác định".
      const started = Date.parse(run.startedAt!);
      const finished = Date.parse(run.finishedAt!);
      expect(Number.isNaN(started)).toBe(false);
      expect(Number.isNaN(finished)).toBe(false);

      // ③ DUNG THU TU. Ket thuc truoc bat dau la du lieu hong; `engineDuration()` o tang ghep bo
      //    truong hop do di, va bai nay xac nhan engine khong sinh ra no o duong binh thuong.
      expect(finished).toBeGreaterThanOrEqual(started);

      // ④ HIEU CHUNG LA MOT CON SO HUU HAN. Khong khang dinh do lon: khuon fixture khong co lan
      //    cho ben vung nao. Bang chung ve mot lan cho THAT den tu ban chay tren gd1-test.
      expect(Number.isFinite(finished - started)).toBe(true);

      // ⑤ VA RUN DI DUONG THANH CONG. Mot run HONG cung mang du hai moc, nen neu bo khang dinh
      //    nay thi bai kiem van xanh khi metadata sai — tuc no se do dung cai duong ma man hinh
      //    chan doan it khi phai hien.
      expect(run.status).toBe('COMPLETED');
      expect(run.errorMessage).toBeUndefined();
    }, 300_000);
  },
);
