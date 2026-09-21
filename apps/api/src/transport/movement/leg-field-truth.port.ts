import { Injectable } from '@nestjs/common';

/**
 * SU THAT HIEN TRUONG cua MOT chang, nhin tu `transport-core` — `#332`.
 *
 * ============================================================================================
 * VI SAO CO CONG NAY
 * ============================================================================================
 *
 * `TransportRunLeg.status` va so ghi hien truong (moc cua lai xe) la HAI TRUC doc lap. Moc khong
 * bao gio day trang thai chang; nguoc lai, truoc cong nay, `transitionLeg()` cung khong hoi moc —
 * nen ngay 19/09/2026 mot tien trinh `node` dong duoc chang `LOADED` sang `COMPLETED` khi chang do
 * chua co mot moc nao. Cong nay la cho DUY NHAT truc kia duoc hoi truoc khi truc nay hoan tat mot
 * chang co hang.
 *
 * ============================================================================================
 * CHIEU PHU THUOC
 * ============================================================================================
 *
 * `transport-core` KHONG biet ve moc. Cong nam o day (phia nguoi hoi), ban hien thuc nam o
 * `transport-checkpoint` (phia nguoi so huu su that), va `app-composition.ts` noi chung — cung khuon
 * `RunClosureBlockerSource`. Khach chi bat `transport-core` nhan ban RONG duoi day.
 */
export interface LegFieldDelivery {
  /** Nguoi nhan da nhan hang tren CHINH chang nay chua (`DELIVERY_ACCEPTED`). */
  readonly delivered: boolean;
  /**
   * Giai doan hien truong luc hoi (`deriveLegPhase`) — de GHI vao dau vet mot lan ghi de, khong de
   * phan xu. Chuoi tran chu khong `RunLegPhase` de `transport-core` khong phai import kieu cua moc.
   */
  readonly phase: string;
}

export abstract class LegFieldTruthSource {
  /**
   * `null` = khach KHONG co nguon hien truong nao (tat `transport-checkpoint`) — khong co gi de doi
   * chieu, KHONG phai "hien truong noi chua giao". Nem = nguon co nhung doc khong duoc: nguoi goi
   * phai that bai dong.
   */
  abstract deliveryOf(legId: string): Promise<LegFieldDelivery | null>;
}

/** Ban mac dinh cua `transport-core`: khong co so ghi hien truong nao de hoi. */
@Injectable()
export class NoLegFieldTruthSource extends LegFieldTruthSource {
  async deliveryOf(): Promise<null> {
    return null;
  }
}
