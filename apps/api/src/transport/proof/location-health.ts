import { parseGeoPoint, type GeoPoint } from '../geo/geo-point.js';
import type { LocationSource } from './tracking.types.js';

/**
 * SUC KHOE VI TRI cua mot chiec xe — `#297 T1`.
 *
 * ============================================================================================
 * CAU HOI MA TANG NAY TRA LOI, VA CAU HOI MA NO TU CHOI TRA LOI
 * ============================================================================================
 *
 * No tra loi: *"he thong CO dang nhan duoc vi tri cua chiec xe nay khong, tu nguon nao, va ban
 * cuoi cung cu bao nhieu"*.
 *
 * No KHONG tra loi: *"vi sao khong nhan duoc"*. Owner da viet thang dieu do vao Issue: tu mot
 * khoang IM LANG, may chu khong the ket luan lai xe da tat ung dung, tat GPS, mat song, bi he
 * dieu hanh treo tien trinh nen, het pin, hay hong cam bien. NAM nguyen nhan do cho ra DUNG MOT
 * quan sat giong het nhau. Vi vay moi ma ly do trong tep nay deu ta TINH SAN CO CUA TIN HIEU
 * (`NO_RECENT_OBSERVATION`), va khong mot ma nao duoc phep ta HANH VI CUA MOT CON NGUOI. Mot ma
 * kieu `DRIVER_CLOSED_APP` la mot loi to chua bao gio duoc chung minh, va no khong duoc ton tai o
 * bat ky dau trong tep nay.
 *
 * ============================================================================================
 * MOT TOA DO CU LA BANG CHUNG CUOI CUNG, KHONG BAO GIO LA "HIEN TAI"
 * ============================================================================================
 *
 * `LastKnownLocation.usableAsCurrent` la truong quan trong nhat cua ca ket qua. No la co DUY NHAT
 * cho phep mot man hinh ve mot cham xe len ban do va goi do la cho chiec xe DANG dung. Khi no
 * `false`, toa do van di ra — nhung no phai duoc ve nhu mot dau vet cu kem tuoi, khong phai mot
 * vi tri hien tai. `#297 T5` case C: *"Last known coordinate may be shown only as last known with
 * age, not a current marker."*
 *
 * Mot he thong tra ve toa do ma khong tra ve co nay buoc moi nguoi goi phai tu nghi ra nguong cua
 * rieng minh — va chi can MOT nguoi goi nghi sai la ca doi xe hien ra nhu dang chay binh thuong
 * trong khi khong mot chiec nao con gui gi ve.
 *
 * ============================================================================================
 * TANG NAY THUAN TUY. Khong Nest, khong Prisma, khong I/O, va KHONG DOC DONG HO: `now` di vao
 * bang tham so (`INV-25`), nen mot bai kiem thu chay luc nao trong ngay cung cho mot ket qua.
 */

/* ------------------------------------------------------------------ *
 * HO NGUON — `#297 T3`
 * ------------------------------------------------------------------ */

/**
 * HO NGUON gom cac nguon THO lai, va KHONG ghi de len chung.
 *
 * `#297 T3`: *"Preserve the original source on each observation."* Nen `SourceFamilyHealth` mang
 * CA hai — `family` de nhom, `source` de truy nguyen. Mot man hinh noi "GPS dien thoai" con mot
 * lan xem lai bang chung van doc duoc do la `DEVICE_NETWORK` (sai so hang tram met) hay
 * `DEVICE_GNSS`.
 */
export const LOCATION_SOURCE_FAMILY_VALUES = ['PHONE', 'TELEMATICS', 'MANUAL'] as const;
export type LocationSourceFamily = (typeof LOCATION_SOURCE_FAMILY_VALUES)[number];

/**
 * Bang anh xa DAY DU theo kieu — `Record<LocationSource, ...>` nen them mot nguon moi vao
 * `tracking.types.ts` ma quen o day la mot loi BIEN DICH, khong phai mot nhanh `default` lang le
 * nem nguon moi vao mot ho sai.
 */
const SOURCE_FAMILY: Readonly<Record<LocationSource, LocationSourceFamily>> = {
  DEVICE_GNSS: 'PHONE',
  DEVICE_FUSED: 'PHONE',
  DEVICE_NETWORK: 'PHONE',
  TELEMATICS: 'TELEMATICS',
  MANUAL: 'MANUAL',
};

export const locationSourceFamily = (source: LocationSource): LocationSourceFamily =>
  SOURCE_FAMILY[source];

