import type { PartyStatus } from '../transport.types.js';

/**
 * NHAN RA MOT CAY XANG TU MOT TO GIAY — ham THUAN, khong cham DB, khong biet Nest.
 *
 * ===========================================================================
 * VI SAO PHEP NAY PHAI TACH KHOI KHO
 *
 * Cay xang di vao he thong tu ba nguon co chat luong khac han nhau: hoa don dien tu (co ma so
 * thue, co ma cua hang), bang ke cua chinh nha cung cap (thuong co ma noi bo), va anh mot to phieu
 * nhiet nhau (chi co mot dong chu). Neu phep nhan dang nam trong mot cau truy van SQL, no se duoc
 * viet lai ba lan cho ba nguon, va ba ban do se troi khoi nhau ngay lan dau ai do them mot bi danh.
 *
 * ===========================================================================
 * KHONG CO PHEP SO GAN DUNG. Khong Levenshtein, khong trigram, khong "cai giong nhat".
 *
 * Mot phep so gan dung se gan mot hoa don vao NHAM tram trong im lang. Va so lieu theo tram — thu
 * duy nhat de nhin ra mot tram ban thieu lit — se tro thanh vo nghia ma khong ai biet tu luc nao.
 *
 * Nen ham nay tra ve NAM ket cuc co ten, va ba trong so do la loi moi mot NGUOI vao quyet:
 *
 *   `RESOLVED`          — dung mot tram, kem duong nao dan toi no (`via`) de nguoi doc kiem lai;
 *   `AMBIGUOUS`         — nhieu tram cung khop; nguoi phai dat mot bi danh phan biet;
 *   `SUPPLIER_MISMATCH` — khop mot tram cua nha cung cap KHAC; chung tu ghi sai nha cung cap;
 *   `NO_MATCH`          — co du kien nhung khong tram nao khop; phai them tram hoac them bi danh;
 *   `NO_INPUT`          — chung tu khong noi gi ve tram; khong co gi de tra loi.
 *
 * `NO_MATCH` va `NO_INPUT` khac nhau o VIEC PHAI LAM: cai dau doi mot lan nhap du lieu chu, cai
 * sau noi rang chinh NGUON qua yeu va phai gan tay. Gop chung thanh mot `null` se lam nguoi truc
 * di tim mot tram khong he thieu.
 */

/** Chi nhung truong phep dinh danh thuc su doc — co y NGHEO de khong ai mo rong luat o day. */
export interface FuelStationIndexEntry {
  readonly id: string;
  readonly supplierId: string;
  readonly code: string | null;
  /** `code` DA CHUAN HOA. Cot rieng chu khong tinh lai: khoa unique cua DB dung chinh cot nay. */
  readonly codeNormalized: string | null;
  readonly name: string;
  readonly nameNormalized: string;
  readonly status: PartyStatus;
}

export interface FuelStationAliasIndexEntry {
  readonly normalized: string;
  readonly stationId: string;
}

export type FuelStationMatchVia = 'CODE' | 'ALIAS' | 'NAME';

export type FuelStationResolution =
  | {
      readonly outcome: 'RESOLVED';
      readonly stationId: string;
      readonly via: FuelStationMatchVia;
      readonly status: PartyStatus;
    }
  | { readonly outcome: 'AMBIGUOUS'; readonly candidateIds: readonly string[] }
  | { readonly outcome: 'SUPPLIER_MISMATCH'; readonly candidateIds: readonly string[] }
  | { readonly outcome: 'NO_MATCH' }
  | { readonly outcome: 'NO_INPUT' };

export interface ResolveFuelStationInput {
  /** Nha cung cap DA BIET, hoac `null` khi chung tu khong noi. Xem khoi ve pham vi ben duoi. */
  readonly supplierId: string | null;
  readonly code: string | null;
  readonly label: string | null;
  readonly stations: readonly FuelStationIndexEntry[];
  readonly aliases: readonly FuelStationAliasIndexEntry[];
}

/** Khoang dau to hop cua Unicode — phan con lai sau khi `NFD` tach mot nguyen am co dau. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * BO DAU TIENG VIET.
 *
 * `đ`/`Đ` phai duoc doi TAY truoc khi `normalize('NFD')`: chung la chu cai rieng cua bang chu cai
 * Viet, khong phai `d` cong mot dau, nen NFD khong phan chung ra va bo loc dau ben duoi se giu
 * nguyen chung. Ket qua se la mot chuoi con lan chu thuong giua cac chu hoa — va no khong bao gio
 * khop voi ban da chuan hoa nam trong DB.
 */
const foldVietnamese = (value: string): string =>
  value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toUpperCase();

