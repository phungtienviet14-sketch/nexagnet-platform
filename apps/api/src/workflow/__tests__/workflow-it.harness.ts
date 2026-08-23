import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * BO DO DUNG CHUNG cho cac bai kiem DO TIN CAY cua workflow engine.
 *
 * Tach ra khoi `workflow-e2e.int.spec.ts` vi nam bai kiem (cua so sup outbox, engine chet/song
 * lai, worker bi giet, hai worker cung phien ban, rieng tu doc tu engine) deu can DUNG BO DO NAY.
 * Sao chep no nam lan la cach chac chan nhat de nam ban troi khac nhau — va luc do mot bai xanh
 * khong con noi len dieu gi vi khong ai biet no dang do bang thuoc nao.
 *
 * KHONG phai file `.spec.ts`: vitest chi gom `src/**` + `*.spec.ts`, nen file nay khong bao gio
 * bi coi la mot bo test rong. Cung khuon `pipeline/__tests__/fake-parser.ts` da co san trong repo.
 *
 * KHONG import `vitest` o day. Bo do phai dung duoc ca tu mot tien trinh con thuong (xem
 * `crash-window-child.ts`), noi khong co runner nao chay.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ CAC BAI KIEM DUNG BO DO NAY PHAI CHAY TUAN TU:
 *
 *     pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
 *
 * Khong phai vi chung "hoi mong manh". Ly do la mot su that ve KIEN TRUC, va no da lo ra bang
 * mot phep do (23/08/2026): chay song song 5 file -> 9 bai DO; chay tuan tu -> 154/154 XANH.
 *
 * Nguyen nhan: moi file dung MOT tien trinh worker rieng, nhung ca nam deu dang ky CUNG mot ten
 * `integration-handoff.v1` voi CUNG mot engine. Engine dinh tuyen theo TEN, nen worker cua file
 * A nhan duoc run do file B kich hoat — roi no phan giai `WORKFLOW_DESTINATION_PROOF_ENDPOINT`
 * tu MOI TRUONG CUA CHINH NO va goi vao diem cuoi cua file A. File B ngoi doi mot lan goi khong
 * bao gio toi.
 *
 * DIEU NAY KHONG CHI DUNG VOI TEST. No la bang chung chay duoc cho bat bien §4.1 cua runbook —
 * MOI KHACH / MOI MOI TRUONG MOT INSTANCE HATCHET RIENG. Hai ban trien khai dung chung mot engine
 * va cung dang ky mot ten workflow se CUOP RUN CUA NHAU, va moi ben se gui du lieu cua ben kia
 * toi dich den cua chinh minh. Day la mot loi CACH LY DU LIEU, khong phai mot phien toai ve lich
 * chay. Nam file test o tren tinh co da dien lai dung kich ban do.
 */

const here = dirname(fileURLToPath(import.meta.url));
/** `apps/api` — goc de spawn tien trinh worker va de tro toi cac goi khach fixture. */
export const apiDir = resolve(here, '../../..');

/** Goi khach fixture CO BAT engine, phien ban `v1`. */
export const WORKFLOW_FIXTURE = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/workflow-enabled',
);
/** Cung khuon, chi khac `version: 'v2'` + `idempotency: 'lookup'`. */
export const WORKFLOW_FIXTURE_V2 = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/workflow-enabled-v2',
);

/**
 * Worker mat ~38 giay de dang ky xong tren engine nguoi (~12s khi am) — do duoc 22/08/2026.
 * Moi thoi han duoi day lay tu con so do chu khong tu cam giac, va chinh no la con so phai vao
 * `start_period` cua healthcheck luc viet compose production.
 */
export const WORKER_READY_TIMEOUT_MS = 120_000;
export const RUN_COMPLETE_TIMEOUT_MS = 90_000;

/**
 * Dau nhan tren `Order.chatId` cua cac hang do bai kiem cua so sup tao ra.
 *
 * NAM O DAY chu khong o `crash-window-child.ts` co ly do dat gia: file do la mot tien trinh TU
 * GIET CHINH MINH luc chay. Bai test import mot hang so tu no la du de `main()` cua no thuc thi
 * NGAY TRONG worker cua vitest — va SIGKILL do giet luon runner. Da vap dung vao dieu do khi
 * viet bai nay: trieu chung la `ERR_IPC_CHANNEL_CLOSED`, khong lien quan gi toi nguyen nhan.
 *
 * Quy tac rut ra: hang so dung chung nam o module KHONG CO TAC DUNG PHU.
 */
