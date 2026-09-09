import { Global, Module } from '@nestjs/common';
import {
  WorkforceWaitingAllowanceFacts,
  WorkforceWaitingAllowanceFactsAdapter,
} from '../workforce/workforce.ports.js';
import { TransportCheckpointModule } from '../checkpoint/transport-checkpoint.module.js';

/**
 * CAU NOI phu cap cho -> bang luong — `#279` O6.
 *
 * ============================================================================================
 * VI SAO PHAI LA `@Global()`, VA VI SAO DIEU DO KHONG PHA VO RANH GIOI CAPABILITY
 * ============================================================================================
 *
 * `WorkforceService` la mot provider NAM TRONG `TransportWorkforceModule`. Nest giai phu thuoc cua
 * mot provider trong injector cua CHINH module do cong voi phan `exports` cua nhung module no
 * `imports` — provider dang ky o module GOC (`app-composition.ts`) KHONG nhin thay duoc tu ben
 * trong. Do la ly do khoi chu thich cua `transport-workforce.module.ts` — noi rang adapter se
 * "dang ky o app-composition" — chua du de chay.
 *
 * Hai duong con lai deu sai:
 *
 *   · cho `TransportWorkforceModule` `imports` thang `TransportCheckpointModule` se bien moc hien
 *     truong thanh PHU THUOC CUNG cua bang luong — moi khach tra luong se phai bat ca quy trinh
 *     cong/can/phieu giao cua cong ty B. Dung dieu Quyet dinh kien truc #6 cam;
 *   · dat `@Global()` len chinh `TransportCheckpointModule` se phoi CA kho moc va CA kho phien cho
 *     ra moi module — mot be mat rong hon nhieu so voi cai duy nhat can di qua.
 *
 * Nen module nay ton tai: no CHI xuat MOT cong, va cong do CHI DOC.
 *
 * ============================================================================================
 * VANG MAT CUNG LA MOT CAU TRA LOI
 * ============================================================================================
 *
 * Module nay den cung `transport-checkpoint` (`app-composition.ts`). Khach tat capability do thi
 * module khong duoc nap, token khong ton tai, `@Optional()` cua `WorkforceService` nhan `undefined`
 * — va lan chay luong ghi `WAITING_ALLOWANCE_UNAVAILABLE` vao `missingInputs` thay vi lang le cong
 * ra so khong.
 */
@Global()
@Module({
  imports: [TransportCheckpointModule],
  providers: [
    { provide: WorkforceWaitingAllowanceFacts, useClass: WorkforceWaitingAllowanceFactsAdapter },
  ],
  exports: [WorkforceWaitingAllowanceFacts],
})
export class TransportWaitingPayrollBridgeModule {}
