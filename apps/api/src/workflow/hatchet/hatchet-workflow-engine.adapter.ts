import { Logger } from '@nestjs/common';
import {
  WorkflowEnginePort,
  engineWorkflowName,
  type TriggerWorkflowCommand,
  type WorkflowRunReference,
  type WorkflowRunSummary,
} from '../workflow-engine.port.js';
import { workflowRunDashboardUrl } from '../workflow-run-dashboard.js';
import { HatchetClient, type HatchetClientType } from './hatchet-sdk.js';

/**
 * Hien thuc `WorkflowEnginePort` bang Hatchet self-host.
 *
 * Day la file DUY NHAT (cung voi `hatchet-sdk.ts`) biet Hatchet ton tai. Moi khai niem rieng
 * cua no — `additionalMetadata`, `runNoWait`, `actionId`, trang thai `RUNNING`/`QUEUED` — dung
 * lai o day.
 */
export interface HatchetEngineConfig {
  /**
   * Token API cua tenant Hatchet. La BI MAT: doc tu bien moi truong / Secret Manager, KHONG
   * BAO GIO tu `tenants/<slug>/tenant.json` (goi khach nam trong git).
   */
  readonly token: string;
  /** `host:port` cua gRPC engine. Bo trong = lay tu token (token co `grpc_broadcast_address`). */
  readonly hostPort?: string;
  /**
   * Goc URL cua REST API engine — duong MAY dung de DOC (`describeRun`, `countInFlight`).
   *
   * KHAC HAN `dashboardBaseUrl`, va nham hai cai nay chinh la loi da xay ra tren gd1-test
   * (25/08/2026): `dashboardBaseUrl` la duong CHO NGUOI BAM, cong khai va nam sau basic-auth cua
   * Caddy. Duong cho MAY phai di thang toi dich vu trong mang noi bo.
   *
   * Bo trong = de SDK suy tu claim `server_url` trong token. Do la mac dinh dung cho ban chay
   * local/POC (engine mo tran), nhung SAI cho moi ban trien khai co Caddy dung truoc: claim do
   * mang ten mien cong khai, nen moi lan goi REST deu an 401 trong khi gRPC van chay tot — mot
   * kieu hong chi lo ra o man hinh chan doan, dung luc nguoi ta can no nhat.
   */
  readonly apiUrl?: string;
  /**
   * `none` chi hop le cho POC/local. Deployment that phai co TLS — xem runbook.
   * De o day duoi dang tuy chon co chu dich: gia tri mac dinh la CO TLS.
   */
  readonly tlsStrategy?: 'none' | 'tls' | 'mtls';
  /** Goc URL dashboard, chi de dung duong dan "Mo trong Hatchet" cho nguoi van hanh. */
  readonly dashboardBaseUrl?: string;
  /** Tien to ten workflow cua engine — lop cach ly moi truong thu hai tren cung mot instance. */
  readonly namespace?: string;
}

/** Trang thai CHUA ket thuc, theo tu vung cua engine. Dung cho cong DRAIN. */
const IN_FLIGHT_STATUSES = ['RUNNING', 'QUEUED'] as const;

export class HatchetWorkflowEngineAdapter extends WorkflowEnginePort {
  private readonly logger = new Logger(HatchetWorkflowEngineAdapter.name);
  private client?: HatchetClientType;

  constructor(private readonly config: HatchetEngineConfig) {
    super();
  }

  /**
   * Khoi tao TRE. Tao client la mo mot ket noi gRPC; lam viec do trong constructor se bien
   * "khach co khai bao engine" thanh "boot API that bai khi engine chua len" — hai chuyen khac
   * nhau, va chuyen thu hai khong duoc phep chan boot.
   */
  private hatchet(): HatchetClientType {
    if (!this.client) {
      this.client = HatchetClient.init({
        token: this.config.token,
        ...(this.config.hostPort ? { host_port: this.config.hostPort } : {}),
        // Vang mat, KHONG phai chuoi rong: `api_url: ''` se de SDK lay goc rong thay vi rot ve
        // duong suy-tu-token, tuc bien mot ban trien khai dang chay binh thuong thanh hong.
        ...(this.config.apiUrl ? { api_url: this.config.apiUrl } : {}),
        ...(this.config.namespace ? { namespace: this.config.namespace } : {}),
        ...(this.config.tlsStrategy
          ? { tls_config: { tls_strategy: this.config.tlsStrategy } }
          : {}),
      } as never);
    }
    return this.client;
  }