export const CRASH_WINDOW_CHAT_ID = 'IT-workflow-crash-window';

// ------------------------------------------------------- diem cuoi co kiem soat

export interface EndpointCall {
  readonly idempotencyKey: string | null;
  readonly traceparent: string | null;
  readonly body: Record<string, unknown>;
  /** Lan thu MAY cho chinh khoa nay — de dem "mot tac dung co bi ap dung hai lan khong". */
  readonly attempt: number;
}

export type ProofEndpointMode = 'ok' | 'fail_then_ok' | 'rate_limited' | 'hold' | 'reject_4xx';

/**
 * He ngoai GIA LAP nhung la mot may chu HTTP THAT — no phai tra 500/429/4xx/treo theo yeu cau de
 * chung minh retry chay that chu khong phai chi doc tai lieu.
 *
 * HAI CON SO PHAI TACH BACH, va do la ca ly do lop nay ton tai:
 *
 *   postsFor(key)   so lan he ngoai NHAN duoc yeu cau cho khoa do
 *   appliedFor(key) he ngoai co AP DUNG (tao ban ghi) cho khoa do khong
 *
 * `posts = 3, applied = 1` la ket qua DUNG cua at-least-once + khoa idempotency. Gop hai con so
 * nay lam mot se lam bao cao noi doi theo ca hai chieu: hoac giau mat viec da goi ba lan, hoac
 * bao dong gia rang co ba ban ghi.
 */
export class ProofEndpoint {
  private server?: Server;
  readonly calls: EndpointCall[] = [];
  /** Cac lan TRA CUU (GET) — dau van tay rieng cua buoc `preflight`, tuc la cua code v2. */
  readonly lookups: string[] = [];
  private readonly attemptsByKey = new Map<string, number>();
  private readonly appliedKeys = new Set<string>();
  /** Cac yeu cau dang bi GIU. Duong de tao ra mot run "dang do" ma khong phai doan thoi gian. */
  private readonly held: Array<() => void> = [];
  mode: ProofEndpointMode = 'ok';
  failTimes = 2;

  async listen(): Promise<number> {
    this.server = createServer((req, res) => {
      // TRA CUU (muc idempotency `lookup`) — CHI code v2 goi duong nay, vi chi v2 co buoc
      // `preflight`. Do la cach test doc duoc "run nay chay bang phien ban nao" tu BEN NGOAI.
      if (req.method === 'GET') {
        const key = new URL(req.url ?? '/', 'http://x').searchParams.get('key') ?? 'no-key';
        this.lookups.push(key);
        if (this.appliedKeys.has(key)) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ externalRef: `EXT-${key}` }));
          return;
        }
        res.writeHead(404).end(JSON.stringify({ error: 'NOT_FOUND' }));
        return;
      }

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

        const succeed = (): void => {
          // AP DUNG dung mot lan cho moi khoa. `Set` la chinh hanh vi cua mot he ngoai co ton
          // trong `Idempotency-Key`, va no la thuoc do "tac dung phu co bi nhan doi khong".
          this.appliedKeys.add(key);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ externalRef: `EXT-${key}` }));
        };

        if (this.mode === 'hold') {
          // GIU yeu cau lai — run nam trong buoc `dispatch` cho toi khi test tha ra. Day la cach
          // tao mot run "dang do" CO KIEM SOAT, thay vi them mot buoc cho chi de test co cho chen.
          this.held.push(succeed);
          return;
        }
        if (this.mode === 'rate_limited') {
          res.writeHead(429).end(JSON.stringify({ error: 'RATE_LIMITED' }));
          return;
        }
        if (this.mode === 'reject_4xx') {
          res.writeHead(422).end(JSON.stringify({ error: 'UNPROCESSABLE' }));
          return;
        }
        if (this.mode === 'fail_then_ok' && attempt <= this.failTimes) {
          res.writeHead(500).end(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE' }));
          return;
        }
        succeed();
      });
    });

    await new Promise<void>((done) => {
      this.server!.listen(0, '127.0.0.1', done);
    });
    return (this.server!.address() as AddressInfo).port;
  }

  /** Tha het cac yeu cau dang bi giu. */
  release(): void {
    for (const respond of this.held.splice(0)) respond();
  }

  /** So lan he ngoai NHAN duoc yeu cau cho khoa nay. */
  attemptsFor(key: string): number {
    return this.attemptsByKey.get(key) ?? 0;
  }

  /** Ten doc ro hon cho cung con so — dung o cac bai dem tac dung phu. */
  postsFor(key: string): number {
    return this.attemptsFor(key);
  }

  /** He ngoai DA tao ban ghi cho khoa nay chua. */
  appliedFor(key: string): boolean {
    return this.appliedKeys.has(key);
  }

  /** Tong so ban ghi DA duoc tao — dem tac dung phu tren toan bo bai. */
  appliedCount(): number {
    return this.appliedKeys.size;
  }

  lookupsFor(key: string): number {
    return this.lookups.filter((seen) => seen === key).length;
  }

  callsFor(key: string): EndpointCall[] {
    return this.calls.filter((call) => call.idempotencyKey === key);
  }

  async close(): Promise<void> {
    this.release();
    await new Promise<void>((done) => {
      this.server?.close(() => done());
    });
  }
}

