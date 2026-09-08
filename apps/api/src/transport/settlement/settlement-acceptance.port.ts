import { Injectable } from '@nestjs/common';
import { CommercialAcceptanceService } from '../acceptance/acceptance.service.js';
import type { TripAcceptanceEligibility } from '../acceptance/acceptance.types.js';

/**
 * CUA SO thu tu cua `transport-settlement` — truc NGHIEM THU CHUNG TU (`#268` I5).
 *
 * ============================================================================================
 * CHI DOC, VA CHIEU PHU THUOC DI MOT CHIEU
 * ============================================================================================
 *
 *     transport-settlement  ──doc──▶  transport-acceptance
 *
 * Adapter nam o PHIA TIEU THU (tep nay), dung khuon `FuelSettlementSourceAdapter` da chay: mien
 * nghiem thu khong biet `transport-settlement` ton tai, va vi vay khong bao gio nhin thay mot dong
 * nao ve tien. Neu dat adapter o phia kia thi hai module se nhap vao nhau thanh mot vong.
 *
 * Cong nay KHONG co ham ghi, va do khong phai mot su bo sot: mot cong doi soat ma tu ghi duoc vao
 * chinh cai ho so no dang hoi la mot cong tu cap phep cho chinh no.
 *
 * ============================================================================================
 * VI SAO KHONG KHAI MOT `boolean`
 * ============================================================================================
 *
 * `TripAcceptanceEligibility` la mot union co nhan voi BA nhanh, va ca ba deu de lai mot ma ly do
 * rieng trong so quyet dinh. Mot `boolean` se lam "chuyen nay khong co vong chay de nghiem thu" va
 * "chuyen nay co vong chay nhung chua ai duyet" thanh cung mot cau tra loi — hai tinh huong khac
 * nhau hoan toan ve cai nguoi truc phai lam tiep.
 */
export abstract class SettlementAcceptanceGate {
  abstract eligibilityForTrip(tripId: string): Promise<TripAcceptanceEligibility>;
}

@Injectable()
export class SettlementAcceptanceGateAdapter extends SettlementAcceptanceGate {
  constructor(private readonly acceptance: CommercialAcceptanceService) {
    super();
  }

  eligibilityForTrip(tripId: string): Promise<TripAcceptanceEligibility> {
    return this.acceptance.eligibilityForTrip(tripId);
  }
}
