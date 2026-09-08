import { Injectable } from '@nestjs/common';
import { CommercialAcceptanceService } from '../acceptance/acceptance.service.js';
import type { OrderCompletionEligibility } from '../acceptance/acceptance.types.js';

/**
 * CUA SO thu tu cua `transport-settlement` — truc KET THUC DON (`#275` K5).
 *
 * ============================================================================================
 * CHI DOC, VA CHIEU PHU THUOC DI MOT CHIEU
 * ============================================================================================
 *
 *     transport-settlement  ──doc──▶  transport-acceptance
 *
 * Adapter nam o PHIA TIEU THU (tep nay), dung khuon `FuelSettlementSourceAdapter` da chay: mien ket
 * thuc don khong biet `transport-settlement` ton tai, va vi vay khong bao gio nhin thay mot dong
 * nao ve tien. Neu dat adapter o phia kia thi hai module se nhap vao nhau thanh mot vong.
 *
 * Cong nay KHONG co ham ghi, va do khong phai mot su bo sot: mot cong doi soat ma tu ghi duoc vao
 * chinh cai ho so no dang hoi la mot cong tu cap phep cho chinh no.
 *
 * ============================================================================================
 * VI SAO KHONG KHAI MOT `boolean`
 * ============================================================================================
 *
 * `OrderCompletionEligibility` la mot union co nhan voi BA nhanh, va ca ba deu de lai mot ma ly do
 * rieng trong so quyet dinh. Mot `boolean` se lam "nguon nay chua co don nao lam chu the" va "co
 * don nhung chua ai ket thuc" thanh cung mot cau tra loi — hai tinh huong khac nhau hoan toan ve
 * cai nguoi truc phai lam tiep.
 *
 * ============================================================================================
 * KHOA LA `tripId`, NHUNG GRAIN LA DON — va do khong mau thuan
 * ============================================================================================
 *
 * Nguon quyet toan hom nay co khoa `(sourceContext, tripId)`; doi khoa do la doi chinh khoa chong
 * ghi trung cua moi chung tu da phat hanh, tuc dung cai `#275` K6 cam. Nen cong nhan `tripId` va
 * TU tra cuu ra don qua `TransportTripOrderLink` — mot duong KHONG di qua vong chay.
 */
export abstract class SettlementOrderCompletionGate {
  abstract eligibilityForTrip(tripId: string): Promise<OrderCompletionEligibility>;
}

@Injectable()
export class SettlementOrderCompletionGateAdapter extends SettlementOrderCompletionGate {
  constructor(private readonly acceptance: CommercialAcceptanceService) {
    super();
  }

  eligibilityForTrip(tripId: string): Promise<OrderCompletionEligibility> {
    return this.acceptance.eligibilityForTrip(tripId);
  }
}
