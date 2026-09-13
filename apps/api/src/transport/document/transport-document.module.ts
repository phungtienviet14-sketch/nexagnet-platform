import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCheckpointModule } from '../checkpoint/transport-checkpoint.module.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from '../transport-policy.js';
import { TransportModule } from '../transport.module.js';
import {
  TransportDocumentCoreFacts,
  TransportDocumentCoreFactsAdapter,
  TransportDocumentSiteFacts,
  TransportDocumentSiteFactsAdapter,
} from './document-facts.port.js';
import { NoFilePlatformAdapter, TransportDocumentFilePort } from './document-file.port.js';
import {
  InMemoryOperationalDocumentRepository,
  OperationalDocumentRepository,
} from './document.repository.js';
import { OperationalDocumentService } from './document.service.js';
import {
  InMemoryPhysicalReceiptHandoverRepository,
  PhysicalReceiptHandoverRepository,
} from './handover.repository.js';
import { PhysicalReceiptHandoverService } from './handover.service.js';
import { PrismaOperationalDocumentRepository } from './prisma-document.repository.js';
import { PrismaPhysicalReceiptHandoverRepository } from './prisma-handover.repository.js';

/**
 * CHUNG TU VAN HANH + BAN GIAO BIEN NHAN — `#279` O1/O2/O7.
 *
 * ============================================================================================
 * KHONG PHAI MOT CAPABILITY MOI
 * ============================================================================================
 *
 * Module nay den cung `transport-checkpoint` (`app-composition.ts`). `tenant.schema.ts` da mo ta
 * capability do la *"moc gan vao VehicleRun/RunLeg, phieu cong/can/giao, phien cho nguoi nhan, phu
 * cap cho cua lai xe"* — bon thu, khong mot. Mot khach co cong de vao va can de can cung la khach
 * co phieu cong va phieu can; tach chung ra se bat ho khai bon co cho mot quy trinh.
 *
 * Tach thanh MODULE rieng (khong nhet vao `TransportCheckpointModule`) vi mot ly do khac han: kich
 * thuoc. Mot module cam ca moc, ca phien cho, ca phu cap va ca chung tu se la mot tep khong ai doc
 * het duoc.
 *
 * ============================================================================================
 * CONG TEP: FAIL-CLOSED CHO TOI KHI `#287` VAO `main`
 * ============================================================================================
 *
 * `NoFilePlatformAdapter` tra ve `UNAVAILABLE` cho MOI ma tep. Do la cau tra loi DUNG chu khong
 * mot cho trong: hom nay B that su chi co ban giay, va duong `EXTERNAL_PHYSICAL` di duoc.
 *
 * Khi Lane P (`#287`) duoc chap nhan tren `main`, thu duy nhat phai doi la DONG NAY — khong mot
 * luat mien nao, khong mot bang nao, khong mot bai test nghiep vu nao.
 */
@Module({
  imports: [PrismaModule, TransportModule, TransportCheckpointModule],
  providers: [
    {
      provide: OperationalDocumentRepository,
      useFactory: (prisma: PrismaService): OperationalDocumentRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaOperationalDocumentRepository(prisma)
          : new InMemoryOperationalDocumentRepository(),
      inject: [PrismaService],
    },
    {
      provide: PhysicalReceiptHandoverRepository,
      useFactory: (prisma: PrismaService): PhysicalReceiptHandoverRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaPhysicalReceiptHandoverRepository(prisma)
          : new InMemoryPhysicalReceiptHandoverRepository(),
      inject: [PrismaService],
    },
    { provide: TransportDocumentCoreFacts, useClass: TransportDocumentCoreFactsAdapter },
    { provide: TransportDocumentSiteFacts, useClass: TransportDocumentSiteFactsAdapter },
    /** DONG DUY NHAT phai doi khi `#287` vao `main`. Xem khoi chu thich cua lop. */
    { provide: TransportDocumentFilePort, useClass: NoFilePlatformAdapter },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    OperationalDocumentService,
    PhysicalReceiptHandoverService,
  ],
  exports: [
    OperationalDocumentService,
    PhysicalReceiptHandoverService,
    OperationalDocumentRepository,
    PhysicalReceiptHandoverRepository,
  ],
})
export class TransportDocumentModule {}
