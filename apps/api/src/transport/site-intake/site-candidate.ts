import { parseGeoPoint, type GeoPoint } from '../geo/geo-point.js';
import { assessGeofences, type CircleGeofence } from '../geo/geofence.js';

/**
 * NHAN DANG DIA DIEM A tu mot ban dinh vi — `#267` H2.
 *
 * ============================================================================================
 * HAM NAY DE NGHI, NO KHONG QUYET DINH
 * ============================================================================================
 *
 * Day la ca kien truc cua Lane H trong mot cau: mot thiet bi di vao mot hang rao KHONG duoc phep
 * sinh ra mot vong chay. Ham nay tra ve mot UNG VIEN; thu bien ung vien do thanh su that nghiep vu
 * la mot CHAM cua con nguoi, o `SiteIntakeService`, va no di kem mot khoa chong lap.
 *
 * Nen o day khong co mot lenh ghi nao, khong co `Date.now()`, khong co kho. Ke ca "bay gio" cung
 * di qua tham so — neu khong, bai kiem tuoi cua ban dinh vi se phu thuoc vao luc chay bai.
 *
 * ============================================================================================
 * BON KET QUA, VA VI SAO KHONG PHAI HAI
 * ============================================================================================
 *
 * `UNIQUE | AMBIGUOUS | NO_MATCH | LOCATION_UNUSABLE` — bon, chu khong phai `candidate | null`.
 *
 * Gop `NO_MATCH` voi `LOCATION_UNUSABLE` la loi de mac nhat va cung kho thay nhat: man hinh se noi
 * *"khong nhan ra dia diem nao"* trong khi su that la *"may chua bat dinh vi xong"*. Lai xe se di
 * tim mot cai nut khac, va cai nut do khong ton tai.
 *
 * Gop `AMBIGUOUS` vao `UNIQUE` bang cach lay cai gan nhat thi te hon nua: no bien mot dieu KHONG
 * BIET thanh mot dieu trong nhu da biet, roi mot cham xac nhan dong dau len no. `#267` H2 cam dung
 * dieu do — *"if multiple plausible A sites exist, do NOT choose one silently"*.
 */

/** Mot hang rao da duoc noi voi dia diem so huu no. Tang goi chiu trach nhiem loc hang rao nghi. */
export interface SiteFence {
  readonly fenceId: string;
  readonly siteId: string;
  readonly centre: GeoPoint;
  readonly radiusMetres: number;
}

/**
 * SUC CAM cua mot ung vien.
 *
 * `NEAR` la `INDETERMINATE` cua `assessGeofences` doi ten cho nguoi doc nghiep vu: bien do sai so
 * cua thiet bi phu len duong bien, nen KHONG ai biet diem nam trong hay ngoai. Mot ung vien `NEAR`
 * khong bao gio duoc mot minh tao ra `UNIQUE`.
 */
export type SiteCandidateConfidence = 'INSIDE' | 'NEAR';

export interface SiteCandidate {
  readonly siteId: string;
  /** Hang rao GAN NHAT cua chinh dia diem do — mot dia diem co the co nhieu hang rao. */
  readonly fenceId: string;
  readonly distanceMetres: number;
  readonly radiusMetres: number;
  readonly confidence: SiteCandidateConfidence;
}

export type LocationUnusableReason = 'COORDINATE_INVALID' | 'ACCURACY_UNUSABLE' | 'LOCATION_STALE';

export type SiteCandidateOutcome =
  | { readonly kind: 'UNIQUE'; readonly candidate: SiteCandidate }
  | {
      readonly kind: 'AMBIGUOUS';
      readonly candidates: readonly SiteCandidate[];
      /** `true` khi con ung vien hop le bi cat khoi danh sach vi cham tran. */
      readonly truncated: boolean;
    }
  | { readonly kind: 'NO_MATCH' }
  | { readonly kind: 'LOCATION_UNUSABLE'; readonly reason: LocationUnusableReason };

