import { afterEach, describe, expect, it } from 'vitest';
import { WorkerReadiness } from './worker-readiness.js';
import {
  WORKER_HEALTH_DEFAULT_PORT,
  startWorkerHealthServer,
  type WorkerHealthServer,
} from './worker-health.server.js';

/**
 * DIEM CUOI SUC KHOE CUA TIEN TRINH WORKER.
 *
 * Ca file nay chi lam mot viec: dich `WorkerReadiness.snapshot()` sang thu ma `docker
 * healthcheck` doc duoc. Moi luat NGHIEP VU ve readiness nam o `worker-readiness.spec.ts`; o
 * day chi kiem PHAN DICH.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CHI NGHE LOOPBACK:
 *
 * `docker healthcheck` chay BEN TRONG container, nen mot cong nghe tren `127.0.0.1` la du. Nghe
 * `0.0.0.0` se lam diem cuoi nay voi toi duoc tu moi container khac tren cung mang cua stack —
 * them mot be mat ma khong doi lay duoc gi.
 *
 * VA KHONG PUBLISH CONG NAO ra host: compose khong co khoi `ports:` cho worker.
 */

let running: WorkerHealthServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function serve(readiness: WorkerReadiness): Promise<WorkerHealthServer> {
  // Cong 0 = he dieu hanh cap cong ranh. Bai test KHONG duoc gianh cong that voi ai.
  running = await startWorkerHealthServer({
    readiness,
    port: 0,
    workflowName: 'integration-handoff.v1',
    workerName: 'workflow-worker-integration-handoff-v1',
  });
  return running;
}

async function get(server: WorkerHealthServer, path: string) {
  const response = await fetch(`http://127.0.0.1:${server.port}${path}`);
  const text = await response.text();
  return { status: response.status, text };
}

describe('worker health server', () => {
  it('/ready tra 503 khi chua dang ky xong, 200 khi da READY', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);

    // Day la KHANG DINH quan trong nhat ca file: mot tien trinh dang len, HTTP da phuc vu duoc,
    // nhung van phai bao CHUA SAN SANG. Neu no tra 200 o day thi compose se coi container la
    // khoe trong khi engine chua biet no ton tai.
    expect((await get(server, '/ready')).status).toBe(503);

    readiness.connecting();
    expect((await get(server, '/ready')).status).toBe(503);

    readiness.registering();
    expect((await get(server, '/ready')).status).toBe(503);

    readiness.ready();
    expect((await get(server, '/ready')).status).toBe(200);
  });

  it('/live van 200 khi mat engine qua han — de KHONG sinh bao restart', async () => {
    let now = 0;
    const readiness = new WorkerReadiness({ now: () => now, degradedGraceMs: 1_000 });
    const server = await serve(readiness);

    readiness.connecting();
    readiness.registering();
    readiness.ready();
    readiness.degraded();
    now += 5_000; // qua han an han

    // Cap gia tri nay LA thiet ke chong bao restart:
    //   /ready 503 -> `docker ps` hien unhealthy, nguoi truc THAY.
    //   /live  200 -> khong co tin hieu nao bao container phai chet.
    expect((await get(server, '/ready')).status).toBe(503);
    expect((await get(server, '/live')).status).toBe(200);
  });

  it('/live tra 503 khi hong CAU HINH — day la lan duy nhat container nen chet', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);

    readiness.connecting();
    readiness.fatal('ENGINE_AUTH_REJECTED', 'engine tu choi token');

    expect((await get(server, '/live')).status).toBe(503);
    expect((await get(server, '/ready')).status).toBe(503);
  });

  it('than tra ve LY DO co ma — de healthcheck do khong phai di doc log moi biet vi sao', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);
    readiness.connecting();
    readiness.registering();

    const body = JSON.parse((await get(server, '/ready')).text);
    expect(body.state).toBe('REGISTERING');
    expect(body.ready).toBe(false);
    expect(body.reason).toBe('REGISTERING');
    // Ten khuon MANG PHIEN BAN co mat: "worker nao dang phuc vu phien ban nao" phai tra loi
    // duoc tu ben ngoai, khong phai bang cach doc bien moi truong cua container.
    expect(body.workflow).toBe('integration-handoff.v1');
    expect(body.worker).toBe('workflow-worker-integration-handoff-v1');
  });

  it('than KHONG chua bi mat — khong token, khong bien moi truong', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);
    readiness.connecting();
    readiness.registering();
    readiness.ready();

    const { text } = await get(server, '/ready');
    // Diem cuoi nay nghe loopback, nhung than cua no VAN di vao log cua docker khi healthcheck
    // that bai. Danh sach TRANG (nhung khoa duoc phep) chu khong phai danh sach den.
    const allowed = [
      'state',
      'ready',
      'live',
      'reason',
      'label',
      'registrationMs',
      'degradedForMs',
      'fatal',
      'workflow',
      'worker',
      'pid',
    ];
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([...allowed].sort());
  });

  it('duong khong biet tra 404 — khong bien thanh mot be mat mo', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);
    expect((await get(server, '/')).status).toBe(404);
    expect((await get(server, '/metrics')).status).toBe(404);
  });

  it('chi nghe LOOPBACK, va co cong mac dinh co dinh cho compose', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);
    expect(server.host).toBe('127.0.0.1');
    // Compose phai go duoc mot con so vao `healthcheck:`; hang so nay la cho duy nhat no song.
    expect(WORKER_HEALTH_DEFAULT_PORT).toBeGreaterThan(1024);
  });

  it('close() dong han cong — khong de sot handle lam tien trinh khong thoat duoc', async () => {
    const readiness = new WorkerReadiness();
    const server = await serve(readiness);
    const port = server.port;
    await server.close();
    running = undefined;

    await expect(fetch(`http://127.0.0.1:${port}/live`)).rejects.toThrow();
  });
});
