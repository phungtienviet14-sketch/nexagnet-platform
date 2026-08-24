import { Logger } from '@nestjs/common';
import type { WorkflowWorkerDeps, WorkflowWorkerHandle } from '../workflow-worker.adapter.js';
import type { WorkerRegistration } from '../worker-registration.js';
import {
  dispatchHandoff,
  preflightLookup,
  recomputeOperationKey,
  resolveDestination,
  type IntegrationHandoffInput,
} from '../workflows/integration-handoff.steps.js';
import { HatchetClient, type HatchetClientType } from './hatchet-sdk.js';
import type { HatchetEngineConfig } from './hatchet-workflow-engine.adapter.js';
import {
  resolveWorkerTraceBridge,
  type WorkerTraceBridge,
  type WorkflowTaskTrace,
} from '../../observability/worker-trace-bridge.js';

/**
 * Hien thuc tien trinh worker bang Hatchet.
 *
 * File nay va `hatchet-workflow-engine.adapter.ts` la HAI file duy nhat (cung `hatchet-sdk.ts`)
 * biet Hatchet ton tai. Moi khai niem rieng cua no — `parentOutput`, `additionalMetadata`,
 * `waitUntilReady`, `retryCount` — dung lai o day.
 *
 * ---------------------------------------------------------------------------
 * MOT TIEN TRINH DANG KY DUNG MOT PHIEN BAN. `registration.engineName` da mang phien ban
 * (`integration-handoff.v1`), va lop nay khong co duong nao de dang ky cai thu hai. Do la ca ly
 * do `WorkerRegistration` la mot object chu khong phai mot mang.
 *
 * Bang chung vi sao dieu do quan trong: `evidence/version-gate-a.md` §3 ⑨ — voi mot ten dung
 * chung, mot run dang cho bi worker phien ban moi NUOT TRON tu buoc dau tien.
 */
interface HatchetWorkerLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  waitUntilReady(timeoutMs?: number): Promise<void>;
}

/**
 * Phan cua `ctx` Hatchet ma CAU NOI TRACE can — va khong mot phan nao khac.
 *
 * Khai bao HEP nhu vay co chu dich: no lam thanh van ban dieu ma quy tac rieng tu doi hoi —
 * cau noi doc `additionalMetadata()` (tui DA di qua `buildWorkflowMetadata()`, tuc da bi quet
 * PII/bi mat) va `retryCount()`, chu khong doc `input`, khong doc `parentOutput`. Mot nguoi sua
 * file nay ve sau muon deo them mot truong cua payload len span se phai NOI RONG kieu nay ra
 * truoc, va do la luc code review nhin thay.
 */
interface TaskRunContext {
  additionalMetadata(): Record<string, string>;
  retryCount(): number;
}

/** MOI thu duoc phep di tu mot lan chay len span cua no. Doc ky chu thich cua `TaskRunContext`. */
function runAnchors(ctx: TaskRunContext): Omit<WorkflowTaskTrace, 'workflowName' | 'taskName'> {
  // Ca hai lan doc deu fail-open: mot `ctx` cua phien ban SDK khac thieu mot trong hai phuong
  // thuc phai lam MAT NEO, khong duoc lam hong buoc nghiep vu.
  let metadata: Record<string, string> = {};
  try {
    metadata = ctx.additionalMetadata() ?? {};
  } catch {
    /* fail-open */
  }
  let attempt = 0;
  try {
    attempt = ctx.retryCount();
  } catch {
    /* fail-open */
  }

  const attributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    // `traceparent` la KHUON DAY, khong phai mot neo de loc. No da thanh quan he cha-con cua
    // span roi; deo them mot ban sao dang van ban chi lam to du lieu ma khong tra loi them cau
    // hoi nao.
    if (key === 'traceparent') continue;
    if (typeof value === 'string' && value !== '') attributes[key] = value;
  }

  return {
    traceparent: metadata.traceparent,
    attempt: Number.isFinite(attempt) ? attempt : 0,
    attributes,
  };
}

