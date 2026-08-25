import {
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { activeWorkflowEngine } from './workflow-engine-switch.js';
import { randomUUID } from 'node:crypto';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaService } from '../config/prisma.service.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { resolveReleaseIdentity } from '../observability/release-identity.js';
import { resolveWorkerTraceBridge } from '../observability/worker-trace-bridge.js';
import { PrismaWorkflowOutboxRepository } from './prisma-workflow-outbox.repository.js';
import { WorkflowDispatcher } from './workflow-dispatcher.js';
import {
  WorkflowHandoffService,
  WORKFLOW_BINDINGS,
  WORKFLOW_RUNTIME_IDENTITY,
  type WorkflowRuntimeIdentity,
} from './workflow-handoff.service.js';
import { createWorkflowEngineAdapter } from './workflow-engine.adapter.js';
import { WorkflowEnginePort } from './workflow-engine.port.js';
import {
  InMemoryWorkflowOutboxRepository,
  WorkflowOutboxRepository,
} from './workflow-outbox.repository.js';
import { WorkflowRunLookup } from './workflow-run-lookup.service.js';

const TICK_INTERVAL_MS = 5_000;
const LEASE_SECONDS = 60;

/**
 * Bo dem thoi gian danh thuc dispatcher. Dung khuon `CampaignScheduler`:
 * `setInterval` + `.unref()` + co `ticking`, va TRANG THAI KHONG NAM TRONG TIMER — mat dien
 * giua chung thi hang outbox van con trong DB.
 */
@Injectable()
export class WorkflowScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowScheduler.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly dispatcher: WorkflowDispatcher) {}

  onModuleInit(): void {
    // Khach chua bat engine thi khong dung bo dem: mot timer chay mai de khong tim thay gi la
    // rac, va no lam log cua khach do nhieu ma khong noi len dieu gi.
    if (activeWorkflowEngine().adapter === 'none') {
      this.logger.log('Workflow engine: none — khong khoi dong dispatcher.');
      return;
    }
    this.timer = setInterval(() => void this.runTick(), TICK_INTERVAL_MS);
    this.timer.unref();
    void this.runTick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async runTick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.dispatcher.tick();
    } finally {
      this.ticking = false;
    }
  }
}

/**
 * NEN TANG, khong phai capability — cung ly do voi `ObservabilityModule`.
 *
 * Ban giao ben vung la nang luc ma BAT KY mien nao cung co the can (don hang, chien dich, noi
 * dung). Bat no thanh mot capability rieng se buoc moi khach muon dung phai khai them mot dong
 * o `capabilities`, trong khi thu that su khac nhau giua cac khach da nam san trong
 * `integrations.workflowEngine`.
 *
 * Khach khong khai bao engine: cong la `DisabledWorkflowEngineAdapter`, dispatcher khong khoi
 * dong, va he thong boot BINH THUONG. Do la duong mac dinh, khong phai duong ngoai le.
 */