// ---------------------------------------------------------- tien trinh worker

export interface WorkerProcessOptions {
  /**
   * Nhan de doc log khi co NHIEU worker cung phien ban trong mot bai. KHONG di vao engine —
   * ten dang ky voi engine do `resolveWorkerRegistration()` quyet dinh, va viec hai tien trinh
   * cung phien ban mang cung mot ten la dieu bai hai-worker di DO chu khong phai di sua.
   */
  readonly label?: string;
}

/**
 * Tien trinh worker duoi quyen kiem soat cua test: len duoc, tat duoc, GIET duoc.
 * Khuon lay tu `tools/poc-workflow-engine/src/version-spike.ts` — no da chay that.
 */
export class WorkerProcess {
  private child?: ChildProcess;
  private text = '';

  constructor(
    readonly version: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly options: WorkerProcessOptions = {},
  ) {}

  get label(): string {
    return this.options.label ?? this.version;
  }

  /** Toan bo stdout+stderr da gom duoc. Doc duoc de dem so lan mot buoc chay lai. */
  get output(): string {
    return this.text;
  }

  /**
   * Khoi dong va CHO toi khi engine da biet worker nay.
   *
   * CO THU LAI, va do khong phai su de dat: mot cong gRPC dang lang nghe KHONG dong nghia engine
   * da san sang phuc vu `PutWorkflow`. Ngay sau khi engine khoi dong lai, worker co the chet
   * ngay luc dang ky voi `UNAVAILABLE`. Production giai quyet dieu nay bang `restart: always`;
   * bo do nay mo phong dung co che do, nen bai kiem do CHINH hanh vi ma compose se do.
   */
  async start(attempts = 3): Promise<void> {
    let last: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.spawnOnce();
        return;
      } catch (error) {
        last = error;
        await this.kill();
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    throw last;
  }

  private async spawnOnce(): Promise<void> {
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
      this.text += chunk.toString();
    };
    // `stdio` da khai bao 'pipe' cho ca hai, nen hai luong nay chac chan co mat.
    child.stdout!.on('data', collect);
    child.stderr!.on('data', collect);
    let exitedEarly = false;
    child.once('exit', () => {
      exitedEarly = true;
    });
    this.child = child;

