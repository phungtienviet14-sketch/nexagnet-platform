import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProofEndpoint,
  WORKFLOW_FIXTURE,
  WorkerProcess,
  apiDir,
  baseEnv,
  enginePortOpen,
  waitFor,
} from './__tests__/workflow-it.harness.js';

/**
 * READINESS DO TREN ENGINE THAT — bai cuoi cua chuoi do tin cay, va la DIEU KIEN CHAN cua compose.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAC BAI O `worker-readiness.spec.ts` KHONG DU:
 *
 * O do dong ho la gia va cac chuyen trang thai do CHINH BAI TEST goi. Cai chua ai chung minh la
 * tien trinh THAT co goi dung nhung chuyen trang thai do vao dung nhung luc do hay khong — va do
 * la khoang cach ma mot may trang thai dung se im lang roi qua.
 *
 * Bai nay do tu BEN NGOAI tien trinh, qua dung cai cua ma `docker healthcheck` se dung:
 * mot loi goi HTTP toi `/ready`.
 *
 * ---------------------------------------------------------------------------
 * PHAI CHAY TUAN TU — `--no-file-parallelism`. Ly do khong phai test mong manh: ca file nay va
 * bon file IT khac deu dang ky CUNG ten `integration-handoff.v1` voi CUNG mot engine, nen chay
 * song song thi worker cua file nay se nhan run do file khac kich hoat (ban giao §26).
 */

const RUN_IT = process.env.RUN_WORKFLOW_IT === '1';
const POC_COMPOSE = resolve(apiDir, '../../tools/poc-workflow-engine/compose/hatchet.compose.yml');

function compose(...args: string[]): void {
  execFileSync('docker', ['compose', '-p', 'pocwf', '-f', POC_COMPOSE, ...args], {
    stdio: 'ignore',
  });
}

interface HealthBody {
  state: string;
  ready: boolean;
  live: boolean;
  reason: string | null;
  registrationMs: number | null;
  degradedForMs: number | null;
  fatal: { reason: string; detail: string } | null;
  pid: number;
}

interface HealthResponse {
  readonly status: number;
  readonly body: HealthBody;
}

/** Goi diem cuoi suc khoe. NEM khi chua nghe — de phan biet voi "nghe nhung tra 503". */
async function health(port: number, path: '/ready' | '/live'): Promise<HealthResponse> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: response.status, body: (await response.json()) as HealthBody };
}

async function healthOrNull(port: number, path: '/ready' | '/live'): Promise<HealthResponse | null> {
  try {
    return await health(port, path);
  } catch {
    return null;
  }
}

/** So do thoi gian dang ky thu duoc trong phien nay — in ra cuoi de dua vao `start_period`. */
const registrationSamples: number[] = [];

