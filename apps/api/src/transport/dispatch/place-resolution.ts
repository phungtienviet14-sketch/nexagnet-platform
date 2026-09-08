import type { GeoPoint } from '../geo/geo-point.js';
import type { PlaceResolution, ResolvedPlace } from './dispatch.types.js';

/**
 * TU MOT CAI TEN RA MOT TOA DO — ham THUAN, va la cho de nhat de noi doi trong ca Lane M.
 *
 * ===========================================================================
 * VI SAO TANG NAY PHAI TON TAI
 *
 * `TransportOrder.originLabel` la mot CHUOI do nguoi go: *"Kho Hai Phong"*. Khong mot cot toa do
 * nao ton tai tren don, tren chang, hay tren dia diem phap nhan. Toa do trong he nay chi song o
 * MOT cho: `TransportGeofence` (`latitude`/`longitude` + `radiusMetres`), duoc khai bao boi nguoi
 * van hanh cho kho/bai/cay xang.
 *
 * Nen cau hoi "don nay lay hang o dau" chi co MOT duong tra loi trung thuc: noi cai ten do voi
 * mot hang rao da khai. Va khi khong noi duoc, cau tra loi la NOI RANG KHONG NOI DUOC.
 *
 * ===========================================================================
 * BA LUAT CUA TANG NAY
 *
 *   1. KHOP KHIT hoac khong khop. Khong co "gan giong", khong co khoang cach Levenshtein, khong
 *      co diem so. Mot bang xep hang dieu xe dua tren mot phep doan chinh ta la mot chiec xe chay
 *      nham tinh.
 *   2. HAI KET QUA TRO LEN LA MOT THAT BAI, khong phai mot cuoc thi. `PICKUP_LABEL_AMBIGUOUS` tra
 *      ve cho nguoi dung chon; chon ho ho la mot cu tung dong xu duoc trinh bay nhu mot ket qua
 *      tinh toan.
 *   3. KHONG CO GIA TRI DU PHONG. Khong bai xe, khong tam tinh, khong diem dau tien tim thay.
 *      `#277 M1`: *"never invent depot/zero ETA."*
 */

/** Dai dau to hop cua Unicode (U+0300..U+036F) — phan con lai sau khi `NFD` tach mot nguyen am. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * CHUAN HOA MOT NHAN DIA DIEM de so khop.
 *
 * `đ`/`Đ` phai duoc doi TAY truoc `normalize('NFD')`: chung la chu cai rieng cua bang chu cai
 * Viet chu khong phai `d` cong mot dau, nen NFD khong tach chung ra.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CHEP LAI THAY VI DUNG `normalizeStationLabel` CUA `transport-fuel`.
 *
 * Ham do (`fuel/fuel-station-identity.ts`) lam dung viec nay va lam tot. Nhung no song trong
 * `transport-fuel`, mot capability ma mot khach van tai co the KHONG BAT — va dieu xe thi thuoc
 * `transport-core`. Mot canh nhap khau tu loi sang mot capability tuy chon la mot canh se do vao
 * dung ngay co khach dau tien tat `transport-fuel`, va no do luc BOOT chu khong luc bien dich.
 *
 * `DRY` doi ta rut gon khi lap lai la THAT; ranh gioi capability la mot rang buoc manh hon, va
 * kho ma nay da tra gia do ba lan (`rules/text.ts`, `fuel-station-identity.ts`, va day) mot cach
 * co y thuc. Neu mot ngay co mot goi tien ich TRUNG TINH ve capability, ca ba doi ve do.
 *
 * Moi cum ky tu khong phai chu-so thanh MOT khoang trang, khong bi nuot: `Kho-so 5` phai thanh
 * `KHO SO 5` chu khong `KHOSO5` — nuot dau phan cach lam `Kho 5` va `Kho5` gap nhau.
 */
export const normalizePlaceLabel = (value: string | null | undefined): string =>
  value
    ? value
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .normalize('NFD')
        .replace(COMBINING_MARKS, '')
        .toUpperCase()
        .replace(/[^0-9A-Z]+/g, ' ')
        .trim()
    : '';

/**
 * MOT MUC trong so tra cuu dia diem.
 *
 * CO Y khong phai `Geofence`: tang nay khong can biet ban kinh, trang thai, hay ai khai bao. Cho
 * no biet them se lam mot ham thuan phai theo doi vong doi cua mot bang.
 *
 * `siteName` tach khoi `label` vi hai chuoi tra loi hai cau hoi khac nhau: `label` la ten NGUOI
 * VAN HANH dat cho hang rao (*"Hang rao kho HP"*), `siteName` la ten cua CHO (*"Kho Hai Phong"*)
 * ma nguoi nhap don go vao `originLabel`. Ca hai deu duoc so khop.
 */
