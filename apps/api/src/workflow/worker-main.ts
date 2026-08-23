import 'reflect-metadata';
// PHAI dung ngay sau reflect-metadata va TRUOC moi import nghiep vu — cung ly do voi `main.ts`:
// do thi module keo theo loader goi khach, ma loader do doc `process.env.TENANT` ngay luc import.
import '../config/load-dotenv.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkflowWorkerModule } from './workflow-worker.module.js';
import { WorkflowWorkerService } from './workflow-worker.service.js';
import {
  WORKER_HEALTH_DEFAULT_PORT,
  WORKER_HEALTH_PORT_ENV,
  startWorkerHealthServer,
} from './worker-health.server.js';

/**
 * DIEM VAO CUA TIEN TRINH WORKER — container RIENG, cung image voi `api`, khac lenh chay.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG NAM TRONG TIEN TRINH API. Bang chung, khong phai "best practice":
 *
 * `deploy/netviet/deploy-stack.sh:88` chay
 *
 *     docker compose up -d --no-deps --force-recreate api web
 *
 * moi lan deploy — tuc la container `api` bi HUY VA TAO LAI. Neu worker song trong do thi:
 *
 *   1. deploy phien ban moi -> container `api` cu bien mat ngay;
 *   2. worker duy nhat dang phuc vu `integration-handoff.v1` bien mat cung no;
 *   3. moi run `.v1` dang do NAM CHO VINH VIEN — dung che do hong ma Gate A mo ta;
 *   4. va buoc DRAIN cua runbook §2 tro thanh KHONG THUC HIEN DUOC: khong co cach nao giu
 *      worker phien ban cu song trong khi phien ban moi len, vi ca hai dung chung mot container.
 *
 * Tach ra thi deploy `api` khong dung toi worker, va nang phien ban khuon tro thanh mot thao tac
 * RIENG theo dung REGISTER -> ACTIVATE -> DRAIN -> DEACTIVATE -> REMOVE.
 *
 * ---------------------------------------------------------------------------
 * MOT CONTAINER = MOT PHIEN BAN. `WORKFLOW_WORKER_VERSION` la bat buoc va khong co mac dinh;
 * thieu no thi boot NEM chu tien trinh khong duoc phep song ma khong dang ky gi.
 */
const logger = new Logger('WorkflowWorkerBootstrap');

const context = await NestFactory.createApplicationContext(WorkflowWorkerModule);

// Bien SIGTERM cua Docker thanh mot lan `stop()` sach se qua `onModuleDestroy`. Khong co dong
// nay thi `docker stop` phai doi het thoi gian an han roi SIGKILL, va engine giu lease cua mot
// worker da chet cho toi luc no het han.
context.enableShutdownHooks();

const worker = context.get(WorkflowWorkerService);

/**
 * MAY CHU SUC KHOE LEN TRUOC WORKER — thu tu nay la ca diem cua no.
 *
 * Dang ky voi engine mat 6–38 s (§29) va co the that bai roi thu lai. Trong suot khoang do
 * `docker healthcheck` van hoi, va cau tra loi dung la "CHUA san sang, vi dang REGISTERING" —
 * chu khong phai mot ket noi bi tu choi, thu doc ra giong het mot tien trinh da chet.
 *
 * Nghe LOOPBACK: healthcheck cua Docker chay BEN TRONG container, nen khong cong nao can ra
 * ngoai va compose khong duoc them khoi `ports:` cho worker.
 */
const healthPort = Number(process.env[WORKER_HEALTH_PORT_ENV] ?? WORKER_HEALTH_DEFAULT_PORT);
const health = await startWorkerHealthServer({
  readiness: worker.readiness,
  port: healthPort,
  workflowName: worker.registeredWorkflowName,
}).catch((error: unknown) => {
  /**
   * KHONG de `EADDRINUSE` tho noi len thanh mot unhandled rejection.
   *
   * Tren production moi worker la mot container rieng, nen cong nay luon ranh — mot lan dung
   * cong nghia la CAU HINH SAI (hai worker chung mot khong gian mang), va thong bao phai noi
   * duoc dieu do. Da vap that: them readiness vao lam nam bai IT do ngay, vi harness chay nhieu
   * worker tren cung mot may.
   */
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(
    `WORKFLOW_WORKER_HEALTH_PORT_UNAVAILABLE: khong mo duoc diem cuoi suc khoe tren cong ` +
      `${healthPort} (${detail}). Moi tien trinh worker can mot cong RIENG; tren production dieu ` +
      `do tu dung vi moi worker la mot container. Dat ${WORKER_HEALTH_PORT_ENV} neu chay nhieu ` +
      `worker chung mot khong gian mang.`,
  );
});
logger.log(`Health worker: http://127.0.0.1:${health.port}/ready`);

// KHONG `await`: `startWithRetry()` co the chay rat lau khi engine chua len, va giu diem vao o
// day se lam tien trinh khong xu ly duoc SIGTERM trong luc do — tuc la `docker stop` phai doi
// het thoi gian an han roi SIGKILL, dung cai gia ma `enableShutdownHooks()` dang tranh.
void worker.startWithRetry().then(() => {
  const snapshot = worker.readiness.snapshot();
  if (snapshot.fatal) {
    // LAN DUY NHAT tien trinh tu ket lieu: hong cau hinh, thu lai khong bao gio cuu duoc.
    // Thoat khac 0 lam no lo ra ngay luc deploy thay vi thanh mot container xanh khong lam gi.
    logger.error(`${snapshot.fatal.reason}: ${snapshot.fatal.detail}`);
    void context.close().finally(() => process.exit(1));
    return;
  }
  logger.log(`Tien trinh worker dang phuc vu ${worker.registeredWorkflowName}`);
});
