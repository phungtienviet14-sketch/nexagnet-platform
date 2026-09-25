import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { toneColors, type Tone } from './Surface';
import { Text, type TextTone } from './Text';

/**
 * DONG THONG BAO trong khoi — nen nhat cung tong + icon, de khong phu thuoc mau (mu mau). Dung cho
 * cau that (vd "Đã lưu — sẽ gửi khi có sóng"), khong phai cho trang tri.
 */
export function Notice({
  tone,
  icon,
  title,
  detail,
  testID,
}: {
  readonly tone: Tone;
  readonly icon: IconName;
  readonly title: string;
  readonly detail?: string | null;
  readonly testID?: string;
}) {
  const { color } = useTheme();
  const textTone: TextTone = tone === 'signal' ? 'caution' : tone;
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: toneColors(tone, color).soft }]}
    >
      <Icon name={icon} size={20} tone={textTone} />
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    borderRadius: RADIUS.control,
    padding: SPACE.md,
  },
  text: { flex: 1, gap: 2 },
});
