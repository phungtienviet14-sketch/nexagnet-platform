import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportProofModule } from '../proof/transport-proof.module.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from '../transport-policy.js';
import { TransportModule } from '../transport.module.js';
import { DEFAULT_SITE_CANDIDATE_POLICY, type SiteCandidatePolicy } from './site-candidate.js';
import {
  TransportSiteIntakeCoreFacts,
  TransportSiteIntakeCoreFactsAdapter,
  TransportSiteIntakeGeoFacts,
  TransportSiteIntakeGeoFactsAdapter,
  TransportSiteIntakeLocationFacts,
  TransportSiteIntakeLocationFactsAdapter,
} from './site-intake-facts.port.js';
import {
  InMemoryRunSiteIntakeRepository,
  RunSiteIntakeRepository,
} from './site-intake.repository.js';
import { PrismaRunSiteIntakeRepository } from './prisma-site-intake.repository.js';
import { SiteIntakeService, TRANSPORT_SITE_INTAKE_POLICY } from './site-intake.service.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { MovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaSiteIntakeConfirmationWriter } from './prisma-site-intake-confirmation.writer.js';
import {
  MovementSiteIntakeConfirmationWriter,
  SiteIntakeConfirmationWriter,
} from './site-intake-confirmation.writer.js';
import { RunPlanRepository } from '../planning/planning.repository.js';
import { PrismaSiteIntakeCommercialStore } from './prisma-site-intake-commercial.store.js';
import { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import {
  InMemorySiteIntakeCommercialStore,
  SiteIntakeCommercialStore,
} from './site-intake-commercial.store.js';
import { SiteIntakeReadinessReader } from './site-intake-readiness.reader.js';
import { SiteIntakeReviewService } from './site-intake-review.service.js';

/**
 * Capability `transport-site-intake` — nhan viec tai dia diem A (`#267`).
 *
 * MOT CAPABILITY RIENG, cung ly le da viet o `transport-proof` va `transport-checkpoint`: mot
 * khach van tai phai chay duoc MA KHONG co duong lai xe tu tao chuyen. Cong ty B can no vi lai xe
 * cua ho den thang nha may A roi moi biet se cho gi di dau; mot khach dieu xe tu van phong thi
 * khong — voi ho, moi vong chay deu ra doi tu mot lenh dieu, va mot nut `Tao chuyen` tren dien
 * thoai lai xe la mot lo hong quy trinh chu khong phai mot tien ich.
 *
 * HAI PHU THUOC, va ca hai deu that:
 *   · `transport-core`  — dia diem, phap nhan, doi xe, va `MovementService` de tao vong chay;
 *   · `transport-proof` — hang rao dia ly va ban dinh vi. Bo phu thuoc nay thi khong con gi de DE
 *     NGHI: man hinh se hien danh sach toan bo kho cua moi khach hang, va `#267` H2 tro thanh mot
 *     o tim kiem.
 *
 * Ca hai deu MOT CHIEU: `transport-core` va `transport-proof` khong biet gi ve capability nay.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportProofModule],
  providers: [
    {
      provide: RunSiteIntakeRepository,
      useFactory: (prisma: PrismaService): RunSiteIntakeRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaRunSiteIntakeRepository(prisma)
          : new InMemoryRunSiteIntakeRepository(),
      inject: [PrismaService],
    },
    { provide: TransportSiteIntakeCoreFacts, useClass: TransportSiteIntakeCoreFactsAdapter },
    { provide: TransportSiteIntakeGeoFacts, useClass: TransportSiteIntakeGeoFactsAdapter },
    {
      provide: TransportSiteIntakeLocationFacts,
      useClass: TransportSiteIntakeLocationFactsAdapter,
    },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    {
      /**
       * Ba nguong (sai so, tuoi, so ung vien) deu co mac dinh dung duoc ngay cho ho so B, nen khai
       * chung o `tenant.schema.ts` se bien mot khoi hoan toan tuy chon thanh mot dieu kien boot.
       * Cung ly le voi `TRANSPORT_PROOF_POLICY` va `TRANSPORT_CHECKPOINT_POLICY`.
       */
      provide: TRANSPORT_SITE_INTAKE_POLICY,
      useFactory: (): SiteCandidatePolicy => DEFAULT_SITE_CANDIDATE_POLICY,
    },
    /**
     * `#398` — LAN GHI cua mot lan tai xe xac nhan. Postgres: MOT giao dich duoi khoa tu van cua xe
     * (khoa bo lap ke hoach cung gianh). Trong bo nho: qua `MovementService`, xep hang qua mot hang
     * doi — khong co giao dich, bang chung dong thoi la Postgres.
     */
    {
      provide: SiteIntakeConfirmationWriter,
      useFactory: (
        prisma: PrismaService,
        audit: AuditLogService,
        movement: MovementService,
        intakes: RunSiteIntakeRepository,
        core: TransportSiteIntakeCoreFacts,
      ): SiteIntakeConfirmationWriter =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaSiteIntakeConfirmationWriter(prisma, audit)
          : new MovementSiteIntakeConfirmationWriter(movement, intakes, core),
      inject: [
        PrismaService,
        AuditLogService,
        MovementService,
        RunSiteIntakeRepository,
        TransportSiteIntakeCoreFacts,
      ],
    },
    SiteIntakeService,
    /**
     * `#398` — phan THUONG MAI. Kho chon theo `PERSISTENCE` cung khuon kho xac nhan o tren; ban trong
     * bo nho di qua chinh cac kho trong bo nho cua `transport-core` (don, vong chay, chang, ke
     * hoach) — nen CUNG mot ban kho xac nhan phai duoc dung o ca hai noi.
     */
    {
      provide: SiteIntakeCommercialStore,
      useFactory: (
        prisma: PrismaService,
        intakes: RunSiteIntakeRepository,
        movement: MovementRepository,
        plans: RunPlanRepository,
        audit: AuditLogService,
      ): SiteIntakeCommercialStore =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaSiteIntakeCommercialStore(prisma, audit)
          : new InMemorySiteIntakeCommercialStore(
              intakes as InMemoryRunSiteIntakeRepository,
              movement,
              plans,
              audit,
            ),
      inject: [
        PrismaService,
        RunSiteIntakeRepository,
        MovementRepository,
        RunPlanRepository,
        AuditLogService,
      ],
    },
    SiteIntakeReadinessReader,
    SiteIntakeCommercialService,
    SiteIntakeReviewService,
  ],
  exports: [
    SiteIntakeService,
    RunSiteIntakeRepository,
    SiteIntakeCommercialService,
    SiteIntakeReviewService,
  ],
})
export class TransportSiteIntakeModule {}