/**
 * `MANUAL` BI LOAI KHOI moi phep cham suc khoe, va day la mot quyet dinh co chu y.
 *
 * Mot nguoi go tay mot toa do vao he thong khong noi len DIEU GI ve viec chiec xe co dang duoc
 * bam vi tri hay khong. Neu de mot ban nhap tay dat lai `lastReceivedAt`, thi mot thao tac nhap
 * lieu se TAT duoc mot canh bao "mat GPS" — tuc mot duong lam im lang bao dong ma khong ai co y
 * dinh mo ra.
 *
 * Ban nhap tay van la chung cu, va no van nam trong `LocationObservation`. No chi khong duoc
 * tra loi cau hoi cua tep nay.
 */
const TRACKED_FAMILIES = ['PHONE', 'TELEMATICS'] as const;
type TrackedFamily = (typeof TRACKED_FAMILIES)[number];

/**
 * MOT phep kiem chay duoc cho danh sach tren, thay vi hai cho go tay cung mot luat.
 *
 * Viet la `=== 'MANUAL'` thi moi ho nguon THEM VAO sau nay se duoc tinh vao phep cham mot cach
 * im lang — tuc mac dinh la MO. Hoi "co nam trong danh sach duoc bam khong" thi mac dinh la
 * DONG, va do la chieu dung cho mot phep cham suc khoe: mot nguon chua ai quyet dinh tin den muc
 * nao thi khong duoc tu dong tro thanh bang chung "xe con song".
 */
const isTrackedFamily = (family: LocationSourceFamily): family is TrackedFamily =>
  (TRACKED_FAMILIES as readonly LocationSourceFamily[]).includes(family);

/* ------------------------------------------------------------------ *
 * THANG TRANG THAI
 * ------------------------------------------------------------------ */

/**
 * TRANG THAI CUA MOT HO NGUON — nam bac, va khong bac nao gop duoc voi bac nao.
 *
 * `NOT_CONFIGURED` KHONG phai `LOST`, va do la cung mot lap luan da duoc viet o
 * `telematics-crosscheck.ts`: mot nguon chua he duoc cam vao phai noi rang no chua duoc cam vao.
 * Gop no vao `LOST` se to mot khach chua mua hop GSHT nao la dang mat tin hieu phan cung, mai mai.
 *
 * `AWAITING_FIRST` KHONG phai `LOST`: mot phien vua mo ba muoi giay truoc chua kip co ban dinh vi
 * dau tien — may thu GNSS khoi dong nguoi mat hang chuc giay. Bao "mat GPS" o day la sai theo
 * nghia den.
 */
export const LOCATION_SOURCE_STATUS_VALUES = [
  /** Co ban dinh vi trong cua so lanh manh. */
  'LIVE',
  /** Cu hon cua so lanh manh, chua qua cua so mat. Van la du lieu, chi la du lieu cu. */
  'DEGRADED',
  /** Qua cua so mat — hoac chua tung co ban nao ke tu khi he bat dau cho. */
  'LOST',
  /** Dang cho ban dinh vi DAU TIEN, va cuoc cho do chua qua han. */
  'AWAITING_FIRST',
  /** Nguon nay chua duoc khai cho chiec xe nay. Mot trien khai hop le, khong phai mot su co. */
  'NOT_CONFIGURED',
] as const;
export type LocationSourceStatus = (typeof LOCATION_SOURCE_STATUS_VALUES)[number];

/**
 * TRANG THAI TONG HOP cua chiec xe — sau nghia cua `#297 T1`, va chung phai TACH duoc.
 *
 * Hai cap de bi gop nhat, va gop cap nao cung lam hong mot man hinh:
 *
 *   · `NOT_TRACKED` ⟂ `LOST` — cai dau la "khong ai yeu cau bam vi tri chiec xe nay", cai sau la
 *     "co yeu cau, va no dang hong". Gop lai thi moi chiec xe khong bat theo doi deu hien mau do,
 *     nguoi truc tat het canh bao, va tu do tro di khong con canh bao nao co nghia;
 *   · `DEGRADED` ⟂ `LOST` — cai dau van con mot vi tri dung duoc de dieu phoi, cai sau thi khong.
 *     Gop lai thi hoac ta vut di du lieu con dung duoc, hoac ta dieu xe theo mot vi tri da chet.
 */
