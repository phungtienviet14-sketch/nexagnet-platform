/**
 * SPIKE GATE A — "mot run dang chay co bi ban deploy moi cuop mat khong?"
 *
 * Day la mot THI NGHIEM CO DOI CHUNG, khong phai mot ban demo. Cung mot kich ban chay hai lan
 * voi hai chien luoc dat ten; ket qua PHAI khac nhau, neu khong thi phep do khong co gia tri:
 *
 *   --strategy=shared      -> ky vong FAIL  (chung minh phep do co rang)
 *   --strategy=versioned   -> ky vong PASS
 *
 * Kich ban chinh (§4 cua yeu cau), chay THAT tren engine dang song:
 *
 *   ① worker v1 len   ② run A vao buoc `park` (cho ben vung)   ③ worker v2 len (v1 CON SONG)
 *   ④ run B moi phai di v2   ⑤ tha su kien cho run A   ⑥ MOI buoc con lai cua A phai la v1
 *   ⑦ v1 xa het   ⑧ tat v1 khong lam hong lich su cua A
 *
 * Kich ban phu ⑨ — che do hong khi v1 da bien mat: run C dang `park`, tat v1, chi con v2.
 * Ky vong: C NAM CHO, tuyet doi khong nhay sang code v2. "Treo va thay duoc" la chap nhan duoc;
 * "am tham chay code khac" thi khong.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hatchet } from './hatchet-client.js';
import {
  APPROVAL_EVENT,
  SPIKE_KEY,
  spikeWorkflowName,
  type SpikeStrategy,
} from './spike-workflow.js';

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(here, '..');
const TSX_CLI = resolve(projectDir, 'node_modules/tsx/dist/cli.mjs');
const WORKER_ENTRY = resolve(projectDir, 'src/spike-worker.ts');

const strategy: SpikeStrategy = process.argv.includes('--strategy=versioned')
  ? 'versioned'
  : 'shared';
/** Cho `park` du lau de con nguoi/khung thoi gian cua spike khong bao gio la thu ket thuc no. */
const PARK_TIMEOUT = '600s';

// ------------------------------------------------------------------ tien ich

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type StepStamp = {
  taskName: string;
  engineVersion: string;
  workerName: string;
  workflowName: string;
};

