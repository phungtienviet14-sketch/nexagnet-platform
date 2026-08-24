import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProofEndpoint,
  RUN_COMPLETE_TIMEOUT_MS,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  apiDir,
  baseEnv,
  waitFor,
  workerExecArgv,
} from './__tests__/workflow-it.harness.js';
import { OtlpCollector, type CollectedSpan } from './__tests__/otlp-collector.js';

/**
 * TUONG QUAN TRACE XUYEN BA TIEN TRINH — Nexagnet -> engine -> worker -> he ngoai.
 *
 * ---------------------------------------------------------------------------
 * CAU HOI DUY NHAT: mo MOT trace id trong ClickStack co thay duoc ca duong di khong, hay van
 * phai ghep tay giua trace UI cua Nexagnet va dashboard cua engine nhu hom nay?
 *
 * BA TIEN TRINH THAT, khong tien trinh nao dung chung bo nho voi tien trinh nao:
 *
 *   ① `trace-evidence-child.ts`  Nexagnet — mo luot nghiep vu, xep hang, dispatcher goi engine
 *   ② `worker-main.ts`           worker   — nhan tung buoc tu engine qua gRPC
 *   ③ bai kiem nay               chi ngoi thu telemetry va dem
 *
 * Neu ① va ② gap nhau tren cung mot `traceId` thi do la vi soi day W3C di duoc qua engine —
 * khong the vi ly do nao khac.
 *
 * ---------------------------------------------------------------------------
 * DO TREN DU LIEU DA GUI, khong do trong bo nho. `OtlpCollector` la mot may chu HTTP that nhan
 * `POST /v1/traces` tu chinh exporter cua hai tien trinh kia. Xem chu thich dau file do de biet
 * vi sao `InMemorySpanExporter` KHONG tra loi duoc cau hoi nay.
 *
 * ---------------------------------------------------------------------------
 * CHAY (can ha tang that + preload OTel, nen mac dinh BO QUA):
 *
 *   export WORKFLOW_ENGINE_TOKEN="$(bash tools/poc-workflow-engine/start-engine.sh)"
 *   OTEL_TRACING=on RUN_WORKFLOW_IT=1 WORKFLOW_ENGINE_HOST_PORT=127.0.0.1:7744 \
 *     WORKFLOW_ENGINE_TLS_STRATEGY=none \
 *     pnpm --filter @netviet/api exec vitest run src/workflow/workflow-trace-correlation
 *
 * `OTEL_TRACING` la cong thu hai CO CHU DICH: bo kiem baseline chay voi `off`, va o do file nay
 * phai im lang tuyet doi. Mot bai kiem quan sat BAT BUOC phai chay se bien tang quan sat thanh
 * dieu kien de nghiep vu duoc coi la dung — dung dieu muc 10 rules cam.
 */

const OTLP_FLUSH_TIMEOUT_MS = 45_000;
/** Hatchet phat hien worker chet qua nhip tim roi moi giao lai viec — do la thoi gian CHO. */
const WORKER_FAILOVER_TIMEOUT_MS = 240_000;

/** OTLP: 3 = CLIENT, 4 = PRODUCER, 5 = CONSUMER. */
const KIND_CLIENT = 3;
const KIND_PRODUCER = 4;
const KIND_CONSUMER = 5;

const SERVICE_API = 'nexagnet-api';
const SERVICE_WORKER = 'nexagnet-workflow-worker';