export interface PlaceIndexEntry {
  readonly geofenceId: string;
  readonly label: string;
  readonly point: GeoPoint;
  readonly siteId: string | null;
  readonly siteName: string | null;
}

/**
 * GIAI mot nhan dia diem thanh mot cho co toa do.
 *
 * Thu tu uu tien co y: hang rao truoc, dia diem phap nhan sau. Mot hang rao la mot khai bao TRUC
 * TIEP cua nguoi van hanh ve mot toa do; mot dia diem phap nhan chi co toa do NHO mot hang rao
 * tro toi no. Khi mot cai ten khop ca hai duong, duong ngan hon la duong dung.
 *
 * Neu mot ten khop NHIEU muc, ket qua la `PICKUP_LABEL_AMBIGUOUS` — tru mot truong hop: nhieu muc
 * cung tro ve DUNG MOT hang rao. Do khong phai nhap nhang, do la cung mot cho duoc goi bang hai
 * ten, va tra ve no la cau tra loi dung.
 */
export function resolvePlaceByLabel(
  rawLabel: string,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  const key = normalizePlaceLabel(rawLabel);
  if (key === '') return { ok: false, reason: 'PICKUP_LABEL_NO_MATCH' };

  const byGeofenceLabel = index.filter((entry) => normalizePlaceLabel(entry.label) === key);
  const bySiteName = index.filter((entry) => normalizePlaceLabel(entry.siteName) === key);

  const matched = byGeofenceLabel.length > 0 ? byGeofenceLabel : bySiteName;
  if (matched.length === 0) return { ok: false, reason: 'PICKUP_LABEL_NO_MATCH' };

  const distinctGeofenceIds = new Set(matched.map((entry) => entry.geofenceId));
  if (distinctGeofenceIds.size > 1) return { ok: false, reason: 'PICKUP_LABEL_AMBIGUOUS' };

  const entry = matched[0]!;
  const viaGeofenceLabel = byGeofenceLabel.length > 0;
  return {
    ok: true,
    reason: viaGeofenceLabel ? 'PICKUP_FROM_GEOFENCE_LABEL' : 'PICKUP_FROM_COUNTERPARTY_SITE',
    place: {
      point: entry.point,
      source: viaGeofenceLabel ? 'GEOFENCE_LABEL_EXACT' : 'COUNTERPARTY_SITE_GEOFENCE',
      label: viaGeofenceLabel ? entry.label : (entry.siteName ?? entry.label),
      geofenceId: entry.geofenceId,
      siteId: entry.siteId,
    },
  };
}

/** Tra cuu theo MA hang rao — duong nguoi goi chi dinh thang, khong qua so khop chuoi nao. */
export function resolvePlaceByGeofenceId(
  geofenceId: string,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  const entry = index.find((candidate) => candidate.geofenceId === geofenceId);
  if (!entry) return { ok: false, reason: 'PICKUP_REQUEST_REF_NOT_FOUND' };
  return {
    ok: true,
    reason: 'PICKUP_FROM_EXPLICIT_REQUEST',
    place: {
      point: entry.point,
      source: 'EXPLICIT_REQUEST_GEOFENCE',
      label: entry.label,
      geofenceId: entry.geofenceId,
      siteId: entry.siteId,
    },
  };
}

/**
 * Tra cuu theo MA DIA DIEM phap nhan.
 *
 * Mot dia diem KHONG CO hang rao thi khong co toa do, va do la mot ket qua khac han "khong tim
 * thay dia diem": cai dau la du lieu chua khai xong, cai sau la mot ma sai. Ca hai deu tra
 * `PICKUP_REQUEST_REF_NOT_FOUND` o day cho gon — tang tren phan biet duoc bang chinh danh sach
 * dia diem, va viec khai hang rao cho mot dia diem thuoc ve Lane H.
 */
export function resolvePlaceBySiteId(
  siteId: string,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  const matched = index.filter((entry) => entry.siteId === siteId);
  if (matched.length === 0) return { ok: false, reason: 'PICKUP_REQUEST_REF_NOT_FOUND' };
  if (new Set(matched.map((entry) => entry.geofenceId)).size > 1) {
    return { ok: false, reason: 'PICKUP_LABEL_AMBIGUOUS' };
  }
  const entry = matched[0]!;
  return {
    ok: true,
    reason: 'PICKUP_FROM_EXPLICIT_REQUEST',
    place: {
      point: entry.point,
      source: 'EXPLICIT_REQUEST_SITE',
      label: entry.siteName ?? entry.label,
      geofenceId: entry.geofenceId,
      siteId,
    },
  };
}

/** Mot toa do do chinh nguoi goi dua vao. Da qua `parseGeoPoint` o tang bien truoc khi toi day. */
export function explicitPointPlace(point: GeoPoint, label: string): ResolvedPlace {
  return {
    point,
    source: 'EXPLICIT_REQUEST_POINT',
    label,
    geofenceId: null,
    siteId: null,
  };
}
