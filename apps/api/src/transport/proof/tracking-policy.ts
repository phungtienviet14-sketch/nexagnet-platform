import type { ContinuityPolicy } from '../geo/continuity.js';
import type { AccuracyPolicy } from '../geo/location-quality.js';
import type { LocationHealthPolicy } from './location-health.js';

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
  /**
   * Loi thach thuc cua may chu song bao lau, giay.
   *
   * Day la phan "bounded" cua cau *"stale nonce/challenge behavior is bounded"* (#235). Con so
   * phai du DAI cho mot lan giao that — lai xe bam "Da den noi", chup anh, doi GPS hoi tu, roi
   * bam gui — va du NGAN de mot `nonce` xin san tu sang khong dung duoc cho buoi chieu.
   *
   * 300 giay (5 phut) la cung nguong voi `maxClockSkewSeconds`, va co chu y: hai con so tra loi
   * hai cau hoi khac nhau nhung cung mot bac do lon, nen mot nguoi van hanh khong phai nho hai
   * thang thoi gian.
   */
  readonly challengeTtlSeconds: number;
  /**
   * HAI CUA SO IM LANG cua phep cham suc khoe vi tri (`location-health.ts`, `#297 T1`/`T2`).
   *
   * ==========================================================================================
   * VI SAO KHONG DUNG LAI HAI NGUONG CUA DIEU XE
   * ==========================================================================================
   *
   * `TransportDispatchPolicy` co san `currentLocationFreshSeconds` / `currentLocationUsableSeconds`,
   * va lay chung sang day la mot sai lam lang le: chung tra loi mot cau hoi KHAC —
   * *"toi co duoc phep xep hang mot chiec xe tu vi tri nay khong"*. Do la mot cau hoi ve CHAT
   * LUONG MOT DAU VAO. Cau cua tep nay la *"he thong con dang nghe thay chiec xe nay khong"* —
   * mot cau hoi ve TINH SAN CO CUA MOT DUONG TRUYEN. Hai cau do khong buoc phai co cung dap an,
   * va o day chung thuc su khac nhau: mot man hinh van hanh phai NOI RA su im lang som hon nhieu
   * so voi luc mot vi tri cu tro nen vo dung cho viec dieu xe.
   *
   * ==========================================================================================
   * SUY RA TU NHIP LAY MAU DA DO, KHONG PHAI TU MOT SLA BIA
   * ==========================================================================================
   *
   * `docs/kien-truc/transport-geospatial.md` §5 ("Chinh sach lay mau de nghi") la nguon duy nhat
   * trong repo noi ve nhip that. No phat mot diem khi va chi khi mot chuyen dang chay:
   *
   *     >= 500 m ke tu diem truoc, HOAC 300 giay khi dang di chuyen, HOAC 900 giay khi dung yen,
   *     VA >= 30 giay ke tu diem truoc.
   *
   * Khoang IM LANG HOP LE DAI NHAT cua mot dien thoai dang chay dung theo chinh sach do la vi the
   * **900 giay** — xe do o bai, khong dich chuyen, chi con nhip dung-yen giu nhip.
   *
   * Con mot do tre thu hai, va no cung da duoc do trong repo: `DEFAULT_OUTBOX_POLICY.maxDelayMs`
   * cua `@netviet/driver-outbox` = **300 giay**. Mot diem sinh ra dung han van co the den may chu
   * muon toi chung do sau MOT lan thu lai da cham tran backoff. Do tre nay la mot phan cua giao
   * thuc chinh chung ta viet ra, nen no phai nam trong cua so, khong duoc tinh la "mat tin hieu".
   *
   *   `healthySilenceSeconds` = 900 + 300 = **1200** — mot chu ky dung-yen cong mot lan thu lai
   *     da cham tran. Duoi muc nay, im lang la HANH VI BINH THUONG da thiet ke, khong phai su co.
   *   `lostSilenceSeconds`    = 2 x 900 + 300 = **2100** — hai chu ky dung-yen lien tiep bi mat
   *     hoan toan, cong cung mot lan thu lai. Mot dien thoai con song khong im lau den the.
   *
   * MUC DO TIN CUA HAI CON SO NAY: nhip lay mau o §5 la mot chinh sach DE NGHI da duoc viet ra va
   * duoc vien dan (dispatch cung vien dan chinh no), KHONG phai mot phep do tren thiet bi that —
   * `#297` T0 ghi ro chua co ung dung native nao tren `main`, nen chua ai do duoc nhip thuc te cua
   * mot dien thoai bi he dieu hanh treo. Khi Lane T co so lieu tu thiet bi that, hai con so nay la
   * thu dau tien phai do lai. Chung co doi duoc bang mot dong cau hinh chinh vi le do.
   */
  readonly health: LocationHealthPolicy;
}

/** 900 giay (nhip dung-yen, §5) + 300 giay (tran backoff cua outbox). Xem `health` o tren. */
export const DEFAULT_HEALTHY_SILENCE_SECONDS = 1_200;
/** Hai chu ky dung-yen bi mat + mot lan thu lai da cham tran. Xem `health` o tren. */
export const DEFAULT_LOST_SILENCE_SECONDS = 2_100;

export const DEFAULT_TRANSPORT_PROOF_POLICY: TransportProofPolicy = {
  accuracy: { fineMaxMetres: 25, coarseMaxMetres: 100 },
  continuity: { maxPlausibleSpeedMetresPerSecond: 55, maxGapSeconds: 900 },
  maxClockSkewSeconds: 300,
  geofenceRadiusMetres: { min: 10, max: 100_000 },
  rawRetentionDays: 90,
  minSampleIntervalSeconds: 30,
  challengeTtlSeconds: 300,
  health: {
    healthySilenceSeconds: DEFAULT_HEALTHY_SILENCE_SECONDS,
    lostSilenceSeconds: DEFAULT_LOST_SILENCE_SECONDS,
  },
};
