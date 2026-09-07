import type { GeoPoint } from './geo-point.js';
import { greatCircleMetres } from './geodesy.js';

/**
 * LIEN TUC CHUYEN DONG giua hai ban dinh vi lien tiep cua CUNG mot phien bam vi tri.
 *
 * Tang nay tra ve MA, khong tra ve phan quyet dao duc. Mot buoc nhay bat kha thi co the la gian
 * lan, ma cung co the la: dien thoai mat song 40 phut roi bat lai o mot tinh khac, mot ban dinh vi
 * lay tu tram phat song thay vi ve tinh, hay dong ho may bi chinh. Ba thu do trong nhu nhau tu
 * phia may chu. Nen dau ra la mot DANH SACH ma de nguoi doc, va #232 D-02 ghi ro: khong mot bat
 * thuong nao duoc tu dong sinh ra cong no, tru luong hay ket luan gian lan.
 *
 * TAT DINH: khong doc dong ho he thong. Thoi gian di vao bang tham so `atSeconds` — nguoi goi
 * chiu trach nhiem quyet dinh dung `capturedAt` cua may khach hay `receivedAt` cua may chu, va do
 * la mot quyet dinh nghiep vu chu khong phai mot chi tiet hinh hoc.
 */

export interface ContinuitySample {
  readonly point: GeoPoint;
  /** Ban kinh sai so thiet bi bao, met. `null` khi thiet bi khong noi. */
  readonly accuracyMetres: number | null;
  /** Moc thoi gian, giay. Goc toa do tuy nguoi goi, mien nhat quan giua hai mau. */
  readonly atSeconds: number;
}

export interface ContinuityPolicy {
  /**
   * 55 m/s = 198 km/h. Cao hon moi gioi han duong bo Viet Nam va cao hon toc do toi da thuc te
   * cua mot xe dau keo co tai, nhung van thap hon moi phuong tien bay. Nguong nay bat "buoc nhay"
   * chu khong bat "chay qua toc do" — do la mot phep kiem khac, cua mot he thong khac.
   */
  readonly maxPlausibleSpeedMetresPerSecond: number;
  /** Qua nguong nay thi chuoi bi coi la DUT — 15 phut mac dinh. */
  readonly maxGapSeconds: number;
}

export const DEFAULT_CONTINUITY_POLICY: ContinuityPolicy = {
  maxPlausibleSpeedMetresPerSecond: 55,
  maxGapSeconds: 900,
};

export type ContinuityCode =
  /** Khong co gi bat thuong. */
  | 'CONTINUOUS'
  /** Khong co mau truoc do — mo dau mot phien. Khong phai loi. */
  | 'FIRST_OBSERVATION'
  /** Dau thoi gian bang hoac lui lai so voi mau truoc. Khong tinh duoc toc do. */
  | 'TIMESTAMP_NOT_ADVANCING'
  /** Khoang trong dai hon `maxGapSeconds` — chuoi bang chung bi dut o day. */
  | 'LARGE_TIME_GAP'
  /** Phan dich chuyen KHONG giai thich duoc bang sai so vuot nguong toc do. */
  | 'IMPLAUSIBLE_SPEED';

export interface ContinuityAssessment {
  readonly codes: readonly ContinuityCode[];
  /** Khoang cach hinh hoc tho giua hai diem. */
  readonly rawDistanceMetres: number;
  /** Phan khoang cach con lai sau khi tru sai so cua ca hai mau. Khong bao gio am. */
  readonly effectiveDistanceMetres: number;
  readonly elapsedSeconds: number | null;
  /** Suy tu `effectiveDistanceMetres`, khong phai tu `rawDistanceMetres`. */
  readonly speedMetresPerSecond: number | null;
}

export function assessContinuity(
  previous: ContinuitySample | null,
  current: ContinuitySample,
  policy: ContinuityPolicy = DEFAULT_CONTINUITY_POLICY,
): ContinuityAssessment {
  if (previous === null) {
    return {
      codes: ['FIRST_OBSERVATION'],
      rawDistanceMetres: 0,
      effectiveDistanceMetres: 0,
      elapsedSeconds: null,
      speedMetresPerSecond: null,
    };
  }

  const rawDistanceMetres = greatCircleMetres(previous.point, current.point);
  // Tru sai so cua CA HAI mau: hai hinh tron sai so co the cham nhau du hai tam cach xa. Phan
  // duong ma hinh hoc BUOC PHAI cong nhan la co that chi la phan vuot ra ngoai tong hai ban kinh.
  const allowance = (previous.accuracyMetres ?? 0) + (current.accuracyMetres ?? 0);
  const effectiveDistanceMetres = Math.max(0, rawDistanceMetres - allowance);
  const elapsedSeconds = current.atSeconds - previous.atSeconds;

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return {
      codes: ['TIMESTAMP_NOT_ADVANCING'],
      rawDistanceMetres,
      effectiveDistanceMetres,
      elapsedSeconds: Number.isFinite(elapsedSeconds) ? elapsedSeconds : null,
      speedMetresPerSecond: null,
    };
  }

  const speedMetresPerSecond = effectiveDistanceMetres / elapsedSeconds;
  const codes: ContinuityCode[] = [];
  if (elapsedSeconds > policy.maxGapSeconds) {
    codes.push('LARGE_TIME_GAP');
  }
  if (speedMetresPerSecond > policy.maxPlausibleSpeedMetresPerSecond) {
    codes.push('IMPLAUSIBLE_SPEED');
  }

  return {
    codes: codes.length > 0 ? codes : ['CONTINUOUS'],
    rawDistanceMetres,
    effectiveDistanceMetres,
    elapsedSeconds,
    speedMetresPerSecond,
  };
}
