import { Module } from '@nestjs/common';
import { TransportModule } from '../transport.module.js';
import { TransportCostingModule } from '../costing/transport-costing.module.js';
import {
  AnalyticsCostFacts,
  AnalyticsCostFactsAdapter,
  AnalyticsMovementFacts,
  AnalyticsMovementFactsAdapter,
} from './analytics.ports.js';
import { OperatingMetricsReadService } from './operating-metrics-read.service.js';

/**
 * `R8` — CHI SO VAN HANH. Den cung `transport-costing` va bien mat cung no.
 *
 * ===========================================================================
 * VI SAO O `transport-costing` CHU KHONG PHAI MOT CAPABILITY MOI.
 *
 * `CapabilityId` la mot enum DONG (`tenant.schema.ts`): them mot gia tri keo theo goi khach, do thi
 * phu thuoc va cac boot spec — mot cai gia that, phai co ly do that. `R8` khong co vong doi rieng,
 * khong co bang rieng, khong co lenh ghi nao: no la MOT CACH DOC du lieu ma `transport-costing` da
 * so huu mot nua (chi phi truc tiep), cong voi `transport-core` ma `transport-costing` DA phu thuoc
 * (`'transport-costing': { dependencies: ['transport-core'] }`).
 *
 * Nen o day khong co capability moi. Mot khach tat `transport-costing` mat luon bao cao nay, va do
 * la dung: bien truc tiep khong co nghia neu khong ai ghi chi phi truc tiep.
 *
 * ===========================================================================
 * HAI CONG RA NGOAI, ca hai CHI DOC — xem `analytics.ports.ts`. Khong cong nao co ham ghi, nen
 * `NO_CROSS_CONTEXT_REPOSITORY_WRITE` duoc giu bang KIEU chu khong bang ky luat.
 */
@Module({
  imports: [TransportModule, TransportCostingModule],
  providers: [
    { provide: AnalyticsMovementFacts, useClass: AnalyticsMovementFactsAdapter },
    { provide: AnalyticsCostFacts, useClass: AnalyticsCostFactsAdapter },
    OperatingMetricsReadService,
  ],
  exports: [OperatingMetricsReadService],
})
export class TransportAnalyticsModule {}
