import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from '../transport-policy.js';
import { TransportModule } from '../transport.module.js';
import { PrismaTrackingRepository } from './prisma-tracking.repository.js';
import {
  DEFAULT_TRANSPORT_PROOF_POLICY,
  TRANSPORT_PROOF_POLICY,
  type TransportProofPolicy,
} from './tracking-policy.js';
import { InMemoryTrackingRepository, TrackingRepository } from './tracking.repository.js';
import { TrackingService } from './tracking.service.js';
import {
  TransportProofCoreFacts,
  TransportProofCoreFactsAdapter,
} from './transport-proof-facts.port.js';

/**
 * Capability `transport-proof` — bam vi tri va chung cu van hanh.
 *
 * MOT CAPABILITY RIENG, khong phai mot phan cua `transport-core`, va ly do rat cu the: mot khach
 * van tai phai chay duoc MA KHONG bam vi tri. Vi tri cua nguoi lao dong la thu co dieu kien phap
 * ly, co chi phi luu tru, va co khach se dung nguon khac (hop GSHT tren xe) thay vi dien thoai.
 * Nhet no vao `transport-core` se bat moi khach van tai mang theo ca tang do du ho khong bao gio
 * bat no.
 *
 * `imports: [TransportModule]` — de lay `TripRepository` va `FleetRepository` cho cong doc
 * `TransportProofCoreFacts`. Day la mot chieu: `transport-core` khong biet gi ve capability nay.
 */
@Module({
  imports: [PrismaModule, TransportModule],
  providers: [
    {
      provide: TrackingRepository,
      useFactory: (prisma: PrismaService): TrackingRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaTrackingRepository(prisma)
          : new InMemoryTrackingRepository(),
      inject: [PrismaService],
    },
    { provide: TransportProofCoreFacts, useClass: TransportProofCoreFactsAdapter },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    {
      // Moi nguong o day deu co mot mac dinh dung duoc, nen "goi khach khong khai gi" la duong
      // chay binh thuong chu khong phai mot cau hinh thieu.
      provide: TRANSPORT_PROOF_POLICY,
      useFactory: (): TransportProofPolicy => DEFAULT_TRANSPORT_PROOF_POLICY,
    },
    TrackingService,
  ],
  exports: [TrackingService, TrackingRepository],
})
export class TransportProofModule {}
