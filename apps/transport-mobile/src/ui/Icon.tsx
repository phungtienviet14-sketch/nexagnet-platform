import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import type { TextTone } from './Text';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TONE_TO_KEY = {
  ink: 'ink',
  muted: 'inkMuted',
  faint: 'inkFaint',
  brand: 'brand',
  signal: 'caution',
  live: 'live',
  caution: 'caution',
  danger: 'danger',
  neutral: 'neutral',
  pending: 'pending',
  onBrand: 'brandInk',
  onSignal: 'signalInk',
} as const;

export function Icon({
  name,
  size = 22,
  tone = 'ink',
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly tone?: TextTone;
}) {
  const { color } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color[TONE_TO_KEY[tone]]} />;
}
