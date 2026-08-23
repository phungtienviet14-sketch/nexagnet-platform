import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  createWorkflowWorker,
  type WorkflowWorkerCredentials,
  type WorkflowWorkerHandle,
} from './workflow-worker.adapter.js';
import { EngineReachabilityMonitor } from './engine-reachability.js';
import { WorkerReadiness, type WorkerFatalReason } from './worker-readiness.js';
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
  private readonly lifecycle = new WorkerReadiness();
  private handle?: WorkflowWorkerHandle;
  private monitor?: EngineReachabilityMonitor;

  constructor(
    @Inject(WORKFLOW_WORKER_REGISTRATION) private readonly registration: WorkerRegistration,
    @Inject(WORKFLOW_WORKER_ENGINE) private readonly engine: WorkflowEngineName,
    @Inject(WORKFLOW_WORKER_CREDENTIALS) private readonly credentials: WorkflowWorkerCredentials,
  ) {}

  /** Phien ban ma tien trinh nay mang. Doc duoc tu ngoai de log/kiem khong phai doan. */
  get registeredWorkflowName(): string {
    return this.registration.engineName;
  }

  /**
   * Trang thai vong doi — nguon cho `worker-health.server.ts`.
   *
   * Service SO HUU cai nay chu khong nhan tu ngoai: doi tuong nao goi `start()` thi doi tuong do
   * biet su that ve trang thai, va tach hai thu ra se de mo mot duong cho chung lech nhau.
   */
  get readiness(): WorkerReadiness {
    return this.lifecycle;
  }

  async start(): Promise<void> {
    if (this.handle) return;
    this.logger.log(
      `Dang ky ${this.registration.engineName} (worker ${this.registration.workerName})`,
    );

    const handle = await createWorkflowWorker(this.engine, this.registration, this.credentials, {
      // Chi adapter moi biet luc nao la MO KET NOI va luc nao la DANG KY. Doan hai moc nay o
      // day chinh la quay lai lam `sleep` — dung thu ma readiness sinh ra de thay the.
      onPhase: (phase) =>
        phase === 'connecting' ? this.lifecycle.connecting() : this.lifecycle.registering(),
    });
    await handle.start();

    // Chi gan `this.handle` SAU khi `start()` xong. Neu gan truoc, mot lan dang ky that bai se
    // de lai mot tay cam nua song va lan thu lai ke tiep se thoat som o `if (this.handle) return`.
    this.handle = handle;
    this.lifecycle.ready();
    this.logger.log(
      `READY ${this.registration.engineName} sau ${this.lifecycle.snapshot().registrationMs} ms`,
    );
    this.startEngineMonitor();
  }

  /**
   * Khoi dong CO THU LAI. Ham nay KHONG BAO GIO nem — no la vong doi cua ca tien trinh.
   *
   * ---------------------------------------------------------------------------
   * VI SAO THU LAI THAY VI CHET NGAY:
   *
   * `depends_on: service_healthy` cua compose lam engine len truoc worker, nhung no khong bao
   * dam engine da SAN SANG NHAN DANG KY — va cac lan do (§29) cho thay khoang do bien dong tu
   * 6 s toi 38 s. Mot worker chet ngay o lan thu dau se bi `restart: always` dung day, va cai
   * ta duoc la mot vong restart thay vi mot vong thu lai — dat hon va kho doc hon trong log.
   *
   * VI SAO KHONG THU LAI VOI LOI CAU HINH: xem `classifyFatal`.
   */
  async startWithRetry(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.start();
        return;
      } catch (error) {
        const fatal = classifyFatal(error);
        if (fatal) {
          // Thu lai mot cau hinh sai la che do hong "container xanh, run treo mai mai" doi lot
          // kien tri. Danh dau FATAL -> `/live` tra 503 -> `worker-main.ts` thoat khac 0.
          this.lifecycle.fatal(fatal, message(error));
          this.logger.error(`Khong the khoi dong worker (${fatal}): ${message(error)}`);
          return;
        }

        this.lifecycle.degraded();
        const waitMs = backoffMs(attempt);
        this.logger.warn(
          `Lan ${attempt} dang ky that bai: ${message(error)} — thu lai sau ${waitMs} ms. ` +
            `Tien trinh KHONG thoat.`,
        );
        await delay(waitMs);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.monitor?.stop();
    this.monitor = undefined;

    // DRAINING truoc khi goi `stop()`: tu day `/ready` tra 503 NGAY, nen engine ngung dinh tuyen
    // viec moi toi day trong khi cac run dang chay van duoc chay not.
    if (this.lifecycle.state !== 'STOPPED' && this.lifecycle.state !== 'DRAINING') {
      this.lifecycle.draining();
    }

    if (this.handle) {
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

    this.lifecycle.stopped();
  }

  /**
   * Bo do chi chay SAU khi da READY mot lan.
   *
   * Truoc do, "chua toi duoc engine" la viec cua `startWithRetry()`. Cho ca hai cung ghi mot may
   * trang thai se lam thu tu giua chung khong xac dinh duoc.
   */
  private startEngineMonitor(): void {
    if (this.monitor || !this.credentials.hostPort) return;
    this.monitor = new EngineReachabilityMonitor({
      hostPort: this.credentials.hostPort,
      readiness: this.lifecycle,
    });
    this.monitor.start();
  }
}

/** Cho giua hai lan thu: 1 s, 2 s, 4 s… tran o 30 s. */
function backoffMs(attempt: number): number {
  return Math.min(1_000 * 2 ** (attempt - 1), 30_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/**
 * Loi nao la KHONG CUU DUOC bang cach thu lai.
 *
 * ---------------------------------------------------------------------------
 * CO Y CHI NHAN RA MA CUA CHINH TA. Day la mot lua chon, khong phai mot thieu sot:
 *
 * Ba ma duoi la do repo nay nem ra, nen chung TAT DINH va kiem duoc bang test. Loi cua Hatchet
 * (token sai, tenant sai) thi khong: hinh dang chuoi cua no chua he duoc DO tren engine that,
 * va doan mot mau roi phan loai nham se bien mot su co mang tam thoi thanh mot lan thoat khac 0
 * — dung kieu "nhan sai con te hon khong co nhan" da vap o phien truoc.
 *
 * Hau qua cua viec khong nhan ra: mot token sai se lam worker thu lai mai. No KHONG bien thanh
 * che do hong im lang — `/ready` tra 503 nen container hien `unhealthy` va nguoi truc thay. Do
 * la danh doi co chu dich: hong NHIN THAY DUOC thay vi hong duoc phan loai sai.
 *
 * MON NO da ghi: bai IT voi token sai tren engine that se do duoc hinh dang chuoi that; khi co
 * so do roi thi them `ENGINE_AUTH_REJECTED` vao day kem bang chung.
 */
function classifyFatal(error: unknown): WorkerFatalReason | null {
  const text = message(error);
  if (
    text.includes('WORKFLOW_WORKER_ENGINE_UNSUPPORTED') ||
    text.includes('WORKFLOW_ENGINE_TOKEN_MISSING') ||
    text.includes('WORKFLOW_VERSION_UNKNOWN') ||
    text.includes('WORKFLOW_VERSION_INVALID')
  ) {
    return 'CONFIG_INVALID';
  }
  return null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