export const VEHICLE_LOCATION_HEALTH_VALUES = [
  /** Khong co ky vong bam vi tri. KHONG phai mat GPS. */
  'NOT_TRACKED',
  /** Dang nhan vi tri tu dien thoai. */
  'LIVE',
  /** Co du lieu nhung da cu hon cua so lanh manh. */
  'DEGRADED',
  /** Co ky vong, nguon dang choi khong con ban nao trong cua so mat. */
  'LOST',
  /** Dien thoai im, nhung phan cung tren xe van dang bao. */
  'SOURCE_FALLBACK',
  /** Ca dien thoai lan phan cung deu qua cua so mat. */
  'ALL_SOURCES_LOST',
] as const;
export type VehicleLocationHealthStatus = (typeof VEHICLE_LOCATION_HEALTH_VALUES)[number];

/**
 * LY DO — MOT ma cho MOI duong dan toi mot trang thai, khong mot `boolean` nao.
 *
 * `LOST` co HAI duong toi rat khac nhau — "da tung nhan roi thoi" va "chua bao gio nhan duoc gi"
 * — va hai duong do dan toi hai viec khac nhau cho nguoi truc (goi lai xe hoi duong ⟂ kiem lai
 * xem ung dung da cai dat chua). Mot co nhi phan se xoa mat khac biet do.
 *
 * KHONG mot ma nao o day duoc ta nguyen nhan. Xem khoi chu thich dau tep.
 */
export const LOCATION_HEALTH_REASON_VALUES = [
  /** Khong ai yeu cau bam vi tri chiec xe nay. */
  'TRACKING_NOT_EXPECTED',
  'RECENT_OBSERVATION',
  /** Da mo ky vong, chua co ban dau tien, va cuoc cho chua qua han. */
  'AWAITING_FIRST_OBSERVATION',
  'OBSERVATION_AGEING',
  /** Da tung nhan, roi ngung. Day la ma ma Issue goi ten. */
  'NO_RECENT_OBSERVATION',
  /** Ky vong da mo qua lau ma chua he nhan duoc mot ban nao. */
  'NO_OBSERVATION_RECEIVED',
  /** Dien thoai khong con ban nao trong cua so lanh manh; phan cung tren xe thi co. */
  'PHONE_SILENT_TELEMATICS_RECENT',
  'NO_RECENT_OBSERVATION_ANY_SOURCE',
] as const;
export type LocationHealthReason = (typeof LOCATION_HEALTH_REASON_VALUES)[number];

/* ------------------------------------------------------------------ *
 * CHINH SACH
 * ------------------------------------------------------------------ */

/**
 * HAI CUA SO IM LANG. Gia tri mac dinh + cach suy ra chung nam o `tracking-policy.ts`.
 *
 * Hinh dang o day chu khong o tep chinh sach, cung khuon voi `AccuracyPolicy`
 * (`geo/location-quality.ts`): tang thuan so huu hinh dang dau vao cua chinh no, va nho the no
 * khong phu thuoc nguoc len tep chinh sach.
 */
export interface LocationHealthPolicy {
  /** `<=` nguong nay thi mot nguon con `LIVE`. */
  readonly healthySilenceSeconds: number;
  /** `>` nguong nay thi mot nguon la `LOST`. Giua hai nguong la `DEGRADED`. */
  readonly lostSilenceSeconds: number;
}

/* ------------------------------------------------------------------ *
 * DAU VAO
 * ------------------------------------------------------------------ */

/**
 * KY VONG BAM VI TRI — su khac nhau giua `NOT_TRACKED` va `LOST` nam TRON trong truong nay.
 *
 * `since` khong phai trang tri: khi chua co ban dinh vi nao, do la moc DUY NHAT de do xem cuoc
 * cho da qua han chua. Thieu no thi mot phien vua mo se khong phan biet duoc voi mot phien mo tu
 * sang va chet ngay tu dau.
 */
export interface TrackingExpectation {
  readonly tripId: string;
  readonly sessionId: string | null;
  /** Tu luc nao he thong BAT DAU cho vi tri cua chiec xe nay. Dong ho MAY CHU. */
  readonly since: Date;
}

/** Mot ban dinh vi da duoc CHAP NHAN, thu gon con dung phan tang nay dung toi. */
export interface LocationHealthSample {
  readonly source: LocationSource;
  readonly point: GeoPoint;
  readonly accuracyMetres: number | null;
  /** Dong ho MAY CHU (`LocationObservation.receivedAt`). Day moi la su that. */
  readonly receivedAt: Date;
  readonly sessionId: string | null;
}

