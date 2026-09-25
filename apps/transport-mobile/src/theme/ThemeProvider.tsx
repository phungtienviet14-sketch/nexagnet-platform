import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DARK, LIGHT, type Palette } from './tokens';

/**
 * Chu de sang/toi theo he thong, cong MOT diem cho thuong hieu khach: `brandColor` (tu cau hinh
 * tenant o may chu) thay mau DIEU HUONG. Mau tin hieu va mau trang thai KHONG doi theo khach —
 * "ho phach = viec ke tiep", "xam = khong bam vi tri" phai nghia nhu nhau o moi doanh nghiep.
 */
export interface Theme {
  readonly scheme: 'light' | 'dark';
  readonly color: Palette;
}

const ThemeContext = createContext<Theme>({ scheme: 'light', color: LIGHT });

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/**
 * Chi nhan mau thuong hieu neu no DOC DUOC tren nen cua chu de (tuong phan >= 3:1 cho thanh phan
 * giao dien lon). Mot mau thuong hieu vang nhat tren nen giay se lam thanh tab vo hinh ngoai nang.
 */
export function acceptBrandColor(
  candidate: string | null | undefined,
  base: Palette,
): string | null {
  if (!candidate || !HEX.test(candidate)) return null;
  const a = luminance(candidate);
  const b = luminance(base.canvas);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return ratio >= 3 ? candidate : null;
}

export function ThemeProvider({
  brandColor,
  children,
}: {
  readonly brandColor?: string | null;
  readonly children: ReactNode;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DARK : LIGHT;
    const brand = acceptBrandColor(brandColor, base);
    return { scheme, color: brand ? { ...base, brand } : base };
  }, [scheme, brandColor]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
