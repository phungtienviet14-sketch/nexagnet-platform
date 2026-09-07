import type { GeoPoint } from './geo-point.js';
import { greatCircleMetres } from './geodesy.js';

/**
 * HANG RAO DIA LY hinh tron, va mot phan quyet BA GIA TRI.
 *
 * Chi ho tro hinh TRON o tang nay, co y. Mot da giac dung duoc cho ban do dep hon, nhung no doi
 * mot thu vien hinh hoc, mot kieu du lieu luu tru phuc tap hon, va — quan trong hon ca — mot
 * nguoi phai VE no cho tung kho hang. Ban kinh la thu ma nhan vien dieu hanh nhap duoc bang mot
 * o so. Khi nao co mot nhu cau THAT ve da giac (vd mot khu cong nghiep hinh chu L ma hinh tron
 * bao trum ca duong quoc lo), luc do moi mo PostGIS `ST_Covers`; xem
 * `docs/kien-truc/transport-geospatial.md`.
 *
 * PHAN QUYET BA GIA TRI la diem cot loi. Xem `geofence.spec.ts` GEO-010.
 */

export class GeofenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeofenceError';
  }
}

export interface CircleGeofence {
  readonly id: string;
  readonly centre: GeoPoint;
  /** Ban kinh, met. Phai duong va huu han. */
  readonly radiusMetres: number;
}

export type GeofenceVerdict = 'INSIDE' | 'OUTSIDE' | 'INDETERMINATE';

export interface GeofenceEvaluation {
  readonly fenceId: string;
  readonly distanceMetres: number;
  readonly radiusMetres: number;
  readonly verdict: GeofenceVerdict;
}

export interface GeofenceAssessment {
  /** Hang rao gan nhat theo khoang cach tam. `null` khi danh sach rong. */
  readonly nearest: GeofenceEvaluation | null;
  /** Moi hang rao ma diem nam CHAC CHAN ben trong. Khong gom cac hang rao `INDETERMINATE`. */
  readonly inside: readonly GeofenceEvaluation[];
  readonly verdict: GeofenceVerdict | 'NO_FENCE';
}

/**
 * `accuracyMetres` la ban kinh sai so ma THIET BI bao (Android `Location.getAccuracy()` la ban
 * kinh do tin cay 68%). `null` nghia la thiet bi khong noi — luc do so sanh nhu mot diem, vi tu
 * bia ra mot bien do cung la tu bia ra du lieu.
 */
export function assessGeofences(
  point: GeoPoint,
  accuracyMetres: number | null,
  fences: readonly CircleGeofence[],
): GeofenceAssessment {
  if (accuracyMetres !== null && (!Number.isFinite(accuracyMetres) || accuracyMetres < 0)) {
    throw new GeofenceError(`Ban kinh sai so khong hop le: ${accuracyMetres}`);
  }
  const allowance = accuracyMetres ?? 0;

  const evaluations = fences.map((fence): GeofenceEvaluation => {
    if (!Number.isFinite(fence.radiusMetres) || fence.radiusMetres <= 0) {
      throw new GeofenceError(
        `Hang rao "${fence.id}" co ban kinh khong duong: ${fence.radiusMetres}`,
      );
    }
    const distanceMetres = greatCircleMetres(point, fence.centre);
    return {
      fenceId: fence.id,
      distanceMetres,
      radiusMetres: fence.radiusMetres,
      verdict: verdictFor(distanceMetres, allowance, fence.radiusMetres),
    };
  });

  if (evaluations.length === 0) {
    return { nearest: null, inside: [], verdict: 'NO_FENCE' };
  }

  // `reduce` chu khong `sort`: chi can cai nho nhat, va sort se doi thu tu nguoi goi truyen vao —
  // mot tac dung phu ma khong ai o day yeu cau.
  const nearest = evaluations.reduce((best, current) =>
    isCloser(current, best) ? current : best,
  );

  return {
    nearest,
    inside: evaluations.filter((evaluation) => evaluation.verdict === 'INSIDE'),
    verdict: nearest.verdict,
  };
}

/**
 * "GAN NHAT" khi hai hang rao CUNG TAM thi khong con la mot cau hoi hinh hoc.
 *
 * Truong hop nay khong hiem chut nao: mot bai xe ban kinh 5 km va mot cau cang ban kinh 200 m
 * thuong duoc nhap voi cung mot toa do tam. Ca hai deu cach diem dung 0 m. Neu de nguyen phep so
 * sanh `<`, ket qua phu thuoc vao THU TU nguoi goi truyen mang vao — tuc cung mot ban dinh vi co
 * the sinh ra hai phan quyet khac nhau o hai lan chay, va do la thu khong duoc phep ton tai trong
 * mot he thong ma bang chung phai lap lai duoc.
 *
 * Thu tu quyet dinh: khoang cach, roi BAN KINH NHO HON, roi `id`. Chon ban kinh nho hon vi no noi
 * duoc nhieu hon: "dang o cau cang" la mot cau chat hon "dang o trong bai".
 */
function isCloser(candidate: GeofenceEvaluation, incumbent: GeofenceEvaluation): boolean {
  if (candidate.distanceMetres !== incumbent.distanceMetres) {
    return candidate.distanceMetres < incumbent.distanceMetres;
  }
  if (candidate.radiusMetres !== incumbent.radiusMetres) {
    return candidate.radiusMetres < incumbent.radiusMetres;
  }
  return candidate.fenceId < incumbent.fenceId;
}

function verdictFor(
  distanceMetres: number,
  allowanceMetres: number,
  radiusMetres: number,
): GeofenceVerdict {
  if (distanceMetres + allowanceMetres <= radiusMetres) {
    return 'INSIDE';
  }
  if (distanceMetres - allowanceMetres > radiusMetres) {
    return 'OUTSIDE';
  }
  return 'INDETERMINATE';
}