export interface LocationHealthInput {
  readonly vehicleId: string;
  /** `null` = khong co ky vong nao (khong co phien, hoac khach khong bat nang luc bam vi tri). */
  readonly expectation: TrackingExpectation | null;
  /** Nguoi goi dua vao cac ban gan nhat; tang nay tu chon ban moi nhat cua tung ho nguon. */
  readonly samples: readonly LocationHealthSample[];
  /** Khach da khai mot nha cung cap telematics cho CHIEC XE NAY chua. */
  readonly telematicsConfigured: boolean;
}

/* ------------------------------------------------------------------ *
 * DAU RA
 * ------------------------------------------------------------------ */

export interface SourceFamilyHealth {
  readonly family: LocationSourceFamily;
  readonly status: LocationSourceStatus;
  /** Nguon THO cua ban gan nhat — truy nguyen, khong bi ho nguon nuot mat. */
  readonly source: LocationSource | null;
  /** ISO. `null` khi ho nguon nay chua he co ban nao. */
  readonly lastReceivedAt: string | null;
  readonly ageSeconds: number | null;
}

export interface LastKnownLocation {
  readonly point: GeoPoint;
  readonly source: LocationSource;
  readonly family: LocationSourceFamily;
  readonly accuracyMetres: number | null;
  readonly sessionId: string | null;
  /** ISO, dong ho may chu. */
  readonly observedAt: string;
  readonly ageSeconds: number;
  /**
   * CO DUY NHAT cho phep ve toa do nay nhu vi tri HIEN TAI cua chiec xe.
   *
   * `true` chi khi chinh ban dinh vi nay dang o trang thai `LIVE`. Moi truong hop khac — kem ca
   * `DEGRADED` — la `false`, va toa do di kem phai duoc doc la mot dau vet cu.
   */
  readonly usableAsCurrent: boolean;
}

export interface VehicleLocationHealth {
  readonly vehicleId: string;
  readonly status: VehicleLocationHealthStatus;
  readonly reason: LocationHealthReason;
  /** Ho nguon dang cung cap vi tri hien tai. `null` khi khong ho nao dang cung cap. */
  readonly currentSource: LocationSourceFamily | null;
  /** ISO. Khop voi `lastKnown.observedAt`; `null` khi khong co bang chung nao. */
  readonly lastReceivedAt: string | null;
  readonly ageSeconds: number | null;
  readonly sources: readonly SourceFamilyHealth[];
  readonly lastKnown: LastKnownLocation | null;
}

/* ------------------------------------------------------------------ *
 * PHEP CHAM
 * ------------------------------------------------------------------ */

/**
 * Tuoi tinh bang giay, KHONG BAO GIO am.
 *
 * Mot `receivedAt` o tuong lai chi xay ra khi dong ho may chu bi chinh lui; ket qua dung la 0
 * ("vua nhan xong"), khong phai mot so am chay xuoi qua moi phep so sanh nguong ben duoi.
 */
const ageSecondsBetween = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));

/**
 * Loc ban dinh vi KHONG dung duoc cho phep cham nay, va coi nhu chung khong ton tai.
 *
 * Hai luoi, va ca hai deu phai o TANG NAY chu khong o nguoi goi:
 *
 *   · `MANUAL` — xem khoi chu thich tren `TRACKED_FAMILIES`;
 *   · toa do khong qua duoc `parseGeoPoint` — ke ca (0, 0). Cau *"khong bao gio phat ra 0,0 hay
 *     mot toa do bia"* (`#297 T1`) chi la mot tinh chat neu chinh tang nay cuong che no; de nguoi
 *     goi loc thi no la mot loi hua.
 *
 * Mot ban bi loai khong lam ho nguon cua no `LIVE` — no khong lam gi ca, y nhu chua tung den.
 */
const isUsableSample = (sample: LocationHealthSample): boolean => {
  if (!isTrackedFamily(locationSourceFamily(sample.source))) return false;
  return parseGeoPoint(sample.point.latitude, sample.point.longitude).ok;
};

