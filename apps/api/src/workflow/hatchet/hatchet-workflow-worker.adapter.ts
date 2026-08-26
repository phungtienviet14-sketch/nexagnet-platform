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
import {
  ensureFollowup,
  loadHandoffState,
  recomputeFollowupKey,
  remainingWaitSeconds,
  resolveFollowupDestination,
  type SalesHandoffFollowupInput,
} from '../workflows/sales-handoff-followup.steps.js';
import { SALES_HANDOFF_FOLLOWUP_KEY } from '../workflow-registry.js';
import { describeWorkflowStep, engineWorkflowDescription } from '../workflow-catalog.js';
import { FOLLOWUP_STAGES } from '../workflows/sales-handoff-followup.steps.js';
import { tenantSalesHandoffFollowup } from '@netviet/tenant';
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
/** Doi tuong khuon do SDK tra ve. Chi dung de trao lai cho `hatchet.worker({ workflows })`. */
type WorkflowDefinition = ReturnType<HatchetClientType['workflow']>;

/**
 * BIEN THUC THI cua worker, duoi dang mot tham so.
 *
 * Truoc khi co khuon thu hai, `traced` la mot closure trong `start()`. Nay hai khuon deu phai
 * di qua no nen no thanh tham so — nhung bat bien khong doi: KHONG buoc nao thoat ra ngoai cau
 * noi, va `hatchet-workflow-worker.trace.spec.ts` van la thu giu dieu do.
 */
type TracedRunner = <T>(
  taskName: string,
  ctx: TaskRunContext & StepLogContext,
  run: (outboundTraceparent: string | undefined) => Promise<T> | T,
) => Promise<T>;

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

/**
 * Phan cua `ctx` dung de IN NHAN BUOC ra log cua engine.
 *
 * TACH KHOI `TaskRunContext` co chu dich. `TaskRunContext` tra loi cau "cau noi trace duoc doc
 * gi", va cau tra loi do phai giu nguyen do hep cua no. Cai duoi day tra loi mot cau khac —
 * "buoc VIET duoc ra dau" — va no khong doc gi ca.
 *
 * `logger` la TUY CHON vi ban gia trong bai kiem co the khong co no, va mot cai nhan khong dang
 * lam do mot buoc nghiep vu.
 */
interface StepLogContext {
  readonly logger?: { info(message: string): void };
}

/**
 * In NHAN TIENG VIET cua buoc ra log cua chinh buoc do.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI DI DUONG LOG, chu khong dat mot truong nhan tu te:
 *
 * `CreateBaseTaskOpts` cua SDK 1.28.2 chi co `name`, va `name` chinh la DANH TINH engine dinh
 * tuyen theo (`actionId`). Doi no de the buoc doc de hon = lam mo coi moi run dang cho va moi
 * worker dang dang ky. Khong co `description`, khong co `displayName` cho buoc.
 *
 * Nen nhan di duong con lai ma dashboard CO hien: tab Logs cua run. Mot dong cho moi buoc, dat
 * NGAY DAU buoc — ke ca buoc `wait`, von truoc ban nay khong in gi ca va vi the la doan im lang
 * dai nhat trong ca lan chay.
 *
 * FAIL-OPEN, va do la bat buoc: mot cai nhan khong duoc phep lam do mot buoc nghiep vu.
 */
