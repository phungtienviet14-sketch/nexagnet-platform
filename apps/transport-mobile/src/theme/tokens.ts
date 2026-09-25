/**
 * HUONG THIET KE: "DONG HO TREN CABIN" — mot cong cu doc duoc duoi nang gat, bam duoc bang ngon
 * cai khi xe dang rung, va noi that ve trang thai.
 *
 * Ba quyet dinh, moi cai co ly do:
 *
 * 1. NEN GIAY AM + MUC DEN, khong phai trang lanh. Ngoai troi, man trang tinh loa va ton pin tren
 *    OLED; nen ngà (#F4F1EA) giu tuong phan chu > 12:1 ma it choi hon. Ban dem (lai xe ca dem) co
 *    bang toi rieng, khong phai dao mau tu dong.
 * 2. MOT mau tin hieu duy nhat — HO PHACH — danh rieng cho "viec ke tiep". Moi man chi co mot
 *    thu mang mau nay, nen mat tim ra no trong mot lan liec. Mau thuong hieu cua khach (tenant)
 *    thay cho mau DIEU HUONG (xanh duong mong), khong bao gio thay mau tin hieu hay mau trang thai.
 * 3. MAU TRANG THAI CO NGHIA, va "khong bam vi tri" la XAM TRUNG TINH — khong phai do. `#297`:
 *    NOT_TRACKED != LOST, im lang GPS khong phai loi cua lai xe. Mot man hinh to do cho mot chiec
 *    dien thoai khoa man hinh la mot loi buoc toi.
 */

export interface Palette {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkFaint: string;
  readonly line: string;
  readonly lineStrong: string;
  /** Mau DIEU HUONG — thanh tab, lien ket, nut phu. Mau thuong hieu tenant thay o day. */
  readonly brand: string;
  readonly brandInk: string;
  readonly brandSoft: string;
  /** Mau TIN HIEU — chi cho viec ke tiep. Khong bao gio do tenant doi. */
  readonly signal: string;
  readonly signalInk: string;
  readonly signalSoft: string;
  readonly live: string;
  readonly liveSoft: string;
  readonly caution: string;
  readonly cautionSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  /** "Khong bam" / "chua co du lieu" — trung tinh, co y khong canh bao. */
  readonly neutral: string;
  readonly neutralSoft: string;
  readonly pending: string;
  readonly pendingSoft: string;
  readonly scrim: string;
}

export const LIGHT: Palette = {
  canvas: '#F4F1EA',
  surface: '#FFFDF8',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EAE5DA',
  ink: '#16181B',
  inkMuted: '#4D5157',
  inkFaint: '#7B7F85',
  line: '#DCD5C7',
  lineStrong: '#B9B09E',
  brand: '#0E5C63',
  brandInk: '#FFFFFF',
  brandSoft: '#D5E7E6',
  signal: '#F2A516',
  signalInk: '#1B1405',
  signalSoft: '#FCEBC6',
  live: '#1E7F4B',
  liveSoft: '#D8EEDF',
  caution: '#A86509',
  cautionSoft: '#F7E4C4',
  danger: '#B3261E',
  dangerSoft: '#F6D9D6',
  neutral: '#5F6770',
  neutralSoft: '#E4E2DC',
  pending: '#2E5AA7',
  pendingSoft: '#DCE5F5',
  scrim: 'rgba(22,24,27,0.45)',
};

export const DARK: Palette = {
  canvas: '#0F1113',
  surface: '#181B1E',
  surfaceRaised: '#202428',
  surfaceSunken: '#0A0B0D',
  ink: '#F1EEE7',
  inkMuted: '#B7B3AB',
  inkFaint: '#8A8780',
  line: '#2B2F34',
  lineStrong: '#40464D',
  brand: '#5FB8B8',
  brandInk: '#07292B',
  brandSoft: '#16373A',
  signal: '#FFB627',
  signalInk: '#1B1405',
  signalSoft: '#3B2C0B',
  live: '#4CC38A',
  liveSoft: '#123324',
  caution: '#E8A33D',
  cautionSoft: '#3A2A10',
  danger: '#FF7A6E',
  dangerSoft: '#3E1714',
  neutral: '#9AA3AD',
  neutralSoft: '#262A2F',
  pending: '#86A9F0',
  pendingSoft: '#1A2640',
  scrim: 'rgba(0,0,0,0.6)',
};

/** Nhip khoang cach — KHONG deu: 4/8 cho ben trong mot khoi, 20/28 giua cac khoi. */
export const SPACE = {
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  section: 36,
} as const;

/** Bo goc theo VAI TRO, khong mot con so cho moi thu. */
export const RADIUS = {
  chip: 999,
  control: 14,
  card: 20,
  sheet: 28,
  ticket: 18,
} as const;

/**
 * Vung cham toi thieu 56pt (lon hon muc 44/48 cua Apple/Google): lai xe bam khi xe con rung, doi
 * gang tay, mot tay cam phieu. Nut viec ke tiep cao 64.
 */
export const TOUCH = {
  min: 56,
  hero: 64,
} as const;

export const MOTION = {
  fast: 140,
  normal: 240,
  sheet: 320,
} as const;