function otelEnv(collectorPort: number, serviceName: string): NodeJS.ProcessEnv {
  return {
    OTEL_TRACING: 'on',
    OTEL_SERVICE_NAME: serviceName,
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collectorPort}`,
    // Lay mau HET. Mot bai kiem tuong quan chay o ti le 0,1 se do mot cach NGAU NHIEN, va do la
    // kieu do te nhat: no lam nguoi doc di tim loi o cho khong co loi.
    OTEL_TRACES_SAMPLER_ARG: '1',
    DATA_CLASSIFICATION: 'test',
    DEPLOYMENT_ENVIRONMENT: 'it',
    RELEASE_GIT_SHA: 'it-trace-correlation',
  };
}

/** Tien trinh Nexagnet cua bai — xem `trace-evidence-child.ts` de biet vi sao no phai rieng. */
class EvidenceApp {
  private child?: ChildProcess;
  private text = '';

  async start(
    env: NodeJS.ProcessEnv,
    entityId: string,
  ): Promise<{ operationKey: string; traceId: string }> {
    const child = spawn(
      process.execPath,
      [
        ...workerExecArgv(env),
        'src/workflow/__tests__/trace-evidence-child.ts',
        '--entity',
        entityId,
      ],
      { cwd: apiDir, env, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child = child;
    const collect = (chunk: Buffer): void => {
      this.text += chunk.toString();
    };
    child.stdout!.on('data', collect);
    child.stderr!.on('data', collect);

    let exited = false;
    child.once('exit', () => {
      exited = true;
    });

    await waitFor(
      () => {
        if (this.line()) return true;
        if (exited) throw new Error(`tien trinh Nexagnet thoat som. Output:\n${this.text}`);
        return false;
      },
      120_000,
      () => `khong thay dong CHILD. Output:\n${this.text.slice(-2000)}`,
    );

    const [, operationKey, traceId] = this.line()!.trim().split(' ');
    return { operationKey: operationKey ?? '', traceId: traceId ?? '' };
  }

  private line(): string | undefined {
    return this.text.split('\n').find((row) => row.startsWith('CHILD '));
  }

  get output(): string {
    return this.text;
  }

  /** Tat SACH qua stdin — xem `trace-evidence-child.ts` de biet vi sao khong dung SIGTERM. */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    child.stdin!.write('STOP\n');
    await new Promise<void>((done) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        done();
      }, 30_000);
      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
    this.child = undefined;
  }
}

describe.runIf(process.env.RUN_WORKFLOW_IT === '1' && process.env.OTEL_TRACING === 'on')(
  'Tuong quan trace: Nexagnet -> Hatchet -> worker -> he ngoai',
  () => {
    const collector = new OtlpCollector();
    const endpoint = new ProofEndpoint();
    const workers: WorkerProcess[] = [];
    const apps: EvidenceApp[] = [];
    let workerEnv: NodeJS.ProcessEnv;
    let appEnv: NodeJS.ProcessEnv;

    async function startWorker(label: string): Promise<WorkerProcess> {
      const worker = new WorkerProcess('v1', workerEnv, { label });
      workers.push(worker);
      await worker.start();
      return worker;
    }

    beforeAll(async () => {
      const collectorPort = await collector.listen();
      const endpointPort = await endpoint.listen();
      workerEnv = baseEnv(WORKFLOW_FIXTURE, endpointPort, otelEnv(collectorPort, SERVICE_WORKER));
      appEnv = baseEnv(WORKFLOW_FIXTURE, endpointPort, otelEnv(collectorPort, SERVICE_API));
      await startWorker('goc');
    }, 240_000);

    afterAll(async () => {
      for (const app of apps) await app.stop();
      for (const worker of workers) await worker.stop();
      await endpoint.close();
      await collector.close();
    }, 180_000);

    /** Mot lan chay day du, roi doi telemetry cua CA HAI tien trinh ve toi bo thu. */
    async function runOnce(entityId: string): Promise<{ operationKey: string; traceId: string }> {
      const app = new EvidenceApp();
      apps.push(app);
      const started = await app.start(appEnv, entityId);

      await waitFor(
        () => endpoint.appliedFor(started.operationKey),
        RUN_COMPLETE_TIMEOUT_MS,
        () => `he ngoai chua ap dung ban giao. Nexagnet:\n${app.output.slice(-1500)}`,
      );

      // Tat tien trinh Nexagnet -> `shutdownOtel()` day not hang doi cua no. Worker thi van chay
      // (bai sau con dung), nen span cua no ve theo nhip `BatchSpanProcessor` 2 giay.
      await app.stop();
      await waitFor(
        () => collector.trace(started.traceId).some((span) => span.name.endsWith(' settle')),
        OTLP_FLUSH_TIMEOUT_MS,
        () =>
          `chua thu du span cua trace ${started.traceId}. Da co: ` +
          `${collector
            .trace(started.traceId)
            .map((span) => span.name)
            .join(' | ')}`,
      );
      return started;
    }

    function byName(spans: readonly CollectedSpan[], name: string): CollectedSpan {
      const found = spans.find((span) => span.name === name);
      if (!found) {
        throw new Error(`khong co span '${name}'. Da co: ${spans.map((s) => s.name).join(' | ')}`);
      }
      return found;
    }

    // ------------------------------------------------------------------ ①

    it('MOT traceId di tron: luot nghiep vu -> dau giao -> ba buoc worker -> lan goi HTTP that', async () => {
      endpoint.mode = 'ok';
      const { operationKey, traceId } = await runOnce(`WI-corr-${Date.now()}`);
      const spans = collector.trace(traceId);

      // In cay ra bao cao — bang chung phai DOC DUOC, khong phai mot cau "da kiem tra".
      console.log(`\nTRACE ${traceId}\n${collector.render(traceId)}\n`);

      // ① Ca hai TIEN TRINH deu co mat trong cung mot trace. Day la ca cau hoi cua bai.
      expect(new Set(spans.map((span) => span.resource['service.name']))).toEqual(
        new Set([SERVICE_API, SERVICE_WORKER]),
      );

      // ② Luot nghiep vu la GOC, va buoc xep hang la con cua no.
      const turn = byName(spans, 'turn');
      expect(turn.parentSpanId).toBeUndefined();
      const enqueue = byName(spans, 'handoff.enqueue');
      expect(enqueue.parentSpanId).toBe(turn.spanId);

      // ③ DAU GIAO — `WorkflowDispatcher` goi engine o mot NHIP KHAC cua scheduler, tuc ngoai
      //    luot nghiep vu. No van phai noi lai duoc, va phai la PRODUCER.
      const trigger = byName(spans, 'integration-handoff.v1 trigger');
      expect(trigger.resource['service.name']).toBe(SERVICE_API);
      expect(trigger.kind).toBe(KIND_PRODUCER);
      expect(trigger.parentSpanId).toBe(enqueue.spanId);

      // ④ BA BUOC cua worker — TIEN TRINH KHAC, va deu la con cua buoc xep hang.
      for (const task of ['resolve', 'dispatch', 'settle']) {
        const span = byName(spans, `integration-handoff.v1 ${task}`);
        expect(span.resource['service.name']).toBe(SERVICE_WORKER);
        expect(span.kind).toBe(KIND_CONSUMER);
        expect(span.parentSpanId).toBe(enqueue.spanId);
        expect(span.attributes['nexagnet.workflow.task']).toBe(task);
      }

      // ⑤ LAN GOI HTTP THAT ra he ngoai, treo duoi buoc `dispatch` — mat xich cuoi, va no do
      //    `instrumentation-undici` sinh ra chu khong do ta viet tay.
      const dispatch = byName(spans, 'integration-handoff.v1 dispatch');
      const outbound = spans.find(
        (span) => span.kind === KIND_CLIENT && span.parentSpanId === dispatch.spanId,
      );
      expect(outbound, 'khong thay span HTTP con cua dispatch').toBeDefined();
      expect(String(outbound!.attributes['http.request.method'] ?? '')).toBe('POST');

      // ⑥ Va o DAU BEN KIA cua soi day: he ngoai nhan duoc DUNG MOT header `traceparent`, dung
      //    khuon W3C, mang CHINH `traceId` nay. Neu ca buoc lan runtime cung dat header thi gia
      //    tri o day se la hai cai noi bang dau phay — tuc bat tracing len se lam dut soi day.
      const call = endpoint.callsFor(operationKey).at(-1)!;
      expect(call.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
      expect(call.traceparent!.split('-')[1]).toBe(traceId);
    }, 600_000);

    // ------------------------------------------------------------------ ②

    it('worker bi kill -9 giua `dispatch` -> tac dung phu DUNG MOT LAN, va trace khong dut', async () => {
      // ① Giu yeu cau lai: run nam trong `dispatch`, he ngoai DA nhan nhung CHUA ap dung.
      endpoint.mode = 'hold';
      const entityId = `WI-crash-${Date.now()}`;
      const app = new EvidenceApp();
      apps.push(app);
      const { operationKey, traceId } = await app.start(appEnv, entityId);

      await waitFor(
        () => endpoint.postsFor(operationKey) >= 1,
        RUN_COMPLETE_TIMEOUT_MS,
        () => `run chua vao duoc buoc dispatch. Nexagnet:\n${app.output.slice(-1500)}`,
      );
      expect(endpoint.appliedFor(operationKey)).toBe(false);

      // ② GIET. Khong SIGTERM, khong don dep — mo phong container bi OOM hoac VM mat dien.
      //    Hau qua cho quan sat: span `dispatch` cua LAN NAY khong bao gio duoc gui, vi tien
      //    trinh giu no bien mat. Do la SU THAT, va bai kiem nay khong duoc phep giau no bang
      //    cach doi mot con so span co dinh.
      const victim = workers.at(-1)!;
      await victim.kill();

      // ③ Worker MOI, CUNG phien ban. He ngoai lan nay tra loi binh thuong.
      const successor = await startWorker('ke-nhiem');
      endpoint.mode = 'ok';

      await waitFor(
        () => endpoint.appliedFor(operationKey),
        WORKER_FAILOVER_TIMEOUT_MS,
        () => `run khong chay tiep sau khi worker chet. posts=${endpoint.postsFor(operationKey)}`,
      );

      // ④ HAI CON SO, bao rieng: he ngoai bi GOI it nhat hai lan…
      expect(endpoint.postsFor(operationKey)).toBeGreaterThanOrEqual(2);
      // …nhung chi co MOT ban ghi, vi moi lan goi mang CUNG mot khoa thao tac.
      expect(new Set(endpoint.callsFor(operationKey).map((c) => c.idempotencyKey)).size).toBe(1);
      expect(endpoint.callsFor(operationKey).at(-1)!.idempotencyKey).toBe(operationKey);

      await app.stop();
      await waitFor(
        () => collector.trace(traceId).some((span) => span.name.endsWith(' settle')),
        OTLP_FLUSH_TIMEOUT_MS,
        () =>
          'chua thu du span sau khi hoi phuc. Da co: ' +
          `${collector
            .trace(traceId)
            .map((span) => span.name)
            .join(' | ')}`,
      );

      const spans = collector.trace(traceId);
      console.log(
        `\nTRACE ${traceId} (sau khi worker chet va chay lai)\n${collector.render(traceId)}\n`,
      );

      // ⑤ MOT trace duy nhat qua ca lan chet. Khong co cai cay thu hai nao duoc sinh ra.
      const dispatches = spans.filter((span) => span.name === 'integration-handoff.v1 dispatch');
      expect(dispatches.length).toBeGreaterThanOrEqual(1);
      // ⑥ Lan chay LAI van la CON cua chinh luot nghiep vu goc — khong phai mot span mo coi.
      const enqueue = byName(spans, 'handoff.enqueue');
      expect(dispatches.every((span) => span.parentSpanId === enqueue.spanId)).toBe(true);
      // ⑦ Va no den tu mot TIEN TRINH KHAC: worker moi la ke chay `settle`.
      expect(successor.output).toContain('READY workflow=integration-handoff.v1');
      expect(byName(spans, 'integration-handoff.v1 settle').resource['service.name']).toBe(
        SERVICE_WORKER,
      );
    }, 900_000);

    // ------------------------------------------------------------------ ③

    it('RIENG TU tren day: telemetry cua worker khong mang bi mat, PII, hay payload', async () => {
      const wire = collector.rawBodies().join('\n');
      expect(wire.length).toBeGreaterThan(0);

      // ① Bi mat cua ha tang. `WORKFLOW_ENGINE_TOKEN` la mot JWT THAT cua cum engine — no la thu
      //    de lo nhat, vi ca hai tien trinh deu cam no trong bien moi truong.
      const engineToken = process.env.WORKFLOW_ENGINE_TOKEN ?? '';
      expect(engineToken.length).toBeGreaterThan(20);
      expect(wire).not.toContain(engineToken);
      expect(wire).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./);
      expect(wire.toLowerCase()).not.toContain('bearer ');
      expect(wire).not.toMatch(/postgresql:\/\/[^"\s]*:[^"@\s]+@/);

      // ② PAYLOAD cua workflow. Than tin di ra he ngoai co sau truong; khong truong nao trong so
      //    do duoc phep xuat hien trong telemetry.
      for (const field of ['operationVersion', 'destination']) {
        expect(wire).not.toContain(`"${field}"`);
      }

      // ③ Va thu do PHAI co: neo danh tinh. Khong co chung thi ba khang dinh tren chi dang chung
      //    minh rang ta chua gui gi ca.
      expect(wire).toContain('nexagnet.workflow.task');
      expect(wire).toContain('nexagnet.traceId');
    }, 60_000);
  },
);
