import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportModule } from '../transport.module.js';
import { AssetComplianceReadService } from './asset-compliance-read.service.js';
import {
  TRANSPORT_COMPLIANCE_POLICY,
  tenantTransportCompliancePolicy,
} from './asset-compliance-policy.js';
import {
  AssetComplianceCoreFacts,
  AssetComplianceCoreFactsAdapter,
} from './asset-compliance.ports.js';
import { AssetComplianceRepository } from './asset-compliance.repository.js';
import { AssetComplianceService } from './asset-compliance.service.js';
import { InMemoryAssetComplianceRepository } from './in-memory-asset-compliance.repository.js';
import { PrismaAssetComplianceRepository } from './prisma-asset-compliance.repository.js';

/**
 * `TX-06` — bao duong, giay to va trang thai hieu luc cua xe.
 *
 * `imports` CHI co `TransportModule`, va do la mot khang dinh chu khong mot thieu sot: T1 §10.1
 * khai `transport-asset-compliance` phu thuoc DUY NHAT `transport-core`. Mot khach bat bao duong
 * ma tat costing/fuel la mot cau hinh HOP LE, va module nay phai boot duoc trong cau hinh do.
 *
 * Bang canh bao GOM CHUNG doc them hai nguon nam o costing va fuel — no CO Y khong o day ma o
 * `app-composition.ts`, dung de module nay khong phai `imports` hai capability co the dang tat.
 * Xem `operational-alerts.service.ts`.
 */
@Module({
  imports: [PrismaModule, TransportModule],
  providers: [
    {
      provide: AssetComplianceRepository,
      useFactory: (prisma: PrismaService): AssetComplianceRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaAssetComplianceRepository(prisma)
          : new InMemoryAssetComplianceRepository(),
      inject: [PrismaService],
    },
    { provide: AssetComplianceCoreFacts, useClass: AssetComplianceCoreFactsAdapter },
    { provide: TRANSPORT_COMPLIANCE_POLICY, useFactory: tenantTransportCompliancePolicy },
    AssetComplianceService,
    AssetComplianceReadService,
  ],
  exports: [
    AssetComplianceService,
    AssetComplianceReadService,
    AssetComplianceRepository,
    TRANSPORT_COMPLIANCE_POLICY,
  ],
})
export class TransportAssetComplianceModule {}
