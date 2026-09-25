import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE, TOUCH } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * NUT — nam kieu, moi kieu MOT vai:
 *   signal    viec ke tiep (ho phach). Moi man toi da mot nut kieu nay.
 *   primary   hanh dong chinh khong phai "viec ke tiep" (dang nhap, gui phieu).
 *   secondary hanh dong phu, vien.
 *   ghost     lien ket/hanh dong nhe trong the.
 *   danger    huy/xoa/tu choi — luon kem xac nhan o noi goi.
 *
 * Bam co rung nhe (Haptics) va lun xuong 2% — phan hoi CAM NHAN duoc khi tay dang deo gang hoac
 * xe dang rung, noi mat khong kip nhin man.
 */
export type ButtonKind = 'signal' | 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly kind?: ButtonKind;
  readonly size?: 'hero' | 'regular' | 'compact';
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly style?: ViewStyle;
  readonly testID?: string;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'regular',
  icon,
  loading = false,
  disabled = false,
  hint,
  style,
  testID,
}: ButtonProps) {
  const { color } = useTheme();
  const palette = {
    signal: { bg: color.signal, fg: 'onSignal' as const, border: color.signal },
    primary: { bg: color.brand, fg: 'onBrand' as const, border: color.brand },
    secondary: { bg: 'transparent', fg: 'ink' as const, border: color.lineStrong },
    ghost: { bg: 'transparent', fg: 'brand' as const, border: 'transparent' },
    danger: { bg: color.dangerSoft, fg: 'danger' as const, border: color.dangerSoft },
  }[kind];
  const height = size === 'hero' ? TOUCH.hero : size === 'compact' ? 44 : TOUCH.min;
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : 1,
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        kind === 'signal' && size === 'hero' ? styles.heroShadow : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator
            color={
              kind === 'signal' ? color.signalInk : kind === 'primary' ? color.brandInk : color.ink
            }
          />
        ) : icon ? (
          <Icon name={icon} size={size === 'hero' ? 26 : 20} tone={palette.fg} />
        ) : null}
        <Text
          variant={size === 'hero' ? 'heading' : 'bodyStrong'}
          tone={palette.fg}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.control,
    borderWidth: 1.5,
    paddingHorizontal: SPACE.lg,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  heroShadow: {
    shadowColor: '#7A4E00',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
