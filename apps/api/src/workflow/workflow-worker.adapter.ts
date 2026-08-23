import type { WorkflowEngineName } from './workflow-engine.port.js';
import type { WorkerRegistration } from './worker-registration.js';

/**
 * Bang tra hien thuc WORKER theo goi khach — doi xung voi `workflow-engine.adapter.ts`.
 *
 * Hai ben cua cung mot engine, hai vai hoan toan khac nhau:
 *
 *   workflow-engine.adapter   NGUOI GOI  — kich hoat run, huy, dem run dang chay. Song trong `api`.
 *   workflow-worker.adapter   NGUOI LAM  — dang ky khuon va CHAY cac buoc. Song trong container rieng.
 *
 * Chung khong duoc gop lam mot cong: `WorkflowEnginePort` co y khong co `execute(...)`, va them
 * kha nang chay buoc vao do se mo dung con duong ma no dang dong.
 *
 * `async` cung ly do voi ben kia: SDK nap bang `await import()` vi no mat ~800ms va in ba dong
 * canh bao khai tu. Chi tien trinh worker moi tra cai gia do.
 */

/**
 * Tay cam mot tien trinh worker. CO Y chi hai dong tu — day khong phai cho de lo API cua Hatchet
 * ra ngoai (`pause`, `upsertLabels`, `runChild`… deu dung lai o thu muc adapter).
 */
export interface WorkflowWorkerHandle {
  /**
   * Dang ky khuon voi engine, khoi dong worker, va CHO toi khi engine xac nhan da dang ky.
   *
   * Cho tuong minh la co y: khong co no thi "worker da len" chi la mot dong log, va moi bang
   * chung E2E se phai `sleep` mot con so doan mo — dung kieu test lung lay ma minh dang tranh.
   */
  start(): Promise<void>;
  /** Rut worker sach se. An toan khi goi ma chua `start()`. */
  stop(): Promise<void>;
}

export interface WorkflowWorkerCredentials {
  /** BI MAT — tu bien moi truong / Secret Manager, khong bao gio tu `tenant.json`. */
  readonly token?: string;
  readonly hostPort?: string;
  readonly tlsStrategy?: 'none' | 'tls' | 'mtls';
  readonly namespace?: string;
}

/**
 * Buoc ma `start()` dang lam. Hai buoc nay CO THAT va khac nhau ve cach xu ly:
 *
 *   connecting   dang mo ket noi gRPC — chua toi duoc engine la loi MANG/engine chua len
 *   registering  da noi duoc, dang cho engine xac nhan khuon — cho toi 38 s la BINH THUONG (§29)
 *
 * Gop hai buoc thanh mot "dang khoi dong" se lam nguoi truc dem khong biet phai di xem mang hay
 * chi phai doi them.
 */
export type WorkerStartPhase = 'connecting' | 'registering';

export interface WorkflowWorkerDeps {
  /** Nguon doc `WORKFLOW_DESTINATION_*`. Tiem vao de test khong phai sua `process.env` toan cuc. */
  readonly env?: NodeJS.ProcessEnv;
  /** So viec chay song song tren mot tien trinh. */
  readonly slots?: number;
  /**
   * Bao ra ngoai `start()` dang o buoc nao.
   *
   * VI SAO LA CALLBACK chu khong phai de ben goi tu suy: chi file adapter moi biet luc nao
   * client thuc su mo ket noi va luc nao engine bat dau xac nhan khuon. Ben goi doan hai moc do
   * chinh la quay lai lam `sleep` — dung thu ma readiness sinh ra de thay the.
   */
  readonly onPhase?: (phase: WorkerStartPhase) => void;
}

export async function createWorkflowWorker(
  engine: WorkflowEngineName | undefined,
  registration: WorkerRegistration,
  credentials: WorkflowWorkerCredentials = {},
  deps: WorkflowWorkerDeps = {},
): Promise<WorkflowWorkerHandle> {
  if (engine !== 'hatchet') {
    // KHONG tra ve mot worker vo hieu hoa. Ben goi (`workflow-engine.adapter`) co the roi ve
    // `Disabled…` vi "khach khong dung engine" la mot cau hinh HOP LE cho tien trinh API.
    // O day thi khong: mot TIEN TRINH WORKER duoc khoi dong ra la mot quyet dinh van hanh co
    // chu dich, va neu no khong co engine de phuc vu thi no khong co ly do ton tai.
    throw new Error(
      `WORKFLOW_WORKER_ENGINE_UNSUPPORTED: khong dung duoc tien trinh worker cho engine ` +
        `'${engine ?? 'none'}'. Chi khoi dong container worker cho khach co ` +
        `integrations.workflowEngine.adapter='hatchet'.`,
    );
  }

  if (!credentials.token) {
    throw new Error(
      'WORKFLOW_ENGINE_TOKEN_MISSING: tien trinh worker khong co token de dang ky voi engine. ' +
        'Dat bien moi truong duoc tro toi boi `credentialRef` cua goi khach.',
    );
  }

  const { HatchetWorkflowWorker } = await import('./hatchet/hatchet-workflow-worker.adapter.js');
  return new HatchetWorkflowWorker(
    registration,
    {
      token: credentials.token,
      ...(credentials.hostPort ? { hostPort: credentials.hostPort } : {}),
      ...(credentials.tlsStrategy ? { tlsStrategy: credentials.tlsStrategy } : {}),
      ...(credentials.namespace ? { namespace: credentials.namespace } : {}),
    },
    deps,
  );
}
