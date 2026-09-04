import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCostingModule } from '../costing/transport-costing.module.js';
import { TransportModule } from '../transport.module.js';
import { InMemoryWorkforceRepository } from './in-memory-workforce.repository.js';
import { PrismaWorkforceRepository } from './prisma-workforce.repository.js';
import { TRANSPORT_PAYROLL_POLICY, tenantTransportPayrollPolicy } from './payroll-policy.js';
import { WorkforceReadService } from './workforce-read.service.js';
import {
  WorkforceCoreFacts,
  WorkforceCoreFactsAdapter,
  WorkforceCostingFacts,
  WorkforceCostingFactsAdapter,
} from './workforce.ports.js';
import { WorkforceRepository } from './workforce.repository.js';
import { WorkforceService } from './workforce.service.js';

/**
 * `TX-07` — ky luong, phieu luong, thanh phan luong.
 *
 * `imports` co HAI capability van tai, khop dung phu thuoc khai o T1 §10.1 va o
 * `tenant.schema.ts`. `TransportCostingModule` o day KHONG phai de tru luong: no o day de phieu
 * luong HIEN THI so du quy (VT-062 muon nguoi duyet nhin thay truoc khi quyet). `GD-12` tat khau
 * tru tu dong, va `TransportPayslipComponent_deduction_manual_only` giu dieu do o tang luu tru.
 *
 * `WorkforceFuelFacts` CO Y khong duoc dang ky o day. `transport-fuel` khong nam trong phu thuoc
 * cua capability nay, nen cong do vang mat va `WorkforceService` nhan `undefined` qua `@Optional()`
 * — lan chay ghi `FUEL_SAVING_UNAVAILABLE` vao `missingInputs`. Khi `TX-04` cong bo mot phep tong
 * hop "lit tiet kiem theo lai xe theo ky" tat dinh, adapter cua no dang ky o `app-composition.ts`
 * duoi quyen so huu cua `transport-fuel` — khong phai o day.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportCostingModule],
  providers: [
    {
      provide: WorkforceRepository,
      useFactory: (prisma: PrismaService): WorkforceRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaWorkforceRepository(prisma)
          : new InMemoryWorkforceRepository(),
      inject: [PrismaService],
    },
    { provide: WorkforceCoreFacts, useClass: WorkforceCoreFactsAdapter },
    { provide: WorkforceCostingFacts, useClass: WorkforceCostingFactsAdapter },
    { provide: TRANSPORT_PAYROLL_POLICY, useFactory: tenantTransportPayrollPolicy },
    WorkforceService,
    WorkforceReadService,
  ],
  exports: [WorkforceService, WorkforceReadService, WorkforceRepository, TRANSPORT_PAYROLL_POLICY],
})
export class TransportWorkforceModule {}
