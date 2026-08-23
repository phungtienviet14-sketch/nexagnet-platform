import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { WorkerReadiness } from './worker-readiness.js';

/**
 * DIEM CUOI SUC KHOE cua tien trinh worker — lop dich MONG tu `WorkerReadiness` sang HTTP.
 *
 * KHONG co luat nghiep vu nao o day. Moi quyet dinh "the nao la san sang" nam trong
 * `worker-readiness.ts`; file nay chi chon giua 200 va 503. Tach nhu vay de doi cach phoi bay
 * (HTTP -> file, -> tin hieu, -> gi khac) khong dong toi dinh nghia readiness.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG NestJS o day:
 *
 * Tien trinh worker co y KHONG boot `AppModule` (`workflow-worker.module.ts` giai thich: mot
 * listener zca thu hai se da bay listener cua `api`). Dung mot HTTP adapter cua Nest chi de
 * phuc vu hai duong tinh se keo theo ca mot khung — trong khi `node:http` la du va khong them
 * phu thuoc nao.
 *
 * ---------------------------------------------------------------------------
 * VI SAO NGHE LOOPBACK, VA VI SAO KHONG PUBLISH CONG:
 *
 * `docker healthcheck` chay BEN TRONG container. Nghe `127.0.0.1` la du cho no, va dong lai
 * duong tu moi container khac tren mang cua stack. Compose KHONG duoc them `ports:` cho worker.
 */

/**
 * Cong mac dinh. Compose phai go mot con so vao khoi `healthcheck:`, nen con so do phai song o
 * DUNG MOT cho — day.
 *
 * 8085 chon co chu dich de khong dung `api` (3001) hay `web` (3000) trong cung image.
 */
export const WORKER_HEALTH_DEFAULT_PORT = 8085;

/** Ten bien moi truong. Xuat ra de compose va code khong go lai chuoi nay o hai noi. */
export const WORKER_HEALTH_PORT_ENV = 'WORKFLOW_WORKER_HEALTH_PORT';

export interface WorkerHealthServerOptions {
  readonly readiness: WorkerReadiness;
  /** `0` = de he dieu hanh cap cong ranh (dung trong test). */
  readonly port?: number;
  readonly host?: string;
  /** Ten khuon MANG PHIEN BAN — de doc duoc tu ngoai "worker nay phuc vu phien ban nao". */
  readonly workflowName?: string;
  readonly workerName?: string;
}

export interface WorkerHealthServer {
  readonly port: number;
  readonly host: string;
  close(): Promise<void>;
}

export async function startWorkerHealthServer(
  options: WorkerHealthServerOptions,
): Promise<WorkerHealthServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? WORKER_HEALTH_DEFAULT_PORT;

  const server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0];
    if (path !== '/ready' && path !== '/live') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"not_found"}');
      return;
    }

    const snapshot = options.readiness.snapshot();
    const healthy = path === '/ready' ? snapshot.ready : snapshot.live;

    /**
     * THAN THEO DANH SACH TRANG, khong phai "do ca snapshot ra roi xoa vai truong".
     *
     * Than nay di vao log cua Docker moi lan healthcheck that bai. Mot danh sach den se hong
     * IM LANG vao ngay ai do them mot truong moi vao snapshot; danh sach trang thi buoc nguoi
     * do phai quyet dinh co dua truong moi ra ngoai hay khong.
     */
    const body = {
      state: snapshot.state,
      ready: snapshot.ready,
      live: snapshot.live,
      reason: snapshot.reason,
      label: snapshot.label,
      registrationMs: snapshot.registrationMs,
      degradedForMs: snapshot.degradedForMs,
      fatal: snapshot.fatal,
      workflow: options.workflowName ?? null,
      worker: options.workerName ?? null,
      pid: process.pid,
    };

    response.writeHead(healthy ? 200 : 503, {
      'content-type': 'application/json',
      // Healthcheck chay moi 10 s; mot ban tra loi bi cache la mot healthcheck noi doi.
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify(body));
  });

  // KHONG `unref()`: diem cuoi nay PHAI giu tien trinh song. Voi `unref()` thi mot worker da
  // rot ket noi toi engine se lang le thoat vi khong con handle nao — dung luc nguoi truc can
  // no tra loi vi sao no khong ready.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  return {
    port: address.port,
    host,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    // `close()` cho cac ket noi dang mo tu ket thuc. Healthcheck cua Docker dung keep-alive, nen
    // khong co dong nay thi `docker stop` phai doi het thoi gian an han roi SIGKILL — dung cai
    // gia ma `enableShutdownHooks()` o `worker-main.ts` dang tranh.
    server.closeAllConnections?.();
  });
}