/**
 * TEN/DIA CHI cay xang -> khoa so khop.
 *
 * Moi cum ky tu khong phai chu-so thanh MOT khoang trang, khong bi nuot: `CHXD-số 5` phai thanh
 * `CHXD SO 5` chu khong `CHXDSO5`. Nuot dau phan cach se lam `CH 5` va `CH5` — hai ma khac nhau
 * cua hai tram khac nhau — gap nhau, va do dung la kieu khop nham ma tep nay ton tai de chan.
 */
export const normalizeStationLabel = (value: string | null | undefined): string =>
  value
    ? foldVietnamese(value)
        .replace(/[^0-9A-Z]+/g, ' ')
        .trim()
    : '';

/**
 * MA cay xang -> khoa so khop, hoac `null` khi khong con ky tu nao.
 *
 * Khac `normalizeStationLabel` o mot diem: ma KHONG giu khoang trang. `CH-05`, `CH 05` va `ch05`
 * la cung mot ma tren giay, va bang ke viet tay dung du ba kieu.
 *
 * `null` chu khong chuoi rong: hai chuoi rong con SO BANG nhau, va do la cach hai tram DEU khong
 * co ma bong nhien khop nhau.
 */
export const normalizeStationCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = foldVietnamese(value).replace(/[^0-9A-Z]/g, '');
  return normalized === '' ? null : normalized;
};

const idsOf = (stations: readonly FuelStationIndexEntry[]): string[] =>
  stations.map((station) => station.id).sort();

const resolved = (
  station: FuelStationIndexEntry,
  via: FuelStationMatchVia,
): FuelStationResolution => ({
  outcome: 'RESOLVED',
  stationId: station.id,
  via,
  status: station.status,
});

/**
 * BA DUONG, THEO DUNG THU TU DO TIN CAY: ma -> bi danh -> ten.
 *
 * ===========================================================================
 * PHAM VI THEO NHA CUNG CAP — vi sao `supplierId` doi CACH so khop chu khong chi loc bot
 *
 * Ma cua hang chi duy nhat TRONG mot chuoi: hai chuoi khac nhau deu co the co mot `CH-05`. Nen khi
 * chung tu noi ro nha cung cap, phep so ma chay TRONG pham vi do. Khi khong noi, no chay tren tat
 * ca — va hai tram cung ma se ra `AMBIGUOUS`, dung nhu no phai the.
 *
 * BI DANH thi nguoc lai: khoa `normalized` cua no UNIQUE TOAN CUC, vi mot bi danh tro toi hai tram
 * khong tra loi duoc gi ca. Nen bi danh duoc tim TRUOC roi moi doi chieu nha cung cap — va neu
 * lech thi do la `SUPPLIER_MISMATCH`, mot phat hien that, khong phai mot lan khong khop.
 */
export function resolveFuelStation(input: ResolveFuelStationInput): FuelStationResolution {
  const code = normalizeStationCode(input.code);
  const label = normalizeStationLabel(input.label);
  if (code === null && label === '') return { outcome: 'NO_INPUT' };

  const inScope = (station: FuelStationIndexEntry): boolean =>
    input.supplierId === null || station.supplierId === input.supplierId;

  if (code !== null) {
    const byCode = input.stations.filter((station) => station.codeNormalized === code);
    const scoped = byCode.filter(inScope);
    const only = scoped[0];
    if (scoped.length === 1 && only) return resolved(only, 'CODE');
    if (scoped.length > 1) return { outcome: 'AMBIGUOUS', candidateIds: idsOf(scoped) };
    if (byCode.length > 0) return { outcome: 'SUPPLIER_MISMATCH', candidateIds: idsOf(byCode) };
  }

  if (label !== '') {
    const alias = input.aliases.find((entry) => entry.normalized === label);
    const aliased = alias
      ? (input.stations.find((station) => station.id === alias.stationId) ?? null)
      : null;
    if (aliased !== null) {
      return inScope(aliased)
        ? resolved(aliased, 'ALIAS')
        : { outcome: 'SUPPLIER_MISMATCH', candidateIds: [aliased.id] };
    }

    const byName = input.stations.filter((station) => station.nameNormalized === label);
    const scoped = byName.filter(inScope);
    const only = scoped[0];
    if (scoped.length === 1 && only) return resolved(only, 'NAME');
    if (scoped.length > 1) return { outcome: 'AMBIGUOUS', candidateIds: idsOf(scoped) };
    if (byName.length > 0) return { outcome: 'SUPPLIER_MISMATCH', candidateIds: idsOf(byName) };
  }

  return { outcome: 'NO_MATCH' };
}
