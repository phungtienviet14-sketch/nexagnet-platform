import { Global, Module } from '@nestjs/common';
import {
  AnalyticsFuelAttributionFacts,
  AnalyticsFuelAttributionFactsAdapter,
} from '../analytics/analytics.ports.js';
import { TransportFuelModule } from './transport-fuel.module.js';

/**
 * CAU NOI phan bo gia thanh nhien lieu -> bien truc tiep cua vong chay — `#369` R-1.
 *
 * ============================================================================================
 * VI SAO PHAI LA `@Global()`, VA VI SAO DIEU DO KHONG PHA VO RANH GIOI CAPABILITY
 *
 * `OperatingMetricsReadService` la mot provider NAM TRONG `TransportAnalyticsModule`. Nest giai phu
 * thuoc cua mot provider trong injector cua CHINH module do cong voi phan `exports` cua nhung module
 * no `imports` — provider dang ky o module GOC (`app-composition.ts`) KHONG nhin thay duoc tu ben
 * trong. Cung bai hoc voi `TransportWaitingPayrollBridgeModule` (`#279` O6).
 *
 * Hai duong con lai deu sai:
 *
 *   · cho `TransportAnalyticsModule` `imports` thang `TransportFuelModule` se bien nhien lieu thanh
 *     PHU THUOC CUNG cua bao cao van hanh — moi khach xem bien truc tiep se phai bat ca doi soat
 *     bang ke cay xang. Dung dieu `tenant.schema.ts` dat ra khi cho `transport-costing` chi phu
 *     thuoc `transport-core`;
 *   · dat `@Global()` len chinh `TransportFuelModule` se phoi CA kho phieu, kho tram va kho chung tu
 *     ra moi module — mot be mat rong hon nhieu so voi cai duy nhat can di qua.
 *
 * Nen module nay ton tai: no CHI xuat MOT cong, va cong do CHI DOC.
 *
 * ============================================================================================
 * VANG MAT CUNG LA MOT CAU TRA LOI
 *
 * Module nay den cung `transport-fuel` (`app-composition.ts`). Khach tat capability do thi module
 * khong duoc nap, token khong ton tai, `@Optional()` cua `OperatingMetricsReadService` nhan
 * `undefined` — va bao cao phat `FUEL_COST_ATTRIBUTION` vao `unavailableSources` thay vi lang le
 * cong ra mot so 0 doc y het "vong chay nay khong ton dau nao".
 */
@Global()
@Module({
  imports: [TransportFuelModule],
  providers: [
    { provide: AnalyticsFuelAttributionFacts, useClass: AnalyticsFuelAttributionFactsAdapter },
  ],
  exports: [AnalyticsFuelAttributionFacts],
})
export class TransportFuelAnalyticsBridgeModule {}
