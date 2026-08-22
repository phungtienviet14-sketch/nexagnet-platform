import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  createWorkflowWorker,
  type WorkflowWorkerCredentials,
  type WorkflowWorkerHandle,
} from './workflow-worker.adapter.js';
import type { WorkerRegistration } from './worker-registration.js';
import type { WorkflowEngineName } from './workflow-engine.port.js';

/** Token DI: ket qua phan giai phien ban, da kiem luc boot module. */
export const WORKFLOW_WORKER_REGISTRATION = Symbol('WORKFLOW_WORKER_REGISTRATION');
/** Token DI: nha cung cap engine + bi mat, doc tu goi khach + bien moi truong. */
export const WORKFLOW_WORKER_CREDENTIALS = Symbol('WORKFLOW_WORKER_CREDENTIALS');
/** Token DI: ten nha cung cap engine cua goi khach. */
export const WORKFLOW_WORKER_ENGINE = Symbol('WORKFLOW_WORKER_ENGINE');

/**
 * Vong doi cua tien trinh worker.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DANG KY TRONG `onModuleInit`:
 *
 * Boot va KET NOI la hai chuyen khac nhau, va gop chung lai lam hong ca hai:
 *
 *   · mot module chi boot duoc khi engine dang song thi khong test duoc bang DI that — ma dung
 *     bai test do moi la thu chan viec ai do doi module hep thanh `AppModule`;
 *   · va mot loi mang luc boot se doc ra giong het mot loi cau hinh, trong khi cach xu ly hai
 *     truong hop hoan toan khac nhau.
 *
 * Nen: `onModuleInit` KHONG lam gi ca (viec kiem cau hinh da xay ra o provider, tuc la boot van
 * fail-fast), va `worker-main.ts` goi `start()` tuong minh. Mot tien trinh worker chi co mot
 * viec de lam, nen viec do xung dang duoc viet ra o diem vao chu khong an trong mot hook.
 *
 * `onModuleDestroy` VAN lam viec: `enableShutdownHooks()` bien SIGTERM cua Docker thanh mot lan
 * `stop()` sach se — do la con duong rut worker dung cach khi deploy.
 */
@Injectable()
export class WorkflowWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkflowWorkerService.name);
  private handle?: WorkflowWorkerHandle;

  constructor(
    @Inject(WORKFLOW_WORKER_REGISTRATION) private readonly registration: WorkerRegistration,
    @Inject(WORKFLOW_WORKER_ENGINE) private readonly engine: WorkflowEngineName,
    @Inject(WORKFLOW_WORKER_CREDENTIALS) private readonly credentials: WorkflowWorkerCredentials,
  ) {}

  /** Phien ban ma tien trinh nay mang. Doc duoc tu ngoai de log/kiem khong phai doan. */
  get registeredWorkflowName(): string {
    return this.registration.engineName;
  }

  async start(): Promise<void> {
    if (this.handle) return;
    this.logger.log(
      `Dang ky ${this.registration.engineName} (worker ${this.registration.workerName})`,
    );
    this.handle = await createWorkflowWorker(this.engine, this.registration, this.credentials);
    await this.handle.start();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.handle) return;
    this.logger.log(`Rut worker ${this.registration.workerName}`);
    try {
      await this.handle.stop();
    } catch (error) {
      // Tat khong sach thi van phai thoat. Engine se tu thu hoi khi lease het han; treo tien
      // trinh o day chi lam `docker stop` phai doi het thoi gian an han roi SIGKILL.
      this.logger.error(`Khong rut duoc worker sach se: ${message(error)}`);
    }
    this.handle = undefined;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
