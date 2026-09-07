import type { GeoPoint } from '../../geo/geo-point.js';
import { greatCircleMetres } from '../../geo/geodesy.js';
import type { TelematicsFix } from './vehicle-telematics.port.js';

/**
 * DOI CHIEU CHEO hai nguon vi tri DOC LAP cho cung mot chiec xe, cung mot khoang thoi gian.
 *
 * Day la ly do cong telematics ton tai. Moi tin hieu chay tren dien thoai cua lai xe deu co cung
 * mot diem yeu — nguoi bi do dang cam thiet bi do. Hai chuoi vi tri den tu hai thiet bi khac nhau
 * thi khong con diem yeu do: de lam lech ca hai, phai lam lech ca hop GSHT gan tren xe.
 *
 * TAT DINH, thuan ham, khong doc DB va khong doc dong ho.
 *
 * ============================================================================================
 * BA QUYET DINH THIET KE, VA LY DO CUA CHUNG
 * ============================================================================================
 *
 * 1. **`NO_SECOND_SOURCE` la mot phan quyet RIENG, khong phai `AGREE`.**
 *    Mot he thong chua duoc cam vao nguon thu hai KHONG duoc bao "khong co bat thuong". Hai cau
 *    do nhin giong nhau tren man hinh va khac han nhau ve y nghia, va cai sai o day khong bao gio
 *    tu lo ra: mot he thong khong bao gio keu trong y het mot he thong khong co van de.
 *
 * 2. **Ghep cap theo THOI GIAN GAN NHAT trong mot cua so, khong phai theo chi so.**
 *    Hai nguon lay mau o hai nhip khac nhau va khong he dong bo. Ghep theo chi so (diem thu 5 voi
 *    diem thu 5) se so mot vi tri luc 9:00 voi mot vi tri luc 9:47 va cho ra mot do lech khong
 *    noi len dieu gi ve su that.
 *
 * 3. **Phan quyet dua tren TRUNG VI, khong phai gia tri lon nhat.**
 *    Mot ban dinh vi hong don le — mot lan bat song sai, mot lan hop GSHT khoi dong lai — se lam
 *    gia tri lon nhat nhay len vai kilomet. Neu lay `max` lam phan quyet thi mot chuyen hoan toan
 *    binh thuong bi to vi dung mot diem rac. Cau hoi that la *"hai chuoi nay co ta cung mot hanh
 *    trinh khong"*, va trung vi tra loi dung cau do. Gia tri lon nhat van duoc GHI RA de nguoi
 *    xem lai co cai ma nhin.
 */

export type CrossCheckVerdict =
  /** Hai nguon ta cung mot hanh trinh trong dung sai cho phep. */
  | 'AGREE'
  /** Hai nguon KHONG ta cung mot hanh trinh. Mot dieu can NGUOI xem, khong phai mot ket luan. */
  | 'DIVERGENT'
  /** Chua co nguon thu hai. KHONG phai `AGREE`. */
  | 'NO_SECOND_SOURCE'
  /** Co ca hai nguon nhung khong mot cap nao roi vao cung mot cua so thoi gian. */
  | 'NO_OVERLAP';

export interface CrossCheckPolicy {
  /**
   * Hai ban ghi cach nhau qua nguong nay thi khong duoc coi la cung mot khoanh khac.
   *
   * 120 giay: o toc do duong truong ~90 km/h, hai phut la 3 km — nen mot cua so rong hon se sinh
   * ra do lech thuan tuy do thoi gian va do se bi doc nham thanh do lech vi tri.
   */
  readonly pairingWindowSeconds: number;
  /**
   * Tren nguong nay thi hai nguon duoc coi la KHONG ta cung mot hanh trinh.
   *
   * 1000 met: rong hon nhieu so voi sai so cua ca hai thiet bi cong lai (vai chuc met), nhung hep
   * hon moi khoang cach co y nghia nghiep vu — hai chiec xe o hai kho khac nhau bao gio cung cach
   * xa hon the.
   */
  readonly divergenceMetres: number;
  /** Duoi so cap nay thi mau qua nho de ket luan; tra `NO_OVERLAP`. */
  readonly minimumPairs: number;
}

export const DEFAULT_CROSS_CHECK_POLICY: CrossCheckPolicy = {
  pairingWindowSeconds: 120,
  divergenceMetres: 1_000,
  minimumPairs: 3,
};

export interface CrossCheckSample {
  readonly point: GeoPoint;
  readonly at: Date;
}

export interface CrossCheckResult {
  readonly verdict: CrossCheckVerdict;
  readonly comparedPairs: number;
  readonly medianDivergenceMetres: number | null;
  readonly maxDivergenceMetres: number | null;
  /** Khoanh khac lech nhat — diem khoi dau cho nguoi di tim, khong phai mot cao buoc. */
  readonly worstAt: Date | null;
}

export function crossCheckTracks(
  phoneTrack: readonly CrossCheckSample[],
  telematicsTrack: readonly TelematicsFix[] | null,
  policy: CrossCheckPolicy = DEFAULT_CROSS_CHECK_POLICY,
): CrossCheckResult {
  // `null` = chua co nguon thu hai. Xem quyet dinh 1 o khoi chu thich dau tep.
  if (telematicsTrack === null) {
    return {
      verdict: 'NO_SECOND_SOURCE',
      comparedPairs: 0,
      medianDivergenceMetres: null,
      maxDivergenceMetres: null,
      worstAt: null,
    };
  }

  const divergences: { readonly metres: number; readonly at: Date }[] = [];
  for (const fix of telematicsTrack) {
    const partner = nearestInTime(phoneTrack, fix.recordedAt, policy.pairingWindowSeconds);
    if (partner === null) continue;
    divergences.push({ metres: greatCircleMetres(fix.point, partner.point), at: fix.recordedAt });
  }

  if (divergences.length < policy.minimumPairs) {
    return {
      verdict: 'NO_OVERLAP',
      comparedPairs: divergences.length,
      medianDivergenceMetres: null,
      maxDivergenceMetres: null,
      worstAt: null,
    };
  }

  const sorted = [...divergences].sort((a, b) => a.metres - b.metres);
  const median = medianOf(sorted.map((entry) => entry.metres));
  const worst = sorted.at(-1);

  return {
    verdict: median > policy.divergenceMetres ? 'DIVERGENT' : 'AGREE',
    comparedPairs: divergences.length,
    medianDivergenceMetres: round(median),
    maxDivergenceMetres: round(worst?.metres ?? 0),
    worstAt: worst?.at ?? null,
  };
}

function nearestInTime(
  samples: readonly CrossCheckSample[],
  at: Date,
  windowSeconds: number,
): CrossCheckSample | null {
  let best: CrossCheckSample | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const delta = Math.abs(sample.at.getTime() - at.getTime()) / 1000;
    if (delta <= windowSeconds && delta < bestDelta) {
      best = sample;
      bestDelta = delta;
    }
  }
  return best;
}

function medianOf(sortedAscending: readonly number[]): number {
  const middle = Math.floor(sortedAscending.length / 2);
  if (sortedAscending.length % 2 === 1) return sortedAscending[middle] ?? 0;
  return ((sortedAscending[middle - 1] ?? 0) + (sortedAscending[middle] ?? 0)) / 2;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
