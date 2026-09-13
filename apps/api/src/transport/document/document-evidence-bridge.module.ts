import { Global, Module } from '@nestjs/common';
import { OperationalDocumentAcceptanceEvidenceAdapter } from './acceptance-evidence.adapter.js';
import { TransportDocumentModule } from './transport-document.module.js';

/**
 * CAU NOI chung tu van hanh -> cong nghiem thu cua Lane K — `#275` K2 + `#279` O2.
 *
 * ============================================================================================
 * VI SAO PHAI LA `@Global()`, VA VI SAO KHONG DUOC LA MOT PHU THUOC CUNG
 * ============================================================================================
 *
 * `CommercialAcceptanceService` nam TRONG `TransportAcceptanceModule`. Nest giai phu thuoc cua no
 * trong injector cua chinh module do — mot provider dang ky o module GOC khong nhin thay duoc tu
 * ben trong. Cung bay ma `TransportWaitingPayrollBridgeModule` da gap, va cung cach go.
 *
 * Duong hien nhien — cho `TransportAcceptanceModule` `imports` thang `TransportDocumentModule` —
 * la SAI, va chinh `tenant.schema.ts` da noi truoc:
 *
 *     *"Khai `transport-checkpoint` o day HOM NAY se bien mot phu thuoc CHUA CO THAT thanh mot dieu
 *       kien boot."*
 *
 * Va no van sai sau khi F2 vao `main`, chi vi mot ly do khac: `transport-acceptance` la PHU THUOC
 * BAT BUOC cua `transport-settlement`. Bat no keo theo `transport-checkpoint` se lam moi khach
 * theo doi cong no phai bat ca quy trinh cong/can/phieu giao cua cong ty B — dung dieu Quyet dinh
 * kien truc #6 cam.
 *
 * Nen module nay ton tai: no CHI xuat MOT adapter, va adapter do CHI co hai ham DOC.
 *
 * ============================================================================================
 * VANG MAT CUNG LA MOT CAU TRA LOI — VA NO FAIL-CLOSED
 * ============================================================================================
 *
 * Module nay den cung `transport-checkpoint`. Khach tat capability do thi token khong ton tai,
 * `transport-acceptance.module.ts` nhan `undefined` qua `{ optional: true }`, va no giu nguyen
 * `NoOperationalDocumentsAdapter` — FAIL-CLOSED, dung hinh dang `main` da co truoc tranche nay.
 *
 * Tuc: bo cau noi KHONG mo mot lo hong nao. No chi lam duong can cu `DOCUMENT` dong lai, va duong
 * `EXTERNAL_PHYSICAL` van di duoc.
 */
@Global()
@Module({
  imports: [TransportDocumentModule],
  providers: [OperationalDocumentAcceptanceEvidenceAdapter],
  exports: [OperationalDocumentAcceptanceEvidenceAdapter],
})
export class TransportDocumentEvidenceBridgeModule {}