/** Ban MOI NHAT cua tung ho nguon duoc bam. Hoa thi giu ban gap truoc — xem chu thich duoi. */
function newestByFamily(
  samples: readonly LocationHealthSample[],
): ReadonlyMap<TrackedFamily, LocationHealthSample> {
  const newest = new Map<TrackedFamily, LocationHealthSample>();
  for (const sample of samples) {
    const family = locationSourceFamily(sample.source);
    // Thu hep kieu o DAY chu khong bang mot phep ep: `isUsableSample` da loai moi ho khong duoc
    // bam, nhung `tsc` khong doc duoc dieu do qua mot ham tra `boolean`.
    if (!isTrackedFamily(family) || !isUsableSample(sample)) continue;
    const held = newest.get(family);
    // `>` chu khong `>=`: hai ban cung mot mili giay may chu cua CUNG mot ho nguon khong xay ra
    // (khoa idempotency + chan duoi 30 giay cua chinh sach lay mau), nen khong can mot khoa phan
    // dinh thu hai — nhung neu no xay ra, giu ban gap truoc la tat dinh theo dau vao.
    if (held === undefined || sample.receivedAt.getTime() > held.receivedAt.getTime()) {
      newest.set(family, sample);
    }
  }
  return newest;
}

interface GradedFamily {
  readonly health: SourceFamilyHealth;
  readonly sample: LocationHealthSample | null;
  readonly ageSeconds: number | null;
}

function gradeFamily(
  family: TrackedFamily,
  sample: LocationHealthSample | null,
  expectationAgeSeconds: number,
  configured: boolean,
  now: Date,
  policy: LocationHealthPolicy,
): GradedFamily {
  if (!configured) {
    return {
      health: {
        family,
        status: 'NOT_CONFIGURED',
        source: null,
        lastReceivedAt: null,
        ageSeconds: null,
      },
      sample: null,
      ageSeconds: null,
    };
  }

  if (sample === null) {
    // Chua co ban nao: do TUOI CUA KY VONG, khong phai tuoi cua mot ban khong ton tai. Cung hai
    // nguong, vi cung mot cau hoi — "he da cho bao lau roi".
    const status: LocationSourceStatus =
      expectationAgeSeconds > policy.lostSilenceSeconds ? 'LOST' : 'AWAITING_FIRST';
    return {
      health: { family, status, source: null, lastReceivedAt: null, ageSeconds: null },
      sample: null,
      ageSeconds: null,
    };
  }

  const ageSeconds = ageSecondsBetween(sample.receivedAt, now);
  const status: LocationSourceStatus =
    ageSeconds <= policy.healthySilenceSeconds
      ? 'LIVE'
      : ageSeconds <= policy.lostSilenceSeconds
        ? 'DEGRADED'
        : 'LOST';

  return {
    health: {
      family,
      status,
      source: sample.source,
      lastReceivedAt: sample.receivedAt.toISOString(),
      ageSeconds,
    },
    sample,
    ageSeconds,
  };
}

const lastKnownFrom = (
  graded: GradedFamily,
  usableAsCurrent: boolean,
): LastKnownLocation | null => {
  if (graded.sample === null || graded.ageSeconds === null) return null;
  return {
    point: graded.sample.point,
    source: graded.sample.source,
    family: locationSourceFamily(graded.sample.source),
    accuracyMetres: graded.sample.accuracyMetres,
    sessionId: graded.sample.sessionId,
    observedAt: graded.sample.receivedAt.toISOString(),
    ageSeconds: graded.ageSeconds,
    usableAsCurrent,
  };
};

/** Ban moi nhat giua hai ho nguon — dung lam BANG CHUNG CUOI khi khong ho nao con `LIVE`. */
const newerOf = (left: GradedFamily, right: GradedFamily): GradedFamily => {
  if (left.sample === null) return right;
  if (right.sample === null) return left;
  return right.sample.receivedAt.getTime() > left.sample.receivedAt.getTime() ? right : left;
};

/**
 * PHEP CHAM — `#297 T1`/`T5`.
 *
 * Thu tu xet doc len duoc thanh cau, va do la co y:
 *
 *   khong co ky vong                              -> `NOT_TRACKED` (KHONG phai mat GPS)
 *   dien thoai con `LIVE`                         -> `LIVE`
 *   dien thoai im, phan cung tren xe con `LIVE`   -> `SOURCE_FALLBACK`
 *   con it nhat mot nguon `DEGRADED`              -> `DEGRADED`
 *   dang cho ban dau tien, chua qua han           -> `DEGRADED` kem ly do rieng
 *   ca hai nguon dang choi deu `LOST`             -> `ALL_SOURCES_LOST`
 *   con lai                                       -> `LOST`
 *
 * DIEN THOAI DUOC XET TRUOC PHAN CUNG, va khong phai vi no dang tin hon: `#297 T5` case B doi
 * rang khi doi nguon, man hinh phai NOI RA la da doi. Neu phan cung duoc xet truoc thi mot chiec
 * xe co hop GSHT se mai mai hien `SOURCE_FALLBACK`, va tu do tro di khong ai con nhin thay luc
 * dien thoai that su chet.
 *
 * `DEGRADED` cho ca "du lieu cu" lan "dang cho ban dau tien" la co chu y: ca hai deu co nghia
 * *"hom nay ta khong co mot vi tri hien tai, va no chua mat"*. Cai phan biet chung — va cai ma
 * giao dien phai doc de chon giua "GPS yeu / du lieu cu" va "dang cho dinh vi" — la `reason`,
 * khong phai `status`.
 */