    // Cho DONG READY that su, khong `sleep` mot con so doan mo. Do la giao keo giua worker va
    // test — worker chi in dong nay sau khi `waitUntilReady()` cua SDK tra ve.
    await waitFor(
      () => {
        if (this.text.includes(`READY workflow=integration-handoff.${this.version}`)) return true;
        // Chet TRUOC khi bao READY: khong co ly do gi cho tiep het thoi han. Bao ngay de vong
        // thu lai o `start()` xu ly, thay vi dot 120 giay cho mot tien trinh khong con ton tai.
        if (exitedEarly) throw new Error(`worker ${this.label} thoat truoc khi bao READY`);
        return false;
      },
      WORKER_READY_TIMEOUT_MS,
      () => `worker ${this.label} khong bao READY. Output:\n${this.text.slice(-2000)}`,
    );
  }

  /** Dem so lan mot dong log xuat hien — de do "buoc nay chay lai may lan". */
  countLog(needle: string): number {
    return this.text.split(needle).length - 1;
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

export async function waitFor(
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

// ------------------------------------------------------------ boot AppModule

/**
 * Bien moi truong cua mot tien trinh Nexagnet trong bai kiem.
 *
 * `PERSISTENCE` de MO: bai E2E chay `memory` (nhanh, khong can DB), bai do DO BEN cua outbox
 * BAT BUOC `prisma` — va do chinh la khac biet lam cho bai thu hai co y nghia.
 */
export function baseEnv(
  fixture: string,
  endpointPort: number,
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TENANT_DIR: fixture,
    PERSISTENCE: 'memory',
    CHANNEL_MODE: 'mock',
    NODE_ENV: 'test',
    WORKFLOW_ENGINE_HOST_PORT: process.env.WORKFLOW_ENGINE_HOST_PORT ?? 'localhost:7744',
    WORKFLOW_ENGINE_TLS_STRATEGY: process.env.WORKFLOW_ENGINE_TLS_STRATEGY ?? 'none',
    WORKFLOW_DESTINATION_PROOF_ENDPOINT: `http://127.0.0.1:${endpointPort}/handoff`,
    ...extra,
  };
  // `TENANT` va `TENANT_DIR` loai tru nhau; de ca hai thi loader chon `TENANT` va bai kiem se
  // lang le chay tren goi khach that cua may dev.
  delete env.TENANT;
  return env;
}

export interface HandoffApi {
  handoff: (
    request: {
      workflowKey: string;
      operation: string;
      entityType: string;
      entityId: string;
    },
    tx?: unknown,
  ) => Promise<{ outcome: string; reason: string; operationKey?: string }>;
}

export interface BootedApp {
  readonly context: {
    get: (token: never, options?: object) => unknown;
    close: () => Promise<void>;
  };
  readonly handoff: HandoffApi;
}

/**
 * Boot `AppModule.forRoot()` THAT.
 *
 * Nap dong SAU khi da dat bien moi truong, vi `app.module.ts` keo theo loader goi khach va
 * loader do doc `process.env.TENANT` NGAY LUC IMPORT.
 *
 * `abortOnError: false` la BAT BUOC: mac dinh cua Nest khi do thi DI hong la `process.abort()`,
 * no giet luon worker cua vitest nen mot bai "phai NEM" se lam sap ca file thay vi do mot
 * khang dinh.
 */
export async function bootAppContext(env: NodeJS.ProcessEnv): Promise<BootedApp> {
  Object.assign(process.env, env);
  delete process.env.TENANT;
  const { resetTenantCache } = await import('@netviet/tenant');
  resetTenantCache();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../app.module.js');
  const { WorkflowHandoffService } = await import('../workflow-handoff.service.js');

  const context = (await NestFactory.createApplicationContext(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  })) as never as BootedApp['context'];

  return {
    context,
    handoff: context.get(WorkflowHandoffService as never, { strict: false }) as HandoffApi,
  };
}

// ------------------------------------------- tien trinh con "commit roi chet"

export interface CrashWindowResult {
  readonly outcome: 'COMMITTED' | 'ROLLED_BACK' | 'FAILED';
  /** `Order.id` — cung la `entityId` cua hang outbox. */
  readonly orderId: string;
  readonly operationKey: string;
  readonly output: string;
}

const CRASH_WINDOW_CHILD = 'src/workflow/__tests__/crash-window-child.ts';

/**
 * Chay `crash-window-child.ts` va doc mot dong ket qua cua no.
 *
 * DUNG CHUNG boi bai do ben (W4) va bai hoi phuc (W5), va ly do khong chi la tranh sao chep:
 * ca hai bai deu can mot hang outbox duoc tao qua CUA CHINH roi khong con tien trinh nao song
 * de tick ho. Neu moi bai tu dung mot cach tao hang thi hai bai dang do hai thu khac nhau ma
 * ten goi giong nhau.
 *
 * KHONG khang dinh ma thoat: o che do mac dinh tien trinh TU SIGKILL chinh minh, nen ma thoat la
 * `null` + signal `SIGKILL`. Do la BANG CHUNG no da chet that chu khong phai thoat sach.
 */