export interface SiteCandidatePolicy {
  /**
   * Tran sai so. Mot ban dinh vi sai so 3 km "chua" ca mot quan noi thanh va se bao INSIDE cho moi
   * kho trong ban kinh do — tuc bien ca tang nay thanh mot ham luon dong y.
   */
  readonly maxAccuracyMetres: number;
  /**
   * Han tuoi. `#267` H7: mot ban dinh vi qua han khong duoc lang le tao/gan mot lan lay hang. Hang
   * doi ngoai tuyen cua Lane B gui ban ghi bon tieng tuoi la chuyen binh thuong — chung ke lai noi
   * lai xe DA TUNG o dau, khong phai noi ho dang o.
   */
  readonly maxAgeSeconds: number;
  /** Chan tren cua danh sach ung vien. Vuot tran la mot loi khai bao, khong phai mot cau hoi. */
  readonly maxCandidates: number;
}

/**
 * Mac dinh cua ho so B. Ba con so, moi con so mot nguon:
 *
 *   · 150 m sai so — dien thoai trong nha xuong/duoi mai ton thuong bao 50-120 m; tren 150 m thi
 *     ban dinh vi khong con phan biet duoc hai kho canh nhau, va do la luc phai noi "chua ro".
 *   · 300 giay tuoi — lai xe vua dung xe, mo app, cho dinh vi. Nam phut la khoang bao dung ca truong
 *     hop song yeu ma khong nhan mot ban ghi tu chuyen truoc.
 *   · 5 ung vien — nhieu hon nam kho o cung mot cho la mot lan khai hang rao sai, khong phai mot
 *     cau hoi de hoi lai xe.
 */
export const DEFAULT_SITE_CANDIDATE_POLICY: SiteCandidatePolicy = {
  maxAccuracyMetres: 150,
  maxAgeSeconds: 300,
  maxCandidates: 5,
};

export interface SiteCandidateInput {
  readonly point: GeoPoint;
  /** `null` = thiet bi khong bao. KHAC VOI 0 — xem `assessGeofences`. */
  readonly accuracyMetres: number | null;
  readonly observedAt: Date;
  readonly now: Date;
  readonly fences: readonly SiteFence[];
  readonly policy: SiteCandidatePolicy;
}

const unusable = (reason: LocationUnusableReason): SiteCandidateOutcome => ({
  kind: 'LOCATION_UNUSABLE',
  reason,
});

/**
 * THU TU KIEM LA MOT PHAN CUA HOP DONG.
 *
 * Toa do truoc sai so truoc tuoi: mot yeu cau sai ca ba phai bao loi toa do, vi do la cai nguoi
 * goi phai sua truoc. Doi thu tu se cho ra mot ma DUNG VE KET QUA nhung SAI VE NGUYEN NHAN, va
 * nguoi doc trace se di sua nham cho. Cung quy uoc voi `evaluateCheckpoint()` cua `#243` F1.
 */