interface Assertion {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

const assertions: Assertion[] = [];

function check(id: string, name: string, pass: boolean, detail: string): void {
  assertions.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${name} — ${detail}`);
}

/** Tien trinh worker duoi quyen kiem soat cua spike: len duoc, tat duoc, biet luc nao san sang. */
class SpikeWorker {
  private child?: ChildProcessByStdio<null, Readable, Readable>;

  constructor(
    readonly version: 'v1' | 'v2',
    private readonly namingStrategy: SpikeStrategy,
  ) {}

  get workflowName(): string {
    return spikeWorkflowName(this.namingStrategy, this.version);
  }

  async start(): Promise<void> {
    const child = spawn(process.execPath, [TSX_CLI, WORKER_ENTRY], {
      cwd: projectDir,
      env: {
        ...process.env,
        POCWF_VERSION: this.version,
        POCWF_SPIKE_STRATEGY: this.namingStrategy,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    await new Promise<void>((resolveReady, rejectReady) => {
      const timer = setTimeout(
        () => rejectReady(new Error(`worker ${this.version} khong READY sau 60s`)),
        60_000,
      );
      child.stdout.on('data', (buf: Buffer) => {
        const line = buf.toString();
        if (line.includes('[spike-worker] READY')) {
          clearTimeout(timer);
          console.log(`      ${line.trim()}`);
          resolveReady();
        }
      });
      child.stderr.on('data', (buf: Buffer) => {
        const text = buf.toString();
        if (!text.includes('DeprecationWarning') && !text.includes('have been moved to')) {
          process.stderr.write(`      [worker ${this.version} stderr] ${text}`);
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        rejectReady(new Error(`worker ${this.version} thoat som (code=${code})`));
      });
    });
  }

  /** Tat NHE NHANG (SIGTERM) — dung khuon mot ban deploy that rut worker cu. */
  async stop(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    this.child = undefined;
    child.removeAllListeners('exit');
    await new Promise<void>((done) => {
      child.once('exit', () => done());
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
        done();
      }, 8_000);
    });
  }
}

/** Kich hoat theo TEN workflow — dung duong ma mot dispatcher that se dung. */
async function trigger(workflowName: string, ref: string): Promise<string> {
  const runRef = await hatchet.runNoWait(
    workflowName,
    { tenant: 'tenant-alpha', ref, parkTimeout: PARK_TIMEOUT },
    { additionalMetadata: { 'nexagnet.ref': ref, 'nexagnet.tenant': 'tenant-alpha' } },
  );
  return runRef.runId;
}

/**
 * Hinh dang THAT ma engine tra ve. Da kiem bang tay tren run that:
 * `runs.getDetails()` bao `begin` la QUEUED trong khi `begin` DA COMPLETED — chi `runs.get()`
 * moi cho ra `tasks[]` co `actionId`, `status` va `output` dung. Doc thu sai la do sai.
 */
interface EngineTask {
  actionId?: string;
  displayName?: string;
  status?: string;
  attempt?: number;
  output?: unknown;
}
interface EngineRun {
  run?: { status?: string } & Record<string, unknown>;
  tasks?: EngineTask[];
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/**
 * Doc mot run, CHIU DUOC do tre hien thi cua engine.
 *
 * Do duoc that: ngay sau `runNoWait`, REST tra 404 trong vai tram mili-giay dau — run da ton tai
 * trong engine nhung chua hien ra o duong doc. Neu de 404 nem ra ngoai thi spike chet o cau
 * "chua kip nhin thay" chu khong phai o cau dang hoi. Xem no la "chua co gi de ke".
 */
async function details(runId: string): Promise<EngineRun> {
  try {
    return (await hatchet.runs.get(runId)) as unknown as EngineRun;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) return {};
    throw error;
  }
}

/** `actionId` cua engine co dang `<tenWorkflow>:<tenBuoc>` — lay phan sau dau hai cham cuoi. */
function taskNameOf(task: EngineTask): string {
  const id = task.actionId ?? task.displayName ?? '';
  const cut = id.lastIndexOf(':');
  return cut >= 0 ? id.slice(cut + 1) : id;
}

/** Doc dau van tay CODE cua tung buoc DA CHAY XONG. Buoc chua xong thi chua ke gi duoc. */
function stamps(detail: EngineRun): StepStamp[] {
  return (detail.tasks ?? []).flatMap((task) => {
    const output = task.output as (Partial<StepStamp> & { step?: string }) | null | undefined;
    if (!output || typeof output !== 'object' || !output.engineVersion) return [];
    return [
      {
        taskName: taskNameOf(task),
        engineVersion: output.engineVersion,
        workerName: output.workerName ?? 'unknown',
        workflowName: output.workflowName ?? 'unknown',
      },
    ];
  });
}

function isTerminal(detail: EngineRun): boolean {
  return TERMINAL.has(String(detail.run?.status ?? ''));
}

async function waitUntil(
  label: string,
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 1_500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  console.log(`      (het gio cho: ${label})`);
  return false;
}

/** Run da vao buoc `park` chua? Dau hieu: `begin` da xong, `park` chua xong. */
async function isParked(runId: string): Promise<boolean> {
  const done = new Set(stamps(await details(runId)).map((s) => s.taskName));
  return done.has('begin') && !done.has('park');
}

/**
 * Don rac tu cac lan spike truoc. Mot run mo coi cua lan truoc se lam hong khang dinh ⑦
 * (xa het) du lan chay nay hoan toan dung — nen phai don TRUOC, khong phai bo qua.
 */
async function cancelLeftovers(): Promise<number> {
  const stale = (await hatchet.runs.list({
    statuses: ['RUNNING', 'QUEUED'] as never,
    onlyTasks: false,
    limit: 200,
  })) as unknown as { rows?: Array<{ metadata?: { id?: string }; workflowName?: string }> };
  const ids = (stale.rows ?? [])
    .filter((row) => (row.workflowName ?? '').startsWith(SPIKE_KEY))
    .map((row) => row.metadata?.id)
    .filter((id): id is string => Boolean(id));
  if (ids.length > 0) await hatchet.runs.cancel({ ids });
  return ids.length;
}

// ------------------------------------------------------------------ kich ban

interface RunRecord {
  label: string;
  runId: string;
  workflowName: string;
  steps: StepStamp[];
  status: string;
}

const records: RunRecord[] = [];

async function main(): Promise<void> {
  console.log(`\n=== SPIKE GHIM PHIEN BAN — chien luoc: ${strategy} ===\n`);
  const v1 = new SpikeWorker('v1', strategy);
  const v2 = new SpikeWorker('v2', strategy);
  const startedAtMs = Date.now();

  try {
    const cleaned = await cancelLeftovers();
    if (cleaned > 0) console.log(`⓪  huy ${cleaned} run mo coi tu lan spike truoc`);

    // ① worker v1 len
    console.log('①  khoi dong worker v1');
    await v1.start();

    // ② run A vao buoc cho ben vung
    const refA = `SPIKE-A-${startedAtMs}`;
    const runA = await trigger(v1.workflowName, refA);
    console.log(`②  run A = ${runA} (workflow=${v1.workflowName}) — cho vao buoc park`);
    const parked = await waitUntil('A vao park', () => isParked(runA), 60_000);
    check(
      '2',
      'run A dung lai o buoc cho ben vung',
      parked,
      parked ? `runId=${runA}` : 'khong vao duoc park',
    );
    if (!parked) throw new Error('khong dung duoc kich ban: run A khong vao park');

    // ③ deploy v2 — v1 VAN CON SONG (day la dung hinh mot ban rolling deploy)
    console.log('③  khoi dong worker v2 (v1 van song)');
    await v2.start();

    // ④ run MOI phai di v2
    const refB = `SPIKE-B-${startedAtMs}`;
    const runB = await trigger(v2.workflowName, refB);
    console.log(`④  run B = ${runB} (workflow=${v2.workflowName})`);
    await waitUntil('B chay xong', async () => isTerminal(await details(runB)), 120_000);
    const detailB = await details(runB);
    const stepsB = stamps(detailB);
    const bAllV2 = stepsB.length > 0 && stepsB.every((s) => s.engineVersion === 'v2');
    check(
      '4',
      'run MOI chay code v2',
      bAllV2,
      stepsB.map((s) => `${s.taskName}=${s.engineVersion}`).join(' ') || 'khong co buoc nao xong',
    );
    records.push({
      label: 'B-new',
      runId: runB,
      workflowName: v2.workflowName,
      steps: stepsB,
      status: String(detailB.run?.status),
    });

    // ⑤ tha su kien cho run A tiep tuc
    console.log('⑤  day su kien duyet — run A tiep tuc');
    await hatchet.events.push(APPROVAL_EVENT, { runId: runA, approvedBy: 'spike' });
    const aDone = await waitUntil(
      'A chay xong',
      async () => isTerminal(await details(runA)),
      180_000,
    );

    // ⑥ MOI buoc cua run A phai la v1 — DAY LA CAU HOI CHINH
    const detailA = await details(runA);
    const stepsA = stamps(detailA);
    const mixed = stepsA.filter((s) => s.engineVersion !== 'v1');
    check(
      '6',
      'MOI buoc cua run cu chay code v1',
      aDone && stepsA.length >= 4 && mixed.length === 0,
      stepsA.map((s) => `${s.taskName}=${s.engineVersion}`).join(' ') +
        (mixed.length ? `  <-- TRON PHIEN BAN: ${mixed.map((s) => s.taskName).join(',')}` : ''),
    );
    records.push({
      label: 'A-old',
      runId: runA,
      workflowName: v1.workflowName,
      steps: stepsA,
      status: String(detailA.run?.status),
    });

    // ⑦ v1 xa het — khong con run nao cua v1 dang chay
    const inFlight = await hatchet.runs.list({
      workflowNames: [v1.workflowName],
      statuses: ['RUNNING', 'QUEUED'] as never,
      onlyTasks: false,
      limit: 50,
    });
    const remaining = (inFlight as unknown as { rows?: unknown[] }).rows?.length ?? 0;
    check(
      '7',
      'worker v1 da xa het viec truoc khi rut',
      remaining === 0,
      `con ${remaining} run chua ket thuc`,
    );

    // ⑧ tat v1 — lich su cua run A phai con nguyen
    console.log('⑧  tat worker v1, doc lai lich su run A');
    await v1.stop();
    const afterStop = await details(runA);
    const stepsAfter = stamps(afterStop);
    check(
      '8',
      'tat worker cu khong lam hong lich su run cu',
      stepsAfter.length === stepsA.length && afterStop.run?.status === detailA.run?.status,
      `${stepsAfter.length} buoc, status=${afterStop.run?.status}`,
    );

    // ⑨ che do hong khi v1 da bien mat: run C dang park, chi con v2 song
    console.log('⑨  run C: park roi rut het worker v1 — kiem xem co bi v2 cuop khong');
    await v1.start();
    const refC = `SPIKE-C-${startedAtMs}`;
    const runC = await trigger(v1.workflowName, refC);
    const parkedC = await waitUntil('C vao park', () => isParked(runC), 60_000);
    if (!parkedC) throw new Error('khong dung duoc kich ban ⑨: run C khong vao park');
    await v1.stop();
    await hatchet.events.push(APPROVAL_EVENT, { runId: runC, approvedBy: 'spike' });
    // Cho du lau de neu co chuyen "nhay sang v2" thi no da phai xay ra.
    await sleep(25_000);
    const detailC = await details(runC);
    const stepsC = stamps(detailC);
    const stolen = stepsC.filter((s) => s.engineVersion === 'v2');
    check(
      '9',
      'worker v1 bien mat -> run cu NAM CHO, khong bi code v2 cuop',
      stolen.length === 0,
      stepsC.map((s) => `${s.taskName}=${s.engineVersion}`).join(' ') +
        (stolen.length
          ? `  <-- BI CUOP: ${stolen.map((s) => s.taskName).join(',')}`
          : `  status=${detailC.run?.status}`),
    );
    records.push({
      label: 'C-orphan',
      runId: runC,
      workflowName: v1.workflowName,
      steps: stepsC,
      status: String(detailC.run?.status),
    });
  } finally {
    await v1.stop();
    await v2.stop();
  }

  const verdict = assertions.every((a) => a.pass) ? 'PASS' : 'FAIL';
  const evidenceDir = resolve(projectDir, 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const file = resolve(evidenceDir, `version-spike-${strategy}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        strategy,
        startedAt: new Date(startedAtMs).toISOString(),
        workflowKey: SPIKE_KEY,
        runs: records,
        assertions,
        verdict,
      },
      null,
      2,
    ),
  );

  console.log(`\n=== KET LUAN (${strategy}): ${verdict} === -> ${file}\n`);
  // Chien luoc `shared` duoc KY VONG hong: do la doi chung chung minh phep do co rang.
  const expected = strategy === 'versioned' ? 'PASS' : 'FAIL';
  if (verdict !== expected) {
    console.error(`KY VONG ${expected} nhung nhan ${verdict} — phep do khong dang tin.`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  // In GON: mot AxiosError day du dai hang tram dong va che mat dong duy nhat can doc.
  const axios = error as { response?: { status?: number; data?: unknown }; config?: { url?: string } };
  if (axios?.response) {
    console.error(
      `[spike] hong: HTTP ${axios.response.status} ${axios.config?.url ?? ''} ${JSON.stringify(axios.response.data)}`,
    );
  } else {
    console.error('[spike] hong:', error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
});