export async function runCrashWindowChild(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<CrashWindowResult> {
  return new Promise((settle, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', '@swc-node/register/esm-register', CRASH_WINDOW_CHILD, ...args],
      { cwd: apiDir, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const collect = (c: Buffer): void => {
      output += c.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('exit', () => {
      const line = output.split('\n').find((l) => l.startsWith('CHILD '));
      if (!line) {
        reject(new Error(`tien trinh con khong bao ket qua. Output:\n${output.slice(-3000)}`));
        return;
      }
      const [, outcome, orderId, operationKey] = line.trim().split(' ');
      settle({
        outcome: outcome as CrashWindowResult['outcome'],
        orderId: orderId ?? '',
        operationKey: operationKey ?? '',
        output,
      });
    });
  });
}

// ------------------------------------------------------- engine con song khong

/**
 * Cong gRPC cua engine co dang lang nghe khong.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG `runs.list()` LAM PHEP DO SONG/CHET — da vap dung vao (23/08/2026):
 *
 * `runs.list()` di qua REST, ma REST duoc phuc vu qua container DASHBOARD (cong 8744). Tat
 * `hatchet-engine` KHONG lam REST im, nen phep do do bao "engine van song" trong khi worker thi
 * `ECONNREFUSED` o cong gRPC. Hai kenh, hai cong, hai container — mot phep do tren kenh nay
 * khong noi duoc gi ve kenh kia.
 *
 * Bai kiem hoi phuc dung phep do SAI se cho ket qua nguoc han: no tuong da tao duoc canh
 * "engine chet" trong khi thuc te chua.
 *
 * Nen: do DUNG cong ma worker va adapter dung, va do bang cach ma chung do — mo mot ket noi TCP.
 */
export async function enginePortOpen(hostPort?: string): Promise<boolean> {
  const target = hostPort ?? process.env.WORKFLOW_ENGINE_HOST_PORT ?? 'localhost:7744';
  const index = target.lastIndexOf(':');
  const host = target.slice(0, index);
  const port = Number(target.slice(index + 1));

  return new Promise((settle) => {
    const socket = connect({ host, port });
    const done = (open: boolean): void => {
      socket.destroy();
      settle(open);
    };
    socket.setTimeout(2_000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// -------------------------------------------------- doc nguoc tu engine THAT

interface EngineReadClient {
  runs: {
    list: (opts: Record<string, unknown>) => Promise<{ rows?: unknown[] }>;
    get: (id: string) => Promise<unknown>;
  };
}

/**
 * Client Hatchet cho BAI KIEM doc nguoc trang thai da luu tren engine.
 *
 * CO Y khong di qua `WorkflowEnginePort`: cong do khong co — va khong nen co — cua doc lai
 * `input` cua run. Them mot cua doc payload vao production la them mot duong de PII roi vao log
 * cua chinh ta. Bai kiem dong vai KIEM TOAN VIEN, va kiem toan vien duoc phep mo tu ho so.
 */
export async function engineReadClient(): Promise<EngineReadClient> {
  const { HatchetClient } = await import('../hatchet/hatchet-sdk.js');
  return HatchetClient.init({
    token: process.env.WORKFLOW_ENGINE_TOKEN,
    host_port: process.env.WORKFLOW_ENGINE_HOST_PORT ?? 'localhost:7744',
    tls_config: { tls_strategy: process.env.WORKFLOW_ENGINE_TLS_STRATEGY ?? 'none' },
  } as never) as never as EngineReadClient;
}

/**
 * Dem so run cua mot khuon mang mot neo metadata cu the.
 *
 * Dung cho khang dinh "engine CHUA co run nao" o bai cua so sup — va do la khang dinh chi doc
 * duoc o day, khong doc duoc tu phia Nexagnet.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ HINH DANG CUA BO LOC LA MOT DOI TUONG, KHONG PHAI MANG `"khoa:gia tri"`.
 *
 * Da viet sai mot lan (23/08/2026) va do la loai sai NGUY HIEM NHAT trong ca bo kiem: bo loc sai
 * tra ve 0 hang, ma phan lon cho dung ham nay lai khang dinh **bang 0**. Bai test XANH, va no
 * xanh vi phep do khong bao gio do duoc gi — dung nghia "nhan sai con te hon khong co nhan".
 *
 * Nen `countEngineRuns` phai duoc kiem bang mot ca DUONG TINH o dau do (bai timeout mo ho khang
 * dinh `=== 2`), neu khong thi khong ai biet no con chay khong.
 */
export async function countEngineRuns(
  workflowName: string,
  metadataKey: string,
  metadataValue: string,
): Promise<number> {
  const client = await engineReadClient();
  const result = await client.runs.list({
    workflowNames: [workflowName],
    additionalMetadata: { [metadataKey]: metadataValue },
    onlyTasks: false,
    limit: 50,
    includePayloads: false,
  });
  return result.rows?.length ?? 0;
}