export function resolveSiteCandidates(input: SiteCandidateInput): SiteCandidateOutcome {
  const parsed = parseGeoPoint(input.point.latitude, input.point.longitude);
  if (!parsed.ok) return unusable('COORDINATE_INVALID');

  if (input.accuracyMetres !== null) {
    if (!Number.isFinite(input.accuracyMetres) || input.accuracyMetres < 0) {
      return unusable('ACCURACY_UNUSABLE');
    }
    if (input.accuracyMetres > input.policy.maxAccuracyMetres) {
      return unusable('ACCURACY_UNUSABLE');
    }
  }

  // Tuoi AM cung la qua han: mot dau thoi gian o tuong lai la mot dong ho may khach sai, va no
  // khong duoc lot qua bang cach "moi hon ca moi".
  const ageSeconds = (input.now.getTime() - input.observedAt.getTime()) / 1000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > input.policy.maxAgeSeconds) {
    return unusable('LOCATION_STALE');
  }

  const circles: readonly CircleGeofence[] = input.fences.map(toCircle);
  if (circles.length === 0) return { kind: 'NO_MATCH' };

  const assessment = assessGeofences(parsed.point, input.accuracyMetres, circles);
  const siteOf = new Map(input.fences.map((fence) => [fence.fenceId, fence.siteId]));

  const evaluated = assessment.all
    .filter((entry) => entry.verdict === 'INSIDE' || entry.verdict === 'INDETERMINATE')
    .map((entry): SiteCandidate => ({
      siteId: siteOf.get(entry.fenceId) ?? '',
      fenceId: entry.fenceId,
      distanceMetres: entry.distanceMetres,
      radiusMetres: entry.radiusMetres,
      confidence: entry.verdict === 'INSIDE' ? 'INSIDE' : 'NEAR',
    }))
    .filter((candidate) => candidate.siteId !== '');

  if (evaluated.length === 0) return { kind: 'NO_MATCH' };

  const ranked = dedupeBySite(evaluated).sort(compareCandidates);

  // MOT dia diem, va no phai CHAC CHAN. Mot ung vien `NEAR` don doc van la mot cau hoi: man hinh
  // se hoi "co phai cho nay khong" thay vi noi "ban dang o cho nay".
  const only = ranked[0];
  if (ranked.length === 1 && only !== undefined && only.confidence === 'INSIDE') {
    return { kind: 'UNIQUE', candidate: only };
  }

  return {
    kind: 'AMBIGUOUS',
    candidates: ranked.slice(0, input.policy.maxCandidates),
    truncated: ranked.length > input.policy.maxCandidates,
  };
}

const toCircle = (fence: SiteFence): CircleGeofence => ({
  id: fence.fenceId,
  centre: fence.centre,
  radiusMetres: fence.radiusMetres,
});

/**
 * HAI HANG RAO CUA CUNG MOT DIA DIEM KHONG PHAI MOT SU NHAP NHANG.
 *
 * Cong va bai can la hai hang rao, nhung nguoi lai xe van dang o DUNG MOT cho. Khong gom theo
 * `siteId` thi mot dia diem khai hai hang rao se tu bien minh thanh mot cau hoi nhieu lua chon ma
 * ca hai lua chon deu la no.
 *
 * Giu hang rao NAO: dung phep so sanh cua `compareCandidates`, tuc chac chan hon truoc, roi gan
 * hon. "Dang o cong" la mot cau chat hon "dang o dau do trong bai".
 */
function dedupeBySite(candidates: readonly SiteCandidate[]): SiteCandidate[] {
  const best = new Map<string, SiteCandidate>();
  for (const candidate of candidates) {
    const incumbent = best.get(candidate.siteId);
    if (incumbent === undefined || compareCandidates(candidate, incumbent) < 0) {
      best.set(candidate.siteId, candidate);
    }
  }
  return [...best.values()];
}

/**
 * THU TU PHAI LAP LAI DUOC — cung ly le voi `isCloser()` cua Lane B.
 *
 * Hai lan goi voi cung du lieu ma ra hai thu tu khac nhau se lam man hinh nhay, va lam mot bang
 * chung khong doi chieu lai duoc. Nen chuoi khoa phai ket thuc bang mot khoa DUY NHAT (`siteId`,
 * roi `fenceId`) chu khong dung o mot khoa co the trung.
 */
function compareCandidates(left: SiteCandidate, right: SiteCandidate): number {
  if (left.confidence !== right.confidence) return left.confidence === 'INSIDE' ? -1 : 1;
  if (left.distanceMetres !== right.distanceMetres) {
    return left.distanceMetres - right.distanceMetres;
  }
  if (left.radiusMetres !== right.radiusMetres) return left.radiusMetres - right.radiusMetres;
  if (left.siteId !== right.siteId) return left.siteId < right.siteId ? -1 : 1;
  return left.fenceId < right.fenceId ? -1 : left.fenceId > right.fenceId ? 1 : 0;
}
