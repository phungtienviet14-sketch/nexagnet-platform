import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/tokens';
import { TYPE, type TypeVariant } from '../theme/typography';

export type TextTone =
  | 'ink'
  | 'muted'
  | 'faint'
  | 'brand'
  | 'signal'
  | 'live'
  | 'caution'
  | 'danger'
  | 'neutral'
  | 'pending'
  | 'onBrand'
  | 'onSignal';

const TONE: Record<TextTone, (color: Palette) => string> = {
  ink: (c) => c.ink,
  muted: (c) => c.inkMuted,
  faint: (c) => c.inkFaint,
  brand: (c) => c.brand,
  signal: (c) => c.caution,
  live: (c) => c.live,
  caution: (c) => c.caution,
  danger: (c) => c.danger,
  neutral: (c) => c.neutral,
  pending: (c) => c.pending,
  onBrand: (c) => c.brandInk,
  onSignal: (c) => c.signalInk,
};

export interface TextProps extends RNTextProps {
  readonly variant?: TypeVariant;
  readonly tone?: TextTone;
  readonly align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', tone = 'ink', align, style, ...rest }: TextProps) {
  const { color } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        TYPE[variant],
        { color: TONE[tone](color) },
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
