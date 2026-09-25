import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/tokens';
import { RADIUS, SPACE } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text, type TextTone } from './Text';

/**
 * THE — mot be mat noi len nen giay. `rail` la vach mau o canh trai noi TRANG THAI cua the (viec
 * ke tiep = ho phach, dang cho gui = xanh, bi chan = do) — doc duoc bang goc mat, khong can doc chu.
 */
export type Tone = 'signal' | 'live' | 'caution' | 'danger' | 'neutral' | 'pending' | 'brand';

const TONE_COLOR: Record<Tone, (c: Palette) => { strong: string; soft: string }> = {
  signal: (c) => ({ strong: c.signal, soft: c.signalSoft }),
  live: (c) => ({ strong: c.live, soft: c.liveSoft }),
  caution: (c) => ({ strong: c.caution, soft: c.cautionSoft }),
  danger: (c) => ({ strong: c.danger, soft: c.dangerSoft }),
  neutral: (c) => ({ strong: c.neutral, soft: c.neutralSoft }),
  pending: (c) => ({ strong: c.pending, soft: c.pendingSoft }),
  brand: (c) => ({ strong: c.brand, soft: c.brandSoft }),
};

export function toneColors(tone: Tone, color: Palette): { strong: string; soft: string } {
  return TONE_COLOR[tone](color);
}

export function Card({
  children,
  rail,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: {
  readonly children: ReactNode;
  readonly rail?: Tone;
  readonly onPress?: () => void;
  readonly style?: ViewStyle;
  readonly testID?: string;
  readonly accessibilityLabel?: string;
}) {
  const { color, scheme } = useTheme();
  const body = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: color.surface,
          borderColor: color.line,
          shadowOpacity: scheme === 'dark' ? 0 : 0.07,
        },
        style,
      ]}
    >
      {rail ? (
        <View style={[styles.rail, { backgroundColor: TONE_COLOR[rail](color).strong }]} />
      ) : null}
      <View style={rail ? styles.railPad : null}>{children}</View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      {body}
    </Pressable>
  );
}

/** Nhan trang thai — mau NEN nhat + chu dam cung tong, kem icon de khong phu thuoc mau (mu mau). */
export function Pill({
  label,
  tone,
  icon,
}: {
  readonly label: string;
  readonly tone: Tone;
  readonly icon?: IconName;
}) {
  const { color } = useTheme();
  const { soft } = TONE_COLOR[tone](color);
  const textTone: TextTone = tone === 'signal' ? 'caution' : tone === 'brand' ? 'brand' : tone;
  return (
    <View style={[styles.pill, { backgroundColor: soft }]}>
      {icon ? <Icon name={icon} size={14} tone={textTone} /> : null}
      <Text variant="label" tone={textTone} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Khoi co tieu de nho (overline) — nhip giua cac khoi rong hon trong khoi. */
export function Section({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="overline" tone="muted">
          {title}
        </Text>
        {action}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function Divider() {
  const { color } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: color.line }} />;
}

/** Hang cap nhan/gia tri — so can phai, so bang (tabular) de cot thang hang. */
export function KeyValue({
  label,
  value,
  tone = 'ink',
  strong = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: TextTone;
  readonly strong?: boolean;
}) {
  return (
    <View style={styles.kv}>
      <Text variant="label" tone="muted" style={styles.kvLabel}>
        {label}
      </Text>
      <Text variant={strong ? 'figure' : 'body'} tone={tone} style={styles.kvValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACE.lg,
    overflow: 'hidden',
    shadowColor: '#3B2F16',
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  railPad: { paddingLeft: SPACE.xs },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.chip,
  },
  section: { gap: SPACE.md, marginTop: SPACE.xxl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionBody: { gap: SPACE.md },
  kv: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.md, paddingVertical: SPACE.xs },
  kvLabel: { flex: 1 },
  kvValue: { textAlign: 'right', flexShrink: 0 },
});