  async trigger(command: TriggerWorkflowCommand): Promise<WorkflowRunReference> {
    const workflowName = engineWorkflowName(command.workflowKey, command.workflowVersion);
    // Kich hoat theo TEN chu khong theo doi tuong workflow: tien trinh nay la NGUOI GOI, no
    // khong nhat thiet dang giu code cua phien ban do. Do cung la dieu kien de mot ban trien
    // khai chi chay worker (khong co API) van phuc vu duoc run cu.
    const reference = await this.hatchet().runNoWait(workflowName, command.input as never, {
      additionalMetadata: { ...command.metadata },
    });
    const engineRunId = await reference.runId;
    const dashboardUrl = this.dashboardUrl(engineRunId);
    this.logger.log(`Da kich hoat ${workflowName} -> run ${engineRunId}`);
    return { engineRunId, workflowName, ...(dashboardUrl ? { dashboardUrl } : {}) };
  }

  async sendEvent(eventKey: string, payload: Readonly<Record<string, unknown>>): Promise<void> {
    await this.hatchet().events.push(eventKey, { ...payload });
  }

  async cancel(engineRunId: string): Promise<void> {
    await this.hatchet().runs.cancel({ ids: [engineRunId] });
  }

  async describeRun(engineRunId: string): Promise<WorkflowRunSummary | null> {
    try {
      const details = (await this.hatchet().runs.get(engineRunId)) as unknown as {
        run?: Record<string, unknown>;
      };
      const run = details.run;
      if (!run) return null;
      const dashboardUrl = this.dashboardUrl(engineRunId);
      return {
        engineRunId,
        workflowName: String(run.displayName ?? run.workflowName ?? ''),
        status: String(run.status ?? 'UNKNOWN'),
        ...(run.startedAt ? { startedAt: String(run.startedAt) } : {}),
        ...(run.finishedAt ? { finishedAt: String(run.finishedAt) } : {}),
        ...(run.errorMessage ? { errorMessage: String(run.errorMessage) } : {}),
        ...(dashboardUrl ? { dashboardUrl } : {}),
      };
    } catch (error) {
      // 404 = khong tim thay. Do la cau tra loi HOP LE, khong phai loi: Hatchet xoa run o trang
      // thai cuoi sau 30 ngay (`SERVER_LIMITS_DEFAULT_TENANT_RETENTION_PERIOD`), nen mot run cu
      // BIEN MAT la chuyen binh thuong. Ban ghi ben vung nam o `AuditLog` cua ta, khong o day.
      if ((error as { response?: { status?: number } }).response?.status === 404) return null;
      throw error;
    }
  }

  async countInFlight(workflowKey: string, workflowVersion: string): Promise<number> {
    const workflowName = engineWorkflowName(workflowKey, workflowVersion);
    const runs = (await this.hatchet().runs.list({
      workflowNames: [workflowName],
      statuses: [...IN_FLIGHT_STATUSES] as never,
      onlyTasks: false,
      // Chi can biet "con hay het" cho cong DRAIN; khong keo ve ca lich su.
      limit: 200,
      includePayloads: false,
    })) as unknown as { rows?: unknown[] };
    return runs.rows?.length ?? 0;
  }

  /**
   * Cong thuc URL nam o `workflow-run-dashboard.ts`, khong o day: man hinh chan doan cung dung
   * dung duong do va no khong duoc phep goi engine chi de xin mot cai link.
   */
  private dashboardUrl(engineRunId: string): string | undefined {
    return workflowRunDashboardUrl(this.config.dashboardBaseUrl, engineRunId);
  }
}