describe.skipIf(!RUN_IT)('readiness cua worker tren engine THAT', () => {
  const endpoint = new ProofEndpoint();
  let endpointPort = 0;

  beforeAll(async () => {
    endpointPort = await endpoint.listen();
    // Bai nay tu tay tat/bat engine, nen phai chac chan no dang len truoc khi bat dau.
    compose('start', 'hatchet-engine');
    await waitFor(
      () => enginePortOpen(),
      60_000,
      () => 'engine khong len truoc khi bat dau bai',
    );
  }, 120_000);

  afterAll(async () => {
    compose('start', 'hatchet-engine');
    await endpoint.close();
    if (registrationSamples.length > 0) {
      const worst = Math.max(...registrationSamples);
      console.log(
        `[DO] thoi gian dang ky worker: ${registrationSamples.map((ms) => `${ms} ms`).join(' · ')} ` +
          `| ten nhat ${worst} ms -> start_period phai >= ${Math.ceil((worst * 2.4) / 1000)}s`,
      );
    }
  }, 120_000);

  it('cold start: `/ready` tra 503 SUOT luc dang ky, chi 200 khi engine da xac nhan', async () => {
    const worker = new WorkerProcess('v1', baseEnv(WORKFLOW_FIXTURE, endpointPort));
    // Cong do HARNESS cap — moi tien trinh mot cong rieng, mo hinh dung "moi container mot
    // khong gian cong". Go cung mot con so o day se bi harness ghi de.
    const port = worker.healthPort;

    // Do TRONG LUC khoi dong, khong phai sau. Neu chi kiem sau khi READY thi mot healthcheck
    // luon tra 200 (ke ca khi chua dang ky) van se qua bai — dung che do hong ta dang chan.
    const observed: string[] = [];
    let polling = true;
    const poller = (async () => {
      while (polling) {
        const snapshot = await healthOrNull(port, '/ready');
        if (snapshot) observed.push(`${snapshot.status}:${snapshot.body.reason ?? 'READY'}`);
        await new Promise((r) => setTimeout(r, 150));
      }
    })();

    try {
      await worker.start();
      const ready = await health(port, '/ready');
      expect(ready.status).toBe(200);
      expect(ready.body.state).toBe('READY');

      // So do THAT — day la thu compose can, va no phai den tu day chu khong tu mot uoc luong.
      expect(ready.body.registrationMs).toBeGreaterThan(0);
      registrationSamples.push(ready.body.registrationMs!);

      // CHO poller thay 200, DUNG tat no roi hy vong no da kip thay.
      //
      // ---------------------------------------------------------------------------
      // DAY LA MOT LOI DUA DA LAM CI DO THAT (24/08/2026, job `workflow-integration`, lan chay
      // dau tien): `expected false to be true` o dung dong `startsWith('200')` — TRONG KHI loi
      // goi truc tiep ngay tren no da tra 200. Tuc `/ready` khong he sai; PHEP DO sai.
      //
      // Co che, doc tu code chu khong doan:
      //   1. adapter in `READY workflow=...` NGAY SAU `waitUntilReady()`
      //      (`hatchet-workflow-worker.adapter.ts:185`)
      //   2. `WorkflowWorkerService.start()` moi goi `lifecycle.ready()` — tuc `/ready` chi lat
      //      sang 200 SAU dong log o buoc 1
      //   3. `WorkerProcess.start()` cua harness cho dong log do bang `waitFor`, nhip **250 ms**
      //
      // Nen luc `start()` tra ve, cua so con lai de poller (nhip 150 ms) bat duoc mot mau 200
      // chi la 0-250 ms. Bai kiem dang bao poller chay dua voi chinh dong `polling = false` ngay
      // duoi no — va khong co gi bao dam no thang. Tren may dev no thang; tren runner no thua.
      //
      // Cho co thoi han thi phep do VAN do dung che do hong that (`/ready` KHONG BAO GIO bao 200
      // qua duong lay mau), ma khong con phu thuoc vao viec ai chay nhanh hon ai.
      await waitFor(
        () => observed.some((sample) => sample.startsWith('200')),
        30_000,
        () =>
          '`/ready` khong bao gio tra 200 qua duong LAY MAU du loi goi truc tiep da 200. ' +
          `10 mau cuoi: ${JSON.stringify(observed.slice(-10))}`,
      );

      polling = false;
      await poller;

      // KHANG DINH TRUNG TAM CUA CA FILE: da ton tai it nhat mot luc tien trinh song, HTTP tra
      // loi duoc, ma van bao CHUA SAN SANG. Neu khong co mau nao nhu vay thi `/ready` dang bao
      // khoe truoc khi engine biet worker ton tai.
      expect(observed.some((sample) => sample.startsWith('503'))).toBe(true);
      expect(observed.some((sample) => sample.startsWith('200'))).toBe(true);
    } finally {
      polling = false;
      await poller;
      await worker.stop();
    }
  }, 180_000);

  it('mat engine SAU khi READY: het ready, van live, CUNG MOT tien trinh phuc hoi', async () => {
    const worker = new WorkerProcess('v1', baseEnv(WORKFLOW_FIXTURE, endpointPort));
    // Cong do HARNESS cap — moi tien trinh mot cong rieng, mo hinh dung "moi container mot
    // khong gian cong". Go cung mot con so o day se bi harness ghi de.
    const port = worker.healthPort;

    try {
      await worker.start();
      const before = await health(port, '/ready');
      expect(before.status).toBe(200);
      const pid = before.body.pid;

      compose('stop', '-t', '2', 'hatchet-engine');

      // Bo do phai TU phat hien, khong ai bao no. Han an han 30 s + nhip do 5 s => cho toi 90 s.
      // Giu lai trang thai cuoi doc duoc, de neu bai do thi thong bao noi duoc worker DANG nghi gi
      // — `waitFor` chi nhan mot ham dong bo nen khong hoi lai duoc luc dung thong bao.
      let last: HealthBody | undefined;
      await waitFor(
        async () => {
          const snapshot = await healthOrNull(port, '/ready');
          last = snapshot?.body;
          return snapshot?.status === 503;
        },
        90_000,
        () =>
          `worker VAN bao ready sau khi engine chet — dung che do hong "container xanh, run ` +
          `treo mai mai". Trang thai: ${JSON.stringify(last)}`,
      );

      const degraded = await health(port, '/ready');
      expect(degraded.body.state).toBe('DEGRADED');
      expect(degraded.body.reason).toBe('ENGINE_UNREACHABLE');
      // `/live` VAN 200: khong tin hieu nao bao container phai chet chi vi engine dang khoi dong lai.
      expect((await health(port, '/live')).status).toBe(200);

      compose('start', 'hatchet-engine');
      await waitFor(
        async () => (await healthOrNull(port, '/ready'))?.status === 200,
        180_000,
        () => 'worker khong tro lai READY sau khi engine song lai',
      );

      // CUNG MOT PID tu dau toi cuoi. Day la bang chung KHONG co bao restart: neu tien trinh
      // chet va `restart: always` dung day thi pid se khac.
      expect((await health(port, '/ready')).body.pid).toBe(pid);
    } finally {
      await worker.stop();
      compose('start', 'hatchet-engine');
      await waitFor(() => enginePortOpen(), 60_000, () => 'engine khong len lai sau bai');
    }
  }, 300_000);

  it('SIGTERM: rut sach roi moi thoat, va khong sot handle nao giu tien trinh song', async () => {
    const worker = new WorkerProcess('v1', baseEnv(WORKFLOW_FIXTURE, endpointPort));
    // Cong do HARNESS cap — moi tien trinh mot cong rieng, mo hinh dung "moi container mot
    // khong gian cong". Go cung mot con so o day se bi harness ghi de.
    const port = worker.healthPort;

    await worker.start();
    expect((await health(port, '/ready')).status).toBe(200);

    await worker.stop(); // SIGTERM — dung tin hieu ma `docker stop` gui

    // Cong da dong han. Neu may chu suc khoe con nghe sau khi tien trinh cha da thoat thi
    // `docker stop` se phai doi het thoi gian an han roi SIGKILL.
    expect(await healthOrNull(port, '/live')).toBeNull();

    /**
     * ⚠️ RUT SACH CHI DO DUOC TREN LINUX — va day la mot su that ve MAY HOST, khong phai mot
     * bai test mong manh.
     *
     * Windows khong co SIGTERM that: Node dich `kill('SIGTERM')` thanh `TerminateProcess`, tuc
     * la tien trinh bi cham dut NGAY va `enableShutdownHooks()` khong bao gio chay. Da do:
     * `/ready` tra 200 truoc khi giet, sau khi giet thi log KHONG co dong 'Rut worker'.
     *
     * Khang dinh o tren (`/live` khong con tra loi) van co gia tri o moi he: no chung minh tien
     * trinh da di han va khong sot handle nao. Nhung duong RUT SACH — `DRAINING` -> `stop()` ->
     * `STOPPED` — chi chung minh duoc o noi SIGTERM la that, tuc la tren container Linux.
     *
     * KHONG khang dinh bua o day. Mot nhan sai con te hon khong co nhan: neu bai nay bao "da
     * chung minh rut sach" tren Windows thi no dang noi doi, va con duong DRAIN cua runbook §2
     * se di vao production ma chua ai do.
     *
     * MON NO DA TRA — do that 24/08/2026 (D8) tren gd1-test, container Linux, SIGTERM that:
     *
     *   truoc SIGTERM: so dong 'Rut worker' = 0
     *   docker kill --signal=SIGTERM zalo-ultty-gd1-test-workflow-worker-v1-1
     *   sau:           container `exited` voi EXIT CODE 0 (thoat sach, khong bi SIGKILL het han)
     *                  log co '[WorkflowWorkerService] Rut worker
     *                  workflow-worker-integration-handoff-v1'
     *                  so dong 'Rut worker' = 1
     *
     * Tuc la tren Linux, `enableShutdownHooks()` CO chay va duong DRAINING -> stop() -> STOPPED
     * cua runbook §2 la co that. Exit code 0 moi la phan quan trong: no phan biet "rut sach xong
     * roi thoat" voi "het han an han roi bi giet".
     *
     * Cai `if` duoi day VAN GIU cho Windows — no khong phai mon no nua ma la mot su that ve may
     * host. Xoa no di thi bai nay se do tren may dev va noi doi ve ly do.
     */
    if (process.platform !== 'win32') {
      expect(worker.output).toContain('Rut worker');
    }
  }, 180_000);
});