function announceStep(ctx: StepLogContext, workflowKey: string, taskName: string): void {
  const { label } = describeWorkflowStep(workflowKey, taskName);
  // Danh ba chua biet buoc nay -> `label` chinh la khoa may. In lai no la nhieu, khong phai nhan.
  if (label === taskName) return;
  try {
    ctx.logger?.info(`[Bước] ${label}`);
  } catch {
    /* fail-open */
  }
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
    // KHOA MAY KHONG KEM PHIEN BAN — danh ba nguoi-doc khoa theo `sales-handoff-followup`, con
    // `engineName` mang duoi `.v1`. Lay nham thi moi buoc deu "chua co nhan" va im lang.
    const workflowKey = this.registration.workflowKey;

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
      ctx: TaskRunContext & StepLogContext,
      run: (outboundTraceparent: string | undefined) => Promise<T> | T,
    ): Promise<T> => {
      // Dat o DAY chu khong o tung `fn`: bat bien "moi buoc di qua `traced`" da duoc bai kiem
      // giu, nen mot buoc moi tu dong co nhan ma khong ai phai nho them mot dong.
      announceStep(ctx, workflowKey, taskName);
      return bridge.task({ workflowName, taskName, ...runAnchors(ctx) }, async (outbound) =>
        run(outbound),
      );
    };

    // ------------------------------------------------------------ dinh nghia khuon
    //
    // MOT TIEN TRINH = MOT KHUON. Nhanh nay chon khuon nao duoc dinh nghia, khong phai dinh
    // nghia ca hai roi chon luc dang ky: engine dinh tuyen viec theo `actionId`, nen mot worker
    // om ca hai se nhan ca viec cua khuon kia.
    const workflow =
      this.registration.workflowKey === SALES_HANDOFF_FOLLOWUP_KEY
        ? this.defineSalesHandoffFollowup(hatchet, traced, env)
        : this.defineIntegrationHandoff(hatchet, traced, env);

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

  /**
   * Khuon `integration-handoff` — ban giao mot tham chieu thuc the toi mot dich den ngoai.
   *
   * Tach ra khoi `start()` khi khuon thu hai xuat hien; NOI DUNG giu nguyen tung dong.
   */
  private defineIntegrationHandoff(
    hatchet: HatchetClientType,
    traced: TracedRunner,
    env: NodeJS.ProcessEnv,
  ): WorkflowDefinition {
    const workflow = hatchet.workflow<IntegrationHandoffInput>({
      // TEN MANG PHIEN BAN. Day la co che ghim phien ban cua Gate A, khong phai quy uoc dat ten.
      name: this.registration.engineName,
      ...this.engineDescription(),
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

    return workflow as unknown as WorkflowDefinition;
  }

  /**
   * Khuon `sales-handoff-followup` — WORKFLOW NGHIEP VU dau tien tren engine.
   *
   * ---------------------------------------------------------------------------
   * BA BUOC, va vi sao la ba chu khong phai mot:
   *
   *   (1) load-state    doc LAI trang thai NGAY BAY GIO. Chay TRUOC lan ngu, khong phai sau:
   *                     giua luc xep hang va luc worker nhan viec co mot khoang (outbox tick +
   *                     hang doi engine), va mot don duoc xu ly trong khoang do phai duoc phat
   *                     hien truoc khi ta dat mot cai hen gio nhieu ngay cho no.
   *
   *   (2) wait          `durableTask` + `ctx.sleepFor()`. Day la CA LY DO khuon nay can mot
   *                     workflow engine: lan ngu nay song sot qua deploy, qua worker chet, qua
   *                     ca may khoi dong lai. Mot `setTimeout` thi khong.
   *
   *   (3) recheck-mark  doc LAI lan nua roi moi danh dau. Buoc nay la noi bat bien "workflow
   *                     khong so huu su that nghiep vu" duoc thi hanh: neu nguoi that da xu ly
   *                     trong luc ta ngu, o day ta thay va IM LANG ket thuc.
   *
   * Tach ba buoc chu khong gop lam mot `durableTask`: dashboard cua engine hien tung buoc kem
   * so lan thu, nen "no dang ngu" va "no dang goi API" doc ra ngay — con gop lai thi ca hai
   * deu hien la mot o dang chay.
   */
  private defineSalesHandoffFollowup(
    hatchet: HatchetClientType,
    traced: TracedRunner,
    env: NodeJS.ProcessEnv,
  ): WorkflowDefinition {
    /**
     * NGUONG doc tu GOI KHACH, khong phai hang so trong code.
     *
     * Doc MOT LAN luc dang ky khuon: goi khach khong doi trong mot lan chay. Khach khong khai
     * (`null`) thi van dang ky khuon, vi mot run da xep hang TRUOC khi khach tat policy van
     * phai chay het cho tu te — no se ket thuc o buoc (1).
     */
    const policy = tenantSalesHandoffFollowup();
    const stage = FOLLOWUP_STAGES[0];
    // Khoa API noi bo. Vang mat o che do demo/CI (`AUTH_MODE=none`) -> khong gui header.
    const apiKey = env.API_KEY?.trim();

    const workflow = hatchet.workflow<SalesHandoffFollowupInput>({
      // TEN MANG PHIEN BAN — co che ghim phien ban cua Gate A.
      name: this.registration.engineName,
      ...this.engineDescription(),
    });

    // (1) load-state — doc lai tu DB nghiep vu. `retries: 2` vi mot lan doc that bai la loi mang,
    //     khong phai loi nghiep vu; con cau hinh sai thi `resolveFollowupDestination` nem voi
    //     `retryable: false` va so lan thu khong cuu duoc gi.
    const loadState = workflow.task({
      name: 'load-state',
      retries: 2,
      fn: (input: SalesHandoffFollowupInput, ctx) =>
        traced('load-state', ctx, async (outboundTraceparent) => {
          const baseUrl = resolveFollowupDestination(input.destination, env);
          const state = await loadHandoffState({
            baseUrl,
            entityId: input.entityId,
            ...(apiKey ? { apiKey } : {}),
            ...(outboundTraceparent ? { traceparent: outboundTraceparent } : {}),
          });

          if (state.state !== 'pending') {
            ctx.logger.info(
              `load-state ${input.entityId}: viec da xong (${state.state}) -> khong dat hen gio`,
            );
            return { baseUrl, stillPending: false, waitSeconds: 0 };
          }
          // Khach tat policy sau khi run da xep hang -> khong con nguong de cho. Ket thuc sach
          // se, khong doan mot con so thay ho.
          if (!policy?.enabled) {
            ctx.logger.info(`load-state ${input.entityId}: khach khong bat theo doi -> ket thuc`);
            return { baseUrl, stillPending: false, waitSeconds: 0 };
          }

          const waitSeconds = remainingWaitSeconds(
            state.openedAt,
            policy.remindAfterSeconds,
            new Date(),
          );
          ctx.logger.info(`load-state ${input.entityId}: con treo, con cho ${waitSeconds}s`);
          return { baseUrl, stillPending: true, waitSeconds };
        }),
    });

    /**
     * (2) wait — LAN NGU BEN VUNG.
     *
     * `durableTask` chu khong phai `task`: `ctx.sleepFor()` cua Hatchet la "global", tuc no dem
     * theo thoi gian THAT va song sot qua worker restart. Mot `await setTimeout()` trong mot
     * task thuong se chet cung tien trinh va keo theo ca lan cho.
     *
     * `retries: 0` co chu y: mot lan ngu khong "that bai" theo nghia thu lai duoc, va thu lai
     * mot lan ngu la ngu them mot lan nua.
     */
    const wait = workflow.durableTask({
      name: 'wait',
      parents: [loadState],
      retries: 0,
      /**
       * Tran thoi gian song cua mot lan chay. Phai LON HON nguong cua khach — nen no doc tu
       * chinh nguong do cong mot bien an toan, khong phai mot hang so doan mo. Thieu no thi mot
       * nguong dai hon mac dinh cua engine se bi cat ngang giua chung.
       */
      executionTimeout: `${(policy?.remindAfterSeconds ?? 60) + 3600}s`,
      fn: (_input: SalesHandoffFollowupInput, ctx) =>
        traced('wait', ctx, async () => {
          const before = await ctx.parentOutput(loadState);
          if (!before.stillPending || before.waitSeconds <= 0) {
            return { slept: false };
          }
          await ctx.sleepFor(`${before.waitSeconds}s`);
          return { slept: true };
        }),
    });

    // (3) recheck-mark — doc LAI, roi moi danh dau. Khong tin vao ban chup cua buoc (1).
    workflow.task({
      name: 'recheck-mark',
      parents: [wait],
      retries: 3,
      backoff: { factor: 2, maxSeconds: 60 },
      fn: (input: SalesHandoffFollowupInput, ctx) =>
        traced('recheck-mark', ctx, async (outboundTraceparent) => {
          const before = await ctx.parentOutput(loadState);
          const metadata = ctx.additionalMetadata();
          const common = {
            baseUrl: before.baseUrl,
            entityId: input.entityId,
            ...(apiKey ? { apiKey } : {}),
            ...(outboundTraceparent ? { traceparent: outboundTraceparent } : {}),
          };

          if (!before.stillPending) {
            return { applied: false, outcome: 'resolved-before-wait', stage };
          }

          // DOC LAI. Day la cho con nguoi "thang" workflow: neu ho da bam xong trong luc ta ngu,
          // ta thay o day va khong nhac gi ca.
          const now = await loadHandoffState(common);
          if (now.state !== 'pending') {
            ctx.logger.info(
              `recheck ${input.entityId}: nguoi da xu ly trong luc cho (${now.state}) -> khong nhac`,
            );
            return { applied: false, outcome: `resolved-${now.state}`, stage };
          }

          const operationKey = recomputeFollowupKey(input, metadata, stage);
          const marked = await ensureFollowup({ ...common, stage, operationKey });
          ctx.logger.info(
            `recheck ${input.entityId}: danh dau=${marked.applied} khoa=${operationKey}`,
          );
          return {
            applied: marked.applied,
            outcome: marked.applied ? 'marked' : 'already-marked',
            stage,
            // Dau van tay phien ban code da chay — cung cach `integration-handoff` lam.
            engineVersion: this.registration.workflowVersion,
            traceId: metadata['nexagnet.traceId'] ?? null,
          };
        }),
    });

    return workflow as unknown as WorkflowDefinition;
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
   * MO TA cua khuon, dang manh de rai vao `hatchet.workflow({...})`.
   *
   * NGUON LA DANH BA NGUOI-DOC (`workflow-catalog.ts`), khong phai mot chuoi go tay o day. Truoc
   * ban nay moi khuon tu giu mot cau mo ta rieng, va hai ban do da bat dau troi khoi nhau: console
   * cua ta noi "Nhac Sale sau ban giao", con dashboard cua engine noi mot cau khac han. Cung mot
   * khuon thi phai doc len giong nhau o ca hai man hinh.
   *
   * Khuon danh ba chua biet -> mot object RONG, tuc bo han truong `description`. Xem
   * `engineWorkflowDescription()`.
   */
  private engineDescription(): { description?: string } {
    const description = engineWorkflowDescription(this.registration.workflowKey);
    return description ? { description } : {};
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