@Module({
  providers: [
    {
      provide: WorkflowOutboxRepository,
      useFactory: (prisma: PrismaService): WorkflowOutboxRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaWorkflowOutboxRepository(prisma)
          : new InMemoryWorkflowOutboxRepository(),
      inject: [PrismaService],
    },
    { provide: WORKFLOW_BINDINGS, useFactory: activeWorkflowEngine },
    {
      /*
       * HAI CHIEU CUA KHOA THAO TAC, va ca hai deu phai la su that luc CHAY.
       *
       * `resolveReleaseIdentity()` doc slug tu GOI KHACH truoc tien (`TENANT_DIR`/`TENANT`), roi
       * moi den `release.json` va bien moi truong. Truoc 25/08/2026 phep doc goi khach nam o
       * `observability.module.ts` chu khong nam trong ham, nen loi goi o day tra ve
       * `tenant='unknown'` tren dung cau hinh ma stack that dang chay: `TENANT_DIR=/srv/tenant`,
       * khong co `TENANT`, va `release.json` chua bao gio duoc mount vao container.
       *
       * Hau qua khong dung o mot nhan xau: `tenant` la mot CHIEU CUA KHOA THAO TAC
       * (`buildOperationKey`) va la mot truong cua dau vao workflow. Moi khach deu ghi `unknown`
       * vao do, nen hai khach khac nhau sinh ra CUNG mot khoa cho cung mot ma don — tuc cong
       * chong trung cua khach nay co the nuot mat viec cua khach kia.
       */
      provide: WORKFLOW_RUNTIME_IDENTITY,
      useFactory: (): WorkflowRuntimeIdentity => {
        const release = resolveReleaseIdentity();
        return { tenant: release.tenant, environment: release.environment };
      },
    },
    {
      provide: WorkflowEnginePort,
      useFactory: async (): Promise<WorkflowEnginePort> => {
        const integration = activeWorkflowEngine();
        new Logger('WorkflowEngineProvider').log(`Cong workflow engine: ${integration.adapter}`);
        // BI MAT doc tu BIEN MOI TRUONG ma goi khach TRO TOI, khong tu goi khach. Goi khach nam
        // trong git; token thi khong bao gio duoc nam trong git.
        const token = integration.credentialRef
          ? process.env[integration.credentialRef]
          : undefined;
        return createWorkflowEngineAdapter(integration.adapter, {
          ...(token ? { token } : {}),
          ...(process.env.WORKFLOW_ENGINE_HOST_PORT
            ? { hostPort: process.env.WORKFLOW_ENGINE_HOST_PORT }
            : {}),
          ...(process.env.WORKFLOW_ENGINE_TLS_STRATEGY
            ? { tlsStrategy: process.env.WORKFLOW_ENGINE_TLS_STRATEGY as 'none' | 'tls' | 'mtls' }
            : {}),
          ...(process.env.WORKFLOW_ENGINE_DASHBOARD_URL
            ? { dashboardBaseUrl: process.env.WORKFLOW_ENGINE_DASHBOARD_URL }
            : {}),
          ...(process.env.WORKFLOW_ENGINE_NAMESPACE
            ? { namespace: process.env.WORKFLOW_ENGINE_NAMESPACE }
            : {}),
        });
      },
    },
    WorkflowHandoffService,
    {
      provide: WorkflowDispatcher,
      useFactory: async (
        outbox: WorkflowOutboxRepository,
        engine: WorkflowEnginePort,
        audit: AuditLogService | undefined,
      ) =>
        new WorkflowDispatcher(
          outbox,
          engine,
          {
            // Moi tien trinh mot dinh danh rieng — de biet AI dang giu lease khi phai go roi.
            workerId: `workflow-dispatcher-${randomUUID()}`,
            leaseSeconds: LEASE_SECONDS,
          },
          // `optional` de mot ban trien khai khong co audit van chay duoc: quan sat khong bao
          // gio duoc la DIEU KIEN de nghiep vu thanh cong.
          audit,
          // Phan giai bang HAM chu khong bang mot provider — cung ly le voi phia worker: cau noi
          // nay khong duoc keo `ObservabilityModule` (va qua do `TraceController`) vao do thi phu
          // thuoc cua workflow. `OTEL_TRACING` khong bat -> NOOP, khong SDK nao duoc nap.
          await resolveWorkerTraceBridge(),
        ),
      inject: [
        WorkflowOutboxRepository,
        WorkflowEnginePort,
        { token: AuditLogService, optional: true },
      ],
    },
    WorkflowScheduler,
    WorkflowRunLookup,
  ],
  /*
   * Chi xuat CAU NOI, CONG va DUONG DOC. Noi goi nghiep vu van khong duoc cham vao outbox hay
   * dispatcher — neu chung ra ngoai thi som muon co nguoi xep hang truc tiep, bo qua bien gioi
   * rieng tu.
   *
   * `WorkflowRunLookup` KHONG pha rang buoc do: no chi co `forEntity()`, va `forEntity()` chi
   * doc. Cai duoc giu kin la quyen GHI, va quyen do khong duoc mo them o day.
   */
  exports: [WorkflowHandoffService, WorkflowEnginePort, WorkflowRunLookup],
})
export class WorkflowModule {}
