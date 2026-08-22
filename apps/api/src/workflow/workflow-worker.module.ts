import { Module } from '@nestjs/common';
import { tenantWorkflowEngine } from '@netviet/tenant';
import { resolveWorkerRegistration, type WorkerRegistration } from './worker-registration.js';
import type { WorkflowEngineName } from './workflow-engine.port.js';
import type { WorkflowWorkerCredentials } from './workflow-worker.adapter.js';
import {
  WORKFLOW_WORKER_CREDENTIALS,
  WORKFLOW_WORKER_ENGINE,
  WORKFLOW_WORKER_REGISTRATION,
  WorkflowWorkerService,
} from './workflow-worker.service.js';

/**
 * MODULE HEP cho TIEN TRINH WORKER — co y KHONG phai `AppModule`.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG DUNG LAI `AppModule` "cho tien":
 *
 * Nam lop trong repo nay lam viec THAT trong `onModuleInit`:
 *
 *   ZcaListener · ZaloUserClient · BotPoller · CampaignScheduler · WorkflowScheduler
 *
 * Worker boot `AppModule` se dong thoi mo mot listener zca THU HAI tren cung tai khoan Zalo.
 * Mot tai khoan chi chiu duoc MOT listener, nen listener cua `api` bi da ra — kenh doc chinh
 * cua GD1 chet vi mot container phu khoi dong. Cong them mot campaign scheduler thu hai va mot
 * dispatcher thu hai.
 *
 * `workflow-worker.module.spec.ts` giu dung dieu nay bang bon khang dinh chay tren DI that.
 *
 * ---------------------------------------------------------------------------
 * DANH SACH PHU THUOC O DAY LA MOT HOP DONG, khong phai mot danh sach tien loi. Them mot
 * provider vao day la mot quyet dinh: no se chay trong CA HAI tien trinh, va bat ky viec nao no
 * lam trong `onModuleInit` se xay ra HAI LAN tren mot stack.
 */
@Module({
  providers: [
    {
      // Phan giai NGAY LUC BOOT -> tien trinh khong the song ma khong biet minh mang phien ban
      // nao. Che do hong te nhat la container xanh, healthcheck xanh, va moi run nam cho mai mai.
      provide: WORKFLOW_WORKER_REGISTRATION,
      useFactory: (): WorkerRegistration => resolveWorkerRegistration(process.env),
    },
    {
      provide: WORKFLOW_WORKER_ENGINE,
      useFactory: (): WorkflowEngineName => tenantWorkflowEngine().adapter,
    },
    {
      provide: WORKFLOW_WORKER_CREDENTIALS,
      useFactory: (): WorkflowWorkerCredentials => {
        const integration = tenantWorkflowEngine();
        // BI MAT doc tu BIEN MOI TRUONG ma goi khach TRO TOI, khong tu goi khach. Cung khuon
        // `workflow.module.ts` — goi khach nam trong git, token thi khong bao gio.
        const token = integration.credentialRef
          ? process.env[integration.credentialRef]
          : undefined;
        return {
          ...(token ? { token } : {}),
          ...(process.env.WORKFLOW_ENGINE_HOST_PORT
            ? { hostPort: process.env.WORKFLOW_ENGINE_HOST_PORT }
            : {}),
          ...(process.env.WORKFLOW_ENGINE_TLS_STRATEGY
            ? { tlsStrategy: process.env.WORKFLOW_ENGINE_TLS_STRATEGY as 'none' | 'tls' | 'mtls' }
            : {}),
          ...(process.env.WORKFLOW_ENGINE_NAMESPACE
            ? { namespace: process.env.WORKFLOW_ENGINE_NAMESPACE }
            : {}),
        };
      },
    },
    WorkflowWorkerService,
  ],
  exports: [WorkflowWorkerService],
})
export class WorkflowWorkerModule {}
