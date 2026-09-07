import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { ExpenseClaimRepository, InMemoryExpenseClaimRepository } from '../claims/claim.repository.js';
import { ExpenseClaimService } from '../claims/claim.service.js';
import { PrismaExpenseClaimRepository } from '../claims/prisma-claim.repository.js';
import { TransportModule } from '../transport.module.js';
import { TRANSPORT_COSTING_POLICY, tenantTransportCostingPolicy } from './costing-policy.js';
import { CostingReadService } from './costing-read.service.js';
import { CostingRepository } from './costing.repository.js';
import { CostingService } from './costing.service.js';
import { FundPeriodService } from './fund-period.service.js';
import { InMemoryCostingRepository } from './in-memory-costing.repository.js';
import { PrismaCostingRepository } from './prisma-costing.repository.js';
import { TransportCoreFacts, TransportCoreFactsAdapter } from './transport-core-facts.port.js';

/**
 * Capability `transport-costing` — `TX-03 Costing + Driver Fund`.
 *
 * PHU THUOC `transport-core`, KHONG nguoc lai (T1 §10.1). Quan he do doc duoc ngay o dong `imports`
 * duoi day: mot khach bat costing ma khong bat core se bi `tenant.schema.ts` chan tu luc doc goi,
 * truoc khi Nest kip dung do thi module.
 *
 * KHONG tu cung cap `AuditLogService` cua rieng no (khac voi `TransportModule`, vi module do phai
 * dung duoc MOT MINH). O day thi phu thuoc da co san va duoc khai bao — dung mot instance thi mot
 * lan chi tien va lan doi trang thai chuyen di cung no nam trong cung mot dong dau vet.
 *
 * `TransportCoreFacts` la CUA SO DUY NHAT nhin sang `transport-core`, va no khong co ham ghi nao:
 * §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc giu bang KIEU, khong bang ky luat.
 */
@Module({
  imports: [PrismaModule, TransportModule],
  providers: [
    {
      provide: CostingRepository,
      useFactory: (prisma: PrismaService): CostingRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaCostingRepository(prisma)
          : new InMemoryCostingRepository(),
      inject: [PrismaService],
    },
    { provide: TransportCoreFacts, useClass: TransportCoreFactsAdapter },
    {
      provide: ExpenseClaimRepository,
      useFactory: (prisma: PrismaService): ExpenseClaimRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaExpenseClaimRepository(prisma)
          : new InMemoryExpenseClaimRepository(),
      inject: [PrismaService],
    },
    { provide: TRANSPORT_COSTING_POLICY, useFactory: tenantTransportCostingPolicy },
    CostingService,
    CostingReadService,
    FundPeriodService,
    ExpenseClaimService,
  ],
  exports: [
    CostingService,
    CostingReadService,
    FundPeriodService,
    ExpenseClaimService,
    CostingRepository,
  ],
})
export class TransportCostingModule {}
