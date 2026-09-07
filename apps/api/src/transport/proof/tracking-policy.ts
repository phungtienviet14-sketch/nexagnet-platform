import type { ContinuityPolicy } from '../geo/continuity.js';
import type { AccuracyPolicy } from '../geo/location-quality.js';

/**
 * CHINH SACH BAM VI TRI cua mot khach — nguong, khong phai luat.
 *
 * Moi so o day deu co mac dinh dung duoc, nen khoi cau hinh nay HOAN TOAN TUY CHON trong goi
 * khach. Do la cung mot le voi nam capability van tai truoc no: khai `policy` trong
 * `CAPABILITY_DEPENDENCIES` se bien mot khoi tuy chon thanh mot dieu kien boot, va moi khach van
 * tai se phai go mot khoi rong chi de he thong khoi chet.
 */
export const TRANSPORT_PROOF_POLICY = Symbol('TRANSPORT_PROOF_POLICY');

export interface TransportProofPolicy {
  readonly accuracy: AccuracyPolicy;
  readonly continuity: ContinuityPolicy;
  /**
   * Lech dong ho toi da truoc khi gan co, giay.
   *
   * 300 giay (5 phut) hoi tu tu ba nguon doc lap — chu ky webhook cua Stripe, `leeway` khuyen nghi
   * cua RFC 7519, va do lech dong ho cho phep cua Kerberos RFC 4120.
   *
   * NHUNG: o day no chi GAN CO, khong tu choi. Voi mot hang doi ngoai tuyen, mot do lech lon gan
   * nhu luon co nghia la "may vua offline bon tieng", chu khong phai "ai do chinh dong ho". Tu
   * choi se lam mat dung nhung ban ghi cua doan duong khong co song — tuc dung doan ma bang chung
   * co gia tri nhat.
   */
  readonly maxClockSkewSeconds: number;
  /** Khoang ban kinh hang rao chap nhan duoc, met. Chan tren de mot loi go phim khong phu ca tinh. */
  readonly geofenceRadiusMetres: { readonly min: number; readonly max: number };
  /**
   * So ngay giu ban dinh vi o do phan giai day du.
   *
   * Day la mot rang buoc KY THUAT, doc lap voi viec chu so huu da xu ly xong phan phap ly voi lai
   * xe (#232 D-02): giu it hon thi re hon, va toi thieu hoa du lieu la mot thoi quen ky thuat dung
   * ke ca khi khong ai bat buoc. 90 ngay x 100 xe o nhip 30 giay ~ 2,5 GB — vua mot VPS cua #224.
   * Xem `docs/kien-truc/transport-geospatial.md` §5.
   */
  readonly rawRetentionDays: number;
  /** Chan duoi khoang cach hai ban dinh vi lien tiep, giay — tran chi phi cua ca he. */
  readonly minSampleIntervalSeconds: number;
}

export const DEFAULT_TRANSPORT_PROOF_POLICY: TransportProofPolicy = {
  accuracy: { fineMaxMetres: 25, coarseMaxMetres: 100 },
  continuity: { maxPlausibleSpeedMetresPerSecond: 55, maxGapSeconds: 900 },
  maxClockSkewSeconds: 300,
  geofenceRadiusMetres: { min: 10, max: 100_000 },
  rawRetentionDays: 90,
  minSampleIntervalSeconds: 30,
};