/** Duong tiem cho BAI KIEM — khong dung o production. Nam trong thu muc `hatchet/` de kieu cua
 * SDK khong ro ri ra `workflow-worker.adapter.ts` (file do PHAI trung lap ve engine). */
export interface HatchetWorkerOverrides {
  readonly client?: HatchetClientType;
  readonly traceBridge?: WorkerTraceBridge;
}

export class HatchetWorkflowWorker implements WorkflowWorkerHandle {
  private readonly logger = new Logger(HatchetWorkflowWorker.name);
  private client?: HatchetClientType;
  private worker?: HatchetWorkerLike;
  /**
   * `start()` cua SDK chi giai quyet KHI WORKER DUNG — no la vong doi cua tien trinh, khong phai
   * mot lenh khoi dong. Giu lai de `stop()` cho no ket thuc thay vi bo lung mot promise.
   */
  private running?: Promise<void>;

  constructor(
    private readonly registration: WorkerRegistration,
    private readonly config: HatchetEngineConfig,
    private readonly deps: WorkflowWorkerDeps = {},
    private readonly overrides: HatchetWorkerOverrides = {},
  ) {}

  async start(): Promise<void> {
    const env = this.deps.env ?? process.env;
    // `hatchet()` khoi tao client = MO KET NOI gRPC. Bao buoc TRUOC khi goi, vi neu engine chua
    // len thi loi se nem tu chinh dong duoi va readiness phai dang o dung `CONNECTING` luc do.
    this.deps.onPhase?.('connecting');
    const hatchet = this.hatchet();

    /**
     * CAU NOI TRACE cua tien trinh nay — phan giai MOT LAN luc dang ky khuon.
     *
     * `OTEL_TRACING` khong bat -> `NOOP_WORKER_TRACE_BRIDGE`, va tu do tro di khong mot dong
     * nao duoi day biet OpenTelemetry ton tai. Do la ly do phan giai o day chu khong trong tung
     * `fn`: mot lan doc bien moi truong cho ca vong doi worker, khong phai mot lan cho moi buoc.
     */
    const bridge = this.overrides.traceBridge ?? (await resolveWorkerTraceBridge(env));
    const workflowName = this.registration.engineName;

    /**
     * BIEN THUC THI CUA WORKER — MOI buoc dang ky o lop nay deu phai di qua day.
     *
     * ------------------------------------------------------------------------
     * VI SAO KHONG BOC O NGOAI `workflow.task({...})` (mot ham `defineTask` tu goi
     * `workflow.task` ho): boc nhu vay se de mat suy dien kieu cua SDK — `ctx.parentOutput(x)`
     * lay kieu dau ra cua `x` tu chinh doi tuong task ma `workflow.task` tra ve, va mot lop boc
     * generic o giua lam kieu do sup ve `unknown`. Doi lai mot dong `traced(...)` trong moi `fn`,
     * ta giu duoc ca `ctx.logger`, `ctx.parentOutput` va `ctx.additionalMetadata` dung kieu.
     *
     * Bat bien "khong buoc nao thoat ra ngoai cau noi" duoc GIU BANG BAI KIEM chu khong bang
     * kieu: `hatchet-workflow-worker.trace.spec.ts` dem so `fn` dang ky duoc va so lan cau noi
     * duoc goi, va no do khi hai con so khong bang nhau.
     */
    const traced = <T>(
      taskName: string,
      ctx: TaskRunContext,
      run: (outboundTraceparent: string | undefined) => Promise<T> | T,
    ): Promise<T> =>
      bridge.task({ workflowName, taskName, ...runAnchors(ctx) }, async (outbound) =>
        run(outbound),
      );

    // ------------------------------------------------------------ dinh nghia khuon
    const workflow = hatchet.workflow<IntegrationHandoffInput>({
      // TEN MANG PHIEN BAN. Day la co che ghim phien ban cua Gate A, khong phai quy uoc dat ten.
      name: this.registration.engineName,
      description: 'Ban giao mot tham chieu thuc the toi mot dich den do khach cau hinh.',
    });

    // ① resolve — ten dich den LOGIC -> URL that. Khong thu lai: mot bien moi truong thieu se
    //    van thieu o lan thu hai, va thu lai chi lam cham luc phat hien ra cau hinh sai.
    const resolve = workflow.task({
      name: 'resolve',
      retries: 0,
      fn: (input: IntegrationHandoffInput, ctx) =>
        traced('resolve', ctx, () => {
          const url = resolveDestination(input.destination, env);
          // KHONG log URL: o mot cau hinh khach khac no co the mang token trong query.
          ctx.logger.info(`resolve ${input.destination} -> da co URL`);
          return { url, destination: input.destination, alreadyApplied: false, externalRef: '' };
        }),
    });

    /**
     * ①bis preflight — CHI CO O v2, va do la toan bo khac biet giua hai phien ban.
     *
     * Muc idempotency `lookup` (Gate C) la: he ngoai tra cuu duoc ban ghi da tao nhung KHONG
     * nhan khoa idempotency. Voi loai dich den do, an toan chi dat duoc bang cach HOI TRUOC khi
     * ghi — va cho toi truoc v2 thi muc giua nay chua gi hien thuc.
     *
     * Buoc nay la ly do v2 la mot phien ban THAT chu khong phai mot phien ban bia ra de co hai
     * phien ban cho de kiem hoi quy.
     */
    const upstream =
      this.registration.workflowVersion === 'v1'
        ? resolve
        : workflow.task({
            name: 'preflight',
            parents: [resolve],
            retries: 2,
            fn: (input: IntegrationHandoffInput, ctx) =>
              traced('preflight', ctx, async () => {
                const { url, destination } = await ctx.parentOutput(resolve);
                const operationKey = recomputeOperationKey(input, ctx.additionalMetadata());
                const found = await preflightLookup({ url, operationKey });
                if (found.alreadyApplied) {
                  ctx.logger.info('preflight: he ngoai DA co ban ghi cho khoa nay -> bo dispatch');
                }
                return {
                  url,
                  destination,
                  alreadyApplied: found.alreadyApplied,
                  externalRef: found.externalRef ?? '',
                };
              }),
          });

    // ② dispatch — buoc DUY NHAT co tac dung phu ra ngoai. Ba lan thu + backoff luy thua.
    const dispatch = workflow.task({
      name: 'dispatch',
      parents: [upstream],
      retries: 3,
      backoff: { factor: 2, maxSeconds: 60 },
      fn: (input: IntegrationHandoffInput, ctx) =>
        traced('dispatch', ctx, async (outboundTraceparent) => {
          const before = await ctx.parentOutput(upstream);
          const metadata = ctx.additionalMetadata();
          // DUNG LAI khoa thay vi nhan kem — xem `integration-handoff.steps.ts`. Viec dung lai
          // duoc chinh la bang chung khoa co tinh tat dinh, va tinh do moi chan duoc don trung
          // khi engine chay lai task nay (Hatchet tu cong bo at-least-once).
          const operationKey = recomputeOperationKey(input, metadata);

          // v2 da tra cuu va thay ban ghi ton tai -> KHONG goi lai. Day la cho muc `lookup` tra
          // cong: khong co header nao chan trung ho ta o phia he ngoai.
          if (before.alreadyApplied) {
            return { externalRef: before.externalRef, status: 200, operationKey, skipped: true };
          }

          // `outboundTraceparent` la QUYET DINH CUA CAU NOI, khong phai mot gia tri du phong:
          //   khong co runtime tracing -> soi day thua ke tu `additionalMetadata` (nhu hom nay);
          //   co runtime tracing       -> `undefined`, vi `instrumentation-undici` da tiem mot
          //                               header roi va hai header cung ten se bi noi lai bang
          //                               dau phay o dau ben kia.
          const result = await dispatchHandoff({
            url: before.url,
            operationKey,
            traceparent: outboundTraceparent ?? '',
            input,
          });
          ctx.logger.info(`dispatch lan ${ctx.retryCount() + 1} -> ${result.externalRef}`);
          return { ...result, operationKey, skipped: false };
        }),
    });

    // ③ settle — chot lai ket qua kem dau van tay PHIEN BAN CODE da chay.
    workflow.task({
      name: 'settle',
      parents: [dispatch],
      retries: 0,
      fn: (_input: IntegrationHandoffInput, ctx) =>
        traced('settle', ctx, async () => {
          const settled = await ctx.parentOutput(dispatch);
          const metadata = ctx.additionalMetadata();
          return {
            externalRef: settled.externalRef,
            operationKey: settled.operationKey,
            // Dau van tay nay tra loi cau "run do chay bang code phien ban nao" — cung cach
            // `version-spike.ts` da do duoc Gate A. Khong co no thi hoi quy phien ban khong con
            // gi de doc.
            engineVersion: this.registration.workflowVersion,
            workflowName: this.registration.engineName,
            workerName: this.registration.workerName,
            traceId: metadata['nexagnet.traceId'] ?? null,
          };
        }),
    });

    // ------------------------------------------------------------ khoi dong
    // Tu day tro di la DANG KY: engine phai xac nhan worker nay phuc vu action nao. Do la doan
    // da do duoc 6,3 s / 12 s / 30,1 s / 38 s (§29) — tuc la "cham" o day KHONG phai trieu chung.
    this.deps.onPhase?.('registering');
    this.worker = (await hatchet.worker(this.registration.workerName, {
      workflows: [workflow],
      slots: this.deps.slots ?? 5,
    })) as unknown as HatchetWorkerLike;

    // KHONG `await` cai nay: `start()` cua SDK chi giai quyet khi worker DUNG. Await o day se
    // treo boot vinh vien. Bat loi de mot worker chet giua chung khong thanh unhandled rejection.
    this.running = this.worker.start().catch((error: unknown) => {
      this.logger.error(`Worker dung bat thuong: ${message(error)}`);
    });

    // CHO tuong minh thay vi `sleep` mot con so doan mo. Day la khac biet giua "da goi start()"
    // va "engine DA BIET worker nay phuc vu action nao" — va chi cai thu hai moi lam cho mot
    // run kich hoat ngay sau do khong nam `QUEUED`.
    await this.worker.waitUntilReady();
    this.logger.log(
      `READY workflow=${this.registration.engineName} worker=${this.registration.workerName} pid=${process.pid}`,
    );
  }

  async stop(): Promise<void> {
    if (!this.worker) return;
    await this.worker.stop();
    // Cho vong doi ket thuc han roi moi tra ve: neu khong, tien trinh co the thoat trong khi
    // engine van tin worker nay con song, va run dang chay se treo cho toi luc het lease.
    await this.running;
    this.worker = undefined;
    this.running = undefined;
  }

  /**
   * Khoi tao TRE — cung ly do voi `HatchetWorkflowEngineAdapter`: tao client la mo mot ket noi
   * gRPC, va lam viec do trong constructor se bien "boot module worker" thanh "that bai khi
   * engine chua len". Boot va ket noi la hai chuyen khac nhau.
   */
  private hatchet(): HatchetClientType {
    if (this.overrides.client) return this.overrides.client;
    if (!this.client) {
      this.client = HatchetClient.init({
        token: this.config.token,
        ...(this.config.hostPort ? { host_port: this.config.hostPort } : {}),
        ...(this.config.namespace ? { namespace: this.config.namespace } : {}),
        ...(this.config.tlsStrategy
          ? { tls_config: { tls_strategy: this.config.tlsStrategy } }
          : {}),
      } as never);
    }
    return this.client;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