export function classifyLocationHealth(
  input: LocationHealthInput,
  now: Date,
  policy: LocationHealthPolicy,
): VehicleLocationHealth {
  if (input.expectation === null) {
    // KHONG kem mot mau bang chung nao. Mot chiec xe khong ai yeu cau bam vi tri thi cung khong
    // ai can biet lan cuoi no o dau — phat ra cho do la mo mot nang luc giam sat khong phuc vu
    // cau hoi nao dang duoc hoi.
    return {
      vehicleId: input.vehicleId,
      status: 'NOT_TRACKED',
      reason: 'TRACKING_NOT_EXPECTED',
      currentSource: null,
      lastReceivedAt: null,
      ageSeconds: null,
      sources: [],
      lastKnown: null,
    };
  }

  const expectationAgeSeconds = ageSecondsBetween(input.expectation.since, now);
  const newest = newestByFamily(input.samples);

  // Dien thoai luon DANG CHOI khi co ky vong: ky vong sinh ra tu mot phien cua mot lai xe.
  const phone = gradeFamily(
    'PHONE',
    newest.get('PHONE') ?? null,
    expectationAgeSeconds,
    true,
    now,
    policy,
  );
  const telematics = gradeFamily(
    'TELEMATICS',
    newest.get('TELEMATICS') ?? null,
    expectationAgeSeconds,
    input.telematicsConfigured,
    now,
    policy,
  );
  const sources: readonly SourceFamilyHealth[] = [phone.health, telematics.health];

  const shape = (
    status: VehicleLocationHealthStatus,
    reason: LocationHealthReason,
    currentSource: LocationSourceFamily | null,
    lastKnown: LastKnownLocation | null,
  ): VehicleLocationHealth => ({
    vehicleId: input.vehicleId,
    status,
    reason,
    currentSource,
    lastReceivedAt: lastKnown?.observedAt ?? null,
    ageSeconds: lastKnown?.ageSeconds ?? null,
    sources,
    lastKnown,
  });

  if (phone.health.status === 'LIVE') {
    return shape('LIVE', 'RECENT_OBSERVATION', 'PHONE', lastKnownFrom(phone, true));
  }
  if (telematics.health.status === 'LIVE') {
    return shape(
      'SOURCE_FALLBACK',
      'PHONE_SILENT_TELEMATICS_RECENT',
      'TELEMATICS',
      lastKnownFrom(telematics, true),
    );
  }

  const evidence = newerOf(phone, telematics);

  if (phone.health.status === 'DEGRADED' || telematics.health.status === 'DEGRADED') {
    return shape('DEGRADED', 'OBSERVATION_AGEING', null, lastKnownFrom(evidence, false));
  }
  if (phone.health.status === 'AWAITING_FIRST' || telematics.health.status === 'AWAITING_FIRST') {
    return shape('DEGRADED', 'AWAITING_FIRST_OBSERVATION', null, lastKnownFrom(evidence, false));
  }

  // Con lai: moi ho nguon DANG CHOI deu `LOST`. `NOT_CONFIGURED` khong dem — mot khach chua mua
  // hop GSHT nao khong duoc bao la "mat ca hai nguon".
  const lostFamilies = sources.filter((source) => source.status === 'LOST').length;
  if (lostFamilies >= 2) {
    return shape(
      'ALL_SOURCES_LOST',
      'NO_RECENT_OBSERVATION_ANY_SOURCE',
      null,
      lastKnownFrom(evidence, false),
    );
  }

  const everReceived = phone.sample !== null || telematics.sample !== null;
  return shape(
    'LOST',
    everReceived ? 'NO_RECENT_OBSERVATION' : 'NO_OBSERVATION_RECEIVED',
    null,
    lastKnownFrom(evidence, false),
  );
}
