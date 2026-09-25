import type { TextStyle } from 'react-native';

/**
 * CHU: Be Vietnam Pro — ho chu duoc thiet ke CHO tieng Viet (dau thanh chong tang: "Ể", "Ỗ",
 * "Ự" khong dung dong tren). Font he thong mac dinh cua Android tren may re cat dau o co chu lon;
 * voi mot ung dung ma moi nhan deu la tieng Viet co dau, do khong phai chuyen tham my.
 *
 * Cap doi: CUNG mot ho, tach vai bang do dam va SO BANG (`tabular-nums`) cho tien/gio/so lit —
 * cot so thang hang thi mat doc doc duoc ngay khoan nao lon hon.
 */
export const FONT = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
  heavy: 'BeVietnamPro_800ExtraBold',
} as const;

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'overline'
  | 'figure'
  | 'figureLarge';

/**
 * Thang chu CO TUONG PHAN: tieu de viec ke tiep 30 dong canh nhan 12 — khong phai 16/18/20 deu
 * nhau. Line-height rong hon mac dinh vi dau tieng Viet can cho phia tren.
 */
export const TYPE: Record<Variant, TextStyle> = {
  display: { fontFamily: FONT.heavy, fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
  title: { fontFamily: FONT.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.2 },
  heading: { fontFamily: FONT.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: FONT.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: FONT.bold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  figure: {
    fontFamily: FONT.semibold,
    fontSize: 17,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  figureLarge: {
    fontFamily: FONT.heavy,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
};

export type TypeVariant = Variant;
