import { parseGeoPoint } from '../geo/geo-point.js';
import type { Geofence, GeofenceSubjectKind } from '../proof/geofence.repository.js';
import type { KnownPlace, KnownPlaceKind } from './place-search.types.js';

/**
 * DIA DIEM DA BIET = HANG RAO dang hoat dong, KHONG PHAI mot kho dia diem thu hai.
 *
 * `#379` cam dung mot so dia diem rieng cho man tao don: hang rao (`TransportGeofence`) da la noi
 * duy nhat mang toa do cua bai xe, kho, nha may — va la noi lai xe, dieu xe, bang chung hien truong
 * cung doc. Hai so se lech nhau vao lan sua thu hai. Ham nay chi DOC va DAT TEN.
 */

/** Thu tu hien thi: bai xe cua minh truoc, roi dia diem phap nhan, roi hang rao khach hang. */
const KIND_ORDER: Readonly<Record<KnownPlaceKind, number>> = {
  DEPOT: 0,
  COUNTERPARTY_SITE: 1,
  CUSTOMER: 2,
};

const isKnownPlaceKind = (kind: GeofenceSubjectKind): kind is KnownPlaceKind =>
  kind === 'DEPOT' || kind === 'COUNTERPARTY_SITE' || kind === 'CUSTOMER';

/** Ten dia diem + ten phap nhan cua MOT dia diem con hieu luc. */
export interface KnownSiteName {
  readonly siteName: string;
  readonly counterpartyName: string;
}

/**
 * Hang rao -> dia diem da biet.
 *
 * `COUNTERPARTY_SITE`: ten = ten dia diem (lui ve nhan hang rao khi dia diem khong con doc duoc),
 * dong phu = ten phap nhan. `DEPOT`/`CUSTOMER`: ten = nhan hang rao, khong dong phu.
 *
 * Toa do di qua `parseGeoPoint` du CHECK cua bang da chan: mot dong hong khong duoc thanh mot cham
 * "hop le" ma nguoi dung bam chon lam diem lay hang.
 */
export function buildKnownPlaces(
  fences: readonly Geofence[],
  sitesById: ReadonlyMap<string, KnownSiteName>,
): readonly KnownPlace[] {
  const places = fences.flatMap((fence): KnownPlace[] => {
    const kind = fence.subjectKind;
    if (!isKnownPlaceKind(kind)) return [];
    const parsed = parseGeoPoint(fence.latitude, fence.longitude);
    if (!parsed.ok) return [];

    const site =
      kind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
        ? sitesById.get(fence.subjectId)
        : undefined;
    return [
      {
        id: fence.id,
        kind,
        name: site?.siteName ?? fence.label,
        detail: site?.counterpartyName ?? null,
        point: parsed.point,
        radiusMetres: fence.radiusMetres,
      },
    ];
  });

  return [...places].sort(
    (left, right) =>
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      left.name.localeCompare(right.name, 'vi') ||
      left.id.localeCompare(right.id),
  );
}
