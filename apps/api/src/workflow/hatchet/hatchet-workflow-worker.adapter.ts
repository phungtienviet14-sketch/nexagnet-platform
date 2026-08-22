import { Logger } from '@nestjs/common';
import type { WorkflowWorkerDeps, WorkflowWorkerHandle } from '../workflow-worker.adapter.js';
import type { WorkerRegistration } from '../worker-registration.js';
import {
  dispatchHandoff,
  recomputeOperationKey,
  resolveDestination,
  type IntegrationHandoffInput,
} from '../workflows/integration-handoff.steps.js';
import { HatchetClient, type HatchetClientType } from './hatchet-sdk.js';
import type { HatchetEngineConfig } from './hatchet-workflow-engine.adapter.js';

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
  ) {}

  async start(): Promise<void> {
    const env = this.deps.env ?? process.env;
    const hatchet = this.hatchet();

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
      fn: (input: IntegrationHandoffInput, ctx) => {
        const url = resolveDestination(input.destination, env);
        // KHONG log URL: o mot cau hinh khach khac no co the mang token trong query.
        ctx.logger.info(`resolve ${input.destination} -> da co URL`);
        return { url, destination: input.destination };
      },
    });

    // ② dispatch — buoc DUY NHAT co tac dung phu ra ngoai. Ba lan thu + backoff luy thua.
    const dispatch = workflow.task({
      name: 'dispatch',
      parents: [resolve],
      retries: 3,
      backoff: { factor: 2, maxSeconds: 60 },
      fn: async (input: IntegrationHandoffInput, ctx) => {
        const { url } = await ctx.parentOutput(resolve);
        const metadata = ctx.additionalMetadata();
        // DUNG LAI khoa thay vi nhan kem — xem `integration-handoff.steps.ts`. Viec dung lai
        // duoc chinh la bang chung khoa co tinh tat dinh, va tinh do moi chan duoc don trung
        // khi engine chay lai task nay (Hatchet tu cong bo at-least-once).
        const operationKey = recomputeOperationKey(input, metadata);
        const traceparent = metadata.traceparent ?? '';

        const result = await dispatchHandoff({ url, operationKey, traceparent, input });
        ctx.logger.info(`dispatch lan ${ctx.retryCount() + 1} -> ${result.externalRef}`);
        return { ...result, operationKey };
      },
    });

    // ③ settle — chot lai ket qua kem dau van tay PHIEN BAN CODE da chay.
    workflow.task({
      name: 'settle',
      parents: [dispatch],
      retries: 0,
      fn: async (_input: IntegrationHandoffInput, ctx) => {
        const upstream = await ctx.parentOutput(dispatch);
        const metadata = ctx.additionalMetadata();
        return {
          externalRef: upstream.externalRef,
          operationKey: upstream.operationKey,
          // Dau van tay nay tra loi cau "run do chay bang code phien ban nao" — cung cach
          // `version-spike.ts` da do duoc Gate A. Khong co no thi hoi quy phien ban khong con
          // gi de doc.
          engineVersion: this.registration.workflowVersion,
          workflowName: this.registration.engineName,
          workerName: this.registration.workerName,
          traceId: metadata['nexagnet.traceId'] ?? null,
        };
      },
    });

    // ------------------------------------------------------------ khoi dong
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
