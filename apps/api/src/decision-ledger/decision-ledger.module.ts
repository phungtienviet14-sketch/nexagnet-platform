import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { SourceRegistryModule } from '../source-registry/source-registry.module.js';
import { DecisionReconciliationSink } from './decision-criticality.js';
import { DecisionLedgerRepository } from './decision-ledger.repository.js';
import { DecisionLedgerService } from './decision-ledger.service.js';
import { InMemoryDecisionLedgerRepository } from './in-memory-decision-ledger.repository.js';
import { LoggingDecisionReconciliationSink } from './logging-reconciliation.sink.js';
import { PrismaDecisionLedgerRepository } from './prisma-decision-ledger.repository.js';

/**
 * SO CAI QUYET DINH — tang NEN TANG, khong phai mot capability.
 *
 * Cung ly do voi `ObservabilityModule` va `SourceRegistryModule`: MOI khach deu can tra loi duoc
 * "vi sao he thong da xu su nhu vay voi ca nay". Mot khach van tai can dieu do khong kem mot khach
 * ban hang. Cai khac nhau giua cac khach la NOI DUNG (`decisionPoint` do capability so huu dat
 * ten), khong phai co tang nay hay khong.
 *
 * PHU THUOC `SourceRegistryModule` mot cach CO CHU DICH — day la phu thuoc duy nhat ra ngoai cum,
 * va no la yeu cau cua muc 9 hop dong: mot `factId` gan vao quyet dinh phai duoc KIEM la co that
 * va thuoc dung pham vi khach. Khong co phep kiem do, so cai se nhan mot tham chieu bat ky va
 * doc len nhu da duoc kiem.
 *
 * Chieu phu thuoc CHI MOT HUONG: nguon su that khong biet gi ve so cai. Do la thu tu dung — su
 * that ton tai truoc quyet dinh dung no.
 */
@Module({
  imports: [PrismaModule, SourceRegistryModule],
  providers: [
    {
      provide: DecisionLedgerRepository,
      useFactory: (prisma: PrismaService): DecisionLedgerRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaDecisionLedgerRepository(prisma)
          : new InMemoryDecisionLedgerRepository(),
      inject: [PrismaService],
    },
    { provide: DecisionReconciliationSink, useClass: LoggingDecisionReconciliationSink },
    DecisionLedgerService,
  ],
  exports: [DecisionLedgerService, DecisionLedgerRepository],
})
export class DecisionLedgerModule {}
