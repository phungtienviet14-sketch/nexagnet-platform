import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from '../transport-policy.js';
import { TransportModule } from '../transport.module.js';
import {
  GeofenceRepository,
  InMemoryGeofenceRepository,
  PrismaGeofenceRepository,
} from './geofence.repository.js';
import { GeofenceService } from './geofence.service.js';
import {
  InMemoryOperationalProofRepository,
  OperationalProofRepository,
} from './operational-proof.repository.js';
import { OperationalProofService } from './operational-proof.service.js';
import { PrismaOperationalProofRepository } from './prisma-operational-proof.repository.js';
import { PrismaTrackingRepository } from './prisma-tracking.repository.js';
import {
  DEFAULT_TRANSPORT_PROOF_POLICY,
  TRANSPORT_PROOF_POLICY,
  type TransportProofPolicy,
} from './tracking-policy.js';
import { InMemoryTrackingRepository, TrackingRepository } from './tracking.repository.js';
import { TrackingService } from './tracking.service.js';
import {
  UnconfiguredVehicleTelematicsAdapter,
  VehicleTelematicsPort,
} from './telematics/vehicle-telematics.port.js';
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
    {
      /**
       * NGUON VI TRI THU HAI — hom nay chua co nha cung cap nao, va adapter mac dinh noi thang
       * dieu do thay vi tra ve mot mang rong.
       *
       * Khac biet do khong vun vat: mot mang rong khong phan biet duoc voi "xe do khong chay hom
       * nay", nen mot man hinh doi chieu cheo se hien mau xanh cho moi chiec xe, mai mai, o mot
       * he chua he duoc cam vao gi ca — va khong ai phat hien ra.
       */
      provide: VehicleTelematicsPort,
      useClass: UnconfiguredVehicleTelematicsAdapter,
    },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    {
      // Moi nguong o day deu co mot mac dinh dung duoc, nen "goi khach khong khai gi" la duong
      // chay binh thuong chu khong phai mot cau hinh thieu.
      provide: TRANSPORT_PROOF_POLICY,
      useFactory: (): TransportProofPolicy => DEFAULT_TRANSPORT_PROOF_POLICY,
    },
    {
      provide: OperationalProofRepository,
      useFactory: (prisma: PrismaService): OperationalProofRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaOperationalProofRepository(prisma)
          : new InMemoryOperationalProofRepository(),
      inject: [PrismaService],
    },
    {
      provide: GeofenceRepository,
      useFactory: (prisma: PrismaService): GeofenceRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaGeofenceRepository(prisma)
          : new InMemoryGeofenceRepository(),
      inject: [PrismaService],
    },
    TrackingService,
    OperationalProofService,
    GeofenceService,
  ],
  exports: [
    TrackingService,
    TrackingRepository,
    VehicleTelematicsPort,
    OperationalProofService,
    OperationalProofRepository,
    GeofenceRepository,
    // `ProofReviewController` dang ky o GOC, nen no CHI thay danh sach nay. Mot provider noi bo
    // (vd `TRANSPORT_PROOF_POLICY`) tiem vao controller do se chet luc khoi dong — da xay ra that.
    GeofenceService,
  ],
})
export class TransportProofModule {}
